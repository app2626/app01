import crypto from 'node:crypto';

function toBytes(str) {
  return Array.from(Buffer.from(String(str), 'utf8')).map(b => (b > 127 ? b - 256 : b));
}

function fromSignedBytes(arr) {
  return Buffer.from(arr.map(b => (b < 0 ? b + 256 : b) & 255));
}

class Range {
  constructor(sh, r, c, nr, nc) {
    this.sh = sh;
    this.r = r;
    this.c = c;
    this.nr = nr;
    this.nc = nc;
  }
  _grid() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) row.push(this.sh._get(this.r + i, this.c + j));
      out.push(row);
    }
    return out;
  }
  getValues() { return this._grid(); }
  getDisplayValues() {
    return this._grid().map(r => r.map(v => (v instanceof Date ? v.toISOString() : (v === null || v === undefined ? '' : String(v)))));
  }
  getValue() { return this.sh._get(this.r, this.c); }
  setValue(v) { this.sh._set(this.r, this.c, v); return this; }
  setValues(vs) {
    vs.forEach((row, i) => row.forEach((v, j) => this.sh._set(this.r + i, this.c + j, v)));
    return this;
  }
  setNumberFormat() { return this; }
  getNumberFormat() { return ''; }
  setFontWeight() { return this; }
  setBackground() { return this; }
  setFontColor() { return this; }
}

class Sheet {
  constructor(name, rows, onDirty) {
    this.name = name;
    this.rows = rows || [];
    this._onDirty = onDirty;
  }
  _markDirty() { this._onDirty(this.name); }
  _get(r, c) {
    const row = this.rows[r - 1];
    const v = row ? row[c - 1] : undefined;
    return v === undefined ? '' : v;
  }
  _set(r, c, v) {
    while (this.rows.length < r) this.rows.push([]);
    const row = this.rows[r - 1];
    while (row.length < c) row.push('');
    row[c - 1] = v instanceof Date ? v.toISOString() : v;
    this._markDirty();
  }
  getName() { return this.name; }
  getId() { return 1; }
  getLastRow() {
    let n = this.rows.length;
    while (n > 0 && this.rows[n - 1].every(v => v === '' || v === undefined || v === null)) n--;
    return n;
  }
  getLastColumn() {
    return this.rows.reduce((m, r) => Math.max(m, r.length), 0);
  }
  getRange(r, c, nr, nc) {
    return new Range(this, r, c, nr || 1, nc || 1);
  }
  getDataRange() {
    return new Range(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1));
  }
  appendRow(a) {
    this.rows.push(a.map(v => (v instanceof Date ? v.toISOString() : v)));
    this._markDirty();
  }
  deleteRow(i) {
    this.rows.splice(i - 1, 1);
    this._markDirty();
  }
  clearContents() {
    this.rows = [];
    this._markDirty();
  }
  deleteColumn(c) {
    this.rows.forEach(r => r.splice(c - 1, 1));
    this._markDirty();
  }
  insertColumnAfter(c) {
    this.rows.forEach(r => { while (r.length < c) r.push(''); r.splice(c, 0, ''); });
    this._markDirty();
  }
  moveColumns(range, dest) {
    const from = range.c, n = range.nc, w = this.getLastColumn();
    this.rows.forEach(r => {
      while (r.length < w) r.push('');
      const cut = r.splice(from - 1, n);
      const at = (dest > from ? dest - n : dest) - 1;
      r.splice(at, 0, ...cut);
    });
    this._markDirty();
  }
  setFrozenRows() {}
  getMaxRows() { return Math.max(1000, this.rows.length + 100); }
}

function formatInTimezone(date, tz, fmt) {
  const d = date instanceof Date ? date : new Date(date);
  // Default to Asia/Bangkok (GMT+7) for GAS Thailand locale
  let offsetMs = 7 * 3600 * 1000;
  if (tz && /^UTC$/i.test(tz)) offsetMs = 0;
  else if (tz && /^GMT([+-]\d+)$/i.test(tz)) {
    const m = tz.match(/^GMT([+-]\d+)$/i);
    offsetMs = parseInt(m[1], 10) * 3600 * 1000;
  }
  const shifted = new Date(d.getTime() + offsetMs);
  const p = n => String(n).padStart(2, '0');
  const y = shifted.getUTCFullYear();
  return fmt
    .replace('yyyy', String(y))
    .replace('yy', String(y).slice(2))
    .replace('MM', p(shifted.getUTCMonth() + 1))
    .replace('dd', p(shifted.getUTCDate()))
    .replace('HH', p(shifted.getUTCHours()))
    .replace('mm', p(shifted.getUTCMinutes()))
    .replace('ss', p(shifted.getUTCSeconds()));
}

