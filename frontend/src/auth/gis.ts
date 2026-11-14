/**
 * Thin wrapper around Google Identity Services (https://accounts.google.com/gsi/client).
 * Provides the sign-in button and silent token renewal via One Tap with auto_select.
 */

interface CredentialResponse {
  credential: string;
}

interface GoogleId {
  initialize(options: {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    use_fedcm_for_prompt?: boolean;
    itp_support?: boolean;
  }): void;
  prompt(): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
  disableAutoSelect(): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

let loader: Promise<GoogleId> | null = null;
let listener: ((token: string) => void) | null = null;
let waiting: { resolve: (t: string) => void; reject: (e: Error) => void; timer: number } | null = null;

/** Loads the GIS script once and initializes it with the client id. */
export function loadGis(clientId: string): Promise<GoogleId> {
  if (loader) return loader;
  loader = new Promise<GoogleId>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      const id = window.google?.accounts.id;
      if (!id) {
        reject(new Error('Google-Anmeldung konnte nicht geladen werden.'));
        return;
      }
      id.initialize({
        client_id: clientId,
        callback: (r) => handleCredential(r.credential),
        auto_select: true,
        cancel_on_tap_outside: false,
        use_fedcm_for_prompt: true,
        itp_support: true,
      });
      resolve(id);
    };
    script.onerror = () => {
      loader = null;
      reject(new Error('Google-Anmeldung nicht erreichbar.'));
    };
    document.head.appendChild(script);
  });
  return loader;
}

function handleCredential(token: string): void {
  if (waiting) {
    window.clearTimeout(waiting.timer);
    waiting.resolve(token);
    waiting = null;
  }
  listener?.(token);
}

/** Registers the callback that receives every new credential (button click or One Tap). */
export function onCredential(cb: (token: string) => void): void {
  listener = cb;
}

/** Renders the Google sign-in button into an element. */
export async function renderSignInButton(clientId: string, el: HTMLElement): Promise<void> {
  const id = await loadGis(clientId);
  id.renderButton(el, { theme: 'filled_blue', size: 'large', text: 'signin_with', locale: 'de', width: 280 });
}

/**
 * Requests a new ID token silently (One Tap with auto_select). Rejects after a timeout when the user
 * has to interact; the UI then shows the sign-in button.
 */
export async function requestTokenSilently(clientId: string, timeoutMs = 8000): Promise<string> {
  const id = await loadGis(clientId);
  return new Promise<string>((resolve, reject) => {
    if (waiting) {
      window.clearTimeout(waiting.timer);
      waiting.reject(new Error('superseded'));
    }
    const timer = window.setTimeout(() => {
      waiting = null;
      reject(new Error('Stille Anmeldung nicht möglich.'));
    }, timeoutMs);
    waiting = { resolve, reject, timer };
    id.prompt();
  });
}

/** Prevents automatic re-login after an explicit sign-out. */
export function disableAutoSelect(): void {
  window.google?.accounts.id.disableAutoSelect();
}
