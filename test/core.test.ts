import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ConnectError,
  ConnectorCore,
  MockRuntime,
  sanitizeOutput,
  type AgentRecord,
  type OutputOptions,
  type OutputResult,
  type RuntimeAdapter,
} from '../src/core/index.js';

const principal = { id: 'alice', scopes: ['agents:read', 'agents:message'] };
const key = 'request-key-000001';

describe('ConnectorCore security and delivery', () => {
  const directories: string[] = [];
  afterEach(async () => Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

  it('enforces scopes and configured agent/workspace allowlists on reads and writes', async () => {
    const runtime = new MockRuntime();
    const [allowed, denied] = await runtime.listAgents();
    const core = new ConnectorCore(runtime, { writesEnabled: true, allowedAgents: [allowed!.id], allowedWorkspaces: [allowed!.workspace] });
    await expect(core.execute('get_agent_status', { agentId: allowed!.id }, { id: 'bob', scopes: [] })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(core.execute('get_agent_status', { agentId: denied!.id }, principal)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(core.execute('send_agent_message', { agentId: allowed!.id, message: 'Do the task', idempotencyKey: key }, { id: 'bob', scopes: ['agents:read'] })).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('dispatches concurrent submissions with the same key exactly once', async () => {
    const runtime = new CountingRuntime();
    const [agent] = await runtime.listAgents();
    const core = new ConnectorCore(runtime, { writesEnabled: true });
    const input = { agentId: agent!.id, message: 'One instruction', idempotencyKey: key };
    const [left, right] = await Promise.all([
      core.execute('send_agent_message', input, principal),
      core.execute('send_agent_message', input, principal),
    ]);
    expect(left.requestId).toBe(right.requestId);
    await runtime.started;
    expect(runtime.sendCount).toBe(1);
    await core.close();
  });

  it('isolates receipts by principal and requires read scope to query status', async () => {
    const runtime = new MockRuntime();
    const [agent] = await runtime.listAgents();
    const core = new ConnectorCore(runtime, { writesEnabled: true });
    const receipt = await core.execute('send_agent_message', { agentId: agent!.id, message: 'Private', idempotencyKey: key }, principal);
    await expect(core.execute('get_request_status', { requestId: receipt.requestId }, { id: 'alice', scopes: [] })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(core.execute('get_request_status', { requestId: receipt.requestId }, { id: 'bob', scopes: ['agents:read'] })).rejects.toMatchObject({ code: 'request_not_found' });
  });

  it('deduplicates the same scoped payload and rejects key reuse for a different payload', async () => {
    const runtime = new MockRuntime();
    const [agent] = await runtime.listAgents();
    const core = new ConnectorCore(runtime, { writesEnabled: true });
    const first = await core.execute('send_agent_message', { agentId: agent!.id, message: 'Add tests', idempotencyKey: key }, principal);
    const duplicate = await core.execute('send_agent_message', { agentId: agent!.id, message: 'Add tests', idempotencyKey: key }, principal);
    expect(first.requestId).toBe(duplicate.requestId);
    await expect(core.execute('send_agent_message', { agentId: agent!.id, message: 'Different request', idempotencyKey: key }, principal)).rejects.toMatchObject({ code: 'idempotency_conflict' });
  });

  it('does not confuse regex match offsets with secret prefixes during redaction', () => {
    const result = sanitizeOutput('prefix sk-1234567890abcdefghijkl suffix api_key=supersecret');
    expect(result.text).toBe('prefix [REDACTED] suffix api_key=[REDACTED]');
  });

  it('marks known pre-delivery rejection failed and ambiguous adapter errors delivery_unknown', async () => {
    const runtime = new MockRuntime();
    const [agent] = await runtime.listAgents();
    const definite = new ConnectorCore(new ThrowingRuntime(runtime, new ConnectError('agent_blocked', 'blocked', 'inspect')), { writesEnabled: true });
    const unknown = new ConnectorCore(new ThrowingRuntime(runtime, new Error('socket closed')), { writesEnabled: true });
    const first = await definite.execute('send_agent_message', { agentId: agent!.id, message: 'Work', idempotencyKey: `${key}-a` }, principal);
    const second = await unknown.execute('send_agent_message', { agentId: agent!.id, message: 'Work', idempotencyKey: `${key}-b` }, principal);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect((await definite.execute('get_request_status', { requestId: first.requestId }, principal)).state).toBe('failed');
    expect((await unknown.execute('get_request_status', { requestId: second.requestId }, principal)).state).toBe('delivery_unknown');
  });

  it('recovers queued or dispatching durable receipts as delivery_unknown without retrying', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'herdr-core-'));
    directories.push(dir);
    const receiptPath = join(dir, 'receipts.json');
    const runtime = new HangingRuntime();
    const [agent] = await runtime.listAgents();
    const firstCore = new ConnectorCore(runtime, { writesEnabled: true, receiptPath });
    const receipt = await firstCore.execute('send_agent_message', { agentId: agent!.id, message: 'Private instruction', idempotencyKey: key }, principal);
    await runtime.started;
    // Simulate the old process being gone: its exclusive state lock disappears with it.
    await rm(`${receiptPath}.lock`, { recursive: true, force: true });
    const restarted = new ConnectorCore(runtime, { writesEnabled: true, receiptPath });
    await restarted.initialize();
    const status = await restarted.execute('get_request_status', { requestId: receipt.requestId }, principal);
    expect(status.state).toBe('delivery_unknown');
    expect(runtime.sendCount).toBe(1);
    const persisted = await readFile(receiptPath, 'utf8');
    expect(persisted).not.toContain('Private instruction');
    expect(persisted).not.toContain('alice');
  });

  it('drains dispatches on close and saves the final state before returning', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'herdr-core-close-'));
    directories.push(dir);
    const runtime = new ReleasableRuntime();
    const [agent] = await runtime.listAgents();
    const receiptPath = join(dir, 'receipts.json');
    const core = new ConnectorCore(runtime, { writesEnabled: true, receiptPath });
    const receipt = await core.execute('send_agent_message', { agentId: agent!.id, message: 'Finish before exit', idempotencyKey: key }, principal);
    await runtime.started;
    const closing = core.close();
    runtime.release();
    await closing;
    expect(JSON.parse(await readFile(receiptPath, 'utf8')).receipts[0].state).toBe('delivered');
    await expect(core.execute('get_request_status', { requestId: receipt.requestId }, principal)).rejects.toMatchObject({ code: 'connector_closed' });
  });

  it('drains admitted calls before releasing the receipt lock and memoizes concurrent close', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'herdr-core-admission-'));
    directories.push(dir);
    const receiptPath = join(dir, 'receipts.json');
    const runtime = new DelayedGetRuntime();
    const [agent] = await runtime.listAgents();
    const core = new ConnectorCore(runtime, { writesEnabled: true, receiptPath });
    await core.initialize();
    const pending = core.execute('send_agent_message', { agentId: agent!.id, message: 'Drain this operation', idempotencyKey: key }, principal);
    await runtime.getAgentStarted;
    const closing = core.close();
    expect(core.close()).toBe(closing);
    let closeSettled = false;
    void closing.then(() => { closeSettled = true; });
    await Promise.resolve();
    expect(closeSettled).toBe(false);
    await expect(readFile(`${receiptPath}.lock/owner`, 'utf8')).resolves.toBeTruthy();

    runtime.releaseGetAgent();
    const receipt = await pending;
    await closing;
    expect(JSON.parse(await readFile(receiptPath, 'utf8')).receipts[0].state).toBe('delivered');
    await expect(readFile(`${receiptPath}.lock/owner`, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(receipt.requestId).toBeTruthy();
  });

  it('fails startup closed on corrupt receipt data instead of skipping idempotency evidence', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'herdr-core-corrupt-'));
    directories.push(dir);
    const receiptPath = join(dir, 'receipts.json');
    await writeFile(receiptPath, JSON.stringify({ version: 1, receipts: [{ requestId: 'bad', state: 'surprise' }] }));
    const core = new ConnectorCore(new MockRuntime(), { receiptPath });
    await expect(core.initialize()).rejects.toMatchObject({ code: 'receipt_store_invalid' });
  });

  it('takes an exclusive lifetime lock for durable receipt stores', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'herdr-core-lock-'));
    directories.push(dir);
    const receiptPath = join(dir, 'receipts.json');
    const first = new ConnectorCore(new MockRuntime(), { receiptPath });
    await first.initialize();
    const second = new ConnectorCore(new MockRuntime(), { receiptPath });
    await expect(second.initialize()).rejects.toMatchObject({ code: 'receipt_store_locked' });
    await first.close();
    const third = new ConnectorCore(new MockRuntime(), { receiptPath });
    await third.initialize();
    await third.close();
  });

  it('rejects stale generation handles when an agent slot is replaced', async () => {
    const runtime = new MockRuntime();
    const [agent] = await runtime.listAgents();
    const staleId = agent!.id;
    const replacement = runtime.replaceAgent(staleId);
    expect(replacement.id).not.toBe(staleId);
    const core = new ConnectorCore(runtime, { writesEnabled: true });
    await expect(core.execute('send_agent_message', { agentId: staleId, message: 'Wrong process', idempotencyKey: key }, principal)).rejects.toMatchObject({ code: 'stale_target' });
    expect((await core.execute('get_agent_status', { agentId: replacement.id }, principal)).agent).toMatchObject({ id: replacement.id });
  });

  it('bounds all requested output and strips control sequences and common credentials', () => {
    const result = sanitizeOutput(`\u001b[31mapi_key=supersecret\u001b[0m\n${'x'.repeat(100)}`, { lines: 2, bytes: 16 });
    expect(Buffer.byteLength(result.text)).toBeLessThanOrEqual(16);
    expect(result.text).not.toContain('\u001b');
    expect(result.text).not.toContain('supersecret');
    expect(result.truncated).toBe(true);
    expect(result.untrusted).toBe(true);
    expect(() => sanitizeOutput('x', { bytes: 0 })).toThrowError(ConnectError);
    for (const value of ['é', 'A', '\u001b[31mA\u001b[0m']) {
      expect(Buffer.byteLength(sanitizeOutput(value, { bytes: 1 }).text)).toBeLessThanOrEqual(1);
    }
  });
});

