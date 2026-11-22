export type RunControlAction = 'pause' | 'continue' | 'cancel';

export interface RunSummary {
  runId: string;
  routineId: string;
  routineName: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  /** Where the run is, or where it ended, in the app's own words. */
  lastStep: string | null;
}

export interface ActiveRun extends RunSummary {
  canPause: boolean;
  canContinue: boolean;
  canCancel: boolean;
  /** Inputs the run is waiting for, by execution. */
  awaiting: AwaitingInput[];
  /** Steps that failed and are held for a fix. */
  heldSteps: string[];
  /** The same held steps with why they failed, when the app says. */
  held?: HeldStep[];
}

/** A failed step the run holds until the person decides: retry, fix or stop. */
export interface HeldStep {
  step: string;
  reason: string | null;
  /** True for a step that runs a script rather than an agent. */
  automatic: boolean;
}

export interface AwaitingInput {
  executionId: string;
  stepTitle: string | null;
  missingInputIds: string[];
}

export interface RunStep {
  title: string;
  kind: 'script' | 'agent';
  state: string;
  summary: string | null;
}

export interface RunDetail extends RunSummary {
  steps: RunStep[];
}

export interface StartReceipt {
  routineId: string;
  requestId: string;
  state: string;
  /** Inputs the routine still needs before it can start. */
  awaitingInputIds: string[];
}
