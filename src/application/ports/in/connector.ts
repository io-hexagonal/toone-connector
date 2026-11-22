import type { HandledPage, RecordBook } from '../../../domain/records.js';
import type { Routine } from '../../../domain/routine.js';
import type { ActiveRun, RunControlAction, RunDetail, RunSummary, StartReceipt } from '../../../domain/run.js';
import type { WaitingItem } from '../../../domain/waiting.js';
import type { Workspace } from '../../../domain/workspace.js';

/** What the person is asked before the connector acts for them. */
export interface ConfirmAsk {
  title: string;
  detail: string;
}

/** Asks the person; resolves true only on an explicit yes. */
export type Confirm = (ask: ConfirmAsk) => Promise<boolean>;

export interface Scope {
  /** Workspace name, id or folder. Omitted: the current folder's workspace, else the one open in Toone. */
  workspace?: string;
}

export interface Overview {
  workspace: string;
  running: ActiveRun[];
  waiting: WaitingItem[];
  lastFinished: RunSummary[];
}

/** Everything the connector can do. Reads never ask; actions always go through `confirm`. */
export interface Connector {
  workspaces(): Promise<Workspace[]>;
  routines(scope: Scope & { search?: string }): Promise<{ workspace: string; routines: Routine[] }>;
  overview(scope: Scope): Promise<Overview>;
  waiting(scope: Scope): Promise<{ workspace: string; waiting: WaitingItem[] }>;
  recentRuns(scope: Scope & { routine?: string; limit?: number }): Promise<{ workspace: string; runs: RunSummary[] }>;
  runResult(scope: Scope & { runId: string }): Promise<RunDetail>;
  recordBooks(scope: Scope): Promise<{ workspace: string; books: RecordBook[] }>;
  handled(scope: Scope & { book: string; search?: string; status?: string; limit?: number }): Promise<HandledPage>;
  start(req: Scope & { routine: string; inputs?: Record<string, string> }, confirm: Confirm): Promise<StartReceipt>;
  control(req: Scope & { runId: string; action: RunControlAction }, confirm: Confirm): Promise<string>;
  answer(req: Scope & { executionId: string; inputs: Record<string, string> }, confirm: Confirm): Promise<string>;
}
