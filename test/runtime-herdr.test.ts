import { createServer, type Server } from 'node:net';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { HerdrAdapter, HerdrSocketClient, loadHerdrSchema } from '../src/runtime-herdr/index.js';

const fixture = fileURLToPath(new URL('../src/runtime-herdr/fixtures/herdr-api-0.9.3-installed.schema.json', import.meta.url));
const servers: Server[] = [];
const clients: HerdrSocketClient[] = [];
const socketPaths: string[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  if (process.platform !== 'win32') await Promise.all(socketPaths.splice(0).map((path) => rm(path, { force: true }).catch(() => undefined)));
});

describe('Herdr schema validation', () => {
  it('loads and validates the pinned installed 0.9.3 schema', async () => {
    const schema = await loadHerdrSchema({ schemaPath: fixture });
    expect(schema.schema.protocol).toBe(22);
    expect(schema.writesHaveAtomicOccupantGuard).toBe(false);
  });
});

describe('Herdr socket client', () => {
  it('correlates concurrent responses even when Herdr replies out of order', async () => {
    const { socketPath } = await fakeSocket((socket) => {
      let data = '';
      socket.on('data', (chunk) => {
        data += chunk.toString();
        const lines = data.split('\n');
        data = lines.pop() ?? '';
        for (const line of lines) {
          const request = JSON.parse(line) as { id: string; method: string };
          setTimeout(() => socket.write(`${JSON.stringify({ id: request.id, result: { echo: request.method } })}\n`), request.method === 'slow' ? 20 : 0);
        }
      });
    });
    const client = new HerdrSocketClient({ socketPath });
    clients.push(client);
    const [a, b] = await Promise.all([client.request('slow'), client.request('fast')]);
    expect(a).toEqual({ echo: 'slow' });
    expect(b).toEqual({ echo: 'fast' });
  });

  it('reserves in-flight capacity before concurrent socket opens', async () => {
    let requestCount = 0;
    const { socketPath } = await fakeSocket((socket) => respond(socket, (request) => {
      requestCount += 1;
      return { echo: request.method };
    }));
    const client = new HerdrSocketClient({ socketPath, maxPending: 1 });
    clients.push(client);
    const first = client.request('first');
    await expect(client.request('second')).rejects.toMatchObject({ code: 'runtime_unavailable' });
    await expect(first).resolves.toEqual({ echo: 'first' });
    expect(requestCount).toBe(1);
  });

  it('rejects malformed and oversized response lines', async () => {
    const malformed = await fakeSocket((socket) => socket.on('data', () => socket.write('not-json\n')));
    const malformedClient = new HerdrSocketClient({ socketPath: malformed.socketPath, timeoutMs: 500 });
    clients.push(malformedClient);
    await expect(malformedClient.request('ping')).rejects.toMatchObject({ code: 'protocol_error' });

    const oversized = await fakeSocket((socket) => socket.on('data', () => socket.write(`${'x'.repeat(600)}\n`)));
    const oversizedClient = new HerdrSocketClient({ socketPath: oversized.socketPath, maxLineBytes: 512, timeoutMs: 500 });
    clients.push(oversizedClient);
    await expect(oversizedClient.request('ping')).rejects.toMatchObject({ code: 'protocol_error' });
  });

  it('reports delivery uncertainty when the peer disconnects after a prompt request', async () => {
    const { socketPath } = await fakeSocket((socket) => socket.once('data', () => socket.destroy()));
    const client = new HerdrSocketClient({ socketPath, timeoutMs: 500 });
    clients.push(client);
    await expect(client.request('agent.prompt', { target: 'w:p', text: 'continue' })).rejects.toMatchObject({ code: 'delivery_unknown' });
  });
});

