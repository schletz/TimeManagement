import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '../api/api';
import { ApiError, errorMessage } from '../api/ApiError';
import { setTokenSource } from '../api/client';
import type { Me } from '../api/types';
import { config } from '../config';
import { clearApiCache } from '../hooks/useApi';
import { disableAutoSelect, onCredential, requestTokenSilently } from './gis';
import { createDevToken, decodeToken, loadToken, secondsLeft, storeToken } from './tokens';

const ME_KEY = 'baustelle.me';
/** Tokens are renewed when less than this many seconds are left. */
const RENEW_BEFORE_SECONDS = 120;

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut'; error?: string }
  | { status: 'signedIn'; me: Me };

interface AuthValue {
  state: AuthState;
  me: Me | null;
  isChef: boolean;
  /** Dev login with an e-mail (only with VITE_DEV_AUTH). */
  devSignIn(email: string): void;
  signOut(): void;
  /** Reloads the user info (e.g. the employee list after changes by the chef). */
  refreshMe(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

function loadCachedMe(): Me | null {
  try {
    const raw = localStorage.getItem(ME_KEY);
    return raw ? (JSON.parse(raw) as Me) : null;
  } catch {
    return null;
  }
}

function storeMe(me: Me | null): void {
  try {
    if (me) localStorage.setItem(ME_KEY, JSON.stringify(me));
    else localStorage.removeItem(ME_KEY);
  } catch {
    // ignore unavailable storage
  }
}

/**
 * Provides the signed-in user and feeds ID tokens to the API client.
 * Startup: stored token → `me`; otherwise silent One Tap; offline with a cached user → signed in (drafts only).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const tokenRef = useRef<string | null>(loadToken());

  const setToken = (token: string | null) => {
    tokenRef.current = token;
    storeToken(token);
  };

  const refresh = useCallback(async (): Promise<string> => {
    let token: string;
    if (config.devAuth) {
      const email = tokenRef.current ? decodeToken(tokenRef.current)?.email : null;
      if (!email) throw new ApiError('AUTH_REQUIRED', 'Bitte anmelden.');
      token = createDevToken(email, config.googleClientId || 'dev-client-id');
    } else {
      token = await requestTokenSilently(config.googleClientId);
    }
    setToken(token);
    return token;
  }, []);

  // Registered during the first render so that API calls of child components always find a token source.
  useState(() => {
    setTokenSource({
      getToken: async () => {
        const token = tokenRef.current;
        if (!token) throw new ApiError('AUTH_REQUIRED', 'Bitte anmelden.');
        return secondsLeft(token) < RENEW_BEFORE_SECONDS ? refresh() : token;
      },
      refreshToken: refresh,
      onAuthLost: (err) => {
        setToken(null);
        setState({ status: 'signedOut', error: err.message });
      },
    });
    return null;
  });

  const signInWithToken = useCallback(async (token: string) => {
    setToken(token);
    setState({ status: 'loading' });
    try {
      const me = await api.me();
      storeMe(me);
      setState({ status: 'signedIn', me });
    } catch (err) {
      setToken(null);
      storeMe(null);
      setState({ status: 'signedOut', error: errorMessage(err) });
    }
  }, []);

  useEffect(() => {
    onCredential((token) => void signInWithToken(token));
    const stored = tokenRef.current;
    const cachedMe = loadCachedMe();
    if (!navigator.onLine && cachedMe) {
      setState({ status: 'signedIn', me: cachedMe });
      return;
    }
    if (stored && secondsLeft(stored) > RENEW_BEFORE_SECONDS) {
      void signInWithToken(stored);
    } else if (config.devAuth || !config.googleClientId) {
      setState({ status: 'signedOut' });
    } else {
      requestTokenSilently(config.googleClientId)
        .then((t) => signInWithToken(t))
        .catch(() => setState({ status: 'signedOut' }));
    }
  }, [signInWithToken]);

  const value = useMemo<AuthValue>(() => {
    const me = state.status === 'signedIn' ? state.me : null;
    return {
      state,
      me,
      isChef: me?.role === 'chef',
      devSignIn: (email: string) => void signInWithToken(createDevToken(email, config.googleClientId || 'dev-client-id')),
      signOut: () => {
        setToken(null);
        storeMe(null);
        clearApiCache();
        if (!config.devAuth) disableAutoSelect();
        setState({ status: 'signedOut' });
      },
      refreshMe: async () => {
        const fresh = await api.me();
        storeMe(fresh);
        setState({ status: 'signedIn', me: fresh });
      },
    };
  }, [state, signInWithToken]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Access to the auth state; must be used below AuthProvider. */
export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

/** The signed-in user; only use in components rendered for signed-in users. */
export function useMe(): Me {
  const { me } = useAuth();
  if (!me) throw new Error('useMe without signed-in user');
  return me;
}
