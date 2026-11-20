import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { configHome } from '../core/index.js';
import { resolveCoreBinary } from '../runtime-herdr-core/index.js';
import { relaySnapshot, stopRelay } from './control.js';
import { execProgram } from './exec.js';
import { ownerRecordPath } from './herdr-js.js';
import { sanitize } from './output.js';
import { CliError, type Ctx } from './types.js';

/**
 * herdr-core has no plugin system, so its relay runs as the same detached supervisor the Herdr plugin uses
 * (herdr/lifecycle.mjs), outside any terminal: closing the Herdr desktop app or a terminal leaves it running,
 * and `peerband status`, `peerband notify` and `peerband relay --stop` reach it over the usual control channel.
 */
export type BackgroundRuntime = 'herdr-core';

/** The runtime a relay's owner record names (`herdr` when the record predates the field or is unreadable). */
export async function recordedRelayRuntime(env: NodeJS.ProcessEnv): Promise<string> {
  try {
    const record = JSON.parse(await readFile(ownerRecordPath(configHome({ env })), 'utf8')) as { runtime?: unknown };
    return typeof record.runtime === 'string' ? record.runtime : 'herdr';
  } catch {
    return 'herdr';
  }
}

/** The runtime the running relay serves, or undefined when none answers on the control channel. */
export async function runningRelayRuntime(env: NodeJS.ProcessEnv): Promise<string | undefined> {
  const snapshot = await relaySnapshot(env);
  if (snapshot?.source !== 'control' || snapshot.state !== 'running') return undefined;
  return recordedRelayRuntime(env);
}

/** The plugin scripts ship next to the bundled CLI (dist/peerband.mjs and herdr/lifecycle.mjs in one package). */
function lifecycleScript(ctx: Ctx): string {
  const self = ctx.selfPath ?? process.argv[1] ?? '';
  return join(resolve(dirname(self), '..'), 'herdr', 'lifecycle.mjs');
}

/** `checked`: the caller already found hc, so the probe is skipped. */
export async function startBackgroundRelay(ctx: Ctx, runtime: BackgroundRuntime, options: { checked?: boolean } = {}): Promise<'started' | 'running'> {
  const current = await runningRelayRuntime(ctx.env);
  if (current === runtime) return 'running';
  if (current !== undefined) {
    throw new CliError(
      `A PeerBand relay for ${current === 'herdr' ? 'the Herdr terminal app' : current} is already running on this machine. One relay serves one runtime.`,
      'Stop it with `peerband relay --stop` (or close the Relay tab in Herdr), then run `peerband relay --core` again.',
    );
  }
  const exec = ctx.exec ?? execProgram;
  // A missing hc is the one problem worth catching up front; a stopped core is started by `hc connect` itself.
  const probe = options.checked ? undefined : await exec(resolveCoreBinary(undefined, ctx.env), ['--version'], { env: ctx.env, timeoutMs: 15_000 });
  if (probe?.notFound) {
    throw new CliError('herdr-core (hc) was not found on this machine.', 'Install it (https://github.com/herdrdev/herdr-core) or the Herdr desktop app, open a new terminal, then run `peerband relay --core` again.');
  }
  const result = await exec(process.execPath, [lifecycleScript(ctx), 'start'], { env: { ...ctx.env, PEERBAND_RUNTIME: runtime }, timeoutMs: 60_000 });
  if (result.code !== 0) {
    const detail = sanitize(result.stderr.trim().split('\n').pop() ?? '').replace(/^peerband:\s*/, '');
    throw new CliError(detail || 'The PeerBand relay did not start.', 'Run `peerband status`, then `peerband login` if you are not logged in.');
  }
  return 'started';
}

export async function stopBackgroundRelay(ctx: Ctx): Promise<boolean> {
  return stopRelay(ctx.env);
}
