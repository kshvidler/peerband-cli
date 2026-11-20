import { createHash, randomUUID } from 'node:crypto';
import { ConnectError, sanitizeOutput, type AgentRecord, type AgentStatus, type Capabilities, type OutputOptions, type OutputResult, type RuntimeAdapter, type RuntimeEvent, type RuntimeEventListener } from '../core/index.js';
import type { EnvironmentResult } from '../core/environment.js';
import { BACKGROUND_SPACE_ID, BACKGROUND_SPACE_LABEL, BACKGROUND_TAB_ID, BACKGROUND_TAB_LABEL, cleanLabel, emptyLayout, LAYOUT_DOC, parseLayout, type CoreLayout } from './layout.js';
import { CoreConnection, CoreRpcClient, CoreRpcError, resolveCoreBinary, spawnCoreStream, type CoreNotification, type CoreStreamFactory } from './rpc.js';

export interface HerdrCoreAdapterOptions {
  /** The `hc` binary. Default: $HC_BIN, `hc` on PATH, then the installer's location. */
  binary?: string;
  machineId?: string;
  timeoutMs?: number;
  /** Test seam: how to open a protocol stream (default: spawn `hc connect`). */
  streamFactory?: CoreStreamFactory;
  /** Test seams for the event stream. */
  sleep?: (ms: number) => Promise<void>;
  settleMs?: number;
}

/** The fields of core's Terminal record the adapter reads (see `hc schema`). */
interface CoreTerminal {
  address: string;
  argv?: string[];
  cwd?: string;
  created_ms?: number;
  foreground?: { name?: string; cwd?: string; pid?: number } | null;
  name?: string | null;
  pid?: number | null;
  state?: string;
  status?: { state?: string; app?: string } | null;
}

interface LiveTarget { id: string; fingerprint: string; terminal: CoreTerminal }

const LOCAL_ADDRESS = /^t[0-9]{1,12}$/;
const PROTOCOL_GENERATION = 1;
const REQUIRED_METHODS = ['terminal.list', 'terminal.get', 'terminal.read', 'terminal.send', 'events.subscribe', 'doc.get'];
/** Facts that add, remove or replace an agent. `status` is handled on its own; `foreground` changes twice a second and is ignored. */
const LIST_EVENTS = new Set(['created', 'lost', 'restarted', 'finished', 'removed']);
/** Message delivery waits for a person's unsent draft for up to 60 s (core's draft_wait), so allow longer. */
const SEND_TIMEOUT_MS = 90_000;
/** Agent names core reports in OSC 7501 `app`, mapped to the kinds PeerBand uses elsewhere. */
const APP_KINDS: Record<string, string> = { 'claude-code': 'claude', 'cursor-agent': 'cursor', 'github-copilot': 'copilot', 'grok-build': 'grok' };

/**
 * Runtime adapter for herdr-core (`hc`), the terminal server behind the Herdr desktop app. An agent is a live
 * local terminal whose program reports status through OSC 7501; core never guesses status from screen text,
 * so neither does PeerBand. Remote machines a core has added (`box/t3`) are not exposed: each machine runs
 * its own relay.
 */
export class HerdrCoreAdapter implements RuntimeAdapter {
  private readonly client: CoreRpcClient;
  private readonly factory: CoreStreamFactory;
  private readonly machineId: string;
  private readonly timeoutMs: number;
  private ready?: Promise<string>;
  private coreId?: string;
  private current = new Map<string, LiveTarget>();
  private records = new Map<string, AgentRecord>();
  private retired = new Set<string>();
  private layout: CoreLayout = emptyLayout();
  private terminals: CoreTerminal[] = [];
  private refreshing?: Promise<AgentRecord[]>;
  private listed = false;
  private readonly listeners = new Set<RuntimeEventListener>();
  private watching?: Promise<void>;
  private stopped = false;
  private stream?: CoreConnection;
  private refreshTimer?: NodeJS.Timeout;
  private wake?: () => void;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly settleMs: number;

