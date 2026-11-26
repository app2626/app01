// Admin settings: notification config, dropdown lists, user accounts.

var CONFIG_KEYS_ = ['notifyNewToken', 'notifyNewChatId', 'notifyApproveToken', 'notifyApproveChatId', 'emailTo', 'emailCc', 'driveFolderId'];
var SECRET_KEYS_ = ['notifyNewToken', 'notifyApproveToken'];
var MASK_ = '••••';
var DEFAULT_DRIVE_FOLDER_ = '1_b5LnM6ZOV3vulT2i5Jk3QtKoAwEvRD5';

/** Runs fn while holding the script lock; throws a Thai error if the lock cannot be taken. */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    throw new Error('ระบบกำลังประมวลผลข้อมูลอื่นอยู่ กรุณาลองใหม่อีกครั้ง');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function ensureConfigSheet_() {
  var ss = SpreadsheetApp.getActive();
  if (ss.getSheetByName('Config')) return { name: 'Config', status: 'มีข้อมูลอยู่แล้ว ⏭️' };
  var sheet = ss.insertSheet('Config');
  var rows = [['Key', 'Value']].concat(CONFIG_KEYS_.map(function (k) {
    return [k, k === 'driveFolderId' ? '1aD2usGtfsge4iwX8A2Bo7MGPQUbGuQSo' : ''];
  }));
  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
  sheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#f3f3f3');
  return { name: 'Config', status: 'สร้างใหม่ ✅' };
}

/** Server-only: full, unmasked config. */
function getConfig_() {
  ensureConfigSheet_();
  var data = SpreadsheetApp.getActive().getSheetByName('Config').getDataRange().getDisplayValues();
  var raw = {};
  for (var i = 1; i < data.length; i++) raw[data[i][0]] = data[i][1];
  var config = {};
  CONFIG_KEYS_.forEach(function (k) { config[k] = raw[k] || ''; });
  if (!config.driveFolderId) config.driveFolderId = DEFAULT_DRIVE_FOLDER_;
  return config;
}

function maskSecret_(v) {
  v = String(v || '');
  return v ? MASK_ + v.slice(-4) : '';
}

/** Public (แอดมิน). Bot tokens are masked. */
function getConfigProperties(token) {
  requireSession_(token, [ROLES.ADMIN]);
  var config = getConfig_();
  SECRET_KEYS_.forEach(function (k) { config[k] = maskSecret_(config[k]); });
  return config;
}

/** Public (แอดมิน). Masked values are ignored so the stored secret is kept. */
function setConfigProperties(token, configObj) {
  requireSession_(token, [ROLES.ADMIN]);
  configObj = configObj || {};
  return withLock_(function () {
    ensureConfigSheet_();
    var sheet = SpreadsheetApp.getActive().getSheetByName('Config');
    var data = sheet.getDataRange().getDisplayValues();
    var rowOf = {};
    for (var i = 1; i < data.length; i++) rowOf[data[i][0]] = i + 1;
    CONFIG_KEYS_.forEach(function (key) {
      if (configObj[key] === undefined || configObj[key] === null) return;
      var value = String(configObj[key]).trim();
      if (value.indexOf(MASK_) === 0) return;
      if (rowOf[key]) sheet.getRange(rowOf[key], 2).setValue(value);
      else sheet.appendRow([key, value]);
    });
    return true;
  });
}

/** Public (any role). */
function getAllDropdownData(token) {
  var user = requireSession_(token);
  var ss = SpreadsheetApp.getActive();
  var list = function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return [];
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().filter(function (r) { return r[0] !== ''; });
  };
  var scope = branchScope_(user);
  var locations = list('location').filter(function (r) { return inScope_(scope, r[0]); });
  return { location: locations, product: list('Product'), premium: list('Premium'), guarantee: list('guarantee'),
    finance: financeList_().map(function (n) { return [n]; }),
    // prefills the employee section of the request form (fields stay editable)
    // scoped: พนักงาน limited to `branches` (an empty list means the admin has not set a branch yet)
    me: { empId: user.username, name: user.name, phone: user.phone || '', scoped: scope !== null,
      branches: String(user.branch || '').split(',').map(function (b) { return b.trim(); }).filter(function (b) { return b !== ''; }) } };
}

