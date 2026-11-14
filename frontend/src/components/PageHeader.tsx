import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

/** Page heading with optional back link and actions. */
export function PageHeader({ title, back, children }: { title: string; back?: string | true; children?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="page-header">
      {back && (
        <button type="button" className="back" aria-label="Zurück" onClick={() => (back === true ? navigate(-1) : navigate(back))}>
          ‹
        </button>
      )}
      <h1>{title}</h1>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}
