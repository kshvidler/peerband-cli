import { createHash, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ConnectError, sanitizeOutput, type AgentRecord, type Capabilities, type OutputOptions, type OutputResult, type RuntimeAdapter, type RuntimeEventListener } from '../core/index.js';
import { HerdrEventBridge, type BridgeAgent, type HerdrEventBridgeOptions } from './events.js';
import { HerdrSocketClient } from './socket-client.js';
import { loadHerdrSchema, type ValidatedHerdrSchema } from './schema.js';

export interface HerdrAdapterOptions {
  socketPath?: string;
  schemaPath?: string;
  binary?: string;
  machineId?: string;
  timeoutMs?: number;
  /** One-line notices from the event stream (for example when Herdr has no event support). */
  log?: (message: string) => void;
  /** Test seams for the event stream. */
  events?: Omit<HerdrEventBridgeOptions, 'log'>;
}

interface HerdrAgent {
  agent?: string | null;
  agent_session?: { source: string; agent: string; kind: 'id' | 'path'; value: string } | null;
  agent_status: string;
  cwd?: string | null;
  display_agent?: string | null;
  foreground_cwd?: string | null;
  name?: string | null;
  pane_id: string;
  revision: number;
  terminal_id: string;
  terminal_title_stripped?: string | null;
  title?: string | null;
  workspace_id: string;
  tab_id: string;
}

interface LiveTarget { id: string; fingerprint: string; agent: HerdrAgent }

export class HerdrAdapter implements RuntimeAdapter {
  private readonly options: HerdrAdapterOptions;
  private readonly machineId: string;
  private ready?: Promise<{ schema: ValidatedHerdrSchema; client: HerdrSocketClient }>;
  private current = new Map<string, LiveTarget>();
  private retired = new Set<string>();
  private endpointMarker?: string;
  private socketPath?: string;
  private refreshing?: Promise<AgentRecord[]>;
  private listed = false;
  private records = new Map<string, AgentRecord>();
  private bridge?: HerdrEventBridge;

  constructor(options: HerdrAdapterOptions = {}) {
    this.options = options;
    this.machineId = options.machineId ?? createHash('sha256').update(`${process.platform}:${process.env.COMPUTERNAME ?? process.env.HOSTNAME ?? 'local'}`).digest('hex').slice(0, 24);
  }

  getCapabilities(): Capabilities {
    return { readOutput: true, sendMessage: true, reason: 'Messages are addressed by a unique live agent name. Herdr does not atomically bind that name to an occupant, so names can be reassigned between validation and delivery.' };
  }

  async listAgents(): Promise<AgentRecord[]> {
    if (!this.refreshing) this.refreshing = this.refreshAgents().finally(() => { this.refreshing = undefined; });
    return this.refreshing;
  }

  private async refreshAgents(): Promise<AgentRecord[]> {
    const { client } = await this.initialize();
    const result = asObject(await client.request('agent.list', {}));
    if (result.type !== 'agent_list' || !Array.isArray(result.agents)) throw this.schemaMismatch('agent.list returned an unexpected result type');
    const marker = this.socketPath ? await readEndpointMarker(this.socketPath) : undefined;
    const reconnected = marker !== undefined && this.endpointMarker !== undefined && marker !== this.endpointMarker;
    if (marker !== undefined) this.endpointMarker = marker;
    if (reconnected) for (const previous of this.current.values()) this.retired.add(previous.id);
    const previousTargets = [...this.current.values()];
    const next = new Map<string, LiveTarget>();
    const nextIds = new Set<string>();
    const records: AgentRecord[] = [];
    const rawAgents = result.agents;
    for (const raw of rawAgents) {
      if (!isAgent(raw)) throw this.schemaMismatch('agent.list contained an invalid agent record');
      const fingerprint = identityFingerprint(raw);
      const previous = !reconnected ? previousTargets.find((item) => item.fingerprint === fingerprint) : undefined;
      const id = previous?.id ?? `herdr_${randomUUID()}`;
      const live = { id, fingerprint, agent: raw };
      next.set(raw.pane_id, live);
      nextIds.add(id);
      records.push(toRecord(live, this.machineId, promptTarget(raw, rawAgents) !== undefined));
    }
    for (const previous of previousTargets) if (!nextIds.has(previous.id)) this.retired.add(previous.id);
    const idsChanged = this.listed && (nextIds.size !== previousTargets.length || previousTargets.some((item) => !nextIds.has(item.id)));
    this.current = next;
    this.records = new Map(records.map((record) => [record.id, record]));
    this.listed = true;
    this.bridge?.agentsRefreshed(idsChanged);
    return records;
  }

