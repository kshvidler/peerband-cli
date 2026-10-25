import { randomUUID } from 'node:crypto';
import { ConnectError, sanitizeOutput, type AgentStatus, type RuntimeAdapter } from './core.js';

/**
 * Agent events: the connector pushes small metadata frames to the relay when an agent's state changes, so
 * clients read output only when something happened instead of polling. Events never carry pane text; the
 * only free text is an owner-directed note from `peerband notify`, which goes through the output sanitizer.
 */

export const AGENT_STATUSES: readonly AgentStatus[] = ['idle', 'working', 'blocked', 'done', 'unknown'];

/** What a runtime reports. Runtimes own the mapping from their native ids to connector agent ids. */
export type RuntimeEvent =
  | {
      kind: 'status';
      agentId: string;
      status: AgentStatus;
      previousStatus: AgentStatus | null;
      label: string;
      workspace: string | null;
      revision: number | null;
    }
  | { kind: 'agents_changed' };

export type RuntimeEventListener = (event: RuntimeEvent) => void;

export type EventName = 'agent.status_changed' | 'agents.changed' | 'agent.notified';

/** The client -> server relay frame (see protocol/relay-messages.schema.json#/$defs/event). */
export interface EventFrame {
  type: 'event';
  eventId: string;
  name: EventName;
  timestamp: string;
  data: Record<string, unknown>;
}

/** Sends one frame if the relay socket is open. Returns false when it was dropped. */
export type FrameSender = (frame: EventFrame) => boolean;

/** What the relay client needs: a sender while the socket is open, nothing while it is closed. */
export interface RelayEventChannel {
  attach(send: FrameSender): void;
  detach(): void;
}

export const NOTE_MAX_CHARS = 1024;
/** A channel is one of the owner's webhook endpoints, addressed by its name (`peerband notify --channel`). */
export const CHANNEL_NAME = /^[a-z0-9][a-z0-9-]{0,31}$/;
const PANE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export function eventFrame(name: EventName, data: Record<string, unknown>, now: Date = new Date()): EventFrame {
  return { type: 'event', eventId: randomUUID(), name, timestamp: now.toISOString(), data };
}

export function codePoints(text: string): number {
  return Array.from(text).length;
}

/** Validates the optional channel name of a note; undefined means the default (dashboard and every note webhook). */
export function noteChannel(channel: unknown): string | undefined {
  if (channel === undefined || channel === null) return undefined;
  if (typeof channel !== 'string' || !CHANNEL_NAME.test(channel)) {
    throw new ConnectError('invalid_argument', 'Invalid channel name.', 'Channel names are 1 to 32 lowercase letters, digits or dashes, starting with a letter or digit; see `peerband channels`.');
  }
  return channel;
}

/**
 * Validates and cleans a note for `agent.notified`: strips control and ANSI sequences, redacts likely secrets
 * (best effort, same rules as agent output) and enforces 1..1024 characters.
 */
export function cleanNote(text: unknown): string {
  if (typeof text !== 'string' || text.trim().length === 0) throw new ConnectError('invalid_argument', 'The note is empty.', 'Pass a short note, for example `peerband notify "Tests pass"`.');
  if (codePoints(text) > NOTE_MAX_CHARS) throw new ConnectError('invalid_argument', `The note is longer than ${NOTE_MAX_CHARS} characters.`, 'Shorten the note; put details where the owner can read them, such as a file or the agent output.');
  let clean = sanitizeOutput(text, { lines: 500, bytes: 32 * 1024 }).text.trim();
  // Redaction markers can make a note slightly longer than its input.
  if (codePoints(clean) > NOTE_MAX_CHARS) clean = [...clean].slice(0, NOTE_MAX_CHARS).join('');
  if (clean.length === 0) throw new ConnectError('invalid_argument', 'The note has no printable text.', 'Pass a short plain-text note.');
  return clean;
}

