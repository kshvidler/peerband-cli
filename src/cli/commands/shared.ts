import { resolve } from 'node:path';
import { ConfigError, connectorConfigPath, credentialsPath, enrollmentBase, loadConnectorConfig, loadCredentials, mcpUrlFor, type ConnectorConfig, type Credentials } from '../../core/index.js';
import { sanitize } from '../output.js';
import { skillInstalled } from '../skill.js';
import { CliError, EXIT_NOT_LOGGED_IN, type Ctx } from '../types.js';

export const credentialsFile = (ctx: Ctx): string => credentialsPath({ env: ctx.env });

/** Loads credentials; a missing file is exit code 3 with the login hint. */
export async function requireCredentials(ctx: Ctx): Promise<Credentials> {
  try {
    return await loadCredentials(credentialsFile(ctx));
  } catch (error) {
    if (error instanceof ConfigError) {
      throw new CliError(error.message, error.hint, error.message === 'Not logged in.' ? EXIT_NOT_LOGGED_IN : 1);
    }
    throw error;
  }
}

/**
 * Calls a PeerBand installation API (`/api/installation/...`), authenticated by this machine's credential.
 * `notFound` replaces the generic error on a 404, for servers that predate the endpoint.
 */
export async function installationCall(ctx: Ctx, credentials: Credentials, method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown, notFound?: string): Promise<unknown> {
  const url = new URL(path, enrollmentBase(credentials.serverUrl));
  let response: Response;
  try {
    response = await ctx.fetch(url, {
      method,
      headers: { authorization: `Bearer ${credentials.credential}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new CliError(`Could not reach ${url.origin}: ${(error as Error).message}`, 'Check your network connection and try again.');
  }
  if (response.status === 204) return null;
  const parsed = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (response.ok) return parsed;
  const detail = typeof parsed.detail === 'string' ? parsed.detail : `HTTP ${response.status}`;
  if (response.status === 401) throw new CliError("PeerBand rejected this machine's credential (it may have been revoked).", 'Run `peerband login` again to sign in.');
  if (response.status === 404 && notFound) throw new CliError(notFound);
  throw new CliError(sanitize(detail));
}

/** The connector config this machine uses: an explicit path, $PEERBAND_CONNECTOR_CONFIG, or connector.json in the config home (optional). */
export async function loadMachineConnectorConfig(ctx: Ctx, explicitPath?: string): Promise<ConnectorConfig> {
  const explicit = explicitPath ?? ctx.env.PEERBAND_CONNECTOR_CONFIG;
  return explicit ? loadConnectorConfig(resolve(explicit)) : loadConnectorConfig(connectorConfigPath({ env: ctx.env }), { optional: true });
}

/**
 * Messaging to agents is on by default (the gate is the OAuth consent for agents:message).
 * Precedence: --read-only, then --enable-writes (redundant, kept for old scripts), then "enableWrites" in connector.json.
 */
export function writesEnabled(config: ConnectorConfig, flags: { readOnly?: boolean; enableWrites?: boolean } = {}): boolean {
  if (flags.readOnly) return false;
  if (flags.enableWrites) return true;
  return config.enableWrites !== false;
}

export const SKILL_COMMAND = 'peerband skill';

/** Suggestion at the end of login and relay, until the skill is installed. */
export function printSkillTip(ctx: Ctx): void {
  if (skillInstalled(ctx)) return;
  ctx.out.print(ctx.out.stdout.dim(`Give your coding agents the PeerBand skill: ${SKILL_COMMAND}`));
}

export const describeMachine = (credentials: Credentials): string =>
  credentials.machineName ?? credentials.installationId;

/** Tells the user which MCP URL to add to their client, and how. */
export function printMcpHint(ctx: Ctx, serverUrl: string): void {
  const s = ctx.out.stdout;
  let url: string;
  try {
    url = mcpUrlFor(serverUrl, ctx.env);
  } catch {
    return;
  }
  ctx.out.print('');
  ctx.out.print(`${s.bold('MCP server')}  ${s.cyan(url)}`);
  ctx.out.print(
    s.dim('Add it as a custom connector in ChatGPT or Claude (or any MCP client with remote servers), then sign in and approve access.'),
  );
  ctx.out.print(s.dim(`Claude Code: claude mcp add --transport http peerband ${url}`));
}
