import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../api/ApiError';

/** In-memory cache shared by all hooks; persisted keys are mirrored to localStorage. */
const memory = new Map<string, unknown>();
const PERSIST_PREFIX = 'baustelle.cache.';

function readCache<T>(key: string, persist: boolean): T | undefined {
  if (memory.has(key)) return memory.get(key) as T;
  if (!persist) return undefined;
  try {
    const raw = localStorage.getItem(PERSIST_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function writeCache(key: string, value: unknown, persist: boolean): void {
  memory.set(key, value);
  if (!persist) return;
  try {
    localStorage.setItem(PERSIST_PREFIX + key, JSON.stringify(value));
  } catch {
    // quota exceeded or storage unavailable: memory cache only
  }
}

/** Drops cached entries whose key starts with the prefix (after mutations). */
export function invalidate(prefix: string): void {
  [...memory.keys()].filter((k) => k.startsWith(prefix)).forEach((k) => memory.delete(k));
}

/** Clears all cached data (sign-out). */
export function clearApiCache(): void {
  memory.clear();
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(PERSIST_PREFIX)).forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

export interface ApiState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  /** Fetches again (keeps showing the current data meanwhile). */
  reload(): Promise<void>;
  /** Replaces the data locally (optimistic update) and in the cache. */
  setData(value: T): void;
}

/**
 * Loads data with stale-while-revalidate semantics: cached data is shown immediately and refreshed
 * in the background. `key` null disables loading.
 */
export function useApi<T>(key: string | null, fetcher: () => Promise<T>, options: { persist?: boolean } = {}): ApiState<T> {
  const persist = options.persist ?? false;
  const [data, setDataState] = useState<T | undefined>(() => (key ? readCache<T>(key, persist) : undefined));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const keyRef = useRef(key);
  keyRef.current = key;

  const load = useCallback(async () => {
    const k = keyRef.current;
    if (!k) return;
    setLoading(true);
    setError(null);
    try {
      const value = await fetcherRef.current();
      if (keyRef.current !== k) return;
      writeCache(k, value, persist);
      setDataState(value);
    } catch (err) {
      if (keyRef.current === k) setError(errorMessage(err));
    } finally {
      if (keyRef.current === k) setLoading(false);
    }
  }, [persist]);

  useEffect(() => {
    setDataState(key ? readCache<T>(key, persist) : undefined);
    void load();
  }, [key, load, persist]);

  const setData = useCallback((value: T) => {
    if (keyRef.current) writeCache(keyRef.current, value, persist);
    setDataState(value);
  }, [persist]);

  return { data, error, loading, reload: load, setData };
}
