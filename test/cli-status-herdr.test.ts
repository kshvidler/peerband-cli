import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { saveCredentials } from '../src/core/index.js';
import { cleanupAll, fakeHerdr, runCli, spawnCli, tempDir } from './cli-helpers.js';

afterEach(cleanupAll);

async function loggedInHome(extra: Record<string, string> = {}): Promise<string> {
  const home = await tempDir();
  await saveCredentials(
    { serverUrl: 'https://peerband.com', installationId: 'inst-9', credential: 'never-print-me', machineName: 'box', accountEmail: 'me@example.com', enrolledAt: '2026-01-02T03:04:05.000Z', ...extra },
    join(home, 'credentials.json'),
  );
  return home;
}

describe('peerband status', () => {
  it('--json without credentials reports loggedIn false and exits 3', async () => {
    const home = await tempDir();
    const result = await spawnCli(['status', '--json'], { PEERBAND_CONFIG_HOME: home });
    expect(result.code).toBe(3);
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      loggedIn: false,
      machine: null,
      email: null,
      server: null,
      mcpUrl: null,
      relay: { running: false, connection: null, source: 'none' },
      herdr: { found: false, version: null, pluginInstalled: null },
      configHome: home,
    });
    expect(Object.keys(report).sort()).toEqual(['configHome', 'email', 'enrolledAt', 'herdr', 'installationId', 'loggedIn', 'machine', 'mcpUrl', 'node', 'relay', 'server', 'version']);
  });

  it('--json with credentials exposes identity but never the secret', async () => {
    const home = await loggedInHome();
    const herdr = fakeHerdr((args) => (args[0] === '--version' ? { stdout: 'herdr 0.9.3\n' } : args.join(' ') === 'plugin list' ? { stdout: '1 plugin installed:\n- peerband (PeerBand) enabled [github:kshvidler/peerband-cli]\n' } : undefined));
    const result = await runCli(['status', '--json'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { runHerdr: herdr.run } });
    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain('never-print-me');
    expect(JSON.parse(result.stdout)).toMatchObject({
      loggedIn: true,
      machine: 'box',
      email: 'me@example.com',
      server: 'https://peerband.com',
      installationId: 'inst-9',
      enrolledAt: '2026-01-02T03:04:05.000Z',
      herdr: { found: true, version: '0.9.3', pluginInstalled: true },
    });
  });

  it('falls back to the saved relay snapshot and reports it as not running', async () => {
    const home = await loggedInHome();
    await mkdir(home, { recursive: true });
    await writeFile(join(home, 'relay-state.json'), JSON.stringify({ state: 'running', connectionState: 'connected', activity: [] }));
    const result = await runCli(['status', '--json'], { env: { PEERBAND_CONFIG_HOME: home } });
    const report = JSON.parse(result.stdout);
    expect(report.relay.running).toBe(false);
    expect(report.relay.source).toBe('file');
  });

  it('prints aligned human output without ANSI when piped', async () => {
    const home = await loggedInHome();
    const result = await runCli(['status'], { env: { PEERBAND_CONFIG_HOME: home } });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('logged in as me@example.com');
    expect(result.stdout).toMatch(/^Account {2}/m);
    expect(result.stdout).toMatch(/^Machine {2,}box/m);
    expect(result.stdout).toContain('not found');
    const loggedOut = await runCli(['status'], { env: { PEERBAND_CONFIG_HOME: await tempDir() } });
    expect(loggedOut.code).toBe(3);
    expect(loggedOut.stdout).toContain('peerband login');
  });
});

describe('peerband relay', () => {
  it('exits 3 when not logged in and maps Herdr errors to next steps', async () => {
    const home = await tempDir();
    const notLoggedIn = await runCli(['relay'], { env: { PEERBAND_CONFIG_HOME: home } });
    expect(notLoggedIn.code).toBe(3);
    expect(notLoggedIn.stderr).toContain('peerband login');

    const loggedIn = await loggedInHome();
    const env = { PEERBAND_CONFIG_HOME: loggedIn };
    const missing = await runCli(['relay'], { env, overrides: { openRelayTab: async () => { throw new Error('plugin pane open: Herdr was not found (herdr).'); } } });
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain('HERDR_BIN_PATH');
    const notInstalled = await runCli(['relay'], { env, overrides: { openRelayTab: async () => { throw new Error('The PeerBand plugin is not installed in Herdr (x).'); } } });
    expect(notInstalled.stderr).toContain('peerband herdr install');
    const ok = await runCli(['relay'], { env, overrides: { openRelayTab: async () => 'p_1' } });
    expect(ok.code).toBe(0);
    expect(ok.stdout).toContain('PeerBand Relay is open');
    expect(ok.stdout).toMatch(/MCP server\s+https:\/\/mcp\.peerband\.com\/mcp/);
    expect(ok.stdout).toContain('custom connector in ChatGPT or Claude');
    expect(ok.stdout).toContain('claude mcp add --transport http peerband https://mcp.peerband.com/mcp');
  });
});