describe('Herdr adapter identity and write policy', () => {
  it.each(['working', 'blocked', 'unknown'])('falls back to a bounded visible read for %s agents when history needs idle', async (status) => {
    const reads: unknown[] = [];
    const { socketPath } = await fakeSocket((socket) => respond(socket, (request) => {
      if (request.method === 'ping') return { type: 'pong', version: '0.9.3', protocol: 22 };
      if (request.method === 'agent.list') return { type: 'agent_list', agents: [agentInfo('terminal-one', status)] };
      const params = request.params;
      reads.push(params);
      if (params?.source === 'recent') return { error: { code: 'agent_not_idle', message: 'History requires idle' } };
      return paneRead('Current screen', 'visible');
    }));
    const adapter = new HerdrAdapter({ schemaPath: fixture, socketPath });
    try {
      const [agent] = await adapter.listAgents();
      const output = await adapter.readOutput(agent!.id, { lines: 80, bytes: 512 });
      expect(reads).toEqual(['recent', 'visible'].map((source) => ({ target: 'workspace-1-1', source, format: 'text', lines: 80, strip_ansi: true })));
      expect(output).toMatchObject({ text: 'Current screen', source: 'visible', truncated: true, untrusted: true });
    } finally { await adapter.close(); }
  });

  it.each(['success', 'pane_not_found'])('does not retry a history read on %s', async (outcome) => {
    let reads = 0;
    const { socketPath } = await fakeSocket((socket) => respond(socket, (request) => {
      if (request.method === 'ping') return { type: 'pong', version: '0.9.3', protocol: 22 };
      if (request.method === 'agent.list') return { type: 'agent_list', agents: [agentInfo('terminal-one')] };
      reads += 1;
      return outcome === 'success' ? paneRead('History', 'recent') : { error: { code: outcome, message: 'Pane missing' } };
    }));
    const adapter = new HerdrAdapter({ schemaPath: fixture, socketPath });
    try {
      const [agent] = await adapter.listAgents();
      const output = adapter.readOutput(agent!.id);
      if (outcome === 'success') await expect(output).resolves.toMatchObject({ text: 'History', truncated: false });
      else await expect(output).rejects.toMatchObject({ code: outcome });
      expect(reads).toBe(1);
    } finally { await adapter.close(); }
  });

  it('sends only to a unique live named agent', async () => {
    let prompt: unknown;
    const { socketPath } = await fakeSocket((socket) => respond(socket, (request) => {
      if (request.method === 'ping') return { type: 'pong', version: '0.9.3', protocol: 22 };
      if (request.method === 'agent.prompt') { prompt = (request as { params?: unknown }).params; return { type: 'agent_prompted', agent: agentInfo('terminal-one') }; }
      return { type: 'agent_list', agents: [{ ...agentInfo('terminal-one'), name: 'coding-agent' }] };
    }));
    const adapter = new HerdrAdapter({ schemaPath: fixture, socketPath });
    const [agent] = await adapter.listAgents();
    expect(agent!.capabilities.sendMessage).toBe(true);
    await adapter.sendMessage(agent!.id, 'continue');
    expect(prompt).toEqual({ target: 'coding-agent', text: 'continue' });
    await adapter.close();
  });

  it('uses a current pane target when the live name is invalid or ambiguous', async () => {
    const prompts: unknown[] = [];
    const { socketPath } = await fakeSocket((socket) => respond(socket, (request) => {
      if (request.method === 'ping') return { type: 'pong', version: '0.9.3', protocol: 22 };
      if (request.method === 'agent.prompt') { prompts.push((request as { params?: unknown }).params); return { type: 'agent_prompted', agent: agentInfo('terminal-one') }; }
      return { type: 'agent_list', agents: [
        { ...agentInfo('terminal-one'), pane_id: 'workspace-1-1', name: 'Coding task' },
        { ...agentInfo('terminal-two'), pane_id: 'workspace-2-1', workspace_id: 'workspace-2', name: 'shared' },
        { ...agentInfo('terminal-three'), pane_id: 'workspace-3-1', workspace_id: 'workspace-3', name: 'shared' },
      ] };
    }));
    const adapter = new HerdrAdapter({ schemaPath: fixture, socketPath });
    const agents = await adapter.listAgents();
    expect(agents.map((agent) => agent.capabilities.sendMessage)).toEqual([true, true, true]);
    for (const agent of agents) await adapter.sendMessage(agent.id, 'continue');
    expect(prompts).toEqual([
      { target: 'workspace-1-1', text: 'continue' },
      { target: 'workspace-2-1', text: 'continue' },
      { target: 'workspace-3-1', text: 'continue' },
    ]);
    await adapter.close();
  });

  it('rejects a handle that becomes stale during the pre-send refresh', async () => {
    let listCount = 0;
    const { socketPath } = await fakeSocket((socket) => respond(socket, (request) => {
      if (request.method === 'ping') return { type: 'pong', version: '0.9.3', protocol: 22 };
      if (request.method === 'agent.prompt') return { type: 'agent_prompted' };
      listCount += 1;
      const terminal = listCount >= 3 ? 'terminal-replacement' : 'terminal-one';
      return { type: 'agent_list', agents: [{ ...agentInfo(terminal), name: 'coding-agent' }] };
    }));
    const adapter = new HerdrAdapter({ schemaPath: fixture, socketPath });
    const [agent] = await adapter.listAgents();
    await expect(adapter.sendMessage(agent!.id, 'continue')).rejects.toMatchObject({ code: 'stale_target' });
    await adapter.close();
  });

  it('retires a handle when the pane occupant generation changes', async () => {
    let terminalId = 'terminal-one';
    let paneId = 'workspace-1-1';
    let workspaceId = 'workspace-1';
    const { socketPath } = await fakeSocket((socket) => respond(socket, (request) => {
      if (request.method === 'ping') return { type: 'pong', version: '0.9.3', protocol: 22 };
      const agent = { ...agentInfo(terminalId), pane_id: paneId, workspace_id: workspaceId };
      if (request.method === 'agent.list') return { type: 'agent_list', agents: [agent] };
      return { type: 'agent_info', agent };
    }));
    const adapter = new HerdrAdapter({ schemaPath: fixture, socketPath, machineId: 'test-machine' });
    const before = (await adapter.listAgents())[0]!;
    paneId = 'workspace-2-1';
    workspaceId = 'workspace-2';
    const moved = (await adapter.listAgents())[0]!;
    expect(moved.id).toBe(before.id);
    terminalId = 'terminal-two';
    const after = (await adapter.listAgents())[0]!;
    expect(after.id).not.toBe(before.id);
    await expect(adapter.getAgent(before.id)).rejects.toMatchObject({ code: 'stale_target' });
    expect(adapter.getCapabilities().sendMessage).toBe(true);
    await adapter.close();
  });

  it('rejects prompts for blocked agents with an explicit status error', async () => {
    const { socketPath } = await fakeSocket((socket) => respond(socket, (request) => request.method === 'ping'
      ? { type: 'pong', version: '0.9.3', protocol: 22 }
      : { type: 'agent_list', agents: [agentInfo('terminal-blocked', 'blocked')] }));
    const adapter = new HerdrAdapter({ schemaPath: fixture, socketPath });
    const [agent] = await adapter.listAgents();
    await expect(adapter.sendMessage(agent!.id, 'try again')).rejects.toMatchObject({ code: 'agent_blocked' });
    await adapter.close();
  });
});

