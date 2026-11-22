/** A failure the person can act on. `code` is stable; `message` is plain language. */
export class ConnectorError extends Error {
  constructor(
    readonly code: ConnectorErrorCode,
    message: string,
    /** Toone's own code for a refusal, when it gave one. */
    readonly appCode?: string,
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
  | 'LISTING_NOT_FOUND'
  | 'LISTING_AMBIGUOUS'
  | 'CATALOG_UNAVAILABLE'
  | 'NOT_OPEN_IN_APP'
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
  | 'APP_NOT_VERIFIED'
  /** The connector is paired read only and the request needs start-and-control. */
  | 'PAIRED_READ_ONLY'
  /** The running Toone does not offer this to connectors yet. */
  | 'NOT_SUPPORTED_BY_APP'
  | 'INVALID_REQUEST'
  /** Toone's plan does not allow another routine. */
  | 'ROUTINE_LIMIT'
  /** Toone's setup refused the listing; the message is Toone's. */
  | 'SETUP_REFUSED';
