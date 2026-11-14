/**
 * Application error with a machine readable code. The code is returned to the frontend
 * in `{ ok: false, error: { code, message, details } }`; the message is shown to the user (German).
 *
 * Codes:
 * - AUTH_REQUIRED, AUTH_INVALID, AUTH_EXPIRED: token missing, invalid or expired
 * - FORBIDDEN: user is not allowed to perform the action
 * - NOT_FOUND: entity does not exist (or is hidden for the user)
 * - VALIDATION: invalid input
 * - CONFLICT: state does not allow the change (e.g. item already invoiced)
 * - CONFIRM_REQUIRED: the action needs an explicit confirmation (resend with `confirm: true`)
 * - PROJECT_CLOSED: employees cannot change data of closed projects
 * - BUSY: the script lock could not be acquired in time
 * - INTERNAL: unexpected error (logged)
 */
class AppError extends Error {
  /**
   * @param {string} code error code (see class doc)
   * @param {string} message user facing message (German)
   * @param {Object} [details] optional structured details for the frontend
   */
  constructor(code, message, details) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details || null;
  }
}

/**
 * Throws a VALIDATION error when the condition is false.
 * @param {boolean} condition
 * @param {string} message
 */
function assertValid(condition, message) {
  if (!condition) throw new AppError('VALIDATION', message);
}
