import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { ConnectError, ConnectorEvents, type AgentRecord, type RuntimeAdapter, type RuntimeEvent, type RuntimeEventListener } from '../src/core/index.js';
import type { EnvironmentCommand, EnvironmentResult } from '../src/core/environment.js';
import { CombinedAdapter } from '../src/runtime-combined/index.js';
import { attachOnlyStream, CoreConnection, type CoreStream } from '../src/runtime-herdr-core/index.js';
import { FakeCore } from './fixtures/fake-core.js';

const agent = (id: string, runtime: string): AgentRecord => ({
  id, machineId: 'm', runtime, agentType: 'claude', label: id, workspace: '/work', status: 'idle', rawStatus: 'idle',
  observedAt: '2026-11-20T00:00:00.000Z', stale: false, capabilities: { readOutput: true, sendMessage: true },
});

/** A runtime with fixed agents that records what reaches it. */
class FakeRuntime implements RuntimeAdapter {
  calls: string[] = [];
  listeners = new Set<RuntimeEventListener>();
  down = false;
  constructor(readonly name: string, readonly agents: AgentRecord[], readonly environment?: EnvironmentResult, readonly panes: Record<string, string> = {}, readonly controls = true) {}
  getCapabilities() { return { readOutput: true, sendMessage: true, reason: `${this.name} reason.` }; }
  async listAgents() {
    if (this.down) throw new ConnectError('runtime_unavailable', `${this.name} is not running.`, 'Start it.');
    return this.agents;
  }
  async getAgent(id: string) {
    this.calls.push(`get ${id}`);
    const found = this.agents.find((item) => item.id === id);
    if (!found) throw new ConnectError('agent_not_found', `No ${this.name} agent has that identifier.`, 'List agents.');
    return found;
  }
  async readOutput(id: string) { this.calls.push(`read ${id}`); return { text: this.name, truncated: false, observedAt: 'now', untrusted: true as const }; }
  async sendMessage(id: string, message: string) { this.calls.push(`send ${id} ${message}`); }
  async agentIdForPane(paneId: string) { return this.panes[paneId]; }
  onEvent(listener: RuntimeEventListener) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  emit(event: RuntimeEvent) { for (const listener of this.listeners) listener(event); }
  async listEnvironment() {
    if (this.down || !this.environment) throw new ConnectError('runtime_unavailable', `${this.name} is not running.`, 'Start it.');
    return this.environment;
  }
  async readPane(paneId: string) { this.calls.push(`pane ${paneId}`); return { text: `${this.name} ${paneId}`, truncated: false, observedAt: 'now', untrusted: true as const }; }
  async close() { this.calls.push('close'); }
}

