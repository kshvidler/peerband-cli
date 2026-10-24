import { CONNECTOR_PATTERN, inspectLock } from '../herdr-js.js';
import { resolve } from 'node:path';
import {
  ConnectError,
  ConnectorCore,
  ConnectorEvents,
  MockRuntime,
  receiptsPath,
  runRemoteClient,
  validateServerUrl,
  type RemoteOptions,
  type RuntimeAdapter,
} from '../../core/index.js';
import { HerdrAdapter } from '../../runtime-herdr/index.js';
import { flag, str } from '../args.js';
import { sanitize, symbols, type Style } from '../output.js';
import { CliError, type CommandSpec, type Ctx, UsageError } from '../types.js';
import { describeMachine, loadMachineConnectorConfig, requireCredentials, writesEnabled } from './shared.js';

type ConnectionState = Parameters<NonNullable<RemoteOptions['onConnectionState']>>[0];
type Activity = Parameters<NonNullable<RemoteOptions['onActivity']>>[0];

function clock(date = new Date()): string {
  return date.toTimeString().slice(0, 8);
}

function connectionLine(s: Style, state: ConnectionState, server: string, machine: string): string {
  switch (state) {
    case 'connected':
      return `${s.green(symbols.dot)} Connected to ${server} as ${s.bold(machine)}`;
    case 'connecting':
      return `${s.dim(symbols.ring)} Connecting to ${server}...`;
    case 'reconnecting':
      return `${s.yellow(symbols.dot)} Connection lost; reconnecting...`;
    case 'remote-unavailable':
      return `${s.yellow(symbols.dot)} PeerBand is unreachable; retrying...`;
    case 'unavailable':
      return `${s.yellow(symbols.dot)} Herdr is unavailable; requests will fail until it is back`;
    case 'revoked':
      return `${s.red(symbols.dot)} Access was revoked or rejected`;
  }
}

/** Keeps a long agent ID recognisable (start and end) within the 18-column target field. */
export function shortTarget(target: string, width = 18): string {
  if (target.length <= width) return target;
  const keep = width - 1;
  const head = Math.ceil(keep / 2);
  return `${target.slice(0, head)}…${target.slice(target.length - (keep - head))}`;
}

export function activityLine(s: Style, activity: Activity, at = new Date()): string {
  const outcome = activity.outcome === 'success' ? s.green(activity.outcome) : activity.outcome === 'error' || activity.outcome === 'runtime-unavailable' ? s.red(activity.outcome) : s.yellow(activity.outcome);
  const target = activity.target ? shortTarget(sanitize(activity.target)) : '-';
  return `${s.dim(clock(at))}  ${sanitize(activity.tool).padEnd(18)} ${target.padEnd(18)} ${outcome}${' '.repeat(Math.max(0, 20 - activity.outcome.length))} ${s.dim(`${Math.round(activity.latencyMs)} ms`)}`;
}

export const spec: CommandSpec = {
  name: 'connect',
  summary: 'Run the connector in the foreground',
  usage: 'peerband connect [--runtime herdr|mock] [--read-only] [--config PATH] [--server URL]',
  description:
    'Connects this machine to PeerBand and serves agent requests from your MCP clients until you press Ctrl+C. MCP clients may send messages to agents by default, but only after you approve the agents:message consent when you connect them; pass --read-only (or set "enableWrites": false in connector.json) to make this machine read-only. Activity lines show metadata only (tool, target, outcome, latency), never message or output content. Most people use `peerband relay` instead, which runs the connector inside Herdr.',
  options: [
    { name: 'runtime', type: 'string', valueName: 'herdr|mock', description: 'Agent runtime. Default: $PEERBAND_RUNTIME or herdr. "mock" serves fake agents for testing.' },
    { name: 'read-only', type: 'boolean', description: 'Do not allow MCP clients to send messages to agents on this machine (also: "enableWrites": false in connector.json).' },
    { name: 'enable-writes', type: 'boolean', description: 'Redundant: sending messages is allowed by default. Kept so old scripts keep working.' },
    { name: 'config', type: 'string', valueName: 'PATH', description: 'Connector config file. Default: $PEERBAND_CONNECTOR_CONFIG or connector.json in the config directory (optional).' },
    { name: 'server', type: 'string', valueName: 'URL', description: 'Override the server stored at login.' },
    { name: 'managed', type: 'boolean', hidden: true, description: 'Internal: run under the Herdr plugin supervisor over IPC.' },
  ],
  examples: [
    ['peerband connect', 'Serve until Ctrl+C; messages to agents are allowed (with OAuth consent)'],
    ['peerband connect --read-only', 'Never let MCP clients send messages to agents from this machine'],
    ['peerband connect --runtime mock', 'Try the connection with fake agents'],
  ],
  async run(parsed, ctx) {
    return connect(
      {
        runtime: str(parsed, 'runtime'),
        enableWrites: flag(parsed, 'enable-writes'),
        readOnly: flag(parsed, 'read-only'),
        config: str(parsed, 'config'),
        server: str(parsed, 'server'),
        managed: flag(parsed, 'managed'),
      },
      ctx,
    );
  },
};

