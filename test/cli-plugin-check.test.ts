import { afterEach, describe, expect, it } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { saveCredentials } from '../src/core/index.js';
import { cleanupAll, runCli, tempDir } from './cli-helpers.js';
import { fakeStdin, pluginFor, releaseSource, TEST_VERSION, writePluginSettings } from './cli-plugin-helpers.js';

afterEach(cleanupAll);

const plain = (text: string) => text.replace(/\u001b\[[0-9;]*m/g, '');

async function loggedInHome(): Promise<string> {
  const home = await tempDir();
  await saveCredentials({ serverUrl: 'https://peerband.com', installationId: 'inst-9', credential: 'c', machineName: 'box', accountEmail: 'me@example.com' }, join(home, 'credentials.json'));
  return home;
}

async function statusJson(home: string, herdr: { run: never }, env: NodeJS.ProcessEnv = {}) {
  const result = await runCli(['status', '--json'], { env: { PEERBAND_CONFIG_HOME: home, ...env }, overrides: { runHerdr: herdr.run, version: TEST_VERSION } });
  return JSON.parse(result.stdout) as { herdr: { pluginInstalled: boolean; pluginSource: string | null; pluginProblems: Array<{ code: string; message: string }> } };
}

describe('plugin check in peerband status', () => {
  it('reports a healthy release install with its source and no problems', async () => {
    const home = await loggedInHome();
    const { herdr } = await pluginFor(home);
    const report = await statusJson(home, herdr as never);
    expect(report.herdr).toMatchObject({ pluginInstalled: true, pluginSource: releaseSource(), pluginProblems: [] });
    const human = await runCli(['status'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { runHerdr: herdr.run, version: TEST_VERSION } });
    expect(human.stdout).toMatch(new RegExp(`Plugin\\s+✓ ${releaseSource().replace(/[.@/]/g, '\\$&')}`));
  });

  it('treats a missing plugin as not-installed', async () => {
    const home = await loggedInHome();
    const { herdr } = await pluginFor(home, null);
    const report = await statusJson(home, herdr as never);
    expect(report.herdr.pluginInstalled).toBe(false);
    expect(report.herdr.pluginProblems.map((p) => p.code)).toEqual(['not-installed']);
  });

  it('flags a local checkout unless PEERBAND_HERDR_SOURCE is set', async () => {
    const home = await loggedInHome();
    const { herdr } = await pluginFor(home, 'local:/work/peerband-cli');
    const report = await statusJson(home, herdr as never);
    expect(report.herdr.pluginSource).toBe('local:/work/peerband-cli');
    expect(report.herdr.pluginProblems.map((p) => p.code)).toEqual(['local-source']);
    expect(report.herdr.pluginProblems[0]!.message).toContain('/work/peerband-cli');
    const human = await runCli(['status'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { runHerdr: herdr.run, version: TEST_VERSION } });
    expect(human.stdout).toMatch(/^Plugin\s+[!⚠] The plugin is linked/m);
    expect(human.stdout).toContain('local checkout');
    expect(human.stdout).toContain('peerband herdr install');
    const dev = await statusJson(home, herdr as never, { PEERBAND_HERDR_SOURCE: './peerband-cli' });
    expect(dev.herdr.pluginProblems).toEqual([]);
  });

  it('flags an installed ref that differs from this CLI version', async () => {
    const home = await loggedInHome();
    const { herdr } = await pluginFor(home, 'github:kshvidler/peerband-cli@v0.1.0');
    const report = await statusJson(home, herdr as never);
    expect(report.herdr.pluginProblems.map((p) => p.code)).toEqual(['version-mismatch']);
    expect(report.herdr.pluginProblems[0]!.message).toContain('v0.1.0');
    expect(report.herdr.pluginProblems[0]!.message).toContain(`v${TEST_VERSION}`);
    const unpinned = await pluginFor(home, 'github:kshvidler/peerband-cli');
    expect((await statusJson(home, unpinned.herdr as never)).herdr.pluginProblems.map((p) => p.code)).toEqual(['version-mismatch']);
  });

  it('flags a settings configHome that differs from the one this CLI uses (normalised)', async () => {
    const home = await loggedInHome();
    const stale = await tempDir('old-test-config-');
    const wrong = await pluginFor(stale);
    const report = await statusJson(home, wrong.herdr as never);
    expect(report.herdr.pluginProblems.map((p) => p.code)).toEqual(['config-home']);
    expect(report.herdr.pluginProblems[0]!.message).toContain(stale);

    // The same folder spelled differently is not a mismatch.
    const spelled = await pluginFor(`${home}/`);
    expect((await statusJson(home, spelled.herdr as never)).herdr.pluginProblems).toEqual([]);
    if (process.platform === 'win32') {
      const upper = await pluginFor(home.toUpperCase());
      expect((await statusJson(home, upper.herdr as never)).herdr.pluginProblems).toEqual([]);
    }
  });

  it('treats a missing configHome as the default config directory', async () => {
    const home = await loggedInHome();
    const { configDir, herdr } = await pluginFor(home);
    await writePluginSettings(configDir, { nodePath: process.execPath });
    // The CLI uses an explicit config home, which is not the default: mismatch.
    expect((await statusJson(home, herdr as never)).herdr.pluginProblems.map((p) => p.code)).toEqual(['config-home']);
    // The CLI is on the default (isolated XDG/APPDATA home): fine.
    const base = await tempDir();
    const env = { PEERBAND_CONFIG_HOME: undefined, ...(process.platform === 'win32' ? { APPDATA: base } : { XDG_CONFIG_HOME: base }) };
    expect((await statusJson(home, herdr as never, env)).herdr.pluginProblems).toEqual([]);
  });

  it('flags a missing or nonexistent nodePath, and missing settings', async () => {
    const home = await loggedInHome();
    const { configDir, herdr } = await pluginFor(home);
    await writePluginSettings(configDir, { configHome: home });
    const missing = await statusJson(home, herdr as never);
    expect(missing.herdr.pluginProblems.map((p) => p.code)).toEqual(['node-path']);
    await writePluginSettings(configDir, { configHome: home, nodePath: join(home, 'no-such-node') });
    const gone = await statusJson(home, herdr as never);
    expect(gone.herdr.pluginProblems.map((p) => p.code)).toEqual(['node-path']);
    expect(gone.herdr.pluginProblems[0]!.message).toContain('no longer exists');
    await writeFile(join(configDir, 'settings.json'), 'not json');
    expect((await statusJson(home, herdr as never)).herdr.pluginProblems.map((p) => p.code)).toEqual(['node-path']);
  });

  it('reports every problem of the real incident (local checkout + stale config home)', async () => {
    const home = await loggedInHome();
    const { herdr } = await pluginFor(await tempDir('stale-'), 'local:/dev/peerband-cli');
    const report = await statusJson(home, herdr as never);
    expect(report.herdr.pluginProblems.map((p) => p.code)).toEqual(['local-source', 'config-home']);
  });
});

describe('peerband relay: plugin repair', () => {
  async function broken() {
    const home = await loggedInHome();
    const stale = await tempDir('old-test-config-');
    const plugin = await pluginFor(stale, 'local:/dev/peerband-cli');
    return { home, ...plugin };
  }

  it('without a terminal fails with the reasons and the fix, and does not open the tab', async () => {
    const { home, herdr } = await broken();
    let opened = 0;
    const result = await runCli(['relay'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { runHerdr: herdr.run, version: TEST_VERSION, openRelayTab: async () => (opened++, 'p') } });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('needs repair');
    expect(result.stderr).toContain('local checkout');
    expect(result.stderr).toContain('config directory');
    expect(result.stderr).toContain('Run `peerband herdr install`, then `peerband relay`.');
    expect(opened).toBe(0);
    expect(herdr.calls.some((call) => call[1] === 'install' || call[1] === 'link')).toBe(false);
  });

  it('on a terminal asks, repairs on yes (default), then opens the relay', async () => {
    const { home, herdr, configDir } = await broken();
    let opened = 0;
    const result = await runCli(['relay'], {
      env: { PEERBAND_CONFIG_HOME: home },
      tty: true,
      overrides: { runHerdr: herdr.run, version: TEST_VERSION, stdin: fakeStdin('\n'), openRelayTab: async () => (opened++, 'p') },
    });
    expect(result.code).toBe(0);
    expect(plain(result.stderr)).toContain('The PeerBand plugin in Herdr needs repair: The plugin is linked to a local checkout');
    expect(plain(result.stderr)).toContain('Repair the PeerBand plugin now? [Y/n]');
    expect(herdr.calls).toContainEqual(['plugin', 'install', 'kshvidler/peerband-cli', '--ref', `v${TEST_VERSION}`, '--yes']);
    expect(herdr.source()).toBe(releaseSource());
    expect(JSON.parse(await readFile(join(configDir, 'settings.json'), 'utf8'))).toMatchObject({ nodePath: process.execPath, configHome: home });
    expect(opened).toBe(1);
    expect(result.stdout).toContain('PeerBand Relay is open');
  });

  it('on a terminal exits non-zero without changing anything on no', async () => {
    const { home, herdr } = await broken();
    let opened = 0;
    const result = await runCli(['relay'], {
      env: { PEERBAND_CONFIG_HOME: home },
      tty: true,
      overrides: { runHerdr: herdr.run, version: TEST_VERSION, stdin: fakeStdin('n\n'), openRelayTab: async () => (opened++, 'p') },
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Run `peerband herdr install`, then `peerband relay`.');
    expect(opened).toBe(0);
    expect(herdr.source()).toBe('local:/dev/peerband-cli');
  });

  it('opens straight away when the plugin is healthy, and still reports a missing Herdr as before', async () => {
    const home = await loggedInHome();
    const { herdr } = await pluginFor(home);
    const ok = await runCli(['relay'], { env: { PEERBAND_CONFIG_HOME: home }, tty: true, overrides: { runHerdr: herdr.run, version: TEST_VERSION, openRelayTab: async () => 'p' } });
    expect(ok.code).toBe(0);
    expect(ok.stderr).not.toContain('[Y/n]');
    const missing = await runCli(['relay'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { openRelayTab: async () => { throw new Error('plugin pane open: Herdr was not found (herdr).'); } } });
    expect(missing.stderr).toContain('HERDR_BIN_PATH');
  });
});

describe('peerband login: plugin repair', () => {
  const granted = { installation_id: 'inst-1', credential: 'secret-credential', machine_name: 'work-box', account_email: 'me@example.com' };
  const redeem = (async () => new Response(JSON.stringify(granted), { status: 200 })) as unknown as typeof fetch;

  async function login(options: { tty?: boolean; answer?: string; args?: string[] } = {}) {
    const home = await tempDir();
    const stale = await tempDir('old-test-config-');
    const plugin = await pluginFor(stale, 'local:/dev/peerband-cli');
    const result = await runCli(['login', '--grant', 'G', ...(options.args ?? [])], {
      env: { PEERBAND_CONFIG_HOME: home },
      tty: options.tty,
      overrides: { fetch: redeem, runHerdr: plugin.herdr.run, version: TEST_VERSION, ...(options.answer !== undefined ? { stdin: fakeStdin(options.answer) } : {}) },
    });
    return { ...result, stdout: plain(result.stdout), stderr: plain(result.stderr), herdr: plugin.herdr, home };
  }

  it('asks to Repair (not Add) an installed-but-wrong plugin and repairs on yes', async () => {
    const r = await login({ tty: true, answer: 'y\n' });
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('Repair the PeerBand plugin now? [Y/n]');
    expect(r.stderr).not.toContain('Add the PeerBand plugin');
    expect(r.stdout).toContain('needs repair: The plugin is linked to a local checkout');
    expect(r.herdr.source()).toBe(releaseSource());
    expect(r.stdout).toContain('Next: peerband relay');
  });

  it('does not repair on no and prints the manual command', async () => {
    const r = await login({ tty: true, answer: 'n\n' });
    expect(r.code).toBe(0);
    expect(r.herdr.source()).toBe('local:/dev/peerband-cli');
    expect(r.stdout).toContain('Skipped. Repair it later with `peerband herdr install`');
  });

  it('repairs without asking with --herdr-plugin install, and never asks without a terminal', async () => {
    const forced = await login({ args: ['--herdr-plugin', 'install'] });
    expect(forced.herdr.source()).toBe(releaseSource());
    const quiet = await login();
    expect(quiet.stderr).not.toContain('[Y/n]');
    expect(quiet.herdr.source()).toBe('local:/dev/peerband-cli');
    expect(quiet.stdout).toMatch(/Next: peerband herdr install\s+then\s+peerband relay/);
  });
});

describe('skill tip', () => {
  const tip = 'Give your coding agents the PeerBand skill: peerband skill';

  it('is printed at the end of login and after a successful relay, but not when relay fails', async () => {
    const granted = { installation_id: 'inst-1', credential: 'c', machine_name: 'work-box' };
    const redeem = (async () => new Response(JSON.stringify(granted), { status: 200 })) as unknown as typeof fetch;
    const login = await runCli(['login', '--grant', 'G'], { env: { PEERBAND_CONFIG_HOME: await tempDir() }, overrides: { fetch: redeem } });
    expect(plain(login.stdout).trimEnd().endsWith(tip)).toBe(true);

    const home = await loggedInHome();
    const ok = await runCli(['relay'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { openRelayTab: async () => 'p' } });
    expect(plain(ok.stdout)).toContain(tip);
    const failed = await runCli(['relay'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { openRelayTab: async () => { throw new Error('x'); } } });
    expect(plain(failed.stdout)).not.toContain(tip);
  });
});
