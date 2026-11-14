import { ApiError } from '../api/ApiError';

/**
 * Runs an action that the backend may answer with CONFIRM_REQUIRED (e.g. overlapping times, closing a
 * project with open items). The user is asked and, on consent, the action is repeated with `confirm = true`.
 * @returns the result, or null when the user declined
 */
export async function withConfirmation<T>(action: (confirm: boolean) => Promise<T>): Promise<T | null> {
  try {
    return await action(false);
  } catch (err) {
    if (err instanceof ApiError && err.needsConfirmation) {
      return window.confirm(err.message) ? action(true) : null;
    }
    throw err;
  }
}