export interface ConnectOptions {
  runtime?: string;
  enableWrites?: boolean;
  readOnly?: boolean;
  config?: string;
  server?: string;
  managed?: boolean;
}

/** `{type: "peerband:notify", id, text, paneId?}` from the plugin supervisor (`peerband notify`). */
function notifyRequest(message: unknown): { id: string; text: unknown; paneId?: unknown } | undefined {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return undefined;
  const value = message as Record<string, unknown>;
  if (value.type !== 'peerband:notify' || typeof value.id !== 'string' || value.id.length > 128) return undefined;
  return { id: value.id, text: value.text, paneId: value.paneId };
}

/** Test and demo seam: with PEERBAND_MOCK_STATUS_INTERVAL_MS the mock runtime flips its first agent's status. */
function startMockStatusCycle(adapter: MockRuntime, env: NodeJS.ProcessEnv): () => void {
  const interval = Number(env.PEERBAND_MOCK_STATUS_INTERVAL_MS);
  if (!Number.isSafeInteger(interval) || interval < 50) return () => undefined;
  const timer = setInterval(() => {
    void adapter.listAgents().then(([first]) => {
      if (first) adapter.setStatus(first.id, first.status === 'working' ? 'idle' : 'working');
    });
  }, interval);
  timer.unref();
  return () => clearInterval(timer);
}

function isShutdownMessage(message: unknown): boolean {
  return (
    Boolean(message) &&
    typeof message === 'object' &&
    !Array.isArray(message) &&
    Object.keys(message as object).length === 1 &&
    (message as Record<string, unknown>).type === 'peerband:shutdown'
  );
}

