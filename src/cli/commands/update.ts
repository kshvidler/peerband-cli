import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { flag } from '../args.js';
import { execProgram } from '../exec.js';
import { Output, symbols } from '../output.js';
import { askYesNo, PromptAborted } from '../prompt.js';
import { CliError, type CommandSpec, type Ctx } from '../types.js';
import { checkHerdrPlugin, type PluginCheck } from './herdr-check.js';
import { installPlugin } from './herdr.js';

export const DEFAULT_REGISTRY = 'https://registry.npmjs.org';
const PACKAGE = 'peerband';
const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/** Semver comparison of release versions (a prerelease sorts before its release). */
export function compareVersions(a: string, b: string): number {
  const left = VERSION_PATTERN.exec(a);
  const right = VERSION_PATTERN.exec(b);
  if (!left || !right) return a === b ? 0 : a < b ? -1 : 1;
  for (let i = 1; i <= 3; i++) {
    const diff = Number(left[i]) - Number(right[i]);
    if (diff !== 0) return Math.sign(diff);
  }
  const [preA, preB] = [left[4], right[4]];
  if (preA === preB) return 0;
  if (!preA) return 1;
  if (!preB) return -1;
  return preA < preB ? -1 : 1;
}

const OFFLINE_HINT = 'Check your internet connection and try again. To update by hand: `npm install -g peerband@latest`, then `peerband update`.';

/** Latest published version from the npm registry (PEERBAND_NPM_REGISTRY overrides the registry for tests and mirrors). */
export async function fetchLatestVersion(ctx: Ctx, timeoutMs = 10_000): Promise<string> {
  const base = (ctx.env.PEERBAND_NPM_REGISTRY || DEFAULT_REGISTRY).replace(/\/+$/, '');
  const url = `${base}/${PACKAGE}/latest`;
  let response: Response;
  try {
    response = await ctx.fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const reason = (error as Error)?.name === 'TimeoutError' ? `no answer within ${timeoutMs / 1000}s` : (error as Error)?.message || String(error);
    throw new CliError(`Could not reach the npm registry to check for updates (${reason}).`, OFFLINE_HINT);
  }
  if (!response.ok) throw new CliError(`The npm registry answered HTTP ${response.status} for ${url}.`, OFFLINE_HINT);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new CliError(`The npm registry returned an unreadable answer for ${url}.`, OFFLINE_HINT);
  }
  const version = body && typeof body === 'object' ? (body as { version?: unknown }).version : undefined;
  if (typeof version !== 'string' || !VERSION_PATTERN.test(version)) throw new CliError(`The npm registry did not report a valid version for ${PACKAGE}.`, OFFLINE_HINT);
  return version;
}

export type InstallKind = 'npm-global' | 'npx' | 'source' | 'unknown';
export interface InstallInfo {
  kind: InstallKind;
  self: string;
  /** `npm root -g`, when npm answered. */
  npmRoot?: string;
  detail?: string;
}

