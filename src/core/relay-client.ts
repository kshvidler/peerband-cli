import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import WebSocket from "ws";
import type { ConnectorCore, Principal } from "./core.js";
import type { RemoteCredentials } from "./config.js";

const MAX_FRAME = 64 * 1024;
const MAX_ACTIVE = 32;
const REQUEST_TIMEOUT_MS = 15_000;
type Request = {
  type: "request";
  id: string;
  tool: string;
  args: Record<string, unknown>;
  principal: Principal;
};
type Active = { timer: NodeJS.Timeout; write: boolean; socket: WebSocket; startedAt: number; tool: string; target?: string };

function socketUrl(serverUrl: string): string {
  const url = new URL(serverUrl);
  if (
    url.protocol !== "https:" &&
    url.protocol !== "http:" &&
    url.protocol !== "wss:" &&
    url.protocol !== "ws:"
  )
    throw new Error("Remote server URL must use https or wss.");
  if (url.username || url.password)
    throw new Error("Remote server URL cannot contain credentials.");
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const loopback =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "::1" ||
    (isIP(hostname) === 4 && hostname.startsWith("127."));
  if ((url.protocol === "http:" || url.protocol === "ws:") && !loopback)
    throw new Error(
      "Remote connections must use HTTPS/WSS except on localhost.",
    );
  if (url.protocol === "http:") url.protocol = "ws:";
  if (url.protocol === "https:") url.protocol = "wss:";
  url.pathname = "/connections";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function encode(value: unknown): string {
  const frame = JSON.stringify(value);
  if (Buffer.byteLength(frame, "utf8") > MAX_FRAME)
    throw new Error("Response exceeds the 64 KiB remote frame limit.");
  return frame;
}

/** Validates the server URL used for enrollment and device login: https, or http on loopback only. */
export function enrollmentBase(serverUrl: string): URL {
  const base = new URL(serverUrl);
  if (!/^https?:$/.test(base.protocol))
    throw new Error(
      "Enrollment server URL must use HTTPS (HTTP is allowed for local development).",
    );
  if (base.username || base.password)
    throw new Error("Enrollment server URL cannot contain credentials.");
  const hostname = base.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const loopback =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "::1" ||
    (isIP(hostname) === 4 && hostname.startsWith("127."));
  if (base.protocol === "http:" && !loopback)
    throw new Error("Enrollment requires HTTPS except on localhost.");
  return base;
}

export async function redeemEnrollment(
  serverUrl: string,
  grant: string,
  name: string,
  fetcher: typeof fetch = fetch,
  previousCredential?: string,
): Promise<RemoteCredentials> {
  const base = enrollmentBase(serverUrl);
  const response = await fetcher(new URL("/api/enrollments/redeem", base), {
    method: "POST",
    headers: { "content-type": "application/json" },
    // previous_credential lets the server keep this machine's record (see DeviceLoginOptions).
    body: JSON.stringify({ grant, name, ...(previousCredential ? { previous_credential: previousCredential } : {}) }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (
    !response.ok ||
    typeof body.installation_id !== "string" ||
    typeof body.credential !== "string"
  ) {
    const detail =
      typeof body.detail === "string" ? body.detail : `HTTP ${response.status}`;
    throw new Error(`Enrollment could not be redeemed: ${detail}`);
  }
  return {
    serverUrl: base.origin,
    installationId: body.installation_id,
    credential: body.credential,
    ...(typeof body.machine_name === "string" && body.machine_name ? { machineName: body.machine_name } : {}),
    ...(typeof body.account_email === "string" && body.account_email ? { accountEmail: body.account_email } : {}),
  };
}

export type RemoteOptions = {
  onStatus?: (message: string) => void;
  onConnectionState?: (state: "connecting" | "connected" | "reconnecting" | "revoked" | "unavailable" | "remote-unavailable") => void;
  onActivity?: (activity: { requestId: string; tool: string; target?: string; outcome: string; latencyMs: number }) => void;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
  heartbeatTimeoutMs?: number;
};

/** Keeps one authenticated socket alive; in-flight backend requests are never replayed. */
export async function runRemoteClient(
  core: ConnectorCore,
  credentials: RemoteCredentials,
  options: RemoteOptions = {},
): Promise<void> {
  const status =
    options.onStatus ??
    ((message: string) => process.stderr.write(`peerband: ${message}\n`));
  const random = options.random ?? Math.random;
  const setConnectionState = options.onConnectionState ?? (() => {});
  const reportActivity = options.onActivity ?? (() => {});
  const sleep =
    options.sleep ??
    ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const serverUrl = socketUrl(credentials.serverUrl);
  const heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 75_000;
  let stopped = false;
  let current: WebSocket | undefined;
  const active = new Map<string, Active>();
  const executing = new Set<Promise<void>>();
  const stop = () => {
    stopped = true;
    current?.close(1000, "connector shutting down");
  };
  if (options.signal?.aborted) return;
  options.signal?.addEventListener("abort", stop, { once: true });
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  let attempt = 0;
  try {
    while (!stopped) {
      try {
        setConnectionState("connecting");
        await new Promise<void>((resolve, reject) => {
          const socket = new WebSocket(serverUrl, {
            headers: { Authorization: `Bearer ${credentials.credential}` },
            maxPayload: MAX_FRAME,
            handshakeTimeout: 10_000,
            perMessageDeflate: false,
          });
          current = socket;
          let heartbeatTimer: NodeJS.Timeout | undefined;
          let lastHeartbeat = Date.now();
          const failActive = (reason: string) => {
            for (const [id, pending] of active) {
              if (pending.socket !== socket) continue;
              clearTimeout(pending.timer);
              active.delete(id);
              if (pending.write)
                status(
                  `write request ${id} lost its response after disconnect; delivery is uncertain. Check request status before retrying.`,
                );
              reportActivity({ requestId: id, tool: pending.tool, target: pending.target, outcome: pending.write ? "uncertain" : "timeout", latencyMs: Date.now() - pending.startedAt });
            }
            if (reason) status(reason);
          };
          const openedAt = Date.now();
          socket.once("open", () => {
            setConnectionState("connected");
            status("remote connection established");
            heartbeatTimer = setInterval(
              () => {
                if (Date.now() - lastHeartbeat > heartbeatTimeoutMs) {
                  status("remote heartbeat expired; reconnecting");
                  socket.close(4000, "heartbeat timeout");
                }
              },
              Math.min(10_000, Math.max(10, heartbeatTimeoutMs / 4)),
            );
            heartbeatTimer.unref();
          });
          socket.on("message", async (data, isBinary) => {
            if (stopped) {
              if (socket.readyState === WebSocket.OPEN)
                socket.close(1000, "connector disabled");
              return;
            }
            const bytes = Buffer.isBuffer(data)
              ? data
              : Array.isArray(data)
                ? Buffer.concat(data)
                : Buffer.from(data as ArrayBuffer);
            if (isBinary || bytes.length > MAX_FRAME) {
              socket.close(1009, "frame too large");
              return;
            }
            let message: unknown;
            try {
              message = JSON.parse(bytes.toString("utf8"));
            } catch {
              socket.close(1007, "invalid JSON");
              return;
            }
            if (
              !message ||
              typeof message !== "object" ||
              Array.isArray(message)
            ) {
              socket.close(1007, "invalid message");
              return;
            }
            const msg = message as Record<string, unknown>;
            if (msg.type === "ping" && Object.keys(msg).length === 1) {
              lastHeartbeat = Date.now();
              if (socket.readyState === WebSocket.OPEN)
                socket.send('{"type":"pong"}');
              return;
            }
            if (
              msg.type !== "request" ||
              typeof msg.id !== "string" ||
              !msg.id ||
              msg.id.length > 256 ||
              typeof msg.tool !== "string" ||
              !msg.tool ||
              !msg.args ||
              typeof msg.args !== "object" ||
              Array.isArray(msg.args) ||
              !msg.principal ||
              typeof msg.principal !== "object" ||
              Array.isArray(msg.principal)
            ) {
              socket.close(1007, "invalid request");
              return;
            }
            const request = msg as unknown as Request;
            if (
              !Array.isArray(request.principal.scopes) ||
              typeof request.principal.id !== "string" ||
              request.principal.scopes.some(
                (scope) => typeof scope !== "string",
              )
            ) {
              socket.close(1007, "invalid principal");
              return;
            }
            if (active.has(request.id)) {
              socket.close(1008, "duplicate request id");
              return;
            }
            if (executing.size >= MAX_ACTIVE) {
              socket.send(
                encode({
                  type: "response",
                  id: request.id,
                  error: {
                    code: "busy",
                    message: "Too many concurrent requests.",
                    next_step: "Retry after a current request finishes.",
                  },
                }),
              );
              return;
            }
            const pending: Active = {
              write: request.tool === "send_agent_message",
              socket,
              startedAt: Date.now(),
              tool: request.tool,
              ...(typeof request.args.agentId === "string" && /^[A-Za-z0-9._:-]{1,256}$/.test(request.args.agentId) ? { target: request.args.agentId } : {}),
              timer: setTimeout(() => {
                if (!active.delete(request.id)) return;
              if (pending.write)
                status(
                  `write request ${request.id} timed out; delivery is uncertain. Check request status before retrying.`,
                );
              reportActivity({ requestId: request.id, tool: request.tool, target: pending.target, outcome: pending.write ? "uncertain" : "timeout", latencyMs: Date.now() - pending.startedAt });
                if (socket.readyState === WebSocket.OPEN)
                  socket.send(
                    encode({
                      type: "response",
                      id: request.id,
                      error: {
                        code: pending.write ? "delivery_unknown" : "timeout",
                        message: pending.write
                          ? "The write timed out; delivery is uncertain."
                          : "The local runtime request timed out.",
                        next_step:
                          "Check request status before retrying a write.",
                      },
                    }),
                  );
              }, REQUEST_TIMEOUT_MS),
            };
            pending.timer.unref();
            active.set(request.id, pending);
            const task: Promise<void> = Promise.resolve().then(async () => {
              try {
                const result = await core.execute(
                  request.tool,
                  request.args,
                  request.principal,
                );
                if (!active.has(request.id)) return;
                active.delete(request.id);
                clearTimeout(pending.timer);
                if (socket.readyState === WebSocket.OPEN)
                  socket.send(
                    encode({ type: "response", id: request.id, result }),
                  );
                reportActivity({ requestId: request.id, tool: request.tool, target: pending.target, outcome: "success", latencyMs: Date.now() - pending.startedAt });
              } catch (error) {
                if (!active.has(request.id)) return;
                active.delete(request.id);
                clearTimeout(pending.timer);
                const candidate = error as {
                  code?: unknown;
                  message?: unknown;
                  nextStep?: unknown;
                };
                const payload = {
                  type: "response",
                  id: request.id,
                  error: {
                    code:
                      typeof candidate.code === "string"
                        ? candidate.code
                        : "runtime_unavailable",
                    message:
                      typeof candidate.message === "string"
                        ? candidate.message
                        : "The runtime request failed.",
                    next_step:
                      typeof candidate.nextStep === "string"
                        ? candidate.nextStep
                        : "Check the runtime status and connector configuration.",
                  },
                };
                if (socket.readyState === WebSocket.OPEN)
                  socket.send(encode(payload));
                reportActivity({ requestId: request.id, tool: request.tool, target: pending.target, outcome: candidate.code === "runtime_unavailable" ? "runtime-unavailable" : "error", latencyMs: Date.now() - pending.startedAt });
              } finally {
                executing.delete(task);
              }
            });
            executing.add(task);
          });
          socket.once("error", (error) => {
            if (socket.readyState !== WebSocket.OPEN) reject(error);
          });
          socket.once("unexpected-response", (_request, response) => {
            if (response.statusCode === 401 || response.statusCode === 403) {
              stopped = true;
              setConnectionState("revoked");
              status(
                `remote authentication was rejected (${response.statusCode}); re-enroll this installation if it was revoked.`,
              );
            }
            response.resume();
          });
          socket.once("close", (code, reason) => {
            if (heartbeatTimer) clearInterval(heartbeatTimer);
            if (Date.now() - openedAt >= 30_000) attempt = 0;
            if (code === 4001 || code === 4003 || code === 4401) stopped = true;
            if (stopped) setConnectionState("revoked");
            else setConnectionState("reconnecting");
            failActive(
              code === 1008 || code === 4001
                ? `remote authentication or policy rejected the connection (${code})`
                : `remote connection closed (${code})${reason.length ? `: ${reason.toString()}` : ""}`,
            );
            if (current === socket) current = undefined;
            resolve();
          });
        });
      } catch (error) {
        setConnectionState("remote-unavailable");
        status(`remote connection failed: ${(error as Error).message}`);
      }
      if (stopped) break;
      const ceiling = Math.min(30_000, 500 * 2 ** Math.min(attempt++, 6));
      let remaining = Math.round(ceiling * (0.5 + random() * 0.5));
      while (!stopped && remaining > 0) {
        const slice = Math.min(remaining, 250);
        const started = Date.now();
        await sleep(slice);
        remaining -= Math.max(slice, Date.now() - started);
      }
    }
  } finally {
    stopped = true;
    options.signal?.removeEventListener("abort", stop);
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    current?.close(1000);
    for (const pending of active.values()) clearTimeout(pending.timer);
    active.clear();
  }
}

export function makeRequestId(): string {
  return randomUUID();
}
