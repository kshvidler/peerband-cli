import { createServer, type Server, type Socket } from 'node:net';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { RuntimeEvent } from '../src/core/index.js';
import { HerdrAdapter } from '../src/runtime-herdr/index.js';

const fixture = fileURLToPath(new URL('../src/runtime-herdr/fixtures/herdr-api-0.9.3-installed.schema.json', import.meta.url));
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { await Promise.all(cleanups.splice(0).reverse().map((fn) => fn())); });

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function eventually<T>(check: () => T | undefined | false, what: string, timeoutMs = 5000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await pause(10);
  }
}

function agent(pane: string, terminal: string, status = 'working', revision = 1): Record<string, unknown> {
  return { terminal_id: terminal, agent_status: status, workspace_id: 'w1', tab_id: 'w1:t1', pane_id: pane, focused: false, revision, agent: 'claude', name: null, cwd: `C:/repo/${pane}` };
}

interface Subscriber { socket: Socket; subscriptions: Array<{ type: string; pane_id?: string }> }

/** A fake Herdr server: request/response methods plus a long-lived events.subscribe socket. */
async function fakeHerdr(options: { rejectSubscribe?: string } = {}) {
  const state = { agents: [agent('w1:p1', 'term-1'), agent('w1:p2', 'term-2', 'idle')] as Array<Record<string, unknown>> };
  const methods: string[] = [];
  const subscribers: Subscriber[] = [];
  const server: Server = createServer((socket) => {
    let data = '';
    socket.on('error', () => undefined);
    socket.on('data', (chunk) => {
      data += chunk.toString();
      const lines = data.split('\n');
      data = lines.pop() ?? '';
      for (const line of lines) {
        const request = JSON.parse(line) as { id: string; method: string; params: { subscriptions?: Subscriber['subscriptions'] } };
        methods.push(request.method);
        const reply = (body: Record<string, unknown>) => socket.write(`${JSON.stringify({ id: request.id, ...body })}\n`);
        if (request.method === 'ping') reply({ result: { type: 'pong', version: '0.9.3', protocol: 22 } });
        else if (request.method === 'agent.list') reply({ result: { type: 'agent_list', agents: state.agents } });
        else if (request.method === 'events.subscribe') {
          if (options.rejectSubscribe) { reply({ error: { code: options.rejectSubscribe, message: 'no' } }); continue; }
          const subscriber = { socket, subscriptions: request.params.subscriptions ?? [] };
          subscribers.push(subscriber);
          socket.once('close', () => subscribers.splice(subscribers.indexOf(subscriber), 1));
          reply({ result: { type: 'subscription_started' } });
        } else reply({ error: { code: 'invalid_request', message: 'unexpected' } });
      }
    });
  });
  const socketPath = process.platform === 'win32' ? `\\\\.\\pipe\\peerband-events-${process.pid}-${randomUUID()}` : join(tmpdir(), `he-${randomUUID().replaceAll('-', '').slice(0, 12)}.sock`);
  server.listen(socketPath);
  await once(server, 'listening');
  cleanups.push(async () => {
    for (const subscriber of [...subscribers]) subscriber.socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (process.platform !== 'win32') await rm(socketPath, { force: true });
  });
  const push = (event: string, data: Record<string, unknown>) => {
    for (const subscriber of subscribers) {
      const wanted = subscriber.subscriptions.some((item) => item.type === event && (item.pane_id === undefined || item.pane_id === data.pane_id));
      if (wanted) subscriber.socket.write(`${JSON.stringify({ event, data })}\n`);
    }
  };
  return { state, methods, subscribers, socketPath, push };
}

async function startAdapter(herdr: Awaited<ReturnType<typeof fakeHerdr>>) {
  const logs: string[] = [];
  const adapter = new HerdrAdapter({ schemaPath: fixture, socketPath: herdr.socketPath, log: (message) => logs.push(message), events: { settleMs: 10, listSettleMs: 10, sleep: (ms) => pause(Math.min(ms, 20)), random: () => 0 } });
  const events: RuntimeEvent[] = [];
  const stop = adapter.onEvent((event) => events.push(event));
  cleanups.push(async () => { stop(); await adapter.close(); });
  await eventually(() => herdr.subscribers.length === 1, 'the first subscription');
  return { adapter, events, logs };
}

