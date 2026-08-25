const ss = SpreadsheetApp.getActive()

function doGet(e) {
  return HtmlService.createTemplateFromFile('index')
    .evaluate();
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename)
    .getContent();
}

function productSave(name, adress, celular, all_product_json, total) {
  let lock = LockService.getDocumentLock()
  lock.tryLock(10000)
  if (lock.hasLock()) {
    try {
      // เช็คแค่ว่า id มีจริงในระบบไหม (กันข้อมูลเพี้ยน/หน้าเก่าค้าง) — ส่วนสต็อกไม่พอ อนุญาตให้เบิกได้
      // เพราะฝั่ง client เตือนและให้ผู้ใช้ยืนยันก่อนแล้ว (ดู checkStock ด้านล่าง)
      const { idToCode } = getStockSnapshot();

      let unknownIds = [];
      all_product_json.forEach(r => {
        if (!idToCode[r.id]) unknownIds.push(r.id);
      });

      if (unknownIds.length > 0) {
        return JSON.stringify({
          success: false,
          message: "ไม่พบสินค้าบางรายการในระบบ กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง"
        });
      }

      const ws = ss.getSheetByName("บันทึกรายการเบิก");
      const currentDate = new Date()

      all_product_json.forEach(r => {
        // บันทึกรายการเบิก ซึ่งจะไปกระทบกับสูตรคำนวณสต็อกในหน้า 'รายการสินค้า' โดยอัตโนมัติ
        ws.appendRow([
          currentDate,
          name,
          adress,
          celular,
          r.id,
          r.product, //ชื่อสินค้า
          r.quantity, //ปริมาณ
        ]);
      });

      // บังคับให้ Spreadsheet อัปเดตและคำนวณสูตรทันที
      SpreadsheetApp.flush();

      return JSON.stringify({ success: true, message: "บันทึกการสั่งเบิกเรียบร้อย" });
    } finally {
      lock.releaseLock();
    }
  } else {
    return JSON.stringify({
      success: false,
      message: "ไม่สามารถทำรายการได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง"
    });
  }
}

function categoryLoad() {

  //Logger.log("Funcion Categoria : la fecha y hora: " + new Date());

  //let result={};

  const sheet = ss.getSheetByName("หมวดหมู่สินค้า");
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return JSON.stringify({ user: [] });

  let jo = {};
  let dataArray = [];
  // collecting data from 2nd Row , 1st column to last row and last column
  const rows = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  for (let i = 0, l = rows.length; i < l; i++) {
    let dataRow = rows[i];
    if (dataRow[1] && dataRow[1].toString().trim() !== "") {
      let record = {};
      record['id'] = dataRow[0];
      record['categoria'] = dataRow[1];
      dataArray.push(record);
    }
  }

  jo.user = dataArray;
  const result = JSON.stringify(jo);
  // Logger.log(result)
  return result;
  //  return ContentService.createTextOutput(result).setMimeType(ContentService.MimeType.JSON);

}


// ชื่อสินค้าทั้งในชีตสินค้าและชีตบันทึกการเบิกอยู่ในรูปแบบ "[รหัสสินค้า] ชื่อสินค้า"
// ใช้รหัสสินค้า (บาร์โค้ด) เป็น key กลางแทน id เล็กๆ เพราะสต็อกถูกรวมข้ามสาขา
// และมีสินค้าเดียวกันซ้ำกันคนละ id ในชีตสินค้า
function extractProductCode(text) {
  const match = text && text.toString().match(/^\[([^\]]+)\]/);
  return match ? match[1].trim() : text.toString().trim();
}

// แปลงค่าตัวเลขที่อาจพิมพ์เป็น text มีคอมมาคั่นหลักพัน (เช่น "11,176") ให้เป็นตัวเลขจริง
// พบว่าแถวสินค้าที่เพิ่มเข้ามาทีหลัง (นอกช่วง ARRAYFORMULA เดิมของคอลัมน์ D) บางแถวถูกพิมพ์สต็อกเป็น text แบบนี้
// ถ้าใช้ Number() ตรงๆ จะได้ NaN แล้ว fallback เป็น 0 อย่างเงียบๆ ทำให้สต็อกจริงหายไปทั้งก้อน
function toNumber(v) {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v.toString().replace(/,/g, '').trim());
  return isNaN(n) ? 0 : n;
}

