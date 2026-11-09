import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { ConnectorCore, MockRuntime, parseConnectorConfig } from '../src/core/index.js';
import { fileURLToPath } from 'node:url';
import { loadHerdrSchema } from '../src/runtime-herdr/index.js';
import { environmentCommand } from '../src/core/environment.js';
import { environmentMetadata, environmentParams } from '../src/runtime-herdr/environment.js';
import { environmentControlEnabled } from '../src/cli/commands/shared.js';

const owner = { id: 'owner', role: 'owner', scopes: ['agents:read', 'environment:control'] };
const command = { action: 'tab.create', workspaceId: 'w1', cwd: '/project', label: 'Tests', idempotencyKey: 'environment-key-12345' };
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
function setup(options: ConstructorParameters<typeof ConnectorCore>[1] = {}) {
  const adapter = Object.assign(new MockRuntime(), {
    listEnvironment: vi.fn(async () => ({ workspaces: [{ workspaceId: 'w1' }] })),
    controlEnvironment: vi.fn(async () => ({ tab: { tabId: 'w1:t2' }, rootPane: { paneId: 'w1:p2' } })),
  });
  return { adapter, core: new ConnectorCore(adapter, { writesEnabled: true, environmentControlEnabled: true, ...options }) };
}
it('requires independent consent, owner role, opt-in and no allowlist', async () => {
  for (const [options, principal, code] of [
    [{}, { ...owner, scopes: ['agents:read', 'agents:message'] }, 'forbidden'],
    [{}, { ...owner, role: 'guest' }, 'forbidden'],
    [{}, { ...owner, role: undefined }, 'forbidden'],
    [{ environmentControlEnabled: false }, owner, 'write_disabled'],
    [{ writesEnabled: false }, owner, 'write_disabled'],
    [{ allowedAgents: [] }, owner, 'forbidden'],
    [{ allowedWorkspaces: ['/project'] }, owner, 'forbidden'],
  ] as const) {
    const { core, adapter } = setup(options as ConstructorParameters<typeof ConnectorCore>[1]);
    try {
      await expect(core.execute('control_environment', command, { ...principal, scopes: [...principal.scopes] })).rejects.toMatchObject({ code });
      await expect(core.execute('list_environment', {}, { ...principal, scopes: [...principal.scopes] })).rejects.toMatchObject({ code });
      expect(adapter.controlEnvironment).not.toHaveBeenCalled();
    } finally { await core.close(); }
  }
});
it('persists result IDs, deduplicates concurrent submissions and survives restart without re-executing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'peerband-environment-')); dirs.push(dir);
  const receiptPath = join(dir, 'receipts.json');
  const { core, adapter } = setup({ receiptPath });
  const receipts = await Promise.all(Array.from({ length: 5 }, () => core.execute('control_environment', command, owner)));
  expect(new Set(receipts.map((r) => r.requestId)).size).toBe(1);
  await core.close();
  expect(adapter.controlEnvironment).toHaveBeenCalledTimes(1);
  const restarted = setup({ receiptPath });
  try {
    const receipt = await restarted.core.execute('control_environment', command, owner);
    expect(receipt).toMatchObject({ state: 'delivered', result: { rootPane: { paneId: 'w1:p2' } } });
    expect(restarted.adapter.controlEnvironment).not.toHaveBeenCalled();
    await expect(restarted.core.execute('control_environment', { ...command, label: 'Other' }, owner)).rejects.toMatchObject({ code: 'idempotency_conflict' });
    await expect(restarted.core.execute('get_request_status', { requestId: receipt.requestId }, { ...owner, id: 'another' })).rejects.toMatchObject({ code: 'request_not_found' });
    expect(await readFile(receiptPath, 'utf8')).not.toContain('/project');
  } finally { await restarted.core.close(); }
});
it('never replays a write after losing its runtime acknowledgement', async () => {
  const { core, adapter } = setup();
  adapter.controlEnvironment.mockRejectedValueOnce(new Error('lost acknowledgement'));
  const first = await core.execute('control_environment', command, owner);
  await core.close();
  expect(first.requestId).toBeTruthy();
  expect(adapter.controlEnvironment).toHaveBeenCalledTimes(1);
});
it('validates action fields and blocks shell, native arguments, relative paths and implicit targets', () => {
  for (const input of [
    { action: 'pane.run', paneId: 'w1:p1', text: 'anything' },
    { action: 'agent.start', paneId: 'w1:p1', name: 'worker', kind: 'codex', args: ['--dangerously-bypass-approvals-and-sandbox'] },
    { action: 'agent.start', paneId: 'w1:p1', name: 'worker', kind: 'powershell' },
    { action: 'tab.create', cwd: '/project' },
    { action: 'tab.create', workspaceId: 'w1', cwd: 'relative' },
    { action: 'tab.focus', tabId: '--current' },
  ]) expect(() => environmentCommand(input)).toThrow();
  expect(environmentParams({ action: 'pane.split', paneId: 'w1:p1', direction: 'right', cwd: 'D:\\project' })).toEqual({ target_pane_id: 'w1:p1', direction: 'right', cwd: 'D:\\project', focus: false });
});
it('returns only bounded, sanitized metadata', () => {
  expect(environmentMetadata({ type: 'tab_created', tab: { tab_id: 'w1:t2', label: 'Test', env: { SECRET: 'secret' }, output: 'private' }, root_pane: { pane_id: 'w1:p2', args: ['secret'] } })).toEqual({ type: 'tab_created', tab: { tabId: 'w1:t2', label: 'Test' }, rootPane: { paneId: 'w1:p2' } });
  expect(parseConnectorConfig({ enableEnvironmentControl: true })).toEqual({ enableEnvironmentControl: true });
  expect(() => parseConnectorConfig({ enableEnvironmentControl: 'yes' })).toThrow();
});

