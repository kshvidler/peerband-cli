import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const win = process.platform === "win32";
const root = resolve(import.meta.dirname, "..");
const GRANT = "grant-abcXYZ-secret";

interface Flags {
  grant?: string;
  name?: string;
  help?: boolean;
  bogus?: boolean;
}

function which(cmd: string): string | undefined {
  const r = spawnSync(win ? "where.exe" : "which", [cmd], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0]?.trim() || undefined : undefined;
}

interface Shell {
  label: string;
  kind: "sh" | "ps";
  exe: string;
  script: string;
  sysPath: string[];
  args: (o: Flags) => string[];
}

const sysRoot = process.env.SystemRoot ?? "C:\\Windows";
const shells: Shell[] = [];
const shPath = which("sh");
if (shPath) {
  const dir = dirname(shPath);
  shells.push({
    label: "install.sh",
    kind: "sh",
    exe: shPath,
    script: join(root, "install", "install.sh"),
    sysPath: win ? [dir, join(dir, "..", "usr", "bin"), join(sysRoot, "System32")] : ["/usr/bin", "/bin"],
    args: (o) => [
      ...(o.help ? ["--help"] : []),
      ...(o.bogus ? ["--bogus"] : []),
      ...(o.grant ? ["--grant", o.grant] : []),
      ...(o.name ? ["--name", o.name] : []),
    ],
  });
}
if (win) {
  const sys = join(sysRoot, "System32");
  const psArgs = (o: Flags) => [
    ...(o.help ? ["-Help"] : []),
    ...(o.bogus ? ["--bogus"] : []),
    ...(o.grant ? ["-Grant", o.grant] : []),
    ...(o.name ? ["-Name", o.name] : []),
  ];
  const base = { kind: "ps" as const, script: join(root, "install", "install.ps1"), args: psArgs };
  // PowerShell starts slowly on hosted runners; these run locally (see CONTRIBUTING) and are skipped in CI.
  if (!process.env.CI) shells.push({ ...base, label: "install.ps1 (Windows PowerShell)", exe: "powershell.exe", sysPath: [sys, join(sys, "WindowsPowerShell", "v1.0")] });
  const pwsh = which("pwsh");
  if (pwsh && !process.env.CI) shells.push({ ...base, label: "install.ps1 (pwsh)", exe: pwsh, sysPath: [sys, dirname(pwsh)] });
}

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

// Fake commands log "<label> <args> | PEERBAND_GRANT=…". The fake npm answers
// `npm prefix -g` (unlogged) with FAKE_NPM_PREFIX, where the fake peerband lives.
function writeFake(bin: string, kind: "sh" | "ps", name: string, upper: string, label = name) {
  const prefixLine =
    name === "npm"
      ? kind === "ps"
        ? `if "%~1"=="prefix" (echo %FAKE_NPM_PREFIX%& exit /b 0)\r\n`
        : `if [ "$1" = prefix ]; then echo "$FAKE_NPM_PREFIX"; exit 0; fi\n`
      : "";
  if (kind === "ps") {
    writeFileSync(
      join(bin, `${name}.cmd`),
      `@echo off\r\n${prefixLine}>>"%FAKE_LOG%" echo ${label} %* ^| PEERBAND_GRANT=%PEERBAND_GRANT%\r\nif "%FAKE_${upper}_EXIT%"=="" exit /b 0\r\nexit /b %FAKE_${upper}_EXIT%\r\n`,
    );
  } else {
    const p = join(bin, name);
    writeFileSync(p, `#!/bin/sh\n${prefixLine}echo "${label} $* | PEERBAND_GRANT=\${PEERBAND_GRANT-}" >> "$FAKE_LOG"\nexit "\${FAKE_${upper}_EXIT:-0}"\n`);
    chmodSync(p, 0o755);
  }
}

