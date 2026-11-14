/**
 * Pure business calculations (no Apps Script services): hours, invoice totals, invoice numbers.
 * Kept free of side effects so it can be unit tested in Node.
 */
const Calc = {
  /**
   * Hours between two times, commercially rounded to quarter hours: round(minutes / 15) * 0.25.
   * Example: 08:30–16:20 = 470 min → 7.75 h.
   * @param {string} from `HH:MM`
   * @param {string} to `HH:MM`, must be later than `from`
   * @returns {number}
   */
  hours(from, to) {
    const minutes = Util.toMinutes(to) - Util.toMinutes(from);
    return Math.round(minutes / 15) * 0.25;
  },

  /**
   * Checks whether two time intervals on the same day overlap (touching intervals do not overlap).
   * @param {{from: string, to: string}} a
   * @param {{from: string, to: string}} b
   * @returns {boolean}
   */
  overlaps(a, b) {
    return Util.toMinutes(a.from) < Util.toMinutes(b.to) && Util.toMinutes(b.from) < Util.toMinutes(a.to);
  },

  /**
   * Computes all invoice amounts. All amounts are rounded to 2 decimals.
   *
   * @param {Object} input
   * @param {Array<{employeeId: string, employeeName: string, hours: number, date: string}>} input.timeEntries
   * @param {Array<{amount: number, date: string}>} input.purchases
   * @param {Array<{code: string, description: string, quantity: number, unit: string, unitPrice: number}>} input.extraItems
   * @param {Object<string, number>} input.rates hourly rate per employee id
   * @param {number} input.markupPercent material markup in percent
   * @returns {Object} invoice calculation (see properties below)
   */
  invoice(input) {
    const laborByEmployee = {};
    input.timeEntries.forEach((t) => {
      const line = laborByEmployee[t.employeeId] || {
        employeeId: t.employeeId,
        employeeName: t.employeeName,
        hours: 0,
        rate: Util.round2(input.rates[t.employeeId] || 0),
      };
      line.hours += Number(t.hours) || 0;
      laborByEmployee[t.employeeId] = line;
    });
    const laborLines = Object.keys(laborByEmployee)
      .map((id) => laborByEmployee[id])
      .map((l) => Object.assign(l, { hours: Math.round(l.hours * 100) / 100, amount: Util.round2(l.hours * l.rate) }))
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'de'));
    const laborTotal = Util.round2(laborLines.reduce((s, l) => s + l.amount, 0));

    const extraLines = input.extraItems.map((e) => Object.assign({}, e, {
      quantity: Number(e.quantity),
      unitPrice: Util.round2(e.unitPrice),
      total: Util.round2(Number(e.quantity) * Number(e.unitPrice)),
    }));
    const extrasTotal = Util.round2(extraLines.reduce((s, e) => s + e.total, 0));

    const materialBase = Util.round2(input.purchases.reduce((s, p) => s + Number(p.amount), 0));
    const markupPercent = Number(input.markupPercent) || 0;
    const markupAmount = Util.round2(materialBase * markupPercent / 100);
    const materialTotal = Util.round2(materialBase + markupAmount);
    const netTotal = Util.round2(laborTotal + extrasTotal + materialTotal);

    const dates = input.timeEntries.map((t) => t.date).concat(input.purchases.map((p) => p.date)).filter(Boolean).sort();
    return {
      laborLines,
      laborTotal,
      totalHours: Math.round(laborLines.reduce((s, l) => s + l.hours, 0) * 100) / 100,
      extraLines,
      extrasTotal,
      materialBase,
      markupPercent,
      markupAmount,
      materialTotal,
      netTotal,
      vatPercent: 0,
      vatAmount: 0,
      grossTotal: netTotal,
      periodFrom: dates.length ? dates[0] : '',
      periodTo: dates.length ? dates[dates.length - 1] : '',
    };
  },

  /**
   * Suggests the next invoice number `YYYY-NNN`: highest number of the year + 1.
   * @param {string[]} existingNumbers all invoice numbers in the register
   * @param {number} year
   * @returns {string}
   */
  nextInvoiceNumber(existingNumbers, year) {
    const prefix = String(year) + '-';
    const max = existingNumbers
      .filter((n) => typeof n === 'string' && n.indexOf(prefix) === 0)
      .map((n) => parseInt(n.substring(prefix.length), 10))
      .filter((n) => !isNaN(n))
      .reduce((m, n) => Math.max(m, n), 0);
    return prefix + String(max + 1).padStart(3, '0');
  },
};
