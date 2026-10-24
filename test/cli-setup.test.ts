import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { saveCredentials } from '../src/core/index.js';
import { SKILLS_CLI } from '../src/cli/skill.js';
import type { ExecRunner, HerdrResult } from '../src/cli/types.js';
import { cleanupAll, runCli, tempDir } from './cli-helpers.js';
import { fakeStdin, pluginFor, TEST_VERSION } from './cli-plugin-helpers.js';

afterEach(cleanupAll);

const plain = (text: string) => text.replace(/\u001b\[[0-9;]*m/g, '');
/** Any file in the repo works: the shipped skill is found by walking up to skills/peerband. */
const SELF = resolve(import.meta.dirname, 'cli-setup.test.ts');
const SHIPPED = resolve(import.meta.dirname, '..', 'skills', 'peerband', 'SKILL.md');

interface Env { config: string; home: string }

async function dirs(): Promise<Env> {
  return { config: await tempDir('peerband-cfg-'), home: await tempDir('peerband-home-') };
}

const envOf = (e: Env): NodeJS.ProcessEnv => ({ PEERBAND_CONFIG_HOME: e.config, PEERBAND_SKILLS_HOME: e.home });

/** A skills CLI that "installs" into the fake home and reports it as the real one does (--json). */
function skillsCli(e: Env, result: Partial<HerdrResult> | 'install' = 'install') {
  const calls: string[][] = [];
  const exec: ExecRunner = async (file, args) => {
    calls.push([file, ...args]);
    if (result !== 'install') return { code: 0, stdout: '', stderr: '', ...result };
    const dir = join(e.home, '.agents', 'skills', 'peerband');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'SKILL.md'), await readFile(SHIPPED));
    const stdout = JSON.stringify([{ name: 'peerband', status: 'installed', path: dir, scope: 'global', agents: ['Claude Code', 'Codex', 'Cursor'] }]);
    return { code: 0, stdout: `noise\n${stdout}\n`, stderr: '' };
  };
  return { exec, calls };
}

