import { flag } from '../args.js';
import { startBackgroundRelay, stopBackgroundRelay } from '../background.js';
import { openRelayTab } from '../herdr-js.js';
import { NOT_FOUND_HINT } from '../herdr-bin.js';
import { sanitize, symbols } from '../output.js';
import { CliError, type CommandSpec, type Ctx, UsageError } from '../types.js';
import { ensureHerdrPlugin } from './herdr-setup.js';
import { printMcpHint, printSkillTip, requireCredentials } from './shared.js';

export const spec: CommandSpec = {
  name: 'relay',
  summary: 'Open the PeerBand Relay in Herdr, or run it in the background for herdr-core',
  usage: 'peerband relay [--core] [--stop]',
  description:
    'Opens the PeerBand Relay in a persistent Herdr tab, or focuses it if it is already open. The tab shows your account, connection state and metadata-only activity; closing it disconnects. Requires Herdr and the PeerBand plugin (`peerband herdr install`). If the plugin is wrong (another version, a local checkout, or a stale config directory), relay offers to repair it first.\n\n' +
    'With --core the relay serves herdr-core (`hc`) instead, the terminal server behind the Herdr desktop app. herdr-core has no plugin tab, so the relay runs in the background: closing the desktop app or a terminal leaves it connected. Check it with `peerband status` and stop it with `peerband relay --stop`. It does not start again by itself after you log out or restart the computer; run `peerband relay --core` again. One relay serves one runtime per machine.',
  options: [
    { name: 'core', type: 'boolean', description: 'Run the relay in the background for herdr-core and the Herdr desktop app.' },
    { name: 'stop', type: 'boolean', description: 'Stop the relay running on this machine (either kind).' },
  ],
  examples: [
    ['peerband relay', 'Open the relay tab in Herdr'],
    ['peerband relay --core', 'Connect herdr-core (and the Herdr desktop app) in the background'],
    ['peerband relay --stop', 'Disconnect this machine'],
  ],
  async run(parsed, ctx) {
    const s = ctx.out.stdout;
    if (flag(parsed, 'stop')) {
      if (flag(parsed, 'core')) throw new UsageError('--core and --stop cannot be combined.', '`peerband relay --stop` stops whichever relay is running.');
      if (await stopBackgroundRelay(ctx)) ctx.out.print(`${s.green(symbols.ok)} PeerBand Relay stopped.`);
      else ctx.out.print(s.dim('No PeerBand relay is running on this machine.'));
      return 0;
    }
    const credentials = await requireCredentials(ctx);
    if (flag(parsed, 'core')) {
      const state = await startBackgroundRelay(ctx, 'herdr-core');
      ctx.out.print(state === 'running'
        ? `${s.green(symbols.ok)} The PeerBand Relay for herdr-core is already running.`
        : `${s.green(symbols.ok)} PeerBand Relay is running in the background for herdr-core.`);
      ctx.out.print(s.dim('Check it with `peerband status`; stop it with `peerband relay --stop`.'));
      printMcpHint(ctx, credentials.serverUrl);
      printSkillTip(ctx);
      return 0;
    }
    await ensureHerdrPlugin(ctx);
    await openRelay(ctx);
    ctx.out.print(`${s.green(symbols.ok)} PeerBand Relay is open in Herdr.`);
    printMcpHint(ctx, credentials.serverUrl);
    printSkillTip(ctx);
    return 0;
  },
};

/** Opens (or focuses) the Relay tab; a failure is a CliError with the next step. */
export async function openRelay(ctx: Ctx): Promise<void> {
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
}
