import { afterEach, describe, expect, it } from 'vitest';
import { fork, spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { WebSocket } from 'ws';
import { saveCredentials } from '../src/core/index.js';
import { runCli, DIST, cleanupAll, startMockRelay, tempDir } from './cli-helpers.js';
import { activityLine, shortTarget } from '../src/cli/commands/connect.js';

afterEach(cleanupAll);

describe('activity lines', () => {
  const plain = { dim: (t: string) => t, green: (t: string) => t, red: (t: string) => t, yellow: (t: string) => t } as never;
  it('keeps short targets and shortens long agent IDs to the column width', () => {
    expect(shortTarget('agent-1')).toBe('agent-1');
    const long = 'herdr_63fd61b5-f2d6-431d-b2df-44c2fa3195b6';
    const short = shortTarget(long);
    expect(short).toHaveLength(18);
    expect(short.startsWith('herdr_63f')).toBe(true);
    expect(short.endsWith('fa3195b6')).toBe(true);
  });
  it('aligns the outcome column whatever the target length', () => {
    const at = new Date(2026, 0, 1, 12, 0, 0);
    const line = (target: string) => activityLine(plain, { tool: 'get_agent_status', target, outcome: 'success', latencyMs: 1 } as never, at);
    expect(line('herdr_63fd61b5-f2d6-431d-b2df-44c2fa3195b6').indexOf('success')).toBe(line('a').indexOf('success'));
  });
});

/** On connect: ping, then (after pong) a list_agents request. */
function relayScript(onResponse?: (ws: WebSocket) => void) {
  return (ws: WebSocket) => {
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString()) as Record<string, unknown>;
      if (message.type === 'pong') {
        ws.send(JSON.stringify({ type: 'request', id: 'req-1', tool: 'list_agents', args: { limit: 1 }, principal: { id: 'u', scopes: ['agents:read'] } }));
      } else if (message.type === 'response') onResponse?.(ws);
    });
    ws.send('{"type":"ping"}');
  };
}

async function loggedIn(url: string): Promise<string> {
  const home = await tempDir();
  await saveCredentials({ serverUrl: url, installationId: 'install-1', credential: 'installation-secret', machineName: 'test-box' }, join(home, 'credentials.json'));
  return home;
}

const childEnv = (home: string) => ({ PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, PEERBAND_CONFIG_HOME: home });

