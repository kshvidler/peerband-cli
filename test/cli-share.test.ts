import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { saveCredentials } from '../src/core/index.js';
import { cleanupAll, runCli, tempDir } from './cli-helpers.js';

afterEach(cleanupAll);

interface Seen { method: string; url: string; auth: string | null; body: unknown }
function fakeServer(reply: (seen: Seen) => { status?: number; body?: unknown }, seen: Seen[] = []): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const call = { method: init?.method ?? 'GET', url: String(input), auth: headers.get('authorization'), body: init?.body ? JSON.parse(String(init.body)) : undefined };
    seen.push(call);
    const { status = 200, body } = reply(call);
    return new Response(status === 204 ? null : JSON.stringify(body ?? {}), { status });
  }) as typeof fetch;
}

async function loggedIn(): Promise<string> {
  const home = await tempDir();
  await saveCredentials({ serverUrl: 'https://peerband.com', installationId: 'inst-1', credential: 'machine-secret', machineName: 'work-box' }, join(home, 'credentials.json'));
  return home;
}

describe('peerband share', () => {
  it('creates a read-only invite link with the machine credential', async () => {
    const home = await loggedIn();
    const seen: Seen[] = [];
    const fetch = fakeServer(() => ({ body: { id: 'inv_1', url: 'https://peerband.com/share#tok', role: 'read', expires_at: '2026-10-26T00:00:00Z' } }), seen);
    const result = await runCli(['share'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { fetch } });
    expect(result.code).toBe(0);
    expect(seen).toEqual([{ method: 'POST', url: 'https://peerband.com/api/installation/invites', auth: 'Bearer machine-secret', body: { role: 'read' } }]);
    expect(result.stdout).toContain('https://peerband.com/share#tok');
    expect(result.stdout).toContain('work-box');
    expect(result.stdout).toContain('read only');
    expect(result.stdout + result.stderr).not.toContain('machine-secret');
  });

  it('passes --message and --expires, and validates --expires', async () => {
    const home = await loggedIn();
    const seen: Seen[] = [];
    const fetch = fakeServer(() => ({ body: { id: 'inv_1', url: 'u', role: 'message', expires_at: 'x' } }), seen);
    expect((await runCli(['share', '--message', '--expires', '2'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { fetch } })).code).toBe(0);
    expect(seen[0]?.body).toEqual({ role: 'message', expires_in_days: 2 });
    const bad = await runCli(['share', '--expires', '90'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { fetch } });
    expect(bad.code).toBe(2);
    expect(seen).toHaveLength(1);
  });

  it('lists people and unused links', async () => {
    const home = await loggedIn();
    const fetch = fakeServer(() => ({
      body: {
        guests: [{ id: 'acc_1', email: 'sam@example.com', role: 'message', shared_at: 't', last_used_at: null }],
        invites: [{ id: 'inv_2', role: 'read', created_at: 't', expires_at: '2026-10-26T00:00:00Z' }],
      },
    }));
    const result = await runCli(['share', 'list'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { fetch } });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('sam@example.com');
    expect(result.stdout).toContain('acc_1');
    expect(result.stdout).toContain('inv_2');
  });

  it('revokes by ID and rejects malformed IDs', async () => {
    const home = await loggedIn();
    const seen: Seen[] = [];
    const fetch = fakeServer(() => ({ status: 204 }), seen);
    const result = await runCli(['share', 'revoke', 'acc_1'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { fetch } });
    expect(result.code).toBe(0);
    expect(seen[0]).toMatchObject({ method: 'DELETE', url: 'https://peerband.com/api/installation/sharing/acc_1' });
    expect(result.stdout).toContain('Access removed.');
    expect((await runCli(['share', 'revoke', '../x'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { fetch } })).code).toBe(2);
    expect((await runCli(['share', 'revoke'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { fetch } })).code).toBe(2);
  });

  it('explains a revoked credential and server errors', async () => {
    const home = await loggedIn();
    const revoked = await runCli(['share'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { fetch: fakeServer(() => ({ status: 401 })) } });
    expect(revoked.code).toBe(1);
    expect(revoked.stderr).toContain('peerband login');
    const limit = await runCli(['share'], {
      env: { PEERBAND_CONFIG_HOME: home },
      overrides: { fetch: fakeServer(() => ({ status: 409, body: { detail: 'A machine can have at most 5 unused invitation links.' } })) },
    });
    expect(limit.code).toBe(1);
    expect(limit.stderr).toContain('at most 5 unused');
  });

  it('needs a login', async () => {
    const home = await tempDir();
    const result = await runCli(['share'], { env: { PEERBAND_CONFIG_HOME: home } });
    expect(result.code).toBe(3);
  });
});
