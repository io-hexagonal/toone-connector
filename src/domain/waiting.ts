import type { ActiveRun } from './run.js';

export type WaitingKind = 'needs_input' | 'question' | 'failed_step' | 'paused';

export interface WaitingItem {
  kind: WaitingKind;
  routineId: string | null;
  routineName: string;
  runId: string | null;
  /** What the person has to do, in one sentence. */
  what: string;
  /** How to act on it from the connector, when that is possible. */
  howToAnswer: string;
}

/** A conversation in the app that is blocked on the person. */
export interface BlockedThread {
  title: string;
  routineId: string | null;
  runId: string | null;
  activity: string;
}

/** What the app reports as live right now. */
export interface LiveStatus {
  runs: ActiveRun[];
  blocked: BlockedThread[];
}

/** Everything that is waiting for the person, most actionable first. */
export function collectWaiting(runs: ActiveRun[], blocked: BlockedThread[]): WaitingItem[] {
  const items: WaitingItem[] = [];
  for (const run of runs) {
    for (const a of run.awaiting) {
      items.push({
        kind: 'needs_input',
        routineId: run.routineId,
        routineName: run.routineName,
        runId: run.runId,
        what: `Needs ${a.missingInputIds.join(', ') || 'an input'}${a.stepTitle ? ` for "${a.stepTitle}"` : ''}.`,
        howToAnswer: `toone_answer with executionId ${a.executionId}`,
      });
    }
    for (const step of run.heldSteps) {
      items.push({
        kind: 'failed_step',
        routineId: run.routineId,
        routineName: run.routineName,
        runId: run.runId,
        what: `Step "${step}" failed and is held for a fix.`,
        howToAnswer: 'Open the run in Toone to fix it, or toone_control cancel.',
      });
    }
  }
  const seen = new Set(items.map((i) => i.runId));
  for (const t of blocked) {
    if (t.runId && seen.has(t.runId)) continue;
    items.push({
      kind: 'question',
      routineId: t.routineId,
      routineName: t.title,
      runId: t.runId,
      what: t.activity || 'Waiting for your answer.',
      howToAnswer: 'Answer in the Toone app.',
    });
  }
  for (const run of runs) {
    if (run.status !== 'paused' || seen.has(run.runId)) continue;
    items.push({
      kind: 'paused',
      routineId: run.routineId,
      routineName: run.routineName,
      runId: run.runId,
      what: `Paused${run.lastStep && run.lastStep !== 'Paused' ? ` at "${run.lastStep}"` : ''}.`,
      howToAnswer: 'toone_control continue or cancel',
    });
  }
  return items;
}
