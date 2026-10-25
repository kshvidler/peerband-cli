import { readFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { configHome, relayStatePath } from '../core/index.js';
import { controlChannel, ownerRecordPath } from './herdr-js.js';
import { createPaneSnapshot, fallbackPaneSnapshot, type PaneSnapshot } from './herdr-js.js';

export type RelaySnapshot = PaneSnapshot & { source: 'control' | 'file' };

/** Sends one authenticated command to the live relay helper and returns its JSON reply. */
export async function requestControl(command: 'status' | 'stop', env: NodeJS.ProcessEnv, timeoutMs = 3000): Promise<Record<string, unknown>> {
  return exchange({ command }, env, timeoutMs);
}

/** Why a control request failed: nothing is listening, or a helper answered unexpectedly. */
export class ControlUnavailable extends Error {
  constructor(readonly reason: 'not-running' | 'closed' | 'timeout', message: string) {
    super(message);
    this.name = 'ControlUnavailable';
  }
}

/** Asks the running relay to send an owner-directed note (`peerband notify`). */
export async function requestNotify(note: { text: string; paneId?: string; channel?: string }, env: NodeJS.ProcessEnv, timeoutMs = 8000): Promise<Record<string, unknown>> {
  return exchange({ command: 'notify', text: note.text, ...(note.paneId ? { paneId: note.paneId } : {}), ...(note.channel ? { channel: note.channel } : {}) }, env, timeoutMs, true);
}

async function exchange(payload: Record<string, unknown>, env: NodeJS.ProcessEnv, timeoutMs: number, typed = false): Promise<Record<string, unknown>> {
  const config = configHome({ env });
  let record: { token?: unknown };
  try {
    record = JSON.parse(await readFile(ownerRecordPath(config), 'utf8')) as { token?: unknown };
  } catch (error) {
    if (typed) throw new ControlUnavailable('not-running', 'No relay helper is running');
    throw error;
  }
  if (typeof record.token !== 'string') throw typed ? new ControlUnavailable('not-running', 'Invalid helper record') : new Error('Invalid helper record');
  const socket = createConnection(controlChannel(config));
  return new Promise((resolve, reject) => {
    let text = '';
    let settled = false;
    const finish = (error?: Error, value?: Record<string, unknown>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve(value ?? {});
    };
    let connected = false;
    const timer = setTimeout(() => finish(typed ? new ControlUnavailable('timeout', 'Helper control timeout') : new Error('Helper control timeout')), timeoutMs);
    socket.once('error', (error) => finish(typed ? new ControlUnavailable(connected ? 'closed' : 'not-running', error.message) : error));
    socket.once('connect', () => {
      connected = true;
      socket.write(`${JSON.stringify({ token: record.token, ...payload })}\n`);
    });
    socket.on('data', (chunk) => {
      text += chunk.toString();
      if (text.length > 65_536) return finish(new Error('Invalid control response'));
      const newline = text.indexOf('\n');
      if (newline < 0) return;
      try {
        finish(undefined, JSON.parse(text.slice(0, newline)) as Record<string, unknown>);
      } catch (error) {
        finish(error as Error);
      }
    });
    socket.once('end', () => finish(typed ? new ControlUnavailable('closed', 'Helper control closed') : new Error('Helper control closed')));
  });
}

/** Live status from the control channel, else the last snapshot on disk, else undefined. */
export async function relaySnapshot(env: NodeJS.ProcessEnv): Promise<RelaySnapshot | undefined> {
  try {
    const live = await requestControl('status', env);
    return { ...createPaneSnapshot(live as Partial<PaneSnapshot>), source: 'control' };
  } catch {
    /* helper not running; fall back to the last saved snapshot */
  }
  try {
    const saved = JSON.parse(await readFile(relayStatePath({ env }), 'utf8')) as unknown;
    return { ...fallbackPaneSnapshot(saved), source: 'file' };
  } catch {
    return undefined;
  }
}

/** Best-effort: ask a running helper to stop. Returns true when a helper acknowledged. */
export async function stopRelay(env: NodeJS.ProcessEnv): Promise<boolean> {
  try {
    await requestControl('stop', env);
    return true;
  } catch {
    return false;
  }
}
