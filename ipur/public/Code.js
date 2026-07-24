var SPREADSHEET_ID = '1g6NZTD4zlaH9LZFc00Od_X3pYYwvE05QrkPIPFy5zzw';

var SHEET_META = {
  Cost: { headerRow: 1, dataStartRow: 2 },
  PriceSet: { headerRow: 2, dataStartRow: 3 },
  // Entirely fed by one IMPORTRANGE formula anchored in row 1 that spills across
  // all 12 columns (A:L) and every data row — no cell here can be edited without
  // breaking the import, so this sheet is view/search only (see getRecords/
  // saveRecord/deleteRecord's meta.readOnly checks).
  'Code ส่วนลด': { headerRow: 2, dataStartRow: 3, readOnly: true },
};

// Curated for compact table display only — describeSheet() still returns every
// column (for the edit form); a header that fails to match here just won't be
// shown as a table column, it stays editable via the "+ เพิ่มข้อมูล"/แก้ไข form.
var PRIMARY_LABELS = {
  Cost: ['Brand', 'Model / SKU', 'FullDescription', 'Price RRP', 'Margin %', 'Cost (InVat) ฿', 'Stock onhand', 'Status'],
  PriceSet: ['Location', 'Brand', 'Model / SKU', 'FullDescription', 'Price RRP', 'ราคาขายสุทธิ', 'Cost B', 'MG%', 'Stock'],
  'Code ส่วนลด': ['CHANEL', 'BRAND', 'NEW SKU', 'PROMOTION NAME', 'เงื่อนไข', 'การวางบิล'],
};

// Per-sheet filter bar config. 'select' = dropdown of distinct values (getFilterOptions
// scans the column for these); 'text' = free contains-match input, no options needed.
var FILTER_FIELDS = {
  Cost: [
    { key: 'Brand', mode: 'select' },
    { key: 'FullDescription', mode: 'text' },
  ],
  PriceSet: [
    { key: 'Location', mode: 'select' },
    { key: 'Brand', mode: 'select' },
    { key: 'FullDescription', mode: 'text' },
  ],
  'Code ส่วนลด': [
    { key: 'CAT', mode: 'select' },
    { key: 'CHANEL', mode: 'select' },
    { key: 'BRAND', mode: 'select' },
  ],
};

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Cost / PriceSet Manager')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

// ---------- auth helpers ----------

function hashPassword(password) {
  var salt = 'Ipur2026!@#';
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + salt);
  var hex = '';
  for (var i = 0; i < digest.length; i++) {
    var v = digest[i];
    if (v < 0) v += 256;
    var s = v.toString(16);
    if (s.length === 1) s = '0' + s;
    hex += s;
  }
  return hex;
}

function getSecretKey() {
  var key = PropertiesService.getScriptProperties().getProperty('IPUR_SECRET_KEY');
  if (!key) {
    key = Utilities.getUuid() + Utilities.getUuid();
    PropertiesService.getScriptProperties().setProperty('IPUR_SECRET_KEY', key);
  }
  return key;
}

function generateToken(username) {
  var payloadStr = JSON.stringify({ Username: username, exp: Date.now() + 1000 * 60 * 60 * 12 });
  var payloadB64 = Utilities.base64EncodeWebSafe(Utilities.newBlob(payloadStr).getBytes());
  var sig = Utilities.computeHmacSha256Signature(payloadB64, getSecretKey());
  var sigB64 = Utilities.base64EncodeWebSafe(sig);
  return payloadB64 + '.' + sigB64;
}

function verifyToken(token) {
  if (!token) return null;
  var parts = token.split('.');
  if (parts.length !== 2) return null;
  var expectedSig = Utilities.computeHmacSha256Signature(parts[0], getSecretKey());
  var expectedSigB64 = Utilities.base64EncodeWebSafe(expectedSig);
  if (expectedSigB64 !== parts[1]) return null;
  var payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
  if (Date.now() > payload.exp) return null;
  return payload;
}

function generateId(prefix) {
  return prefix + '-' + Utilities.formatDate(new Date(), 'GMT+7', 'yyMMddHHmmss') + '-' + Math.floor(100 + Math.random() * 900);
}

