import type { DraftStart, SetupStart } from '../../../domain/drafting.js';
import type { ListingRef } from '../../../domain/explore.js';
import type { RecordBook, RecordQuery, RecordResult } from '../../../domain/records.js';
import type { Routine } from '../../../domain/routine.js';
import type { ActiveRun, RunControlAction, RunDetail, RunSummary, StartReceipt } from '../../../domain/run.js';
import type { LiveStatus } from '../../../domain/waiting.js';
import type { Workspace } from '../../../domain/workspace.js';

/** The running Toone app, as the connector needs it. */
export interface TooneAppPort {
  workspaces(): Promise<Workspace[]>;
  routines(workspace: Workspace): Promise<Routine[]>;
  liveStatus(workspace: Workspace): Promise<LiveStatus>;
  recentRuns(workspace: Workspace, limit: number): Promise<RunSummary[]>;
  runDetail(workspace: Workspace, runId: string): Promise<RunDetail>;
  recordBooks(workspace: Workspace): Promise<RecordBook[]>;
  findRecords(workspace: Workspace, query: RecordQuery): Promise<RecordResult>;
  start(workspace: Workspace, routineId: string, inputs: Record<string, string>): Promise<StartReceipt>;
  control(workspace: Workspace, runId: string, action: RunControlAction): Promise<string>;
  supplyInputs(workspace: Workspace, executionId: string, inputs: Record<string, string>): Promise<string>;
  /** Toone's own assistant drafts a routine from the description. NOT_SUPPORTED_BY_APP on a Toone without it. */
  createRoutine(workspace: Workspace, description: string): Promise<DraftStart>;
  /** Toone's setup conversation for an Explore routine. NOT_SUPPORTED_BY_APP on a Toone without it. */
  startSetup(workspace: Workspace, listing: ListingRef): Promise<SetupStart>;
  close(): Promise<void>;
}