describe('peerband connect --managed', () => {
  it('emits pane events over IPC, exits 0 on peerband:shutdown and disconnects', async () => {
    const relay = await startMockRelay(relayScript());
    const home = await loggedIn(relay.url);
    const child = fork(DIST, ['connect', '--managed', '--runtime', 'mock'], { env: childEnv(home), silent: true });
    const messages: Array<Record<string, unknown>> = [];
    const exited = new Promise<number | null>((resolve) => child.once('exit', resolve));
    let disconnected = false;
    child.once('disconnect', () => (disconnected = true));
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no activity event; saw ${JSON.stringify(messages)}`)), 8_000);
      child.on('message', (message) => {
        messages.push(message as Record<string, unknown>);
        if ((message as Record<string, unknown>).kind === 'activity') {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    child.send({ type: 'peerband:shutdown' });
    expect(await exited).toBe(0);
    expect(disconnected).toBe(true);

    expect(messages.every((message) => message.type === 'peerband:pane-event')).toBe(true);
    const states = messages.filter((message) => message.kind === 'connection').map((message) => message.state);
    expect(states).toContain('connecting');
    expect(states).toContain('connected');
    const activity = messages.find((message) => message.kind === 'activity');
    expect(activity).toMatchObject({ requestId: 'req-1', tool: 'list_agents', outcome: 'success' });
    expect(typeof activity?.latencyMs).toBe('number');
    // Metadata only: no agent output or message text on the event.
    expect(Object.keys(activity ?? {}).sort()).toEqual(['kind', 'latencyMs', 'outcome', 'requestId', 'tool', 'type']);
  });

  it('exits when the parent disconnects', async () => {
    const relay = await startMockRelay(relayScript());
    const home = await loggedIn(relay.url);
    const child = fork(DIST, ['connect', '--managed', '--runtime', 'mock'], { env: childEnv(home), silent: true });
    const exited = new Promise<number | null>((resolve) => child.once('exit', resolve));
    await new Promise<void>((resolve) => child.on('message', (message) => (message as Record<string, unknown>).state === 'connected' && resolve()));
    child.disconnect();
    expect(await exited).toBe(0);
  });

  it('validates runtime and connector config', async () => {
    const home = await tempDir();
    await saveCredentials({ serverUrl: 'http://127.0.0.1:1', installationId: 'i', credential: 'c' }, join(home, 'credentials.json'));
    const bad = await runCli(['connect', '--managed'], { env: { PEERBAND_CONFIG_HOME: home, PEERBAND_RUNTIME: 'nope' } });
    expect(bad.code).toBe(2);
    expect(bad.stderr).toContain('Unknown runtime');
    await writeFile(join(home, 'connector.json'), '{"bogus": true}');
    const config = await runCli(['connect', '--runtime', 'mock'], { env: { PEERBAND_CONFIG_HOME: home } });
    expect(config.code).toBe(1);
    expect(config.stderr).toContain('unknown field "bogus"');
    const missing = await runCli(['connect', '--runtime', 'mock', '--config', join(home, 'absent.json')], { env: { PEERBAND_CONFIG_HOME: home } });
    expect(missing.stderr).toContain('Cannot read connector config');
    const viaEnv = await runCli(['connect', '--runtime', 'mock'], { env: { PEERBAND_CONFIG_HOME: home, PEERBAND_CONNECTOR_CONFIG: join(home, 'absent.json') } });
    expect(viaEnv.stderr).toContain('Cannot read connector config');
  });

  it('exits 3 when not logged in', async () => {
    const result = await runCli(['connect', '--runtime', 'mock'], { env: { PEERBAND_CONFIG_HOME: await tempDir() } });
    expect(result.code).toBe(3);
    expect(result.stderr).toContain('peerband login');
  });
});

describe('peerband connect: messaging default', () => {
  /** Runs the foreground connector against a relay that rejects immediately, and returns the banner. */
  async function banner(args: string[], config?: string): Promise<string> {
    const relay = await startMockRelay((ws) => ws.close(4001, 'revoked'));
    const home = await loggedIn(relay.url);
    if (config !== undefined) await writeFile(join(home, 'connector.json'), config);
    const child = spawn(process.execPath, [DIST, 'connect', '--runtime', 'mock', ...args], { env: childEnv(home), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => (stderr += chunk));
    await new Promise((resolve) => child.once('close', resolve));
    return stderr;
  }

  it('allows messages by default', async () => {
    expect(await banner([])).toContain('mock runtime, messages allowed.');
  });

  it('is read-only with --read-only', async () => {
    expect(await banner(['--read-only'])).toContain('mock runtime, read-only.');
  });

  it('is read-only with "enableWrites": false in connector.json', async () => {
    expect(await banner([], '{"enableWrites": false}')).toContain('mock runtime, read-only.');
    expect(await banner([], '{"enableWrites": true}')).toContain('messages allowed');
  });

  it('still accepts the redundant --enable-writes, and rejects it together with --read-only', async () => {
    expect(await banner(['--enable-writes'])).toContain('messages allowed');
    const home = await tempDir();
    await saveCredentials({ serverUrl: 'http://127.0.0.1:1', installationId: 'i', credential: 'c' }, join(home, 'credentials.json'));
    const both = await runCli(['connect', '--runtime', 'mock', '--read-only', '--enable-writes'], { env: { PEERBAND_CONFIG_HOME: home } });
    expect(both.code).toBe(2);
    expect(both.stderr).toContain('contradict');
    const help = await runCli(['help', 'connect']);
    expect(help.stdout).toContain('--read-only');
    expect(help.stdout).toContain('Redundant');
  });
});

describe('peerband connect (foreground)', () => {
  it('prints connection and metadata-only activity lines, and fails clearly when revoked', async () => {
    const relay = await startMockRelay(relayScript((ws) => setTimeout(() => ws.close(4001, 'revoked'), 20)));
    const home = await loggedIn(relay.url);
    const child = spawn(process.execPath, [DIST, 'connect', '--runtime', 'mock'], { env: childEnv(home), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => (stderr += chunk));
    const code = await new Promise<number | null>((resolve) => child.once('close', resolve));
    expect(code).toBe(1);
    expect(stderr).toContain(`Connected to ${relay.url} as test-box`);
    expect(stderr).toMatch(/\d\d:\d\d:\d\d\s+list_agents\s+-\s+success\s+\d+ ms/);
    expect(stderr).toContain('messages allowed');
    expect(stderr).toContain('rejected');
    expect(stderr).toContain('peerband login');
    expect(stderr).not.toContain('\u001b[');
  });
});