function logAudit(ss, user, action, details) {
  var sheet = ss.getSheetByName('AuditLog');
  if (!sheet) return;
  sheet.appendRow([generateId('LOG'), new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }), user, action, details]);
}

// Creates Users/AuditLog if missing and seeds one Admin account on first run.
// Idempotent — cheap getSheetByName checks, safe to call on every request.
function ensureSupportSheets(ss) {
  var usersSheet = ss.getSheetByName('Users');
  if (!usersSheet) {
    usersSheet = ss.insertSheet('Users');
    usersSheet.appendRow(['Username', 'PasswordHash', 'Role']);
    usersSheet.getRange(1, 1, 1, 3).setFontWeight('bold');
    var seedPassword = Utilities.getUuid().slice(0, 8);
    usersSheet.appendRow(['admin', hashPassword(seedPassword), 'Admin']);
    PropertiesService.getScriptProperties().setProperty('IPUR_SEED_ADMIN_PASSWORD', seedPassword);
  }
  var auditSheet = ss.getSheetByName('AuditLog');
  if (!auditSheet) {
    auditSheet = ss.insertSheet('AuditLog');
    auditSheet.appendRow(['LogID', 'Timestamp', 'User', 'Action', 'Details']);
    auditSheet.getRange(1, 1, 1, 5).setFontWeight('bold');
  }
}

function readTable(sheet) {
  if (!sheet) return [];
  var data = sheet.getDataRange().getDisplayValues();
  if (data.length <= 1) return [];
  var headers = data[0].map(function (h) { return h.toString().trim(); });
  return data.slice(1).map(function (row) {
    var obj = {};
    headers.forEach(function (h, i) { obj[h] = row[i]; });
    return obj;
  });
}

// ---------- sheet schema / RowUID ----------

function getHeaders(sheet, headerRow) {
  var lastCol = sheet.getLastColumn();
  return sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0].map(function (h) { return h.toString().trim(); });
}

// RowUID is always the last column. Adds it (and backfills existing rows) the
// first time a sheet is touched; a no-op on every call after that.
function ensureRowUidColumn(sheet, meta) {
  var headers = getHeaders(sheet, meta.headerRow);
  var uidCol = headers.indexOf('RowUID') + 1;
  if (uidCol === 0) {
    uidCol = sheet.getLastColumn() + 1;
    sheet.getRange(meta.headerRow, uidCol).setValue('RowUID');
    headers.push('RowUID');
  }
  var lastRow = sheet.getLastRow();
  if (lastRow >= meta.dataStartRow) {
    var count = lastRow - meta.dataStartRow + 1;
    var range = sheet.getRange(meta.dataStartRow, uidCol, count, 1);
    var values = range.getValues();
    var changed = false;
    for (var i = 0; i < values.length; i++) {
      if (!values[i][0]) {
        values[i][0] = Utilities.getUuid();
        changed = true;
      }
    }
    if (changed) range.setValues(values);
  }
  return { headers: headers, uidCol: uidCol };
}

// Cheap header lookup for read paths (GET_RECORDS/GET_FILTER_OPTIONS), which run
// on every keystroke/page/sort — this skips ensureRowUidColumn's full-column
// backfill scan, since backfilling only ever needs to happen once (it already
// runs on every saveRecord/deleteRecord, so new/blank UIDs get caught there).
function getReadHeaders(sheet, meta) {
  var headers = getHeaders(sheet, meta.headerRow);
  if (headers.indexOf('RowUID') === -1) {
    // First-ever touch of this sheet — fall back to the full one-time setup.
    return ensureRowUidColumn(sheet, meta).headers;
  }
  return headers;
}

function normalizeCell(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, 'GMT+7', 'dd/MM/yyyy');
  }
  return value;
}

// Column metadata: which columns are formulas (read-only), which have
// dropdown validation, and an inferred type — all detected at runtime so the
// UI stays correct if the sheet's structure changes.
function inferTypeFromValue(v) {
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  if (Object.prototype.toString.call(v) === '[object Date]') return 'date';
  if (v === 'TRUE' || v === 'FALSE') return 'boolean';
  return null;
}

