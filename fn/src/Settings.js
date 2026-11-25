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
  requireSession_(token);
  var ss = SpreadsheetApp.getActive();
  var list = function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return [];
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().filter(function (r) { return r[0] !== ''; });
  };
  return { location: list('location'), product: list('Product'), premium: list('Premium'), guarantee: list('guarantee') };
}

function settingsSheet_(sheetName) {
  if (SETTINGS_SHEETS.indexOf(sheetName) < 0) throw new Error('INVALID_SHEET');
  var sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sheet) { ensureSheets_(); sheet = SpreadsheetApp.getActive().getSheetByName(sheetName); }
  return sheet;
}

/** Public (แอดมิน). Admin rows come back without the password. */
function getSettingsData(token, sheetName) {
  requireSession_(token, [ROLES.ADMIN]);
  var sheet = settingsSheet_(sheetName);
  var data = sheet.getDataRange().getDisplayValues().slice(1);
  if (sheetName === 'Admin') return data.map(function (r) { return [r[0], '', r[2], normalizeRole_(r[3])]; });
  return data;
}

/** Public (แอดมิน). */
function addSettingData(token, sheetName, rowData) {
  requireSession_(token, [ROLES.ADMIN]);
  var sheet = settingsSheet_(sheetName);
  rowData = (rowData || []).map(function (v) { return String(v == null ? '' : v).trim(); });
  if (!rowData[0]) throw new Error('กรุณากรอกข้อมูล');
  return withLock_(function () {
    if (sheetName === 'Admin') {
      if (findUser_(rowData[0])) throw new Error('ชื่อผู้ใช้นี้มีอยู่แล้ว');
      if (!rowData[1] || rowData[1].length < 6) throw new Error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      var roles = [ROLES.ADMIN, ROLES.ACC, ROLES.STAFF];
      if (roles.indexOf(rowData[3]) < 0) throw new Error('สิทธิ์ไม่ถูกต้อง');
      sheet.appendRow([rowData[0], hashPassword_(rowData[1]), rowData[2] || rowData[0], rowData[3]]);
    } else {
      sheet.appendRow([rowData[0]]);
    }
    return true;
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
      var admins = readUsers_().filter(function (u) { return u.role === ROLES.ADMIN; });
      if (target && target.role === ROLES.ADMIN && admins.length <= 1) throw new Error('ต้องมีแอดมินอย่างน้อย 1 คน');
    }
    sheet.deleteRow(rowNum);
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
