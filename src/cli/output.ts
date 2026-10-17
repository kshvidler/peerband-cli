import type { WritableLike } from './types.js';

export interface Style {
  enabled: boolean;
  bold(text: string): string;
  dim(text: string): string;
  red(text: string): string;
  green(text: string): string;
  yellow(text: string): string;
  cyan(text: string): string;
}

/** FORCE_COLOR wins, then NO_COLOR, then "is this a color-capable TTY". */
export function colorEnabled(stream: WritableLike, env: NodeJS.ProcessEnv): boolean {
  const force = env.FORCE_COLOR;
  if (force !== undefined && force !== '') return force !== '0' && force.toLowerCase() !== 'false';
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return false;
  return Boolean(stream.isTTY) && env.TERM !== 'dumb';
}

export function makeStyle(enabled: boolean): Style {
  const wrap = (open: number, close: number) => (text: string) => (enabled ? `\u001b[${open}m${text}\u001b[${close}m` : text);
  return {
    enabled,
    bold: wrap(1, 22),
    dim: wrap(2, 22),
    red: wrap(31, 39),
    green: wrap(32, 39),
    yellow: wrap(33, 39),
    cyan: wrap(36, 39),
  };
}

/** Strips control characters so server- or runtime-provided text cannot inject escape sequences. */
export const sanitize = (text: string): string => text.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');

export class Output {
  readonly stdout: Style;
  readonly stderr: Style;
  constructor(
    private readonly outStream: WritableLike,
    private readonly errStream: WritableLike,
    env: NodeJS.ProcessEnv,
  ) {
    this.stdout = makeStyle(colorEnabled(outStream, env));
    this.stderr = makeStyle(colorEnabled(errStream, env));
  }
  print(line = ''): void {
    this.outStream.write(`${line}\n`);
  }
  warn(line = ''): void {
    this.errStream.write(`${line}\n`);
  }
  /** `peerband: <message>` plus a `Next:` line, on stderr. */
  fail(message: string, hint?: string): void {
    const s = this.stderr;
    this.warn(`${s.bold(s.red('peerband:'))} ${message}`);
    if (hint) this.warn(`${s.dim('Next:')} ${hint}`);
  }
}

export const symbols = { ok: '✓', dot: '●', ring: '○', warn: '!', fail: '✗' };
