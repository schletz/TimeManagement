/**
 * Creates the invoice template as Google Doc ("Rechnungsvorlage") from code, so the layout is versioned
 * and reproducible. After creation the chef edits company data, bank details and layout directly in the
 * Google Doc; the placeholders must be kept.
 *
 * Placeholder mechanics (implemented in InvoiceDocument):
 * - Scalars `{{name}}` anywhere in header, body and footer, e.g. {{invoiceNumber}}, {{invoiceDate}},
 *   {{invoiceTitle}}, {{servicePeriod}}, {{cutoffDate}}, {{client}}, {{projectName}}, {{siteAddress}},
 *   {{siteManager}}, {{totalHours}}, {{laborTotal}}, {{extrasTotal}}, {{materialBase}}, {{markupPercent}},
 *   {{markupAmount}}, {{materialTotal}}, {{netTotal}}, {{vatPercent}}, {{vatAmount}}, {{grossTotal}},
 *   {{reverseChargeText}}.
 * - Repeated table rows: a table row containing `{{<prefix>.<field>}}` is the template row; it is copied
 *   once per item and then removed. Prefixes and fields:
 *   labor.name/hours/rate/amount, extra.code/description/quantity/unit/unitPrice/amount,
 *   time.date/employee/from/to/hours/description, purchase.date/article/buyer/receiptNumber/amount.
 * - Optional sections: everything between paragraphs `{{#name}}` and `{{/name}}` is removed when the section
 *   is empty; the marker paragraphs are always removed. Sections: extras, material, annex, timeEntries, purchases.
 */
