import { retryAsk } from '../domain/decision.js';
import { ConnectorError } from '../domain/errors.js';
import { recordMatches, type HandledPage, type RecordBook } from '../domain/records.js';
import { resolveRoutine, searchRoutines, type Routine } from '../domain/routine.js';
import type { RunControlAction, RunDetail, RunSummary, StartReceipt } from '../domain/run.js';
import { clip } from '../domain/text.js';
import { collectWaiting, type WaitingItem } from '../domain/waiting.js';
import { pickWorkspace, type Workspace } from '../domain/workspace.js';
import type { Confirm, Connector, Overview, Scope } from './ports/in/connector.js';
import type { TooneAppPort } from './ports/out/toone-app.js';

const DEFAULT_RUNS = 5;
const MAX_RUNS = 20;
const DEFAULT_RECORDS = 10;
const MAX_RECORDS = 50;
/** Records fetched from the app when a text search has to be applied here. */
const SEARCH_WINDOW = 500;

export class ConnectorService implements Connector {
  constructor(
    private readonly app: TooneAppPort,
    private readonly cwd: string,
  ) {}

  workspaces(): Promise<Workspace[]> {
    return this.app.workspaces();
  }

  async routines(scope: Scope & { search?: string }): Promise<{ workspace: string; routines: Routine[] }> {
    const ws = await this.workspace(scope);
    return { workspace: ws.name, routines: searchRoutines(await this.app.routines(ws), scope.search) };
  }

  async overview(scope: Scope): Promise<Overview> {
    const ws = await this.workspace(scope);
    const [live, recent] = await Promise.all([this.app.liveStatus(ws), this.app.recentRuns(ws, DEFAULT_RUNS)]);
    const activeIds = new Set(live.runs.map((r) => r.runId));
    return {
      workspace: ws.name,
      running: live.runs,
      waiting: collectWaiting(live.runs, live.blocked),
      lastFinished: recent.filter((r) => !activeIds.has(r.runId)),
    };
  }

  async waiting(scope: Scope): Promise<{ workspace: string; waiting: WaitingItem[] }> {
    const ws = await this.workspace(scope);
    const live = await this.app.liveStatus(ws);
    return { workspace: ws.name, waiting: collectWaiting(live.runs, live.blocked) };
  }

  async recentRuns(scope: Scope & { routine?: string; limit?: number }): Promise<{ workspace: string; runs: RunSummary[] }> {
    const ws = await this.workspace(scope);
    const limit = clamp(scope.limit, DEFAULT_RUNS, MAX_RUNS);
    if (!scope.routine) return { workspace: ws.name, runs: await this.app.recentRuns(ws, limit) };
    const routine = resolveRoutine(await this.app.routines(ws), scope.routine);
    const window = await this.app.recentRuns(ws, 100);
    return { workspace: ws.name, runs: window.filter((r) => r.routineId === routine.id).slice(0, limit) };
  }

  async runResult(scope: Scope & { runId: string }): Promise<RunDetail> {
    return this.app.runDetail(await this.workspace(scope), scope.runId);
  }

  async recordBooks(scope: Scope): Promise<{ workspace: string; books: RecordBook[] }> {
    const ws = await this.workspace(scope);
    return { workspace: ws.name, books: await this.app.recordBooks(ws) };
  }

  async handled(scope: Scope & { book: string; search?: string; status?: string; limit?: number }): Promise<HandledPage> {
    const ws = await this.workspace(scope);
    const limit = clamp(scope.limit, DEFAULT_RECORDS, MAX_RECORDS);
    const found = await this.app.findRecords(ws, {
      book: scope.book,
      status: scope.status,
      limit: scope.search ? SEARCH_WINDOW : limit,
    });
    const records = found.records.filter((r) => recordMatches(r, scope.search)).slice(0, limit);
    return { book: scope.book, total: found.total, returned: records.length, byStatus: found.byStatus, records };
  }

  async start(req: Scope & { routine: string; inputs?: Record<string, string> }, confirm: Confirm): Promise<StartReceipt> {
    const ws = await this.workspace(req);
    const routine = resolveRoutine(await this.app.routines(ws), req.routine);
    const inputs = req.inputs ?? {};
    const inputText = Object.keys(inputs).length > 0 ? ` Inputs: ${clip(inputs, 300)}.` : '';
    await demand(confirm, {
      title: `Run "${routine.name}" in ${ws.name}?`,
      detail: `This starts the routine ${routine.id} in Toone on this Mac. It will do whatever the routine does, including sending or publishing if it is built to.${inputText}`,
    });
    return this.app.start(ws, routine.id, inputs);
  }

  async control(req: Scope & { runId: string; action: RunControlAction }, confirm: Confirm): Promise<string> {
    const ws = await this.workspace(req);
    const live = await this.app.liveStatus(ws);
    const run = live.runs.find((r) => r.runId === req.runId);
    const label = run ? `"${run.routineName}"` : `run ${req.runId}`;
    const retry = req.action === 'continue' ? retryAsk(run) : null;
    await demand(confirm, retry ?? {
      title: `${capitalise(req.action)} ${label}?`,
      detail:
        req.action === 'continue'
          ? 'The run picks up where it stopped and carries on with its remaining steps.'
          : req.action === 'cancel'
            ? 'The run stops for good. Work already done stays done.'
            : 'The run stops after the current step and waits.',
    });
    return this.app.control(ws, req.runId, req.action);
  }

  async answer(req: Scope & { executionId: string; inputs: Record<string, string> }, confirm: Confirm): Promise<string> {
    const ws = await this.workspace(req);
    await demand(confirm, {
      title: 'Send this answer to the waiting routine?',
      detail: `Inputs: ${clip(req.inputs, 400)}. The routine continues with them.`,
    });
    return this.app.supplyInputs(ws, req.executionId, req.inputs);
  }

  private async workspace(scope: Scope): Promise<Workspace> {
    return pickWorkspace(await this.app.workspaces(), scope.workspace, this.cwd);
  }
}

async function demand(confirm: Confirm, ask: { title: string; detail: string }): Promise<void> {
  if (!(await confirm(ask))) throw new ConnectorError('NOT_CONFIRMED', 'Not confirmed, so nothing was done.');
}

function clamp(value: number | undefined, fallback: number, max: number): number {
  if (!value || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(value)));
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
