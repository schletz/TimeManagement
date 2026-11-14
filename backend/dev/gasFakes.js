/**
 * Minimal in-memory fakes of the Apps Script services used by the backend, for local tests and the
 * local dev server. Only the API surface used in backend/src is implemented; formatting calls are no-ops.
 * DocumentApp is not emulated: the loader replaces InvoiceDocument.render with a fake.
 */
'use strict';

const crypto = require('node:crypto');

/** Wraps an object so that unknown methods are chainable no-ops (formatting APIs). */
function lenient(target) {
  return new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      if (typeof prop === 'symbol') return undefined;
      return () => lenient(obj);
    },
  });
}

/** Converts bytes (number array, possibly signed) to a Buffer. */
function toBuffer(bytes) {
  return Buffer.from(bytes.map((b) => (b + 256) % 256));
}

/** Converts a Buffer to the signed byte array Apps Script uses. */
function toSigned(buf) {
  return Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
}

class FakeBlob {
  constructor(bytes, contentType, name) {
    this.bytes = Array.isArray(bytes) ? bytes : toSigned(Buffer.from(String(bytes), 'utf8'));
    this.contentType = contentType || 'application/octet-stream';
    this.name = name || '';
  }
  getBytes() { return this.bytes.slice(); }
  getContentType() { return this.contentType; }
  setContentType(t) { this.contentType = t; return this; }
  getName() { return this.name; }
  setName(n) { this.name = n; return this; }
  getDataAsString() { return toBuffer(this.bytes).toString('utf8'); }
}

