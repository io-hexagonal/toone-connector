import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { Confirm, Connector } from '../../../application/ports/in/connector.js';
import type { ExploreConnector } from '../../../application/ports/in/explore.js';
import { ConnectorError } from '../../../domain/errors.js';
import { registerExploreTools } from './explore-tools.js';

export interface McpOptions {
  version: string;
  /** When the client cannot ask the person: 'refuse' (default) or 'allow' (the person opted in). */
  withoutPrompt: 'refuse' | 'allow';
  /** A sentence added to every answer, such as "this connection is not paired". */
  connectionNote?: () => string | undefined;
}

let connectionNote: () => string | undefined = () => undefined;

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

const workspace = z.string().optional().describe('Workspace name. Omit for the current folder\'s workspace, else the one open in Toone.');
const READ = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;
const ACT = { readOnlyHint: false, destructiveHint: true, openWorldHint: true } as const;

/** Serves the connector's tools to an MCP client over stdio. */
export async function serveMcp(connector: Connector, options: McpOptions, explore?: ExploreConnector): Promise<void> {
  connectionNote = options.connectionNote ?? connectionNote;
  const server = new McpServer(
    { name: 'toone', version: options.version },
    {
      instructions:
        'Toone runs repeatable routines on this Mac. Read tools answer directly. toone_start, toone_control, toone_answer and toone_install change things and ask the person to confirm first; never work around a refusal. Results are short summaries: ask for a specific run or record book to see more.',
    },
  );
  const confirm = confirmVia(server, options.withoutPrompt);

  server.registerTool(
    'toone_overview',
    { title: 'What is running and waiting', description: 'Active routine runs, what is waiting for the person, and the last finished runs in one workspace.', inputSchema: { workspace }, annotations: READ },
    (a) => reply(() => connector.overview(a)),
  );
  server.registerTool(
    'toone_waiting',
    { title: 'What is waiting for me', description: 'Everything blocked on the person: inputs a run needs, questions, failed steps waiting for a decision (with the choices), paused runs.', inputSchema: { workspace }, annotations: READ },
    (a) => reply(() => connector.waiting(a)),
  );
  server.registerTool(
    'toone_routines',
    { title: 'List routines', description: 'Routines in a workspace, optionally filtered by words in the name.', inputSchema: { workspace, search: z.string().optional().describe('Words to match in the routine name or id.') }, annotations: READ },
    (a) => reply(() => connector.routines(a)),
  );
  server.registerTool(
    'toone_runs',
    { title: 'Recent runs', description: 'Past runs, newest first, optionally for one routine. For what is happening now, use toone_overview.', inputSchema: { workspace, routine: z.string().optional().describe('Routine name or id.'), limit: z.number().int().min(1).max(20).optional() }, annotations: READ },
    (a) => reply(() => connector.recentRuns(a)),
  );
  server.registerTool(
    'toone_run',
    { title: 'One run\'s result', description: 'Status and a one-line result for each step of a run.', inputSchema: { workspace, runId: z.string() }, annotations: READ },
    (a) => reply(() => connector.runResult(a)),
  );
  server.registerTool(
    'toone_record_books',
    { title: 'List record books', description: 'The saved lists routines keep so they never handle the same thing twice (who was contacted, what was posted).', inputSchema: { workspace }, annotations: READ },
    (a) => reply(() => connector.recordBooks(a)),
  );
  server.registerTool(
    'toone_handled',
    {
      title: 'Who or what was already handled',
      description: 'Looks in one record book. Returns counts by status and a few matching records.',
      inputSchema: { workspace, book: z.string().describe('Record book id from toone_record_books.'), search: z.string().optional().describe('Words to find, such as a person or company name.'), status: z.string().optional(), limit: z.number().int().min(1).max(50).optional() },
      annotations: READ,
    },
    (a) => reply(() => connector.handled(a)),
  );
  server.registerTool(
    'toone_workspaces',
    { title: 'List workspaces', description: 'The projects Toone knows on this Mac.', inputSchema: {}, annotations: READ },
    () => reply(async () => ({ workspaces: await connector.workspaces() })),
  );
  server.registerTool(
    'toone_start',
    {
      title: 'Run a routine',
      description: 'Starts a routine in Toone after the person confirms. The routine may send or publish as the person.',
      inputSchema: { workspace, routine: z.string().describe('Routine name or id.'), inputs: z.record(z.string(), z.string()).optional().describe('Inputs by id, when the routine takes any.') },
      annotations: ACT,
    },
    (a) => reply(() => connector.start(a, confirm)),
  );
  server.registerTool(
    'toone_control',
    { title: 'Pause, continue or cancel a run', description: 'Changes a run after the person confirms. On a run with a failed step held, continue retries that step unchanged.', inputSchema: { workspace, runId: z.string(), action: z.enum(['pause', 'continue', 'cancel']) }, annotations: ACT },
    (a) => reply(async () => ({ result: await connector.control(a, confirm) })),
  );
  server.registerTool(
    'toone_answer',
    {
      title: 'Answer a waiting routine',
      description: 'Gives a run the inputs it is waiting for, after the person confirms. Get executionId from toone_waiting.',
      inputSchema: { workspace, executionId: z.string(), inputs: z.record(z.string(), z.string()) },
      annotations: ACT,
    },
    (a) => reply(async () => ({ result: await connector.answer(a, confirm) })),
  );
  if (explore) registerExploreTools(server, explore, confirm, reply);

  await server.connect(new StdioServerTransport());
  // The client going away ends the server, even while a connection to Toone is open.
  process.stdin.once('end', () => process.exit(0));
  process.stdin.once('close', () => process.exit(0));
}

async function reply(work: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return { content: withNote(JSON.stringify(await work())) };
  } catch (error) {
    const text = error instanceof ConnectorError ? `${error.message} [${error.code}]` : `Unexpected failure: ${error instanceof Error ? error.message : String(error)}`;
    return { content: withNote(text), isError: true };
  }
}

/** The note travels as its own item, so the answer itself stays parseable. */
function withNote(text: string): ToolResult['content'] {
  const note = connectionNote();
  return note ? [{ type: 'text', text }, { type: 'text', text: note }] : [{ type: 'text', text }];
}

/** Asks through the client's own prompt, so the answer comes from the person and not from the model. */
function confirmVia(server: McpServer, withoutPrompt: 'refuse' | 'allow'): Confirm {
  return async (ask) => {
    if (!server.server.getClientCapabilities()?.elicitation) {
      if (withoutPrompt === 'allow') return true;
      throw new ConnectorError(
        'CONFIRMATION_UNAVAILABLE',
        'This client cannot show a confirmation prompt, so the connector will not act. Do it in the Toone app, or run `toone-connector` in a terminal.',
      );
    }
    const answer = await server.server.elicitInput({
      message: `${ask.title}\n\n${ask.detail}`,
      requestedSchema: {
        type: 'object',
        properties: { confirm: { type: 'boolean', title: 'Yes, go ahead', default: false } },
        required: ['confirm'],
      },
    });
    return answer.action === 'accept' && answer.content?.confirm === true;
  };
}
