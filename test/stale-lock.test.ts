import { spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConnectorCore, MockRuntime } from '../src/core/index.js';
// @ts-expect-error plain JS module without declarations
import { inspectLock, pidAlive, reclaimIfStale, reclaimLock, resetRelayState, CONNECTOR_PATTERN, SUPERVISOR_PATTERN } from '../herdr/stale-lock.mjs';
// @ts-expect-error plain JS module without declarations
import { controlChannel } from '../herdr/paths.mjs';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
async function temp(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'peerband-lock-'));
  dirs.push(dir);
  return dir;
}

/** A pid that certainly belonged to a process that has exited. */
function deadPid(): number {
  const child = spawnSync(process.execPath, ['-e', ''], { windowsHide: true });
  return child.pid!;
}

async function helperLock(config: string, owner: Record<string, unknown> | string | null) {
  const lockDir = join(config, 'relay-helper.lock');
  await mkdir(lockDir, { recursive: true });
  const ownerFile = join(lockDir, 'owner.json');
  if (owner !== null) await writeFile(ownerFile, typeof owner === 'string' ? owner : JSON.stringify(owner));
  return { lockDir, ownerFile, channel: controlChannel(config) as string };
}

const exists = (path: string) => access(path).then(() => true, () => false);
const noProcesses = async () => [];

describe('stale lock detection', () => {
  it('reports a missing lock as absent', async () => {
    const config = await temp();
    const verdict = await inspectLock({ lockDir: join(config, 'none'), ownerFile: join(config, 'none', 'owner.json') });
    expect(verdict.state).toBe('absent');
  });

  it('reclaims a lock whose recorded owner pid is dead, and logs it', async () => {
    const config = await temp();
    const pid = deadPid();
    expect(pidAlive(pid)).toBe(false);
    const lock = await helperLock(config, { token: 't', pid, hostname: hostname(), startedAt: new Date().toISOString() });
    const lines: string[] = [];
    const result = await reclaimIfStale({ ...lock, listProcesses: noProcesses, log: (line: string) => lines.push(line) });
    expect(result.reclaimed).toBe(true);
    expect(result.verdict.reason).toContain(`${pid} is not running`);
    expect(await exists(lock.lockDir)).toBe(false);
    expect(lines[0]).toMatch(/Reclaimed a stale lock .*relay-helper\.lock/);
  });

  it('keeps a lock whose owner pid is alive and is a PeerBand helper (or cannot be checked)', async () => {
    const config = await temp();
    const lock = await helperLock(config, { token: 't', pid: process.pid, hostname: hostname() });
    const asHelper = async () => [{ pid: process.pid, command: 'node /x/herdr/lifecycle.mjs supervise --await-ui' }];
    expect((await reclaimIfStale({ ...lock, processPattern: SUPERVISOR_PATTERN, listProcesses: asHelper })).reclaimed).toBe(false);
    expect((await inspectLock({ ...lock, processPattern: SUPERVISOR_PATTERN, listProcesses: async () => null })).state).toBe('live');
    expect(await exists(lock.lockDir)).toBe(true);
  });

  it('treats a live pid that is clearly another program (pid reuse) as stale when no helper answers', async () => {
    const config = await temp();
    const lock = await helperLock(config, { token: 't', pid: process.pid, hostname: hostname() });
    const verdict = await inspectLock({ ...lock, processPattern: SUPERVISOR_PATTERN, listProcesses: async () => [{ pid: process.pid, command: 'notepad.exe' }] });
    expect(verdict.state).toBe('stale');
    expect(verdict.reason).toContain('not a PeerBand helper');
  });

  it('never reclaims a lock owned by another host', async () => {
    const config = await temp();
    const lock = await helperLock(config, { token: 't', pid: deadPid(), hostname: 'some-other-machine' });
    const verdict = await inspectLock({ ...lock, listProcesses: noProcesses });
    expect(verdict.state).toBe('live');
    expect(verdict.reason).toContain('another host');
  });

  it('reclaims a legacy helper lock (no pid) only when no helper answers on its control channel', async () => {
    const config = await temp();
    const lock = await helperLock(config, { token: 'legacy-token' });
    // A helper answering on the control channel keeps the lock.
    const server = createServer((socket) => socket.destroy());
    await new Promise<void>((done, fail) => { server.once('error', fail); server.listen(lock.channel, done); });
    try {
      const verdict = await inspectLock({ ...lock, processPattern: SUPERVISOR_PATTERN, listProcesses: noProcesses });
      expect(verdict.state).toBe('live');
      expect(verdict.reason).toContain('control channel');
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
      if (process.platform !== 'win32') await rm(lock.channel, { force: true });
    }

    const result = await reclaimIfStale({ ...lock, processPattern: SUPERVISOR_PATTERN, listProcesses: noProcesses });
    expect(result.reclaimed).toBe(true);
    expect(result.verdict.reason).toContain('no helper answers');
    expect(await exists(lock.lockDir)).toBe(false);
  });

  it('reclaims a legacy receipt lock (no channel) only when no connector process is running', async () => {
    const dir = await temp();
    const lockDir = join(dir, 'receipts.json.lock');
    await mkdir(lockDir);
    await writeFile(join(lockDir, 'owner'), 'legacy-uuid');
    const options = { lockDir, ownerFile: join(lockDir, 'owner'), processPattern: CONNECTOR_PATTERN };
    const connector = async () => [{ pid: 4242, command: '"C:\\node.exe" C:\\npm\\node_modules\\peerband\\dist\\peerband.mjs connect --managed' }];
    expect((await inspectLock({ ...options, listProcesses: connector })).state).toBe('live');
    expect((await inspectLock({ ...options, listProcesses: async () => null })).state).toBe('live');
    const result = await reclaimIfStale({ ...options, listProcesses: noProcesses });
    expect(result.reclaimed).toBe(true);
    expect(await exists(lockDir)).toBe(false);
  });

  it('gives a lock directory without an owner file a grace period (it may be being created)', async () => {
    const config = await temp();
    const lock = await helperLock(config, null);
    expect((await inspectLock({ ...lock, listProcesses: noProcesses })).reason).toContain('being created');
    const old = new Date(Date.now() - 60_000);
    await utimes(lock.lockDir, old, old);
    expect((await inspectLock({ ...lock, listProcesses: noProcesses })).state).toBe('stale');
  });

  it('puts a lock back when its owner changed between inspection and reclaim', async () => {
    const config = await temp();
    const lock = await helperLock(config, { token: 'new-owner', pid: process.pid });
    expect(await reclaimLock({ lockDir: lock.lockDir, ownerFile: lock.ownerFile, expectedOwnerText: '{"token":"old-owner"}' })).toBe(false);
    expect(JSON.parse(await readFile(lock.ownerFile, 'utf8')).token).toBe('new-owner');
  });

  it('resets a saved relay snapshot that still says running', async () => {
    const config = await temp();
    const path = join(config, 'relay-state.json');
    await writeFile(path, JSON.stringify({ state: 'running', connectionState: 'connected', activity: [{ requestId: 'r' }] }));
    expect(await resetRelayState(path)).toBe(true);
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ state: 'stopping', connectionState: 'disabled', activity: [{ requestId: 'r' }] });
    expect(await resetRelayState(path)).toBe(false);
    expect(await resetRelayState(join(config, 'missing.json'))).toBe(false);
  });
});

