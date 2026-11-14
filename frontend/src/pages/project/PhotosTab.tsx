import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/api';
import type { Project } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Empty } from '../../components/Empty';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import { useApi } from '../../hooks/useApi';
import { formatDateTime } from '../../lib/format';
import { jpegDataUrl } from '../../lib/image';

/** Chronological photo gallery of the project with "only pre-damage" filter. */
export function PhotosTab({ project }: { project: Project }) {
  const { isChef } = useAuth();
  const [onlyPreDamage, setOnlyPreDamage] = useState(false);
  const { data, error, loading, reload } = useApi(`photos:${project.id}`, () => api.listPhotos(project.id));
  const photos = (data ?? []).filter((p) => !onlyPreDamage || p.preDamage);

  return (
    <section>
      {(project.status === 'active' || isChef) && <Link to={`/photo?project=${project.id}`} className="btn btn-primary btn-block">+ Foto</Link>}
      <label className="check">
        <input type="checkbox" checked={onlyPreDamage} onChange={(e) => setOnlyPreDamage(e.target.checked)} />
        nur Vorschäden
      </label>
      <ErrorBox message={error} onRetry={() => void reload()} />
      {!data && loading && <Spinner label="Fotos werden geladen …" />}
      {data && !photos.length && <Empty>{onlyPreDamage ? 'Keine Vorschäden dokumentiert.' : 'Noch keine Fotos.'}</Empty>}
      <ul className="photo-grid">
        {photos.map((p) => (
          <li key={p.id}>
            <Link to={`/projects/${project.id}/photos/${p.id}`} className="photo-tile">
              {p.thumbnail ? <img src={jpegDataUrl(p.thumbnail)} alt={p.description || 'Foto'} loading="lazy" /> : <span className="photo-pending">Vorschau folgt</span>}
              {p.preDamage && <span className="badge badge-urgent photo-flag">Vorschaden</span>}
              <span className="photo-caption">
                {formatDateTime(p.takenAt)}
                {p.description && <> · {p.description}</>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
