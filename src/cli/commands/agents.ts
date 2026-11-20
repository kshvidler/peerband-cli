import { flag, str } from '../args.js';
import { sanitize } from '../output.js';
import { type CommandSpec, type Ctx, type OptionSpec, type Parsed, UsageError } from '../types.js';
import { requireCredentials } from './shared.js';
import { askAgent, callTool, installationArg, listTools, MAX_WAIT, newKey, runTool, type ToolArgs, ToolError, waitForAgent } from './tools.js';

/*
 * The PeerBand MCP tools as commands. Each one sends the MCP tool's arguments and prints the MCP tool's result as
 * JSON, with the same identity checks: this machine's login acts as its owner with read and message access, shares
 * keep their role, a machine that turned messages off refuses them, and environment control reaches this machine
 * only.
 */

const INSTALLATION: OptionSpec = { name: 'installation', type: 'string', valueName: 'ID', description: 'The machine (installation_id from `peerband machines`). Optional when the account has one machine, or one online; always needed for a shared machine.' };
const HERE: OptionSpec = { name: 'here', type: 'boolean', description: 'Use this machine (its own installation_id).' };
const KEY: OptionSpec = { name: 'key', type: 'string', valueName: 'KEY', description: 'Idempotency key (16 to 256 characters). Default: a new random key. Reuse the same key to retry an uncertain write; never a new one.' };

const AGENT_ID = /^[^\u0000-\u001f\u007f]{1,256}$/;

