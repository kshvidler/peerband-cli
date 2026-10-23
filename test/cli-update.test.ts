import { spawnSync } from 'node:child_process';
import { access, chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { hostname } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { saveCredentials } from '../src/core/index.js';
import { compareVersions } from '../src/cli/commands/update.js';
import type { ExecRunner, HerdrResult } from '../src/cli/types.js';
import { cleanupAll, fakeHerdr, runCli, spawnCli, tempDir } from './cli-helpers.js';
import { TEST_VERSION } from './cli-plugin-helpers.js';

const servers: Array<import('node:http').Server> = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done()))));
  await cleanupAll();
});

const BUSY = 'Os { code: 32, kind: Uncategorized, message: "The process cannot access the file because it is being used by another process." }';
const exists = (path: string) => access(path).then(() => true, () => false);
const instant = async () => {};

/** npm registry that answers /peerband/latest with `version` (or a status code). */
async function registry(version: string | number): Promise<string> {
  const server = createServer((request, response) => {
    if (typeof version === 'number' || request.url !== '/peerband/latest') {
      response.writeHead(typeof version === 'number' ? version : 404).end();
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ name: 'peerband', version }));
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address() as { port: number };
  servers.push(server);
  return `http://127.0.0.1:${address.port}`;
}

interface HerdrState {
  source: string | null;
  panes: Array<Record<string, unknown>>;
  /** Results returned (in order) for `plugin install`, then success. */
  installResults?: Array<Partial<HerdrResult>>;
  uninstallResults?: Array<Partial<HerdrResult>>;
}

/** Stateful fake Herdr: plugin list/install/uninstall/link, config-dir, pane list and pane close. */
function statefulHerdr(configDir: string, state: HerdrState) {
  const fake = fakeHerdr((args) => {
    const command = args.slice(0, 2).join(' ');
    if (args[0] === '--version') return { stdout: 'herdr 0.9.3\n' };
    if (command === 'plugin list') return { stdout: state.source ? `- peerband (PeerBand) enabled [${state.source}]\n` : '' };
    if (command === 'plugin install') {
      const next = state.installResults?.shift();
      if (next && next.code) return next;
      state.source = `github:${args[2]}@${args[args.indexOf('--ref') + 1]}`;
      return undefined;
    }
    if (command === 'plugin uninstall') {
      const next = state.uninstallResults?.shift();
      if (next && next.code) return next;
      state.source = null;
      return undefined;
    }
    if (command === 'plugin link') state.source = `local:${args[2]}`;
    if (command === 'plugin unlink') state.source = null;
    if (command === 'plugin config-dir') return { stdout: `${configDir}\n` };
    if (command === 'pane list') return { stdout: JSON.stringify({ id: 'cli:pane:list', result: { panes: state.panes } }) };
    if (command === 'plugin pane' && args[2] === 'close') state.panes = state.panes.filter((pane) => pane.pane_id !== args[3]);
    return undefined;
  });
  return { ...fake, state };
}

const relayPane = (id: string, marker = true) => ({ pane_id: id, tab_id: `t-${id}`, label: 'PeerBand Relay [On]', ...(marker ? { tokens: { peerband_relay: `m-${id}` } } : {}) });
const otherPane = { pane_id: 'w1:p1', tab_id: 'w1:t1', label: 'shell', cwd: '/home' };

async function loggedInHome(): Promise<string> {
  const home = await tempDir('peerband-home-');
  await saveCredentials({ serverUrl: 'https://peerband.com', installationId: 'inst', credential: 'secret' }, join(home, 'credentials.json'));
  return home;
}

/** A dead pid on this host, for stale locks. */
const deadPid = () => spawnSync(process.execPath, ['-e', ''], { windowsHide: true }).pid!;

async function staleState(home: string) {
  await mkdir(join(home, 'relay-helper.lock'), { recursive: true });
  await writeFile(join(home, 'relay-helper.lock', 'owner.json'), JSON.stringify({ token: 't', pid: deadPid(), hostname: hostname() }));
  await mkdir(join(home, 'state', 'receipts.json.lock'), { recursive: true });
  await writeFile(join(home, 'state', 'receipts.json.lock', 'owner'), JSON.stringify({ owner: 'o', pid: deadPid(), hostname: hostname() }));
  await writeFile(join(home, 'relay-state.json'), JSON.stringify({ state: 'running', connectionState: 'connected', activity: [] }));
  await writeFile(join(home, 'relay-tab.json'), JSON.stringify({ version: 1, paneId: 'w1:p9', marker: 'm' }));
}

