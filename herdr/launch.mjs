// PeerBand Herdr launcher. Every manifest command runs through this file:
//   node herdr/launch.mjs <entry> [args...]
// Written in conservative syntax (no top-level await, no optional chaining) so that it still parses on old
// Node versions and can print a friendly "Node too old" message instead of a SyntaxError.
import { spawnSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { pathToFileURL } from "url";

var ENTRIES = ["pane", "open-pane", "lifecycle"];
// PEERBAND_NODE_MIN is for tests only.
var MIN_NODE = (process.env.PEERBAND_NODE_MIN || "22.13.0").split(".").map(Number);

function fail(message) {
  process.stderr.write(message + "\n");
  process.exit(1);
}

function nodeIsRecentEnough() {
  var have = process.versions.node.split(".").map(Number);
  for (var i = 0; i < 3; i++) {
    if (have[i] > MIN_NODE[i]) return true;
    if (have[i] < MIN_NODE[i]) return false;
  }
  return true;
}

function readSettings() {
  var dir = process.env.HERDR_PLUGIN_CONFIG_DIR;
  if (!dir) return {};
  try {
    var value = JSON.parse(readFileSync(join(dir, "settings.json"), "utf8"));
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function main() {
  var entry = process.argv[2];
  if (ENTRIES.indexOf(entry) < 0) {
    fail("peerband: unknown plugin entry " + JSON.stringify(entry || "") + ". Expected one of: " + ENTRIES.join(", ") + ".");
  }
  var settings = readSettings();
  var args = process.argv.slice(2);

  if (
    typeof settings.nodePath === "string" && settings.nodePath &&
    settings.nodePath !== process.execPath &&
    !process.env.PEERBAND_LAUNCHED &&
    existsSync(settings.nodePath)
  ) {
    var env = {};
    for (var key in process.env) env[key] = process.env[key];
    env.PEERBAND_LAUNCHED = "1";
    // The pane entry is an interactive TUI: on Windows, hiding the console would detach it.
    var result = spawnSync(settings.nodePath, [process.argv[1]].concat(args), {
      stdio: "inherit",
      env: env,
      windowsHide: entry !== "pane",
    });
    if (result.error) fail("peerband: could not start Node.js at " + settings.nodePath + " (" + result.error.message + "). Run `peerband herdr install` to refresh the plugin settings.");
    process.exit(result.status === null ? 1 : result.status);
  }

  if (!nodeIsRecentEnough()) {
    fail(
      "PeerBand needs Node.js " + MIN_NODE.join(".") + " or newer (Herdr found " + process.versions.node + " at " + process.execPath + "). " +
      "Run `peerband herdr install` from a shell with Node.js " + MIN_NODE.join(".") + "+ so the plugin remembers it."
    );
  }

  if (typeof settings.configHome === "string" && settings.configHome && !process.env.PEERBAND_CONFIG_HOME) {
    process.env.PEERBAND_CONFIG_HOME = settings.configHome;
  }
  if (process.env.PEERBAND_LAUNCH_DEBUG) process.stderr.write("peerband-launch: node=" + process.execPath + " entry=" + entry + "\n");

  // Entry modules read their own arguments from argv[2..] (lifecycle's argv[2] is its command), so
  // present them with the argv they would have had if run directly.
  var entryPath = join(dirname(process.argv[1]), entry + ".mjs");
  process.argv.splice(1, 2, entryPath);
  import(pathToFileURL(entryPath).href).catch(function (error) {
    fail("peerband: could not start " + entry + ": " + (error && error.message ? error.message : error));
  });
}

main();
