'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { loadBackend } = require('../dev/loadBackend');

const CHEF = 'chef@example.com';
const MAX = 'max@example.com';
const EVA = 'eva@example.com';
const STRANGER = 'nobody@example.com';
// Minimal JPEG header bytes; the backend only checks the SOI marker.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]).toString('base64');

const uuid = () => crypto.randomUUID();

/** Asserts a successful response and returns its data. */
function ok(res) {
  assert.equal(res.ok, true, res.error && res.error.code + ': ' + res.error.message);
  return res.data;
}

/** Asserts an error response with the given code. */
function fails(res, code) {
  assert.equal(res.ok, false, 'expected error ' + code);
  assert.equal(res.error.code, code, res.error.message);
  return res.error;
}

/** Fresh backend with a chef (also employee), two employees and one project. */
function scenario() {
  const b = loadBackend({ quiet: true });
  const chefEmp = ok(b.call('saveEmployee', CHEF, { name: 'Chef Christa', shortName: 'CC', email: CHEF, hourlyRate: 50 }));
  const max = ok(b.call('saveEmployee', CHEF, { name: 'Max Monteur', shortName: 'MM', email: MAX, hourlyRate: 40 }));
  const eva = ok(b.call('saveEmployee', CHEF, { name: 'Eva Elektro', shortName: 'EE', email: EVA, hourlyRate: 30 }));
  const project = ok(b.call('saveProject', CHEF, { name: 'Westend', client: 'Holding GmbH', address: 'Gewerbestraße 14, 1030 Wien', siteManager: 'Ing. Leitner' }));
  return { b, chefEmp, max, eva, project, pid: project.id };
}

test('authentication and authorization', () => {
  const { b, pid } = scenario();
  fails(b.call('me', null), 'AUTH_REQUIRED');
  fails(b.call('me', STRANGER), 'FORBIDDEN');
  assert.equal(ok(b.call('me', MAX)).role, 'employee');
  assert.equal(ok(b.call('me', CHEF)).role, 'chef');
  fails(b.call('listEmployees', MAX), 'FORBIDDEN');
  fails(b.call('previewInvoice', MAX, { projectId: pid }), 'FORBIDDEN');
  // expired token
  const res = JSON.parse(JSON.stringify(b.run('handleRequest')(JSON.stringify({
    action: 'me',
    idToken: require('../dev/gasFakes').devToken(MAX, 'test-client-id', -10),
  }))));
  fails(res, 'AUTH_EXPIRED');
  // token for a different client id
  const foreign = JSON.parse(JSON.stringify(b.run('handleRequest')(JSON.stringify({
    action: 'me', idToken: require('../dev/gasFakes').devToken(MAX, 'other-client'),
  }))));
  fails(foreign, 'AUTH_INVALID');
});

test('inactive employees are rejected', () => {
  const { b, eva } = scenario();
  ok(b.call('saveEmployee', CHEF, Object.assign({}, eva, { active: false })));
  fails(b.call('me', EVA), 'FORBIDDEN');
});

