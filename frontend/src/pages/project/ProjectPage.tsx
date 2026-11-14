import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api/api';
import { useAuth } from '../../auth/AuthContext';
import { ErrorBox } from '../../components/ErrorBox';
import { PageHeader } from '../../components/PageHeader';
import { Spinner } from '../../components/Spinner';
import { StatusBadge } from '../../components/StatusBadge';
import { useApi } from '../../hooks/useApi';
import { BillingTab } from './BillingTab';
import { DemandsTab } from './DemandsTab';
import { PhotosTab } from './PhotosTab';
import { PurchasesTab } from './PurchasesTab';
import { TimeTab } from './TimeTab';

type TabKey = 'time' | 'purchases' | 'demands' | 'photos' | 'billing';

/** Project page: header data and tabs for hours, purchases, demands, photos (and billing for the chef). */
export function ProjectPage() {
  const { projectId = '' } = useParams();
  const { isChef } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabKey) || 'time';
  const { data: project, error, reload } = useApi(`project:${projectId}`, () => api.getProject(projectId), { persist: true });

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'time', label: isChef ? 'Stunden' : 'Meine Stunden' },
    { key: 'purchases', label: isChef ? 'Käufe' : 'Meine Käufe' },
    { key: 'demands', label: 'Bedarf' },
    { key: 'photos', label: 'Fotos' },
    ...(isChef ? [{ key: 'billing' as TabKey, label: 'Abrechnung' }] : []),
  ];

  if (!project) {
    return (
      <>
        <PageHeader title="Projekt" back="/" />
        <ErrorBox message={error} onRetry={() => void reload()} />
        {!error && <Spinner />}
      </>
    );
  }

  const active = project.status === 'active';
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(project.address)}`;

  return (
    <>
      <PageHeader title={project.name} back="/">
        {isChef && <Link to={`/admin/projects/${project.id}`} className="btn btn-small">Bearbeiten</Link>}
      </PageHeader>
      <div className="card project-head">
        {!active && <StatusBadge status="closed" />}
        <dl>
          <dt>Auftraggeber</dt><dd>{project.client || '–'}</dd>
          <dt>Adresse</dt>
          <dd>{project.address ? <a href={mapUrl} target="_blank" rel="noreferrer">{project.address} ↗</a> : '–'}</dd>
          <dt>Bauleiter</dt><dd>{project.siteManager || '–'}</dd>
        </dl>
      </div>
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
            className={tab === t.key ? 'active' : ''} onClick={() => setParams({ tab: t.key }, { replace: true })}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'time' && <TimeTab project={project} />}
      {tab === 'purchases' && <PurchasesTab project={project} />}
      {tab === 'demands' && <DemandsTab project={project} />}
      {tab === 'photos' && <PhotosTab project={project} />}
      {tab === 'billing' && isChef && <BillingTab project={project} />}
    </>
  );
}
