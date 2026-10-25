import { CHANNEL_NAME, enrollmentBase, type Credentials } from '../../core/index.js';
import { flag } from '../args.js';
import { sanitize } from '../output.js';
import { CliError, type CommandSpec, type Ctx, UsageError } from '../types.js';
import { installationCall, requireCredentials } from './shared.js';

/** One of the owner's webhook endpoints this machine can address by name. The server never sends URLs or secrets here. */
export interface Channel { name: string; format: string; state: string; events: string[] }

export const NO_CHANNEL_SUPPORT = "This PeerBand server doesn't support channels yet.";

/** Where the owner adds channels: the Webhooks section of the dashboard on this machine's server. */
export const dashboardUrl = (credentials: Credentials): string => new URL('/dashboard', enrollmentBase(credentials.serverUrl)).href;

/** The channels this machine can send notes to (GET /api/installation/channels). */
export async function fetchChannels(ctx: Ctx, credentials: Credentials): Promise<Channel[]> {
  const body = (await installationCall(ctx, credentials, 'GET', '/api/installation/channels', undefined, NO_CHANNEL_SUPPORT)) as { channels?: unknown } | null;
  if (!body || !Array.isArray(body.channels)) throw new CliError('PeerBand sent an unexpected channel list.', 'Try again; run `peerband update` if it keeps happening.');
  return body.channels.flatMap((raw: unknown): Channel[] => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Record<string, unknown>;
    if (typeof item.name !== 'string' || !CHANNEL_NAME.test(item.name)) return [];
    const text = (value: unknown) => (typeof value === 'string' ? sanitize(value).slice(0, 64) : 'unknown');
    const events = Array.isArray(item.events) ? item.events.filter((event): event is string => typeof event === 'string').map((event) => sanitize(event).slice(0, 64)) : [];
    return [{ name: item.name, format: text(item.format), state: text(item.state), events }];
  });
}

const STATE_NOTES: Record<string, string> = {
  active: 'active',
  pending_verification: 'waiting for verification',
  paused: 'paused',
  disabled: 'disabled',
};
export const stateLabel = (state: string): string => STATE_NOTES[state] ?? state;

async function list(ctx: Ctx, json: boolean): Promise<number> {
  const credentials = await requireCredentials(ctx);
  const channels = await fetchChannels(ctx, credentials);
  if (json) {
    ctx.out.print(JSON.stringify({ channels }, null, 2));
    return 0;
  }
  const s = ctx.out.stdout;
  if (!channels.length) {
    ctx.out.print('No channels yet for this machine.');
    ctx.out.print(s.dim(`Add one in the dashboard (${dashboardUrl(credentials)} → Webhooks): its name is the channel name. Agents then send to it with \`peerband notify --channel NAME "<text>"\`.`));
    return 0;
  }
  ctx.out.print(s.bold('Channels'));
  const width = Math.max(...channels.map((channel) => channel.name.length));
  for (const channel of channels) {
    const state = channel.state === 'active' ? s.green(stateLabel(channel.state)) : s.yellow(stateLabel(channel.state));
    ctx.out.print(`  ${channel.name.padEnd(width)}  ${channel.format.padEnd(8)}  ${state}`);
  }
  ctx.out.print('');
  ctx.out.print(s.dim('Send a note to one with `peerband notify --channel NAME "<text>"`. Manage channels in the dashboard (Webhooks).'));
  return 0;
}

export const spec: CommandSpec = {
  name: 'channels',
  summary: 'List the channels agents can send notes to',
  usage: 'peerband channels [list] [--json]',
  description:
    "Lists the channels this machine can send notes to with `peerband notify --channel NAME`. A channel is one of the machine owner's webhooks (for example a Slack or Discord incoming webhook, or your own endpoint), addressed by its name. The owner adds them in the PeerBand dashboard under Webhooks; only webhooks that include this machine are listed. Shows each channel's name, format and state; only active channels accept notes. Webhook URLs and secrets are never shown.",
  options: [{ name: 'json', type: 'boolean', description: 'Print machine-readable JSON: {channels: [{name, format, state, events}]}.' }],
  positionals: { name: 'list', max: 1 },
  examples: [
    ['peerband channels', 'Channels this machine can send notes to'],
    ['peerband channels --json', 'The same, for scripts'],
  ],
  notes: ['Needs `peerband login`; the relay does not have to be running.'],
  async run(parsed, ctx) {
    const [action] = parsed.positionals;
    if (action !== undefined && action !== 'list') throw new UsageError(`Unknown channels action "${sanitize(action)}".`, 'Use `peerband channels` or `peerband channels list`.');
    return list(ctx, flag(parsed, 'json'));
  },
};