function createFakes(options) {
  const opts = Object.assign({ timeZone: 'Europe/Vienna', ownerEmail: 'chef@example.com', clientId: 'test-client-id' }, options);
  const state = { properties: {}, cache: new Map(), files: new Map(), folders: new Map(), spreadsheets: new Map(), mails: [] };
  const newId = (prefix) => prefix + crypto.randomBytes(8).toString('hex');

  // ---------------- Drive ----------------
  function iterator(items) {
    let i = 0;
    return { hasNext: () => i < items.length, next: () => items[i++] };
  }

  class FakeFolder {
    constructor(name, parentId) {
      this.id = newId('fold_');
      this.name = name;
      this.parentId = parentId || null;
      this.trashed = false;
      state.folders.set(this.id, this);
    }
    getId() { return this.id; }
    getName() { return this.name; }
    setName(n) { this.name = n; return this; }
    isTrashed() { return this.trashed; }
    setTrashed(v) { this.trashed = v; return this; }
    createFolder(name) { return new FakeFolder(name, this.id); }
    createFile(blob) { return new FakeFile(blob.getName(), blob.getContentType(), blob.getBytes(), this.id); }
    getFoldersByName(name) {
      return iterator([...state.folders.values()].filter((f) => f.parentId === this.id && f.name === name && !f.trashed));
    }
    getFilesByName(name) {
      return iterator([...state.files.values()].filter((f) => f.parentId === this.id && f.name === name));
    }
  }

  class FakeFile {
    constructor(name, mimeType, bytes, parentId) {
      this.id = newId('file_');
      this.name = name;
      this.mimeType = mimeType;
      this.bytes = bytes;
      this.parentId = parentId || null;
      this.trashed = false;
      state.files.set(this.id, this);
    }
    getId() { return this.id; }
    getName() { return this.name; }
    setName(n) { this.name = n; const ss = state.spreadsheets.get(this.id); if (ss) ss.name = n; return this; }
    getMimeType() { return this.mimeType; }
    isTrashed() { return this.trashed; }
    setTrashed(v) { this.trashed = v; return this; }
    getBlob() { return new FakeBlob(this.bytes, this.mimeType, this.name); }
    moveTo(folder) { this.parentId = folder.getId(); return this; }
    getParents() { return iterator(this.parentId ? [state.folders.get(this.parentId)] : []); }
    makeCopy(name, folder) {
      return new FakeFile(name, this.mimeType, this.bytes.slice(), folder ? folder.getId() : this.parentId);
    }
  }

  const rootFolder = new FakeFolder('My Drive', null);

  const DriveApp = {
    getRootFolder: () => rootFolder,
    createFolder: (name) => rootFolder.createFolder(name),
    getFolderById(id) {
      const f = state.folders.get(id);
      if (!f) throw new Error('No folder with id ' + id);
      return f;
    },
    getFileById(id) {
      const f = state.files.get(id);
      if (!f) throw new Error('No file with id ' + id);
      return f;
    },
  };

  // ---------------- Spreadsheets ----------------
  class FakeRange {
    constructor(sheet, row, col, numRows, numCols) {
      Object.assign(this, { sheet, row, col, numRows, numCols });
    }
    getValues() {
      const out = [];
      for (let r = 0; r < this.numRows; r++) {
        const src = this.sheet.data[this.row - 1 + r] || [];
        const line = [];
        for (let c = 0; c < this.numCols; c++) {
          const v = src[this.col - 1 + c];
          line.push(v === undefined || v === null ? '' : v);
        }
        out.push(line);
      }
      return out;
    }
    setValues(values) {
      if (values.length !== this.numRows || values.some((l) => l.length !== this.numCols)) {
        throw new Error('setValues: dimensions do not match the range');
      }
      if (this.row + this.numRows - 1 > this.sheet.maxRows) throw new Error('Range out of bounds');
      values.forEach((line, r) => {
        const target = this.sheet.data[this.row - 1 + r] || (this.sheet.data[this.row - 1 + r] = []);
        line.forEach((v, c) => {
          // Sheets stores a leading apostrophe as "force text" marker, not as part of the value.
          target[this.col - 1 + c] = typeof v === 'string' && v.startsWith("'") ? v.substring(1) : v;
        });
      });
      return lenient(this);
    }
    setValue(v) { return this.setValues([[v]]); }
  }

  class FakeSheet {
    constructor(name) {
      this.name = name;
      this.data = [];
      this.maxRows = 1000;
    }
    getName() { return this.name; }
    setName(n) { this.name = n; return this; }
    getMaxRows() { return this.maxRows; }
    getLastRow() {
      for (let i = this.data.length - 1; i >= 0; i--) {
        if (this.data[i] && this.data[i].some((v) => v !== '' && v !== null && v !== undefined)) return i + 1;
      }
      return 0;
    }
    getLastColumn() {
      return this.data.reduce((m, r) => Math.max(m, r ? r.length : 0), 0);
    }
    getRange(row, col, numRows, numCols) {
      if (row < 1 || row + (numRows || 1) - 1 > this.maxRows) throw new Error('Range out of bounds: row ' + row);
      return lenient(new FakeRange(this, row, col, numRows || 1, numCols || 1));
    }
    getDataRange() { return this.getRange(1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
    deleteRow(row) {
      if (this.maxRows <= 2) throw new Error('Cannot delete all non-frozen rows');
      this.data.splice(row - 1, 1);
      this.maxRows -= 1;
    }
    insertRowsAfter(after, count) { this.maxRows += count; return this; }
    protect() { return lenient({}); }
  }

  class FakeSpreadsheet {
    constructor(name) {
      this.file = new FakeFile(name, 'application/vnd.google-apps.spreadsheet', [], rootFolder.getId());
      this.id = this.file.getId();
      this.name = name;
      this.sheets = [new FakeSheet('Tabelle1')];
      state.spreadsheets.set(this.id, this);
    }
    getId() { return this.id; }
    getName() { return this.name; }
    getSheets() { return this.sheets.map((s) => lenient(s)); }
    getSheetByName(name) {
      const s = this.sheets.find((x) => x.name === name);
      return s ? lenient(s) : null;
    }
    insertSheet(name) {
      const s = new FakeSheet(name);
      this.sheets.push(s);
      return lenient(s);
    }
    deleteSheet(sheet) { this.sheets = this.sheets.filter((s) => s.name !== sheet.getName()); }
    setSpreadsheetTimeZone() { return this; }
  }

  const SpreadsheetApp = {
    create: (name) => new FakeSpreadsheet(name),
    openById(id) {
      const ss = state.spreadsheets.get(id);
      if (!ss) throw new Error('No spreadsheet with id ' + id);
      return ss;
    },
  };

  // ---------------- Utilities and other services ----------------
  function formatDate(date, tz, pattern) {
    const parts = {};
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).forEach((p) => { parts[p.type] = p.value; });
    return pattern.replace(/'([^']*)'|yyyy|MM|dd|HH|mm|ss/g, (m, lit) => {
      if (lit !== undefined) return lit;
      return { yyyy: parts.year, MM: parts.month, dd: parts.day, HH: parts.hour, mm: parts.minute, ss: parts.second }[m];
    });
  }

  const Utilities = {
    DigestAlgorithm: { SHA_256: 'sha256' },
    Charset: { UTF_8: 'utf8' },
    getUuid: () => crypto.randomUUID(),
    formatDate,
    base64Encode: (data) => (typeof data === 'string' ? Buffer.from(data, 'utf8') : toBuffer(data)).toString('base64'),
    base64Decode: (s) => toSigned(Buffer.from(s, 'base64')),
    base64DecodeWebSafe: (s) => toSigned(Buffer.from(s, 'base64url')),
    newBlob: (data, type, name) => new FakeBlob(data, type, name),
    computeDigest: (alg, value) => toSigned(crypto.createHash(alg).update(String(value), 'utf8').digest()),
  };

  const scriptCache = {
    get: (k) => { const e = state.cache.get(k); return e && e.until > Date.now() ? e.value : null; },
    getAll: (keys) => {
      const out = {};
      keys.forEach((k) => { const v = scriptCache.get(k); if (v !== null) out[k] = v; });
      return out;
    },
    put: (k, v, ttl) => { state.cache.set(k, { value: String(v), until: Date.now() + (ttl || 600) * 1000 }); },
    putAll: (obj, ttl) => Object.keys(obj).forEach((k) => scriptCache.put(k, obj[k], ttl)),
    remove: (k) => { state.cache.delete(k); },
  };

  const scriptProperties = {
    getProperty: (k) => (k in state.properties ? state.properties[k] : null),
    setProperty: (k, v) => { state.properties[k] = String(v); return scriptProperties; },
    getProperties: () => Object.assign({}, state.properties),
    deleteProperty: (k) => { delete state.properties[k]; return scriptProperties; },
  };

  function response(code, body, bytes) {
    return {
      getResponseCode: () => code,
      getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body)),
      getContent: () => bytes || toSigned(Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))),
      getBlob: () => new FakeBlob(bytes || [], 'application/octet-stream', ''),
    };
  }

  /**
   * Routes the URLs the backend calls: tokeninfo (accepts unsigned dev tokens) and the Drive REST API.
   */
  function fetch(url) {
    if (url.startsWith('https://oauth2.googleapis.com/tokeninfo')) {
      const token = decodeURIComponent(url.split('id_token=')[1] || '');
      const parts = token.split('.');
      try {
        const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        if (claims.exp * 1000 < Date.now()) return response(400, { error: 'invalid_token' });
        return response(200, Object.assign({ iss: 'https://accounts.google.com', email_verified: 'true' }, claims, {
          exp: String(claims.exp), email_verified: String(claims.email_verified !== false),
        }));
      } catch (e) {
        return response(400, { error: 'invalid_token' });
      }
    }
    let m = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^/?]+)\?fields=thumbnailLink$/);
    if (m) {
      const file = state.files.get(decodeURIComponent(m[1]));
      return file ? response(200, { thumbnailLink: 'fake://thumb/' + file.id + '=s220' }) : response(404, {});
    }
    m = url.match(/^fake:\/\/thumb\/([^=]+)=s\d+$/);
    if (m) {
      const file = state.files.get(m[1]);
      return file ? response(200, '', file.bytes) : response(404, {});
    }
    m = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^/?]+)\/export/);
    if (m) {
      const bytes = toSigned(Buffer.from('FAKE-DOCX ' + m[1]));
      return Object.assign(response(200, '', bytes), {
        getBlob: () => new FakeBlob(bytes, 'application/octet-stream', 'export.docx'),
      });
    }
    return response(404, { error: 'not emulated: ' + url });
  }

  const services = {
    DriveApp,
    SpreadsheetApp,
    Utilities,
    CacheService: { getScriptCache: () => scriptCache },
    PropertiesService: { getScriptProperties: () => scriptProperties },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
    Session: {
      getEffectiveUser: () => ({ getEmail: () => opts.ownerEmail }),
      getScriptTimeZone: () => opts.timeZone,
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (content) => {
        const out = { content, mime: 'text/plain' };
        out.getContent = () => out.content;
        out.setMimeType = (m) => { out.mime = m; return out; };
        return out;
      },
    },
    MailApp: {
      sendEmail: (msg) => { state.mails.push(msg); },
      getRemainingDailyQuota: () => 100,
    },
    UrlFetchApp: {
      fetch: (url) => fetch(url),
      fetchAll: (requests) => requests.map((r) => fetch(r.url)),
    },
    ScriptApp: { getOAuthToken: () => 'fake-oauth-token' },
  };

  return { services, state, options: opts };
}

/**
 * Builds an unsigned JWT for the emulated tokeninfo endpoint.
 * @param {string} email
 * @param {string} clientId
 * @param {number} [lifetimeSeconds=3600]
 * @returns {string}
 */
function devToken(email, clientId, lifetimeSeconds) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return enc({ alg: 'none', typ: 'JWT' }) + '.'
    + enc({ email, aud: clientId, iss: 'https://accounts.google.com', email_verified: true, iat: now, exp: now + (lifetimeSeconds || 3600) })
    + '.dev';
}

module.exports = { createFakes, devToken, FakeBlob };
