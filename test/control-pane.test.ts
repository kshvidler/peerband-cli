import { expect, it } from "vitest";
import { EventEmitter } from "node:events";
// @ts-expect-error -- plain JS plugin module without type declarations
import { normalizePaneEvent, createPaneSnapshot, fallbackPaneSnapshot, paneLabel } from "../herdr/pane-state.mjs";
// @ts-expect-error -- plain JS plugin module without type declarations
import { controlBoxRows, renderPane, startPaneInput } from "../herdr/pane-ui.mjs";
// @ts-expect-error -- plain JS plugin module without type declarations
import { renderTelegram, telegramQr, TELEGRAM_URL } from "../herdr/telegram.mjs";

it("keeps only bounded allowlisted activity metadata", () => {
  const event = normalizePaneEvent({
    type: "peerband:pane-event",
    kind: "activity",
    requestId: "request-123",
    tool: "send_agent_message",
    target: "agent-1",
    outcome: "uncertain",
    latencyMs: 999_999_999,
    message: "private message",
    credential: "secret-token",
  });
  expect(event).toMatchObject({ kind: "activity", requestId: "request-123", tool: "send_agent_message", target: "agent-1", outcome: "uncertain", latencyMs: 86_400_000 });
  expect(JSON.stringify(event)).not.toContain("private message");
  expect(JSON.stringify(event)).not.toContain("secret-token");
  expect(normalizePaneEvent({ type: "peerband:pane-event", kind: "activity", requestId: "x", tool: "unknown", outcome: "success", latencyMs: 1 })).toBeNull();
});

it("shows distinct connection failures and caps the visible snapshot", () => {
  expect(paneLabel({ state: "running", connectionState: "connecting" })).toBe("Connecting");
  expect(paneLabel({ state: "running", connectionState: "reconnecting" })).toBe("Reconnecting");
  expect(paneLabel({ state: "stopping", connectionState: "revoked" })).toBe("Access revoked");
  expect(paneLabel({ state: "running", connectionState: "limit-reached" })).toBe("Plan limit reached");
  expect(paneLabel({ state: "running", connectionState: "unavailable" })).toBe("Herdr unavailable");
  expect(paneLabel({ state: "running", connectionState: "remote-unavailable" })).toBe("PeerBand unavailable");
  expect(paneLabel({ state: "stopping", connectionState: "helper-unavailable" })).toBe("Helper unavailable");
  const activity = Array.from({ length: 200 }, (_, index) => ({ at: "2026-10-10T10:00:00Z", requestId: `${index}`, tool: "list_agents", outcome: "success", latencyMs: 1 }));
  expect(createPaneSnapshot({ state: "running", connectionState: "connected", activity }).activity).toHaveLength(100);
  expect(fallbackPaneSnapshot({ state: "running", connectionState: "connected", activity }).connectionState).toBe("helper-unavailable");
  expect(fallbackPaneSnapshot({ state: "running", connectionState: "revoked", activity }).connectionState).toBe("revoked");
  expect(fallbackPaneSnapshot({ state: "stopping", connectionState: "disabled", activity }).connectionState).toBe("disabled");
});

it("renders identity and metadata activity without message or output previews", () => {
  const view = renderPane({
    snapshot: { state: "running", connectionState: "connected", activity: [{ at: "2026-10-10T10:00:00Z", requestId: "request-safe", tool: "list_agents", target: "agent-1", outcome: "success", latencyMs: 15, message: "private message", output: "secret output" }] },
    identity: "Build machine",
    email: "person@example.test",
  });
  expect(view).toContain("Build machine");
  expect(view).toContain("person@example.test");
  expect(view).toContain("Connected");
  expect(view).toContain("RELAY");
  expect(view).toContain("[Space / Enter]");
  expect(view).toContain("request-safe");
  expect(view).toContain("agent-1");
  expect(view).not.toContain("private message");
  expect(view).not.toContain("secret output");
  const hostile = renderPane({ snapshot: { state: "stopping", connectionState: "disabled", activity: [] }, identity: "a\u009bb", email: "ok", error: "bad\u009cerror\u001b[2J" });
  expect(hostile).not.toContain("\u009b");
  expect(hostile).not.toContain("\u009c");
  expect(hostile).not.toContain("\u001b");
  expect(hostile).toContain("bad error");
});

