import { configHome, loadCredentials, mcpUrlFor, type Credentials } from '../../core/index.js';
import { checkHerdrPlugin, fixCommand, REPAIR_COMMAND, type PluginProblem } from './herdr-check.js';
import { paneLabel } from '../herdr-js.js';
import { flag } from '../args.js';
import { relaySnapshot, type RelaySnapshot } from '../control.js';
import { symbols, type Style } from '../output.js';
import { EXIT_NOT_LOGGED_IN, type CommandSpec, type Ctx } from '../types.js';
import { credentialsFile, loadMachineConnectorConfig, writesEnabled } from './shared.js';

export { pluginInstalled } from './herdr-check.js';

export interface StatusReport {
  version: string;
  node: string;
  configHome: string;
  loggedIn: boolean;
  machine: string | null;
  email: string | null;
  server: string | null;
  mcpUrl: string | null;
  installationId: string | null;
  enrolledAt: string | null;
  relay: { running: boolean; connection: string | null; source: 'control' | 'file' | 'none' };
  /** Whether MCP clients may send messages to agents from this machine; null if connector.json is unreadable. */
  messages: 'allowed' | 'read-only' | null;
  herdr: {
    found: boolean;
    version: string | null;
    pluginInstalled: boolean | null;
    pluginSource: string | null;
    pluginProblems: PluginProblem[];
  };
}

function safeMcpUrl(serverUrl: string, env: NodeJS.ProcessEnv): string | null {
  try {
    return mcpUrlFor(serverUrl, env);
  } catch {
    return null;
  }
}

export async function buildStatus(ctx: Ctx): Promise<StatusReport> {
  let credentials: Credentials | undefined;
  try {
    credentials = await loadCredentials(credentialsFile(ctx));
  } catch {
    credentials = undefined;
  }
  const snapshot: RelaySnapshot | undefined = await relaySnapshot(ctx.env);
  const plugin = await checkHerdrPlugin(ctx);
  const messages = await loadMachineConnectorConfig(ctx).then(
    (config) => (writesEnabled(config) ? ('allowed' as const) : ('read-only' as const)),
    () => null,
  );
  return {
    version: ctx.version,
    node: process.versions.node,
    configHome: configHome({ env: ctx.env }),
    loggedIn: Boolean(credentials),
    machine: credentials?.machineName ?? null,
    email: credentials?.accountEmail ?? null,
    server: credentials?.serverUrl ?? null,
    mcpUrl: credentials ? safeMcpUrl(credentials.serverUrl, ctx.env) : null,
    installationId: credentials?.installationId ?? null,
    enrolledAt: credentials?.enrolledAt ?? null,
    relay: {
      running: snapshot?.source === 'control' && snapshot.state === 'running',
      connection: snapshot?.connectionState ?? null,
      source: snapshot?.source ?? 'none',
    },
    messages,
    herdr: {
      found: plugin.found,
      version: plugin.herdrVersion,
      pluginInstalled: plugin.found ? plugin.installed : null,
      pluginSource: plugin.source,
      pluginProblems: plugin.problems,
    },
  };
}

export function colorConnection(s: Style, state: string | null): string {
  if (!state) return s.dim('not running');
  const label = paneLabel({ state: 'running', connectionState: state, activity: [] });
  if (state === 'connected') return s.green(`${symbols.dot} ${label}`);
  if (state === 'connecting' || state === 'reconnecting') return s.yellow(`${symbols.dot} ${label}`);
  if (state === 'disabled') return s.dim(`${symbols.ring} ${label}`);
  return s.red(`${symbols.dot} ${label}`);
}

function renderHuman(report: StatusReport, ctx: Ctx): void {
  const s = ctx.out.stdout;
  const rows: Array<[string, string]> = [];
  rows.push([
    'Account',
    report.loggedIn
      ? `${s.green(symbols.ok)} logged in${report.email ? ` as ${report.email}` : ''}`
      : `${s.red(symbols.fail)} not logged in ${s.dim('(run `peerband login`)')}`,
  ]);
  if (report.loggedIn) {
    rows.push(['Machine', report.machine ?? s.dim('(unnamed)')]);
    rows.push(['Server', report.server ?? '']);
    if (report.mcpUrl) rows.push(['MCP server', report.mcpUrl]);
    rows.push(['Installation', report.installationId ?? '']);
    if (report.enrolledAt) rows.push(['Enrolled', report.enrolledAt]);
  }
  const relayLine = report.relay.running
    ? colorConnection(s, report.relay.connection)
    : report.relay.source === 'file' && report.relay.connection && report.relay.connection !== 'helper-unavailable'
      ? `${colorConnection(s, report.relay.connection)} ${s.dim('(last known; relay not running)')}`
      : s.dim(`${symbols.ring} not running ${s.dim('(open it with `peerband relay`)')}`);
  rows.push(['Relay', relayLine]);
  if (report.messages) {
    rows.push([
      'Messages',
      report.messages === 'allowed'
        ? `allowed ${s.dim('(needs the agents:message consent; turn off with --read-only or "enableWrites": false in connector.json)')}`
        : 'read-only',
    ]);
  }
  rows.push([
    'Herdr',
    !report.herdr.found
      ? `${s.yellow(symbols.warn)} not found ${s.dim('(set HERDR_BIN_PATH or add herdr to PATH)')}`
      : `${report.herdr.version ?? 'unknown version'}`,
  ]);
  if (report.herdr.found) {
    const first = report.herdr.pluginProblems[0];
    rows.push([
      'Plugin',
      !report.herdr.pluginInstalled
        ? `${s.yellow(symbols.warn)} not installed ${s.dim(`(run \`${REPAIR_COMMAND}\`)`)}`
        : first
          ? `${s.yellow(symbols.warn)} ${first.message} ${s.dim(`(run \`${fixCommand(first)}\`)`)}`
          : `${s.green(symbols.ok)} ${report.herdr.pluginSource ?? 'installed'}`,
    ]);
  }
  rows.push(['peerband', `${report.version} ${s.dim(`(node ${report.node})`)}`]);
  rows.push(['Config', s.dim(report.configHome)]);
  const width = Math.max(...rows.map(([key]) => key.length));
  for (const [key, value] of rows) ctx.out.print(`${s.bold(key.padEnd(width))}  ${value}`);
}

export const spec: CommandSpec = {
  name: 'status',
  summary: 'Show login, relay and Herdr status',
  usage: 'peerband status [--json]',
  description:
    'Shows whether this machine is logged in, whether the PeerBand Relay is running and connected, and whether Herdr and the PeerBand plugin are installed. Exits with code 3 when not logged in.',
  options: [{ name: 'json', type: 'boolean', description: 'Print a stable machine-readable JSON object instead of text.' }],
  examples: [
    ['peerband status', 'Human-readable summary'],
    ['peerband status --json', 'For scripts; check .loggedIn and .relay.connection'],
  ],
  async run(parsed, ctx) {
    const report = await buildStatus(ctx);
    if (flag(parsed, 'json')) ctx.out.print(JSON.stringify(report, null, 2));
    else renderHuman(report, ctx);
    return report.loggedIn ? 0 : EXIT_NOT_LOGGED_IN;
  },
};
