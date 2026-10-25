import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, rmdir, unlink, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname, join } from 'node:path';
import type { RuntimeEvent, RuntimeEventListener } from './events.js';

export type AgentStatus = 'idle' | 'working' | 'blocked' | 'done' | 'unknown';

export interface Capabilities {
  readOutput: boolean;
  sendMessage: boolean;
  reason?: string;
}

export interface AgentRecord {
  id: string;
  machineId: string;
  runtime: string;
  agentType: string;
  label: string;
  workspace: string;
  status: AgentStatus;
  rawStatus: string;
  observedAt: string;
  stale: boolean;
  capabilities: Capabilities;
}

export interface OutputOptions {
  lines?: number;
  bytes?: number;
  cursor?: string;
}

export interface OutputResult {
  text: string;
  /** Set when a history read falls back to the current terminal screen. */
  source?: 'visible';
  truncated: boolean;
  observedAt: string;
  nextCursor?: string;
  untrusted: true;
}

export interface RuntimeAdapter {
  listAgents(): Promise<AgentRecord[]>;
  getAgent(id: string): Promise<AgentRecord>;
  readOutput(id: string, options: OutputOptions): Promise<OutputResult>;
  sendMessage(id: string, message: string): Promise<void>;
  getCapabilities(): Capabilities;
  close?(): Promise<void>;
  /** Agent status and list-change events (metadata only). `log` receives one-line notices. Returns an unsubscribe function. */
  onEvent?(listener: RuntimeEventListener, log?: (message: string) => void): () => void;
  /** Maps a runtime pane id (for example HERDR_PANE_ID) to the agent id list_agents reports. */
  agentIdForPane?(paneId: string): Promise<string | undefined>;
}

export class ConnectError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly nextStep: string,
  ) {
    super(message);
    this.name = 'ConnectError';
  }
}

const MAX_OUTPUT_BYTES = 32 * 1024;
const MAX_OUTPUT_LINES = 500;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const ANSI = /(?:\u001B\[[0-?]*[ -/]*[@-~]|\u001B\][^\u0007]*(?:\u0007|\u001B\\))/g;
const SECRET_PATTERNS = [
  /\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{20,})\b/g,
  /\b(Bearer\s+)[A-Za-z0-9._~+/-]{12,}=?/gi,
  /\b((?:api[_-]?key|token|password|secret)\s*[:=]\s*)[^\s,;]+/gi,
];

function safeInteger(value: unknown, fallback: number, min: number, max: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw new ConnectError('invalid_argument', `${label} must be an integer from ${min} to ${max}.`, `Choose a ${label} in that range.`);
  }
  return value as number;
}

export function sanitizeOutput(text: string, options: OutputOptions = {}): OutputResult {
  const bytes = safeInteger(options.bytes, 8 * 1024, 1, MAX_OUTPUT_BYTES, 'bytes');
  const lines = safeInteger(options.lines, 100, 1, MAX_OUTPUT_LINES, 'lines');
  if (options.cursor !== undefined && (typeof options.cursor !== 'string' || options.cursor.length > 256)) {
    throw new ConnectError('invalid_argument', 'cursor must be at most 256 characters.', 'Use a cursor returned by the previous output read.');
  }
  let clean = text.replace(ANSI, '').replace(CONTROL, '').replace(/\r\n?/g, '\n');
  clean = clean.replace(SECRET_PATTERNS[0]!, '[REDACTED]');
  for (const pattern of SECRET_PATTERNS.slice(1)) clean = clean.replace(pattern, (_match, prefix: string) => `${prefix}[REDACTED]`);
  const allLines = clean.split('\n');
  let truncated = false;
  if (allLines.length > lines) {
    clean = allLines.slice(-lines).join('\n');
    truncated = true;
  }
  let encoded = Buffer.from(clean, 'utf8');
  if (encoded.byteLength > bytes) {
    encoded = encoded.subarray(encoded.byteLength - bytes);
    const firstNewline = encoded.indexOf(0x0a);
    if (firstNewline >= 0) encoded = encoded.subarray(firstNewline + 1);
    clean = encoded.toString('utf8').replace(/^\uFFFD+/, '');
    truncated = true;
  }
  return { text: clean, truncated, observedAt: new Date().toISOString(), untrusted: true };
}

export class MockRuntime implements RuntimeAdapter {
  private readonly agents = new Map<string, AgentRecord>();
  private readonly retired = new Set<string>();
  private readonly output = new Map<string, string>();
  private readonly listeners = new Set<RuntimeEventListener>();
  private readonly machineId: string;