  /** Status and list-change events from Herdr's events.subscribe (metadata only, never pane text). */
  onEvent(listener: RuntimeEventListener): () => void {
    this.bridge ??= new HerdrEventBridge({
      prepare: async () => {
        const { schema } = await this.initialize();
        const request = schema.schema.schemas.request as { oneOf?: Array<{ properties?: { method?: { const?: unknown } } }> };
        return {
          socketPath: platformSocketAddress(this.socketPath!),
          validateRequest: schema.validateRequest,
          supportsEvents: Boolean(request.oneOf?.some((branch) => branch.properties?.method?.const === 'events.subscribe')),
        };
      },
      refresh: async () => { await this.listAgents(); },
      agents: () => [...this.current.values()].map((live): BridgeAgent => {
        const record = this.records.get(live.id);
        return { paneId: live.agent.pane_id, agentId: live.id, status: record?.status ?? 'unknown', label: record?.label ?? 'Herdr agent', workspace: record?.workspace ?? live.agent.workspace_id, revision: live.agent.revision };
      }),
    }, { ...this.options.events, log: this.options.log });
    return this.bridge.subscribe(listener);
  }

  /** The agent id for a Herdr pane id such as HERDR_PANE_ID, after a fresh agent.list. */
  async agentIdForPane(paneId: string): Promise<string | undefined> {
    await this.listAgents();
    return this.current.get(paneId)?.id;
  }

  async getAgent(id: string): Promise<AgentRecord> {
    const agents = await this.listAgents();
    const record = agents.find((agent) => agent.id === id);
    if (record) return record;
    if (this.retired.has(id)) throw new ConnectError('stale_target', 'This Herdr agent handle refers to an occupant that has exited or changed.', 'Refresh the agent list and select its current occupant.');
    throw new ConnectError('agent_not_found', 'No Herdr agent has that identifier.', 'List agents and use a current agent identifier.');
  }

  async readOutput(id: string, options: OutputOptions = {}): Promise<OutputResult> {
    if (options.cursor !== undefined) throw new ConnectError('unsupported_capability', 'Herdr output cursors are not available in this API version.', 'Request output again with a bounded line or byte limit and no cursor.');
    await this.getAgent(id);
    const live = [...this.current.values()].find((item) => item.id === id);
    if (!live) throw new ConnectError('stale_target', 'This Herdr agent handle is no longer current.', 'Refresh the agent list and select its current occupant.');
    const lines = clampInteger(options.lines, 80, 1, 500);
    const { client } = await this.initialize();
    const result = asObject(await client.request('agent.read', {
      target: live.agent.pane_id,
      source: 'recent',
      format: 'text',
      lines,
      strip_ansi: true,
    }));
    if (result.type !== 'pane_read' || !result.read || typeof result.read !== 'object' || typeof (result.read as { text?: unknown }).text !== 'string') throw this.schemaMismatch('agent.read returned an unexpected result type');
    const output = sanitizeOutput((result.read as { text: string }).text, { ...options, lines, bytes: clampInteger(options.bytes, 16_384, 1, 32_768) });
    await this.getAgent(id);
    return { ...output, truncated: output.truncated || (result.read as { truncated?: boolean }).truncated === true, observedAt: new Date().toISOString(), untrusted: true };
  }

  async sendMessage(id: string, message: string): Promise<void> {
    if (typeof message !== 'string' || message.length === 0 || Buffer.byteLength(message, 'utf8') > 16_384) {
      throw new ConnectError('invalid_argument', 'Message must contain 1 to 16384 UTF-8 bytes.', 'Shorten the message and try again.');
    }
    await this.getAgent(id);
    // Refresh immediately before resolving the handle to a prompt target. Prefer
    // a live name, otherwise use the current pane ID; neither target is atomic.
    await this.listAgents();
    const live = [...this.current.values()].find((item) => item.id === id);
    if (!live) throw new ConnectError('stale_target', 'This Herdr agent handle is no longer current.', 'Refresh the agent list and select its current occupant.');
    if (live.agent.agent_status === 'blocked') throw new ConnectError('agent_blocked', 'The Herdr agent is blocked and cannot accept a prompt.', 'Inspect the agent state and resolve its blocker before sending a message.');
    const allLive = [...this.current.values()].map((item) => item.agent);
    const target = promptTarget(live.agent, allLive);
    if (!target) {
      throw new ConnectError('unsupported_capability', 'This Herdr agent has no safe live name or pane target for prompt delivery.', 'Assign it a unique lowercase live agent name or refresh the agent list.');
    }
    const { client } = await this.initialize();
    const result = asObject(await client.request('agent.prompt', { target, text: message }));
    if (result.type !== 'agent_prompted') throw this.schemaMismatch('agent.prompt returned an unexpected result type');
  }

  async close(): Promise<void> {
    await this.bridge?.stop();
    const pending = await this.ready?.catch(() => undefined);
    await pending?.client.close();
  }

