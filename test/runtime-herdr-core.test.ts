import { afterEach, describe, expect, it } from 'vitest';
import { ConnectorCore, ConnectorEvents, parseConnectorConfig, type RuntimeEvent } from '../src/core/index.js';
import { callingPane } from '../src/cli/commands/notify.js';
import { HerdrCoreAdapter, parseLayout } from '../src/runtime-herdr-core/index.js';
import { FakeCore, NO_REPLY, type FakeTerminal } from './fixtures/fake-core.js';

const adapters: HerdrCoreAdapter[] = [];
afterEach(async () => { await Promise.all(adapters.splice(0).map((adapter) => adapter.close())); });

function setup(terminals: FakeTerminal[] = [], layout: unknown = null, options: { timeoutMs?: number; nudgeMs?: number } = {}) {
  const core = new FakeCore();
  core.terminals = terminals;
  core.layout = layout;
  const adapter = new HerdrCoreAdapter({ streamFactory: core.factory, machineId: 'machine-1', settleMs: 5, nudgeMs: 1, sleep: () => new Promise((resolve) => setTimeout(resolve, 5)), ...options });
  adapters.push(adapter);
  return { core, adapter };
}

const claude = (extra: Partial<FakeTerminal> = {}): FakeTerminal => ({ address: 't1', name: 'review', argv: ['claude'], status: { state: 'idle', app: 'claude-code' }, foreground: { name: 'claude', cwd: '/work/app/src', pid: 4242, argv: ['claude'] }, ...extra });

/** The Herdr desktop app's layout document, in the shape herdr-app 0.x writes it. */
const appLayout = {
  spaces: [
    { id: 's1', name: 'Backend', folder: '/work/app', tabs: [
      { id: 'tab-a', name: 'Fixes', root: { id: 'r', type: 'row', children: [
        { id: 'p1', type: 'block', content: { terminal: 't1' } },
        { id: 'p2', type: 'block', content: { mod: 'notes', props: { terminal: 't9' } } },
      ] }, floating: [{ pane: { id: 'q', type: 'block', content: { terminal: 't3' } }, rect: [0.2, 0.2, 0.6, 0.6] }] },
    ] },
    { id: 's2', name: '', folder: '/work/website', tabs: [{ id: 'tab-b', name: '', root: { id: 'c', type: 'column', children: [{ id: 'p3', type: 'block', content: { terminal: 't2' } }] } }] },
  ],
};