describe('receipt-store lock', () => {
  async function receiptLock(owner: string) {
    const dir = await temp();
    const receiptPath = join(dir, 'receipts.json');
    await mkdir(`${receiptPath}.lock`);
    await writeFile(join(`${receiptPath}.lock`, 'owner'), owner);
    return receiptPath;
  }

  it('records pid and hostname, and reclaims the lock of a dead owner', async () => {
    const receiptPath = await receiptLock(JSON.stringify({ owner: 'x', pid: deadPid(), hostname: hostname(), startedAt: 'then' }));
    const messages: string[] = [];
    const core = new ConnectorCore(new MockRuntime(), { receiptPath, onLockReclaimed: (message) => messages.push(message) });
    await core.initialize();
    const owner = JSON.parse(await readFile(join(`${receiptPath}.lock`, 'owner'), 'utf8'));
    expect(owner).toMatchObject({ pid: process.pid, hostname: hostname() });
    expect(typeof owner.owner).toBe('string');
    expect(messages[0]).toContain('Reclaimed a stale receipt-store lock');
    await core.close();
    await expect(stat(`${receiptPath}.lock`)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps refusing while the owner is alive, and for a legacy lock unless the caller confirms it is stale', async () => {
    const live = await receiptLock(JSON.stringify({ owner: 'x', pid: process.pid, hostname: hostname() }));
    await expect(new ConnectorCore(new MockRuntime(), { receiptPath: live }).initialize()).rejects.toMatchObject({ code: 'receipt_store_locked' });

    const legacy = await receiptLock('7d8e0a52-legacy-uuid');
    await expect(new ConnectorCore(new MockRuntime(), { receiptPath: legacy }).initialize()).rejects.toMatchObject({ code: 'receipt_store_locked' });
    const confirmed = new ConnectorCore(new MockRuntime(), { receiptPath: legacy, lockIsStale: async () => true });
    await confirmed.initialize();
    await confirmed.close();
  });
});
