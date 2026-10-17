import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ConfigError,
  configHome,
  connectorConfigPath,
  credentialsPath,
  deleteCredentials,
  loadConnectorConfig,
  loadCredentials,
  lockPath,
  parseConnectorConfig,
  receiptsPath,
  relayStatePath,
  relayTabPath,
  mcpUrlFor,
  resolveServerUrl,
  saveCredentials,
  validateServerUrl,
} from '../src/core/index.js';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
const temp = async () => { const dir = await mkdtemp(join(tmpdir(), 'peerband-config-')); dirs.push(dir); return dir; };

describe('config paths', () => {
  it('uses APPDATA on Windows with a home fallback', () => {
    expect(configHome({ platform: 'win32', env: { APPDATA: 'C:\\Users\\a\\AppData\\Roaming' }, home: 'C:\\Users\\a' })).toBe(join('C:\\Users\\a\\AppData\\Roaming', 'peerband'));
    expect(configHome({ platform: 'win32', env: {}, home: '/h' })).toBe(join('/h', 'AppData', 'Roaming', 'peerband'));
  });
  it('uses XDG_CONFIG_HOME or ~/.config on POSIX', () => {
    expect(configHome({ platform: 'linux', env: { XDG_CONFIG_HOME: '/x' }, home: '/h' })).toBe(join('/x', 'peerband'));
    expect(configHome({ platform: 'darwin', env: {}, home: '/h' })).toBe(join('/h', '.config', 'peerband'));
  });
  it('PEERBAND_CONFIG_HOME overrides every platform', () => {
    for (const platform of ['win32', 'linux', 'darwin'] as const) {
      expect(configHome({ platform, env: { PEERBAND_CONFIG_HOME: '/custom', APPDATA: '/a', XDG_CONFIG_HOME: '/x' }, home: '/h' })).toBe('/custom');
    }
  });
  it('places state files under the config home', () => {
    const o = { platform: 'linux' as const, env: { PEERBAND_CONFIG_HOME: '/c' }, home: '/h' };
    expect(credentialsPath(o)).toBe(join('/c', 'credentials.json'));
    expect(lockPath(o)).toBe(join('/c', 'relay-helper.lock'));
    expect(relayStatePath(o)).toBe(join('/c', 'relay-state.json'));
    expect(relayTabPath(o)).toBe(join('/c', 'relay-tab.json'));
    expect(receiptsPath(o)).toBe(join('/c', 'state', 'receipts.json'));
    expect(connectorConfigPath(o)).toBe(join('/c', 'connector.json'));
  });
});

describe('credentials', () => {
  it('round-trips, replaces atomically, and is private on POSIX', async () => {
    const path = join(await temp(), 'nested', 'credentials.json');
    const record = { serverUrl: 'https://peerband.com', installationId: 'i-1', credential: 'secret', machineName: 'box', accountEmail: 'a@b.test', enrolledAt: '2026-01-01T00:00:00Z' };
    await saveCredentials(record, path);
    expect(await loadCredentials(path)).toEqual(record);
    await saveCredentials({ ...record, credential: 'second' }, path);
    expect((await loadCredentials(path)).credential).toBe('second');
    if (process.platform !== 'win32') {
      expect((await stat(path)).mode & 0o777).toBe(0o600);
      expect((await stat(join(path, '..'))).mode & 0o777).toBe(0o700);
    }
  });
  it('reports a missing file as not logged in with a login hint', async () => {
    const error = await loadCredentials(join(await temp(), 'none.json')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).hint).toContain('peerband login');
  });
  it('rejects malformed files with an actionable error', async () => {
    const dir = await temp();
    const path = join(dir, 'credentials.json');
    await writeFile(path, '{not json');
    await expect(loadCredentials(path)).rejects.toThrow('not valid JSON');
    await writeFile(path, JSON.stringify({ serverUrl: 'https://x.test' }));
    await expect(loadCredentials(path)).rejects.toThrow('missing required fields');
  });
  it('deletes credentials and reports when none existed', async () => {
    const path = join(await temp(), 'credentials.json');
    await saveCredentials({ serverUrl: 'https://x.test', installationId: 'i', credential: 'c' }, path);
    expect(await deleteCredentials(path)).toBe(true);
    expect(await deleteCredentials(path)).toBe(false);
    await expect(readFile(path)).rejects.toThrow();
  });
});

