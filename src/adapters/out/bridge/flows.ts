import { ConnectorError } from '../../../domain/errors.js';
import type { DraftStart, FlowStart, SetupStart } from '../../../domain/drafting.js';
import { clip } from '../../../domain/text.js';

type Raw = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Toone's answers when it does not know an operation: it is older than the connector. */
export const UNKNOWN_OPERATION = new Set(['UNKNOWN_AGENT_OPERATION', 'UNKNOWN_DESKTOP_OPERATION', 'UNKNOWN_OPERATION']);

function toFlowStart(payload: Raw): FlowStart {
  return {
    status: payload.status === 'reused' ? 'reused' : 'started',
    threadId: str(payload.threadId),
    message: clip(str(payload.message), 400),
  };
}

export function toDraftStart(payload: unknown): DraftStart {
  const raw = (payload ?? {}) as Raw;
  return { ...toFlowStart(raw), draftId: str(raw.draftId) };
}

export function toSetupStart(payload: unknown): SetupStart {
  const raw = (payload ?? {}) as Raw;
  return { ...toFlowStart(raw), revisionId: str(raw.revisionId), title: str(raw.title) };
}

/** Toone's refusals of its own flows, as errors the person can act on. Others pass through. */
export function flowRefusal(error: unknown, flow: 'draft' | 'setup'): unknown {
  if (!(error instanceof ConnectorError) || !error.appCode) return error;
  const code = error.appCode;
  if (UNKNOWN_OPERATION.has(code) || code === 'SETUP_NOT_AVAILABLE_FOR_BUNDLES') {
    const what = flow === 'draft' ? 'take a routine description from the connector' : 'start setup from the connector';
    const instead = flow === 'draft' ? ' Update Toone, or describe the routine to Toone\'s assistant in the app.' : '';
    return new ConnectorError('NOT_SUPPORTED_BY_APP', `This Toone version cannot ${what} yet.${instead}`, code);
  }
  if (code === 'ROUTINE_CREATION_LIMIT') {
    return new ConnectorError('ROUTINE_LIMIT', `Toone did not start a draft: its plan's limit on routines is reached, so nothing was drafted. ${error.message}`, code);
  }
  if (code === 'SETUP_REFUSED') return new ConnectorError('SETUP_REFUSED', `Toone's setup refused this routine, so nothing was set up. ${error.message}`, code);
  return error;
}
