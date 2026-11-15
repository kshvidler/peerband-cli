// @ts-expect-error -- shared plain JS module used directly by the Herdr plugin
import { CHANNELS_URL, TELEGRAM_URL, telegramQr } from '../../../herdr/telegram.mjs';
import { type CommandSpec } from '../types.js';
import { fetchChannels, TELEGRAM_CHANNEL } from './channels.js';
import { requireCredentials } from './shared.js';

export const spec: CommandSpec = {
  name: 'telegram',
  summary: 'Connect Telegram with a QR code or bot link',
  usage: 'peerband telegram',
  description: 'Scan the QR code or open the PeerBand bot, press Start, then use its Connect button to sign in and approve. Shows connection status when available. No link code or credential is created or printed.',
  options: [],
  examples: [['peerband telegram', 'Show the Telegram QR code, link and connection status']],
  notes: ['Works before login and while the relay is off. Manage channels at https://peerband.com/dashboard#channels.'],
  async run(_parsed, ctx) {
    ctx.out.print(ctx.out.stdout.bold('Connect Telegram'));
    ctx.out.print(telegramQr().join('\n'));
    ctx.out.print(TELEGRAM_URL);
    ctx.out.print('Open the bot, press Start, then Connect. Sign in to PeerBand and approve.');
    ctx.out.print(`Dashboard alternative: ${CHANNELS_URL}`);
    try {
      const credentials = await requireCredentials(ctx);
      const channels = await fetchChannels(ctx, credentials);
      ctx.out.print(`Telegram: ${channels.some((channel) => channel.name === TELEGRAM_CHANNEL && channel.state === 'active') ? 'connected' : 'not connected'}`);
    } catch {
      // Status is optional: older servers, offline machines and missing/revoked credentials
      // must still leave the public bot-first connection flow usable. Never echo raw errors.
      ctx.out.print('Telegram: status unavailable (run `peerband login` or check the dashboard).');
    }
    return 0;
  },
};
