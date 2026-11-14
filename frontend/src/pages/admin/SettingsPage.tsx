import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api/api';
import { errorMessage } from '../../api/ApiError';
import { useAuth } from '../../auth/AuthContext';
import { ErrorBox } from '../../components/ErrorBox';
import { PageHeader } from '../../components/PageHeader';
import { Spinner } from '../../components/Spinner';
import { SubmitButton } from '../../components/SubmitButton';
import { useApi } from '../../hooks/useApi';
import { parseDecimal, toInputDecimal } from '../../lib/format';

/** Chef: chef e-mail, default material markup, reverse charge text. */
export function SettingsPage() {
  const { me, signOut } = useAuth();
  const { data, error, reload } = useApi('settings', api.getSettings);
  const [chefEmail, setChefEmail] = useState('');
  const [markup, setMarkup] = useState('');
  const [reverseChargeText, setReverseChargeText] = useState('');
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data) return;
    setChefEmail(data.chefEmail);
    setMarkup(toInputDecimal(data.materialMarkupPercent));
    setReverseChargeText(data.reverseChargeText);
  }, [data]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const materialMarkupPercent = parseDecimal(markup);
    if (!(materialMarkupPercent >= 0)) {
      setSaveError('Ungültiger Aufschlag.');
      return;
    }
    const handsOver = chefEmail.trim().toLowerCase() !== me?.email;
    if (handsOver && !window.confirm(`Chef-Rechte an ${chefEmail} übergeben? Du verlierst damit die Chef-Funktionen.`)) return;
    setBusy(true);
    setSaveError(null);
    setSaved(false);
    try {
      await api.saveSettings({ chefEmail, materialMarkupPercent, reverseChargeText });
      if (handsOver) {
        signOut();
        return;
      }
      setSaved(true);
      await reload();
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Einstellungen" back="/" />
      <ErrorBox message={error} onRetry={() => void reload()} />
      {!data && !error && <Spinner />}
      {data && (
        <form className="form" onSubmit={(e) => void submit(e)}>
          <label className="field">
            <span>Chef-E-Mail (Google-Konto mit Chef-Rechten)</span>
            <input type="email" required value={chefEmail} onChange={(e) => setChefEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>Standard-Materialaufschlag %</span>
            <input inputMode="decimal" required value={markup} onChange={(e) => setMarkup(e.target.value)} />
          </label>
          <label className="field">
            <span>Hinweistext Reverse Charge (auf der Rechnung)</span>
            <textarea rows={3} maxLength={500} value={reverseChargeText} onChange={(e) => setReverseChargeText(e.target.value)} />
          </label>
          <ErrorBox message={saveError} />
          {saved && <p className="success">Gespeichert.</p>}
          <SubmitButton busy={busy}>Speichern</SubmitButton>
          <p className="hint">Firmendaten, Bankverbindung und Zahlungsziel stehen direkt im Google Doc „Rechnungsvorlage“ im Ordner „Baustellen-App“.</p>
        </form>
      )}
    </>
  );
}