function getColumnMeta(sheet, meta, headers) {
  var lastRow = sheet.getLastRow();
  var hasSample = lastRow >= meta.dataStartRow;
  var sampleCount = hasSample ? Math.min(20, lastRow - meta.dataStartRow + 1) : 0;
  // Some columns here are a single ARRAYFORMULA anchored in the HEADER cell
  // (e.g. ={"Status"; ARRAYFORMULA(...)}) that spills its own header label
  // AND every data row below it — the spilled data cells report no formula
  // of their own via getFormulas(), so the header row must be sampled too or
  // writing into a "spilled" cell silently blocks the whole column's spill.
  var headerFormulaRow = sheet.getRange(meta.headerRow, 1, 1, headers.length).getFormulas()[0];
  var formulaRows = hasSample ? sheet.getRange(meta.dataStartRow, 1, sampleCount, headers.length).getFormulas() : [];
  var valueRows = hasSample ? sheet.getRange(meta.dataStartRow, 1, sampleCount, headers.length).getValues() : [];
  var validationRow = sheet.getRange(meta.dataStartRow, 1, 1, headers.length).getDataValidations()[0];

  return headers.map(function (label, i) {
    if (label === 'RowUID') return { key: label, label: label, editable: false, type: 'text', internal: true };

    var editable = !headerFormulaRow[i] && !formulaRows.some(function (row) { return row[i]; });
    var type = 'text';
    var options = null;

    var validation = validationRow[i];
    if (validation) {
      var criteria = validation.getCriteriaType();
      if (criteria === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
        type = 'select';
        options = validation.getCriteriaValues()[0];
      }
    }
    if (type === 'text') {
      // Blank cells don't reveal a type — scan sample rows for the first one that does.
      for (var r = 0; r < valueRows.length; r++) {
        var inferred = inferTypeFromValue(valueRows[r][i]);
        if (inferred) { type = inferred; break; }
      }
    }
    return { key: label, label: label, editable: editable, type: type, options: options };
  });
}

function describeSheet(sheetName, ss) {
  var meta = SHEET_META[sheetName];
  if (!meta) throw new Error('Unknown sheet: ' + sheetName);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);

  var columns;
  if (meta.readOnly) {
    var headers = getHeaders(sheet, meta.headerRow);
    columns = getColumnMeta(sheet, meta, headers).map(function (c) {
      c.editable = false;
      return c;
    });
  } else {
    var uidInfo = ensureRowUidColumn(sheet, meta);
    columns = getColumnMeta(sheet, meta, uidInfo.headers).filter(function (c) { return !c.internal; });
  }

  var primaryLabels = PRIMARY_LABELS[sheetName] || [];
  columns.forEach(function (c) { c.primary = primaryLabels.indexOf(c.label) !== -1; });
  if (!columns.some(function (c) { return c.primary; })) {
    columns.slice(0, 8).forEach(function (c) { c.primary = true; });
  }
  return columns;
}

// ---------- records ----------

function getRecords(sheetName, opts, ss) {
  var meta = SHEET_META[sheetName];
  if (!meta) throw new Error('Unknown sheet: ' + sheetName);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);
  var headers = meta.readOnly ? getHeaders(sheet, meta.headerRow) : getReadHeaders(sheet, meta);

  var lastRow = sheet.getLastRow();
  var rows = [];
  if (lastRow >= meta.dataStartRow) {
    var values = sheet.getRange(meta.dataStartRow, 1, lastRow - meta.dataStartRow + 1, headers.length).getValues();
    rows = values.map(function (row) {
      var obj = {};
      headers.forEach(function (h, i) { obj[h] = normalizeCell(row[i]); });
      return obj;
    });
  }

  var filterFields = FILTER_FIELDS[sheetName] || [];
  var filters = opts.filters || {};
  filterFields.forEach(function (field) {
    var raw = filters[field.key];
    if (raw === undefined || raw === null || raw === '') return;
    if (field.mode === 'select') {
      rows = rows.filter(function (row) {
        return String(row[field.key] == null ? '' : row[field.key]).trim() === String(raw).trim();
      });
    } else {
      var needle = String(raw).trim().toLowerCase();
      rows = rows.filter(function (row) {
        return String(row[field.key] == null ? '' : row[field.key]).toLowerCase().indexOf(needle) !== -1;
      });
    }
  });

  var search = (opts.search || '').toString().trim().toLowerCase();
  if (search) {
    rows = rows.filter(function (row) {
      return headers.some(function (h) {
        return String(row[h] == null ? '' : row[h]).toLowerCase().indexOf(search) !== -1;
      });
    });
  }

  var sortKey = opts.sortKey;
  if (sortKey && headers.indexOf(sortKey) !== -1) {
    var dir = opts.sortDir === 'desc' ? -1 : 1;
    rows.sort(function (a, b) {
      var av = a[sortKey], bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av == null ? '' : av).localeCompare(String(bv == null ? '' : bv)) * dir;
    });
  }

  var total = rows.length;
  var pageSize = opts.pageSize || 25;
  var page = opts.page || 1;
  var start = (page - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), total: total };
}

