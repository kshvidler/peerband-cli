import { openRelayTab } from '../herdr-js.js';
import { NOT_FOUND_HINT } from '../herdr-bin.js';
import { sanitize, symbols } from '../output.js';
import { CliError, type CommandSpec } from '../types.js';
import { printMcpHint, requireCredentials } from './shared.js';

export const spec: CommandSpec = {
  name: 'relay',
  summary: 'Open or focus the PeerBand Relay tab in Herdr',
  usage: 'peerband relay',
  description:
    'Opens the PeerBand Relay in a persistent Herdr tab, or focuses it if it is already open. The tab shows your account, connection state and metadata-only activity; closing it disconnects. Requires Herdr and the PeerBand plugin (`peerband herdr install`).',
  options: [],
  examples: [['peerband relay', 'Open the relay tab']],
  async run(_parsed, ctx) {
    const credentials = await requireCredentials(ctx);
    try {
      await (ctx.openRelayTab ?? openRelayTab)();
    } catch (error) {
      const message = sanitize((error as Error).message || 'Could not open the PeerBand Relay tab.');
      let hint = 'Make sure Herdr is running, then try `peerband relay` again.';
      if (/was not found/i.test(message)) hint = NOT_FOUND_HINT;
      else if (/not installed/i.test(message)) hint = 'Run `peerband herdr install`, then `peerband relay`.';
      else if (/already in progress/i.test(message)) hint = 'Wait a moment and run `peerband relay` again.';
      throw new CliError(message, hint);
    }
    const s = ctx.out.stdout;
    ctx.out.print(`${s.green(symbols.ok)} PeerBand Relay is open in Herdr.`);
    printMcpHint(ctx, credentials.serverUrl);
    return 0;
  },
};
