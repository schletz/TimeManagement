/** Helpers for Google ID tokens (JWT): decoding claims, local storage and dev tokens. */

const STORAGE_KEY = 'baustelle.idToken';

export interface TokenClaims {
  email: string;
  exp: number;
  name?: string;
  picture?: string;
}

/** Decodes the payload of a JWT without verifying it (verification happens in the backend). */
export function decodeToken(token: string): TokenClaims | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64).split('').map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''),
    );
    return JSON.parse(json) as TokenClaims;
  } catch {
    return null;
  }
}

/** Seconds until the token expires (negative when expired). */
export function secondsLeft(token: string): number {
  const claims = decodeToken(token);
  return claims ? claims.exp - Date.now() / 1000 : -1;
}

export function storeToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable (private mode): the token simply is not remembered
  }
}

export function loadToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Unsigned token for the emulated dev backend (accepted only by backend/dev). */
export function createDevToken(email: string, clientId: string): string {
  const enc = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const now = Math.floor(Date.now() / 1000);
  return `${enc({ alg: 'none', typ: 'JWT' })}.${enc({
    email, aud: clientId, iss: 'https://accounts.google.com', email_verified: true, iat: now, exp: now + 3600,
  })}.dev`;
}
