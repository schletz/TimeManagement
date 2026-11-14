/**
 * Master data: settings, employees and service catalog (master spreadsheet).
 * Settings and employees are needed on every request (authorization) and are therefore
 * cached in the script cache; every write invalidates the cache.
 */
const DEFAULT_SETTINGS = {
  chefEmail: '',
  materialMarkupPercent: 20,
  reverseChargeText: 'Übergang der Steuerschuld gemäß § 19 Abs. 1a UStG',
};

const SETTING_DESCRIPTIONS = {
  chefEmail: 'Google-Account mit Chef-Rechten',
  materialMarkupPercent: 'Standard-Materialaufschlag in %',
  reverseChargeText: 'Hinweistext zur Steuerschuld auf der Rechnung',
};

/** Start values of the service catalog (taken from the former Excel solution). */
const DEFAULT_CATALOG = [
  { code: 'STD-MEISTER', description: 'Montagestunde Elektrotechnik-Meister / Techniker', unit: 'Std.', price: 30 },
  { code: 'STD-MONTEUR', description: 'Montagestunde Facharbeiter / Elektroinstallateur', unit: 'Std.', price: 25 },
  { code: 'STD-HELFER', description: 'Montagestunde Elektrohelfer', unit: 'Std.', price: 20 },
  { code: 'PAUSCH-ANFAHRT', description: 'Anfahrtspauschale / KFZ-Einsatz im Bezirk', unit: 'Psch.', price: 45 },
  { code: 'PRUEF-EBEF', description: 'Erstellung E-Befund / Anlagenprüfung nach OVE E 8101', unit: 'Psch.', price: 180 },
];