  constructor(machineId = 'mock-machine') {
    this.machineId = machineId;
    const now = new Date().toISOString();
    const seed: Array<Omit<AgentRecord, 'id' | 'machineId' | 'observedAt' | 'stale' | 'capabilities'>> = [
      { runtime: 'mock', agentType: 'codex', label: 'Codex · api', workspace: 'demo/api', status: 'working', rawStatus: 'working' },
      { runtime: 'mock', agentType: 'claude', label: 'Claude · docs', workspace: 'demo/docs', status: 'idle', rawStatus: 'idle' },
      { runtime: 'mock', agentType: 'codex', label: 'Codex · tests', workspace: 'demo/tests', status: 'blocked', rawStatus: 'blocked' },
    ];
    for (const [index, base] of seed.entries()) {
      const id = `mock-${hash(`${machineId}:${index}`).slice(0, 24)}`;
      this.agents.set(id, { ...base, id, machineId, observedAt: now, stale: false, capabilities: { readOutput: true, sendMessage: true } });
      this.output.set(id, [`${base.label} is ${base.status}.`, 'Recent activity is demo data.'].join('\n'));
    }
  }

  async listAgents(): Promise<AgentRecord[]> {
    return [...this.agents.values()].map((agent) => structuredClone(agent));
  }

  async getAgent(id: string): Promise<AgentRecord> {
    const agent = this.agents.get(id);
    if (agent) return structuredClone(agent);
    if (this.retired.has(id)) throw new ConnectError('stale_target', 'This agent identity has been replaced.', 'List agents again and select the current agent.');
    throw new ConnectError('agent_not_found', 'No agent has this identity.', 'List agents and use an exact agent ID.');
  }

  async readOutput(id: string, options: OutputOptions): Promise<OutputResult> {
    await this.getAgent(id);
    return sanitizeOutput(this.output.get(id) ?? '', options);
  }

  async sendMessage(id: string, message: string): Promise<void> {
    const agent = await this.getAgent(id);
    if (agent.status === 'blocked') throw new ConnectError('agent_blocked', 'The target agent is blocked.', 'Inspect its state before sending a message.');
    this.output.set(id, `${this.output.get(id) ?? ''}\nMessage received: ${message}`.trim());
  }

  getCapabilities(): Capabilities {
    return { readOutput: true, sendMessage: true };
  }

  onEvent(listener: RuntimeEventListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Mock panes are named `mock:<index>` in seed order. */
  async agentIdForPane(paneId: string): Promise<string | undefined> {
    const match = /^mock:(\d+)$/.exec(paneId);
    return match ? [...this.agents.keys()][Number(match[1])] : undefined;
  }

  /** Changes an agent's status and emits a status event, as a real runtime would. */
  setStatus(id: string, status: AgentRecord['status']): void {
    const agent = this.agents.get(id);
    if (!agent) throw new ConnectError('agent_not_found', 'No agent has this identity.', 'List agents and use an exact agent ID.');
    const previousStatus = agent.status;
    if (previousStatus === status) return;
    agent.status = status;
    agent.rawStatus = status;
    agent.observedAt = new Date().toISOString();
    this.emit({ kind: 'status', agentId: id, status, previousStatus, label: agent.label, workspace: agent.workspace, revision: null });
  }

  private emit(event: RuntimeEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }

  /** Simulate a pane being reused: retire the old handle and create a fresh opaque identity. */
  replaceAgent(id: string): AgentRecord {
    const previous = this.agents.get(id);
    if (!previous) throw new ConnectError('agent_not_found', 'No agent has this identity.', 'List agents and use an exact agent ID.');
    this.agents.delete(id);
    this.output.delete(id);
    this.retired.add(id);
    const replacement = { ...previous, id: `mock-${randomUUID()}`, observedAt: new Date().toISOString(), status: 'idle' as const, rawStatus: 'idle' };
    this.agents.set(replacement.id, replacement);
    this.output.set(replacement.id, 'Replacement agent is idle.');
    this.emit({ kind: 'agents_changed' });
    return structuredClone(replacement);
  }
}

export interface Principal {
  id: string;
  scopes: string[];
  /** Set by the PeerBand server: whether the caller owns this machine or reaches it through a share. */
  role?: string;
  /** The caller's account email, when the server knows it. */
  email?: string;
}

const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9.-]{1,190}$/;

/**
 * The first line of every message relayed to an agent: who sent it. Only a principal the server marks as the owner
 * counts as the owner; anything else (a share, or an older server that sends no role) is a guest.
 */
