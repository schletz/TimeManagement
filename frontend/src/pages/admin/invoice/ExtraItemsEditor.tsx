import { useState } from 'react';
import type { CatalogItem, ExtraItem } from '../../../api/types';
import { formatMoney, formatNumber, parseDecimal } from '../../../lib/format';

/** Additional invoice positions from the service catalog (quantity editable) or as free position. */
export function ExtraItemsEditor({ catalog, items, onChange }: { catalog: CatalogItem[]; items: ExtraItem[]; onChange(items: ExtraItem[]): void }) {
  const [code, setCode] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [free, setFree] = useState({ description: '', quantity: '1', unit: 'Psch.', unitPrice: '' });
  const [error, setError] = useState<string | null>(null);

  const addCatalog = () => {
    const item = catalog.find((c) => c.code === code);
    const q = parseDecimal(quantity);
    if (!item || !q) {
      setError('Bitte Position und Menge wählen.');
      return;
    }
    setError(null);
    onChange([...items, { code: item.code, description: item.description, quantity: q, unit: item.unit, unitPrice: item.price }]);
    setCode('');
    setQuantity('1');
  };

  const addFree = () => {
    const q = parseDecimal(free.quantity);
    const price = parseDecimal(free.unitPrice);
    if (!free.description.trim() || !q || Number.isNaN(price)) {
      setError('Freie Position: Beschreibung, Menge und Preis angeben.');
      return;
    }
    setError(null);
    onChange([...items, { code: '', description: free.description.trim(), quantity: q, unit: free.unit, unitPrice: price }]);
    setFree({ description: '', quantity: '1', unit: 'Psch.', unitPrice: '' });
  };

  return (
    <>
      {items.length > 0 && (
        <ul className="item-list">
          {items.map((it, i) => (
            <li key={i} className="item">
              <div className="item-main">
                <strong>{it.description}</strong>
                <span className="item-amount">{formatMoney(it.quantity * it.unitPrice)}</span>
              </div>
              <div className="item-meta">
                <span>{formatNumber(it.quantity)} {it.unit} × {formatMoney(it.unitPrice)}</span>
                {it.code && <span className="muted">{it.code}</span>}
                <span className="item-actions">
                  <button type="button" className="link-button danger" onClick={() => onChange(items.filter((_, j) => j !== i))}>Entfernen</button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="field-row">
        <label className="field grow">
          <span>Aus Leistungskatalog</span>
          <select value={code} onChange={(e) => setCode(e.target.value)}>
            <option value="">– Position wählen –</option>
            {catalog.map((c) => <option key={c.code} value={c.code}>{c.description} ({formatMoney(c.price)}/{c.unit})</option>)}
          </select>
        </label>
        <label className="field narrow">
          <span>Menge</span>
          <input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </label>
      </div>
      <button type="button" className="btn btn-block" onClick={addCatalog} disabled={!code}>+ Katalogposition</button>
      <details className="free-position">
        <summary>Freie Position</summary>
        <label className="field">
          <span>Beschreibung</span>
          <input value={free.description} onChange={(e) => setFree({ ...free, description: e.target.value })} />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Menge</span>
            <input inputMode="decimal" value={free.quantity} onChange={(e) => setFree({ ...free, quantity: e.target.value })} />
          </label>
          <label className="field">
            <span>Einheit</span>
            <input value={free.unit} onChange={(e) => setFree({ ...free, unit: e.target.value })} />
          </label>
          <label className="field">
            <span>Einzelpreis €</span>
            <input inputMode="decimal" value={free.unitPrice} onChange={(e) => setFree({ ...free, unitPrice: e.target.value })} />
          </label>
        </div>
        <button type="button" className="btn btn-block" onClick={addFree}>+ Freie Position</button>
      </details>
      {error && <p className="field-error">{error}</p>}
    </>
  );
}
