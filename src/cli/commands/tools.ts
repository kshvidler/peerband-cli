import { randomUUID } from 'node:crypto';
import { enrollmentBase, type Credentials } from '../../core/index.js';
import { sanitize } from '../output.js';
import { CliError, type Ctx } from '../types.js';
import { requireCredentials } from './shared.js';

/**
 * The PeerBand MCP tools, called by this machine's credential (`POST /api/installation/tools/{tool}`).
 * Arguments are the MCP tool's arguments and the result is the MCP tool's structured result, unchanged.
 */

export const NO_TOOL_SUPPORT = "This PeerBand server doesn't support agent tools from the CLI yet.";

/** Plain calls to wait_for_agent and ask_agent stop after this many seconds; the CLI keeps waiting with more calls. */
export const SERVER_WAIT_CAP = 50;
/** The longest the CLI waits in total, like an MCP task. */
export const MAX_WAIT = 3600;

/** A tool's error, exactly as the MCP tool reports it in its structured content. */
export interface ToolErrorBody { code: string; message: string; next_step: string }

export class ToolError extends CliError {
  readonly body: ToolErrorBody;
  constructor(body: ToolErrorBody) {
    super(`${sanitize(body.code)}: ${sanitize(body.message)}`, body.next_step ? sanitize(body.next_step) : undefined);
    this.name = 'ToolError';
    this.body = body;
  }
}

export type ToolArgs = Record<string, unknown>;
export type ToolResult = Record<string, unknown>;

function errorBody(parsed: unknown): ToolErrorBody | undefined {
  const error = parsed && typeof parsed === 'object' ? (parsed as { error?: unknown }).error : undefined;
  if (!error || typeof error !== 'object') return undefined;
  const { code, message, next_step: next } = error as Record<string, unknown>;
  if (typeof code !== 'string') return undefined;
  return { code, message: typeof message === 'string' ? message : '', next_step: typeof next === 'string' ? next : '' };
}

/** Calls one tool. Throws ToolError for a tool error, CliError for anything else. */
export async function callTool(ctx: Ctx, credentials: Credentials, tool: string, args: ToolArgs, timeoutMs = 30_000): Promise<ToolResult> {
  const url = new URL(`/api/installation/tools/${encodeURIComponent(tool)}`, enrollmentBase(credentials.serverUrl));
  let response: Response;
  try {
    response = await ctx.fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${credentials.credential}`, 'content-type': 'application/json' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new CliError(`Could not reach ${url.origin}: ${(error as Error).message}`, 'Check your network connection and try again.');
  }
  const parsed = (await response.json().catch(() => ({}))) as unknown;
  if (response.ok) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new CliError('PeerBand sent an unexpected tool result.', 'Try again; run `peerband update` if it keeps happening.');
    return parsed as ToolResult;
  }
  if (response.status === 401) throw new CliError("PeerBand rejected this machine's credential (it may have been revoked).", 'Run `peerband login` again to sign in.');
  const body = errorBody(parsed);
  if (body) throw new ToolError(body);
  if (response.status === 404 || response.status === 405) throw new CliError(NO_TOOL_SUPPORT, 'Use the PeerBand MCP server or the dashboard for now.');
  throw new CliError(`PeerBand answered HTTP ${response.status}.`, 'Try again in a moment.');
}

/** The tools this server offers the CLI (`GET /api/installation/tools`). */
export async function listTools(ctx: Ctx, credentials: Credentials): Promise<ToolResult> {
  const url = new URL('/api/installation/tools', enrollmentBase(credentials.serverUrl));
  let response: Response;
  try {
    response = await ctx.fetch(url, { headers: { authorization: `Bearer ${credentials.credential}` }, signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    throw new CliError(`Could not reach ${url.origin}: ${(error as Error).message}`, 'Check your network connection and try again.');
  }
  if (response.status === 401) throw new CliError("PeerBand rejected this machine's credential (it may have been revoked).", 'Run `peerband login` again to sign in.');
  if (!response.ok) throw new CliError(NO_TOOL_SUPPORT, 'Use the PeerBand MCP server or the dashboard for now.');
  return (await response.json().catch(() => ({}))) as ToolResult;
}

/** A fresh idempotency key for a write (at least 16 characters, as the tools require). */
export const newKey = (): string => `cli-${randomUUID()}`;

/** Prints a result as JSON, the same object an MCP client gets as structured content. */
export function printResult(ctx: Ctx, result: unknown): void {
  ctx.out.print(JSON.stringify(result, null, 2));
}

/**
 * Runs a tool command: prints the result, or the MCP error object on stdout plus the message on stderr.
 * Exit code 0 for a result, 1 for a tool error (as `isError` over MCP).
 */
export async function runTool(ctx: Ctx, operation: (credentials: Credentials) => Promise<unknown>, onKey?: string): Promise<number> {
  const credentials = await requireCredentials(ctx);
  try {
    printResult(ctx, await operation(credentials));
    return 0;
  } catch (error) {
    if (error instanceof ToolError) {
      printResult(ctx, { error: error.body });
      ctx.out.fail(error.message, error.hint);
      return 1;
    }
    if (onKey && error instanceof CliError && error.message.startsWith('Could not reach')) {
      // The write may have arrived: retrying with the same key never sends it twice.
      throw new CliError(`${error.message}. The write may or may not have arrived.`, `Retry with --key ${onKey} (never a new key), or check with \`peerband request\`.`);
    }
    throw error;
  }
}

/** installation_id for the call: --installation ID, --here (this machine), or none (the MCP default). */
export function installationArg(credentials: Credentials, options: { installation?: string; here?: boolean }): ToolArgs {
  if (options.installation && options.here) throw new CliError('Pass either --installation or --here, not both.');
  if (options.here) return { installation_id: credentials.installationId };
  return options.installation ? { installation_id: options.installation } : {};
}

