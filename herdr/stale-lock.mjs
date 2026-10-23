// Stale-lock detection and reclaim, shared by the plugin (lifecycle.mjs) and the CLI (bundled).
// A lock is a directory created with mkdir (atomic). Its owner file records who holds it:
//   relay-helper.lock/owner.json   {"token","pid","hostname","startedAt"}   (written by the supervisor)
//   state/receipts.json.lock/owner {"owner","pid","hostname","startedAt"}   (written by the connector)
// Locks written by PeerBand 0.1.3 and older have no pid ("legacy"). A lock is only reclaimed when its owner is
// provably gone: a recorded pid on this host that is not alive (or alive but clearly another program), or, for a
// legacy lock, nobody answering on the helper control channel (helper lock) / no matching process running (receipts).
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { hostname } from "node:os";
import { join, relative } from "node:path";

// A lock directory without an owner file may be one that is being created right now.
const CREATION_GRACE_MS = 10_000;

export const SUPERVISOR_PATTERN = /lifecycle\.mjs["']?\s+supervise\b/i;
export const CONNECTOR_PATTERN = /peerband(?:\.mjs|\.cmd|\.ps1)?["']?\s+connect\b/i;

/** Fields recorded in every new owner file. */
export function ownerIdentity() {
  return { pid: process.pid, hostname: hostname(), startedAt: new Date().toISOString() };
}

/** True when a process with this pid exists (EPERM means it exists but belongs to someone else). */
export function pidAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return Boolean(error && error.code === "EPERM");
  }
}

/** "listening" when something accepts connections on the channel, "absent" when nothing does, "unknown" otherwise. */
export function probeChannel(channel, timeout = 1500) {
  return new Promise((resolve) => {
    let settled = false;
    const socket = createConnection(channel);
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(value);
    };
    const timer = setTimeout(() => finish("unknown"), timeout);
    socket.once("connect", () => finish("listening"));
    socket.once("error", (error) => finish(error && (error.code === "ENOENT" || error.code === "ECONNREFUSED") ? "absent" : "unknown"));
  });
}

function run(file, args, timeout) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => resolve(error ? null : String(stdout)));
  });
}

/** Best-effort list of running processes with their command lines, or null when it cannot be read. */
export async function listProcesses(platform = process.platform) {
  if (platform === "linux") {
    let entries;
    try { entries = await readdir("/proc"); } catch { return null; }
    const result = [];
    for (const entry of entries) {
      if (!/^\d+$/.test(entry)) continue;
      try {
        const command = (await readFile(`/proc/${entry}/cmdline`, "utf8")).split("\0").join(" ").trim();
        if (command) result.push({ pid: Number(entry), command });
      } catch { /* exited meanwhile */ }
    }
    return result;
  }
  if (platform === "win32") {
    const script = "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | ForEach-Object { \"$($_.ProcessId)`t$($_.CommandLine)\" }";
    const text = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], 15_000);
    if (text === null) return null;
    return parseProcessLines(text, "\t");
  }
  const text = await run("ps", ["-axo", "pid=,command="], 10_000);
  return text === null ? null : parseProcessLines(text, " ");
}

function parseProcessLines(text, separator) {
  const result = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const at = line.indexOf(separator);
    const pid = Number(at < 0 ? line : line.slice(0, at));
    if (Number.isSafeInteger(pid) && pid > 0) result.push({ pid, command: at < 0 ? "" : line.slice(at + 1).trim() });
  }
  return result;
}

async function readOwner(ownerFile) {
  let text;
  try { text = await readFile(ownerFile, "utf8"); } catch { return { text: null, owner: null }; }
  try {
    const value = JSON.parse(text);
    if (value && typeof value === "object" && !Array.isArray(value)) return { text, owner: value };
  } catch { /* a legacy receipt lock holds a bare uuid */ }
  return { text, owner: {} };
}

/**
 * Decides whether a lock is held by a live owner.
 * Returns { state: "absent" | "live" | "stale", reason, ownerText, pid? }.
 * `channel`: the helper control channel that a live owner answers on (optional).
 * `processPattern`: command-line pattern of a process that could own the lock (optional).
 * `listProcesses`, `probe`, `alive`, `host`: test seams.
 */
