import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/api';
import { errorMessage } from '../api/ApiError';
import { useAuth } from '../auth/AuthContext';
import { ErrorBox } from '../components/ErrorBox';
import { PageHeader } from '../components/PageHeader';
import { PhotoAnnotator } from '../components/PhotoAnnotator';
import { Spinner } from '../components/Spinner';
import { invalidate, useApi } from '../hooks/useApi';
import { useOnline } from '../hooks/useOnline';
import { formatDateTime } from '../lib/format';
import { base64ToBlob, blobToBase64 } from '../lib/image';

/**
 * Full resolution photo with metadata. Owner (while the project is active) and chef can edit the description,
 * the pre-damage flag, annotate further (the stored file is replaced) or delete the photo.
 */
export function PhotoDetailPage() {
  const { projectId = '', photoId = '' } = useParams();
  const navigate = useNavigate();
  const { isChef, me } = useAuth();
  const online = useOnline();
  const photos = useApi(`photos:${projectId}`, () => api.listPhotos(projectId));
  const project = useApi(`project:${projectId}`, () => api.getProject(projectId), { persist: true });
  const photo = photos.data?.find((p) => p.id === photoId);
  const [image, setImage] = useState<Blob | null>(null);
  const [description, setDescription] = useState('');
  const [preDamage, setPreDamage] = useState(false);
  const [annotating, setAnnotating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getPhoto(projectId, { photoId })
      .then((f) => setImage(base64ToBlob(f.base64, f.mimeType)))
      .catch((e) => setError(errorMessage(e)));
  }, [projectId, photoId]);

  useEffect(() => {
    if (photo) {
      setDescription(photo.description);
      setPreDamage(photo.preDamage);
    }
  }, [photo?.id]);

  const [imageUrl, setImageUrl] = useState('');
  useEffect(() => {
    if (!image) return;
    const url = URL.createObjectURL(image);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const canEdit = !!photo && (isChef || (photo.uploaderId === me?.employee?.id && project.data?.status === 'active'));

  const save = async (patch: { base64?: string }) => {
    setBusy(true);
    setError(null);
    try {
      await api.updatePhoto({ projectId, id: photoId, description, preDamage, ...patch });
      invalidate(`photos:${projectId}`);
      await photos.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Foto löschen?')) return;
    setBusy(true);
    try {
      await api.deletePhoto(projectId, photoId);
      invalidate(`photos:${projectId}`);
      navigate(`/projects/${projectId}?tab=photos`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Foto" back={`/projects/${projectId}?tab=photos`} />
      <ErrorBox message={error ?? photos.error} />
      <div className="photo-full">{imageUrl ? <img src={imageUrl} alt={photo?.description || 'Foto'} /> : !error && <Spinner label="Foto wird geladen …" />}</div>
      {photo && (
        <div className="form">
          <p className="muted">Aufgenommen {formatDateTime(photo.takenAt)} · {photo.uploaderName}</p>
          {canEdit ? (
            <>
              <label className="field">
                <span>Beschreibung</span>
                <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>
              <label className="check">
                <input type="checkbox" checked={preDamage} onChange={(e) => setPreDamage(e.target.checked)} />
                Vorschaden
              </label>
              <button type="button" className="btn btn-primary btn-block" disabled={busy || !online} onClick={() => void save({})}>
                {busy ? 'Wird gespeichert …' : 'Speichern'}
              </button>
              <button type="button" className="btn btn-block" disabled={busy || !image || !online} onClick={() => setAnnotating(true)}>✎ Weiter einzeichnen</button>
              <button type="button" className="btn btn-danger btn-block" disabled={busy || !online} onClick={() => void remove()}>Löschen</button>
            </>
          ) : (
            <>
              {photo.description && <p>{photo.description}</p>}
              {photo.preDamage && <p><span className="badge badge-urgent">Vorschaden</span></p>}
            </>
          )}
        </div>
      )}
      {annotating && image && (
        <PhotoAnnotator
          image={image}
          onCancel={() => setAnnotating(false)}
          onSave={(result) => {
            setAnnotating(false);
            setImage(result);
            void blobToBase64(result).then((base64) => save({ base64 }));
          }}
        />
      )}
    </>
  );
}
