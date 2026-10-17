# PeerBand

**A direct line to your coding agents.** PeerBand lets you reach the agents running in [Herdr](https://herdr.dev) from any MCP client (Claude, ChatGPT, your own tools) through your PeerBand account. This repository is the open-source client: the `peerband` command-line tool and the Herdr plugin. It runs on your machine and connects out to the PeerBand relay; nothing connects in.

```
MCP client --> PeerBand relay <== outbound WebSocket == peerband connector --> Herdr
 (Claude, ...)  (peerband.com)                          (on your machine)     (your agents)
```

Your MCP client can list agents, read their status and bounded recent output, and (only if you opt in) send them a message. This project is unofficial and is not affiliated with Herdr or Amazon.

## Requirements

- Node.js 22.13 or newer
- Herdr 0.9.3 or newer (needed for the Relay tab)
- A PeerBand account (peerband.com)

## Install

macOS and Linux:

```sh
curl -fsSL https://peerband.com/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://peerband.com/install.ps1 | iex
```

Or with npm directly:

```sh
npm install -g peerband
```

The installers check Node, install the CLI, run `peerband login` (which opens your browser), and set up the Herdr plugin when Herdr is present.

Headless machine or CI with no browser? Pass a one-time grant from the PeerBand dashboard instead: `curl -fsSL https://peerband.com/install.sh | sh -s -- --grant GRANT --name "my-server"`, or on Windows `$env:PEERBAND_GRANT = 'GRANT'; irm https://peerband.com/install.ps1 | iex`.

> PeerBand is not published to npm yet. To try a build, run `npm pack` in this repository and install with `PEERBAND_PACKAGE=/path/to/peerband-0.1.0.tgz` (a tarball path or git URL) set when running the installer.

## Quickstart

1. Install the CLI (above).
2. `peerband login` opens your browser. Sign in to PeerBand and confirm the code shown in your terminal.
3. `peerband herdr install` to add the plugin to Herdr.
4. `peerband relay` to open the PeerBand Relay tab, then press Space to connect.
5. Add the MCP server URL that `peerband relay` and `peerband status` print (`https://mcp.peerband.com/mcp`) to your MCP client: a custom connector in ChatGPT or Claude, or `claude mcp add --transport http peerband https://mcp.peerband.com/mcp` in Claude Code. Sign in and approve access when the client asks.

## Logging in

```
$ peerband login
To sign in, open this page in your browser:

  https://peerband.com/device?code=WDJB-MJHT

and confirm this code:   WDJB-MJHT

Opened your browser.
⠋ Waiting for approval… (Ctrl+C to cancel)
```

`peerband login` requests a short code from the server, opens the link, and polls until you approve it in your PeerBand account. Compare the code in the browser with the one in your terminal and only approve a request you just started yourself. The credential is stored in the config home (see below) and never printed; the secret device code is never shown.

- The browser is not opened over SSH, without a display, when output is piped, or with `--no-browser`. The link and code are still printed: open the link on any device where you are signed in to PeerBand.
- **Headless or CI:** create a one-time grant in the dashboard and run `peerband login --grant GRANT` (or set `PEERBAND_GRANT` to keep it out of your shell history).
- Codes expire after about 10 minutes; run `peerband login` again. Ctrl+C cancels (exit 130). A server without browser sign-in answers with a hint to use `--grant`.
- `--name NAME` sets the machine name shown in the dashboard (default: hostname); `--server URL` or `PEERBAND_SERVER` targets another server.

## The Relay tab

The plugin adds a persistent tab titled `PeerBand Relay [On]` or `[Off]` that shows your account, connection state and a metadata-only activity log.

- **Space** or **Enter** (or a click on the control box) toggles the connection.
- **Q**, **Esc** or **Ctrl+C** asks to close the tab; press it again to confirm. Closing it disconnects the relay.
- The tab is reopened when Herdr starts. `peerband relay` opens or focuses it at any time.

## Commands

| Command | What it does |
| --- | --- |
| `peerband login` | Sign in through your browser. Flags: `--no-browser`, `--name NAME`, `--server URL`; headless/CI: `--grant GRANT` |
| `peerband logout` | Stop a running relay and delete the local credential. Does not revoke it on the server |
| `peerband status` | Show login, relay and Herdr state. `--json` for machine-readable output |
| `peerband connect` | Run the connector in the foreground. Flags: `--runtime herdr\|mock`, `--enable-writes`, `--config PATH`, `--server URL` |
| `peerband relay` | Open or focus the Relay tab in Herdr |
| `peerband herdr install` | Install (or update) the Herdr plugin |
| `peerband herdr uninstall` | Stop the relay, remove the plugin and its `settings.json` |
| `peerband --version`, `help [command]` | Version and help |

Exit codes: 0 success, 1 failure, 2 usage error, 3 not logged in, 130 interrupted (Ctrl+C in `peerband connect`).

## Configuration

The config home is `PEERBAND_CONFIG_HOME` if set; otherwise `%APPDATA%\peerband` on Windows, and `$XDG_CONFIG_HOME/peerband` or `~/.config/peerband` elsewhere. It holds `credentials.json`, the relay state (`relay-state.json`, `relay-tab.json`), the receipt store (`state/receipts.json`) and the optional `connector.json`. `peerband connect` also reads `PEERBAND_RUNTIME` and `PEERBAND_CONNECTOR_CONFIG` (the `--runtime` and `--config` defaults).

`PEERBAND_SERVER` (or `--server`) overrides the default server `https://peerband.com`. Plain `http:` is accepted only for loopback hosts.

Optional `connector.json`:

```json
{
  "allowedAgents": ["claude"],
  "allowedWorkspaces": ["my-project"],
  "enableWrites": false,
  "stateDirectory": "/path/to/state",
  "herdr": {
    "socketPath": "/path/to/herdr-api.sock",
    "schemaPath": "/path/to/herdr-api.schema.json",
    "binary": "/path/to/herdr",
    "machineId": "my-laptop",
    "timeoutMs": 5000
  }
}
```

All fields are optional. `allowedAgents` and `allowedWorkspaces` restrict what MCP clients can see; `stateDirectory` moves the receipt store (default `state/` in the config home). The `herdr` block is only needed when Herdr is not on `PATH` or you target a specific session.

## Security model

- **Outbound only.** The connector dials the relay over a WebSocket; it opens no listening port.
- **Credential on disk** is stored in `credentials.json`, readable only by your user (mode 0600 inside a 0700 directory).
- **Read-only by default.** Listing agents, status and bounded, sanitized output are available. Sending messages requires `--enable-writes` or `"enableWrites": true`, and each send needs an idempotency key.
- **Metadata-only activity.** The Relay tab and receipts record what happened (tool, target, outcome), not prompts or output.
- **Logout does not revoke.** `peerband logout` only deletes the local file. To revoke a machine, remove it in the PeerBand dashboard.

Agent output can contain secrets, and redaction is best effort. See [SECURITY.md](SECURITY.md) to report a vulnerability.

## How Herdr finds Node

Herdr may resolve a different (older) `node` than your shell. `peerband herdr install` therefore records the absolute path of the Node that ran it, in the plugin's `settings.json` (in the directory printed by `herdr plugin config-dir peerband`), along with `PEERBAND_CONFIG_HOME` when it is set. The plugin launcher uses that Node. (The Herdr binary is not recorded: Herdr sets `HERDR_BIN_PATH` for plugin processes itself.) `peerband herdr uninstall` deletes this file. If you change your Node installation, rerun `peerband herdr install`.

## Troubleshooting

- **"PeerBand needs Node.js 22.13 or newer" inside Herdr.** Run `peerband herdr install` from a shell whose `node --version` is 22.13+.
- **The Relay tab does not open.** Check `peerband status` for the plugin, run `herdr plugin list` (look for a line like `- peerband (PeerBand) enabled [github:kshvidler/peerband-cli@v0.1.0]`), and confirm Herdr is 0.9.3 or newer. Then `peerband relay`.
- **Windows: Herdr cannot see files in AppData.** Set `PEERBAND_CONFIG_HOME` to a plain folder (for example `D:\peerband`), log in again, and rerun `peerband herdr install` so the plugin picks it up.
- **The plugin shows up in other Herdr sessions too.** Herdr's plugin registry is per user, shared by all Herdr sessions, so installing, linking or uninstalling PeerBand affects every session.
- **"not logged in" (exit 3).** Run `peerband login`.
- **Revoked.** The machine was removed in the dashboard. Run `peerband login` again.
- **SSH or a headless machine: no browser opens.** That is intended. Run `peerband login --no-browser`, open the printed link on a device where you are signed in to PeerBand (your laptop or phone), and confirm the code. Or skip the browser entirely with `peerband login --grant GRANT` using a grant from the dashboard.
- **"The code expired."** You have about 10 minutes to approve. Run `peerband login` again.
- **"This server doesn't support browser sign-in yet."** Use `peerband login --grant GRANT`.
- **The browser did not open.** Open the printed link manually; the code is part of the link.

## Protocol

JSON Schemas for the relay WebSocket messages, the enrollment API and browser device login are in [`protocol/`](protocol/).

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Contributions: [CONTRIBUTING.md](CONTRIBUTING.md).