export async function inspectLock({ lockDir, ownerFile, channel, processPattern, excludePids = [], listProcesses: list = listProcesses, probe = probeChannel, alive = pidAlive, host = hostname(), now = Date.now() }) {
  let info;
  try { info = await stat(lockDir); } catch (error) {
    if (error && error.code === "ENOENT") return { state: "absent", reason: "no lock", ownerText: null };
    return { state: "live", reason: `the lock could not be read (${error && error.code})`, ownerText: null };
  }
  const { text, owner } = await readOwner(ownerFile);
  const ignore = new Set([process.pid, ...excludePids]);
  // Processes whose command line matches the owner pattern (null when unknown). `keep` is never filtered out.
  const matching = async (keep) => {
    if (!processPattern) return null;
    const processes = await list();
    if (!processes) return null;
    return processes.filter((item) => (item.pid === keep || !ignore.has(item.pid)) && processPattern.test(item.command));
  };

  if (owner && Number.isSafeInteger(owner.pid) && owner.pid > 0) {
    const pid = owner.pid;
    if (typeof owner.hostname === "string" && owner.hostname && owner.hostname !== host) {
      return { state: "live", reason: `the owner runs on another host (${owner.hostname})`, ownerText: text, pid };
    }
    if (!alive(pid)) return { state: "stale", reason: `owner process ${pid} is not running`, ownerText: text, pid };
    // The pid is alive. It may have been reused by an unrelated program after the owner died.
    if (channel && (await probe(channel)) !== "absent") return { state: "live", reason: `owner process ${pid} is running`, ownerText: text, pid };
    const candidates = await matching(pid);
    if (candidates && !candidates.some((item) => item.pid === pid)) {
      return { state: "stale", reason: `process ${pid} is running but is not a PeerBand ${channel ? "helper" : "connector"}`, ownerText: text, pid };
    }
    return { state: "live", reason: `owner process ${pid} is running`, ownerText: text, pid };
  }

  // Legacy lock (no pid), or a lock whose owner file is missing.
  if (text === null && now - info.mtimeMs < CREATION_GRACE_MS) return { state: "live", reason: "the lock is being created", ownerText: null };
  if (channel) {
    // The channel name is derived from the config folder and a helper listens on it before it writes its owner
    // file, for as long as it lives. Nothing listening therefore means the helper of *this* config is gone, which a
    // process list cannot tell (it cannot see which config folder another helper serves).
    const probed = await probe(channel);
    if (probed === "listening") return { state: "live", reason: "a helper answers on the control channel", ownerText: text };
    if (probed === "unknown") return { state: "live", reason: "the control channel could not be checked", ownerText: text };
    return { state: "stale", reason: "no helper answers on the control channel", ownerText: text };
  }
  const candidates = await matching();
  if (candidates && candidates.length > 0) {
    return { state: "live", reason: `a matching process is running (pid ${candidates.map((item) => item.pid).join(", ")})`, ownerText: text };
  }
  if (!candidates) return { state: "live", reason: "running processes could not be listed", ownerText: text };
  return { state: "stale", reason: "no matching process is running", ownerText: text };
}

/**
 * Atomically removes a stale lock: rename it aside (only one reclaimer can win), check that the moved lock is
 * still the one that was inspected, then delete it. If the owner changed meanwhile, it is put back.
 */
export async function reclaimLock({ lockDir, ownerFile, expectedOwnerText }) {
  const quarantine = `${lockDir}.stale-${randomUUID()}`;
  try { await rename(lockDir, quarantine); } catch (error) { return Boolean(error && error.code === "ENOENT"); }
  const moved = await readOwner(join(quarantine, relative(lockDir, ownerFile)));
  if (expectedOwnerText !== undefined && moved.text !== expectedOwnerText) {
    await rename(quarantine, lockDir).catch(() => {});
    return false;
  }
  await rm(quarantine, { recursive: true, force: true }).catch(() => {});
  return true;
}

/** inspectLock + reclaimLock. Returns { reclaimed, verdict }. `log` receives one line when a lock is reclaimed. */
export async function reclaimIfStale(options) {
  const verdict = await inspectLock(options);
  if (verdict.state !== "stale") return { reclaimed: false, verdict };
  const reclaimed = await reclaimLock({ lockDir: options.lockDir, ownerFile: options.ownerFile, expectedOwnerText: verdict.ownerText ?? undefined });
  if (reclaimed && options.log) options.log(`Reclaimed a stale lock ${options.lockDir} (${verdict.reason}).`);
  return { reclaimed, verdict };
}

/** Marks a saved relay snapshot as stopped (keeps the activity list), so nothing reads it as still running. */
export async function resetRelayState(path) {
  let previous = {};
  try { previous = JSON.parse(await readFile(path, "utf8")) || {}; } catch (error) {
    if (error && error.code === "ENOENT") return false;
  }
  const activity = Array.isArray(previous.activity) ? previous.activity : [];
  if (previous.state === "stopping" && previous.connectionState === "disabled") return false;
  await writeFile(path, `${JSON.stringify({ state: "stopping", connectionState: "disabled", activity })}\n`, { mode: 0o600 });
  return true;
}