const sleepFor = (ctx: Ctx, ms: number) => (ctx.sleep ? ctx.sleep(ms, ctx.signal) : new Promise<void>((resolve) => setTimeout(resolve, ms)));
const now = (ctx: Ctx) => (ctx.now ? ctx.now() : Date.now());

/**
 * wait_for_agent for up to `timeout` seconds: one call when it fits the server's plain-call cap (exactly the MCP
 * result), otherwise repeated calls on the event bus until the agent reaches a status or the time is up.
 */
export async function waitForAgent(ctx: Ctx, credentials: Credentials, args: ToolArgs & { timeout_seconds?: number }): Promise<ToolResult> {
  const total = args.timeout_seconds;
  if (total === undefined || total <= SERVER_WAIT_CAP) return callTool(ctx, credentials, 'wait_for_agent', args, ((total ?? 30) + 30) * 1000);
  const started = now(ctx);
  const deadline = started + total * 1000;
  let result: ToolResult;
  for (;;) {
    const left = Math.max(1, Math.ceil((deadline - now(ctx)) / 1000));
    const slice = Math.min(SERVER_WAIT_CAP, left);
    result = await callTool(ctx, credentials, 'wait_for_agent', { ...args, timeout_seconds: slice }, (slice + 30) * 1000);
    if (result.reason !== 'timeout' || now(ctx) >= deadline - 1000) break;
    // Wait times are short when the machine answered at once; never spin.
    if (typeof result.waited_seconds === 'number' && result.waited_seconds < 1) await sleepFor(ctx, 1000);
  }
  return { ...result, waited_seconds: Math.round((now(ctx) - started) / 100) / 10 };
}

const SETTLED = ['idle', 'done', 'blocked'];

/**
 * ask_agent for up to `timeout` seconds. Within the server's cap it is one call (exactly the MCP result). Longer, the
 * CLI keeps following the agent after the first call returns `timeout`: it waits for the agent to start (if it had
 * not), then for it to settle, and reads the output once at the end, like ask_agent run as an MCP task.
 */
export async function askAgent(ctx: Ctx, credentials: Credentials, args: ToolArgs & { timeout_seconds?: number; output_lines?: number }): Promise<ToolResult> {
  const total = args.timeout_seconds;
  const first = total === undefined ? undefined : Math.min(SERVER_WAIT_CAP, total);
  const started = now(ctx);
  const result = await callTool(ctx, credentials, 'ask_agent', { ...args, ...(first !== undefined ? { timeout_seconds: first } : {}) }, ((first ?? 45) + 30) * 1000);
  if (total === undefined || total <= SERVER_WAIT_CAP || result.reason !== 'timeout') return result;
  const deadline = started + total * 1000;
  const target: ToolArgs = { agent_id: args.agent_id, installation_id: result.installation_id ?? args.installation_id };
  const left = () => Math.floor((deadline - now(ctx)) / 1000);
  let began = result.started_working === true;
  let status = result.status;
  if (!began && left() > 1) {
    const start = await waitForAgent(ctx, credentials, { ...target, statuses: ['working', 'blocked'], timeout_seconds: left() });
    if (start.reason === 'machine_offline') return { ...result, reason: 'machine_offline', status: start.status, waited_seconds: elapsed(ctx, started), next_step: 'The machine went offline. Check list_machines before retrying.' };
    if (start.matched === true) {
      status = start.status;
      began = true;
      if (status === 'blocked') return finish(ctx, credentials, result, target, 'blocked', status, began, started, args.output_lines);
    }
  }
  if (began && left() > 1) {
    const settled = await waitForAgent(ctx, credentials, { ...target, statuses: SETTLED, timeout_seconds: left() });
    status = settled.status;
    if (settled.reason === 'machine_offline') return { ...result, reason: 'machine_offline', status, started_working: began, waited_seconds: elapsed(ctx, started), next_step: 'The machine went offline. Check list_machines before retrying.' };
    if (settled.matched === true) return finish(ctx, credentials, result, target, status === 'blocked' ? 'blocked' : 'finished', status, began, started, args.output_lines);
  }
  return {
    ...result, status, started_working: began, waited_seconds: elapsed(ctx, started),
    next_step: began
      ? 'The agent is still working. Run `peerband agent wait` with this agent id to keep waiting, then `peerband agent output`.'
      : 'The agent has not started yet. Check `peerband request` and `peerband agent status`.',
  };
}

const elapsed = (ctx: Ctx, started: number) => Math.round((now(ctx) - started) / 100) / 10;

async function finish(ctx: Ctx, credentials: Credentials, first: ToolResult, target: ToolArgs, reason: string, status: unknown, began: boolean, started: number, lines?: number): Promise<ToolResult> {
  const out: ToolResult = { ...first, reason, status, started_working: began, waited_seconds: elapsed(ctx, started) };
  delete out.next_step;
  const delivery = first.delivery as { request_id?: string } | undefined;
  if (delivery?.request_id) {
    try {
      const receipt = await callTool(ctx, credentials, 'get_request_status', { installation_id: target.installation_id, request_id: delivery.request_id });
      out.delivery = { request_id: receipt.requestId ?? delivery.request_id, state: receipt.state, ...(receipt.errorCode ? { error_code: receipt.errorCode } : {}) };
    } catch {
      // keep the receipt we have
    }
  }
  if (lines) {
    try {
      out.output = await callTool(ctx, credentials, 'get_agent_output', { ...target, lines });
    } catch (error) {
      if (error instanceof ToolError) out.output_error = { code: error.body.code, message: error.body.message };
      else throw error;
    }
  }
  return out;
}
