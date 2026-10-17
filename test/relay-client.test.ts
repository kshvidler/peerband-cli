import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { ConnectorCore, MockRuntime } from "../src/core/index.js";
import {
  redeemEnrollment, runRemoteClient,
  loadCredentials,
  saveCredentials,
} from "../src/core/index.js";

const closers: Array<() => Promise<void>> = [];
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("hosted remote connector", () => {
  it("redeems one-time enrollment and stores installation credentials privately", async () => {
    let requestUrl = "";
    const credentials = await redeemEnrollment(
      "https://example.test/base",
      "short-grant",
      "workstation",
      async (input, init) => {
        requestUrl = String(input);
        expect(JSON.parse(String(init?.body))).toEqual({
          grant: "short-grant",
          name: "workstation",
        });
        return new Response(
          JSON.stringify({
            installation_id: "install-1",
            credential: "secret-token",
          }),
          { status: 200 },
        );
      },
    );
    expect(requestUrl).toBe("https://example.test/api/enrollments/redeem");
    const dir = await mkdtemp(join(tmpdir(), "peerband-relay-"));
    directories.push(dir);
    const path = join(dir, "remote.json");
    await saveCredentials(credentials, path);
    expect(await loadCredentials(path)).toEqual(credentials);
    if (process.platform !== "win32")
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(path, "utf8")).credential).toBe(
      "secret-token",
    );
  });

  it("authenticates, handles ping, and routes requests through ConnectorCore", async () => {
    const server = createServer();
    const wss = new WebSocketServer({ noServer: true });
    const bearer = "Bearer installation-secret";
    server.on("upgrade", (request, socket, head) => {
      if (
        request.url !== "/connections" ||
        request.headers.authorization !== bearer
      ) {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) =>
        wss.emit("connection", ws, request),
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No test listener address");
    const port = address.port;
    closers.push(
      () =>
        new Promise<void>((resolve, reject) => {
          wss.close();
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    );
    const received: string[] = [];
    let socket: WebSocket | undefined;
    const reply = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("No remote response arrived")),
        3_000,
      );
      wss.once("connection", (ws) => {
        socket = ws;
        ws.on("message", (data) => {
          const message = JSON.parse(data.toString()) as Record<
            string,
            unknown
          >;
          received.push(String(message.type));
          if (message.type === "pong") {
            ws.send(
              JSON.stringify({
                type: "request",
                id: "read-1",
                tool: "list_agents",
                args: { limit: 1 },
                principal: { id: "user-1", scopes: ["agents:read"] },
              }),
            );
          } else if (message.type === "response") {
            clearTimeout(timer);
            resolve(message);
          }
        });
        ws.send('{"type":"ping"}');
      });
    });
    const abort = new AbortController();
    const core = new ConnectorCore(new MockRuntime());
    const running = runRemoteClient(
      core,
      {
        serverUrl: `http://127.0.0.1:${port}`,
        installationId: "install-1",
        credential: "installation-secret",
      },
      {
        signal: abort.signal,
        sleep: async () => new Promise((resolve) => setTimeout(resolve, 2)),
      },
    );
    const response = await reply;
    expect(received).toEqual(["pong", "response"]);
    expect(response.id).toBe("read-1");
    expect((response.result as { agents: unknown[] }).agents).toHaveLength(1);
    abort.abort();
    socket?.close();
    await running;
    await core.close();
  });

  it("rejects insecure remote enrollment and credential-bearing server URLs", async () => {
    await expect(
      redeemEnrollment(
        "http://example.test",
        "g".repeat(24),
        "test",
        async () => {
          throw new Error("fetch must not run for insecure remote URLs");
        },
      ),
    ).rejects.toThrow("requires HTTPS");
    const core = new ConnectorCore(new MockRuntime());
    await expect(
      runRemoteClient(core, {
        serverUrl: "https://user:password@example.test",
        installationId: "i",
        credential: "c",
      }),
    ).rejects.toThrow("cannot contain credentials");
    await core.close();
  });

  it("closes a socket when the backend heartbeat goes stale", async () => {
    const server = createServer();
    const wss = new WebSocketServer({ noServer: true });
    server.on("upgrade", (_request, socket, head) =>
      wss.handleUpgrade(_request, socket, head, (ws) =>
        wss.emit("connection", ws, _request),
      ),
    );
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No test listener address");
    const closed = new Promise<number>((resolve) =>
      wss.once("connection", (ws) => ws.once("close", (code) => resolve(code))),
    );
    const abort = new AbortController();
    const core = new ConnectorCore(new MockRuntime());
    const statuses: string[] = [];
    const running = runRemoteClient(
      core,
      {
        serverUrl: `http://127.0.0.1:${address.port}`,
        installationId: "i",
        credential: "c",
      },
      {
        signal: abort.signal,
        heartbeatTimeoutMs: 80,
        random: () => 0,
        sleep: (ms) =>
          new Promise((resolve) => setTimeout(resolve, Math.min(ms, 20))),
        onStatus: (value) => statuses.push(value),
      },
    );
    try {
      expect(
        await Promise.race([
          closed,
          new Promise<number>((_, reject) =>
            setTimeout(
              () => reject(new Error("heartbeat did not close socket")),
              2_000,
            ),
          ),
        ]),
      ).toBe(4000);
      expect(statuses).toContain("remote heartbeat expired; reconnecting");
    } finally {
      abort.abort();
      await running;
      await core.close();
      await new Promise<void>((resolve) => {
        wss.close();
        server.close(() => resolve());
      });
    }
  });

  it("keeps timed-out or disconnected core work inside the 32-task limit", async () => {
    class SlowRuntime extends MockRuntime {
      pending: Array<() => void> = [];
      override async listAgents() {
        await new Promise<void>((resolve) => this.pending.push(resolve));
        return super.listAgents();
      }
    }
    const runtime = new SlowRuntime();
    const core = new ConnectorCore(runtime);
    const server = createServer();
    const wss = new WebSocketServer({ noServer: true });
    server.on("upgrade", (request, socket, head) =>
      wss.handleUpgrade(request, socket, head, (ws) =>
        wss.emit("connection", ws, request),
      ),
    );
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No test listener address");
    const busy = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("No bounded busy response arrived")),
        3_000,
      );
      let connectionNumber = 0;
      wss.on("connection", (ws) => {
        connectionNumber++;
        if (connectionNumber === 1) {
          for (let index = 0; index < 32; index++)
            ws.send(
              JSON.stringify({
                type: "request",
                id: `pending-${index}`,
                tool: "list_agents",
                args: {},
                principal: { id: "user", scopes: ["agents:read"] },
              }),
            );
          setTimeout(() => ws.close(), 0);
          return;
        }
        ws.on("message", (data) => {
          const result = JSON.parse(data.toString()) as Record<string, unknown>;
          if (result.id === "after-disconnect") {
            clearTimeout(timer);
            resolve(result);
          }
        });
        ws.send(
          JSON.stringify({
            type: "request",
            id: "after-disconnect",
            tool: "list_agents",
            args: {},
            principal: { id: "user", scopes: ["agents:read"] },
          }),
        );
      });
    });
    const abort = new AbortController();
    const running = runRemoteClient(
      core,
      {
        serverUrl: `http://127.0.0.1:${address.port}`,
        installationId: "i",
        credential: "c",
      },
      {
        signal: abort.signal,
        random: () => 0,
        sleep: async () => undefined,
      },
    );
    try {
      const result = await busy;
      expect((result.error as Record<string, unknown>).code).toBe("busy");
      expect(runtime.pending).toHaveLength(32);
    } finally {
      abort.abort();
      for (const release of runtime.pending) release();
      await running;
      await core.close();
      await new Promise<void>((resolve) => {
        wss.close();
        server.close(() => resolve());
      });
    }
  });
});
