// Sheet schema: the single source of truth for sheet names, headers and statuses.
// Data columns are APPEND-ONLY: never reorder or remove — existing rows depend on positions.

var DATA_HEADERS = [
  "ID :", "วันที่ขออนุมัติ", "สาขา :", "รหัสพนักงาน :", "ชื่อ-สกุล(พนง.) :",
  "เบอร์ติดต่อ(พนง.) :", "เลขบัตรประชาชน :", "ชื่อตัวและสกุล (ลูกค้า) :",
  "เบอร์ติดต่อลูกค้า :", "ที่อยู่ :", "หมู่ที่ :", "ตำบล/แขวง :",
  "อำเภอ/เขต :", "จังหวัด :", "รหัสไปรษณีย์ :", "ชื่อรุ่นสินค้า",
  "IMEI :", "PREMIUM :", "การรับประกันจอแตก :", "ราคาขายปลีกปกติ :",
  "เงินดาวน์ :", "ส่วนลด เปิดเบอร์ AIS :", "ส่วนลด promotion :",
  "ส่วนลด Trade in :", "ส่วนลด Trade up :", "ส่วนลด Big point :",
  "ค่าธรรมเนียม :", "ราคาสุทธิ :", "จำนวนงวด :", "งวดละ :",
  "รูปสลิปเงินโอน :", "ใบเสร็จ :", "สถานะ :", "Remark(การเงิน) :",
  "ยอดเงินโอนที่ได้รับ(การเงิน) :", "Remark(การเงิน)ใส่หมายเหตุเพิ่มถ้ามี :",
  "Remark(SO) :", "Sales Order created :", "Remark(SO)ใส่หมายเหตุเพิ่มถ้ามี :",
  "Invoice บัญชี :", "AR ใส่หมายเกตุถ้ามี :",
  // appended 2026-11 (barcodes used to be prefixed into the discount cells)
  "บาร์โค้ด AIS :", "บาร์โค้ด promotion :", "บาร์โค้ด Trade in :",
  "บาร์โค้ด Trade up :", "บาร์โค้ด Big point :",
  // appended 2026-11: finance company (blank on older rows = Ponmai)
  "ไฟแนนซ์ :"
];

var LOG_HEADERS = ["วันที่/เวลา", "ผู้ดำเนินการ", "สถานะการอนุมัติ", "ID รายการ", "รายละเอียด"];

var STATUS = {
  WAIT: 'รออนุมัติ',
  SO: 'รอเปิด SO',
  INV: 'รอเปิด Invoice',
  DONE: 'เสร็จสมบูรณ์',
  REJECT: 'ไม่อนุมัติ',
  LEGACY_APPROVED: 'อนุมัติแล้ว'
};

var SETTINGS_SHEETS = ['Admin', 'location', 'Product', 'Premium', 'guarantee', 'Finance'];

// strict: column positions matter (rows are written by position), so the live header must match.
var SHEET_DEFS = [
  { name: 'Data', headers: DATA_HEADERS, color: '#1a73e8', strict: true },
  { name: 'Log', headers: LOG_HEADERS, color: '#34a853', strict: true },
  { name: 'Admin', headers: ['Username', 'Password', 'ชื่อผู้ใช้งาน', 'สิทธิ์'], color: '#ea4335' },
  { name: 'location', headers: ['ชื่อสาขา'], color: '#fbbc04' },
  { name: 'Product', headers: ['ชื่อสินค้ารุ่นต่างๆ'], color: '#9334e6' },
  { name: 'Premium', headers: ['รายการของแถม'], color: '#ff6d00' },
  { name: 'guarantee', headers: ['รายการรับประกันจอแตก'], color: '#00897b' },
  // seed rows are written only when the sheet is first created
  { name: 'Finance', headers: ['ชื่อไฟแนนซ์'], color: '#0f6b5c', seed: [['Ponmai'], ['Vyvr']] }
];

/** 1-based column number of a Data header. */
function col_(header) {
  var i = DATA_HEADERS.indexOf(header);
  if (i < 0) throw new Error('Unknown column: ' + header);
  return i + 1;
}

