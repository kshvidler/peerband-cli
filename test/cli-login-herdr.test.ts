import { afterEach, describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { loadCredentials } from '../src/core/index.js';
import type { ReadableLike } from '../src/cli/types.js';
import { cleanupAll, fakeHerdr, runCli, tempDir } from './cli-helpers.js';
import { pluginFor, TEST_VERSION } from './cli-plugin-helpers.js';

afterEach(cleanupAll);

const granted = { installation_id: 'inst-1', credential: 'secret-credential', machine_name: 'work-box', account_email: 'me@example.com' };
const redeem = (async () => new Response(JSON.stringify(granted), { status: 200 })) as unknown as typeof fetch;

function pluginHerdr(configDir: string, options: { installed?: boolean; failInstall?: boolean } = {}) {
  let installed = options.installed ?? false;
  return fakeHerdr((args) => {
    const command = args.slice(0, 2).join(' ');
    if (command === 'plugin list') return { stdout: installed ? '- peerband (PeerBand) enabled [local:/x]\n' : '- other (Other) enabled [local:/y]\n' };
    if (command === 'plugin install') {
      if (options.failInstall) return { code: 1, stderr: 'ref v9 not found' };
      installed = true;
    }
    if (command === 'plugin config-dir') return { stdout: `${configDir}\n` };
    return undefined;
  });
}

const installCalls = (calls: string[][]) => calls.filter((call) => call[0] === 'plugin' && call[1] === 'install');

async function login(extra: string[], herdr?: ReturnType<typeof fakeHerdr>, options: { tty?: boolean; stdin?: ReadableLike } = {}) {
  const home = await tempDir();
  const result = await runCli(['login', '--grant', 'GRANT-1', ...extra], {
    env: { PEERBAND_CONFIG_HOME: home },
    tty: options.tty,
    overrides: { fetch: redeem, ...(herdr ? { runHerdr: herdr.run } : {}), ...(options.stdin ? { stdin: options.stdin } : {}) },
  });
  const plain = (text: string) => text.replace(/\u001b\[[0-9;]*m/g, '');
  return { ...result, stdout: plain(result.stdout), stderr: plain(result.stderr), home };
}

function fakeStdin(answer: string): ReadableLike & { isTTY: boolean } {
  const emitter = new EventEmitter();
  return {
    isTTY: true,
    resume() {
      setImmediate(() => emitter.emit('data', answer));
    },
    pause() {},
    on: (event, listener) => emitter.on(event, listener),
    off: (event, listener) => emitter.off(event, listener),
  };
}

describe('peerband login: Herdr setup', () => {
  it('prints guidance and exits 0 when Herdr is not found', async () => {
    const r = await login([]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Logged in as work-box');
    expect(r.stdout).toContain('Herdr was not found. The PeerBand Relay tab needs Herdr 0.9.3 or newer.');
    expect(r.stdout).toContain('https://herdr.dev');
    expect(r.stdout).toMatch(/peerband herdr install\s+then\s+peerband relay/);
    expect((await loadCredentials(join(r.home, 'credentials.json'))).installationId).toBe('inst-1');
  });

  it('only suggests peerband relay when the plugin is already installed', async () => {
    const home = await tempDir();
    const { herdr } = await pluginFor(home);
    const result = await runCli(['login', '--grant', 'GRANT-1'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { fetch: redeem, runHerdr: herdr.run, version: TEST_VERSION } });
    const r = { ...result, stdout: result.stdout.replace(/\u001b\[[0-9;]*m/g, '') };
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Next: peerband relay');
    expect(r.stdout).not.toContain('herdr install');
    expect(installCalls(herdr.calls)).toEqual([]);
  });

  it('installs the plugin with --herdr-plugin install', async () => {
    const configDir = join(await tempDir(), 'cfg');
    const herdr = pluginHerdr(configDir);
    const r = await login(['--herdr-plugin', 'install'], herdr);
    expect(r.code).toBe(0);
    expect(installCalls(herdr.calls)).toHaveLength(1);
    expect(r.stdout).toContain('Installed the PeerBand plugin');
    expect(r.stdout).toContain('Next: peerband relay');
    expect(r.stdout + r.stderr).not.toContain('GRANT-1');
    expect(r.stdout + r.stderr).not.toContain('secret-credential');
  });

  it('with --herdr-plugin skip only prints the manual command', async () => {
    const herdr = pluginHerdr('unused');
    const r = await login(['--herdr-plugin', 'skip'], herdr, { tty: true });
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Next: peerband herdr install\s+then\s+peerband relay/);
    expect(installCalls(herdr.calls)).toEqual([]);
  });

  it('in ask mode without a TTY does not prompt or install', async () => {
    const herdr = pluginHerdr('unused');
    const r = await login([], herdr);
    expect(r.code).toBe(0);
    expect(r.stderr).not.toContain('[Y/n]');
    expect(r.stdout).toMatch(/Next: peerband herdr install\s+then\s+peerband relay/);
    expect(installCalls(herdr.calls)).toEqual([]);
  });

  it('in ask mode on a TTY installs on an empty answer (default yes)', async () => {
    const configDir = join(await tempDir(), 'cfg');
    const herdr = pluginHerdr(configDir);
    const r = await login([], herdr, { tty: true, stdin: fakeStdin('\n') });
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('Add the PeerBand plugin to Herdr now? [Y/n]');
    expect(installCalls(herdr.calls)).toHaveLength(1);
    expect(r.stdout).toContain('Next: peerband relay');
  });

  it('in ask mode on a TTY does not install when answering no', async () => {
    const herdr = pluginHerdr('unused');
    const r = await login([], herdr, { tty: true, stdin: fakeStdin('n\n') });
    expect(r.code).toBe(0);
    expect(installCalls(herdr.calls)).toEqual([]);
    expect(r.stdout).toContain('peerband herdr install');
  });

  it('keeps exit 0 and the credential when the plugin install fails', async () => {
    const herdr = pluginHerdr('unused', { failInstall: true });
    const r = await login(['--herdr-plugin', 'install'], herdr);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('Could not add the PeerBand plugin to Herdr');
    expect(r.stdout).toContain('peerband herdr install');
    expect((await loadCredentials(join(r.home, 'credentials.json'))).installationId).toBe('inst-1');
  });

  it('rejects an invalid --herdr-plugin value before logging in', async () => {
    const r = await login(['--herdr-plugin', 'maybe']);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('--herdr-plugin');
  });
});
