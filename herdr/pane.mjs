import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stdout } from "node:process";
import { renderPane, startPaneInput } from "./pane-ui.mjs";
import { connectControl } from "./control.mjs";
import { syncRelayTab, closeRelayTab } from "./relay-tab.mjs";
import { credentialsPath } from "./paths.mjs";

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const lifecycle = join(here, "lifecycle.mjs");
const credentials = await readFile(credentialsPath(), "utf8").then(JSON.parse).catch(() => ({}));
const identity = typeof credentials.machineName === "string" && credentials.machineName
  ? credentials.machineName
  : typeof credentials.installationId === "string" && credentials.installationId
    ? `Installation ${credentials.installationId}`
    : "Not logged in (run `peerband login`)";
const email = typeof credentials.accountEmail === "string" && credentials.accountEmail ? credentials.accountEmail : "Unavailable";

let closing = false;
let pending = false;
let refreshGeneration = 0;
let refreshInFlight = false;
let closeArmed = false;
let busyError = false;
let snapshot = { state: "stopping", connectionState: "disabled", activity: [] };
let errorText = "";
let timer;
let control;
let controlBuffer = "";
const replies = [];
let ownsUi = false;
let controlClosed;
const closed = new Promise((resolve) => { controlClosed = resolve; });
function draw() {
  if (closing || !stdout.isTTY) return;
  stdout.write("\x1b[2J\x1b[H" + renderPane({ snapshot, identity, email, error: errorText, columns: stdout.columns, rows: stdout.rows }));
}
async function runLifecycle(command) {
  const { stdout: result } = await exec(process.execPath, [lifecycle, command], { timeout: 5000, windowsHide: true, maxBuffer: 65_536 });
  return JSON.parse(result.trim());
}
async function refresh() {
  if (closing || pending || refreshInFlight) return;
  refreshInFlight = true;
  const generation = refreshGeneration;
  try {
    const next = await sendUi("ui-status");
    if (generation === refreshGeneration) { snapshot = next; if (!busyError) errorText = ""; void syncRelayTab(next.state === "running").catch(() => {}); }
  } catch {
    if (generation !== refreshGeneration) return;
    snapshot = { state: "stopping", connectionState: "helper-unavailable", activity: [] };
    errorText = "Helper control channel unavailable. Reopen peerband relay to reconnect.";
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
  stopInput();
  process.stdin.off("end", onInputEnd);
  process.stdin.off("close", onInputEnd);
  process.off("SIGINT", onSignal);
  process.off("SIGTERM", onSignal);
  process.off("SIGHUP", onSignal);
  stdout.write("\x1b[2J\x1b[HDisconnecting PeerBand relay…\n");
  if (ownsUi) {
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
const stopInput = startPaneInput({ onToggle: toggle, onClose: () => {
  if (closeArmed) { void close(); return; }
  closeArmed = true;
  errorText = "Closing disconnects the relay. Press q again to close; reopen with `peerband relay`.";
  draw();
} });
if (stdinIsInteractive()) {
  process.stdin.once("end", onInputEnd);
  process.stdin.once("close", onInputEnd);
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  process.once("SIGHUP", onSignal);
}
if (!stdinIsInteractive()) {
  console.log(renderPane({ snapshot, identity, email, error: "Interactive terminal controls are required in this pane." }));
} else {
  try {
    try { control = await connectControl(); }
    catch {
      await runLifecycle("start-ui");
      control = await connectControl();
    }
    if (closing) { control.destroy(); }
    else {
      control.on("data", (chunk) => {
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
      control.on("close", () => { controlClosed(); rejectReplies(new Error("Relay owner channel closed")); });
      control.on("error", () => { controlClosed(); rejectReplies(new Error("Relay owner channel failed")); });
      const attached = await sendUi("attach-ui");
      if (attached.error === "ui-owned") throw new Error("Another relay pane already owns this installation. Close it before reopening.");
      ownsUi = true;
      snapshot = attached;
      const enabled = await sendUi("ui-enable");
      snapshot = enabled;
      void syncRelayTab(enabled.state === "running").catch(() => {});
      draw();
      await refresh();
      timer = setInterval(refresh, 1000);
      timer.unref();
    }
  } catch (error) {
    if (!closing) {
      errorText = error.message;
      snapshot = { state: "stopping", connectionState: "helper-unavailable", activity: [] };
      draw();
      if (control) control.destroy();
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
