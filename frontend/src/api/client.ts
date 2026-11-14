import { config } from '../config';
import { ApiError } from './ApiError';

/** Supplies ID tokens to the API client; implemented by the auth layer. */
export interface TokenSource {
  /** Current token (may be refreshed silently when it is about to expire). */
  getToken(): Promise<string>;
  /** Forces a new token after the backend reported AUTH_EXPIRED. */
  refreshToken(): Promise<string>;
  /** Called when authentication finally failed; the UI shows the login again. */
  onAuthLost(error: ApiError): void;
}

let tokenSource: TokenSource | null = null;

/** Registers the token source (called once by the AuthProvider). */
export function setTokenSource(source: TokenSource): void {
  tokenSource = source;
}

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

/**
 * Sends one request. The body is sent as text/plain so the browser does not send a CORS preflight,
 * which Apps Script cannot answer; the redirect from /exec to googleusercontent.com is followed.
 */
async function post<T>(action: string, idToken: string, payload: unknown): Promise<Envelope<T>> {
  let response: Response;
  try {
    response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, idToken, payload }),
      redirect: 'follow',
    });
  } catch {
    throw new ApiError('NETWORK', 'Der Server ist nicht erreichbar. Bitte Verbindung prüfen.');
  }
  try {
    return (await response.json()) as Envelope<T>;
  } catch {
    throw new ApiError('INTERNAL', `Unerwartete Antwort vom Server (HTTP ${response.status}).`);
  }
}

/**
 * Calls a backend action and returns its data. An expired token is refreshed once and the request repeated.
 * @throws ApiError
 */
export async function apiCall<T>(action: string, payload: object = {}): Promise<T> {
  if (!tokenSource) throw new ApiError('AUTH_REQUIRED', 'Bitte anmelden.');
  if (!navigator.onLine) throw new ApiError('OFFLINE', 'Keine Internetverbindung. Speichern ist erst wieder online möglich.');
  let result = await post<T>(action, await tokenSource.getToken(), payload);
  if (!result.ok && result.error?.code === 'AUTH_EXPIRED') {
    result = await post<T>(action, await tokenSource.refreshToken(), payload);
  }
  if (!result.ok) {
    const e = result.error ?? { code: 'INTERNAL', message: 'Unbekannter Fehler' };
    const error = new ApiError(e.code, e.message, e.details);
    if (error.isAuthError) tokenSource.onAuthLost(error);
    throw error;
  }
  return result.data as T;
}