async function until(check: () => boolean, ms = 2000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('herdr-core layout document', () => {
  it('maps terminals to spaces and tabs, ignoring mod props and remote addresses', () => {
    const layout = parseLayout(appLayout);
    expect(layout.byTerminal.get('t1')).toMatchObject({ space: { id: 's1', label: 'Backend', number: 1 }, tab: { id: 'tab-a', label: 'Fixes', number: 1 } });
    expect(layout.byTerminal.get('t3')?.tab.id).toBe('tab-a');
    // An unnamed space shows its folder, as the desktop app does.
    expect(layout.byTerminal.get('t2')).toMatchObject({ space: { label: 'website', number: 2 }, tab: { label: null } });
    expect(layout.byTerminal.has('t9')).toBe(false);
    expect(parseLayout({ spaces: [{ id: 's', tabs: [{ id: 't', root: { type: 'block', content: { terminal: 'box/t4' } } }] }] }).byTerminal.size).toBe(0);
    expect(parseLayout(null).spaces).toEqual([]);
    expect(parseLayout({ spaces: 'nope' }).spaces).toEqual([]);
  });
});

describe('HerdrCoreAdapter', () => {
  it('lists live local terminals that report status, with layout and stable ids', async () => {
    const { adapter } = setup([
      claude(),
      { address: 't2', name: null, argv: ['codex'], status: { state: 'error', app: 'codex' }, foreground: { name: 'codex.exe', cwd: 'C:\\work', pid: 7, argv: [] } },
      { address: 't4', name: 'worker', status: { state: 'working', app: 'pi' } },
      { address: 't5', name: 'shell', status: null },
      { address: 't6', status: { state: 'idle' }, state: 'finished' },
      { address: 'box/t3', status: { state: 'idle' } },
    ], appLayout);
    const agents = await adapter.listAgents();
    expect(agents.map((agent) => agent.label)).toEqual(['review', 'codex', 'worker']);
    const [review, codex, worker] = agents;
    expect(review).toMatchObject({ runtime: 'herdr-core', machineId: 'machine-1', agentType: 'claude', status: 'idle', workspace: '/work/app/src', capabilities: { readOutput: true, sendMessage: true }, location: { space: { id: 's1', label: 'Backend' }, tab: { id: 'tab-a', label: 'Fixes' } } });
    expect(review!.id).toMatch(/^hc_/);
    // An error needs the person, like blocked; the raw word is kept.
    expect(codex).toMatchObject({ status: 'blocked', rawStatus: 'error', location: { space: { id: 's2', label: 'website' } } });
    // Agents no tab shows (hc run --bg) are grouped as Background.
    expect(worker!.location).toEqual({ space: { id: 'hc-background', label: 'Background', number: 3 }, tab: { id: 'hc-background-tab', label: 'Not in a tab', number: 1 } });
    expect((await adapter.listAgents()).map((agent) => agent.id)).toEqual(agents.map((agent) => agent.id));
  });

  it('treats a new program in the same terminal as a new agent and the old handle as stale', async () => {
    const { core, adapter } = setup([claude()]);
    const [before] = await adapter.listAgents();
    core.terminals[0]!.pid = 9999;
    const [after] = await adapter.listAgents();
    expect(after!.id).not.toBe(before!.id);
    await expect(adapter.getAgent(before!.id)).rejects.toMatchObject({ code: 'stale_target' });
    await expect(adapter.getAgent('hc_unknown')).rejects.toMatchObject({ code: 'agent_not_found' });
  });

  it('retires every handle when a different core answers', async () => {
    const { core, adapter } = setup([claude()]);
    const [before] = await adapter.listAgents();
    core.coreId = 'core-2';
    const [after] = await adapter.listAgents();
    expect(after!.id).not.toBe(before!.id);
  });

  it('sends to the terminal address after rechecking the program', async () => {
    const { core, adapter } = setup([claude()]);
    const [agent] = await adapter.listAgents();
    await adapter.sendMessage(agent!.id, 'Run the tests');
    expect(core.calls.filter((call) => call.method === 'terminal.send')).toEqual([{ method: 'terminal.send', params: { terminal: 't1', text: 'Run the tests' } }]);
    expect(core.calls.some((call) => call.method === 'terminal.get' && call.params.terminal === 't1')).toBe(true);
  });

  it('presses Enter once more when a long message stays in the input box (Codex)', async () => {
    const codex = claude({ name: 'codex', argv: ['codex'], status: { state: 'idle', app: 'codex' } });
    const { core, adapter } = setup([codex]);
    const [agent] = await adapter.listAgents();
    const keys = () => core.calls.filter((call) => call.method === 'terminal.keys');
    core.overrides.set('terminal.send', () => ({ started: false, status: 'idle', turn: 2 }));
    await adapter.sendMessage(agent!.id, 'A long relayed message');
    expect(keys()).toEqual([{ method: 'terminal.keys', params: { terminal: 't1', keys: ['enter'] } }]);
    // Started, unknown (no status reports) or busy when it went in: no extra key.
    for (const result of [{ started: true, status: 'idle', turn: 3 }, { started: null, status: null, turn: 4 }, { started: false, status: 'working', turn: 5 }]) {
      core.overrides.set('terminal.send', () => result);
      await adapter.sendMessage(agent!.id, 'hi');
    }
    expect(keys()).toHaveLength(1);
    // It started working by the time of the recheck: no extra key either.
    core.overrides.set('terminal.send', () => { core.terminals[0]!.status = { state: 'working', app: 'codex' }; return { started: false, status: 'idle', turn: 6 }; });
    await adapter.sendMessage(agent!.id, 'hi');
    expect(keys()).toHaveLength(1);
  });

  it('treats a failed extra Enter as delivered', async () => {
    const { core, adapter } = setup([claude()]);
    const [agent] = await adapter.listAgents();
    core.overrides.set('terminal.send', () => ({ started: false, status: 'idle', turn: 2 }));
    core.overrides.set('terminal.keys', () => { throw { kind: 'unavailable', message: 'lost' }; });
    await expect(adapter.sendMessage(agent!.id, 'hi')).resolves.toBeUndefined();
  });

  it('never types into a blocked agent, a replaced program or with an invalid message', async () => {
    const { core, adapter } = setup([claude({ status: { state: 'blocked', app: 'claude-code' } })]);
    const [agent] = await adapter.listAgents();
    await expect(adapter.sendMessage(agent!.id, 'hi')).rejects.toMatchObject({ code: 'agent_blocked' });
    await expect(adapter.sendMessage(agent!.id, '')).rejects.toMatchObject({ code: 'invalid_argument' });
    core.terminals[0]!.status = { state: 'idle' };
    const [idle] = await adapter.listAgents();
    // The program changes between the list and the send.
    core.overrides.set('terminal.get', () => ({ ...core.terminals[0], pid: 1, created_ms: 1000, state: 'live' }));
    await expect(adapter.sendMessage(idle!.id, 'hi')).rejects.toMatchObject({ code: 'stale_target' });
    expect(core.calls.some((call) => call.method === 'terminal.send')).toBe(false);
  });

  it('maps core errors on send: blocked is definite, anything else is uncertain', async () => {
    const { core, adapter } = setup([claude()], null, { timeoutMs: 200 });
    const [agent] = await adapter.listAgents();
    core.overrides.set('terminal.send', () => { throw { kind: 'blocked', message: 'blocked' }; });
    await expect(adapter.sendMessage(agent!.id, 'hi')).rejects.toMatchObject({ code: 'agent_blocked' });
    core.overrides.set('terminal.send', () => { throw { kind: 'unavailable', message: 'lost' }; });
    await expect(adapter.sendMessage(agent!.id, 'hi')).rejects.toMatchObject({ code: 'delivery_unknown' });
    core.overrides.set('terminal.send', () => { throw { kind: 'not_found', message: 'gone' }; });
    await expect(adapter.sendMessage(agent!.id, 'hi')).rejects.toMatchObject({ code: 'stale_target' });
  });

  it('reports delivery as unknown when the core connection drops during a send', async () => {
    const { core, adapter } = setup([claude()]);
    const [agent] = await adapter.listAgents();
    core.overrides.set('terminal.send', () => { setTimeout(() => core.dropAll(), 5); return NO_REPLY; });
    await expect(adapter.sendMessage(agent!.id, 'hi')).rejects.toMatchObject({ code: 'delivery_unknown' });
    // The next request opens a fresh connection.
    core.overrides.delete('terminal.send');
    await expect(adapter.listAgents()).resolves.toHaveLength(1);
  });

  it('reads bounded, sanitized output and flags a screen-only read', async () => {
    const { core, adapter } = setup([claude({ text: 'line 1\nline 2\nkey: token=abcdefghijklmnop\x1b[31mred\x1b[0m\nlast\n   \n\n  \n' })]);
    const [agent] = await adapter.listAgents();
    const output = await adapter.readOutput(agent!.id, { lines: 3 });
    expect(output).toMatchObject({ untrusted: true, truncated: true });
    expect(output.text).toBe('line 2\nkey: token=[REDACTED]\nlast');
    // It reads deeper than asked, so screen padding can be folded away before the last lines are taken.
    expect(core.calls.find((call) => call.method === 'terminal.read')?.params).toEqual({ terminal: 't1', lines: 123 });
    core.terminals[0]!.read = { how: 'screen', why: 'working', complete: false };
    expect(await adapter.readOutput(agent!.id, {})).toMatchObject({ source: 'visible', truncated: true });
    await expect(adapter.readOutput(agent!.id, { cursor: 'x' })).rejects.toMatchObject({ code: 'unsupported_capability' });
    await expect(adapter.readOutput(agent!.id, { lines: 501 })).rejects.toMatchObject({ code: 'invalid_argument' });
  });

  it('folds the blank rows of a tall screen, so the last lines hold the reply and not padding', async () => {
    const padding = '\n'.repeat(90);
    const { adapter } = setup([claude({ text: `> Run the tests\n\n● All 12 tests pass\n${padding}────\n❯ \n────\n  footer\n${'\n'.repeat(5)}` })]);
    const [agent] = await adapter.listAgents();
    const output = await adapter.readOutput(agent!.id, { lines: 8 });
    expect(output.text).toBe('> Run the tests\n\n● All 12 tests pass\n\n────\n❯\n────\n  footer');
  });

  it('pushes status changes from the event stream without reading output', async () => {
    const { core, adapter } = setup([claude()]);
    const events: RuntimeEvent[] = [];
    adapter.onEvent((event) => events.push(event));
    const [agent] = await adapter.listAgents();
    await until(() => core.subscribers.size === 1);
    core.emit('status', 't1', { status: { state: 'working', app: 'claude-code' }, records: {}, reported: true });
    core.emit('foreground', 't1', { pid: 4242, name: 'claude', argv: [], cwd: '/x' });
    core.emit('status', 'box/t1', { status: { state: 'working' } });
    await until(() => events.length >= 1);
    expect(events[0]).toEqual({ kind: 'status', agentId: agent!.id, status: 'working', previousStatus: 'idle', label: 'review', workspace: '/work/app/src', revision: 1 });
    expect(core.calls.some((call) => call.method === 'terminal.read')).toBe(false);
  });

  it('refreshes the list when terminals start, end or move, and when the layout changes', async () => {
    const { core, adapter } = setup([claude()]);
    const events: RuntimeEvent[] = [];
    adapter.onEvent((event) => events.push(event));
    await adapter.listAgents();
    await until(() => core.subscribers.size === 1);
    core.terminals.push({ address: 't2', name: 'helper', status: { state: 'idle' } });
    core.emit('created', 't2', {});
    await until(() => events.some((event) => event.kind === 'agents_changed'));
    events.length = 0;
    core.layout = appLayout;
    core.emit('doc', undefined, { name: 'herdr-app', version: 4 });
    await until(() => events.some((event) => event.kind === 'agents_changed'));
    expect((await adapter.listAgents())[0]!.location?.space.label).toBe('Backend');
    events.length = 0;
    // A first report turns a plain terminal into an agent.
    core.terminals.push({ address: 't7', name: 'late', status: null });
    core.emit('created', 't7', {});
    await new Promise((resolve) => setTimeout(resolve, 40));
    events.length = 0;
    core.terminals[2]!.status = { state: 'working' };
    core.emit('status', 't7', { status: { state: 'working' }, records: {}, reported: true });
    await until(() => events.some((event) => event.kind === 'agents_changed'));
  });

  it('reconnects the event stream and reconciles a status change it missed', async () => {
    const { core, adapter } = setup([claude()]);
    const events: RuntimeEvent[] = [];
    const logs: string[] = [];
    adapter.onEvent((event) => events.push(event), (message) => logs.push(message));
    const [agent] = await adapter.listAgents();
    await until(() => core.subscribers.size === 1);
    core.dropSubscribers();
    core.terminals[0]!.status = { state: 'done', app: 'claude-code' };
    await until(() => events.some((event) => event.kind === 'status'));
    expect(events.find((event) => event.kind === 'status')).toMatchObject({ agentId: agent!.id, status: 'done', previousStatus: 'idle', revision: null });
    expect(logs).toContain('herdr-core event stream closed; reconnecting.');
  });

  it('says the list changed when the core goes away, and logs a missing core only once', async () => {
    const { core, adapter } = setup([claude()]);
    const events: RuntimeEvent[] = [];
    const logs: string[] = [];
    adapter.onEvent((event) => events.push(event), (message) => logs.push(message));
    await until(() => core.subscribers.size === 1);
    core.overrides.set('events.subscribe', () => { throw { kind: 'unavailable', message: 'no core' }; });
    core.dropSubscribers();
    await until(() => events.some((event) => event.kind === 'agents_changed'));
    // Several failed retries later, still one notice.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(logs.filter((line) => line.includes('reconnecting'))).toHaveLength(1);
  });

  it('maps HC_TERMINAL_ID to its agent for notes', async () => {
    const { adapter } = setup([claude()]);
    const [agent] = await adapter.listAgents();
    expect(await adapter.agentIdForPane('t1')).toBe(agent!.id);
    expect(await adapter.agentIdForPane('t99')).toBeUndefined();
    expect(callingPane({ HC_TERMINAL_ID: 't1' })).toBe('t1');
    expect(callingPane({ HERDR_PANE_ID: 'w1-2', HC_TERMINAL_ID: 't1' })).toBe('w1-2');
    expect(callingPane({ HC_TERMINAL_ID: 'bad id' })).toBeUndefined();
  });

  it('attributes a note to the core terminal even when an inherited Herdr pane id comes first', async () => {
    const { adapter } = setup([claude()]);
    const [agent] = await adapter.listAgents();
    const events = new ConnectorEvents(adapter);
    const frames: Array<{ name: string; data: Record<string, unknown> }> = [];
    events.attach((frame) => { frames.push(frame); return true; });
    const result = await events.notify({ text: 'Tests pass', paneId: 'w1:p2W', terminalId: 't1' });
    expect(result).toMatchObject({ sent: true, agentId: agent!.id });
    expect(frames.find((frame) => frame.name === 'agent.notified')?.data).toMatchObject({ agentId: agent!.id, text: 'Tests pass' });
    expect((await events.notify({ text: 'No terminal', paneId: 'w1:p2W' })).agentId).toBeNull();
    events.close();
  });

  it('lists a read-only environment with every terminal a tab shows, and Background agents', async () => {
    const { adapter } = setup([
      claude(),
      { address: 't2', name: 'shell', status: null, cwd: '/work/website', foreground: { name: 'pwsh.exe', cwd: '/work/website', pid: 2, argv: [] } },
      { address: 't4', name: 'worker', status: { state: 'working', app: 'pi' } },
    ], appLayout);
    const env = await adapter.listEnvironment();
    expect(env.actions).toEqual([]);
    expect(env.workspaces).toEqual([
      { workspaceId: 's1', label: 'Backend', number: 1, tabCount: 1 },
      { workspaceId: 's2', label: 'website', number: 2, tabCount: 1 },
      { workspaceId: 'hc-background', label: 'Background', number: 3, tabCount: 1 },
    ]);
    expect(env.panes).toEqual([
      { paneId: 't1', tabId: 'tab-a', workspaceId: 's1', cwd: '/work/app/src', agent: 'claude', agentStatus: 'idle', name: 'review' },
      { paneId: 't2', tabId: 'tab-b', workspaceId: 's2', cwd: '/work/website', label: 'shell' },
      { paneId: 't4', tabId: 'hc-background-tab', workspaceId: 'hc-background', cwd: '/work/app', agent: 'pi', agentStatus: 'working', name: 'worker' },
    ]);
    await expect(adapter.readPane('t2', { lines: 5 })).resolves.toMatchObject({ untrusted: true });
    await expect(adapter.readPane('t3', {})).rejects.toMatchObject({ code: 'agent_not_found' });
    await expect(adapter.controlEnvironment()).rejects.toMatchObject({ code: 'unsupported_capability' });
  });

  it('refuses a core that speaks another protocol generation', async () => {
    const { core, adapter } = setup([claude()]);
    core.generation = 2;
    await expect(adapter.listAgents()).rejects.toMatchObject({ code: 'schema_mismatch' });
  });

  it('works end to end through ConnectorCore: list, read and a delivered message', async () => {
    const { core, adapter } = setup([claude({ text: 'ready' })], appLayout);
    const connector = new ConnectorCore(adapter, { writesEnabled: true });
    const principal = { id: 'owner', scopes: ['agents:read', 'agents:message'] };
    const listed = await connector.execute('list_agents', {}, principal) as { agents: Array<{ id: string; runtime: string }> };
    expect(listed.agents).toHaveLength(1);
    expect(listed.agents[0]!.runtime).toBe('herdr-core');
    const output = await connector.execute('get_agent_output', { agentId: listed.agents[0]!.id }, principal);
    expect(output).toMatchObject({ text: 'ready', untrusted: true });
    const receipt = await connector.execute('send_agent_message', { agentId: listed.agents[0]!.id, message: 'Ship it', idempotencyKey: 'key-0000000000001' }, principal) as { requestId: string };
    let state = '';
    await until(() => {
      void connector.execute('get_request_status', { requestId: receipt.requestId }, principal).then((value) => { state = String(value.state); });
      return state === 'delivered';
    });
    expect(core.calls.filter((call) => call.method === 'terminal.send')).toHaveLength(1);
    await connector.close();
  });
});

describe('connector.json runtime settings', () => {
  it('accepts herdr-core and its settings, and rejects unknown values', () => {
    expect(parseConnectorConfig({ runtime: 'herdr-core', herdrCore: { binary: '/opt/hc', timeoutMs: 5000 } })).toEqual({ runtime: 'herdr-core', herdrCore: { binary: '/opt/hc', timeoutMs: 5000 } });
    expect(parseConnectorConfig({ runtime: 'herdr' })).toEqual({ runtime: 'herdr' });
    expect(() => parseConnectorConfig({ runtime: 'tmux' })).toThrow(/runtime must be one of/);
    expect(() => parseConnectorConfig({ herdrCore: { socket: 'x' } })).toThrow(/unknown field "socket"/);
    expect(() => parseConnectorConfig({ herdrCore: { timeoutMs: 5 } })).toThrow(/timeoutMs/);
  });
});
