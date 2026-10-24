import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { saveCredentials } from '../src/core/index.js';
import { controlChannel, ownerRecordPath } from '../src/cli/herdr-js.js';
import { cleanupAll, runCli, startMockRelay, tempDir, DIST } from './cli-helpers.js';

afterEach(cleanupAll);
const execute = promisify(execFile);
const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** A stand-in relay helper on the control channel: records the request line and answers with `reply`. */
async function fakeHelper(reply: ((request: Record<string, unknown>, socket: Socket) => void) | Record<string, unknown>) {
  const home = await tempDir();
  await mkdir(join(home, 'relay-helper.lock'), { recursive: true });
  await writeFile(ownerRecordPath(home), JSON.stringify({ token: 'secret-token' }));
  const channel = controlChannel(home);
  const received: Array<Record<string, unknown>> = [];
  const server = createServer((socket) => {
    let text = '';
    socket.on('data', (chunk) => {
      text += chunk.toString();
      if (!text.includes('\n')) return;
      const request = JSON.parse(text.slice(0, text.indexOf('\n'))) as Record<string, unknown>;
      received.push(request);
      if (typeof reply === 'function') reply(request, socket);
      else socket.end(`${JSON.stringify(reply)}\n`);
    });
  });
  await new Promise<void>((done, fail) => server.once('error', fail).listen(channel, done));
  return {
    home,
    received,
    close: async () => {
      await new Promise((done) => server.close(done));
      await rm(channel, { force: true }).catch(() => undefined);
    },
  };
}

describe('peerband notify', () => {
  it('sends the note and the calling Herdr pane over the control channel', async () => {
    const helper = await fakeHelper({ ok: true, sent: true, agentId: 'herdr_abc', eventId: '7b0e7c1e-6f7e-4a59-9d55-2f8f3a3c1d11' });
    try {
      const result = await runCli(['notify', 'Migration finished,', '3 tests failing'], { env: { PEERBAND_CONFIG_HOME: helper.home, HERDR_PANE_ID: 'w1:p2' } });
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Note sent to the machine owner');
      expect(result.stdout).toContain('herdr_abc');
      expect(helper.received).toEqual([{ token: 'secret-token', command: 'notify', text: 'Migration finished, 3 tests failing', paneId: 'w1:p2' }]);
      const json = await runCli(['notify', '--json', 'Build green'], { env: { PEERBAND_CONFIG_HOME: helper.home } });
      expect(JSON.parse(json.stdout)).toEqual({ sent: true, agentId: 'herdr_abc', eventId: '7b0e7c1e-6f7e-4a59-9d55-2f8f3a3c1d11' });
      expect(helper.received[1]).toEqual({ token: 'secret-token', command: 'notify', text: 'Build green' });
    } finally {
      await helper.close();
    }
  });

  it('fails clearly when no relay is running, without touching the real config', async () => {
    const home = await tempDir();
    const result = await runCli(['notify', 'hello'], { env: { PEERBAND_CONFIG_HOME: home } });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('No PeerBand relay is running');
    expect(result.stderr).toContain('peerband relay');
  });

  it('rejects empty and too long notes before contacting the relay', async () => {
    const home = await tempDir();
    for (const argv of [['notify'], ['notify', '   '], ['notify', 'x'.repeat(1025)]]) {
      const result = await runCli(argv, { env: { PEERBAND_CONFIG_HOME: home } });
      expect(result.code, argv.join(' ')).toBe(2);
    }
    expect((await runCli(['notify', '   '], { env: { PEERBAND_CONFIG_HOME: home } })).stderr).toContain('empty');
    expect((await runCli(['notify', 'x'.repeat(1025)], { env: { PEERBAND_CONFIG_HOME: home } })).stderr).toContain('limit is 1024');
  });

  it('reports a relay that is offline, turned off, or too old to accept notes', async () => {
    const offline = await fakeHelper({ ok: true, sent: false, agentId: null });
    try {
      const result = await runCli(['notify', 'hello'], { env: { PEERBAND_CONFIG_HOME: offline.home } });
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('not connected to PeerBand');
    } finally { await offline.close(); }
    const off = await fakeHelper({ error: 'not-running', message: 'The relay is turned off.' });
    try {
      const result = await runCli(['notify', 'hello'], { env: { PEERBAND_CONFIG_HOME: off.home } });
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('The relay is turned off. The note was not sent.');
      expect(result.stderr).toContain('peerband relay');
    } finally { await off.close(); }
    // Older helpers destroy the socket on an unknown command.
    const old = await fakeHelper((_request, socket) => socket.destroy());
    try {
      const result = await runCli(['notify', 'hello'], { env: { PEERBAND_CONFIG_HOME: old.home } });
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('does not support notes');
      expect(result.stderr).toContain('peerband update');
    } finally { await old.close(); }
  });

  it('is listed in help', async () => {
    const root = await runCli(['--help']);
    expect(root.stdout).toContain('notify');
    const help = await runCli(['notify', '--help']);
    expect(help.stdout).toContain('peerband notify "<text>"');
    expect(help.stdout).toContain('owner');
  });
});

