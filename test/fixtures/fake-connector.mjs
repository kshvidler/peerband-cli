// Fake connector child used by plugin tests. Speaks the managed IPC contract.
import { writeFileSync } from "node:fs";

if (process.env.FAKE_CONNECTOR_ARGS_FILE) writeFileSync(process.env.FAKE_CONNECTOR_ARGS_FILE, JSON.stringify(process.argv.slice(2)));
if (!process.send) { console.error("fake-connector needs an IPC channel"); process.exit(2); }
const send = (message) => process.send(message);
send({ type: "peerband:pane-event", kind: "connection", state: "connecting" });
setTimeout(() => {
  send({ type: "peerband:pane-event", kind: "connection", state: "connected" });
  send({ type: "peerband:pane-event", kind: "activity", requestId: "fixture-read", tool: "list_agents", outcome: "success", latencyMs: 3 });
}, 100);
process.on("message", (message) => {
  if (message && message.type === "peerband:shutdown") process.exit(0);
});
process.on("SIGTERM", () => process.exit(0));
setInterval(() => {}, 1000);
