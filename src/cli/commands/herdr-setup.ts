import { symbols } from '../output.js';
import { askYesNo, PromptAborted } from '../prompt.js';
import { CliError, type Ctx } from '../types.js';
import { installPlugin, installSpec } from './herdr.js';
import { checkHerdrPlugin, fixCommand, REPAIR_COMMAND } from './herdr-check.js';

export type HerdrPluginMode = 'ask' | 'install' | 'skip';
export const HERDR_PLUGIN_MODES: readonly HerdrPluginMode[] = ['ask', 'install', 'skip'];

/** What the plugin step left behind: Herdr missing, the plugin ready for the relay, or still missing/broken. */
export type HerdrSetupResult = 'no-herdr' | 'ready' | 'not-ready';

/**
 * After a successful login: detect Herdr and the PeerBand plugin, and guide (or perform) the next step. Never fails
 * login. `relayNext: false` leaves out the "then peerband relay" hints, for `peerband setup`, which opens the relay itself.
 */
export async function herdrSetup(ctx: Ctx, mode: HerdrPluginMode, options: { relayNext?: boolean } = {}): Promise<HerdrSetupResult> {
  const s = ctx.out.stdout;
  const relayNext = options.relayNext ?? true;
  const then = relayNext ? `  ${s.dim('then')}  peerband relay` : '';
  const manual = `${s.dim('Next:')} peerband herdr install${then}`;
  const state = await checkHerdrPlugin(ctx);

  if (!state.found) {
    ctx.out.print('');
    ctx.out.print(`${s.yellow(symbols.warn)} Herdr was not found. The PeerBand Relay tab needs Herdr 0.9.3 or newer.`);
    ctx.out.print('  1. Install Herdr: https://herdr.dev');
    ctx.out.print(`  2. ${s.bold('peerband herdr install')}  ${s.dim('then')}  ${s.bold(relayNext ? 'peerband relay' : 'peerband setup')}`);
    return 'no-herdr';
  }
  if (state.installed && state.problems.length === 0) {
    if (relayNext) ctx.out.print(`${s.dim('Next:')} peerband relay  ${s.dim('(opens the PeerBand Relay tab in Herdr)')}`);
    return 'ready';
  }
  const repair = state.installed;
  if (repair) {
    ctx.out.print('');
    ctx.out.print(`${s.yellow(symbols.warn)} The PeerBand plugin in Herdr needs repair: ${state.problems[0]!.message}`);
    if (state.problems.length > 1) ctx.out.print(s.dim(`  (${state.problems.length - 1} more problem${state.problems.length > 2 ? 's' : ''}; see \`peerband status\`)`));
  }

  let install = mode === 'install';
  if (mode === 'ask' && ctx.stdin.isTTY && ctx.stderr.isTTY) {
    try {
      install = await askYesNo(ctx.stdin, ctx.stderr, repair ? 'Repair the PeerBand plugin now? [Y/n] ' : 'Add the PeerBand plugin to Herdr now? [Y/n] ');
    } catch (error) {
      if (!(error instanceof PromptAborted)) throw error;
      ctx.out.print(manual);
      return 'not-ready';
    }
    if (!install) {
      ctx.out.print(s.dim(`Skipped. ${repair ? 'Repair' : 'Add'} it later with \`${REPAIR_COMMAND}\`, then open the relay with \`peerband relay\`.`));
      return 'not-ready';
    }
  }
  if (!install) {
    ctx.out.print(manual);
    return 'not-ready';
  }

  try {
    await installPlugin(ctx, { relayNext });
  } catch (error) {
    const message = (error as Error).message;
    ctx.out.warn(`${s.yellow(symbols.warn)} Could not ${repair ? 'repair' : 'add'} the PeerBand plugin${repair ? '' : ' to Herdr'}: ${message}`);
    if (error instanceof CliError && error.hint) ctx.out.warn(`  ${error.hint}`);
    ctx.out.print(s.dim(`You are logged in. ${repair ? 'Repair' : 'Add'} the plugin later with \`peerband herdr install\`, then run \`peerband relay\`.`));
    return 'not-ready';
  }
  return 'ready';
}

/**
 * Before opening the Relay tab: make sure the installed plugin is the right one. On a terminal, offers to repair it
 * (reinstall + rewrite settings); otherwise fails with the reasons. A missing Herdr is left to the caller's own message.
 */
export async function ensureHerdrPlugin(ctx: Ctx): Promise<void> {
  const check = await checkHerdrPlugin(ctx);
  if (!check.found || check.problems.length === 0) return;
  const s = ctx.out.stderr;
  const fix = `Run \`${fixCommand(check.problems[0])}\`, then \`peerband relay\`.`;
  const reasons = check.problems.map((problem) => problem.message);
  if (!(ctx.stdin.isTTY && ctx.stderr.isTTY)) throw new CliError(`The PeerBand Herdr plugin needs repair. ${reasons.join(' ')}`, fix);

  ctx.out.warn(`${s.yellow(symbols.warn)} The PeerBand plugin in Herdr needs repair: ${reasons[0]}`);
  if (reasons.length > 1) ctx.out.warn(s.dim(`  Also: ${reasons.slice(1).join(' ')}`));
  let repair: boolean;
  try {
    repair = await askYesNo(ctx.stdin, ctx.stderr, 'Repair the PeerBand plugin now? [Y/n] ');
  } catch (error) {
    if (!(error instanceof PromptAborted)) throw error;
    repair = false;
  }
  if (!repair) throw new CliError(`The PeerBand Herdr plugin needs repair. ${reasons[0]}`, fix);
  await installSpec.run({ values: {}, positionals: [] }, ctx);
}
