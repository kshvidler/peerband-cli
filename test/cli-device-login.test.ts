import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hostname } from 'node:os';
import { loadCredentials } from '../src/core/index.js';
import { browserDecision, openerCommand } from '../src/cli/browser.js';
import type { Ctx } from '../src/cli/types.js';
import { cleanupAll, runCli, spawnCli, tempDir } from './cli-helpers.js';

afterEach(cleanupAll);

const DEVICE_CODE = 'device-code-SECRET-0123456789abcdefghij';
const USER_CODE = 'WDJB-MJHT';
const approved = { installation_id: 'inst-9', credential: 'cred-SECRET', machine_name: 'laptop', account_email: 'me@example.com' };

type Reply = { status?: number; body?: unknown; destroy?: boolean; headers?: Record<string, string> };
interface Seen { path: string; body: Record<string, unknown> }

interface Mock {
  url: string;
  seen: Seen[];
  tokenPolls: () => number;
}

/** Local PeerBand stand-in. `token` is a script: one reply per poll, the last one repeats. */
async function mockServer(options: { token: Reply[]; code?: Reply | ((base: string) => Reply) }): Promise<Mock> {
  const seen: Seen[] = [];
  let polls = 0;
  let base = '';
  const send = (response: ServerResponse, reply: Reply) => {
    if (reply.destroy) return response.socket?.destroy();
    response.statusCode = reply.status ?? 200;
    response.setHeader('content-type', 'application/json');
    for (const [key, value] of Object.entries(reply.headers ?? {})) response.setHeader(key, value);
    response.end(JSON.stringify(reply.body ?? {}));
  };
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    let raw = '';
    request.on('data', (chunk) => (raw += chunk));
    request.on('end', () => {
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      seen.push({ path: request.url ?? '', body });
      if (request.url === '/api/device/code') {
        const configured = options.code;
        const reply =
          typeof configured === 'function'
            ? configured(base)
            : (configured ?? {
                body: {
                  device_code: DEVICE_CODE,
                  user_code: USER_CODE,
                  verification_uri: `${base}/device`,
                  verification_uri_complete: `${base}/device?code=${USER_CODE}`,
                  expires_in: 600,
                  interval: 5,
                },
              });
        return send(response, reply);
      }
      if (request.url === '/api/device/token') {
        const reply = options.token[Math.min(polls, options.token.length - 1)]!;
        polls++;
        return send(response, reply);
      }
      send(response, { status: 404, body: { detail: 'Not Found' } });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no address');
  base = `http://127.0.0.1:${address.port}`;
  const sockets = new Set<import('node:net').Socket>();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  closers.push(
    () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  );
  return { url: base, seen, tokenPolls: () => polls };
}

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

/** Fake time: sleeping records the wait and advances the clock instead of waiting. */
function fakeTime() {
  let now = 1_000_000;
  const waits: number[] = [];
  return {
    waits,
    now: () => now,
    sleep: async (ms: number) => {
      waits.push(ms);
      now += ms;
    },
  };
}

const ANSI = /\u001b\[/;
const pending: Reply = { status: 400, body: { error: 'authorization_pending' } };
const success: Reply = { body: approved };

async function login(mock: Mock, extra: string[] = [], options: { env?: NodeJS.ProcessEnv; overrides?: Partial<Omit<Ctx, 'out'>>; tty?: boolean } = {}) {
  const home = await tempDir();
  const time = fakeTime();
  const opened: string[] = [];
  const result = await runCli(['login', '--name', 'laptop', ...extra], {
    env: { PEERBAND_CONFIG_HOME: home, PEERBAND_SERVER: mock.url, DISPLAY: ':0', ...options.env },
    ...(options.tty !== undefined ? { tty: options.tty } : {}),
    overrides: {
      sleep: time.sleep,
      now: time.now,
      openBrowser: async (url: string) => (opened.push(url), true),
      ...options.overrides,
    },
  });
  return { ...result, home, time, opened, creds: join(home, 'credentials.json') };
}

describe('peerband login (browser device flow)', () => {
  it('waits through pending and slow_down, then saves the credential with enrolledAt', async () => {
    const mock = await mockServer({
      token: [pending, { status: 400, body: { error: 'slow_down', interval: 10 } }, pending, success],
    });
    const r = await login(mock);
    expect(r.code).toBe(0);
    // First wait is the server interval; slow_down raises it and the new interval is honoured.
    expect(r.time.waits).toEqual([5000, 5000, 10000, 10000]);
    expect(r.stdout).toContain('Logged in as laptop (me@example.com)');
    expect(r.stdout).toContain('Next:');
    const saved = await loadCredentials(r.creds);
    expect(saved).toMatchObject({ serverUrl: mock.url, installationId: 'inst-9', credential: 'cred-SECRET', machineName: 'laptop', accountEmail: 'me@example.com' });
    expect(Date.parse(saved.enrolledAt ?? '')).toBeGreaterThan(Date.now() - 60_000);

    const [codeRequest, ...polls] = mock.seen;
    expect(codeRequest).toEqual({
      path: '/api/device/code',
      body: { client: 'peerband-cli', client_version: '0.0.0-dev', machine_name: 'laptop', platform: process.platform },
    });
    expect(polls.map((p) => p.path)).toEqual(['/api/device/token', '/api/device/token', '/api/device/token', '/api/device/token']);
    for (const poll of polls) expect(poll.body).toEqual({ device_code: DEVICE_CODE });
  });

  it('slow_down without an interval adds 5 seconds', async () => {
    const mock = await mockServer({ token: [{ status: 400, body: { error: 'slow_down' } }, pending, success] });
    const r = await login(mock);
    expect(r.code).toBe(0);
    expect(r.time.waits).toEqual([5000, 10000, 10000]);
  });

  it('defaults the machine name to the hostname', async () => {
    const mock = await mockServer({ token: [success] });
    const r = await runCli(['login'], {
      env: { PEERBAND_CONFIG_HOME: await tempDir(), PEERBAND_SERVER: mock.url },
      overrides: { sleep: fakeTime().sleep, now: fakeTime().now },
    });
    expect(r.code).toBe(0);
    expect(mock.seen[0]?.body.machine_name).toBe(hostname());
  });

  it('prints plain, ANSI-free output with the link and code, never the device code', async () => {
    const mock = await mockServer({ token: [pending, success] });
    const r = await login(mock);
    const all = r.stdout + r.stderr;
    expect(all).not.toMatch(ANSI);
    expect(all).toContain(`${mock.url}/device?code=${USER_CODE}`);
    expect(all).toContain(USER_CODE);
    expect(all).toContain('Waiting for approval… (Ctrl+C to cancel)');
    expect(all).not.toContain(DEVICE_CODE);
    expect(all).not.toContain('cred-SECRET');
    expect(all).not.toContain('\r');
    expect(r.opened).toEqual([]); // stdout is not a TTY
  });

  it('opens the browser on an interactive local terminal, with colours and a spinner', async () => {
    const mock = await mockServer({ token: [pending, success] });
    const r = await login(mock, [], { tty: true });
    expect(r.code).toBe(0);
    expect(r.opened).toEqual([`${mock.url}/device?code=${USER_CODE}`]);
    expect(r.stderr).toContain('Opened your browser');
    expect(r.stderr).toMatch(ANSI);
    expect(r.stderr).toContain('\r'); // spinner frames
    expect(r.stdout + r.stderr).not.toContain(DEVICE_CODE);
  });

  it('NO_COLOR removes colours on a TTY but still opens the browser', async () => {
    const mock = await mockServer({ token: [success] });
    const r = await login(mock, [], { tty: true, env: { NO_COLOR: '1' } });
    expect(r.stdout + r.stderr).not.toMatch(/\u001b\[(?!2K)/);
    expect(r.opened).toHaveLength(1);
  });

  it('says so when the browser cannot be opened', async () => {
    const mock = await mockServer({ token: [success] });
    const r = await login(mock, [], { tty: true, overrides: { openBrowser: async () => false } });
    expect(r.code).toBe(0);
    expect(r.stderr).toContain("Couldn't open a browser; open the link above.");
  });

  it('--no-browser and SSH sessions suppress the opener', async () => {
    const mock = await mockServer({ token: [success] });
    const flagged = await login(mock, ['--no-browser'], { tty: true });
    expect(flagged.code).toBe(0);
    expect(flagged.opened).toEqual([]);
    expect(flagged.stderr).toContain(USER_CODE);
    for (const env of [{ SSH_CONNECTION: '1.2.3.4 1 5.6.7.8 22' }, { SSH_TTY: '/dev/pts/0' }]) {
      const ssh = await login(mock, [], { tty: true, env });
      expect(ssh.code).toBe(0);
      expect(ssh.opened).toEqual([]);
      expect(ssh.stderr).toContain(`${mock.url}/device?code=${USER_CODE}`);
    }
  });

  it('does not open anything for a non-http verification URL', async () => {
    const mock = await mockServer({
      token: [success],
      code: { body: { device_code: DEVICE_CODE, user_code: USER_CODE, verification_uri: 'file:///etc/passwd', verification_uri_complete: 'file:///etc/passwd', expires_in: 60, interval: 1 } },
    });
    const r = await login(mock, [], { tty: true });
    expect(r.opened).toEqual([]);
  });

  it('exits 1 when the browser sign-in is denied and saves nothing', async () => {
    const mock = await mockServer({ token: [pending, { status: 400, body: { error: 'access_denied' } }] });
    const r = await login(mock);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('Sign-in was denied in the browser.');
    await expect(readFile(r.creds)).rejects.toThrow();
  });

  it('exits 1 with a rerun hint when the server says the code expired', async () => {
    const mock = await mockServer({ token: [{ status: 400, body: { error: 'expired_token' } }] });
    const r = await login(mock);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('The code expired.');
    expect(r.stderr).toContain('Run `peerband login` again');
  });

  it('gives up locally once expires_in has passed', async () => {
    const mock = await mockServer({
      token: [pending],
      code: { body: { device_code: DEVICE_CODE, user_code: USER_CODE, verification_uri: 'http://x/device', verification_uri_complete: 'http://x/device?code=WDJB-MJHT', expires_in: 20, interval: 5 } },
    });
    const r = await login(mock);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('The code expired.');
    expect(r.time.waits).toEqual([5000, 5000, 5000, 5000]);
  });

  it('exits 1 on invalid_grant', async () => {
    const mock = await mockServer({ token: [{ status: 400, body: { error: 'invalid_grant', error_description: 'Unknown code' } }] });
    const r = await login(mock);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('no longer valid');
    await expect(readFile(r.creds)).rejects.toThrow();
  });

  it('points to --grant when the server has no device endpoint (404)', async () => {
    const mock = await mockServer({ token: [success], code: { status: 404, body: { detail: 'Not Found' } } });
    const r = await login(mock);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("doesn't support browser sign-in");
    expect(r.stderr).toContain('peerband login --grant GRANT');
    expect(mock.tokenPolls()).toBe(0);
  });

  it('reports rate limiting and other refusals from the code endpoint', async () => {
    const mock = await mockServer({ token: [success], code: { status: 429, body: { error: 'rate_limited', error_description: 'Too many requests' }, headers: { 'retry-after': '30' } } });
    const r = await login(mock);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('Too many requests');
  });

  it('backs off exponentially on network errors and 5xx, then succeeds', async () => {
    const mock = await mockServer({ token: [{ destroy: true }, { status: 503, body: {} }, { destroy: true }, success] });
    const r = await login(mock);
    expect(r.code).toBe(0);
    expect(r.time.waits).toEqual([5000, 10000, 20000, 30000]);
    expect(mock.tokenPolls()).toBe(4);
  });

  it('gives up after expires_in when the server stays unreachable', async () => {
    const mock = await mockServer({
      token: [{ status: 502 }],
      code: { body: { device_code: DEVICE_CODE, user_code: USER_CODE, verification_uri: 'http://x/device', verification_uri_complete: 'http://x/device?code=WDJB-MJHT', expires_in: 60, interval: 5 } },
    });
    const r = await login(mock);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('The code expired.');
    expect(Math.max(...r.time.waits)).toBeLessThanOrEqual(30_000);
  });

  it('reports an unreachable server when requesting the code', async () => {
    const r = await runCli(['login'], { env: { PEERBAND_CONFIG_HOME: await tempDir(), PEERBAND_SERVER: 'http://127.0.0.1:1' }, overrides: { sleep: fakeTime().sleep } });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('Could not reach');
  });

  it('exits 130 when cancelled while waiting', async () => {
    const mock = await mockServer({ token: [pending] });
    const controller = new AbortController();
    const home = await tempDir();
    const running = runCli(['login'], {
      env: { PEERBAND_CONFIG_HOME: home, PEERBAND_SERVER: mock.url },
      overrides: { signal: controller.signal },
    });
    // Real sleep (5 s interval): the abort must cut it short.
    await new Promise((resolve) => setTimeout(resolve, 150));
    const started = Date.now();
    controller.abort();
    const r = await running;
    expect(r.code).toBe(130);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(r.stderr).toContain('Login cancelled.');
    expect(mock.tokenPolls()).toBe(0);
    await expect(readFile(join(home, 'credentials.json'))).rejects.toThrow();
  });

  it('exits 130 when cancelled right after a wait', async () => {
    const mock = await mockServer({ token: [pending] });
    const controller = new AbortController();
    const r = await login(mock, [], {
      overrides: {
        signal: controller.signal,
        sleep: async () => {
          controller.abort();
        },
      },
    });
    expect(r.code).toBe(130);
  });

  it('keeps using the grant path with --grant and PEERBAND_GRANT, never the device endpoints', async () => {
    const mock = await mockServer({ token: [success] });
    const home = await tempDir();
    const fetched: string[] = [];
    const env: NodeJS.ProcessEnv = { PEERBAND_CONFIG_HOME: home, PEERBAND_GRANT: 'ENV-GRANT-0123456789abcdef' };
    const r = await runCli(['login', '--server', mock.url], {
      env,
      overrides: {
        env,
        fetch: (async (input: string | URL | Request) => {
          fetched.push(String(input));
          return new Response(JSON.stringify(approved), { status: 200 });
        }) as typeof fetch,
      },
    });
    expect(r.code).toBe(0);
    expect(fetched).toEqual([`${mock.url}/api/enrollments/redeem`]);
    expect(mock.seen).toEqual([]);
    expect(env.PEERBAND_GRANT).toBeUndefined();
  });

  it('works end to end with the built binary', async () => {
    const mock = await mockServer({ token: [success], code: { body: { device_code: DEVICE_CODE, user_code: USER_CODE, verification_uri: 'http://127.0.0.1/device', verification_uri_complete: 'http://127.0.0.1/device?code=WDJB-MJHT', expires_in: 600, interval: 1 } } });
    const home = await tempDir();
    const r = await spawnCli(['login', '--name', 'e2e'], { PEERBAND_CONFIG_HOME: home, PEERBAND_SERVER: mock.url });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Logged in as laptop');
    expect(r.stderr).toContain('WDJB-MJHT');
    expect(r.stdout + r.stderr).not.toContain(DEVICE_CODE);
    expect((await loadCredentials(join(home, 'credentials.json'))).installationId).toBe('inst-9');
  });
});

describe('browser opener policy', () => {
  const base = { env: { DISPLAY: ':0' } as NodeJS.ProcessEnv, platform: 'linux' as NodeJS.Platform, stdoutIsTTY: true, noBrowser: false };
  const url = 'https://peerband.com/device?code=WDJB-MJHT';

  it('opens on an interactive desktop', () => {
    expect(browserDecision(url, base)).toEqual({ open: true });
    expect(browserDecision(url, { ...base, platform: 'win32', env: {} })).toEqual({ open: true });
    expect(browserDecision(url, { ...base, platform: 'darwin', env: {} })).toEqual({ open: true });
    expect(browserDecision(url, { ...base, env: { WAYLAND_DISPLAY: 'wayland-0' } })).toEqual({ open: true });
  });

  it('stays closed for flags, SSH, pipes, headless Linux and odd URLs', () => {
    expect(browserDecision(url, { ...base, noBrowser: true }).reason).toBe('flag');
    expect(browserDecision(url, { ...base, env: { SSH_CONNECTION: 'x' } }).reason).toBe('ssh');
    expect(browserDecision(url, { ...base, env: { SSH_TTY: 'x' } }).reason).toBe('ssh');
    expect(browserDecision(url, { ...base, stdoutIsTTY: false }).reason).toBe('not-a-tty');
    expect(browserDecision(url, { ...base, env: {} }).reason).toBe('no-display');
    expect(browserDecision('javascript:alert(1)', base).reason).toBe('unsafe-url');
    expect(browserDecision('not a url', base).reason).toBe('unsafe-url');
  });

  it('uses per-platform openers without a shell', () => {
    expect(openerCommand('darwin', url)).toEqual({ command: 'open', args: [url] });
    expect(openerCommand('win32', url)).toEqual({ command: 'rundll32', args: ['url.dll,FileProtocolHandler', url] });
    expect(openerCommand('linux', url)).toEqual({ command: 'xdg-open', args: [url] });
  });
});