  private initialize(): Promise<{ schema: ValidatedHerdrSchema; client: HerdrSocketClient }> {
    if (!this.ready) {
      const pending = (async () => {
        const binary = this.options.binary ?? process.env.HERDR_BIN_PATH ?? 'herdr';
        const schema = await loadHerdrSchema({ schemaPath: this.options.schemaPath, binary });
        const socketPath = this.options.socketPath ?? process.env.HERDR_SOCKET_PATH ?? defaultSocketPath();
        this.socketPath = socketPath;
        const client = new HerdrSocketClient({
          socketPath: platformSocketAddress(socketPath),
          timeoutMs: this.options.timeoutMs,
          validateSuccessResponse: schema.validateSuccessResponse,
          validateErrorResponse: schema.validateErrorResponse,
          validateRequest: schema.validateRequest,
          schemaDiagnostics: schema.diagnostics,
        });
        const pong = asObject(await client.request('ping', {}));
        if (pong.type !== 'pong' || pong.protocol !== schema.schema.protocol) {
          await client.close();
          throw new ConnectError('schema_mismatch', 'The connected Herdr server protocol does not match the selected API schema.', 'Connect to the Herdr server that belongs to the configured binary or provide its API schema.');
        }
        return { schema, client };
      })();
      this.ready = pending;
      void pending.catch(() => { if (this.ready === pending) this.ready = undefined; });
    }
    return this.ready;
  }

  private schemaMismatch(message: string): ConnectError {
    return new ConnectError('schema_mismatch', `Herdr response did not match the selected API schema: ${message}`, 'Use the API schema shipped with the connected Herdr version.');
  }
}

function toRecord(live: LiveTarget, machineId: string, canSend: boolean): AgentRecord {
  const agent = live.agent;
  const label = agent.display_agent ?? agent.name ?? agent.agent ?? agent.terminal_title_stripped ?? agent.title ?? 'Herdr agent';
  const status = ['idle', 'working', 'blocked', 'done', 'unknown'].includes(agent.agent_status) ? agent.agent_status as AgentRecord['status'] : 'unknown';
  return {
    id: live.id,
    machineId,
    runtime: 'herdr',
    agentType: agent.agent ?? agent.display_agent ?? 'unknown',
    label,
    workspace: agent.cwd ?? agent.foreground_cwd ?? agent.workspace_id,
    status,
    rawStatus: agent.agent_status,
    observedAt: new Date().toISOString(),
    stale: false,
    capabilities: { readOutput: true, sendMessage: canSend, ...(canSend ? {} : { reason: 'A unique valid live name or pane target is required for prompt targeting.' }) },
  };
}

function isValidAlias(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9_-]{0,31}$/.test(value);
}

function isUniqueLiveAlias(agent: HerdrAgent, agents: HerdrAgent[]): boolean {
  return isValidAlias(agent.name) && agents.filter((candidate) => candidate.name === agent.name).length === 1;
}

function promptTarget(agent: HerdrAgent, agents: HerdrAgent[]): string | undefined {
  if (isUniqueLiveAlias(agent, agents)) return agent.name!;
  if (agent.pane_id.length > 0 && agents.filter((candidate) => candidate.pane_id === agent.pane_id).length === 1) return agent.pane_id;
  return undefined;
}

function identityFingerprint(agent: HerdrAgent): string {
  const reference = agent.agent_session ? `${agent.agent_session.source}:${agent.agent_session.agent}:${agent.agent_session.kind}:${agent.agent_session.value}` : '';
  // A move changes pane/workspace ids but preserves the live terminal. Native session ids add
  // evidence but never stand alone as process identity.
  return createHash('sha256').update([agent.terminal_id, agent.agent ?? '', reference].join('\u0000')).digest('hex');
}

function defaultSocketPath(): string {
  const session = process.env.HERDR_SESSION;
  if (session !== undefined && (session.length > 64 || !/^[A-Za-z0-9._-]+$/.test(session) || session === '.' || session === '..')) {
    throw new ConnectError('invalid_config', 'HERDR_SESSION contains unsupported characters.', 'Use a Herdr session name with only letters, numbers, dots, underscores, and hyphens.');
  }
  const root = process.platform === 'win32'
    ? join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'herdr')
    : join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'herdr');
  return session ? join(root, 'sessions', session, 'herdr.sock') : join(root, 'herdr.sock');
}

function platformSocketAddress(path: string): string {
  if (process.platform !== 'win32' || path.startsWith('\\\\.\\pipe\\')) return path;
  return `\\\\.\\pipe\\${path}`;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ConnectError('schema_mismatch', 'Herdr returned a non-object result.', 'Use the API schema shipped with the connected Herdr version.');
  return value as Record<string, unknown>;
}

function isAgent(value: unknown): value is HerdrAgent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.pane_id === 'string' && typeof v.terminal_id === 'string' && typeof v.workspace_id === 'string' && typeof v.tab_id === 'string' && typeof v.agent_status === 'string' && typeof v.revision === 'number';
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new ConnectError('invalid_argument', `Expected an integer from ${min} through ${max}.`, 'Choose a value within the documented output limit.');
  return value;
}

async function readEndpointMarker(socketPath: string): Promise<string | undefined> {
  try {
    if (process.platform === 'win32') {
      if (socketPath.startsWith('\\\\.\\pipe\\')) return undefined;
      const marker = (await readFile(socketPath, 'utf8')).trim();
      return marker || undefined;
    }
    const file = await stat(socketPath);
    return `${file.dev}:${file.ino}`;
  } catch { return undefined; }
}
