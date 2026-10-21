import { enrollmentBase, type Credentials } from '../../core/index.js';
import { flag, str } from '../args.js';
import { sanitize, symbols } from '../output.js';
import { CliError, type CommandSpec, type Ctx, UsageError } from '../types.js';
import { requireCredentials } from './shared.js';

type Role = 'read' | 'message';
interface Invite { id: string; role: Role; created_at: string; expires_at: string }
interface Guest { id: string; email: string | null; role: Role; shared_at: string; last_used_at: string | null }
interface Sharing { invites: Invite[]; guests: Guest[] }

const roleLabel = (role: Role): string => (role === 'message' ? 'read + message' : 'read only');
const MAX_EXPIRY_DAYS = 30;

/** Calls this machine's sharing API, authenticated by the installation credential. */
async function call(ctx: Ctx, credentials: Credentials, method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<unknown> {
  const url = new URL(path, enrollmentBase(credentials.serverUrl));
  let response: Response;
  try {
    response = await ctx.fetch(url, {
      method,
      headers: { authorization: `Bearer ${credentials.credential}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new CliError(`Could not reach ${url.origin}: ${(error as Error).message}`, 'Check your network connection and try again.');
  }
  if (response.status === 204) return null;
  const parsed = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (response.ok) return parsed;
  const detail = typeof parsed.detail === 'string' ? parsed.detail : `HTTP ${response.status}`;
  if (response.status === 401) throw new CliError("PeerBand rejected this machine's credential (it may have been revoked).", 'Run `peerband login` again to sign in.');
  if (response.status === 404 && path.endsWith('/sharing') && method === 'GET') throw new CliError("This PeerBand server doesn't support sharing yet.");
  throw new CliError(sanitize(detail));
}

function expiryDays(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > MAX_EXPIRY_DAYS) throw new UsageError(`Invalid --expires value "${raw}".`, `Use a whole number of days from 1 to ${MAX_EXPIRY_DAYS}.`);
  return days;
}

async function create(ctx: Ctx, credentials: Credentials, role: Role, days: number | undefined, json: boolean): Promise<number> {
  const link = (await call(ctx, credentials, 'POST', '/api/installation/invites', { role, ...(days ? { expires_in_days: days } : {}) })) as {
    id: string;
    url: string;
    role: Role;
    expires_at: string;
  };
  if (json) {
    ctx.out.print(JSON.stringify(link, null, 2));
    return 0;
  }
  const s = ctx.out.stdout;
  ctx.out.print(`${s.green(symbols.ok)} Invite link for ${s.bold(credentials.machineName ?? 'this machine')} (${roleLabel(link.role)}):`);
  ctx.out.print('');
  ctx.out.print(`  ${s.cyan(sanitize(link.url))}`);
  ctx.out.print('');
  ctx.out.print(`Send it to one person. It works once and expires ${sanitize(link.expires_at)}.`);
  ctx.out.print(s.dim('They sign in to PeerBand (or create an account) and accept. See who has access with `peerband share list`.'));
  return 0;
}

async function list(ctx: Ctx, credentials: Credentials, json: boolean): Promise<number> {
  const sharing = (await call(ctx, credentials, 'GET', '/api/installation/sharing')) as Sharing;
  if (json) {
    ctx.out.print(JSON.stringify(sharing, null, 2));
    return 0;
  }
  const s = ctx.out.stdout;
  ctx.out.print(s.bold('People with access'));
  if (!sharing.guests.length) ctx.out.print(s.dim('  Nobody else has access yet. Create a link with `peerband share`.'));
  for (const guest of sharing.guests) {
    const used = guest.last_used_at ? `last used ${sanitize(guest.last_used_at)}` : 'not used yet';
    ctx.out.print(`  ${sanitize(guest.email ?? 'PeerBand user')}  ${roleLabel(guest.role)}  ${s.dim(`${used} · ${guest.id}`)}`);
  }
  if (sharing.invites.length) {
    ctx.out.print('');
    ctx.out.print(s.bold('Unused links'));
    for (const invite of sharing.invites) ctx.out.print(`  ${roleLabel(invite.role)}  ${s.dim(`expires ${sanitize(invite.expires_at)} · ${invite.id}`)}`);
  }
  ctx.out.print('');
  ctx.out.print(s.dim('Remove access or cancel a link with `peerband share revoke ID`. Change roles in the dashboard.'));
  return 0;
}

async function revoke(ctx: Ctx, credentials: Credentials, id: string | undefined): Promise<number> {
  if (!id) throw new UsageError('Missing the ID to revoke.', 'Run `peerband share list` to see IDs (acc_… for people, inv_… for links).');
  if (!/^(acc|inv)_[\w-]{1,64}$/.test(id)) throw new UsageError(`"${sanitize(id)}" is not a share ID.`, 'IDs start with acc_ (a person) or inv_ (a link); see `peerband share list`.');
  await call(ctx, credentials, 'DELETE', `/api/installation/sharing/${encodeURIComponent(id)}`);
  ctx.out.print(`${ctx.out.stdout.green(symbols.ok)} ${id.startsWith('acc_') ? 'Access removed.' : 'Link cancelled.'}`);
  return 0;
}

export const spec: CommandSpec = {
  name: 'share',
  summary: 'Share this machine with another PeerBand user',
  usage: 'peerband share [--message] [--expires DAYS] [--json]\n  peerband share list [--json]\n  peerband share revoke ID',
  description:
    "Creates an invitation link for this machine. The person who opens it signs in to PeerBand (or creates an account) and accepts; this machine then appears in their dashboard and in list_machines in their MCP client. Guests can list and read this machine's agents. With --message they can also send messages, if their MCP client has the agents:message consent and this machine allows messages (a machine started with --read-only never does).\n\nEach link works for one person and expires after 7 days unless you pass --expires. You see each guest's email and a log of what they read or send (metadata only) in the dashboard.\n\n`share list` shows who has access and the unused links; `share revoke ID` removes a person's access (acc_…) or cancels a link (inv_…).",
  options: [
    { name: 'message', type: 'boolean', description: 'Also let the guest send messages to agents. Default: read only.' },
    { name: 'expires', type: 'string', valueName: 'DAYS', description: `Days until the link expires, 1 to ${MAX_EXPIRY_DAYS}. Default: 7.` },
    { name: 'json', type: 'boolean', description: 'Print machine-readable JSON.' },
  ],
  positionals: { name: 'list | revoke ID', max: 2 },
  examples: [
    ['peerband share', 'Create a read-only invite link for this machine'],
    ['peerband share --message --expires 1', 'A link that also allows messages, valid for one day'],
    ['peerband share list', 'People with access and unused links'],
    ['peerband share revoke acc_AbC123', "Remove someone's access"],
  ],
  notes: ['The link is shown once. Anyone who has it can accept it until it is used, so send it only to the person you mean.'],
  async run(parsed, ctx) {
    const [action, id] = parsed.positionals;
    const json = flag(parsed, 'json');
    if (action !== undefined && action !== 'list' && action !== 'revoke')
      throw new UsageError(`Unknown share action "${sanitize(action)}".`, 'Use `peerband share`, `peerband share list` or `peerband share revoke ID`.');
    if (action !== 'revoke' && id !== undefined) throw new UsageError(`Unexpected argument "${sanitize(id)}".`, 'Run `peerband share --help` for usage.');
    if (action && (parsed.values.message !== undefined || parsed.values.expires !== undefined))
      throw new UsageError('--message and --expires only apply when creating a link.', 'Run `peerband share --message` to create one.');
    const days = expiryDays(str(parsed, 'expires'));
    const credentials = await requireCredentials(ctx);
    if (action === 'list') return list(ctx, credentials, json);
    if (action === 'revoke') return revoke(ctx, credentials, id);
    return create(ctx, credentials, flag(parsed, 'message') ? 'message' : 'read', days, json);
  },
};
