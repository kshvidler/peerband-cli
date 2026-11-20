import { PassThrough } from 'node:stream';
import { createInterface } from 'node:readline';
import type { CoreStream, CoreStreamFactory } from '../../src/runtime-herdr-core/index.js';

/** A terminal record as herdr-core 0.1.21 returns it (only the fields the adapter reads, plus a few others). */
export interface FakeTerminal {
  address: string;
  name?: string | null;
  argv?: string[];
  cwd?: string;
  created_ms?: number;
  pid?: number | null;
  state?: 'live' | 'finished';
  status?: { state: string; app?: string } | null;
  reported?: boolean;
  foreground?: { name: string; cwd: string; pid: number; argv: string[] } | null;
  text?: string;
  read?: { how?: string; why?: string | null; complete?: boolean };
}

type Handler = (params: Record<string, unknown>) => unknown;

/**
 * An in-process herdr-core: line-mode JSON-RPC over a pair of streams, the way `hc connect` carries it.
 * Tests mutate `terminals` and `layout`, push events with `emit`, and inspect `calls`.
 */
export class FakeCore {
  terminals: FakeTerminal[] = [];
  layout: unknown = null;
  coreId = 'core-1';
  generation = 1;
  seq = 0;
  calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  overrides = new Map<string, Handler>();
  /** Streams that subscribed to events; closing one simulates the core going away. */
  subscribers = new Set<{ output: PassThrough; end(): void }>();
  opened = 0;
  private readonly streams = new Set<() => void>();

  factory: CoreStreamFactory = () => this.open();

  open(): CoreStream {
    this.opened += 1;
    const input = new PassThrough();
    const output = new PassThrough();
    let resolveClosed!: (error: Error | undefined) => void;
    const closed = new Promise<Error | undefined>((resolve) => { resolveClosed = resolve; });
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      if (subscriber) this.subscribers.delete(subscriber);
      this.streams.delete(end);
      output.end();
      resolveClosed(undefined);
    };
    let subscriber: { output: PassThrough; end(): void } | undefined;
    this.streams.add(end);
    createInterface({ input }).on('line', (line) => {
      const request = JSON.parse(line) as { id: number; method: string; params: Record<string, unknown> };
      this.calls.push({ method: request.method, params: request.params });
      void Promise.resolve()
        .then(() => this.handle(request.method, request.params))
        .then(
          (result) => {
            if (result === NO_REPLY) return;
            output.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result })}\n`);
            if (request.method === 'events.subscribe') { subscriber = { output, end }; this.subscribers.add(subscriber); }
          },
          (error: { kind?: string; message?: string }) => output.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32000, message: error.message ?? 'error', data: { kind: error.kind ?? 'error' } } })}\n`),
        );
    });
    return { input, output, closed, close: end };
  }

  emit(type: string, terminal: string | undefined, data: unknown, extra: Record<string, unknown> = {}): void {
    this.seq += 1;
    const line = `${JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { seq: this.seq, type, ...(terminal ? { terminal } : {}), data, ...extra } })}\n`;
    for (const subscriber of this.subscribers) subscriber.output.write(line);
  }

  /** Ends every event stream, as a core restart does. */
  dropSubscribers(): void {
    for (const subscriber of [...this.subscribers]) subscriber.end();
  }

  /** Ends every connection, requests and event streams alike, as a crashed core does. */
  dropAll(): void {
    for (const end of [...this.streams]) end();
  }

  find(terminal: unknown): FakeTerminal {
    const found = this.terminals.find((item) => item.address === terminal || item.name === terminal);
    if (!found) throw { kind: 'not_found', message: `no terminal ${String(terminal)}` };
    return found;
  }

  private handle(method: string, params: Record<string, unknown>): unknown {
    const override = this.overrides.get(method);
    if (override) return override(params);
    switch (method) {
      case 'hello': return { generation: this.generation, version: '0.1.21', framed: false, core: { id: this.coreId, name: 'fake' }, features: ['events', 'status'], methods: ['hello', 'server.status', 'terminal.list', 'terminal.get', 'terminal.read', 'terminal.send', 'events.subscribe', 'doc.get'] };
      case 'server.status': return { core: { id: this.coreId, name: 'fake' }, version: '0.1.21' };
      case 'terminal.list': return { terminals: this.terminals.filter((t) => (t.state ?? 'live') === 'live').map(record), hidden_finished: 0, machines: [] };
      case 'terminal.get': return record(this.find(params.terminal));
      case 'terminal.read': {
        const terminal = this.find(params.terminal);
        return { text: terminal.text ?? '', complete: terminal.read?.complete ?? true, how: terminal.read?.how ?? 'history', why: terminal.read?.why ?? null };
      }
      case 'terminal.send': {
        const terminal = this.find(params.terminal);
        if (terminal.status?.state === 'blocked') throw { kind: 'blocked', message: 'blocked' };
        terminal.text = `${terminal.text ?? ''}\n${String(params.text)}`;
        return { started: true, status: terminal.status?.state ?? null, turn: 1 };
      }
      case 'doc.get': return params.name === 'herdr-app' && this.layout !== null ? { value: this.layout, version: 3 } : { value: null, version: 0 };
      case 'events.subscribe': return { channel: null, seq: this.seq, terminals: this.terminals.map(record) };
      default: throw { kind: 'invalid_params', message: `unknown method ${method}` };
    }
  }
}

export const NO_REPLY = Symbol('no reply');

function record(terminal: FakeTerminal): Record<string, unknown> {
  const rest: Partial<FakeTerminal> = { ...terminal };
  delete rest.text;
  delete rest.read;
  return { state: 'live', created_ms: 1000, pid: 4242, argv: ['claude'], cwd: '/work/app', labels: {}, reported: Boolean(terminal.status), ...rest };
}
