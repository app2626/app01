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
  "บาร์โค้ด Trade up :", "บาร์โค้ด Big point :"
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

var SETTINGS_SHEETS = ['Admin', 'location', 'Product', 'Premium', 'guarantee'];

var SHEET_DEFS = [
  { name: 'Data', headers: DATA_HEADERS, color: '#1a73e8' },
  { name: 'Log', headers: LOG_HEADERS, color: '#34a853' },
  { name: 'Admin', headers: ["Username", "Password", "ชื่อผู้ใช้งาน", "สิทธิ์"], color: '#ea4335' },
  { name: 'location', headers: ["ชื่อสาขา"], color: '#fbbc04' },
  { name: 'Product', headers: ["ชื่อสินค้ารุ่นต่างๆ"], color: '#9334e6' },
  { name: 'Premium', headers: ["รายการของแถม"], color: '#ff6d00' },
  { name: 'guarantee', headers: ["รายการรับประกันจอแตก"], color: '#00897b' }
];

/** 1-based column number of a Data header. */
function col_(header) {
  var i = DATA_HEADERS.indexOf(header);
  if (i < 0) throw new Error('Unknown column: ' + header);
  return i + 1;
}

/** Creates missing sheets/headers; extends a shorter header row with the missing trailing headers. */
function ensureSheets_() {
  var ss = SpreadsheetApp.getActive();
  var results = [];
  SHEET_DEFS.forEach(function (def) {
    var sheet = ss.getSheetByName(def.name);
    var isNew = !sheet;
    if (isNew) sheet = ss.insertSheet(def.name);
    var status;
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
      status = isNew ? 'สร้างใหม่ ✅' : 'เพิ่มหัวตาราง ✅';
    } else {
      var width = Math.max(sheet.getLastColumn(), 1);
      var current = sheet.getRange(1, 1, 1, width).getDisplayValues()[0];
      var filled = current.filter(function (h) { return String(h).trim() !== ''; }).length;
      if (filled < def.headers.length) {
        var missing = def.headers.slice(filled);
        sheet.getRange(1, filled + 1, 1, missing.length).setValues([missing]);
        status = 'เพิ่มคอลัมน์ใหม่ ' + missing.length + ' คอลัมน์ ✅';
      } else {
        status = 'มีข้อมูลอยู่แล้ว ⏭️';
      }
    }
    sheet.getRange(1, 1, 1, def.headers.length).setFontWeight('bold').setBackground(def.color)
      .setFontColor('#ffffff').setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
    results.push({ name: def.name, status: status });
  });
  if (typeof ensureConfigSheet_ === 'function') results.push(ensureConfigSheet_());
  return results;
}

function getDataSheet_() {
  var sheet = SpreadsheetApp.getActive().getSheetByName('Data');
  if (!sheet) { ensureSheets_(); sheet = SpreadsheetApp.getActive().getSheetByName('Data'); }
  return sheet;
}
