import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import { cleanNote, ConnectorEvents, eventFrame, MockRuntime, type EventFrame, type RuntimeEvent } from '../src/core/index.js';

const addFormats = ((addFormatsModule as unknown as { default?: unknown }).default ?? addFormatsModule) as (a: Ajv2020) => void;
async function relaySchema() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  return ajv.compile(JSON.parse(await readFile(new URL('../protocol/relay-messages.schema.json', import.meta.url), 'utf8')) as object);
}

const status = (agentId: string, to: 'idle' | 'working' | 'blocked' | 'done', from: 'idle' | 'working' | 'blocked' | 'done' | null, extra: Partial<Extract<RuntimeEvent, { kind: 'status' }>> = {}): RuntimeEvent => ({
  kind: 'status', agentId, status: to, previousStatus: from, label: `Agent ${agentId}`, workspace: 'C:/repo', revision: 3, ...extra,
});

function harness(options: ConstructorParameters<typeof ConnectorEvents>[1] = {}, adapter = new MockRuntime()) {
  const sent: EventFrame[] = [];
  const events = new ConnectorEvents(adapter, options);
  return { events, sent, adapter, send: (frame: EventFrame) => { sent.push(frame); return true; } };
}

describe('connector events', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('sends one agents.changed on attach and drops events while detached', () => {
    const { events, sent, send } = harness();
    events.push(status('a', 'idle', 'working'));
    expect(sent).toHaveLength(0);
    events.attach(send);
    expect(sent.map((frame) => frame.name)).toEqual(['agents.changed']);
    events.detach();
    events.push(status('a', 'working', 'idle'));
    vi.advanceTimersByTime(1000);
    expect(sent).toHaveLength(1);
    events.attach(send);
    expect(sent.map((frame) => frame.name)).toEqual(['agents.changed', 'agents.changed']);
  });

  it('coalesces bursts per agent: at most one event per 250 ms, the latest transition wins', () => {
    const { events, sent, send } = harness();
    events.attach(send);
    sent.length = 0;
    events.push(status('a', 'working', 'idle'));
    events.push(status('a', 'done', 'working'));
    events.push(status('a', 'idle', 'done'));
    events.push(status('b', 'working', 'idle'));
    expect(sent.map((frame) => [frame.data.agentId, frame.data.status])).toEqual([['a', 'working'], ['b', 'working']]);
    vi.advanceTimersByTime(249);
    expect(sent).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sent).toHaveLength(3);
    expect(sent[2]!.data).toEqual({ agentId: 'a', status: 'idle', previousStatus: 'done', label: 'Agent a', workspace: 'C:/repo', revision: 3 });
    vi.advanceTimersByTime(5000);
    expect(sent).toHaveLength(3);
  });

  it('caps the overall rate and delivers the backlog later instead of dropping it', () => {
    const { events, sent, send } = harness({ ratePerSecond: 2, burst: 2 });
    events.attach(send);
    sent.length = 0;
    for (let index = 0; index < 6; index++) events.push(status(`agent-${index}`, 'working', 'idle'));
    expect(sent).toHaveLength(2);
    vi.advanceTimersByTime(500);
    expect(sent).toHaveLength(3);
    vi.advanceTimersByTime(1500);
    expect(sent.map((frame) => frame.data.agentId)).toEqual(['agent-0', 'agent-1', 'agent-2', 'agent-3', 'agent-4', 'agent-5']);
  });

  it('coalesces agents.changed bursts', () => {
    const { events, sent, send } = harness();
    events.attach(send);
    for (let index = 0; index < 5; index++) events.push({ kind: 'agents_changed' });
    vi.advanceTimersByTime(1000);
    expect(sent.map((frame) => frame.name)).toEqual(['agents.changed', 'agents.changed']);
  });

  it('respects the agent and workspace allow-lists', () => {
    const { events, sent, send } = harness({ allowedAgents: ['a', 'b'], allowedWorkspaces: ['C:/repo'] });
    events.attach(send);
    sent.length = 0;
    events.push(status('a', 'working', 'idle'));
    events.push(status('c', 'working', 'idle'));
    events.push(status('b', 'working', 'idle', { workspace: 'C:/secret' }));
    expect(sent.map((frame) => frame.data.agentId)).toEqual(['a']);
  });

  it('streams MockRuntime status changes and produces frames that match the relay schema', async () => {
    const validate = await relaySchema();
    vi.useRealTimers();
    const { events, sent, send, adapter } = harness();
    events.start();
    events.attach(send);
    const [first] = await adapter.listAgents();
    adapter.setStatus(first!.id, 'done');
    adapter.replaceAgent(first!.id);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const notified = await events.notify({ text: 'Migration finished, 3 tests failing', paneId: 'mock:1' });
    expect(notified.sent).toBe(true);
    expect(sent.map((frame) => frame.name)).toEqual(['agents.changed', 'agent.status_changed', 'agents.changed', 'agent.notified']);
    expect(sent[1]!.data).toMatchObject({ agentId: first!.id, status: 'done', previousStatus: 'working', label: first!.label, workspace: first!.workspace, revision: null });
    for (const frame of sent) {
      expect(validate(frame), JSON.stringify(validate.errors)).toBe(true);
      expect(frame.eventId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(frame.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
    events.close();
    adapter.setStatus((await adapter.listAgents())[1]!.id, 'blocked');
    expect(sent).toHaveLength(4);
  });

  it('rejects malformed frames in the schema', async () => {
    const validate = await relaySchema();
    const good = eventFrame('agent.notified', { agentId: null, text: 'hi', audience: 'owner' });
    expect(validate(good)).toBe(true);
    expect(validate({ ...good, data: { agentId: null, text: '', audience: 'owner' } })).toBe(false);
    expect(validate({ ...good, data: { agentId: null, text: 'x'.repeat(1025), audience: 'owner' } })).toBe(false);
    expect(validate({ ...good, data: { agentId: null, text: 'hi', audience: 'everyone' } })).toBe(false);
    expect(validate({ ...good, data: { agentId: null, text: 'hi', audience: 'owner', channel: 'slack-alerts' } })).toBe(true);
    for (const channel of ['', 'Slack', '-alerts', 'a'.repeat(33), 'a b', 42])
      expect(validate({ ...good, data: { agentId: null, text: 'hi', audience: 'owner', channel } }), String(channel)).toBe(false);
    expect(validate({ ...good, name: 'agent.status_changed' })).toBe(false);
    expect(validate(eventFrame('agents.changed', { extra: 1 }))).toBe(false);
    expect(validate({ ...eventFrame('agents.changed', {}), output: 'pane text' })).toBe(false);
    expect(validate(eventFrame('agent.status_changed', { agentId: 'a', status: 'working', previousStatus: null, label: 'x', workspace: null, revision: null }))).toBe(true);
    expect(validate(eventFrame('agent.status_changed', { agentId: 'a', status: 'busy', previousStatus: null, label: 'x', workspace: null, revision: null }))).toBe(false);
    expect(validate({ ...eventFrame('agents.changed', {}), timestamp: 'yesterday' })).toBe(false);
  });
});

describe('notes', () => {
  it('validates length and strips control characters and likely secrets', () => {
    expect(() => cleanNote('')).toThrow(/empty/);
    expect(() => cleanNote('   ')).toThrow(/empty/);
    expect(() => cleanNote(42)).toThrow(/empty/);
    expect(() => cleanNote('x'.repeat(1025))).toThrow(/1024/);
    expect(cleanNote('😀'.repeat(1024))).toHaveLength(2048); // 1024 characters, 2048 UTF-16 units
    expect(() => cleanNote('\u001b[2J\u0007')).toThrow(/printable/);
    const clean = cleanNote('\u001b[31mDone\u001b[0m token=abcdef123456 and sk-abcdefghijklmnop\u0000');
    expect(clean).toBe('Done token=[REDACTED] and [REDACTED]');
  });

  it('resolves the calling pane, and reports not sent while disconnected', async () => {
    const adapter = new MockRuntime();
    const events = new ConnectorEvents(adapter);
    const agents = await adapter.listAgents();
    expect(await events.notify({ text: 'hello', paneId: 'mock:2' })).toEqual({ sent: false, agentId: agents[2]!.id });
    const sent: EventFrame[] = [];
    events.attach((frame) => { sent.push(frame); return true; });
    const result = await events.notify({ text: 'hello', paneId: 'not a pane id!' });
    expect(result).toMatchObject({ sent: true, agentId: null });
    expect(sent.at(-1)!.data).toEqual({ agentId: null, text: 'hello', audience: 'owner' });
    expect(result.eventId).toBe(sent.at(-1)!.eventId);
  });

  it('addresses a note to a channel and echoes the channel back', async () => {
    const validate = await relaySchema();
    const adapter = new MockRuntime();
    const events = new ConnectorEvents(adapter);
    expect(await events.notify({ text: 'hello', channel: 'deploys' })).toEqual({ sent: false, agentId: null, channel: 'deploys' });
    const sent: EventFrame[] = [];
    events.attach((frame) => { sent.push(frame); return true; });
    const result = await events.notify({ text: 'Release is live', channel: 'deploys' });
    expect(result).toMatchObject({ sent: true, channel: 'deploys', eventId: sent.at(-1)!.eventId });
    expect(sent.at(-1)!.data).toEqual({ agentId: null, text: 'Release is live', audience: 'owner', channel: 'deploys' });
    expect(validate(sent.at(-1))).toBe(true);
    // No channel: the frame and the reply are exactly as before.
    expect(await events.notify({ text: 'hi', channel: null })).not.toHaveProperty('channel');
    expect(sent.at(-1)!.data).not.toHaveProperty('channel');
    for (const channel of ['', 'Deploys', '-x', 'a'.repeat(33), 7]) {
      await expect(events.notify({ text: 'hi', channel }), String(channel)).rejects.toMatchObject({ code: 'invalid_argument' });
    }
    expect(sent).toHaveLength(3);
  });

  it('hides agents outside the allow-list and limits the note rate', async () => {
    const adapter = new MockRuntime();
    const agents = await adapter.listAgents();
    const events = new ConnectorEvents(adapter, { allowedAgents: [agents[0]!.id], notesPerMinute: 2 });
    events.attach(() => true);
    expect((await events.notify({ text: 'a', paneId: 'mock:0' })).agentId).toBe(agents[0]!.id);
    expect((await events.notify({ text: 'b', paneId: 'mock:1' })).agentId).toBeNull();
    await expect(events.notify({ text: 'c' })).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('is refused when the runtime does not share output', async () => {
    const adapter = new MockRuntime();
    adapter.getCapabilities = () => ({ readOutput: false, sendMessage: true });
    const events = new ConnectorEvents(adapter);
    events.attach(() => true);
    await expect(events.notify({ text: 'hello' })).rejects.toMatchObject({ code: 'unsupported_capability' });
  });
});
