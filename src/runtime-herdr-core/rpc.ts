import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { PassThrough, type Readable, type Writable } from 'node:stream';
import { ConnectError } from '../core/index.js';

/**
 * herdr-core speaks JSON-RPC 2.0, one message per line. `hc connect` carries that protocol over stdin and
 * stdout to whichever core the `hc` binary would use (its config, HC_SOCKET, the per-user named pipe on
 * Windows), so PeerBand never computes socket or pipe names itself.
 */
export interface CoreStream {
  input: Writable;
  output: Readable;
  /** Resolves once the stream is gone; the error says why when it never opened. */
  closed: Promise<Error | undefined>;
  close(): void;
}

export type CoreStreamFactory = () => CoreStream;

/** A JSON-RPC error from core: `kind` is its stable error kind (not_found, blocked, unavailable, ...). */
export class CoreRpcError extends Error {
  constructor(readonly kind: string, message: string, readonly hint?: string) {
    super(message);
    this.name = 'CoreRpcError';
  }
}

export interface CoreNotification { method: string; params: Record<string, unknown> }

const MAX_LINE_BYTES = 8 * 1024 * 1024;

/** The `hc` binary: explicit setting, then $HC_BIN, then PATH, then the installer's default location. */
export function resolveCoreBinary(explicit?: string, env: NodeJS.ProcessEnv = process.env): string {
  if (explicit) return explicit;
  if (env.HC_BIN) return env.HC_BIN;
  const fallback = process.platform === 'win32'
    ? join(env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Programs', 'herdr-core', 'hc.exe')
    : join(homedir(), '.local', 'bin', 'hc');
  const onPath = (env.PATH ?? env.Path ?? '').split(process.platform === 'win32' ? ';' : ':').some((dir) => dir && (existsSync(join(dir, 'hc')) || existsSync(join(dir, 'hc.exe'))));
  return !onPath && existsSync(fallback) ? fallback : 'hc';
}

/** Spawns `hc connect`. Its stderr is discarded: it can name local paths, and the relay logs metadata only. */
export function spawnCoreStream(binary: string): CoreStreamFactory {
  return () => {
    const child = spawn(binary, ['connect'], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true, shell: false });
    const closed = new Promise<Error | undefined>((resolve) => {
      child.once('error', (error) => resolve(error));
      child.once('exit', () => resolve(undefined));
    });
    child.stdin.on('error', () => undefined);
    return { input: child.stdin, output: child.stdout, closed, close: () => { child.kill(); } };
  };
}

/**
 * One line-mode connection. Requests are correlated by id; anything without an id is a notification
 * (events, heartbeats). A connection that closes fails its pending requests; the owner opens a new one.
 */
export class CoreConnection {
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(error: unknown): void; timer: NodeJS.Timeout; method: string }>();
  private nextId = 1;
  private open = true;
  readonly done: Promise<void>;

  constructor(private readonly stream: CoreStream, private readonly onNotification?: (message: CoreNotification) => void) {
    const lines = createInterface({ input: stream.output, crlfDelay: Infinity });
    lines.on('line', (line) => this.receive(line));
    this.done = stream.closed.then((error) => {
      this.open = false;
      lines.close();
      // A ConnectError means the stream never reached a core (attachOnlyStream), so nothing was delivered either.
      const never = error instanceof ConnectError;
      const reason = never ? error : error && (error as NodeJS.ErrnoException).code === 'ENOENT'
        ? new ConnectError('runtime_unavailable', 'herdr-core (hc) was not found.', 'Install herdr-core (https://github.com/herdrdev/herdr-core) or set herdrCore.binary in connector.json.')
        : new ConnectError('runtime_unavailable', 'The herdr-core connection closed.', 'Check that herdr-core is running (`hc server status`), then retry.');
      this.closeReason = reason;
      for (const [id, request] of this.pending) {
        clearTimeout(request.timer);
        this.pending.delete(id);
        request.reject(request.method === 'terminal.send' && !never
          ? new ConnectError('delivery_unknown', 'herdr-core closed before confirming the message.', 'Read the agent output before deciding whether to send it again.')
          : reason);
      }
    });
  }

  closeReason?: ConnectError;
  get isOpen(): boolean { return this.open; }

  request(method: string, params: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    if (!this.open) return Promise.reject(this.closeReason ?? new ConnectError('runtime_unavailable', 'The herdr-core connection is closed.', 'Retry once herdr-core is running.'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.delete(id)) return;
        reject(method === 'terminal.send'
          ? new ConnectError('delivery_unknown', 'herdr-core did not confirm the message in time.', 'Read the agent output before deciding whether to send it again.')
          : new ConnectError('timeout', `herdr-core ${method} timed out.`, 'Check that herdr-core is responsive and retry.'));
      }, timeoutMs);
      timer.unref?.();
      this.pending.set(id, { resolve, reject, timer, method });
      this.stream.input.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  close(): void {
    this.stream.close();
  }

  private receive(line: string): void {
    if (!line.trim()) return;
    if (Buffer.byteLength(line, 'utf8') > MAX_LINE_BYTES) { this.close(); return; }
    let message: Record<string, unknown>;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
      message = parsed as Record<string, unknown>;
    } catch { return; }
    if (typeof message.id === 'number') {
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error && typeof message.error === 'object') {
        const error = message.error as { message?: unknown; data?: { kind?: unknown; hint?: unknown } };
        request.reject(new CoreRpcError(
          typeof error.data?.kind === 'string' ? error.data.kind : 'error',
          typeof error.message === 'string' ? error.message : 'herdr-core error',
          typeof error.data?.hint === 'string' ? error.data.hint : undefined,
        ));
      } else request.resolve(message.result);
      return;
    }
    if (typeof message.method === 'string' && this.onNotification) {
      const params = message.params && typeof message.params === 'object' && !Array.isArray(message.params) ? message.params as Record<string, unknown> : {};
      this.onNotification({ method: message.method, params });
    }
  }
}

