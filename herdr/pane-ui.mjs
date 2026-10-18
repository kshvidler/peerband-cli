import { emitKeypressEvents } from "node:readline";
import { stdin, stdout } from "node:process";
import { paneLabel } from "./pane-state.mjs";

const timeLabel = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "--:--:--" : date.toLocaleTimeString();
};
const safeText = (value, maximum = 160) => String(value ?? "").replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\)?)/g, "").replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").slice(0, maximum);

// "Messages" is the connector's write state: allowed by default, read-only when connector.json says "enableWrites": false.
export const messagesLine = (messages) => messages === "read-only"
  ? "Messages  read-only"
  : messages === "allowed"
    ? 'Messages  allowed (turn off: "enableWrites": false in connector.json)'
    : "";

// 1-based screen rows of the on/off box; the Account row is only shown when the server returned an email.
export const controlBoxRows = (email) => (email ? [7, 9] : [6, 8]);

export function renderPane({ snapshot, identity, email, messages, error, columns = Infinity, rows: height = Infinity }) {
  const label = paneLabel(snapshot);
  const enabled = snapshot?.state === "running";
  const width = Number.isFinite(columns) ? Math.max(1, Math.floor(columns)) : Infinity;
  const heightLimit = Number.isFinite(height) ? Math.max(1, Math.floor(height)) : Infinity;
  const clipLine = (line) => Number.isFinite(width) ? Array.from(line).slice(0, width).join("") : line;
  if (heightLimit < 13) {
    const compactRows = [
      `RELAY ${enabled ? "ON" : "OFF"} · ${safeText(label, 20)}`,
      email ? `Account ${safeText(email)}` : `Machine ${safeText(identity || "Unavailable")}`,
      "Space / Enter  toggle",
      "q / Esc  close relay",
      "Close disconnects; reopen: peerband relay",
      ...(messages ? [`Messages ${messages === "read-only" ? "read-only" : "allowed"}`] : []),
    ];
    return compactRows.slice(0, heightLimit).map(clipLine).join("\n");
  }
  const boxWidth = Number.isFinite(width) ? Math.min(42, width) : 42;
  const innerWidth = Math.max(0, boxWidth - 2);
  const boxLine = (content) => `│${safeText(content).padEnd(innerWidth).slice(0, innerWidth)}│`;
  const fixedRows = [
    "PeerBand · Herdr control",
    "─".repeat(Number.isFinite(width) ? Math.max(0, Math.min(40, width)) : 40),
    `Machine   ${safeText(identity || "Unavailable")}`,
    ...(email ? [`Account   ${safeText(email)}`] : []),
    "",
    `┌${"─".repeat(innerWidth)}┐`,
    boxLine(`  RELAY   ${enabled ? "● ON " : "○ OFF"}   ${safeText(label, 20)}`),
    boxLine(Number.isFinite(width) && width < 42
      ? `  [Space/Enter] ${enabled ? "Off" : "On"}`
      : `  [Space / Enter]  ${enabled ? "Turn off" : "Turn on"}`),
    `└${"─".repeat(innerWidth)}┘`,
    safeText(messagesLine(messages)),
    "Recent activity  ·  metadata only",
  ];
  const activities = (snapshot?.activity ?? []).slice(-8).reverse().map((item) =>
    `${timeLabel(item.at)}  ${safeText(item.tool, 40)}  ${safeText(item.target || "—", 28)}  ${safeText(item.outcome, 32)}  ${item.latencyMs} ms  ${safeText(item.requestId, 12)}`);
  const errorRow = error ? `! ${safeText(error)}` : "";
  const footers = ["Space / Enter  toggle     q / Esc  close relay", "Close disconnects · reopen: peerband relay"];
  const heightBounded = Number.isFinite(heightLimit);
  const availableRows = heightBounded ? heightLimit - fixedRows.length - footers.length : 8;
  const showError = Boolean(errorRow && (!heightBounded || availableRows > 0));
  const activityCapacity = heightBounded ? Math.max(0, availableRows - (showError ? 1 : 0)) : 8;
  const visibleActivities = activities.slice(0, activityCapacity);
  const activityRows = visibleActivities.length
    ? visibleActivities
    : activities.length === 0 && availableRows > (showError ? 1 : 0)
      ? ["No recent activity"]
      : [];
  const body = [...fixedRows, ...activityRows, ...(showError ? [errorRow] : []), ...footers];
  return body.map(clipLine).join("\n");
}

export function startPaneInput({ onToggle, onClose, input = stdin, output = stdout, boxRows = [7, 9] }) {
  if (!input.isTTY || !input.setRawMode) return () => {};
  const wasRaw = input.isRaw;
  const mouseEnabled = !Number.isFinite(output.rows) || output.rows >= 13;
  emitKeypressEvents(input);
  input.setRawMode(true);
  if (mouseEnabled) output.write("\x1b[?1000h\x1b[?1006h");
  let mouseBuffer = "";
  const keypress = (_text, key = {}) => {
    if (key.name === "space" || key.name === "return") onToggle();
    else if (key.name === "q" || key.name === "escape" || (key.ctrl && key.name === "c")) onClose();
  };
  const data = (chunk) => {
    mouseBuffer = (mouseBuffer + chunk.toString("utf8")).slice(-256);
    const match = /\x1b\[<0;(\d+);(\d+)M/.exec(mouseBuffer);
    const column = Number(match?.[1]);
    const row = Number(match?.[2]);
    const boxWidth = Number.isFinite(output.columns) ? Math.max(1, Math.min(42, Math.floor(output.columns))) : 42;
    const hasControlBox = !Number.isFinite(output.rows) || output.rows >= 13;
    if (mouseEnabled && hasControlBox && match && row >= boxRows[0] && row <= boxRows[1] && column >= 1 && column <= boxWidth) onToggle();
    if (mouseBuffer.includes("M")) mouseBuffer = "";
  };
  input.on("keypress", keypress);
  input.on("data", data);
  return () => {
    input.off("keypress", keypress);
    input.off("data", data);
    if (mouseEnabled) output.write("\x1b[?1000l\x1b[?1006l");
    input.setRawMode(Boolean(wasRaw));
    input.pause?.();
  };
}
