import { ConnectorError } from './errors.js';
import { clip } from './text.js';

/** The longest description Toone takes for a new routine. */
export const DESCRIPTION_LIMIT = 8000;

/** Toone's answer when it starts one of its own flows for the connector. */
export interface FlowStart {
  /** 'reused': Toone had already started it for this same request. */
  status: 'started' | 'reused';
  threadId: string;
  /** Toone's own sentence about what happens next. */
  message: string;
}

export interface DraftStart extends FlowStart {
  draftId: string;
}

export interface SetupStart extends FlowStart {
  revisionId: string;
  title: string;
}

/** What the connector tells Claude after Toone took a routine description. */
export interface DraftHandoff {
  workspace: string;
  status: DraftStart['status'];
  draftId: string;
  next: string;
  toone: string;
}

/** The description as Toone will take it, or a plain refusal. */
export function routineDescription(text: string): string {
  const description = text.trim();
  if (!description) throw new ConnectorError('INVALID_REQUEST', 'Describe the routine first: what it should do, and when.');
  if (description.length > DESCRIPTION_LIMIT) {
    throw new ConnectorError('INVALID_REQUEST', `The description is ${description.length} characters; Toone takes up to ${DESCRIPTION_LIMIT}. Shorten it.`);
  }
  return description;
}

/** The question shown before Toone starts drafting. */
export function makeRoutineAsk(description: string, project: string): { title: string; detail: string } {
  return {
    title: `Make a routine in ${project}?`,
    detail: `Toone's own assistant drafts a routine from this description: "${clip(description, 240)}". You review and publish the draft in Toone; nothing runs until you do.`,
  };
}

export function draftHandoff(start: DraftStart, project: string): DraftHandoff {
  const what = start.status === 'reused' ? 'Toone had already started this draft for the same request' : 'Toone started drafting the routine';
  return {
    workspace: project,
    status: start.status,
    draftId: start.draftId,
    next: `${what} in ${project}. Click "Open" on Toone's notice about it to follow along; Toone may ask you questions there. You review and publish it in Toone; nothing runs until you do.`,
    toone: start.message,
  };
}
