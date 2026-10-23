import { mkdir, rm, writeFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadCredentials } from '../../core/index.js';
import { flag } from '../args.js';
import { NOT_FOUND_HINT, NOT_FOUND_MESSAGE, failureDetail } from '../herdr-bin.js';
import { openRelayTab } from '../herdr-js.js';
import { symbols } from '../output.js';
import { PLUGIN_ID, ReplaceError, describeTarget, removePlugin, replacePlugin, type PluginTarget } from '../plugin-replace.js';
import { cleanRelayState, closeRelayPanes, findRelayPanes, relayRunning, stopRelayAndWait, type CleanupReport } from '../relay-maint.js';
import { CliError, type CommandSpec, type Ctx, type HerdrResult } from '../types.js';
import { credentialsFile } from './shared.js';
import { pluginInstalled } from './herdr-check.js';

export const DEFAULT_SOURCE = 'kshvidler/peerband-cli';

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

export function pluginSettings(env: NodeJS.ProcessEnv): PluginSettings {
  return {
    nodePath: process.execPath,
    ...(env.PEERBAND_CONFIG_HOME ? { configHome: env.PEERBAND_CONFIG_HOME } : {}),
  };
}

function reportCleanup(ctx: Ctx, report: CleanupReport): void {
  const s = ctx.out.stdout;
  if (report.reclaimed.length) ctx.out.print(`${s.green(symbols.ok)} Cleared ${report.reclaimed.length === 1 ? 'a stale relay lock' : `${report.reclaimed.length} stale relay locks`} left by a process that is no longer running.`);
  for (const held of report.held) ctx.out.warn(`${ctx.out.stderr.yellow(symbols.warn)} ${held.lock} is still held: ${held.reason}.`);
}

/** Stops the relay and closes its panes so nothing holds the plugin's files. Returns what was running. */
async function releasePlugin(ctx: Ctx): Promise<{ wasRunning: boolean; hadPanes: boolean }> {
  const s = ctx.out.stdout;
  const wasRunning = await relayRunning(ctx);
  const panes = await findRelayPanes(ctx);
  if (await stopRelayAndWait(ctx)) ctx.out.print(`${s.green(symbols.ok)} Stopped the PeerBand Relay.`);
  if (panes.length) {
    const closed = await closeRelayPanes(ctx, panes);
    ctx.out.print(`${s.green(symbols.ok)} Closed ${closed === 1 ? 'the PeerBand Relay tab' : `${closed} PeerBand Relay tabs`}.`);
  }
  return { wasRunning, hadPanes: panes.length > 0 };
}

async function waitForRelay(ctx: Ctx, timeoutMs: number): Promise<boolean> {
  const sleep = ctx.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let waited = 0; waited < timeoutMs; waited += 1000) {
    if (await relayRunning(ctx)) return true;
    await sleep(1000);
  }
  return relayRunning(ctx);
}

/**
 * Reopens the Relay tab (which starts the relay) and checks that the relay really came up. The first start from a
 * freshly installed plugin can be slow (on Windows, new files are scanned), so one failed start is retried.
 */
async function reopenRelay(ctx: Ctx): Promise<boolean> {
  const s = ctx.out.stdout;
  const open = ctx.openRelayTab ?? openRelayTab;
  const attempt = async () => {
    try {
      await open();
      return true;
    } catch (error) {
      ctx.out.warn(`${ctx.out.stderr.yellow(symbols.warn)} Could not reopen the PeerBand Relay tab: ${(error as Error).message}`);
      return false;
    }
  };
  if (!(await attempt())) {
    ctx.out.print(`${s.dim('Next:')} peerband relay`);
    return false;
  }
  // An injected opener (tests) has no real relay behind it to watch.
  if (ctx.openRelayTab || (await waitForRelay(ctx, 30_000))) {
    ctx.out.print(`${s.green(symbols.ok)} Reopened the PeerBand Relay tab.`);
    return true;
  }
  ctx.out.print(s.dim('The relay did not start yet; reopening the Relay tab once more.'));
  await stopRelayAndWait(ctx);
  await closeRelayPanes(ctx, await findRelayPanes(ctx));
  if ((await attempt()) && (await waitForRelay(ctx, 45_000))) {
    ctx.out.print(`${s.green(symbols.ok)} Reopened the PeerBand Relay tab.`);
    return true;
  }
  ctx.out.warn(`${ctx.out.stderr.yellow(symbols.warn)} The PeerBand Relay tab is open, but the relay has not started. Check the tab, or run \`peerband status\`.`);
  return false;
}