// Distinct values for each 'select'-mode filter field, for populating dropdowns.
// 'text'-mode fields (free contains-match) don't need an options list.
function getFilterOptions(sheetName, ss) {
  var meta = SHEET_META[sheetName];
  if (!meta) throw new Error('Unknown sheet: ' + sheetName);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);
  var fields = (FILTER_FIELDS[sheetName] || []).filter(function (f) { return f.mode === 'select'; });

  var result = {};
  if (!fields.length) return result;

  var headers = meta.readOnly ? getHeaders(sheet, meta.headerRow) : getReadHeaders(sheet, meta);
  var lastRow = sheet.getLastRow();
  var rowCount = lastRow - meta.dataStartRow + 1;

  fields.forEach(function (field) {
    var idx = headers.indexOf(field.key);
    if (idx === -1 || rowCount <= 0) { result[field.key] = []; return; }
    var values = sheet.getRange(meta.dataStartRow, idx + 1, rowCount, 1).getValues();
    var seen = {};
    var distinct = [];
    values.forEach(function (row) {
      var v = normalizeCell(row[0]);
      var key = String(v == null ? '' : v).trim();
      if (!key || seen[key]) return;
      seen[key] = true;
      distinct.push(key);
    });
    distinct.sort(function (a, b) { return a.localeCompare(b); });
    result[field.key] = distinct;
  });
  return result;
}

function canWrite(secureUser) {
  return !!secureUser && secureUser.Role === 'Admin';
}

function coerceForColumn(col, rawValue) {
  if (rawValue === undefined || rawValue === null) return '';
  if (col.type === 'number') {
    if (rawValue === '') return '';
    var n = Number(rawValue);
    return isNaN(n) ? '' : n;
  }
  if (col.type === 'boolean') {
    if (rawValue === true || rawValue === 'TRUE') return true;
    if (rawValue === false || rawValue === 'FALSE') return false;
    return '';
  }
  return rawValue;
}

function saveRecord(sheetName, record, secureUser, ss) {
  if (!canWrite(secureUser)) throw new Error('Permission denied: view-only account');
  var meta = SHEET_META[sheetName];
  if (!meta) throw new Error('Unknown sheet: ' + sheetName);
  if (meta.readOnly) throw new Error('ชีตนี้ดึงข้อมูลมาจากระบบอื่นอัตโนมัติ (IMPORTRANGE) ไม่สามารถแก้ไขได้');
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var uidInfo = ensureRowUidColumn(sheet, meta);
    var headers = uidInfo.headers;
    var uidCol = uidInfo.uidCol;
    var columns = getColumnMeta(sheet, meta, headers);
    var colByKey = {};
    columns.forEach(function (c, i) { colByKey[c.key] = { meta: c, index: i }; });

    var lastRow = sheet.getLastRow();
    var targetRow = -1;
    if (record.RowUID) {
      if (lastRow >= meta.dataStartRow) {
        var uidValues = sheet.getRange(meta.dataStartRow, uidCol, lastRow - meta.dataStartRow + 1, 1).getValues();
        for (var i = 0; i < uidValues.length; i++) {
          if (uidValues[i][0] === record.RowUID) { targetRow = meta.dataStartRow + i; break; }
        }
      }
    }

    if (targetRow === -1) {
      // insert: copy the row above (formulas/validation/format), then fill only editable cells
      var newRow = lastRow + 1 > meta.dataStartRow ? lastRow + 1 : meta.dataStartRow;
      sheet.insertRowAfter(Math.max(lastRow, meta.dataStartRow - 1));
      if (lastRow >= meta.dataStartRow) {
        sheet.getRange(lastRow, 1, 1, headers.length).copyTo(sheet.getRange(newRow, 1, 1, headers.length));
      }
      headers.forEach(function (h) {
        if (h === 'RowUID') return;
        var entry = colByKey[h];
        if (entry && entry.meta.editable && record[h] !== undefined) {
          sheet.getRange(newRow, entry.index + 1).setValue(coerceForColumn(entry.meta, record[h]));
        }
      });
      sheet.getRange(newRow, uidCol).setValue(Utilities.getUuid());
      logAudit(ss, secureUser.Username, 'INSERT', sheetName + ' new row');
    } else {
      headers.forEach(function (h) {
        if (h === 'RowUID') return;
        var entry = colByKey[h];
        if (entry && entry.meta.editable && record[h] !== undefined) {
          sheet.getRange(targetRow, entry.index + 1).setValue(coerceForColumn(entry.meta, record[h]));
        }
      });
      logAudit(ss, secureUser.Username, 'UPDATE', sheetName + ' row RowUID=' + record.RowUID);
    }
    return { status: 'success' };
  } finally {
    lock.releaseLock();
  }
}

