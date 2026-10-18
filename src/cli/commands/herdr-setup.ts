import { symbols } from '../output.js';
import { askYesNo, PromptAborted } from '../prompt.js';
import { CliError, type Ctx } from '../types.js';
import { installSpec } from './herdr.js';
import { checkHerdrPlugin, REPAIR_COMMAND } from './herdr-check.js';

export type HerdrPluginMode = 'ask' | 'install' | 'skip';
export const HERDR_PLUGIN_MODES: readonly HerdrPluginMode[] = ['ask', 'install', 'skip'];

/** After a successful login: detect Herdr and the PeerBand plugin, and guide (or perform) the next step. Never fails login. */
export async function herdrSetup(ctx: Ctx, mode: HerdrPluginMode): Promise<void> {
  const s = ctx.out.stdout;
  const manual = `${s.dim('Next:')} peerband herdr install  ${s.dim('then')}  peerband relay`;
  const state = await checkHerdrPlugin(ctx);

  if (!state.found) {
    ctx.out.print('');
    ctx.out.print(`${s.yellow(symbols.warn)} Herdr was not found. The PeerBand Relay tab needs Herdr 0.9.3 or newer.`);
    ctx.out.print('  1. Install Herdr: https://herdr.dev');
    ctx.out.print(`  2. ${s.bold('peerband herdr install')}  ${s.dim('then')}  ${s.bold('peerband relay')}`);
    return;
  }
  if (state.installed && state.problems.length === 0) {
    ctx.out.print(`${s.dim('Next:')} peerband relay  ${s.dim('(opens the PeerBand Relay tab in Herdr)')}`);
    return;
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
      return;
    }
    if (!install) {
      ctx.out.print(s.dim(`Skipped. ${repair ? 'Repair' : 'Add'} it later with \`${REPAIR_COMMAND}\`, then open the relay with \`peerband relay\`.`));
      return;
    }
  }
  if (!install) {
    ctx.out.print(manual);
    return;
  }

  try {
    await installSpec.run({ values: {}, positionals: [] }, ctx);
  } catch (error) {
    const message = (error as Error).message;
    ctx.out.warn(`${s.yellow(symbols.warn)} Could not ${repair ? 'repair' : 'add'} the PeerBand plugin${repair ? '' : ' to Herdr'}: ${message}`);
    if (error instanceof CliError && error.hint) ctx.out.warn(`  ${error.hint}`);
    ctx.out.print(s.dim(`You are logged in. ${repair ? 'Repair' : 'Add'} the plugin later with \`peerband herdr install\`, then run \`peerband relay\`.`));
  }
}

/**
 * Before opening the Relay tab: make sure the installed plugin is the right one. On a terminal, offers to repair it
 * (reinstall + rewrite settings); otherwise fails with the reasons. A missing Herdr is left to the caller's own message.
 */
export async function ensureHerdrPlugin(ctx: Ctx): Promise<void> {
  const check = await checkHerdrPlugin(ctx);
  if (!check.found || check.problems.length === 0) return;
  const s = ctx.out.stderr;
  const fix = 'Run `peerband herdr install`, then `peerband relay`.';
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
