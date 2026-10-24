import { AGENT_STATUSES, ConnectError, type AgentStatus, type RuntimeEvent, type RuntimeEventListener } from '../core/index.js';
import { openSubscription, type HerdrPushedEvent, type HerdrSubscription, type HerdrSubscriptionHandle } from './subscription.js';

/** A live agent as the adapter currently maps it: Herdr pane id -> connector agent id plus list metadata. */
export interface BridgeAgent {
  paneId: string;
  agentId: string;
  status: AgentStatus;
  label: string;
  workspace: string;
  revision: number;
}

export interface BridgeHost {
  /** Loads the schema and socket address (the same ones the request client uses). */
  prepare(): Promise<{ socketPath: string; validateRequest?: (value: unknown) => boolean; supportsEvents: boolean }>;
  /** Re-runs agent.list so the pane -> agent id map is current. */
  refresh(): Promise<void>;
  agents(): BridgeAgent[];
}

export interface HerdrEventBridgeOptions {
  log?: (message: string) => void;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** Delay before status events are emitted, so one agent.list refresh serves a burst. Default 100 ms. */
  settleMs?: number;
  /** Delay before list events refresh the agent list. Default 250 ms. */
  listSettleMs?: number;
  openSubscription?: typeof openSubscription;
}

/** Herdr list events: anything that can add, remove or replace an agent. */
const LIST_SUBSCRIPTIONS = ['pane.created', 'pane.closed', 'pane.exited', 'pane.agent_detected'];
const UNSUPPORTED = new Set(['invalid_request', 'unknown_method', 'method_not_found', 'unsupported_capability', 'schema_mismatch']);

const normalizeName = (name: string): string => name.replaceAll('.', '_');

/**
 * Subscribes to Herdr's socket events and turns them into connector runtime events. Status subscriptions in
 * Herdr 0.9.3 are per pane, so the bridge resubscribes whenever the set of agent panes changes, and with
 * backoff when Herdr drops the socket. Pane text is never requested.
 */
export class HerdrEventBridge {
  private readonly listeners = new Set<RuntimeEventListener>();
  private readonly log: (message: string) => void;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly settleMs: number;
  private readonly listSettleMs: number;
  private readonly open: typeof openSubscription;
  private running?: Promise<void>;
  private stopped = true;
  private handle?: HerdrSubscriptionHandle;
  private subscribedPanes = new Set<string>();
  private readonly lastStatus = new Map<string, AgentStatus>();
  private readonly dirty = new Map<string, { agentId: string; status: AgentStatus; previousStatus: AgentStatus | null; label: string; workspace: string }>();
  private statusTimer?: NodeJS.Timeout;
  private listTimer?: NodeJS.Timeout;
  private wake?: () => void;
  private unsupportedLogged = false;
  private resubscribeRequested = false;

