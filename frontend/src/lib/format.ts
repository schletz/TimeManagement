/** de-AT formatting helpers for the UI. */

const money = new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' });
const hoursFmt = new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numberFmt = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 });

/** 1234.5 → "€ 1.234,50" (Intl de-AT puts the symbol first). */
export function formatMoney(value: number | null | undefined): string {
  return money.format(value ?? 0);
}

/** 7.75 → "7,75" */
export function formatHours(value: number | null | undefined): string {
  return hoursFmt.format(value ?? 0);
}

/** 2.5 → "2,5", 3 → "3" */
export function formatNumber(value: number | null | undefined): string {
  return numberFmt.format(value ?? 0);
}

/** "2026-11-14" → "14.11.2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.substring(0, 10).split('-');
  return d && m && y ? `${d}.${m}.${y}` : iso;
}

/** "2026-11-14T10:05:00" → "14.11.2026 10:05" */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  return `${formatDate(iso)} ${iso.substring(11, 16)}`.trim();
}

/** Local date as `YYYY-MM-DD`. */
export function todayIso(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local timestamp as `YYYY-MM-DDTHH:MM:SS`. */
export function nowIso(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${todayIso(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** Parses "20,99" or "20.99" into a number; NaN when invalid. */
export function parseDecimal(value: string): number {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  return normalized === '' || !/^-?\d*\.?\d+$/.test(normalized) ? NaN : Number(normalized);
}

/** Number for an input field with decimal comma. */
export function toInputDecimal(value: number | null | undefined): string {
  return value === null || value === undefined || Number.isNaN(value) ? '' : String(value).replace('.', ',');
}

export const ITEM_STATUS_LABEL = { open: 'offen', invoiced: 'verrechnet', paid: 'bezahlt' } as const;
export const DEMAND_STATUS_LABEL = { open: 'offen', ordered: 'bestellt', done: 'erledigt' } as const;
export const INVOICE_KIND_LABEL = { invoice: 'Rechnung', partial: 'Zwischenrechnung', final: 'Schlussrechnung' } as const;
