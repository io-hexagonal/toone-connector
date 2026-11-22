/** A failure the person can act on. `code` is stable; `message` is plain language. */
export class ConnectorError extends Error {
  constructor(
    readonly code: ConnectorErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ConnectorError';
  }
}

export type ConnectorErrorCode =
  | 'APP_NOT_RUNNING'
  | 'APP_ERROR'
  | 'WORKSPACE_NOT_FOUND'
  | 'ROUTINE_NOT_FOUND'
  | 'ROUTINE_AMBIGUOUS'
  | 'NOT_CONFIRMED'
  | 'CONFIRMATION_UNAVAILABLE'
  | 'TIMEOUT'
  /** Toone is asking the person to approve this connector. */
  | 'PAIRING_PENDING'
  /** The person declined pairing in Toone. */
  | 'PAIRING_DENIED'
  /** Toone only accepts paired apps and this connector is not paired. */
  | 'PAIRING_REQUIRED'
  /** Toone did not accept the stored pairing (revoked, or another Toone). */
  | 'PAIRING_REJECTED'
  /** Toone is already asking about another app. */
  | 'PAIRING_BUSY'
  /** The program on the port could not prove it is the paired Toone app. */
  | 'APP_NOT_VERIFIED';
