import { readFile } from 'node:fs/promises';
import { ConfigError } from './config.js';

export interface HerdrConnectorSettings {
  socketPath?: string;
  schemaPath?: string;
  binary?: string;
  machineId?: string;
  timeoutMs?: number;
}

export interface ConnectorConfig {
  allowedAgents?: string[];
  allowedWorkspaces?: string[];
  stateDirectory?: string;
  herdr?: HerdrConnectorSettings;
  enableWrites?: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function rejectUnknown(record: Record<string, unknown>, allowed: string[], where: string): void {
  const unknown = Object.keys(record).find((key) => !allowed.includes(key));
  if (unknown) throw new ConfigError(`${where}: unknown field "${unknown}".`, `Allowed fields: ${allowed.join(', ')}.`);
}

function stringField(record: Record<string, unknown>, key: string, where: string, max: number): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value || value.length > max) throw new ConfigError(`${where}.${key} must be a non-empty string.`);
  return value;
}

function stringList(record: Record<string, unknown>, key: string, where: string): string[] | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 1_000 || value.some((item) => typeof item !== 'string' || !item)) {
    throw new ConfigError(`${where}.${key} must be an array of up to 1000 non-empty strings.`);
  }
  return value as string[];
}

/** Validates a parsed connector.json value. Throws ConfigError on any problem. */
export function parseConnectorConfig(value: unknown, source = 'connector config'): ConnectorConfig {
  if (!isRecord(value)) throw new ConfigError(`${source}: expected a JSON object.`);
  rejectUnknown(value, ['allowedAgents', 'allowedWorkspaces', 'stateDirectory', 'herdr', 'enableWrites'], source);
  const config: ConnectorConfig = {};
  const agents = stringList(value, 'allowedAgents', source);
  if (agents) config.allowedAgents = agents;
  const workspaces = stringList(value, 'allowedWorkspaces', source);
  if (workspaces) config.allowedWorkspaces = workspaces;
  const directory = stringField(value, 'stateDirectory', source, 4_000);
  if (directory) config.stateDirectory = directory;
  if (value.enableWrites !== undefined) {
    if (typeof value.enableWrites !== 'boolean') throw new ConfigError(`${source}.enableWrites must be true or false.`);
    config.enableWrites = value.enableWrites;
  }
  if (value.herdr !== undefined) {
    const raw = value.herdr;
    if (!isRecord(raw)) throw new ConfigError(`${source}.herdr must be an object.`);
    rejectUnknown(raw, ['socketPath', 'schemaPath', 'binary', 'machineId', 'timeoutMs'], `${source}.herdr`);
    const herdr: HerdrConnectorSettings = {};
    for (const key of ['socketPath', 'schemaPath', 'binary', 'machineId'] as const) {
      const text = stringField(raw, key, `${source}.herdr`, 4_000);
      if (text) herdr[key] = text;
    }
    if (raw.timeoutMs !== undefined) {
      if (typeof raw.timeoutMs !== 'number' || !Number.isInteger(raw.timeoutMs) || raw.timeoutMs < 100 || raw.timeoutMs > 120_000) {
        throw new ConfigError(`${source}.herdr.timeoutMs must be an integer from 100 to 120000.`);
      }
      herdr.timeoutMs = raw.timeoutMs;
    }
    config.herdr = herdr;
  }
  return config;
}

/** Loads connector.json. A missing file yields `{}` only when `optional` (the default config path). */
export async function loadConnectorConfig(path: string, options: { optional?: boolean } = {}): Promise<ConnectorConfig> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (options.optional && (error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new ConfigError(`Cannot read connector config ${path}: ${(error as Error).message}`, 'Check the --config path, or omit the option to use defaults.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new ConfigError(`Connector config ${path} is not valid JSON: ${(error as Error).message}`, 'Fix the syntax or delete the file.');
  }
  return parseConnectorConfig(parsed, path);
}
