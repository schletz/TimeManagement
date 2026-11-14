import { describe, expect, it } from 'vitest';
import { formatDate, parseDecimal } from './format';
import { quarterHours } from './hours';
import { parseRksv } from './rksv';

describe('quarterHours', () => {
  it('rounds commercially to quarter hours', () => {
    expect(quarterHours('08:30', '16:20')).toBe(7.75);
    expect(quarterHours('08:00', '08:07')).toBe(0);
    expect(quarterHours('08:00', '08:08')).toBe(0.25);
  });
  it('rejects invalid ranges', () => {
    expect(quarterHours('09:00', '08:00')).toBeNull();
    expect(quarterHours('9:00', '10:00')).toBeNull();
  });
});

describe('parseRksv', () => {
  it('reads cash register, receipt number, date and the sum of all amounts', () => {
    const qr = '_R1-AT1_KASSE-01/7_123_2026-11-10T11:57:52_20,99_1,50_0,00_0,00_0,51_AbC=_60a8_ra7f=_Sig==';
    expect(parseRksv(qr)).toEqual({
      cashRegisterId: 'KASSE-01/7', receiptNumber: '123', date: '2026-11-10', time: '11:57', amount: 23,
    });
  });
  it('returns null for other QR codes', () => {
    expect(parseRksv('https://example.com')).toBeNull();
    expect(parseRksv('_R1-AT1_K_1_kein-datum_1,00_0_0_0_0_x_y_z_w')).toBeNull();
  });
});

describe('format helpers', () => {
  it('parses decimal comma and point', () => {
    expect(parseDecimal('20,99')).toBe(20.99);
    expect(parseDecimal('20.5')).toBe(20.5);
    expect(Number.isNaN(parseDecimal('abc'))).toBe(true);
  });
  it('formats ISO dates', () => {
    expect(formatDate('2026-11-14')).toBe('14.11.2026');
  });
});