class HangingRuntime implements RuntimeAdapter {
  private readonly mock = new MockRuntime();
  sendCount = 0;
  protected startResolve!: () => void;
  readonly started = new Promise<void>((resolve) => { this.startResolve = resolve; });
  protected markStarted(): void { this.startResolve(); }
  async listAgents(): Promise<AgentRecord[]> { return this.mock.listAgents(); }
  async getAgent(id: string): Promise<AgentRecord> { return this.mock.getAgent(id); }
  async readOutput(_id: string, options: OutputOptions): Promise<OutputResult> { return sanitizeOutput('output', options); }
  async sendMessage(): Promise<void> { this.sendCount += 1; this.startResolve(); return new Promise<void>(() => undefined); }
  getCapabilities() { return { readOutput: true, sendMessage: true }; }
}

class ThrowingRuntime implements RuntimeAdapter {
  constructor(private readonly mock: MockRuntime, private readonly failure: Error) {}
  listAgents() { return this.mock.listAgents(); }
  getAgent(id: string) { return this.mock.getAgent(id); }
  readOutput(id: string, options: OutputOptions) { return this.mock.readOutput(id, options); }
  async sendMessage(): Promise<void> { throw this.failure; }
  getCapabilities() { return this.mock.getCapabilities(); }
}

class CountingRuntime implements RuntimeAdapter {
  private readonly mock = new MockRuntime();
  sendCount = 0;
  private startResolve!: () => void;
  readonly started = new Promise<void>((resolve) => { this.startResolve = resolve; });
  protected markStarted(): void { this.startResolve(); }
  listAgents() { return this.mock.listAgents(); }
  getAgent(id: string) { return this.mock.getAgent(id); }
  readOutput(id: string, options: OutputOptions) { return this.mock.readOutput(id, options); }
  async sendMessage(id: string, message: string): Promise<void> { this.sendCount += 1; this.markStarted(); await this.mock.sendMessage(id, message); }
  getCapabilities() { return this.mock.getCapabilities(); }
}

