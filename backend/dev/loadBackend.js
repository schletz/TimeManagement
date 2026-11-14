/**
 * Loads all backend source files into a Node vm context with the Apps Script fakes,
 * like the Apps Script runtime does (one shared global scope).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createFakes, devToken, FakeBlob } = require('./gasFakes');

const SRC_DIR = path.join(__dirname, '..', 'src');

/**
 * @param {{ownerEmail?: string, clientId?: string, quiet?: boolean}} [options]
 * @returns {{context: Object, fakes: Object, run: function(string): *, call: function(string, string, Object): Object, token: function(string): string}}
 */
function loadBackend(options) {
  const fakes = createFakes(options);
  const logger = options && options.quiet
    ? { log() {}, warn() {}, error() {}, info() {} }
    : console;
  const context = vm.createContext(Object.assign({ console: logger }, fakes.services));
  fs.readdirSync(SRC_DIR)
    .filter((f) => f.endsWith('.js'))
    .sort()
    .forEach((f) => vm.runInContext(fs.readFileSync(path.join(SRC_DIR, f), 'utf8'), context, { filename: f }));

  const run = (code) => vm.runInContext(code, context);

  // DocumentApp is not emulated: produce a plain text "document" with the computed figures instead.
  const doc = run('InvoiceDocument');
  doc.render = (data) => {
    const name = doc.fileName(data.invoice.number, data.project.name);
    const folder = run('Storage').projectFolder(data.project, 'invoices');
    const text = [
      'DEV-RECHNUNG (lokaler Emulator, keine echte DOCX-Datei)',
      'Nummer: ' + data.invoice.number,
      'Projekt: ' + data.project.name,
      'Arbeit: ' + data.calc.laborTotal,
      'Zusatz: ' + data.calc.extrasTotal,
      'Material: ' + data.calc.materialBase + ' + ' + data.calc.markupAmount,
      'Gesamt netto: ' + data.calc.netTotal,
    ].join('\n');
    const blob = new FakeBlob(text, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', name);
    const fileId = folder.createFile(blob).getId();
    return { fileId, blob, name };
  };

  // The template itself is a Google Doc; in the emulator a placeholder file is enough.
  run('InvoiceTemplate').create = (folder) => folder.createFile(new FakeBlob('template', 'application/vnd.google-apps.document', 'Rechnungsvorlage')).getId();

  run('setup()');
  fakes.services.PropertiesService.getScriptProperties().setProperty('CLIENT_ID', fakes.options.clientId);

  const handle = run('handleRequest');
  const token = (email) => devToken(email, fakes.options.clientId);
  /** Calls an API action as the given user and returns the parsed response. */
  const call = (action, email, payload) => JSON.parse(JSON.stringify(
    handle(JSON.stringify({ action, idToken: email ? token(email) : '', payload: payload || {} }))
  ));
  return { context, fakes, run, call, token };
}

module.exports = { loadBackend };