describe('MCP URL', () => {
  it('uses the dedicated mcp host for the hosted service', () => {
    expect(mcpUrlFor('https://peerband.com', {})).toBe('https://mcp.peerband.com/mcp');
    expect(mcpUrlFor('https://www.peerband.com', {})).toBe('https://mcp.peerband.com/mcp');
  });
  it('serves /mcp on the server origin for other servers', () => {
    expect(mcpUrlFor('http://127.0.0.1:8000', {})).toBe('http://127.0.0.1:8000/mcp');
    expect(mcpUrlFor('https://relay.example.test', {})).toBe('https://relay.example.test/mcp');
  });
  it('honours PEERBAND_MCP_URL and validates it', () => {
    expect(mcpUrlFor('https://peerband.com', { PEERBAND_MCP_URL: 'https://mcp.example.test/custom/' })).toBe('https://mcp.example.test/custom');
    expect(() => mcpUrlFor('https://peerband.com', { PEERBAND_MCP_URL: 'http://evil.example.test/mcp' })).toThrow(ConfigError);
  });
});

describe('server URL', () => {
  it('defaults to peerband.com and honours PEERBAND_SERVER and an explicit value', () => {
    expect(resolveServerUrl(undefined, {})).toBe('https://peerband.com');
    expect(resolveServerUrl(undefined, { PEERBAND_SERVER: 'https://staging.example.test/' })).toBe('https://staging.example.test');
    expect(resolveServerUrl('http://localhost:8080', { PEERBAND_SERVER: 'https://other.test' })).toBe('http://localhost:8080');
  });
  it('accepts https anywhere and http only on loopback', () => {
    expect(validateServerUrl('https://example.test')).toBe('https://example.test');
    for (const url of ['http://localhost:1', 'http://127.0.0.1:1', 'http://[::1]:1']) expect(() => validateServerUrl(url)).not.toThrow();
  });
  it('rejects insecure, credentialed, non-http and malformed URLs', () => {
    expect(() => validateServerUrl('http://example.test')).toThrow('https');
    expect(() => validateServerUrl('ftp://example.test')).toThrow('https');
    expect(() => validateServerUrl('https://u:p@example.test')).toThrow('credentials');
    expect(() => validateServerUrl('nonsense')).toThrow('Invalid server URL');
  });
});

describe('connector config', () => {
  it('accepts a full valid config', () => {
    const value = { allowedAgents: ['a'], allowedWorkspaces: ['w'], stateDirectory: '/s', enableWrites: true, herdr: { socketPath: '/p', schemaPath: '/s.json', binary: 'herdr', machineId: 'm', timeoutMs: 500 } };
    expect(parseConnectorConfig(value)).toEqual(value);
  });
  it('rejects unknown fields and bad types with the field named', () => {
    expect(() => parseConnectorConfig({ nope: 1 })).toThrow('unknown field "nope"');
    expect(() => parseConnectorConfig({ allowedAgents: 'x' })).toThrow('allowedAgents');
    expect(() => parseConnectorConfig({ enableWrites: 'yes' })).toThrow('enableWrites');
    expect(() => parseConnectorConfig({ herdr: { timeoutMs: 5 } })).toThrow('timeoutMs');
    expect(() => parseConnectorConfig({ herdr: { extra: 1 } })).toThrow('unknown field');
    expect(() => parseConnectorConfig([])).toThrow('JSON object');
  });
  it('loads from disk; missing is {} only when optional', async () => {
    const dir = await temp();
    const path = join(dir, 'connector.json');
    expect(await loadConnectorConfig(path, { optional: true })).toEqual({});
    await expect(loadConnectorConfig(path)).rejects.toThrow('Cannot read');
    await writeFile(path, '{bad');
    await expect(loadConnectorConfig(path)).rejects.toThrow('not valid JSON');
    await writeFile(path, JSON.stringify({ allowedAgents: ['x'] }));
    expect(await loadConnectorConfig(path)).toEqual({ allowedAgents: ['x'] });
  });
});
