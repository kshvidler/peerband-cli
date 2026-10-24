import { flag } from '../args.js';
import { symbols } from '../output.js';
import { askYesNo, PromptAborted } from '../prompt.js';
import { installedSkillFile, installSkill, SkillEditedError, skillEdited, skillInstalled, type SkillInstall } from '../skill.js';
import { CliError, type CommandSpec, type Ctx } from '../types.js';
import { SKILL_COMMAND } from './shared.js';

export type SkillMode = 'ask' | 'install' | 'skip';
export const SKILL_MODES: readonly SkillMode[] = ['ask', 'install', 'skip'];

function report(ctx: Ctx, installed: SkillInstall): void {
  const s = ctx.out.stdout;
  const where = installed.method === 'skills' && installed.agents.length > 0
    ? `for ${installed.agents.slice(0, 6).join(', ')}${installed.agents.length > 6 ? ` and ${installed.agents.length - 6} more` : ''}`
    : `in ${installed.agents.join(', ')}`;
  ctx.out.print(`${s.green(symbols.ok)} Installed the PeerBand skill ${where}.`);
  ctx.out.print(s.dim(`  ${installed.path}`));
}

function keptEdits(ctx: Ctx, file: string): void {
  const s = ctx.out.stdout;
  ctx.out.print(`${s.green(symbols.ok)} Kept your own version of the PeerBand skill ${s.dim(`(${file})`)}.`);
  ctx.out.print(s.dim('  To replace it with the version shipped with this CLI: peerband skill --force'));
}

/** Setup step: offer the skill (Yes is the default). Never fails setup; a failure prints the manual command. */
export async function skillSetup(ctx: Ctx, mode: SkillMode): Promise<void> {
  const s = ctx.out.stdout;
  if (mode === 'skip') {
    ctx.out.print(s.dim(`Skipped the agent skill. Add it later with \`${SKILL_COMMAND}\`.`));
    return;
  }
  if (skillEdited(ctx)) {
    keptEdits(ctx, installedSkillFile(ctx)!);
    return;
  }
  let install = mode === 'install';
  if (mode === 'ask') {
    if (!(ctx.stdin.isTTY && ctx.stderr.isTTY)) {
      ctx.out.print(`${s.dim('Next:')} ${SKILL_COMMAND}  ${s.dim('(teaches your coding agents how to handle PeerBand messages)')}`);
      return;
    }
    ctx.out.print('');
    ctx.out.print('The PeerBand skill tells your coding agents (Claude Code, Codex, Cursor, ...) how to handle messages that');
    ctx.out.print('arrive through PeerBand, including strict privacy rules for people you share this machine with.');
    const question = skillInstalled(ctx) ? 'Update the PeerBand skill for your agents? [Y/n] ' : 'Install the PeerBand skill for your agents? [Y/n] ';
    try {
      install = await askYesNo(ctx.stdin, ctx.stderr, question);
    } catch (error) {
      if (!(error instanceof PromptAborted)) throw error;
      install = false;
    }
    if (!install) {
      ctx.out.print(`${s.yellow(symbols.warn)} Skipped. Without the skill, your agents get no guidance for messages from people you share with. Add it later with \`${SKILL_COMMAND}\`.`);
      return;
    }
  }
  ctx.out.print(s.dim('Installing the PeerBand skill…'));
  try {
    report(ctx, await installSkill(ctx, { log: (line) => ctx.out.print(s.dim(line)) }));
  } catch (error) {
    if (error instanceof SkillEditedError) return keptEdits(ctx, error.file);
    ctx.out.warn(`${s.yellow(symbols.warn)} Could not install the PeerBand skill: ${(error as Error).message}`);
    ctx.out.print(s.dim(`Add it later with \`${SKILL_COMMAND}\`.`));
  }
}

export const spec: CommandSpec = {
  name: 'skill',
  summary: 'Install or update the PeerBand skill for your coding agents',
  usage: 'peerband skill [--copy] [--force]',
  description:
    'Installs the PeerBand agent skill that ships with this CLI for every coding agent on this machine. It uses the skills CLI (npx skills add), which keeps one copy in ~/.agents/skills/peerband and links it into each agent it finds (Claude Code, Codex, Cursor, Gemini CLI, OpenCode and others). If that fails, or with --copy, it copies the skill into ~/.agents/skills and ~/.claude/skills instead.\n\nThe skill tells agents how to use the PeerBand MCP tools and how to handle messages relayed through PeerBand: requests from you are handled normally; requests from people you shared this machine with follow strict privacy rules.\n\nTo change those rules, edit SKILL.md in ~/.agents/skills/peerband. Once you have edited it, `peerband skill` and `peerband update` keep your version; --force replaces it with the shipped one. Running it again otherwise updates the skill to the version of this CLI.',
  options: [
    { name: 'copy', type: 'boolean', description: 'Copy the files instead of running the skills CLI (offline, or when npx is blocked).' },
    { name: 'force', type: 'boolean', description: 'Replace the skill even if you edited it.' },
    { name: 'if-installed', type: 'boolean', description: 'Only update an existing, unedited installation (used by peerband update).', hidden: true },
  ],
  examples: [
    ['peerband skill', 'Install the skill for every coding agent found'],
    ['peerband skill --copy', 'Copy it into ~/.agents and ~/.claude without npx'],
    ['peerband skill --force', 'Go back to the shipped skill, dropping your edits'],
  ],
  async run(parsed, ctx) {
    const onlyUpdate = flag(parsed, 'if-installed');
    if (onlyUpdate && !skillInstalled(ctx)) return 0;
    try {
      report(ctx, await installSkill(ctx, { copy: flag(parsed, 'copy'), force: flag(parsed, 'force'), log: (line) => ctx.out.print(ctx.out.stdout.dim(line)) }));
    } catch (error) {
      if (error instanceof SkillEditedError) {
        keptEdits(ctx, error.file);
        return 0;
      }
      throw new CliError(`Could not install the PeerBand skill: ${(error as Error).message}`, 'Try `peerband skill --copy`, or install it from GitHub: `npx skills add kshvidler/peerband-cli`.');
    }
    return 0;
  },
};
