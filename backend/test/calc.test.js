'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('../dev/loadBackend');

const { run } = loadBackend({ quiet: true });
const Calc = run('Calc');
const Format = run('Format');
const Util = run('Util');

test('hours are rounded commercially to quarter hours', () => {
  assert.equal(Calc.hours('08:30', '16:20'), 7.75); // 470 min
  assert.equal(Calc.hours('08:00', '08:07'), 0); // 7 min → 0
  assert.equal(Calc.hours('08:00', '08:08'), 0.25); // 8 min → 0.25
  assert.equal(Calc.hours('07:00', '15:30'), 8.5);
});

test('overlap detection ignores touching intervals', () => {
  assert.equal(Calc.overlaps({ from: '08:00', to: '12:00' }, { from: '11:00', to: '13:00' }), true);
  assert.equal(Calc.overlaps({ from: '08:00', to: '12:00' }, { from: '12:00', to: '13:00' }), false);
});

test('invoice calculation follows the specification', () => {
  const calc = Calc.invoice({
    timeEntries: [
      { employeeId: 'a', employeeName: 'Anna', hours: 7.75, date: '2026-11-03' },
      { employeeId: 'a', employeeName: 'Anna', hours: 2.5, date: '2026-11-04' },
      { employeeId: 'b', employeeName: 'Bert', hours: 1.25, date: '2026-11-01' },
    ],
    purchases: [{ amount: 20.99, date: '2026-11-10' }, { amount: 100, date: '2026-11-02' }],
    extraItems: [{ code: 'PAUSCH-ANFAHRT', description: 'Anfahrt', quantity: 2, unit: 'Psch.', unitPrice: 45 }],
    rates: { a: 40, b: 33.33 },
    markupPercent: 20,
  });
  // JSON round trip: objects from the vm context have foreign prototypes.
  const lines = JSON.parse(JSON.stringify(calc.laborLines.map((l) => [l.employeeName, l.hours, l.amount])));
  assert.deepEqual(lines, [['Anna', 10.25, 410], ['Bert', 1.25, 41.66]]);
  assert.equal(calc.laborTotal, 451.66);
  assert.equal(calc.extrasTotal, 90);
  assert.equal(calc.materialBase, 120.99);
  assert.equal(calc.markupAmount, 24.2);
  assert.equal(calc.netTotal, 686.85); // 451.66 + 90 + 120.99 + 24.20
  assert.equal(calc.grossTotal, calc.netTotal);
  assert.equal(calc.periodFrom, '2026-11-01');
  assert.equal(calc.periodTo, '2026-11-10');
});

test('next invoice number is highest of the year + 1', () => {
  assert.equal(Calc.nextInvoiceNumber([], 2026), '2026-001');
  assert.equal(Calc.nextInvoiceNumber(['2025-017', '2026-002', '2026-010', 'X-1'], 2026), '2026-011');
});

test('de-AT formatting', () => {
  assert.equal(Format.money(1234.5), '1.234,50 €');
  assert.equal(Format.money(0), '0,00 €');
  assert.equal(Format.number(1234567.891, 2), '1.234.567,89');
  assert.equal(Format.date('2026-11-14'), '14.11.2026');
  assert.equal(Format.period('2026-11-01', '2026-11-14'), '01.11.2026 – 14.11.2026');
});

test('round2 handles binary representation errors', () => {
  assert.equal(Util.round2(1.005), 1.01);
  assert.equal(Util.round2(0.1 + 0.2), 0.3);
});
