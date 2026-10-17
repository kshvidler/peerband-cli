import { randomUUID } from 'node:crypto';
import { createConnection, type Socket } from 'node:net';
import { ConnectError } from '../core/index.js';

export interface SocketClientOptions {
  socketPath: string;
  timeoutMs?: number;
  maxLineBytes?: number;
  maxPending?: number;
  validateSuccessResponse?: (value: unknown) => boolean;
  validateErrorResponse?: (value: unknown) => boolean;
  validateRequest?: (value: unknown) => boolean;
  schemaDiagnostics?: () => string;
}

export interface HerdrError { code: string; message: string }

export class HerdrSocketClient {
  readonly socketPath: string;
  private readonly timeoutMs: number;
  private readonly maxLineBytes: number;
  private readonly maxPending: number;
  private readonly validateSuccessResponse?: (value: unknown) => boolean;
  private readonly validateErrorResponse?: (value: unknown) => boolean;
  private readonly validateRequest?: (value: unknown) => boolean;
  private readonly schemaDiagnostics?: () => string;
  private readonly sockets = new Set<Socket>();
  private readonly buffers = new WeakMap<Socket, Buffer>();
  private readonly pending = new Map<string, { resolve(value: unknown): void; reject(error: unknown): void; timer: NodeJS.Timeout; method: string; socket: Socket }>();
  private closed = false;
  private epoch = 0;
  private inflight = 0;

  constructor(options: SocketClientOptions) {
    this.socketPath = options.socketPath;
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.maxLineBytes = options.maxLineBytes ?? 2 * 1024 * 1024;
    this.maxPending = options.maxPending ?? 32;
    this.validateSuccessResponse = options.validateSuccessResponse;
    this.validateErrorResponse = options.validateErrorResponse;
    this.validateRequest = options.validateRequest;
    this.schemaDiagnostics = options.schemaDiagnostics;
  }

  get connectionEpoch(): number { return this.epoch; }

