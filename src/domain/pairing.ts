/** What the person allowed this connector to do in Toone. */
export type PairScope = 'read' | 'control';

/** Shown by the connector while Toone asks the person; Toone shows the same code. */
export interface PairingCode {
  code: string;
  expiresAt: string;
}

export type PairOutcome =
  | { status: 'approved'; scope: PairScope }
  | { status: 'denied' }
  | { status: 'expired' }
  /** The Toone app on this Mac is too old to pair. */
  | { status: 'unsupported' };

export interface PairingState {
  paired: boolean;
  scope?: PairScope;
  pairedAt?: string;
}

export function describeScope(scope: PairScope): string {
  return scope === 'read' ? 'read only' : 'read, and start and control routines';
}
