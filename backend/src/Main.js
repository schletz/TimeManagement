/**
 * Web app entry point and action router.
 *
 * Request: POST body (sent as text/plain to avoid a CORS preflight) `{ action, idToken, payload }`.
 * Response: `{ ok: true, data }` or `{ ok: false, error: { code, message, details } }`.
 */

/**
 * Action table. `chef`: only for the chef role. `write`: runs under the script lock.
 * Where an action requires an active project, this applies to employees only (Projects.requireAccess).
 */
const ACTIONS = {
  me: { handler: (ctx) => Me.get(ctx) },

  listProjects: { handler: (ctx) => Projects.list(ctx) },
  getProject: { handler: (ctx, p) => Projects.get(ctx, p) },
  saveProject: { handler: (ctx, p) => Projects.save(ctx, p), chef: true, write: true },
  closeProject: { handler: (ctx, p) => Projects.close(ctx, p), chef: true, write: true },
  reopenProject: { handler: (ctx, p) => Projects.reopen(ctx, p), chef: true, write: true },

  listTimeEntries: { handler: (ctx, p) => TimeEntries.list(ctx, p) },
  saveTimeEntry: { handler: (ctx, p) => TimeEntries.save(ctx, p), write: true },
  deleteTimeEntry: { handler: (ctx, p) => TimeEntries.remove(ctx, p), write: true },

  listPurchases: { handler: (ctx, p) => Purchases.list(ctx, p) },
  savePurchase: { handler: (ctx, p) => Purchases.save(ctx, p), write: true },
  deletePurchase: { handler: (ctx, p) => Purchases.remove(ctx, p), write: true },
  setReimbursed: { handler: (ctx, p) => Purchases.setReimbursed(ctx, p), chef: true, write: true },
  listMyReimbursements: { handler: (ctx, p) => Purchases.listMyReimbursements(ctx, p) },
  uploadReceipt: { handler: (ctx, p) => Purchases.uploadReceipt(ctx, p), write: true },
  getReceipt: { handler: (ctx, p) => Purchases.getReceipt(ctx, p) },

  listDemands: { handler: (ctx, p) => Demands.list(ctx, p) },
  saveDemand: { handler: (ctx, p) => Demands.save(ctx, p), write: true },
  setDemandStatus: { handler: (ctx, p) => Demands.setStatus(ctx, p), write: true },

  listPhotos: { handler: (ctx, p) => Photos.list(ctx, p) },
  getPhoto: { handler: (ctx, p) => Photos.get(ctx, p) },
  uploadPhoto: { handler: (ctx, p) => Photos.upload(ctx, p), write: true },
  updatePhoto: { handler: (ctx, p) => Photos.update(ctx, p), write: true },
  deletePhoto: { handler: (ctx, p) => Photos.remove(ctx, p), write: true },

  previewInvoice: { handler: (ctx, p) => Invoices.preview(ctx, p), chef: true },
  createInvoice: { handler: (ctx, p) => Invoices.create(ctx, p), chef: true, write: true },
  listInvoices: { handler: (ctx, p) => Invoices.list(ctx, p), chef: true },
  downloadInvoice: { handler: (ctx, p) => Invoices.download(ctx, p), chef: true },
  setInvoicePaid: { handler: (ctx, p) => Invoices.setPaid(ctx, p), chef: true, write: true },
  deleteInvoice: { handler: (ctx, p) => Invoices.remove(ctx, p), chef: true, write: true },

  listEmployees: { handler: () => MasterData.listEmployees(), chef: true },
  saveEmployee: { handler: (ctx, p) => MasterData.saveEmployee(ctx, p), chef: true, write: true },
  listCatalog: { handler: () => MasterData.listCatalog(), chef: true },
  saveCatalogItem: { handler: (ctx, p) => MasterData.saveCatalogItem(ctx, p), chef: true, write: true },
  deleteCatalogItem: { handler: (ctx, p) => MasterData.deleteCatalogItem(ctx, p), chef: true, write: true },
  getSettings: { handler: () => MasterData.getSettings(), chef: true },
  saveSettings: { handler: (ctx, p) => MasterData.saveSettings(ctx, p), chef: true, write: true },

  getDashboard: { handler: (ctx, p) => Dashboard.get(ctx, p), chef: true },
};

/**
 * Web app POST handler.
 * @param {GoogleAppsScript.Events.DoPost} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  return jsonOutput(handleRequest(e && e.postData ? e.postData.contents : ''));
}

/**
 * Health check for GET requests (e.g. opening the /exec URL in the browser).
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doGet() {
  return jsonOutput({ ok: true, data: { service: Config.APP_NAME, status: 'running' } });
}

/**
 * Parses, authenticates, authorizes and dispatches a request.
 * @param {string} body raw request body
 * @returns {{ok: boolean, data?: *, error?: Object}}
 */
function handleRequest(body) {
  let action = '?';
  try {
    RequestCache.clear();
    let req;
    try {
      req = JSON.parse(body || '{}');
    } catch (err) {
      throw new AppError('VALIDATION', 'Ungültige Anfrage.');
    }
    action = String(req.action || '');
    const def = Object.prototype.hasOwnProperty.call(ACTIONS, action) ? ACTIONS[action] : null;
    if (!def) throw new AppError('NOT_FOUND', 'Unbekannte Aktion: ' + action);

    const user = Auth.resolveUser(Auth.verify(req.idToken));
    if (def.chef && user.role !== 'chef') throw new AppError('FORBIDDEN', 'Diese Funktion ist dem Chef vorbehalten.');
    const ctx = { user, isChef: user.role === 'chef' };
    const payload = req.payload && typeof req.payload === 'object' ? req.payload : {};
    const data = def.write ? withScriptLock(() => def.handler(ctx, payload)) : def.handler(ctx, payload);
    return { ok: true, data: data === undefined ? null : data };
  } catch (err) {
    if (err instanceof AppError && err.code !== 'INTERNAL') {
      return { ok: false, error: { code: err.code, message: err.message, details: err.details } };
    }
    console.error('Action ' + action + ' failed: ' + (err && err.stack ? err.stack : err));
    return { ok: false, error: { code: 'INTERNAL', message: 'Interner Fehler: ' + (err && err.message ? err.message : err) } };
  }
}

/**
 * Runs a function under the script lock (serializes all writes).
 * @param {function(): *} fn
 * @returns {*}
 */
function withScriptLock(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(Config.LOCK_TIMEOUT_MS)) {
    throw new AppError('BUSY', 'Der Server ist gerade beschäftigt. Bitte erneut versuchen.');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** @private */
function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
