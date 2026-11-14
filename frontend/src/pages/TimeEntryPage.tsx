import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/api';
import { errorMessage } from '../api/ApiError';
import { useMe } from '../auth/AuthContext';
import { EmployeeSelect } from '../components/EmployeeSelect';
import { ErrorBox } from '../components/ErrorBox';
import { PageHeader } from '../components/PageHeader';
import { ProjectSelect } from '../components/ProjectSelect';
import { Spinner } from '../components/Spinner';
import { SubmitButton } from '../components/SubmitButton';
import { invalidate } from '../hooks/useApi';
import { useDraft } from '../hooks/useDraft';
import { getLastProjectId } from '../hooks/useProjects';
import { withConfirmation } from '../lib/confirm';
import { formatHours, todayIso } from '../lib/format';
import { quarterHours } from '../lib/hours';
import { uuid } from '../lib/uuid';

interface TimeDraft {
  id: string;
  projectId: string;
  employeeId: string;
  date: string;
  from: string;
  to: string;
  description: string;
}

/** Record or edit a time entry ("Stunden erfassen"). New entries are kept as local draft until sent. */
export function TimeEntryPage() {
  const me = useMe();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get('edit');
  const initialProject = params.get('project') || getLastProjectId();
  const draft = useDraft<TimeDraft>(editId ? null : 'draft:time', () => ({
    id: uuid(), projectId: initialProject, employeeId: me.employee?.id ?? '', date: todayIso(), from: '', to: '', description: '',
  }));
  const { value: v, update } = draft;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(!!editId);

  // A project given in the URL wins over the project stored in the draft.
  useEffect(() => {
    if (draft.ready && !editId && params.get('project') && v.projectId !== params.get('project')) {
      update({ projectId: params.get('project') ?? '' });
    }
    // only after the draft was restored
  }, [draft.ready]);

  useEffect(() => {
    if (!editId) return;
    const projectId = params.get('project') ?? '';
    api.listTimeEntries(projectId)
      .then((list) => {
        const t = list.find((x) => x.id === editId);
        if (!t) throw new Error('Eintrag nicht gefunden.');
        update({ id: t.id, projectId, employeeId: t.employeeId, date: t.date, from: t.from, to: t.to, description: t.description });
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoadingEdit(false));
  }, [editId]);

  const hours = quarterHours(v.from, v.to);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (hours === null) {
      setError('"Bis" muss nach "Von" liegen.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await withConfirmation((confirmOverlap) => api.saveTimeEntry({
        id: v.id, projectId: v.projectId, employeeId: me.role === 'chef' ? v.employeeId : undefined,
        date: v.date, from: v.from, to: v.to, description: v.description, confirmOverlap,
      }));
      if (!saved) return;
      invalidate(`time:${v.projectId}`);
      if (!editId) draft.clear();
      navigate(`/projects/${v.projectId}?tab=time`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (loadingEdit || !draft.ready) return <Spinner />;

  return (
    <>
      <PageHeader title={editId ? 'Stunden bearbeiten' : 'Stunden erfassen'} back />
      {draft.restored && <p className="hint">Nicht gesendeter Entwurf wiederhergestellt.</p>}
      <form className="form" onSubmit={(e) => void submit(e)}>
        <ProjectSelect value={v.projectId} onChange={(projectId) => update({ projectId })} disabled={!!editId} />
        <EmployeeSelect label="Mitarbeiter" value={v.employeeId} onChange={(employeeId) => update({ employeeId })} />
        <label className="field">
          <span>Datum</span>
          <input type="date" required max={todayIso()} value={v.date} onChange={(e) => update({ date: e.target.value })} />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Von</span>
            <input type="time" required step={300} value={v.from} onChange={(e) => update({ from: e.target.value })} />
          </label>
          <label className="field">
            <span>Bis</span>
            <input type="time" required step={300} value={v.to} onChange={(e) => update({ to: e.target.value })} />
          </label>
        </div>
        <p className="hint">{hours !== null ? `= ${formatHours(hours)} Stunden (auf ¼ h gerundet, ohne Pause)` : 'Von–Bis wird voll gezählt.'}</p>
        <label className="field">
          <span>Kurzbeschreibung</span>
          <textarea required rows={3} maxLength={500} placeholder="z. B. Kabel für Küche eingezogen" value={v.description}
            onChange={(e) => update({ description: e.target.value })} />
        </label>
        <ErrorBox message={error} />
        <SubmitButton busy={busy}>Speichern</SubmitButton>
        {!editId && (
          <button type="button" className="btn btn-secondary btn-block" onClick={() => draft.clear()}>Verwerfen</button>
        )}
      </form>
    </>
  );
}
