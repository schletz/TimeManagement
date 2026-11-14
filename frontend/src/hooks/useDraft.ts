import { del, get, set } from 'idb-keyval';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Form state that survives reloads and offline periods: it is kept in IndexedDB (including image blobs)
 * until it was sent successfully (`clear`) or discarded.
 *
 * @param key storage key, e.g. "draft:time"; null disables persistence (edit forms)
 * @param create factory for a fresh draft (called initially and after clear)
 */
export function useDraft<T extends object>(key: string | null, create: () => T) {
  const [value, setValue] = useState<T>(create);
  const [ready, setReady] = useState(key === null);
  const [restored, setRestored] = useState(false);
  const createRef = useRef(create);
  createRef.current = create;
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    get<T>(key)
      .then((stored) => {
        if (cancelled || !stored) return;
        setValue({ ...createRef.current(), ...stored });
        setRestored(true);
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, [key]);

  const update = useCallback((patch: Partial<T> | ((prev: T) => T)) => {
    setValue((prev) => {
      const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
      if (key) {
        // Debounced write: typing should not hit IndexedDB on every key stroke.
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void set(key, next).catch(() => undefined), 300);
      }
      return next;
    });
  }, [key]);

  const clear = useCallback(() => {
    window.clearTimeout(timer.current);
    if (key) void del(key).catch(() => undefined);
    setValue(createRef.current());
    setRestored(false);
  }, [key]);

  return { value, update, clear, ready, restored };
}