function integer(parsed: Parsed, name: string, min: number, max: number): number | undefined {
  const raw = str(parsed, name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new UsageError(`Invalid --${name} value "${sanitize(raw)}".`, `Use a whole number from ${min} to ${max}.`);
  return value;
}

function key(parsed: Parsed): string {
  const value = str(parsed, 'key') ?? newKey();
  if (value.length < 16 || value.length > 256) throw new UsageError('The --key must be 16 to 256 characters.');
  return value;
}

function agentId(value: string | undefined, usage: string): string {
  if (value === undefined) throw new UsageError('Missing the agent id.', `Usage: ${usage}. Agent ids come from \`peerband agents\`.`);
  if (!AGENT_ID.test(value)) throw new UsageError('Invalid agent id.', 'Use an agent id from `peerband agents`.');
  return value;
}

/** Message text: the remaining words, or standard input when the only word is "-". */
async function messageText(words: string[], ctx: Ctx, usage: string): Promise<string> {
  const text = words.length === 1 && words[0] === '-' ? await readStdin(ctx) : words.join(' ');
  if (!text.trim()) throw new UsageError('The message is empty.', `Usage: ${usage}`);
  return text;
}

function readStdin(ctx: Ctx): Promise<string> {
  return new Promise((resolve) => {
    let text = '';
    const onData = (chunk: Buffer | string) => (text += chunk.toString());
    ctx.stdin.on('data', onData);
    const end = () => {
      ctx.stdin.off('data', onData);
      ctx.stdin.pause();
      resolve(text.replace(/\r?\n$/, ''));
    };
    (ctx.stdin as unknown as NodeJS.ReadableStream).once?.('end', end);
    ctx.stdin.resume();
  });
}

const where = async (ctx: Ctx, parsed: Parsed) => installationArg(await requireCredentials(ctx), { installation: str(parsed, 'installation'), here: flag(parsed, 'here') });

// ---- peerband machines ---------------------------------------------------------------------------------------------

export const machinesSpec: CommandSpec = {
  name: 'machines',
  summary: "List the account's machines and machines shared with it (list_machines)",
  usage: 'peerband machines',
  description:
    "Lists the machines (installations) of the account this machine is logged in to, with installation_id, name and whether each is online, plus machines other PeerBand users shared with it (shared_by, and access read or message). The same result as the MCP tool list_machines, printed as JSON. Use an installation_id from here with --installation in the other commands.",
  options: [],
  examples: [['peerband machines', 'Every machine you can reach, as JSON']],
  notes: ['Needs `peerband login`; the relay does not have to be running.'],
  run: (_parsed, ctx) => runTool(ctx, (credentials) => callTool(ctx, credentials, 'list_machines', {})),
};

// ---- peerband agents -----------------------------------------------------------------------------------------------

export const agentsSpec: CommandSpec = {
  name: 'agents',
  summary: 'List the coding agents on a machine (list_agents)',
  usage: 'peerband agents [--installation ID | --here] [--status STATUS] [--workspace NAME] [--machine NAME] [--limit N] [--cursor C]',
  description:
    'Lists the coding agents on a machine with their status, freshness and capabilities: the MCP tool list_agents, printed as JSON. Use the returned agent ids with `peerband agent`.',
  options: [
    INSTALLATION, HERE,
    { name: 'status', type: 'string', valueName: 'STATUS', description: 'Only agents in this status: idle, working, blocked, done or unknown.' },
    { name: 'workspace', type: 'string', valueName: 'NAME', description: 'Only agents in this Herdr workspace.' },
    { name: 'machine', type: 'string', valueName: 'NAME', description: 'The list_agents machine filter.' },
    { name: 'limit', type: 'string', valueName: 'N', description: 'At most N agents (1 to 200).' },
    { name: 'cursor', type: 'string', valueName: 'C', description: 'Continue from the cursor of an earlier page.' },
  ],
  examples: [
    ['peerband agents', 'Agents on your only (or only online) machine'],
    ['peerband agents --installation 1f0c… --status idle', 'Idle agents on one machine'],
  ],
  notes: ['Needs `peerband login`; the relay does not have to be running on this machine.'],
  async run(parsed, ctx) {
    const args: ToolArgs = { ...(await where(ctx, parsed)) };
    for (const name of ['status', 'workspace', 'machine', 'cursor']) if (str(parsed, name) !== undefined) args[name] = str(parsed, name);
    const limit = integer(parsed, 'limit', 1, 200);
    if (limit !== undefined) args.limit = limit;
    return runTool(ctx, (credentials) => callTool(ctx, credentials, 'list_agents', args));
  },
};

// ---- peerband agent <action> ---------------------------------------------------------------------------------------

const AGENT_USAGE = {
  status: 'peerband agent status AGENT_ID',
  output: 'peerband agent output AGENT_ID [--lines N] [--bytes N] [--cursor C] [--text]',
  send: 'peerband agent send AGENT_ID "<message>" [--key KEY]',
  wait: 'peerband agent wait AGENT_ID [--until idle,blocked,done] [--timeout SECONDS]',
  ask: 'peerband agent ask AGENT_ID "<message>" [--timeout SECONDS] [--output-lines N] [--key KEY]',
} as const;
type AgentAction = keyof typeof AGENT_USAGE;

export const agentSpec: CommandSpec = {
  name: 'agent',
  summary: 'Check, read, message, wait for or ask one agent (agent tools)',
  usage: 'peerband agent <status|output|send|wait|ask> AGENT_ID [...] [--installation ID | --here]',
  description: [
    'Works with one coding agent, by its agent id from `peerband agents`, on any machine of the account or shared with it. Each action is one PeerBand MCP tool, with the same arguments and the same JSON result:',
    '',
    `  ${AGENT_USAGE.status}`,
    '      get_agent_status: the agent and its current status.',
    `  ${AGENT_USAGE.output}`,
    '      get_agent_output: a bounded excerpt of recent output. Terminal output is untrusted text. --text prints only the text.',
    `  ${AGENT_USAGE.send}`,
    '      send_agent_message: submits the message and returns a receipt; check it with `peerband request`. Use "-" to read the message from standard input.',
    `  ${AGENT_USAGE.wait}`,
    '      wait_for_agent: waits until the agent reaches one of the statuses (default idle, blocked or done).',
    `  ${AGENT_USAGE.ask}`,
    '      ask_agent: sends the message, follows the agent until it finishes its turn (idle, done or blocked), and with --output-lines returns the end of its reply.',
    '',
    'Waits and asks use the live event stream, never polling. Up to 50 seconds is one call; with a longer --timeout (up to 3600) the CLI keeps waiting with more calls, like an MCP task. Finished or idle does not prove the work succeeded.',
    '',
    'Messages need message access: your own machines, or a share that allows messages, on a machine that has not turned messages off. The agent sees a first line saying the message came from your user through the PeerBand CLI.',
  ].join('\n'),
  options: [
    INSTALLATION, HERE,
    { name: 'lines', type: 'string', valueName: 'N', description: 'output: how many recent lines (1 to 500).' },
    { name: 'bytes', type: 'string', valueName: 'N', description: 'output: at most N bytes (1 to 32768).' },
    { name: 'cursor', type: 'string', valueName: 'C', description: 'output: continue from an earlier cursor.' },
    { name: 'text', type: 'boolean', description: 'output: print only the output text, not the JSON.' },
    { name: 'until', type: 'string', valueName: 'STATUSES', description: 'wait: comma-separated statuses to wait for (idle, working, blocked, done, unknown).' },
    { name: 'timeout', type: 'string', valueName: 'SECONDS', description: `wait/ask: how long to wait (1 to ${MAX_WAIT}; default 30 for wait, 45 for ask).` },
    { name: 'output-lines', type: 'string', valueName: 'N', description: "ask: return the last N lines of the agent's reply (0 to 200)." },
    KEY,
  ],
  positionals: { name: 'action', max: 66 },
  examples: [
    ['peerband agent status herdr_1a2b…', 'Is it idle, working or blocked?'],
    ['peerband agent output herdr_1a2b… --lines 80 --text', 'The last 80 lines of its terminal'],
    ['peerband agent ask herdr_1a2b… "Run the test suite and summarise failures" --timeout 900 --output-lines 60', 'Hand work to another agent and read its answer'],
    ['peerband agent send herdr_1a2b… "Also update the changelog" --installation 1f0c…', 'Send a follow-up to an agent on another machine'],
    ['peerband agent wait herdr_1a2b… --until idle,blocked --timeout 600', 'Wait for it to stop'],
  ],
  notes: [
    'Needs `peerband login`; the relay does not have to be running on this machine, but it must be on the target machine.',
    'Exit code 1 means the tool reported an error: the {"error": {code, message, next_step}} object is printed on stdout.',
    'A wait or ask that ran out of time is not an error: it prints reason "timeout" and exits 0.',
  ],
  async run(parsed, ctx) {
    const [action, id, ...rest] = parsed.positionals;
    if (action === undefined) throw new UsageError('Missing the action.', 'Use one of: status, output, send, wait, ask. Run `peerband agent --help`.');
    if (!(action in AGENT_USAGE)) throw new UsageError(`Unknown agent action "${sanitize(action)}".`, 'Use one of: status, output, send, wait, ask.');
    const usage = AGENT_USAGE[action as AgentAction];
    const agent = agentId(id, usage);
    const target: ToolArgs = { ...(await where(ctx, parsed)), agent_id: agent };
    const timeout = integer(parsed, 'timeout', 1, MAX_WAIT);
    switch (action as AgentAction) {
      case 'status':
        if (rest.length) throw new UsageError(`Unexpected argument "${sanitize(rest[0]!)}".`, `Usage: ${usage}`);
        return runTool(ctx, (credentials) => callTool(ctx, credentials, 'get_agent_status', target));
      case 'output': {
        if (rest.length) throw new UsageError(`Unexpected argument "${sanitize(rest[0]!)}".`, `Usage: ${usage}`);
        const lines = integer(parsed, 'lines', 1, 500);
        const bytes = integer(parsed, 'bytes', 1, 32768);
        const args: ToolArgs = { ...target, ...(lines !== undefined ? { lines } : {}), ...(bytes !== undefined ? { bytes } : {}), ...(str(parsed, 'cursor') !== undefined ? { cursor: str(parsed, 'cursor') } : {}) };
        if (!flag(parsed, 'text')) return runTool(ctx, (credentials) => callTool(ctx, credentials, 'get_agent_output', args));
        const credentials = await requireCredentials(ctx);
        try {
          const result = await callTool(ctx, credentials, 'get_agent_output', args);
          ctx.out.print(outputText(result));
          return 0;
        } catch (error) {
          if (error instanceof ToolError) {
            ctx.out.fail(error.message, error.hint);
            return 1;
          }
          throw error;
        }
      }
      case 'send': {
        const message = await messageText(rest, ctx, usage);
        const idempotency = key(parsed);
        return runTool(ctx, (credentials) => callTool(ctx, credentials, 'send_agent_message', { ...target, message, idempotency_key: idempotency }), idempotency);
      }
      case 'wait': {
        if (rest.length) throw new UsageError(`Unexpected argument "${sanitize(rest[0]!)}".`, `Usage: ${usage}`);
        const until = str(parsed, 'until');
        const statuses = until === undefined ? undefined : until.split(',').map((status) => status.trim()).filter(Boolean);
        if (statuses !== undefined && !statuses.length) throw new UsageError('--until needs at least one status.', 'For example --until idle,blocked.');
        return runTool(ctx, (credentials) => waitForAgent(ctx, credentials, { ...target, ...(statuses ? { statuses } : {}), ...(timeout !== undefined ? { timeout_seconds: timeout } : {}) }));
      }
      case 'ask': {
        const message = await messageText(rest, ctx, usage);
        const idempotency = key(parsed);
        const outputLines = integer(parsed, 'output-lines', 0, 200);
        return runTool(ctx, (credentials) => askAgent(ctx, credentials, {
          ...target, message, idempotency_key: idempotency,
          ...(timeout !== undefined ? { timeout_seconds: timeout } : {}), ...(outputLines !== undefined ? { output_lines: outputLines } : {}),
        }), idempotency);
      }
    }
  },
};

/** The text of a get_agent_output result, whatever field the connector put it in. Control sequences are stripped. */
export function outputText(result: Record<string, unknown>): string {
  const value = result.output ?? result.text ?? result.lines;
  const pick = (item: unknown): string => {
    if (typeof item === 'string') return item;
    if (Array.isArray(item)) return item.map(pick).join('\n');
    if (item && typeof item === 'object') {
      const object = item as Record<string, unknown>;
      return pick(object.text ?? object.value ?? object.lines ?? '');
    }
    return '';
  };
  return pick(value).replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, ' ');
}

