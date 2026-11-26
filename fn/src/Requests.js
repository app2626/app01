// Consignment requests: submission, listing, and the server-owned approval workflow.

var MAX_FILE_BYTES_ = 10 * 1024 * 1024;

var DISCOUNTS_ = [
  { field: 'discountais', barcode: 'barcode_ais', col: 'ส่วนลด เปิดเบอร์ AIS :', barcodeCol: 'บาร์โค้ด AIS :' },
  { field: 'discountpromotion', barcode: 'barcode_promotion', col: 'ส่วนลด promotion :', barcodeCol: 'บาร์โค้ด promotion :' },
  { field: 'discounttradein', barcode: 'barcode_tradein', col: 'ส่วนลด Trade in :', barcodeCol: 'บาร์โค้ด Trade in :' },
  { field: 'discounttradeup', barcode: 'barcode_tradeup', col: 'ส่วนลด Trade up :', barcodeCol: 'บาร์โค้ด Trade up :' },
  { field: 'discountbigc', barcode: 'barcode_bigc', col: 'ส่วนลด Big point :', barcodeCol: 'บาร์โค้ด Big point :' }
];

// form field -> [Data header, Thai label for errors]
var TEXT_FIELDS_ = [
  ['date', 'วันที่ขออนุมัติ', 'วันที่ขออนุมัติ'],
  ['location', 'สาขา :', 'สาขา'],
  ['emp_id', 'รหัสพนักงาน :', 'รหัสพนักงาน'],
  ['emp_name', 'ชื่อ-สกุล(พนง.) :', 'ชื่อ-สกุล(พนง.)'],
  ['customer_name', 'ชื่อตัวและสกุล (ลูกค้า) :', 'ชื่อตัวและสกุล (ลูกค้า)'],
  ['address', 'ที่อยู่ :', 'ที่อยู่'],
  ['road', 'หมู่ที่ :', 'หมู่ที่'],
  ['district', 'ตำบล/แขวง :', 'ตำบล/แขวง'],
  ['amphoe', 'อำเภอ/เขต :', 'อำเภอ/เขต'],
  ['province', 'จังหวัด :', 'จังหวัด'],
  ['productname', 'ชื่อรุ่นสินค้า', 'ชื่อรุ่นสินค้า'],
  ['imei', 'IMEI :', 'IMEI']
];
var AMOUNT_FIELDS_ = [
  ['price', 'ราคาขายปลีกปกติ :', 'ราคาขายปลีกปกติ'],
  ['down', 'เงินดาวน์ :', 'เงินดาวน์'],
  ['discountais', 'ส่วนลด เปิดเบอร์ AIS :', 'ส่วนลด เปิดเบอร์ AIS'],
  ['discountpromotion', 'ส่วนลด promotion :', 'ส่วนลด promotion'],
  ['discounttradein', 'ส่วนลด Trade in :', 'ส่วนลด Trade in'],
  ['discounttradeup', 'ส่วนลด Trade up :', 'ส่วนลด Trade up'],
  ['discountbigc', 'ส่วนลด Big point :', 'ส่วนลด Big point'],
  ['dues', 'ค่าธรรมเนียม :', 'ค่าธรรมเนียม'],
  ['installment_amount', 'งวดละ :', 'งวดละ']
];

function str_(v) { return String(v == null ? '' : v).trim(); }

function amount_(v, label) {
  var s = str_(v).replace(/,/g, '');
  if (s === '') s = '0';
  var n = Number(s);
  if (!isFinite(n) || n < 0) throw new Error('กรุณากรอก ' + label + ' เป็นตัวเลขที่ไม่ติดลบ');
  return n;
}

/** ราคาสุทธิ = ราคา − ดาวน์ − ส่วนลดทั้งหมด + ค่าธรรมเนียม (same formula the form always used). */
function calcNetPrice_(f) {
  var n = amount_(f.price, 'ราคาขายปลีกปกติ') - amount_(f.down, 'เงินดาวน์') + amount_(f.dues, 'ค่าธรรมเนียม');
  DISCOUNTS_.forEach(function (d) { n -= amount_(f[d.field], d.col); });
  return Math.round(n * 100) / 100;
}

function checkFile_(file, kind) {
  var isPdf = kind === 'pdf';
  var label = isPdf ? 'ไฟล์ PDF หนังสือสัญญา' : 'รูปสลิปการโอนเงิน';
  if (!file || !file.base64) throw new Error('กรุณาแนบ' + label);
  var mime = String(file.mimeType || '');
  if (isPdf ? mime !== 'application/pdf' : !/^image\//.test(mime)) {
    throw new Error(isPdf ? 'หนังสือสัญญาต้องเป็นไฟล์ PDF' : 'สลิปต้องเป็นไฟล์รูปภาพ');
  }
  if (String(file.base64).length * 3 / 4 > MAX_FILE_BYTES_) throw new Error(label + ' ต้องมีขนาดไม่เกิน 10 MB');
}