describe('Herdr agent events', () => {
  it('subscribes per agent pane plus list events, with a request that matches the 0.9.3 schema', async () => {
    const herdr = await fakeHerdr();
    await startAdapter(herdr);
    expect(herdr.subscribers[0]!.subscriptions).toEqual([
      { type: 'pane.agent_status_changed', pane_id: 'w1:p1' },
      { type: 'pane.agent_status_changed', pane_id: 'w1:p2' },
      { type: 'pane.created' }, { type: 'pane.closed' }, { type: 'pane.exited' }, { type: 'pane.agent_detected' },
    ]);
  });

  it('maps panes to agent ids and reports transitions with previousStatus and the fresh revision', async () => {
    const herdr = await fakeHerdr();
    const { adapter, events } = await startAdapter(herdr);
    const agents = await adapter.listAgents();
    const first = agents.find((item) => item.workspace === 'C:/repo/w1:p1')!;
    herdr.state.agents[0] = agent('w1:p1', 'term-1', 'idle', 7);
    herdr.push('pane.agent_status_changed', { pane_id: 'w1:p1', workspace_id: 'w1', agent_status: 'idle', agent: 'claude', title: 'Some title' });
    const event = await eventually(() => events.find((item) => item.kind === 'status'), 'a status event');
    expect(event).toEqual({ kind: 'status', agentId: first.id, status: 'idle', previousStatus: 'working', label: first.label, workspace: first.workspace, revision: 7 });
    // The same status again is not a change; a new transition reports the previous one.
    herdr.push('pane.agent_status_changed', { pane_id: 'w1:p1', workspace_id: 'w1', agent_status: 'idle' });
    herdr.state.agents[0] = agent('w1:p1', 'term-1', 'blocked', 8);
    herdr.push('pane.agent_status_changed', { pane_id: 'w1:p1', workspace_id: 'w1', agent_status: 'blocked' });
    await eventually(() => events.filter((item) => item.kind === 'status').length === 2, 'the second status event');
    expect(events.filter((item) => item.kind === 'status')[1]).toMatchObject({ agentId: first.id, status: 'blocked', previousStatus: 'idle', revision: 8 });
    expect(herdr.methods).not.toContain('agent.read');
    expect(JSON.stringify(events)).not.toContain('Some title');
  });

  it('emits agents.changed and resubscribes when an agent appears or exits', async () => {
    const herdr = await fakeHerdr();
    const { events } = await startAdapter(herdr);
    herdr.state.agents.push(agent('w1:p3', 'term-3', 'idle'));
    herdr.push('pane.agent_detected', { type: 'pane_agent_detected', pane_id: 'w1:p3' });
    await eventually(() => events.some((item) => item.kind === 'agents_changed'), 'agents_changed');
    await eventually(() => herdr.subscribers.length === 1 && herdr.subscribers[0]!.subscriptions.some((item) => item.pane_id === 'w1:p3'), 'a subscription for the new pane');
    herdr.state.agents.splice(0, 1);
    const before = events.filter((item) => item.kind === 'agents_changed').length;
    herdr.push('pane.exited', { type: 'pane_exited', pane_id: 'w1:p1' });
    await eventually(() => events.filter((item) => item.kind === 'agents_changed').length > before, 'agents_changed after exit');
    await eventually(() => herdr.subscribers.length === 1 && !herdr.subscribers[0]!.subscriptions.some((item) => item.pane_id === 'w1:p1'), 'the exited pane dropped from the subscription');
  });

  it('resubscribes with backoff after Herdr drops the socket and tells clients to re-list', async () => {
    const herdr = await fakeHerdr();
    const { events, logs } = await startAdapter(herdr);
    const first = herdr.subscribers[0]!.socket;
    first.destroy();
    await eventually(() => herdr.subscribers.length === 1 && herdr.subscribers[0]!.socket !== first, 'a new subscription');
    await eventually(() => events.some((item) => item.kind === 'agents_changed'), 'agents_changed after resubscribe');
    herdr.push('pane.agent_status_changed', { pane_id: 'w1:p2', workspace_id: 'w1', agent_status: 'working' });
    await eventually(() => events.some((item) => item.kind === 'status' && item.status === 'working' && item.previousStatus === 'idle'), 'a status event on the new subscription');
    expect(logs.some((line) => /retrying/.test(line))).toBe(true);
    expect(logs.some((line) => /resumed/.test(line))).toBe(true);
  });

  it('logs once and runs without events when Herdr rejects the subscription', async () => {
    const herdr = await fakeHerdr({ rejectSubscribe: 'invalid_request' });
    const logs: string[] = [];
    const adapter = new HerdrAdapter({ schemaPath: fixture, socketPath: herdr.socketPath, log: (message) => logs.push(message), events: { sleep: () => pause(5), random: () => 0 } });
    const stop = adapter.onEvent(() => undefined);
    cleanups.push(async () => { stop(); await adapter.close(); });
    await eventually(() => logs.length > 0, 'a log line');
    await pause(150);
    expect(herdr.methods.filter((method) => method === 'events.subscribe')).toHaveLength(1);
    expect(logs).toEqual(['Agent events are off: Herdr rejected events.subscribe (invalid_request). Clients can still poll.']);
    // Requests keep working.
    expect(await adapter.listAgents()).toHaveLength(2);
  });

  it('resolves HERDR_PANE_ID to the agent id list_agents returns', async () => {
    const herdr = await fakeHerdr();
    const adapter = new HerdrAdapter({ schemaPath: fixture, socketPath: herdr.socketPath });
    cleanups.push(() => adapter.close());
    const agents = await adapter.listAgents();
    expect(await adapter.agentIdForPane('w1:p2')).toBe(agents.find((item) => item.workspace === 'C:/repo/w1:p2')!.id);
    expect(await adapter.agentIdForPane('w9:p9')).toBeUndefined();
  });
});