// ---- peerband request ----------------------------------------------------------------------------------------------

export const requestSpec: CommandSpec = {
  name: 'request',
  summary: 'Check the delivery state of a message or environment change (get_request_status)',
  usage: 'peerband request REQUEST_ID [--installation ID | --here]',
  description:
    'Checks a write submitted with `peerband agent send`, `peerband agent ask` or `peerband env`, by the requestId in its receipt: the MCP tool get_request_status, printed as JSON. "Delivered" means the prompt reached Herdr, not that the task finished; environment receipts include result ids when completed. Ask the same machine the write went to.',
  options: [INSTALLATION, HERE],
  positionals: { name: 'request_id', max: 1 },
  examples: [['peerband request 6c1d… --installation 1f0c…', 'Did the message arrive?']],
  async run(parsed, ctx) {
    const [id] = parsed.positionals;
    if (!id) throw new UsageError('Missing the request id.', 'Usage: peerband request REQUEST_ID. It is the requestId in a send receipt.');
    const args = { ...(await where(ctx, parsed)), request_id: id };
    return runTool(ctx, (credentials) => callTool(ctx, credentials, 'get_request_status', args));
  },
};

// ---- peerband env --------------------------------------------------------------------------------------------------

const ENV_ACTIONS: Record<string, string[]> = {
  'workspace.create': ['cwd'], 'tab.create': ['workspace-id', 'cwd'], 'pane.split': ['pane-id', 'cwd', 'direction'],
  'agent.start': ['pane-id', 'name', 'kind'], 'agent.rename': ['pane-id', 'name'],
  'workspace.rename': ['workspace-id', 'label'], 'tab.rename': ['tab-id', 'label'], 'pane.rename': ['pane-id', 'label'],
  'workspace.focus': ['workspace-id'], 'tab.focus': ['tab-id'], 'pane.focus': ['pane-id'],
  'workspace.close': ['workspace-id'], 'tab.close': ['tab-id'], 'pane.close': ['pane-id'],
};
const ENV_FIELDS = ['workspace-id', 'tab-id', 'pane-id', 'cwd', 'label', 'direction', 'name', 'kind'];