/** Fake npm + hand-off: `npm root -g` answers `root`; `npm install -g` "installs" by creating the new entry. */
function fakeExec(root: string, options: { installFails?: string; handoffCode?: number } = {}) {
  const calls: Array<{ file: string; args: string[] }> = [];
  const run: ExecRunner = async (file, args, opts) => {
    calls.push({ file, args });
    if (file === 'npm' && args[0] === 'root') return { code: 0, stdout: `${root}\n`, stderr: '' };
    if (file === 'npm' && args[0] === 'install') {
      if (options.installFails) return { code: 1, stdout: '', stderr: options.installFails };
      await mkdir(join(root, 'peerband', 'dist'), { recursive: true });
      await writeFile(join(root, 'peerband', 'dist', 'peerband.mjs'), '// new cli\n');
      opts?.onStderr?.('added 1 package\n');
      return { code: 0, stdout: '', stderr: 'added 1 package\n' };
    }
    if (file === process.execPath) {
      opts?.onStdout?.('✓ Installed the PeerBand plugin (new)\n');
      return { code: options.handoffCode ?? 0, stdout: '', stderr: '' };
    }
    return { code: 127, stdout: '', stderr: 'unexpected', notFound: true };
  };
  return { run, calls };
}

async function npmGlobal(): Promise<{ root: string; self: string }> {
  const root = join(await tempDir('peerband-npm-'), 'node_modules');
  const self = join(root, 'peerband', 'dist', 'peerband.mjs');
  await mkdir(join(root, 'peerband', 'dist'), { recursive: true });
  await writeFile(self, '// old cli\n');
  return { root, self };
}

