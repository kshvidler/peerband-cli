import {
  ConnectError,
  type AgentRecord,
  type Capabilities,
  type OutputOptions,
  type OutputResult,
  type RuntimeAdapter,
  type RuntimeEventListener,
} from '../core/index.js';
import type { EnvironmentCommand, EnvironmentResult } from '../core/environment.js';

/** One runtime inside a combined relay. */
export interface RuntimePart {
  /** Its runtime name, also written on its workspaces in list_environment (`herdr`, `herdr-core`). */
  name: string;
  adapter: RuntimeAdapter;
  /** True for the agent ids this runtime hands out (they carry a runtime prefix such as `herdr_` or `hc_`). */
  ownsAgent(id: string): boolean;
}

const ENVIRONMENT_KEYS = ['workspaces', 'tabs', 'panes'] as const;
const MAX_ROWS = 50;
const MAX_ENVIRONMENT_BYTES = 48 * 1024;

/**
 * Serves several runtimes through one relay, for example the Herdr terminal app and herdr-core side by side.
 * The relay keeps one connection per machine, so this is how both can be online at once.
 *
 * - Agents are the union of every runtime that answers; a runtime that is not running is left out, and only
 *   when none answers does the error reach the caller.
 * - Agent ids are routed by their runtime prefix. An id no runtime claims goes to the first (primary) runtime,
 *   which answers with its usual "no agent" error.
 * - Events from every runtime reach the same listener.
 * - list_environment joins the layouts. `actions` are the primary runtime's; each workspace says which runtime
 *   it belongs to, and controls aimed at another runtime's layout go to that runtime (herdr-core refuses them).
 */
export class CombinedAdapter implements RuntimeAdapter {
  /** Which runtime listed each workspace, tab and pane id in the last list_environment. */
  private environmentOwners = new Map<string, RuntimePart>();

  constructor(private readonly parts: RuntimePart[]) {
    if (parts.length === 0) throw new Error('CombinedAdapter needs at least one runtime.');
  }

  get runtimeNames(): string[] { return this.parts.map((part) => part.name); }

  getCapabilities(): Capabilities {
    const capabilities = this.parts.map((part) => part.adapter.getCapabilities());
    const reasons = capabilities.map((capability) => capability.reason).filter((reason): reason is string => Boolean(reason));
    return {
      readOutput: capabilities.some((capability) => capability.readOutput),
      sendMessage: capabilities.some((capability) => capability.sendMessage),
      ...(reasons.length ? { reason: reasons.join(' ') } : {}),
    };
  }

  async listAgents(): Promise<AgentRecord[]> {
    const results = await Promise.allSettled(this.parts.map((part) => part.adapter.listAgents()));
    const agents = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
    if (results.every((result) => result.status === 'rejected')) throw (results[0] as PromiseRejectedResult).reason;
    return agents;
  }

  getAgent(id: string): Promise<AgentRecord> { return this.agentPart(id).adapter.getAgent(id); }

  readOutput(id: string, options: OutputOptions): Promise<OutputResult> { return this.agentPart(id).adapter.readOutput(id, options); }

  sendMessage(id: string, message: string): Promise<void> { return this.agentPart(id).adapter.sendMessage(id, message); }

  async agentIdForPane(paneId: string): Promise<string | undefined> {
    for (const part of this.parts) {
      const id = await part.adapter.agentIdForPane?.(paneId).catch(() => undefined);
      if (id) return id;
    }
    return undefined;
  }

  onEvent(listener: RuntimeEventListener, log?: (message: string) => void): () => void {
    const stops = this.parts.map((part) => part.adapter.onEvent?.(listener, log));
    return () => { for (const stop of stops) stop?.(); };
  }