function deleteRecord(sheetName, rowUid, secureUser, ss) {
  if (!canWrite(secureUser)) throw new Error('Permission denied: view-only account');
  var meta = SHEET_META[sheetName];
  if (!meta) throw new Error('Unknown sheet: ' + sheetName);
  if (meta.readOnly) throw new Error('ชีตนี้ดึงข้อมูลมาจากระบบอื่นอัตโนมัติ (IMPORTRANGE) ไม่สามารถลบได้');
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var uidInfo = ensureRowUidColumn(sheet, meta);
    var lastRow = sheet.getLastRow();
    if (lastRow >= meta.dataStartRow) {
      var uidValues = sheet.getRange(meta.dataStartRow, uidInfo.uidCol, lastRow - meta.dataStartRow + 1, 1).getValues();
      for (var i = 0; i < uidValues.length; i++) {
        if (uidValues[i][0] === rowUid) {
          sheet.deleteRow(meta.dataStartRow + i);
          logAudit(ss, secureUser.Username, 'DELETE', sheetName + ' row RowUID=' + rowUid);
          return { status: 'success' };
        }
      }
    }
    throw new Error('Record not found');
  } finally {
    lock.releaseLock();
  }
}

// ---------- login ----------

function doLogin(username, password, ss) {
  var sheet = ss.getSheetByName('Users');
  var users = readTable(sheet);
  var hashed = hashPassword(password);
  var user = users.find(function (u) { return u.Username === username && u.PasswordHash === hashed; });
  if (!user) return { status: 'error', message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
  logAudit(ss, username, 'LOGIN', 'System Login');
  return {
    status: 'success',
    user: { Username: user.Username, Role: user.Role, Token: generateToken(user.Username) },
  };
}

function changePassword(username, oldPassword, newPassword, ss) {
  var sheet = ss.getSheetByName('Users');
  var data = sheet.getDataRange().getValues();
  var oldHashed = hashPassword(oldPassword);
  
  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) { // Skip header
    if (data[i][0] === username) {
      if (data[i][1] !== oldHashed) {
        return { status: 'error', message: 'รหัสผ่านเดิมไม่ถูกต้อง' };
      }
      rowIndex = i + 1; // 1-based index for getRange
      break;
    }
  }
  
  if (rowIndex === -1) {
    return { status: 'error', message: 'ไม่พบชื่อผู้ใช้' };
  }
  
  sheet.getRange(rowIndex, 2).setValue(hashPassword(newPassword));
  logAudit(ss, username, 'CHANGE_PASSWORD', 'User changed password');
  
  return { status: 'success' };
}

// ---------- router ----------