  constructor(private readonly options: HerdrCoreAdapterOptions = {}) {
    this.factory = options.streamFactory ?? spawnCoreStream(resolveCoreBinary(options.binary));
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.client = new CoreRpcClient(this.factory, this.timeoutMs);
    this.machineId = options.machineId ?? createHash('sha256').update(`${process.platform}:${process.env.COMPUTERNAME ?? process.env.HOSTNAME ?? 'local'}`).digest('hex').slice(0, 24);
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      timer.unref?.();
      this.wake = () => { clearTimeout(timer); resolve(); };
    }));
    this.settleMs = options.settleMs ?? 150;
  }

  getCapabilities(): Capabilities {
    return { readOutput: true, sendMessage: true, reason: 'Messages go to the agent\'s terminal address, which herdr-core never reuses. PeerBand checks that the same program still runs there right before sending.' };
  }

  async listAgents(): Promise<AgentRecord[]> {
    if (!this.refreshing) this.refreshing = this.refreshAgents().finally(() => { this.refreshing = undefined; });
    return this.refreshing;
  }

  private async refreshAgents(): Promise<AgentRecord[]> {
    const coreId = await this.initialize();
    const [listed, layout] = await Promise.all([
      this.call('terminal.list', {}),
      this.call('doc.get', { name: LAYOUT_DOC }).then((result) => parseLayout((result as { value?: unknown } | null)?.value), () => emptyLayout()),
    ]);
    const terminals = (listed as { terminals?: unknown } | null)?.terminals;
    if (!Array.isArray(terminals)) throw schemaMismatch('terminal.list returned no terminal list');
    // A different core (another HC_SOCKET, or wiped state) reuses addresses: every old handle is stale.
    const reconnected = this.coreId !== undefined && this.coreId !== coreId;
    this.coreId = coreId;
    const previous = new Map([...this.current.values()].map((live) => [live.fingerprint, live]));
    const previousRecords = this.records;
    const next = new Map<string, LiveTarget>();
    const records: AgentRecord[] = [];
    this.terminals = terminals.filter(isTerminal).filter((terminal) => LOCAL_ADDRESS.test(terminal.address) && terminal.state === 'live');
    for (const terminal of this.terminals) {
      if (!isAgent(terminal)) continue;
      const fingerprint = identityFingerprint(coreId, terminal);
      const id = (!reconnected ? previous.get(fingerprint)?.id : undefined) ?? `hc_${randomUUID()}`;
      const live = { id, fingerprint, terminal };
      next.set(terminal.address, live);
      records.push(toRecord(live, this.machineId, layout));
    }
    const ids = new Set(records.map((record) => record.id));
    for (const live of this.current.values()) if (!ids.has(live.id)) this.retired.add(live.id);
    const idsChanged = this.listed && (ids.size !== previousRecords.size || [...previousRecords.keys()].some((id) => !ids.has(id)));
    const layoutChanged = this.listed && records.some((record) => {
      const before = previousRecords.get(record.id);
      return before !== undefined && (JSON.stringify(before.location) !== JSON.stringify(record.location) || before.label !== record.label);
    });
    this.current = next;
    this.layout = layout;
    this.records = new Map(records.map((record) => [record.id, record]));
    const firstList = !this.listed;
    this.listed = true;
    if (!firstList) {
      // Status changes this refresh found that no live status event announced (a reconnect or a missed batch).
      for (const record of records) {
        const before = previousRecords.get(record.id);
        if (before && before.status !== record.status) this.emit({ kind: 'status', agentId: record.id, status: record.status, previousStatus: before.status, label: record.label, workspace: record.workspace, revision: null });
      }
      if (idsChanged || layoutChanged) this.emit({ kind: 'agents_changed' });
    }
    return records;
  }

  async getAgent(id: string): Promise<AgentRecord> {
    const agents = await this.listAgents();
    const record = agents.find((agent) => agent.id === id);
    if (record) return record;
    if (this.retired.has(id)) throw new ConnectError('stale_target', 'This agent handle refers to a program that has exited or changed.', 'Refresh the agent list and select its current occupant.');
    throw new ConnectError('agent_not_found', 'No herdr-core agent has that identifier.', 'List agents and use a current agent identifier.');
  }

  /** The agent id for a core terminal address such as $HC_TERMINAL_ID, after a fresh list. */
  async agentIdForPane(paneId: string): Promise<string | undefined> {
    await this.listAgents();
    return this.current.get(paneId)?.id;
  }

  async readOutput(id: string, options: OutputOptions = {}): Promise<OutputResult> {
    if (options.cursor !== undefined) throw new ConnectError('unsupported_capability', 'herdr-core output cursors are not supported.', 'Request output again with a bounded line or byte limit and no cursor.');
    await this.getAgent(id);
    const live = this.liveById(id);
    const result = await this.read(live.terminal.address, options);
    await this.getAgent(id);
    return result;
  }

  async readPane(paneId: string, options: OutputOptions = {}): Promise<OutputResult> {
    await this.listAgents();
    if (!LOCAL_ADDRESS.test(paneId) || !this.terminals.some((terminal) => terminal.address === paneId)) {
      throw new ConnectError('agent_not_found', 'No live herdr-core terminal has that id.', 'Refresh the environment and pick a current pane.');
    }
    return this.read(paneId, options);
  }

  private async read(address: string, options: OutputOptions): Promise<OutputResult> {
    const lines = clampInteger(options.lines, 80, 1, 500);
    const result = await this.call('terminal.read', { terminal: address, lines }) as { text?: unknown; complete?: unknown; how?: unknown; why?: unknown } | null;
    if (!result || typeof result.text !== 'string') throw schemaMismatch('terminal.read returned no text');
    // The screen is padded to its full height; trailing blank rows are not output.
    const text = result.text.replace(/(?:[ \t]*\r?\n)+[ \t]*$/, '');
    const output = sanitizeOutput(text, { ...options, lines, bytes: clampInteger(options.bytes, 16_384, 1, 32_768) });
    // While an agent works or waits, core returns only its screen instead of scrolling a full-screen app.
    const visibleOnly = result.how === 'screen' && typeof result.why === 'string';
    return { ...output, ...(visibleOnly ? { source: 'visible' as const } : {}), truncated: visibleOnly || output.truncated || result.complete === false, observedAt: new Date().toISOString(), untrusted: true };
  }

  async sendMessage(id: string, message: string): Promise<void> {
    if (typeof message !== 'string' || message.length === 0 || Buffer.byteLength(message, 'utf8') > 16_384) {
      throw new ConnectError('invalid_argument', 'Message must contain 1 to 16384 UTF-8 bytes.', 'Shorten the message and try again.');
    }
    await this.getAgent(id);
    const live = this.liveById(id);
    if (live.terminal.status?.state === 'blocked' || live.terminal.status?.state === 'error') {
      throw new ConnectError('agent_blocked', 'The agent is blocked and cannot accept a message.', 'Inspect the agent and resolve what it is waiting for before sending a message.');
    }
    // Recheck the program right before typing: an address is never reused, but a kept terminal can restart its shell.
    const now = await this.call('terminal.get', { terminal: live.terminal.address });
    if (!isTerminal(now) || now.state !== 'live' || identityFingerprint(this.coreId!, now) !== live.fingerprint) {
      this.retired.add(id);
      throw new ConnectError('stale_target', 'The program in this terminal changed before the message was sent.', 'Refresh the agent list and select its current occupant.');
    }
    const result = await this.call('terminal.send', { terminal: live.terminal.address, text: message }, SEND_TIMEOUT_MS);
    if (!result || typeof result !== 'object' || typeof (result as { turn?: unknown }).turn !== 'number') throw new ConnectError('delivery_unknown', 'herdr-core answered the message with an unexpected result.', 'Read the agent output before deciding whether to send it again.');
  }

  /** The layout as the dashboard shows it. Read only: herdr-core spaces and tabs belong to the desktop app. */
  async listEnvironment(): Promise<EnvironmentResult> {
    const agents = await this.listAgents();
    const byAddress = new Map([...this.current.values()].map((live) => [live.terminal.address, this.records.get(live.id)]));
    const terminals = new Map(this.terminals.map((terminal) => [terminal.address, terminal]));
    const workspaces: Record<string, unknown>[] = [];
    const tabs: Record<string, unknown>[] = [];
    const panes: Record<string, unknown>[] = [];
    const pane = (address: string, tabId: string, workspaceId: string) => {
      const terminal = terminals.get(address);
      if (!terminal) return;
      const agent = byAddress.get(address);
      const cwd = cleanText(terminal.foreground?.cwd ?? terminal.cwd, 2048);
      panes.push({ paneId: address, tabId, workspaceId, ...(cwd ? { cwd } : {}), ...(agent ? { agent: agent.agentType, agentStatus: agent.rawStatus, name: agent.label } : { label: cleanText(terminal.name ?? terminal.foreground?.name, 256) ?? address }) });
    };
    for (const space of this.layout.spaces) {
      workspaces.push({ workspaceId: space.id, ...(space.label ? { label: space.label } : {}), number: space.number, tabCount: space.tabs.length });
      for (const tab of space.tabs) {
        const shown = tab.terminals.filter((address) => terminals.has(address));
        tabs.push({ tabId: tab.id, workspaceId: space.id, ...(tab.label ? { label: tab.label } : {}), number: tab.number, paneCount: shown.length });
        for (const address of shown) pane(address, tab.id, space.id);
      }
    }
    const background = agents.filter((agent) => agent.location?.space.id === BACKGROUND_SPACE_ID);
    if (background.length) {
      workspaces.push({ workspaceId: BACKGROUND_SPACE_ID, label: BACKGROUND_SPACE_LABEL, number: this.layout.spaces.length + 1, tabCount: 1 });
      tabs.push({ tabId: BACKGROUND_TAB_ID, workspaceId: BACKGROUND_SPACE_ID, label: BACKGROUND_TAB_LABEL, number: 1, paneCount: background.length });
      for (const live of this.current.values()) if (this.records.get(live.id)?.location?.space.id === BACKGROUND_SPACE_ID) pane(live.terminal.address, BACKGROUND_TAB_ID, BACKGROUND_SPACE_ID);
    }
    // No actions: arranging spaces, tabs and panes is the desktop app's job, so this runtime offers none.
    const result: EnvironmentResult = { actions: [], runtime: 'herdr-core' };
    for (const [key, rows] of [['workspaces', workspaces], ['tabs', tabs], ['panes', panes]] as const) {
      result[key] = rows.slice(0, 50);
      result[`${key}Truncated`] = rows.length > 50;
    }
    if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 48 * 1024) throw new ConnectError('response_too_large', 'The environment metadata exceeds the frame budget.', 'Close some terminals before listing the layout remotely.');
    return result;
  }

  async controlEnvironment(): Promise<EnvironmentResult> {
    throw new ConnectError('unsupported_capability', 'Changing spaces, tabs and panes is not available for herdr-core yet.', 'Arrange them in the Herdr desktop app.');
  }

  /** Status and list-change events from core's events.subscribe (metadata only, never terminal text). */
  onEvent(listener: RuntimeEventListener, log?: (message: string) => void): () => void {
    this.listeners.add(listener);
    if (!this.watching) {
      this.stopped = false;
      this.watching = this.watch(log ?? (() => undefined));
    }
    return () => { this.listeners.delete(listener); };
  }

  async close(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.refreshTimer);
    this.stream?.close();
    this.wake?.();
    await this.watching?.catch(() => undefined);
    await this.client.close();
  }

  private async watch(log: (message: string) => void): Promise<void> {
    let delay = 1_000;
    let announced = false;
    while (!this.stopped) {
      const connection = new CoreConnection(this.factory(), (message) => this.onNotification(message));
      this.stream = connection;
      const startedAt = Date.now();
      try {
        await connection.request('events.subscribe', {}, this.timeoutMs);
        if (!announced) { log('Watching herdr-core for agent status changes.'); announced = true; }
        // The snapshot may already differ from the last list (a reconnect): reconcile through one refresh.
        this.scheduleRefresh(0);
        await connection.done;
      } catch {
        connection.close();
        await connection.done;
      }
      if (this.stopped) break;
      if (Date.now() - startedAt > 60_000) delay = 1_000;
      log('herdr-core event stream closed; reconnecting.');
      await this.sleep(delay);
      delay = Math.min(delay * 2, 30_000);
    }
  }

  private onNotification(message: CoreNotification): void {
    if (message.method === 'missed') { this.scheduleRefresh(); return; }
    if (message.method !== 'event') return;
    const { type, terminal, data, seq } = message.params as { type?: unknown; terminal?: unknown; data?: unknown; seq?: unknown; machine?: unknown };
    if (type === 'doc') {
      const doc = data as { name?: unknown } | undefined;
      if (doc?.name === LAYOUT_DOC && message.params.machine === undefined) this.scheduleRefresh();
      return;
    }
    if (typeof terminal !== 'string' || !LOCAL_ADDRESS.test(terminal)) return;
    if (typeof type === 'string' && LIST_EVENTS.has(type)) { this.scheduleRefresh(); return; }
    if (type !== 'status') return;
    const reported = (data as { status?: CoreTerminal['status'] } | undefined)?.status ?? null;
    const live = this.current.get(terminal);
    // A first report makes a new agent, a cleared one ends it: both change the list.
    if (!live || !reported || typeof reported.state !== 'string') { this.scheduleRefresh(); return; }
    const record = this.records.get(live.id);
    if (!record) return;
    const status = toStatus(reported.state);
    live.terminal = { ...live.terminal, status: reported };
    if (record.status === status && record.rawStatus === reported.state) return;
    const previousStatus = record.status;
    this.records.set(record.id, { ...record, status, rawStatus: reported.state, observedAt: new Date().toISOString() });
    if (previousStatus !== status) this.emit({ kind: 'status', agentId: record.id, status, previousStatus, label: record.label, workspace: record.workspace, revision: typeof seq === 'number' && Number.isSafeInteger(seq) ? seq : null });
  }

  private scheduleRefresh(delay = this.settleMs): void {
    if (this.stopped || this.refreshTimer) return;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      void this.listAgents().catch(() => undefined);
    }, delay);
    this.refreshTimer.unref?.();
  }

  private emit(event: RuntimeEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }

  private liveById(id: string): LiveTarget {
    const live = [...this.current.values()].find((item) => item.id === id);
    if (!live) throw new ConnectError('stale_target', 'This agent handle is no longer current.', 'Refresh the agent list and select its current occupant.');
    return live;
  }

  private initialize(): Promise<string> {
    if (!this.ready) {
      const pending = (async () => {
        const hello = await this.call('hello', {}) as { generation?: unknown; methods?: unknown; core?: { id?: unknown } } | null;
        if (!hello || hello.generation !== PROTOCOL_GENERATION) throw new ConnectError('schema_mismatch', 'This herdr-core speaks a protocol generation PeerBand does not support.', 'Update PeerBand (`peerband update`) and herdr-core (`hc update`).');
        const methods = Array.isArray(hello.methods) ? hello.methods : [];
        const missing = REQUIRED_METHODS.filter((method) => !methods.includes(method));
        if (missing.length) throw new ConnectError('schema_mismatch', `This herdr-core lacks ${missing.join(', ')}.`, 'Update herdr-core with `hc update`.');
        return typeof hello.core?.id === 'string' ? hello.core.id : 'core';
      })();
      this.ready = pending;
      void pending.catch(() => { if (this.ready === pending) this.ready = undefined; });
    }
    // Re-check identity on each refresh so a restarted or replaced core is noticed.
    return this.ready.then(async (id) => {
      if (this.coreId === undefined) return id;
      const status = await this.call('server.status', {}).catch(() => undefined) as { core?: { id?: unknown } } | undefined;
      return typeof status?.core?.id === 'string' ? status.core.id : id;
    });
  }

  private async call(method: string, params: Record<string, unknown>, timeoutMs?: number): Promise<unknown> {
    try {
      return await this.client.request(method, params, timeoutMs);
    } catch (error) {
      throw mapError(error, method);
    }
  }
}

