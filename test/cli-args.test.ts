import { afterEach, describe, expect, it } from 'vitest';
import { parseArgs, suggest } from '../src/cli/args.js';
import { commands, herdrCommands } from '../src/cli/registry.js';
import { cleanupAll, runCli, spawnCli } from './cli-helpers.js';

afterEach(cleanupAll);
const ANSI = /\u001b\[/;

describe('peerband argument handling', () => {
  it('prints the version for --version and -v', async () => {
    for (const flag of ['--version', '-v']) {
      const result = await runCli([flag]);
      expect(result.code).toBe(0);
      expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    }
  });

  it('shows root help with no arguments, --help and `help`', async () => {
    for (const argv of [[], ['--help'], ['-h'], ['help']]) {
      const result = await runCli(argv);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Usage');
      expect(result.stdout).toContain('herdr install');
      expect(result.stdout).not.toContain('--managed');
    }
  });

  it('has polished help for every command via --help and `help <cmd>`', async () => {
    for (const command of [...commands, ...herdrCommands]) {
      const words = command.name.split(' ');
      const viaFlag = await runCli([...words, '--help']);
      const viaHelp = await runCli(['help', ...words]);
      expect(viaFlag.code).toBe(0);
      expect(viaFlag.stdout).toBe(viaHelp.stdout);
      expect(viaFlag.stdout).toContain(`peerband ${command.name}`);
      expect(viaFlag.stdout).toContain('Usage');
      expect(viaFlag.stdout).toContain('Examples');
      expect(viaFlag.stdout).toContain('Options');
      expect(viaFlag.stdout).not.toContain('--managed');
    }
    expect((await runCli(['herdr'])).stdout).toContain('install');
  });

  it('rejects unknown commands with exit 2 and a suggestion', async () => {
    const result = await runCli(['stauts']);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('peerband: Unknown command "stauts"');
    expect(result.stderr).toContain('Next:');
    expect(result.stderr).toContain('peerband status');
    expect((await runCli(['herdr', 'instal'])).stderr).toContain('peerband herdr install');
    expect((await runCli(['--bogus'])).code).toBe(2);
  });

  it('rejects unknown options and missing values with exit 2', async () => {
    const unknown = await runCli(['login', '--gran', 'x']);
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toContain('Unknown option --gran');
    expect(unknown.stderr).toContain('Did you mean --grant?');
    const missing = await runCli(['login', '--name']);
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain('needs a value');
    const extra = await runCli(['logout', 'now']);
    expect(extra.code).toBe(2);
  });

  it('parses --name=value, short help and the -- terminator', () => {
    const spec = commands.find((command) => command.name === 'login')!;
    expect(parseArgs(spec, ['--name=box', '--grant', 'g']).values).toEqual({ name: 'box', grant: 'g' });
    expect(parseArgs(spec, ['-h']).values.help).toBe(true);
    expect(() => parseArgs(spec, ['--', 'extra'])).toThrow(/Unexpected argument/);
  });

  it('suggests only close matches', () => {
    expect(suggest('lgout', ['login', 'logout'])).toBe('logout');
    expect(suggest('zzzzzz', ['login', 'logout'])).toBeUndefined();
  });
});

describe('terminal styling', () => {
  it('emits no ANSI when output is not a TTY', async () => {
    const result = await runCli(['--help']);
    expect(result.stdout).not.toMatch(ANSI);
  });

  it('emits ANSI on a TTY, but NO_COLOR turns it off', async () => {
    expect((await runCli(['--help'], { tty: true })).stdout).toMatch(ANSI);
    expect((await runCli(['--help'], { tty: true, env: { NO_COLOR: '1' } })).stdout).not.toMatch(ANSI);
  });

  it('FORCE_COLOR forces ANSI even when piped, and FORCE_COLOR=0 disables it', async () => {
    expect((await runCli(['--help'], { env: { FORCE_COLOR: '1' } })).stdout).toMatch(ANSI);
    expect((await runCli(['--help'], { tty: true, env: { FORCE_COLOR: '0' } })).stdout).not.toMatch(ANSI);
  });

  it('the built binary honours NO_COLOR and piped output', async () => {
    const piped = await spawnCli(['status'], { PEERBAND_CONFIG_HOME: 'nowhere-peerband' });
    expect(piped.stdout + piped.stderr).not.toMatch(ANSI);
    const forced = await spawnCli(['--help'], { FORCE_COLOR: '1', NO_COLOR: '1' });
    expect(forced.stdout).toMatch(ANSI);
    expect((await spawnCli(['--help'], { NO_COLOR: '1' })).stdout).not.toMatch(ANSI);
  });
});
