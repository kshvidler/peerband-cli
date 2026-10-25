import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { saveCredentials } from '../src/core/index.js';
import { cleanupAll, runCli, tempDir } from './cli-helpers.js';

afterEach(cleanupAll);

interface Seen { method: string; url: string; auth: string | null }
function fakeServer(reply: () => { status?: number; body?: unknown }, seen: Seen[] = []): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    seen.push({ method: init?.method ?? 'GET', url: String(input), auth: new Headers(init?.headers).get('authorization') });
    const { status = 200, body } = reply();
    return new Response(JSON.stringify(body ?? {}), { status });
  }) as typeof fetch;
}

async function loggedIn(): Promise<string> {
  const home = await tempDir();
  await saveCredentials({ serverUrl: 'https://peerband.com', installationId: 'inst-1', credential: 'machine-secret', machineName: 'work-box' }, join(home, 'credentials.json'));
  return home;
}

const CHANNELS = [
  { name: 'slack-alerts', format: 'slack', state: 'active', events: ['agent.notified'] },
  { name: 'ci', format: 'standard', state: 'paused', events: [] },
];

describe('peerband channels', () => {
  it('lists the channels with the machine credential, without URLs or secrets', async () => {
    const home = await loggedIn();
    const seen: Seen[] = [];
    const fetch = fakeServer(() => ({ body: { channels: [...CHANNELS, { name: 'Bad Name', format: 'x', state: 'active' }, 'junk'] } }), seen);
    const result = await runCli(['channels'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { fetch } });
    expect(result.code).toBe(0);
    expect(seen).toEqual([{ method: 'GET', url: 'https://peerband.com/api/installation/channels', auth: 'Bearer machine-secret' }]);
    expect(result.stdout).toMatch(/slack-alerts\s+slack\s+active/);
    expect(result.stdout).toMatch(/ci\s+standard\s+paused/);
    expect(result.stdout).not.toContain('Bad Name');
    expect(result.stdout).toContain('peerband notify --channel');
    expect(result.stdout + result.stderr).not.toContain('machine-secret');
    expect((await runCli(['channels', 'list'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { fetch } })).code).toBe(0);
  });

  it('prints JSON', async () => {
    const home = await loggedIn();
    const result = await runCli(['channels', '--json'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { fetch: fakeServer(() => ({ body: { channels: CHANNELS } })) } });
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ channels: CHANNELS });
  });

  it('explains how to add a channel when there are none', async () => {
    const home = await loggedIn();
    const result = await runCli(['channels'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { fetch: fakeServer(() => ({ body: { channels: [] } })) } });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('No channels yet');
    expect(result.stdout).toContain('https://peerband.com/dashboard');
    expect(result.stdout).toContain('Webhooks');
  });

  it('reports a server without channel support, a revoked credential, and a missing login', async () => {
    const home = await loggedIn();
    const old = await runCli(['channels'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { fetch: fakeServer(() => ({ status: 404, body: { detail: 'Not Found' } })) } });
    expect(old.code).toBe(1);
    expect(old.stderr).toContain("This PeerBand server doesn't support channels yet.");
    const revoked = await runCli(['channels'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { fetch: fakeServer(() => ({ status: 401 })) } });
    expect(revoked.code).toBe(1);
    expect(revoked.stderr).toContain('peerband login');
    const nobody = await runCli(['channels'], { env: { PEERBAND_CONFIG_HOME: await tempDir() }, overrides: { fetch: fakeServer(() => ({ body: { channels: [] } })) } });
    expect(nobody.code).toBe(3);
  });

  it('rejects unknown actions and is listed in help', async () => {
    const home = await loggedIn();
    expect((await runCli(['channels', 'add'], { env: { PEERBAND_CONFIG_HOME: home } })).code).toBe(2);
    expect((await runCli(['--help'])).stdout).toContain('channels');
    const help = await runCli(['channels', '--help']);
    expect(help.stdout).toContain('peerband channels [list] [--json]');
    expect(help.stdout).toContain('Webhooks');
  });
});
