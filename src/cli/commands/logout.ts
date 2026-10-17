import { deleteCredentials, loadCredentials } from '../../core/index.js';
import { stopRelay } from '../control.js';
import { symbols } from '../output.js';
import type { CommandSpec } from '../types.js';
import { credentialsFile } from './shared.js';

export const spec: CommandSpec = {
  name: 'logout',
  summary: 'Forget this machine\'s PeerBand credential',
  usage: 'peerband logout',
  description:
    'Deletes the stored credential from this machine and stops a running PeerBand Relay. It does not revoke the machine on the server: remove it from your PeerBand dashboard to revoke access for good.',
  options: [],
  examples: [['peerband logout', 'Remove the local credential']],
  async run(_parsed, ctx) {
    const s = ctx.out.stdout;
    const previous = await loadCredentials(credentialsFile(ctx)).catch(() => undefined);
    // A running relay would keep using the credential it already loaded, so stop it first.
    const stopped = await stopRelay(ctx.env);
    if (stopped) ctx.out.print(`${s.green(symbols.ok)} Stopped the running PeerBand Relay.`);
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
