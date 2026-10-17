import { spec as connect } from './commands/connect.js';
import { groupSpec, installSpec, uninstallSpec } from './commands/herdr.js';
import { spec as login } from './commands/login.js';
import { spec as logout } from './commands/logout.js';
import { spec as relay } from './commands/relay.js';
import { spec as status } from './commands/status.js';
import type { CommandSpec } from './types.js';

/** Top-level commands in help order. `herdr` is a group handled separately. */
export const commands: CommandSpec[] = [login, logout, status, relay, connect];
export const herdrCommands: CommandSpec[] = [installSpec, uninstallSpec];
export { groupSpec as herdrGroup };

/** All leaf commands by full name ("herdr install"). */
export function lookup(words: string[]): CommandSpec | undefined {
  const [first, second] = words;
  if (first === 'herdr') return herdrCommands.find((command) => command.name === `herdr ${second}`);
  return commands.find((command) => command.name === first);
}

export const topLevelNames = (): string[] => [...commands.map((command) => command.name), 'herdr', 'help'];
