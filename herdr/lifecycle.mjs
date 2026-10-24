// Owns one child through a live authenticated local control channel. Never kills a stored PID.
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, unlink, rmdir, rename, access } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePaneEvent, createPaneSnapshot, fallbackPaneSnapshot } from "./pane-state.mjs";
import { config, lock, recordPath, channel, connectControl, matches } from "./control.mjs";
import { relayStatePath } from "./paths.mjs";
import { ownerIdentity, reclaimIfStale, resetRelayState, SUPERVISOR_PATTERN } from "./stale-lock.mjs";

const script = fileURLToPath(import.meta.url);
const pluginRoot = resolve(dirname(script), "..");
// PEERBAND_CONNECTOR_ENTRY is for tests only: it replaces the bundled CLI as the connector child.
const connectorEntry = process.env.PEERBAND_CONNECTOR_ENTRY || join(pluginRoot, "dist", "peerband.mjs");
const paneStatePath = relayStatePath(config);

async function request(command) {
  const socket = await connectControl({ initialCommand: command, timeout: 3000 });
  return new Promise((resolve, reject) => {
    let text = "";
    let settled = false;
    const timer = setTimeout(() => {
      socket.destroy();
      finish(new Error("Helper control timeout"));
    }, 3000);
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    socket.once("error", (error) => finish(error));
    socket.on("data", (chunk) => {
      text += chunk.toString();
      if (text.length > 65536) {
        socket.destroy();
        finish(new Error("Invalid control response"));
        return;
      }
      if (text.includes("\n")) {
        socket.end();
        try {
          finish(undefined, JSON.parse(text.split("\n")[0]));
        } catch (error) {
          finish(error);
        }
      }
    });
    socket.once("end", () => {
      if (!text.includes("\n")) finish(new Error("Helper control closed"));
    });
  });
}