// อ่านสต็อกปัจจุบันของทุกสินค้า (จับคู่ด้วยรหัสสินค้า/บาร์โค้ด รวมยอดเบิกทุกสาขา)
// ใช้ร่วมกันทั้ง productLoad (แสดงผล), productSave (เช็คว่า id มีจริง) และ checkStock (เตือนก่อนยืนยัน)
function getStockSnapshot() {
  const productSheet = ss.getSheetByName("รายการสินค้า");
  const logSheet = ss.getSheetByName("บันทึกรายการเบิก");

  const pLastRow = productSheet.getLastRow();
  const lLastRow = logSheet.getLastRow();

  // ดึงข้อมูลสินค้า (ข้ามหัวตารางแถวที่ 1)
  const productData = pLastRow > 1 ? productSheet.getRange(2, 1, pLastRow - 1, productSheet.getLastColumn()).getValues() : [];

  // ดึงข้อมูลการเบิก (ข้ามหัวตารางแถวที่ 1, ดึงชื่อสินค้าที่ Col F และ Quantity ที่ Col G)
  const logData = lLastRow > 1 ? logSheet.getRange(2, 6, lLastRow - 1, 2).getValues() : [];

  // สร้าง Object เพื่อรวมผลรวมการเบิกรายสินค้า (รวมทุกสาขา เพราะสต็อกใช้ร่วมกัน)
  let totalOutByCode = {};
  logData.forEach(row => {
    let code = extractProductCode(row[0]); // คอลัมน์ F
    let qty = toNumber(row[1]); // คอลัมน์ G
    if (!code) return;
    totalOutByCode[code] = (totalOutByCode[code] || 0) + qty;
  });

  let products = [];
  let idToCode = {};
  let stockByCode = {};

  productData.forEach(dataRow => {
    if (!dataRow[1] || dataRow[1].toString().trim() === "") return;

    const id = dataRow[0];
    const code = extractProductCode(dataRow[1]);
    const baselineStock = toNumber(dataRow[3]); // คอลัมน์ D คือสต็อกคงเหลือตั้งต้น (บางแถวเป็น text มีคอมมา)
    const stock = baselineStock - (totalOutByCode[code] || 0);

    idToCode[id] = code;
    if (!(code in stockByCode)) stockByCode[code] = stock; // สินค้าซ้ำ id คนละแถวแต่ code เดียวกัน ใช้ค่าแรกที่เจอ

    products.push({
      id: id,
      producto: dataRow[1],
      categoria: dataRow[2],
      stock: stock
    });
  });

  return { products, idToCode, stockByCode };
}

function productLoad() {
  const { products } = getStockSnapshot();
  return JSON.stringify({ user: products });
}

// เช็คว่าตะกร้าปัจจุบันมีรายการไหนขอเบิกเกินสต็อกที่มีบ้าง สำหรับให้ client เตือนก่อนกดยืนยัน
// (แค่แจ้งเตือน ไม่ใช่การล็อกกันชน — ระบบยังอนุญาตให้เบิกเกินสต็อกได้ตามที่ผู้ใช้ยืนยัน)
function checkStock(all_product_json) {
  const { idToCode, stockByCode } = getStockSnapshot();

  let requestedByCode = {};
  all_product_json.forEach(r => {
    const code = idToCode[r.id];
    if (!code) return; // id ที่ไม่รู้จักปล่อยให้ productSave() ปฏิเสธตอนบันทึกจริง
    requestedByCode[code] = (requestedByCode[code] || 0) + (Number(r.quantity) || 0);
  });

  let insufficient = [];
  Object.keys(requestedByCode).forEach(code => {
    const available = stockByCode[code] || 0;
    if (requestedByCode[code] > available) {
      insufficient.push({ code: code, requested: requestedByCode[code], available: available });
    }
  });

  return JSON.stringify({ sufficient: insufficient.length === 0, insufficient: insufficient });
}