const MasterData = {
  /** @returns {GoogleAppsScript.Spreadsheet.Spreadsheet} */
  spreadsheet() {
    return RequestCache.spreadsheet(Config.masterSheetId());
  },

  /**
   * Settings and employees, cached.
   * @returns {{settings: Object, employees: Object[]}}
   */
  snapshot() {
    return RequestCache.get('master_snapshot', () => {
      const cache = CacheService.getScriptCache();
      const cached = cache.get(Config.MASTER_CACHE_KEY);
      if (cached) return JSON.parse(cached);
      const ss = this.spreadsheet();
      const settings = Object.assign({}, DEFAULT_SETTINGS);
      Table.read(ss, 'settings').forEach((r) => {
        if (!(r.key in DEFAULT_SETTINGS)) return;
        settings[r.key] = r.key === 'materialMarkupPercent' ? (Util.toNumber(r.value) || 0) : r.value;
      });
      const employees = Table.read(ss, 'employees').map((e) => this.employeeDto(e));
      const snap = { settings, employees };
      cache.put(Config.MASTER_CACHE_KEY, JSON.stringify(snap), Config.MASTER_CACHE_SECONDS);
      return snap;
    });
  },

  /** Drops the cached snapshot after a change of settings or employees. */
  invalidate() {
    CacheService.getScriptCache().remove(Config.MASTER_CACHE_KEY);
    RequestCache.remove('master_snapshot');
  },

  /** @returns {Object} settings */
  settings() {
    return this.snapshot().settings;
  },

  /** @returns {Object[]} all employees (active and inactive) */
  employees() {
    return this.snapshot().employees;
  },

  /**
   * @param {string} id
   * @returns {Object|null}
   */
  employeeById(id) {
    return this.employees().find((e) => e.id === id) || null;
  },

  /** @private */
  employeeDto(e) {
    return {
      id: e.id,
      name: e.name,
      shortName: e.shortName,
      email: String(e.email || '').trim().toLowerCase(),
      hourlyRate: e.hourlyRate || 0,
      active: e.active,
    };
  },

  // ---------------- API handlers ----------------

  /** listEmployees (chef) */
  listEmployees() {
    return this.employees().slice().sort((a, b) => a.name.localeCompare(b.name, 'de'));
  },

  /**
   * saveEmployee (chef): create or update.
   * @param {Object} ctx
   * @param {{id: string, name: string, shortName: string, email: string, hourlyRate: number, active: boolean}} p
   */
  saveEmployee(ctx, p) {
    const id = Util.text(p.id) || Util.uuid();
    const name = Util.text(p.name, 100);
    const email = Util.text(p.email, 200).toLowerCase();
    const rate = Util.toNumber(p.hourlyRate);
    assertValid(name, 'Name fehlt.');
    assertValid(Util.isEmail(email), 'Ungültige E-Mail-Adresse.');
    assertValid(!isNaN(rate) && rate >= 0, 'Ungültiger Stundensatz.');
    const ss = this.spreadsheet();
    const rows = Table.read(ss, 'employees');
    assertValid(!rows.some((r) => r.id !== id && Util.sameText(r.email, email)), 'Diese E-Mail-Adresse ist bereits vergeben.');
    const values = {
      id,
      name,
      shortName: Util.text(p.shortName, 10).toUpperCase(),
      email,
      hourlyRate: Util.round2(rate),
      active: p.active !== false,
    };
    const existing = rows.find((r) => r.id === id);
    if (existing) Table.update(ss, 'employees', Object.assign(existing, values));
    else Table.insert(ss, 'employees', values);
    this.invalidate();
    return this.employeeDto(values);
  },

  /** listCatalog (chef) */
  listCatalog() {
    return Table.read(this.spreadsheet(), 'catalog').map((c) => ({
      code: c.code, description: c.description, unit: c.unit, price: c.price || 0,
    }));
  },

  /**
   * saveCatalogItem (chef): create or update; `originalCode` allows renaming the code.
   * @param {Object} ctx
   * @param {{originalCode?: string, code: string, description: string, unit: string, price: number}} p
   */
  saveCatalogItem(ctx, p) {
    const code = Util.text(p.code, 40).toUpperCase();
    const price = Util.toNumber(p.price);
    assertValid(code, 'Code fehlt.');
    assertValid(Util.text(p.description), 'Beschreibung fehlt.');
    assertValid(!isNaN(price) && price >= 0, 'Ungültiger Preis.');
    const ss = this.spreadsheet();
    const rows = Table.read(ss, 'catalog');
    const original = Util.text(p.originalCode).toUpperCase() || code;
    assertValid(!rows.some((r) => r.code === code && r.code !== original), 'Dieser Code ist bereits vergeben.');
    const values = { code, description: Util.text(p.description, 300), unit: Util.text(p.unit, 20), price: Util.round2(price) };
    const existing = rows.find((r) => r.code === original);
    if (existing) Table.update(ss, 'catalog', Object.assign(existing, values));
    else Table.insert(ss, 'catalog', values);
    return values;
  },

  /**
   * deleteCatalogItem (chef). Existing invoices keep their copied positions.
   * @param {Object} ctx
   * @param {{code: string}} p
   */
  deleteCatalogItem(ctx, p) {
    const ss = this.spreadsheet();
    const row = Table.find(ss, 'catalog', Util.text(p.code).toUpperCase());
    if (row) Table.remove(ss, 'catalog', row);
    return { deleted: !!row };
  },

  /** getSettings (chef) */
  getSettings() {
    return this.settings();
  },

  /**
   * saveSettings (chef).
   * @param {Object} ctx
   * @param {{chefEmail: string, materialMarkupPercent: number, reverseChargeText: string}} p
   */
  saveSettings(ctx, p) {
    const chefEmail = Util.text(p.chefEmail, 200).toLowerCase();
    const markup = Util.toNumber(p.materialMarkupPercent);
    assertValid(Util.isEmail(chefEmail), 'Ungültige Chef-E-Mail.');
    assertValid(!isNaN(markup) && markup >= 0 && markup <= 1000, 'Ungültiger Materialaufschlag.');
    const values = {
      chefEmail,
      materialMarkupPercent: markup,
      reverseChargeText: Util.text(p.reverseChargeText, 500),
    };
    this.writeSettings(values);
    return this.settings();
  },

  /**
   * Writes settings as key/value rows (used by saveSettings and setup).
   * @param {Object} values
   */
  writeSettings(values) {
    const ss = this.spreadsheet();
    const rows = Table.read(ss, 'settings');
    const changed = [];
    const added = [];
    Object.keys(values).forEach((key) => {
      const value = String(values[key]);
      const row = rows.find((r) => r.key === key);
      if (row) {
        row.value = value;
        changed.push(row);
      } else {
        added.push({ key, value, meaning: SETTING_DESCRIPTIONS[key] || '' });
      }
    });
    Table.update(ss, 'settings', changed);
    Table.insertMany(ss, 'settings', added);
    this.invalidate();
  },
};
