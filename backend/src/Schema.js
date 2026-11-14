/**
 * Central mapping between English field names used in code and the German column headers of the sheets.
 *
 * Column types (serialization in Table):
 * - string (default): stored as plain text
 * - number / money: stored as number (money rounded to 2 decimals)
 * - date `YYYY-MM-DD`, time `HH:MM`, datetime `YYYY-MM-DDTHH:MM:SS`: stored as plain text
 * - bool: stored as `ja` / `nein`
 * - enum: code value ↔ German label via `values`
 *
 * Each table has a sheet (tab) name and an id column (always column A).
 */
const ITEM_STATUS = { open: 'offen', invoiced: 'verrechnet', paid: 'bezahlt' };
const PROJECT_STATUS = { active: 'aktiv', closed: 'abgeschlossen' };
const DEMAND_STATUS = { open: 'offen', ordered: 'bestellt', done: 'erledigt' };
const URGENCY = { normal: 'normal', urgent: 'dringend' };
const INVOICE_STATUS = { created: 'erstellt', paid: 'bezahlt' };
const PURCHASE_SOURCE = { qr: 'QR', manual: 'manuell' };
const INVOICE_KIND = { invoice: 'Rechnung', partial: 'Zwischenrechnung', final: 'Schlussrechnung' };

const SCHEMA = {
  // ---- master spreadsheet ----
  settings: {
    sheet: 'Einstellungen',
    columns: [
      { key: 'key', header: 'Schlüssel' },
      { key: 'value', header: 'Wert' },
      { key: 'meaning', header: 'Bedeutung' },
    ],
  },
  employees: {
    sheet: 'Mitarbeiter',
    columns: [
      { key: 'id', header: 'ID' },
      { key: 'name', header: 'Name' },
      { key: 'shortName', header: 'Kürzel' },
      { key: 'email', header: 'E-Mail (Google)' },
      { key: 'hourlyRate', header: 'Stundensatz (€/h netto)', type: 'money' },
      { key: 'active', header: 'Aktiv', type: 'bool' },
    ],
  },
  projects: {
    sheet: 'Projekte',
    columns: [
      { key: 'id', header: 'ID' },
      { key: 'name', header: 'Projekt / Bauvorhaben' },
      { key: 'client', header: 'Auftraggeber / Kunde' },
      { key: 'address', header: 'Baustellenadresse' },
      { key: 'siteManager', header: 'Bauleiter' },
      { key: 'markupPercent', header: 'Materialaufschlag %', type: 'number' },
      { key: 'status', header: 'Status', type: 'enum', values: PROJECT_STATUS },
      { key: 'folderId', header: 'Ordner-ID' },
      { key: 'sheetId', header: 'Sheet-ID' },
      { key: 'createdAt', header: 'Angelegt am', type: 'datetime' },
      { key: 'closedAt', header: 'Abgeschlossen am', type: 'datetime' },
    ],
  },
  catalog: {
    sheet: 'Leistungskatalog',
    columns: [
      { key: 'code', header: 'Code' },
      { key: 'description', header: 'Beschreibung' },
      { key: 'unit', header: 'Einheit' },
      { key: 'price', header: 'Netto-Preis (€)', type: 'money' },
    ],
  },
  invoiceRegister: {
    sheet: 'Rechnungsregister',
    columns: [
      { key: 'number', header: 'Rechnungsnummer' },
      { key: 'invoiceId', header: 'Rechnung-ID' },
      { key: 'projectId', header: 'Projekt-ID' },
      { key: 'date', header: 'Rechnungsdatum', type: 'date' },
    ],
  },

  // ---- project spreadsheet ----
  timeEntries: {
    sheet: 'Zeiten',
    columns: [
      { key: 'id', header: 'ID' },
      { key: 'date', header: 'Datum', type: 'date' },
      { key: 'employeeId', header: 'Mitarbeiter-ID' },
      { key: 'employeeName', header: 'Mitarbeiter' },
      { key: 'from', header: 'Von', type: 'time' },
      { key: 'to', header: 'Bis', type: 'time' },
      { key: 'hours', header: 'Stunden', type: 'number' },
      { key: 'description', header: 'Kurzbeschreibung' },
      { key: 'status', header: 'Status', type: 'enum', values: ITEM_STATUS },
      { key: 'invoiceId', header: 'Rechnung-ID' },
      { key: 'rate', header: 'Stundensatz', type: 'money' },
      { key: 'createdBy', header: 'Erfasst von' },
      { key: 'createdAt', header: 'Erfasst am', type: 'datetime' },
      { key: 'updatedAt', header: 'Geändert am', type: 'datetime' },
    ],
  },
  purchases: {
    sheet: 'Materialkäufe',
    columns: [
      { key: 'id', header: 'ID' },
      { key: 'date', header: 'Datum', type: 'date' },
      { key: 'buyerId', header: 'Gekauft von (MA-ID)' },
      { key: 'buyerName', header: 'Gekauft von' },
      { key: 'article', header: 'Artikel / Beschreibung' },
      { key: 'amount', header: 'Betrag (€)', type: 'money' },
      { key: 'source', header: 'Quelle', type: 'enum', values: PURCHASE_SOURCE },
      { key: 'cashRegisterId', header: 'Kassen-ID' },
      { key: 'receiptNumber', header: 'Beleg-Nr.' },
      { key: 'receiptFileId', header: 'Beleg-Datei-ID' },
      { key: 'status', header: 'Status', type: 'enum', values: ITEM_STATUS },
      { key: 'invoiceId', header: 'Rechnung-ID' },
      { key: 'reimbursed', header: 'Erstattet', type: 'bool' },
      { key: 'reimbursedAt', header: 'Erstattet am', type: 'date' },
      { key: 'createdBy', header: 'Erfasst von' },
      { key: 'createdAt', header: 'Erfasst am', type: 'datetime' },
      { key: 'updatedAt', header: 'Geändert am', type: 'datetime' },
    ],
  },
  demands: {
    sheet: 'Materialbedarf',
    columns: [
      { key: 'id', header: 'ID' },
      { key: 'date', header: 'Datum', type: 'date' },
      { key: 'reporterId', header: 'Gemeldet von (MA-ID)' },
      { key: 'reporterName', header: 'Gemeldet von' },
      { key: 'material', header: 'Material' },
      { key: 'quantity', header: 'Menge', type: 'number' },
      { key: 'unit', header: 'Einheit' },
      { key: 'urgency', header: 'Dringlichkeit', type: 'enum', values: URGENCY },
      { key: 'note', header: 'Notiz' },
      { key: 'photoFileId', header: 'Foto-Datei-ID' },
      { key: 'status', header: 'Status', type: 'enum', values: DEMAND_STATUS },
      { key: 'updatedBy', header: 'Geändert von' },
      { key: 'updatedAt', header: 'Geändert am', type: 'datetime' },
    ],
  },
  photos: {
    sheet: 'Fotos',
    columns: [
      { key: 'id', header: 'ID' },
      { key: 'takenAt', header: 'Aufgenommen am', type: 'datetime' },
      { key: 'uploaderId', header: 'Hochgeladen von (MA-ID)' },
      { key: 'uploaderName', header: 'Hochgeladen von' },
      { key: 'description', header: 'Beschreibung' },
      { key: 'preDamage', header: 'Vorschaden', type: 'bool' },
      { key: 'fileId', header: 'Datei-ID' },
      { key: 'createdAt', header: 'Erfasst am', type: 'datetime' },
      { key: 'updatedAt', header: 'Geändert am', type: 'datetime' },
    ],
  },
  invoices: {
    sheet: 'Rechnungen',
    columns: [
      { key: 'id', header: 'ID' },
      { key: 'number', header: 'Rechnungsnummer' },
      { key: 'kind', header: 'Art', type: 'enum', values: INVOICE_KIND },
      { key: 'date', header: 'Rechnungsdatum', type: 'date' },
      { key: 'cutoffDate', header: 'Stichtag', type: 'date' },
      { key: 'periodFrom', header: 'Leistungszeitraum von', type: 'date' },
      { key: 'periodTo', header: 'Leistungszeitraum bis', type: 'date' },
      { key: 'status', header: 'Status', type: 'enum', values: INVOICE_STATUS },
      { key: 'paidAt', header: 'Bezahlt am', type: 'date' },
      { key: 'laborTotal', header: 'Summe Arbeit', type: 'money' },
      { key: 'extrasTotal', header: 'Summe Zusatzpositionen', type: 'money' },
      { key: 'materialBase', header: 'Materialbasis', type: 'money' },
      { key: 'markupPercent', header: 'Aufschlag %', type: 'number' },
      { key: 'markupAmount', header: 'Aufschlag €', type: 'money' },
      { key: 'netTotal', header: 'Gesamt netto', type: 'money' },
      { key: 'docxFileId', header: 'DOCX-Datei-ID' },
      { key: 'createdAt', header: 'Erstellt am', type: 'datetime' },
    ],
  },
  invoiceItems: {
    sheet: 'Rechnungspositionen',
    columns: [
      { key: 'id', header: 'ID' },
      { key: 'invoiceId', header: 'Rechnung-ID' },
      { key: 'code', header: 'Code' },
      { key: 'description', header: 'Beschreibung' },
      { key: 'quantity', header: 'Menge', type: 'number' },
      { key: 'unit', header: 'Einheit' },
      { key: 'unitPrice', header: 'Einzelpreis', type: 'money' },
      { key: 'total', header: 'Gesamt', type: 'money' },
    ],
  },
};

/** Tables stored in the master spreadsheet. */
const MASTER_TABLES = ['settings', 'employees', 'projects', 'catalog', 'invoiceRegister'];
/** Tables stored in each project spreadsheet. */
const PROJECT_TABLES = ['timeEntries', 'purchases', 'demands', 'photos', 'invoices', 'invoiceItems'];
