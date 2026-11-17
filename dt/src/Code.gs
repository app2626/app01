/**
 * ระบบบันทึกข้อมูลการขาย / ผ่อนชำระ ลง Google Sheets
 * Backend: Google Apps Script
 */

// ===== การตั้งค่า =====
const SPREADSHEET_ID = '1lOA7vAW5V1u1a7FprgZfaVxxnq8N6nRGuTRjQMfUiws';

// ใส่ ID ของโฟลเดอร์ Google Drive สำหรับเก็บรูปสลิป (ค่าเริ่มต้น)
// - ถ้าตั้งค่าโฟลเดอร์ในหน้า "ตั้งค่าระบบ" แล้ว ระบบจะใช้ค่าจากหน้านั้นก่อน
// - ถ้ายังไม่ได้ใส่ทั้งสองที่ หรือ ID ใช้ไม่ได้ ระบบจะบันทึกไฟล์ไว้ที่ Root ของ My Drive แทน
const DRIVE_FOLDER_ID = 'ใส่_FOLDER_ID_ที่นี่';
const DRIVE_FOLDER_PLACEHOLDER = 'ใส่_FOLDER_ID_ที่นี่';

const DATA_SHEET_NAME = 'Data';

// key ที่ส่งกลับไปหน้าเว็บ -> ชีตที่ใช้ดึงตัวเลือก (คอลัมน์ A ตั้งแต่แถว 2)
const OPTION_SHEETS = {
  locations: { sheet: 'Location', label: 'สาขา' },
  projects: { sheet: 'Project', label: 'โครงการ' },
  products: { sheet: 'Product', label: 'รายละเอียดสินค้า' },
  banks: { sheet: 'Bank', label: 'ชื่อธนาคาร' },
  installments: { sheet: 'installment', label: 'จำนวนเดือนที่ผ่อน' }
};

const DATA_HEADERS = [
  'ประทับเวลา', 'สาขา', 'โครงการ', 'ชื่อ', 'นามสกุล', 'เบอร์ลูกค้า',
  'รายละเอียดสินค้า', 'imei', 'ราคา', 'ส่วนลด', 'โค้ดผ่อน', 'เลขที่บิล',
  'เลขบัตรเครดิต', 'ชื่อเจ้าของบัตรเครดิต', 'ชื่อธนาคาร', 'Tid เครื่อง',
  'Trace', 'จำนวนเดือนที่ผ่อน', 'รูปสลิป'
];

// ช่องที่บังคับกรอกเสมอ (ปิดไม่ได้)
const ALWAYS_REQUIRED = [
  ['location', 'สาขา'], ['project', 'โครงการ'],
  ['firstName', 'ชื่อ'], ['lastName', 'นามสกุล'], ['phone', 'เบอร์ลูกค้า'],
  ['product', 'รายละเอียดสินค้า'], ['imei', 'IMEI'], ['billNo', 'เลขที่บิล'],
  ['bank', 'ชื่อธนาคาร'], ['installmentMonths', 'จำนวนเดือนที่ผ่อน']
];

// ช่องที่แอดมินเลือกได้ว่าบังคับกรอกหรือไม่ (ค่าเริ่มต้น = บังคับทั้งหมด)
const OPTIONAL_REQUIRED = {
  installCode: 'โค้ดผ่อน',
  cardNumber: 'เลขบัตรเครดิต',
  cardHolder: 'ชื่อเจ้าของบัตรเครดิต',
  tid: 'Tid เครื่อง',
  trace: 'Trace',
  slip: 'รูปสลิป'
};

const DEFAULT_TITLE = 'ระบบบันทึกข้อมูลการขาย / ผ่อนชำระ';
const DEFAULT_SUBTITLE = 'กรอกข้อมูลให้ครบถ้วน ช่องที่มีเครื่องหมาย * จำเป็นต้องกรอก';

const MAX_TEXT_LENGTH = 200;
const MAX_LIST_ITEMS = 2000;
const MAX_SLIP_BYTES = 5 * 1024 * 1024; // 5 MB หลังถอด Base64
const SLIP_MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Script Properties keys
const PROP_FOLDER_ID = 'SLIP_FOLDER_ID';
const PROP_TITLE = 'APP_TITLE';
const PROP_SUBTITLE = 'APP_SUBTITLE';
const PROP_REQUIRED = 'FORM_REQUIRED';
const PROP_PW_HASH = 'ADMIN_PW_HASH';
const PROP_PW_VER = 'ADMIN_PW_VER';
const PROP_SETUP_CODE = 'ADMIN_SETUP_CODE';
const PROP_SETUP_EXP = 'ADMIN_SETUP_EXP';
const BACKUP_SHEET_NAME = 'BackupData';
const BACKUP_TIME_HEADER = 'วันที่แบ็คอัพ';
const MAX_RECENT = 500;

const PROP_BANNER_ID = 'BANNER_FILE_ID';
const PROP_BANNER_VER = 'BANNER_VER';

const MAX_BANNER_BYTES = 3 * 1024 * 1024;  // 3 MB หลังถอด Base64
const BANNER_CACHE_SECONDS = 6 * 60 * 60;
const BANNER_CHUNK = 90000;                // CacheService เก็บได้ไม่เกิน 100KB ต่อ key

