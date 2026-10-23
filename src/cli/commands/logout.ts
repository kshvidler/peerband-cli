import { deleteCredentials, loadCredentials } from '../../core/index.js';
import { cleanRelayState, closeRelayPanes, findRelayPanes, stopRelayAndWait } from '../relay-maint.js';
import { symbols } from '../output.js';
import type { CommandSpec } from '../types.js';
import { credentialsFile } from './shared.js';

export const spec: CommandSpec = {
  name: 'logout',
  summary: 'Forget this machine\'s PeerBand credential',
  usage: 'peerband logout',
  description:
    'Deletes the stored credential from this machine, stops a running PeerBand Relay, closes its Herdr tabs and deletes the local relay state (relay-state.json, relay-tab.json and locks left by processes that are no longer running). Safe to run more than once. It does not revoke the machine on the server: remove it from your PeerBand dashboard to revoke access for good.',
  options: [],
  examples: [['peerband logout', 'Remove the local credential']],
  async run(_parsed, ctx) {
    const s = ctx.out.stdout;
    const previous = await loadCredentials(credentialsFile(ctx)).catch(() => undefined);
    // A running relay would keep using the credential it already loaded, so stop it first.
    const panes = await findRelayPanes(ctx);
    const stopped = await stopRelayAndWait(ctx);
    if (stopped) ctx.out.print(`${s.green(symbols.ok)} Stopped the running PeerBand Relay.`);
    if (panes.length) {
      const closed = await closeRelayPanes(ctx, panes);
      if (closed) ctx.out.print(`${s.green(symbols.ok)} Closed ${closed === 1 ? 'the PeerBand Relay tab' : `${closed} PeerBand Relay tabs`}.`);
    }
    const cleanup = await cleanRelayState(ctx, { remove: true });
    for (const held of cleanup.held) ctx.out.warn(`${ctx.out.stderr.yellow(symbols.warn)} ${held.lock} is still held: ${held.reason}.`);
    const removed = await deleteCredentials(credentialsFile(ctx));
    if (!removed) {
      ctx.out.print('Already logged out; there is no credential on this machine.');
      return 0;
    }
    const who = previous?.machineName ? ` (${previous.machineName})` : '';
    ctx.out.print(`${s.green(symbols.ok)} Logged out${who}. The local credential was deleted.`);
    ctx.out.print(s.dim('This does not revoke the machine server-side. Remove it from your PeerBand dashboard to revoke access.'));
    return 0;
  },
};
