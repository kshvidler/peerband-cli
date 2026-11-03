import { ConnectError, sanitizeOutput } from '../core/core.js';
import { ENVIRONMENT_ACTIONS, environmentCommand, type EnvironmentCommand, type EnvironmentResult } from '../core/environment.js';
import type { HerdrSocketClient } from './socket-client.js';

const FIELDS = ['workspace_id', 'tab_id', 'pane_id', 'name', 'label', 'cwd', 'agent', 'agent_status', 'type'] as const;
function metadata(value: unknown): Record<string, string | number | boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const row = value as Record<string, unknown>;
  const result: Record<string, string | number | boolean> = Object.fromEntries(FIELDS.filter((key) => typeof row[key] === 'string').map((key) => [key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), sanitizeOutput(row[key] as string, { bytes: key === 'cwd' ? 2048 : 256, lines: 1 }).text]));
  for (const key of ['number', 'pane_count', 'tab_count']) if (Number.isSafeInteger(row[key]) && (row[key] as number) >= 0) result[key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = row[key] as number;
  if (typeof row.focused === 'boolean') result.focused = row.focused;
  return result;
}
/** Keep terminal text, process arguments, env and other incidental runtime data off the wire. */
export function environmentMetadata(value: unknown): EnvironmentResult {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const result: EnvironmentResult = metadata(row);
  for (const key of ['workspace', 'tab', 'pane', 'root_pane', 'agent']) {
    if (row[key] && typeof row[key] === 'object') result[key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = metadata(row[key]);
  }
  return result;
}

export async function listEnvironment(client: HerdrSocketClient): Promise<EnvironmentResult> {
  const result: EnvironmentResult = { actions: [...ENVIRONMENT_ACTIONS] };
  for (const [method, key] of [['workspace.list', 'workspaces'], ['tab.list', 'tabs'], ['pane.list', 'panes']] as const) {
    const response = await client.request(method, {}) as Record<string, unknown>;
    if (!Array.isArray(response[key])) throw new ConnectError('schema_mismatch', `Unexpected ${method} response.`, 'Check the installed Herdr schema.');
    // Explicit truncation keeps metadata under the relay frame limit on large sessions.
    let rows = response[key] as Record<string, unknown>[];
    if (key === 'panes') {
      const listed = await client.request('agent.list', {}) as { agents?: Array<{ pane_id: string; name?: string }> };
      rows = rows.map((pane) => ({ ...pane, name: listed.agents?.find((agent) => agent.pane_id === pane.pane_id)?.name }));
    }
    result[key] = rows.slice(0, 50).map(metadata);
    result[`${key}Truncated`] = response[key].length > 50;
  }
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 48 * 1024) throw new ConnectError('response_too_large', 'The environment metadata exceeds the frame budget.', 'Reduce the session layout before listing it remotely.');
  return result;
}

export function environmentParams(input: EnvironmentCommand): Record<string, unknown> {
  const command = environmentCommand(input as unknown as Record<string, unknown>);
  const params: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(command)) {
    if (key === 'action') continue;
    params[key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)] = value;
  }
  if (['workspace.create', 'tab.create', 'pane.split'].includes(command.action)) params.focus = false;
  if (command.action === 'pane.split') {
    params.target_pane_id = params.pane_id;
    delete params.pane_id;
  }
  if (command.action === 'agent.rename') {
    params.target = params.pane_id;
    delete params.pane_id;
  }
  if (command.action === 'agent.start') params.timeout_ms = 8000;
  return params;
}
