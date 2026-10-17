import { execFile } from 'node:child_process';
import type { HerdrResult, HerdrRunner } from './types.js';

/** `HERDR_BIN_PATH`, else `herdr` on PATH (`herdr.exe` on Windows; no shell, no .cmd shims). */
export function herdrBinary(env: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform): string {
  return env.HERDR_BIN_PATH || (platform === 'win32' ? 'herdr.exe' : 'herdr');
}

/** Real runner. Tests inject a fake `HerdrRunner` through the CLI context instead. */
export function createHerdrRunner(env: NodeJS.ProcessEnv): HerdrRunner {
  return (args, options) =>
    new Promise<HerdrResult>((resolve) => {
      execFile(
        herdrBinary(env),
        args,
        { env, timeout: options?.timeoutMs ?? 60_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024, shell: false },
        (error, stdout, stderr) => {
          if (!error) return resolve({ code: 0, stdout, stderr });
          const failure = error as NodeJS.ErrnoException & { killed?: boolean };
          if (failure.code === 'ENOENT') return resolve({ code: 127, stdout: '', stderr: failure.message, notFound: true });
          const code = typeof failure.code === 'number' ? failure.code : 1;
          resolve({ code, stdout: stdout ?? '', stderr: stderr || (failure.killed ? 'timed out' : failure.message) });
        },
      );
    });
}

export const NOT_FOUND_MESSAGE = 'Herdr was not found.';
export const NOT_FOUND_HINT = 'Install Herdr, put it on PATH, or set HERDR_BIN_PATH to its executable.';

/** One-line, control-character-free summary of a failed herdr invocation. */
export function failureDetail(result: HerdrResult): string {
  const text = (result.stderr || result.stdout || `exit code ${result.code}`).trim();
  let detail = text;
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string }; message?: string };
    detail = parsed.error?.message || parsed.message || text;
  } catch {
    /* plain text */
  }
  return detail.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').trim().slice(0, 400);
}
