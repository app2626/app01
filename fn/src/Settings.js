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
    return [k, k === 'driveFolderId' ? DEFAULT_DRIVE_FOLDER_ : ''];
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
  config.mailQuotaRemaining = mailQuota_(); // read-only; not a CONFIG_KEYS_ entry, so never saved
  return config;
}

/**
 * Folder ID from what the admin typed: a bare ID or a pasted Drive link (.../folders/<id>?usp=...).
 * Returns '' for blank, throws for anything that is not an ID.
 */
function driveFolderIdFrom_(v) {
  v = String(v == null ? '' : v).trim();
  if (!v) return '';
  var m = v.match(/\/folders\/([A-Za-z0-9_-]+)/) || v.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (m) v = m[1];
  if (!/^[A-Za-z0-9_-]{10,}$/.test(v)) throw new Error('Folder ID ไม่ถูกต้อง: วาง ID หรือลิงก์ของโฟลเดอร์ Google Drive');
  return v;
}

/** Public (แอดมิน). Masked values are ignored so the stored secret is kept. */
function setConfigProperties(token, configObj) {
  var user = requireSession_(token, [ROLES.ADMIN]);
  configObj = configObj || {};
  if (configObj.driveFolderId !== undefined && configObj.driveFolderId !== null) {
    configObj.driveFolderId = driveFolderIdFrom_(configObj.driveFolderId);
    // a new folder must be one the script can open, or every upload would fail after saving;
    // an unchanged ID is not re-checked, so a Drive hiccup cannot block saving other settings
    if (configObj.driveFolderId && configObj.driveFolderId !== getConfig_().driveFolderId) {
      try {
        DriveApp.getFolderById(configObj.driveFolderId).getId();
      } catch (e) {
        throw new Error('เปิดโฟลเดอร์ Drive นี้ไม่ได้: ตรวจว่า Folder ID ถูกต้อง และบัญชีที่ใช้ deploy ระบบมีสิทธิ์แก้ไขโฟลเดอร์นี้');
      }
    }
  }
  var changed = withLock_(function () {
    ensureConfigSheet_();
    var sheet = SpreadsheetApp.getActive().getSheetByName('Config');
    var data = sheet.getDataRange().getDisplayValues();
    var rowOf = {}, old = {}, keys = [];
    for (var i = 1; i < data.length; i++) { rowOf[data[i][0]] = i + 1; old[data[i][0]] = data[i][1]; }
    CONFIG_KEYS_.forEach(function (key) {
      if (configObj[key] === undefined || configObj[key] === null) return;
      var value = String(configObj[key]).trim();
      if (value.indexOf(MASK_) === 0) return;
      if (String(old[key] == null ? '' : old[key]) !== value) keys.push(key);
      if (rowOf[key]) sheet.getRange(rowOf[key], 2).setValue(value);
      else sheet.appendRow([key, value]);
    });
    return keys;
  });
  // key names only: values can be bot tokens
  if (changed.length) audit_(user, 'แก้ไขการตั้งค่า', 'Config', changed.join(', '));
  return true;
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
  var me = requireSession_(token, [ROLES.ADMIN]);
  var sheet = settingsSheet_(sheetName);
  var rawBranches = (rowData || [])[6]; // Admin: array of branch names
  rowData = (rowData || []).map(function (v) { return String(v == null ? '' : v).trim(); });
  if (!rowData[0]) throw new Error('กรุณากรอกข้อมูล');
  var branchesAdded = '';
  withLock_(function () {
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
      branchesAdded = branches;
    } else {
      var last = sheet.getLastRow();
      var exists = last >= 2 && sheet.getRange(2, 1, last - 1, 1).getDisplayValues()
        .some(function (r) { return String(r[0]).trim() === rowData[0]; });
      if (exists) throw new Error('"' + rowData[0] + '" มีอยู่แล้วในรายการ');
      sheet.appendRow([cellText_(rowData[0])]);
    }
  });
  if (sheetName === 'Admin') audit_(me, 'เพิ่มผู้ใช้', rowData[0], rowData[3] + (branchesAdded ? ' / ' + branchesAdded : ''));
  else audit_(me, 'เพิ่มข้อมูล', sheetName, rowData[0]);
  return true;
}

var BULK_SHEETS_ = ['location', 'Product', 'Premium'];
var BULK_MAX_ = 2000;

/**
 * Public (แอดมิน). Appends many list names at once (file upload). Trims, drops blanks and
 * duplicates (within the file and against the sheet). Returns { added: string[], skipped: number }.
 */
