import type { Output } from './output.js';

export interface WritableLike {
  write(chunk: string): unknown;
  isTTY?: boolean;
  columns?: number;
}

export interface ReadableLike {
  isTTY?: boolean;
  setRawMode?(mode: boolean): unknown;
  resume(): unknown;
  pause(): unknown;
  on(event: 'data', listener: (chunk: Buffer | string) => void): unknown;
  off(event: 'data', listener: (chunk: Buffer | string) => void): unknown;
}

export interface HerdrResult {
  code: number;
  stdout: string;
  stderr: string;
  /** True when the herdr executable could not be started at all. */
  notFound?: boolean;
}
export type HerdrRunner = (args: string[], options?: { timeoutMs?: number }) => Promise<HerdrResult>;

export interface Ctx {
  env: NodeJS.ProcessEnv;
  stdin: ReadableLike;
  stdout: WritableLike;
  stderr: WritableLike;
  fetch: typeof fetch;
  runHerdr: HerdrRunner;
  /** Test seam for `peerband relay`; defaults to the shared herdr/relay-tab.mjs implementation. */
  openRelayTab?: () => Promise<string>;
  /** Test seams for `peerband login`: browser launcher, sleep, clock and a cancellation signal (Ctrl+C). */
  openBrowser?: (url: string) => Promise<boolean>;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
  signal?: AbortSignal;
  out: Output;
  version: string;
}

export interface OptionSpec {
  name: string;
  short?: string;
  type: 'string' | 'boolean';
  valueName?: string;
  description: string;
  hidden?: boolean;
}

export interface Parsed {
  values: Record<string, string | boolean | undefined>;
  positionals: string[];
}

export interface CommandSpec {
  /** Full name, e.g. "login" or "herdr install". */
  name: string;
  summary: string;
  usage: string;
  description: string;
  options: OptionSpec[];
  examples: Array<[command: string, comment: string]>;
  notes?: string[];
  positionals?: { name: string; max: number };
  run(parsed: Parsed, ctx: Ctx): Promise<number>;
}

/** Bad command line. Exit code 2. */
export class UsageError extends Error {
  readonly hint?: string;
  constructor(message: string, hint?: string) {
    super(message);
    this.name = 'UsageError';
    this.hint = hint;
  }
}

/** Runtime failure with a next step. Exit code 1 (or `code`). */
export class CliError extends Error {
  readonly hint?: string;
  readonly code: number;
  constructor(message: string, hint?: string, code = 1) {
    super(message);
    this.name = 'CliError';
    this.hint = hint;
    this.code = code;
  }
}

export const EXIT_NOT_LOGGED_IN = 3;
