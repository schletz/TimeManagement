/**
 * Number and date formatting in de-AT style for the invoice document.
 * Implemented manually because Intl support in Apps Script is limited.
 */
const Format = {
  /**
   * Formats a number with thousands separator `.` and decimal comma.
   * @param {number} value
   * @param {number} [decimals=2]
   * @returns {string} e.g. `1.234,50`
   */
  number(value, decimals) {
    const d = decimals === undefined ? 2 : decimals;
    const factor = Math.pow(10, d);
    const rounded = Math.round((Math.abs(Number(value)) + Number.EPSILON) * factor) / factor;
    const parts = rounded.toFixed(d).split('.');
    const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const sign = Number(value) < 0 && rounded !== 0 ? '-' : '';
    return sign + intPart + (d > 0 ? ',' + parts[1] : '');
  },

  /**
   * @param {number} value
   * @returns {string} e.g. `1.234,50 €`
   */
  money(value) {
    return this.number(value, 2) + ' €';
  },

  /**
   * Hours with 2 decimals (quarter hours need two digits: 7,75 / 8,00).
   * @param {number} value
   * @returns {string}
   */
  hours(value) {
    return this.number(value, 2);
  },

  /**
   * @param {string} iso `YYYY-MM-DD`
   * @returns {string} `DD.MM.YYYY`
   */
  date(iso) {
    if (!iso) return '';
    const p = String(iso).substring(0, 10).split('-');
    return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : String(iso);
  },

  /**
   * @param {string} from
   * @param {string} to
   * @returns {string} `DD.MM.YYYY – DD.MM.YYYY` or a single date
   */
  period(from, to) {
    if (!from) return '';
    return from === to ? this.date(from) : this.date(from) + ' – ' + this.date(to);
  },
};
