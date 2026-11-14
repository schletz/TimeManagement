import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/api';
import { errorMessage } from '../../api/ApiError';
import type { Demand, DemandStatus, Project } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Empty } from '../../components/Empty';
import { ErrorBox } from '../../components/ErrorBox';
import { ImageViewer } from '../../components/ImageViewer';
import { Spinner } from '../../components/Spinner';
import { StatusBadge } from '../../components/StatusBadge';
import { useApi } from '../../hooks/useApi';
import { formatDate, formatNumber } from '../../lib/format';

const ORDER: Record<DemandStatus, number> = { open: 0, ordered: 1, done: 2 };

/** Material demand reports of the project (visible for everybody). */
export function DemandsTab({ project }: { project: Project }) {
  const { isChef, me } = useAuth();
  const { data, error, loading, reload, setData } = useApi(`demands:${project.id}`, () => api.listDemands(project.id));
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [photo, setPhoto] = useState<Demand | null>(null);
  const active = project.status === 'active';

  const setStatus = async (d: Demand, status: DemandStatus) => {
    setBusyId(d.id);
    setActionError(null);
    try {
      const updated = await api.setDemandStatus(project.id, d.id, status);
      setData((data ?? []).map((x) => (x.id === d.id ? updated : x)));
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const list = [...(data ?? [])].sort((a, b) => ORDER[a.status] - ORDER[b.status]
    || (a.urgency === 'urgent' ? 0 : 1) - (b.urgency === 'urgent' ? 0 : 1) || b.date.localeCompare(a.date));

  return (
    <section>
      {(active || isChef) && <Link to={`/demand?project=${project.id}`} className="btn btn-primary btn-block">+ Material fehlt</Link>}
      <ErrorBox message={error ?? actionError} onRetry={() => void reload()} />
      {!data && loading && <Spinner />}
      {data && !list.length && <Empty>Kein Materialbedarf gemeldet.</Empty>}
      <ul className="item-list">
        {list.map((d) => {
          const own = !!me?.employee && d.reporterId === me.employee.id;
          return (
            <li key={d.id} className={`item ${d.status === 'done' ? 'item-done' : ''}`}>
              <div className="item-main">
                <strong>{d.material}</strong>
                <span className="item-amount">{formatNumber(d.quantity)} {d.unit}</span>
              </div>
              {d.note && <div className="item-text">{d.note}</div>}
              <div className="item-meta">
                <span>{formatDate(d.date)} · {d.reporterName}</span>
                {d.urgency === 'urgent' && <StatusBadge status="urgent" />}
                <StatusBadge status={d.status} />
              </div>
              <div className="item-meta">
                <span className="item-actions">
                  {d.hasPhoto && <button type="button" className="link-button" onClick={() => setPhoto(d)}>Foto</button>}
                  {isChef && d.status !== 'ordered' && d.status !== 'done' && (
                    <button type="button" className="link-button" disabled={busyId === d.id} onClick={() => void setStatus(d, 'ordered')}>Bestellt</button>
                  )}
                  {d.status !== 'done' && (isChef || (own && active)) && (
                    <button type="button" className="link-button" disabled={busyId === d.id} onClick={() => void setStatus(d, 'done')}>Erledigt</button>
                  )}
                  {isChef && d.status !== 'open' && (
                    <button type="button" className="link-button" disabled={busyId === d.id} onClick={() => void setStatus(d, 'open')}>Wieder offen</button>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {photo && <ImageViewer title={photo.material} load={() => api.getPhoto(project.id, { demandId: photo.id })} onClose={() => setPhoto(null)} />}
    </section>
  );
}