export const envSpec: CommandSpec = {
  name: 'env',
  summary: "List or change this machine's Herdr workspaces, tabs and panes (list_environment, control_environment)",
  usage: 'peerband env list --here | peerband env ACTION --here [--workspace-id ID] [--tab-id ID] [--pane-id ID] [--cwd PATH] [--label TEXT] [--direction D] [--name NAME] [--kind KIND] [--key KEY]',
  description: [
    '`peerband env list` is the MCP tool list_environment: the workspaces, tabs and panes, including panes without an agent. Metadata only; labels are untrusted.',
    '',
    '`peerband env ACTION` is control_environment, with the same actions and fields:',
    '  workspace.create  --cwd [--label]          tab.create   --workspace-id --cwd [--label]',
    '  pane.split        --pane-id --cwd --direction right|down|left|up',
    '  agent.start       --pane-id --name --kind  (an idle shell pane; then `peerband agents` for its id)',
    '  agent.rename      --pane-id --name',
    '  workspace/tab/pane.rename --<target>-id --label     workspace/tab/pane.focus --<target>-id',
    '  workspace/tab/pane.close  --<target>-id   ends everything running there; only when the owner asked for it',
    'It returns a durable receipt: check it with `peerband request --here`. Reuse the same --key to retry; never a new one for an uncertain write.',
    '',
    "From the CLI, environment control reaches this machine only (pass --here). Other machines need the dashboard or an MCP client with environment:control consent. The connector's own switch (\"enableEnvironmentControl\": false) still turns it off. There is no shell typing, agent stop or permission approval.",
  ].join('\n'),
  options: [
    INSTALLATION, HERE,
    { name: 'workspace-id', type: 'string', valueName: 'ID', description: 'Workspace id from `peerband env list`.' },
    { name: 'tab-id', type: 'string', valueName: 'ID', description: 'Tab id.' },
    { name: 'pane-id', type: 'string', valueName: 'ID', description: 'Pane id.' },
    { name: 'cwd', type: 'string', valueName: 'PATH', description: 'Absolute working directory on this machine.' },
    { name: 'label', type: 'string', valueName: 'TEXT', description: 'Name for a new or renamed workspace, tab or pane.' },
    { name: 'direction', type: 'string', valueName: 'D', description: 'pane.split: right, down, left or up.' },
    { name: 'name', type: 'string', valueName: 'NAME', description: 'agent.start / agent.rename: the agent name.' },
    { name: 'kind', type: 'string', valueName: 'KIND', description: 'agent.start: the agent to start, e.g. claude or codex.' },
    KEY,
  ],
  positionals: { name: 'action', max: 1 },
  examples: [
    ['peerband env list --here', "This machine's workspaces, tabs and panes"],
    ['peerband env pane.split --here --pane-id p_3 --cwd /home/me/app --direction right', 'Open a new pane'],
    ['peerband env agent.start --here --pane-id p_4 --name reviewer --kind claude', 'Start an agent in an idle pane'],
  ],
  notes: ['Needs `peerband login`, and the relay running on this machine.'],
  async run(parsed, ctx) {
    const [action] = parsed.positionals;
    if (!action) throw new UsageError('Missing the action.', 'Use `peerband env list --here`, or an action such as pane.split. Run `peerband env --help`.');
    const base = await where(ctx, parsed);
    if (!base.installation_id) throw new UsageError('Environment commands need an explicit machine.', 'Pass --here for this machine.');
    if (action === 'list') return runTool(ctx, (credentials) => callTool(ctx, credentials, 'list_environment', base));
    const needs = ENV_ACTIONS[action];
    if (!needs) throw new UsageError(`Unknown environment action "${sanitize(action)}".`, `Use list or one of: ${Object.keys(ENV_ACTIONS).join(', ')}.`);
    const allowed = new Set([...needs, ...(action.endsWith('.create') && action !== 'agent.start' ? ['label'] : [])]);
    const missing = needs.filter((name) => str(parsed, name) === undefined);
    if (missing.length) throw new UsageError(`${action} needs ${missing.map((name) => `--${name}`).join(', ')}.`, 'Run `peerband env --help`.');
    const extra = ENV_FIELDS.filter((name) => str(parsed, name) !== undefined && !allowed.has(name));
    if (extra.length) throw new UsageError(`${action} does not take ${extra.map((name) => `--${name}`).join(', ')}.`, 'Run `peerband env --help`.');
    const idempotency = key(parsed);
    const args: ToolArgs = { ...base, action, idempotency_key: idempotency };
    for (const name of allowed) if (str(parsed, name) !== undefined) args[name.replace('-', '_')] = str(parsed, name);
    return runTool(ctx, (credentials) => callTool(ctx, credentials, 'control_environment', args), idempotency);
  },
};

