import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/api';
import { errorMessage } from '../../api/ApiError';
import type { Invoice, Project } from '../../api/types';
import { Empty } from '../../components/Empty';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import { StatusBadge } from '../../components/StatusBadge';
import { invalidate, useApi } from '../../hooks/useApi';
import { downloadFile } from '../../lib/download';
import { INVOICE_KIND_LABEL, formatDate, formatMoney, todayIso } from '../../lib/format';

/** Chef: invoices of the project (download, paid status, delete) and entry to the invoice wizard. */
export function BillingTab({ project }: { project: Project }) {
  const { data, error, loading, reload } = useApi(`invoices:${project.id}`, () => api.listInvoices(project.id));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const run = async (inv: Invoice, action: () => Promise<unknown>) => {
    setBusyId(inv.id);
    setActionError(null);
    try {
      await action();
      // Item status changes affect the time and purchase tabs as well.
      invalidate(`time:${project.id}`);
      invalidate(`purchases:${project.id}`);
      await reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const markPaid = (inv: Invoice) => {
    const date = window.prompt('Bezahlt am (JJJJ-MM-TT):', todayIso());
    if (!date) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setActionError('Bitte das Datum im Format JJJJ-MM-TT eingeben.');
      return;
    }
    void run(inv, () => api.setInvoicePaid(project.id, inv.id, true, date));
  };

  const remove = (inv: Invoice) => {
    if (!window.confirm(`Rechnung ${inv.number} löschen? Die Posten werden wieder offen, die Word-Datei kommt in den Papierkorb.`)) return;
    void run(inv, () => api.deleteInvoice(project.id, inv.id));
  };

  const list = data ?? [];
  return (
    <section>
      <Link to={`/projects/${project.id}/invoice`} className="btn btn-primary btn-block">+ Rechnung erstellen</Link>
      <ErrorBox message={error ?? actionError} onRetry={() => void reload()} />
      {!data && loading && <Spinner />}
      {data && !list.length && <Empty>Noch keine Rechnungen.</Empty>}
      <ul className="item-list">
        {list.map((inv) => (
          <li key={inv.id} className="item">
            <div className="item-main">
              <strong>{INVOICE_KIND_LABEL[inv.kind]} {inv.number}</strong>
              <span className="item-amount">{formatMoney(inv.netTotal)}</span>
            </div>
            <div className="item-meta">
              <span>{formatDate(inv.date)}</span>
              {inv.periodFrom && <span className="muted">Leistung {formatDate(inv.periodFrom)} – {formatDate(inv.periodTo)}</span>}
              <StatusBadge status={inv.status} />
              {inv.paidAt && <span className="muted">am {formatDate(inv.paidAt)}</span>}
            </div>
            <div className="item-meta">
              <span className="item-actions">
                <button type="button" className="link-button" disabled={busyId === inv.id || !inv.hasDocument}
                  onClick={() => void run(inv, async () => downloadFile(await api.downloadInvoice(project.id, inv.id)))}>
                  Word-Datei
                </button>
                {inv.status === 'created' ? (
                  <button type="button" className="link-button" disabled={busyId === inv.id} onClick={() => markPaid(inv)}>Als bezahlt markieren</button>
                ) : (
                  <button type="button" className="link-button" disabled={busyId === inv.id}
                    onClick={() => void run(inv, () => api.setInvoicePaid(project.id, inv.id, false))}>Bezahlt zurücknehmen</button>
                )}
                <button type="button" className="link-button danger" disabled={busyId === inv.id} onClick={() => remove(inv)}>Löschen</button>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
