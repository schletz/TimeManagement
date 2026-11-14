import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/api';
import { errorMessage } from '../api/ApiError';
import type { PurchaseSource } from '../api/types';
import { useMe } from '../auth/AuthContext';
import { BlobImage } from '../components/BlobImage';
import { EmployeeSelect } from '../components/EmployeeSelect';
import { ErrorBox } from '../components/ErrorBox';
import { ImagePicker } from '../components/ImagePicker';
import { ImageViewer } from '../components/ImageViewer';
import { PageHeader } from '../components/PageHeader';
import { ProjectSelect } from '../components/ProjectSelect';
import { QrScanner } from '../components/QrScanner';
import { Spinner } from '../components/Spinner';
import { SubmitButton } from '../components/SubmitButton';
import { invalidate } from '../hooks/useApi';
import { useDraft } from '../hooks/useDraft';
import { getLastProjectId } from '../hooks/useProjects';
import { formatMoney, parseDecimal, toInputDecimal, todayIso } from '../lib/format';
import { blobToBase64 } from '../lib/image';
import { decodeQrFromFile } from '../lib/qr';
import { parseRksv } from '../lib/rksv';
import { uuid } from '../lib/uuid';

interface PurchaseDraft {
  id: string;
  projectId: string;
  buyerId: string;
  date: string;
  article: string;
  amount: string;
  source: PurchaseSource;
  cashRegisterId: string;
  receiptNumber: string;
  /** New receipt photo not yet uploaded (kept in IndexedDB with the draft). */
  receiptBlob: Blob | null;
  /** Client id of the receipt upload (idempotent retries). */
  receiptUploadId: string;
  /** Drive file id of the receipt (existing or after upload). */
  receiptFileId: string;
}