export interface ConnectorEventsOptions {
  allowedAgents?: string[];
  allowedWorkspaces?: string[];
  /** Minimum time between two status events for the same agent (later ones replace earlier ones). Default 250 ms. */
  windowMs?: number;
  /** Overall cap on status and list events: sustained frames per second and burst size. Default 10/s, burst 20. */
  ratePerSecond?: number;
  burst?: number;
  /** Notes per minute (burst and refill). Default 10. */
  notesPerMinute?: number;
  now?: () => number;
  /** One-line notices from the runtime's event stream (for example when it has no event support). */
  log?: (message: string) => void;
}

export interface NotifyResult { sent: boolean; agentId: string | null; eventId?: string; channel?: string }

/**
 * Turns runtime events into relay frames: applies the agent allow-lists, coalesces bursts per agent, caps the
 * overall rate and drops everything while the relay is disconnected (clients resync from `agents.changed`,
 * which is sent once each time the relay connects).
 */
export class ConnectorEvents implements RelayEventChannel {
  private readonly allowedAgents?: Set<string>;
  private readonly allowedWorkspaces?: Set<string>;
  private readonly windowMs: number;
  private readonly ratePerSecond: number;
  private readonly burst: number;
  private readonly notesPerMinute: number;
  private readonly now: () => number;
  private readonly log?: (message: string) => void;
  private send?: FrameSender;
  private unsubscribe?: () => void;
  private readonly pending = new Map<string, Record<string, unknown>>();
  private readonly lastSent = new Map<string, number>();
  private listChanged = false;
  private lastListSent = Number.NEGATIVE_INFINITY;
  private tokens: number;
  private refilledAt: number;
  private noteTokens: number;
  private noteRefilledAt: number;
  private timer?: NodeJS.Timeout;
  private timerAt = Number.POSITIVE_INFINITY;

  constructor(private readonly adapter: RuntimeAdapter, options: ConnectorEventsOptions = {}) {
    this.allowedAgents = options.allowedAgents ? new Set(options.allowedAgents) : undefined;
    this.allowedWorkspaces = options.allowedWorkspaces ? new Set(options.allowedWorkspaces) : undefined;
    this.windowMs = options.windowMs ?? 250;
    this.ratePerSecond = options.ratePerSecond ?? 10;
    this.burst = options.burst ?? 20;
    this.notesPerMinute = options.notesPerMinute ?? 10;
    this.now = options.now ?? Date.now;
    this.log = options.log;
    this.tokens = this.burst;
    this.noteTokens = this.notesPerMinute;
    this.refilledAt = this.noteRefilledAt = this.now();
  }

  /** Starts listening to the runtime. Runtimes without events are fine: only notes are sent then. */
  start(): void {
    if (this.unsubscribe || !this.adapter.onEvent) return;
    this.unsubscribe = this.adapter.onEvent((event) => this.push(event), this.log);
  }

  close(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.detach();
  }

  attach(send: FrameSender): void {
    this.send = send;
    this.pending.clear();
    // Whatever happened while disconnected was dropped: tell clients to re-list.
    this.listChanged = false;
    this.lastListSent = this.now();
    send(eventFrame('agents.changed', {}));
  }

  detach(): void {
    this.send = undefined;
    this.pending.clear();
    this.listChanged = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.timerAt = Number.POSITIVE_INFINITY;
  }

  get connected(): boolean { return this.send !== undefined; }

  push(event: RuntimeEvent): void {
    if (!this.send) return;
    if (event.kind === 'agents_changed') this.listChanged = true;
    else {
      if (!this.visible(event.agentId, event.workspace)) return;
      this.pending.set(event.agentId, {
        agentId: event.agentId,
        status: event.status,
        previousStatus: event.previousStatus,
        label: event.label,
        workspace: event.workspace,
        revision: event.revision,
      });
    }
    this.flush();
  }