test('employees manage only their own open time entries', () => {
  const { b, pid, max } = scenario();
  const id = uuid();
  const entry = ok(b.call('saveTimeEntry', MAX, { id, projectId: pid, date: '2026-11-10', from: '08:30', to: '16:20', description: 'Kabel Küche' }));
  assert.equal(entry.hours, 7.75);
  assert.equal(entry.employeeId, max.id);
  assert.equal(entry.rate, undefined, 'rate is hidden for employees');

  // idempotent re-send updates the same row
  ok(b.call('saveTimeEntry', MAX, { id, projectId: pid, date: '2026-11-10', from: '08:30', to: '16:20', description: 'Kabel Küche' }));
  assert.equal(ok(b.call('listTimeEntries', MAX, { projectId: pid })).length, 1);

  assert.equal(ok(b.call('listTimeEntries', EVA, { projectId: pid })).length, 0, 'Eva does not see Max entries');
  fails(b.call('saveTimeEntry', EVA, { id, projectId: pid, date: '2026-11-10', from: '08:00', to: '09:00', description: 'x' }), 'FORBIDDEN');
  fails(b.call('deleteTimeEntry', EVA, { projectId: pid, id }), 'FORBIDDEN');

  // validation
  fails(b.call('saveTimeEntry', MAX, { id: uuid(), projectId: pid, date: '2999-01-01', from: '08:00', to: '09:00', description: 'x' }), 'VALIDATION');
  fails(b.call('saveTimeEntry', MAX, { id: uuid(), projectId: pid, date: '2026-11-10', from: '09:00', to: '08:00', description: 'x' }), 'VALIDATION');
  fails(b.call('saveTimeEntry', MAX, { id: uuid(), projectId: pid, date: '2026-11-10', from: '08:00', to: '09:00', description: ' ' }), 'VALIDATION');

  // overlap warning and confirmation
  const overlap = { id: uuid(), projectId: pid, date: '2026-11-10', from: '16:00', to: '17:00', description: 'Nacharbeit' };
  fails(b.call('saveTimeEntry', MAX, overlap), 'CONFIRM_REQUIRED');
  ok(b.call('saveTimeEntry', MAX, Object.assign({ confirmOverlap: true }, overlap)));

  // the chef records for another employee and sees all entries including rates
  const forEva = ok(b.call('saveTimeEntry', CHEF, { id: uuid(), projectId: pid, employeeId: b.call('me', EVA).data.employee.id, date: '2026-11-11', from: '07:00', to: '12:00', description: 'Verteiler' }));
  assert.equal(forEva.employeeName, 'Eva Elektro');
  assert.equal(ok(b.call('listTimeEntries', CHEF, { projectId: pid })).length, 3);

  ok(b.call('deleteTimeEntry', MAX, { projectId: pid, id: overlap.id }));
  assert.equal(ok(b.call('listTimeEntries', MAX, { projectId: pid })).length, 1);
});

test('formula-like input is stored as text', () => {
  const { b, pid } = scenario();
  ok(b.call('saveTimeEntry', MAX, { id: uuid(), projectId: pid, date: '2026-11-10', from: '08:00', to: '09:00', description: '=IMPORTXML("x")' }));
  assert.equal(ok(b.call('listTimeEntries', MAX, { projectId: pid }))[0].description, '=IMPORTXML("x")');
});

test('purchases, receipts and reimbursements', () => {
  const { b, pid, max } = scenario();
  const receipt = ok(b.call('uploadReceipt', MAX, { projectId: pid, id: uuid(), base64: JPEG }));
  fails(b.call('uploadReceipt', MAX, { projectId: pid, id: uuid(), base64: Buffer.from('not a jpeg').toString('base64') }), 'VALIDATION');
  const p1 = ok(b.call('savePurchase', MAX, {
    id: uuid(), projectId: pid, date: '2026-11-10', article: 'Kabel NYM 3x1,5', amount: '20,99', source: 'qr',
    cashRegisterId: 'AT0039/7', receiptNumber: '7150', receiptFileId: receipt.fileId,
  }));
  assert.equal(p1.amount, 20.99);
  assert.equal(p1.hasReceipt, true);
  ok(b.call('savePurchase', MAX, { id: uuid(), projectId: pid, date: '2026-11-11', article: 'Dosen', amount: 15, source: 'manual' }));
  fails(b.call('savePurchase', MAX, { id: uuid(), projectId: pid, date: '2026-11-11', article: 'Dosen', amount: 0 }), 'VALIDATION');

  assert.equal(ok(b.call('getReceipt', MAX, { projectId: pid, purchaseId: p1.id })).mimeType, 'image/jpeg');
  fails(b.call('getReceipt', EVA, { projectId: pid, purchaseId: p1.id }), 'FORBIDDEN');
  fails(b.call('setReimbursed', MAX, { employeeId: max.id }), 'FORBIDDEN');

  let mine = ok(b.call('listMyReimbursements', MAX));
  assert.equal(mine.filter((x) => !x.reimbursed).length, 2);
  assert.equal(mine[0].projectName, 'Westend');

  assert.equal(ok(b.call('setReimbursed', CHEF, { projectId: pid, ids: [p1.id] })).count, 1);
  assert.equal(ok(b.call('setReimbursed', CHEF, { employeeId: max.id })).count, 1);
  mine = ok(b.call('listMyReimbursements', MAX));
  assert.ok(mine.every((x) => x.reimbursed && x.reimbursedAt));
});