it('validates every exposed action against the pinned Herdr request schema', async () => {
  const schema = await loadHerdrSchema({ schemaPath: fileURLToPath(new URL('../src/runtime-herdr/fixtures/herdr-api-0.9.3-installed.schema.json', import.meta.url)) });
  const commands = [
    { action: 'workspace.create', cwd: '/project' },
    { action: 'workspace.rename', workspaceId: 'w1', label: 'Project' },
    { action: 'workspace.focus', workspaceId: 'w1' },
    { action: 'tab.create', workspaceId: 'w1', cwd: '/project' },
    { action: 'tab.rename', tabId: 'w1:t1', label: 'Tests' },
    { action: 'tab.focus', tabId: 'w1:t1' },
    { action: 'pane.split', paneId: 'w1:p1', cwd: '/project', direction: 'down' },
    { action: 'pane.rename', paneId: 'w1:p1', label: 'Worker' },
    { action: 'pane.focus', paneId: 'w1:p1' },
    { action: 'agent.start', paneId: 'w1:p1', name: 'worker', kind: 'codex' },
    { action: 'agent.rename', paneId: 'w1:p1', name: 'renamed-worker' },
    { action: 'workspace.close', workspaceId: 'w1' },
    { action: 'tab.close', tabId: 'w1:t1' },
    { action: 'pane.close', paneId: 'w1:p1' },
    { action: 'pane.send_input', paneId: 'w1:p1', text: 'npm test' },
  ];
  for (const input of commands) {
    const command = environmentCommand(input);
    expect(schema.validateRequest({ id: 'test', method: command.action, params: environmentParams(command) }), schema.diagnostics()).toBe(true);
  }
});

it('reconciles an interrupted environment write to unknown without replaying it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'peerband-environment-')); dirs.push(dir);
  const receiptPath = join(dir, 'receipts.json');
  const first = setup({ receiptPath });
  await first.core.execute('control_environment', command, owner);
  await first.core.close();
  const store = JSON.parse(await readFile(receiptPath, 'utf8')) as { receipts: Array<{ state: string; result?: unknown }> };
  store.receipts[0]!.state = 'dispatching';
  delete store.receipts[0]!.result;
  await writeFile(receiptPath, JSON.stringify(store));
  const restarted = setup({ receiptPath });
  try {
    const receipt = await restarted.core.execute('control_environment', command, owner);
    expect(receipt).toMatchObject({ state: 'delivery_unknown', errorCode: 'process_restarted' });
    expect(restarted.adapter.controlEnvironment).not.toHaveBeenCalled();
  } finally { await restarted.core.close(); }
});