export async function connect(options: ConnectOptions, ctx: Ctx): Promise<number> {
  const runtime = options.runtime ?? ctx.env.PEERBAND_RUNTIME ?? 'herdr';
  if (runtime !== 'herdr' && runtime !== 'mock') throw new UsageError(`Unknown runtime "${runtime}".`, 'Use --runtime herdr or --runtime mock.');
  const credentials = await requireCredentials(ctx);
  if (options.server) credentials.serverUrl = validateServerUrl(options.server);
  if (options.readOnly && options.enableWrites) throw new UsageError('--read-only and --enable-writes contradict each other.', 'Use --read-only to turn messaging off; messaging is on by default.');
  const config = await loadMachineConnectorConfig(ctx, options.config);
  const enableWrites = writesEnabled(config, { readOnly: options.readOnly, enableWrites: options.enableWrites });
  const managed = Boolean(options.managed);
  const s = ctx.out.stderr;
  const machine = describeMachine(credentials);

  const eventLog = (message: string) => { if (!managed) ctx.out.warn(s.dim(`  ${sanitize(message)}`)); };
  const adapter: RuntimeAdapter = runtime === 'mock' ? new MockRuntime() : new HerdrAdapter({ ...(config.herdr ?? {}), log: eventLog });
  // Agent status events (metadata only) stream to PeerBand while the relay is connected.
  const events = new ConnectorEvents(adapter, { allowedAgents: config.allowedAgents, allowedWorkspaces: config.allowedWorkspaces });
  const stopMockCycle = adapter instanceof MockRuntime ? startMockStatusCycle(adapter, ctx.env) : () => undefined;
  const core = new ConnectorCore(adapter, {
    writesEnabled: enableWrites,
    allowedAgents: config.allowedAgents,
    allowedWorkspaces: config.allowedWorkspaces,
    receiptPath: config.stateDirectory ? resolve(config.stateDirectory, 'receipts.json') : receiptsPath({ env: ctx.env }),
    // A lock left by a connector that died (or by an older version without a pid) is reclaimed instead of refusing forever.
    lockIsStale: async (lockDir, ownerFile) => (await inspectLock({ lockDir, ownerFile, processPattern: CONNECTOR_PATTERN })).state === 'stale',
    onLockReclaimed: (message) => ctx.out.warn(ctx.out.stderr.dim(`peerband: ${message}`)),
  });

  const abort = new AbortController();
  let signalled: NodeJS.Signals | undefined;
  const onSignal = (signal: NodeJS.Signals) => {
    signalled ??= signal;
    abort.abort();
  };
  const onSigint = () => onSignal('SIGINT');
  const onSigterm = () => onSignal('SIGTERM');
  const onDisconnect = () => abort.abort();
  const onMessage = (message: unknown) => {
    if (isShutdownMessage(message)) abort.abort();
    const notify = notifyRequest(message);
    if (notify) {
      void events.notify(notify).then(
        (result) => process.send?.({ type: 'peerband:notify-result', id: notify.id, ok: true, ...result }),
        (error: unknown) => process.send?.({
          type: 'peerband:notify-result',
          id: notify.id,
          ok: false,
          code: error instanceof ConnectError ? error.code : 'runtime_error',
          message: error instanceof ConnectError ? error.message : 'The note could not be sent.',
          nextStep: error instanceof ConnectError ? error.nextStep : undefined,
        }),
      );
    }
  };
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);
  const ipc = managed && Boolean(process.connected);
  if (ipc) {
    process.on('message', onMessage);
    process.once('disconnect', onDisconnect);
  }
  const sendPaneEvent = (event: Record<string, unknown>) => {
    if (ipc && process.connected) process.send?.({ type: 'peerband:pane-event', ...event });
  };

  let lastState: ConnectionState | undefined;
  let shown: ConnectionState | undefined;
  const showState = (state: ConnectionState) => {
    if (managed || shown === state) return;
    shown = state;
    ctx.out.warn(connectionLine(s, state, credentials.serverUrl, machine));
  };
  try {
    await core.initialize();
    events.start();
    if (!managed) {
      ctx.out.warn(
        `${s.bold('peerband')} ${s.dim(`${runtime} runtime, ${enableWrites ? 'messages allowed' : 'read-only'}. Press Ctrl+C to stop.`)}`,
      );
    }
    await runRemoteClient(core, credentials, {
      signal: abort.signal,
      events,
      onStatus: (message) => {
        // Routine relay notices (e.g. "remote connection established"), not warnings.
        if (!managed) ctx.out.warn(s.dim(`  ${sanitize(message)}`));
      },
      onConnectionState: (state) => {
        lastState = state;
        sendPaneEvent({ kind: 'connection', state });
        showState(state);
      },
      onActivity: (activity) => {
        if (activity.outcome === 'runtime-unavailable') {
          lastState = 'unavailable';
          sendPaneEvent({ kind: 'connection', state: 'unavailable' });
          showState('unavailable');
        } else if (activity.outcome === 'success') {
          lastState = 'connected';
          sendPaneEvent({ kind: 'connection', state: 'connected' });
          showState('connected');
        }
        sendPaneEvent({ kind: 'activity', ...activity });
        if (!managed) ctx.out.warn(activityLine(s, activity));
      },
    });
  } finally {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
    process.off('message', onMessage);
    process.off('disconnect', onDisconnect);
    stopMockCycle();
    events.close();
    await core.close();
    await adapter.close?.();
    if (ipc && process.connected) process.disconnect();
  }
  if (!abort.signal.aborted && lastState === 'revoked') {
    throw new CliError('PeerBand rejected this machine\'s credential (it may have been revoked).', 'Run `peerband login` again to sign in.');
  }
  if (!managed) ctx.out.warn(`${s.dim(symbols.ring)} Disconnected.`);
  return signalled === 'SIGINT' && !managed ? 130 : 0;
}
