// Server-side harness: runs Code.js + Coupons.js against an in-memory Google Sheets/GAS mock.
const fs = require('fs'), vm = require('vm'), crypto = require('crypto');
const SRC = require('path').join(__dirname, '..', 'src') + '/';

// ---------- GAS mocks ----------
class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  _grid() { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.sh._get(this.r + i, this.c + j)); out.push(row); } return out; }
  getValues() { return this._grid(); }
  getDisplayValues() { return this._grid().map(r => r.map(v => v instanceof Date ? v.toISOString() : (v === null || v === undefined ? '' : String(v)))); }
  getValue() { return this.sh._get(this.r, this.c); }
  setValue(v) { this.sh._set(this.r, this.c, v); return this; }
  setValues(vs) { vs.forEach((row, i) => row.forEach((v, j) => this.sh._set(this.r + i, this.c + j, v))); return this; }
  setNumberFormat() { return this; } setFontWeight() { return this; } setBackground() { return this; } setFontColor() { return this; }
}
class Sheet {
  constructor(name) { this.name = name; this.rows = []; }
  _get(r, c) { const row = this.rows[r - 1]; const v = row ? row[c - 1] : undefined; return v === undefined ? '' : v; }
  _set(r, c, v) { while (this.rows.length < r) this.rows.push([]); const row = this.rows[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v; }
  getName() { return this.name; } getId() { return 1; }
  getLastRow() { let n = this.rows.length; while (n > 0 && this.rows[n - 1].every(v => v === '' || v === undefined)) n--; return n; }
  getLastColumn() { return this.rows.reduce((m, r) => Math.max(m, r.length), 0); }
  getRange(r, c, nr, nc) { return new Range(this, r, c, nr || 1, nc || 1); }
  getDataRange() { return new Range(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  appendRow(a) { this.rows.push(a.slice()); }
  deleteRow(i) { this.rows.splice(i - 1, 1); }
  deleteColumn(c) { this.rows.forEach(r => r.splice(c - 1, 1)); }
  insertColumnAfter(c) { this.rows.forEach(r => r.splice(c, 0, '')); }
  setFrozenRows() {}
}
const sheets = {};
const ss = {
  getSheetByName: n => sheets[n] || null,
  insertSheet: n => (sheets[n] = new Sheet(n)),
  getSheets: () => Object.values(sheets),
};
const store = () => { const m = {}; return { get: k => (k in m ? m[k] : null), put: (k, v) => { m[k] = String(v); }, remove: k => { delete m[k]; }, removeAll: () => {} }; };
const cache = store();
const propsM = {};
const toBytes = s => Array.from(Buffer.from(s, 'utf8')).map(b => (b > 127 ? b - 256 : b));
const ctx = {
  console, Date, Math, JSON, parseInt, parseFloat, isNaN, Number, String, Array, Object, RegExp, Error, Set, Map, Promise,
  SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() {} },
  CacheService: { getScriptCache: () => ({ get: cache.get, put: (k, v) => cache.put(k, v), remove: cache.remove, removeAll() {} }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in propsM ? propsM[k] : null), setProperty: (k, v) => { propsM[k] = String(v); } }) },
  Session: { getActiveUser: () => ({ getEmail: () => 'tester@example.com' }) },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' },
    computeDigest: (a, s) => Array.from(crypto.createHash('sha256').update(s, 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)),
    computeHmacSha256Signature: (v, k) => Array.from(crypto.createHmac('sha256', k).update(v).digest()).map(b => (b > 127 ? b - 256 : b)),
    base64EncodeWebSafe: x => (Array.isArray(x) ? Buffer.from(x.map(b => (b < 0 ? b + 256 : b))) : Buffer.from(String(x))).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    base64DecodeWebSafe: s => toBytes(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('binary')).map(b => b),
    newBlob: s => ({ getBytes: () => toBytes(s), getDataAsString: () => Buffer.from(s.map ? s.map(b => (b < 0 ? b + 256 : b)) : s).toString('utf8') }),
    getUuid: () => crypto.randomUUID(),
    formatDate: (d, tz, f) => { const p = n => String(n).padStart(2, '0'); const y = d.getFullYear(); return f.replace('yyyy', y).replace('yy', String(y).slice(2)).replace('MM', p(d.getMonth() + 1)).replace('dd', p(d.getDate())).replace('HH', p(d.getHours())).replace('mm', p(d.getMinutes())).replace('ss', p(d.getSeconds())); },
    sleep() {},
  },
  HtmlService: {
    XFrameOptionsMode: { DEFAULT: 0 },
    createHtmlOutputFromFile: n => ({ getContent: () => fs.readFileSync(SRC + n + '.html', 'utf8') }),
    createTemplateFromFile: n => { const t = { _name: n, evaluate: () => ({ setTitle() { return this; }, addMetaTag() { return this; }, setXFrameOptionsMode() { return this; }, html: fs.readFileSync(SRC + n + '.html', 'utf8') }) }; ctx.__lastTemplate = t; return t; },
  },
  DriveApp: {}, UrlFetchApp: {}, ScriptApp: {}, Logger: { log() {} },
};
// Utilities.newBlob(bytes) for decode path: getDataAsString expects byte array
ctx.Utilities.newBlob = (x) => ({
  getBytes: () => (typeof x === 'string' ? toBytes(x) : x),
  getDataAsString: () => Buffer.from((x || []).map ? (typeof x === 'string' ? Buffer.from(x) : x.map(b => (b < 0 ? b + 256 : b))) : x).toString('utf8'),
});
vm.createContext(ctx);
for (const f of ['Code.js', 'Coupons.js']) { let src = fs.readFileSync(SRC + f, 'utf8'); vm.runInContext(src, ctx, { filename: f }); }


module.exports = { ctx, sheets, cache, ss, SRC };
