import { spawn, type ChildProcess } from 'node:child_process';
import type { ExecRunner, HerdrResult } from './types.js';

const SAFE_ARG = /^[\w@./:\\=+~-]+$/;

/** Quotes one argument for cmd.exe. Only plain arguments are accepted, so nothing can be injected. */
function cmdQuote(arg: string): string {
  if (SAFE_ARG.test(arg)) return arg;
  if (/["%^&|<>!\r\n]/.test(arg)) throw new Error(`Refusing to pass an unsafe argument to the shell: ${arg}`);
  return `"${arg}"`;
}

/**
 * Real process runner. A bare command name on Windows (`npm`) is a .cmd shim that Node can only start through
 * cmd.exe, so it runs through the shell with every argument checked and quoted; everything else runs directly.
 */
export const execProgram: ExecRunner = (file, args, options = {}) =>
  new Promise<HerdrResult>((resolve) => {
    const viaShell = process.platform === 'win32' && !/[\\/]/.test(file) && !/\.exe$/i.test(file);
    let child: ChildProcess;
    try {
      child = viaShell
        ? spawn([file, ...args].map(cmdQuote).join(' '), { shell: true, env: options.env ?? process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
        : spawn(file, args, { env: options.env ?? process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    } catch (error) {
      resolve({ code: 1, stdout: '', stderr: (error as Error).message });
      return;
    }
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (result: HerdrResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({ code: 1, stdout, stderr: `${stderr}\ntimed out` });
    }, options.timeoutMs ?? 300_000);
    child.stdout!.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
      options.onStdout?.(chunk);
    });
    child.stderr!.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk;
      options.onStderr?.(chunk);
    });
    child.once('error', (error: NodeJS.ErrnoException) => finish({ code: 127, stdout, stderr: error.message, notFound: error.code === 'ENOENT' }));
    child.once('close', (code) => {
      // cmd.exe reports a missing command as exit code 9009.
      if (viaShell && code === 9009) return finish({ code: 127, stdout, stderr: stderr || `${file} was not found`, notFound: true });
      finish({ code: code ?? 1, stdout, stderr });
    });
  });