function apiHandler(action, payload, userToken) {
  try {
    var ss = getSpreadsheet();
    ensureSupportSheets(ss);
    payload = payload || {};

    var secureUser = null;
    if (action !== 'LOGIN') {
      if (!userToken || !userToken.Token) throw new Error('Unauthorized: no session token');
      var payloadObj = verifyToken(userToken.Token);
      if (!payloadObj) throw new Error('Session expired, please login again');
      var users = readTable(ss.getSheetByName('Users'));
      secureUser = users.find(function (u) { return u.Username === payloadObj.Username; });
      if (!secureUser) throw new Error('Invalid user session');
    }

    switch (action) {
      case 'LOGIN':
        return doLogin(payload.username, payload.password, ss);
      case 'DESCRIBE_SHEET':
        return {
          status: 'success',
          columns: describeSheet(payload.sheetName, ss),
          filters: FILTER_FIELDS[payload.sheetName] || [],
        };
      case 'GET_FILTER_OPTIONS':
        return { status: 'success', options: getFilterOptions(payload.sheetName, ss) };
      case 'GET_RECORDS': {
        var result = getRecords(payload.sheetName, payload, ss);
        return { status: 'success', rows: result.rows, total: result.total };
      }
      case 'SAVE_RECORD':
        return saveRecord(payload.sheetName, payload.record, secureUser, ss);
      case 'DELETE_RECORD':
        return deleteRecord(payload.sheetName, payload.rowUid, secureUser, ss);
      case 'CHANGE_PASSWORD':
        return changePassword(secureUser.Username, payload.oldPassword, payload.newPassword, ss);
      default:
        throw new Error('Invalid API action: ' + action);
    }
  } catch (err) {
    return { status: 'error', message: err.message || String(err) };
  }
}

// Run once manually from the Apps Script editor to see the seeded admin
// password (also settable/rotatable by re-running after clearing the
// script property IPUR_SEED_ADMIN_PASSWORD).
function printSeedAdminPassword() {
  ensureSupportSheets(getSpreadsheet());
  var pw = PropertiesService.getScriptProperties().getProperty('IPUR_SEED_ADMIN_PASSWORD');
  Logger.log('admin password: ' + (pw || '(already set on a previous run — check the Users sheet or reset it manually)'));
}

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('🛠️ จัดการระบบ (Admin)')
    .addItem('รีเซ็ตรหัสผ่านผู้ใช้', 'resetPasswordFromMenu')
    .addToUi();
}

function resetPasswordFromMenu() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  var usernameResponse = ui.prompt('รีเซ็ตรหัสผ่าน', 'กรุณากรอก Username ของผู้ใช้ที่ต้องการรีเซ็ตรหัส:', ui.ButtonSet.OK_CANCEL);
  if (usernameResponse.getSelectedButton() !== ui.Button.OK) return;
  var username = usernameResponse.getResponseText().trim();
  if (!username) {
    ui.alert('ข้อผิดพลาด', 'ต้องกรอก Username', ui.ButtonSet.OK);
    return;
  }
  
  var passwordResponse = ui.prompt('รีเซ็ตรหัสผ่าน', 'กรุณากรอกรหัสผ่านใหม่ (เช่น 1234):', ui.ButtonSet.OK_CANCEL);
  if (passwordResponse.getSelectedButton() !== ui.Button.OK) return;
  var newPassword = passwordResponse.getResponseText().trim();
  if (!newPassword) {
    ui.alert('ข้อผิดพลาด', 'ต้องกรอกรหัสผ่านใหม่', ui.ButtonSet.OK);
    return;
  }
  
  var sheet = ss.getSheetByName('Users');
  if (!sheet) {
    ui.alert('ข้อผิดพลาด', 'ไม่พบชีต Users', ui.ButtonSet.OK);
    return;
  }
  
  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === username) {
      rowIndex = i + 1;
      break;
    }
  }
  
  if (rowIndex === -1) {
    ui.alert('ข้อผิดพลาด', 'ไม่พบผู้ใช้: ' + username, ui.ButtonSet.OK);
    return;
  }
  
  sheet.getRange(rowIndex, 2).setValue(hashPassword(newPassword));
  logAudit(ss, 'AdminMenu', 'RESET_PASSWORD', 'Admin reset password for ' + username);
  
  ui.alert('สำเร็จ', 'รีเซ็ตรหัสผ่านสำหรับ ' + username + ' เป็นที่เรียบร้อยแล้ว!', ui.ButtonSet.OK);
}
