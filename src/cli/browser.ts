import { spawn } from 'node:child_process';

export type BrowserSkipReason = 'flag' | 'ssh' | 'not-a-tty' | 'no-display' | 'unsafe-url';

export interface BrowserDecision {
  open: boolean;
  reason?: BrowserSkipReason;
}

export interface BrowserContext {
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  stdoutIsTTY: boolean;
  noBrowser: boolean;
}

/** Decides whether to try opening a local browser. Remote shells, pipes and headless Linux never do. */
export function browserDecision(url: string, context: BrowserContext): BrowserDecision {
  if (context.noBrowser) return { open: false, reason: 'flag' };
  if (context.env.SSH_CONNECTION || context.env.SSH_TTY || context.env.SSH_CLIENT) return { open: false, reason: 'ssh' };
  if (!context.stdoutIsTTY) return { open: false, reason: 'not-a-tty' };
  if (context.platform === 'linux' && !context.env.DISPLAY && !context.env.WAYLAND_DISPLAY) return { open: false, reason: 'no-display' };
  // Only ever hand http(s) URLs to the OS opener; a server must not be able to launch other handlers.
  try {
    if (!/^https?:$/.test(new URL(url).protocol)) return { open: false, reason: 'unsafe-url' };
  } catch {
    return { open: false, reason: 'unsafe-url' };
  }
  return { open: true };
}

/** The opener command for a platform. No shell is involved, so the URL is never parsed by one. */
export function openerCommand(platform: NodeJS.Platform, url: string): { command: string; args: string[] } {
  if (platform === 'darwin') return { command: 'open', args: [url] };
  if (platform === 'win32') return { command: 'rundll32', args: ['url.dll,FileProtocolHandler', url] };
  return { command: 'xdg-open', args: [url] };
}

/** Launches the default browser, detached. Resolves false if the opener could not be started. */
export function openBrowser(url: string, platform: NodeJS.Platform = process.platform): Promise<boolean> {
  const { command, args } = openerCommand(platform, url);
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true, shell: false });
      child.once('error', () => resolve(false));
      child.once('spawn', () => {
        child.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}