  constructor(private readonly host: BridgeHost, options: HerdrEventBridgeOptions = {}) {
    this.log = options.log ?? (() => undefined);
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => { const timer = setTimeout(resolve, ms); timer.unref?.(); }));
    this.random = options.random ?? Math.random;
    this.settleMs = options.settleMs ?? 100;
    this.listSettleMs = options.listSettleMs ?? 250;
    this.open = options.openSubscription ?? openSubscription;
  }

  subscribe(listener: RuntimeEventListener): () => void {
    this.listeners.add(listener);
    if (this.stopped) {
      this.stopped = false;
      this.running = this.run().catch(() => undefined);
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) void this.stop();
    };
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.handle?.close();
    this.wake?.();
    if (this.statusTimer) clearTimeout(this.statusTimer);
    if (this.listTimer) clearTimeout(this.listTimer);
    this.statusTimer = this.listTimer = undefined;
    this.dirty.clear();
    await this.running;
  }

  /** Called by the adapter after every agent.list refresh. */
  agentsRefreshed(idsChanged: boolean): void {
    if (this.stopped) return;
    if (idsChanged) this.emit({ kind: 'agents_changed' });
    const panes = new Set(this.host.agents().map((agent) => agent.paneId));
    if (this.handle && !sameSet(panes, this.subscribedPanes)) this.requestResubscribe(this.handle);
  }

  private requestResubscribe(handle: HerdrSubscriptionHandle): void {
    this.resubscribeRequested = true;
    handle.close(); // run() resubscribes at once, without backoff
  }

  private emit(event: RuntimeEvent): void {
    for (const listener of [...this.listeners]) {
      try { listener(event); } catch { /* a listener failure must not stop the stream */ }
    }
  }

  private async run(): Promise<void> {
    let attempt = 0;
    let dropped = false;
    while (!this.stopped) {
      let resubscribe = false;
      this.resubscribeRequested = false;
      try {
        const { socketPath, validateRequest, supportsEvents } = await this.host.prepare();
        if (!supportsEvents) { this.unsupported('this Herdr version has no events.subscribe'); return; }
        await this.host.refresh();
        if (this.stopped) return;
        const agents = this.host.agents();
        const panes = new Set(agents.map((agent) => agent.paneId));
        for (const agent of agents) this.lastStatus.set(agent.agentId, agent.status);
        const subscriptions: HerdrSubscription[] = [
          ...[...panes].map((paneId) => ({ type: 'pane.agent_status_changed', pane_id: paneId })),
          ...LIST_SUBSCRIPTIONS.map((type) => ({ type })),
        ];
        const handle = this.open({ socketPath, subscriptions, validateRequest, onEvent: (event) => this.onPushed(event) });
        this.handle = handle;
        this.subscribedPanes = panes;
        await handle.started;
        if (attempt > 0) this.log('Herdr agent events resumed.');
        attempt = 0;
        // Events were missed while the socket was down: clients should re-list.
        if (dropped) this.emit({ kind: 'agents_changed' });
        dropped = false;
        // Panes may have changed between the refresh and the acknowledgement.
        if (!sameSet(new Set(this.host.agents().map((agent) => agent.paneId)), panes)) this.requestResubscribe(handle);
        await handle.closed;
        resubscribe = this.resubscribeRequested;
        if (!resubscribe && !this.stopped) {
          dropped = true;
          this.log('Herdr closed the agent event stream; retrying.');
        }
      } catch (error) {
        if (error instanceof ConnectError && UNSUPPORTED.has(error.code)) { this.unsupported(`Herdr rejected events.subscribe (${error.code})`); return; }
        if (attempt === 0 && !this.stopped) this.log(`Herdr agent events unavailable (${error instanceof ConnectError ? error.code : 'error'}); retrying.`);
      } finally {
        this.handle = undefined;
      }
      if (this.stopped) return;
      if (resubscribe) continue;
      const ceiling = Math.min(30_000, 500 * 2 ** Math.min(attempt++, 6));
      await this.pause(Math.round(ceiling * (0.5 + this.random() * 0.5)));
    }
  }

  private async pause(ms: number): Promise<void> {
    await Promise.race([this.sleep(ms), new Promise<void>((resolve) => { this.wake = resolve; })]);
    this.wake = undefined;
  }

  private unsupported(reason: string): void {
    this.stopped = true;
    if (this.unsupportedLogged) return;
    this.unsupportedLogged = true;
    this.log(`Agent events are off: ${reason}. Clients can still poll.`);
  }

  private onPushed(event: HerdrPushedEvent): void {
    if (this.stopped) return;
    const name = normalizeName(event.event);
    if (name === 'pane_agent_status_changed') this.onStatus(event.data);
    else if (LIST_SUBSCRIPTIONS.map(normalizeName).includes(name)) this.scheduleListRefresh();
  }

  private onStatus(data: Record<string, unknown>): void {
    const paneId = data.pane_id;
    const raw = data.agent_status;
    if (typeof paneId !== 'string') return;
    const status: AgentStatus = typeof raw === 'string' && (AGENT_STATUSES as readonly string[]).includes(raw) ? raw as AgentStatus : 'unknown';
    const agent = this.host.agents().find((candidate) => candidate.paneId === paneId);
    if (!agent) { this.scheduleListRefresh(); return; }
    const previousStatus = this.lastStatus.get(agent.agentId) ?? null;
    if (previousStatus === status) return;
    this.lastStatus.set(agent.agentId, status);
    // Keep the latest transition per pane; the relay layer coalesces again per agent.
    this.dirty.set(paneId, { agentId: agent.agentId, status, previousStatus, label: agent.label, workspace: agent.workspace });
    this.statusTimer ??= setTimeout(() => { this.statusTimer = undefined; void this.flushStatus(); }, this.settleMs);
    this.statusTimer.unref?.();
  }

  private async flushStatus(): Promise<void> {
    const batch = [...this.dirty.values()];
    this.dirty.clear();
    let fresh = true;
    try { await this.host.refresh(); } catch { fresh = false; }
    if (this.stopped) return;
    const current = new Map(this.host.agents().map((agent) => [agent.agentId, agent]));
    for (const item of batch) {
      const record = fresh ? current.get(item.agentId) : undefined;
      // An agent that vanished during the refresh is reported by agents.changed instead.
      if (fresh && !record) continue;
      this.emit({
        kind: 'status',
        agentId: item.agentId,
        status: item.status,
        previousStatus: item.previousStatus,
        label: record?.label ?? item.label,
        workspace: record?.workspace ?? item.workspace,
        revision: record ? record.revision : null,
      });
    }
  }

  private scheduleListRefresh(): void {
    this.listTimer ??= setTimeout(() => {
      this.listTimer = undefined;
      // agentsRefreshed() (called by the adapter) emits agents.changed and resubscribes as needed.
      void this.host.refresh().catch(() => undefined);
    }, this.listSettleMs);
    this.listTimer.unref?.();
  }
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}
