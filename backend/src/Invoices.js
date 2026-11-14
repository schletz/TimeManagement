/**
 * Invoicing (chef only): preview, create (with DOCX), list, download, paid status, delete.
 *
 * Status transitions of the billed items (time entries, purchases):
 * create → open→invoiced (invoice id + frozen hourly rate), paid → paid, unpaid → invoiced,
 * delete → open (invoice id and frozen rate cleared).
 */
const Invoices = {
  /** @private */
  dto(inv, positions) {
    const dto = {
      id: inv.id, number: inv.number, kind: inv.kind, date: inv.date, cutoffDate: inv.cutoffDate,
      periodFrom: inv.periodFrom, periodTo: inv.periodTo, status: inv.status, paidAt: inv.paidAt,
      laborTotal: inv.laborTotal, extrasTotal: inv.extrasTotal, materialBase: inv.materialBase,
      markupPercent: inv.markupPercent, markupAmount: inv.markupAmount, netTotal: inv.netTotal,
      hasDocument: !!inv.docxFileId, createdAt: inv.createdAt,
    };
    if (positions) dto.extraItems = positions;
    return dto;
  },

  /**
   * Validates and normalizes extra positions (catalog or free positions).
   * @private
   */
  normalizeExtras(items) {
    return (Array.isArray(items) ? items : []).map((e) => {
      const description = Util.text(e.description, 300);
      const quantity = Util.toNumber(e.quantity);
      const unitPrice = Util.toNumber(e.unitPrice);
      assertValid(description, 'Zusatzposition: Beschreibung fehlt.');
      assertValid(!isNaN(quantity) && quantity !== 0, 'Zusatzposition "' + description + '": ungültige Menge.');
      assertValid(!isNaN(unitPrice) && isFinite(unitPrice), 'Zusatzposition "' + description + '": ungültiger Preis.');
      return { code: Util.text(e.code, 40), description, quantity, unit: Util.text(e.unit, 20), unitPrice: Util.round2(unitPrice) };
    });
  },

  /**
   * Collects open items up to the cutoff date and computes the invoice for the selection.
   * @private
   * @returns {{project: Object, ss: Object, cutoff: string, openTimes: Object[], openPurchases: Object[],
   *           times: Object[], purchases: Object[], extras: Object[], calc: Object}}
   */
  prepare(ctx, p) {
    const project = Projects.requireAccess(ctx, p.projectId);
    const ss = Projects.spreadsheet(project);
    const cutoff = Util.isIsoDate(p.cutoffDate) ? p.cutoffDate : Util.today();
    const openTimes = Table.read(ss, 'timeEntries').filter((t) => t.status === 'open' && t.date <= cutoff);
    const openPurchases = Table.read(ss, 'purchases').filter((x) => x.status === 'open' && x.date <= cutoff);
    const times = Array.isArray(p.timeEntryIds) ? openTimes.filter((t) => p.timeEntryIds.indexOf(t.id) >= 0) : openTimes;
    const purchases = Array.isArray(p.purchaseIds) ? openPurchases.filter((x) => p.purchaseIds.indexOf(x.id) >= 0) : openPurchases;
    const extras = this.normalizeExtras(p.extraItems);
    const rates = {};
    MasterData.employees().forEach((e) => { rates[e.id] = e.hourlyRate; });
    const calc = Calc.invoice({
      timeEntries: times, purchases, extraItems: extras, rates, markupPercent: Projects.markupPercent(project),
    });
    return { project, ss, cutoff, openTimes, openPurchases, times, purchases, extras, calc, rates };
  },

  /**
   * previewInvoice: open items up to the cutoff (candidates), calculation for the selection
   * (default: all candidates), suggested invoice number and catalog.
   * @param {Object} ctx
   * @param {{projectId: string, cutoffDate?: string, timeEntryIds?: string[], purchaseIds?: string[], extraItems?: Object[]}} p
   */
  preview(ctx, p) {
    const prep = this.prepare(ctx, p);
    const year = Number(Util.today().substring(0, 4));
    const numbers = Table.read(MasterData.spreadsheet(), 'invoiceRegister').map((r) => r.number);
    return {
      cutoffDate: prep.cutoff,
      timeEntries: prep.openTimes.map((t) => Object.assign(TimeEntries.dto(ctx, t), { rate: prep.rates[t.employeeId] || 0 }))
        .sort((a, b) => (a.date + a.from).localeCompare(b.date + b.from)),
      purchases: prep.openPurchases.map((x) => Purchases.dto(x)).sort((a, b) => a.date.localeCompare(b.date)),
      calc: prep.calc,
      suggestedNumber: Calc.nextInvoiceNumber(numbers, year),
      defaultKind: prep.project.status === 'active' ? 'partial' : 'final',
      catalog: MasterData.listCatalog(),
    };
  },

  /**
   * createInvoice: marks the selected items as invoiced, stores invoice rows and creates the DOCX.
   * Idempotent: an existing invoice with the same id is returned unchanged.
   * @param {Object} ctx
   * @param {{id: string, projectId: string, cutoffDate: string, number: string, date?: string,
   *          kind?: 'invoice'|'partial'|'final', timeEntryIds: string[], purchaseIds: string[], extraItems: Object[]}} p
   * @returns {{invoice: Object, file: {base64: string, name: string, mimeType: string}}}
   */
  create(ctx, p) {
    const id = Util.text(p.id);
    assertValid(/^[\w-]{8,64}$/.test(id), 'Ungültige ID.');
    const project = Projects.requireAccess(ctx, p.projectId);
    const ss = Projects.spreadsheet(project);
    const existing = Table.find(ss, 'invoices', id);
    if (existing) return { invoice: this.dto(existing), file: existing.docxFileId ? this.file(existing) : null };

    assertValid(Array.isArray(p.timeEntryIds) && Array.isArray(p.purchaseIds), 'Auswahl fehlt.');
    const prep = this.prepare(ctx, p);
    assertValid(prep.times.length === p.timeEntryIds.length && prep.purchases.length === p.purchaseIds.length,
      'Einige gewählte Posten sind nicht mehr offen. Bitte die Vorschau neu laden.');
    assertValid(prep.times.length || prep.purchases.length || prep.extras.length, 'Die Rechnung enthält keine Posten.');

    const number = Util.text(p.number, 30);
    assertValid(/^[\w./-]+$/.test(number), 'Ungültige Rechnungsnummer (erlaubt: Buchstaben, Ziffern, - / . _).');
    const master = MasterData.spreadsheet();
    const register = Table.read(master, 'invoiceRegister');
    assertValid(!register.some((r) => Util.sameText(r.number, number)), 'Die Rechnungsnummer ' + number + ' ist bereits vergeben.');
    const date = Util.isIsoDate(p.date) ? p.date : Util.today();
    const kind = INVOICE_KIND[p.kind] ? p.kind : 'partial';

    const calc = prep.calc;
    const invoice = {
      id, number, kind, date, cutoffDate: prep.cutoff, periodFrom: calc.periodFrom, periodTo: calc.periodTo,
      status: 'created', paidAt: '', laborTotal: calc.laborTotal, extrasTotal: calc.extrasTotal,
      materialBase: calc.materialBase, markupPercent: calc.markupPercent, markupAmount: calc.markupAmount,
      netTotal: calc.netTotal, docxFileId: '', createdAt: Util.now(),
    };

    // Create the document first: if it fails, no data has been changed yet.
    const doc = InvoiceDocument.render({
      project, invoice, calc, timeEntries: prep.times, purchases: prep.purchases, settings: MasterData.settings(),
    });
    invoice.docxFileId = doc.fileId;
    try {
      prep.times.forEach((t) => { t.status = 'invoiced'; t.invoiceId = id; t.rate = prep.rates[t.employeeId] || 0; });
      prep.purchases.forEach((x) => { x.status = 'invoiced'; x.invoiceId = id; });
      Table.update(ss, 'timeEntries', prep.times);
      Table.update(ss, 'purchases', prep.purchases);
      Table.insert(ss, 'invoices', invoice);
      Table.insertMany(ss, 'invoiceItems', calc.extraLines.map((e) => ({
        id: Util.uuid(), invoiceId: id, code: e.code, description: e.description, quantity: e.quantity,
        unit: e.unit, unitPrice: e.unitPrice, total: e.total,
      })));
      Table.insert(master, 'invoiceRegister', { number, invoiceId: id, projectId: project.id, date });
    } catch (err) {
      Storage.trash(doc.fileId);
      throw err;
    }
    return { invoice: this.dto(invoice), file: { base64: Utilities.base64Encode(doc.blob.getBytes()), name: doc.name, mimeType: doc.blob.getContentType() } };
  },

  /** listInvoices: all invoices of a project, newest first, with their extra positions. */
  list(ctx, p) {
    const project = Projects.requireAccess(ctx, p.projectId);
    const ss = Projects.spreadsheet(project);
    const items = Table.read(ss, 'invoiceItems');
    return Table.read(ss, 'invoices')
      .map((inv) => this.dto(inv, items.filter((i) => i.invoiceId === inv.id).map((i) => ({
        code: i.code, description: i.description, quantity: i.quantity, unit: i.unit, unitPrice: i.unitPrice, total: i.total,
      }))))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  /** downloadInvoice: the stored DOCX as base64. */
  download(ctx, p) {
    return this.file(this.findInvoice(ctx, p).invoice);
  },

  /**
   * setInvoicePaid: paid → invoice and its items "paid"; paid=false → back to "created"/"invoiced".
   * @param {Object} ctx
   * @param {{projectId: string, invoiceId: string, paid: boolean, paidAt?: string}} p
   */
  setPaid(ctx, p) {
    const found = this.findInvoice(ctx, p);
    const inv = found.invoice;
    const paid = p.paid !== false;
    if (paid) assertValid(!p.paidAt || Util.isIsoDate(p.paidAt), 'Ungültiges Zahlungsdatum.');
    inv.status = paid ? 'paid' : 'created';
    inv.paidAt = paid ? (p.paidAt || Util.today()) : '';
    const itemStatus = paid ? 'paid' : 'invoiced';
    ['timeEntries', 'purchases'].forEach((table) => {
      const rows = Table.read(found.ss, table).filter((r) => r.invoiceId === inv.id);
      rows.forEach((r) => { r.status = itemStatus; });
      Table.update(found.ss, table, rows);
    });
    Table.update(found.ss, 'invoices', inv);
    return this.dto(inv);
  },

  /**
   * deleteInvoice: items become open again, invoice rows and register entry are removed, DOCX goes to trash.
   * @param {Object} ctx
   * @param {{projectId: string, invoiceId: string}} p
   */
  remove(ctx, p) {
    const found = this.findInvoice(ctx, p, true);
    if (!found) return { deleted: false };
    const inv = found.invoice;
    ['timeEntries', 'purchases'].forEach((table) => {
      const rows = Table.read(found.ss, table).filter((r) => r.invoiceId === inv.id);
      rows.forEach((r) => {
        r.status = 'open';
        r.invoiceId = '';
        if (table === 'timeEntries') r.rate = '';
      });
      Table.update(found.ss, table, rows);
    });
    Table.remove(found.ss, 'invoiceItems', Table.read(found.ss, 'invoiceItems').filter((i) => i.invoiceId === inv.id));
    Table.remove(found.ss, 'invoices', inv);
    const master = MasterData.spreadsheet();
    Table.remove(master, 'invoiceRegister', Table.read(master, 'invoiceRegister').filter((r) => r.invoiceId === inv.id));
    Storage.trash(inv.docxFileId);
    return { deleted: true };
  },

  /** @private */
  findInvoice(ctx, p, allowMissing) {
    const project = Projects.requireAccess(ctx, p.projectId);
    const ss = Projects.spreadsheet(project);
    const invoice = Table.find(ss, 'invoices', Util.text(p.invoiceId));
    if (!invoice) {
      if (allowMissing) return null;
      throw new AppError('NOT_FOUND', 'Rechnung nicht gefunden.');
    }
    return { project, ss, invoice };
  },

  /** @private */
  file(inv) {
    if (!inv.docxFileId) throw new AppError('NOT_FOUND', 'Keine Datei zur Rechnung vorhanden.');
    return Storage.readBase64(inv.docxFileId);
  },
};
