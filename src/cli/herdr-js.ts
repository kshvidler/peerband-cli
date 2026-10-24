// Typed facade over the plain-JS Herdr plugin modules, which the CLI bundles to share logic with the plugin.
// @ts-expect-error untyped plain-JS module shared with the Herdr plugin
import * as relayTabModule from '../../herdr/relay-tab.mjs';
// @ts-expect-error untyped plain-JS module shared with the Herdr plugin
import * as pathsModule from '../../herdr/paths.mjs';
// @ts-expect-error untyped plain-JS module shared with the Herdr plugin
import * as paneStateModule from '../../herdr/pane-state.mjs';
// @ts-expect-error untyped plain-JS module shared with the Herdr plugin
import * as staleLockModule from '../../herdr/stale-lock.mjs';

export interface PaneActivity {
  kind: 'activity';
  requestId: string;
  tool: string;
  target?: string;
  outcome: string;
  latencyMs: number;
  at: string;
}
export interface PaneSnapshot {
  state: 'running' | 'stopping';
  connectionState: string;
  activity: PaneActivity[];
}

export const openRelayTab = relayTabModule.openRelayTab as (options?: Record<string, unknown>) => Promise<string>;
export const canonicalConfig = pathsModule.canonicalConfig as (config: string, platform?: NodeJS.Platform) => string;
export const controlChannel = pathsModule.controlChannel as (config?: string, platform?: NodeJS.Platform) => string;
export const ownerRecordPath = pathsModule.ownerRecordPath as (config?: string) => string;
export const fallbackPaneSnapshot = paneStateModule.fallbackPaneSnapshot as (value: unknown) => PaneSnapshot;
export const createPaneSnapshot = paneStateModule.createPaneSnapshot as (value: Partial<PaneSnapshot>) => PaneSnapshot;
export const paneLabel = paneStateModule.paneLabel as (snapshot: PaneSnapshot | undefined) => string;

export interface LockVerdict {
  state: 'absent' | 'live' | 'stale';
  reason: string;
  ownerText: string | null;
  pid?: number;
}
export interface LockOptions {
  lockDir: string;
  ownerFile: string;
  channel?: string;
  processPattern?: RegExp;
  excludePids?: number[];
  log?: (message: string) => void;
}
export const inspectLock = staleLockModule.inspectLock as (options: LockOptions) => Promise<LockVerdict>;
export const reclaimIfStale = staleLockModule.reclaimIfStale as (options: LockOptions) => Promise<{ reclaimed: boolean; verdict: LockVerdict }>;
export const resetRelayState = staleLockModule.resetRelayState as (path: string) => Promise<boolean>;
export const probeChannel = staleLockModule.probeChannel as (channel: string, timeout?: number) => Promise<'listening' | 'absent' | 'unknown'>;
export const SUPERVISOR_PATTERN = staleLockModule.SUPERVISOR_PATTERN as RegExp;
export const CONNECTOR_PATTERN = staleLockModule.CONNECTOR_PATTERN as RegExp;
