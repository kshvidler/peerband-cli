import { codePoints, NOTE_MAX_CHARS } from '../../core/index.js';
import { flag } from '../args.js';
import { ControlUnavailable, requestNotify } from '../control.js';
import { sanitize, symbols } from '../output.js';
import { CliError, type CommandSpec, type Ctx, UsageError } from '../types.js';

const PANE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const START_RELAY = 'Start the relay with `peerband relay`.';

/** The Herdr pane this command runs in, if any (Herdr sets HERDR_PANE_ID in every pane). */
export function callingPane(env: NodeJS.ProcessEnv): string | undefined {
  const pane = env.HERDR_PANE_ID;
  return typeof pane === 'string' && PANE_ID.test(pane) ? pane : undefined;
}

export async function notify(text: string, json: boolean, ctx: Ctx): Promise<number> {
  if (text.trim().length === 0) throw new UsageError('The note is empty.', 'Pass a short note, for example `peerband notify "Migration finished, 3 tests failing"`.');
  if (codePoints(text) > NOTE_MAX_CHARS) throw new UsageError(`The note is ${codePoints(text)} characters; the limit is ${NOTE_MAX_CHARS}.`, 'Shorten it to the result or the decision you need; leave details in a file or the agent output.');
  const paneId = callingPane(ctx.env);
  let reply: Record<string, unknown>;
  try {
    reply = await requestNotify({ text, ...(paneId ? { paneId } : {}) }, ctx.env);
  } catch (error) {
    if (error instanceof ControlUnavailable && error.reason === 'closed') {
      throw new CliError('The running relay does not support notes yet.', 'Run `peerband update` to update the CLI and the Herdr plugin, which restarts the relay.');
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
  if (reply.sent !== true) throw new CliError('The relay is not connected to PeerBand right now, so the note was not delivered.', 'Check `peerband status`; send the note again once the relay shows Connected.');
  const agentId = typeof reply.agentId === 'string' ? reply.agentId : null;
  if (json) {
    ctx.out.print(JSON.stringify({ sent: true, agentId, eventId: typeof reply.eventId === 'string' ? reply.eventId : null }, null, 2));
    return 0;
  }
  const s = ctx.out.stdout;
  ctx.out.print(`${s.green(symbols.ok)} Note sent to the machine owner${agentId ? s.dim(` (from agent ${sanitize(agentId)})`) : ''}.`);
  return 0;
}

export const spec: CommandSpec = {
  name: 'notify',
  summary: 'Send a short note from an agent to the machine owner',
  usage: 'peerband notify "<text>" [--json]',
  description:
    'Sends a short note (1 to 1024 characters) through the running relay to the owner of this machine, for example when a long task finished or an agent is blocked on a decision. Run it from inside a Herdr pane and the note names the agent in that pane. The note goes to the owner only, never to people this machine is shared with. Control characters are removed and likely secrets are redacted (best effort), but do not put credentials or personal data in notes.',
  options: [{ name: 'json', type: 'boolean', description: 'Print a machine-readable result: {sent, agentId, eventId}.' }],
  positionals: { name: 'text', max: 64 },
  examples: [
    ['peerband notify "Migration finished, 3 tests failing"', 'Report a result when a long task ends'],
    ['peerband notify "Blocked: should I drop the legacy table?"', 'Ask the owner for a decision'],
    ['peerband notify --json "Build green"', 'For scripts: prints the event id'],
  ],
  notes: [
    'Needs the relay (`peerband relay`) to be running and connected; nothing is queued while it is offline.',
    'Several words without quotes are joined with spaces.',
  ],
  async run(parsed, ctx) {
    if (parsed.positionals.length === 0) throw new UsageError('Missing the note text.', 'Usage: peerband notify "<text>"');
    return notify(parsed.positionals.join(' '), flag(parsed, 'json'), ctx);
  },
};
