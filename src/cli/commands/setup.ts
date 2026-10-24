import { loadCredentials, resolveServerUrl, type Credentials } from '../../core/index.js';
import { flag, str } from '../args.js';
import { symbols } from '../output.js';
import { CliError, type CommandSpec, type Ctx, type Parsed, UsageError } from '../types.js';
import { herdrSetup } from './herdr-setup.js';
import { herdrPluginMode, signIn, spec as login } from './login.js';
import { openRelay } from './relay.js';
import { credentialsFile, printMcpHint } from './shared.js';
import { SKILL_MODES, skillSetup, type SkillMode } from './skill.js';

function skillMode(parsed: Parsed): SkillMode {
  const raw = str(parsed, 'skill')?.trim().toLowerCase() ?? 'ask';
  if (!(SKILL_MODES as readonly string[]).includes(raw)) throw new UsageError(`Invalid --skill value "${raw}".`, 'Use --skill ask, install or skip.');
  return raw as SkillMode;
}

/** The stored login, when it is for the server setup would use; a grant always means a fresh login. */
async function existingLogin(parsed: Parsed, ctx: Ctx): Promise<Credentials | undefined> {
  if (str(parsed, 'grant') !== undefined || ctx.env.PEERBAND_GRANT) return undefined;
  const previous = await loadCredentials(credentialsFile(ctx)).catch(() => undefined);
  if (!previous) return undefined;
  try {
    return new URL(previous.serverUrl).origin === new URL(resolveServerUrl(str(parsed, 'server'), ctx.env)).origin ? previous : undefined;
  } catch {
    return undefined;
  }
}

const loginOptions = login.options.filter((option) => option.name !== 'herdr-plugin');

export const spec: CommandSpec = {
  name: 'setup',
  summary: 'Set up this machine: log in, add the Herdr plugin and the agent skill, open the relay',
  usage: 'peerband setup [--name NAME] [--no-browser] [--server URL] [--herdr-plugin ask|install|skip] [--skill ask|install|skip] [--no-relay]\n  peerband setup --grant GRANT [...]',
  description:
    'Does everything a new machine needs, in one go, and is safe to run again:\n' +
    '  1. Logs in through your browser (skipped when this machine is already logged in to the same server).\n' +
    '  2. Adds or repairs the PeerBand plugin in Herdr.\n' +
    '  3. Installs the PeerBand skill for your coding agents (see `peerband skill`). It tells them how to handle messages that arrive through PeerBand, with strict privacy rules for people you share this machine with.\n' +
    '  4. Opens the PeerBand Relay tab in Herdr, which connects the machine.\n\n' +
    'On a terminal each optional step asks first, with Yes as the default. Without a terminal, ask means skip and setup prints the command for that step.',
  options: [
    ...loginOptions,
    { name: 'herdr-plugin', type: 'string', valueName: 'ask|install|skip', description: 'Add the PeerBand plugin to Herdr: ask (default; prompts on a terminal), install, or skip.' },
    { name: 'skill', type: 'string', valueName: 'ask|install|skip', description: 'Install the PeerBand skill for your coding agents: ask (default; prompts on a terminal), install, or skip.' },
    { name: 'no-relay', type: 'boolean', description: 'Do not open the Relay tab at the end.' },
  ],
  examples: [
    ['peerband setup', 'Log in, add the plugin and the skill, open the relay'],
    ['peerband setup --herdr-plugin install --skill install', 'The same without questions (used by the install scripts)'],
    ['PEERBAND_GRANT=... peerband setup --name work-laptop --no-relay', 'Headless: log in with a dashboard grant'],
  ],
  async run(parsed, ctx) {
    const herdrMode = herdrPluginMode(parsed);
    const skill = skillMode(parsed);
    const s = ctx.out.stdout;

    const step = (n: number, title: string) => {
      ctx.out.print('');
      ctx.out.print(s.bold(`${n}/4 ${title}`));
    };

    step(1, 'Log in');
    let credentials = await existingLogin(parsed, ctx);
    if (credentials) {
      const who = credentials.accountEmail ? ` (${credentials.accountEmail})` : '';
      ctx.out.print(`${s.green(symbols.ok)} Already logged in as ${s.bold(credentials.machineName ?? credentials.installationId)}${who} ${s.dim('(`peerband login` signs in again)')}`);
    } else {
      credentials = await signIn(parsed, ctx);
    }

    step(2, 'Herdr plugin');
    const herdr = await herdrSetup(ctx, herdrMode, { relayNext: false });

    step(3, 'Agent skill');
    await skillSetup(ctx, skill);

    step(4, 'Relay');
    let relayOpen = false;
    if (flag(parsed, 'no-relay')) {
      ctx.out.print(s.dim('Skipped. Open it later with `peerband relay`.'));
    } else if (herdr !== 'ready') {
      ctx.out.print(s.dim(`Not opened: ${herdr === 'no-herdr' ? 'Herdr is not installed' : 'the Herdr plugin is not ready'}. When it is, run \`peerband relay\`.`));
    } else {
      try {
        await openRelay(ctx);
        relayOpen = true;
        ctx.out.print(`${s.green(symbols.ok)} PeerBand Relay is open in Herdr.`);
      } catch (error) {
        ctx.out.warn(`${s.yellow(symbols.warn)} Could not open the PeerBand Relay tab: ${(error as Error).message}`);
        if (error instanceof CliError && error.hint) ctx.out.print(s.dim(`  ${error.hint}`));
      }
    }

    printMcpHint(ctx, credentials.serverUrl);
    ctx.out.print('');
    ctx.out.print(relayOpen ? `${s.green(symbols.ok)} PeerBand is set up.` : `${s.dim('Setup finished. Check it any time with')} peerband status`);
    return 0;
  },
};
