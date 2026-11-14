/**
 * Projects (construction sites): master data, storage creation, close/reopen and access checks.
 */
const Projects = {
  /** @returns {Object[]} all project rows of the master spreadsheet */
  all() {
    return RequestCache.get('projects', () => Table.read(MasterData.spreadsheet(), 'projects'));
  },

  /**
   * @param {string} id
   * @returns {Object|null}
   */
  byId(id) {
    return this.all().find((p) => p.id === id) || null;
  },

  /**
   * Loads a project and checks that the user may access it. Employees only see active projects.
   * @param {Object} ctx request context
   * @param {string} projectId
   * @returns {Object} project row
   */
  requireAccess(ctx, projectId) {
    const project = this.byId(Util.text(projectId));
    if (!project) throw new AppError('NOT_FOUND', 'Projekt nicht gefunden.');
    if (!ctx.isChef && project.status !== 'active') {
      throw new AppError('PROJECT_CLOSED', 'Das Projekt ist abgeschlossen.');
    }
    return project;
  },

  /**
   * @param {Object} project
   * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
   */
  spreadsheet(project) {
    return RequestCache.spreadsheet(project.sheetId);
  },

  /**
   * Effective material markup: project override or default from settings.
   * @param {Object} project
   * @returns {number}
   */
  markupPercent(project) {
    return project.markupPercent === null || project.markupPercent === undefined
      ? Number(MasterData.settings().materialMarkupPercent) || 0
      : project.markupPercent;
  },

  /**
   * DTO for the frontend; employees get only the fields they need.
   * @param {Object} ctx
   * @param {Object} p project row
   * @returns {Object}
   */
  dto(ctx, p) {
    const base = { id: p.id, name: p.name, client: p.client, address: p.address, siteManager: p.siteManager, status: p.status };
    if (!ctx.isChef) return base;
    return Object.assign(base, {
      markupPercent: p.markupPercent,
      effectiveMarkupPercent: this.markupPercent(p),
      createdAt: p.createdAt,
      closedAt: p.closedAt,
    });
  },

  // ---------------- API handlers ----------------

  /** listProjects: employees see active projects, the chef sees all. */
  list(ctx) {
    return this.all()
      .filter((p) => ctx.isChef || p.status === 'active')
      .map((p) => this.dto(ctx, p))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  },

  /** getProject */
  get(ctx, p) {
    return this.dto(ctx, this.requireAccess(ctx, p.projectId));
  },

  /**
   * saveProject (chef): creates folder structure and project spreadsheet for new projects,
   * renames folder and spreadsheet when the name changes.
   * @param {Object} ctx
   * @param {{id: string, name: string, client: string, address: string, siteManager: string, markupPercent: ?number}} p
   */
  save(ctx, p) {
    const id = Util.text(p.id) || Util.uuid();
    const name = Util.text(p.name, 100);
    assertValid(name, 'Projektname fehlt.');
    assertValid(!/[\\/]/.test(name), 'Der Projektname darf keine Schrägstriche enthalten.');
    let markup = null;
    if (p.markupPercent !== null && p.markupPercent !== undefined && String(p.markupPercent).trim() !== '') {
      markup = Util.toNumber(p.markupPercent);
      assertValid(!isNaN(markup) && markup >= 0 && markup <= 1000, 'Ungültiger Materialaufschlag.');
    }
    const ss = MasterData.spreadsheet();
    const rows = Table.read(ss, 'projects');
    assertValid(!rows.some((r) => r.id !== id && Util.sameText(r.name, name)), 'Ein Projekt mit diesem Namen existiert bereits.');
    const values = {
      name,
      client: Util.text(p.client, 200),
      address: Util.text(p.address, 300),
      siteManager: Util.text(p.siteManager, 100),
      markupPercent: markup,
    };

    const existing = rows.find((r) => r.id === id);
    let row;
    if (existing) {
      if (existing.name !== name) this.renameStorage(existing, name);
      row = Object.assign(existing, values);
      Table.update(ss, 'projects', row);
    } else {
      const storage = this.createStorage(name);
      row = Object.assign({ id }, values, {
        status: 'active', folderId: storage.folderId, sheetId: storage.sheetId, createdAt: Util.now(), closedAt: '',
      });
      Table.insert(ss, 'projects', row);
    }
    RequestCache.remove('projects');
    return this.dto(ctx, row);
  },

  /**
   * closeProject (chef). Open items need a confirmation (`confirm: true`).
   * @param {Object} ctx
   * @param {{projectId: string, confirm?: boolean}} p
   */
  close(ctx, p) {
    const project = this.requireAccess(ctx, p.projectId);
    if (!p.confirm) {
      const open = this.openItems(project);
      if (open.hoursCount || open.purchasesCount) {
        throw new AppError('CONFIRM_REQUIRED',
          'Es gibt noch offene Posten: ' + open.hoursCount + ' Zeiteinträge (' + Format.hours(open.hours) + ' h) und '
          + open.purchasesCount + ' Materialkäufe (' + Format.money(open.purchasesAmount) + '). Trotzdem abschließen?',
          open);
      }
    }
    return this.setStatus(ctx, project, 'closed');
  },

  /** reopenProject (chef) */
  reopen(ctx, p) {
    return this.setStatus(ctx, this.requireAccess(ctx, p.projectId), 'active');
  },

  /**
   * Counts open (not invoiced) hours and purchases of a project.
   * @param {Object} project
   * @returns {{hoursCount: number, hours: number, purchasesCount: number, purchasesAmount: number}}
   */
  openItems(project) {
    const ss = this.spreadsheet(project);
    const hours = Table.read(ss, 'timeEntries').filter((t) => t.status === 'open');
    const purchases = Table.read(ss, 'purchases').filter((x) => x.status === 'open');
    return {
      hoursCount: hours.length,
      hours: hours.reduce((s, t) => s + (t.hours || 0), 0),
      purchasesCount: purchases.length,
      purchasesAmount: Util.round2(purchases.reduce((s, x) => s + (x.amount || 0), 0)),
    };
  },

  /** @private */
  setStatus(ctx, project, status) {
    project.status = status;
    project.closedAt = status === 'closed' ? Util.now() : '';
    Table.update(MasterData.spreadsheet(), 'projects', project);
    return this.dto(ctx, project);
  },

  /**
   * Creates `Projekte/<name>/` with subfolders and the project spreadsheet.
   * @param {string} name
   * @returns {{folderId: string, sheetId: string}}
   */
  createStorage(name) {
    const folder = Storage.projectsFolder().createFolder(name);
    Object.keys(Config.PROJECT_SUBFOLDERS).forEach((k) => folder.createFolder(Config.PROJECT_SUBFOLDERS[k]));
    const ss = SpreadsheetApp.create(name + ' – Daten');
    ss.setSpreadsheetTimeZone(Config.TIME_ZONE);
    PROJECT_TABLES.forEach((t) => Table.ensureSheet(ss, t));
    const names = PROJECT_TABLES.map((t) => SCHEMA[t].sheet);
    ss.getSheets().filter((s) => names.indexOf(s.getName()) < 0).forEach((s) => ss.deleteSheet(s));
    Storage.moveTo(ss.getId(), folder);
    return { folderId: folder.getId(), sheetId: ss.getId() };
  },

  /** @private */
  renameStorage(project, name) {
    DriveApp.getFolderById(project.folderId).setName(name);
    DriveApp.getFileById(project.sheetId).setName(name + ' – Daten');
  },
};
