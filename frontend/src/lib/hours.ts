/** Time calculations matching the backend (Calc.hours / Calc.overlaps). */

/** "08:30" → 510 */
export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** True for a valid `HH:MM` time. */
export function isTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/**
 * Hours between two times, commercially rounded to quarter hours (08:30–16:20 = 470 min → 7.75 h).
 * Returns null when the input is incomplete or `to` is not after `from`.
 */
export function quarterHours(from: string, to: string): number | null {
  if (!isTime(from) || !isTime(to)) return null;
  const minutes = toMinutes(to) - toMinutes(from);
  if (minutes <= 0) return null;
  return Math.round(minutes / 15) * 0.25;
}