/** Request client over one reused connection, reopened on demand after core restarts or the child exits. */
export class CoreRpcClient {
  private connection?: CoreConnection;
  private closed = false;

  constructor(private readonly factory: CoreStreamFactory, private readonly timeoutMs = 10_000) {}

  async request(method: string, params: Record<string, unknown> = {}, timeoutMs = this.timeoutMs): Promise<unknown> {
    if (this.closed) throw new ConnectError('runtime_unavailable', 'The herdr-core client is closed.', 'Restart the relay.');
    if (!this.connection?.isOpen) this.connection = new CoreConnection(this.factory());
    return this.connection.request(method, params, timeoutMs);
  }

  async close(): Promise<void> {
    this.closed = true;
    const connection = this.connection;
    this.connection = undefined;
    if (connection?.isOpen) { connection.close(); await connection.done; }
  }
}

/** The `hc` binary when one is installed (explicit setting, $HC_BIN, PATH or the installer's location), else undefined. */
export function findCoreBinary(explicit?: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (explicit) return explicit;
  if (env.HC_BIN) return env.HC_BIN;
  const binary = resolveCoreBinary(undefined, env);
  if (binary !== 'hc') return binary;
  const onPath = (env.PATH ?? env.Path ?? '').split(process.platform === 'win32' ? ';' : ':').some((dir) => dir && (existsSync(join(dir, 'hc')) || existsSync(join(dir, 'hc.exe'))));
  return onPath ? 'hc' : undefined;
}

/** True when a core is already running. `hc server status` only asks; unlike `hc connect` it never starts one. */
export function coreRunning(binary: string, timeoutMs = 5_000): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(binary, ['server', 'status', '--json'], { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) return resolve(false);
      try {
        const status = JSON.parse(String(stdout)) as { error?: unknown; core?: unknown };
        resolve(!status.error && typeof status.core === 'object' && status.core !== null);
      } catch {
        resolve(false);
      }
    });
  });
}

/**
 * Like spawnCoreStream, but only connects to a core that is already running: `hc connect` would start one, and a
 * relay that serves Herdr as well must not start herdr-core on every machine that merely has it installed.
 * Without a running core the stream closes at once with runtime_unavailable.
 */
export function attachOnlyStream(binary: string, running: (binary: string) => Promise<boolean> = coreRunning, spawnStream: CoreStreamFactory = spawnCoreStream(binary)): CoreStreamFactory {
  return () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let inner: CoreStream | undefined;
    let done = false;
    let finish!: (error: Error | undefined) => void;
    const closed = new Promise<Error | undefined>((resolve) => {
      finish = (error) => {
        if (done) return;
        done = true;
        output.end();
        resolve(error);
      };
    });
    void running(binary).then((up) => {
      if (done) return;
      if (!up) return finish(new ConnectError('runtime_unavailable', 'herdr-core is not running.', 'Open the Herdr desktop app or run `hc server start`.'));
      inner = spawnStream();
      input.pipe(inner.input);
      inner.output.on('data', (chunk: Buffer) => output.write(chunk));
      void inner.closed.then(finish);
    }, () => finish(new ConnectError('runtime_unavailable', 'herdr-core is not running.', 'Open the Herdr desktop app or run `hc server start`.')));
    return { input, output, closed, close: () => { if (inner) inner.close(); else finish(undefined); } };
  };
}