async function fakeSocket(onConnection: (socket: import('node:net').Socket) => void): Promise<{ socketPath: string }> {
  const server = createServer(onConnection);
  servers.push(server);
  const socketPath = process.platform === 'win32' ? `\\\\.\\pipe\\peerband-test-${process.pid}-${randomUUID()}` : join(tmpdir(), `hc-${randomUUID().replaceAll('-', '').slice(0, 12)}.sock`);
  if (process.platform !== 'win32') expect(Buffer.byteLength(socketPath, 'utf8')).toBeLessThan(104);
  socketPaths.push(socketPath);
  server.listen(socketPath);
  await once(server, 'listening');
  return { socketPath };
}

function respond(socket: import('node:net').Socket, result: (request: { id: string; method: string; params?: Record<string, unknown> }) => unknown): void {
  let data = '';
  socket.on('data', (chunk) => {
    data += chunk.toString();
    const lines = data.split('\n');
    data = lines.pop() ?? '';
    for (const line of lines) {
      const request = JSON.parse(line) as { id: string; method: string };
      const response = result(request);
      socket.write(`${JSON.stringify(response && typeof response === 'object' && 'error' in response ? { id: request.id, error: response.error } : { id: request.id, result: response })}\n`);
    }
  });
}

function paneRead(text: string, source: string): Record<string, unknown> {
  return { type: 'pane_read', read: { pane_id: 'workspace-1-1', workspace_id: 'workspace-1', tab_id: 'workspace-1:1', source, format: 'text', text, revision: 1, truncated: false } };
}

function agentInfo(terminalId: string, status = 'working'): Record<string, unknown> {
  return {
    terminal_id: terminalId,
    agent_status: status,
    workspace_id: 'workspace-1',
    tab_id: 'workspace-1:1',
    pane_id: 'workspace-1-1',
    focused: false,
    revision: 1,
    agent: 'codex',
    name: 'Coding task',
    cwd: 'C:/repo',
  };
}
