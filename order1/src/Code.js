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
  lock.tryLock(1000)
  if (lock.hasLock()) {
    const ws = ss.getSheetByName("บันทึกรายการเบิก");
    const currentDate = new Date()
    all_product_json.forEach(r => {
      ws.appendRow([
        currentDate,
        name,
        adress,
        celular,
        r.id,
        r.product, //ชื่อสินค้า
        r.quantity, //ปริมาณ
      ]);
    })
    lock.releaseLock()
    return "บันทึกการสั่งเบิกเรียบร้อย";
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

  // Logger.log("Funcion productLoad : la fecha y hora: " + new Date());

  const sheet = ss.getSheetByName("รายการสินค้า");
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
      record['producto'] = dataRow[1];
      record['categoria'] = dataRow[2];
      dataArray.push(record);
    }
  }

  jo.user = dataArray;
  const result = JSON.stringify(jo);
  return result;
  //  return ContentService.createTextOutput(result).setMimeType(ContentService.MimeType.JSON);

}

