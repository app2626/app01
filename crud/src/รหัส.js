/**
 * @OnlyCurrentDoc
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
      .setTitle('ระบบแจ้งขออนุมัติ')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function initDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Data');
  
  const headers = [
    'ID', 'Timestamp', 'เรื่อง', 'สาขา', 'รายละเอียดสินค้า', 'บาร์ขาย', 
    'ราคาในระบบ', 'ราคาสุทธิ', 'ระยะเวลาโปรโมชั่น', 'ลูกค้า/เบอร์โทร', 
    'แพ็คเกจ AIS', 'IMEI เครื่องเก่า', 'Area', 'สถานะ'
  ];

  if (!sheet) {
    sheet = ss.insertSheet('Data');
  } else {
    // If sheet exists but is empty, or to ensure headers are correct
    const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
    if (currentHeaders[0] === "") {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
  }

  // Set Headers if they are not there
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold')
    .setBackground('#f3f4f6')
    .setFontColor('#1f2937')
    .setHorizontalAlignment('center');

  // Formatting
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 100); // ID
  sheet.setColumnWidth(2, 150); // Timestamp
  sheet.setColumnWidth(3, 200); // เรื่อง
  sheet.setColumnWidth(5, 300); // รายละเอียด
  
  return "Database Initialized Successfully!";
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Data');
  if (!sheet) {
    initDatabase();
    sheet = ss.getSheetByName('Data');
  }
  return sheet;
}

function saveData(data) {
  try {
    const sheet = getSheet();
    const id = Utilities.getUuid();
    const timestamp = new Date();
    const status = 'รอดำเนินการ';
    
    sheet.appendRow([
      id,
      timestamp,
      data.subject,
      data.branch,
      data.productDetail,
      data.barcode,
      data.systemPrice,
      data.netPrice,
      data.promotionPeriod,
      data.customerInfo,
      data.aisPackage,
      data.oldImei,
      data.area,
      status
    ]);
    
    return { success: true, message: 'บันทึกข้อมูลเรียบร้อยแล้ว' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

function getData() {
  try {
    const sheet = getSheet();
    const values = sheet.getDataRange().getDisplayValues();
    const headers = values[0];
    const data = values.slice(1).map(row => {
      let obj = {};
      headers.forEach((header, i) => {
        obj[header] = row[i];
      });
      return obj;
    });
    return { success: true, data: data };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

function deleteData(id) {
  try {
    const sheet = getSheet();
    const values = sheet.getDataRange().getDisplayValues();
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === id) {
        sheet.deleteRow(i + 1);
        return { success: true, message: 'ลบข้อมูลเรียบร้อยแล้ว' };
      }
    }
    return { success: false, message: 'ไม่พบข้อมูลที่ต้องการลบ' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

function updateStatus(id, newStatus) {
  try {
    const sheet = getSheet();
    const values = sheet.getDataRange().getDisplayValues();
    const statusColIndex = 13; // Index for 'สถานะ' (0-based)
    
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === id) {
        sheet.getRange(i + 1, statusColIndex + 1).setValue(newStatus);
        return { success: true, message: 'อัปเดตสถานะเรียบร้อยแล้ว' };
      }
    }
    return { success: false, message: 'ไม่พบข้อมูลที่ต้องการอัปเดต' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

function updateData(id, data) {
  try {
    const sheet = getSheet();
    const values = sheet.getDataRange().getDisplayValues();
    const headers = values[0];
    
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === id) {
        const row = i + 1;
        // Map data to columns based on headers
        // Skip ID (index 0) and Timestamp (index 1) if we don't want to change them
        // But we want to update the fields from the form
        
        const updates = {
          'เรื่อง': data.subject,
          'สาขา': data.branch,
          'รายละเอียดสินค้า': data.productDetail,
          'บาร์ขาย': data.barcode,
          'ราคาในระบบ': data.systemPrice,
          'ราคาสุทธิ': data.netPrice,
          'ระยะเวลาโปรโมชั่น': data.promotionPeriod,
          'ลูกค้า/เบอร์โทร': data.customerInfo,
          'แพ็คเกจ AIS': data.aisPackage,
          'IMEI เครื่องเก่า': data.oldImei,
          'Area': data.area
        };

        headers.forEach((header, index) => {
          if (updates.hasOwnProperty(header)) {
            sheet.getRange(row, index + 1).setValue(updates[header]);
          }
        });

        return { success: true, message: 'แก้ไขข้อมูลเรียบร้อยแล้ว' };
      }
    }
    return { success: false, message: 'ไม่พบข้อมูลที่ต้องการแก้ไข' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}
