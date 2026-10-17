import { readFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { configHome, relayStatePath } from '../core/index.js';
import { controlChannel, ownerRecordPath } from './herdr-js.js';
import { createPaneSnapshot, fallbackPaneSnapshot, type PaneSnapshot } from './herdr-js.js';

export type RelaySnapshot = PaneSnapshot & { source: 'control' | 'file' };

/** Sends one authenticated command to the live relay helper and returns its JSON reply. */
export async function requestControl(command: 'status' | 'stop', env: NodeJS.ProcessEnv, timeoutMs = 3000): Promise<Record<string, unknown>> {
  const config = configHome({ env });
  const record = JSON.parse(await readFile(ownerRecordPath(config), 'utf8')) as { token?: unknown };
  if (typeof record.token !== 'string') throw new Error('Invalid helper record');
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
    const timer = setTimeout(() => finish(new Error('Helper control timeout')), timeoutMs);
    socket.once('error', (error) => finish(error));
    socket.once('connect', () => socket.write(`${JSON.stringify({ token: record.token, command })}\n`));
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
    socket.once('end', () => finish(new Error('Helper control closed')));
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
