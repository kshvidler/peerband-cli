// Replacing the PeerBand plugin in Herdr without ever leaving the user with no plugin.
import { failureDetail } from './herdr-bin.js';
import { CliError, type Ctx, type HerdrResult } from './types.js';
import { pluginInstalled } from './commands/herdr-check.js';

export const PLUGIN_ID = 'peerband';

export type PluginTarget = { kind: 'local'; dir: string } | { kind: 'github'; source: string; ref: string };

/** Windows reports files held open by a running process as os error 32 (sharing violation) or 5 (access denied). */
export const RETRYABLE = /os error (?:5|32|33)\b|code: (?:5|32|33)\b|being used by another process|\bEBUSY\b|\bEPERM\b|\bEACCES\b|access is denied|resource busy|text file busy|directory not empty/i;
/** Herdr versions that refuse to install over an existing plugin say so. */
export const ALREADY_INSTALLED = /already (?:installed|exists|registered)|exists already/i;
export const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];

/** `github:owner/repo@ref` or `local:/dir` (as `herdr plugin list` prints it) as an install target. */
export function parseSource(source: string | null): PluginTarget | null {
  if (!source) return null;
  if (source.startsWith('local:')) return { kind: 'local', dir: source.slice('local:'.length) };
  const match = /^(?:github:)?([^@\s]+\/[^@\s]+)@([^@\s]+)$/.exec(source);
  return match ? { kind: 'github', source: match[1]!, ref: match[2]! } : null;
}

export function describeTarget(target: PluginTarget): string {
  return target.kind === 'local' ? `local checkout ${target.dir}` : `${target.source} @ ${target.ref}`;
}

export function installCommand(target: PluginTarget): string {
  return target.kind === 'local' ? `herdr plugin link ${target.dir}` : `herdr plugin install ${target.source} --ref ${target.ref} --yes`;
}

async function herdrRetrying(ctx: Ctx, args: string[], timeoutMs: number): Promise<HerdrResult> {
  const sleep = ctx.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let result = await ctx.runHerdr(args, { timeoutMs });
  for (const delay of RETRY_DELAYS_MS) {
    if (result.code === 0 || result.notFound || !RETRYABLE.test(failureDetail(result))) return result;
    ctx.out.print(ctx.out.stdout.dim(`Herdr reports the plugin files are still in use; retrying in ${delay / 1000}s…`));
    await sleep(delay);
    result = await ctx.runHerdr(args, { timeoutMs });
  }
  return result;
}

export function putPlugin(ctx: Ctx, target: PluginTarget): Promise<HerdrResult> {
  return target.kind === 'local'
    ? herdrRetrying(ctx, ['plugin', 'link', target.dir], 60_000)
    : herdrRetrying(ctx, ['plugin', 'install', target.source, '--ref', target.ref, '--yes'], 180_000);
}

/** Removes the plugin whether it was installed or linked. */
export async function removePlugin(ctx: Ctx): Promise<{ removed: boolean; detail: string }> {
  const uninstall = await herdrRetrying(ctx, ['plugin', 'uninstall', PLUGIN_ID], 60_000);
  if (uninstall.code === 0) return { removed: true, detail: '' };
  const unlink = await herdrRetrying(ctx, ['plugin', 'unlink', PLUGIN_ID], 60_000);
  if (unlink.code === 0) return { removed: true, detail: '' };
  return { removed: false, detail: failureDetail(uninstall) };
}

/** Thrown when the new plugin could not be installed. `restored` tells whether the previous plugin is back. */
export class ReplaceError extends CliError {
  readonly restored: boolean;
  constructor(message: string, hint: string, restored: boolean) {
    super(message, hint);
    this.restored = restored;
  }
}

async function rollback(ctx: Ctx, previous: PluginTarget | null, target: PluginTarget, detail: string): Promise<never> {
  const check = target.kind === 'github'
    ? `Check that ${target.source} at ref ${target.ref} exists and that you are online (override with PEERBAND_HERDR_SOURCE or PEERBAND_HERDR_REF). `
    : 'Check that the directory is a peerband-cli checkout containing herdr-plugin.toml. ';
  const retry = `${check}Close every PeerBand Relay tab and retry \`peerband herdr install\`; if it keeps failing, run \`${installCommand(target)}\` yourself.`;
  if (!previous) throw new ReplaceError(`Installing the PeerBand plugin (${describeTarget(target)}) failed: ${detail}`, retry, false);
  ctx.out.print(ctx.out.stdout.dim(`Installing ${describeTarget(target)} failed; restoring the previous plugin (${describeTarget(previous)}).`));
  const restored = await putPlugin(ctx, previous);
  if (restored.code === 0 && (await pluginInstalled(ctx)).installed) {
    throw new ReplaceError(`Installing the PeerBand plugin (${describeTarget(target)}) failed: ${detail}. The previous plugin (${describeTarget(previous)}) was restored.`, retry, true);
  }
  throw new ReplaceError(
    `Installing the PeerBand plugin (${describeTarget(target)}) failed: ${detail}. Restoring the previous plugin failed too: ${failureDetail(restored)}. Herdr has no PeerBand plugin right now.`,
    `Close every PeerBand Relay tab, then run \`${installCommand(target)}\` (or \`${installCommand(previous)}\` for the previous version), then \`peerband herdr install\`.`,
    false,
  );
}

/**
 * Puts `target` in place of the currently installed plugin (`previousSource` as listed, or null when none).
 * The caller stops everything that holds the old plugin's files first. Order of preference:
 *  1. install over the existing release in place (Herdr keeps the old copy until the new one is registered);
 *  2. if Herdr refuses that, or the old plugin is a linked checkout, remove it and install, and on failure
 *     reinstall the previous source so the user is never left without a plugin.
 * Busy/locked-file failures (Windows os error 32) are retried with backoff at every step.
 */
export async function replacePlugin(ctx: Ctx, previousSource: string | null, installed: boolean, target: PluginTarget): Promise<void> {
  const previous = installed ? parseSource(previousSource) : null;
  if (!installed) {
    const result = await putPlugin(ctx, target);
    if (result.code !== 0) await rollback(ctx, null, target, failureDetail(result));
    return;
  }
  if (target.kind === 'github' && previous?.kind !== 'local') {
    const result = await putPlugin(ctx, target);
    if (result.code === 0) return;
    const detail = failureDetail(result);
    if (!ALREADY_INSTALLED.test(detail)) {
      if ((await pluginInstalled(ctx)).installed) {
        throw new ReplaceError(
          `Installing the PeerBand plugin (${describeTarget(target)}) failed: ${detail}. The previous plugin${previousSource ? ` (${previousSource})` : ''} is still installed.`,
          `Check that ${target.source} at ref ${target.ref} exists and that you are online. Override with PEERBAND_HERDR_SOURCE or PEERBAND_HERDR_REF.`,
          true,
        );
      }
      await rollback(ctx, previous, target, detail);
    }
  }
  const removed = await removePlugin(ctx);
  if (!removed.removed) {
    throw new ReplaceError(`Could not replace the existing PeerBand plugin: ${removed.detail}`, `Close every PeerBand Relay tab, run \`herdr plugin uninstall ${PLUGIN_ID}\` yourself, then retry.`, true);
  }
  const result = await putPlugin(ctx, target);
  if (result.code !== 0) await rollback(ctx, previous, target, failureDetail(result));
}