test('material demands: e-mail and status rules', () => {
  const { b, pid } = scenario();
  const d = ok(b.call('saveDemand', MAX, { id: uuid(), projectId: pid, material: 'Leerrohr M20', quantity: 50, unit: 'm', urgency: 'urgent', note: 'für Küche', photoBase64: JPEG }));
  assert.equal(d.hasPhoto, true);
  assert.equal(b.fakes.state.mails.length, 1);
  assert.match(b.fakes.state.mails[0].subject, /DRINGEND/);
  assert.equal(ok(b.call('listDemands', EVA, { projectId: pid })).length, 1, 'everybody sees demands');
  fails(b.call('setDemandStatus', MAX, { projectId: pid, id: d.id, status: 'ordered' }), 'FORBIDDEN');
  fails(b.call('setDemandStatus', EVA, { projectId: pid, id: d.id, status: 'done' }), 'FORBIDDEN');
  ok(b.call('setDemandStatus', CHEF, { projectId: pid, id: d.id, status: 'ordered' }));
  assert.equal(ok(b.call('setDemandStatus', MAX, { projectId: pid, id: d.id, status: 'done' })).status, 'done');
  assert.equal(ok(b.call('getPhoto', EVA, { projectId: pid, demandId: d.id })).mimeType, 'image/jpeg');
});

test('photos: upload, thumbnails, update by owner only, delete', () => {
  const { b, pid } = scenario();
  const ph = ok(b.call('uploadPhoto', MAX, { id: uuid(), projectId: pid, takenAt: '2026-11-14T10:00:00', description: 'Riss in Wand', preDamage: true, base64: JPEG }));
  ok(b.call('uploadPhoto', EVA, { id: uuid(), projectId: pid, description: 'Verteiler', base64: JPEG }));
  const list = ok(b.call('listPhotos', EVA, { projectId: pid }));
  assert.equal(list.length, 2);
  assert.ok(list.every((p) => typeof p.thumbnail === 'string' && p.thumbnail.length > 0));
  assert.equal(ok(b.call('listPhotos', EVA, { projectId: pid, onlyPreDamage: true })).length, 1);
  fails(b.call('updatePhoto', EVA, { projectId: pid, id: ph.id, description: 'x' }), 'FORBIDDEN');
  assert.equal(ok(b.call('updatePhoto', MAX, { projectId: pid, id: ph.id, description: 'Riss, annotiert', base64: JPEG })).description, 'Riss, annotiert');
  ok(b.call('updatePhoto', CHEF, { projectId: pid, id: ph.id, preDamage: false }));
  ok(b.call('deletePhoto', MAX, { projectId: pid, id: ph.id }));
  assert.equal(ok(b.call('listPhotos', MAX, { projectId: pid })).length, 1);
});