async function persistPaneState(state) {
  paneStateWrites = paneStateWrites.catch(() => {}).then(async () => {
    const temporary = `${paneStatePath}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
    await writeFile(temporary, `${JSON.stringify(state)}\n`, { mode: 0o600, flag: "wx" });
    await rename(temporary, paneStatePath);
  });
  return paneStateWrites;
}
let paneStateWrites = Promise.resolve();

async function supervise() {
  const token = randomBytes(32).toString("hex");
  // Messaging is on by default; "enableWrites": false in connector.json (read by the connector itself) turns it off.
  const childArgs = [connectorEntry, "connect", "--managed"];
  if (process.env.PEERBAND_RUNTIME === "mock")
    childArgs.push("--runtime", "mock");
  if (process.env.PEERBAND_CONNECTOR_CONFIG)
    childArgs.push("--config", process.env.PEERBAND_CONNECTOR_CONFIG);
  let child = null;
  let stopping = true;
  let finalStop = false;
  let owner = null;
  let connectionState = "disabled";
  let activity = [];
  try {
    const previous = JSON.parse(await readFile(paneStatePath, "utf8"));
    activity = createPaneSnapshot(previous).activity;
  } catch { /* first run */ }
  const currentSnapshot = () => createPaneSnapshot({
    state: finalStop || !child || stopping ? "stopping" : "running",
    connectionState,
    activity,
  });
  const save = () => persistPaneState(currentSnapshot()).catch(() => {});
  const server = createServer((socket) => {
    let buffer = "";
    let authenticated = false;
    let uiOwned = false;
    socket.setTimeout(3000, () => socket.destroy());
    socket.on("error", () => {});
    socket.on("close", () => {
      if (uiOwned && owner === socket) {
        owner = null;
        stopSupervisor();
      }
    });
    const reply = (value, end = false) => {
      if (!socket.destroyed) socket.write(JSON.stringify(value) + "\n", () => { if (end) socket.end(); });
    };
    const handle = (input) => {
      if (!authenticated) {
        if (typeof input.token !== "string" || !matches(token, input.token)) { socket.destroy(); return; }
        authenticated = true;
        socket.setTimeout(0);
        if (!input.command) return;
      }
      if (input.command === "attach-ui") {
        if (owner && owner !== socket) { reply({ error: "ui-owned" }, true); return; }
        owner = socket;
        uiOwned = true;
        if (!child) startChild();
        reply(currentSnapshot());
      } else if (input.command === "status") reply(currentSnapshot(), true);
      else if (input.command === "stop") {
        reply({ state: "stopping" }, true);
        stopSupervisor();
      } else if (uiOwned && owner === socket && input.command === "ui-status") reply(currentSnapshot());
      else if (uiOwned && owner === socket && input.command === "ui-enable") {
        if (child && stopping) { reply({ error: "busy" }); return; }
        if (!child) startChild();
        reply(currentSnapshot());
      } else if (uiOwned && owner === socket && input.command === "ui-disable") {
        stopChild();
        reply({ ...currentSnapshot(), state: "stopping" });
      } else if (uiOwned && owner === socket && input.command === "ui-close") {
        reply({ state: "stopping" }, true);
        stopSupervisor();
      } else socket.destroy();
    };
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      if (buffer.length > 4096) { socket.destroy(); return; }
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        try { handle(JSON.parse(line)); } catch { socket.destroy(); return; }
        if (socket.destroyed) return;
      }
    });
  });
  const cleanup = async () => {
    if (owner) { const previous = owner; owner = null; previous.destroy(); }
    server.close();
    if (process.platform !== "win32") await unlink(channel).catch(() => {});
    await unlink(recordPath).catch(() => {});
    await rmdir(lock).catch(() => {});
  };
  let cleaning = false;
  const finish = () => {
    if (cleaning) return;
    cleaning = true;
    void persistPaneState(createPaneSnapshot({ state: "stopping", connectionState: "disabled", activity })).finally(cleanup);
  };
  const stopChild = () => {
    if (!child || stopping) return;
    stopping = true;
    connectionState = "disabled";
    const current = child;
    if (current.connected) current.send({ type: "peerband:shutdown" }, () => {});
    else current.kill("SIGTERM");
    const timer = setTimeout(() => { if (child === current && stopping) current.kill("SIGTERM"); }, 5000);
    timer.unref();
    save();
  };
  const stopSupervisor = () => {
    if (finalStop) return;
    finalStop = true;
    stopChild();
    if (!child) finish();
  };
  function startChild() {
    if (finalStop || child) return;
    stopping = false;
    connectionState = "connecting";
    const current = spawn(process.execPath, childArgs, {
      cwd: config, stdio: ["ignore", "ignore", "ignore", "ipc"], windowsHide: true, shell: false,
    });
    child = current;
    save();
    current.on("message", (message) => {
      if (child !== current) return;
      const event = normalizePaneEvent(message);
      if (!event) return;
      if (event.kind === "connection") connectionState = stopping && event.state !== "revoked" ? "disabled" : event.state;
      else { activity.push(event); if (activity.length > 100) activity.shift(); }
      save();
    });
    current.once("error", () => {
      if (child !== current) return;
      child = null;
      connectionState = "unavailable";
      if (finalStop || !owner) finish(); else save();
    });
    current.once("exit", () => {
      if (child !== current) return;
      child = null;
      if (stopping) connectionState = "disabled";
      else if (connectionState !== "revoked") connectionState = "unavailable";
      save();
      if (finalStop || !owner) finish();
    });
  }
  server.on("error", () => {
    stopSupervisor();
    process.exitCode = 1;
  });
  process.once("SIGINT", stopSupervisor);
  process.once("SIGTERM", stopSupervisor);
  process.once("SIGHUP", stopSupervisor);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(channel, resolve);
  });
  await writeFile(recordPath, JSON.stringify({ token, ...ownerIdentity() }), {
    mode: 0o600,
    flag: "wx",
  });
  if (process.argv[3] !== "--await-ui") startChild();
  else if (!owner) {
    const idleTimer = setTimeout(() => { if (!owner) stopSupervisor(); }, 15_000);
    idleTimer.unref();
  }
}

async function assertConnectorEntry() {
  try { await access(connectorEntry); }
  catch { throw new Error(`PeerBand connector not found at ${connectorEntry}. Reinstall the plugin with \`peerband herdr install\` (a source checkout needs \`npm run build\` first).`); }
}

