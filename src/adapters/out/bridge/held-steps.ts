import type { HeldStep } from '../../../domain/run.js';
import { clip } from '../../../domain/text.js';

type Raw = Record<string, unknown>;

const obj = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {});
const list = (v: unknown): Raw[] => (Array.isArray(v) ? v.map(obj) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

const REASON_LIMIT = 200;

/** Step titles by id, from what the run reports as current. */
function titlesOf(run: Raw): Map<string, string> {
  const titles = new Map<string, string>();
  for (const invocation of list(run.invocations)) {
    for (const step of list(invocation.currentSteps)) if (str(step.stepId) && str(step.title)) titles.set(str(step.stepId), str(step.title));
  }
  for (const step of list(obj(run.controls).waitingAutomaticSteps)) if (str(step.stepId) && str(step.title)) titles.set(str(step.stepId), str(step.title));
  return titles;
}

/** Held-step fields for an active run: titles instead of ids, and the reasons. Empty when nothing is held. */
export function withHeld(held: HeldStep[]): { heldSteps?: string[]; held?: HeldStep[] } {
  return held.length > 0 ? { heldSteps: held.map((h) => h.step), held } : {};
}

/** The run's held steps with their titles and reasons, from one run of the status answer. */
export function toHeldSteps(run: Raw): HeldStep[] {
  const titles = titlesOf(run);
  const held = obj(run.controls).heldSteps;
  return (Array.isArray(held) ? held : []).map((entry) => {
    if (typeof entry === 'string') return { step: titles.get(entry) ?? entry, reason: null, automatic: false };
    const h = obj(entry);
    const id = str(h.stepId);
    const reason = str(h.reason);
    return {
      step: str(h.title) || titles.get(id) || id || 'a step',
      reason: reason ? clip(reason, REASON_LIMIT) : null,
      automatic: h.kind === 'code',
    };
  });
}