function real(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function isInside(child: string, parent: string): boolean {
  const fold = (path: string) => (process.platform === 'win32' ? path.toLowerCase() : path);
  const rel = relative(fold(parent), fold(child));
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

function checkoutRoot(self: string): string | undefined {
  let dir = dirname(self);
  for (let i = 0; i < 4; i++) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name?: unknown };
      if (pkg.name === PACKAGE && existsSync(join(dir, '.git'))) return dir;
    } catch {
      /* keep looking */
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/** How the running CLI was installed: only a global npm install can be updated with `npm install -g`. */
export async function detectInstall(ctx: Ctx): Promise<InstallInfo> {
  const self = real(ctx.selfPath ?? ctx.env.PEERBAND_SELF_PATH ?? process.argv[1] ?? '');
  if (/[\\/]_npx[\\/]/.test(self)) return { kind: 'npx', self };
  const npm = await (ctx.exec ?? execProgram)('npm', ['root', '-g'], { timeoutMs: 60_000, env: ctx.env });
  const npmRoot = npm.code === 0 ? npm.stdout.trim().split(/\r?\n/).pop()?.trim() : undefined;
  if (npmRoot && isInside(self, real(join(npmRoot, PACKAGE)))) return { kind: 'npm-global', self, npmRoot };
  const checkout = checkoutRoot(self);
  if (checkout) return { kind: 'source', self, npmRoot, detail: checkout };
  return { kind: 'unknown', self, npmRoot, detail: npm.notFound ? 'npm was not found on PATH' : npmRoot ? `it is not under npm's global folder ${npmRoot}` : 'npm did not report its global folder' };
}

export function manualUpdate(info: InstallInfo, latest: string): { message: string; hint: string } {
  const global = `npm install -g peerband@${latest}`;
  switch (info.kind) {
    case 'npx':
      return { message: 'This peerband was started through npx, so there is no installed copy to update.', hint: `Install it once with \`${global}\`, then run \`peerband update\` to update the Herdr plugin too.` };
    case 'source':
      return {
        message: `This peerband runs from a source checkout (${info.detail}).`,
        hint: 'Update the checkout (`git pull`, `npm ci`, `npm run build`), then run `peerband herdr install`. To use the release instead: `' + global + '`, then `peerband update`.',
      };
    default:
      return { message: `Could not tell how this peerband was installed (${info.detail ?? info.self}).`, hint: `Run \`${global}\`, then \`peerband update\` to update the Herdr plugin.` };
  }
}

interface UpdateReport {
  current: string;
  latest: string;
  updateAvailable: boolean;
  action: 'none' | 'repaired-plugin' | 'updated' | 'manual' | 'cancelled';
  install?: InstallKind;
  manual?: { message: string; hint: string };
  plugin: { herdrFound: boolean; installed: boolean; source: string | null; problems: string[] };
}

/** Same context, but everything printed goes to stderr (keeps --json output clean). */
function toStderr(ctx: Ctx): Ctx {
  return { ...ctx, stdout: ctx.stderr, out: new Output(ctx.stderr, ctx.stderr, ctx.env) };
}

function pluginSummary(check: PluginCheck): UpdateReport['plugin'] {
  return { herdrFound: check.found, installed: check.installed, source: check.source, problems: check.problems.map((problem) => problem.message) };
}

export const spec: CommandSpec = {
  name: 'update',
  summary: 'Update the CLI and the Herdr plugin to the latest release',
  usage: 'peerband update [--check] [--yes] [--json]',
  description:
    'Checks npm for the latest PeerBand release and, if it is newer, installs it with `npm install -g` and then lets the new CLI update the Herdr plugin: it stops the PeerBand Relay and closes its tab, replaces the plugin (the previous one is put back if that fails), clears stale relay locks, and reopens the Relay tab if it was open.\n' +
    'When the CLI is already up to date it still checks that the Herdr plugin matches it and repairs it if not (for example after a plain `npm install -g peerband`).',
  options: [
    { name: 'check', type: 'boolean', description: 'Only report whether an update is available; change nothing.' },
    { name: 'yes', short: 'y', type: 'boolean', description: 'Do not ask for confirmation.' },
    { name: 'json', type: 'boolean', description: 'Print a machine-readable JSON summary (progress goes to stderr).' },
  ],
  examples: [
    ['peerband update', 'Update everything'],
    ['peerband update --check', 'See whether an update is available'],
    ['peerband update --yes --json', 'Non-interactive, for scripts'],
  ],
  notes: [
    'Only a global npm install can update itself. From npx or a source checkout, update prints the command to run instead.',
    'Environment: PEERBAND_NPM_REGISTRY (registry to check, default https://registry.npmjs.org).',
  ],
  async run(parsed, ctx) {
    const json = flag(parsed, 'json');
    const io = json ? toStderr(ctx) : ctx;
    const s = io.out.stdout;
    const log = (line: string) => io.out.print(line);

    const latest = await fetchLatestVersion(ctx);
    const newer = compareVersions(latest, ctx.version) > 0;
    const plugin = await checkHerdrPlugin(ctx);
    const report: UpdateReport = { current: ctx.version, latest, updateAvailable: newer, action: 'none', plugin: pluginSummary(plugin) };
    const pluginNeedsRepair = plugin.found && plugin.installed && plugin.problems.length > 0;
    const finish = (code = 0) => {
      if (json) ctx.out.print(JSON.stringify(report, null, 2));
      return code;
    };

    if (flag(parsed, 'check')) {
      if (newer) log(`${s.yellow(symbols.warn)} PeerBand ${latest} is available (you have ${ctx.version}). Run ${s.bold('peerband update')}.`);
      else log(`${s.green(symbols.ok)} PeerBand ${ctx.version} is up to date ${s.dim(`(latest on npm: ${latest})`)}.`);
      if (pluginNeedsRepair) log(`${s.yellow(symbols.warn)} The Herdr plugin needs repair: ${plugin.problems[0]!.message} ${s.dim('(run `peerband update`)')}`);
      return finish();
    }

    if (!newer) {
      log(`${s.green(symbols.ok)} PeerBand ${ctx.version} is up to date ${s.dim(`(latest on npm: ${latest})`)}.`);
      if (pluginNeedsRepair) {
        log(`${s.yellow(symbols.warn)} The Herdr plugin does not match this CLI: ${plugin.problems[0]!.message} Repairing it.`);
        await installPlugin(io);
        report.action = 'repaired-plugin';
        report.plugin = pluginSummary(await checkHerdrPlugin(ctx));
      } else if (plugin.found && !plugin.installed && !plugin.detail) {
        log(`${s.dim('The PeerBand plugin is not installed in Herdr. Add it with:')} peerband herdr install`);
      } else if (plugin.installed) {
        log(`${s.green(symbols.ok)} The Herdr plugin matches ${s.dim(`(${plugin.source ?? 'installed'})`)}.`);
      }
      return finish();
    }

    const install = await detectInstall(ctx);
    report.install = install.kind;
    if (install.kind !== 'npm-global' || !install.npmRoot) {
      const manual = manualUpdate(install, latest);
      report.action = 'manual';
      report.manual = manual;
      if (json) {
        io.out.fail(manual.message, manual.hint);
        return finish(1);
      }
      throw new CliError(`PeerBand ${latest} is available (you have ${ctx.version}). ${manual.message}`, manual.hint);
    }

    if (!flag(parsed, 'yes') && !json && ctx.stdin.isTTY && ctx.stderr.isTTY) {
      let proceed: boolean;
      try {
        proceed = await askYesNo(ctx.stdin, ctx.stderr, `Update PeerBand ${ctx.version} → ${latest}? [Y/n] `);
      } catch (error) {
        if (!(error instanceof PromptAborted)) throw error;
        proceed = false;
      }
      if (!proceed) {
        report.action = 'cancelled';
        log(s.dim('Not updated.'));
        return finish();
      }
    }

    const exec = ctx.exec ?? execProgram;
    const spec = `peerband@${latest}`;
    log(`Installing ${spec} with npm…`);
    const forward = (text: string) => ctx.stderr.write(text);
    const npm = await exec('npm', ['install', '-g', spec], { timeoutMs: 600_000, env: ctx.env, onStdout: forward, onStderr: forward });
    if (npm.code !== 0) {
      const permission = /EACCES|EPERM|permission denied/i.test(`${npm.stderr}${npm.stdout}`);
      throw new CliError(
        npm.notFound ? 'npm was not found on PATH.' : `npm install -g ${spec} failed (exit code ${npm.code}).`,
        permission
          ? `npm could not write to its global folder. Fix its permissions (https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally) or run \`npm install -g ${spec}\` as an administrator, then \`peerband update\`.`
          : `Check the npm output above, run \`npm install -g ${spec}\` yourself, then \`peerband update\`.`,
      );
    }
    const entry = join(install.npmRoot, PACKAGE, 'dist', 'peerband.mjs');
    if (!existsSync(entry)) throw new CliError(`npm finished, but the new CLI is not at ${entry}.`, `Run \`npm install -g ${spec}\` yourself, then \`peerband update\`.`);
    log(`${s.green(symbols.ok)} Installed peerband ${latest}.`);
    report.action = 'updated';

    if (!plugin.found) {
      log(s.dim('Herdr was not found, so there is no plugin to update.'));
      return finish();
    }
    if (!plugin.installed) {
      log(`${s.dim('Next:')} peerband herdr install  ${s.dim('(adds the PeerBand plugin to Herdr)')}`);
      return finish();
    }

    // Hand off to the new CLI so the plugin step runs the new code (and installs the plugin matching it).
    log('Updating the Herdr plugin with the new CLI…');
    const env = { ...ctx.env, ...(io.out.stdout.enabled && ctx.env.FORCE_COLOR === undefined ? { FORCE_COLOR: '1' } : {}) };
    const handoff = await exec(process.execPath, [entry, 'herdr', 'install', '--after-update'], {
      timeoutMs: 15 * 60_000,
      env,
      onStdout: (text) => io.stdout.write(text),
      onStderr: (text) => ctx.stderr.write(text),
    });
    if (handoff.code !== 0) {
      throw new CliError(`peerband ${latest} is installed, but updating the Herdr plugin failed (exit code ${handoff.code}).`, 'Fix the problem shown above, then run `peerband herdr install`.');
    }
    report.plugin = pluginSummary(await checkHerdrPlugin({ ...ctx, version: latest }));
    return finish();
  },
};
