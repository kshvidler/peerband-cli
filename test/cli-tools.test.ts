import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { labelRelayedMessage, saveCredentials } from '../src/core/index.js';
import { cleanupAll, runCli, tempDir } from './cli-helpers.js';

afterEach(cleanupAll);

interface Call { tool: string; args: Record<string, unknown>; auth: string | null }
type Reply = { status?: number; body?: unknown; raw?: string };

/** A PeerBand server: `reply(tool, args, n)` answers the n-th call of that tool. */
function server(reply: (tool: string, args: Record<string, unknown>, n: number) => Reply, calls: Call[] = []): typeof fetch {
  const counts = new Map<string, number>();
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const tool = url.pathname.split('/').pop()!;
    const args = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push({ tool: url.pathname === '/api/installation/tools' ? 'GET tools' : tool, args, auth: new Headers(init?.headers).get('authorization') });
    const n = (counts.get(tool) ?? 0) + 1;
    counts.set(tool, n);
    const { status = 200, body, raw } = reply(tool, args, n);
    return new Response(raw ?? JSON.stringify(body ?? {}), { status });
  }) as typeof fetch;
}

async function loggedIn(): Promise<NodeJS.ProcessEnv> {
  const home = await tempDir();
  await saveCredentials({ serverUrl: 'https://peerband.com', installationId: 'inst-here', credential: 'machine-secret', machineName: 'work-box' }, join(home, 'credentials.json'));
  return { PEERBAND_CONFIG_HOME: home };
}

/** A fake clock: sleep advances it, so long waits run instantly. */
function clock() {
  let now = 1_000_000;
  return { now: () => now, sleep: async (ms: number) => void (now += ms), advance: (ms: number) => void (now += ms) };
}

const MACHINES = { machines: [{ installation_id: 'inst-here', name: 'work-box', online: true, created_at: 'x', shared_by: null, access: 'owner' }] };

