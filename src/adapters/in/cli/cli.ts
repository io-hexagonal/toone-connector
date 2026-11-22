import { createInterface } from 'node:readline/promises';
import type { Confirm, Connector } from '../../../application/ports/in/connector.js';
import type { ExploreConnector } from '../../../application/ports/in/explore.js';
import type { Pairing } from '../../../application/ports/in/pairing.js';
import { ConnectorError } from '../../../domain/errors.js';
import { describeScope } from '../../../domain/pairing.js';
import type { RunSummary } from '../../../domain/run.js';
import { ago } from '../../../domain/text.js';
import type { WaitingItem } from '../../../domain/waiting.js';
import { runExploreCommand } from './explore-commands.js';

export const USAGE = `toone-connector: see, start and decide on your Toone routines.

  toone-connector status [--workspace NAME]          what is running and waiting
  toone-connector waiting                            what is waiting for you
  toone-connector routines [WORDS]                   list routines
  toone-connector runs [ROUTINE] [--limit N]         recent runs
  toone-connector run RUN_ID                         one run, step by step
  toone-connector books                              record books
  toone-connector handled BOOK [WORDS] [--status S]  who or what was already handled
  toone-connector start ROUTINE [--input id=value]   run a routine (asks first)
  toone-connector pause|continue|cancel RUN_ID       change a run (asks first); continue retries a held failed step
  toone-connector explore WORDS [--kind routine|bundle]  search Toone Explore; explore ID shows one listing
  toone-connector install LISTING                    open a listing in Toone to install it (asks first)
  toone-connector doctor                             check the connection to Toone
  toone-connector pair [--read-only]                 pair with Toone (you allow it in the app)
  toone-connector unpair                             forget this connector's pairing on this Mac
  toone-connector mcp                                serve the tools to Claude (used by the plugin)

Options: --workspace NAME, --json, --yes (skip the question; only on a terminal you control)
`;

interface Args {
  command: string;
  words: string[];
  workspace?: string;
  status?: string;
  limit?: number;
  kind?: string;
  json: boolean;
  yes: boolean;
  readOnly: boolean;
  inputs: Record<string, string>;
}

export function parseArgs(argv: string[]): Args {
  const args: Args = { command: argv[0] ?? 'help', words: [], json: false, yes: false, readOnly: false, inputs: {} };
  for (let i = 1; i < argv.length; i += 1) {
    const a = argv[i] ?? '';
    const next = (): string => argv[(i += 1)] ?? '';
    if (a === '--json') args.json = true;
    else if (a === '--yes') args.yes = true;
    else if (a === '--read-only') args.readOnly = true;
    else if (a === '--workspace') args.workspace = next();
    else if (a === '--status') args.status = next();
    else if (a === '--limit') args.limit = Number(next());
    else if (a === '--kind') args.kind = next();
    else if (a === '--input') {
      const pair = next();
      const cut = pair.indexOf('=');
      if (cut > 0) args.inputs[pair.slice(0, cut)] = pair.slice(cut + 1);
    } else args.words.push(a);
  }
  return args;
}

/** Runs one command and returns the process exit code. */
export async function runCli(connector: Connector, argv: string[], out: (line: string) => void, explore?: ExploreConnector, pairing?: Pairing): Promise<number> {
  const args = parseArgs(argv);
  if (pairing && (args.command === 'pair' || args.command === 'unpair')) return runPairing(pairing, args, out);
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
        if (pairing) out(pairingLine(pairing));
        return 0;
      }
      case 'status': {
        const o = await connector.overview(scope);
        show(o, () => {
          out(`${o.workspace}`);
          out(o.running.length ? 'Running or paused:' : 'Nothing is running.');
          o.running.forEach((r) => out(runLine(r)));
          out(o.waiting.length ? 'Waiting for you:' : 'Nothing is waiting for you.');
          o.waiting.forEach((w) => out(`  ${waitingLine(w)}`));
          if (o.lastFinished.length) out('Last finished:');
          o.lastFinished.forEach((r) => out(runLine(r)));
        });
        return 0;
      }
      case 'waiting': {
        const w = await connector.waiting(scope);
        show(w, () => (w.waiting.length ? w.waiting.forEach((i) => out(waitingLine(i))) : out('Nothing is waiting for you.')));
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
      case 'explore':
      case 'install':
        if (!explore) throw new ConnectorError('CATALOG_UNAVAILABLE', 'Explore is not available here.');
        return await runExploreCommand(explore, { ...args, command: args.command }, out, terminalConfirm(args.yes, out));
      default:
        out(USAGE);
        return args.command === 'help' || args.command === '--help' ? 0 : 2;
    }
  } catch (error) {
    out(error instanceof ConnectorError ? error.message : `Unexpected failure: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

/** One waiting item; a decision lists its choices. */
function waitingLine(i: WaitingItem): string {
  const choices = i.choices ? Object.entries(i.choices).map(([c, how]) => `${c}: ${how}`).join('; ') : i.howToAnswer;
  return `${i.routineName}: ${i.what} → ${choices}`;
}

/** `pair` and `unpair`. The consent itself happens in the Toone app. */
async function runPairing(pairing: Pairing, args: Args, out: (line: string) => void): Promise<number> {
  try {
    if (args.command === 'unpair') {
      out(pairing.unpair() ? 'Forgot this connector\'s pairing on this Mac. Also revoke it in Toone: Settings › Connected Apps.' : 'This connector was not paired.');
      return 0;
    }
    const outcome = await pairing.pair(args.readOnly ? 'read' : 'control', (ticket) =>
      out(`Toone is asking you to allow "Toone Connector". Check that Toone shows the code ${ticket.code}, choose what it may do, and click Allow. Waiting…`),
    );
    if (outcome.status === 'approved') {
      out(`Paired. Toone allows this connector to ${describeScope(outcome.scope)}.`);
      return 0;
    }
    out(PAIR_MESSAGES[outcome.status]);
    return 1;
  } catch (error) {
    out(error instanceof ConnectorError ? error.message : `Unexpected failure: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

const PAIR_MESSAGES = {
  denied: 'You declined the pairing in Toone. Nothing was saved.',
  expired: 'Nobody answered in Toone in time. Run `toone-connector pair` again.',
  unsupported: 'This Toone app cannot pair yet. Update Toone; until then the connector connects without pairing.',
} as const;

function pairingLine(pairing: Pairing): string {
  const state = pairing.state();
  return state.paired && state.scope
    ? `Paired: Toone allows this connector to ${describeScope(state.scope)}.`
    : 'Not paired. Run `toone-connector pair` to pair this connector with Toone.';
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
