/**
 * Renders an invoice from the Google Doc template and exports it as DOCX into `Rechnungen/`.
 * Placeholder mechanics are documented in InvoiceTemplate.
 */
const InvoiceDocument = {
  /**
   * @param {{project: Object, invoice: Object, calc: Object, timeEntries: Object[], purchases: Object[], settings: Object}} data
   * @returns {{fileId: string, blob: GoogleAppsScript.Base.Blob, name: string}}
   */
  render(data) {
    const name = this.fileName(data.invoice.number, data.project.name);
    const folder = Storage.projectFolder(data.project, 'invoices');
    const copy = DriveApp.getFileById(Config.templateDocId()).makeCopy('tmp ' + name, folder);
    try {
      const doc = DocumentApp.openById(copy.getId());
      const body = doc.getBody();
      const c = data.calc;
      this.applySections(body, {
        extras: c.extraLines.length > 0,
        material: data.purchases.length > 0,
        annex: data.timeEntries.length > 0 || data.purchases.length > 0,
        timeEntries: data.timeEntries.length > 0,
        purchases: data.purchases.length > 0,
      });
      this.expandRows(body, 'labor', c.laborLines.map((l) => ({
        name: l.employeeName, hours: Format.hours(l.hours), rate: Format.money(l.rate), amount: Format.money(l.amount),
      })));
      this.expandRows(body, 'extra', c.extraLines.map((e) => ({
        code: e.code, description: e.description, quantity: Format.number(e.quantity, e.quantity % 1 === 0 ? 0 : 2),
        unit: e.unit, unitPrice: Format.money(e.unitPrice), amount: Format.money(e.total),
      })));
      const times = data.timeEntries.slice().sort((a, b) => (a.date + a.from).localeCompare(b.date + b.from));
      this.expandRows(body, 'time', times.map((t) => ({
        date: Format.date(t.date), employee: t.employeeName, from: t.from, to: t.to, hours: Format.hours(t.hours),
        description: t.description,
      })));
      const purchases = data.purchases.slice().sort((a, b) => a.date.localeCompare(b.date));
      this.expandRows(body, 'purchase', purchases.map((x) => ({
        date: Format.date(x.date), article: x.article, buyer: x.buyerName, receiptNumber: x.receiptNumber || '–',
        amount: Format.money(x.amount),
      })));

      const scalars = this.scalars(data);
      [body, doc.getHeader(), doc.getFooter()].filter(Boolean).forEach((section) => this.replaceAll(section, scalars));
      doc.saveAndClose();

      const blob = Storage.exportDocx(copy.getId(), name);
      const fileId = folder.createFile(blob).getId();
      return { fileId, blob, name };
    } finally {
      copy.setTrashed(true);
    }
  },

  /**
   * File name `Rechnung <Nummer> <Projektname>.docx` without characters that are invalid in file systems.
   * @param {string} number
   * @param {string} projectName
   * @returns {string}
   */
  fileName(number, projectName) {
    return ('Rechnung ' + number + ' ' + projectName).replace(/[\\/:*?"<>|]+/g, '-') + '.docx';
  },

  /** @private */
  scalars(data) {
    const inv = data.invoice;
    const c = data.calc;
    const p = data.project;
    return {
      invoiceTitle: INVOICE_KIND[inv.kind] || 'Rechnung',
      invoiceNumber: inv.number,
      invoiceDate: Format.date(inv.date),
      cutoffDate: Format.date(inv.cutoffDate),
      servicePeriod: Format.period(c.periodFrom, c.periodTo) || Format.date(inv.date),
      client: p.client || '',
      projectName: p.name,
      siteAddress: p.address || '',
      siteManager: p.siteManager || '',
      totalHours: Format.hours(c.totalHours),
      laborTotal: Format.money(c.laborTotal),
      extrasTotal: Format.money(c.extrasTotal),
      materialBase: Format.money(c.materialBase),
      markupPercent: Format.number(c.markupPercent, c.markupPercent % 1 === 0 ? 0 : 2),
      markupAmount: Format.money(c.markupAmount),
      materialTotal: Format.money(c.materialTotal),
      netTotal: Format.money(c.netTotal),
      vatPercent: Format.number(c.vatPercent, 0),
      vatAmount: Format.money(c.vatAmount),
      grossTotal: Format.money(c.grossTotal),
      reverseChargeText: data.settings.reverseChargeText || '',
    };
  },

  /**
   * Removes empty sections (`{{#name}}` … `{{/name}}`) and all marker paragraphs.
   * @param {GoogleAppsScript.Document.Body} body
   * @param {Object<string, boolean>} visible section name → keep content
   */
  applySections(body, visible) {
    Object.keys(visible).forEach((name) => {
      const start = this.findMarker(body, '{{#' + name + '}}');
      const end = this.findMarker(body, '{{/' + name + '}}');
      if (start < 0 || end < start) return;
      if (visible[name]) {
        body.getChild(end).removeFromParent();
        body.getChild(start).removeFromParent();
      } else {
        for (let i = end; i >= start; i--) body.getChild(i).removeFromParent();
      }
    });
  },

  /** @private Index of the body child paragraph whose text equals the marker, or -1. */
  findMarker(body, marker) {
    for (let i = 0; i < body.getNumChildren(); i++) {
      const child = body.getChild(i);
      if (child.getType() === DocumentApp.ElementType.PARAGRAPH && child.asParagraph().getText().trim() === marker) return i;
    }
    return -1;
  },

  /**
   * Duplicates the template row (containing `{{prefix.`) of every table once per item and removes the template row.
   * @param {GoogleAppsScript.Document.Body} body
   * @param {string} prefix
   * @param {Object[]} items field values (already formatted)
   */
  expandRows(body, prefix, items) {
    const token = '{{' + prefix + '.';
    for (let i = 0; i < body.getNumChildren(); i++) {
      const child = body.getChild(i);
      if (child.getType() !== DocumentApp.ElementType.TABLE) continue;
      const table = child.asTable();
      for (let r = 0; r < table.getNumRows(); r++) {
        const templateRow = table.getRow(r);
        if (templateRow.getText().indexOf(token) < 0) continue;
        items.forEach((item, n) => {
          const row = table.insertTableRow(r + 1 + n, templateRow.copy());
          const values = {};
          Object.keys(item).forEach((k) => { values[prefix + '.' + k] = item[k]; });
          this.replaceAll(row, values);
        });
        templateRow.removeFromParent();
        r += items.length - 1;
      }
    }
  },

  /**
   * Replaces `{{key}}` placeholders literally (no regex replacement semantics) while keeping formatting.
   * @param {GoogleAppsScript.Document.ContainerElement} container body, header, footer or table row
   * @param {Object<string, string>} values
   */
  replaceAll(container, values) {
    Object.keys(values).forEach((key) => {
      const pattern = '\\{\\{' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\}\\}';
      // Line breaks and placeholder braces in user data would break the layout or loop forever.
      const value = String(values[key] === null || values[key] === undefined ? '' : values[key])
        .replace(/[\r\n]+/g, ' ').replace(/\{\{/g, '{ {');
      let found = container.findText(pattern);
      while (found) {
        const text = found.getElement().asText();
        const start = found.getStartOffset();
        const end = found.getEndOffsetInclusive();
        if (value) {
          text.insertText(start, value);
          text.deleteText(start + value.length, end + value.length);
        } else {
          text.deleteText(start, end);
        }
        found = container.findText(pattern);
      }
    });
  },
};
