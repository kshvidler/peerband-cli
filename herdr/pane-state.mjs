// Small, side-effect-free protocol boundary shared by the supervisor and pane.
const CONNECTION_STATES = new Set(["connecting", "connected", "reconnecting", "revoked", "unavailable", "remote-unavailable", "helper-unavailable", "disabled"]);
const OUTCOMES = new Set(["success", "runtime-unavailable", "error", "uncertain", "timeout"]);
const TOOLS = new Set(["list_agents", "get_agent_status", "get_agent_output", "get_request_status", "send_agent_message"]);

export function normalizePaneEvent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.type !== "peerband:pane-event") return null;
  if (value.kind === "connection" && CONNECTION_STATES.has(value.state)) return { kind: "connection", state: value.state, at: new Date().toISOString() };
  if (value.kind !== "activity" || typeof value.requestId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(value.requestId) || !TOOLS.has(value.tool) || !OUTCOMES.has(value.outcome) || !Number.isFinite(value.latencyMs)) return null;
  return { kind: "activity", requestId: value.requestId, tool: value.tool, ...(typeof value.target === "string" && /^[A-Za-z0-9._:-]{1,256}$/.test(value.target) ? { target: value.target } : {}), outcome: value.outcome, latencyMs: Math.max(0, Math.min(86_400_000, Math.round(value.latencyMs))), at: new Date().toISOString() };
}

function normalizeStoredActivity(value) {
  if (!value || typeof value !== "object" || typeof value.requestId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(value.requestId) || !TOOLS.has(value.tool) || !OUTCOMES.has(value.outcome) || !Number.isFinite(value.latencyMs) || typeof value.at !== "string" || Number.isNaN(Date.parse(value.at))) return null;
  return { kind: "activity", requestId: value.requestId, tool: value.tool, ...(typeof value.target === "string" && /^[A-Za-z0-9._:-]{1,256}$/.test(value.target) ? { target: value.target } : {}), outcome: value.outcome, latencyMs: Math.max(0, Math.min(86_400_000, Math.round(value.latencyMs))), at: new Date(value.at).toISOString() };
}

export function createPaneSnapshot({ state, connectionState, activity }) {
  return {
    state: state === "running" ? "running" : "stopping",
    connectionState: CONNECTION_STATES.has(connectionState) ? connectionState : "unavailable",
    activity: Array.isArray(activity) ? activity.map(normalizeStoredActivity).filter(Boolean).slice(-100) : [],
  };
}

export function fallbackPaneSnapshot(value) {
  const snapshot = createPaneSnapshot(value);
  return {
    ...snapshot,
    state: "stopping",
    connectionState: snapshot.connectionState === "revoked" || snapshot.connectionState === "disabled" ? snapshot.connectionState : "helper-unavailable",
  };
}

export function paneLabel(snapshot) {
  if (!snapshot) return "Disconnected";
  switch (snapshot.connectionState) {
    case "connected": return "Connected";
    case "connecting": return "Connecting";
    case "reconnecting": return "Reconnecting";
    case "revoked": return "Access revoked";
    case "remote-unavailable": return "PeerBand unavailable";
    case "helper-unavailable": return "Helper unavailable";
    case "unavailable": return "Herdr unavailable";
    case "disabled": return "Disconnected";
    default: return "Herdr unavailable";
  }
}
