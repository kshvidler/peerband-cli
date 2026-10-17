import { type CommandSpec, type OptionSpec, type Parsed, UsageError } from './types.js';

export function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const saved = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[b.length]!;
}

/** Closest candidate within a small edit distance (or sharing a prefix), if any. */
export function suggest(input: string, candidates: string[]): string | undefined {
  let best: { name: string; score: number } | undefined;
  for (const name of candidates) {
    const score = input && (name.startsWith(input) || input.startsWith(name)) ? 1 : distance(input, name);
    if (score <= Math.max(2, Math.floor(name.length / 3)) && (!best || score < best.score)) best = { name, score };
  }
  return best?.name;
}

export const HELP_OPTION: OptionSpec = { name: 'help', short: 'h', type: 'boolean', description: 'Show help for this command.' };

/** Hand-written parser: --name value, --name=value, -h, `--` terminator. Unknown options are usage errors. */
export function parseArgs(spec: Pick<CommandSpec, 'name' | 'options' | 'positionals'>, argv: string[]): Parsed {
  const options = [...spec.options, HELP_OPTION];
  const values: Parsed['values'] = {};
  const positionals: string[] = [];
  const helpHint = `Run \`peerband ${spec.name} --help\` for usage.`;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (!arg.startsWith('-') || arg === '-') {
      positionals.push(arg);
      continue;
    }
    let option: OptionSpec | undefined;
    let inline: string | undefined;
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
      inline = eq === -1 ? undefined : arg.slice(eq + 1);
      option = options.find((candidate) => candidate.name === name);
      if (!option) {
        const near = suggest(name, options.filter((o) => !o.hidden).map((o) => o.name));
        throw new UsageError(`Unknown option --${name} for \`peerband ${spec.name}\`.`, near ? `Did you mean --${near}? ${helpHint}` : helpHint);
      }
    } else {
      option = options.find((candidate) => candidate.short === arg.slice(1));
      if (!option) throw new UsageError(`Unknown option ${arg} for \`peerband ${spec.name}\`.`, helpHint);
    }
    if (option.type === 'boolean') {
      if (inline !== undefined) throw new UsageError(`Option --${option.name} does not take a value.`, helpHint);
      values[option.name] = true;
      continue;
    }
    let value = inline;
    if (value === undefined) {
      const next = argv[i + 1];
      if (next === undefined || (next.startsWith('-') && next !== '-')) {
        throw new UsageError(`Option --${option.name} needs a value (${option.valueName ?? 'VALUE'}).`, helpHint);
      }
      value = next;
      i++;
    }
    values[option.name] = value;
  }
  const max = spec.positionals?.max ?? 0;
  if (positionals.length > max) {
    throw new UsageError(`Unexpected argument "${positionals[max]}" for \`peerband ${spec.name}\`.`, helpHint);
  }
  return { values, positionals };
}

export const str = (parsed: Parsed, name: string): string | undefined => {
  const value = parsed.values[name];
  return typeof value === 'string' ? value : undefined;
};
export const flag = (parsed: Parsed, name: string): boolean => parsed.values[name] === true;