/** `peerband herdr install`: safely replace the plugin, then restore the relay if it was in use. */
export async function installPlugin(ctx: Ctx, options: { afterUpdate?: boolean } = {}): Promise<number> {
  const s = ctx.out.stdout;
  const source = ctx.env.PEERBAND_HERDR_SOURCE || DEFAULT_SOURCE;
  const ref = ctx.env.PEERBAND_HERDR_REF || `v${ctx.version}`;
  const target: PluginTarget = isDirectory(source) ? { kind: 'local', dir: resolve(source) } : { kind: 'github', source, ref };

  const before = await pluginInstalled(ctx);
  if (!before.found) throw new CliError(NOT_FOUND_MESSAGE, NOT_FOUND_HINT);
  if (before.detail) throw new CliError(`Herdr could not list plugins: ${before.detail}`, 'Check that your Herdr is 0.9.3 or newer (`herdr --version`).');
  const loggedIn = await loadCredentials(credentialsFile(ctx)).then(() => true, () => false);

  // Running Relay panes, the helper and the connector keep the old plugin's files open (on Windows that makes
  // Herdr fail with os error 32), so stop them before touching the plugin.
  const held = await releasePlugin(ctx);
  reportCleanup(ctx, await cleanRelayState(ctx));
  const restore = loggedIn && (held.wasRunning || held.hadPanes);

  if (before.installed) ctx.out.print(s.dim(`Replacing the PeerBand plugin${before.source ? ` (${before.source})` : ''} with ${describeTarget(target)}.`));
  try {
    await replacePlugin(ctx, before.source, before.installed, target);
  } catch (error) {
    if (error instanceof ReplaceError && error.restored && restore) await reopenRelay(ctx);
    throw error;
  }
  ctx.out.print(`${s.green(symbols.ok)} ${target.kind === 'local' ? `Linked the PeerBand plugin from ${target.dir}` : `Installed the PeerBand plugin (${target.source} @ ${target.ref})`}`);

  const dirResult = must(await herdr(ctx, ['plugin', 'config-dir', PLUGIN_ID]), 'herdr plugin config-dir', 'The plugin may not have registered; run `herdr plugin list`.');
  const configDir = dirResult.stdout.trim();
  if (!configDir) throw new CliError('Herdr did not report a plugin config directory.', 'Run `herdr plugin config-dir peerband` to investigate.');
  await mkdir(configDir, { recursive: true });
  await writeFile(join(configDir, 'settings.json'), `${JSON.stringify(pluginSettings(ctx.env), null, 2)}\n`, { mode: 0o600 });
  ctx.out.print(`${s.green(symbols.ok)} Saved plugin settings ${s.dim(`(node ${process.execPath})`)}`);

  const after = await pluginInstalled(ctx);
  if (!after.installed) throw new CliError('Herdr does not list the PeerBand plugin after installing it.', 'Run `herdr plugin list` and check the output above for errors.');
  if (restore) {
    await reopenRelay(ctx);
  } else {
    ctx.out.print(`${s.dim('Next:')} ${loggedIn ? 'peerband relay' : 'peerband login, then peerband relay'}`);
  }
  if (options.afterUpdate) ctx.out.print(`${s.green(symbols.ok)} PeerBand ${ctx.version} is ready.`);
  return 0;
}

export const installSpec: CommandSpec = {
  name: 'herdr install',
  summary: 'Install the PeerBand plugin into Herdr',
  usage: 'peerband herdr install',
  description:
    'Installs (or updates) the PeerBand plugin in Herdr and records which Node.js to run it with, so the plugin works even if Herdr finds a different `node` on its PATH. Run it from a shell with Node.js 22.13 or newer.\n' +
    'Before replacing a plugin it stops the PeerBand Relay and closes its tabs (they keep the plugin files open), clears stale relay locks, and afterwards reopens the Relay tab if it was open. If the new plugin cannot be installed, the previous one is put back.',
  options: [{ name: 'after-update', type: 'boolean', description: 'Internal: final step of `peerband update`.', hidden: true }],
  examples: [
    ['peerband herdr install', 'Install the release matching this CLI version'],
    ['PEERBAND_HERDR_REF=main peerband herdr install', 'Install another branch, tag or commit'],
    ['PEERBAND_HERDR_SOURCE=./peerband-cli peerband herdr install', 'Link a local checkout (build it first with npm run build)'],
  ],
  notes: [
    `Environment: PEERBAND_HERDR_SOURCE (default ${DEFAULT_SOURCE}; an existing directory is linked instead of installed), PEERBAND_HERDR_REF (default v<version>), HERDR_BIN_PATH (used to find Herdr).`,
    'To update the CLI and the plugin together, use `peerband update`.',
  ],
  run: (parsed, ctx) => installPlugin(ctx, { afterUpdate: flag(parsed, 'after-update') }),
};

export const uninstallSpec: CommandSpec = {
  name: 'herdr uninstall',
  summary: 'Remove the PeerBand plugin from Herdr',
  usage: 'peerband herdr uninstall',
  description:
    'Stops the PeerBand Relay, closes its tabs, removes the plugin (uninstalls it, or unlinks a local checkout) and the plugin settings file written by install, and deletes the relay\'s local state (relay-state.json, relay-tab.json and locks left by processes that are no longer running). Your login is kept. Safe to run more than once.',
  options: [],
  examples: [['peerband herdr uninstall', 'Remove the plugin']],
  async run(_parsed, ctx) {
    const s = ctx.out.stdout;
    const state = await pluginInstalled(ctx);
    await releasePlugin(ctx);
    if (!state.found) {
      reportCleanup(ctx, await cleanRelayState(ctx, { remove: true }));
      throw new CliError(NOT_FOUND_MESSAGE, NOT_FOUND_HINT);
    }
    if (state.installed) {
      // Query the config dir first: Herdr may no longer know the plugin once it is removed.
      const dirResult = await herdr(ctx, ['plugin', 'config-dir', PLUGIN_ID]);
      const configDir = dirResult.code === 0 ? dirResult.stdout.trim() : '';
      const removed = await removePlugin(ctx);
      if (!removed.removed) throw new CliError(`Could not remove the PeerBand plugin: ${removed.detail}`, 'Close every PeerBand Relay tab, then run `herdr plugin list` to see its state.');
      if (configDir) await rm(join(configDir, 'settings.json'), { force: true }).catch(() => undefined);
      ctx.out.print(`${s.green(symbols.ok)} Removed the PeerBand plugin from Herdr.`);
    } else {
      ctx.out.print('The PeerBand plugin is not installed in Herdr; nothing to remove.');
    }
    const report = await cleanRelayState(ctx, { remove: true });
    reportCleanup(ctx, report);
    if (report.removedState && state.installed) ctx.out.print(s.dim('Deleted the local relay state. Your login is kept (`peerband logout` removes it).'));
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
