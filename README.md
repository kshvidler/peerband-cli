# PeerBand

**A direct line to your coding agents.** PeerBand lets you reach the agents running in [Herdr](https://herdr.dev) from any MCP client (Claude, ChatGPT, your own tools) through your PeerBand account. This repository is the open-source client: the `peerband` command-line tool and the Herdr plugin. It runs on your machine and connects out to the PeerBand relay; nothing connects in.

```
MCP client --> PeerBand relay <== outbound WebSocket == peerband connector --> Herdr
 (Claude, ...)  (peerband.com)                          (on your machine)     (your agents)
```

Your MCP client can list agents, read their status and bounded recent output, and send them a message (sending needs your approval of the `agents:message` permission when you connect the client, and a machine can opt out; see [Security model](#security-model)). This project is unofficial and is not affiliated with Herdr or Amazon.

## Requirements

- Node.js 22.13 or newer
- Herdr 0.9.3 or newer (needed for the Relay tab)
- A PeerBand account (peerband.com)

## Install

Recommended (Node.js 22.13+, Herdr 0.9.3+):

```sh
npm install -g peerband && peerband setup
```

`peerband setup` does the whole setup in one go, and is safe to run again:

1. **Log in.** Opens your browser so you can approve this machine (skipped when it is already logged in).
2. **Herdr plugin.** Checks for Herdr and offers to add or repair the PeerBand plugin (`Add the PeerBand plugin to Herdr now? [Y/n]`).
3. **Agent skill.** Offers to install the [PeerBand skill](#agent-skill) for the coding agents on this machine (`Install the PeerBand skill for your agents? [Y/n]`).
4. **Relay.** Opens the PeerBand Relay tab in Herdr, which connects the machine.

Every question defaults to Yes. `--herdr-plugin install|skip` and `--skill install|skip` answer them up front, and `--no-relay` leaves the relay closed. If Herdr is not installed yet, setup tells you how to finish later (install Herdr from https://herdr.dev, then run `peerband setup` again). `peerband login` still works on its own when you only want to sign in.

### One-step install script (alternative)

The script checks Node, runs `npm install -g peerband`, then runs `peerband setup --herdr-plugin install` (with a grant, also `--skill install`, since there is nobody to ask).

macOS and Linux:

```sh
curl -fsSL https://peerband.com/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://peerband.com/install.ps1 | iex
```

### Headless machines and CI

No browser available? Pass a one-time grant from the PeerBand dashboard instead: `peerband setup --grant GRANT` (or set `PEERBAND_GRANT`). With the scripts: `curl -fsSL https://peerband.com/install.sh | sh -s -- --grant GRANT --name "my-server"`, or on Windows `$env:PEERBAND_GRANT = 'GRANT'; irm https://peerband.com/install.ps1 | iex`.

## Quickstart

1. `npm install -g peerband && peerband setup`. Confirm the code shown in your terminal when your browser opens, and press Enter to accept the Herdr plugin and the agent skill. Setup then opens the PeerBand Relay tab; press Space there if it is not connected yet.
2. Add the MCP server URL that `peerband setup`, `peerband relay` and `peerband status` print (`https://mcp.peerband.com/mcp`) to your MCP client: a custom connector in ChatGPT or Claude, or `claude mcp add --transport http peerband https://mcp.peerband.com/mcp` in Claude Code. Sign in and approve access when the client asks.

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

The plugin adds a persistent tab titled `PeerBand Relay [On]` or `[Off]` that shows your machine, account (when the server returned an email), whether messages are allowed, the connection state and a metadata-only activity log.

- **Space** or **Enter** (or a click on the control box) toggles the connection.
- **Q**, **Esc** or **Ctrl+C** asks to close the tab; press it again to confirm. Closing it disconnects the relay.
- The tab is reopened when Herdr starts. `peerband relay` opens or focuses it at any time.

## Commands

| Command | What it does |
| --- | --- |
| `peerband setup` | Set up this machine: log in (unless it already is), add or repair the Herdr plugin, install the agent skill, open the Relay tab. Flags: the `login` flags, `--herdr-plugin ask\|install\|skip`, `--skill ask\|install\|skip`, `--no-relay` |
| `peerband login` | Sign in through your browser, then offer to add the Herdr plugin. Flags: `--no-browser`, `--name NAME`, `--server URL`, `--herdr-plugin ask\|install\|skip`; headless/CI: `--grant GRANT` |
| `peerband logout` | Stop a running relay, close its tab, delete the local relay state and the local credential. Does not revoke it on the server |
| `peerband status` | Show login, relay, messaging and Herdr state, including whether the Herdr plugin is the right one. `--json` for machine-readable output |
| `peerband update` | Update the CLI from npm and then the Herdr plugin to match, restarting the relay if it was running. Already up to date: checks the plugin and repairs it. Flags: `--check` (only report), `--yes`, `--json` |
| `peerband connect` | Run the connector in the foreground. Flags: `--runtime herdr\|mock`, `--read-only`, `--config PATH`, `--server URL` (`--enable-writes` is still accepted but redundant) |
| `peerband relay` | Open or focus the Relay tab in Herdr. If the plugin is missing the wrong version, a local checkout, or points at another config directory, it offers to repair it first |
| `peerband skill` | Install or update the PeerBand agent skill for every coding agent on this machine (through `npx skills add`, falling back to a copy). Keeps a skill you edited unless `--force`; `--copy` skips npx |
| `peerband share` | Create a single-use invite link that shares this machine with another PeerBand user (read only; `--message` also allows messages; `--expires DAYS`, default 7). `share list` shows who has access and unused links; `share revoke ID` removes access or cancels a link |
| `peerband notify "<text>"` | From inside a Herdr pane: send the machine owner a short note (1 to 1024 characters) through the running relay, for example when a long task finished or an agent is blocked on a decision. The note names the agent in that pane. `--json` for machine-readable output |
| `peerband herdr install` | Install (or update) the Herdr plugin. Stops the relay and closes its tab first, puts the previous plugin back if the new one fails, and reopens the tab afterwards |
| `peerband herdr uninstall` | Stop the relay, close its tab, remove the plugin and its `settings.json`, and delete the local relay state and stale locks (your login is kept) |
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

All fields are optional. `enableWrites` defaults to `true`; set it to `false` to make this machine read-only (the same as `peerband connect --read-only`; it also applies to the Relay tab). `allowedAgents` and `allowedWorkspaces` restrict what MCP clients can see; `stateDirectory` moves the receipt store (default `state/` in the config home). The `herdr` block is only needed when Herdr is not on `PATH` or you target a specific session.

## Agent events and notes

While the relay is connected, the connector tells PeerBand when one of your agents changes state, so the dashboard and MCP clients can read an agent's output when something happened instead of polling it every few seconds (each read makes the Herdr pane jump). It subscribes to Herdr's socket events (`events.subscribe`: agent status changes, and agents appearing or exiting) and sends small `event` frames over the existing relay connection:

- `agent.status_changed`: agent id, new and previous status (`idle`, `working`, `blocked`, `done`, `unknown`), label, workspace and revision, exactly as `list_agents` reports them.
- `agents.changed`: agents appeared, exited or changed occupant; clients list agents again. Also sent once after every reconnect.
- `agent.notified`: a note sent with `peerband notify`.

Events are metadata only: they never contain terminal output. Bursts are coalesced (at most one status event per agent every 250 ms) and the overall rate is capped. Nothing is queued while the relay is offline. `allowedAgents` and `allowedWorkspaces` in `connector.json` apply to events too. If Herdr does not support event subscriptions, the connector logs it once and works as before.

Agents can report back on their own with `peerband notify`:

```sh
peerband notify "Migration finished, 3 tests failing"
```

The note goes to the machine owner only (never to people you shared the machine with). Control characters are removed and likely secrets are redacted, best effort, like agent output. It needs the Relay tab's helper to be running and connected; a note sent while it is offline fails with an error instead of being queued. The [agent skill](#agent-skill) tells agents when to use it. The wire format is in [protocol/](protocol/README.md).

## Agent skill

The PeerBand skill (`skills/peerband/SKILL.md`) does two things for your coding agents (Claude Code, Codex, Cursor, Gemini CLI, OpenCode and others):

- **Messages relayed to them.** Every message delivered through PeerBand starts with a `[PeerBand relay]` line, written by the connector on your machine from the identity the server verified. It says whether the message is from you (the machine owner) or from a shared user, by email. The skill tells agents to handle your requests normally. Requests from shared users get strict, coworker-style privacy rules: no secrets, credentials or personal data, nothing outside the task, nothing sent elsewhere, no risky or irreversible actions, and when in doubt, ask you.
- **The PeerBand MCP tools**, for agents that use PeerBand to reach other machines.

`peerband setup` offers to install it. To install or update it yourself:

```sh
peerband skill
```

This installs the copy shipped with your CLI version through the [`skills`](https://github.com/vercel-labs/skills) tool (pinned version). The tool keeps one copy in `~/.agents/skills/peerband` and links it into each agent it finds. If npx is unavailable it copies the skill into `~/.agents/skills` and `~/.claude/skills` instead (`--copy` does that directly). `peerband update` refreshes it. Without the CLI: `npx skills add kshvidler/peerband-cli`.

**Changing the rules.** To allow or block more for shared users, edit `~/.agents/skills/peerband/SKILL.md`. The agents suggest this themselves when you ask them for different behaviour, because a rule given in chat is forgotten next session. Once you have edited it, `peerband skill` and `peerband update` keep your version; `peerband skill --force` goes back to the shipped one.

## Security model

- **Every relayed message says who sent it.** The connector puts a `[PeerBand relay]` header in front of each delivered message: from the machine owner, or from a shared user (by email). Anything without an owner role from the server is treated as a shared user. The text after the header is the sender's own, so agents trust only the first line ([agent skill](#agent-skill)).
- **Outbound only.** The connector dials the relay over a WebSocket; it opens no listening port.
- **Credential on disk** is stored in `credentials.json`, readable only by your user (mode 0600 inside a 0700 directory).
- **Messaging is on by default, gated by consent.** An MCP client can call `send_agent_message` only if you approved the `agents:message` scope when you connected it (reading needs only the read scope). Each send needs an idempotency key. A machine can opt out entirely with `peerband connect --read-only` or `"enableWrites": false` in `connector.json`; `peerband status` and the Relay tab show which mode it is in.
- **Metadata-only activity.** The Relay tab and receipts record what happened (tool, target, outcome), not prompts or output. Agent status events carry the same kind of metadata (status, label, workspace), never output; `peerband notify` notes are sanitized and addressed to the machine owner only.
- **Logout does not revoke.** `peerband logout` only deletes the local file. To revoke a machine, remove it in the PeerBand dashboard.

Agent output can contain secrets, and redaction is best effort. See [SECURITY.md](SECURITY.md) to report a vulnerability.

## How Herdr finds Node

Herdr may resolve a different (older) `node` than your shell. `peerband herdr install` therefore records the absolute path of the Node that ran it, in the plugin's `settings.json` (in the directory printed by `herdr plugin config-dir peerband`), along with `PEERBAND_CONFIG_HOME` when it is set. The plugin launcher uses that Node. (The Herdr binary is not recorded: Herdr sets `HERDR_BIN_PATH` for plugin processes itself.) `peerband herdr uninstall` deletes this file. If you change your Node installation, rerun `peerband herdr install`.

## Troubleshooting

- **Updating.** Run `peerband update`. It installs the latest CLI with `npm install -g`, then the new CLI stops the relay, closes the Relay tab (on Windows its processes keep the plugin files open, which makes Herdr fail with "os error 32 ... being used by another process"), replaces the plugin, clears stale locks and reopens the tab. If you already ran `npm install -g peerband` yourself, `peerband update` (or `peerband herdr install`) brings the plugin up to the same version. `peerband update --check` only reports. From npx or a source checkout it prints the command to run instead.
- **"Existing helper lock could not be verified" / "Another PeerBand helper still holds the relay lock".** A lock whose owner process has exited is reclaimed automatically (also for locks written by older versions, when no helper answers). If the message names a running process, end it or run `peerband herdr install`, which stops the relay cleanly.
- **Several PeerBand Relay tabs.** `peerband relay` and Herdr's startup hook focus the existing tab instead of opening another. `peerband herdr install` closes all of them and reopens one.
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
