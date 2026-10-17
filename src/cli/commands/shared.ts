import { ConfigError, credentialsPath, loadCredentials, mcpUrlFor, type Credentials } from '../../core/index.js';
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
