import type { ReactNode } from 'react';
import { useOnline } from '../hooks/useOnline';

/** Submit button that is disabled while sending or offline (no double submit). */
export function SubmitButton({ busy, disabled, children }: { busy: boolean; disabled?: boolean; children: ReactNode }) {
  const online = useOnline();
  return (
    <button type="submit" className="btn btn-primary btn-block" disabled={busy || disabled || !online}>
      {busy ? 'Wird gesendet …' : online ? children : 'Offline – Senden nicht möglich'}
    </button>
  );
}