function validateForm_(f) {
  TEXT_FIELDS_.forEach(function (x) { if (!str_(f[x[0]])) throw new Error('กรุณากรอก ' + x[2]); });
  // normalised in place so saveRequest stores the clean values
  f.emp_phone = normalizePhone_(f.emp_phone);
  if (!f.emp_phone) throw new Error('เบอร์ติดต่อ(พนง.) ไม่ถูกต้อง: ' + PHONE_RULE_TEXT_);
  f.customer_phone = normalizePhone_(f.customer_phone);
  if (!f.customer_phone) throw new Error('เบอร์ติดต่อลูกค้า ไม่ถูกต้อง: ' + PHONE_RULE_TEXT_);
  f.id_type = str_(f.id_type) || ID_TYPES_.THAI; // older clients send no type
  if (f.id_type === ID_TYPES_.THAI) {
    f.id_card_number = thaiIdNo_(f.id_card_number);
    if (!f.id_card_number) throw new Error('เลขบัตรประชาชนไม่ถูกต้อง: ต้องเป็นตัวเลข 13 หลัก และเลขตรวจสอบหลักสุดท้ายต้องถูกต้อง');
  } else if (f.id_type === ID_TYPES_.PASSPORT) {
    f.id_card_number = passportNo_(f.id_card_number);
    if (!f.id_card_number) throw new Error('เลขพาสปอร์ตไม่ถูกต้อง: ใช้ตัวอักษรภาษาอังกฤษและตัวเลข 6-9 ตัว');
  } else {
    throw new Error('ประเภทเอกสารไม่ถูกต้อง');
  }
  if (!/^\d{5}$/.test(str_(f.zipcode))) throw new Error('รหัสไปรษณีย์ ต้องเป็นตัวเลข 5 หลัก');
  AMOUNT_FIELDS_.forEach(function (x) { amount_(f[x[0]], x[2]); });
  var inst = Number(str_(f.installments));
  if (!(inst >= 1 && inst <= 60 && Math.floor(inst) === inst)) throw new Error('จำนวนงวด ต้องเป็นจำนวนเต็ม 1–60');
  checkFile_(f.file1Data, 'image');
  checkFile_(f.file2Data, 'pdf');
}

function uploadFolder_() {
  var config = getConfig_();
  try {
    return DriveApp.getFolderById(config.driveFolderId);
  } catch (e) {
    throw new Error('ไม่สามารถเข้าถึงโฟลเดอร์ Google Drive ได้ กรุณาให้แอดมินตรวจสอบ Folder ID ในหน้าตั้งค่า');
  }
}

function toBlob_(file) {
  return Utilities.newBlob(Utilities.base64Decode(file.base64), file.mimeType, String(file.name || 'file').slice(0, 120));
}

/** 0-based index into the Data sheet values (row 0 = header), or -1. */
function findRowIndex_(sheet, id) {
  id = str_(id);
  if (!id || sheet.getLastRow() < 2) return -1;
  var ids = sheet.getRange(1, 1, sheet.getLastRow(), 1).getDisplayValues();
  for (var i = 1; i < ids.length; i++) if (str_(ids[i][0]) === id) return i;
  return -1;
}

function newId_(sheet) {
  var n = Date.now();
  var existing = {};
  if (sheet.getLastRow() >= 2) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues().forEach(function (r) { existing[str_(r[0])] = true; });
  }
  while (existing[String(n)]) n++;
  return String(n);
}

