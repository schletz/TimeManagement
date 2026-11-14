import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/api';
import { errorMessage } from '../api/ApiError';
import type { Urgency } from '../api/types';
import { BlobImage } from '../components/BlobImage';
import { ErrorBox } from '../components/ErrorBox';
import { ImagePicker } from '../components/ImagePicker';
import { PageHeader } from '../components/PageHeader';
import { ProjectSelect } from '../components/ProjectSelect';
import { Spinner } from '../components/Spinner';
import { SubmitButton } from '../components/SubmitButton';
import { invalidate } from '../hooks/useApi';
import { useDraft } from '../hooks/useDraft';
import { getLastProjectId } from '../hooks/useProjects';
import { parseDecimal } from '../lib/format';
import { blobToBase64 } from '../lib/image';
import { uuid } from '../lib/uuid';

const UNITS = ['Stk', 'm', 'Pkg', 'Rolle', 'Karton', 'kg', 'l', 'Satz'];

interface DemandDraft {
  id: string;
  projectId: string;
  material: string;
  quantity: string;
  unit: string;
  urgency: Urgency;
  note: string;
  photo: Blob | null;
}

/** Report missing material ("Material fehlt"); the chef is notified by e-mail. */
export function DemandPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const draft = useDraft<DemandDraft>('draft:demand', () => ({
    id: uuid(), projectId: params.get('project') || getLastProjectId(), material: '', quantity: '1', unit: 'Stk',
    urgency: 'normal', note: '', photo: null,
  }));
  const { value: v, update } = draft;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const quantity = parseDecimal(v.quantity);
    if (!(quantity > 0)) {
      setError('Bitte eine Menge größer als 0 eingeben.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.saveDemand({
        id: v.id, projectId: v.projectId, material: v.material, quantity, unit: v.unit, urgency: v.urgency, note: v.note,
        photoBase64: v.photo ? await blobToBase64(v.photo) : undefined,
      });
      invalidate(`demands:${v.projectId}`);
      draft.clear();
      navigate(`/projects/${v.projectId}?tab=demands`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!draft.ready) return <Spinner />;

  return (
    <>
      <PageHeader title="Material fehlt" back />
      {draft.restored && <p className="hint">Nicht gesendeter Entwurf wiederhergestellt.</p>}
      <form className="form" onSubmit={(e) => void submit(e)}>
        <ProjectSelect value={v.projectId} onChange={(projectId) => update({ projectId })} />
        <label className="field">
          <span>Material</span>
          <input required maxLength={300} placeholder="z. B. FI-Schalter 40A" value={v.material} onChange={(e) => update({ material: e.target.value })} />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Menge</span>
            <input required inputMode="decimal" value={v.quantity} onChange={(e) => update({ quantity: e.target.value })} />
          </label>
          <label className="field">
            <span>Einheit</span>
            <input list="units" maxLength={20} value={v.unit} onChange={(e) => update({ unit: e.target.value })} />
            <datalist id="units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
          </label>
        </div>
        <div className="field">
          <span>Dringlichkeit</span>
          <div className="segmented">
            <button type="button" className={v.urgency === 'normal' ? 'active' : ''} onClick={() => update({ urgency: 'normal' })}>normal</button>
            <button type="button" className={v.urgency === 'urgent' ? 'active urgent' : ''} onClick={() => update({ urgency: 'urgent' })}>dringend</button>
          </div>
        </div>
        <label className="field">
          <span>Notiz</span>
          <textarea rows={2} maxLength={1000} value={v.note} onChange={(e) => update({ note: e.target.value })} />
        </label>
        <div className="field">
          <span>Foto (optional)</span>
          {v.photo ? (
            <div className="receipt-preview">
              <BlobImage blob={v.photo} alt="Foto" className="thumb" />
              <button type="button" className="link-button danger" onClick={() => update({ photo: null })}>Foto entfernen</button>
            </div>
          ) : (
            <ImagePicker onPicked={(photo) => update({ photo })} />
          )}
        </div>
        <ErrorBox message={error} />
        <SubmitButton busy={busy}>Melden</SubmitButton>
        <button type="button" className="btn btn-secondary btn-block" onClick={() => draft.clear()}>Verwerfen</button>
      </form>
    </>
  );
}
