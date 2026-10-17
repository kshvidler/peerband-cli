import { chmod, mkdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const DEFAULT_SERVER_URL = 'https://peerband.com';

/** Credential record stored in `credentials.json`. */
export interface Credentials {
  serverUrl: string;
  installationId: string;
  credential: string;
  machineName?: string;
  accountEmail?: string;
  enrolledAt?: string;
}
/** Alias used by the relay client. */
export type RemoteCredentials = Credentials;

export interface PathEnvironment {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  home?: string;
}

/** Error with a user-facing next step. */
export class ConfigError extends Error {
  readonly hint?: string;
  constructor(message: string, hint?: string) {
    super(message);
    this.name = 'ConfigError';
    this.hint = hint;
  }
}

/** Directory holding all PeerBand client state. Mirrors herdr/paths.mjs. */
export function configHome(options: PathEnvironment = {}): string {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = options.home ?? homedir();
  if (env.PEERBAND_CONFIG_HOME) return env.PEERBAND_CONFIG_HOME;
  if (platform === 'win32') return join(env.APPDATA || join(home, 'AppData', 'Roaming'), 'peerband');
  return join(env.XDG_CONFIG_HOME || join(home, '.config'), 'peerband');
}

export const credentialsPath = (options?: PathEnvironment): string => join(configHome(options), 'credentials.json');
export const lockPath = (options?: PathEnvironment): string => join(configHome(options), 'relay-helper.lock');
export const relayStatePath = (options?: PathEnvironment): string => join(configHome(options), 'relay-state.json');
export const relayTabPath = (options?: PathEnvironment): string => join(configHome(options), 'relay-tab.json');
export const stateDirectory = (options?: PathEnvironment): string => join(configHome(options), 'state');
export const receiptsPath = (options?: PathEnvironment): string => join(stateDirectory(options), 'receipts.json');
export const connectorConfigPath = (options?: PathEnvironment): string => join(configHome(options), 'connector.json');

function isLoopback(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

/** Validates a server URL and returns its origin. Throws ConfigError with a next step. */
export function validateServerUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError(`Invalid server URL: ${value}`, `Use a full URL such as ${DEFAULT_SERVER_URL}.`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ConfigError(`Server URL must use https (got ${url.protocol}//).`, `Use a full URL such as ${DEFAULT_SERVER_URL}.`);
  }
  if (url.username || url.password) {
    throw new ConfigError('Server URL cannot contain credentials.', 'Remove the user:password part of the URL.');
  }
  if (url.protocol === 'http:' && !isLoopback(url.hostname)) {
    throw new ConfigError('Server URL must use https unless it points at localhost.', 'Use an https:// URL, or http://localhost for local development.');
  }
  return url.origin;
}

/**
 * The MCP endpoint users add to their MCP client for a given server.
 * PEERBAND_MCP_URL overrides it. The hosted service uses its dedicated mcp.
 * host; any other server (self-hosted, local development) serves /mcp on its
 * own origin.
 */
export function mcpUrlFor(serverUrl: string, env: NodeJS.ProcessEnv = process.env): string {
  if (env.PEERBAND_MCP_URL) {
    const origin = validateServerUrl(env.PEERBAND_MCP_URL);
    const path = new URL(env.PEERBAND_MCP_URL).pathname.replace(/\/$/, '');
    return `${origin}${path || '/mcp'}`;
  }
  const origin = validateServerUrl(serverUrl);
  const host = new URL(origin).hostname;
  if (host === 'peerband.com' || host === 'www.peerband.com') return 'https://mcp.peerband.com/mcp';
  return `${origin}/mcp`;
}

/** `--server` value, else PEERBAND_SERVER, else the default. Returns a validated origin. */
export function resolveServerUrl(explicit?: string, env: NodeJS.ProcessEnv = process.env): string {
  return validateServerUrl(explicit || env.PEERBAND_SERVER || DEFAULT_SERVER_URL);
}

export async function saveCredentials(credentials: Credentials, path = credentialsPath()): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') await chmod(directory, 0o700);
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  try {
    await chmod(temporary, 0o600);
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

const LOGIN_HINT = 'Run `peerband login` to connect this machine to your PeerBand account.';

export async function loadCredentials(path = credentialsPath()): Promise<Credentials> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new ConfigError('Not logged in.', LOGIN_HINT);
    throw new ConfigError(`Unable to read credentials at ${path}: ${(error as Error).message}`, LOGIN_HINT);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ConfigError(`Credentials file ${path} is not valid JSON.`, `${LOGIN_HINT} This replaces the damaged file.`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConfigError(`Credentials file ${path} is invalid.`, LOGIN_HINT);
  }
  const record = value as Record<string, unknown>;
  if (typeof record.serverUrl !== 'string' || typeof record.installationId !== 'string' || typeof record.credential !== 'string') {
    throw new ConfigError(`Credentials file ${path} is missing required fields.`, LOGIN_HINT);
  }
  const optional = (key: 'machineName' | 'accountEmail' | 'enrolledAt') =>
    typeof record[key] === 'string' && record[key] ? { [key]: record[key] as string } : {};
  return {
    serverUrl: record.serverUrl,
    installationId: record.installationId,
    credential: record.credential,
    ...optional('machineName'),
    ...optional('accountEmail'),
    ...optional('enrolledAt'),
  };
}

/** Returns false when there was nothing to delete. */
export async function deleteCredentials(path = credentialsPath()): Promise<boolean> {
  try {
    await rm(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
