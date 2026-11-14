/**
 * Error returned by the backend (`{ ok: false, error }`) or raised by the client
 * (codes OFFLINE, NETWORK for transport problems).
 */
export class ApiError extends Error {
  readonly code: string;
  readonly details: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details ?? null;
  }

  /** True for errors that need an explicit user confirmation and a resend. */
  get needsConfirmation(): boolean {
    return this.code === 'CONFIRM_REQUIRED';
  }

  /** True when the user has to sign in again. */
  get isAuthError(): boolean {
    return this.code.startsWith('AUTH_');
  }
}

/** Extracts a user facing message from any error. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
