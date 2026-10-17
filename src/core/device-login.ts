import type { RemoteCredentials } from './config.js';
import { enrollmentBase } from './relay-client.js';

/** What the server returns from `POST /api/device/code`. `deviceCode` is a secret: never print or log it. */
export interface DeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
}

export interface DeviceCodeRequest {
  clientVersion: string;
  machineName?: string;
  platform?: string;
}

export type DeviceLoginFailure =
  | 'unsupported' // the server has no device-login endpoint
  | 'denied' // the user pressed Deny
  | 'expired' // server said expired_token, or the local deadline passed
  | 'invalid_grant' // unknown or already used device code
  | 'rejected' // some other 4xx
  | 'network' // could not reach the server
  | 'aborted'; // cancelled locally (Ctrl+C)

export class DeviceLoginError extends Error {
  constructor(
    readonly kind: DeviceLoginFailure,
    message: string,
  ) {
    super(message);
    this.name = 'DeviceLoginError';
  }
}

export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;

export interface DeviceLoginOptions {
  fetch?: typeof fetch;
  signal?: AbortSignal;
  /** Resolves after `ms`, or early when `signal` aborts. */
  sleep?: Sleep;
  /** Milliseconds clock. */
  now?: () => number;
}

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_BACKOFF_MS = 30_000;
const SLOW_DOWN_STEP_S = 5;

export const defaultSleep: Sleep = (ms, signal) =>
  new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });

function requestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function postJson(
  url: URL,
  body: unknown,
  options: DeviceLoginOptions,
): Promise<{ status: number; body: Record<string, unknown>; retryAfter?: number }> {
  const fetcher = options.fetch ?? fetch;
  const response = await fetcher(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: requestSignal(options.signal),
  });
  const parsed = (await response.json().catch(() => ({}))) as unknown;
  const retry = Number(response.headers.get('retry-after'));
  return {
    status: response.status,
    body: parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {},
    ...(Number.isFinite(retry) && retry > 0 ? { retryAfter: retry } : {}),
  };
}

const text = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined);
const positive = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;

/** Starts a device authorization. Throws DeviceLoginError('unsupported') when the server predates browser sign-in. */
export async function requestDeviceCode(serverUrl: string, request: DeviceCodeRequest, options: DeviceLoginOptions = {}): Promise<DeviceCode> {
  const base = enrollmentBase(serverUrl);
  let result;
  try {
    result = await postJson(
      new URL('/api/device/code', base),
      {
        client: 'peerband-cli',
        client_version: request.clientVersion.slice(0, 40),
        ...(request.machineName ? { machine_name: request.machineName.slice(0, 120) } : {}),
        ...(request.platform ? { platform: request.platform.slice(0, 40) } : {}),
      },
      options,
    );
  } catch (error) {
    if (options.signal?.aborted) throw new DeviceLoginError('aborted', 'Login cancelled.');
    throw new DeviceLoginError('network', `Could not reach ${base.origin}: ${(error as Error).message}`);
  }
  if (result.status === 404 || result.status === 405) {
    throw new DeviceLoginError('unsupported', "This server doesn't support browser sign-in yet.");
  }
  const { body } = result;
  const deviceCode = text(body.device_code);
  const userCode = text(body.user_code);
  const verificationUri = text(body.verification_uri);
  if (result.status !== 200 || !deviceCode || !userCode || !verificationUri) {
    const detail = text(body.error_description) ?? text(body.detail) ?? `HTTP ${result.status}`;
    throw new DeviceLoginError('rejected', `The server refused the sign-in request: ${detail}`);
  }
  return {
    deviceCode,
    userCode,
    verificationUri,
    verificationUriComplete: text(body.verification_uri_complete) ?? verificationUri,
    expiresIn: positive(body.expires_in, 600),
    interval: positive(body.interval, 5),
  };
}

/** Polls `POST /api/device/token` until the browser approves, denies, or the code expires. */
export async function pollDeviceToken(serverUrl: string, code: DeviceCode, options: DeviceLoginOptions = {}): Promise<RemoteCredentials> {
  const base = enrollmentBase(serverUrl);
  const url = new URL('/api/device/token', base);
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const deadline = now() + code.expiresIn * 1000;
  let interval = code.interval;
  let failures = 0;
  const expired = () => new DeviceLoginError('expired', 'The code expired.');
  const aborted = () => new DeviceLoginError('aborted', 'Login cancelled.');

  for (;;) {
    if (options.signal?.aborted) throw aborted();
    const wait = failures > 0 ? Math.min(MAX_BACKOFF_MS, interval * 1000 * 2 ** failures) : interval * 1000;
    await sleep(wait, options.signal);
    if (options.signal?.aborted) throw aborted();
    if (now() >= deadline) throw expired();

    let result;
    try {
      result = await postJson(url, { device_code: code.deviceCode }, options);
    } catch {
      if (options.signal?.aborted) throw aborted();
      failures = Math.min(failures + 1, 10);
      continue;
    }
    const { status, body } = result;

    if (status === 200) {
      const installationId = text(body.installation_id);
      const credential = text(body.credential);
      if (!installationId || !credential) {
        failures = Math.min(failures + 1, 10);
        continue;
      }
      return {
        serverUrl: base.origin,
        installationId,
        credential,
        ...(text(body.machine_name) ? { machineName: text(body.machine_name)! } : {}),
        ...(text(body.account_email) ? { accountEmail: text(body.account_email)! } : {}),
      };
    }
    if (status >= 500 || (status === 429 && !text(body.error))) {
      failures = Math.min(failures + 1, 10);
      continue;
    }
    failures = 0;
    const error = text(body.error);
    switch (error) {
      case 'authorization_pending':
        continue;
      case 'slow_down':
        interval = Math.max(interval + SLOW_DOWN_STEP_S, positive(body.interval, 0));
        continue;
      case 'access_denied':
        throw new DeviceLoginError('denied', 'Sign-in was denied in the browser.');
      case 'expired_token':
        throw expired();
      case 'invalid_grant':
        throw new DeviceLoginError('invalid_grant', 'The sign-in code is no longer valid.');
      default:
        throw new DeviceLoginError('rejected', `The server rejected the sign-in: ${text(body.error_description) ?? error ?? `HTTP ${status}`}`);
    }
  }
}