describe('compareVersions', () => {
  it('orders releases and prereleases', () => {
    expect(compareVersions('0.1.3', '0.1.2')).toBe(1);
    expect(compareVersions('0.1.2', '0.1.10')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.0-rc.1')).toBe(1);
    expect(compareVersions('1.0.0-rc.1', '1.0.0-rc.2')).toBe(-1);
  });
});

describe('peerband update', () => {
  it('--check --json reports an available update without changing anything', async () => {
    const url = await registry('10.0.0');
    const home = await tempDir();
    const herdr = statefulHerdr(join(home, 'cfg'), { source: `github:kshvidler/peerband-cli@v${TEST_VERSION}`, panes: [] });
    const exec = fakeExec('unused');
    const result = await runCli(['update', '--check', '--json'], { env: { PEERBAND_NPM_REGISTRY: url, PEERBAND_CONFIG_HOME: home }, overrides: { version: TEST_VERSION, runHerdr: herdr.run, exec: exec.run } });
    expect(result.code).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({ current: TEST_VERSION, latest: '10.0.0', updateAvailable: true, action: 'none' });
    expect(exec.calls).toEqual([]);
    expect(herdr.calls.some((call) => call[1] === 'install' || call[1] === 'uninstall')).toBe(false);
  });

  it('fails with an offline-friendly message when the registry cannot be reached', async () => {
    const unreachable = await registry(503);
    const down = await runCli(['update'], { env: { PEERBAND_NPM_REGISTRY: unreachable } });
    expect(down.code).toBe(1);
    expect(down.stderr).toContain('HTTP 503');
    expect(down.stderr).toContain('npm install -g peerband@latest');
    const offline = await runCli(['update'], { env: { PEERBAND_NPM_REGISTRY: 'http://127.0.0.1:9' } });
    expect(offline.code).toBe(1);
    expect(offline.stderr).toContain('Could not reach the npm registry');
    expect(offline.stderr).toContain('internet connection');
  });

  it('when up to date, still repairs a plugin that does not match the CLI (CLI updated by plain npm)', async () => {
    const url = await registry(TEST_VERSION);
    const home = await tempDir();
    const configDir = join(home, 'plugin-cfg');
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, 'settings.json'), JSON.stringify({ nodePath: process.execPath, configHome: home }));
    const herdr = statefulHerdr(configDir, { source: 'github:kshvidler/peerband-cli@v0.0.1', panes: [] });
    const exec = fakeExec('unused');
    const result = await runCli(['update'], { env: { PEERBAND_NPM_REGISTRY: url, PEERBAND_CONFIG_HOME: home }, overrides: { version: TEST_VERSION, runHerdr: herdr.run, exec: exec.run, sleep: instant } });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('is up to date');
    expect(result.stdout).toContain('Repairing it');
    expect(herdr.state.source).toBe(`github:kshvidler/peerband-cli@v${TEST_VERSION}`);
    expect(exec.calls).toEqual([]);
  });

  it('installs the new CLI with npm and hands the plugin step to the new binary', async () => {
    const url = await registry('10.0.0');
    const home = await tempDir();
    const { root, self } = await npmGlobal();
    const herdr = statefulHerdr(join(home, 'cfg'), { source: `github:kshvidler/peerband-cli@v${TEST_VERSION}`, panes: [] });
    const exec = fakeExec(root);
    const result = await runCli(['update', '--yes'], { env: { PEERBAND_NPM_REGISTRY: url, PEERBAND_CONFIG_HOME: home }, overrides: { version: TEST_VERSION, runHerdr: herdr.run, exec: exec.run, selfPath: self } });
    expect(result.code, result.stderr).toBe(0);
    expect(exec.calls.map((call) => [call.file, ...call.args])).toEqual([
      ['npm', 'root', '-g'],
      ['npm', 'install', '-g', 'peerband@10.0.0'],
      [process.execPath, self, 'herdr', 'install', '--after-update'],
    ]);
    expect(result.stdout).toContain('Installed peerband 10.0.0');
    expect(result.stdout).toContain('Installed the PeerBand plugin (new)');
    expect(result.stderr).toContain('added 1 package');
    // The old CLI never touches the plugin itself.
    expect(herdr.calls.some((call) => call[1] === 'install' || call[1] === 'uninstall')).toBe(false);
  });

  it('--json keeps stdout to the JSON report and reports a failed hand-off', async () => {
    const url = await registry('10.0.0');
    const { root, self } = await npmGlobal();
    const herdr = statefulHerdr(join(await tempDir(), 'cfg'), { source: `github:kshvidler/peerband-cli@v${TEST_VERSION}`, panes: [] });
    const ok = await runCli(['update', '--json'], { env: { PEERBAND_NPM_REGISTRY: url }, overrides: { version: TEST_VERSION, runHerdr: herdr.run, exec: fakeExec(root).run, selfPath: self } });
    expect(ok.code).toBe(0);
    expect(JSON.parse(ok.stdout)).toMatchObject({ action: 'updated', latest: '10.0.0', install: 'npm-global' });
    expect(ok.stderr).toContain('Installed the PeerBand plugin (new)');

    const failed = await runCli(['update', '--yes'], { env: { PEERBAND_NPM_REGISTRY: url }, overrides: { version: TEST_VERSION, runHerdr: herdr.run, exec: fakeExec(root, { handoffCode: 1 }).run, selfPath: self } });
    expect(failed.code).toBe(1);
    expect(failed.stderr).toContain('updating the Herdr plugin failed');
    expect(failed.stderr).toContain('peerband herdr install');
  });

  it('explains npm permission errors', async () => {
    const url = await registry('10.0.0');
    const { root, self } = await npmGlobal();
    const result = await runCli(['update', '--yes'], { env: { PEERBAND_NPM_REGISTRY: url }, overrides: { version: TEST_VERSION, exec: fakeExec(root, { installFails: 'npm error code EACCES' }).run, selfPath: self } });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('npm install -g peerband@10.0.0 failed');
    expect(result.stderr).toContain('permissions');
  });

  it('prints the right manual step instead of guessing for npx and source checkouts', async () => {
    const url = await registry('10.0.0');
    const npx = await runCli(['update', '--yes'], { env: { PEERBAND_NPM_REGISTRY: url }, overrides: { version: TEST_VERSION, exec: fakeExec('/nowhere').run, selfPath: join('/cache', '_npx', 'abc', 'node_modules', 'peerband', 'dist', 'peerband.mjs') } });
    expect(npx.code).toBe(1);
    expect(npx.stderr).toContain('through npx');
    expect(npx.stderr).toContain('npm install -g peerband@10.0.0');

    const checkout = await tempDir('peerband-checkout-');
    await mkdir(join(checkout, '.git'));
    await mkdir(join(checkout, 'dist'));
    await writeFile(join(checkout, 'package.json'), JSON.stringify({ name: 'peerband' }));
    const exec = fakeExec(join(await tempDir(), 'node_modules'));
    const source = await runCli(['update', '--yes'], { env: { PEERBAND_NPM_REGISTRY: url }, overrides: { version: TEST_VERSION, exec: exec.run, selfPath: join(checkout, 'dist', 'peerband.mjs') } });
    expect(source.code).toBe(1);
    expect(source.stderr).toContain('source checkout');
    expect(source.stderr).toContain('git pull');
    expect(exec.calls.some((call) => call.args[0] === 'install')).toBe(false);
  });

  it('runs real npm through the shell on Windows (fake npm on PATH) and installs into its global root', async () => {
    const url = await registry('10.0.0');
    const { root, self } = await npmGlobal();
    const bin = await tempDir('peerband-fake-npm-');
    const log = join(bin, 'npm.log');
    await writeFile(join(bin, 'fake-npm.mjs'), [
      "import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';",
      "import { join } from 'node:path';",
      'const args = process.argv.slice(2);',
      "appendFileSync(process.env.FAKE_NPM_LOG, args.join(' ') + '\\n');",
      "if (args[0] === 'root') console.log(process.env.FAKE_NPM_ROOT);",
      "else if (args[0] === 'install') { const dir = join(process.env.FAKE_NPM_ROOT, 'peerband', 'dist'); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'peerband.mjs'), '// new'); console.log('added 1 package'); }",
    ].join('\n'));
    if (process.platform === 'win32') await writeFile(join(bin, 'npm.cmd'), `@"${process.execPath}" "${join(bin, 'fake-npm.mjs')}" %*\r\n`);
    else {
      await writeFile(join(bin, 'npm'), `#!/bin/sh\nexec "${process.execPath}" "${join(bin, 'fake-npm.mjs')}" "$@"\n`);
      await chmod(join(bin, 'npm'), 0o755);
    }
    const result = await spawnCli(['update', '--yes'], {
      PATH: `${bin}${delimiter}${process.env.PATH}`,
      PEERBAND_NPM_REGISTRY: url,
      PEERBAND_SELF_PATH: self,
      PEERBAND_CONFIG_HOME: await tempDir(),
      FAKE_NPM_LOG: log,
      FAKE_NPM_ROOT: root,
      ...(process.platform === 'win32' ? { PATHEXT: '.COM;.EXE;.BAT;.CMD', ComSpec: process.env.ComSpec } : {}),
    });
    expect(result.code, result.stderr).toBe(0);
    expect((await readFile(log, 'utf8')).trim().split(/\r?\n/)).toEqual(['root -g', 'install -g peerband@10.0.0']);
    expect(result.stdout).toContain('Installed peerband 10.0.0');
    expect(result.stdout).toContain('Herdr was not found');
  }, 60_000);
});

