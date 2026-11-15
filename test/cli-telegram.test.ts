import { afterEach, expect, it } from 'vitest';
import { join } from 'node:path';
import { saveCredentials } from '../src/core/index.js';
import { cleanupAll, runCli, tempDir } from './cli-helpers.js';

afterEach(cleanupAll);

it('offers the public bot-first flow before login without making a request', async () => {
  const result = await runCli(['telegram'], { env: { PEERBAND_CONFIG_HOME: await tempDir() }, overrides: {
    fetch: async () => { throw new Error('must not fetch'); },
  } });
  expect(result.code).toBe(0);
  expect(result.stdout).toContain('https://t.me/PeerBandBot\n');
  expect(result.stdout).toContain('https://peerband.com/dashboard#channels');
  expect(result.stdout).toMatch(/[▀▄]/);
  expect(result.stdout).toContain('status unavailable');
  expect(result.stdout).not.toContain('?start=');
  expect(result.stderr).toBe('');
});

it.each([
  [{ name: 'telegram', state: 'active' }, 'connected'],
  [{ name: 'telegram', state: 'paused' }, 'not connected'],
  [{ name: 'other', state: 'active' }, 'not connected'],
])('checks channel status with only a read request (%j)', async (channel, status) => {
  const home = await tempDir();
  await saveCredentials({ serverUrl: 'https://peerband.com', installationId: 'test', credential: 'test-secret' }, join(home, 'credentials.json'));
  const seen: string[] = [];
  const result = await runCli(['telegram'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: {
    fetch: async (url, init) => {
      seen.push(`${init?.method} ${url}`);
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-secret');
      return Response.json({ channels: [channel] });
    },
  } });
  expect(result.code).toBe(0);
  expect(result.stdout).toContain(`Telegram: ${status}\n`);
  expect(seen).toEqual(['GET https://peerband.com/api/installation/channels']);
  expect(result.stdout + result.stderr).not.toContain('test-secret');
});

it.each([401, 404, 500, 'offline', 'malformed'])('keeps setup usable when status fails: %s', async (failure) => {
  const home = await tempDir();
  await saveCredentials({ serverUrl: 'https://peerband.com', installationId: 'test', credential: 'test-secret' }, join(home, 'credentials.json'));
  const result = await runCli(['telegram'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: {
    fetch: async () => {
      if (failure === 'offline') throw new Error('sensitive error');
      return Response.json({ detail: 'sensitive error' }, { status: typeof failure === 'number' ? failure : 200 });
    },
  } });
  expect(result.code).toBe(0);
  expect(result.stdout).toContain('https://t.me/PeerBandBot');
  expect(result.stdout).toContain('status unavailable');
  expect(result.stdout + result.stderr).not.toMatch(/test-secret|sensitive error/);
});

it('documents the command in help and rejects arguments', async () => {
  expect((await runCli(['--help'])).stdout).toContain('telegram');
  expect((await runCli(['telegram', '--help'])).stdout).toContain('peerband telegram');
  expect((await runCli(['telegram', 'connect'])).code).toBe(2);
});
