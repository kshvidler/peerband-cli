import { expect, it } from "vitest";
import { EventEmitter } from "node:events";
// @ts-expect-error -- plain JS plugin module without type declarations
import { normalizePaneEvent, createPaneSnapshot, fallbackPaneSnapshot, paneLabel } from "../herdr/pane-state.mjs";
// @ts-expect-error -- plain JS plugin module without type declarations
import { renderPane, startPaneInput } from "../herdr/pane-ui.mjs";

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
