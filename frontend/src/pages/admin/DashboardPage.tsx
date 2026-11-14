import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/api';
import { errorMessage } from '../../api/ApiError';
import type { StatusSums } from '../../api/types';
import { Empty } from '../../components/Empty';
import { ErrorBox } from '../../components/ErrorBox';
import { PageHeader } from '../../components/PageHeader';
import { Spinner } from '../../components/Spinner';
import { StatusBadge } from '../../components/StatusBadge';
import { invalidate, useApi } from '../../hooks/useApi';
import { formatDate, formatHours, formatMoney, formatNumber } from '../../lib/format';

/** Stacked bar open / invoiced / paid. */
function StatusBar({ sums, format }: { sums: StatusSums; format: (n: number) => string }) {
  const pct = (n: number) => (sums.total ? (n / sums.total) * 100 : 0);
  return (
    <div className="status-bar-wrap">
      <div className="status-bar" aria-hidden="true">
        <span className="seg seg-open" style={{ width: `${pct(sums.open)}%` }} />
        <span className="seg seg-invoiced" style={{ width: `${pct(sums.invoiced)}%` }} />
        <span className="seg seg-paid" style={{ width: `${pct(sums.paid)}%` }} />
      </div>
      <div className="status-legend">
        <span>Gesamt <strong>{format(sums.total)}</strong></span>
        <span><i className="dot seg-open" />offen {format(sums.open)}</span>
        <span><i className="dot seg-invoiced" />verrechnet {format(sums.invoiced)}</span>
        <span><i className="dot seg-paid" />bezahlt {format(sums.paid)}</span>
      </div>
    </div>
  );
}

/** Chef dashboard: hours and material per status, hours per employee, open demands and reimbursements. */
export function DashboardPage() {
  const [includeClosed, setIncludeClosed] = useState(false);
  const { data, error, loading, reload } = useApi(`dashboard:${includeClosed}`, () => api.getDashboard(includeClosed));
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const reimburseAll = async (employeeId: string, name: string, amount: number) => {
    if (!window.confirm(`Alle offenen Erstattungen von ${name} (${formatMoney(amount)}) als erstattet markieren?`)) return;
    setBusy(employeeId);
    setActionError(null);
    try {
      await api.setReimbursed({ employeeId });
      invalidate('purchases:');
      await reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader title="Dashboard" back="/">
        <button type="button" className="btn btn-small" disabled={loading} onClick={() => void reload()}>↻</button>
      </PageHeader>
      <label className="check">
        <input type="checkbox" checked={includeClosed} onChange={(e) => setIncludeClosed(e.target.checked)} />
        abgeschlossene Projekte einbeziehen
      </label>
      <ErrorBox message={error ?? actionError} onRetry={() => void reload()} />
      {!data && loading && <Spinner label="Daten werden aus allen Projekten berechnet …" />}
      {data && (
        <>
          <h2>Offener Materialbedarf</h2>
          {data.openDemands.length ? (
            <ul className="item-list">
              {data.openDemands.map((d) => (
                <li key={d.id} className="item">
                  <div className="item-main">
                    <strong>{d.material}</strong>
                    <span className="item-amount">{formatNumber(d.quantity)} {d.unit}</span>
                  </div>
                  <div className="item-meta">
                    <Link to={`/projects/${d.projectId}?tab=demands`}>{d.projectName}</Link>
                    <span>{formatDate(d.date)} · {d.reporterName}</span>
                    {d.urgency === 'urgent' && <StatusBadge status="urgent" />}
                    <StatusBadge status={d.status} />
                  </div>
                </li>
              ))}
            </ul>
          ) : <Empty>Kein offener Materialbedarf.</Empty>}

          <h2>Offene Erstattungen</h2>
          {data.openReimbursements.length ? (
            <ul className="item-list">
              {data.openReimbursements.map((r) => (
                <li key={r.employeeId} className="item">
                  <div className="item-main">
                    <strong>{r.employeeName}</strong>
                    <span className="item-amount">{formatMoney(r.amount)}</span>
                  </div>
                  <div className="item-meta">
                    <span>{r.count} Käufe</span>
                    <span className="item-actions">
                      <button type="button" className="link-button" disabled={busy === r.employeeId}
                        onClick={() => void reimburseAll(r.employeeId, r.employeeName, r.amount)}>Alle als erstattet markieren</button>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : <Empty>Keine offenen Erstattungen.</Empty>}

          <h2>Projekte</h2>
          {!data.projects.length && <Empty>Keine Projekte.</Empty>}
          {data.projects.map((p) => (
            <div key={p.id} className="card dash-project">
              <div className="item-main">
                <Link to={`/projects/${p.id}`}><strong>{p.name}</strong></Link>
                {p.status === 'closed' && <StatusBadge status="closed" />}
              </div>
              <span className="muted">{p.client}</span>
              <h3>Stunden</h3>
              <StatusBar sums={p.hours} format={(n) => `${formatHours(n)} h`} />
              <h3>Material (brutto)</h3>
              <StatusBar sums={p.material} format={formatMoney} />
              {p.hoursPerEmployee.length > 0 && (
                <>
                  <h3>Stunden je Mitarbeiter</h3>
                  <table className="table">
                    <thead><tr><th>Mitarbeiter</th><th className="num">gesamt</th><th className="num">offen</th></tr></thead>
                    <tbody>
                      {p.hoursPerEmployee.map((e) => (
                        <tr key={e.employeeId}><td>{e.employeeName}</td><td className="num">{formatHours(e.hours)}</td><td className="num">{formatHours(e.openHours)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          ))}
        </>
      )}
    </>
  );
}
