import type { ActiveRun, HeldStep } from './run.js';
import { clip } from './text.js';

/** The decision a run waits for when a step failed: retry it, fix it, or stop the run. */
export type DecisionChoice = 'retry' | 'fix' | 'stop';

/** Each way out of a held step and how to take it. Fixing needs Toone: the fix is made with the step's agent there. */
export const HELD_STEP_CHOICES: Readonly<Record<DecisionChoice, string>> = {
  retry: 'toone_control continue (runs the step again, unchanged)',
  fix: 'in Toone, from the failure card on the run; it carries on after the fix',
  stop: 'toone_control cancel (ends the run)',
};

/** The run's held steps, with reasons when the app gave them. */
export function heldStepsOf(run: ActiveRun): HeldStep[] {
  if (run.held && run.held.length > 0) return run.held;
  return run.heldSteps.map((step) => ({ step, reason: null, automatic: false }));
}

/** One sentence about a held step. */
export function heldStepText(held: HeldStep): string {
  const kind = held.automatic ? 'Automatic step' : 'Step';
  return `${kind} "${held.step}" failed${held.reason ? `: ${clip(held.reason, 160)}` : ''}. Held until you decide.`;
}

/** What the person is asked before a continue that retries held steps; null when nothing is held. */
export function retryAsk(run: ActiveRun | undefined): { title: string; detail: string } | null {
  if (!run) return null;
  const held = heldStepsOf(run);
  if (held.length === 0) return null;
  const names = held.map((h) => `"${h.step}"`).join(', ');
  return {
    title: `Retry ${names} in "${run.routineName}"?`,
    detail: 'Toone runs the failed step again as it is; the routine is not changed. If what made it fail is still there, it fails again and waits for you.',
  };
}
