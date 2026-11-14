import type { InvoiceCalc } from '../../../api/types';
import { formatDate, formatHours, formatMoney, formatNumber } from '../../../lib/format';

/** Totals of an invoice calculated by the backend (previewInvoice). */
export function InvoiceSummary({ calc }: { calc: InvoiceCalc }) {
  return (
    <div className="invoice-summary">
      {calc.periodFrom && <p className="muted">Leistungszeitraum {formatDate(calc.periodFrom)} – {formatDate(calc.periodTo)}</p>}
      <table className="table">
        <tbody>
          {calc.laborLines.map((l) => (
            <tr key={l.employeeId}>
              <td>{l.employeeName}<br /><span className="muted">{formatHours(l.hours)} h × {formatMoney(l.rate)}</span></td>
              <td className="num">{formatMoney(l.amount)}</td>
            </tr>
          ))}
          <tr className="subtotal"><td>Summe Arbeit ({formatHours(calc.totalHours)} h)</td><td className="num">{formatMoney(calc.laborTotal)}</td></tr>
          {calc.extraLines.map((e, i) => (
            <tr key={i}>
              <td>{e.description}<br /><span className="muted">{formatNumber(e.quantity)} {e.unit} × {formatMoney(e.unitPrice)}</span></td>
              <td className="num">{formatMoney(e.total)}</td>
            </tr>
          ))}
          {calc.extraLines.length > 0 && (
            <tr className="subtotal"><td>Summe Zusatzleistungen</td><td className="num">{formatMoney(calc.extrasTotal)}</td></tr>
          )}
          <tr><td>Material (Kassenbeträge brutto)</td><td className="num">{formatMoney(calc.materialBase)}</td></tr>
          <tr><td>Aufschlag {formatNumber(calc.markupPercent)} %</td><td className="num">{formatMoney(calc.markupAmount)}</td></tr>
          <tr className="subtotal"><td>Summe Material</td><td className="num">{formatMoney(calc.materialTotal)}</td></tr>
          <tr className="subtotal"><td>Gesamt netto</td><td className="num">{formatMoney(calc.netTotal)}</td></tr>
          <tr><td>USt 0 % (Reverse Charge)</td><td className="num">{formatMoney(calc.vatAmount)}</td></tr>
          <tr className="total"><td>Gesamtbetrag</td><td className="num">{formatMoney(calc.grossTotal)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}
