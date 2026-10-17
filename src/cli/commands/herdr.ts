import { mkdir, rm, writeFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadCredentials } from '../../core/index.js';
import { stopRelay } from '../control.js';
import { NOT_FOUND_HINT, NOT_FOUND_MESSAGE, failureDetail } from '../herdr-bin.js';
import { symbols } from '../output.js';
import { CliError, type CommandSpec, type Ctx, type HerdrResult } from '../types.js';
import { credentialsFile } from './shared.js';
import { pluginInstalled } from './status.js';

export const DEFAULT_SOURCE = 'kshvidler/peerband-cli';
const PLUGIN_ID = 'peerband';

export interface PluginSettings {
  nodePath: string;
  configHome?: string;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

async function herdr(ctx: Ctx, args: string[], timeoutMs?: number): Promise<HerdrResult> {
  const result = await ctx.runHerdr(args, { timeoutMs });
  if (result.notFound) throw new CliError(NOT_FOUND_MESSAGE, NOT_FOUND_HINT);
  return result;
}

function must(result: HerdrResult, what: string, hint: string): HerdrResult {
  if (result.code !== 0) throw new CliError(`${what} failed: ${failureDetail(result)}`, hint);
  return result;
}

/** Removes the plugin whether it was installed or linked. Returns false if neither worked. */
async function removePlugin(ctx: Ctx): Promise<{ removed: boolean; detail: string }> {
  const uninstall = await herdr(ctx, ['plugin', 'uninstall', PLUGIN_ID]);
  if (uninstall.code === 0) return { removed: true, detail: '' };
  const unlink = await herdr(ctx, ['plugin', 'unlink', PLUGIN_ID]);
  if (unlink.code === 0) return { removed: true, detail: '' };
  return { removed: false, detail: failureDetail(uninstall) };
}

export function pluginSettings(env: NodeJS.ProcessEnv): PluginSettings {
  return {
    nodePath: process.execPath,
    ...(env.PEERBAND_CONFIG_HOME ? { configHome: env.PEERBAND_CONFIG_HOME } : {}),
  };
}

export const installSpec: CommandSpec = {
  name: 'herdr install',
  summary: 'Install the PeerBand plugin into Herdr',
  usage: 'peerband herdr install',
  description:
    'Installs (or updates) the PeerBand plugin in Herdr and records which Node.js to run it with, so the plugin works even if Herdr finds a different `node` on its PATH. Run it from a shell with Node.js 22.13 or newer.',
  options: [],
  examples: [
    ['peerband herdr install', 'Install the release matching this CLI version'],
    ['PEERBAND_HERDR_REF=main peerband herdr install', 'Install another branch, tag or commit'],
    ['PEERBAND_HERDR_SOURCE=./peerband-cli peerband herdr install', 'Link a local checkout (build it first with npm run build)'],
  ],
  notes: [
    `Environment: PEERBAND_HERDR_SOURCE (default ${DEFAULT_SOURCE}; an existing directory is linked instead of installed), PEERBAND_HERDR_REF (default v<version>), HERDR_BIN_PATH (used to find Herdr).`,
  ],
  async run(_parsed, ctx) {
    const s = ctx.out.stdout;
    const source = ctx.env.PEERBAND_HERDR_SOURCE || DEFAULT_SOURCE;
    const ref = ctx.env.PEERBAND_HERDR_REF || `v${ctx.version}`;
    const local = isDirectory(source);

    const before = await pluginInstalled(ctx);
    if (!before.found) throw new CliError(NOT_FOUND_MESSAGE, NOT_FOUND_HINT);
    if (before.detail) throw new CliError(`Herdr could not list plugins: ${before.detail}`, 'Check that your Herdr is 0.9.3 or newer (`herdr --version`).');
    if (before.installed) {
      const removed = await removePlugin(ctx);
      if (!removed.removed) throw new CliError(`Could not replace the existing PeerBand plugin: ${removed.detail}`, `Run \`herdr plugin uninstall ${PLUGIN_ID}\` yourself, then retry.`);
      ctx.out.print(s.dim(`Replacing the existing PeerBand plugin.`));
    }

    if (local) {
      const dir = resolve(source);
      must(await herdr(ctx, ['plugin', 'link', dir]), 'herdr plugin link', 'Check that the directory is a peerband-cli checkout containing herdr-plugin.toml.');
      ctx.out.print(`${s.green(symbols.ok)} Linked the PeerBand plugin from ${dir}`);
    } else {
      must(
        await herdr(ctx, ['plugin', 'install', source, '--ref', ref, '--yes'], 180_000),
        'herdr plugin install',
        `Check that ${source} at ref ${ref} exists and that you are online. Override with PEERBAND_HERDR_SOURCE or PEERBAND_HERDR_REF.`,
      );
      ctx.out.print(`${s.green(symbols.ok)} Installed the PeerBand plugin (${source} @ ${ref})`);
    }

    const dirResult = must(await herdr(ctx, ['plugin', 'config-dir', PLUGIN_ID]), 'herdr plugin config-dir', 'The plugin may not have registered; run `herdr plugin list`.');
    const configDir = dirResult.stdout.trim();
    if (!configDir) throw new CliError('Herdr did not report a plugin config directory.', 'Run `herdr plugin config-dir peerband` to investigate.');
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, 'settings.json'), `${JSON.stringify(pluginSettings(ctx.env), null, 2)}\n`, { mode: 0o600 });
    ctx.out.print(`${s.green(symbols.ok)} Saved plugin settings ${s.dim(`(node ${process.execPath})`)}`);

