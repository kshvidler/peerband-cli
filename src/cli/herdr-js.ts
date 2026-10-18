// Typed facade over the plain-JS Herdr plugin modules, which the CLI bundles to share logic with the plugin.
// @ts-expect-error untyped plain-JS module shared with the Herdr plugin
import * as relayTabModule from '../../herdr/relay-tab.mjs';
// @ts-expect-error untyped plain-JS module shared with the Herdr plugin
import * as pathsModule from '../../herdr/paths.mjs';
// @ts-expect-error untyped plain-JS module shared with the Herdr plugin
import * as paneStateModule from '../../herdr/pane-state.mjs';

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