/** Public (any role). */
function saveRequest(token, f) {
  var user = requireSession_(token);
  f = f || {};
  validateForm_(f);
  var scope = branchScope_(user);
  if (scope && !scope.length) throw new Error('บัญชีของคุณยังไม่ได้กำหนดสาขา กรุณาติดต่อแอดมิน');
  if (!inScope_(scope, f.location)) throw new Error('สาขา "' + str_(f.location) + '" ไม่ใช่สาขาที่ลงทะเบียนไว้');
  var finance = str_(f.finance);
  if (!finance) throw new Error('กรุณาเลือก ไฟแนนซ์');
  if (financeList_().indexOf(finance) < 0) throw new Error('ไม่พบไฟแนนซ์ "' + finance + '" ในรายการ กรุณาเลือกใหม่ หรือให้แอดมินเพิ่มในหน้าตั้งค่า');
  var net = calcNetPrice_(f);
  var folder = uploadFolder_();
  var blob1 = toBlob_(f.file1Data), blob2 = toBlob_(f.file2Data);

  // Uploads happen outside the lock: they can take seconds and would block every other save/approval.
  var file1 = folder.createFile(blob1);
  var file2 = folder.createFile(blob2);
  var file1Id = file1.getId(), file2Id = file2.getId();

  var id;
  try {
    id = withLock_(function () {
      var sheet = getDataSheet_();
      var newIdValue = newId_(sheet);

      var row = DATA_HEADERS.map(function () { return ''; });
      var set = function (h, v) { row[col_(h) - 1] = v; };
      set('ID :', "'" + newIdValue);
      TEXT_FIELDS_.forEach(function (x) { set(x[1], cellText_(f[x[0]])); });
      set('เบอร์ติดต่อ(พนง.) :', "'" + str_(f.emp_phone));
      set('เลขบัตรประชาชน :', "'" + str_(f.id_card_number));
      set('เบอร์ติดต่อลูกค้า :', "'" + str_(f.customer_phone));
      set('รหัสไปรษณีย์ :', "'" + str_(f.zipcode));
      set('PREMIUM :', cellText_(f.premium_combined));
      set('การรับประกันจอแตก :', cellText_(f.guarantee));
      AMOUNT_FIELDS_.forEach(function (x) { set(x[1], amount_(f[x[0]], x[2])); });
      DISCOUNTS_.forEach(function (d) { set(d.barcodeCol, cellText_(f[d.barcode])); });
      set('ราคาสุทธิ :', net);
      set('จำนวนงวด :', Number(str_(f.installments)));
      set('รูปสลิปเงินโอน :', 'https://lh3.googleusercontent.com/d/' + file1Id);
      set('ใบเสร็จ :', 'https://drive.google.com/uc?id=' + file2Id);
      set('สถานะ :', STATUS.WAIT);
      set('ไฟแนนซ์ :', cellText_(finance));
      set('ประเภทเอกสาร :', f.id_type);
      set('ผู้บันทึก (Username) :', cellText_(user.username));
      sheet.appendRow(row);
      return newIdValue;
    });
  } catch (e) {
    // the row was not written: do not leave orphan uploads in Drive
    [file1, file2].forEach(function (file) { try { file.setTrashed(true); } catch (ignore) {} });
    throw e;
  }

  var discountLines = DISCOUNTS_.map(function (d) {
    var bc = str_(f[d.barcode]);
    return '\n' + d.col.replace(' :', '') + ': ' + (bc ? '[' + bc + '] ' : '') + amount_(f[d.field], d.col);
  }).join('');
  var msg = 'ขออนุมัติเพื่อการขาย FN+ Consignment'
    + '\nวันที่ขออนุมัติ: ' + str_(f.date)
    + '\nไฟแนนซ์: ' + finance
    + '\nสาขา: ' + str_(f.location)
    + '\nชื่อตัวและสกุล (ลูกค้า): ' + str_(f.customer_name)
    + '\nเบอร์ติดต่อลูกค้า: ' + str_(f.customer_phone)
    + '\nชื่อรุ่นสินค้า: ' + str_(f.productname)
    + '\nIMEI: ' + str_(f.imei)
    + '\nราคาขายปลีกปกติ: ' + amount_(f.price, 'ราคา')
    + '\nเงินดาวน์: ' + amount_(f.down, 'เงินดาวน์')
    + discountLines
    + '\nค่าธรรมเนียม: ' + amount_(f.dues, 'ค่าธรรมเนียม')
    + '\nราคาสุทธิ: ' + net
    + '\nจำนวนงวด: ' + str_(f.installments)
    + '\nงวดละ: ' + amount_(f.installment_amount, 'งวดละ')
    + '\n📌สถานะ ' + STATUS.WAIT;
  sendNotify_(msg, false, [blob1, blob2], 'ขออนุมัติทำรายการ FN+ Consignment ชื่อ ' + str_(f.customer_name) + ' สาขา ' + str_(f.location), blob1);
  return { id: id };
}

function maskRowFor_(row, role) {
  if (role === ROLES.STAFF) {
    var i = col_('เลขบัตรประชาชน :') - 1;
    var v = str_(row[i]);
    row[i] = v ? 'XXXXXXXXX' + v.slice(-4) : '';
  }
  return row;
}

function padRow_(r) {
  r = r.slice(0, DATA_HEADERS.length);
  while (r.length < DATA_HEADERS.length) r.push('');
  return r;
}