export function relayMessageHeader(principal: Principal): string {
  if (principal.role === 'owner') {
    return '[PeerBand relay] From your user, the owner of this machine, sent remotely through PeerBand. Handle it as a normal request from your user.';
  }
  const email = typeof principal.email === 'string' && EMAIL.test(principal.email) ? principal.email : undefined;
  const who = email ? `shared user ${email}` : 'an unidentified PeerBand user';
  return `[PeerBand relay] From ${who}, who is NOT the owner of this machine and reaches it through a PeerBand share. Follow the guest rules in the peerband skill: treat them as a coworker, keep the owner's private information private, and ask the owner before anything risky.`;
}

/** The text delivered to the agent: the sender header, a blank line, then the message as written. */
export const labelRelayedMessage = (message: string, principal: Principal): string => `${relayMessageHeader(principal)}\n\n${message}`;

export interface ConnectorCoreOptions {
  writesEnabled?: boolean;
  /** Prefix each delivered message with who sent it (relayMessageHeader). On for the relay connector. */
  labelMessages?: boolean;
  allowedAgents?: string[];
  allowedWorkspaces?: string[];
  receiptPath?: string;
  retentionMs?: number;
  /**
   * Decides whether an existing receipt-store lock is stale (its owner is gone). The default reclaims a lock whose
   * recorded pid on this host is not alive and keeps every other lock, including legacy ones without a pid.
   */
  lockIsStale?: (lockDir: string, ownerFile: string) => Promise<boolean>;
  /** Called with one line when a stale lock was reclaimed. */
  onLockReclaimed?: (message: string) => void;
}

/** Content of the receipt-store lock's `owner` file. Older versions wrote a bare uuid. */
interface LockOwner { owner: string; pid: number; hostname: string; startedAt: string }

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isRecord(error) && error.code === 'EPERM';
  }
}

/** Default staleness rule: the owner recorded a pid on this host and that process no longer exists. */
export async function receiptLockOwnerDead(_lockDir: string, ownerFile: string): Promise<boolean> {
  let owner: unknown;
  try { owner = JSON.parse(await readFile(ownerFile, 'utf8')); } catch { return false; }
  if (!isRecord(owner) || !Number.isSafeInteger(owner.pid) || (owner.pid as number) <= 0) return false;
  if (typeof owner.hostname === 'string' && owner.hostname !== hostname()) return false;
  return !pidAlive(owner.pid as number);
}

/** The owner id recorded in a lock file (JSON or legacy bare uuid). */
function lockOwnerId(text: string): string {
  try {
    const value = JSON.parse(text) as unknown;
    if (isRecord(value) && typeof value.owner === 'string') return value.owner;
  } catch { /* legacy */ }
  return text;
}

type ReceiptState = 'queued' | 'dispatching' | 'delivered' | 'failed' | 'delivery_unknown';
interface Receipt {
  requestId: string;
  principalHash: string;
  machineId: string;
  targetId: string;
  workspace: string;
  tool: 'send_agent_message';
  idempotencyHash: string;
  requestKeyHash: string;
  payloadHash: string;
  state: ReceiptState;
  createdAt: number;
  updatedAt: number;
  errorCode?: string;
}
interface ReceiptStore { version: 1; receipts: Receipt[] }

const DEFAULT_PRINCIPAL: Principal = { id: 'local', scopes: ['agents:read', 'agents:message'] };
const MAX_RECEIPTS = 10_000;
const DEFAULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
const canonical = (value: unknown): string => JSON.stringify(value);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const RECEIPT_STATES: ReceiptState[] = ['queued', 'dispatching', 'delivered', 'failed', 'delivery_unknown'];
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_RECEIPT_ERRORS = new Set(['agent_not_found', 'stale_target', 'agent_blocked', 'forbidden', 'unsupported_capability', 'runtime_unavailable', 'timeout', 'machine_offline', 'process_restarted']);
const assertKeys = (args: Record<string, unknown>, allowed: string[]): void => {
  const unexpected = Object.keys(args).find((key) => !allowed.includes(key));
  if (unexpected) throw new ConnectError('invalid_argument', `Unexpected argument: ${unexpected}.`, 'Remove unsupported fields and retry.');
};