/** Maps core's stable error kinds to connector errors. A send that may have typed anything is never "definite". */
function mapError(error: unknown, method: string): unknown {
  if (!(error instanceof CoreRpcError)) return error;
  switch (error.kind) {
    case 'not_found':
    case 'finished':
      return new ConnectError('stale_target', 'That terminal is no longer running in herdr-core.', 'Refresh the agent list and select its current occupant.');
    case 'blocked':
      return new ConnectError('agent_blocked', 'The agent is blocked and cannot accept a message.', 'Inspect the agent and resolve what it is waiting for before sending a message.');
    case 'invalid_params':
      return new ConnectError('schema_mismatch', `herdr-core rejected ${method}.`, 'Update PeerBand and herdr-core.');
    case 'unavailable':
      return method === 'terminal.send'
        ? new ConnectError('delivery_unknown', 'herdr-core could not confirm the message.', 'Read the agent output before deciding whether to send it again.')
        : new ConnectError('runtime_unavailable', 'herdr-core cannot reach that terminal right now.', 'Wait for it to restart, then retry.');
    default:
      return method === 'terminal.send'
        ? new ConnectError('delivery_unknown', 'herdr-core reported an error while sending.', 'Read the agent output before deciding whether to send it again.')
        : new ConnectError('runtime_unavailable', `herdr-core ${method} failed.`, 'Check `hc server status`, then retry.');
  }
}