describe('PeerBand tools from the CLI', () => {
  it('lists machines with the machine credential and prints the MCP result as JSON', async () => {
    const env = await loggedIn();
    const calls: Call[] = [];
    const result = await runCli(['machines'], { env, overrides: { fetch: server(() => ({ body: MACHINES }), calls) } });
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(MACHINES);
    expect(calls).toEqual([{ tool: 'list_machines', args: {}, auth: 'Bearer machine-secret' }]);
    expect(result.stdout + result.stderr).not.toContain('machine-secret');
  });

  it('passes list_agents filters, --here and --installation', async () => {
    const env = await loggedIn();
    const calls: Call[] = [];
    const fetch = server(() => ({ body: { agents: [] } }), calls);
    expect((await runCli(['agents', '--here', '--status', 'idle', '--limit', '5', '--workspace', 'api'], { env, overrides: { fetch } })).code).toBe(0);
    expect((await runCli(['agents', '--installation', 'inst-2'], { env, overrides: { fetch } })).code).toBe(0);
    expect((await runCli(['agents'], { env, overrides: { fetch } })).code).toBe(0);
    expect(calls.map((call) => call.args)).toEqual([
      { installation_id: 'inst-here', status: 'idle', workspace: 'api', limit: 5 },
      { installation_id: 'inst-2' },
      {},
    ]);
    expect((await runCli(['agents', '--limit', '0'], { env, overrides: { fetch } })).code).toBe(2);
    expect((await runCli(['agents', '--here', '--installation', 'x'], { env, overrides: { fetch } })).code).toBe(1);
  });

  it('runs status, output, send and request with the MCP arguments', async () => {
    const env = await loggedIn();
    const calls: Call[] = [];
    const fetch = server((tool) => ({
      body: tool === 'get_agent_output' ? { text: 'line one\nline \u001b[31mtwo', truncated: false, observedAt: 'x', untrusted: true }
        : tool === 'send_agent_message' ? { requestId: 'r1', state: 'queued' } : { ok: tool },
    }), calls);
    const opts = { env, overrides: { fetch } };
    expect((await runCli(['agent', 'status', 'a1', '--installation', 'm2'], opts)).code).toBe(0);
    const text = await runCli(['agent', 'output', 'a1', '--installation', 'm2', '--lines', '80', '--text'], opts);
    expect(text.stdout).toBe('line one\nline  [31mtwo\n');
    const json = await runCli(['agent', 'output', 'a1', '--installation', 'm2', '--bytes', '100', '--cursor', 'c1'], opts);
    expect(JSON.parse(json.stdout).untrusted).toBe(true);
    const sent = await runCli(['agent', 'send', 'a1', 'Run', 'the', 'tests', '--installation', 'm2'], opts);
    expect(JSON.parse(sent.stdout)).toEqual({ requestId: 'r1', state: 'queued' });
    await runCli(['agent', 'send', 'a1', 'Again', '--installation', 'm2', '--key', 'my-key-0123456789'], opts);
    await runCli(['request', 'r1', '--installation', 'm2'], opts);
    expect(calls.map(({ tool, args }) => [tool, args])).toEqual([
      ['get_agent_status', { installation_id: 'm2', agent_id: 'a1' }],
      ['get_agent_output', { installation_id: 'm2', agent_id: 'a1', lines: 80 }],
      ['get_agent_output', { installation_id: 'm2', agent_id: 'a1', bytes: 100, cursor: 'c1' }],
      ['send_agent_message', { installation_id: 'm2', agent_id: 'a1', message: 'Run the tests', idempotency_key: expect.stringMatching(/^cli-[0-9a-f-]{36}$/) }],
      ['send_agent_message', { installation_id: 'm2', agent_id: 'a1', message: 'Again', idempotency_key: 'my-key-0123456789' }],
      ['get_request_status', { installation_id: 'm2', request_id: 'r1' }],
    ]);
    expect((await runCli(['agent', 'send', 'a1', 'x', '--key', 'short'], opts)).code).toBe(2);
    expect((await runCli(['agent', 'send', 'a1'], opts)).code).toBe(2);
    expect((await runCli(['agent', 'poke', 'a1'], opts)).code).toBe(2);
    expect((await runCli(['agent', 'status'], opts)).code).toBe(2);
  });

  it('reports a tool error as the MCP error object and exit code 1', async () => {
    const env = await loggedIn();
    const error = { code: 'write_disabled', message: 'This machine does not accept messages.', next_step: 'Ask the owner.' };
    const result = await runCli(['agent', 'send', 'a1', 'hi'], { env, overrides: { fetch: server(() => ({ status: 403, body: { error } })) } });
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({ error });
    expect(result.stderr).toContain('write_disabled: This machine does not accept messages.');
    expect(result.stderr).toContain('Ask the owner.');
  });

  it('explains an old server, a revoked login, no login, and keeps the key when a write may have arrived', async () => {
    const env = await loggedIn();
    const old = await runCli(['machines'], { env, overrides: { fetch: server(() => ({ status: 404, raw: '{"detail":"Not Found"}' })) } });
    expect(old.code).toBe(1);
    expect(old.stderr).toContain("doesn't support agent tools from the CLI yet");
    const revoked = await runCli(['machines'], { env, overrides: { fetch: server(() => ({ status: 401 })) } });
    expect(revoked.stderr).toContain('peerband login');
    expect((await runCli(['machines'], { env: { PEERBAND_CONFIG_HOME: await tempDir() } })).code).toBe(3);
    const offline = (async () => { throw new Error('socket hang up'); }) as unknown as typeof fetch;
    const lost = await runCli(['agent', 'send', 'a1', 'hi', '--key', 'retry-key-0123456789'], { env, overrides: { fetch: offline } });
    expect(lost.code).toBe(1);
    expect(lost.stderr).toContain('--key retry-key-0123456789');
  });

  it('waits longer than one call by calling wait_for_agent again', async () => {
    const env = await loggedIn();
    const time = clock();
    const calls: Call[] = [];
    const fetch = server((_tool, args, n) => {
      time.advance(Number(args.timeout_seconds) * 1000);
      return { body: n < 3 ? { matched: false, reason: 'timeout', status: 'working', waited_seconds: args.timeout_seconds } : { matched: true, reason: 'status_reached', status: 'idle', waited_seconds: 4 } };
    }, calls);
    const result = await runCli(['agent', 'wait', 'a1', '--here', '--until', 'idle,blocked', '--timeout', '600'], { env, overrides: { fetch, now: time.now, sleep: time.sleep } });
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ matched: true, reason: 'status_reached', status: 'idle' });
    expect(calls.map((call) => call.args)).toEqual([0, 1, 2].map(() => ({ installation_id: 'inst-here', agent_id: 'a1', statuses: ['idle', 'blocked'], timeout_seconds: 50 })));
    const short = await runCli(['agent', 'wait', 'a1', '--timeout', '20'], { env, overrides: { fetch: server(() => ({ body: { matched: false, reason: 'timeout' } }), calls) } });
    expect(short.code).toBe(0);
    expect(calls.at(-1)!.args).toEqual({ agent_id: 'a1', timeout_seconds: 20 });
  });

  it('asks an agent: one call within 50 seconds, then follows it like an MCP task', async () => {
    const env = await loggedIn();
    const time = clock();
    const calls: Call[] = [];
    const fetch = server((tool, args) => {
      if (tool === 'ask_agent') {
        time.advance(50_000);
        return { body: { reason: 'timeout', agent_id: 'a1', installation_id: 'inst-here', status: 'working', started_working: true, delivery: { request_id: 'r1', state: 'delivered' }, waited_seconds: 50, note: 'n', next_step: 'keep waiting' } };
      }
      if (tool === 'wait_for_agent') {
        time.advance(30_000);
        return { body: { matched: true, reason: 'status_reached', status: 'idle', agent_id: args.agent_id } };
      }
      if (tool === 'get_request_status') return { body: { requestId: 'r1', state: 'delivered' } };
      return { body: { text: 'All 120 tests pass.', untrusted: true } };
    }, calls);
    const result = await runCli(['agent', 'ask', 'a1', 'Run', 'the', 'tests', '--here', '--timeout', '900', '--output-lines', '40'], { env, overrides: { fetch, now: time.now, sleep: time.sleep } });
    expect(result.code).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out).toMatchObject({ reason: 'finished', status: 'idle', started_working: true, delivery: { request_id: 'r1', state: 'delivered' }, output: { text: 'All 120 tests pass.' }, waited_seconds: 80 });
    expect(out.next_step).toBeUndefined();
    expect(calls.map(({ tool, args }) => [tool, args])).toEqual([
      ['ask_agent', { installation_id: 'inst-here', agent_id: 'a1', message: 'Run the tests', idempotency_key: expect.any(String), timeout_seconds: 50, output_lines: 40 }],
      ['wait_for_agent', { agent_id: 'a1', installation_id: 'inst-here', statuses: ['idle', 'done', 'blocked'], timeout_seconds: 50 }],
      ['get_request_status', { installation_id: 'inst-here', request_id: 'r1' }],
      ['get_agent_output', { agent_id: 'a1', installation_id: 'inst-here', lines: 40 }],
    ]);
    calls.length = 0;
    const plain = await runCli(['agent', 'ask', 'a1', 'Quick one'], { env, overrides: { fetch, now: time.now, sleep: time.sleep } });
    expect(JSON.parse(plain.stdout).reason).toBe('timeout');
    expect(calls.map((call) => call.tool)).toEqual(['ask_agent']);
  });

  it('controls the environment of this machine with the MCP actions', async () => {
    const env = await loggedIn();
    const calls: Call[] = [];
    const fetch = server(() => ({ body: { requestId: 'e1', state: 'queued' } }), calls);
    const opts = { env, overrides: { fetch } };
    expect((await runCli(['env', 'list', '--here'], opts)).code).toBe(0);
    expect((await runCli(['env', 'agent.start', '--here', '--pane-id', 'p4', '--name', 'reviewer', '--kind', 'claude'], opts)).code).toBe(0);
    expect((await runCli(['env', 'tab.create', '--here', '--workspace-id', 'w1', '--cwd', '/src', '--label', 'tests'], opts)).code).toBe(0);
    expect(calls.map(({ tool, args }) => [tool, args])).toEqual([
      ['list_environment', { installation_id: 'inst-here' }],
      ['control_environment', { installation_id: 'inst-here', action: 'agent.start', idempotency_key: expect.any(String), pane_id: 'p4', name: 'reviewer', kind: 'claude' }],
      ['control_environment', { installation_id: 'inst-here', action: 'tab.create', idempotency_key: expect.any(String), workspace_id: 'w1', cwd: '/src', label: 'tests' }],
    ]);
    expect((await runCli(['env', 'list'], opts)).code).toBe(2);
    expect((await runCli(['env', 'pane.split', '--here', '--pane-id', 'p1'], opts)).code).toBe(2);
    expect((await runCli(['env', 'pane.focus', '--here', '--pane-id', 'p1', '--cwd', '/x'], opts)).code).toBe(2);
    expect((await runCli(['env', 'pane.send_input', '--here', '--pane-id', 'p1'], opts)).code).toBe(2);
    expect(calls).toHaveLength(3);
  });

  it('runs the concierge tools and can wait for an answer', async () => {
    const env = await loggedIn();
    const time = clock();
    const calls: Call[] = [];
    const fetch = server((tool, _args, n) => ({
      body: tool === 'concierge_ask' ? { run_id: 'ccr_1', status: 'queued' }
        : tool === 'concierge_get_run' ? { run_id: 'ccr_1', status: n < 2 ? 'running' : 'completed', answer: n < 2 ? null : 'All idle.' }
        : { notes: [] },
    }), calls);
    const opts = { env, overrides: { fetch, now: time.now, sleep: time.sleep } };
    const asked = await runCli(['concierge', 'ask', 'How', 'are', 'my', 'agents?', '--wait', '60'], opts);
    expect(JSON.parse(asked.stdout)).toEqual({ run_id: 'ccr_1', status: 'completed', answer: 'All idle.' });
    await runCli(['concierge', 'inbox', '--unread', '--limit', '5'], opts);
    await runCli(['concierge', 'reply', 'n1', 'Yes,', 'go', 'ahead'], opts);
    await runCli(['concierge', 'cancel', 'ccr_1'], opts);
    expect(calls.map(({ tool, args }) => [tool, args])).toEqual([
      ['concierge_ask', { request: 'How are my agents?', idempotency_key: expect.any(String) }],
      ['concierge_get_run', { run_id: 'ccr_1' }],
      ['concierge_get_run', { run_id: 'ccr_1' }],
      ['concierge_inbox', { unread_only: true, limit: 5 }],
      ['concierge_reply', { note_id: 'n1', message: 'Yes, go ahead', idempotency_key: expect.any(String) }],
      ['concierge_cancel', { run_id: 'ccr_1' }],
    ]);
    expect((await runCli(['concierge', 'dance'], opts)).code).toBe(2);
  });

  it('lists the tools and calls any tool by name with JSON arguments', async () => {
    const env = await loggedIn();
    const calls: Call[] = [];
    const fetch = server((tool) => ({ body: tool === 'tools' ? { tools: ['list_machines'] } : { ok: true } }), calls);
    const listed = await runCli(['tools'], { env, overrides: { fetch } });
    expect(JSON.parse(listed.stdout)).toEqual({ tools: ['list_machines'] });
    const raw = await runCli(['tool', 'get_agent_status', '{"agent_id":"a1","installation_id":"m2"}'], { env, overrides: { fetch } });
    expect(raw.code).toBe(0);
    expect(calls.at(-1)).toMatchObject({ tool: 'get_agent_status', args: { agent_id: 'a1', installation_id: 'm2' } });
    expect((await runCli(['tool', 'get_agent_status', '{bad'], { env, overrides: { fetch } })).code).toBe(2);
    expect((await runCli(['tool', 'Bad-Name'], { env, overrides: { fetch } })).code).toBe(2);
  });

  it('is in the help', async () => {
    const help = (await runCli(['--help'])).stdout;
    for (const name of ['machines', 'agents', 'agent', 'request', 'env', 'concierge', 'tools', 'tool']) expect(help).toMatch(new RegExp(`\\n\\s+${name}\\s`));
    expect((await runCli(['agent', '--help'])).stdout).toContain('ask_agent');
  });
});

describe('messages sent through the CLI', () => {
  it('tell the receiving agent that another agent sent them with the owner login', () => {
    const text = labelRelayedMessage('Run the tests.', { id: 'u', scopes: [], role: 'owner', app: 'PeerBand CLI' });
    expect(text.split('\n')[0]).toContain('From a coding agent working for your user, the owner of this machine, sent through the PeerBand CLI');
    expect(text.endsWith('\n\nRun the tests.')).toBe(true);
    const guest = labelRelayedMessage('hi', { id: 'g', scopes: [], role: 'guest', email: 'g@example.test', app: 'PeerBand CLI' });
    expect(guest).toContain('From shared user g@example.test via PeerBand CLI, who is NOT the owner');
  });
});