export class ConnectorCore {
  private readonly receipts = new Map<string, Receipt>();
  private readonly idempotency = new Map<string, Receipt>();
  private readonly writesEnabled: boolean;
  private readonly labelMessages: boolean;
  private readonly allowedAgents?: Set<string>;
  private readonly allowedWorkspaces?: Set<string>;
  private readonly retentionMs: number;
  private readonly receiptPath?: string;
  private readonly lockIsStale: (lockDir: string, ownerFile: string) => Promise<boolean>;
  private readonly onLockReclaimed?: (message: string) => void;
  private lockOwner?: string;
  private get lockPath(): string | undefined { return this.receiptPath ? `${this.receiptPath}.lock` : undefined; }
  private persistQueue: Promise<void> = Promise.resolve();
  private ready: Promise<void>;
  private readonly inFlight = new Set<Promise<void>>();
  private readonly activeOperations = new Set<Promise<void>>();
  private readonly submissionLocks = new Map<string, Promise<void>>();
  private closed = false;
  private closePromise?: Promise<void>;

  constructor(private readonly adapter: RuntimeAdapter, options: ConnectorCoreOptions = {}) {
    this.writesEnabled = options.writesEnabled ?? false;
    this.labelMessages = options.labelMessages ?? false;
    this.allowedAgents = options.allowedAgents ? new Set(options.allowedAgents) : undefined;
    this.allowedWorkspaces = options.allowedWorkspaces ? new Set(options.allowedWorkspaces) : undefined;
    this.receiptPath = options.receiptPath;
    this.lockIsStale = options.lockIsStale ?? receiptLockOwnerDead;
    this.onLockReclaimed = options.onLockReclaimed;
    this.retentionMs = options.retentionMs ?? DEFAULT_RETENTION_MS;
    if (!Number.isSafeInteger(this.retentionMs) || this.retentionMs < 60_000 || this.retentionMs > 365 * 24 * 60 * 60 * 1000) {
      throw new ConnectError('invalid_argument', 'retentionMs is outside the supported range.', 'Choose retention from one minute to one year.');
    }
    this.ready = this.loadReceipts();
    void this.ready.catch(() => undefined);
  }

  async execute(tool: string, args: Record<string, unknown>, principal: Principal = DEFAULT_PRINCIPAL): Promise<Record<string, unknown>> {
    if (this.closed) throw new ConnectError('connector_closed', 'The connector is shutting down.', 'Restart the connector to make further requests.');
    let finishOperation!: () => void;
    const operation = new Promise<void>((resolve) => { finishOperation = resolve; });
    this.activeOperations.add(operation);
    try {
      await this.ready;
      this.validatePrincipal(principal);
      if (!isRecord(args)) throw new ConnectError('invalid_argument', 'Tool arguments must be an object.', 'Check the tool input and try again.');
      switch (tool) {
        case 'list_agents': return await this.listAgents(args, principal);
        case 'get_agent_status': return await this.getStatus(args, principal);
        case 'get_agent_output': return await this.getOutput(args, principal);
        case 'send_agent_message': return await this.sendMessage(args, principal);
        case 'get_request_status': return await this.getRequestStatus(args, principal);
        default: throw new ConnectError('unsupported_capability', `Unknown tool: ${tool}.`, 'Choose one of the registered agent tools.');
      }
    } finally {
      finishOperation();
      this.activeOperations.delete(operation);
    }
  }

  /** Resolve only after durable receipts have loaded and been reconciled for startup. */
  async initialize(): Promise<void> {
    await this.ready;
  }