  /** Sends an owner-directed note. Resolves the calling pane to an agent id when the runtime can. */
  async notify(input: { text: unknown; paneId?: unknown; channel?: unknown }): Promise<NotifyResult> {
    if (!this.adapter.getCapabilities().readOutput) throw new ConnectError('unsupported_capability', 'This connector does not share agent output, so notes are turned off.', 'Use a runtime with output support.');
    const text = cleanNote(input.text);
    const channel = noteChannel(input.channel);
    const agentId = await this.resolveAgent(input.paneId);
    // The channel is echoed back so `peerband notify --channel` can tell this relay from one that ignores it.
    const echo = channel ? { channel } : {};
    if (!this.send) return { sent: false, agentId, ...echo };
    this.refillNotes();
    if (this.noteTokens < 1) throw new ConnectError('rate_limited', `Too many notes: at most ${this.notesPerMinute} per minute.`, 'Wait a minute, and send one note per important result.');
    this.noteTokens -= 1;
    const frame = eventFrame('agent.notified', { agentId, text, audience: 'owner', ...echo });
    const sent = this.send(frame);
    return { sent, agentId, ...(sent ? { eventId: frame.eventId } : {}), ...echo };
  }

  private async resolveAgent(paneId: unknown): Promise<string | null> {
    if (typeof paneId !== 'string' || !PANE_ID.test(paneId) || !this.adapter.agentIdForPane) return null;
    try {
      const id = await this.adapter.agentIdForPane(paneId);
      if (!id) return null;
      if (!this.allowedAgents && !this.allowedWorkspaces) return id;
      const agent = await this.adapter.getAgent(id);
      return this.visible(agent.id, agent.workspace) ? agent.id : null;
    } catch {
      return null;
    }
  }

  private visible(agentId: string, workspace: string | null): boolean {
    if (this.allowedAgents && !this.allowedAgents.has(agentId)) return false;
    if (this.allowedWorkspaces && (workspace === null || !this.allowedWorkspaces.has(workspace))) return false;
    return true;
  }

  private refill(now: number): void {
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.refilledAt) / 1000) * this.ratePerSecond);
    this.refilledAt = now;
  }

  private refillNotes(): void {
    const now = this.now();
    this.noteTokens = Math.min(this.notesPerMinute, this.noteTokens + ((now - this.noteRefilledAt) / 60_000) * this.notesPerMinute);
    this.noteRefilledAt = now;
  }

  private flush(): void {
    const send = this.send;
    if (!send) return;
    const now = this.now();
    this.refill(now);
    let next = Number.POSITIVE_INFINITY;
    if (this.listChanged) {
      const due = this.lastListSent + this.windowMs;
      if (due > now) next = Math.min(next, due);
      else if (this.tokens >= 1) {
        this.tokens -= 1;
        this.listChanged = false;
        this.lastListSent = now;
        send(eventFrame('agents.changed', {}));
      }
    }
    for (const [agentId, data] of this.pending) {
      const due = (this.lastSent.get(agentId) ?? Number.NEGATIVE_INFINITY) + this.windowMs;
      if (due > now) { next = Math.min(next, due); continue; }
      if (this.tokens < 1) break;
      this.tokens -= 1;
      this.pending.delete(agentId);
      this.lastSent.set(agentId, now);
      send(eventFrame('agent.status_changed', data));
    }
    for (const [agentId, at] of this.lastSent) if (at + this.windowMs <= now && !this.pending.has(agentId)) this.lastSent.delete(agentId);
    if ((this.pending.size > 0 || this.listChanged) && this.tokens < 1) next = Math.min(next, now + Math.ceil(((1 - this.tokens) / this.ratePerSecond) * 1000));
    this.schedule(next);
  }

  private schedule(at: number): void {
    if (!Number.isFinite(at)) return;
    if (this.timer && this.timerAt <= at) return;
    if (this.timer) clearTimeout(this.timer);
    this.timerAt = at;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.timerAt = Number.POSITIVE_INFINITY;
      this.flush();
    }, Math.max(0, at - this.now()));
    this.timer.unref?.();
  }
}
