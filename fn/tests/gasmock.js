// In-memory Google Apps Script mock (adapted from ../f9/tests/gasmock.js).
// Loads every src/*.js into one vm context. Top-level `var`/function globals are readable as ctx.X.
'use strict';
const fs = require('fs'), vm = require('vm'), crypto = require('crypto'), path = require('path');
const SRC = path.join(__dirname, '..', 'src') + path.sep;

class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  _grid() { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.sh._get(this.r + i, this.c + j)); out.push(row); } return out; }
  getValues() { return this._grid(); }
  getDisplayValues() { return this._grid().map(r => r.map(v => v instanceof Date ? v.toISOString() : (v === null || v === undefined ? '' : String(v).replace(/^'/, '')))); }
  getValue() { return this.sh._get(this.r, this.c); }
  getDisplayValue() { return this.getDisplayValues()[0][0]; }
  setValue(v) { this.sh._set(this.r, this.c, v); return this; }
  setValues(vs) { vs.forEach((row, i) => row.forEach((v, j) => this.sh._set(this.r + i, this.c + j, v))); return this; }
  setFontWeight() { return this; } setBackground() { return this; } setFontColor() { return this; } setHorizontalAlignment() { return this; }
}
class Sheet {
  constructor(name) { this.name = name; this.rows = []; this.maxCols = 26; this.maxRows = 1000; }
  _get(r, c) { const row = this.rows[r - 1]; const v = row ? row[c - 1] : undefined; return v === undefined ? '' : v; }
  _set(r, c, v) { while (this.rows.length < r) this.rows.push([]); const row = this.rows[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v; }
  getName() { return this.name; }
  getLastRow() { let n = this.rows.length; while (n > 0 && this.rows[n - 1].every(v => v === '' || v === undefined)) n--; return n; }
  getLastColumn() { return this.rows.reduce((m, r) => Math.max(m, r.length), 0); }
  getMaxColumns() { return this.maxCols; }
  getMaxRows() { return this.maxRows; }
  insertRowsAfter(after, n) { this.maxRows += n; }
  insertColumnsAfter(after, n) { this.maxCols += n; }
  getRange(r, c, nr, nc) { if (r < 1 || c < 1 || c + (nc || 1) - 1 > this.maxCols || r + (nr || 1) - 1 > this.maxRows) throw new Error('The coordinates of the range are outside the dimensions of the sheet.'); return new Range(this, r, c, nr || 1, nc || 1); }
  getDataRange() { return new Range(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  appendRow(a) { this.rows.length = this.getLastRow(); this.rows.push(a.slice()); this.maxCols = Math.max(this.maxCols, a.length); this.maxRows = Math.max(this.maxRows, this.rows.length); }
  deleteRow(i) { this.rows.splice(i - 1, 1); }
  setFrozenRows() {}
}

function createGas() {
  const sheets = {};
  const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = new Sheet(n)), getSheets: () => Object.values(sheets) };
  const cacheMap = {};
  const cache = { get: k => (k in cacheMap ? cacheMap[k] : null), put: (k, v) => { cacheMap[k] = String(v); }, remove: k => { delete cacheMap[k]; }, _map: cacheMap };
  const mail = [], fetches = [], driveFiles = [];
  const lockState = { fail: false };
  const toSigned = buf => Array.from(buf).map(b => (b > 127 ? b - 256 : b));
  const folder = { getId: () => 'folder1', createFile: blob => { const id = 'f' + (driveFiles.length + 1); driveFiles.push({ id, blob }); return { getId: () => id }; } };
  const ctx = {
    console, Date, Math, JSON, parseInt, parseFloat, isNaN, isFinite, Number, String, Array, Object, RegExp, Error, Set, Map, Boolean,
    SpreadsheetApp: { getActive: () => ss, getActiveSpreadsheet: () => ss, flush() {} },
    CacheService: { getScriptCache: () => cache },
    LockService: { getScriptLock: () => ({ waitLock() { if (lockState.fail) throw new Error('Lock timeout'); }, tryLock: () => !lockState.fail, hasLock: () => !lockState.fail, releaseLock() {} }) },
    Session: { getActiveUser: () => ({ getEmail: () => '' }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (a, s) => toSigned(crypto.createHash('sha256').update(typeof s === 'string' ? Buffer.from(s, 'utf8') : Buffer.from(s.map(b => b & 255))).digest()),
      base64Decode: s => toSigned(Buffer.from(String(s), 'base64')),
      newBlob: (bytes, mime, name) => ({ bytes, mime, name, getBytes: () => bytes, getContentType: () => mime, getName: () => name }),
      getUuid: () => crypto.randomUUID(),
    },
    HtmlService: { XFrameOptionsMode: { ALLOWALL: 1 }, createHtmlOutputFromFile: n => ({ getContent: () => fs.readFileSync(SRC + n + '.html', 'utf8') }), createTemplateFromFile: n => ({ evaluate: () => ({ setTitle() { return this; }, setFaviconUrl() { return this; }, addMetaTag() { return this; }, setXFrameOptionsMode() { return this; } }) }) },
    DriveApp: { getFolderById: () => folder, createFolder: () => folder },
    MailApp: { sendEmail: o => mail.push(o) },
    UrlFetchApp: { fetch: (url, opt) => { fetches.push({ url, opt }); return { getResponseCode: () => 200 }; } },
    Logger: { log() {} },
  };
  vm.createContext(ctx);
  for (const f of fs.readdirSync(SRC).filter(f => f.endsWith('.js')).sort()) vm.runInContext(fs.readFileSync(SRC + f, 'utf8'), ctx, { filename: f });
  return { ctx, sheets, ss, cache, mail, fetches, driveFiles, lockState, Sheet };
}

module.exports = { createGas, SRC };
