import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import { ConnectorCore, ConnectorEvents, MockRuntime, pollDeviceToken, redeemEnrollment, requestDeviceCode, runRemoteClient } from '../src/core/index.js';

const load = async (name: string) => JSON.parse(await readFile(new URL(`../protocol/${name}`, import.meta.url), 'utf8')) as Record<string, unknown>;
const addFormats = ((addFormatsModule as unknown as { default?: unknown }).default ?? addFormatsModule) as (a: Ajv2020) => void;
const newAjv = () => {
  const instance = new Ajv2020({ allErrors: true, strict: true });
  addFormats(instance);
  return instance;
};

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

describe('protocol schemas', () => {
  it('compile and accept/reject representative relay messages', async () => {
    const relay = newAjv().compile(await load('relay-messages.schema.json'));
    const principal = { id: 'u', scopes: ['agents:read'] };
    expect(relay({ type: 'ping' })).toBe(true);
    expect(relay({ type: 'ping', extra: 1 })).toBe(false);
    expect(relay({ type: 'pong' })).toBe(true);
    expect(relay({ type: 'request', id: 'r1', tool: 'list_agents', args: {}, principal })).toBe(true);
    expect(relay({ type: 'request', id: 'r1', tool: 'rm_rf', args: {}, principal })).toBe(false);
    expect(relay({ type: 'response', id: 'r1', result: {} })).toBe(true);
    expect(relay({ type: 'response', id: 'r1', error: { code: 'busy', message: 'm', next_step: 'n' } })).toBe(true);
    expect(relay({ type: 'response', id: 'r1' })).toBe(false);
    expect(relay({ type: 'response', id: 'r1', result: {}, error: { code: 'c', message: 'm', next_step: 'n' } })).toBe(false);
    expect(relay({ type: 'response', id: 'r1', error: { code: 'c' } })).toBe(false);
    expect(relay({ type: 'nope' })).toBe(false);
  });

  it('validates every message the relay client sends, and requests the schema defines', async () => {
    const relay = newAjv().compile(await load('relay-messages.schema.json'));
    const server = createServer();
    const wss = new WebSocketServer({ server });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    closers.push(() => new Promise<void>((resolve) => { wss.close(); server.close(() => resolve()); }));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No listener address');

    const principal = { id: 'user-1', scopes: ['agents:read', 'agents:message'] };
    const outgoing = [
      { type: 'ping' },
      { type: 'request', id: 'r-ok', tool: 'list_agents', args: { limit: 1 }, principal },
      { type: 'request', id: 'r-err', tool: 'get_agent_status', args: { agentId: 'missing-agent' }, principal },
      { type: 'request', id: 'r-bad', tool: 'unknown_tool', args: {}, principal },
    ];
    for (const message of outgoing) expect(relay(message)).toBe(message.id !== 'r-bad' ? true : false);

    const fromClient: Array<Record<string, unknown>> = [];
    const done = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('client replies did not arrive')), 5_000);
      wss.once('connection', (ws) => {
        ws.on('message', (data) => {
          fromClient.push(JSON.parse(data.toString()) as Record<string, unknown>);
          if (fromClient.length === 4) { clearTimeout(timer); resolve(); }
        });
        for (const message of outgoing.slice(0, 3)) ws.send(JSON.stringify(message));
        ws.send(JSON.stringify(outgoing[3]));
      });
    });
    const abort = new AbortController();
    const core = new ConnectorCore(new MockRuntime());
    const running = runRemoteClient(core, { serverUrl: `http://127.0.0.1:${address.port}`, installationId: 'i', credential: 'c' }, {
      signal: abort.signal,
      onStatus: () => undefined,
      sleep: async () => new Promise((resolve) => setTimeout(resolve, 2)),
    }).catch(() => undefined);
    // The unknown tool is answered with an error response (core rejects it), so four client frames arrive.
    await done;
    abort.abort();
    await running;
    await core.close();

    expect(fromClient.map((m) => m.type).sort()).toEqual(['pong', 'response', 'response', 'response']);
    for (const message of fromClient) {
      expect(relay(message), JSON.stringify(message)).toBe(true);
    }
    const errors = fromClient.filter((m) => m.type === 'response' && 'error' in m);
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });

  it('validates the event frames the relay client streams, and resyncs with agents.changed after a reconnect', async () => {
    const relay = newAjv().compile(await load('relay-messages.schema.json'));
    const server = createServer();
    const wss = new WebSocketServer({ server });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    closers.push(() => new Promise<void>((resolve) => { wss.close(); server.close(() => resolve()); }));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No listener address');

    const runtime = new MockRuntime();
    const agents = await runtime.listAgents();
    const events = new ConnectorEvents(runtime);
    events.start();
    const connections: Array<{ features: unknown; frames: Array<Record<string, unknown>> }> = [];
    let resolveDone!: () => void;
    const done = new Promise<void>((resolve) => { resolveDone = resolve; });
    wss.on('connection', (ws, request) => {
      const connection = { features: request.headers['x-peerband-features'], frames: [] as Array<Record<string, unknown>> };
      connections.push(connection);
      ws.on('message', (data) => {
        const frame = JSON.parse(data.toString()) as Record<string, unknown>;
        connection.frames.push(frame);
        if (connections.length === 1 && frame.name === 'agents.changed') runtime.setStatus(agents[1]!.id, 'working');
        if (connections.length === 1 && frame.name === 'agent.status_changed') {
          void events.notify({ text: 'Done \u001b[31mred\u001b[0m password=hunter2', paneId: 'mock:1' }).then((result) => expect(result.sent).toBe(true));
        }
        if (connections.length === 1 && frame.name === 'agent.notified') ws.close(1011, 'restart');
        if (connections.length === 2 && frame.name === 'agents.changed') resolveDone();
      });
    });
    const abort = new AbortController();
    const core = new ConnectorCore(runtime);
    const running = runRemoteClient(core, { serverUrl: `http://127.0.0.1:${address.port}`, installationId: 'i', credential: 'c' }, {
      signal: abort.signal,
      events,
      onStatus: () => undefined,
      random: () => 0,
      // While disconnected, a status change happens; it must be dropped, not queued.
      sleep: async () => { if (connections.length === 1) runtime.setStatus(agents[2]!.id, 'idle'); await new Promise((resolve) => setTimeout(resolve, 2)); },
    }).catch(() => undefined);
    await done;
    await new Promise((resolve) => setTimeout(resolve, 100));
    abort.abort();
    await running;
    events.close();
    await core.close();

    expect(connections.map((connection) => connection.features)).toEqual(['events', 'events']);
    expect(connections[0]!.frames.map((frame) => frame.name)).toEqual(['agents.changed', 'agent.status_changed', 'agent.notified']);
    expect(connections[1]!.frames.map((frame) => frame.name)).toEqual(['agents.changed']);
    expect(connections[0]!.frames[1]!.data).toEqual({ agentId: agents[1]!.id, status: 'working', previousStatus: 'idle', label: agents[1]!.label, workspace: agents[1]!.workspace, revision: null });
    expect(connections[0]!.frames[2]!.data).toEqual({ agentId: agents[1]!.id, text: 'Done red password=[REDACTED]', audience: 'owner' });
    for (const frame of connections.flatMap((connection) => connection.frames)) expect(relay(frame), JSON.stringify(relay.errors)).toBe(true);
  });

  it('describes the enrollment request and response the client uses', async () => {
    const schema = await load('enrollment-redeem.schema.json');
    const ajv = newAjv();
    ajv.addSchema(schema, 'enrollment');
    const request = ajv.compile({ $ref: 'enrollment#/$defs/request' });
    const response = ajv.compile({ $ref: 'enrollment#/$defs/response' });
    const failure = ajv.compile({ $ref: 'enrollment#/$defs/errorResponse' });
    let body: unknown;
    const credentials = await redeemEnrollment('https://example.test', 'g'.repeat(24), 'workstation', async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ installation_id: 'i-1', credential: 'secret', machine_name: 'workstation', account_email: null }), { status: 200 });
    });
    expect(request(body)).toBe(true);
    expect(request({ grant: 'short', name: 'x' })).toBe(false);
    expect(response({ installation_id: 'i-1', credential: 'secret', machine_name: 'workstation', account_email: 'a@b.test' })).toBe(true);
    expect(response({ credential: 'secret' })).toBe(false);
    expect(failure({ detail: 'Enrollment grant is invalid, expired, or already used' })).toBe(true);
    expect(credentials.installationId).toBe('i-1');
  });

  it('describes the device login requests the client sends and the responses it accepts', async () => {
    const ajv = newAjv();
    ajv.addSchema(await load('device-authorization.schema.json'), 'device');
    const def = (name: string) => ajv.compile({ $ref: `device#/$defs/${name}` });
    const codeRequest = def('codeRequest');
    const codeResponse = def('codeResponse');
    const tokenRequest = def('tokenRequest');
    const tokenResponse = def('tokenResponse');
    const tokenError = def('tokenError');
    const rateLimited = def('rateLimited');
    const requestStatus = def('requestStatus');
    const decision = def('decisionResponse');

    const issued = { device_code: 'd'.repeat(43), user_code: 'WDJB-MJHT', verification_uri: 'https://peerband.com/device', verification_uri_complete: 'https://peerband.com/device?code=WDJB-MJHT', expires_in: 600, interval: 5 };
    const sent: Array<{ url: string; body: unknown }> = [];
    const replies = [
      { status: 400, body: { error: 'authorization_pending', error_description: 'Waiting' } },
      { status: 400, body: { error: 'slow_down', error_description: 'Slow down', interval: 10 } },
      { status: 200, body: { installation_id: 'i-2', credential: 'secret', machine_name: 'box', account_email: 'a@b.test' } },
    ];
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      sent.push({ url: String(url), body });
      const reply = String(url).endsWith('/api/device/code') ? { status: 200, body: issued } : replies.shift()!;
      return new Response(JSON.stringify(reply.body), { status: reply.status });
    }) as typeof fetch;
    const code = await requestDeviceCode('https://example.test', { clientVersion: '0.1.0', machineName: 'box', platform: 'win32' }, { fetch: fetcher });
    const credentials = await pollDeviceToken('https://example.test', code, { fetch: fetcher, sleep: async () => undefined });
    expect(credentials.installationId).toBe('i-2');

    expect(sent.map((s) => new URL(s.url).pathname)).toEqual(['/api/device/code', '/api/device/token', '/api/device/token', '/api/device/token']);
    expect(codeRequest(sent[0]!.body), JSON.stringify(codeRequest.errors)).toBe(true);
    for (const message of sent.slice(1)) expect(tokenRequest(message.body), JSON.stringify(tokenRequest.errors)).toBe(true);

    expect(codeResponse(issued)).toBe(true);
    expect(codeResponse({ ...issued, user_code: 'ABCD-EFGH' })).toBe(false); // vowels are not in the alphabet
    expect(codeResponse({ ...issued, device_code: 'short' })).toBe(false);
    expect(codeRequest({ client: 'other', client_version: '1' })).toBe(false);
    expect(codeRequest({ client: 'peerband-cli', client_version: '1', extra: true })).toBe(false);
    expect(tokenRequest({ device_code: 'x'.repeat(30), grant: 'no' })).toBe(false);

    expect(tokenResponse({ installation_id: 'i', credential: 'c', machine_name: null, account_email: null })).toBe(true);
    expect(tokenResponse({ credential: 'c' })).toBe(false);
    for (const error of ['authorization_pending', 'slow_down', 'access_denied', 'expired_token', 'invalid_grant']) expect(tokenError({ error, error_description: 'x' }), error).toBe(true);
    expect(tokenError({ error: 'slow_down', interval: 10 })).toBe(true);
    expect(tokenError({ error: 'server_on_fire' })).toBe(false);
    expect(rateLimited({ error: 'rate_limited', error_description: 'x' })).toBe(true);

    expect(requestStatus({ user_code: 'WDJB-MJHT', status: 'pending', machine_name: 'box', platform: 'win32', client: 'peerband-cli', client_version: '0.1.0', requested_at: '2026-01-01T00:00:00Z', expires_at: '2026-01-01T00:10:00Z', requester_ip: '203.0.113.x' })).toBe(true);
    expect(requestStatus({ user_code: 'WDJB-MJHT', status: 'maybe' })).toBe(false);
    expect(decision({ status: 'approved' })).toBe(true);
    expect(decision({ status: 'pending' })).toBe(false);
  });
});