function setup(sh: Shell, opts: { herdr?: boolean; shadow?: boolean }) {
  const dir = mkdtempSync(join(tmpdir(), "pb-install-"));
  tmpDirs.push(dir);
  const bin = join(dir, "bin");
  const home = join(dir, "home");
  mkdirSync(bin);
  mkdirSync(home);
  const log = join(dir, "calls.log");
  writeFileSync(log, "");
  const realNode = process.execPath.replace(/\\/g, "/");
  if (sh.kind === "ps") {
    writeFileSync(join(bin, "node.cmd"), `@echo off\r\nif "%~1"=="--version" (echo v%FAKE_NODE_VERSION%& exit /b 0)\r\n"${realNode}" %*\r\n`);
  } else {
    const p = join(bin, "node");
    writeFileSync(p, `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "v$FAKE_NODE_VERSION"; exit 0; fi\nexec "${realNode}" "$@"\n`);
    chmodSync(p, 0o755);
  }
  writeFake(bin, sh.kind, "npm", "NPM");
  writeFake(bin, sh.kind, "peerband", "PEERBAND");
  if (opts.herdr) writeFake(bin, sh.kind, "herdr", "HERDR");
  // An unrelated `peerband` earlier on PATH, e.g. an old launcher.
  const shadow = join(dir, "shadow");
  if (opts.shadow) {
    mkdirSync(shadow);
    writeFake(shadow, sh.kind, "peerband", "SHADOW", "shadow-peerband");
  }
  // npm's global prefix: peerband.cmd sits in the prefix on Windows, in prefix/bin elsewhere.
  const npmPrefix = sh.kind === "ps" ? bin : dir;
  return { bin, home, log, npmPrefix, shadow: opts.shadow ? shadow : undefined };
}