const LOCK_KEY = 'lock:global';
const LOCK_TTL_MS = 30000;
const LOCK_WAIT_MS = 10000;

export async function acquireD1Lock(db, ttlMs = LOCK_TTL_MS, waitMs = LOCK_WAIT_MS) {
  const token = crypto.randomUUID();
  const deadline = Date.now() + waitMs;
  while (true) {
    const now = Date.now();
    const exp = now + ttlMs;
    const [, selRes] = await db.batch([
      db.prepare(
        'INSERT INTO kv_store (key, value, expires_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at WHERE kv_store.expires_at IS NOT NULL AND kv_store.expires_at <= ?'
      ).bind(LOCK_KEY, token, exp, now),
      db.prepare('SELECT value FROM kv_store WHERE key = ?').bind(LOCK_KEY)
    ]);
    const row = selRes && selRes.results && selRes.results[0];
    if (row && row.value === token) return token;
    if (Date.now() >= deadline) return null;
    await new Promise(r => setTimeout(r, 60 + Math.floor(Math.random() * 60)));
  }
}

export async function releaseD1Lock(db, token) {
  if (!token) return;
  try {
    await db.prepare('DELETE FROM kv_store WHERE key = ? AND value = ?').bind(LOCK_KEY, token).run();
  } catch (e) {}
}

export class D1GasEnv {
  constructor(db, appUrl, ctx, authSecret) {
    this.db = db;
    this.appUrl = appUrl || '';
    this.ctx = ctx || null;
    this.authSecret = authSecret || '';
    this.sheets = {};
    this.originalRowsJson = new Map();
    this.dirtySheets = new Set();
    this.props = new Map();
    this.dirtyProps = new Map();
    this.cache = new Map();
    this.dirtyCache = new Map();
    this.pendingImages = [];
  }

  async load(sheetFilter) {
    const now = Date.now();
    const sheetStmt = Array.isArray(sheetFilter) && sheetFilter.length > 0
      ? this.db.prepare(`SELECT sheet_name, row_idx, row_json FROM sheet_rows WHERE sheet_name IN (${sheetFilter.map(() => '?').join(', ')}) ORDER BY sheet_name, row_idx`).bind(...sheetFilter)
      : this.db.prepare('SELECT sheet_name, row_idx, row_json FROM sheet_rows ORDER BY sheet_name, row_idx');

    const [rowsRes, kvRes] = await this.db.batch([
      sheetStmt,
      this.db.prepare('SELECT key, value, expires_at FROM kv_store WHERE expires_at IS NULL OR expires_at > ?').bind(now)
    ]);

    const grouped = {};
    const groupedJson = {};
    for (const r of (rowsRes.results || [])) {
      if (!grouped[r.sheet_name]) {
        grouped[r.sheet_name] = [];
        groupedJson[r.sheet_name] = [];
      }
      groupedJson[r.sheet_name].push(r.row_json);
      grouped[r.sheet_name].push(JSON.parse(r.row_json));
    }
    const markDirty = (name) => this.dirtySheets.add(name);
    for (const [name, rows] of Object.entries(grouped)) {
      this.sheets[name] = new Sheet(name, rows, markDirty);
      this.originalRowsJson.set(name, groupedJson[name]);
    }

    for (const kv of (kvRes.results || [])) {
      if (kv.key.startsWith('prop:')) {
        this.props.set(kv.key.slice(5), kv.value);
      } else if (kv.key.startsWith('cache:')) {
        this.cache.set(kv.key.slice(6), kv.value);
      }
    }
  }

