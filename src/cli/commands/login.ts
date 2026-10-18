import { hostname } from 'node:os';
import {
  type Credentials,
  DeviceLoginError,
  loadCredentials,
  pollDeviceToken,
  redeemEnrollment,
  requestDeviceCode,
  resolveServerUrl,
  saveCredentials,
} from '../../core/index.js';
import { str } from '../args.js';
import { browserDecision, openBrowser } from '../browser.js';
import { sanitize, symbols } from '../output.js';
import { CliError, type CommandSpec, type Ctx, UsageError } from '../types.js';
import { herdrSetup, HERDR_PLUGIN_MODES, type HerdrPluginMode } from './herdr-setup.js';
import { credentialsFile, printSkillTip } from './shared.js';

export interface GrantLoginOptions {
  serverUrl: string;
  grant: string;
  name: string;
}

async function persist(ctx: Ctx, redeemed: Credentials): Promise<Credentials> {
  const credentials: Credentials = { ...redeemed, enrolledAt: new Date().toISOString() };
  await saveCredentials(credentials, credentialsFile(ctx));
  return credentials;
}

/** Redeems a one-time dashboard grant and stores the installation credential. */
export async function loginWithGrant(ctx: Ctx, options: GrantLoginOptions): Promise<Credentials> {
  let redeemed: Credentials;
  try {
    redeemed = await redeemEnrollment(options.serverUrl, options.grant, options.name, ctx.fetch);
  } catch (error) {
    const message = (error as Error).message;
    const rejected = /could not be redeemed/i.test(message);
    throw new CliError(
      message,
      rejected
        ? 'Create a new grant in your PeerBand dashboard (grants are short-lived and single-use), then run `peerband login --grant GRANT` again.'
        : `Check your network connection and the server URL (${options.serverUrl}).`,
    );
  }
  return persist(ctx, redeemed);
}

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const GRANT_HINT = 'Use `peerband login --grant GRANT` (create a grant in the dashboard).';

/** Browser sign-in: show a code, let the user approve it in the dashboard, then store the credential. */
export async function loginWithBrowser(ctx: Ctx, options: { serverUrl: string; name: string; noBrowser: boolean }): Promise<Credentials> {
  const controller = new AbortController();
  const forward = () => controller.abort();
  let onSigint: (() => void) | undefined;
  if (ctx.signal) {
    if (ctx.signal.aborted) controller.abort();
    else ctx.signal.addEventListener('abort', forward, { once: true });
  } else {
    onSigint = forward;
    process.once('SIGINT', onSigint);
  }
  const s = ctx.out.stderr;
  const say = (line = '') => ctx.out.warn(line);
  let spinner: NodeJS.Timeout | undefined;
  const stopSpinner = () => {
    if (!spinner) return;
    clearInterval(spinner);
    spinner = undefined;
    ctx.stderr.write('\r\u001b[2K');
  };
  try {
    const shared = { fetch: ctx.fetch, signal: controller.signal, ...(ctx.sleep ? { sleep: ctx.sleep } : {}), ...(ctx.now ? { now: ctx.now } : {}) };
    let code;
    try {
      code = await requestDeviceCode(options.serverUrl, { clientVersion: ctx.version, machineName: options.name, platform: process.platform }, shared);
    } catch (error) {
      throw mapFailure(error, options.serverUrl);
    }

    const link = sanitize(code.verificationUriComplete);
    say(s.bold('To sign in, open this page in your browser:'));
    say();
    say(`  ${s.cyan(link)}`);
    say();
    say(`and confirm this code:   ${s.bold(s.cyan(sanitize(code.userCode)))}`);
    say();

    const decision = browserDecision(code.verificationUriComplete, {
      env: ctx.env,
      platform: process.platform,
      stdoutIsTTY: Boolean(ctx.stdout.isTTY),
      noBrowser: options.noBrowser,
    });
    if (decision.open) {
      const opened = await (ctx.openBrowser ?? ((url) => openBrowser(url)))(code.verificationUriComplete);
      say(opened ? s.dim('Opened your browser.') : s.dim("Couldn't open a browser; open the link above."));
    } else {
      say(s.dim('Open the link above in any browser (it can be on another device).'));
    }

    const waiting = 'Waiting for approval… (Ctrl+C to cancel)';
    if (ctx.stderr.isTTY) {
      let frame = 0;
      const draw = () => ctx.stderr.write(`\r${s.cyan(SPINNER[frame++ % SPINNER.length]!)} ${waiting}`);
      draw();
      spinner = setInterval(draw, 100);
      spinner.unref();
    } else {
      say(waiting);
    }

    let redeemed: Credentials;
    try {
      redeemed = await pollDeviceToken(options.serverUrl, code, shared);
    } catch (error) {
      throw mapFailure(error, options.serverUrl);
    } finally {
      stopSpinner();
    }
    return await persist(ctx, redeemed);
  } finally {
    stopSpinner();
    ctx.signal?.removeEventListener('abort', forward);
    if (onSigint) process.off('SIGINT', onSigint);
  }
}

