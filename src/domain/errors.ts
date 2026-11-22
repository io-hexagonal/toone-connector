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
  | 'TIMEOUT';
