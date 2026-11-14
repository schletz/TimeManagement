import type { ReactNode } from 'react';

/** Placeholder for empty lists. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
