import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Empty } from '../components/Empty';
import { ErrorBox } from '../components/ErrorBox';
import { Spinner } from '../components/Spinner';
import { StatusBadge } from '../components/StatusBadge';
import { useProjects } from '../hooks/useProjects';

/** Start page: quick actions and the list of projects. */
export function HomePage() {
  const { me, isChef } = useAuth();
  const { data: projects, error, loading, reload } = useProjects();
  const active = (projects ?? []).filter((p) => p.status === 'active');

  return (
    <>
      <p className="greeting">Hallo {me?.employee?.name.split(' ')[0] ?? ''}!</p>
      <div className="quick-actions">
        <Link to="/time" className="quick">⏱️<span>Stunden erfassen</span></Link>
        <Link to="/purchase" className="quick">🧾<span>Material gekauft</span></Link>
        <Link to="/demand" className="quick">📦<span>Material fehlt</span></Link>
        <Link to="/photo" className="quick">📷<span>Foto</span></Link>
      </div>
      {isChef && (
        <div className="button-row">
          <Link to="/dashboard" className="btn">Dashboard</Link>
          <Link to="/admin/projects" className="btn">Projekte verwalten</Link>
        </div>
      )}
      <h2>Aktive Projekte</h2>
      <ErrorBox message={error} onRetry={() => void reload()} />
      {!projects && loading && <Spinner />}
      {projects && !active.length && <Empty>Keine aktiven Projekte.</Empty>}
      <ul className="card-list">
        {active.map((p) => (
          <li key={p.id}>
            <Link to={`/projects/${p.id}`} className="card card-link">
              <strong>{p.name}</strong>
              <span className="muted">{p.client}</span>
              <span className="muted">{p.address}</span>
            </Link>
          </li>
        ))}
      </ul>
      {isChef && projects?.some((p) => p.status === 'closed') && (
        <>
          <h2>Abgeschlossen</h2>
          <ul className="card-list">
            {projects.filter((p) => p.status === 'closed').map((p) => (
              <li key={p.id}>
                <Link to={`/projects/${p.id}`} className="card card-link">
                  <strong>{p.name}</strong> <StatusBadge status="closed" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
