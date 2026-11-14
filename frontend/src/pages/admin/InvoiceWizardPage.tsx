import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/api';
import { errorMessage } from '../../api/ApiError';
import type { ExtraItem, InvoiceKind, InvoicePreview } from '../../api/types';
import { ErrorBox } from '../../components/ErrorBox';
import { PageHeader } from '../../components/PageHeader';
import { Spinner } from '../../components/Spinner';
import { invalidate, useApi } from '../../hooks/useApi';
import { useOnline } from '../../hooks/useOnline';
import { downloadFile } from '../../lib/download';
import { INVOICE_KIND_LABEL, todayIso } from '../../lib/format';
import { uuid } from '../../lib/uuid';
import { ExtraItemsEditor } from './invoice/ExtraItemsEditor';
import { InvoiceSummary } from './invoice/InvoiceSummary';
import { ItemSelection } from './invoice/ItemSelection';

/**
 * Invoice wizard (chef): cutoff date → select open items → extra positions → invoice data →
 * preview calculated by the backend → create (items become "invoiced", DOCX is downloaded).
 */
export function InvoiceWizardPage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const online = useOnline();
  const project = useApi(`project:${projectId}`, () => api.getProject(projectId), { persist: true });
  const [invoiceId] = useState(uuid);
  const [cutoffDate, setCutoffDate] = useState(todayIso());
  const [candidates, setCandidates] = useState<InvoicePreview | null>(null);
  const [selectedTimes, setSelectedTimes] = useState<Set<string>>(new Set());
  const [selectedPurchases, setSelectedPurchases] = useState<Set<string>>(new Set());
  const [extras, setExtras] = useState<ExtraItem[]>([]);
  const [number, setNumber] = useState('');
  const [date, setDate] = useState(todayIso());
  const [kind, setKind] = useState<InvoiceKind>('partial');
  const [preview, setPreview] = useState<{ key: string; data: InvoicePreview } | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Loads the candidates for the cutoff date; all of them are preselected.
  const loadCandidates = useCallback(async (cutoff: string) => {
    setLoading(true);
    setError(null);
    try {
      const p = await api.previewInvoice({ projectId, cutoffDate: cutoff });
      setCandidates(p);
      setSelectedTimes(new Set(p.timeEntries.map((t) => t.id)));
      setSelectedPurchases(new Set(p.purchases.map((x) => x.id)));
      setNumber((n) => n || p.suggestedNumber);
      setKind(p.defaultKind);
      setPreview(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadCandidates(cutoffDate);
  }, [cutoffDate, loadCandidates]);

  const selection = useMemo(() => ({
    projectId, cutoffDate, timeEntryIds: [...selectedTimes], purchaseIds: [...selectedPurchases], extraItems: extras,
  }), [projectId, cutoffDate, selectedTimes, selectedPurchases, extras]);
  // The preview is only valid for exactly the selection it was computed for.
  const selectionKey = JSON.stringify(selection);
  const previewValid = preview?.key === selectionKey;
  const empty = !selectedTimes.size && !selectedPurchases.size && !extras.length;

  const calculate = async () => {
    setLoading(true);
    setError(null);
    try {
      setPreview({ key: selectionKey, data: await api.previewInvoice(selection) });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const create = async () => {
    if (!window.confirm(`${INVOICE_KIND_LABEL[kind]} ${number} jetzt erstellen? Die gewählten Posten werden als verrechnet markiert.`)) return;
    setCreating(true);
    setError(null);
    try {
      const result = await api.createInvoice({ ...selection, id: invoiceId, number: number.trim(), date, kind });
      if (result.file) downloadFile(result.file);
      invalidate(`invoices:${projectId}`);
      invalidate(`time:${projectId}`);
      invalidate(`purchases:${projectId}`);
      navigate(`/projects/${projectId}?tab=billing`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setCreating(false);
    }
  };

  return (
    <>
      <PageHeader title="Rechnung erstellen" back={`/projects/${projectId}?tab=billing`} />
      {project.data && <p className="muted">{project.data.name} · {project.data.client}</p>}

      <section className="card">
        <h2>1. Posten bis Stichtag</h2>
        <label className="field">
          <span>Stichtag</span>
          <input type="date" value={cutoffDate} max={todayIso()} onChange={(e) => e.target.value && setCutoffDate(e.target.value)} />
        </label>
        {!candidates && loading && <Spinner />}
        {candidates && (
          <ItemSelection
            timeEntries={candidates.timeEntries}
            purchases={candidates.purchases}
            selectedTimes={selectedTimes}
            selectedPurchases={selectedPurchases}
            onChange={(t, p) => { setSelectedTimes(t); setSelectedPurchases(p); }}
          />
        )}
      </section>

      {candidates && (
        <>
          <section className="card">
            <h2>2. Zusatzpositionen</h2>
            <ExtraItemsEditor catalog={candidates.catalog} items={extras} onChange={setExtras} />
          </section>

          <section className="card">
            <h2>3. Rechnungsdaten</h2>
            <div className="field-row">
              <label className="field">
                <span>Rechnungsnummer</span>
                <input required value={number} onChange={(e) => setNumber(e.target.value)} />
              </label>
              <label className="field">
                <span>Rechnungsdatum</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
            </div>
            <label className="field">
              <span>Art</span>
              <select value={kind} onChange={(e) => setKind(e.target.value as InvoiceKind)}>
                {(Object.keys(INVOICE_KIND_LABEL) as InvoiceKind[]).map((k) => <option key={k} value={k}>{INVOICE_KIND_LABEL[k]}</option>)}
              </select>
            </label>
          </section>

          <section className="card">
            <h2>4. Vorschau</h2>
            {previewValid && preview ? <InvoiceSummary calc={preview.data.calc} /> : (
              <button type="button" className="btn btn-block" disabled={loading || empty || !online} onClick={() => void calculate()}>
                {loading ? 'Wird berechnet …' : 'Summen berechnen'}
              </button>
            )}
            {empty && <p className="hint">Mindestens einen Posten wählen oder eine Zusatzposition hinzufügen.</p>}
          </section>

          <ErrorBox message={error} />
          <button type="button" className="btn btn-primary btn-block" disabled={!previewValid || creating || !number.trim() || !online}
            onClick={() => void create()}>
            {creating ? 'Rechnung wird erstellt …' : 'Rechnung erstellen und herunterladen'}
          </button>
          {!previewValid && !empty && <p className="hint">Vor dem Erstellen die Summen berechnen.</p>}
        </>
      )}
      {!candidates && <ErrorBox message={error} onRetry={() => void loadCandidates(cutoffDate)} />}
    </>
  );
}
