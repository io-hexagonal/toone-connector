import { slimFields, type HandledRecord, type RecordBook } from '../../../domain/records.js';
import type { Routine } from '../../../domain/routine.js';
import type { ActiveRun, AwaitingInput, RunDetail, RunStep, RunSummary, StartReceipt } from '../../../domain/run.js';
import { clip } from '../../../domain/text.js';
import type { BlockedThread } from '../../../domain/waiting.js';
import type { Workspace } from '../../../domain/workspace.js';

type Raw = Record<string, unknown>;

const obj = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {});
const list = (v: unknown): Raw[] => (Array.isArray(v) ? v.map(obj) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export function toWorkspaces(payload: unknown): Workspace[] {
  return list(obj(payload).workspaces).map((w) => ({
    id: str(w.workspaceId),
    name: str(w.name),
    projectPath: str(w.projectPath),
    loaded: w.loaded === true,
    selectedInApp: w.selectedInUI === true,
  }));
}

export function toRoutines(payload: unknown): Routine[] {
  return list(obj(payload).routines).map((r) => ({
    id: str(r.routineId),
    name: str(r.name),
    department: str(r.departmentId),
    owner: str(r.owner),
    parentId: strOrNull(r.parentId),
    needsRepair: r.needsRepair === true,
  }));
}

export function toRunSummary(r: Raw): RunSummary {
  return {
    runId: str(r.runId),
    routineId: str(r.routineId),
    routineName: str(r.routineName) || str(r.name),
    status: str(r.status),
    startedAt: strOrNull(r.startedAt) ?? strOrNull(r.createdAt),
    endedAt: strOrNull(r.sealedAt),
    lastStep: strOrNull(r.currentBoundary) ?? strOrNull(r.boundaryLabel) ?? strOrNull(r.boundary),
  };
}

export function toRecentRuns(payload: unknown): RunSummary[] {
  return list(obj(payload).runs).map(toRunSummary);
}

function stepName(step: unknown): string {
  if (typeof step === 'string') return step;
  const s = obj(step);
  return str(s.title) || str(s.stepTitle) || str(s.stepId) || 'a step';
}

function toAwaiting(run: Raw): AwaitingInput[] {
  const out: AwaitingInput[] = [];
  for (const invocation of list(run.invocations)) {
    for (const step of list(invocation.currentSteps)) {
      const missing = strings(step.missingInputIds);
      if (missing.length === 0) continue;
      out.push({
        // The app names the waiting execution on the invocation, not on its steps.
        executionId: str(step.executionId) || str(invocation.awaitingExecutionId) || str(invocation.executionId) || strings(run.awaitingExecutionIds)[0] || '',
        stepTitle: strOrNull(step.title) ?? strOrNull(step.stepId),
        missingInputIds: missing,
      });
    }
  }
  if (out.length === 0) {
    for (const executionId of strings(run.awaitingExecutionIds)) out.push({ executionId, stepTitle: null, missingInputIds: [] });
  }
  return out;
}

export function toActiveRuns(payload: unknown): ActiveRun[] {
  return list(obj(obj(payload).routines).runs).map((r) => {
    const controls = obj(r.controls);
    return {
      ...toRunSummary(r),
      canPause: controls.canPause === true,
      canContinue: controls.canContinue === true,
      canCancel: controls.canCancel === true,
      awaiting: toAwaiting(r),
      heldSteps: (Array.isArray(controls.heldSteps) ? controls.heldSteps : []).map(stepName),
    };
  });
}

export function toBlockedThreads(payload: unknown): BlockedThread[] {
  return list(obj(payload).conversations)
    .filter((c) => c.activityState === 'waiting_for_input')
    .map((c) => ({
      title: str(c.title),
      routineId: strOrNull(c.routineId),
      runId: strOrNull(c.routineRunId),
      activity: clip(str(c.activity), 160),
    }));
}

const SUMMARY_LIMIT = 300;

export function toRunDetail(payload: unknown, runId: string, known: RunSummary | undefined): RunDetail {
  const p = obj(payload);
  const head = Object.keys(obj(p.run)).length > 0 ? toRunSummary(obj(p.run)) : known;
  const snapshot = obj(list(p.invocationSnapshots).at(-1)?.snapshot);
  // The latest snapshot lists every step in order; older app versions only report script steps.
  const staged: RunStep[] = list(snapshot.stages).map((stage) => ({
    title: str(stage.title) || str(stage.id),
    kind: stage.kind === 'code' ? ('script' as const) : ('agent' as const),
    state: str(stage.phase) || str(stage.resultStatus),
    summary: strOrNull(stage.resultSummary) ? clip(stage.resultSummary, SUMMARY_LIMIT) : null,
  }));
  const scripts: RunStep[] = list(p.codeSteps).map((s) => {
    const last = list(s.attempts).at(-1) ?? {};
    return {
      title: str(s.title) || str(s.stepId),
      kind: 'script' as const,
      state: str(s.phase) || str(last.outcome),
      summary: strOrNull(last.summary) ? clip(last.summary, SUMMARY_LIMIT) : strOrNull(last.failureReason),
    };
  });
  return {
    ...(head ?? { runId, routineId: '', routineName: '', status: str(snapshot.phase), startedAt: null, endedAt: null, lastStep: null }),
    runId,
    steps: staged.length > 0 ? staged : scripts,
  };
}

export function toRecordBooks(payload: unknown): RecordBook[] {
  return list(obj(payload).ledgers).map((l) => ({
    id: str(l.id),
    name: str(l.name),
    purpose: clip(str(l.purpose), 200),
    records: typeof l.records === 'number' ? l.records : 0,
    usedBy: list(l.used_by).map((u) => str(u.name)).filter(Boolean),
  }));
}

export function toRecords(payload: unknown): { total: number; records: HandledRecord[] } {
  const p = obj(payload);
  const records = list(p.records).map((r) => {
    const fields = obj(r.fields);
    return {
      key: str(r.key),
      status: strOrNull(fields.status),
      updatedAt: strOrNull(r.updated_at),
      fields: slimFields(Object.fromEntries(Object.entries(fields).filter(([name]) => name !== 'status'))),
    };
  });
  return { total: typeof p.total === 'number' ? p.total : records.length, records };
}

export function toByStatus(payload: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [status, count] of Object.entries(obj(obj(payload).by_status))) if (typeof count === 'number') out[status] = count;
  return out;
}

export function toStartReceipt(payload: unknown, routineId: string, requestId: string): StartReceipt {
  const p = obj(payload);
  return {
    routineId,
    requestId: str(p.requestId) || requestId,
    state: str(p.queueState) || str(p.status) || 'accepted',
    awaitingInputIds: strings(p.awaitingInputIds),
  };
}

export function toControlMessage(payload: unknown, fallback: string): string {
  const p = obj(payload);
  return clip(str(p.message) || str(p.state) || str(p.status) || fallback, 200);
}