/** Record or edit a material purchase; amount via RKSV QR code (live scan or photo of the receipt) or manual. */
export function PurchasePage() {
  const me = useMe();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get('edit');
  const draft = useDraft<PurchaseDraft>(editId ? null : 'draft:purchase', () => ({
    id: uuid(), projectId: params.get('project') || getLastProjectId(), buyerId: me.employee?.id ?? '', date: todayIso(),
    article: '', amount: '', source: 'manual', cashRegisterId: '', receiptNumber: '', receiptBlob: null,
    receiptUploadId: uuid(), receiptFileId: '',
  }));
  const { value: v, update } = draft;
  const [scanning, setScanning] = useState(false);
  const [qrInfo, setQrInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(!!editId);
  const [showReceipt, setShowReceipt] = useState(false);

  useEffect(() => {
    if (!editId) return;
    const projectId = params.get('project') ?? '';
    api.listPurchases(projectId)
      .then((list) => {
        const p = list.find((x) => x.id === editId);
        if (!p) throw new Error('Kauf nicht gefunden.');
        update({
          id: p.id, projectId, buyerId: p.buyerId, date: p.date, article: p.article, amount: toInputDecimal(p.amount),
          source: p.source, cashRegisterId: p.cashRegisterId, receiptNumber: p.receiptNumber, receiptFileId: p.receiptFileId,
        });
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoadingEdit(false));
  }, [editId]);

  const applyQr = (text: string | null) => {
    const receipt = text ? parseRksv(text) : null;
    if (!receipt) {
      setQrInfo(text ? 'Der QR-Code ist kein österreichischer Kassenbon (RKSV). Bitte Betrag manuell eingeben.' : 'Kein QR-Code erkannt. Bitte Betrag manuell eingeben.');
      return;
    }
    update({
      source: 'qr',
      amount: toInputDecimal(receipt.amount),
      date: receipt.date <= todayIso() ? receipt.date : todayIso(),
      cashRegisterId: receipt.cashRegisterId,
      receiptNumber: receipt.receiptNumber,
    });
    setQrInfo(`QR-Code gelesen: ${formatMoney(receipt.amount)} vom ${receipt.date.split('-').reverse().join('.')}.`);
  };

  const onReceiptPhoto = async (compressed: Blob, original: File) => {
    update({ receiptBlob: compressed, receiptFileId: '', receiptUploadId: uuid() });
    setQrInfo('QR-Code wird gesucht …');
    try {
      applyQr(await decodeQrFromFile(original));
    } catch {
      applyQr(null);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const amount = parseDecimal(v.amount);
    if (!(amount > 0)) {
      setError('Bitte einen Betrag größer als 0 eingeben.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let receiptFileId = v.receiptFileId;
      if (v.receiptBlob && !receiptFileId) {
        receiptFileId = (await api.uploadReceipt(v.projectId, v.receiptUploadId, await blobToBase64(v.receiptBlob))).fileId;
        update({ receiptFileId });
      }
      await api.savePurchase({
        id: v.id, projectId: v.projectId, buyerId: me.role === 'chef' ? v.buyerId : undefined, date: v.date,
        article: v.article, amount, source: v.source, cashRegisterId: v.cashRegisterId, receiptNumber: v.receiptNumber, receiptFileId,
      });
      invalidate(`purchases:${v.projectId}`);
      invalidate('reimbursements');
      if (!editId) draft.clear();
      navigate(`/projects/${v.projectId}?tab=purchases`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (loadingEdit || !draft.ready) return <Spinner />;

  return (
    <>
      <PageHeader title={editId ? 'Kauf bearbeiten' : 'Material gekauft'} back />
      {draft.restored && <p className="hint">Nicht gesendeter Entwurf wiederhergestellt.</p>}
      <form className="form" onSubmit={(e) => void submit(e)}>
        <ProjectSelect value={v.projectId} onChange={(projectId) => update({ projectId })} disabled={!!editId} />
        <EmployeeSelect label="Gekauft von" value={v.buyerId} onChange={(buyerId) => update({ buyerId })} />

        <fieldset className="card">
          <legend>Kassenbon</legend>
          <button type="button" className="btn btn-block" onClick={() => setScanning(true)}>QR-Code scannen</button>
          <p className="hint">oder Foto vom Bon (wird als Beleg gespeichert und nach dem QR-Code durchsucht):</p>
          <ImagePicker onPicked={(c, o) => void onReceiptPhoto(c, o)} cameraLabel="Bon fotografieren" galleryLabel="Aus Galerie" />
          {qrInfo && <p className="hint">{qrInfo}</p>}
          {v.receiptBlob && (
            <div className="receipt-preview">
              <BlobImage blob={v.receiptBlob} alt="Beleg" className="thumb" />
              <button type="button" className="link-button danger" onClick={() => update({ receiptBlob: null, receiptFileId: '' })}>Beleg entfernen</button>
            </div>
          )}
          {!v.receiptBlob && v.receiptFileId && (
            <div className="receipt-preview">
              <button type="button" className="link-button" onClick={() => setShowReceipt(true)}>Gespeicherten Beleg ansehen</button>
              <button type="button" className="link-button danger" onClick={() => update({ receiptFileId: '' })}>Beleg entfernen</button>
            </div>
          )}
        </fieldset>

        <label className="field">
          <span>Datum</span>
          <input type="date" required max={todayIso()} value={v.date} onChange={(e) => update({ date: e.target.value })} />
        </label>
        <label className="field">
          <span>Artikel / Beschreibung</span>
          <input required maxLength={300} placeholder="z. B. Kabel NYM-J 3x1,5" value={v.article} onChange={(e) => update({ article: e.target.value })} />
        </label>
        <label className="field">
          <span>Betrag brutto (€)</span>
          <input required inputMode="decimal" placeholder="0,00" value={v.amount}
            onChange={(e) => update({ amount: e.target.value, source: v.source === 'qr' ? 'qr' : 'manual' })} />
        </label>
        {(v.cashRegisterId || v.receiptNumber) && (
          <div className="field-row">
            <label className="field">
              <span>Kassen-ID</span>
              <input value={v.cashRegisterId} onChange={(e) => update({ cashRegisterId: e.target.value })} />
            </label>
            <label className="field">
              <span>Beleg-Nr.</span>
              <input value={v.receiptNumber} onChange={(e) => update({ receiptNumber: e.target.value })} />
            </label>
          </div>
        )}
        <ErrorBox message={error} />
        <SubmitButton busy={busy}>Speichern</SubmitButton>
        {!editId && <button type="button" className="btn btn-secondary btn-block" onClick={() => { draft.clear(); setQrInfo(null); }}>Verwerfen</button>}
      </form>
      {scanning && (
        <QrScanner onClose={() => setScanning(false)} onResult={(text) => { setScanning(false); applyQr(text); }} />
      )}
      {showReceipt && (
        <ImageViewer title="Beleg" load={() => api.getReceipt(v.projectId, v.id)} onClose={() => setShowReceipt(false)} />
      )}
    </>
  );
}