function addSettingDataBulk(token, sheetName, names) {
  var me = requireSession_(token, [ROLES.ADMIN]);
  if (BULK_SHEETS_.indexOf(sheetName) < 0) throw new Error('INVALID_SHEET');
  names = Array.isArray(names) ? names : [];
  if (names.length > BULK_MAX_) throw new Error('อัปโหลดได้ครั้งละไม่เกิน 2,000 รายการ');
  var sheet = settingsSheet_(sheetName);
  var res = withLock_(function () {
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
  if (res.added.length) audit_(me, 'นำเข้าไฟล์', sheetName, res.added.length + ' รายการ');
  return res;
}

/** Public (แอดมิน). Deletes only if column A still holds expectedKey (protects against stale screens). */
function deleteSettingData(token, sheetName, rowIndex, expectedKey) {
  var me = requireSession_(token, [ROLES.ADMIN]);
  var sheet = settingsSheet_(sheetName);
  withLock_(function () {
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
  });
  if (sheetName === 'Admin') audit_(me, 'ลบผู้ใช้', String(expectedKey).trim(), '');
  else audit_(me, 'ลบข้อมูล', sheetName, String(expectedKey).trim());
  return true;
}

/**
 * Public (แอดมิน). Deletes every list row whose column A matches one of `names` (ticked rows).
 * Matching by name, not row index, keeps it safe against stale screens. Not for Admin (users are
 * deleted one at a time so the last-admin guard stays simple). Returns { deleted, missing }.
 */
function deleteSettingDataBulk(token, sheetName, names) {
  var me = requireSession_(token, [ROLES.ADMIN]);
  if (sheetName === 'Admin' || SETTINGS_SHEETS.indexOf(sheetName) < 0) throw new Error('INVALID_SHEET');
  names = Array.isArray(names) ? names : [];
  if (names.length > BULK_MAX_) throw new Error('ลบได้ครั้งละไม่เกิน 2,000 รายการ');
  var want = {};
  names.forEach(function (v) { var n = String(v == null ? '' : v).trim(); if (n) want[n] = true; });
  var wanted = Object.keys(want).length;
  if (!wanted) throw new Error('กรุณาเลือกรายการที่ต้องการลบ');
  var sheet = settingsSheet_(sheetName);
  var res = withLock_(function () {
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
    return { deleted: rows.length, missing: wanted - Object.keys(found).length, names: Object.keys(found) };
  });
  audit_(me, 'ลบหลายรายการ', sheetName, res.names.join(', '));
  return { deleted: res.deleted, missing: res.missing };
}

/**
 * Public (แอดมิน). Edits one settings row if column A still holds expectedKey.
 * List sheets: rowData[0] is the new name. Admin: username and password are kept
 * (password has its own reset); rowData[2] = display name, rowData[3] = role.
 * Existing Data rows keep the name they were saved with.
 */
function updateSettingData(token, sheetName, rowIndex, expectedKey, rowData) {
  var me = requireSession_(token, [ROLES.ADMIN]);
  var sheet = settingsSheet_(sheetName);
  var rawBranches = (rowData || [])[6]; // Admin: array of branch names (relief staff)
  rowData = (rowData || []).map(function (v) { return String(v == null ? '' : v).trim(); });
  var key = String(expectedKey).trim();
  var before = null, renamed = null;
  withLock_(function () {
    var rowNum = Number(rowIndex) + 2;
    if (!(rowNum >= 2) || rowNum > sheet.getLastRow() ||
        String(sheet.getRange(rowNum, 1).getDisplayValue()).trim() !== key) {
      throw new Error('ข้อมูลมีการเปลี่ยนแปลง กรุณารีเฟรช');
    }
    if (sheetName === 'Admin') {
      var roles = [ROLES.ADMIN, ROLES.ACC, ROLES.STAFF];
      if (roles.indexOf(rowData[3]) < 0) throw new Error('สิทธิ์ไม่ถูกต้อง');
      var target = findUser_(key);
      before = target;
      var admins = activeAdmins_();
      if (target && target.role === ROLES.ADMIN && isActiveUser_(target) && rowData[3] !== ROLES.ADMIN && admins.length <= 1) {
        throw new Error('ต้องมีแอดมินอย่างน้อย 1 คน');
      }
      // validate everything first: a rejected edit must leave the row exactly as it was
      var withContact = rowData.length > 4; // older clients send only name + role
      var email = '', phone = '', branches = target ? target.branch : '';
      if (withContact) {
        // contact fields (cols 5-7); blank is allowed for accounts created by an admin
        email = rowData[4] || '';
        phone = rowData[5] ? normalizePhone_(rowData[5]) : '';
        if (email && !validEmail_(email)) throw new Error('รูปแบบอีเมลไม่ถูกต้อง');
        if (rowData[5] && !phone) throw new Error('เบอร์ติดต่อไม่ถูกต้อง: ' + PHONE_RULE_TEXT_);
        branches = normalizeBranches_(rawBranches, false);
      }
      if (rowData[3] === ROLES.STAFF && !branches) throw new Error('พนักงานต้องมีสาขาอย่างน้อย 1 สาขา');
      sheet.getRange(rowNum, 3, 1, 2).setValues([[cellText_(rowData[2] || key), rowData[3]]]);
      if (withContact) {
        fillBlankHeaders_(sheet, ADMIN_HEADERS);
        sheet.getRange(rowNum, 5, 1, 3).setValues([[cellText_(email), phone ? "'" + phone : '', cellText_(branches)]]);
      }
      return;
    }
    if (!rowData[0]) throw new Error('กรุณากรอกข้อมูล');
    var names = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues();
    var dup = names.some(function (r, i) { return i + 2 !== rowNum && String(r[0]).trim() === rowData[0]; });
    if (dup) throw new Error('"' + rowData[0] + '" มีอยู่แล้วในรายการ');
    sheet.getRange(rowNum, 1).setValue(cellText_(rowData[0]));
    // A branch rename must carry over: staff scope and the request list match branches by name.
    if (sheetName === 'location' && key !== rowData[0]) renamed = renameBranch_(key, rowData[0]);
  });
  if (renamed) {
    audit_(me, 'เปลี่ยนชื่อสาขา', 'location', key + ' → ' + rowData[0] +
      ' (บัญชี ' + renamed.accounts + ', คำขอ ' + renamed.requests + ')');
    return renamed;
  }
  if (sheetName === 'Admin') {
    var after = findUser_(key) || {};
    var diff = [];
    if (before && before.role !== after.role) diff.push('สิทธิ์ ' + before.role + ' → ' + after.role);
    if (before && before.branch !== after.branch) diff.push('สาขา ' + (before.branch || '-') + ' → ' + (after.branch || '-'));
    if (before && (before.name !== after.name || before.email !== after.email || before.phone !== after.phone)) diff.push('ข้อมูลติดต่อ/ชื่อ');
    audit_(me, 'แก้ไขผู้ใช้', key, diff.join('; ') || 'ไม่มีการเปลี่ยนแปลง');
  } else {
    audit_(me, 'แก้ไขข้อมูล', sheetName, key + ' → ' + rowData[0]);
  }
  return true;
}

/**
 * Caller holds the lock and has already renamed the location row. Replaces the exact branch name
 * (never a substring) in every account's branch list and in the "สาขา :" column of Data.
 * Returns { accounts, requests } = how many cells changed.
 */
function renameBranch_(oldName, newName) {
  var ss = SpreadsheetApp.getActive();
  var accounts = 0, requests = 0;

  var admin = ss.getSheetByName('Admin');
  if (admin && admin.getLastRow() >= 2 && admin.getMaxColumns() >= 7) {
    var cells = admin.getRange(2, 7, admin.getLastRow() - 1, 1).getDisplayValues();
    cells.forEach(function (r, i) {
      var parts = String(r[0]).split(',').map(function (b) { return b.trim(); });
      if (parts.indexOf(oldName) < 0) return;
      var next = parts.map(function (b) { return b === oldName ? newName : b; });
      admin.getRange(i + 2, 7).setValue(cellText_(normalizeBranches_(next, false)));
      accounts++;
    });
  }

  var data = ss.getSheetByName('Data');
  if (data && data.getLastRow() >= 2) {
    var c = col_('สาขา :');
    if (data.getMaxColumns() >= c) {
      var range = data.getRange(2, c, data.getLastRow() - 1, 1);
      var vals = range.getDisplayValues();
      // write back in runs of consecutive changed rows: one call per run, not per cell
      for (var i = 0; i < vals.length;) {
        if (String(vals[i][0]).trim() !== oldName) { i++; continue; }
        var j = i;
        while (j < vals.length && String(vals[j][0]).trim() === oldName) j++;
        var run = [];
        for (var k = i; k < j; k++) run.push([cellText_(newName)]);
        data.getRange(i + 2, c, j - i, 1).setValues(run);
        requests += j - i;
        i = j;
      }
    }
  }
  return { accounts: accounts, requests: requests };
}

/** Public (แอดมิน). */
function resetPassword(token, username, newPwd) {
  var me = requireSession_(token, [ROLES.ADMIN]);
  newPwd = String(newPwd || '');
  if (newPwd.length < 6) throw new Error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
  var target = withLock_(function () {
    var user = findUser_(username);
    if (!user) throw new Error('ไม่พบผู้ใช้งาน');
    SpreadsheetApp.getActive().getSheetByName('Admin').getRange(user.rowNum, 2).setValue(hashPassword_(newPwd));
    return user.username;
  });
  audit_(me, 'รีเซ็ตรหัสผ่าน', target, 'โดยแอดมิน');
  return true;
}

/** Public (แอดมิน). Creates all sheets / headers; never overwrites data. */
function initializeAllSheets(token) {
  var me = requireSession_(token, [ROLES.ADMIN]);
  var res = withLock_(function () { return ensureSheets_(); });
  audit_(me, 'สร้าง/ตรวจ Sheet', 'ทั้งหมด', '');
  return res;
}