  /** Stop accepting calls, wait for active dispatches and flush their final receipt states. */
  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closed = true;
    this.closePromise = this.finishClose();
    return this.closePromise;
  }

  private async finishClose(): Promise<void> {
    await this.ready;
    try {
      await Promise.all([...this.activeOperations]);
      await Promise.all([...this.inFlight]);
      await this.persist();
    } finally {
      await this.releaseLock();
    }
  }

  private validatePrincipal(principal: Principal): void {
    if (!principal || typeof principal.id !== 'string' || principal.id.length < 1 || principal.id.length > 256 || !Array.isArray(principal.scopes) || principal.scopes.some((s) => typeof s !== 'string')) {
      throw new ConnectError('forbidden', 'The caller identity is invalid.', 'Authenticate with a valid principal.');
    }
  }

  private requireScope(principal: Principal, scope: string): void {
    if (!principal.scopes.includes(scope)) throw new ConnectError('forbidden', `Missing required scope ${scope}.`, 'Request access to this agent operation.');
  }

  private async authorizedAgent(id: unknown, principal: Principal, write = false): Promise<AgentRecord> {
    this.requireScope(principal, write ? 'agents:message' : 'agents:read');
    if (typeof id !== 'string' || id.length < 1 || id.length > 256) throw new ConnectError('invalid_argument', 'agentId is required.', 'Use an exact agent ID returned by list_agents.');
    const agent = await this.adapter.getAgent(id);
    if (agent.stale) throw new ConnectError('stale_target', 'This agent identity is stale.', 'List agents and select the current agent.');
    if (this.allowedAgents && !this.allowedAgents.has(agent.id)) throw new ConnectError('forbidden', 'This agent is outside the configured allowlist.', 'Select an allowed agent.');
    if (this.allowedWorkspaces && !this.allowedWorkspaces.has(agent.workspace)) throw new ConnectError('forbidden', 'This workspace is outside the configured allowlist.', 'Select an allowed workspace.');
    return agent;
  }

  private async listAgents(args: Record<string, unknown>, principal: Principal): Promise<Record<string, unknown>> {
    this.requireScope(principal, 'agents:read');
    assertKeys(args, ['machine', 'workspace', 'status', 'cursor', 'limit']);
    const limit = safeInteger(args.limit, 50, 1, 200, 'limit');
    for (const key of ['machine', 'workspace', 'status', 'cursor']) {
      if (args[key] !== undefined && (typeof args[key] !== 'string' || (args[key] as string).length > (key === 'cursor' ? 256 : 512))) {
        throw new ConnectError('invalid_argument', `${key} has an invalid value.`, 'Check the list filter and try again.');
      }
    }
    if (args.status !== undefined && !['idle', 'working', 'blocked', 'done', 'unknown'].includes(args.status as string)) {
      throw new ConnectError('invalid_argument', 'status is not a supported normalized state.', 'Choose idle, working, blocked, done, or unknown.');
    }
    const records = await this.adapter.listAgents();
    const filtered = records.filter((a) => (!args.machine || a.machineId === args.machine) && (!args.workspace || a.workspace === args.workspace) && (!args.status || a.status === args.status) && (!this.allowedAgents || this.allowedAgents.has(a.id)) && (!this.allowedWorkspaces || this.allowedWorkspaces.has(a.workspace)));
    const cursorIndex = args.cursor ? filtered.findIndex((a) => a.id === args.cursor) : -1;
    if (args.cursor && cursorIndex < 0) throw new ConnectError('invalid_argument', 'cursor does not identify an agent in this result set.', 'Start a fresh list_agents request.');
    const start = args.cursor ? cursorIndex + 1 : 0;
    const page = filtered.slice(start, start + limit);
    return { agents: page, ...(start + limit < filtered.length ? { nextCursor: page.at(-1)?.id } : {}), count: page.length };
  }

  private async getStatus(args: Record<string, unknown>, principal: Principal): Promise<Record<string, unknown>> {
    assertKeys(args, ['agentId']);
    const agent = await this.authorizedAgent(args.agentId, principal);
    return { agent };
  }

  private async getOutput(args: Record<string, unknown>, principal: Principal): Promise<Record<string, unknown>> {
    assertKeys(args, ['agentId', 'lines', 'bytes', 'cursor']);
    const agent = await this.authorizedAgent(args.agentId, principal);
    if (!agent.capabilities.readOutput || !this.adapter.getCapabilities().readOutput) throw new ConnectError('unsupported_capability', 'Output reading is not supported for this runtime.', 'Use status tools or select a runtime with output support.');
    const options: OutputOptions = {
      lines: safeInteger(args.lines, 100, 1, MAX_OUTPUT_LINES, 'lines'),
      bytes: safeInteger(args.bytes, 8 * 1024, 1, MAX_OUTPUT_BYTES, 'bytes'),
    };
    if (args.cursor !== undefined) {
      if (typeof args.cursor !== 'string' || args.cursor.length > 256) throw new ConnectError('invalid_argument', 'cursor has an invalid value.', 'Use a cursor returned by the runtime.');
      options.cursor = args.cursor;
    }
    const result = await this.adapter.readOutput(agent.id, options);
    const safe = sanitizeOutput(result.text, options);
    return { ...safe, ...(result.source === 'visible' ? { source: result.source } : {}), observedAt: result.observedAt, truncated: safe.truncated || result.truncated, ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}) };
  }

  private async sendMessage(args: Record<string, unknown>, principal: Principal): Promise<Record<string, unknown>> {
    assertKeys(args, ['agentId', 'message', 'idempotencyKey']);
    if (!this.writesEnabled) throw new ConnectError('write_disabled', 'Message sending is disabled.', 'This machine is read-only. To allow messages, remove --read-only or set "enableWrites": true in connector.json on that machine.');
    this.requireScope(principal, 'agents:message');
    const key = args.idempotencyKey;
    const message = args.message;
    if (typeof key !== 'string' || key.length < 16 || key.length > 256) throw new ConnectError('invalid_argument', 'idempotencyKey must be 16 to 256 characters.', 'Provide a fresh random idempotency key for this request.');
    if (typeof message !== 'string' || message.trim().length < 1 || Buffer.byteLength(message, 'utf8') > 8192) throw new ConnectError('invalid_argument', 'message must contain 1 to 8192 UTF-8 bytes.', 'Shorten the message and try again.');
    const principalHash = hash(principal.id);
    const payloadHash = hash(message);
    if (typeof args.agentId !== 'string' || args.agentId.length < 1 || args.agentId.length > 256) throw new ConnectError('invalid_argument', 'agentId is required.', 'Use an exact agent ID returned by list_agents.');
    const requestKeyHash = hash(canonical([principalHash, args.agentId, 'send_agent_message', key]));
    return this.withSubmissionLock(requestKeyHash, async () => {
    const prior = this.idempotency.get(requestKeyHash);
    if (prior) {
      if ((this.allowedAgents && !this.allowedAgents.has(prior.targetId)) || (this.allowedWorkspaces && !this.allowedWorkspaces.has(prior.workspace))) {
        throw new ConnectError('forbidden', 'This target is outside the configured allowlist.', 'Select an allowed agent and workspace.');
      }
      if (prior.payloadHash !== payloadHash) throw new ConnectError('idempotency_conflict', 'This idempotency key was already used with a different message.', 'Use a new key for a new message.');
      return this.publicReceipt(prior);
    }
    const agent = await this.authorizedAgent(args.agentId, principal, true);
    if (agent.status === 'blocked') throw new ConnectError('agent_blocked', 'The target agent is blocked.', 'Inspect its state and choose an appropriate next step before sending.');
    if (!agent.capabilities.sendMessage || !this.adapter.getCapabilities().sendMessage) throw new ConnectError('unsupported_capability', 'Message sending is not supported for this runtime.', 'Use a runtime with semantic message support.');
    const idempotencyHash = hash(canonical([principalHash, agent.machineId, agent.id, 'send_agent_message', key]));
    this.pruneReceipts();
    if (this.receipts.size >= MAX_RECEIPTS) throw new ConnectError('receipt_limit', 'The receipt store is full.', 'Wait for old receipts to expire or increase retention storage capacity.');
    const now = Date.now();
    const receipt: Receipt = {
      requestId: randomUUID(), principalHash, machineId: agent.machineId, targetId: agent.id, workspace: agent.workspace,
      tool: 'send_agent_message', idempotencyHash, requestKeyHash, payloadHash, state: 'queued', createdAt: now, updatedAt: now,
    };
    this.receipts.set(receipt.requestId, receipt);
    this.idempotency.set(requestKeyHash, receipt);
    try {
      await this.persist();
    } catch {
      this.receipts.delete(receipt.requestId);
      this.idempotency.delete(requestKeyHash);
      throw new ConnectError('receipt_store_unavailable', 'The request receipt could not be saved; nothing was sent.', 'Check local storage access and retry with the same key.');
    }
    const job = this.dispatch(receipt, this.labelMessages ? labelRelayedMessage(message, principal) : message).catch(() => undefined);
    this.inFlight.add(job);
    void job.finally(() => this.inFlight.delete(job));
    return this.publicReceipt(receipt);
    });
  }

  private async withSubmissionLock<T>(key: string, action: () => Promise<T>): Promise<T> {
    const previous = this.submissionLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    this.submissionLocks.set(key, current);
    await previous;
    try {
      return await action();
    } finally {
      release();
      if (this.submissionLocks.get(key) === current) this.submissionLocks.delete(key);
    }
  }

  private async dispatch(receipt: Receipt, message: string): Promise<void> {
    receipt.state = 'dispatching';
    receipt.updatedAt = Date.now();
    try {
      await this.persist();
      const current = await this.authorizedAgent(receipt.targetId, { id: '', scopes: ['agents:message'] }, true);
      if (current.machineId !== receipt.machineId) throw new ConnectError('stale_target', 'The target agent has changed machines.', 'List agents and submit to the current agent identity.');
      if (current.status === 'blocked') throw new ConnectError('agent_blocked', 'The target agent became blocked before delivery.', 'Inspect its state before submitting a new message.');
      if (!current.capabilities.sendMessage || !this.adapter.getCapabilities().sendMessage) throw new ConnectError('unsupported_capability', 'Message sending is no longer supported.', 'Use a runtime with semantic message support.');
      await this.adapter.sendMessage(receipt.targetId, message);
      receipt.state = 'delivered';
    } catch (error) {
      const definite = error instanceof ConnectError && ['agent_not_found', 'stale_target', 'agent_blocked', 'forbidden', 'unsupported_capability'].includes(error.code);
      receipt.state = definite ? 'failed' : 'delivery_unknown';
      receipt.errorCode = error instanceof ConnectError && SAFE_RECEIPT_ERRORS.has(error.code) ? error.code : 'runtime_unavailable';
    }
    receipt.updatedAt = Date.now();
    await this.persist();
  }

  private async getRequestStatus(args: Record<string, unknown>, principal: Principal): Promise<Record<string, unknown>> {
    assertKeys(args, ['requestId']);
    this.requireScope(principal, 'agents:read');
    if (typeof args.requestId !== 'string' || args.requestId.length > 256) throw new ConnectError('invalid_argument', 'requestId is required.', 'Use the request ID returned by send_agent_message.');
    this.pruneReceipts();
    const receipt = this.receipts.get(args.requestId);
    if (!receipt || receipt.principalHash !== hash(principal.id)) throw new ConnectError('request_not_found', 'No request receipt is available for this caller.', 'Check the request ID or submit a new authorized request.');
    return this.publicReceipt(receipt);
  }

  private publicReceipt(receipt: Receipt): Record<string, unknown> {
    return { requestId: receipt.requestId, state: receipt.state, createdAt: new Date(receipt.createdAt).toISOString(), updatedAt: new Date(receipt.updatedAt).toISOString(), ...(receipt.errorCode ? { errorCode: receipt.errorCode } : {}) };
  }

  private pruneReceipts(): void {
    const cutoff = Date.now() - this.retentionMs;
    for (const [id, receipt] of this.receipts) {
      if (receipt.createdAt < cutoff) {
        this.receipts.delete(id);
        this.idempotency.delete(receipt.requestKeyHash);
      }
    }
  }

  private async loadReceipts(): Promise<void> {
    if (!this.receiptPath) return;
    await this.acquireLock();
    try {
      await this.loadReceiptFile();
    } catch (error) {
      await this.releaseLock();
      throw error;
    }
  }

  private async loadReceiptFile(): Promise<void> {
    if (!this.receiptPath) return;
    let raw: string;
    try { raw = await readFile(this.receiptPath, 'utf8'); }
    catch (error) {
      if (isRecord(error) && error.code === 'ENOENT') return;
      throw error;
    }
    let store: ReceiptStore;
    try { store = JSON.parse(raw) as ReceiptStore; }
    catch { throw new ConnectError('receipt_store_invalid', 'The request receipt store is unreadable.', 'Preserve the file and inspect it before reconnecting.'); }
    if (!isRecord(store) || store.version !== 1 || !Array.isArray(store.receipts) || store.receipts.length > MAX_RECEIPTS) throw new ConnectError('receipt_store_invalid', 'The request receipt store has an unsupported shape.', 'Back up the file and use a compatible connector version.');
    const cutoff = Date.now() - this.retentionMs;
    const seenIds = new Set<string>();
    const seenKeys = new Set<string>();
    for (const item of store.receipts) {
      if (!this.isValidReceipt(item)) throw new ConnectError('receipt_store_invalid', 'The request receipt store contains invalid receipt data.', 'Preserve the file and inspect it before reconnecting.');
      if (seenIds.has(item.requestId) || seenKeys.has(item.requestKeyHash)) throw new ConnectError('receipt_store_invalid', 'The request receipt store contains duplicate receipt identities.', 'Preserve the file and inspect it before reconnecting.');
      seenIds.add(item.requestId);
      seenKeys.add(item.requestKeyHash);
      if (item.createdAt < cutoff) continue;
      if (item.state === 'queued' || item.state === 'dispatching') {
        item.state = 'delivery_unknown';
        item.errorCode = 'process_restarted';
      }
      this.receipts.set(item.requestId, item);
      this.idempotency.set(item.requestKeyHash, item);
    }
    this.pruneReceipts();
    await this.persist();
  }

  private async acquireLock(): Promise<void> {
    const lockPath = this.lockPath;
    if (!lockPath || !this.receiptPath) return;
    await mkdir(dirname(this.receiptPath), { recursive: true });
    const ownerFile = join(lockPath, 'owner');
    for (let attempt = 0; ; attempt++) {
      try {
        await mkdir(lockPath, { mode: 0o700 });
        break;
      } catch (error) {
        if (!(isRecord(error) && error.code === 'EEXIST')) throw error;
      }
      if (attempt === 0 && (await this.lockIsStale(lockPath, ownerFile).catch(() => false)) && (await this.reclaimStaleLock(lockPath, ownerFile))) continue;
      throw new ConnectError('receipt_store_locked', 'Another connector process owns this receipt store.', 'Stop the other process or configure a separate state directory.');
    }
    const owner = randomUUID();
    this.lockOwner = owner;
    const record: LockOwner = { owner, pid: process.pid, hostname: hostname(), startedAt: new Date().toISOString() };
    try {
      await writeFile(ownerFile, JSON.stringify(record), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    } catch (error) {
      this.lockOwner = undefined;
      try { await rmdir(lockPath); } catch { /* Keep unexpected contents for inspection. */ }
      throw error;
    }
  }

  /** Moves the stale lock aside (atomic, one winner), checks it is the one inspected, then deletes it. */
  private async reclaimStaleLock(lockPath: string, ownerFile: string): Promise<boolean> {
    const before = await readFile(ownerFile, 'utf8').catch(() => null);
    const quarantine = `${lockPath}.stale-${randomUUID()}`;
    try { await rename(lockPath, quarantine); } catch { return false; }
    const moved = await readFile(join(quarantine, 'owner'), 'utf8').catch(() => null);
    if (moved !== before) {
      await rename(quarantine, lockPath).catch(() => undefined);
      return false;
    }
    await rm(quarantine, { recursive: true, force: true }).catch(() => undefined);
    this.onLockReclaimed?.(`Reclaimed a stale receipt-store lock ${lockPath}${before ? ` (previous owner: ${before.slice(0, 200)})` : ''}.`);
    return true;
  }

  private async releaseLock(): Promise<void> {
    const lockPath = this.lockPath;
    const owner = this.lockOwner;
    if (!lockPath || !owner) return;
    try {
      const currentOwner = await readFile(`${lockPath}/owner`, 'utf8');
      if (lockOwnerId(currentOwner) !== owner) return;
      await unlink(`${lockPath}/owner`);
      await rmdir(lockPath);
    } catch (error) {
      if (isRecord(error) && error.code === 'ENOENT') return;
      throw error;
    } finally {
      this.lockOwner = undefined;
    }
  }

  private isValidReceipt(value: unknown): value is Receipt {
    if (!isRecord(value)) return false;
    const receiptKeys = ['requestId', 'principalHash', 'machineId', 'targetId', 'workspace', 'tool', 'idempotencyHash', 'requestKeyHash', 'payloadHash', 'state', 'createdAt', 'updatedAt', 'errorCode'];
    if (Object.keys(value).some((key) => !receiptKeys.includes(key))) return false;
    return typeof value.requestId === 'string' && value.requestId.length > 0 && value.requestId.length <= 256 &&
      typeof value.principalHash === 'string' && HASH_PATTERN.test(value.principalHash) &&
      typeof value.machineId === 'string' && value.machineId.length > 0 && value.machineId.length <= 512 &&
      typeof value.targetId === 'string' && value.targetId.length > 0 && value.targetId.length <= 256 &&
      typeof value.workspace === 'string' && value.workspace.length <= 2048 &&
      value.tool === 'send_agent_message' &&
      typeof value.idempotencyHash === 'string' && HASH_PATTERN.test(value.idempotencyHash) &&
      typeof value.requestKeyHash === 'string' && HASH_PATTERN.test(value.requestKeyHash) &&
      typeof value.payloadHash === 'string' && HASH_PATTERN.test(value.payloadHash) &&
      typeof value.state === 'string' && RECEIPT_STATES.includes(value.state as ReceiptState) &&
      Number.isSafeInteger(value.createdAt) && Number.isSafeInteger(value.updatedAt) &&
      (value.updatedAt as number) >= (value.createdAt as number) &&
      (value.errorCode === undefined || (typeof value.errorCode === 'string' && SAFE_RECEIPT_ERRORS.has(value.errorCode)));
  }

  private persist(): Promise<void> {
    if (!this.receiptPath) return Promise.resolve();
    const snapshot: ReceiptStore = { version: 1, receipts: [...this.receipts.values()].slice(-MAX_RECEIPTS) };
    const serialized = JSON.stringify(snapshot);
    this.persistQueue = this.persistQueue.then(async () => {
      await mkdir(dirname(this.receiptPath!), { recursive: true });
      const temporary = `${this.receiptPath}.${randomUUID()}.tmp`;
      await writeFile(temporary, serialized, { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, this.receiptPath!);
    });
    return this.persistQueue;
  }
}
