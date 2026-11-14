/**
 * Time entries of a project (sheet "Zeiten").
 */
const TimeEntries = {
  /**
   * DTO; the frozen hourly rate is only visible to the chef.
   * @param {Object} ctx
   * @param {Object} t row
   * @returns {Object}
   */
  dto(ctx, t) {
    const dto = {
      id: t.id, date: t.date, employeeId: t.employeeId, employeeName: t.employeeName,
      from: t.from, to: t.to, hours: t.hours, description: t.description,
      status: t.status, invoiceId: t.invoiceId, createdAt: t.createdAt, updatedAt: t.updatedAt,
    };
    if (ctx.isChef) dto.rate = t.rate;
    return dto;
  },

  /** listTimeEntries: employees see only their own entries. */
  list(ctx, p) {
    const project = Projects.requireAccess(ctx, p.projectId);
    return Table.read(Projects.spreadsheet(project), 'timeEntries')
      .filter((t) => ctx.isChef || t.employeeId === ctx.user.employeeId)
      .map((t) => this.dto(ctx, t))
      .sort((a, b) => (b.date + b.from).localeCompare(a.date + a.from));
  },

  /**
   * saveTimeEntry: create (new id) or update. Overlaps with other entries of the same employee
   * on the same day in this project require `confirmOverlap: true`.
   * @param {Object} ctx
   * @param {{id: string, projectId: string, employeeId?: string, date: string, from: string, to: string,
   *          description: string, confirmOverlap?: boolean}} p
   */
  save(ctx, p) {
    const project = Projects.requireAccess(ctx, p.projectId);
    const id = Util.text(p.id);
    assertValid(id, 'ID fehlt.');
    assertValid(Util.isIsoDate(p.date), 'Ungültiges Datum.');
    assertValid(p.date <= Util.today(), 'Das Datum darf nicht in der Zukunft liegen.');
    assertValid(Util.isTime(p.from) && Util.isTime(p.to), 'Ungültige Uhrzeit.');
    assertValid(Util.toMinutes(p.to) > Util.toMinutes(p.from), '"Bis" muss nach "Von" liegen.');
    const description = Util.text(p.description, 500);
    assertValid(description, 'Kurzbeschreibung fehlt.');

    const ss = Projects.spreadsheet(project);
    const rows = Table.read(ss, 'timeEntries');
    const existing = rows.find((r) => r.id === id);
    let employee;
    if (existing) {
      Access.assertEditable(ctx, existing, existing.employeeId);
      // Only the chef may move an entry to another employee.
      employee = ctx.isChef && p.employeeId
        ? Access.targetEmployee(ctx, p.employeeId)
        : (MasterData.employeeById(existing.employeeId) || { id: existing.employeeId, name: existing.employeeName });
    } else {
      employee = Access.targetEmployee(ctx, p.employeeId);
    }

    if (!p.confirmOverlap) {
      const clash = rows.find((r) => r.id !== id && r.employeeId === employee.id && r.date === p.date
        && Calc.overlaps(r, { from: p.from, to: p.to }));
      if (clash) {
        throw new AppError('CONFIRM_REQUIRED',
          'Überschneidung mit dem Eintrag ' + clash.from + '–' + clash.to + ' (' + clash.description + '). Trotzdem speichern?');
      }
    }

    const now = Util.now();
    const values = {
      date: p.date, employeeId: employee.id, employeeName: employee.name, from: p.from, to: p.to,
      hours: Calc.hours(p.from, p.to), description, updatedAt: now,
    };
    let row;
    if (existing) {
      row = Object.assign(existing, values);
      Table.update(ss, 'timeEntries', row);
    } else {
      row = Object.assign({ id, status: 'open', invoiceId: '', rate: '', createdBy: ctx.user.email, createdAt: now }, values);
      Table.insert(ss, 'timeEntries', row);
    }
    return this.dto(ctx, row);
  },

  /** deleteTimeEntry: idempotent (missing entries are ignored). */
  remove(ctx, p) {
    const project = Projects.requireAccess(ctx, p.projectId);
    const ss = Projects.spreadsheet(project);
    const row = Table.find(ss, 'timeEntries', Util.text(p.id));
    if (!row) return { deleted: false };
    Access.assertEditable(ctx, row, row.employeeId);
    Table.remove(ss, 'timeEntries', row);
    return { deleted: true };
  },
};
