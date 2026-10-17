import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { access, copyFile, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createConnection, createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error plain JS module without declarations
import { controlChannel } from "../herdr/paths.mjs";

const execute = promisify(execFile);
const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));
const root = resolve(__dirname, "..");
const fakeConnector = join(root, "test", "fixtures", "fake-connector.mjs");
type ControlReply = { state?: string; error?: string; connectionState?: string; activity?: { tool?: string; outcome?: string }[] };

async function eventually(check: () => Promise<boolean>) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await check()) return;
    await pause(100);
  }
  throw new Error("Helper lifecycle did not reach the expected state");
}

function readLine(socket: ReturnType<typeof createConnection>) {
  return new Promise<ControlReply>((done, fail) => {
    let text = "";
    const data = (chunk: Buffer) => {
      text += chunk.toString();
      const newline = text.indexOf("\n");
      if (newline >= 0) { socket.off("data", data); done(JSON.parse(text.slice(0, newline))); }
    };
    socket.on("data", data);
    socket.once("error", fail);
  });
}

async function rejectsBadControlToken(channel: string) {
  await new Promise<void>((done, fail) => {
    const socket = createConnection(channel);
    const timeout = setTimeout(() => { socket.destroy(); fail(new Error("unauthenticated control probe timed out")); }, 3000);
    socket.once("connect", () => socket.write('{"command":"status","token":"wrong-token"}\n'));
    socket.once("data", () => { clearTimeout(timeout); socket.destroy(); fail(new Error("unauthenticated control request received a response")); });
    socket.once("close", () => { clearTimeout(timeout); done(); });
    socket.once("error", (error) => { clearTimeout(timeout); fail(error); });
  });
}

