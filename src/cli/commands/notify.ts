import { CHANNEL_NAME, codePoints, NOTE_MAX_CHARS } from '../../core/index.js';
import { flag, str } from '../args.js';
import { ControlUnavailable, requestNotify } from '../control.js';
import { sanitize, symbols } from '../output.js';
import { CliError, type CommandSpec, type Ctx, UsageError } from '../types.js';
import { dashboardUrl, fetchChannels, stateLabel, TELEGRAM_CHANNEL } from './channels.js';
import { requireCredentials } from './shared.js';

const PANE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const START_RELAY = 'Start the relay with `peerband relay`.';

/** The Herdr pane this command runs in, if any (Herdr sets HERDR_PANE_ID in every pane). */
export function callingPane(env: NodeJS.ProcessEnv): string | undefined {
  const pane = env.HERDR_PANE_ID;
  return typeof pane === 'string' && PANE_ID.test(pane) ? pane : undefined;
}

/** Fails unless `name` is one of this machine's channels and is active, so a typo never sends a note nowhere. */
async function checkChannel(name: string, ctx: Ctx): Promise<void> {
  const credentials = await requireCredentials(ctx);
  const channels = await fetchChannels(ctx, credentials);
  const channel = channels.find((candidate) => candidate.name === name);
  if (!channel && name === TELEGRAM_CHANNEL) {
    throw new CliError(
      'The machine owner has not connected Telegram to PeerBand, so there is no "telegram" channel. The note was not sent.',
      `The owner connects Telegram in the dashboard (${dashboardUrl(credentials)} → Channels). Until then, send the note without --channel.`,
    );
  }
  if (!channel) {
    const names = channels.map((candidate) => candidate.name);
    throw new CliError(
      `There is no channel named "${name}" for this machine. The note was not sent.`,
      names.length
        ? `Available channels: ${names.join(', ')}. See \`peerband channels\`.`
        : `This machine has no channels yet. The owner can add one in the dashboard (${dashboardUrl(credentials)} → Channels).`,
    );
  }
  if (channel.state !== 'active') {
    throw new CliError(
      `The channel "${name}" is ${stateLabel(channel.state)}, so it does not accept notes. The note was not sent.`,
      `The owner can fix it in the dashboard (${dashboardUrl(credentials)} → Channels), or send the note without --channel.`,
    );
  }
}

export async function notify(text: string, json: boolean, ctx: Ctx, channel?: string, agent?: string): Promise<number> {
  if (channel !== undefined && !CHANNEL_NAME.test(channel)) throw new UsageError(`"${sanitize(channel)}" is not a channel name.`, 'Channel names are 1 to 32 lowercase letters, digits or dashes, starting with a letter or digit. See `peerband channels`.');
  if (text.trim().length === 0) throw new UsageError('The note is empty.', 'Pass a short note, for example `peerband notify "Migration finished, 3 tests failing"`.');
  if (codePoints(text) > NOTE_MAX_CHARS) throw new UsageError(`The note is ${codePoints(text)} characters; the limit is ${NOTE_MAX_CHARS}.`, 'Shorten it to the result or the decision you need; leave details in a file or the agent output.');
  if (agent !== undefined && (agent.length < 1 || agent.length > 256 || /[\x00-\x1f\x7f]/.test(agent))) throw new UsageError('Invalid agent id.', 'Use the exact agent id in the relayed reply instructions.');
  if (channel !== undefined) await checkChannel(channel, ctx);
  const paneId = callingPane(ctx.env);
  let reply: Record<string, unknown>;
  try {
    reply = await requestNotify({ text, ...(agent !== undefined ? { agentId: agent } : {}), ...(paneId ? { paneId } : {}), ...(channel !== undefined ? { channel } : {}) }, ctx.env);
  } catch (error) {
    if (error instanceof ControlUnavailable && error.reason === 'closed') {
      throw new CliError(agent !== undefined ? 'The relay closed before confirming the explicit-agent notification. It may need an update; delivery is unconfirmed.' : 'The running relay does not support notes yet.', 'Run `peerband update` to update the CLI and the Herdr plugin, which restarts the relay.');
    }
    if (error instanceof ControlUnavailable && error.reason === 'timeout') throw new CliError('The relay did not answer in time; the note may not have been sent.', 'Check `peerband status`.');
    throw new CliError('No PeerBand relay is running on this machine.', START_RELAY);
  }
  if (typeof reply.error === 'string') {
    const message = typeof reply.message === 'string' ? sanitize(reply.message) : 'The note could not be sent.';
    const next = typeof reply.nextStep === 'string' ? sanitize(reply.nextStep) : undefined;
    if (reply.error === 'not-running') throw new CliError(`${message} The note was not sent.`, START_RELAY);
    if (reply.error === 'invalid' || reply.error === 'invalid_argument') throw new UsageError(message, next);
    throw new CliError(message, next ?? 'Check `peerband status` and try again.');
  }
  // A relay that predates channels ignores the field and does not echo it back.
  if (channel !== undefined && reply.channel !== channel) {
    throw new CliError(
      reply.sent === true
        ? `The relay running on this machine is too old for channels, so the note was sent without one: to the dashboard and any webhooks that take all notes, not only to "${channel}".`
        : 'The relay running on this machine is too old for channels. The note was not sent.',
      'Run `peerband update` to update the CLI and the Herdr plugin, which restarts the relay.',
    );
  }
  if (agent !== undefined && reply.agentId !== agent) throw new CliError('The relay did not confirm the requested agent identity.', 'Run `peerband update`; do not resend without --agent.');
  if (reply.sent !== true) throw new CliError('The relay is not connected to PeerBand right now, so the note was not delivered.', 'Check `peerband status`; send the note again once the relay shows Connected.');
  const agentId = typeof reply.agentId === 'string' ? reply.agentId : null;
  if (json) {
    ctx.out.print(JSON.stringify({ sent: true, agentId, eventId: typeof reply.eventId === 'string' ? reply.eventId : null, ...(channel !== undefined ? { channel } : {}) }, null, 2));
    return 0;
  }
  const s = ctx.out.stdout;
  const target = channel !== undefined ? `channel ${s.bold(channel)}` : 'the machine owner';
  ctx.out.print(`${s.green(symbols.ok)} Note sent to ${target}${agentId ? s.dim(` (from agent ${sanitize(agentId)})`) : ''}.`);
  return 0;
}