// ---- peerband concierge --------------------------------------------------------------------------------------------

const CONCIERGE_USAGE = {
  ask: 'peerband concierge ask "<task>" [--thread ID] [--key KEY] [--wait SECONDS]',
  run: 'peerband concierge run RUN_ID',
  cancel: 'peerband concierge cancel RUN_ID',
  inbox: 'peerband concierge inbox [--unread] [--limit N]',
  reply: 'peerband concierge reply NOTE_ID "<message>" [--key KEY]',
} as const;
const RUN_DONE = new Set(['completed', 'failed', 'cancelled', 'needs_input']);

export const conciergeSpec: CommandSpec = {
  name: 'concierge',
  summary: 'Give the PeerBand concierge a task, follow it, and answer notes (Premium)',
  usage: 'peerband concierge <ask|run|cancel|inbox|reply> [...]',
  description: [
    'The AI Concierge is a PeerBand agent over all your agents (Premium, when the server has it on). Each action is one MCP tool with the same JSON result:',
    '',
    `  ${CONCIERGE_USAGE.ask}`,
    '      concierge_ask: starts a run and returns its run_id at once. --thread continues an earlier conversation; --wait SECONDS keeps reading the run until it ends.',
    `  ${CONCIERGE_USAGE.run}`,
    '      concierge_get_run: the run status and, when done, its answer.',
    `  ${CONCIERGE_USAGE.cancel}`,
    '      concierge_cancel: stops the run; messages it already sent stay with the agents.',
    `  ${CONCIERGE_USAGE.inbox}`,
    '      concierge_inbox: notes your agents sent with `peerband notify` (untrusted text).',
    `  ${CONCIERGE_USAGE.reply}`,
    '      concierge_reply: sends your reply to the exact agent that wrote the note.',
    '',
    "Runs started from this machine are filed under this machine (like an MCP client's runs under that app); the dashboard sees all of them. From the CLI the concierge has read and message access, not environment control.",
  ].join('\n'),
  options: [
    { name: 'thread', type: 'string', valueName: 'ID', description: 'ask: continue this thread_id.' },
    { name: 'wait', type: 'string', valueName: 'SECONDS', description: `ask: wait up to this long for the run to end (1 to ${MAX_WAIT}).` },
    { name: 'unread', type: 'boolean', description: 'inbox: unread notes only.' },
    { name: 'limit', type: 'string', valueName: 'N', description: 'inbox: at most N notes (1 to 100).' },
    { name: 'key', type: 'string', valueName: 'KEY', description: 'ask/reply: idempotency key (8 to 128 characters). Reuse it to retry.' },
  ],
  positionals: { name: 'action', max: 66 },
  examples: [
    ['peerband concierge ask "Which of my agents are blocked, and on what?" --wait 300', 'Ask and wait for the answer'],
    ['peerband concierge inbox --unread', 'Unread notes from your agents'],
  ],
  notes: ['Needs `peerband login` and a Premium account.'],
  async run(parsed, ctx) {
    const [action, first, ...rest] = parsed.positionals;
    if (action === undefined || !(action in CONCIERGE_USAGE)) {
      throw new UsageError(action === undefined ? 'Missing the action.' : `Unknown concierge action "${sanitize(action)}".`, 'Use one of: ask, run, cancel, inbox, reply.');
    }
    const usage = CONCIERGE_USAGE[action as keyof typeof CONCIERGE_USAGE];
    const conciergeKey = () => {
      const value = str(parsed, 'key');
      if (value !== undefined && (value.length < 8 || value.length > 128)) throw new UsageError('The --key must be 8 to 128 characters.');
      return value ?? newKey();
    };
    const id = (value: string | undefined, what: string) => {
      if (!value) throw new UsageError(`Missing the ${what}.`, `Usage: ${usage}`);
      return value;
    };
    switch (action) {
      case 'ask': {
        const request = await messageText(first === undefined ? [] : [first, ...rest], ctx, usage);
        const wait = integer(parsed, 'wait', 1, MAX_WAIT);
        const idempotency = conciergeKey();
        const args: ToolArgs = { request, idempotency_key: idempotency, ...(str(parsed, 'thread') ? { thread_id: str(parsed, 'thread') } : {}) };
        return runTool(ctx, async (credentials) => {
          const run = await callTool(ctx, credentials, 'concierge_ask', args);
          if (wait === undefined || typeof run.run_id !== 'string') return run;
          return followRun(ctx, credentials, run.run_id, wait, run);
        }, idempotency);
      }
      case 'run':
      case 'cancel': {
        const runId = id(first, 'run id');
        if (rest.length) throw new UsageError(`Unexpected argument "${sanitize(rest[0]!)}".`, `Usage: ${usage}`);
        return runTool(ctx, (credentials) => callTool(ctx, credentials, action === 'run' ? 'concierge_get_run' : 'concierge_cancel', { run_id: runId }));
      }
      case 'inbox': {
        if (first !== undefined) throw new UsageError(`Unexpected argument "${sanitize(first)}".`, `Usage: ${usage}`);
        const limit = integer(parsed, 'limit', 1, 100);
        return runTool(ctx, (credentials) => callTool(ctx, credentials, 'concierge_inbox', { unread_only: flag(parsed, 'unread'), ...(limit !== undefined ? { limit } : {}) }));
      }
      default: {
        const noteId = id(first, 'note id');
        const message = await messageText(rest, ctx, usage);
        const idempotency = conciergeKey();
        return runTool(ctx, (credentials) => callTool(ctx, credentials, 'concierge_reply', { note_id: noteId, message, idempotency_key: idempotency }), idempotency);
      }
    }
  },
};

