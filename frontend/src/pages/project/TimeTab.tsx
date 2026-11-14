import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/api';
import { errorMessage } from '../../api/ApiError';
import type { Project, TimeEntry } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Empty } from '../../components/Empty';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import { StatusBadge } from '../../components/StatusBadge';
import { useApi } from '../../hooks/useApi';
import { formatDate, formatHours, formatMoney } from '../../lib/format';

/** Time entries of a project (own entries for employees, all for the chef). */
export function TimeTab({ project }: { project: Project }) {
  const { isChef } = useAuth();
  const { data, error, loading, reload, setData } = useApi(`time:${project.id}`, () => api.listTimeEntries(project.id));
  const [actionError, setActionError] = useState<string | null>(null);
  const canEdit = (t: TimeEntry) => t.status === 'open' && (isChef || project.status === 'active');

  const remove = async (t: TimeEntry) => {
    if (!window.confirm(`Eintrag vom ${formatDate(t.date)} (${t.from}–${t.to}) löschen?`)) return;
    setActionError(null);
    try {
      await api.deleteTimeEntry(project.id, t.id);
      setData((data ?? []).filter((x) => x.id !== t.id));
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  const entries = data ?? [];
  const total = entries.reduce((s, t) => s + t.hours, 0);
  const open = entries.filter((t) => t.status === 'open').reduce((s, t) => s + t.hours, 0);

  return (
    <section>
      {(project.status === 'active' || isChef) && (
        <Link to={`/time?project=${project.id}`} className="btn btn-primary btn-block">+ Stunden erfassen</Link>
      )}
      <ErrorBox message={error ?? actionError} onRetry={() => void reload()} />
      {!data && loading && <Spinner />}
      {data && !entries.length && <Empty>Noch keine Stunden erfasst.</Empty>}
      {entries.length > 0 && (
        <p className="summary">Gesamt {formatHours(total)} h · offen {formatHours(open)} h</p>
      )}
      <ul className="item-list">
        {entries.map((t) => (
          <li key={t.id} className="item">
            <div className="item-main">
              <strong>{formatDate(t.date)} · {t.from}–{t.to}</strong>
              <span className="item-amount">{formatHours(t.hours)} h</span>
            </div>
            <div className="item-text">{t.description}</div>
            <div className="item-meta">
              {isChef && <span>{t.employeeName}</span>}
              <StatusBadge status={t.status} />
              {isChef && t.rate ? <span className="muted">{formatMoney(t.rate)}/h</span> : null}
              {canEdit(t) && (
                <span className="item-actions">
                  <Link to={`/time?project=${project.id}&edit=${t.id}`} className="link-button">Bearbeiten</Link>
                  <button type="button" className="link-button danger" onClick={() => void remove(t)}>Löschen</button>
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