describe('peerband notify through the real relay helper', () => {
  it('reaches PeerBand as agent.notified, next to streamed status events', async () => {
    await access(DIST);
    const frames: Array<Record<string, unknown>> = [];
    const headers: unknown[] = [];
    const relay = await startMockRelay((ws) => ws.on('message', (data) => frames.push(JSON.parse(data.toString()) as Record<string, unknown>)));
    relay.server.on('upgrade', (request) => headers.push(request.headers['x-peerband-features']));
    // The helper runs with this folder as its working directory, so remove it only after the helper exits.
    const home = await mkdtemp(join(tmpdir(), 'peerband-notify-'));
    await saveCredentials({ serverUrl: relay.url, installationId: 'install-1', credential: 'installation-secret', machineName: 'test-box' }, join(home, 'credentials.json'));
    const env = {
      ...process.env,
      PEERBAND_CONFIG_HOME: home,
      PEERBAND_RUNTIME: 'mock',
      PEERBAND_CONNECTOR_ENTRY: DIST,
      PEERBAND_MOCK_STATUS_INTERVAL_MS: '200',
    };
    const lifecycle = resolve(import.meta.dirname, '..', 'herdr', 'lifecycle.mjs');
    const command = (action: string) => execute(process.execPath, [lifecycle, action], { env, timeout: 15_000, windowsHide: true });
    try {
      expect(JSON.parse((await command('start')).stdout).state).toBe('running');
      for (let attempt = 0; attempt < 300 && !frames.some((frame) => frame.name === 'agent.status_changed'); attempt++) await pause(100);
      expect(frames[0]).toMatchObject({ type: 'event', name: 'agents.changed', data: {} });
      expect(frames.some((frame) => frame.name === 'agent.status_changed')).toBe(true);
      const result = await runCli(['notify', '--json', 'Build green, token=abcdef1234567'], { env: { PEERBAND_CONFIG_HOME: home, HERDR_PANE_ID: 'mock:0' } });
      expect(result.code, result.stderr).toBe(0);
      const reply = JSON.parse(result.stdout) as { sent: boolean; agentId: string; eventId: string };
      expect(reply.sent).toBe(true);
      expect(reply.agentId).toMatch(/^mock-/);
      for (let attempt = 0; attempt < 50 && !frames.some((frame) => frame.name === 'agent.notified'); attempt++) await pause(50);
      const note = frames.find((frame) => frame.name === 'agent.notified')!;
      expect(note).toMatchObject({ eventId: reply.eventId, data: { agentId: reply.agentId, text: 'Build green, token=[REDACTED]', audience: 'owner' } });
      expect(headers[0]).toBe('events');
      expect(JSON.stringify(frames)).not.toContain('Recent activity is demo data');
    } finally {
      await command('stop').catch(() => undefined);
      for (let attempt = 0; attempt < 100; attempt++) {
        try { await access(join(home, 'relay-helper.lock')); await pause(100); } catch { break; }
      }
      await pause(300);
      await rm(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 200 }).catch(() => undefined);
    }
  }, 60_000);
});