  async request(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (this.closed) throw this.unavailable('Herdr socket client is closed');
    if (this.inflight >= this.maxPending) throw this.unavailable('Too many Herdr requests are in flight');
    const id = randomUUID();
    const request = { id, method, params };
    if (this.validateRequest && !this.validateRequest(request)) throw new ConnectError('schema_mismatch', `Herdr request does not match the selected API schema (${this.schemaDiagnostics?.() ?? 'schema validation failed'})`, 'Use an adapter and schema version compatible with the installed Herdr binary.');
    const line = Buffer.from(`${JSON.stringify(request)}\n`, 'utf8');
    if (line.length > this.maxLineBytes) throw this.unavailable('Herdr request exceeds the configured size limit');
    this.inflight += 1;
    let socket: Socket;
    try { socket = await this.connect(); }
    catch (error) { this.inflight -= 1; throw error; }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.inflight -= 1;
        socket.end();
        reject(method === 'agent.prompt'
          ? new ConnectError('delivery_unknown', 'Herdr did not acknowledge the prompt before the request timed out.', 'Check the agent status before deciding whether to send the prompt again.')
          : new ConnectError('timeout', `Herdr ${method} request timed out`, 'Check that Herdr is responsive and retry the read.'));
      }, this.timeoutMs);
      timer.unref?.();
      this.pending.set(id, { resolve, reject, timer, method, socket });
      socket.write(line, (error) => {
        if (!error) return;
        const pending = this.pending.get(id);
        if (pending) {
          this.pending.delete(id);
          clearTimeout(timer);
          this.inflight -= 1;
          reject(this.mapTransportError(method));
        }
      });
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    this.failAll(this.unavailable('Herdr socket client closed'));
    await Promise.all([...this.sockets].map((socket) => new Promise<void>((resolve) => {
      if (socket.destroyed) resolve();
      else socket.end(resolve);
    })));
  }

  private connect(): Promise<Socket> {
    return new Promise<Socket>((resolve, reject) => {
      const socket = createConnection(this.socketPath);
      const onError = (): void => {
        socket.destroy();
        this.sockets.delete(socket);
        reject(this.unavailable('Cannot connect to the Herdr socket. Verify Herdr is running and the socket path is correct.'));
      };
      socket.setNoDelay(true);
      socket.once('error', onError);
      socket.once('connect', () => {
        socket.removeListener('error', onError);
        this.sockets.add(socket);
        this.buffers.set(socket, Buffer.alloc(0));
        this.epoch += 1;
        socket.on('data', (chunk: Buffer) => this.onData(socket, chunk));
        socket.on('error', () => this.failSocket(socket, this.unavailable('Herdr socket failed. Check that Herdr is running.')));
        socket.on('close', () => {
          this.sockets.delete(socket);
          this.buffers.delete(socket);
          this.failSocket(socket, this.unavailable('Herdr closed the socket before replying'));
        });
        resolve(socket);
      });
    });
  }

  private onData(socket: Socket, chunk: Buffer): void {
    let buffer = Buffer.concat([this.buffers.get(socket) ?? Buffer.alloc(0), chunk]);
    this.buffers.set(socket, buffer);
    if (buffer.length > this.maxLineBytes && !buffer.includes(0x0a)) {
      this.protocolFailure(socket, 'Herdr response line exceeded the configured size limit');
      return;
    }
    let newline: number;
    while ((newline = buffer.indexOf(0x0a)) >= 0) {
      if (newline > this.maxLineBytes) { this.protocolFailure(socket, 'Herdr response line exceeded the configured size limit'); return; }
      const line = buffer.subarray(0, newline);
      buffer = buffer.subarray(newline + 1);
      this.buffers.set(socket, buffer);
      if (line.length === 0) continue;
      let response: unknown;
      try { response = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line)); }
      catch { this.protocolFailure(socket, 'Herdr returned malformed JSON'); return; }
      if (!response || typeof response !== 'object' || Array.isArray(response)) { this.protocolFailure(socket, 'Herdr returned a response that is not an object'); return; }
      const record = response as Record<string, unknown>;
      if (typeof record.id !== 'string') { this.protocolFailure(socket, 'Herdr response has no request id'); return; }
      const pending = this.pending.get(record.id);
      if (!pending) continue;
      this.pending.delete(record.id);
      clearTimeout(pending.timer);
      this.inflight -= 1;
      if ('error' in record) {
        if (this.validateErrorResponse && !this.validateErrorResponse(record)) {
          pending.reject(new ConnectError('schema_mismatch', `Herdr error response did not match the selected API schema (${this.schemaDiagnostics?.() ?? 'schema validation failed'})`, 'Use the API schema shipped with the connected Herdr version.'));
          socket.end();
          continue;
        }
        const error = record.error;
        if (!error || typeof error !== 'object' || typeof (error as HerdrError).code !== 'string' || typeof (error as HerdrError).message !== 'string') {
          pending.reject(new ConnectError('protocol_error', 'Herdr returned a malformed error response', 'Check that the installed Herdr version matches its API schema.'));
        } else {
          const herdrError = error as HerdrError;
          const rawCode = herdrError.code === 'not_found' ? 'agent_not_found' : herdrError.code;
          const code = /^[a-z][a-z0-9_]{0,63}$/.test(rawCode) ? rawCode : 'runtime_error';
          pending.reject(new ConnectError(code, `Herdr rejected ${pending.method} (${code}).`, 'Refresh the agent list and check the Herdr session state.'));
        }
      } else if ('result' in record) {
        if (this.validateSuccessResponse && !this.validateSuccessResponse(record)) {
          pending.reject(new ConnectError('schema_mismatch', `Herdr response did not match the selected API schema (${this.schemaDiagnostics?.() ?? 'schema validation failed'})`, 'Use the API schema shipped with the connected Herdr version.'));
        } else pending.resolve(record.result);
      }
      else pending.reject(new ConnectError('protocol_error', 'Herdr response has neither result nor error', 'Check Herdr compatibility and its API schema.'));
      socket.end();
    }
  }

  private protocolFailure(socket: Socket, message: string): void {
    this.failSocket(socket, new ConnectError('protocol_error', message, 'Check that the installed Herdr version matches the selected API schema.'));
    socket.destroy();
  }

  private failSocket(socket: Socket, error: Error): void {
    for (const [id, item] of this.pending) {
      if (item.socket !== socket) continue;
      this.pending.delete(id);
      clearTimeout(item.timer);
      this.inflight -= 1;
      item.reject(item.method === 'agent.prompt' ? new ConnectError('delivery_unknown', 'Herdr connection ended after the prompt may have been sent', 'Check the agent status before deciding whether to send the prompt again.') : error);
    }
  }

  private failAll(error: Error): void {
    for (const [id, item] of this.pending) {
      this.pending.delete(id);
      clearTimeout(item.timer);
      item.reject(item.method === 'agent.prompt' ? new ConnectError('delivery_unknown', 'Herdr connection ended after the prompt may have been sent', 'Check the agent status before deciding whether to send the prompt again.') : error);
    }
  }

  private mapTransportError(method: string): Error {
    return method === 'agent.prompt'
      ? new ConnectError('delivery_unknown', 'Herdr connection failed after the prompt may have been sent', 'Check the agent status before deciding whether to send the prompt again.')
      : this.unavailable('Herdr socket write failed. Check that Herdr is running.');
  }

  private unavailable(message: string): ConnectError {
    return new ConnectError('runtime_unavailable', message, 'Start Herdr and verify its local socket path.');
  }
}
