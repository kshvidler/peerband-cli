# PeerBand client protocol

The `peerband` client talks to the PeerBand service over two interfaces. The service (backend) is **private and closed source**; these JSON Schemas (draft 2020-12) document the contract the open-source client implements so that you can audit exactly what leaves your machine.

| File | Describes |
| --- | --- |
| `enrollment-redeem.schema.json` | `POST /api/enrollments/redeem`: exchange a short-lived grant (from the PeerBand dashboard) for an installation credential. `$defs`: `request`, `response`, `errorResponse`. |
| `device-authorization.schema.json` | Browser sign-in: `POST /api/device/code` and `POST /api/device/token` (what `peerband login` sends and receives), plus the dashboard approval endpoints. `$defs`: `codeRequest`, `codeResponse`, `tokenRequest`, `tokenResponse`, `tokenError`, `rateLimited`, `requestStatus`, `decisionResponse`. |
| `relay-messages.schema.json` | Every WebSocket text frame on `wss://<server>/connections`, both directions, as a `oneOf` discriminated by `type`: `request`, `ping` (server to client), `pong`, `response`, `event` (client to server). |

## Device login summary

`peerband login` uses an RFC 8628 style flow:

1. `POST /api/device/code` with `{client: "peerband-cli", client_version, machine_name, platform}` returns a secret `device_code`, a short `user_code` (`XXXX-XXXX`), `verification_uri_complete`, `expires_in` and `interval`. The client shows the link and user code, and opens the link in a browser unless you are on SSH, headless or pass `--no-browser`.
2. You sign in to PeerBand in the browser and compare the code with your terminal before pressing Approve. The `device_code` is never displayed, logged or put in a URL.
3. The client polls `POST /api/device/token` every `interval` seconds. While waiting the server answers HTTP 400 `authorization_pending`; `slow_down` adds 5 seconds; `access_denied`, `expired_token` and `invalid_grant` end the attempt. Network errors and 5xx responses back off up to 30 seconds. On approval the response is the same as enrollment redemption (`installation_id`, `credential`, ...) and the code cannot be used again.
4. A server that answers 404 to `/api/device/code` does not support browser sign-in; the client suggests `peerband login --grant`.

The grant flow (`enrollment-redeem.schema.json`) remains available for headless machines and CI.

## Relay summary

1. The client opens `wss://<server>/connections` with `Authorization: Bearer <installation credential>` (never in the URL). Plain `ws://` is only accepted for loopback hosts.
2. The server sends `request` frames (`id`, `tool`, `args`, `principal`). The client runs them through its local policy layer (allow-lists, write opt-in, output sanitization, idempotent receipts) and answers with a `response` carrying exactly one of `result` or `error {code, message, next_step}`. `principal` is `{id, scopes, role, email}`: `role` is `owner` or `guest` (a shared user) and `email` is the caller's account email when known. The client starts every message it delivers to an agent with a `[PeerBand relay]` line naming the sender from these fields; a missing role counts as a guest.
3. The server sends `ping` after 20 s of silence; the client replies `pong`. The client closes the socket with code 4000 and reconnects if it hears nothing from the server for 75 s.
4. Limits: 64 KiB per frame, 32 outstanding requests, 15 s per request. Requests are never replayed; a write whose response is lost is reported as `delivery_unknown`.
5. Close codes 4001 (replaced), 4003, 4401 (auth) and HTTP 401/403 on upgrade mean the credential is revoked or superseded: the client stops reconnecting.
6. Agent events: the client sends `x-peerband-features: events` on the upgrade and then pushes `event` frames (`eventId`, `name`, `timestamp`, `data`) without being asked:
   - `agent.status_changed` `{agentId, status, previousStatus, label, workspace, revision}` when an agent's status changes (at most one per agent per 250 ms, latest wins, with an overall rate cap);
   - `agents.changed` `{}` when agents appear, exit or change occupant, and once after every (re)connect, so consumers re-list;
   - `agent.notified` `{agentId, text, audience: "owner"}` for a note sent with `peerband notify` (1 to 1024 characters, sanitized and redacted like agent output).
   Events are metadata only and never carry terminal output. They are sent only while the socket is open; nothing is queued while disconnected.

The client only reports metadata (tool, target id, outcome, latency) to its local activity log; message bodies and agent output are never logged.

## Versioning

The protocol has no explicit version field today. Changes are additive: new optional fields, new `tool` values and new frame types may appear, so implementations must ignore unknown fields and unknown frame types on received messages. The `event` frame is such an addition: servers that do not know it ignore it, and the `x-peerband-features` upgrade header tells servers that do which clients emit events. A breaking change would use a new endpoint path or a `hello` negotiation message and be documented here with a bump of the schema `$id`. Schemas are published with each client release in `protocol/`.

The tests in `test/protocol.test.ts` validate messages produced by the real relay client against these schemas.