async function run(sh: Shell, flags: Flags, env: Record<string, string> = {}, opts: { herdr?: boolean; shadow?: boolean } = {}) {
  const fx = setup(sh, opts);
  const full: Record<string, string> = {
    PATH: [...(fx.shadow ? [fx.shadow] : []), fx.bin, ...sh.sysPath].join(delimiter),
    FAKE_NPM_PREFIX: fx.npmPrefix,
    HOME: fx.home,
    USERPROFILE: fx.home,
    APPDATA: join(fx.home, "AppData"),
    TEMP: process.env.TEMP ?? tmpdir(),
    TMP: process.env.TMP ?? tmpdir(),
    PATHEXT: ".COM;.EXE;.BAT;.CMD",
    FAKE_LOG: fx.log,
    FAKE_NODE_VERSION: "22.14.0",
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot, windir: process.env.SystemRoot } : {}),
    ...env,
  };
  const cmd = sh.kind === "ps" ? ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", sh.script] : [sh.script];
  // Async so the vitest worker stays responsive while slow shells (PowerShell) run.
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((done, fail) => {
    const child = spawn(sh.exe, [...cmd, ...sh.args(flags)], { env: full, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
    const timer = setTimeout(() => child.kill(), 60_000);
    child.on("error", (error) => {
      clearTimeout(timer);
      fail(error);
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      done({ status, stdout, stderr });
    });
  });
  const calls = existsSync(fx.log)
    ? readFileSync(fx.log, "utf8")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
    : [];
  return { status: r.status, out: `${r.stdout}${r.stderr}`, calls };
}

const argvOf = (line: string) => line.split(" | ")[0]!.trim();
const envOf = (line: string) => (line.split(" | ")[1] ?? "").trim();

if (shells.length === 0) {
  describe("installers", () => {
    it.skip("no shell available to run installers", () => {});
  });
}

describe.each(shells)("$label", (sh) => {
  it("prints usage for help", async () => {
    const r = await run(sh, { help: true });
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/Usage:/);
    expect(r.out).toMatch(/PEERBAND_PACKAGE/);
    expect(r.calls).toEqual([]);
  });

  it("documents browser login as the default and the grant as headless only", async () => {
    const r = await run(sh, { help: true });
    expect(r.out).toMatch(/opens your browser/);
    expect(r.out).toMatch(/headless[/]CI only/);
    expect(r.out).toMatch(/--?name[\s\S]*--?grant/i);
  });

  it("runs an interactive peerband login with no grant by default", async () => {
    const r = await run(sh, { name: "dev-box" });
    expect(r.status).toBe(0);
    const login = r.calls.find((l) => l.startsWith("peerband login"))!;
    expect(argvOf(login)).toBe("peerband login --herdr-plugin install --name dev-box");
    expect(envOf(login)).toBe("PEERBAND_GRANT=");
    const plain = await run(sh, {});
    expect(argvOf(plain.calls.find((l) => l.startsWith("peerband login"))!)).toBe("peerband login --herdr-plugin install");
  });

  it("exits 2 on an unknown argument", async () => {
    const r = await run(sh, { bogus: true });
    expect(r.status).toBe(2);
    expect(r.out).toMatch(/unknown argument/);
    expect(r.calls).toEqual([]);
  });

  it("rejects an old Node.js before installing anything", async () => {
    const r = await run(sh, { grant: GRANT }, { FAKE_NODE_VERSION: "20.0.0" });
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/too old/);
    expect(r.out).toContain("https://nodejs.org/en/download");
    expect(r.out).not.toContain(GRANT);
    expect(r.calls).toEqual([]);
  });

  it("rejects Node 22 older than 22.13", async () => {
    const r = await run(sh, {}, { FAKE_NODE_VERSION: "22.12.9" });
    expect(r.status).toBe(1);
    expect(r.calls).toEqual([]);
  });

  it("installs peerband@latest by default", async () => {
    const r = await run(sh, { grant: GRANT });
    expect(r.status).toBe(0);
    expect(argvOf(r.calls[0]!)).toBe("npm install -g peerband@latest");
  });

  it("honours PEERBAND_VERSION", async () => {
    const r = await run(sh, { grant: GRANT }, { PEERBAND_VERSION: "1.2.3" });
    expect(argvOf(r.calls[0]!)).toBe("npm install -g peerband@1.2.3");
  });

  it("honours PEERBAND_PACKAGE over the version", async () => {
    const r = await run(sh, { grant: GRANT }, { PEERBAND_PACKAGE: "/tmp/peerband-0.1.0.tgz", PEERBAND_VERSION: "9.9.9" });
    expect(argvOf(r.calls[0]!)).toBe("npm install -g /tmp/peerband-0.1.0.tgz");
  });

  it("passes the grant through the environment, never argv or output", async () => {
    const r = await run(sh, { grant: GRANT, name: "dev-box" }, {}, { herdr: true });
    expect(r.status).toBe(0);
    const login = r.calls.find((l) => l.startsWith("peerband login"))!;
    expect(argvOf(login)).toBe("peerband login --herdr-plugin install --name dev-box");
    expect(envOf(login)).toBe(`PEERBAND_GRANT=${GRANT}`);
    for (const l of r.calls) expect(argvOf(l)).not.toContain(GRANT);
    expect(r.out).not.toContain(GRANT);
  });

  it("accepts the grant and name from the environment", async () => {
    const r = await run(sh, {}, { PEERBAND_GRANT: GRANT, PEERBAND_NAME: "from-env" });
    const login = r.calls.find((l) => l.startsWith("peerband login"))!;
    expect(argvOf(login)).toBe("peerband login --herdr-plugin install --name from-env");
    expect(envOf(login)).toBe(`PEERBAND_GRANT=${GRANT}`);
  });

  it("delegates the Herdr plugin to login (--herdr-plugin install) and prints the right ending", async () => {
    const withHerdr = await run(sh, { grant: GRANT }, {}, { herdr: true });
    expect(withHerdr.status).toBe(0);
    expect(withHerdr.calls.map(argvOf)).toContain("peerband login --herdr-plugin install");
    expect(withHerdr.calls.map(argvOf)).not.toContain("peerband herdr install");
    expect(withHerdr.out).toMatch(/peerband relay/);
    expect(withHerdr.out).toMatch(/peerband status/);

    const without = await run(sh, { grant: GRANT });
    expect(without.status).toBe(0);
    expect(without.calls.map(argvOf)).not.toContain("peerband herdr install");
    expect(without.out).toContain("https://herdr.dev");
    // Without Herdr, don't claim it's ready or send people straight to `peerband relay`.
    expect(without.out).not.toMatch(/PeerBand is ready/);
    expect(without.out).toMatch(/installed and logged in/);
    expect(without.out).toMatch(/peerband herdr install\s+then\s+peerband relay/);
  });

  it("runs the CLI it installed, not another peerband earlier on PATH", async () => {
    const r = await run(sh, { grant: GRANT }, {}, { herdr: true, shadow: true });
    expect(r.status).toBe(0);
    expect(r.calls.some((l) => l.startsWith("shadow-peerband"))).toBe(false);
    expect(r.calls.map(argvOf)).toContain("peerband login --herdr-plugin install");
    expect(r.out).toMatch(/Another peerband command comes first on your PATH/);
  });

  it("reports an npm failure and stops", async () => {
    const r = await run(sh, { grant: GRANT }, { FAKE_NPM_EXIT: "1" });
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/npm install -g .* failed/);
    expect(r.calls.some((l) => l.startsWith("peerband"))).toBe(false);
  });

  it("reports a login failure without echoing the grant", async () => {
    const r = await run(sh, { grant: GRANT }, { FAKE_PEERBAND_EXIT: "1" }, { herdr: true });
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/login failed/);
    expect(r.out).not.toContain(GRANT);
    expect(r.calls.map(argvOf)).not.toContain("peerband herdr install");
  });
});
