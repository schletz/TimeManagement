/**
 * Generic table access on a Google Sheet tab described in SCHEMA.
 *
 * - Row 1 holds the German headers; columns are located by header, so the chef may reorder columns
 *   or add own columns (their values are preserved on update). Missing schema columns are appended.
 * - Rows are identified by the id column (first schema column), never by row number across requests.
 * - Read rows carry the hidden properties `_row` (1-based sheet row) and `_raw` (raw cell values);
 *   they are valid until the next structural change within the same locked request.
 * - Invalid rows are skipped with a log message.
 */
const Table = {
  /**
   * @param {string} tableKey key in SCHEMA
   * @returns {{sheet: string, columns: Array<{key: string, header: string, type?: string, values?: Object}>}}
   */
  def(tableKey) {
    const def = SCHEMA[tableKey];
    if (!def) throw new AppError('INTERNAL', 'Unbekannte Tabelle: ' + tableKey);
    return def;
  },

  /**
   * Creates the tab with headers, formats and the warning-only protection if it is missing.
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
   * @param {string} tableKey
   * @returns {GoogleAppsScript.Spreadsheet.Sheet}
   */
  ensureSheet(ss, tableKey) {
    const def = this.def(tableKey);
    let sheet = ss.getSheetByName(def.sheet);
    if (sheet) return sheet;
    sheet = ss.insertSheet(def.sheet);
    const headers = def.columns.map((c) => c.header);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#dce6f2');
    sheet.getRange(1, 1).setNote('Nur über die App ändern. Manuelle Änderungen erfolgen auf eigene Gefahr.');
    sheet.setFrozenRows(1);
    const maxRows = sheet.getMaxRows();
    if (maxRows > 1) {
      def.columns.forEach((c, i) => sheet.getRange(2, i + 1, maxRows - 1, 1).setNumberFormat(this.numberFormat(c)));
    }
    const protection = sheet.protect();
    protection.setDescription('Nur über die App ändern');
    protection.setWarningOnly(true);
    return sheet;
  },

  /**
   * Spreadsheet number format for a column; text format prevents Sheets from converting
   * ISO dates and times into date values.
   * @param {{type?: string}} col
   * @returns {string}
   */
  numberFormat(col) {
    if (col.type === 'money') return '#,##0.00';
    if (col.type === 'number') return '0.00';
    return '@';
  },

  /**
   * Maps schema columns to sheet column indexes (0-based), appending missing headers.
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {Object} def
   * @returns {{indexes: number[], width: number}}
   */
  layout(sheet, def) {
    const lastCol = Math.max(sheet.getLastColumn(), 1);
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map((h) => String(h).trim());
    const indexes = def.columns.map((c) => {
      let idx = headers.indexOf(c.header);
      if (idx < 0) {
        headers.push(c.header);
        idx = headers.length - 1;
        sheet.getRange(1, idx + 1).setValue(c.header).setFontWeight('bold');
      }
      return idx;
    });
    return { indexes, width: headers.length };
  },

  /**
   * Converts a field value into a cell value.
   * @param {Object} col
   * @param {*} value
   * @returns {*}
   */
  serialize(col, value) {
    switch (col.type) {
      case 'money':
        return value === '' || value === null || value === undefined ? '' : Util.round2(value);
      case 'number':
        return value === '' || value === null || value === undefined ? '' : Number(value);
      case 'bool':
        return value ? 'ja' : 'nein';
      case 'enum':
        return value ? (col.values[value] || '') : '';
      default: {
        const s = value === null || value === undefined ? '' : String(value);
        // A leading apostrophe forces text; prevents formula injection via user input.
        return /^[=+\-@]/.test(s) ? "'" + s : s;
      }
    }
  },

  /**
   * Converts a cell value into a field value. Throws on invalid values.
   * @param {Object} col
   * @param {*} raw
   * @returns {*}
   */
  deserialize(col, raw) {
    const isDate = Object.prototype.toString.call(raw) === '[object Date]';
    const empty = raw === '' || raw === null || raw === undefined;
    switch (col.type) {
      case 'money':
      case 'number': {
        if (empty) return null;
        const n = typeof raw === 'number' ? raw : Util.toNumber(String(raw));
        if (isNaN(n)) throw new Error(col.header + ': keine Zahl');
        return n;
      }
      case 'bool':
        return ['ja', 'true', 'x', '1', 'yes'].indexOf(String(raw).trim().toLowerCase()) >= 0;
      case 'enum': {
        if (empty) return '';
        const key = Object.keys(col.values).find((k) => Util.sameText(col.values[k], raw));
        if (!key) throw new Error(col.header + ': ungültiger Wert "' + raw + '"');
        return key;
      }
      case 'date': {
        if (empty) return '';
        const s = isDate ? Utilities.formatDate(raw, Config.TIME_ZONE, 'yyyy-MM-dd') : String(raw).trim();
        if (!Util.isIsoDate(s)) throw new Error(col.header + ': ungültiges Datum "' + s + '"');
        return s;
      }
      case 'time': {
        if (empty) return '';
        const s = isDate ? Utilities.formatDate(raw, Config.TIME_ZONE, 'HH:mm') : String(raw).trim();
        if (!Util.isTime(s)) throw new Error(col.header + ': ungültige Zeit "' + s + '"');
        return s;
      }
      case 'datetime':
        if (empty) return '';
        return isDate ? Utilities.formatDate(raw, Config.TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ss") : String(raw).trim();
      default:
        return empty ? '' : (isDate ? Utilities.formatDate(raw, Config.TIME_ZONE, 'yyyy-MM-dd') : String(raw));
    }
  },

  /**
   * Reads all valid rows of a table.
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
   * @param {string} tableKey
   * @returns {Object[]} row objects with hidden `_row` and `_raw`
   */
  read(ss, tableKey) {
    const def = this.def(tableKey);
    const sheet = this.ensureSheet(ss, tableKey);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    const layout = this.layout(sheet, def);
    const values = sheet.getRange(2, 1, lastRow - 1, layout.width).getValues();
    const rows = [];
    values.forEach((raw, i) => {
      const idRaw = raw[layout.indexes[0]];
      if (idRaw === '' || idRaw === null) return;
      try {
        const obj = {};
        def.columns.forEach((c, ci) => { obj[c.key] = this.deserialize(c, raw[layout.indexes[ci]]); });
        Object.defineProperty(obj, '_row', { value: i + 2, writable: true, enumerable: false });
        Object.defineProperty(obj, '_raw', { value: raw, writable: true, enumerable: false });
        rows.push(obj);
      } catch (err) {
        console.warn('Skipping invalid row ' + (i + 2) + ' in "' + def.sheet + '" (' + ss.getName() + '): ' + err.message);
      }
    });
    return rows;
  },

  /**
   * Finds a row by id.
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
   * @param {string} tableKey
   * @param {string} id
   * @returns {Object|null}
   */
  find(ss, tableKey, id) {
    const idKey = this.def(tableKey).columns[0].key;
    return this.read(ss, tableKey).find((r) => r[idKey] === id) || null;
  },

  /**
   * Builds the raw value array for a row, keeping values of foreign columns.
   * @private
   */
  toRaw(def, layout, obj, previousRaw) {
    const raw = new Array(layout.width).fill('');
    if (previousRaw) previousRaw.forEach((v, i) => { if (i < raw.length) raw[i] = v; });
    def.columns.forEach((c, ci) => { raw[layout.indexes[ci]] = this.serialize(c, obj[c.key]); });
    return raw;
  },

  /** @private */
  formats(def, layout) {
    const formats = new Array(layout.width).fill('@');
    def.columns.forEach((c, ci) => { formats[layout.indexes[ci]] = this.numberFormat(c); });
    return formats;
  },

  /**
   * Appends a row.
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
   * @param {string} tableKey
   * @param {Object} obj
   */
  insert(ss, tableKey, obj) {
    this.insertMany(ss, tableKey, [obj]);
  },

  /**
   * Appends several rows with one write.
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
   * @param {string} tableKey
   * @param {Object[]} objs
   */
  insertMany(ss, tableKey, objs) {
    if (!objs.length) return;
    const def = this.def(tableKey);
    const sheet = this.ensureSheet(ss, tableKey);
    const layout = this.layout(sheet, def);
    const formats = this.formats(def, layout);
    const start = sheet.getLastRow() + 1;
    this.ensureCapacity(sheet, start + objs.length - 1);
    sheet.getRange(start, 1, objs.length, layout.width)
      .setNumberFormats(objs.map(() => formats))
      .setValues(objs.map((o) => this.toRaw(def, layout, o, null)));
  },

  /**
   * Writes changed rows (previously returned by read in the same request).
   * Many rows are written as one block to keep the number of Sheets calls low.
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
   * @param {string} tableKey
   * @param {Object[]} rows
   */
  update(ss, tableKey, rows) {
    const list = Array.isArray(rows) ? rows : [rows];
    if (!list.length) return;
    const def = this.def(tableKey);
    const sheet = this.ensureSheet(ss, tableKey);
    const layout = this.layout(sheet, def);
    const formats = this.formats(def, layout);
    if (list.length <= 3) {
      list.forEach((r) => {
        sheet.getRange(r._row, 1, 1, layout.width).setNumberFormats([formats]).setValues([this.toRaw(def, layout, r, r._raw)]);
      });
      return;
    }
    const first = Math.min.apply(null, list.map((r) => r._row));
    const last = Math.max.apply(null, list.map((r) => r._row));
    const range = sheet.getRange(first, 1, last - first + 1, layout.width);
    const block = range.getValues();
    list.forEach((r) => { block[r._row - first] = this.toRaw(def, layout, r, block[r._row - first]); });
    range.setNumberFormats(block.map(() => formats)).setValues(block);
  },

  /**
   * Deletes rows (previously returned by read in the same request).
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
   * @param {string} tableKey
   * @param {Object[]} rows
   */
  remove(ss, tableKey, rows) {
    const list = Array.isArray(rows) ? rows : [rows];
    if (!list.length) return;
    const sheet = this.ensureSheet(ss, tableKey);
    // Sheets refuses to delete all non-frozen rows; keep spare rows below the data.
    this.ensureCapacity(sheet, sheet.getLastRow() + list.length + 1);
    list.map((r) => r._row).sort((a, b) => b - a).forEach((rowNo) => sheet.deleteRow(rowNo));
  },

  /**
   * Makes sure the sheet has at least the given number of rows (getRange fails beyond the sheet size).
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {number} rowCount
   */
  ensureCapacity(sheet, rowCount) {
    const maxRows = sheet.getMaxRows();
    if (rowCount > maxRows) sheet.insertRowsAfter(maxRows, rowCount - maxRows + 100);
  },
};
