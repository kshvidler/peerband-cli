import { HELP_OPTION } from './args.js';
import type { Style } from './output.js';
import { commands, herdrCommands, herdrGroup } from './registry.js';
import type { CommandSpec, OptionSpec } from './types.js';

function section(s: Style, title: string, lines: string[]): string[] {
  return ['', s.bold(title), ...lines.map((line) => (line ? `  ${line}` : ''))];
}

function table(rows: Array<[string, string]>, s: Style): string[] {
  const width = Math.max(...rows.map(([left]) => left.length));
  return rows.map(([left, right]) => `${s.cyan(left.padEnd(width))}  ${right}`);
}

function optionRows(options: OptionSpec[]): Array<[string, string]> {
  return [...options.filter((option) => !option.hidden), HELP_OPTION].map((option) => {
    const short = option.short ? `-${option.short}, ` : '    ';
    const value = option.type === 'string' ? ` ${option.valueName ?? 'VALUE'}` : '';
    return [`${short}--${option.name}${value}`, option.description];
  });
}

const GLOBAL_ENV: Array<[string, string]> = [
  ['PEERBAND_SERVER', 'Server URL (default https://peerband.com)'],
  ['PEERBAND_MCP_URL', 'MCP endpoint shown by relay/status (default derived from the server)'],
  ['PEERBAND_CONFIG_HOME', 'Directory for credentials and state'],
  ['NO_COLOR / FORCE_COLOR', 'Disable / force colored output'],
];

export function rootHelp(s: Style, version: string): string {
  const lines = [
    `${s.bold('peerband')} ${s.dim(version)}  Reach your Herdr agents from any MCP client through your PeerBand account.`,
    ...section(s, 'Usage', ['peerband <command> [options]']),
    ...section(s, 'Commands', [
      ...table(
        [
          ...commands.map((command): [string, string] => [command.name, command.summary]),
          ['herdr install', 'Install the PeerBand plugin into Herdr'],
          ['herdr uninstall', 'Remove the PeerBand plugin from Herdr'],
          ['help [command]', 'Show help for a command'],
        ],
        s,
      ),
    ]),
    ...section(s, 'Options', table([['-h, --help', 'Show help'], ['-v, --version', 'Print the version']], s)),
    ...section(s, 'Environment', table(GLOBAL_ENV, s)),
    ...section(s, 'Getting started', [
      '1. peerband login           Sign in through your browser',
      '2. peerband herdr install   Add the plugin to Herdr',
      '3. peerband relay           Open the relay tab and connect',
    ]),
    ...section(s, 'Updating', ['peerband update            Update the CLI and the Herdr plugin together (--check to only look)']),
    ...section(s, 'Exit codes', ['0 ok   1 failure   2 usage error   3 not logged in   130 interrupted']),
    '',
    `Run ${s.cyan('peerband <command> --help')} for details. Docs: https://peerband.com`,
  ];
  return `${lines.join('\n')}\n`;
}

export function commandHelp(s: Style, spec: CommandSpec): string {
  const lines = [
    `${s.bold(`peerband ${spec.name}`)}  ${spec.summary}`,
    ...section(s, 'Usage', [spec.usage]),
    '',
    ...spec.description.split('\n').map((line) => `  ${line}`),
    ...section(s, 'Options', table(optionRows(spec.options), s)),
    ...section(
      s,
      'Examples',
      spec.examples.flatMap(([command, comment]) => [`${s.cyan(command)}`, `  ${s.dim(comment)}`]),
    ),
  ];
  if (spec.notes?.length) lines.push(...section(s, 'Notes', spec.notes));
  return `${lines.join('\n')}\n`;
}

export function herdrGroupHelp(s: Style): string {
  const lines = [
    `${s.bold('peerband herdr')}  ${herdrGroup.summary}`,
    ...section(s, 'Usage', ['peerband herdr <install|uninstall> [options]']),
    ...section(s, 'Commands', table(herdrCommands.map((command): [string, string] => [command.name.replace('herdr ', ''), command.summary]), s)),
    ...section(s, 'Examples', ['peerband herdr install', 'peerband herdr uninstall']),
    '',
    `Run ${s.cyan('peerband herdr <command> --help')} for details.`,
  ];
  return `${lines.join('\n')}\n`;
}