const SESSION_SECONDS = 6 * 60 * 60;   // อยู่ในระบบได้ 6 ชั่วโมง
const LOGIN_MAX_FAILS = 5;             // ผิดเกิน 5 ครั้ง
const LOGIN_LOCK_SECONDS = 10 * 60;    // ล็อก 10 นาที
const SETUP_CODE_MINUTES = 30;         // รหัสตั้งค่าใช้ได้ 30 นาที
const PW_HASH_ROUNDS = 1000;
const PW_MIN_LENGTH = 8;

// ===== Web App =====
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle(getSettings_().title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function props_() {
  return PropertiesService.getScriptProperties();
}

// ===== การตั้งค่าที่เก็บใน Script Properties =====
function getSettings_() {
  const p = props_().getProperties();
  let required = {};
  try {
    required = JSON.parse(p[PROP_REQUIRED] || '{}') || {};
  } catch (e) {
    required = {};
  }
  const req = {};
  Object.keys(OPTIONAL_REQUIRED).forEach(function (k) {
    req[k] = required[k] !== false;
  });
  return {
    title: p[PROP_TITLE] || DEFAULT_TITLE,
    subtitle: p[PROP_SUBTITLE] || DEFAULT_SUBTITLE,
    required: req,
    folderId: p[PROP_FOLDER_ID] || ''
  };
}

// ===== ดึงข้อมูล Dropdown ทั้ง 5 ชีตในรอบเดียว (+ การตั้งค่าฟอร์ม) =====
function getInitialData() {
  const ss = getSpreadsheet_();
  const settings = getSettings_();
  const result = {
    missingSheets: [],
    settings: { title: settings.title, subtitle: settings.subtitle, required: settings.required }
  };
  Object.keys(OPTION_SHEETS).forEach(function (key) {
    const sheet = ss.getSheetByName(OPTION_SHEETS[key].sheet);
    if (!sheet) {
      result[key] = [];
      result.missingSheets.push(OPTION_SHEETS[key].sheet);
      return;
    }
    result[key] = readColumnA_(sheet);
  });
  return result;
}

function readColumnA_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  return uniqueNonEmpty_(values.map(function (r) { return r[0]; }));
}

function uniqueNonEmpty_(arr) {
  const seen = {};
  const list = [];
  arr.forEach(function (x) {
    const v = String(x === null || x === undefined ? '' : x).trim();
    if (v && !seen[v]) {
      seen[v] = true;
      list.push(v);
    }
  });
  return list;
}

// ===== บันทึกข้อมูลลงชีต Data =====
function saveData(formData) {
  if (!formData || typeof formData !== 'object') {
    throw new Error('ไม่พบข้อมูลที่ส่งมา');
  }

  const settings = getSettings_();
  const f = normalizeForm_(formData);
  validateForm_(f, settings.required);
  if (settings.required.slip && !formData.slip) throw new Error('กรุณาแนบรูปสลิป');

  const ss = getSpreadsheet_();
  validateOptions_(ss, f);

  // อัปโหลดสลิปก่อน (ช้าที่สุด) นอก Lock เพื่อไม่ให้ผู้ใช้อื่นต้องรอนาน
  const slipFile = formData.slip ? saveSlip_(formData.slip, f.billNo, f.firstName) : null;
  const slipUrl = slipFile ? slipFile.getUrl() : '';

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (e) {
    trashQuietly_(slipFile);
    throw new Error('ระบบกำลังมีผู้ใช้งานพร้อมกันจำนวนมาก กรุณาลองใหม่อีกครั้ง');
  }

  try {
    const sheet = getOrCreateDataSheet_(ss);
    const row = [
      Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm:ss'),
      safeText_(f.location),
      safeText_(f.project),
      safeText_(f.firstName),
      safeText_(f.lastName),
      forceText_(f.phone),
      safeText_(f.product),
      forceText_(f.imei),
      f.price,
      f.discount,
      safeText_(f.installCode),
      forceText_(f.billNo),
      forceText_(f.cardNumber),
      safeText_(f.cardHolder),
      safeText_(f.bank),
      forceText_(f.tid),
      forceText_(f.trace),
      safeText_(f.installmentMonths),
      slipUrl
    ];
    sheet.appendRow(row);
    SpreadsheetApp.flush();

    return {
      success: true,
      message: 'บันทึกข้อมูลเรียบร้อยแล้ว',
      row: sheet.getLastRow(),
      fileUrl: slipUrl
    };
  } catch (err) {
    trashQuietly_(slipFile);
    throw new Error('บันทึกข้อมูลไม่สำเร็จ: ' + (err && err.message ? err.message : err));
  } finally {
    lock.releaseLock();
  }
}