it("shows the Messages state, allowed by default and read-only on request", () => {
  const snapshot = { state: "running", connectionState: "connected", activity: [] };
  const allowed = renderPane({ snapshot, identity: "m", email: "a@b.c", messages: "allowed" });
  expect(allowed).toContain('Messages  allowed (turn off: "enableWrites": false in connector.json)');
  const readOnly = renderPane({ snapshot, identity: "m", email: "a@b.c", messages: "read-only" });
  expect(readOnly).toContain("Messages  read-only");
  expect(readOnly).not.toContain("turn off");
  // Compact layouts keep a short version after the controls.
  expect(renderPane({ snapshot, identity: "m", email: "a@b.c", messages: "read-only", columns: 40, rows: 6 })).toContain("Messages read-only");
});

it("hides the Account row (instead of showing Unavailable) when there is no email", () => {
  const snapshot = { state: "running", connectionState: "connected", activity: [] };
  const view = renderPane({ snapshot, identity: "Build machine", email: "", messages: "allowed", columns: 60, rows: 22 });
  expect(view).toContain("Machine   Build machine");
  expect(view).not.toContain("Account");
  expect(view).not.toContain("Unavailable");
  const lines = view.split("\n");
  expect(lines.length).toBeLessThanOrEqual(22);
  expect(lines[5]).toContain("RELAY");
  expect(lines[6]).toContain("Space");
  const compact = renderPane({ snapshot, identity: "Build machine", email: undefined, columns: 40, rows: 6 });
  expect(compact).not.toContain("Unavailable");
  expect(compact).toContain("Machine Build machine");
  // The click target follows the layout.
  expect(controlBoxRows("a@b.c")).toEqual([7, 9]);
  expect(controlBoxRows("")).toEqual([6, 8]);
  const input = new EventEmitter() as EventEmitter & { isTTY: boolean; isRaw: boolean; setRawMode(value: boolean): void; pause(): EventEmitter };
  input.isTTY = true;
  input.isRaw = false;
  input.setRawMode = () => {};
  input.pause = () => input;
  let toggles = 0;
  const cleanup = startPaneInput({ onToggle: () => { toggles++; }, onClose: () => {}, input, output: { columns: 40, rows: 20, write: () => true } as never, boxRows: controlBoxRows("") });
  input.emit("data", Buffer.from("\x1b[<0;12;6M"));
  input.emit("data", Buffer.from("\x1b[<0;12;9M"));
  expect(toggles).toBe(1);
  cleanup();
});

it("fits the pane to a compact viewport while keeping controls, identity, and footer visible", () => {
  const view = renderPane({
    snapshot: {
      state: "running",
      connectionState: "connected",
      activity: Array.from({ length: 20 }, (_, index) => ({ at: "2026-10-10T10:00:00Z", requestId: `request-${index}`, tool: "list_agents", target: "agent-1", outcome: "success", latencyMs: 15 })),
    },
    identity: "Build machine",
    email: "person@example.test",
    error: "bad\u001b[2Jerror",
    columns: 40,
    rows: 22,
  });
  const lines = view.split("\n");
  expect(lines).toHaveLength(22);
  expect(lines.every((line: string) => Array.from(line).length <= 40)).toBe(true);
  expect(lines[2]).toContain("Build machine");
  expect(lines[3]).toContain("person@example.test");
  expect(lines[6]).toContain("RELAY");
  expect(lines[7]).toContain("Space/Enter");
  expect(lines.at(-2)).toContain("q / Esc");
  expect(lines.at(-1)).toContain("disconnects");
  expect(lines.join("\n")).not.toContain("\u001b");
  expect(lines.filter((line: string) => /^\d\d:\d\d:\d\d/.test(line))).toHaveLength(8);
});

it.each([1, 6, 8, 12, 13, 20])("renders safely in a %i-row terminal", (height) => {
  const view = renderPane({
    snapshot: { state: "running", connectionState: "connected", activity: [{ at: "2026-10-10T10:00:00Z", requestId: "request-1", tool: "list_agents", outcome: "success", latencyMs: 15 }] },
    identity: "Build machine",
    email: "person@example.test",
    error: "helper unavailable",
    columns: 40,
    rows: height,
  });
  const lines = view.split("\n");
  expect(lines.length).toBeLessThanOrEqual(height);
  expect(lines.every((line: string) => Array.from(line).length <= 40)).toBe(true);
  if (height < 13) {
    expect(view).toContain("RELAY ON");
    if (height >= 2) expect(view).toContain("Account");
    if (height >= 3) expect(view).toContain("Space / Enter");
    expect(view).not.toContain("┌");
  } else {
    expect(lines[6]).toContain("RELAY");
    expect(lines[7]).toContain("Space/Enter");
    expect(lines.at(-2)).toContain("q / Esc");
  }
});