function schemaMismatch(message: string): ConnectError {
  return new ConnectError('schema_mismatch', `herdr-core response did not match the expected API: ${message}`, 'Update PeerBand and herdr-core.');
}

function isTerminal(value: unknown): value is CoreTerminal {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && typeof (value as { address?: unknown }).address === 'string';
}

/** Core never infers status, so a terminal is an agent while its program reports one (OSC 7501). */
function isAgent(terminal: CoreTerminal): boolean {
  return typeof terminal.pid === 'number' && Boolean(terminal.status) && typeof terminal.status?.state === 'string';
}

function toStatus(word: string): AgentStatus {
  if (word === 'idle' || word === 'working' || word === 'blocked' || word === 'done') return word;
  // An error needs the person, like a blocked agent does.
  return word === 'error' ? 'blocked' : 'unknown';
}

/** Core address plus start time and pid: the same program in the same terminal. A restarted shell is a new occupant. */
function identityFingerprint(coreId: string, terminal: CoreTerminal): string {
  return createHash('sha256').update([coreId, terminal.address, String(terminal.created_ms ?? ''), String(terminal.pid ?? '')].join('\u0000')).digest('hex');
}

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  return sanitizeOutput(value, { bytes: max, lines: 1 }).text || undefined;
}

function programName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const base = value.split(/[\\/]/).pop() ?? value;
  return base.replace(/\.(exe|cmd|bat)$/i, '') || undefined;
}