/** Finance company names (trimmed, non-empty). Creates and seeds the Finance sheet on first use. */
function financeList_() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName('Finance');
  if (!sheet) sheet = ensureSheetByName_('Finance');
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues()
    .map(function (r) { return String(r[0]).trim(); })
    .filter(function (n) { return n !== ''; });
}

function settingsSheet_(sheetName) {
  if (SETTINGS_SHEETS.indexOf(sheetName) < 0) throw new Error('INVALID_SHEET');
  var sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sheet) sheet = ensureSheetByName_(sheetName);
  return sheet;
}

/** Public (แอดมิน). Admin rows come back without the password. */
function getSettingsData(token, sheetName) {
  requireSession_(token, [ROLES.ADMIN]);
  var sheet = settingsSheet_(sheetName);
  var data = sheet.getDataRange().getDisplayValues().slice(1);
  if (sheetName === 'Admin') {
    var explicitAdmin = hasExplicitAdmin_(data);
    var s = function (v) { return String(v == null ? '' : v).trim(); };
    return data.map(function (r) {
      return [r[0], '', r[2], normalizeRole_(r[3], explicitAdmin), s(r[4]), s(r[5]), s(r[6]), s(r[7]) || ACCOUNT_STATUS.ACTIVE];
    });
  }
  return data;
}

/** Public (แอดมิน). */
function addSettingData(token, sheetName, rowData) {
  requireSession_(token, [ROLES.ADMIN]);
  var sheet = settingsSheet_(sheetName);
  var rawBranches = (rowData || [])[6]; // Admin: array of branch names
  rowData = (rowData || []).map(function (v) { return String(v == null ? '' : v).trim(); });
  if (!rowData[0]) throw new Error('กรุณากรอกข้อมูล');
  return withLock_(function () {
    if (sheetName === 'Admin') {
      if (findUser_(rowData[0])) throw new Error('ชื่อผู้ใช้นี้มีอยู่แล้ว');
      if (!rowData[1] || rowData[1].length < 6) throw new Error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      var roles = [ROLES.ADMIN, ROLES.ACC, ROLES.STAFF];
      if (roles.indexOf(rowData[3]) < 0) throw new Error('สิทธิ์ไม่ถูกต้อง');
      var branches = normalizeBranches_(rawBranches, true);
      if (rowData[3] === ROLES.STAFF && !branches) throw new Error('พนักงานต้องมีสาขาอย่างน้อย 1 สาขา');
      fillBlankHeaders_(sheet, ADMIN_HEADERS);
      sheet.appendRow([cellText_(rowData[0]), hashPassword_(rowData[1]), cellText_(rowData[2] || rowData[0]), rowData[3],
        '', '', cellText_(branches), ACCOUNT_STATUS.ACTIVE]);
    } else {
      var last = sheet.getLastRow();
      var exists = last >= 2 && sheet.getRange(2, 1, last - 1, 1).getDisplayValues()
        .some(function (r) { return String(r[0]).trim() === rowData[0]; });
      if (exists) throw new Error('"' + rowData[0] + '" มีอยู่แล้วในรายการ');
      sheet.appendRow([cellText_(rowData[0])]);
    }
    return true;
  });
}

var BULK_SHEETS_ = ['location', 'Product', 'Premium'];
var BULK_MAX_ = 2000;

/**
 * Public (แอดมิน). Appends many list names at once (file upload). Trims, drops blanks and
 * duplicates (within the file and against the sheet). Returns { added: string[], skipped: number }.
 */