function lockError(verdict) {
  return new Error(
    `Another PeerBand helper still holds the relay lock (${verdict.reason}). ` +
    "Stop it with `peerband herdr install` (restarts the relay cleanly) or end that process, then try again.",
  );
}

// Removes the helper lock when its owner is provably gone (dead pid, or a legacy lock nobody answers for).
async function reclaimStaleHelperLock() {
  const result = await reclaimIfStale({
    lockDir: lock,
    ownerFile: recordPath,
    channel,
    processPattern: SUPERVISOR_PATTERN,
    log: (message) => console.error(`peerband: ${message}`),
  });
  if (result.reclaimed) await resetRelayState(paneStatePath).catch(() => {});
  return result;
}

// Takes the helper lock for `start`. Returns false when a running helper already answered (its status is printed).
async function acquireForStart() {
  for (let round = 0; round < 3; round++) {
    try {
      await mkdir(lock, { mode: 0o700 });
      return true;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    let existing = null;
    try { existing = await request("status"); } catch { /* not answering */ }
    if (existing && existing.state === "running") {
      console.log(JSON.stringify(existing));
      return false;
    }
    if (existing && existing.state === "stopping") {
      for (let attempt = 0; attempt < 50; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        try {
          const current = await request("status");
          if (current.state === "running") {
            console.log(JSON.stringify(current));
            return false;
          }
        } catch { break; }
      }
      continue;
    }
    if (existing) throw new Error("Existing helper is still changing state.");
    const { reclaimed, verdict } = await reclaimStaleHelperLock();
    if (!reclaimed && verdict.state !== "absent") throw lockError(verdict);
  }
  throw new Error("Existing helper could not be safely restarted.");
}

async function main() {
  const command = process.argv[2];
  if (command === "supervise") {
    await supervise();
    return;
  }
  if (command === "start-ui") {
    await assertConnectorEntry();
    await mkdir(config, { recursive: true, mode: 0o700 });
    try {
      const existing = await request("status");
      console.log(JSON.stringify(existing));
      return;
    } catch {
      const { reclaimed, verdict } = await reclaimStaleHelperLock();
      if (!reclaimed && verdict.state !== "absent") throw lockError(verdict);
    }
    await mkdir(lock, { mode: 0o700 });
    const supervisor = spawn(process.execPath, [script, "supervise", "--await-ui"], {
      cwd: config, detached: true, stdio: "ignore", windowsHide: true, shell: false,
    });
    supervisor.unref();
    for (let attempt = 0; attempt < 30; attempt++) {
      try { console.log(JSON.stringify(await request("status"))); return; }
      catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
    }
    throw new Error("The PeerBand helper did not start. Run `peerband status`, then `peerband login` if you are not logged in.");
  }
  if (command === "start" || command === "enable") {
    await assertConnectorEntry();
    await mkdir(config, { recursive: true, mode: 0o700 });
    if (!(await acquireForStart())) return;
    const supervisor = spawn(process.execPath, [script, "supervise"], {
      cwd: config,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      shell: false,
    });
    supervisor.unref();
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        console.log(JSON.stringify(await request("status")));
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    throw new Error(
      "The PeerBand helper did not start. Run `peerband status`, then `peerband login` if you are not logged in.",
    );
  }
  if (command === "status" || command === "stop" || command === "disable") {
    try {
      console.log(JSON.stringify(await request(command === "disable" ? "stop" : command)));
    } catch (error) {
      if (command !== "status") throw error;
      try {
        console.log(JSON.stringify(fallbackPaneSnapshot(JSON.parse(await readFile(paneStatePath, "utf8")))));
      } catch { throw error; }
    }
    return;
  }
  throw new Error("Usage: lifecycle.mjs start|status|stop");
}
main().catch((error) => {
  console.error(`peerband: ${error.message}`);
  process.exitCode = 1;
});