function mapFailure(error: unknown, serverUrl: string): Error {
  if (!(error instanceof DeviceLoginError)) {
    return new CliError((error as Error).message, `Check the server URL (${serverUrl}).`);
  }
  switch (error.kind) {
    case 'aborted':
      return new CliError('Login cancelled.', undefined, 130);
    case 'unsupported':
      return new CliError("This server doesn't support browser sign-in yet.", GRANT_HINT);
    case 'denied':
      return new CliError('Sign-in was denied in the browser.', 'Run `peerband login` again if that was a mistake.');
    case 'expired':
      return new CliError('The code expired.', 'Run `peerband login` again.');
    case 'invalid_grant':
      return new CliError(error.message, 'Run `peerband login` again to get a new code.');
    case 'network':
      return new CliError(error.message, `Check your network connection and the server URL (${serverUrl}), or use \`peerband login --grant GRANT\`.`);
    default:
      return new CliError(error.message, 'Run `peerband login` again, or use `peerband login --grant GRANT`.');
  }
}

export const spec: CommandSpec = {
  name: 'login',
  summary: 'Connect this machine to your PeerBand account',
  usage: 'peerband login [--name NAME] [--no-browser] [--server URL] [--herdr-plugin ask|install|skip]\n  peerband login --grant GRANT [--name NAME] [--server URL]',
  description:
    'Signs this machine in through your browser. login prints a link and a short code, opens the page (unless you are on SSH, a headless machine or pass --no-browser), and waits while you confirm the code in your PeerBand account. The credential is stored in your PeerBand config directory (readable only by you). Running login again replaces the existing enrollment.\n\nOn a headless machine or in CI, use a one-time grant instead: create it in the PeerBand dashboard and pass --grant GRANT (or set PEERBAND_GRANT).\n\nWhen login succeeds it checks for Herdr. If the PeerBand plugin is missing, or installed but wrong (another version, a local checkout, a stale config directory), it offers to add or repair it (--herdr-plugin ask, the default; it only asks on a terminal), adds it without asking (install), or just prints the command (skip).',
  options: [
    { name: 'no-browser', type: 'boolean', description: 'Do not open a browser; print the link and code only (SSH, containers).' },
    { name: 'name', type: 'string', valueName: 'NAME', description: "Name shown for this machine in the dashboard. Default: this computer's hostname." },
    { name: 'server', type: 'string', valueName: 'URL', description: 'PeerBand server. Default: $PEERBAND_SERVER or https://peerband.com.' },
    { name: 'grant', type: 'string', valueName: 'GRANT', description: 'Headless/CI: enroll with a dashboard grant instead of the browser. Default: $PEERBAND_GRANT.' },
    { name: 'herdr-plugin', type: 'string', valueName: 'ask|install|skip', description: 'After login, add the PeerBand plugin to Herdr: ask (default; prompts on a terminal), install, or skip.' },
  ],
  examples: [
    ['peerband login', 'Open your browser, confirm the code, done'],
    ['peerband login --herdr-plugin install', 'Also add the PeerBand plugin to Herdr without asking (used by the install scripts)'],
    ['peerband login --no-browser', 'Print the link and code; open the link on any other device'],
    ['PEERBAND_GRANT=... peerband login --name work-laptop', 'Headless/CI with a dashboard grant; keeps it out of the process list'],
    ['peerband login --server http://localhost:8000', 'Against a local development server'],
  ],
  notes: ['The code you confirm in the browser must match the one shown here. The secret device code and any grant are never printed or stored. Plain HTTP is only accepted for localhost.'],
  async run(parsed, ctx) {
    const rawMode = str(parsed, 'herdr-plugin')?.trim().toLowerCase() ?? 'ask';
    if (!(HERDR_PLUGIN_MODES as readonly string[]).includes(rawMode)) throw new UsageError(`Invalid --herdr-plugin value "${rawMode}".`, 'Use --herdr-plugin ask, install or skip.');
    const herdrMode = rawMode as HerdrPluginMode;
    const serverUrl = resolveServerUrl(str(parsed, 'server'), ctx.env);
    const name = str(parsed, 'name')?.trim() || hostname();
    // The grant is a secret: never leave it in this process environment or in child environments.
    const grant = (str(parsed, 'grant') ?? ctx.env.PEERBAND_GRANT)?.trim();
    delete ctx.env.PEERBAND_GRANT;
    if (parsed.values.grant !== undefined && !grant) throw new UsageError('The grant is empty.', 'Pass the grant from your PeerBand dashboard: --grant GRANT.');
    const previous = await loadCredentials(credentialsFile(ctx)).catch(() => undefined);
    const credentials = grant
      ? await loginWithGrant(ctx, { serverUrl, grant, name })
      : await loginWithBrowser(ctx, { serverUrl, name, noBrowser: parsed.values['no-browser'] === true });
    const s = ctx.out.stdout;
    if (previous) ctx.out.print(s.dim(`Replaced the previous login (${previous.machineName ?? previous.installationId} on ${previous.serverUrl}).`));
    const who = credentials.accountEmail ? ` (${credentials.accountEmail})` : '';
    ctx.out.print(`${s.green(symbols.ok)} Logged in as ${s.bold(credentials.machineName ?? name)}${who}`);
    await herdrSetup(ctx, herdrMode);
    ctx.out.print('');
    printSkillTip(ctx);
    return 0;
  },
};