test('invoice lifecycle: create, paid, unpaid, delete', () => {
  const { b, pid, max, eva } = scenario();
  const t1 = uuid();
  const t2 = uuid();
  const t3 = uuid();
  ok(b.call('saveTimeEntry', MAX, { id: t1, projectId: pid, date: '2026-11-03', from: '07:00', to: '15:00', description: 'A' }));
  ok(b.call('saveTimeEntry', CHEF, { id: t2, projectId: pid, employeeId: eva.id, date: '2026-11-04', from: '07:00', to: '11:30', description: 'B' }));
  ok(b.call('saveTimeEntry', MAX, { id: t3, projectId: pid, date: '2026-11-12', from: '07:00', to: '08:00', description: 'after cutoff' }));
  const pu = uuid();
  ok(b.call('savePurchase', MAX, { id: pu, projectId: pid, date: '2026-11-05', article: 'Kabel', amount: 100, source: 'manual' }));

  const preview = ok(b.call('previewInvoice', CHEF, { projectId: pid, cutoffDate: '2026-11-10' }));
  assert.deepEqual(preview.timeEntries.map((t) => t.id).sort(), [t1, t2].sort());
  assert.equal(preview.suggestedNumber, new Date().getFullYear() + '-001');
  assert.equal(preview.calc.laborTotal, 8 * 40 + 4.5 * 30);
  assert.equal(preview.calc.markupAmount, 20);
  assert.equal(preview.catalog.length, 5);

  const deselected = ok(b.call('previewInvoice', CHEF, { projectId: pid, cutoffDate: '2026-11-10', timeEntryIds: [t1], purchaseIds: [] }));
  assert.equal(deselected.calc.laborTotal, 320);
  assert.equal(deselected.calc.materialBase, 0);

  const invoiceId = uuid();
  const payload = {
    id: invoiceId, projectId: pid, cutoffDate: '2026-11-10', number: '2026-001', date: '2026-11-14', kind: 'partial',
    timeEntryIds: [t1, t2], purchaseIds: [pu],
    extraItems: [{ code: 'PAUSCH-ANFAHRT', description: 'Anfahrt', quantity: 2, unit: 'Psch.', unitPrice: 45 }],
  };
  const created = ok(b.call('createInvoice', CHEF, payload));
  assert.equal(created.invoice.netTotal, 320 + 135 + 90 + 100 + 20);
  assert.ok(created.file.base64.length > 0);
  assert.equal(created.file.name, 'Rechnung 2026-001 Westend.docx');

  // idempotent
  assert.equal(ok(b.call('createInvoice', CHEF, payload)).invoice.id, invoiceId);
  // number must be unique
  fails(b.call('createInvoice', CHEF, Object.assign({}, payload, { id: uuid(), timeEntryIds: [t3], purchaseIds: [], cutoffDate: '2026-11-14', extraItems: [] })), 'VALIDATION');

  let entries = ok(b.call('listTimeEntries', CHEF, { projectId: pid }));
  const e1 = entries.find((t) => t.id === t1);
  assert.equal(e1.status, 'invoiced');
  assert.equal(e1.rate, 40);
  assert.equal(entries.find((t) => t.id === t3).status, 'open');
  fails(b.call('saveTimeEntry', MAX, { id: t1, projectId: pid, date: '2026-11-03', from: '07:00', to: '16:00', description: 'A' }), 'CONFLICT');
  fails(b.call('deleteTimeEntry', CHEF, { projectId: pid, id: t1 }), 'CONFLICT');

  // rate change after invoicing does not touch the frozen rate
  ok(b.call('saveEmployee', CHEF, Object.assign({}, max, { hourlyRate: 99 })));
  assert.equal(ok(b.call('listTimeEntries', CHEF, { projectId: pid })).find((t) => t.id === t1).rate, 40);

  const year = new Date().getFullYear();
  assert.equal(ok(b.call('previewInvoice', CHEF, { projectId: pid })).suggestedNumber, year === 2026 ? '2026-002' : year + '-001');

  ok(b.call('setInvoicePaid', CHEF, { projectId: pid, invoiceId, paid: true, paidAt: '2026-11-20' }));
  assert.equal(ok(b.call('listPurchases', CHEF, { projectId: pid }))[0].status, 'paid');
  ok(b.call('setInvoicePaid', CHEF, { projectId: pid, invoiceId, paid: false }));
  assert.equal(ok(b.call('listPurchases', CHEF, { projectId: pid }))[0].status, 'invoiced');

  const invoices = ok(b.call('listInvoices', CHEF, { projectId: pid }));
  assert.equal(invoices.length, 1);
  assert.equal(invoices[0].extraItems.length, 1);
  assert.ok(ok(b.call('downloadInvoice', CHEF, { projectId: pid, invoiceId })).base64);

  ok(b.call('deleteInvoice', CHEF, { projectId: pid, invoiceId }));
  entries = ok(b.call('listTimeEntries', CHEF, { projectId: pid }));
  assert.ok(entries.every((t) => t.status === 'open' && !t.invoiceId && (t.rate === null || t.rate === '')));
  assert.equal(ok(b.call('listInvoices', CHEF, { projectId: pid })).length, 0);
  // the number is free again
  assert.equal(ok(b.call('previewInvoice', CHEF, { projectId: pid })).suggestedNumber, new Date().getFullYear() + '-001');
});

