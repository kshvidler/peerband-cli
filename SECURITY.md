# Security policy

## Reporting a vulnerability

Please report security issues privately using GitHub's **Report a vulnerability** button on the repository's Security tab (GitHub Security Advisories). Do not open a public issue for a vulnerability.

Include the affected version (`peerband --version`), your operating system and Node.js version, and steps to reproduce. Do not include credentials, enrollment grants or private terminal output; redact them first.

## Scope

This repository is the PeerBand client: the `peerband` CLI, the connector that dials the relay, and the Herdr plugin. In scope:

- credential storage and handling (`credentials.json`, enrollment grants)
- the outbound relay connection and request handling
- the write path (`send_agent_message`) and its authorization checks
- the installers (`install/install.sh`, `install/install.ps1`)
- the Herdr plugin launcher and process ownership

## Design notes

- The connector only makes outbound connections. It never listens for inbound ones.
- The credential file is created user-only (mode 0600 in a 0700 directory).
- Sending messages to agents (`send_agent_message`) is allowed by default, but a request is only honoured if the MCP client holds the `agents:message` OAuth scope that the user approved at consent. Machines can opt out with `peerband connect --read-only` or `"enableWrites": false` in `connector.json`; the connector then rejects every send. `peerband status` and the Relay tab show which mode applies.
- `peerband relay` and `peerband status` check that the installed Herdr plugin is the release matching the CLI and uses the same config directory, and offer a repair when it does not.
- The activity log is metadata only; prompts and agent output are not persisted.
- `peerband logout` deletes the local credential but does not revoke it. Revoke machines from your PeerBand dashboard.

Agent output returned to an MCP client may still contain secrets; redaction is best effort.
