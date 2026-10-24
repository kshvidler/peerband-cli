import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { configHome } from '../../core/index.js';
import { failureDetail } from '../herdr-bin.js';
import { canonicalConfig } from '../herdr-js.js';
import type { Ctx } from '../types.js';

const PLUGIN_ID = 'peerband';
export const REPAIR_COMMAND = 'peerband herdr install';
export const UPDATE_COMMAND = 'peerband update';

/** The command that fixes a problem: a version mismatch is fixed by updating, everything else by reinstalling. */
export const fixCommand = (problem: PluginProblem | undefined): string => (problem?.code === 'version-mismatch' ? UPDATE_COMMAND : REPAIR_COMMAND);

export type PluginProblemCode = 'not-installed' | 'local-source' | 'version-mismatch' | 'config-home' | 'node-path';

export interface PluginProblem {
  code: PluginProblemCode;
  message: string;
}

export interface PluginCheck {
  found: boolean;
  /** Herdr's own version, when it reported one. */
  herdrVersion: string | null;
  installed: boolean;
  /** Source as listed by `herdr plugin list`, e.g. `github:kshvidler/peerband-cli@v0.1.2` or `local:/path`. */
  source: string | null;
  /** Why the plugin list could not be read (Herdr too old, daemon error). No problems are reported then. */
  detail?: string;
  problems: PluginProblem[];
}

export async function pluginInstalled(ctx: Ctx): Promise<{ found: boolean; installed: boolean; source: string | null; detail?: string }> {
  const result = await ctx.runHerdr(['plugin', 'list'], { timeoutMs: 10_000 });
  if (result.notFound) return { found: false, installed: false, source: null };
  if (result.code !== 0) return { found: true, installed: false, source: null, detail: failureDetail(result) };
  // `herdr plugin list` prints one `- <id> (<name>) <state> [<source>]` line per plugin.
  const line = /^\s*-\s+peerband\s.*$/m.exec(result.stdout)?.[0];
  if (line === undefined) return { found: true, installed: false, source: null };
  const source = /\[([^\]]*)\]\s*$/.exec(line)?.[1]?.trim() || null;
  return { found: true, installed: true, source };
}

export function herdrVersion(output: string): string | null {
  return /\d+\.\d+\.\d+(?:[-+.\w]*)?/.exec(output)?.[0] ?? null;
}

async function readSettings(ctx: Ctx): Promise<{ nodePath?: unknown; configHome?: unknown } | null> {
  const dir = await ctx.runHerdr(['plugin', 'config-dir', PLUGIN_ID], { timeoutMs: 10_000 });
  const configDir = dir.code === 0 ? dir.stdout.trim() : '';
  if (!configDir) return null;
  try {
    const value = JSON.parse(await readFile(join(configDir, 'settings.json'), 'utf8')) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/** The ref part of a `github:owner/repo@ref` style source, or null. */
function sourceRef(source: string): string | null {
  const at = source.lastIndexOf('@');
  return at > 0 ? source.slice(at + 1) || null : null;
}

/** Looks at the installed PeerBand plugin and reports everything that would stop the Relay tab from working as intended. */
export async function checkHerdrPlugin(ctx: Ctx): Promise<PluginCheck> {
  const version = await ctx.runHerdr(['--version'], { timeoutMs: 10_000 });
  if (version.notFound) return { found: false, herdrVersion: null, installed: false, source: null, problems: [] };
  const herdrV = version.code === 0 ? herdrVersion(`${version.stdout} ${version.stderr}`) : null;
  const listed = await pluginInstalled(ctx);
  if (listed.detail) return { found: true, herdrVersion: herdrV, installed: false, source: null, detail: listed.detail, problems: [] };
  if (!listed.installed) {
    return { found: true, herdrVersion: herdrV, installed: false, source: null, problems: [{ code: 'not-installed', message: 'The PeerBand plugin is not installed in Herdr.' }] };
  }

  const problems: PluginProblem[] = [];
  const source = listed.source;
  const override = Boolean(ctx.env.PEERBAND_HERDR_SOURCE);
  if (source?.startsWith('local:')) {
    if (!override) problems.push({ code: 'local-source', message: `The plugin is linked to a local checkout (${source.slice('local:'.length)}), not the v${ctx.version} release.` });
  } else if (source !== null && !override) {
    const expected = ctx.env.PEERBAND_HERDR_REF || `v${ctx.version}`;
    const ref = sourceRef(source);
    if (ref !== expected) {
      problems.push({ code: 'version-mismatch', message: `The plugin is ${ref ? `at ${ref}` : 'not pinned to a version'}, but this CLI is ${expected}.` });
    }
  } else if (source !== null && ctx.env.PEERBAND_HERDR_REF) {
    const ref = sourceRef(source);
    if (ref !== ctx.env.PEERBAND_HERDR_REF) problems.push({ code: 'version-mismatch', message: `The plugin is at ${ref ?? 'no ref'}, but PEERBAND_HERDR_REF is ${ctx.env.PEERBAND_HERDR_REF}.` });
  }

  const settings = await readSettings(ctx);
  const current = configHome({ env: ctx.env });
  const fallback = configHome({ env: { ...ctx.env, PEERBAND_CONFIG_HOME: undefined } });
  const recorded = settings && typeof settings.configHome === 'string' && settings.configHome ? settings.configHome : fallback;
  if (settings && canonicalConfig(recorded) !== canonicalConfig(current)) {
    const shown = typeof settings.configHome === 'string' && settings.configHome ? settings.configHome : `${fallback} (default)`;
    problems.push({ code: 'config-home', message: `The plugin uses the config directory ${shown}, but this CLI uses ${current}.` });
  }
  const nodePath = settings?.nodePath;
  if (typeof nodePath !== 'string' || !nodePath) {
    problems.push({ code: 'node-path', message: 'The plugin settings do not record a Node.js path.' });
  } else if (!(await isFile(nodePath))) {
    problems.push({ code: 'node-path', message: `The Node.js recorded in the plugin settings no longer exists (${nodePath}).` });
  }
  return { found: true, herdrVersion: herdrV, installed: true, source, problems };
}

/** Short, human summary of the problems for a prompt or an error message. */
export function describeProblems(check: PluginCheck): string {
  return check.problems.map((problem) => problem.message).join(' ');
}