describe('safe plugin replacement (peerband herdr install)', () => {
  it('stops holders first, retries a busy install with backoff, never uninstalls, and reopens the Relay tab', async () => {
    const home = await loggedInHome();
    const herdr = statefulHerdr(join(home, 'cfg'), {
      source: 'github:kshvidler/peerband-cli@v0.0.1',
      panes: [relayPane('w1:p5'), relayPane('w1:p6', false), otherPane],
      installResults: [{ code: 1, stderr: BUSY }, { code: 1, stderr: BUSY }],
    });
    const slept: number[] = [];
    let reopened = 0;
    const result = await runCli(['herdr', 'install'], {
      env: { PEERBAND_CONFIG_HOME: home },
      overrides: { version: TEST_VERSION, runHerdr: herdr.run, sleep: async (ms) => void slept.push(ms), openRelayTab: async () => String(++reopened) },
    });
    expect(result.code, result.stderr).toBe(0);
    const names = herdr.calls.map((call) => call.slice(0, 3).join(' '));
    expect(herdr.calls).toContainEqual(['plugin', 'pane', 'close', 'w1:p5']);
    expect(herdr.calls).toContainEqual(['plugin', 'pane', 'close', 'w1:p6']);
    expect(herdr.calls).not.toContainEqual(['plugin', 'pane', 'close', 'w1:p1']);
    expect(names.indexOf('plugin pane close')).toBeLessThan(names.indexOf('plugin install kshvidler/peerband-cli'));
    expect(names.filter((name) => name.startsWith('plugin install'))).toHaveLength(3);
    expect(names).not.toContain('plugin uninstall peerband');
    expect(slept.slice(0, 2)).toEqual([1000, 2000]);
    expect(result.stdout).toContain('Closed 2 PeerBand Relay tabs');
    expect(result.stdout).toContain('still in use; retrying');
    expect(result.stdout).toContain('Reopened the PeerBand Relay tab');
    expect(reopened).toBe(1);
    expect(herdr.state.source).toBe(`github:kshvidler/peerband-cli@v${TEST_VERSION}`);
  });

  it('clears stale locks and the stale running snapshot before installing', async () => {
    const home = await tempDir();
    await staleState(home);
    const herdr = statefulHerdr(join(home, 'cfg'), { source: null, panes: [] });
    const result = await runCli(['herdr', 'install'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { version: TEST_VERSION, runHerdr: herdr.run } });
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain('Cleared 2 stale relay locks');
    expect(await exists(join(home, 'relay-helper.lock'))).toBe(false);
    expect(await exists(join(home, 'state', 'receipts.json.lock'))).toBe(false);
    expect(JSON.parse(await readFile(join(home, 'relay-state.json'), 'utf8')).state).toBe('stopping');
  });

  it('keeps the previous plugin when the new one fails to install in place', async () => {
    const home = await tempDir();
    const herdr = statefulHerdr(join(home, 'cfg'), {
      source: 'github:kshvidler/peerband-cli@v0.0.1',
      panes: [],
      installResults: [{ code: 1, stderr: '{"error":{"message":"ref v9.9.9 not found"}}' }],
    });
    const result = await runCli(['herdr', 'install'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { version: TEST_VERSION, runHerdr: herdr.run, sleep: instant } });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('ref v9.9.9 not found');
    expect(result.stderr).toContain('previous plugin (github:kshvidler/peerband-cli@v0.0.1) is still installed');
    expect(herdr.state.source).toBe('github:kshvidler/peerband-cli@v0.0.1');
    expect(herdr.calls.some((call) => call[1] === 'uninstall')).toBe(false);
  });

  it('when Herdr refuses to install over the plugin, removes it, and restores the previous ref if the new install fails', async () => {
    const home = await tempDir();
    const herdr = statefulHerdr(join(home, 'cfg'), {
      source: 'github:kshvidler/peerband-cli@v0.0.1',
      panes: [],
      installResults: [{ code: 1, stderr: 'plugin peerband is already installed' }, { code: 1, stderr: 'network unreachable' }],
    });
    const result = await runCli(['herdr', 'install'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { version: TEST_VERSION, runHerdr: herdr.run, sleep: instant } });
    expect(result.code).toBe(1);
    const installs = herdr.calls.filter((call) => call[1] === 'install').map((call) => call[4]);
    expect(installs).toEqual([`v${TEST_VERSION}`, `v${TEST_VERSION}`, 'v0.0.1']);
    expect(result.stderr).toContain('network unreachable');
    expect(result.stderr).toContain('was restored');
    expect(herdr.state.source).toBe('github:kshvidler/peerband-cli@v0.0.1');
  });

  it('says exactly what to run when even the restore fails', async () => {
    const home = await tempDir();
    const herdr = statefulHerdr(join(home, 'cfg'), {
      source: 'github:kshvidler/peerband-cli@v0.0.1',
      panes: [],
      installResults: [{ code: 1, stderr: 'already installed' }, { code: 1, stderr: 'offline' }, { code: 1, stderr: 'offline' }],
    });
    const result = await runCli(['herdr', 'install'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { version: TEST_VERSION, runHerdr: herdr.run, sleep: instant } });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Herdr has no PeerBand plugin right now');
    expect(result.stderr).toContain(`herdr plugin install kshvidler/peerband-cli --ref v${TEST_VERSION} --yes`);
    expect(result.stderr).toContain('herdr plugin install kshvidler/peerband-cli --ref v0.0.1 --yes');
  });

  it('retries a busy uninstall of a linked checkout before linking or installing', async () => {
    const home = await tempDir();
    const herdr = statefulHerdr(join(home, 'cfg'), { source: 'local:/old/checkout', panes: [], uninstallResults: [{ code: 1, stderr: BUSY }] });
    const result = await runCli(['herdr', 'install'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { version: TEST_VERSION, runHerdr: herdr.run, sleep: instant } });
    expect(result.code, result.stderr).toBe(0);
    expect(herdr.calls.filter((call) => call[1] === 'uninstall')).toHaveLength(2);
    expect(herdr.state.source).toBe(`github:kshvidler/peerband-cli@v${TEST_VERSION}`);
  });
});