  async flush() {
    const stmts = [];
    const now = Date.now();

    for (const sheetName of this.dirtySheets) {
      const sh = this.sheets[sheetName];
      const orig = this.originalRowsJson.get(sheetName) || [];
      const newRows = sh ? sh.rows.map(r => JSON.stringify(r)) : [];

      // Delete only trailing rows if sheet shrank
      if (newRows.length < orig.length) {
        stmts.push(
          this.db.prepare('DELETE FROM sheet_rows WHERE sheet_name = ? AND row_idx > ?').bind(sheetName, newRows.length)
        );
      }

      // Row-level diff: only upsert rows that changed or were newly added
      const changed = [];
      for (let i = 0; i < newRows.length; i++) {
        if (i >= orig.length || newRows[i] !== orig[i]) {
          changed.push({ idx: i + 1, json: newRows[i] });
        }
      }

      // Cloudflare D1 limits bound SQL variables to 100 per statement (25 rows * 3 cols = 75)
      const CHUNK = 25;
      for (let i = 0; i < changed.length; i += CHUNK) {
        const slice = changed.slice(i, i + CHUNK);
        const placeholders = slice.map(() => '(?, ?, ?)').join(', ');
        const params = [];
        for (const item of slice) {
          params.push(sheetName, item.idx, item.json);
        }
        stmts.push(
          this.db.prepare(`INSERT OR REPLACE INTO sheet_rows (sheet_name, row_idx, row_json) VALUES ${placeholders}`).bind(...params)
        );
      }

      this.originalRowsJson.set(sheetName, newRows);
    }

    for (const [k, v] of this.dirtyProps.entries()) {
      const dbKey = 'prop:' + k;
      if (v === null) {
        stmts.push(this.db.prepare('DELETE FROM kv_store WHERE key = ?').bind(dbKey));
      } else {
        stmts.push(this.db.prepare('INSERT OR REPLACE INTO kv_store (key, value, expires_at) VALUES (?, ?, NULL)').bind(dbKey, String(v)));
      }
    }

    for (const [k, entry] of this.dirtyCache.entries()) {
      const dbKey = 'cache:' + k;
      if (entry === null) {
        stmts.push(this.db.prepare('DELETE FROM kv_store WHERE key = ?').bind(dbKey));
      } else {
        stmts.push(this.db.prepare('INSERT OR REPLACE INTO kv_store (key, value, expires_at) VALUES (?, ?, ?)').bind(dbKey, String(entry.value), entry.expiresAt));
      }
    }

    for (const img of this.pendingImages) {
      stmts.push(
        this.db.prepare('INSERT INTO uploaded_images (id, file_name, mime_type, data_base64, created_at) VALUES (?, ?, ?, ?, ?)')
          .bind(img.id, img.fileName, img.mimeType, img.dataBase64, now)
      );
    }

    for (let i = 0; i < stmts.length; i += 50) {
      await this.db.batch(stmts.slice(i, i + 50));
    }
    this.dirtySheets.clear();
    this.dirtyProps.clear();
    this.dirtyCache.clear();
    this.pendingImages.length = 0;
  }