describe('peerband skill', () => {
  it('installs the shipped skill globally through the pinned skills CLI', async () => {
    const e = await dirs();
    const cli = skillsCli(e);
    const r = await runCli(['skill'], { env: envOf(e), overrides: { exec: cli.exec, selfPath: SELF } });
    expect(r.code).toBe(0);
    expect(cli.calls).toEqual([['npx', '-y', SKILLS_CLI, 'add', resolve(import.meta.dirname, '..', 'skills', 'peerband'), '--global', '--yes', '--json']]);
    expect(SKILLS_CLI).toMatch(/^skills@\d+\.\d+\.\d+$/);
    expect(plain(r.stdout)).toContain('Installed the PeerBand skill for Claude Code, Codex, Cursor.');
    expect(JSON.parse(await readFile(join(e.config, 'skill.json'), 'utf8')).sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('copies the skill into ~/.agents (and ~/.claude when present) when the skills CLI fails', async () => {
    const e = await dirs();
    await mkdir(join(e.home, '.claude'));
    const cli = skillsCli(e, { code: 1, stdout: '[{"status":"failed","error":"network down"}]' });
    const r = await runCli(['skill'], { env: envOf(e), overrides: { exec: cli.exec, selfPath: SELF } });
    expect(r.code).toBe(0);
    expect(plain(r.stdout)).toContain('did not finish (network down); copying the skill instead');
    for (const agent of ['.agents', '.claude']) {
      expect(await readFile(join(e.home, agent, 'skills', 'peerband', 'SKILL.md'), 'utf8')).toBe(await readFile(SHIPPED, 'utf8'));
    }
  });

  it('copies only into ~/.agents without npx when --copy is passed and Claude is not installed', async () => {
    const e = await dirs();
    const cli = skillsCli(e);
    const r = await runCli(['skill', '--copy'], { env: envOf(e), overrides: { exec: cli.exec, selfPath: SELF } });
    expect(r.code).toBe(0);
    expect(cli.calls).toEqual([]);
    expect(existsSync(join(e.home, '.agents', 'skills', 'peerband', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(e.home, '.claude'))).toBe(false);
  });

  it('keeps a skill the user edited unless --force is passed', async () => {
    const e = await dirs();
    await runCli(['skill', '--copy'], { env: envOf(e), overrides: { selfPath: SELF } });
    const file = join(e.home, '.agents', 'skills', 'peerband', 'SKILL.md');
    await writeFile(file, '# my own rules\n');

    const cli = skillsCli(e);
    const kept = await runCli(['skill'], { env: envOf(e), overrides: { exec: cli.exec, selfPath: SELF } });
    expect(kept.code).toBe(0);
    expect(plain(kept.stdout)).toContain('Kept your own version of the PeerBand skill');
    expect(cli.calls).toEqual([]);
    expect(await readFile(file, 'utf8')).toBe('# my own rules\n');

    const forced = await runCli(['skill', '--copy', '--force'], { env: envOf(e), overrides: { selfPath: SELF } });
    expect(forced.code).toBe(0);
    expect(await readFile(file, 'utf8')).toBe(await readFile(SHIPPED, 'utf8'));
  });

  it('--if-installed does nothing when the skill is not installed', async () => {
    const e = await dirs();
    const cli = skillsCli(e);
    const r = await runCli(['skill', '--if-installed'], { env: envOf(e), overrides: { exec: cli.exec, selfPath: SELF } });
    expect(r.code).toBe(0);
    expect(cli.calls).toEqual([]);
    expect(r.stdout).toBe('');
  });
});

describe('peerband setup', () => {
  async function loggedIn(e: Env): Promise<void> {
    await saveCredentials({ serverUrl: 'https://peerband.com', installationId: 'inst-1', credential: 'c', machineName: 'box', accountEmail: 'me@example.com' }, join(e.config, 'credentials.json'));
  }

  it('skips login when already logged in, installs the skill and opens the relay', async () => {
    const e = await dirs();
    await loggedIn(e);
    const { herdr } = await pluginFor(e.config);
    const cli = skillsCli(e);
    let opened = 0;
    const r = await runCli(['setup', '--skill', 'install'], {
      env: envOf(e),
      overrides: { exec: cli.exec, selfPath: SELF, runHerdr: herdr.run, version: TEST_VERSION, openRelayTab: async () => `${++opened}` },
    });
    const out = plain(r.stdout);
    expect(r.code).toBe(0);
    expect(out).toMatch(/1\/4 Log in\n✓ Already logged in as box \(me@example\.com\)/);
    expect(out).toContain('2/4 Herdr plugin');
    expect(out).toContain('Installed the PeerBand skill for Claude Code');
    expect(opened).toBe(1);
    expect(out).toContain('PeerBand Relay is open in Herdr.');
    expect(out).toContain('PeerBand is set up.');
    // setup opens the relay itself, so it never sends people to run it.
    expect(out).not.toMatch(/Next:.*peerband relay/);
    expect(out).not.toContain('Give your coding agents the PeerBand skill');
  });

  it('asks about the skill on a terminal with Yes as the default', async () => {
    const e = await dirs();
    await loggedIn(e);
    const cli = skillsCli(e);
    const r = await runCli(['setup', '--herdr-plugin', 'skip', '--no-relay'], {
      env: envOf(e),
      tty: true,
      overrides: { exec: cli.exec, selfPath: SELF, stdin: fakeStdin('\n') },
    });
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('Install the PeerBand skill for your agents? [Y/n]');
    expect(cli.calls).toHaveLength(1);
  });

  it('never asks without a terminal: prints the skill command and does not open a relay without Herdr', async () => {
    const e = await dirs();
    await loggedIn(e);
    const cli = skillsCli(e);
    let opened = false;
    const r = await runCli(['setup'], { env: envOf(e), overrides: { exec: cli.exec, selfPath: SELF, openRelayTab: async () => ((opened = true), 'p') } });
    const out = plain(r.stdout);
    expect(r.code).toBe(0);
    expect(cli.calls).toEqual([]);
    expect(out).toContain('Next: peerband skill');
    expect(out).toContain('Herdr was not found');
    expect(out).toContain('Not opened: Herdr is not installed');
    expect(opened).toBe(false);
  });

  it('logs in with a grant even when a login exists, and keeps going when the relay cannot open', async () => {
    const e = await dirs();
    await loggedIn(e);
    const { herdr } = await pluginFor(e.config);
    const granted = { installation_id: 'inst-2', credential: 'c2', machine_name: 'new-box' };
    const redeem = (async () => new Response(JSON.stringify(granted), { status: 200 })) as unknown as typeof fetch;
    const r = await runCli(['setup', '--grant', 'G', '--skill', 'skip'], {
      env: envOf(e),
      overrides: { fetch: redeem, runHerdr: herdr.run, version: TEST_VERSION, openRelayTab: async () => { throw new Error('Herdr is not running'); } },
    });
    const out = plain(r.stdout);
    expect(r.code).toBe(0);
    expect(out).toContain('Logged in as new-box');
    expect(out).toContain('Skipped the agent skill');
    expect(plain(r.stderr)).toContain('Could not open the PeerBand Relay tab: Herdr is not running');
    expect(out).toContain('Setup finished.');
  });

  it('rejects an invalid --skill value', async () => {
    const r = await runCli(['setup', '--skill', 'maybe']);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('Invalid --skill value');
  });
});
