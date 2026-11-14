import type { Purchase, TimeEntry } from '../../../api/types';
import { Empty } from '../../../components/Empty';
import { formatDate, formatHours, formatMoney } from '../../../lib/format';

interface Props {
  timeEntries: TimeEntry[];
  purchases: Purchase[];
  selectedTimes: Set<string>;
  selectedPurchases: Set<string>;
  onChange(times: Set<string>, purchases: Set<string>): void;
}

function toggle(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Open hours and purchases up to the cutoff date; all preselected, each can be deselected. */
export function ItemSelection({ timeEntries, purchases, selectedTimes, selectedPurchases, onChange }: Props) {
  const hours = timeEntries.filter((t) => selectedTimes.has(t.id)).reduce((s, t) => s + t.hours, 0);
  const amount = purchases.filter((p) => selectedPurchases.has(p.id)).reduce((s, p) => s + p.amount, 0);
  const allTimes = selectedTimes.size === timeEntries.length;
  const allPurchases = selectedPurchases.size === purchases.length;

  return (
    <>
      <div className="selection-head">
        <h3>Stunden ({formatHours(hours)} h gewählt)</h3>
        {timeEntries.length > 0 && (
          <button type="button" className="link-button"
            onClick={() => onChange(allTimes ? new Set() : new Set(timeEntries.map((t) => t.id)), selectedPurchases)}>
            {allTimes ? 'keine' : 'alle'}
          </button>
        )}
      </div>
      {!timeEntries.length && <Empty>Keine offenen Stunden bis zum Stichtag.</Empty>}
      <ul className="select-list">
        {timeEntries.map((t) => (
          <li key={t.id}>
            <label>
              <input type="checkbox" checked={selectedTimes.has(t.id)} onChange={() => onChange(toggle(selectedTimes, t.id), selectedPurchases)} />
              <span className="select-main">
                <span>{formatDate(t.date)} · {t.employeeName} · {t.from}–{t.to}</span>
                <span className="muted">{t.description}</span>
              </span>
              <span className="num">{formatHours(t.hours)} h</span>
            </label>
          </li>
        ))}
      </ul>

      <div className="selection-head">
        <h3>Materialkäufe ({formatMoney(amount)} gewählt)</h3>
        {purchases.length > 0 && (
          <button type="button" className="link-button"
            onClick={() => onChange(selectedTimes, allPurchases ? new Set() : new Set(purchases.map((p) => p.id)))}>
            {allPurchases ? 'keine' : 'alle'}
          </button>
        )}
      </div>
      {!purchases.length && <Empty>Keine offenen Materialkäufe bis zum Stichtag.</Empty>}
      <ul className="select-list">
        {purchases.map((p) => (
          <li key={p.id}>
            <label>
              <input type="checkbox" checked={selectedPurchases.has(p.id)} onChange={() => onChange(selectedTimes, toggle(selectedPurchases, p.id))} />
              <span className="select-main">
                <span>{formatDate(p.date)} · {p.article}</span>
                <span className="muted">{p.buyerName}{p.receiptNumber ? ` · Beleg ${p.receiptNumber}` : ''}</span>
              </span>
              <span className="num">{formatMoney(p.amount)}</span>
            </label>
          </li>
        ))}
      </ul>
    </>
  );
}
