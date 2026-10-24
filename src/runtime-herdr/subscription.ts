import { randomUUID } from 'node:crypto';
import { createConnection, type Socket } from 'node:net';
import { ConnectError } from '../core/index.js';

/** One entry of Herdr's `events.subscribe` params (EventsSubscribeParams.subscriptions). */
export type HerdrSubscription = { type: string; pane_id?: string };

/** A pushed event line after `subscription_started`: `{event, data}`. */
export interface HerdrPushedEvent { event: string; data: Record<string, unknown> }

export interface SubscriptionOptions {
  socketPath: string;
  subscriptions: HerdrSubscription[];
  onEvent: (event: HerdrPushedEvent) => void;
  validateRequest?: (value: unknown) => boolean;
  timeoutMs?: number;
  maxLineBytes?: number;
}

export interface HerdrSubscriptionHandle {
  /** Resolves once Herdr acknowledged with `subscription_started`; rejects with a ConnectError otherwise. */
  started: Promise<void>;
  /** Resolves when the socket is gone (dropped by Herdr or closed by us). */
  closed: Promise<void>;
  close(): void;
}

/**
 * Opens a dedicated, long-lived socket for `events.subscribe`. The request/response client closes its socket
 * after each reply, so events need their own connection. Pushed lines that are not events are ignored.
 */
export function openSubscription(options: SubscriptionOptions): HerdrSubscriptionHandle {
  const id = `sub_${randomUUID()}`;
  const request = { id, method: 'events.subscribe', params: { subscriptions: options.subscriptions } };
  const maxLineBytes = options.maxLineBytes ?? 1024 * 1024;
  let acknowledged = false;
  let resolveStarted!: () => void;
  let rejectStarted!: (error: unknown) => void;
  let resolveClosed!: () => void;
  const started = new Promise<void>((resolve, reject) => { resolveStarted = resolve; rejectStarted = reject; });
  const closed = new Promise<void>((resolve) => { resolveClosed = resolve; });
  void started.catch(() => undefined);
  if (options.validateRequest && !options.validateRequest(request)) {
    rejectStarted(new ConnectError('unsupported_capability', 'This Herdr API schema does not accept the event subscription.', 'Update Herdr to a version with events.subscribe.'));
    resolveClosed();
    return { started, closed, close: () => undefined };
  }
  const socket: Socket = createConnection(options.socketPath);
  const fail = (error: ConnectError) => {
    if (!acknowledged) rejectStarted(error);
    socket.destroy();
  };
  socket.setNoDelay(true);
  const timer = setTimeout(() => fail(new ConnectError('timeout', 'Herdr did not acknowledge the event subscription.', 'Check that Herdr is responsive.')), options.timeoutMs ?? 5_000);
  timer.unref?.();
  let buffer = Buffer.alloc(0);
  socket.once('connect', () => socket.write(`${JSON.stringify(request)}\n`));
  socket.on('error', () => fail(new ConnectError('runtime_unavailable', 'Cannot connect to the Herdr socket for events.', 'Start Herdr and verify its local socket path.')));
  socket.on('close', () => {
    clearTimeout(timer);
    if (!acknowledged) rejectStarted(new ConnectError('runtime_unavailable', 'Herdr closed the event socket before subscribing.', 'Start Herdr and verify its local socket path.'));
    resolveClosed();
  });
  socket.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    let newline: number;
    while ((newline = buffer.indexOf(0x0a)) >= 0) {
      const line = buffer.subarray(0, newline);
      buffer = buffer.subarray(newline + 1);
      if (line.length === 0) continue;
      if (line.length > maxLineBytes) { fail(protocolError('Herdr event line exceeded the size limit')); return; }
      let value: unknown;
      try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line)); }
      catch { fail(protocolError('Herdr sent malformed JSON on the event socket')); return; }
      if (!isRecord(value)) continue;
      if (value.id === id) {
        if (isRecord(value.error)) {
          const code = typeof value.error.code === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(value.error.code) ? value.error.code : 'runtime_error';
          fail(new ConnectError(code, `Herdr rejected events.subscribe (${code}).`, 'Update Herdr to a version with event subscriptions.'));
          return;
        }
        if (isRecord(value.result) && value.result.type === 'subscription_started') {
          acknowledged = true;
          clearTimeout(timer);
          resolveStarted();
        } else { fail(protocolError('Herdr answered events.subscribe with an unexpected result')); return; }
        continue;
      }
      if (acknowledged && typeof value.event === 'string' && isRecord(value.data)) options.onEvent({ event: value.event, data: value.data });
    }
    if (buffer.length > maxLineBytes) fail(protocolError('Herdr event line exceeded the size limit'));
  });
  return { started, closed, close: () => { socket.destroy(); } };
}

function protocolError(message: string): ConnectError {
  return new ConnectError('protocol_error', message, 'Check that the installed Herdr version matches its API schema.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