const InvoiceTemplate = {
  NAME: 'Rechnungsvorlage',
  COLORS: { accent: '#1f4e79', headerFill: '#dce6f2', border: '#a6a6a6', muted: '#595959', placeholder: '#fff2cc' },

  /**
   * Builds the template document in the given folder.
   * @param {GoogleAppsScript.Drive.Folder} folder
   * @returns {string} document id
   */
  create(folder) {
    const doc = DocumentApp.create(this.NAME);
    const body = doc.getBody();
    body.setMarginTop(42).setMarginBottom(42).setMarginLeft(56).setMarginRight(48);
    const base = {};
    base[DocumentApp.Attribute.FONT_FAMILY] = 'Arial';
    base[DocumentApp.Attribute.FONT_SIZE] = 10;
    body.setAttributes(base);

    this.buildHeader(doc);
    this.buildAddressAndTitle(body);
    this.buildPositions(body);
    this.buildTotals(body);
    this.buildAnnex(body);

    // The new document starts with one empty paragraph; drop it now that other content exists.
    body.getChild(0).removeFromParent();
    doc.saveAndClose();
    DriveApp.getFileById(doc.getId()).moveTo(folder);
    return doc.getId();
  },

  /** @private Company data as document header (fixed text maintained by the chef). */
  buildHeader(doc) {
    const header = doc.addHeader();
    const paragraphs = header.getParagraphs();
    const first = paragraphs.length ? paragraphs[0] : header.appendParagraph('');
    first.setText('Muster Elektrotechnik GmbH');
    first.editAsText().setBold(true).setFontSize(14).setForegroundColor(this.COLORS.accent);
    const line = header.appendParagraph('Musterstraße 1 · 1010 Wien · UID: ATU00000000 · Tel. +43 1 000 00 00 · office@example.at');
    line.editAsText().setBold(false).setFontSize(8).setForegroundColor(this.COLORS.muted);
    line.setSpacingAfter(6);
    this.markPlaceholder(first);
    this.markPlaceholder(line);
  },

  /** @private Recipient, title and invoice/project data. */
  buildAddressAndTitle(body) {
    this.para(body, '{{client}}').editAsText().setBold(true);
    this.markPlaceholder(this.para(body, '[Anschrift des Kunden]'));
    this.markPlaceholder(this.para(body, 'UID: [UID des Kunden]'));
    this.para(body, '');
    const title = this.para(body, '{{invoiceTitle}} Nr. {{invoiceNumber}}');
    title.setHeading(DocumentApp.ParagraphHeading.HEADING1);
    title.editAsText().setFontSize(16).setBold(true).setForegroundColor(this.COLORS.accent);
    const info = body.appendTable([
      ['Rechnungsdatum', '{{invoiceDate}}', 'Projekt / Bauvorhaben', '{{projectName}}'],
      ['Leistungszeitraum', '{{servicePeriod}}', 'Baustellenadresse', '{{siteAddress}}'],
      ['Abrechnungsstichtag', '{{cutoffDate}}', 'Bauleiter', '{{siteManager}}'],
    ]);
    this.styleTable(info, { widths: [95, 120, 120, 156], header: false, borders: false, labelCols: [0, 2] });
  },

  /** @private Labor, extra positions and material. */
  buildPositions(body) {
    this.heading(body, 'Arbeitsleistung');
    const labor = body.appendTable([
      ['Mitarbeiter', 'Stunden', 'Stundensatz', 'Betrag'],
      ['{{labor.name}}', '{{labor.hours}} h', '{{labor.rate}}', '{{labor.amount}}'],
      ['Summe Arbeit', '{{totalHours}} h', '', '{{laborTotal}}'],
    ]);
    this.styleTable(labor, { widths: [211, 80, 100, 100], rightCols: [1, 2, 3], totalRow: true });

    this.marker(body, '{{#extras}}');
    this.heading(body, 'Zusatzleistungen');
    const extras = body.appendTable([
      ['Beschreibung', 'Menge', 'Einheit', 'Einzelpreis', 'Betrag'],
      ['{{extra.description}}', '{{extra.quantity}}', '{{extra.unit}}', '{{extra.unitPrice}}', '{{extra.amount}}'],
      ['Summe Zusatzleistungen', '', '', '', '{{extrasTotal}}'],
    ]);
    this.styleTable(extras, { widths: [196, 55, 55, 85, 100], rightCols: [1, 3, 4], totalRow: true });
    this.marker(body, '{{/extras}}');

    this.marker(body, '{{#material}}');
    this.heading(body, 'Material und Zukäufe');
    const material = body.appendTable([
      ['Position', 'Betrag'],
      ['Material und Zukäufe lt. Materialnachweis', '{{materialBase}}'],
      ['Materialaufschlag {{markupPercent}} %', '{{markupAmount}}'],
      ['Summe Material', '{{materialTotal}}'],
    ]);
    this.styleTable(material, { widths: [391, 100], rightCols: [1], totalRow: true });
    this.marker(body, '{{/material}}');
  },

  /** @private Totals, tax note and payment information. */
  buildTotals(body) {
    this.heading(body, 'Zusammenfassung');
    const totals = body.appendTable([
      ['Summe Arbeit', '{{laborTotal}}'],
      ['Summe Zusatzleistungen', '{{extrasTotal}}'],
      ['Summe Material', '{{materialTotal}}'],
      ['Gesamt netto', '{{netTotal}}'],
      ['Umsatzsteuer {{vatPercent}} %', '{{vatAmount}}'],
      ['Gesamtbetrag', '{{grossTotal}}'],
    ]);
    this.styleTable(totals, { widths: [391, 100], rightCols: [1], header: false, totalRow: true });
    const note = this.para(body, '{{reverseChargeText}}');
    note.setSpacingBefore(8);
    note.editAsText().setItalic(true);
    this.para(body, '').setSpacingAfter(4);
    this.para(body, 'Zahlungsinformation').editAsText().setBold(true);
    this.markPlaceholder(this.para(body, 'Zahlbar innerhalb von 14 Tagen ab Rechnungsdatum ohne Abzug.'));
    this.markPlaceholder(this.para(body, 'Bank: [Bankname] · IBAN: AT00 0000 0000 0000 0000 · BIC: [BIC]'));
    this.para(body, '');
    this.para(body, 'Vielen Dank für Ihren Auftrag!');
  },

  /** @private Annex with time sheet and material evidence on a new page. */
  buildAnnex(body) {
    this.marker(body, '{{#annex}}');
    body.appendPageBreak();
    this.marker(body, '{{#timeEntries}}');
    this.heading(body, 'Anhang: Stundennachweis');
    const times = body.appendTable([
      ['Datum', 'Mitarbeiter', 'Von–Bis', 'Std.', 'Tätigkeit'],
      ['{{time.date}}', '{{time.employee}}', '{{time.from}}–{{time.to}}', '{{time.hours}}', '{{time.description}}'],
      ['Summe', '', '', '{{totalHours}}', ''],
    ]);
    this.styleTable(times, { widths: [62, 95, 70, 40, 224], rightCols: [3], totalRow: true, small: true });
    this.marker(body, '{{/timeEntries}}');
    this.marker(body, '{{#purchases}}');
    this.heading(body, 'Anhang: Materialnachweis');
    const purchases = body.appendTable([
      ['Datum', 'Artikel', 'Gekauft von', 'Beleg-Nr.', 'Betrag'],
      ['{{purchase.date}}', '{{purchase.article}}', '{{purchase.buyer}}', '{{purchase.receiptNumber}}', '{{purchase.amount}}'],
      ['Summe', '', '', '', '{{materialBase}}'],
    ]);
    this.styleTable(purchases, { widths: [62, 184, 95, 70, 80], rightCols: [4], totalRow: true, small: true });
    this.marker(body, '{{/purchases}}');
    this.marker(body, '{{/annex}}');
    // A document must not end with a removable section; keep a final empty paragraph.
    this.para(body, '');
  },

  /** @private */
  para(body, text) {
    const p = body.appendParagraph(text);
    p.setHeading(DocumentApp.ParagraphHeading.NORMAL);
    p.setSpacingBefore(0).setSpacingAfter(2);
    return p;
  },

  /** @private */
  heading(body, text) {
    const p = body.appendParagraph(text);
    p.setHeading(DocumentApp.ParagraphHeading.HEADING3);
    p.setSpacingBefore(12).setSpacingAfter(4);
    p.editAsText().setFontSize(11).setBold(true).setForegroundColor(this.COLORS.accent);
    return p;
  },

  /** @private Section marker paragraph (small and grey; removed when rendering). */
  marker(body, text) {
    const p = this.para(body, text);
    p.editAsText().setFontSize(7).setForegroundColor('#999999');
    return p;
  },

  /** @private Highlights text the chef should replace with real data. */
  markPlaceholder(paragraph) {
    paragraph.editAsText().setBackgroundColor(this.COLORS.placeholder);
    return paragraph;
  },

  /**
   * @private
   * @param {GoogleAppsScript.Document.Table} table
   * @param {{widths: number[], rightCols?: number[], labelCols?: number[], header?: boolean,
   *          totalRow?: boolean, borders?: boolean, small?: boolean}} opt
   */
  styleTable(table, opt) {
    const hasHeader = opt.header !== false;
    table.setBorderWidth(opt.borders === false ? 0 : 0.5);
    table.setBorderColor(this.COLORS.border);
    opt.widths.forEach((w, i) => table.setColumnWidth(i, w));
    const rows = table.getNumRows();
    for (let r = 0; r < rows; r++) {
      const row = table.getRow(r);
      for (let c = 0; c < row.getNumCells(); c++) {
        const cell = row.getCell(c);
        cell.setPaddingTop(2).setPaddingBottom(2).setPaddingLeft(4).setPaddingRight(4);
        const p = cell.getChild(0).asParagraph();
        p.setSpacingBefore(0).setSpacingAfter(0);
        const text = p.editAsText();
        text.setFontSize(opt.small ? 8 : 9);
        if ((opt.rightCols || []).indexOf(c) >= 0) p.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
        if ((opt.labelCols || []).indexOf(c) >= 0) text.setBold(true);
        if (hasHeader && r === 0) {
          cell.setBackgroundColor(this.COLORS.headerFill);
          text.setBold(true);
        }
        if (opt.totalRow && r === rows - 1) text.setBold(true);
      }
    }
  },
};

/**
 * Re-creates the invoice template (e.g. after a layout update in code). The old template is moved to the trash.
 * Run manually in the Apps Script editor.
 */
function resetInvoiceTemplate() {
  const props = Config.props();
  const oldId = props.getProperty('TEMPLATE_DOC_ID');
  const newId = InvoiceTemplate.create(Storage.rootFolder());
  props.setProperty('TEMPLATE_DOC_ID', newId);
  if (oldId) Storage.trash(oldId);
  console.log('New invoice template: https://docs.google.com/document/d/' + newId + '/edit');
}
