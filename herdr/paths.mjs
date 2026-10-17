// Plain-JS twin of configHome() in src/core/config.ts. Keep the semantics identical.
import { createHash } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { join, posix, win32 } from "node:path";

export function configHome(env = process.env, platform = process.platform, home = homedir()) {
  if (env.PEERBAND_CONFIG_HOME) return env.PEERBAND_CONFIG_HOME;
  if (platform === "win32") return join(env.APPDATA || join(home, "AppData", "Roaming"), "peerband");
  return join(env.XDG_CONFIG_HOME || join(home, ".config"), "peerband");
}

export const credentialsPath = (config = configHome()) => join(config, "credentials.json");
export const lockPath = (config = configHome()) => join(config, "relay-helper.lock");
export const ownerRecordPath = (config = configHome()) => join(lockPath(config), "owner.json");
export const relayStatePath = (config = configHome()) => join(config, "relay-state.json");
export const relayTabPath = (config = configHome()) => join(config, "relay-tab.json");

// The channel name is derived from the config folder, so spell it one canonical way:
// `C:/x/config`, `C:\x\config\` and `c:\X\Config` are the same folder on Windows.
export function canonicalConfig(config, platform = process.platform) {
  const resolved = (platform === "win32" ? win32 : posix).resolve(config);
  return platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function controlChannel(config = configHome(), platform = process.platform) {
  const digest = createHash("sha256").update(canonicalConfig(config, platform)).digest("hex").slice(0, 24);
  return platform === "win32"
    ? `\\\\.\\pipe\\peerband-relay-${digest}`
    : join(tmpdir(), `pbr-${process.getuid?.() ?? "local"}-${digest}.sock`);
}
