/**
 * Material demand reports of a project (sheet "Materialbedarf"), with e-mail notification to the chef.
 */
const Demands = {
  /** @private */
  dto(d) {
    return {
      id: d.id, date: d.date, reporterId: d.reporterId, reporterName: d.reporterName, material: d.material,
      quantity: d.quantity, unit: d.unit, urgency: d.urgency, note: d.note, hasPhoto: !!d.photoFileId,
      status: d.status, updatedBy: d.updatedBy, updatedAt: d.updatedAt,
    };
  },

  /** listDemands: all demands of the project, visible for everybody with project access. */
  list(ctx, p) {
    const project = Projects.requireAccess(ctx, p.projectId);
    return Table.read(Projects.spreadsheet(project), 'demands')
      .map((d) => this.dto(d))
      .sort((a, b) => (b.date + b.updatedAt).localeCompare(a.date + a.updatedAt));
  },

  /**
   * saveDemand: creates a new demand report (idempotent by id) and notifies the chef by e-mail.
   * @param {Object} ctx
   * @param {{id: string, projectId: string, material: string, quantity: number, unit: string,
   *          urgency: 'normal'|'urgent', note?: string, photoBase64?: string}} p
   */
  save(ctx, p) {
    const project = Projects.requireAccess(ctx, p.projectId);
    const id = Util.text(p.id);
    assertValid(/^[\w-]{8,64}$/.test(id), 'Ungültige ID.');
    const material = Util.text(p.material, 300);
    assertValid(material, 'Material fehlt.');
    const quantity = Util.toNumber(p.quantity);
    assertValid(!isNaN(quantity) && quantity > 0, 'Ungültige Menge.');

    const ss = Projects.spreadsheet(project);
    const existing = Table.find(ss, 'demands', id);
    if (existing) return this.dto(existing);

    const photoFileId = p.photoBase64
      ? Storage.saveJpeg(Storage.projectFolder(project, 'photos'), 'Bedarf_' + id + '.jpg', p.photoBase64)
      : '';
    const row = {
      id, date: Util.today(), reporterId: ctx.user.employeeId, reporterName: ctx.user.name, material, quantity,
      unit: Util.text(p.unit, 20), urgency: p.urgency === 'urgent' ? 'urgent' : 'normal', note: Util.text(p.note, 1000),
      photoFileId, status: 'open', updatedBy: ctx.user.name, updatedAt: Util.now(),
    };
    Table.insert(ss, 'demands', row);
    this.notifyChef(project, row);
    return this.dto(row);
  },

  /**
   * setDemandStatus: chef may set any status; employees may only set their own reports to "done".
   * @param {Object} ctx
   * @param {{projectId: string, id: string, status: 'open'|'ordered'|'done'}} p
   */
  setStatus(ctx, p) {
    const project = Projects.requireAccess(ctx, p.projectId);
    assertValid(Object.keys(DEMAND_STATUS).indexOf(p.status) >= 0, 'Ungültiger Status.');
    const ss = Projects.spreadsheet(project);
    const row = Table.find(ss, 'demands', Util.text(p.id));
    if (!row) throw new AppError('NOT_FOUND', 'Meldung nicht gefunden.');
    if (!ctx.isChef && !(p.status === 'done' && row.reporterId && row.reporterId === ctx.user.employeeId)) {
      throw new AppError('FORBIDDEN', 'Nur eigene Meldungen können als erledigt markiert werden.');
    }
    row.status = p.status;
    row.updatedBy = ctx.user.name;
    row.updatedAt = Util.now();
    Table.update(ss, 'demands', row);
    return this.dto(row);
  },

  /** @private Sends the notification; failures must not break saving. */
  notifyChef(project, d) {
    const to = MasterData.settings().chefEmail;
    if (!to) return;
    try {
      const urgent = d.urgency === 'urgent';
      MailApp.sendEmail({
        to,
        subject: (urgent ? '[DRINGEND] ' : '') + 'Materialbedarf: ' + d.material + ' – ' + project.name,
        body: [
          'Neue Materialbedarf-Meldung',
          '',
          'Projekt: ' + project.name,
          'Material: ' + d.material,
          'Menge: ' + Format.number(d.quantity, d.quantity % 1 === 0 ? 0 : 2) + ' ' + d.unit,
          'Dringlichkeit: ' + URGENCY[d.urgency],
          'Gemeldet von: ' + d.reporterName,
          d.note ? 'Notiz: ' + d.note : '',
          d.photoFileId ? 'Foto: in der App ansehen' : '',
        ].filter((line, i) => i === 1 || line).join('\n'),
      });
    } catch (err) {
      console.error('Demand mail failed: ' + err.message);
    }
  },
};