// ===== Helpers: ข้อมูลฟอร์ม =====
function str_(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function normalizeForm_(d) {
  return {
    location: str_(d.location),
    project: str_(d.project),
    firstName: str_(d.firstName),
    lastName: str_(d.lastName),
    phone: str_(d.phone).replace(/[^0-9]/g, ''),
    product: str_(d.product),
    imei: str_(d.imei).replace(/\s+/g, ''),
    price: toNumber_(d.price),
    discount: str_(d.discount) === '' ? 0 : toNumber_(d.discount),
    installCode: str_(d.installCode),
    billNo: str_(d.billNo),
    cardNumber: str_(d.cardNumber).replace(/[\s-]+/g, ''),
    cardHolder: str_(d.cardHolder),
    bank: str_(d.bank),
    tid: str_(d.tid).replace(/\s+/g, ''),
    trace: str_(d.trace).replace(/\s+/g, ''),
    installmentMonths: str_(d.installmentMonths)
  };
}

function toNumber_(v) {
  const s = str_(v).replace(/,/g, '');
  if (s === '') return NaN;
  return Number(s);
}

function validateForm_(f, requiredSettings) {
  const required = ALWAYS_REQUIRED.slice();
  Object.keys(OPTIONAL_REQUIRED).forEach(function (k) {
    if (k !== 'slip' && requiredSettings[k]) required.push([k, OPTIONAL_REQUIRED[k]]);
  });
  const missing = required.filter(function (r) { return !f[r[0]]; }).map(function (r) { return r[1]; });
  if (typeof f.price !== 'number' || isNaN(f.price)) missing.push('ราคา');
  if (missing.length) throw new Error('กรุณากรอกข้อมูลให้ครบ: ' + missing.join(', '));

  Object.keys(f).forEach(function (k) {
    if (typeof f[k] === 'string' && f[k].length > MAX_TEXT_LENGTH) {
      throw new Error('ข้อมูลบางช่องยาวเกิน ' + MAX_TEXT_LENGTH + ' ตัวอักษร');
    }
  });

  if (!/^0[0-9]{8,9}$/.test(f.phone)) throw new Error('เบอร์ลูกค้าไม่ถูกต้อง (ตัวเลข 9-10 หลัก ขึ้นต้นด้วย 0)');
  if (!/^[0-9]{14,16}$/.test(f.imei)) throw new Error('IMEI ไม่ถูกต้อง (ตัวเลข 14-16 หลัก)');
  if (f.cardNumber && !/^[0-9Xx]{4,19}$/.test(f.cardNumber)) throw new Error('เลขบัตรเครดิตไม่ถูกต้อง');
  if (!isFinite(f.price) || f.price < 0) throw new Error('ราคาไม่ถูกต้อง');
  if (!isFinite(f.discount) || f.discount < 0) throw new Error('ส่วนลดไม่ถูกต้อง');
  if (f.discount > f.price) throw new Error('ส่วนลดต้องไม่มากกว่าราคา');
}

// ค่าที่มาจาก Dropdown ต้องมีอยู่จริงในชีตต้นทาง (กันการยิง request ตรง)
function validateOptions_(ss, f) {
  const checks = [
    ['location', 'locations'], ['project', 'projects'], ['product', 'products'],
    ['bank', 'banks'], ['installmentMonths', 'installments']
  ];
  checks.forEach(function (c) {
    const def = OPTION_SHEETS[c[1]];
    const sheet = ss.getSheetByName(def.sheet);
    if (!sheet) throw new Error('ไม่พบชีต ' + def.sheet + ' ในไฟล์');
    if (readColumnA_(sheet).indexOf(f[c[0]]) === -1) {
      throw new Error(def.label + ' "' + f[c[0]] + '" ไม่มีอยู่ในรายการ กรุณารีเฟรชหน้าเว็บแล้วเลือกใหม่');
    }
  });
}

// บังคับเป็นข้อความ: ใส่ ' นำหน้า กันเลข 0 หาย / กันกลายเป็นรูปแบบวิทยาศาสตร์
function forceText_(v) {
  const s = str_(v);
  return s ? "'" + s : '';
}

// กัน Formula Injection: ข้อความที่ขึ้นต้นด้วย = + - @ จะถูกใส่ ' นำหน้า
function safeText_(v) {
  const s = str_(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function getOrCreateDataSheet_(ss) {
  let sheet = ss.getSheetByName(DATA_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(DATA_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, DATA_HEADERS.length).setValues([DATA_HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// ===== Helpers: รูปสลิป =====
// แปลง data URL รูปภาพ -> { mime, bytes } พร้อมตรวจชนิด ขนาด และ signature ของไฟล์จริง
function parseImageDataUrl_(dataUrl, maxBytes, label) {
  const s = String(dataUrl || '');
  const comma = s.indexOf(',');
  const header = comma > 0 ? s.substring(0, comma) : '';
  const m = /^data:(image\/(?:jpeg|png|webp));base64$/.exec(header);
  if (!m) throw new Error('รูปแบบไฟล์' + label + 'ไม่ถูกต้อง (รองรับ JPG / PNG / WEBP)');
  const mime = m[1];

  let bytes;
  try {
    bytes = Utilities.base64Decode(s.substring(comma + 1));
  } catch (e) {
    throw new Error('ไฟล์' + label + 'เสียหาย กรุณาเลือกรูปใหม่');
  }
  if (!bytes.length) throw new Error('ไฟล์' + label + 'ว่างเปล่า');
  if (bytes.length > maxBytes) throw new Error('ไฟล์' + label + 'ใหญ่เกิน ' + Math.round(maxBytes / 1048576) + ' MB');
  if (!hasImageSignature_(bytes, mime)) throw new Error('ไฟล์ที่แนบไม่ใช่รูปภาพจริง');
  return { mime: mime, bytes: bytes };
}

function saveSlip_(dataUrl, billNo, firstName) {
  if (!dataUrl) throw new Error('กรุณาแนบรูปสลิป');
  const img = parseImageDataUrl_(dataUrl, MAX_SLIP_BYTES, 'สลิป');
  const fileName = sanitizeFileName_('Slip_' + billNo + '_' + firstName) + '.' + SLIP_MIME_EXT[img.mime];
  const blob = Utilities.newBlob(img.bytes, img.mime, fileName);
  return getSlipFolder_().createFile(blob);
}

// ===== แบนเนอร์หน้าฟอร์ม =====
// ไฟล์เก็บใน Drive (ไม่แชร์สาธารณะ) แล้ว Server ส่งเป็น data URL ให้หน้าเว็บ พร้อมพักไว้ใน Cache
function getBanner() {
  const p = props_();
  const id = p.getProperty(PROP_BANNER_ID);
  if (!id) return { dataUrl: '' };
  const ver = p.getProperty(PROP_BANNER_VER) || '0';
  const cache = CacheService.getScriptCache();
  const prefix = 'banner_' + ver + '_';

  const count = Number(cache.get(prefix + 'n') || 0);
  if (count > 0) {
    const keys = [];
    for (let i = 0; i < count; i++) keys.push(prefix + i);
    const got = cache.getAll(keys);
    if (keys.every(function (k) { return typeof got[k] === 'string'; })) {
      return { dataUrl: keys.map(function (k) { return got[k]; }).join('') };
    }
  }

  let dataUrl;
  try {
    const blob = DriveApp.getFileById(id).getBlob();
    dataUrl = 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch (e) {
    console.warn('อ่านไฟล์แบนเนอร์ไม่ได้: ' + e.message);
    return { dataUrl: '' };
  }
  try {
    const parts = {};
    let n = 0;
    for (let i = 0; i < dataUrl.length; i += BANNER_CHUNK) {
      parts[prefix + n] = dataUrl.substring(i, i + BANNER_CHUNK);
      n++;
    }
    cache.putAll(parts, BANNER_CACHE_SECONDS);
    cache.put(prefix + 'n', String(n), BANNER_CACHE_SECONDS);
  } catch (e) {
    console.warn('พักแบนเนอร์ใน Cache ไม่สำเร็จ: ' + e.message);
  }
  return { dataUrl: dataUrl };
}

function describeBanner_() {
  const id = props_().getProperty(PROP_BANNER_ID);
  if (!id) return { has: false };
  try {
    const f = DriveApp.getFileById(id);
    return {
      has: true,
      name: f.getName(),
      size: f.getSize(),
      updated: Utilities.formatDate(f.getLastUpdated(), 'GMT+7', 'dd/MM/yyyy HH:mm')
    };
  } catch (e) {
    return { has: false, missing: true };
  }
}

function adminSaveBanner(token, dataUrl) {
  requireAdmin_(token);
  const img = parseImageDataUrl_(dataUrl, MAX_BANNER_BYTES, 'แบนเนอร์');
  const stamp = Utilities.formatDate(new Date(), 'GMT+7', 'yyyyMMdd_HHmmss');
  const blob = Utilities.newBlob(img.bytes, img.mime, 'Banner_' + stamp + '.' + SLIP_MIME_EXT[img.mime]);
  const file = getSlipFolder_().createFile(blob);

  const p = props_();
  const oldId = p.getProperty(PROP_BANNER_ID);
  p.setProperty(PROP_BANNER_ID, file.getId());
  p.setProperty(PROP_BANNER_VER, Utilities.getUuid().substring(0, 8));
  if (oldId && oldId !== file.getId()) {
    try { DriveApp.getFileById(oldId).setTrashed(true); } catch (e) { console.warn('ลบแบนเนอร์เก่าไม่สำเร็จ: ' + e.message); }
  }
  return { banner: describeBanner_(), message: 'บันทึกแบนเนอร์แล้ว' };
}

function adminDeleteBanner(token) {
  requireAdmin_(token);
  const p = props_();
  const id = p.getProperty(PROP_BANNER_ID);
  if (id) {
    try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { console.warn('ลบไฟล์แบนเนอร์ไม่สำเร็จ: ' + e.message); }
  }
  p.deleteProperty(PROP_BANNER_ID);
  p.setProperty(PROP_BANNER_VER, Utilities.getUuid().substring(0, 8));
  return { banner: describeBanner_(), message: 'ลบแบนเนอร์แล้ว' };
}

function hasImageSignature_(bytes, mime) {
  const b = function (i) { return bytes[i] & 0xff; };
  if (mime === 'image/jpeg') return b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff;
  if (mime === 'image/png') return b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47;
  if (mime === 'image/webp') {
    return bytes.length > 12 &&
      b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 &&
      b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50;
  }
  return false;
}

function sanitizeFileName_(name) {
  return String(name).replace(/[\\/:*?"<>|\r\n\t]+/g, '_').substring(0, 120);
}

// ลำดับ: โฟลเดอร์จากหน้าตั้งค่า -> DRIVE_FOLDER_ID ในโค้ด -> Root ของ Drive
function getSlipFolder_() {
  const candidates = [getSettings_().folderId, String(DRIVE_FOLDER_ID || '').trim()];
  for (let i = 0; i < candidates.length; i++) {
    const id = candidates[i];
    if (!id || id === DRIVE_FOLDER_PLACEHOLDER) continue;
    try {
      return DriveApp.getFolderById(id);
    } catch (e) {
      console.warn('Folder ID ใช้ไม่ได้ (' + id + '): ' + e.message);
    }
  }
  return DriveApp.getRootFolder();
}

function trashQuietly_(file) {
  try {
    if (file) file.setTrashed(true);
  } catch (e) {
    console.warn('ลบไฟล์สลิปที่ค้างไม่สำเร็จ: ' + e.message);
  }
}

// =====================================================================
// ===== หน้าตั้งค่าระบบ (Admin) =====
// ทุกฟังก์ชัน admin* ต้องส่ง token ที่ได้จากการเข้าสู่ระบบ และตรวจที่ Server ทุกครั้ง
// =====================================================================

function hashPassword_(password, salt, rounds) {
  let h = salt + '|' + password;
  for (let i = 0; i < rounds; i++) {
    const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + '|' + password, Utilities.Charset.UTF_8);
    h = Utilities.base64Encode(bytes);
  }
  return h;
}

function makePasswordRecord_(password) {
  const salt = Utilities.getUuid().replace(/-/g, '');
  return ['v1', PW_HASH_ROUNDS, salt, hashPassword_(password, salt, PW_HASH_ROUNDS)].join('$');
}

function verifyPassword_(password) {
  const rec = props_().getProperty(PROP_PW_HASH);
  if (!rec) return false;
  const parts = rec.split('$');
  if (parts.length !== 4 || parts[0] !== 'v1') return false;
  const computed = hashPassword_(String(password), parts[2], Number(parts[1]));
  if (computed.length !== parts[3].length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ parts[3].charCodeAt(i);
  return diff === 0;
}

function checkNewPassword_(pw) {
  const s = String(pw || '');
  if (s.length < PW_MIN_LENGTH) throw new Error('รหัสผ่านต้องยาวอย่างน้อย ' + PW_MIN_LENGTH + ' ตัวอักษร');
  if (s.length > 100) throw new Error('รหัสผ่านยาวเกินไป');
  return s;
}

function storePassword_(pw) {
  const p = props_();
  p.setProperty(PROP_PW_HASH, makePasswordRecord_(pw));
  p.setProperty(PROP_PW_VER, Utilities.getUuid());  // เปลี่ยนรุ่น -> session เก่าใช้ไม่ได้ทันที
}

function createSession_() {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('adm_' + token, props_().getProperty(PROP_PW_VER) || '', SESSION_SECONDS);
  return token;
}

function requireAdmin_(token) {
  const t = String(token || '');
  if (!/^[0-9a-f]{64}$/.test(t)) throw new Error('[AUTH] กรุณาเข้าสู่ระบบ');
  const ver = CacheService.getScriptCache().get('adm_' + t);
  const current = props_().getProperty(PROP_PW_VER) || '';
  if (ver === null || !current || ver !== current) throw new Error('[AUTH] หมดเวลาการใช้งาน กรุณาเข้าสู่ระบบใหม่');
}

function checkLoginLock_() {
  const fails = Number(CacheService.getScriptCache().get('adm_fails') || 0);
  if (fails >= LOGIN_MAX_FAILS) {
    throw new Error('ใส่รหัสผิดหลายครั้งเกินไป กรุณารอ ' + (LOGIN_LOCK_SECONDS / 60) + ' นาทีแล้วลองใหม่');
  }
}

function recordLoginFail_() {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('adm_fails') || 0) + 1;
  cache.put('adm_fails', String(fails), LOGIN_LOCK_SECONDS);
}

// สถานะ: ตั้งรหัสผ่านแอดมินแล้วหรือยัง
function adminStatus() {
  return { hasPassword: !!props_().getProperty(PROP_PW_HASH) };
}

function adminLogin(password) {
  checkLoginLock_();
  if (!props_().getProperty(PROP_PW_HASH)) throw new Error('ยังไม่ได้ตั้งรหัสผ่านแอดมิน');
  if (!verifyPassword_(password)) {
    recordLoginFail_();
    throw new Error('รหัสผ่านไม่ถูกต้อง');
  }
  CacheService.getScriptCache().remove('adm_fails');
  return { token: createSession_() };
}

// ตั้งรหัสผ่านครั้งแรก หรือรีเซ็ตรหัสผ่าน: ต้องใช้รหัสตั้งค่าที่เจ้าของสคริปต์สร้างจาก Editor
function adminSetup(setupCode, newPassword) {
  checkLoginLock_();
  const p = props_();
  const code = p.getProperty(PROP_SETUP_CODE);
  const exp = Number(p.getProperty(PROP_SETUP_EXP) || 0);
  const given = String(setupCode || '').trim().toUpperCase();
  if (!code || Date.now() > exp || given !== code) {
    recordLoginFail_();
    throw new Error('รหัสตั้งค่าไม่ถูกต้องหรือหมดอายุ (ให้เจ้าของสคริปต์รัน createAdminSetupCode ใน Editor เพื่อสร้างรหัสใหม่)');
  }
  storePassword_(checkNewPassword_(newPassword));
  p.deleteProperty(PROP_SETUP_CODE);
  p.deleteProperty(PROP_SETUP_EXP);
  CacheService.getScriptCache().remove('adm_fails');
  return { token: createSession_() };
}

function adminLogout(token) {
  try {
    CacheService.getScriptCache().remove('adm_' + String(token || ''));
  } catch (e) {
    console.warn(e.message);
  }
  return true;
}

function adminChangePassword(token, oldPassword, newPassword) {
  requireAdmin_(token);
  checkLoginLock_();
  if (!verifyPassword_(oldPassword)) {
    recordLoginFail_();
    throw new Error('รหัสผ่านเดิมไม่ถูกต้อง');
  }
  storePassword_(checkNewPassword_(newPassword));
  return { token: createSession_(), message: 'เปลี่ยนรหัสผ่านเรียบร้อย' };
}

// ข้อมูลทั้งหมดที่หน้าตั้งค่าต้องใช้
function adminGetAll(token) {
  requireAdmin_(token);
  const ss = getSpreadsheet_();
  const lists = {};
  Object.keys(OPTION_SHEETS).forEach(function (key) {
    const sheet = ss.getSheetByName(OPTION_SHEETS[key].sheet);
    lists[key] = sheet ? readColumnA_(sheet) : [];
  });
  const s = getSettings_();
  return {
    lists: lists,
    listDefs: Object.keys(OPTION_SHEETS).map(function (k) {
      return { key: k, sheet: OPTION_SHEETS[k].sheet, label: OPTION_SHEETS[k].label };
    }),
    settings: { title: s.title, subtitle: s.subtitle, required: s.required },
    requiredLabels: OPTIONAL_REQUIRED,
    folder: describeFolder_(),
    banner: describeBanner_()
  };
}

// บันทึกรายการ Dropdown: เขียนทับคอลัมน์ A ตั้งแต่แถว 2 ของชีตนั้น (แถว 1 = หัวตาราง ไม่แตะ)
function adminSaveList(token, key, items) {
  requireAdmin_(token);
  const def = OPTION_SHEETS[key];
  if (!def) throw new Error('ไม่รู้จักรายการนี้');
  if (!Array.isArray(items)) throw new Error('ข้อมูลรายการไม่ถูกต้อง');

  const list = uniqueNonEmpty_(items);
  if (list.length > MAX_LIST_ITEMS) throw new Error('รายการเยอะเกิน ' + MAX_LIST_ITEMS + ' รายการ');
  list.forEach(function (v) {
    if (v.length > MAX_TEXT_LENGTH) throw new Error('มีรายการที่ยาวเกิน ' + MAX_TEXT_LENGTH + ' ตัวอักษร: ' + v.substring(0, 30) + '...');
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = getSpreadsheet_();
    let sheet = ss.getSheetByName(def.sheet);
    if (!sheet) {
      sheet = ss.insertSheet(def.sheet);
      sheet.getRange(1, 1).setValue(def.label).setFontWeight('bold');
    } else if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1).setValue(def.label).setFontWeight('bold');
    }
    const last = sheet.getLastRow();
    if (last >= 2) sheet.getRange(2, 1, last - 1, 1).clearContent();
    if (list.length) {
      const range = sheet.getRange(2, 1, list.length, 1);
      range.setNumberFormat('@');  // เก็บเป็นข้อความ กันเลข 0 หน้าหาย
      range.setValues(list.map(function (v) { return [safeText_(v)]; }));
    }
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  return { items: list, message: 'บันทึกรายการ ' + def.label + ' แล้ว (' + list.length + ' รายการ)' };
}

function adminSaveSettings(token, data) {
  requireAdmin_(token);
  data = data || {};
  const title = str_(data.title);
  const subtitle = str_(data.subtitle);
  if (title.length > 100) throw new Error('ชื่อระบบยาวเกิน 100 ตัวอักษร');
  if (subtitle.length > 200) throw new Error('คำอธิบายยาวเกิน 200 ตัวอักษร');

  const req = {};
  const given = data.required || {};
  Object.keys(OPTIONAL_REQUIRED).forEach(function (k) { req[k] = given[k] !== false; });

  const p = props_();
  if (title) p.setProperty(PROP_TITLE, title); else p.deleteProperty(PROP_TITLE);
  if (subtitle) p.setProperty(PROP_SUBTITLE, subtitle); else p.deleteProperty(PROP_SUBTITLE);
  p.setProperty(PROP_REQUIRED, JSON.stringify(req));
  const s = getSettings_();
  return { settings: { title: s.title, subtitle: s.subtitle, required: s.required }, message: 'บันทึกการตั้งค่าฟอร์มแล้ว' };
}

function extractFolderId_(input) {
  const s = str_(input);
  if (!s) return '';
  const m = /folders\/([A-Za-z0-9_-]{10,})/.exec(s) || /[?&]id=([A-Za-z0-9_-]{10,})/.exec(s);
  const id = m ? m[1] : s;
  if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) throw new Error('Folder ID ไม่ถูกต้อง');
  return id;
}

function describeFolder_() {
  const s = getSettings_();
  const folder = getSlipFolder_();
  const isRoot = folder.getId() === DriveApp.getRootFolder().getId();
  let source = 'root';
  if (!isRoot) source = folder.getId() === s.folderId ? 'settings' : 'code';
  return {
    savedId: s.folderId,
    activeId: folder.getId(),
    activeName: isRoot ? 'My Drive (Root)' : folder.getName(),
    activeUrl: folder.getUrl(),
    source: source
  };
}

function adminTestFolder(token, input) {
  requireAdmin_(token);
  const id = extractFolderId_(input);
  if (!id) return { ok: true, id: '', name: 'My Drive (Root)', message: 'ไม่ระบุโฟลเดอร์ = ใช้ Root ของ Drive' };
  let folder;
  try {
    folder = DriveApp.getFolderById(id);
    folder.getName();
  } catch (e) {
    throw new Error('เปิดโฟลเดอร์นี้ไม่ได้ ตรวจสอบ ID และสิทธิ์ของบัญชีเจ้าของสคริปต์');
  }
  if (folder.isTrashed()) throw new Error('โฟลเดอร์นี้อยู่ในถังขยะ');
  return { ok: true, id: id, name: folder.getName(), url: folder.getUrl(), message: 'เข้าถึงโฟลเดอร์ได้' };
}

function adminSaveFolder(token, input) {
  requireAdmin_(token);
  const id = extractFolderId_(input);
  if (id) {
    try {
      DriveApp.getFolderById(id).getName();
    } catch (e) {
      throw new Error('เปิดโฟลเดอร์นี้ไม่ได้ ตรวจสอบ ID และสิทธิ์ของบัญชีเจ้าของสคริปต์');
    }
    props_().setProperty(PROP_FOLDER_ID, id);
  } else {
    props_().deleteProperty(PROP_FOLDER_ID);
  }
  return { folder: describeFolder_(), message: 'บันทึกโฟลเดอร์เก็บสลิปแล้ว' };
}

// รายการที่บันทึกล่าสุด (ใหม่สุดอยู่บน)
// rowNums/sigs ใช้ยืนยันแถวตอนแบ็คอัพ (กันลบผิดแถวถ้าชีตเปลี่ยนระหว่างนั้น)
function adminGetRecent(token, limit) {
  requireAdmin_(token);
  const n = Math.max(1, Math.min(MAX_RECENT, Number(limit) || 20));
  const sheet = getSpreadsheet_().getSheetByName(DATA_SHEET_NAME);
  const backupTotal = countBackup_();
  if (!sheet || sheet.getLastRow() < 2) return { total: 0, rows: [], rowNums: [], sigs: [], backupTotal: backupTotal };
  const last = sheet.getLastRow();
  const count = Math.min(n, last - 1);
  const first = last - count + 1;
  const values = sheet.getRange(first, 1, count, DATA_HEADERS.length).getDisplayValues();
  const rowNums = values.map(function (_, i) { return first + i; });
  const sigs = values.map(rowSig_);
  return {
    total: last - 1,
    rows: values.reverse(),
    rowNums: rowNums.reverse(),
    sigs: sigs.reverse(),
    backupTotal: backupTotal
  };
}

// รายการในชีต BackupData (ใหม่สุดอยู่บน) อ่านอย่างเดียว คอลัมน์สุดท้ายคือวันที่แบ็คอัพ
function adminGetBackup(token, limit) {
  requireAdmin_(token);
  const n = Math.max(1, Math.min(MAX_RECENT, Number(limit) || 20));
  const sheet = getSpreadsheet_().getSheetByName(BACKUP_SHEET_NAME);
  const dataSheet = getSpreadsheet_().getSheetByName(DATA_SHEET_NAME);
  const dataTotal = dataSheet ? Math.max(0, dataSheet.getLastRow() - 1) : 0;
  if (!sheet || sheet.getLastRow() < 2) return { total: 0, rows: [], dataTotal: dataTotal };
  const last = sheet.getLastRow();
  const count = Math.min(n, last - 1);
  const values = sheet.getRange(last - count + 1, 1, count, DATA_HEADERS.length + 1).getDisplayValues();
  return { total: last - 1, rows: values.reverse(), dataTotal: dataTotal };
}

// ===== แบ็คอัพข้อมูล: ย้ายแถวที่เลือกจาก Data ไป BackupData =====
function rowSig_(displayRow) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(displayRow), Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}

// [2,3,4,7,9,10] -> [[2,3],[7,1],[9,2]]  (แถวเริ่ม, จำนวนแถว)
function toRuns_(sortedRows) {
  const runs = [];
  sortedRows.forEach(function (r) {
    const lastRun = runs[runs.length - 1];
    if (lastRun && lastRun[0] + lastRun[1] === r) lastRun[1]++;
    else runs.push([r, 1]);
  });
  return runs;
}

function countBackup_() {
  const sh = getSpreadsheet_().getSheetByName(BACKUP_SHEET_NAME);
  return sh ? Math.max(0, sh.getLastRow() - 1) : 0;
}

function getOrCreateBackupSheet_(ss) {
  let sh = ss.getSheetByName(BACKUP_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(BACKUP_SHEET_NAME);
    const headers = DATA_HEADERS.concat([BACKUP_TIME_HEADER]);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function adminBackupRows(token, items) {
  requireAdmin_(token);
  if (!Array.isArray(items) || !items.length) throw new Error('กรุณาเลือกรายการที่ต้องการแบ็คอัพ');
  if (items.length > MAX_RECENT) throw new Error('แบ็คอัพได้ครั้งละไม่เกิน ' + MAX_RECENT + ' รายการ');

  const wanted = {};
  items.forEach(function (it) {
    const r = Number(it && it.row);
    if (!(r >= 2) || Math.floor(r) !== r) throw new Error('ข้อมูลแถวไม่ถูกต้อง');
    wanted[r] = String(it.sig || '');
  });

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (e) {
    throw new Error('ระบบกำลังมีผู้ใช้งานพร้อมกันจำนวนมาก กรุณาลองใหม่อีกครั้ง');
  }

  try {
    const ss = getSpreadsheet_();
    const data = ss.getSheetByName(DATA_SHEET_NAME);
    if (!data) throw new Error('ไม่พบชีต ' + DATA_SHEET_NAME);
    const last = data.getLastRow();
    const cols = DATA_HEADERS.length;

    // ตรวจทุกแถวว่ายังเป็นข้อมูลเดียวกับที่หน้าเว็บแสดงอยู่
    const rows = Object.keys(wanted).map(Number).sort(function (a, b) { return a - b; });
    const ok = [];
    let skipped = 0;
    const inRange = rows.filter(function (r) { return r <= last; });
    skipped += rows.length - inRange.length;
    if (inRange.length) {
      const lo = inRange[0];
      const hi = inRange[inRange.length - 1];
      const block = data.getRange(lo, 1, hi - lo + 1, cols).getDisplayValues();
      inRange.forEach(function (r) {
        if (rowSig_(block[r - lo]) === wanted[r]) ok.push(r); else skipped++;
      });
    }
    if (!ok.length) {
      throw new Error('ข้อมูลในชีตเปลี่ยนไปแล้ว ไม่มีรายการที่แบ็คอัพได้ กรุณากดรีเฟรชแล้วเลือกใหม่');
    }
    const runs = toRuns_(ok);

    // 1) คัดลอกไป BackupData ก่อน (copyTo เก็บค่า/รูปแบบเดิม เช่น เบอร์โทรที่ขึ้นต้นด้วย 0)
    const backup = getOrCreateBackupSheet_(ss);
    const startDest = backup.getLastRow() + 1;
    let dest = startDest;
    runs.forEach(function (run) {
      data.getRange(run[0], 1, run[1], cols).copyTo(backup.getRange(dest, 1, run[1], cols));
      dest += run[1];
    });
    const stamp = Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm:ss');
    backup.getRange(startDest, cols + 1, ok.length, 1).setValues(ok.map(function () { return [stamp]; }));
    SpreadsheetApp.flush();

    // 2) ลบออกจาก Data จากล่างขึ้นบน เพื่อไม่ให้เลขแถวที่เหลือเลื่อน
    // Sheets ไม่ยอมให้ลบแถวจนเหลือแค่แถวหัวตาราง จึงเติมแถวว่างไว้ 1 แถวก่อน
    if (data.getMaxRows() - ok.length < 2) data.insertRowsAfter(data.getMaxRows(), 1);
    runs.slice().reverse().forEach(function (run) {
      data.deleteRows(run[0], run[1]);
    });
    SpreadsheetApp.flush();

    let msg = 'แบ็คอัพ ' + ok.length + ' รายการไปชีต ' + BACKUP_SHEET_NAME + ' และลบออกจาก ' + DATA_SHEET_NAME + ' แล้ว';
    if (skipped) msg += ' (ข้าม ' + skipped + ' รายการที่ข้อมูลเปลี่ยนไป)';
    return { moved: ok.length, skipped: skipped, message: msg };
  } finally {
    lock.releaseLock();
  }
}

// =====================================================================
// ===== ฟังก์ชันสำหรับเจ้าของสคริปต์ (รันจาก Apps Script Editor) =====
// =====================================================================

// รันครั้งแรกเพื่อกดอนุญาตสิทธิ์ (Authorize) และสร้างรหัสตั้งค่าแอดมินถ้ายังไม่มีรหัสผ่าน
function authorizeOnce() {
  const ss = getSpreadsheet_();
  getOrCreateDataSheet_(ss);
  console.log('Spreadsheet: ' + ss.getName());
  console.log('Slip folder: ' + getSlipFolder_().getName());
  console.log(JSON.stringify(getInitialData()));
  if (!props_().getProperty(PROP_PW_HASH)) createAdminSetupCode();
}

// สร้างรหัสตั้งค่า (ใช้ตั้งรหัสผ่านแอดมินครั้งแรก หรือรีเซ็ตเมื่อลืมรหัส) ดูรหัสได้ใน Execution log
// ไม่คืนค่าใด ๆ ออกไป ผู้ที่เรียกผ่านหน้าเว็บจึงไม่เห็นรหัส
function createAdminSetupCode() {
  const code = Utilities.getUuid().replace(/-/g, '').substring(0, 10).toUpperCase();
  const p = props_();
  p.setProperty(PROP_SETUP_CODE, code);
  p.setProperty(PROP_SETUP_EXP, String(Date.now() + SETUP_CODE_MINUTES * 60 * 1000));
  console.log('รหัสตั้งค่าแอดมิน: ' + code + '  (ใช้ได้ ' + SETUP_CODE_MINUTES + ' นาที)');
  console.log('เปิด Web App > ตั้งค่าระบบ > ตั้งรหัสผ่าน แล้วใส่รหัสนี้');
}
