import { execFile } from 'node:child_process';
import { access, readFile, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { saveCredentials } from '../src/core/index.js';
import { cleanupAll, DIST, runCli, tempDir } from './cli-helpers.js';

const execute = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const fakeConnector = join(root, 'test', 'fixtures', 'fake-connector.mjs');
const lifecycle = join(root, 'herdr', 'lifecycle.mjs');

async function eventually(check: () => Promise<boolean>, ms = 15_000): Promise<void> {
  const deadline = Date.now() + ms;
  for (;;) {
    if (await check().catch(() => false)) return;
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
}

async function machine() {
  const home = await tempDir('peerband-core-relay-');
  await saveCredentials({ serverUrl: 'https://peerband.com', installationId: 'inst-1', credential: 'machine-secret', machineName: 'work-box' }, join(home, 'credentials.json'));
  const argsFile = join(home, 'args.json');
  // HC_BIN points at node so the `hc --version` probe succeeds without herdr-core installed.
  const env = { PEERBAND_CONFIG_HOME: home, PEERBAND_CONNECTOR_ENTRY: fakeConnector, FAKE_CONNECTOR_ARGS_FILE: argsFile, HC_BIN: process.execPath, SystemRoot: process.env.SystemRoot };
  const stop = () => execute(process.execPath, [lifecycle, 'stop'], { env: { ...process.env, ...env }, windowsHide: true }).catch(() => undefined);
  return { home, argsFile, env, stop, relay: (...args: string[]) => runCli(['relay', ...args], { env, overrides: { selfPath: DIST } }) };
}

afterEach(cleanupAll);

describe('peerband relay --core', () => {
  it('runs the combined relay in the background, once, and stops it', async () => {
    const box = await machine();
    try {
      const started = await box.relay('--core');
      expect(started.stderr).toBe('');
      expect(started.code).toBe(0);
      expect(started.stdout).toContain('PeerBand Relay is running in the background for herdr-core.');
      // The supervisor hands the runtime to its connector child and records it for status and repeat starts.
      await eventually(async () => JSON.parse(await readFile(box.argsFile, 'utf8')).includes('auto'));
      expect(JSON.parse(await readFile(box.argsFile, 'utf8'))).toEqual(['connect', '--managed', '--runtime', 'auto']);
      const owner = JSON.parse(await readFile(join(box.home, 'relay-helper.lock', 'owner.json'), 'utf8')) as { runtime?: string };
      expect(owner.runtime).toBe('auto');

      const again = await box.relay('--core');
      expect(again.stdout).toContain('already running');

      const stopped = await box.relay('--stop');
      expect(stopped.stdout).toContain('PeerBand Relay stopped.');
      await eventually(async () => { try { await access(join(box.home, 'relay-helper.lock')); return false; } catch { return true; } });
      expect((await box.relay('--stop')).stdout).toContain('No PeerBand relay is running');
    } finally {
      await box.stop();
    }
  }, 60_000);

  it('leaves a running Herdr relay alone: it serves herdr-core too, unless connector.json limits it', async () => {
    const box = await machine();
    try {
      // The Herdr plugin starts the supervisor without PEERBAND_RUNTIME.
      await execute(process.execPath, [lifecycle, 'start'], { env: { ...process.env, ...box.env, PEERBAND_RUNTIME: '' }, windowsHide: true });
      await eventually(async () => JSON.parse(await readFile(box.argsFile, 'utf8')).length > 0);
      expect(JSON.parse(await readFile(box.argsFile, 'utf8'))).toEqual(['connect', '--managed']);
      const served = await box.relay('--core');
      expect(served.code).toBe(0);
      expect(served.stdout).toContain('A PeerBand Relay that serves herdr-core is already running.');
      // No second supervisor: the Herdr relay's connector is the only one.
      expect(JSON.parse(await readFile(box.argsFile, 'utf8'))).toEqual(['connect', '--managed']);

      await writeFile(join(box.home, 'connector.json'), JSON.stringify({ runtime: 'herdr' }));
      const refused = await box.relay('--core');
      expect(refused.code).toBe(1);
      expect(refused.stderr).toContain('serves only the Herdr terminal app');
      expect(refused.stderr).toContain('Remove that setting');
    } finally {
      await box.stop();
    }
  }, 60_000);

  it.skipIf(process.platform === 'win32')('finds the plugin scripts through a bin symlink, as a global npm install runs it', async () => {
    const box = await machine();
    const bin = join(box.home, 'peerband');
    await symlink(DIST, bin);
    try {
      const started = await runCli(['relay', '--core'], { env: box.env, overrides: { selfPath: bin } });
      expect(started.stderr).toBe('');
      expect(started.code).toBe(0);
    } finally {
      await box.stop();
    }
  }, 60_000);

  it('explains a missing hc binary before starting anything', async () => {
    const box = await machine();
    const result = await runCli(['relay', '--core'], { env: { ...box.env, HC_BIN: join(box.home, 'no-such-hc.exe') }, overrides: { selfPath: DIST } });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('herdr-core (hc) was not found');
    await expect(access(join(box.home, 'relay-helper.lock'))).rejects.toThrow();
  });

  it('rejects --core together with --stop', async () => {
    const box = await machine();
    const result = await box.relay('--core', '--stop');
    expect(result.code).toBe(2);
  });
});