function addSettingDataBulk(token, sheetName, names) {
  requireSession_(token, [ROLES.ADMIN]);
  if (BULK_SHEETS_.indexOf(sheetName) < 0) throw new Error('INVALID_SHEET');
  names = Array.isArray(names) ? names : [];
  if (names.length > BULK_MAX_) throw new Error('อัปโหลดได้ครั้งละไม่เกิน 2,000 รายการ');
  var sheet = settingsSheet_(sheetName);
  return withLock_(function () {
    var last = sheet.getLastRow();
    var seen = {};
    if (last >= 2) sheet.getRange(2, 1, last - 1, 1).getDisplayValues().forEach(function (r) { seen[String(r[0]).trim()] = true; });
    var added = [];
    names.forEach(function (v) {
      var n = String(v == null ? '' : v).trim();
      if (!n || seen[n]) return;
      seen[n] = true;
      added.push(n);
    });
    if (added.length) {
      var start = Math.max(last, 1) + 1;
      var need = start + added.length - 1 - sheet.getMaxRows();
      if (need > 0) sheet.insertRowsAfter(sheet.getMaxRows(), need);
      sheet.getRange(start, 1, added.length, 1).setValues(added.map(function (n) { return [cellText_(n)]; }));
    }
    return { added: added, skipped: names.length - added.length };
  });
}

/** Public (แอดมิน). Deletes only if column A still holds expectedKey (protects against stale screens). */
function deleteSettingData(token, sheetName, rowIndex, expectedKey) {
  requireSession_(token, [ROLES.ADMIN]);
  var sheet = settingsSheet_(sheetName);
  return withLock_(function () {
    var rowNum = Number(rowIndex) + 2;
    if (!(rowNum >= 2) || rowNum > sheet.getLastRow() ||
        String(sheet.getRange(rowNum, 1).getDisplayValue()).trim() !== String(expectedKey).trim()) {
      throw new Error('ข้อมูลมีการเปลี่ยนแปลง กรุณารีเฟรช');
    }
    if (sheetName === 'Admin') {
      var target = findUser_(expectedKey);
      var admins = activeAdmins_();
      if (target && target.role === ROLES.ADMIN && isActiveUser_(target) && admins.length <= 1) throw new Error('ต้องมีแอดมินอย่างน้อย 1 คน');
    }
    sheet.deleteRow(rowNum);
    return true;
  });
}

/**
 * Public (แอดมิน). Deletes every list row whose column A matches one of `names` (ticked rows).
 * Matching by name, not row index, keeps it safe against stale screens. Not for Admin (users are
 * deleted one at a time so the last-admin guard stays simple). Returns { deleted, missing }.
 */
function deleteSettingDataBulk(token, sheetName, names) {
  requireSession_(token, [ROLES.ADMIN]);
  if (sheetName === 'Admin' || SETTINGS_SHEETS.indexOf(sheetName) < 0) throw new Error('INVALID_SHEET');
  names = Array.isArray(names) ? names : [];
  if (names.length > BULK_MAX_) throw new Error('ลบได้ครั้งละไม่เกิน 2,000 รายการ');
  var want = {};
  names.forEach(function (v) { var n = String(v == null ? '' : v).trim(); if (n) want[n] = true; });
  var wanted = Object.keys(want).length;
  if (!wanted) throw new Error('กรุณาเลือกรายการที่ต้องการลบ');
  var sheet = settingsSheet_(sheetName);
  return withLock_(function () {
    var last = sheet.getLastRow();
    var rows = [], found = {};
    if (last >= 2) {
      sheet.getRange(2, 1, last - 1, 1).getDisplayValues().forEach(function (r, i) {
        var n = String(r[0]).trim();
        if (want[n]) { rows.push(i + 2); found[n] = true; }
      });
    }
    if (!rows.length) throw new Error('ข้อมูลมีการเปลี่ยนแปลง กรุณารีเฟรช');
    // bottom-up, one deleteRows call per contiguous block
    for (var end = rows.length - 1; end >= 0;) {
      var start = end;
      while (start > 0 && rows[start - 1] === rows[start] - 1) start--;
      sheet.deleteRows(rows[start], end - start + 1);
      end = start - 1;
    }
    return { deleted: rows.length, missing: wanted - Object.keys(found).length };
  });
}