test('closing a project warns about open items and locks employees out', () => {
  const { b, pid } = scenario();
  ok(b.call('saveTimeEntry', MAX, { id: uuid(), projectId: pid, date: '2026-11-10', from: '08:00', to: '10:00', description: 'x' }));
  const err = fails(b.call('closeProject', CHEF, { projectId: pid }), 'CONFIRM_REQUIRED');
  assert.equal(err.details.hoursCount, 1);
  ok(b.call('closeProject', CHEF, { projectId: pid, confirm: true }));
  assert.equal(ok(b.call('listProjects', MAX)).length, 0);
  fails(b.call('saveTimeEntry', MAX, { id: uuid(), projectId: pid, date: '2026-11-10', from: '11:00', to: '12:00', description: 'x' }), 'PROJECT_CLOSED');
  fails(b.call('listPhotos', MAX, { projectId: pid }), 'PROJECT_CLOSED');
  // chef can still work on it
  ok(b.call('saveTimeEntry', CHEF, { id: uuid(), projectId: pid, date: '2026-11-10', from: '11:00', to: '12:00', description: 'x' }));
  ok(b.call('reopenProject', CHEF, { projectId: pid }));
  assert.equal(ok(b.call('listProjects', MAX)).length, 1);
});

test('project names are unique and renames update storage', () => {
  const { b, project } = scenario();
  fails(b.call('saveProject', CHEF, { name: 'westend ' }), 'VALIDATION');
  const renamed = ok(b.call('saveProject', CHEF, Object.assign({}, project, { name: 'Westend Bauteil B', markupPercent: '15' })));
  assert.equal(renamed.effectiveMarkupPercent, 15);
  const row = b.run('Projects').byId(project.id);
  assert.equal(b.fakes.services.DriveApp.getFolderById(row.folderId).getName(), 'Westend Bauteil B');
});

test('dashboard aggregates per project and employee', () => {
  const { b, pid, max } = scenario();
  ok(b.call('saveTimeEntry', MAX, { id: uuid(), projectId: pid, date: '2026-11-10', from: '08:00', to: '10:00', description: 'x' }));
  ok(b.call('savePurchase', MAX, { id: uuid(), projectId: pid, date: '2026-11-10', article: 'x', amount: 12.5, source: 'manual' }));
  ok(b.call('saveDemand', MAX, { id: uuid(), projectId: pid, material: 'Schalter', quantity: 3, unit: 'Stk', urgency: 'normal' }));
  ok(b.call('saveDemand', MAX, { id: uuid(), projectId: pid, material: 'FI', quantity: 1, unit: 'Stk', urgency: 'urgent' }));
  const dash = ok(b.call('getDashboard', CHEF));
  assert.equal(dash.projects[0].hours.open, 2);
  assert.equal(dash.projects[0].material.total, 12.5);
  assert.equal(dash.projects[0].hoursPerEmployee[0].employeeId, max.id);
  assert.equal(dash.openDemands[0].material, 'FI');
  assert.deepEqual(dash.openReimbursements.map((r) => [r.employeeId, r.amount]), [[max.id, 12.5]]);
});

test('settings and catalog management', () => {
  const { b } = scenario();
  const s = ok(b.call('getSettings', CHEF));
  assert.equal(s.materialMarkupPercent, 20);
  assert.equal(s.chefEmail, CHEF);
  ok(b.call('saveSettings', CHEF, Object.assign({}, s, { materialMarkupPercent: 25 })));
  assert.equal(ok(b.call('getSettings', CHEF)).materialMarkupPercent, 25);
  fails(b.call('saveSettings', CHEF, Object.assign({}, s, { chefEmail: 'invalid' })), 'VALIDATION');
  ok(b.call('saveCatalogItem', CHEF, { code: 'neu-1', description: 'Neu', unit: 'Stk', price: 9.9 }));
  ok(b.call('saveCatalogItem', CHEF, { originalCode: 'NEU-1', code: 'NEU-2', description: 'Neu', unit: 'Stk', price: 9.9 }));
  const codes = ok(b.call('listCatalog', CHEF)).map((c) => c.code);
  assert.ok(codes.includes('NEU-2') && !codes.includes('NEU-1'));
  ok(b.call('deleteCatalogItem', CHEF, { code: 'NEU-2' }));
  assert.equal(ok(b.call('listCatalog', CHEF)).length, 5);
});

test('many deletions keep the sheet usable', () => {
  const { b, pid } = scenario();
  for (let i = 0; i < 5; i++) {
    const id = uuid();
    ok(b.call('saveTimeEntry', MAX, { id, projectId: pid, date: '2026-11-10', from: '08:00', to: '09:00', description: 'x', confirmOverlap: true }));
    ok(b.call('deleteTimeEntry', MAX, { projectId: pid, id }));
  }
  assert.equal(ok(b.call('listTimeEntries', MAX, { projectId: pid })).length, 0);
});
