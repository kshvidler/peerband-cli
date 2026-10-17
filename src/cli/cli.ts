import { ConfigError } from '../core/index.js';
import { parseArgs, suggest } from './args.js';
import { createHerdrRunner } from './herdr-bin.js';
import { commandHelp, herdrGroupHelp, rootHelp } from './help.js';
import { Output } from './output.js';
import { PromptAborted } from './prompt.js';
import { herdrCommands, lookup, topLevelNames } from './registry.js';
import { CliError, type Ctx, UsageError } from './types.js';

export const VERSION = typeof __PEERBAND_VERSION__ === 'string' ? __PEERBAND_VERSION__ : '0.0.0-dev';

/** Builds a context from the real process; tests pass overrides. */
export function createContext(overrides: Partial<Omit<Ctx, 'out'>> = {}): Ctx {
  const env = overrides.env ?? process.env;
  const stdout = overrides.stdout ?? process.stdout;
  const stderr = overrides.stderr ?? process.stderr;
  return {
    env,
    stdin: process.stdin,
    stdout,
    stderr,
    fetch: globalThis.fetch,
    runHerdr: createHerdrRunner(env),
    version: VERSION,
    ...overrides,
    out: new Output(stdout, stderr, env),
  };
}

function resolveHelpTarget(words: string[], ctx: Ctx): string {
  const s = ctx.out.stdout;
  if (words.length === 0) return rootHelp(s, ctx.version);
  if (words[0] === 'herdr' && words.length === 1) return herdrGroupHelp(s);
  const spec = lookup(words);
  if (!spec) throw unknownCommand(words.join(' '));
  return commandHelp(s, spec);
}

function unknownCommand(name: string): UsageError {
  const near = suggest(name, topLevelNames());
  return new UsageError(`Unknown command "${name}".`, near ? `Did you mean \`peerband ${near}\`? Run \`peerband --help\` for all commands.` : 'Run `peerband --help` for all commands.');
}

/** Runs one CLI invocation and returns its exit code. Never throws. */
export async function run(argv: string[], ctx: Ctx = createContext()): Promise<number> {
  try {
    const [first, ...rest] = argv;
    if (first === undefined) {
      ctx.out.print(rootHelp(ctx.out.stdout, ctx.version).trimEnd());
      return 0;
    }
    if (first === '--version' || first === '-v') {
      ctx.out.print(ctx.version);
      return 0;
    }
    if (first === '--help' || first === '-h') {
      ctx.out.print(rootHelp(ctx.out.stdout, ctx.version).trimEnd());
      return 0;
    }
    if (first === 'help') {
      ctx.out.print(resolveHelpTarget(rest.filter((word) => !word.startsWith('-')), ctx).trimEnd());
      return 0;
    }
    if (first.startsWith('-')) {
      throw new UsageError(`Unknown option ${first}.`, 'Run `peerband --help` for usage.');
    }
    let words = [first];
    let args = rest;
    if (first === 'herdr') {
      const [second, ...others] = rest;
      if (second === undefined || second === '--help' || second === '-h') {
        ctx.out.print(herdrGroupHelp(ctx.out.stdout).trimEnd());
        return 0;
      }
      if (!herdrCommands.some((command) => command.name === `herdr ${second}`)) {
        const near = suggest(second, herdrCommands.map((command) => command.name.slice(6)));
        throw new UsageError(`Unknown command "herdr ${second}".`, near ? `Did you mean \`peerband herdr ${near}\`?` : 'Use `peerband herdr install` or `peerband herdr uninstall`.');
      }
      words = [first, second];
      args = others;
    }
    const spec = lookup(words);
    if (!spec) throw unknownCommand(first);
    const parsed = parseArgs(spec, args);
    if (parsed.values.help) {
      ctx.out.print(commandHelp(ctx.out.stdout, spec).trimEnd());
      return 0;
    }
    return await spec.run(parsed, ctx);
  } catch (error) {
    if (error instanceof UsageError) {
      ctx.out.fail(error.message, error.hint);
      return 2;
    }
    if (error instanceof CliError) {
      ctx.out.fail(error.message, error.hint);
      return error.code;
    }
    if (error instanceof ConfigError) {
      ctx.out.fail(error.message, error.hint);
      return 1;
    }
    if (error instanceof PromptAborted) return 130;
    ctx.out.fail((error as Error)?.message || String(error));
    return 1;
  }
}