it("supports Space, Enter, SGR mouse toggle and keyboard close", () => {
  const input = new EventEmitter() as EventEmitter & { isTTY: boolean; isRaw: boolean; setRawMode(value: boolean): void; pause(): EventEmitter };
  input.isTTY = true;
  input.isRaw = false;
  input.setRawMode = (value) => { input.isRaw = value; };
  let paused = false;
  input.pause = () => { paused = true; return input; };
  const output = { columns: 36, rows: 20, write: () => true };
  let toggles = 0;
  let closes = 0;
  const cleanup = startPaneInput({ onToggle: () => { toggles++; }, onClose: () => { closes++; }, input, output: output as never });
  input.emit("keypress", " ", { name: "space" });
  input.emit("keypress", "\r", { name: "return" });
  input.emit("data", Buffer.from("\x1b[<0;12;8M"));
  input.emit("data", Buffer.from("\x1b[<0;37;8M"));
  output.rows = 8;
  input.emit("data", Buffer.from("\x1b[<0;12;8M"));
  output.rows = 20;
  input.emit("data", Buffer.from("\x1b[<0;12;5M"));
  input.emit("keypress", "q", { name: "q" });
  expect(toggles).toBe(3);
  expect(closes).toBe(1);
  cleanup();
  expect(input.isRaw).toBe(false);
  expect(paused).toBe(true);
});

it("disables SGR mouse toggles when the compact text-only layout is shown", () => {
  const input = new EventEmitter() as EventEmitter & { isTTY: boolean; isRaw: boolean; setRawMode(value: boolean): void; pause(): EventEmitter };
  input.isTTY = true;
  input.isRaw = false;
  input.setRawMode = (value) => { input.isRaw = value; };
  input.pause = () => input;
  const writes: string[] = [];
  const output = { columns: 40, rows: 8, write: (value: string) => { writes.push(value); return true; } };
  let toggles = 0;
  const cleanup = startPaneInput({ onToggle: () => { toggles++; }, onClose: () => {}, input, output: output as never });
  input.emit("data", Buffer.from("\x1b[<0;12;8M"));
  input.emit("keypress", " ", { name: "space" });
  expect(toggles).toBe(1);
  expect(writes).toEqual([]);
  cleanup();
  expect(writes).toEqual([]);
});

it("shows the version and Telegram entry while running, including compact panes", () => {
  const snapshot = { state: "running", connectionState: "connected", activity: [] };
  const full = renderPane({ snapshot, version: "0.2.8", columns: 60, rows: 22 });
  expect(full).toContain("PeerBand v0.2.8");
  expect(full).toContain("t  Connect Telegram");
  const compact = renderPane({ snapshot, version: "0.2.8", columns: 40, rows: 8 });
  expect(compact).toContain("v0.2.8");
  expect(compact).toContain("t  Telegram");
});

it("shows the complete QR or a link fallback, with a back control", () => {
  const qr = telegramQr();
  const full = renderTelegram({ version: "0.2.8", columns: 60, rows: 24 });
  expect(full).toContain(qr.join("\n"));
  expect(full).toContain(TELEGRAM_URL);
  expect(full).toContain("back to relay");
  expect(full).toContain("v0.2.8");
  expect(full).not.toContain("?start=");
  for (const [columns, rows] of [[40, 22], [30, 20], [60, 8]]) {
    const view = renderTelegram({ columns, rows });
    const lines = view.split("\n");
    expect(lines.length).toBeLessThanOrEqual(rows!);
    expect(lines.every((line: string) => Array.from(line).length <= columns!)).toBe(true);
    expect(view).toContain(TELEGRAM_URL);
    expect(view.includes(qr.join("\n")) || view.includes("Enlarge pane")).toBe(true);
  }
});

it("returns from Telegram without toggling or closing the relay and ignores its mouse box", () => {
  const input = new EventEmitter() as EventEmitter & { isTTY: boolean; setRawMode(value: boolean): void };
  input.isTTY = true;
  input.setRawMode = () => {};
  let telegram = false;
  let toggles = 0;
  let closes = 0;
  const cleanup = startPaneInput({ input, output: { columns: 60, rows: 24, write: () => true },
    isTelegram: () => telegram, onTelegram: () => { telegram = true; }, onBack: () => { telegram = false; },
    onToggle: () => { toggles++; }, onClose: () => { closes++; },
  });
  for (const back of ["escape", "t", "return", "q"]) {
    input.emit("keypress", "t", { name: "t" });
    expect(telegram).toBe(true);
    input.emit("keypress", " ", { name: "space" });
    input.emit("data", Buffer.from("\x1b[<0;12;8M"));
    input.emit("keypress", "", { name: back });
    expect(telegram).toBe(false);
  }
  expect(toggles).toBe(0);
  expect(closes).toBe(0);
  input.emit("keypress", " ", { name: "space" });
  expect(toggles).toBe(1);
  cleanup();
});
