import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/api';
import { errorMessage } from '../../api/ApiError';
import type { Project, ProjectInput } from '../../api/types';
import { ErrorBox } from '../../components/ErrorBox';
import { PageHeader } from '../../components/PageHeader';
import { Spinner } from '../../components/Spinner';
import { StatusBadge } from '../../components/StatusBadge';
import { SubmitButton } from '../../components/SubmitButton';
import { invalidate } from '../../hooks/useApi';
import { useProjects } from '../../hooks/useProjects';
import { withConfirmation } from '../../lib/confirm';
import { formatDateTime, toInputDecimal } from '../../lib/format';
import { uuid } from '../../lib/uuid';

const EMPTY: ProjectInput = { id: '', name: '', client: '', address: '', siteManager: '', markupPercent: '' };

/** Chef: create/edit a project, close and reopen it. */
export function ProjectEditPage() {
  const { projectId = 'new' } = useParams();
  const isNew = projectId === 'new';
  const navigate = useNavigate();
  const projects = useProjects();
  const [form, setForm] = useState<ProjectInput>(() => ({ ...EMPTY, id: uuid() }));
  const [project, setProject] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    api.getProject(projectId)
      .then((p) => {
        setProject(p);
        setForm({
          id: p.id, name: p.name, client: p.client, address: p.address, siteManager: p.siteManager,
          markupPercent: p.markupPercent === null || p.markupPercent === undefined ? '' : toInputDecimal(p.markupPercent),
        });
      })
      .catch((e) => setError(errorMessage(e)));
  }, [projectId, isNew]);

  const set = (patch: Partial<ProjectInput>) => setForm((f) => ({ ...f, ...patch }));

  const afterChange = async (p: Project) => {
    setProject(p);
    invalidate(`project:${p.id}`);
    await projects.reload();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = await api.saveProject({ ...form, markupPercent: form.markupPercent.replace(',', '.') });
      await afterChange(saved);
      navigate(`/projects/${saved.id}`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (close: boolean) => {
    if (!project) return;
    setBusy(true);
    setError(null);
    try {
      const updated = close
        ? await withConfirmation((confirm) => api.closeProject(project.id, confirm))
        : await api.reopenProject(project.id);
      if (updated) await afterChange(updated);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!isNew && !project && !error) return <Spinner />;

  return (
    <>
      <PageHeader title={isNew ? 'Neues Projekt' : 'Projekt bearbeiten'} back />
      <form className="form" onSubmit={(e) => void submit(e)}>
        <label className="field">
          <span>Projekt / Bauvorhaben</span>
          <input required maxLength={100} value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className="field">
          <span>Auftraggeber / Kunde</span>
          <input maxLength={200} value={form.client} onChange={(e) => set({ client: e.target.value })} />
        </label>
        <label className="field">
          <span>Baustellenadresse</span>
          <input maxLength={300} value={form.address} onChange={(e) => set({ address: e.target.value })} />
        </label>
        <label className="field">
          <span>Bauleiter</span>
          <input maxLength={100} value={form.siteManager} onChange={(e) => set({ siteManager: e.target.value })} />
        </label>
        <label className="field">
          <span>Materialaufschlag % (leer = Standard)</span>
          <input inputMode="decimal" value={form.markupPercent} onChange={(e) => set({ markupPercent: e.target.value })}
            placeholder={project?.effectiveMarkupPercent !== undefined && form.markupPercent === '' ? `Standard: ${toInputDecimal(project.effectiveMarkupPercent)}` : 'Standard'} />
        </label>
        <ErrorBox message={error} />
        <SubmitButton busy={busy}>{isNew ? 'Projekt anlegen' : 'Speichern'}</SubmitButton>
      </form>
      {project && (
        <div className="card">
          <h2>Status</h2>
          <p>
            {project.status === 'active' ? 'Aktiv' : <StatusBadge status="closed" />}
            {project.closedAt && <span className="muted"> seit {formatDateTime(project.closedAt)}</span>}
          </p>
          {project.status === 'active' ? (
            <button type="button" className="btn btn-danger btn-block" disabled={busy} onClick={() => void changeStatus(true)}>Projekt abschließen</button>
          ) : (
            <button type="button" className="btn btn-block" disabled={busy} onClick={() => void changeStatus(false)}>Wieder öffnen</button>
          )}
          <p className="hint">Abgeschlossene Projekte sind für Mitarbeiter ausgeblendet und gesperrt. Der Chef kann weiter abrechnen.</p>
        </div>
      )}
    </>
  );
}
