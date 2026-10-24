// Stopping the relay, closing its Herdr panes and clearing its local state: shared by install, update, uninstall and logout.
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { configHome, lockPath, receiptsPath, relayStatePath, relayTabPath } from '../core/index.js';
import { relaySnapshot, stopRelay } from './control.js';
import { CONNECTOR_PATTERN, controlChannel, ownerRecordPath, probeChannel, reclaimIfStale, resetRelayState, SUPERVISOR_PATTERN } from './herdr-js.js';
import type { Ctx } from './types.js';

export const RELAY_MARKER = 'peerband_relay';
export const RELAY_LABEL = /^PeerBand Relay\b/;

export interface RelayPane {
  paneId: string;
  label?: string;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const sleeper = (ctx: Ctx) => ctx.sleep ?? defaultSleep;

/** True when a helper answers the control channel and reports a running relay. */
export async function relayRunning(ctx: Ctx): Promise<boolean> {
  const snapshot = await relaySnapshot(ctx.env);
  return snapshot?.source === 'control' && snapshot.state === 'running';
}

/** PeerBand Relay panes Herdr knows about (marked by relay-tab.mjs, or carrying the manifest pane title). */
export async function findRelayPanes(ctx: Ctx): Promise<RelayPane[]> {
  const result = await ctx.runHerdr(['pane', 'list'], { timeoutMs: 10_000 });
  if (result.code !== 0) return [];
  let panes: unknown;
  try {
    const parsed = JSON.parse(result.stdout) as { result?: { panes?: unknown }; panes?: unknown };
    panes = parsed.result?.panes ?? parsed.panes;
  } catch {
    return [];
  }
  if (!Array.isArray(panes)) return [];
  const found: RelayPane[] = [];
  for (const pane of panes as Array<Record<string, unknown>>) {
    if (!pane || typeof pane.pane_id !== 'string') continue;
    const tokens = pane.tokens && typeof pane.tokens === 'object' ? (pane.tokens as Record<string, unknown>) : {};
    const label = typeof pane.label === 'string' ? pane.label : undefined;
    if (typeof tokens[RELAY_MARKER] === 'string' || (label && RELAY_LABEL.test(label))) found.push({ paneId: pane.pane_id, label });
  }
  return found;
}

/** Closes the given Relay panes and waits (bounded) until Herdr no longer lists them. Returns how many were closed. */
export async function closeRelayPanes(ctx: Ctx, panes: RelayPane[], waitMs = 8000): Promise<number> {
  let closed = 0;
  for (const pane of panes) {
    const viaPlugin = await ctx.runHerdr(['plugin', 'pane', 'close', pane.paneId], { timeoutMs: 10_000 });
    if (viaPlugin.code === 0) {
      closed++;
      continue;
    }
    const plain = await ctx.runHerdr(['pane', 'close', pane.paneId], { timeoutMs: 10_000 });
    if (plain.code === 0) closed++;
  }
  const ids = new Set(panes.map((pane) => pane.paneId));
  const sleep = sleeper(ctx);
  for (let waited = 0; ids.size > 0 && waited < waitMs; waited += 250) {
    const remaining = await findRelayPanes(ctx);
    if (!remaining.some((pane) => ids.has(pane.paneId))) break;
    await sleep(250);
  }
  await rm(relayTabPath({ env: ctx.env }), { force: true }).catch(() => undefined);
  return closed;
}

/** Asks a running helper to stop and waits until its control channel is gone. Returns true when one was running. */
export async function stopRelayAndWait(ctx: Ctx, waitMs = 10_000): Promise<boolean> {
  const stopped = await stopRelay(ctx.env);
  if (!stopped) return false;
  const channel = controlChannel(configHome({ env: ctx.env }));
  const sleep = sleeper(ctx);
  for (let waited = 0; waited < waitMs; waited += 200) {
    if ((await probeChannel(channel, 1000)) === 'absent') break;
    await sleep(200);
  }
  return true;
}

export interface CleanupReport {
  /** Lock directories that were reclaimed because their owner is gone. */
  reclaimed: string[];
  /** Locks that are still held by a live owner, with the reason. */
  held: Array<{ lock: string; reason: string }>;
  removedState: boolean;
}

/**
 * Clears relay state that would block the next start: stale helper and receipt-store locks (only when their owner is
 * provably gone) and the saved relay snapshot. `remove` deletes relay-state.json and relay-tab.json instead of resetting.
 */
export async function cleanRelayState(ctx: Ctx, options: { remove?: boolean } = {}): Promise<CleanupReport> {
  const config = configHome({ env: ctx.env });
  const report: CleanupReport = { reclaimed: [], held: [], removedState: false };
  const helper = await reclaimIfStale({ lockDir: lockPath({ env: ctx.env }), ownerFile: ownerRecordPath(config), channel: controlChannel(config), processPattern: SUPERVISOR_PATTERN });
  if (helper.reclaimed) report.reclaimed.push(lockPath({ env: ctx.env }));
  else if (helper.verdict.state === 'live') report.held.push({ lock: lockPath({ env: ctx.env }), reason: helper.verdict.reason });
  const receiptsLock = `${receiptsPath({ env: ctx.env })}.lock`;
  const receipts = await reclaimIfStale({ lockDir: receiptsLock, ownerFile: join(receiptsLock, 'owner'), processPattern: CONNECTOR_PATTERN });
  if (receipts.reclaimed) report.reclaimed.push(receiptsLock);
  else if (receipts.verdict.state === 'live') report.held.push({ lock: receiptsLock, reason: receipts.verdict.reason });
  const helperGone = helper.verdict.state !== 'live';
  if (helperGone) {
    if (options.remove) {
      await rm(relayStatePath({ env: ctx.env }), { force: true }).catch(() => undefined);
      await rm(relayTabPath({ env: ctx.env }), { force: true }).catch(() => undefined);
      report.removedState = true;
    } else {
      report.removedState = await resetRelayState(relayStatePath({ env: ctx.env })).catch(() => false);
    }
  }
  return report;
}