describe("lifecycle supervisor", () => {
  it("keeps CLI control compatible with a one-line supervisor", async () => {
    const directory = await mkdtemp(join(tmpdir(), "peerband-old-control-"));
    const config = join(directory, "peerband");
    const token = "old-supervisor-fixture-token";
    await mkdir(join(config, "relay-helper.lock"), { recursive: true });
    await writeFile(join(config, "relay-helper.lock", "owner.json"), JSON.stringify({ token }));
    const channel = controlChannel(config) as string;
    let received: unknown;
    const server = createNetServer((socket) => {
      let text = "";
      socket.on("data", (chunk) => {
        text += chunk.toString();
        if (!text.includes("\n")) return;
        received = JSON.parse(text.split("\n")[0]!);
        socket.end('{"state":"stopping"}\n');
      });
    });
    await new Promise<void>((done, fail) => { server.once("error", fail); server.listen(channel, done); });
    try {
      const result = await execute(process.execPath, [join(root, "herdr", "lifecycle.mjs"), "stop"], {
        env: { ...process.env, PEERBAND_CONFIG_HOME: config },
        timeout: 5000,
        windowsHide: true,
      });
      expect(JSON.parse(result.stdout)).toEqual({ state: "stopping" });
      expect(received).toEqual({ command: "stop", token });
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
      if (process.platform !== "win32") await unlink(channel).catch(() => {});
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("reports an actionable error when the connector entry is missing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "peerband-no-entry-"));
    try {
      await expect(execute(process.execPath, [join(root, "herdr", "lifecycle.mjs"), "start"], {
        env: { ...process.env, PEERBAND_CONFIG_HOME: directory, PEERBAND_CONNECTOR_ENTRY: join(directory, "missing.mjs") },
        timeout: 5000,
        windowsHide: true,
      })).rejects.toMatchObject({ stderr: expect.stringContaining("peerband herdr install") });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("supervises the connector child over IPC and releases ownership on graceful stop", async () => {
    const directory = await mkdtemp(join(tmpdir(), "peerband-helper-"));
    const config = join(directory, "peerband");
    const argsFile = join(directory, "args.json");
    await mkdir(config, { recursive: true });
    const env = {
      ...process.env,
      PEERBAND_CONFIG_HOME: config,
      PEERBAND_RUNTIME: "mock",
      PEERBAND_CONNECTOR_CONFIG: join(directory, "connector.json"),
      PEERBAND_CONNECTOR_ENTRY: fakeConnector,
      FAKE_CONNECTOR_ARGS_FILE: argsFile,
    };
    const command = (action: string) =>
      execute(process.execPath, [join(root, "herdr", "lifecycle.mjs"), action], { env, timeout: 10_000, windowsHide: true });
    const channel = controlChannel(config) as string;
    const lockGone = async () => { try { await access(join(config, "relay-helper.lock")); return false; } catch { return true; } };
    let started = false;
    try {
      const start = await command("start");
      started = true;
      expect(JSON.parse(start.stdout).state).toBe("running");
      await rejectsBadControlToken(channel);
      await eventually(async () => {
        const status = JSON.parse((await command("status")).stdout) as ControlReply;
        return status.connectionState === "connected" && Boolean(status.activity?.some((event) => event.tool === "list_agents" && event.outcome === "success"));
      });
      // Child contract: managed connect, mock runtime and explicit config; no --enable-writes.
      expect(JSON.parse(await readFile(argsFile, "utf8"))).toEqual(["connect", "--managed", "--runtime", "mock", "--config", join(directory, "connector.json")]);
      expect(JSON.parse((await command("start")).stdout).state).toBe("running");

      // Pane state snapshot is persisted for `peerband status`.
      const saved = JSON.parse(await readFile(join(config, "relay-state.json"), "utf8")) as ControlReply;
      expect(saved.connectionState).toBe("connected");

      expect(JSON.parse((await command("disable")).stdout).state).toBe("stopping");
      await eventually(async () => (JSON.parse((await command("status")).stdout) as ControlReply).connectionState === "disabled");
      expect(JSON.parse((await command("enable")).stdout).state).toBe("running");
      expect(JSON.parse((await command("stop")).stdout).state).toBe("stopping");
      await eventually(lockGone);
      started = false;

      // UI ownership: one owner; losing the owner stops the supervisor and its child.
      expect(JSON.parse((await command("start-ui")).stdout).state).toBe("stopping");
      started = true;
      const attach = async () => {
        const record = JSON.parse(await readFile(join(config, "relay-helper.lock", "owner.json"), "utf8")) as { token: string };
        const socket = createConnection(channel);
        await new Promise<void>((done, fail) => { socket.once("connect", done); socket.once("error", fail); });
        socket.write(JSON.stringify({ token: record.token }) + "\n");
        const first = readLine(socket);
        socket.write('{"command":"attach-ui"}\n');
        return { socket, first: await first };
      };
      const owned = await attach();
      expect(owned.first.state).toBe("running");
      const duplicate = await attach();
      expect(duplicate.first.error).toBe("ui-owned");
      duplicate.socket.destroy();
      const commandOnOwner = async (name: string) => {
        const reply = readLine(owned.socket);
        owned.socket.write(JSON.stringify({ command: name }) + "\n");
        return reply;
      };
      expect((await commandOnOwner("ui-disable")).state).toBe("stopping");
      let enabled: ControlReply | undefined;
      for (let attempt = 0; attempt < 50; attempt++) {
        enabled = await commandOnOwner("ui-enable");
        if (enabled.state === "running") break;
        expect(enabled.error).toBe("busy");
        await pause(100);
      }
      expect(enabled?.state).toBe("running");
      owned.socket.destroy();
      await eventually(lockGone);
      started = false;
    } finally {
      if (started) await command("stop").catch(() => {});
      await pause(200);
      await rm(directory, { recursive: true, force: true }).catch(() => {});
    }
  }, 30_000);
});

describe("launch.mjs", () => {
  const launch = join(root, "herdr", "launch.mjs");
  let directory: string;
  let nodeCopy: string;
  beforeAll(async () => {
    // realpath: on macOS the temp dir is a /var -> /private/var symlink, and process.execPath reports the real path.
    directory = realpathSync(await mkdtemp(join(tmpdir(), "peerband-launch-")));
    nodeCopy = join(directory, process.platform === "win32" ? "node-copy.exe" : "node-copy");
    await copyFile(process.execPath, nodeCopy);
  });
  afterAll(async () => { await rm(directory, { recursive: true, force: true }).catch(() => {}); });

  async function configDir(name: string, settings?: unknown) {
    const dir = join(directory, name);
    await mkdir(dir, { recursive: true });
    if (settings !== undefined) await writeFile(join(dir, "settings.json"), JSON.stringify(settings));
    return dir;
  }
  function run(args: string[], env: Record<string, string | undefined>) {
    const clean: Record<string, string | undefined> = { ...process.env, PEERBAND_LAUNCHED: undefined, PEERBAND_NODE_MIN: undefined, PEERBAND_CONFIG_HOME: undefined, HERDR_BIN_PATH: undefined, ...env };
    return spawnSync(process.execPath, [launch, ...args], { env: clean as NodeJS.ProcessEnv, encoding: "utf8", timeout: 20_000 });
  }
  const noHerdr = () => join(directory, "no-such-herdr");

  it("rejects entries outside the allowlist", async () => {
    const result = run(["../secret"], { HERDR_PLUGIN_CONFIG_DIR: await configDir("allow") });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unknown plugin entry");
    for (const entry of ["pane-ui", "relay-tab", "launch", "control", ""]) {
      expect(run([entry], {}).status).toBe(1);
    }
  });

  it("prints a friendly message when Node is too old", async () => {
    const result = run(["open-pane"], { HERDR_PLUGIN_CONFIG_DIR: await configDir("old"), PEERBAND_NODE_MIN: "999.1.0" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("PeerBand needs Node.js 999.1.0 or newer");
    expect(result.stderr).toContain(process.versions.node);
    expect(result.stderr).toContain(process.execPath);
    expect(result.stderr).toContain("peerband herdr install");
  });

  it("re-executes under settings.nodePath when it differs, once", async () => {
    const dir = await configDir("reexec", { nodePath: nodeCopy });
    const env = { HERDR_PLUGIN_CONFIG_DIR: dir, PEERBAND_LAUNCH_DEBUG: "1", PEERBAND_CONFIG_HOME: join(directory, "cfg-reexec"), HERDR_BIN_PATH: noHerdr() };
    const result = run(["open-pane"], env);
    expect(result.stderr).toContain(`node=${nodeCopy}`);
    expect(result.stderr).not.toContain(`node=${process.execPath}`);
    expect(result.stderr).toContain("Could not open the PeerBand Relay tab");
    expect(result.stderr).toContain("HERDR_BIN_PATH");
    expect(result.status).toBe(1);

    // The guard prevents a second hop.
    const guarded = run(["open-pane"], { ...env, PEERBAND_LAUNCHED: "1" });
    expect(guarded.stderr).toContain(`node=${process.execPath}`);
  });

  it("does not re-execute when nodePath matches or is missing on disk", async () => {
    const base = { PEERBAND_LAUNCH_DEBUG: "1", HERDR_BIN_PATH: noHerdr() };
    const same = run(["open-pane"], { ...base, HERDR_PLUGIN_CONFIG_DIR: await configDir("same", { nodePath: process.execPath }), PEERBAND_CONFIG_HOME: join(directory, "cfg-same") });
    expect(same.stderr).toContain(`node=${process.execPath}`);
    const missing = run(["open-pane"], { ...base, HERDR_PLUGIN_CONFIG_DIR: await configDir("missing", { nodePath: join(directory, "gone") }), PEERBAND_CONFIG_HOME: join(directory, "cfg-missing") });
    expect(missing.stderr).toContain(`node=${process.execPath}`);
  });

  it("applies the configHome setting, ignores a stale herdrBinary, and lets the environment take precedence", async () => {
    const home = join(directory, "cfg-from-settings");
    const dir = await configDir("apply", { configHome: home, herdrBinary: join(directory, "settings-herdr") });
    const fromSettings = run(["open-pane"], { HERDR_PLUGIN_CONFIG_DIR: dir });
    expect(fromSettings.stderr).not.toContain("settings-herdr");
    expect(existsSync(home)).toBe(true);
    const envWins = run(["open-pane"], { HERDR_PLUGIN_CONFIG_DIR: dir, HERDR_BIN_PATH: join(directory, "env-herdr"), PEERBAND_CONFIG_HOME: join(directory, "cfg-env") });
    expect(envWins.stderr).toContain("env-herdr");
    expect(envWins.stderr).not.toContain("settings-herdr");
    expect(existsSync(join(directory, "cfg-env"))).toBe(true);
  });

  it("passes remaining arguments to the entry (lifecycle usage error)", async () => {
    const result = run(["lifecycle", "bogus"], { HERDR_PLUGIN_CONFIG_DIR: await configDir("args"), PEERBAND_CONFIG_HOME: join(directory, "cfg-args") });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Usage: lifecycle.mjs start|status|stop");
  });

  it("avoids modern syntax so old Node can still print the version message", () => {
    const source = readFileSync(launch, "utf8").replace(/^\s*\/\/.*$/gm, "");
    expect(source).not.toMatch(/\?\.|\?\?|=>|\bawait\b|\bconst\b|\blet\b/);
  });
});

describe("herdr-plugin.toml", () => {
  type Table = Record<string, unknown>;
  function parseToml(text: string) {
    const top: Table = {};
    const arrays: Record<string, Table[]> = {};
    let current = top;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const header = /^\[\[([A-Za-z0-9_.-]+)\]\]$/.exec(line);
      if (header) { current = {}; (arrays[header[1]!] ??= []).push(current); continue; }
      const pair = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
      if (!pair) throw new Error(`Unsupported TOML line: ${line}`);
      current[pair[1]!] = JSON.parse(pair[2]!);
    }
    return { top, arrays };
  }
  const manifest = parseToml(readFileSync(join(root, "herdr-plugin.toml"), "utf8"));
  const entries = ["pane", "open-pane", "lifecycle"];

  it("declares the plugin identity", () => {
    expect(manifest.top).toMatchObject({ id: "peerband", name: "PeerBand", min_herdr_version: "0.9.3" });
    expect(manifest.top.platforms).toEqual(["linux", "macos", "windows"]);
    const packagePath = join(root, "package.json");
    if (existsSync(packagePath)) expect(manifest.top.version).toBe(JSON.parse(readFileSync(packagePath, "utf8")).version);
  });

  it("routes every command through launch.mjs with an allowlisted, existing entry", () => {
    const commands = [
      ...(manifest.arrays.startup ?? []),
      ...(manifest.arrays.actions ?? []),
      ...(manifest.arrays.panes ?? []),
    ].map((table) => table.command as string[]);
    expect(commands.length).toBeGreaterThanOrEqual(6);
    for (const command of commands) {
      expect(command.slice(0, 2)).toEqual(["node", "herdr/launch.mjs"]);
      expect(entries).toContain(command[2]);
      expect(existsSync(join(root, "herdr", `${command[2]}.mjs`))).toBe(true);
    }
    expect(existsSync(join(root, "herdr", "launch.mjs"))).toBe(true);
  });

  it("has a startup hook, the relay tab pane and the lifecycle actions", () => {
    expect(manifest.arrays.startup).toHaveLength(1);
    expect(manifest.arrays.startup![0]!.command).toEqual(["node", "herdr/launch.mjs", "open-pane"]);
    expect(manifest.arrays.panes).toHaveLength(1);
    expect(manifest.arrays.panes![0]).toMatchObject({ id: "relay", placement: "tab", title: "PeerBand Relay [Off]" });
    const actions = Object.fromEntries(manifest.arrays.actions!.map((action) => [action.id as string, action.command as string[]]));
    expect(Object.keys(actions).sort()).toEqual(["relay", "start", "status", "stop"]);
    expect(actions.start!.slice(2)).toEqual(["lifecycle", "start"]);
    expect(actions.status!.slice(2)).toEqual(["lifecycle", "status"]);
    expect(actions.stop!.slice(2)).toEqual(["lifecycle", "stop"]);
    expect(actions.relay!.slice(2)).toEqual(["open-pane"]);
  });

  it("matches the plugin id and pane entrypoint used by relay-tab.mjs", () => {
    const source = readFileSync(join(root, "herdr", "relay-tab.mjs"), "utf8");
    expect(source).toContain(`const pluginId = "${manifest.top.id}";`);
    expect(source).toContain(`const entrypoint = "${manifest.arrays.panes![0]!.id}";`);
  });
});