it('addresses agent rename by explicit pane and rejects native aliases or extra args', () => {
  expect(environmentParams({ action: 'agent.rename', paneId: 'w1:p1', name: 'reviewer' })).toEqual({ target: 'w1:p1', name: 'reviewer' });
  expect(() => environmentCommand({ action: 'agent.rename', name: 'reviewer' })).toThrow();
  expect(() => environmentCommand({ action: 'agent.rename', paneId: 'w1:p1', name: 'not a valid name' })).toThrow();
});

it('closes only the explicitly named item and never the whole group', () => {
  expect(environmentParams({ action: 'workspace.close', workspaceId: 'w1' })).toEqual({ workspace_id: 'w1' });
  expect(environmentParams({ action: 'tab.close', tabId: 'w1:t1' })).toEqual({ tab_id: 'w1:t1' });
  expect(environmentParams({ action: 'pane.close', paneId: 'w1:p1' })).toEqual({ pane_id: 'w1:p1' });
  expect(() => environmentCommand({ action: 'workspace.close' })).toThrow();
  expect(() => environmentCommand({ action: 'workspace.close', workspaceId: 'w1', closeGroup: 'true' })).toThrow();
  expect(() => environmentCommand({ action: 'tab.close', paneId: 'w1:p1' })).toThrow();
});

it('turns environment control on by default and off only when asked', () => {
  expect(environmentControlEnabled({})).toBe(true);
  expect(environmentControlEnabled({ enableEnvironmentControl: true })).toBe(true);
  expect(environmentControlEnabled({ enableEnvironmentControl: false })).toBe(false);
  expect(environmentControlEnabled({}, { disable: true })).toBe(false);
  expect(environmentControlEnabled({ enableEnvironmentControl: false }, { enable: true })).toBe(true);
});

it('types one line into a pane followed by Enter, with no control characters', () => {
  expect(environmentParams({ action: 'pane.send_input', paneId: 'w1:p1', text: 'git status' })).toEqual({ pane_id: 'w1:p1', text: 'git status', keys: ['Enter'] });
  expect(() => environmentCommand({ action: 'pane.send_input', paneId: 'w1:p1' })).toThrow();
  expect(() => environmentCommand({ action: 'pane.send_input', paneId: 'w1:p1', text: 'ls\nrm -rf /' })).toThrow();
  expect(() => environmentCommand({ action: 'pane.send_input', paneId: 'w1:p1', text: '\u0003' })).toThrow();
  expect(() => environmentCommand({ action: 'pane.send_input', paneId: 'w1:p1', text: '   ' })).toThrow();
  expect(() => environmentCommand({ action: 'pane.send_input', paneId: 'w1:p1', text: 'x'.repeat(4097) })).toThrow();
  expect(() => environmentCommand({ action: 'pane.send_input', paneId: 'w1:p1', text: 'ls', keys: 'C-c' })).toThrow();
});

it('reads any pane only for the owner with environment control on, and sanitizes the text', async () => {
  const { core, adapter } = setup();
  const readPane = vi.fn(async () => ({ text: 'PS> echo hi\nhi\n', truncated: false, observedAt: '2026-11-08T00:00:00.000Z', untrusted: true as const }));
  Object.assign(adapter, { readPane });
  try {
    const result = await core.execute('read_pane', { paneId: 'w1:p3', lines: 20 }, owner);
    expect(result).toMatchObject({ text: 'PS> echo hi\nhi\n', untrusted: true });
    expect(readPane).toHaveBeenCalledWith('w1:p3', { lines: 20, bytes: 8192 });
    await expect(core.execute('read_pane', { paneId: 'w1:p3' }, { ...owner, role: 'guest' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(core.execute('read_pane', { paneId: '--current' }, owner)).rejects.toMatchObject({ code: 'invalid_argument' });
    await expect(core.execute('read_pane', { paneId: 'w1:p3', source: 'ansi' }, owner)).rejects.toMatchObject({ code: 'invalid_argument' });
  } finally { await core.close(); }
  const off = setup({ environmentControlEnabled: false });
  try { await expect(off.core.execute('read_pane', { paneId: 'w1:p3' }, owner)).rejects.toMatchObject({ code: 'write_disabled' }); } finally { await off.core.close(); }
});
