/**
 * Parser for the QR code on Austrian cash register receipts (RKSV, Registrierkassensicherheitsverordnung).
 *
 * Format (fields separated by "_", leading "_"):
 * `_R1-AT1_<cash register id>_<receipt no>_<YYYY-MM-DDThh:mm:ss>_<normal 20 %>_<reduced-1 10 %>_<reduced-2 13 %>_<zero>_<special>_<turnover counter>_<certificate>_<previous signature>_<signature>`
 * Amounts are gross values with decimal comma.
 */

export interface RksvReceipt {
  cashRegisterId: string;
  receiptNumber: string;
  /** `YYYY-MM-DD` */
  date: string;
  /** `HH:MM` */
  time: string;
  /** Sum of the five gross amounts, rounded to cents. */
  amount: number;
}

/** Parses an RKSV QR text; returns null when the text is not an RKSV receipt. */
export function parseRksv(text: string): RksvReceipt | null {
  const parts = text.trim().split('_');
  if (parts.length < 10 || parts[0] !== '' || !/^R1-/.test(parts[1])) return null;
  const [, , cashRegisterId, receiptNumber, timestamp] = parts;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(:\d{2})?$/.exec(timestamp);
  if (!m) return null;
  const amounts = parts.slice(5, 10).map((a) => Number(a.replace(/\./g, '').replace(',', '.')));
  if (amounts.some((a) => Number.isNaN(a))) return null;
  // Sum in cents to avoid binary rounding errors.
  const cents = amounts.reduce((sum, a) => sum + Math.round(a * 100), 0);
  return { cashRegisterId, receiptNumber, date: m[1], time: m[2], amount: cents / 100 };
}