/** Sheets created by appendRow are only as wide as their first row; getRange past the grid throws. */
function ensureWidth_(sheet, width) {
  var max = sheet.getMaxColumns();
  if (max < width) sheet.insertColumnsAfter(max, width - max);
}

/**
 * Compares the live header row with the expected one. Returns the number of trailing headers to
 * append, or throws when an existing header differs (appending would put data in the wrong column).
 */
function missingHeaderCount_(sheet, headers) {
  var current = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0].map(function (h) { return String(h).trim(); });
  var firstEmpty = current.indexOf('');
  if (firstEmpty < 0) firstEmpty = headers.length;
  for (var i = 0; i < headers.length; i++) {
    var ok = i < firstEmpty ? current[i] === headers[i] : current[i] === '';
    if (!ok) {
      throw new Error('หัวตารางของชีต ' + sheet.getName() + ' คอลัมน์ ' + (i + 1) + ' เป็น "' + current[i] +
        '" แต่ระบบต้องการ "' + headers[i] + '" กรุณาแก้ไขหัวตารางในชีตก่อน');
    }
  }
  return headers.length - firstEmpty;
}

/** Creates missing sheets/headers; appends missing trailing headers. Throws on a mismatched strict header row. */
function ensureSheets_() {
  var results = SHEET_DEFS.map(ensureSheet_);
  if (typeof ensureConfigSheet_ === 'function') results.push(ensureConfigSheet_());
  return results;
}

/**
 * Runtime helper: returns the named sheet, creating only that one if it is missing.
 * Unlike ensureSheets_, it never validates other sheets, so header drift elsewhere
 * (e.g. a legacy Log header) cannot break unrelated features.
 */
function ensureSheetByName_(name) {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  var def = SHEET_DEFS.filter(function (d) { return d.name === name; })[0];
  if (!def) throw new Error('Unknown sheet: ' + name);
  ensureSheet_(def);
  return ss.getSheetByName(name);
}

function ensureSheet_(def) {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(def.name);
  var isNew = !sheet;
  if (isNew) sheet = ss.insertSheet(def.name);
  ensureWidth_(sheet, def.headers.length);
  var status;
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
    status = isNew ? 'สร้างใหม่ ✅' : 'เพิ่มหัวตาราง ✅';
    if (isNew && def.seed) sheet.getRange(2, 1, def.seed.length, def.seed[0].length).setValues(def.seed);
  } else if (def.strict) {
    var missing = missingHeaderCount_(sheet, def.headers);
    if (missing > 0) {
      var from = def.headers.length - missing;
      sheet.getRange(1, from + 1, 1, missing).setValues([def.headers.slice(from)]);
      status = 'เพิ่มคอลัมน์ใหม่ ' + missing + ' คอลัมน์ ✅';
    } else {
      status = 'มีข้อมูลอยู่แล้ว ⏭️';
    }
  } else {
    status = 'มีข้อมูลอยู่แล้ว ⏭️';
  }
  sheet.getRange(1, 1, 1, def.headers.length).setFontWeight('bold').setBackground(def.color)
    .setFontColor('#ffffff').setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
  return { name: def.name, status: status };
}

/**
 * Runtime accessor. Never throws on schema drift (the app must keep working): it widens the grid and
 * appends missing headers only when the existing header row matches; initializeAllSheets reports drift.
 */
function getDataSheet_() {
  var sheet = SpreadsheetApp.getActive().getSheetByName('Data');
  if (!sheet) return ensureSheetByName_('Data');
  ensureWidth_(sheet, DATA_HEADERS.length);
  try {
    var missing = missingHeaderCount_(sheet, DATA_HEADERS);
    if (missing > 0) {
      var from = DATA_HEADERS.length - missing;
      sheet.getRange(1, from + 1, 1, missing).setValues([DATA_HEADERS.slice(from)]);
    }
  } catch (e) {
    console.warn('Data header drift: ' + e.message);
  }
  return sheet;
}