function pluginHerdr(configDir: string, options: { installed?: boolean; failInstall?: boolean } = {}) {
  let installed = options.installed ?? false;
  const fake = fakeHerdr((args) => {
    const command = args.slice(0, 2).join(' ');
    if (command === 'plugin list') return { stdout: installed ? '- peerband (PeerBand) enabled [local:/x]\n' : '- herdr-connect.remote (Peerband Remote) enabled [local:/y]\n' };
    if (command === 'plugin install') {
      if (options.failInstall) return { code: 1, stderr: '{"error":{"message":"ref v9 not found"}}' };
      installed = true;
    }
    if (command === 'plugin link') installed = true;
    if (command === 'plugin uninstall' || command === 'plugin unlink') installed = false;
    if (command === 'plugin config-dir') return { stdout: `${configDir}\n` };
    return undefined;
  });
  return fake;
}

describe('peerband herdr install / uninstall', () => {
  it('installs the versioned release and writes settings with this node', async () => {
    const configDir = join(await tempDir(), 'plugin-config');
    const herdr = pluginHerdr(configDir);
    const result = await runCli(['herdr', 'install'], { env: { PEERBAND_CONFIG_HOME: await tempDir() }, overrides: { runHerdr: herdr.run } });
    expect(result.code).toBe(0);
    expect(herdr.calls).toContainEqual(['plugin', 'install', 'kshvidler/peerband-cli', '--ref', expect.stringMatching(/^v\d/), '--yes']);
    const settings = JSON.parse(await readFile(join(configDir, 'settings.json'), 'utf8'));
    expect(settings.nodePath).toBe(process.execPath);
    expect(settings.configHome).toBeTruthy();
    expect(result.stdout).toContain('Installed the PeerBand plugin');
    expect(result.stdout).toContain('Next: peerband login');
  });

  it('omits configHome when PEERBAND_CONFIG_HOME is not set, and suggests relay when logged in', async () => {
    const configDir = join(await tempDir(), 'cfg');
    const home = await loggedInHome();
    // The credential lives in the default location of this isolated XDG/APPDATA home.
    const env = { PEERBAND_CONFIG_HOME: undefined, ...(process.platform === "win32" ? { APPDATA: home } : { XDG_CONFIG_HOME: home }) };
    await mkdir(join(home, 'peerband'), { recursive: true });
    await saveCredentials({ serverUrl: 'https://peerband.com', installationId: 'i', credential: 'c' }, join(home, 'peerband', 'credentials.json'));
    const result = await runCli(['herdr', 'install'], { env, overrides: { runHerdr: pluginHerdr(configDir).run } });
    expect(result.code).toBe(0);
    expect(JSON.parse(await readFile(join(configDir, 'settings.json'), 'utf8'))).toEqual({ nodePath: process.execPath });
    expect(result.stdout).toContain('Next: peerband relay');
  });

  it('honours PEERBAND_HERDR_SOURCE / REF overrides and does not record HERDR_BIN_PATH', async () => {
    const configDir = join(await tempDir(), 'cfg');
    const herdr = pluginHerdr(configDir);
    const result = await runCli(['herdr', 'install'], {
      env: { PEERBAND_HERDR_SOURCE: 'someone/fork', PEERBAND_HERDR_REF: 'main', HERDR_BIN_PATH: join(configDir, 'herdr-bin') },
      overrides: { runHerdr: herdr.run },
    });
    expect(result.code).toBe(0);
    expect(herdr.calls).toContainEqual(['plugin', 'install', 'someone/fork', '--ref', 'main', '--yes']);
    expect(JSON.parse(await readFile(join(configDir, 'settings.json'), 'utf8')).herdrBinary).toBeUndefined();
  });

  it('links a local directory instead of installing', async () => {
    const source = await tempDir('peerband-src-');
    const configDir = join(await tempDir(), 'cfg');
    const herdr = pluginHerdr(configDir);
    const result = await runCli(['herdr', 'install'], { env: { PEERBAND_HERDR_SOURCE: source }, overrides: { runHerdr: herdr.run } });
    expect(result.code).toBe(0);
    expect(herdr.calls.some((call) => call[1] === 'link' && call[2] === source)).toBe(true);
    expect(herdr.calls.some((call) => call[1] === 'install')).toBe(false);
    expect(result.stdout).toContain('Linked');
  });

  it('replaces an existing install idempotently', async () => {
    const configDir = join(await tempDir(), 'cfg');
    const herdr = pluginHerdr(configDir, { installed: true });
    const result = await runCli(['herdr', 'install'], { overrides: { runHerdr: herdr.run } });
    expect(result.code).toBe(0);
    const names = herdr.calls.map((call) => call.slice(0, 2).join(' '));
    expect(names.indexOf('plugin uninstall')).toBeGreaterThan(-1);
    expect(names.indexOf('plugin uninstall')).toBeLessThan(names.indexOf('plugin install'));
  });

  it('reports a missing herdr and a failed install with next steps', async () => {
    const missing = await runCli(['herdr', 'install']);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain('Herdr was not found');
    expect(missing.stderr).toContain('HERDR_BIN_PATH');
    const failing = await runCli(['herdr', 'install'], { overrides: { runHerdr: pluginHerdr('unused', { failInstall: true }).run } });
    expect(failing.code).toBe(1);
    expect(failing.stderr).toContain('ref v9 not found');
    expect(failing.stderr).toContain('PEERBAND_HERDR_REF');
  });

  it('uninstalls, falls back to unlink, and no-ops when absent', async () => {
    const configDir = await tempDir();
    const herdr = pluginHerdr(configDir, { installed: true });
    const result = await runCli(['herdr', 'uninstall'], { env: { PEERBAND_CONFIG_HOME: await tempDir() }, overrides: { runHerdr: herdr.run } });
    expect(result.code).toBe(0);
    expect(herdr.calls).toContainEqual(['plugin', 'uninstall', 'peerband']);
    expect(result.stdout).toContain('Removed');

    let installed = true;
    const linked = fakeHerdr((args) => {
      const command = args.slice(0, 2).join(' ');
      if (command === 'plugin list') return { stdout: installed ? '- peerband (PeerBand) enabled [local:/x]\n' : '' };
      if (command === 'plugin uninstall') return { code: 1, stderr: 'peerband is a linked plugin' };
      if (command === 'plugin unlink') installed = false;
      return undefined;
    });
    expect((await runCli(['herdr', 'uninstall'], { env: { PEERBAND_CONFIG_HOME: await tempDir() }, overrides: { runHerdr: linked.run } })).code).toBe(0);
    expect(linked.calls).toContainEqual(['plugin', 'unlink', 'peerband']);

    const absent = await runCli(['herdr', 'uninstall'], { overrides: { runHerdr: pluginHerdr(configDir).run } });
    expect(absent.code).toBe(0);
    expect(absent.stdout).toContain('not installed');
  });

  it('deletes the settings file it wrote, querying the config dir before uninstalling', async () => {
    const configDir = join(await tempDir(), 'plugin-config');
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, 'settings.json'), '{}');
    const herdr = pluginHerdr(configDir, { installed: true });
    const result = await runCli(['herdr', 'uninstall'], { env: { PEERBAND_CONFIG_HOME: await tempDir() }, overrides: { runHerdr: herdr.run } });
    expect(result.code).toBe(0);
    const names = herdr.calls.map((call) => call.slice(0, 2).join(' '));
    expect(names.indexOf('plugin config-dir')).toBeLessThan(names.indexOf('plugin uninstall'));
    await expect(stat(join(configDir, 'settings.json'))).rejects.toMatchObject({ code: 'ENOENT' });

    // A second run with no settings file (ENOENT) still succeeds.
    const again = pluginHerdr(configDir, { installed: true });
    expect((await runCli(['herdr', 'uninstall'], { env: { PEERBAND_CONFIG_HOME: await tempDir() }, overrides: { runHerdr: again.run } })).code).toBe(0);
  });
});
