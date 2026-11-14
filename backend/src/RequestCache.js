/**
 * Per-request memo cache (e.g. opened spreadsheets). Cleared at the start of each request,
 * because a long-lived runtime (local dev server) may keep globals between requests.
 */
const RequestCache = {
  store: {},

  clear() {
    this.store = {};
  },

  /**
   * Returns the cached value or computes and stores it.
   * @param {string} key
   * @param {function(): *} factory
   * @returns {*}
   */
  get(key, factory) {
    if (!(key in this.store)) this.store[key] = factory();
    return this.store[key];
  },

  /** @param {string} key */
  remove(key) {
    delete this.store[key];
  },

  /**
   * Opens a spreadsheet once per request.
   * @param {string} id
   * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
   */
  spreadsheet(id) {
    return this.get('ss_' + id, () => SpreadsheetApp.openById(id));
  },
};