  createGasGlobals() {
    const self = this;
    const markDirty = (name) => self.dirtySheets.add(name);

    const ss = {
      getSheetByName: (n) => self.sheets[n] || null,
      insertSheet: (n) => {
        const sh = new Sheet(n, [], markDirty);
        self.sheets[n] = sh;
        self.dirtySheets.add(n);
        return sh;
      },
      getSheets: () => Object.values(self.sheets)
    };

    const SpreadsheetApp = {
      getActiveSpreadsheet: () => ss,
      flush: () => {}
    };

    const CacheService = {
      getScriptCache: () => ({
        get: (k) => (self.cache.has(k) ? self.cache.get(k) : null),
        put: (k, v, ttlSec) => {
          const val = String(v);
          const expiresAt = Date.now() + ((ttlSec || 21600) * 1000);
          self.cache.set(k, val);
          self.dirtyCache.set(k, { value: val, expiresAt });
        },
        remove: (k) => {
          self.cache.delete(k);
          self.dirtyCache.set(k, null);
        },
        removeAll: (keys) => {
          if (Array.isArray(keys)) {
            for (const k of keys) {
              self.cache.delete(k);
              self.dirtyCache.set(k, null);
            }
          }
        }
      })
    };

    const LockService = {
      getScriptLock: () => ({
        waitLock: () => {},
        tryLock: () => true,
        releaseLock: () => {}
      })
    };

    const PropertiesService = {
      getScriptProperties: () => ({
        getProperty: (k) => {
          if (k === 'MPOS_SECRET_KEY' && self.authSecret) return self.authSecret;
          return self.props.has(k) ? self.props.get(k) : null;
        },
        setProperty: (k, v) => {
          const val = String(v);
          self.props.set(k, val);
          self.dirtyProps.set(k, val);
        },
        deleteProperty: (k) => {
          self.props.delete(k);
          self.dirtyProps.set(k, null);
        }
      })
    };

    const Session = {
      getActiveUser: () => ({ getEmail: () => 'cloudflare-worker@local' })
    };

    const Utilities = {
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (_alg, s) => Array.from(crypto.createHash('sha256').update(String(s), 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)),
      computeHmacSha256Signature: (v, k) => {
        const keyBuf = Array.isArray(k) ? fromSignedBytes(k) : Buffer.from(String(k), 'utf8');
        const valBuf = Array.isArray(v) ? fromSignedBytes(v) : Buffer.from(String(v), 'utf8');
        return Array.from(crypto.createHmac('sha256', keyBuf).update(valBuf).digest()).map(b => (b > 127 ? b - 256 : b));
      },
      base64EncodeWebSafe: (x) => {
        const buf = Array.isArray(x) ? fromSignedBytes(x) : Buffer.from(String(x), 'utf8');
        return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
      },
      base64Decode: (s) => Array.from(Buffer.from(String(s), 'base64')).map(b => (b > 127 ? b - 256 : b)),
      base64DecodeWebSafe: (s) => {
        const b64 = String(s).replace(/-/g, '+').replace(/_/g, '/');
        return Array.from(Buffer.from(b64, 'base64')).map(b => (b > 127 ? b - 256 : b));
      },
      newBlob: (x, mimeType, name) => ({
        getBytes: () => (typeof x === 'string' ? toBytes(x) : x),
        getDataAsString: () => (typeof x === 'string' ? x : fromSignedBytes(x).toString('utf8')),
        getContentType: () => mimeType || 'application/octet-stream',
        getName: () => name || 'file'
      }),
      getUuid: () => crypto.randomUUID(),
      pbkdf2Hex: (password, salt, rounds) => crypto.pbkdf2Sync(String(password), String(salt), rounds, 32, 'sha256').toString('hex'),
      formatDate: (d, tz, f) => formatInTimezone(d, tz, f),
      sleep: () => {}
    };

    const virtualFolder = {
      createFile: (blob) => {
        const id = crypto.randomUUID().replace(/-/g, '');
        const bytes = blob.getBytes();
        const dataBase64 = fromSignedBytes(bytes).toString('base64');
        if (dataBase64.length > 900 * 1024) {
          throw new Error('ไฟล์รูปภาพหลังบีบอัดใหญ่เกินขีดจำกัดฐานข้อมูล (เกิน 900KB) กรุณาลดขนาดรูปหรือใช้ไฟล์ JPG/WebP');
        }
        self.pendingImages.push({
          id,
          fileName: blob.getName(),
          mimeType: blob.getContentType(),
          dataBase64
        });
        return {
          getId: () => id,
          setSharing: () => {},
          setTrashed: () => {}
        };
      }
    };

    const DriveApp = {
      Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
      Permission: { VIEW: 'VIEW' },
      getFolderById: () => virtualFolder,
      getFoldersByName: () => ({ hasNext: () => true, next: () => virtualFolder }),
      createFolder: () => virtualFolder
    };

    const HtmlService = {
      XFrameOptionsMode: { DEFAULT: 0 },
      createHtmlOutputFromFile: () => ({ getContent: () => '' }),
      createTemplateFromFile: () => ({
        evaluate: () => ({
          setTitle() { return this; },
          addMetaTag() { return this; },
          setXFrameOptionsMode() { return this; },
          setFaviconUrl() { return this; }
        })
      })
    };

    const ScriptApp = {
      getService: () => ({ getUrl: () => self.appUrl })
    };

    const UrlFetchApp = {
      fetch: (targetUrl, opts) => {
        const method = ((opts && opts.method) || 'GET').toUpperCase();
        const headers = {};
        if (opts && opts.contentType) headers['Content-Type'] = opts.contentType;
        if (opts && opts.headers) Object.assign(headers, opts.headers);
        const p = fetch(targetUrl, {
          method,
          headers,
          body: opts && opts.payload !== undefined ? opts.payload : undefined
        }).catch(() => {});
        if (self.ctx && typeof self.ctx.waitUntil === 'function') {
          self.ctx.waitUntil(p);
        }
        return { getResponseCode: () => 200, getContentText: () => '{}' };
      }
    };

    const Logger = { log: (...args) => console.log(...args) };

    return {
      SpreadsheetApp,
      CacheService,
      LockService,
      PropertiesService,
      Session,
      Utilities,
      DriveApp,
      HtmlService,
      ScriptApp,
      UrlFetchApp,
      Logger
    };
  }
}
