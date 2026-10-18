import { symbols } from '../output.js';
import { askYesNo, PromptAborted } from '../prompt.js';
import { CliError, type Ctx } from '../types.js';
import { installSpec } from './herdr.js';
import { pluginInstalled } from './status.js';

export type HerdrPluginMode = 'ask' | 'install' | 'skip';
export const HERDR_PLUGIN_MODES: readonly HerdrPluginMode[] = ['ask', 'install', 'skip'];

/** After a successful login: detect Herdr and the PeerBand plugin, and guide (or perform) the next step. Never fails login. */
export async function herdrSetup(ctx: Ctx, mode: HerdrPluginMode): Promise<void> {
  const s = ctx.out.stdout;
  const manual = `${s.dim('Next:')} peerband herdr install  ${s.dim('then')}  peerband relay`;
  const state = await pluginInstalled(ctx);

  if (!state.found) {
    ctx.out.print('');
    ctx.out.print(`${s.yellow(symbols.warn)} Herdr was not found. The PeerBand Relay tab needs Herdr 0.9.3 or newer.`);
    ctx.out.print('  1. Install Herdr: https://herdr.dev');
    ctx.out.print(`  2. ${s.bold('peerband herdr install')}  ${s.dim('then')}  ${s.bold('peerband relay')}`);
    return;
  }
  if (state.installed) {
    ctx.out.print(`${s.dim('Next:')} peerband relay  ${s.dim('(opens the PeerBand Relay tab in Herdr)')}`);
    return;
  }

  let install = mode === 'install';
  if (mode === 'ask' && ctx.stdin.isTTY && ctx.stderr.isTTY) {
    try {
      install = await askYesNo(ctx.stdin, ctx.stderr, 'Add the PeerBand plugin to Herdr now? [Y/n] ');
    } catch (error) {
      if (!(error instanceof PromptAborted)) throw error;
      ctx.out.print(manual);
      return;
    }
    if (!install) {
      ctx.out.print(s.dim('Skipped. Add it later with `peerband herdr install`, then open the relay with `peerband relay`.'));
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
    ctx.out.warn(`${s.yellow(symbols.warn)} Could not add the PeerBand plugin to Herdr: ${message}`);
    if (error instanceof CliError && error.hint) ctx.out.warn(`  ${error.hint}`);
    ctx.out.print(s.dim('You are logged in. Add the plugin later with `peerband herdr install`, then run `peerband relay`.'));
  }
}
