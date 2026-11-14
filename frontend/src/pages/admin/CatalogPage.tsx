import { useState, type FormEvent } from 'react';
import { api } from '../../api/api';
import { errorMessage } from '../../api/ApiError';
import type { CatalogItem } from '../../api/types';
import { Empty } from '../../components/Empty';
import { ErrorBox } from '../../components/ErrorBox';
import { PageHeader } from '../../components/PageHeader';
import { Spinner } from '../../components/Spinner';
import { SubmitButton } from '../../components/SubmitButton';
import { useApi } from '../../hooks/useApi';
import { formatMoney, parseDecimal, toInputDecimal } from '../../lib/format';

interface CatalogForm {
  originalCode: string;
  code: string;
  description: string;
  unit: string;
  price: string;
}

/** Chef: service catalog for additional invoice positions. */
export function CatalogPage() {
  const { data, error, loading, reload } = useApi('catalog', api.listCatalog);
  const [form, setForm] = useState<CatalogForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const set = (patch: Partial<CatalogForm>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const edit = (c: CatalogItem) => {
    setFormError(null);
    setForm({ originalCode: c.code, code: c.code, description: c.description, unit: c.unit, price: toInputDecimal(c.price) });
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!form) return;
    const price = parseDecimal(form.price);
    if (!(price >= 0)) {
      setFormError('Ungültiger Preis.');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await api.saveCatalogItem({ ...form, price });
      setForm(null);
      await reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: CatalogItem) => {
    if (!window.confirm(`Position ${c.code} löschen? Bestehende Rechnungen bleiben unverändert.`)) return;
    try {
      await api.deleteCatalogItem(c.code);
      await reload();
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader title="Leistungskatalog" back="/">
        <button type="button" className="btn btn-small btn-primary"
          onClick={() => { setFormError(null); setForm({ originalCode: '', code: '', description: '', unit: 'Psch.', price: '' }); }}>+ Neu</button>
      </PageHeader>
      {form && (
        <form className="form card" onSubmit={(e) => void submit(e)}>
          <div className="field-row">
            <label className="field">
              <span>Code</span>
              <input required maxLength={40} value={form.code} onChange={(e) => set({ code: e.target.value })} />
            </label>
            <label className="field">
              <span>Einheit</span>
              <input maxLength={20} value={form.unit} onChange={(e) => set({ unit: e.target.value })} />
            </label>
          </div>
          <label className="field">
            <span>Beschreibung</span>
            <input required maxLength={300} value={form.description} onChange={(e) => set({ description: e.target.value })} />
          </label>
          <label className="field">
            <span>Netto-Preis (€)</span>
            <input required inputMode="decimal" value={form.price} onChange={(e) => set({ price: e.target.value })} />
          </label>
          <ErrorBox message={formError} />
          <SubmitButton busy={busy}>Speichern</SubmitButton>
          <button type="button" className="btn btn-secondary btn-block" onClick={() => setForm(null)}>Abbrechen</button>
        </form>
      )}
      {!form && <ErrorBox message={formError} />}
      <ErrorBox message={error} onRetry={() => void reload()} />
      {!data && loading && <Spinner />}
      {data && !data.length && <Empty>Der Katalog ist leer.</Empty>}
      <ul className="item-list">
        {(data ?? []).map((c) => (
          <li key={c.code} className="item">
            <div className="item-main">
              <strong>{c.description}</strong>
              <span className="item-amount">{formatMoney(c.price)}</span>
            </div>
            <div className="item-meta">
              <span className="muted">{c.code} · {c.unit}</span>
              <span className="item-actions">
                <button type="button" className="link-button" onClick={() => edit(c)}>Bearbeiten</button>
                <button type="button" className="link-button danger" onClick={() => void remove(c)}>Löschen</button>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
