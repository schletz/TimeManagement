import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/api';
import { errorMessage } from '../../api/ApiError';
import type { Project, Purchase } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Empty } from '../../components/Empty';
import { ErrorBox } from '../../components/ErrorBox';
import { ImageViewer } from '../../components/ImageViewer';
import { Spinner } from '../../components/Spinner';
import { StatusBadge } from '../../components/StatusBadge';
import { useApi } from '../../hooks/useApi';
import { formatDate, formatMoney } from '../../lib/format';

/** Material purchases of a project; the chef can toggle the reimbursement status. */
export function PurchasesTab({ project }: { project: Project }) {
  const { isChef } = useAuth();
  const { data, error, loading, reload, setData } = useApi(`purchases:${project.id}`, () => api.listPurchases(project.id));
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Purchase | null>(null);
  const canEdit = (p: Purchase) => p.status === 'open' && (isChef || project.status === 'active');

  const run = async (p: Purchase, action: () => Promise<void>) => {
    setBusyId(p.id);
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const remove = (p: Purchase) => {
    if (!window.confirm(`Kauf "${p.article}" löschen?`)) return;
    void run(p, async () => {
      await api.deletePurchase(project.id, p.id);
      setData((data ?? []).filter((x) => x.id !== p.id));
    });
  };

  const toggleReimbursed = (p: Purchase) => void run(p, async () => {
    await api.setReimbursed({ projectId: project.id, ids: [p.id], reimbursed: !p.reimbursed });
    await reload();
  });

  const list = data ?? [];
  const sum = list.reduce((s, p) => s + p.amount, 0);

  return (
    <section>
      {(project.status === 'active' || isChef) && (
        <Link to={`/purchase?project=${project.id}`} className="btn btn-primary btn-block">+ Material gekauft</Link>
      )}
      <ErrorBox message={error ?? actionError} onRetry={() => void reload()} />
      {!data && loading && <Spinner />}
      {data && !list.length && <Empty>Noch keine Materialkäufe.</Empty>}
      {list.length > 0 && <p className="summary">Summe {formatMoney(sum)} (brutto)</p>}
      <ul className="item-list">
        {list.map((p) => (
          <li key={p.id} className="item">
            <div className="item-main">
              <strong>{p.article}</strong>
              <span className="item-amount">{formatMoney(p.amount)}</span>
            </div>
            <div className="item-meta">
              <span>{formatDate(p.date)}</span>
              {isChef && <span>{p.buyerName}</span>}
              {p.receiptNumber && <span className="muted">Beleg {p.receiptNumber}</span>}
              <StatusBadge status={p.status} />
              <StatusBadge status={p.reimbursed ? 'reimbursed' : 'unreimbursed'} />
            </div>
            <div className="item-meta">
              <span className="item-actions">
                {p.hasReceipt && <button type="button" className="link-button" onClick={() => setReceipt(p)}>Beleg ansehen</button>}
                {isChef && (
                  <button type="button" className="link-button" disabled={busyId === p.id} onClick={() => toggleReimbursed(p)}>
                    {p.reimbursed ? 'Erstattung zurücknehmen' : 'Als erstattet markieren'}
                  </button>
                )}
                {canEdit(p) && (
                  <>
                    <Link to={`/purchase?project=${project.id}&edit=${p.id}`} className="link-button">Bearbeiten</Link>
                    <button type="button" className="link-button danger" disabled={busyId === p.id} onClick={() => remove(p)}>Löschen</button>
                  </>
                )}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {receipt && (
        <ImageViewer title={`Beleg: ${receipt.article}`} load={() => api.getReceipt(project.id, receipt.id)} onClose={() => setReceipt(null)} />
      )}
    </section>
  );
}
