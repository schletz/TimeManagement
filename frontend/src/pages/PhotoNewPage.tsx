import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/api';
import { errorMessage } from '../api/ApiError';
import { BlobImage } from '../components/BlobImage';
import { ErrorBox } from '../components/ErrorBox';
import { ImagePicker } from '../components/ImagePicker';
import { PageHeader } from '../components/PageHeader';
import { PhotoAnnotator } from '../components/PhotoAnnotator';
import { ProjectSelect } from '../components/ProjectSelect';
import { Spinner } from '../components/Spinner';
import { SubmitButton } from '../components/SubmitButton';
import { invalidate } from '../hooks/useApi';
import { useDraft } from '../hooks/useDraft';
import { getLastProjectId } from '../hooks/useProjects';
import { nowIso } from '../lib/format';
import { blobToBase64 } from '../lib/image';
import { uuid } from '../lib/uuid';

interface PhotoDraft {
  id: string;
  projectId: string;
  image: Blob | null;
  takenAt: string;
  description: string;
  preDamage: boolean;
}

/** Take or choose a photo, annotate it and upload it (only the annotated version is stored). */
export function PhotoNewPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const draft = useDraft<PhotoDraft>('draft:photo', () => ({
    id: uuid(), projectId: params.get('project') || getLastProjectId(), image: null, takenAt: '', description: '', preDamage: false,
  }));
  const { value: v, update } = draft;
  const [annotating, setAnnotating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!v.image) {
      setError('Bitte zuerst ein Foto aufnehmen oder auswählen.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.uploadPhoto({
        id: v.id, projectId: v.projectId, takenAt: v.takenAt || nowIso(), description: v.description, preDamage: v.preDamage,
        base64: await blobToBase64(v.image),
      });
      invalidate(`photos:${v.projectId}`);
      draft.clear();
      navigate(`/projects/${v.projectId}?tab=photos`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!draft.ready) return <Spinner />;

  return (
    <>
      <PageHeader title="Foto" back />
      {draft.restored && <p className="hint">Nicht gesendeter Entwurf wiederhergestellt.</p>}
      <form className="form" onSubmit={(e) => void submit(e)}>
        <ProjectSelect value={v.projectId} onChange={(projectId) => update({ projectId })} />
        {v.image ? (
          <div className="photo-preview">
            <BlobImage blob={v.image} alt="Foto" onClick={() => setAnnotating(true)} />
            <div className="button-row">
              <button type="button" className="btn" onClick={() => setAnnotating(true)}>✎ Einzeichnen</button>
              <button type="button" className="btn btn-secondary" onClick={() => update({ image: null })}>Anderes Foto</button>
            </div>
          </div>
        ) : (
          <ImagePicker onPicked={(image, original) => {
            // Gallery files carry their modification time; camera shots are "now".
            const taken = original.lastModified ? new Date(original.lastModified) : new Date();
            update({ image, takenAt: nowIso(taken) });
            setAnnotating(true);
          }} />
        )}
        <label className="field">
          <span>Beschreibung</span>
          <textarea rows={2} maxLength={1000} value={v.description} onChange={(e) => update({ description: e.target.value })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={v.preDamage} onChange={(e) => update({ preDamage: e.target.checked })} />
          Vorschaden (bereits vorhandener Schaden)
        </label>
        <ErrorBox message={error} />
        <SubmitButton busy={busy} disabled={!v.image}>Hochladen</SubmitButton>
        <button type="button" className="btn btn-secondary btn-block" onClick={() => draft.clear()}>Verwerfen</button>
      </form>
      {annotating && v.image && (
        <PhotoAnnotator image={v.image} onCancel={() => setAnnotating(false)} onSave={(image) => { update({ image }); setAnnotating(false); }} />
      )}
    </>
  );
}
