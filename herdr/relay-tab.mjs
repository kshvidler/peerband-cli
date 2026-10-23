import { execFile } from "node:child_process";
import { mkdir, readFile, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { relayTabPath } from "./paths.mjs";
import { promisify } from "node:util";

const exec = promisify(execFile);
const pluginId = "peerband";
const entrypoint = "relay";
const markerName = "peerband_relay";
const markerSource = "peerband-relay";
const tabTitle = (enabled) => `PeerBand Relay [${enabled ? "On" : "Off"}]`;
let productionController;

export function describeHerdrFailure(error, binary = "herdr") {
  if (error?.code === "ENOENT") {
    return `Herdr was not found (${binary}). Install Herdr, put it on PATH, or set HERDR_BIN_PATH to its executable.`;
  }
  const detail = safeFailure(error);
  if (/plugin/i.test(detail) && /not found|not installed|unknown|no such|does not exist|not registered/i.test(detail)) {
    return `The PeerBand plugin is not installed in Herdr (${detail}). Run \`peerband herdr install\`.`;
  }
  return detail;
}

function productionOptions() {
  return {
    run: async (args) => {
      const binary = process.env.HERDR_BIN_PATH || "herdr";
      try {
        const result = await exec(binary, args, { timeout: 10_000, windowsHide: true, maxBuffer: 65_536 });
        return parseHerdrCommandOutput(result.stdout, args);
      } catch (error) {
        throw new Error(`${args.slice(0, args[0] === "plugin" ? 3 : 2).join(" ")}: ${describeHerdrFailure(error, binary)}`);
      }
    },
    statePath: relayTabPath(),
    pluginPaneId: process.env.HERDR_PANE_ID,
    warn: (message) => process.stderr.write(`${message}
`),
  };
}

function safeFailure(error) {
  const raw = typeof error?.stderr === "string" && error.stderr.trim() ? error.stderr : error?.message;
  let detail = raw;
  try { const response = JSON.parse(raw); detail = response.error?.message || response.message || "Herdr rejected the command"; } catch { /* CLI parse errors are plain text. */ }
  return String(detail || "Herdr command failed").replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").slice(0, 400);
}

export function parseHerdrCommandOutput(raw, args) {
  const needsData = (args[0] === "pane" && ["get", "list"].includes(args[1])) || (args[0] === "plugin" && args[1] === "pane" && args[2] === "open");
  const text = raw.trim();
  if (!text && !needsData) return {};
  let value;
  try { value = JSON.parse(text); } catch {
    if (!needsData) return {};
    throw new Error("Herdr returned an invalid JSON data response");
  }
  if (value?.ok === false || value?.error) throw new Error(value.error?.message || "Herdr command failed");
  if (!value || typeof value !== "object") {
    if (!needsData) return {};
    throw new Error("Herdr returned no pane data");
  }
  return value.result ?? value;
}

async function readRecord(statePath) {
  try {
    const value = JSON.parse(await readFile(statePath, "utf8"));
    if (value?.version === 1 && typeof value.paneId === "string" && typeof value.marker === "string") return value;
  } catch { /* Missing or corrupt state is treated as unowned. */ }
  return undefined;
}

async function writeRecord(statePath, record) {
  await mkdir(dirname(statePath), { recursive: true });
  const temporary = `${statePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(record), { encoding: "utf8", mode: 0o600, flag: "wx" });
    await rename(temporary, statePath);
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}

async function withLaunchLock(statePath, action) {
  const lockPath = `${statePath}.launch-lock`;
  await mkdir(dirname(statePath), { recursive: true });
  const deadline = Date.now() + 5_000;
  while (true) {
    try {
      await mkdir(lockPath);
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      let stale = false;
      try {
        const info = await stat(lockPath);
        if (Date.now() - info.mtimeMs > 120_000) {
          const quarantine = `${lockPath}.stale-${randomUUID()}`;
          await rename(lockPath, quarantine).then(() => rmdir(quarantine)).catch(() => {});
          stale = true;
        }
      } catch { stale = true; }
      if (stale) continue;
      if (Date.now() >= deadline) throw new Error("Another PeerBand Relay tab launch is already in progress");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  try { return await action(); }
  finally { await rmdir(lockPath).catch(() => {}); }
}

async function inspectOwned(run, record) {
  if (!record) return undefined;
  let pane;
  try { pane = (await run(["pane", "get", record.paneId])).pane; }
  catch { return undefined; }
  if (!pane || pane.pane_id !== record.paneId || pane.tokens?.[markerName] !== record.marker) return undefined;
  return pane;
}

// A pane carrying our ownership marker token, i.e. one opened (and verified) by a Relay tab controller.
async function findMarkedPane(run) {
  let listed;
  try { listed = (await run(["pane", "list"])).panes; }
  catch { return undefined; }
  if (!Array.isArray(listed)) return undefined;
  return listed.find((item) => typeof item?.pane_id === "string" && typeof item.tokens?.[markerName] === "string" && item.tokens[markerName]);
}

async function renameOwnedSinglePaneTab(run, pane, label) {
  if (!pane?.workspace_id || !pane?.tab_id || !pane?.pane_id) return false;
  let listed;
  try { listed = (await run(["pane", "list", "--workspace", pane.workspace_id])).panes; }
  catch { return false; }
  if (!Array.isArray(listed)) return false;
  const inTab = listed.filter((item) => item.tab_id === pane.tab_id);
  if (inTab.length !== 1 || inTab[0]?.pane_id !== pane.pane_id) return false;
  await run(["tab", "rename", pane.tab_id, label]);
  return true;
}

export function createRelayTabController({ run, statePath, pluginPaneId = "", newMarker = randomUUID, warn = () => {} }) {
  if (typeof run !== "function" || typeof statePath !== "string") throw new TypeError("run and statePath are required");
  const lastVerifiedTitle = new Map();

  async function sync(enabled) {
    if (typeof pluginPaneId !== "string" || !pluginPaneId) return false;
    const record = await readRecord(statePath);
    if (!record || record.paneId !== pluginPaneId) return false;
    const pane = await inspectOwned(run, record);
    if (!pane) return false;
    try {
      const label = tabTitle(enabled);
      const key = `${pane.pane_id}\u0000${pane.tab_id}`;
      if (lastVerifiedTitle.get(key) === label) return true;
      const renamed = await renameOwnedSinglePaneTab(run, pane, label);
      if (renamed) lastVerifiedTitle.set(key, label);
      return renamed;
    }
    catch { return false; }
  }

  async function close() {
    const record = await readRecord(statePath);
    if (!record || pluginPaneId !== record.paneId) return false;
    if (!await inspectOwned(run, record)) return false;
    try {
      await run(["plugin", "pane", "close", record.paneId]);
      await rm(statePath, { force: true });
      return true;
    } catch { return false; }
  }

  async function open() {
    return withLaunchLock(statePath, async () => {
      const previous = await readRecord(statePath);
      const pane = await inspectOwned(run, previous);
      if (pane) {
        await run(["plugin", "pane", "focus", pane.pane_id]);
        return pane.pane_id;
      }
      // The record is missing or stale (another config, a crash, Herdr restarted), but a Relay pane this
      // controller marked earlier may still be open: adopt and focus it instead of opening a duplicate.
      const existing = await findMarkedPane(run);
      if (existing) {
        await writeRecord(statePath, { version: 1, paneId: existing.pane_id, marker: existing.tokens[markerName] });
        await run(["plugin", "pane", "focus", existing.pane_id]);
        return existing.pane_id;
      }

      // A stale state file never authorizes closing or renaming its old pane. Replace it with a
      // fresh random ownership marker only after Herdr returns a validated plugin pane.
      const result = await run(["plugin", "pane", "open", "--plugin", pluginId, "--entrypoint", entrypoint, "--placement", "tab", "--focus"]);
      const opened = result.plugin_pane;
      if (opened?.plugin_id !== pluginId || opened?.entrypoint !== entrypoint || typeof opened.pane?.pane_id !== "string") {
        throw new Error("Herdr did not return the expected plugin pane");
      }
      const record = { version: 1, paneId: opened.pane.pane_id, marker: newMarker() };
      try {
        // Set the initial label before publishing the marker: the owning UI can begin
        // reporting On immediately after it sees that marker, and must win that race.
        await renameOwnedSinglePaneTab(run, opened.pane, tabTitle(false)).catch((error) => {
          warn(`Relay tab opened; its initial title could not be set: ${safeFailure(error)}`);
        });
        await writeRecord(statePath, record);
        await run(["pane", "report-metadata", record.paneId, "--source", markerSource, "--token", `${markerName}=${record.marker}`]);
        const marked = await inspectOwned(run, record);
        if (!marked) throw new Error("Herdr did not retain the plugin pane ownership marker");
        return record.paneId;
      } catch (error) {
        await run(["plugin", "pane", "close", record.paneId]).catch(() => {});
        const current = await readRecord(statePath);
        if (current?.paneId === record.paneId && current.marker === record.marker) await rm(statePath, { force: true }).catch(() => {});
        throw error;
      }
    });
  }

  return { open, sync, close };
}

function getProductionController() {
  productionController ??= createRelayTabController(productionOptions());
  return productionController;
}

export async function syncRelayTab(enabled) {
  return getProductionController().sync(Boolean(enabled));
}

export async function closeRelayTab() {
  return getProductionController().close();
}

// Shared with the `peerband relay` CLI command. `options` (run, statePath, pluginPaneId, newMarker, warn)
// override the production defaults and are mainly useful for tests and embedding.
export async function openRelayTab(options) {
  const controller = options
    ? createRelayTabController({ ...productionOptions(), ...options })
    : getProductionController();
  return controller.open();
}