function toRecord(live: LiveTarget, machineId: string, layout: CoreLayout): AgentRecord {
  const { terminal } = live;
  const app = cleanLabel(terminal.status?.app) ?? undefined;
  const agentType = (app ? APP_KINDS[app] ?? app : undefined) ?? programName(terminal.argv?.[0]) ?? 'unknown';
  const label = cleanLabel(terminal.name) ?? app ?? cleanLabel(programName(terminal.foreground?.name)) ?? terminal.address;
  const rawStatus = terminal.status?.state ?? 'unknown';
  const place = layout.byTerminal.get(terminal.address);
  return {
    id: live.id,
    machineId,
    runtime: 'herdr-core',
    agentType,
    label,
    workspace: cleanText(terminal.foreground?.cwd ?? terminal.cwd, 2048) ?? terminal.address,
    status: toStatus(rawStatus),
    rawStatus,
    observedAt: new Date().toISOString(),
    stale: false,
    capabilities: { readOutput: true, sendMessage: true },
    location: place
      ? { space: { id: place.space.id, label: place.space.label, number: place.space.number }, tab: { id: place.tab.id, label: place.tab.label, number: place.tab.number } }
      : { space: { id: BACKGROUND_SPACE_ID, label: BACKGROUND_SPACE_LABEL, number: layout.spaces.length + 1 }, tab: { id: BACKGROUND_TAB_ID, label: BACKGROUND_TAB_LABEL, number: 1 } },
  };
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new ConnectError('invalid_argument', `Expected an integer from ${min} through ${max}.`, 'Choose a value within the documented output limit.');
  return value;
}
