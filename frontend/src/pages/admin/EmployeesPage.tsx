import { useState, type FormEvent } from 'react';
import { api } from '../../api/api';
import { errorMessage } from '../../api/ApiError';
import type { Employee } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Empty } from '../../components/Empty';
import { ErrorBox } from '../../components/ErrorBox';
import { PageHeader } from '../../components/PageHeader';
import { Spinner } from '../../components/Spinner';
import { SubmitButton } from '../../components/SubmitButton';
import { useApi } from '../../hooks/useApi';
import { formatMoney, parseDecimal, toInputDecimal } from '../../lib/format';
import { uuid } from '../../lib/uuid';

interface EmployeeForm {
  id: string;
  name: string;
  shortName: string;
  email: string;
  hourlyRate: string;
  active: boolean;
}

const newForm = (): EmployeeForm => ({ id: uuid(), name: '', shortName: '', email: '', hourlyRate: '', active: true });

/** Chef: create, edit and deactivate employees (no deletion because of references). */
export function EmployeesPage() {
  const { refreshMe } = useAuth();
  const { data, error, loading, reload } = useApi('employees', api.listEmployees);
  const [form, setForm] = useState<EmployeeForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const edit = (e: Employee) => {
    setFormError(null);
    setForm({ id: e.id, name: e.name, shortName: e.shortName, email: e.email, hourlyRate: toInputDecimal(e.hourlyRate), active: e.active });
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!form) return;
    const rate = parseDecimal(form.hourlyRate);
    if (!(rate >= 0)) {
      setFormError('Ungültiger Stundensatz.');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await api.saveEmployee({ ...form, hourlyRate: rate });
      setForm(null);
      await Promise.all([reload(), refreshMe()]);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const set = (patch: Partial<EmployeeForm>) => setForm((f) => (f ? { ...f, ...patch } : f));

  return (
    <>
      <PageHeader title="Mitarbeiter" back="/">
        <button type="button" className="btn btn-small btn-primary" onClick={() => { setFormError(null); setForm(newForm()); }}>+ Neu</button>
      </PageHeader>
      <p className="hint">Anmelden kann sich nur, wer hier aktiv mit seiner Google-E-Mail eingetragen ist. Der Chef braucht einen eigenen Eintrag, um eigene Stunden zu erfassen.</p>
      {form && (
        <form className="form card" onSubmit={(e) => void submit(e)}>
          <label className="field">
            <span>Name</span>
            <input required maxLength={100} value={form.name} onChange={(e) => set({ name: e.target.value })} />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Kürzel</span>
              <input maxLength={10} value={form.shortName} onChange={(e) => set({ shortName: e.target.value })} />
            </label>
            <label className="field">
              <span>Stundensatz €/h netto</span>
              <input required inputMode="decimal" value={form.hourlyRate} onChange={(e) => set({ hourlyRate: e.target.value })} />
            </label>
          </div>
          <label className="field">
            <span>E-Mail (Google-Konto)</span>
            <input required type="email" maxLength={200} value={form.email} onChange={(e) => set({ email: e.target.value })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} />
            aktiv (darf sich anmelden)
          </label>
          <ErrorBox message={formError} />
          <SubmitButton busy={busy}>Speichern</SubmitButton>
          <button type="button" className="btn btn-secondary btn-block" onClick={() => setForm(null)}>Abbrechen</button>
        </form>
      )}
      <ErrorBox message={error} onRetry={() => void reload()} />
      {!data && loading && <Spinner />}
      {data && !data.length && <Empty>Noch keine Mitarbeiter angelegt.</Empty>}
      <ul className="item-list">
        {(data ?? []).map((e) => (
          <li key={e.id} className={`item ${e.active ? '' : 'item-done'}`}>
            <div className="item-main">
              <strong>{e.name} {e.shortName && <span className="muted">({e.shortName})</span>}</strong>
              <span className="item-amount">{formatMoney(e.hourlyRate)}/h</span>
            </div>
            <div className="item-meta">
              <span>{e.email}</span>
              {!e.active && <span className="badge badge-closed">inaktiv</span>}
              <span className="item-actions">
                <button type="button" className="link-button" onClick={() => edit(e)}>Bearbeiten</button>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
