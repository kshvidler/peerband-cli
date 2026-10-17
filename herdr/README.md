# Herdr plugin sources (contributors)

Plain `.mjs` files run directly by Herdr; they are not bundled. Every command in `../herdr-plugin.toml` goes through `launch.mjs`, which picks the right Node (from `settings.json` written by `peerband herdr install`: `nodePath`, optional `configHome`), checks Node >= 22.13, applies `configHome` (`PEERBAND_CONFIG_HOME`, unless already set), and imports one allowlisted entry (`pane`, `open-pane`, `lifecycle`).

- `pane*.mjs` - the persistent "PeerBand Relay" TUI tab. `pane-state.mjs` validates connector events; `pane-ui.mjs` renders.
- `lifecycle.mjs` - supervisor that owns the connector child (`node dist/peerband.mjs connect --managed`, plus `--runtime mock` if `PEERBAND_RUNTIME=mock`, `--config` if `PEERBAND_CONNECTOR_CONFIG` is set). Closing the owning pane stops the child. Never kills a stored PID.
- `control.mjs`, `paths.mjs` - control channel and config paths (`paths.mjs` mirrors `configHome()` in `src/core/config.ts`).
- `relay-tab.mjs` - marker-validated tab open/reuse/rename/close. `openRelayTab()` is also imported by the bundled CLI (`peerband relay`), so it must not depend on files next to it.

## Connector child contract

Spawned with an IPC channel. It sends `{ type: "peerband:pane-event", kind: "connection", state }` and `{ type: "peerband:pane-event", kind: "activity", requestId, tool, target?, outcome, latencyMs }`, and exits on `{ type: "peerband:shutdown" }`.

## Environment

- `PEERBAND_CONFIG_HOME`, `HERDR_BIN_PATH` (Herdr always sets it for plugin processes; `settings.json` no longer records it, and a leftover `herdrBinary` key is ignored), `HERDR_PLUGIN_CONFIG_DIR` (Herdr-provided), `HERDR_PANE_ID`.
- `PEERBAND_RUNTIME=mock`, `PEERBAND_CONNECTOR_CONFIG=<path>` - forwarded to the connector child.
- Test-only: `PEERBAND_CONNECTOR_ENTRY` replaces `dist/peerband.mjs` as the connector child (tests use `test/fixtures/fake-connector.mjs`); `PEERBAND_NODE_MIN` overrides the Node version floor in `launch.mjs`; `PEERBAND_LAUNCH_DEBUG=1` makes `launch.mjs` print the Node it runs under.
