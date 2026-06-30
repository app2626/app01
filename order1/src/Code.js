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
      
      return "บันทึกการสั่งเบิกเรียบร้อย";
    } finally {
      lock.releaseLock();
    }
  } else {
    return "ไม่สามารถทำรายการได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง";
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


function productLoad() {
  const productSheet = ss.getSheetByName("รายการสินค้า");
  const logSheet = ss.getSheetByName("บันทึกรายการเบิก");
  
  const pLastRow = productSheet.getLastRow();
  const lLastRow = logSheet.getLastRow();

  // ดึงข้อมูลสินค้า (ข้ามหัวตารางแถวที่ 1)
  const productData = pLastRow > 1 ? productSheet.getRange(2, 1, pLastRow - 1, productSheet.getLastColumn()).getValues() : [];
  
  // ดึงข้อมูลการเบิก (ข้ามหัวตารางแถวที่ 1, ดึง ID ที่ Col E และ Quantity ที่ Col G)
  const logData = lLastRow > 1 ? logSheet.getRange(2, 5, lLastRow - 1, 3).getValues() : [];

  // สร้าง Object เพื่อรวมผลรวมการเบิกรายสินค้า
  let salesSummary = {};
  logData.forEach(row => {
    let id = row[0]; // คอลัมน์ E
    let qty = Number(row[2]) || 0; // คอลัมน์ G
    salesSummary[id] = (salesSummary[id] || 0) + qty;
  });

  let jo = {};
  let dataArray = [];

  for (let i = 0; i < productData.length; i++) {
    let dataRow = productData[i];
    if (dataRow[1] && dataRow[1].toString().trim() !== "") {
      let id = dataRow[0];
      let initialStock = Number(dataRow[3]) || 0; // คอลัมน์ D คือสต็อกตั้งต้น
      let totalOut = salesSummary[id] || 0; 
      
      let record = {};
      record['id'] = id;
      record['producto'] = dataRow[1];
      record['categoria'] = dataRow[2];
      record['stock'] = initialStock - totalOut; 
      dataArray.push(record);
    }
  }

  jo.user = dataArray;
  return JSON.stringify(jo);
}