/**
 * Public (แอดมิน). Edits one settings row if column A still holds expectedKey.
 * List sheets: rowData[0] is the new name. Admin: username and password are kept
 * (password has its own reset); rowData[2] = display name, rowData[3] = role.
 * Existing Data rows keep the name they were saved with.
 */
function updateSettingData(token, sheetName, rowIndex, expectedKey, rowData) {
  requireSession_(token, [ROLES.ADMIN]);
  var sheet = settingsSheet_(sheetName);
  var rawBranches = (rowData || [])[6]; // Admin: array of branch names (relief staff)
  rowData = (rowData || []).map(function (v) { return String(v == null ? '' : v).trim(); });
  return withLock_(function () {
    var rowNum = Number(rowIndex) + 2;
    var key = String(expectedKey).trim();
    if (!(rowNum >= 2) || rowNum > sheet.getLastRow() ||
        String(sheet.getRange(rowNum, 1).getDisplayValue()).trim() !== key) {
      throw new Error('ข้อมูลมีการเปลี่ยนแปลง กรุณารีเฟรช');
    }
    if (sheetName === 'Admin') {
      var roles = [ROLES.ADMIN, ROLES.ACC, ROLES.STAFF];
      if (roles.indexOf(rowData[3]) < 0) throw new Error('สิทธิ์ไม่ถูกต้อง');
      var target = findUser_(key);
      var admins = activeAdmins_();
      if (target && target.role === ROLES.ADMIN && isActiveUser_(target) && rowData[3] !== ROLES.ADMIN && admins.length <= 1) {
        throw new Error('ต้องมีแอดมินอย่างน้อย 1 คน');
      }
      sheet.getRange(rowNum, 3, 1, 2).setValues([[cellText_(rowData[2] || key), rowData[3]]]);
      if (rowData.length > 4) {
        // contact fields (cols 5-7); blank is allowed for accounts created by an admin
        var email = rowData[4] || '', phone = rowData[5] ? normalizePhone_(rowData[5]) : '';
        if (email && !validEmail_(email)) throw new Error('รูปแบบอีเมลไม่ถูกต้อง');
        if (rowData[5] && !phone) throw new Error('เบอร์ติดต่อไม่ถูกต้อง: ' + PHONE_RULE_TEXT_);
        fillBlankHeaders_(sheet, ADMIN_HEADERS);
        sheet.getRange(rowNum, 5, 1, 3).setValues([[cellText_(email), phone ? "'" + phone : '', cellText_(normalizeBranches_(rawBranches, false))]]);
      }
      return true;
    }
    if (!rowData[0]) throw new Error('กรุณากรอกข้อมูล');
    var names = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues();
    var dup = names.some(function (r, i) { return i + 2 !== rowNum && String(r[0]).trim() === rowData[0]; });
    if (dup) throw new Error('"' + rowData[0] + '" มีอยู่แล้วในรายการ');
    sheet.getRange(rowNum, 1).setValue(cellText_(rowData[0]));
    return true;
  });
}

/** Public (แอดมิน). */
function resetPassword(token, username, newPwd) {
  requireSession_(token, [ROLES.ADMIN]);
  newPwd = String(newPwd || '');
  if (newPwd.length < 6) throw new Error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
  return withLock_(function () {
    var user = findUser_(username);
    if (!user) throw new Error('ไม่พบผู้ใช้งาน');
    SpreadsheetApp.getActive().getSheetByName('Admin').getRange(user.rowNum, 2).setValue(hashPassword_(newPwd));
    return true;
  });
}

/** Public (แอดมิน). Creates all sheets / headers; never overwrites data. */
function initializeAllSheets(token) {
  requireSession_(token, [ROLES.ADMIN]);
  return withLock_(function () { return ensureSheets_(); });
}