export const spec: CommandSpec = {
  name: 'notify',
  summary: 'Send a short note from an agent to the machine owner',
  usage: 'peerband notify "<text>" [--channel NAME] [--agent ID] [--json]',
  description:
    "Sends a short note (1 to 1024 characters) through the running relay to the owner of this machine, for example when a long task finished or an agent is blocked on a decision. Run it from inside a Herdr pane and the note names the agent in that pane. The note goes to the owner only, never to people this machine is shared with. Control characters are removed and likely secrets are redacted (best effort), but do not put credentials or personal data in notes.\n\nWithout --channel the note goes to the PeerBand dashboard, to every owner webhook that takes notes and, once the owner has connected Telegram, to their Telegram chat with the PeerBand bot (unless they turned notes off there). With --channel NAME it still appears in the dashboard (marked with the channel name), but only that one channel receives it: `telegram` for the owner's Telegram (even with notes turned off there), or a webhook such as a Slack channel; see `peerband channels`. The channel is checked first: an unknown or inactive channel is an error and nothing is sent.",
  options: [
    { name: 'channel', type: 'string', valueName: 'NAME', description: 'Deliver the note to this one channel (`telegram`, or a webhook name) instead of everywhere notes go; it still shows in the dashboard (see `peerband channels`).' },
    { name: 'agent', type: 'string', valueName: 'ID', description: 'Use this exact current agent id instead of inferring it from the calling pane. Fails if the id is stale or disallowed.' },
    { name: 'json', type: 'boolean', description: 'Print a machine-readable result: {sent, agentId, eventId}, plus channel with --channel.' },
  ],
  positionals: { name: 'text', max: 64 },
  examples: [
    ['peerband notify "Migration finished, 3 tests failing"', 'Report a result when a long task ends'],
    ['peerband notify "Blocked: should I drop the legacy table?"', 'Ask the owner for a decision'],
    ['peerband notify --channel telegram "Tests pass; ready to merge?"', "Send to the owner's Telegram"],
    ['peerband notify --channel deploys "Release 2.3 is live"', 'Send to one channel (an owner webhook)'],
    ['peerband notify --json "Build green"', 'For scripts: prints the event id'],
  ],
  notes: [
    'Needs the relay (`peerband relay`) to be running and connected; nothing is queued while it is offline.',
    '--channel also needs `peerband login`: the channel is checked with PeerBand before the note is sent.',
    'Several words without quotes are joined with spaces.',
  ],
  async run(parsed, ctx) {
    if (parsed.positionals.length === 0) throw new UsageError('Missing the note text.', 'Usage: peerband notify "<text>"');
    return notify(parsed.positionals.join(' '), flag(parsed, 'json'), ctx, str(parsed, 'channel'), str(parsed, 'agent'));
  },
};