async function followRun(ctx: Ctx, credentials: Awaited<ReturnType<typeof requireCredentials>>, runId: string, seconds: number, last: Record<string, unknown>) {
  const now = () => (ctx.now ? ctx.now() : Date.now());
  const sleep = (ms: number) => (ctx.sleep ? ctx.sleep(ms, ctx.signal) : new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const deadline = now() + seconds * 1000;
  let view = last;
  while (!RUN_DONE.has(String(view.status)) && now() < deadline) {
    await sleep(Math.min(3000, Math.max(0, deadline - now())));
    view = await callTool(ctx, credentials, 'concierge_get_run', { run_id: runId });
  }
  return view;
}

// ---- peerband tools / peerband tool --------------------------------------------------------------------------------

export const toolsSpec: CommandSpec = {
  name: 'tools',
  summary: 'List the PeerBand tools this machine can call',
  usage: 'peerband tools',
  description: 'Lists the PeerBand MCP tools this server offers the CLI (the concierge tools only when it is on), with the access this machine\'s login carries. Call any of them with `peerband tool NAME \'{"arg": "value"}\'`.',
  options: [],
  examples: [['peerband tools', 'What this machine can do through PeerBand']],
  run: (_parsed, ctx) => runTool(ctx, (credentials) => listTools(ctx, credentials)),
};

export const toolSpec: CommandSpec = {
  name: 'tool',
  summary: 'Call a PeerBand MCP tool by name with JSON arguments',
  usage: "peerband tool NAME ['{\"arg\": \"value\"}' | -]",
  description:
    'Calls one PeerBand MCP tool with exactly the arguments an MCP client would send (a JSON object, or "-" to read it from standard input) and prints its structured result as JSON. The named commands (`peerband agents`, `peerband agent ask`, ...) are friendlier; this one is for scripts and for tools without a command of their own. wait_for_agent and ask_agent are single calls here (at most 50 seconds).',
  options: [],
  positionals: { name: 'name', max: 2 },
  examples: [
    ['peerband tool list_machines', 'Same as peerband machines'],
    ['peerband tool get_agent_status \'{"agent_id": "herdr_1a2b…", "installation_id": "1f0c…"}\'', 'Any tool, any arguments'],
  ],
  async run(parsed, ctx) {
    const [name, json] = parsed.positionals;
    if (!name || !/^[a-z_]{1,64}$/.test(name)) throw new UsageError('Missing or invalid tool name.', 'Run `peerband tools` to list them.');
    const raw = json === '-' ? await readStdin(ctx) : json ?? '{}';
    let args: unknown;
    try {
      args = JSON.parse(raw);
    } catch {
      throw new UsageError('The arguments are not valid JSON.', 'Pass a JSON object, for example \'{"agent_id": "…"}\'.');
    }
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new UsageError('The arguments must be a JSON object.');
    return runTool(ctx, (credentials) => callTool(ctx, credentials, name, args as ToolArgs, 120_000));
  },
};

export const toolCommands: CommandSpec[] = [machinesSpec, agentsSpec, agentSpec, requestSpec, envSpec, conciergeSpec, toolsSpec, toolSpec];
