import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stdout } from "node:process";
import { renderPane, startPaneInput, controlBoxRows } from "./pane-ui.mjs";
import { connectControl } from "./control.mjs";
import { syncRelayTab, closeRelayTab } from "./relay-tab.mjs";
import { credentialsPath, connectorConfigPath } from "./paths.mjs";

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const lifecycle = join(here, "lifecycle.mjs");
const credentials = await readFile(credentialsPath(), "utf8").then(JSON.parse).catch(() => ({}));
const identity = typeof credentials.machineName === "string" && credentials.machineName
  ? credentials.machineName
  : typeof credentials.installationId === "string" && credentials.installationId
    ? `Installation ${credentials.installationId}`
    : "Not logged in (run `peerband login`)";
// No email (the server did not return one) is not an error: the Account row is simply not shown.
const email = typeof credentials.accountEmail === "string" && credentials.accountEmail ? credentials.accountEmail : "";
// Messages to agents are allowed unless connector.json says "enableWrites": false (same rule as `peerband connect`).
const connectorConfig = await readFile(connectorConfigPath(), "utf8").then(JSON.parse).catch(() => ({}));
const messages = connectorConfig && connectorConfig.enableWrites === false ? "read-only" : "allowed";

let closing = false;
let pending = false;
let refreshGeneration = 0;
let refreshInFlight = false;
let closeArmed = false;
let busyError = false;
let snapshot = { state: "stopping", connectionState: "disabled", activity: [] };
let errorText = "";
let timer;
let reconnectTimer;
let control;
let controlBuffer = "";
const replies = [];
let ownsUi = false;
// Resolves when the current control socket has closed (replaced for every new socket).
let closed = Promise.resolve();
// While the helper is gone, the pane keeps trying to re-attach (without starting a helper itself), so a relay started
// another way (the plugin's Start action, `peerband relay`) is picked up and the tab label follows the real state.
const RECONNECT_MS = 2000;
const UNAVAILABLE = "Relay helper is not running. Press Space to start it, or run `peerband relay`.";

function draw() {
  if (closing || !stdout.isTTY) return;
  stdout.write("\x1b[2J\x1b[H" + renderPane({ snapshot, identity, email, messages, error: errorText, columns: stdout.columns, rows: stdout.rows }));
}
async function runLifecycle(command) {
  const { stdout: result } = await exec(process.execPath, [lifecycle, command], { timeout: 5000, windowsHide: true, maxBuffer: 65_536 });
  return JSON.parse(result.trim());
}
const controlAlive = () => Boolean(control && !control.destroyed);
function showUnavailable(message = UNAVAILABLE) {
  snapshot = { state: "stopping", connectionState: "helper-unavailable", activity: snapshot?.activity ?? [] };
  errorText = message;
  void syncRelayTab(false).catch(() => {});
}
async function refresh() {
  if (closing || pending || refreshInFlight) return;
  if (!controlAlive()) { scheduleReconnect(); return; }
  refreshInFlight = true;
  const generation = refreshGeneration;
  try {
    const next = await sendUi("ui-status");
    if (generation === refreshGeneration) { snapshot = next; if (!busyError) errorText = ""; void syncRelayTab(next.state === "running").catch(() => {}); }
  } catch {
    if (generation !== refreshGeneration) return;
    showUnavailable();
  } finally { refreshInFlight = false; }
  draw();
}
async function toggle() {
  if (pending || closing) return;
  pending = true;
  refreshGeneration++;
  errorText = "";
  busyError = false;
  closeArmed = false;
  draw();
  try {
    if (!controlAlive()) {
      // No helper: Space starts one, like opening the tab does.
      await attach({ start: true });
      return;
    }
    const next = await sendUi(snapshot?.state === "running" ? "ui-disable" : "ui-enable");
    if (next.error === "busy") throw new Error("The relay is still stopping. Try On again in a moment.");
    snapshot = next;
    void syncRelayTab(next.state === "running").catch(() => {});
  } catch (error) {
    errorText = error.message || "Could not change the connection. Check enrollment and the helper owner.";
    busyError = error.message === "The relay is still stopping. Try On again in a moment.";
  } finally {
    pending = false;
    await refresh();
  }
}
async function close() {
  if (closing) return;
  closing = true;
  clearInterval(timer);
  clearTimeout(reconnectTimer);
  stopInput();
  process.stdin.off("end", onInputEnd);
  process.stdin.off("close", onInputEnd);
  process.off("SIGINT", onSignal);
  process.off("SIGTERM", onSignal);
  process.off("SIGHUP", onSignal);
  stdout.write("\x1b[2J\x1b[HDisconnecting PeerBand relay…\n");
  if (ownsUi && controlAlive()) {
    try { await sendUi("ui-close"); } catch { /* socket closure also owns final cleanup */ }
    control?.end();
  } else control?.destroy();
  if (control) {
    await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, 8000))]);
    if (!control.destroyed) control.destroy();
  }
  if (ownsUi) stdout.write("PeerBand relay disconnected. Reopen with `peerband relay`.\n");
  await closeRelayTab().catch(() => {});
  process.exitCode = 0;
}
const onInputEnd = () => { void close(); };
const onSignal = () => { void close(); };
const stopInput = startPaneInput({ boxRows: controlBoxRows(email), onToggle: toggle, onClose: () => {
  if (closeArmed) { void close(); return; }
  closeArmed = true;
  errorText = "Closing disconnects the relay. Press q again to close; reopen with `peerband relay`.";
  draw();
} });