/** Public (any role). Staff get only their registered branches, with the national ID masked. */
function getData(token) {
  var user = requireSession_(token);
  var scope = branchScope_(user);
  if (scope && !scope.length) return [];
  var sheet = getDataSheet_();
  if (sheet.getLastRow() < 2) return [];
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, DATA_HEADERS.length).getDisplayValues();
  var b = col_('สาขา :') - 1;
  return data
    .filter(function (r) { return r.join('').trim() !== '' && inScope_(scope, r[b]); })
    .map(function (r) { return maskRowFor_(padRow_(r), user.role); });
}

/** Public (any role). A row outside the staff member's branches reads as not found. */
function findRecord(token, record) {
  var user = requireSession_(token);
  var sheet = getDataSheet_();
  var idx = findRowIndex_(sheet, record);
  var row = idx < 1 ? null : padRow_(sheet.getRange(idx + 1, 1, 1, DATA_HEADERS.length).getDisplayValues()[0]);
  if (!row || !inScope_(branchScope_(user), row[col_('สาขา :') - 1])) throw new Error('ไม่พบข้อมูล ID: ' + record);
  return maskRowFor_(row, user.role);
}

// A function, not a top-level var: it reads STATUS from Schema.js, and GAS file load order is not guaranteed.
function workflow_() {
  return {
  approve: { from: ['', STATUS.WAIT], to: STATUS.SO },
  reject: { from: ['', STATUS.WAIT], to: STATUS.REJECT },
  // legacy 'อนุมัติแล้ว' rows: without an SO number they need updateSO, with one they need updateAR
  updateSO: { from: [STATUS.SO, STATUS.LEGACY_APPROVED], to: STATUS.INV, legacySO: false },
  updateAR: { from: [STATUS.INV, STATUS.LEGACY_APPROVED], to: STATUS.DONE, legacySO: true }
  };
}

function orDash_(v) { v = str_(v); return v || '-'; }

/** Public (แอดมิน, บัญชี). The server decides the new status; actor comes from the session. */
function updateStatus(token, obj) {
  var user = requireSession_(token, [ROLES.ADMIN, ROLES.ACC]);
  obj = obj || {};
  var step = Object.prototype.hasOwnProperty.call(workflow_(), obj.action) ? workflow_()[obj.action] : null;
  if (!step) throw new Error('INVALID_ACTION');

  if (obj.action === 'approve' && !str_(obj.financeAmount)) throw new Error('กรุณากรอก ยอดเงินโอนที่ได้รับ(การเงิน)');
  if (obj.action === 'approve') amount_(obj.financeAmount, 'ยอดเงินโอนที่ได้รับ(การเงิน)');
  if (obj.action === 'reject' && !str_(obj.Remark)) throw new Error('กรุณากรอกหมายเหตุที่ไม่อนุมัติ');
  if (obj.action === 'updateSO' && !str_(obj.soCreated)) throw new Error('กรุณากรอกเลข Sales Order');
  if (obj.action === 'updateAR' && !str_(obj.invoice)) throw new Error('กรุณากรอกเลข Invoice');

  var result = withLock_(function () {
    var sheet = getDataSheet_();
    var idx = findRowIndex_(sheet, obj.record);
    if (idx < 1) throw new Error('ไม่พบข้อมูล ID: ' + obj.record);
    var rowNum = idx + 1;
    var current = str_(sheet.getRange(rowNum, col_('สถานะ :')).getDisplayValue());
    var allowed = step.from.indexOf(current) >= 0;
    if (allowed && current === STATUS.LEGACY_APPROVED) {
      var hasSO = str_(sheet.getRange(rowNum, col_('Sales Order created :')).getDisplayValue()) !== '';
      allowed = hasSO === step.legacySO;
    }
    if (!allowed) {
      throw new Error('รายการนี้ถูกดำเนินการไปแล้ว (สถานะปัจจุบัน: ' + (current || STATUS.WAIT) + ')');
    }
    var put = function (h, v) { sheet.getRange(rowNum, col_(h)).setValue(cellText_(v)); };
    put('สถานะ :', step.to);
    if (obj.action === 'approve' || obj.action === 'reject') {
      put('Remark(การเงิน) :', orDash_(obj.Remark));
      if (obj.action === 'approve') {
        put('ยอดเงินโอนที่ได้รับ(การเงิน) :', str_(obj.financeAmount));
        put('Remark(การเงิน)ใส่หมายเหตุเพิ่มถ้ามี :', orDash_(obj.financeRemarkExtra));
      }
    } else if (obj.action === 'updateSO') {
      put('Remark(SO) :', orDash_(obj.soRemark));
      put('Sales Order created :', str_(obj.soCreated));
      put('Remark(SO)ใส่หมายเหตุเพิ่มถ้ามี :', orDash_(obj.soRemarkExtra));
    } else {
      put('Invoice บัญชี :', str_(obj.invoice));
      put('AR ใส่หมายเกตุถ้ามี :', orDash_(obj.arRemark));
    }
    var logSheet = SpreadsheetApp.getActive().getSheetByName('Log');
    if (!logSheet) logSheet = ensureSheetByName_('Log');
    logSheet.appendRow([new Date(), user.name, step.to, str_(obj.record), obj.action]);
    return sheet.getRange(rowNum, 1, 1, DATA_HEADERS.length).getDisplayValues()[0];
  });

  if (obj.action === 'approve' || obj.action === 'reject') {
    var r = result, c = function (h) { return r[col_(h) - 1]; };
    var msg = 'ผลการอนุมัติและการดำเนินการ'
      + '\nวันที่ขออนุมัติ: ' + c('วันที่ขออนุมัติ')
      + '\nไฟแนนซ์: ' + (c('ไฟแนนซ์ :') || 'Ponmai')
      + '\nสาขา: ' + c('สาขา :')
      + '\nชื่อตัวและสกุล (ลูกค้า): ' + c('ชื่อตัวและสกุล (ลูกค้า) :')
      + '\nเบอร์ติดต่อลูกค้า: ' + c('เบอร์ติดต่อลูกค้า :')
      + '\nชื่อรุ่นสินค้า: ' + c('ชื่อรุ่นสินค้า')
      + '\nราคาเต็ม: ' + c('ราคาขายปลีกปกติ :')
      + '\nจำนวนงวด: ' + c('จำนวนงวด :')
      + '\nงวดละ: ' + c('งวดละ :')
      + '\n📌📌สถานะ ' + step.to
      + '\n📝 หมายเหตุ: ' + orDash_(obj.Remark)
      + (obj.action === 'approve' ? '\n💰 ยอดเงินโอนที่ได้รับ(การเงิน): ' + str_(obj.financeAmount) : '')
      + '\n👤 ผู้ดำเนินการ: ' + user.name;
    var subject = (obj.action === 'approve' ? 'อนุมัติ' : 'ไม่อนุมัติ') + 'ให้ทำรายการ FN+ Consignment ได้ สาขา ' + c('สาขา :');
    sendNotify_(msg, true, [], subject);
    notifySubmitter_(r, obj, step.to, user);
  }
  return { status: step.to };
}

