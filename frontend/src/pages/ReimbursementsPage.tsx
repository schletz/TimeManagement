import { api } from '../api/api';
import type { Purchase } from '../api/types';
import { Empty } from '../components/Empty';
import { ErrorBox } from '../components/ErrorBox';
import { PageHeader } from '../components/PageHeader';
import { Spinner } from '../components/Spinner';
import { useApi } from '../hooks/useApi';
import { formatDate, formatMoney } from '../lib/format';

function PurchaseList({ items }: { items: Purchase[] }) {
  return (
    <ul className="item-list">
      {items.map((p) => (
        <li key={p.id} className="item">
          <div className="item-main">
            <strong>{p.article}</strong>
            <span className="item-amount">{formatMoney(p.amount)}</span>
          </div>
          <div className="item-meta">
            <span>{formatDate(p.date)}</span>
            <span className="muted">{p.projectName}</span>
            {p.reimbursedAt && <span className="muted">erstattet am {formatDate(p.reimbursedAt)}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Own purchases across all projects, split into open and reimbursed. */
export function ReimbursementsPage() {
  const { data, error, loading, reload } = useApi('reimbursements', () => api.listMyReimbursements());
  const open = (data ?? []).filter((p) => !p.reimbursed);
  const done = (data ?? []).filter((p) => p.reimbursed);
  const openSum = open.reduce((s, p) => s + p.amount, 0);

  return (
    <>
      <PageHeader title="Meine Erstattungen" back="/" />
      <ErrorBox message={error} onRetry={() => void reload()} />
      {!data && loading && <Spinner />}
      {data && (
        <>
          <div className="card stat">
            <span>Offen</span>
            <strong>{formatMoney(openSum)}</strong>
            <span className="muted">{open.length} Käufe</span>
          </div>
          <h2>Offene Erstattungen</h2>
          {open.length ? <PurchaseList items={open} /> : <Empty>Keine offenen Erstattungen.</Empty>}
          <h2>Erstattet</h2>
          {done.length ? <PurchaseList items={done} /> : <Empty>Noch nichts erstattet.</Empty>}
        </>
      )}
    </>
  );
}
