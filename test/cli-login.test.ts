import { afterEach, describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { hostname } from 'node:os';
import { loadCredentials, saveCredentials } from '../src/core/index.js';
import { readHidden, PromptAborted } from '../src/cli/prompt.js';
import type { ReadableLike } from '../src/cli/types.js';
import { cleanupAll, runCli, spawnCli, tempDir } from './cli-helpers.js';

afterEach(cleanupAll);

interface Redeem { url: string; body: Record<string, unknown> }
function fakeRedeem(response: { status?: number; body: unknown }, seen: Redeem[] = []): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify(response.body), { status: response.status ?? 200 });
  }) as typeof fetch;
}
const granted = { installation_id: 'inst-1', credential: 'secret-credential', machine_name: 'work-box', account_email: 'me@example.com' };

describe('peerband login', () => {
  it('enrolls with --grant and saves a private credential with enrolledAt', async () => {
    const home = await tempDir();
    const seen: Redeem[] = [];
    const result = await runCli(['login', '--grant', 'GRANT-1', '--name', 'work-box'], {
      env: { PEERBAND_CONFIG_HOME: home },
      overrides: { fetch: fakeRedeem({ body: granted }, seen) },
    });
    expect(result.code).toBe(0);
    expect(seen).toEqual([{ url: 'https://peerband.com/api/enrollments/redeem', body: { grant: 'GRANT-1', name: 'work-box' } }]);
    expect(result.stdout).toContain('Logged in as work-box (me@example.com)');
    expect(result.stdout).toContain('Next:');
    expect(result.stdout + result.stderr).not.toContain('GRANT-1');
    const saved = await loadCredentials(join(home, 'credentials.json'));
    expect(saved).toMatchObject({ serverUrl: 'https://peerband.com', installationId: 'inst-1', credential: 'secret-credential', machineName: 'work-box', accountEmail: 'me@example.com' });
    expect(Date.parse(saved.enrolledAt ?? '')).toBeGreaterThan(Date.now() - 60_000);
    if (process.platform !== 'win32') expect((await stat(join(home, 'credentials.json'))).mode & 0o777).toBe(0o600);
  });

  it('reads PEERBAND_GRANT, removes it from the environment and defaults the name to the hostname', async () => {
    const home = await tempDir();
    const env: NodeJS.ProcessEnv = { PEERBAND_CONFIG_HOME: home, PEERBAND_GRANT: 'ENV-GRANT' };
    const seen: Redeem[] = [];
    const result = await runCli(['login'], { env, overrides: { env, fetch: fakeRedeem({ body: { ...granted, machine_name: undefined } }, seen) } });
    expect(result.code).toBe(0);
    expect(seen[0]?.body).toEqual({ grant: 'ENV-GRANT', name: hostname() });
    expect(env.PEERBAND_GRANT).toBeUndefined();
  });

  it('says so when it replaces an existing login', async () => {
    const home = await tempDir();
    await saveCredentials({ serverUrl: 'https://peerband.com', installationId: 'old', credential: 'old-secret', machineName: 'old-box' }, join(home, 'credentials.json'));
    const result = await runCli(['login', '--grant', 'g'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { fetch: fakeRedeem({ body: granted }) } });
    expect(result.stdout).toContain('Replaced the previous login (old-box');
    expect((await loadCredentials(join(home, 'credentials.json'))).installationId).toBe('inst-1');
  });

  it('reports server validation errors with a next step and saves nothing', async () => {
    const home = await tempDir();
    const result = await runCli(['login', '--grant', 'bad'], {
      env: { PEERBAND_CONFIG_HOME: home },
      overrides: { fetch: fakeRedeem({ status: 400, body: { detail: 'Grant expired' } }) },
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('peerband: Enrollment could not be redeemed: Grant expired');
    expect(result.stderr).toContain('Next:');
    await expect(readFile(join(home, 'credentials.json'))).rejects.toThrow();
  });

  it('rejects insecure server URLs and honours PEERBAND_SERVER', async () => {
    const insecure = await runCli(['login', '--grant', 'g', '--server', 'http://example.com']);
    expect(insecure.code).toBe(1);
    expect(insecure.stderr).toContain('https');
    const insecureDevice = await runCli(['login', '--server', 'http://example.com']);
    expect(insecureDevice.code).toBe(1);
    expect(insecureDevice.stderr).toContain('https');
    const seen: Redeem[] = [];
    await runCli(['login', '--grant', 'g'], {
      env: { PEERBAND_CONFIG_HOME: await tempDir(), PEERBAND_SERVER: 'http://localhost:9' },
      overrides: { fetch: fakeRedeem({ body: granted }, seen) },
    });
    expect(seen[0]?.url).toBe('http://localhost:9/api/enrollments/redeem');
  });

  it('works end to end against a local HTTP server using the built binary', async () => {
    const received: Array<Record<string, unknown>> = [];
    const server = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => (body += chunk));
      request.on('end', () => {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        received.push(parsed);
        response.setHeader('content-type', 'application/json');
        if (parsed.grant !== 'good') {
          response.statusCode = 400;
          return response.end(JSON.stringify({ detail: 'Invalid grant' }));
        }
        response.end(JSON.stringify(granted));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('no address');
      const base = `http://127.0.0.1:${address.port}`;
      const home = await tempDir();
      const bad = await spawnCli(['login', '--grant', 'nope'], { PEERBAND_CONFIG_HOME: home, PEERBAND_SERVER: base });
      expect(bad.code).toBe(1);
      expect(bad.stderr).toContain('Invalid grant');
      const ok = await spawnCli(['login', '--name', 'e2e'], { PEERBAND_CONFIG_HOME: home, PEERBAND_SERVER: base, PEERBAND_GRANT: 'good' });
      expect(ok.code).toBe(0);
      expect(ok.stdout).toContain('Logged in as work-box');
      expect(received.at(-1)).toEqual({ grant: 'good', name: 'e2e' });
      expect((await loadCredentials(join(home, 'credentials.json'))).serverUrl).toBe(base);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

class FakeTty extends EventEmitter implements ReadableLike {
  isTTY = true;
  raw = false;
  resume = () => this;
  pause = () => this;
  setRawMode(mode: boolean) {
    this.raw = mode;
  }
}

describe('hidden grant prompt', () => {
  it('reads without echo, handles backspace and enter, and restores the terminal', async () => {
    const tty = new FakeTty();
    let echoed = '';
    const pending = readHidden(tty, { write: (text) => ((echoed += text), true) }, 'Grant: ');
    expect(tty.raw).toBe(true);
    tty.emit('data', Buffer.from('abcX\u007f'));
    tty.emit('data', Buffer.from('d\u001b[A'));
    tty.emit('data', Buffer.from('\r'));
    expect(await pending).toBe('abcd');
    expect(tty.raw).toBe(false);
    expect(echoed).toBe('Grant: \n');
  });

  it('aborts on Ctrl+C', async () => {
    const tty = new FakeTty();
    const pending = readHidden(tty, { write: () => true }, '');
    tty.emit('data', Buffer.from('sec\u0003'));
    await expect(pending).rejects.toBeInstanceOf(PromptAborted);
    expect(tty.raw).toBe(false);
  });

});

describe('peerband logout', () => {
  it('deletes the credential and says it does not revoke the machine', async () => {
    const home = await tempDir();
    await saveCredentials({ serverUrl: 'https://peerband.com', installationId: 'i', credential: 'c', machineName: 'box' }, join(home, 'credentials.json'));
    const result = await runCli(['logout'], { env: { PEERBAND_CONFIG_HOME: home } });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Logged out (box)');
    expect(result.stdout).toContain('does not revoke');
    expect(result.stdout).toContain('dashboard');
    await expect(readFile(join(home, 'credentials.json'))).rejects.toThrow();
  });

  it('is a no-op when already logged out', async () => {
    const result = await runCli(['logout'], { env: { PEERBAND_CONFIG_HOME: await tempDir() } });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Already logged out');
  });
});