const herdrEnvironment: EnvironmentResult = {
  actions: ['workspace.create', 'tab.rename'],
  workspaces: [{ workspaceId: 'w1', label: 'app', number: 1, tabCount: 1 }],
  workspacesTruncated: false,
  tabs: [{ tabId: 'w1:t1', workspaceId: 'w1', label: 'main', number: 1, paneCount: 1 }],
  tabsTruncated: false,
  panes: [{ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude' }],
  panesTruncated: false,
};
const coreEnvironment: EnvironmentResult = {
  actions: [],
  runtime: 'herdr-core',
  workspaces: [{ workspaceId: 'hc-background', label: 'Background', number: 1, tabCount: 1 }],
  workspacesTruncated: false,
  tabs: [{ tabId: 'hc-background-tab', workspaceId: 'hc-background', label: 'Not in a tab', number: 1, paneCount: 1 }],
  tabsTruncated: true,
  panes: [{ paneId: 't7', tabId: 'hc-background-tab', workspaceId: 'hc-background', agent: 'codex' }],
  panesTruncated: false,
};

function combined() {
  const herdr = new FakeRuntime('herdr', [agent('herdr_1', 'herdr')], herdrEnvironment, { 'w1:p1': 'herdr_1', 'w1:p2W': 'herdr_1' });
  const core = new FakeRuntime('herdr-core', [agent('hc_1', 'herdr-core')], coreEnvironment, { t7: 'hc_1' });
  const adapter = new CombinedAdapter([
    { name: 'herdr', adapter: herdr, ownsAgent: (id) => id.startsWith('herdr_') },
    { name: 'herdr-core', adapter: core, ownsAgent: (id) => id.startsWith('hc_') },
  ]);
  // The core fake has no controlEnvironment, like herdr-core; the Herdr fake records control calls.
  (herdr as RuntimeAdapter).controlEnvironment = async (command: EnvironmentCommand) => { herdr.calls.push(`control ${command.action}`); return { ok: true }; };
  return { herdr, core, adapter };
}

describe('CombinedAdapter (Herdr and herdr-core in one relay)', () => {
  it('lists the agents of every runtime that runs, and fails only when none does', async () => {
    const { herdr, core, adapter } = combined();
    expect((await adapter.listAgents()).map((item) => item.id)).toEqual(['herdr_1', 'hc_1']);
    core.down = true;
    expect((await adapter.listAgents()).map((item) => item.id)).toEqual(['herdr_1']);
    core.down = false;
    herdr.down = true;
    expect((await adapter.listAgents()).map((item) => item.id)).toEqual(['hc_1']);
    core.down = true;
    await expect(adapter.listAgents()).rejects.toMatchObject({ code: 'runtime_unavailable', message: 'herdr is not running.' });
  });

  it('routes each agent call to the runtime its id belongs to', async () => {
    const { herdr, core, adapter } = combined();
    await adapter.sendMessage('hc_1', 'hello');
    await adapter.readOutput('herdr_1', {});
    expect((await adapter.getAgent('hc_1')).runtime).toBe('herdr-core');
    expect(core.calls).toEqual(['send hc_1 hello', 'get hc_1']);
    expect(herdr.calls).toEqual(['read herdr_1']);
    // An id no runtime claims gets the primary runtime's usual answer.
    await expect(adapter.getAgent('other_1')).rejects.toMatchObject({ code: 'agent_not_found' });
    expect(herdr.calls).toContain('get other_1');
  });

  it('joins capabilities and closes every runtime', async () => {
    const { herdr, core, adapter } = combined();
    expect(adapter.getCapabilities()).toEqual({ readOutput: true, sendMessage: true, reason: 'herdr reason. herdr-core reason.' });
    await adapter.close();
    expect(herdr.calls).toContain('close');
    expect(core.calls).toContain('close');
  });

  it('passes events from both runtimes to one listener and stops both', () => {
    const { herdr, core, adapter } = combined();
    const seen: RuntimeEvent[] = [];
    const stop = adapter.onEvent((event) => seen.push(event));
    herdr.emit({ kind: 'agents_changed' });
    core.emit({ kind: 'status', agentId: 'hc_1', status: 'working', previousStatus: 'idle', label: 'hc_1', workspace: '/work', revision: 4 });
    expect(seen.map((event) => event.kind)).toEqual(['agents_changed', 'status']);
    stop();
    expect(herdr.listeners.size + core.listeners.size).toBe(0);
  });

  it('credits a note to the core terminal when it names an agent, else to the Herdr pane', async () => {
    const { adapter } = combined();
    const events = new ConnectorEvents(adapter);
    events.attach(() => true);
    // A core started from a Herdr pane passes that pane's id on to its terminals.
    expect((await events.notify({ text: 'Done', paneId: 'w1:p2W', terminalId: 't7' })).agentId).toBe('hc_1');
    // Herdr run inside a core terminal: that terminal is no agent, so the pane id decides.
    expect((await events.notify({ text: 'Done', paneId: 'w1:p1', terminalId: 't3' })).agentId).toBe('herdr_1');
    expect((await events.notify({ text: 'Done', paneId: 'w1:p1' })).agentId).toBe('herdr_1');
    events.close();
  });

  it('joins both layouts, says which runtime owns each workspace and keeps the primary actions', async () => {
    const { adapter } = combined();
    const environment = await adapter.listEnvironment();
    expect(environment.actions).toEqual(['workspace.create', 'tab.rename']);
    expect(environment.workspaces).toEqual([
      { workspaceId: 'w1', label: 'app', number: 1, tabCount: 1, runtime: 'herdr', readOnly: false },
      { workspaceId: 'hc-background', label: 'Background', number: 2, tabCount: 1, runtime: 'herdr-core', readOnly: true },
    ]);
    expect((environment.tabs as unknown[]).length).toBe(2);
    expect((environment.panes as Array<{ paneId: string }>).map((pane) => pane.paneId)).toEqual(['w1:p1', 't7']);
    expect(environment.tabsTruncated).toBe(true);
    expect(environment.panesTruncated).toBe(false);
  });

  it('lists the layout of whichever runtime runs', async () => {
    const { herdr, adapter } = combined();
    herdr.down = true;
    const environment = await adapter.listEnvironment();
    expect(environment.actions).toEqual([]);
    expect((environment.workspaces as Array<{ workspaceId: string }>).map((row) => row.workspaceId)).toEqual(['hc-background']);
  });

  it('reads and controls panes in the runtime that listed them', async () => {
    const { herdr, core, adapter } = combined();
    // No listing yet: an unknown id lists the layout once to find its runtime.
    expect((await adapter.readPane('t7', {})).text).toBe('herdr-core t7');
    expect((await adapter.readPane('w1:p1', {})).text).toBe('herdr w1:p1');
    expect(core.calls).toEqual(['pane t7']);
    await expect(adapter.controlEnvironment({ action: 'tab.rename', tabId: 'hc-background-tab', label: 'x' })).rejects.toMatchObject({ code: 'unsupported_capability' });
    await adapter.controlEnvironment({ action: 'tab.rename', tabId: 'w1:t1', label: 'x' });
    // Creating a workspace names no id: the primary runtime (Herdr) does it.
    await adapter.controlEnvironment({ action: 'workspace.create', cwd: '/work' });
    expect(herdr.calls).toEqual(['pane w1:p1', 'control tab.rename', 'control workspace.create']);
  });
});

describe('attachOnlyStream', () => {
  it('never starts a core: without a running one it closes as runtime_unavailable and spawns nothing', async () => {
    let spawned = 0;
    const factory = attachOnlyStream('hc', async () => false, () => { spawned += 1; throw new Error('must not spawn'); });
    const connection = new CoreConnection(factory());
    await expect(connection.request('hello', {}, 1_000)).rejects.toMatchObject({ code: 'runtime_unavailable', message: 'herdr-core is not running.' });
    // A message that never reached a core was not delivered: the error says so instead of delivery_unknown.
    const again = new CoreConnection(factory());
    await expect(again.request('terminal.send', { terminal: 't1', text: 'hi' }, 1_000)).rejects.toMatchObject({ code: 'runtime_unavailable' });
    expect(spawned).toBe(0);
  });

  it('connects through to a core that is running', async () => {
    const core = new FakeCore();
    const factory = attachOnlyStream('hc', async () => true, core.factory);
    const connection = new CoreConnection(factory());
    await expect(connection.request('hello', {}, 1_000)).resolves.toMatchObject({ generation: 1 });
  });

  it('closes cleanly when closed before the check answers', async () => {
    let answer!: (up: boolean) => void;
    const factory = attachOnlyStream('hc', () => new Promise((resolve) => { answer = resolve; }), () => ({ input: new PassThrough(), output: new PassThrough(), closed: new Promise(() => undefined), close() {} }) as CoreStream);
    const stream = factory();
    stream.close();
    await expect(stream.closed).resolves.toBeUndefined();
    answer(true);
  });
});
