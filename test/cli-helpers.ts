import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import { createContext, run } from '../src/cli/cli.js';
import type { Ctx, HerdrResult, HerdrRunner } from '../src/cli/types.js';

export const DIST = resolve(import.meta.dirname, '..', 'dist', 'peerband.mjs');
const cleanups: Array<() => Promise<void>> = [];

export async function cleanupAll(): Promise<void> {
  await Promise.all(cleanups.splice(0).map((fn) => fn()));
}

export async function tempDir(prefix = 'peerband-cli-'): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

export interface Captured {
  stdout: string;
  stderr: string;
}

export const missingHerdr: HerdrRunner = async () => ({ code: 127, stdout: '', stderr: 'not found', notFound: true });

/** Runs the CLI in-process with captured output and an isolated environment. */
export async function runCli(
  argv: string[],
  options: { env?: NodeJS.ProcessEnv; overrides?: Partial<Omit<Ctx, 'out'>>; tty?: boolean } = {},
): Promise<Captured & { code: number }> {
  const captured: Captured = { stdout: '', stderr: '' };
  // Never let a test touch the developer's real PeerBand config or a running relay.
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, PEERBAND_CONFIG_HOME: join(tmpdir(), 'peerband-test-no-home'), ...options.env };
  const ctx = createContext({
    env,
    stdout: { write: (text: string) => ((captured.stdout += text), true), isTTY: options.tty ?? false },
    stderr: { write: (text: string) => ((captured.stderr += text), true), isTTY: options.tty ?? false },
    runHerdr: missingHerdr,
    ...options.overrides,
  });
  const code = await run(argv, ctx);
  return { ...captured, code };
}

/** Spawns the built CLI. Herdr is pointed at a missing binary unless the test overrides HERDR_BIN_PATH. */
export function spawnCli(argv: string[], env: NodeJS.ProcessEnv = {}): Promise<Captured & { code: number | null }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [DIST, ...argv], {
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, HERDR_BIN_PATH: join(tmpdir(), 'no-such-herdr'), ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const captured: Captured = { stdout: '', stderr: '' };
    child.stdout.on('data', (chunk) => (captured.stdout += chunk));
    child.stderr.on('data', (chunk) => (captured.stderr += chunk));
    child.once('error', reject);
    child.once('close', (code) => resolvePromise({ ...captured, code }));
  });
}

export interface FakeHerdr {
  run: HerdrRunner;
  calls: string[][];
}

/** Scriptable herdr: `handler` returns a result for a call or undefined for "exit 0, no output". */
export function fakeHerdr(handler: (args: string[]) => Partial<HerdrResult> | undefined): FakeHerdr {
  const calls: string[][] = [];
  return {
    calls,
    run: async (args) => {
      calls.push(args);
      return { code: 0, stdout: '', stderr: '', ...handler(args) };
    },
  };
}

export interface MockRelay {
  url: string;
  server: Server;
  wss: WebSocketServer;
}

/** Local relay that accepts the bearer credential at /connections. */
export async function startMockRelay(onConnection: (ws: import('ws').WebSocket) => void, bearer = 'Bearer installation-secret'): Promise<MockRelay> {
  const server = createServer();
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    if (request.url !== '/connections' || request.headers.authorization !== bearer) return void socket.destroy();
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
  });
  wss.on('connection', onConnection);
  await new Promise<void>((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No listener address');
  cleanups.push(
    () =>
      new Promise<void>((resolvePromise) => {
        for (const client of wss.clients) client.terminate();
        wss.close();
        server.close(() => resolvePromise());
      }),
  );
  return { url: `http://127.0.0.1:${address.port}`, server, wss };
}
