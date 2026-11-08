import { ConnectError } from './core.js';

export const ENVIRONMENT_ACTIONS = [
  'workspace.create', 'workspace.rename', 'workspace.focus', 'workspace.close',
  'tab.create', 'tab.rename', 'tab.focus', 'tab.close',
  'pane.split', 'pane.rename', 'pane.focus', 'pane.close', 'pane.send_input', 'agent.start', 'agent.rename',
] as const;
export type EnvironmentAction = typeof ENVIRONMENT_ACTIONS[number];
export interface EnvironmentCommand {
  action: EnvironmentAction;
  workspaceId?: string;
  tabId?: string;
  paneId?: string;
  cwd?: string;
  label?: string;
  direction?: 'right' | 'down' | 'left' | 'up';
  name?: string;
  kind?: string;
  /** pane.send_input: one line typed into the pane, followed by Enter. */
  text?: string;
}
export type EnvironmentResult = Record<string, unknown>;
const FIELDS: Record<EnvironmentAction, string[]> = {
  'workspace.create': ['cwd', 'label'], 'workspace.rename': ['workspaceId', 'label'], 'workspace.focus': ['workspaceId'], 'workspace.close': ['workspaceId'],
  'tab.create': ['workspaceId', 'cwd', 'label'], 'tab.rename': ['tabId', 'label'], 'tab.focus': ['tabId'], 'tab.close': ['tabId'],
  'pane.split': ['paneId', 'direction', 'cwd'], 'pane.rename': ['paneId', 'label'], 'pane.focus': ['paneId'], 'pane.close': ['paneId'], 'pane.send_input': ['paneId', 'text'],
  'agent.start': ['paneId', 'name', 'kind'], 'agent.rename': ['paneId', 'name'],
};
const REQUIRED: Record<EnvironmentAction, string[]> = {
  'workspace.create': ['cwd'], 'workspace.rename': ['workspaceId', 'label'], 'workspace.focus': ['workspaceId'], 'workspace.close': ['workspaceId'],
  'tab.create': ['workspaceId', 'cwd'], 'tab.rename': ['tabId', 'label'], 'tab.focus': ['tabId'], 'tab.close': ['tabId'],
  'pane.split': ['paneId', 'direction', 'cwd'], 'pane.rename': ['paneId', 'label'], 'pane.focus': ['paneId'], 'pane.close': ['paneId'], 'pane.send_input': ['paneId', 'text'],
  'agent.start': ['paneId', 'name', 'kind'], 'agent.rename': ['paneId', 'name'],
};
const KINDS = new Set('pi claude codex gemini cursor devin agy cline omp mastracode opencode copilot kimi kiro droid amp grok hermes kilo qodercli qwen letta maki muse'.split(' '));
function invalid(message: string): never {
  throw new ConnectError('invalid_argument', message, 'Use an action and explicit IDs from list_environment; native agent arguments are not accepted.');
}
/** Strict allowlist, independent of the relay and the installed Herdr schema. */
export function environmentCommand(args: Record<string, unknown>): EnvironmentCommand {
  const action = args.action as EnvironmentAction;
  if (!ENVIRONMENT_ACTIONS.includes(action)) invalid('Unsupported environment action.');
  for (const key of Object.keys(args)) {
    if (key !== 'action' && !FIELDS[action].includes(key)) invalid(`Unexpected argument: ${key}.`);
    const value = args[key];
    const max = key === 'cwd' ? 2048 : key === 'text' ? 4096 : key === 'label' ? 128 : 256;
    if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f-\u009f]/.test(value)) invalid(`Invalid ${key}.`);
    if (key.endsWith('Id') && !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,255}$/.test(value as string)) invalid(`Invalid ${key}.`);
  }
  for (const key of REQUIRED[action]) if (args[key] === undefined) invalid(`${key} is required.`);
  if (args.cwd !== undefined && !/^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(args.cwd as string)) invalid('cwd must be an absolute path on the remote machine.');
  if (args.direction !== undefined && !['right', 'down', 'left', 'up'].includes(args.direction as string)) invalid('Invalid split direction.');
  if (args.name !== undefined && !/^[a-z][a-z0-9_-]{0,31}$/.test(args.name as string)) invalid('Invalid agent name.');
  if (args.kind !== undefined && !KINDS.has(args.kind as string)) invalid('Unsupported agent kind.');
  return Object.fromEntries(['action', ...FIELDS[action]].filter((key) => args[key] !== undefined).map((key) => [key, args[key]])) as unknown as EnvironmentCommand;
}