  async listEnvironment(): Promise<EnvironmentResult> {
    const listing = this.parts.filter((part) => part.adapter.listEnvironment);
    if (listing.length === 0) throw new ConnectError('unsupported_capability', 'This runtime does not support environment control.', 'Use a compatible Herdr runtime.');
    const results = await Promise.allSettled(listing.map((part) => part.adapter.listEnvironment!()));
    if (results.every((result) => result.status === 'rejected')) throw (results[0] as PromiseRejectedResult).reason;
    const owners = new Map<string, RuntimePart>();
    const merged: EnvironmentResult = { actions: [] };
    const rows: Record<string, Array<Record<string, unknown>>> = { workspaces: [], tabs: [], panes: [] };
    const truncated: Record<string, boolean> = { workspaces: false, tabs: false, panes: false };
    let actionsSet = false;
    results.forEach((result, index) => {
      if (result.status !== 'fulfilled') return;
      const part = listing[index]!;
      const environment = result.value;
      // The first runtime that answers sets the actions: it is the one the dashboard can arrange.
      if (!actionsSet && Array.isArray(environment.actions)) { merged.actions = environment.actions; actionsSet = true; }
      const offset = rows.workspaces!.length;
      for (const key of ENVIRONMENT_KEYS) {
        const list = Array.isArray(environment[key]) ? (environment[key] as Array<Record<string, unknown>>) : [];
        if (environment[`${key}Truncated`] === true) truncated[key] = true;
        for (const row of list) {
          const id = row[key === 'workspaces' ? 'workspaceId' : key === 'tabs' ? 'tabId' : 'paneId'];
          if (typeof id === 'string' && !owners.has(id)) owners.set(id, part);
          if (key === 'workspaces') {
            // Number workspaces across runtimes; each one says which runtime it belongs to.
            rows.workspaces!.push({ ...row, ...(typeof row.number === 'number' ? { number: row.number + offset } : {}), runtime: part.name, readOnly: !(Array.isArray(environment.actions) && environment.actions.length > 0) });
          } else {
            rows[key]!.push(row);
          }
        }
      }
    });
    for (const key of ENVIRONMENT_KEYS) {
      merged[key] = rows[key]!.slice(0, MAX_ROWS);
      merged[`${key}Truncated`] = truncated[key] || rows[key]!.length > MAX_ROWS;
    }
    if (Buffer.byteLength(JSON.stringify(merged), 'utf8') > MAX_ENVIRONMENT_BYTES) throw new ConnectError('response_too_large', 'The environment metadata exceeds the frame budget.', 'Close some panes before listing the layout remotely.');
    this.environmentOwners = owners;
    return merged;
  }

  async controlEnvironment(command: EnvironmentCommand): Promise<EnvironmentResult> {
    const part = await this.environmentPart([command.paneId, command.tabId, command.workspaceId]);
    if (!part.adapter.controlEnvironment) throw new ConnectError('unsupported_capability', `The ${part.name} runtime cannot change its layout from PeerBand.`, 'Arrange it in its own app.');
    return part.adapter.controlEnvironment(command);
  }

  async readPane(paneId: string, options: OutputOptions): Promise<OutputResult> {
    const part = await this.environmentPart([paneId]);
    if (!part.adapter.readPane) throw new ConnectError('unsupported_capability', 'This runtime cannot read panes.', 'Use a compatible Herdr runtime.');
    return part.adapter.readPane(paneId, options);
  }

  async close(): Promise<void> {
    await Promise.allSettled(this.parts.map((part) => part.adapter.close?.()));
  }

  private agentPart(id: string): RuntimePart {
    return this.parts.find((part) => part.ownsAgent(id)) ?? this.parts[0]!;
  }

  /**
   * The runtime that listed the first given id, else the primary one. Ids come from list_environment; one this
   * relay has not listed yet (a new pane, or a relay that just started) refreshes the listing once.
   */
  private async environmentPart(ids: Array<string | undefined>): Promise<RuntimePart> {
    const known = ids.filter((id): id is string => id !== undefined);
    const find = () => known.map((id) => this.environmentOwners.get(id)).find((owner) => owner !== undefined);
    if (known.length && !find() && this.parts.length > 1) await this.listEnvironment().catch(() => undefined);
    return find() ?? this.parts[0]!;
  }
}