/**
 * Emails the result of approve / reject to the employee who submitted the request: the account in
 * "ผู้บันทึก (Username) :", or for older rows the account whose username equals "รหัสพนักงาน :".
 */
function notifySubmitter_(row, obj, newStatus, actor) {
  try {
    var c = function (h) { return str_(row[col_(h) - 1]); };
    var submitter = findUser_(c('ผู้บันทึก (Username) :')) || findUser_(c('รหัสพนักงาน :'));
    if (!submitter || !submitter.email || !validEmail_(submitter.email)) return;
    var approved = obj.action === 'approve';
    var text = 'เรียน ' + submitter.name
      + '\n\nคำขอขายผ่อนชำระของคุณ' + (approved ? 'ได้รับการอนุมัติแล้ว' : 'ไม่ได้รับการอนุมัติ')
      + '\n\nเลขที่คำขอ: ' + c('ID :')
      + '\nสาขา: ' + c('สาขา :')
      + '\nลูกค้า: ' + c('ชื่อตัวและสกุล (ลูกค้า) :')
      + '\nสินค้า: ' + c('ชื่อรุ่นสินค้า') + ' (IMEI ' + c('IMEI :') + ')'
      + '\nไฟแนนซ์: ' + (c('ไฟแนนซ์ :') || 'Ponmai')
      + '\nสถานะ: ' + newStatus
      + (approved ? '\nยอดเงินโอนที่ได้รับ: ' + str_(obj.financeAmount) : '')
      + '\nหมายเหตุ: ' + orDash_(obj.Remark)
      + '\nผู้ดำเนินการ: ' + actor.name
      + (approved ? '' : '\n\nกรุณาตรวจสอบหมายเหตุ แล้วส่งคำขอใหม่หากต้องการ');
    mailUser_(submitter.email, 'FN+ Consignment: คำขอ' + (approved ? 'ได้รับการอนุมัติ' : 'ไม่อนุมัติ') + ' - ' + c('ชื่อตัวและสกุล (ลูกค้า) :'), text);
  } catch (e) {
    console.error('Submitter notify failed: ' + e.message);
  }
}
