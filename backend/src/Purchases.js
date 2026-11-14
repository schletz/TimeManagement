/**
 * Material purchases of a project (sheet "Materialkäufe"), receipts and reimbursements.
 */
const Purchases = {
  /** @private */
  dto(t, project) {
    const dto = {
      id: t.id, date: t.date, buyerId: t.buyerId, buyerName: t.buyerName, article: t.article, amount: t.amount,
      source: t.source, cashRegisterId: t.cashRegisterId, receiptNumber: t.receiptNumber,
      hasReceipt: !!t.receiptFileId, receiptFileId: t.receiptFileId,
      status: t.status, invoiceId: t.invoiceId, reimbursed: t.reimbursed, reimbursedAt: t.reimbursedAt,
      createdAt: t.createdAt, updatedAt: t.updatedAt,
    };
    if (project) {
      dto.projectId = project.id;
      dto.projectName = project.name;
    }
    return dto;
  },

  /** listPurchases: employees see only their own purchases. */
  list(ctx, p) {
    const project = Projects.requireAccess(ctx, p.projectId);
    return Table.read(Projects.spreadsheet(project), 'purchases')
      .filter((x) => ctx.isChef || x.buyerId === ctx.user.employeeId)
      .map((x) => this.dto(x))
      .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  },

  /**
   * savePurchase: create or update an open purchase. The reimbursement status is set via setReimbursed.
   * @param {Object} ctx
   * @param {{id: string, projectId: string, buyerId?: string, date: string, article: string, amount: number,
   *          source: 'qr'|'manual', cashRegisterId?: string, receiptNumber?: string, receiptFileId?: string}} p
   */
  save(ctx, p) {
    const project = Projects.requireAccess(ctx, p.projectId);
    const id = Util.text(p.id);
    assertValid(id, 'ID fehlt.');
    assertValid(Util.isIsoDate(p.date), 'Ungültiges Datum.');
    assertValid(p.date <= Util.today(), 'Das Datum darf nicht in der Zukunft liegen.');
    const article = Util.text(p.article, 300);
    assertValid(article, 'Artikel / Beschreibung fehlt.');
    const amount = Util.toNumber(p.amount);
    assertValid(!isNaN(amount) && amount > 0 && amount < 1000000, 'Der Betrag muss größer als 0 sein.');
    const receiptFileId = Util.text(p.receiptFileId);
    if (receiptFileId) {
      assertValid(Storage.isInFolder(receiptFileId, Storage.projectFolder(project, 'receipts')), 'Ungültiger Beleg.');
    }

    const ss = Projects.spreadsheet(project);
    const existing = Table.find(ss, 'purchases', id);
    let buyer;
    if (existing) {
      Access.assertEditable(ctx, existing, existing.buyerId);
      buyer = ctx.isChef && p.buyerId
        ? Access.targetEmployee(ctx, p.buyerId)
        : (MasterData.employeeById(existing.buyerId) || { id: existing.buyerId, name: existing.buyerName });
    } else {
      buyer = Access.targetEmployee(ctx, p.buyerId);
    }

    const now = Util.now();
    const values = {
      date: p.date, buyerId: buyer.id, buyerName: buyer.name, article, amount: Util.round2(amount),
      source: p.source === 'qr' ? 'qr' : 'manual',
      cashRegisterId: Util.text(p.cashRegisterId, 100), receiptNumber: Util.text(p.receiptNumber, 100),
      receiptFileId, updatedAt: now,
    };
    let row;
    if (existing) {
      if (existing.receiptFileId && existing.receiptFileId !== receiptFileId) Storage.trash(existing.receiptFileId);
      row = Object.assign(existing, values);
      Table.update(ss, 'purchases', row);
    } else {
      row = Object.assign({
        id, status: 'open', invoiceId: '', reimbursed: false, reimbursedAt: '', createdBy: ctx.user.email, createdAt: now,
      }, values);
      Table.insert(ss, 'purchases', row);
    }
    return this.dto(row);
  },

  /** deletePurchase: also trashes the receipt image. */
  remove(ctx, p) {
    const project = Projects.requireAccess(ctx, p.projectId);
    const ss = Projects.spreadsheet(project);
    const row = Table.find(ss, 'purchases', Util.text(p.id));
    if (!row) return { deleted: false };
    Access.assertEditable(ctx, row, row.buyerId);
    Table.remove(ss, 'purchases', row);
    Storage.trash(row.receiptFileId);
    return { deleted: true };
  },

  /**
   * uploadReceipt: stores a receipt JPEG in `Belege/`. Idempotent via the client generated id.
   * @param {Object} ctx
   * @param {{projectId: string, id: string, base64: string}} p
   * @returns {{fileId: string}}
   */
  uploadReceipt(ctx, p) {
    const project = Projects.requireAccess(ctx, p.projectId);
    const id = Util.text(p.id);
    assertValid(/^[\w-]{8,64}$/.test(id), 'Ungültige ID.');
    const fileId = Storage.saveJpeg(Storage.projectFolder(project, 'receipts'), 'Beleg_' + id + '.jpg', p.base64);
    return { fileId };
  },

  /**
   * getReceipt: receipt image of a purchase; employees only for their own purchases.
   * @param {Object} ctx
   * @param {{projectId: string, purchaseId: string}} p
   */
  getReceipt(ctx, p) {
    const project = Projects.requireAccess(ctx, p.projectId);
    const row = Table.find(Projects.spreadsheet(project), 'purchases', Util.text(p.purchaseId));
    if (!row || !row.receiptFileId) throw new AppError('NOT_FOUND', 'Kein Beleg vorhanden.');
    Access.assertOwner(ctx, row.buyerId);
    return Storage.readBase64(row.receiptFileId);
  },

  /**
   * setReimbursed (chef): marks purchases as reimbursed (or not).
   * Either `projectId` + `ids`, or `employeeId` alone for "all open reimbursements of employee X" across all projects.
   * @param {Object} ctx
   * @param {{projectId?: string, ids?: string[], employeeId?: string, reimbursed?: boolean, date?: string}} p
   * @returns {{count: number}}
   */
  setReimbursed(ctx, p) {
    const reimbursed = p.reimbursed !== false;
    const date = reimbursed ? (Util.isIsoDate(p.date) ? p.date : Util.today()) : '';
    let count = 0;
    if (p.projectId) {
      const project = Projects.requireAccess(ctx, p.projectId);
      const ids = Array.isArray(p.ids) ? p.ids : [];
      const ss = Projects.spreadsheet(project);
      const rows = Table.read(ss, 'purchases').filter((r) => ids.indexOf(r.id) >= 0);
      rows.forEach((r) => { r.reimbursed = reimbursed; r.reimbursedAt = date; });
      Table.update(ss, 'purchases', rows);
      count = rows.length;
    } else {
      const employeeId = Util.text(p.employeeId);
      assertValid(employeeId, 'Mitarbeiter fehlt.');
      Projects.all().forEach((project) => {
        const ss = Projects.spreadsheet(project);
        const rows = Table.read(ss, 'purchases').filter((r) => r.buyerId === employeeId && !r.reimbursed);
        rows.forEach((r) => { r.reimbursed = true; r.reimbursedAt = date || Util.today(); });
        Table.update(ss, 'purchases', rows);
        count += rows.length;
      });
    }
    return { count };
  },

  /**
   * listMyReimbursements: own purchases over all projects (also closed ones) with reimbursement status.
   * The chef may pass `employeeId` to see the list of another employee.
   */
  listMyReimbursements(ctx, p) {
    const employeeId = ctx.isChef && p && p.employeeId ? p.employeeId : ctx.user.employeeId;
    if (!employeeId) return [];
    const result = [];
    Projects.all().forEach((project) => {
      Table.read(Projects.spreadsheet(project), 'purchases')
        .filter((r) => r.buyerId === employeeId)
        .forEach((r) => result.push(this.dto(r, project)));
    });
    return result.sort((a, b) => b.date.localeCompare(a.date));
  },
};