class ReleasableRuntime extends CountingRuntime {
  private releaseSend!: () => void;
  private readonly releaseGate = new Promise<void>((resolve) => { this.releaseSend = resolve; });
  override async sendMessage(id: string, message: string): Promise<void> {
    this.markStarted();
    await this.releaseGate;
    await super.sendMessage(id, message);
  }
  release(): void { this.releaseSend(); }
}

class DelayedGetRuntime implements RuntimeAdapter {
  private readonly mock = new MockRuntime();
  private delayNextGet = true;
  private resolveGet!: () => void;
  private startGet!: () => void;
  private readonly getGate = new Promise<void>((resolve) => { this.resolveGet = resolve; });
  readonly getAgentStarted = new Promise<void>((resolve) => { this.startGet = resolve; });
  listAgents() { return this.mock.listAgents(); }
  async getAgent(id: string): Promise<AgentRecord> {
    if (this.delayNextGet) {
      this.delayNextGet = false;
      this.startGet();
      await this.getGate;
    }
    return this.mock.getAgent(id);
  }
  readOutput(id: string, options: OutputOptions) { return this.mock.readOutput(id, options); }
  sendMessage(id: string, message: string) { return this.mock.sendMessage(id, message); }
  getCapabilities() { return this.mock.getCapabilities(); }
  releaseGetAgent(): void { this.resolveGet(); }
}