function wireControl(socket) {
  let resolveClosed;
  closed = new Promise((resolve) => { resolveClosed = resolve; });
  controlBuffer = "";
  socket.on("data", (chunk) => {
    if (control !== socket) return;
    controlBuffer += chunk.toString();
    if (controlBuffer.length > 65_536) { failControl(new Error("Invalid relay control response")); return; }
    let newline;
    while ((newline = controlBuffer.indexOf("\n")) >= 0) {
      const line = controlBuffer.slice(0, newline);
      controlBuffer = controlBuffer.slice(newline + 1);
      let value;
      try { value = JSON.parse(line); } catch { failControl(new Error("Invalid relay control response")); return; }
      const request = replies.shift();
      if (request) { clearTimeout(request.timer); request.resolve(value); }
    }
  });
  let lost = false;
  const onLost = (message) => {
    if (lost) return;
    lost = true;
    resolveClosed();
    if (control !== socket) return;
    rejectReplies(new Error(message));
    if (closing) return;
    ownsUi = false;
    showUnavailable(errorText || UNAVAILABLE);
    draw();
    scheduleReconnect();
  };
  socket.on("close", () => onLost("Relay owner channel closed"));
  socket.on("error", () => onLost("Relay owner channel failed"));
}

// Connects to the helper and takes UI ownership. `start`: start a helper if none answers and turn the relay on.
async function attach({ start }) {
  let socket;
  try { socket = await connectControl(); }
  catch (error) {
    if (!start) throw error;
    await runLifecycle("start-ui");
    socket = await connectControl();
  }
  if (closing) { socket.destroy(); return; }
  control = socket;
  wireControl(socket);
  const attached = await sendUi("attach-ui");
  if (attached.error === "ui-owned") throw new Error("Another relay pane already owns this installation. Close it before reopening.");
  ownsUi = true;
  snapshot = start ? await sendUi("ui-enable") : attached;
  errorText = "";
  void syncRelayTab(snapshot.state === "running").catch(() => {});
  draw();
  if (!timer) {
    timer = setInterval(refresh, 1000);
    timer.unref();
  }
}

// `start` (used once, after the first attempt failed, e.g. a slow first start right after an update) may start a
// helper; later retries only re-attach to one that something else started.
function scheduleReconnect(start = false) {
  if (closing || reconnectTimer || controlAlive()) return;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = undefined;
    if (closing || controlAlive() || pending) { if (!controlAlive()) scheduleReconnect(); return; }
    try { await attach({ start }); }
    catch (error) {
      if (control && !control.destroyed) control.destroy();
      if (/already owns/.test(error.message || "")) { errorText = error.message; draw(); }
      scheduleReconnect();
    }
  }, RECONNECT_MS);
}

if (stdinIsInteractive()) {
  process.stdin.once("end", onInputEnd);
  process.stdin.once("close", onInputEnd);
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  process.once("SIGHUP", onSignal);
}
if (!stdinIsInteractive()) {
  console.log(renderPane({ snapshot, identity, email, messages, error: "Interactive terminal controls are required in this pane." }));
} else {
  try {
    await attach({ start: true });
    await refresh();
  } catch (error) {
    if (!closing) {
      if (control && !control.destroyed) control.destroy();
      showUnavailable(error.message);
      draw();
      scheduleReconnect(!/already owns/.test(error.message || ""));
    }
  }
}


function sendUi(command) {
  return new Promise((resolve, reject) => {
    if (!control || control.destroyed) { reject(new Error("Relay owner channel is closed")); return; }
    const request = { resolve, reject, timer: undefined };
    request.timer = setTimeout(() => failControl(new Error("Relay owner request timed out")), 3000);
    replies.push(request);
    control.write(JSON.stringify({ command }) + "\n");
  });
}

function rejectReplies(error) {
  for (const request of replies.splice(0)) {
    clearTimeout(request.timer);
    request.reject(error);
  }
}

function failControl(error) {
  control?.destroy();
  rejectReplies(error);
}

function stdinIsInteractive() { return Boolean(process.stdin.isTTY && process.stdin.setRawMode); }