    const after = await pluginInstalled(ctx);
    if (!after.installed) throw new CliError('Herdr does not list the PeerBand plugin after installing it.', 'Run `herdr plugin list` and check the output above for errors.');
    const loggedIn = await loadCredentials(credentialsFile(ctx)).then(() => true, () => false);
    ctx.out.print(`${s.dim('Next:')} ${loggedIn ? 'peerband relay' : 'peerband login, then peerband relay'}`);
    return 0;
  },
};

export const uninstallSpec: CommandSpec = {
  name: 'herdr uninstall',
  summary: 'Remove the PeerBand plugin from Herdr',
  usage: 'peerband herdr uninstall',
  description: 'Stops the PeerBand Relay if it is running, then removes the plugin (uninstalls it, or unlinks a local checkout) and the plugin settings file written by install. Your login is kept.',
  options: [],
  examples: [['peerband herdr uninstall', 'Remove the plugin']],
  async run(_parsed, ctx) {
    const s = ctx.out.stdout;
    const state = await pluginInstalled(ctx);
    if (!state.found) throw new CliError(NOT_FOUND_MESSAGE, NOT_FOUND_HINT);
    if (!state.installed) {
      ctx.out.print('The PeerBand plugin is not installed in Herdr; nothing to do.');
      return 0;
    }
    if (await stopRelay(ctx.env)) ctx.out.print(`${s.green(symbols.ok)} Stopped the running PeerBand Relay.`);
    // Query the config dir first: Herdr may no longer know the plugin once it is removed.
    const dirResult = await herdr(ctx, ['plugin', 'config-dir', PLUGIN_ID]);
    const configDir = dirResult.code === 0 ? dirResult.stdout.trim() : '';
    const removed = await removePlugin(ctx);
    if (!removed.removed) throw new CliError(`Could not remove the PeerBand plugin: ${removed.detail}`, 'Run `herdr plugin list` to see its state.');
    if (configDir) await rm(join(configDir, 'settings.json'), { force: true }).catch(() => undefined);
    ctx.out.print(`${s.green(symbols.ok)} Removed the PeerBand plugin from Herdr.`);
    return 0;
  },
};

/** `peerband herdr` with no subcommand: help for the group. */
export const groupSpec = {
  name: 'herdr',
  summary: 'Install or remove the PeerBand Herdr plugin',
  usage: 'peerband herdr <install|uninstall>',
  description: 'Manage the PeerBand plugin inside Herdr.',
  subcommands: [installSpec, uninstallSpec],
};
