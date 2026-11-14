import { Link } from 'react-router-dom';
import { Empty } from '../../components/Empty';
import { ErrorBox } from '../../components/ErrorBox';
import { PageHeader } from '../../components/PageHeader';
import { Spinner } from '../../components/Spinner';
import { StatusBadge } from '../../components/StatusBadge';
import { useProjects } from '../../hooks/useProjects';
import { formatDate } from '../../lib/format';

/** Chef: all projects (active and closed) with link to create/edit. */
export function ProjectsAdminPage() {
  const { data, error, loading, reload } = useProjects();
  const projects = data ?? [];
  return (
    <>
      <PageHeader title="Projekte verwalten" back="/">
        <Link to="/admin/projects/new" className="btn btn-small btn-primary">+ Neu</Link>
      </PageHeader>
      <ErrorBox message={error} onRetry={() => void reload()} />
      {!data && loading && <Spinner />}
      {data && !projects.length && <Empty>Noch keine Projekte angelegt.</Empty>}
      <ul className="item-list">
        {projects.map((p) => (
          <li key={p.id} className="item">
            <div className="item-main">
              <Link to={`/projects/${p.id}`}><strong>{p.name}</strong></Link>
              {p.status === 'closed' ? <StatusBadge status="closed" /> : null}
            </div>
            <div className="item-meta">
              <span>{p.client}</span>
              {p.createdAt && <span className="muted">angelegt {formatDate(p.createdAt)}</span>}
              <span className="item-actions">
                <Link to={`/admin/projects/${p.id}`} className="link-button">Bearbeiten</Link>
                <Link to={`/projects/${p.id}?tab=billing`} className="link-button">Abrechnung</Link>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
