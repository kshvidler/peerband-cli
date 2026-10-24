import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { configHome } from '../core/index.js';
import { execProgram } from './exec.js';
import type { Ctx } from './types.js';

/** The skills CLI (https://skills.sh), pinned so setup never runs an unreviewed release. */
export const SKILLS_CLI = 'skills@1.7.4';
export const SKILL_NAME = 'peerband';
/** It can hang after a failure instead of exiting, so it always runs with a deadline. */
const SKILLS_TIMEOUT_MS = 120_000;

export interface SkillInstall {
  method: 'skills' | 'copy';
  /** Where the canonical copy lives (~/.agents/skills/peerband). */
  path: string;
  /** Agents that now see the skill, as the skills CLI names them (copy: the folders written). */
  agents: string[];
}

/** The skill shipped with this CLI (skills/peerband next to dist/), so the installed skill matches this version. */
export function bundledSkillDir(selfPath = process.argv[1]): string | undefined {
  if (!selfPath) return undefined;
  let dir: string;
  try {
    dir = dirname(realpathSync(selfPath));
  } catch {
    return undefined;
  }
  for (let i = 0; i < 4; i++) {
    const candidate = join(dir, 'skills', SKILL_NAME);
    if (existsSync(join(candidate, 'SKILL.md'))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/** The user's home folder from the environment (never guessed, so tests stay isolated). */
export function skillsHome(ctx: Ctx): string | undefined {
  return ctx.env.PEERBAND_SKILLS_HOME || (process.platform === 'win32' ? ctx.env.USERPROFILE : ctx.env.HOME) || undefined;
}

/** Folders a user-level skill is read from: the shared ~/.agents first, then agents that only read their own folder. */
function copyTargets(home: string): string[] {
  const targets = [join(home, '.agents', 'skills', SKILL_NAME)];
  if (existsSync(join(home, '.claude'))) targets.push(join(home, '.claude', 'skills', SKILL_NAME));
  return targets;
}

/** The installed SKILL.md: the shared ~/.agents copy, or Claude's own. */
export function installedSkillFile(ctx: Ctx): string | undefined {
  const home = skillsHome(ctx);
  if (!home) return undefined;
  return [join(home, '.agents', 'skills', SKILL_NAME), join(home, '.claude', 'skills', SKILL_NAME)]
    .map((dir) => join(dir, 'SKILL.md'))
    .find((file) => existsSync(file));
}

/** True when the PeerBand skill is already installed for this user (shared folder or Claude's own). */
export const skillInstalled = (ctx: Ctx): boolean => installedSkillFile(ctx) !== undefined;

const sha256 = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex');
/** Remembers the hash of the SKILL.md that was installed, to tell the user's own edits apart from an old version. */
const recordFile = (ctx: Ctx): string => join(configHome({ env: ctx.env }), 'skill.json');

/**
 * True when the installed SKILL.md was edited after PeerBand installed it (the user rewrote the rules). Those edits
 * are kept unless the user forces a reinstall. A skill installed before this record existed counts as unedited.
 */
export function skillEdited(ctx: Ctx): boolean {
  const file = installedSkillFile(ctx);
  if (!file) return false;
  let recorded: unknown;
  try {
    recorded = (JSON.parse(readFileSync(recordFile(ctx), 'utf8')) as { sha256?: unknown }).sha256;
  } catch {
    return false;
  }
  try {
    return typeof recorded === 'string' && sha256(file) !== recorded;
  } catch {
    return false;
  }
}

/** Thrown instead of overwriting a skill the user edited. */
export class SkillEditedError extends Error {
  constructor(readonly file: string) {
    super(`The PeerBand skill at ${file} has your own changes, so it was not replaced.`);
    this.name = 'SkillEditedError';
  }
}

function parseSkillsJson(stdout: string): SkillInstall | undefined {
  const start = stdout.indexOf('[');
  const end = stdout.lastIndexOf(']');
  if (start === -1 || end <= start) return undefined;
  let items: unknown;
  try {
    items = JSON.parse(stdout.slice(start, end + 1));
  } catch {
    return undefined;
  }
  if (!Array.isArray(items)) return undefined;
  const item = items.find((entry) => entry && typeof entry === 'object' && (entry as { name?: unknown }).name === SKILL_NAME) as
    | { status?: unknown; path?: unknown; agents?: unknown }
    | undefined;
  if (!item || item.status !== 'installed' || typeof item.path !== 'string') return undefined;
  const agents = Array.isArray(item.agents) ? item.agents.filter((agent): agent is string => typeof agent === 'string') : [];
  return { method: 'skills', path: item.path, agents };
}

function failureReason(stdout: string, stderr: string, code: number): string {
  const json = /"error"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(stdout)?.[1];
  if (json) return json.replace(/\\(.)/g, '$1');
  const line = `${stderr}\n${stdout}`.split(/\r?\n/).map((text) => text.trim()).filter(Boolean).pop();
  return line ? `${line} (exit code ${code})` : `exit code ${code}`;
}

/**
 * Installs the bundled skill for every coding agent on this machine: through the skills CLI (one copy in
 * ~/.agents/skills, linked into each detected agent), or, when that fails or `copy` is set, by copying it into
 * ~/.agents/skills and ~/.claude/skills. Throws only when both ways fail.
 */
export async function installSkill(ctx: Ctx, options: { copy?: boolean; force?: boolean; log?: (line: string) => void } = {}): Promise<SkillInstall> {
  const source = bundledSkillDir(ctx.selfPath);
  if (!source) throw new Error('The PeerBand skill is missing from this installation.');
  if (!options.force && skillEdited(ctx)) throw new SkillEditedError(installedSkillFile(ctx)!);
  const remember = async (installed: SkillInstall): Promise<SkillInstall> => {
    try {
      const file = recordFile(ctx);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, `${JSON.stringify({ sha256: sha256(join(source, 'SKILL.md')), path: installed.path }, null, 2)}
`);
    } catch {
      // Only the edit check depends on this record; the skill itself is installed.
    }
    return installed;
  };
  let reason: string | undefined;
  if (!options.copy) {
    const exec = ctx.exec ?? execProgram;
    const result = await exec('npx', ['-y', SKILLS_CLI, 'add', source, '--global', '--yes', '--json'], { timeoutMs: SKILLS_TIMEOUT_MS, env: ctx.env });
    const installed = parseSkillsJson(result.stdout);
    if (installed) return remember(installed);
    reason = result.notFound ? 'npx was not found' : failureReason(result.stdout, result.stderr, result.code);
    options.log?.(`The skills installer did not finish (${reason}); copying the skill instead.`);
  }
  const home = skillsHome(ctx);
  if (!home) throw new Error(`Could not find your home folder to copy the skill into${reason ? ` (skills installer: ${reason})` : ''}.`);
  const targets = copyTargets(home);
  for (const target of targets) {
    await mkdir(dirname(target), { recursive: true });
    await cp(source, target, { recursive: true, force: true });
  }
  return remember({ method: 'copy', path: targets[0]!, agents: targets.map((target) => dirname(dirname(target))) });
}