describe('uninstall and logout clean up', () => {
  it('herdr uninstall closes Relay panes, removes the plugin, settings, locks and relay state; a second run is a no-op', async () => {
    const home = await tempDir();
    await staleState(home);
    const configDir = join(home, 'plugin-cfg');
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, 'settings.json'), '{}');
    const herdr = statefulHerdr(configDir, { source: 'github:kshvidler/peerband-cli@v0.0.1', panes: [relayPane('w1:p5'), otherPane] });
    const result = await runCli(['herdr', 'uninstall'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { runHerdr: herdr.run, sleep: instant } });
    expect(result.code, result.stderr).toBe(0);
    expect(herdr.calls).toContainEqual(['plugin', 'pane', 'close', 'w1:p5']);
    expect(herdr.calls).toContainEqual(['plugin', 'uninstall', 'peerband']);
    for (const path of ['relay-helper.lock', join('state', 'receipts.json.lock'), 'relay-state.json', 'relay-tab.json']) expect(await exists(join(home, path)), path).toBe(false);
    expect(await exists(join(configDir, 'settings.json'))).toBe(false);
    expect(result.stdout).toContain('Removed the PeerBand plugin');

    const again = await runCli(['herdr', 'uninstall'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { runHerdr: herdr.run, sleep: instant } });
    expect(again.code).toBe(0);
    expect(again.stdout).toContain('not installed');
  });

  it('logout removes relay state and stale locks along with the credential, idempotently', async () => {
    const home = await loggedInHome();
    await staleState(home);
    const herdr = statefulHerdr(join(home, 'cfg'), { source: 'github:kshvidler/peerband-cli@v0.0.1', panes: [relayPane('w1:p5')] });
    const result = await runCli(['logout'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { runHerdr: herdr.run, sleep: instant } });
    expect(result.code, result.stderr).toBe(0);
    expect(herdr.calls).toContainEqual(['plugin', 'pane', 'close', 'w1:p5']);
    for (const path of ['credentials.json', 'relay-helper.lock', join('state', 'receipts.json.lock'), 'relay-state.json', 'relay-tab.json']) expect(await exists(join(home, path)), path).toBe(false);
    const again = await runCli(['logout'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { runHerdr: herdr.run, sleep: instant } });
    expect(again.code).toBe(0);
    expect(again.stdout).toContain('Already logged out');
  });

  it('status points a version mismatch at peerband update', async () => {
    const home = await loggedInHome();
    const configDir = join(home, 'plugin-cfg');
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, 'settings.json'), JSON.stringify({ nodePath: process.execPath, configHome: home }));
    const herdr = statefulHerdr(configDir, { source: 'github:kshvidler/peerband-cli@v0.0.1', panes: [] });
    const result = await runCli(['status'], { env: { PEERBAND_CONFIG_HOME: home }, overrides: { version: TEST_VERSION, runHerdr: herdr.run } });
    expect(result.stdout).toMatch(/Plugin\s+! The plugin is at v0\.0\.1, but this CLI is v9\.9\.9\. \(run `peerband update`\)/);
  });
});
