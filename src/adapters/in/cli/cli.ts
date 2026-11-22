import { createInterface } from 'node:readline/promises';
import type { Confirm, Connector } from '../../../application/ports/in/connector.js';
import { ConnectorError } from '../../../domain/errors.js';
import type { RunSummary } from '../../../domain/run.js';
import { ago } from '../../../domain/text.js';

export const USAGE = `toone-connector: see, start and decide on your Toone routines.

  toone-connector status [--workspace NAME]          what is running and waiting
  toone-connector waiting                            what is waiting for you
  toone-connector routines [WORDS]                   list routines
  toone-connector runs [ROUTINE] [--limit N]         recent runs
  toone-connector run RUN_ID                         one run, step by step
  toone-connector books                              record books
  toone-connector handled BOOK [WORDS] [--status S]  who or what was already handled
  toone-connector start ROUTINE [--input id=value]   run a routine (asks first)
  toone-connector pause|continue|cancel RUN_ID       change a run (asks first)
  toone-connector doctor                             check the connection to Toone
  toone-connector mcp                                serve the tools to Claude (used by the plugin)

Options: --workspace NAME, --json, --yes (skip the question; only on a terminal you control)
`;

interface Args {
  command: string;
  words: string[];
  workspace?: string;
  status?: string;
  limit?: number;
  json: boolean;
  yes: boolean;
  inputs: Record<string, string>;
}

export function parseArgs(argv: string[]): Args {
  const args: Args = { command: argv[0] ?? 'help', words: [], json: false, yes: false, inputs: {} };
  for (let i = 1; i < argv.length; i += 1) {
    const a = argv[i] ?? '';
    const next = (): string => argv[(i += 1)] ?? '';
    if (a === '--json') args.json = true;
    else if (a === '--yes') args.yes = true;
    else if (a === '--workspace') args.workspace = next();
    else if (a === '--status') args.status = next();
    else if (a === '--limit') args.limit = Number(next());
    else if (a === '--input') {
      const pair = next();
      const cut = pair.indexOf('=');
      if (cut > 0) args.inputs[pair.slice(0, cut)] = pair.slice(cut + 1);
    } else args.words.push(a);
  }
  return args;
}

/** Runs one command and returns the process exit code. */
export async function runCli(connector: Connector, argv: string[], out: (line: string) => void): Promise<number> {
  const args = parseArgs(argv);
  const scope = { workspace: args.workspace };
  const now = new Date();
  const first = args.words[0] ?? '';
  const show = (value: unknown, human: () => void): void => (args.json ? out(JSON.stringify(value, null, 2)) : human());
  const runLine = (r: RunSummary): string => `  ${r.routineName}: ${r.status}${r.lastStep ? ` (${r.lastStep})` : ''}${ago(r.endedAt ?? r.startedAt, now) ? `, ${ago(r.endedAt ?? r.startedAt, now)}` : ''}  [${r.runId}]`;
  try {
    switch (args.command) {
      case 'doctor': {
        const all = await connector.workspaces();
        out(`Connected to Toone. ${all.length} workspace(s): ${all.map((w) => `${w.name}${w.selectedInApp ? ' (open)' : ''}`).join(', ')}.`);
        return 0;
      }
      case 'status': {
        const o = await connector.overview(scope);
        show(o, () => {
          out(`${o.workspace}`);
          out(o.running.length ? 'Running or paused:' : 'Nothing is running.');
          o.running.forEach((r) => out(runLine(r)));
          out(o.waiting.length ? 'Waiting for you:' : 'Nothing is waiting for you.');
          o.waiting.forEach((w) => out(`  ${w.routineName}: ${w.what} → ${w.howToAnswer}`));
          if (o.lastFinished.length) out('Last finished:');
          o.lastFinished.forEach((r) => out(runLine(r)));
        });
        return 0;
      }
      case 'waiting': {
        const w = await connector.waiting(scope);
        show(w, () => (w.waiting.length ? w.waiting.forEach((i) => out(`${i.routineName}: ${i.what} → ${i.howToAnswer}`)) : out('Nothing is waiting for you.')));
        return 0;
      }
      case 'routines': {
        const r = await connector.routines({ ...scope, search: args.words.join(' ') || undefined });
        show(r, () => r.routines.forEach((x) => out(`${x.name}  [${x.id}]${x.needsRepair ? '  needs repair' : ''}`)));
        return 0;
      }
      case 'runs': {
        const r = await connector.recentRuns({ ...scope, routine: args.words.join(' ') || undefined, limit: args.limit });
        show(r, () => r.runs.forEach((x) => out(runLine(x))));
        return 0;
      }
      case 'run': {
        const d = await connector.runResult({ ...scope, runId: first });
        show(d, () => {
          out(`${d.routineName}: ${d.status}`);
          d.steps.forEach((s) => out(`  ${s.kind === 'script' ? 'script' : 'agent '} ${s.title}: ${s.state}${s.summary ? `. ${s.summary}` : ''}`));
        });
        return 0;
      }
      case 'books': {
        const b = await connector.recordBooks(scope);
        show(b, () => b.books.forEach((x) => out(`${x.id}  (${x.records})  ${x.name}`)));
        return 0;
      }
      case 'handled': {
        const h = await connector.handled({ ...scope, book: first, search: args.words.slice(1).join(' ') || undefined, status: args.status, limit: args.limit });
        show(h, () => {
          out(`${h.book}: ${h.total} records. ${Object.entries(h.byStatus).map(([s, n]) => `${s} ${n}`).join(', ')}`);
          h.records.forEach((r) => out(`  ${r.key}${r.status ? ` [${r.status}]` : ''}`));
        });
        return 0;
      }
      case 'start': {
        const receipt = await connector.start({ ...scope, routine: args.words.join(' '), inputs: args.inputs }, terminalConfirm(args.yes, out));
        show(receipt, () => out(`Started ${receipt.routineId}: ${receipt.state}.${receipt.awaitingInputIds.length ? ` Still needs: ${receipt.awaitingInputIds.join(', ')}.` : ''}`));
        return 0;
      }
      case 'pause':
      case 'continue':
      case 'cancel': {
        out(await connector.control({ ...scope, runId: first, action: args.command }, terminalConfirm(args.yes, out)));
        return 0;
      }
      default:
        out(USAGE);
        return args.command === 'help' || args.command === '--help' ? 0 : 2;
    }
  } catch (error) {
    out(error instanceof ConnectorError ? error.message : `Unexpected failure: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

function terminalConfirm(yes: boolean, out: (line: string) => void): Confirm {
  return async (ask) => {
    out(`${ask.title}\n${ask.detail}`);
    if (yes) return true;
    if (!process.stdin.isTTY) {
      throw new ConnectorError('CONFIRMATION_UNAVAILABLE', 'No terminal to ask on. Run this yourself in a terminal, or pass --yes.');
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      return /^y(es)?$/i.test((await rl.question('Go ahead? [y/N] ')).trim());
    } finally {
      rl.close();
    }
  };
}
