function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('ระบบเบิกอุปกรณ์สำนักงาน')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function login(username, password) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let userSheet = ss.getSheetByName('Users');
  let locationSheet = ss.getSheetByName('Location');
  
  if (!userSheet) {
    userSheet = ss.insertSheet('Users');
    userSheet.appendRow(['Branch Code', 'Password', 'Name', 'Role']);
    userSheet.appendRow(['B001', '1234', 'ผู้ดูแลระบบ', 'Admin']);
    userSheet.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#f3f4f6');
  }
  
  let locMap = {};
  if (locationSheet) {
    const locData = locationSheet.getDataRange().getValues();
    for (let i = 1; i < locData.length; i++) {
      locMap[String(locData[i][0]).trim()] = String(locData[i][1]).trim();
    }
  }
  
  const data = userSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(username).trim() && 
        String(data[i][1]).trim() === String(password).trim()) {
      
      const branchCode = String(data[i][0]).trim();
      const branchName = locMap[branchCode] || branchCode;
      
      return { 
        success: true, 
        name: data[i][2],
        role: data[i][3],
        branchCode: branchCode,
        branchName: branchName
      };
    }
  }
  return { success: false, message: 'รหัสสาขาหรือรหัสผ่านไม่ถูกต้อง' };
}

function getInitialData(branchCode) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const locationSheet = ss.getSheetByName('Location');
  const productSheet = ss.getSheetByName('Product');
  
  let branchChannel = '';
  if (locationSheet && branchCode) {
    const locData = locationSheet.getDataRange().getValues();
    for (let i = 1; i < locData.length; i++) {
      if (String(locData[i][0]).trim() === String(branchCode).trim()) {
        branchChannel = String(locData[i][2] || '').trim(); // Column C
        break;
      }
    }
  }
  
  let products = [];
  if (productSheet) {
    const prodData = productSheet.getDataRange().getValues();
    for (let i = 1; i < prodData.length; i++) {
      const pId = String(prodData[i][0] || '').trim();
      const pName = String(prodData[i][1] || '').trim();
      if (!pName) continue;
      
      const pCategory = String(prodData[i][2] || '').trim() || 'อื่นๆ';
      const pChannel = String(prodData[i][3] || '').trim(); // Column D
      const pUnit = String(prodData[i][4] || '').trim(); // Column E
      
      let isVisible = false;
      if (!pChannel) {
        isVisible = true; // No restriction
      } else if (branchChannel) {
        const bChans = branchChannel.split(',').map(s => s.trim().toLowerCase());
        const pChans = pChannel.split(',').map(s => s.trim().toLowerCase());
        isVisible = bChans.some(c => pChans.includes(c));
      }
      
      if (isVisible) {
        products.push({
          id: pId,
          name: pName,
          category: pCategory,
          unit: pUnit
        });
      }
    }
  }
  
  return {
    products: products
  };
}

function submitOrder(orderData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let orderSheet = ss.getSheetByName('Order');
  if (!orderSheet) {
    orderSheet = ss.insertSheet('Order');
    orderSheet.appendRow(['Timestamp', 'ชื่อผู้เบิก', 'รหัสสาขา', 'ชื่อสาขา', 'รหัสสินค้า', 'ชื่อสินค้า', 'จำนวน', 'สถานะจ่าย']);
    orderSheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#f3f4f6');
  }
  
  const timestamp = new Date();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000); // wait 10 seconds for others to finish
  try {
    const rowsToInsert = orderData.items.map(item => {
      return [
        timestamp, 
        orderData.requester, 
        orderData.branchCode, 
        orderData.branchName, 
        item.id, 
        item.name, 
        item.qty,
        'รอจ่าย'
      ];
    });
    
    if (rowsToInsert.length > 0) {
      const startRow = orderSheet.getLastRow() + 1;
      const numRows = rowsToInsert.length;
      const numCols = rowsToInsert[0].length;
      orderSheet.getRange(startRow, 1, numRows, numCols).setValues(rowsToInsert);
    }
    return { success: true, message: 'บันทึกข้อมูลเรียบร้อยแล้ว!' };
  } catch (e) {
    return { success: false, message: 'เกิดข้อผิดพลาด: ' + e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function getAdminData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const getSheetData = (name) => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    return data.map(row => row.map(cell => {
      if (cell instanceof Date) {
        return Utilities.formatDate(cell, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
      }
      return String(cell);
    }));
  };
  
  return {
    Users: getSheetData('Users'),
    Location: getSheetData('Location'),
    Product: getSheetData('Product'),
    Order: getSheetData('Order')
  };
}

function saveAdminData(sheetName, data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    } else {
      sheet.clearContents();
    }
    
    if (data && data.length > 0) {
      sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
    }
    return { success: true, message: 'บันทึกข้อมูล ' + sheetName + ' เรียบร้อยแล้ว' };
  } catch(e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function getBranchOrders(branchCode, role) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const orderSheet = ss.getSheetByName('Order');
  if (!orderSheet) return [];
  
  const data = orderSheet.getDataRange().getValues();
  if (data.length <= 1) return []; // No data
  
  const rows = [];
  
  for (let i = 1; i < data.length; i++) {
    if (role === 'Admin' || String(data[i][2]).trim() === String(branchCode).trim()) {
      let ts = data[i][0];
      if (ts instanceof Date) {
        ts = Utilities.formatDate(ts, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
      } else if (typeof ts === 'string') {
        let parsed = new Date(ts);
        if (!isNaN(parsed.getTime())) {
          ts = Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
        }
      }
      
      let status = String(data[i][7] || 'รอจ่าย').trim();
      
      rows.push([
        ts,
        role === 'Admin' ? `${data[i][1]} (${data[i][3]})` : data[i][1],
        data[i][5],
        data[i][6],
        status,
        i + 1 // Add row number
      ]);
    }
  }
  
  return rows.reverse(); // Newest first
}

function updateOrderStatus(rowIndex, newStatus) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Order');
    if (sheet) {
      let statusToSave = newStatus;
      if (newStatus !== 'รอจ่าย') {
        const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');
        statusToSave = `${newStatus} ${today}`;
      }
      sheet.getRange(rowIndex, 8).setValue(statusToSave);
      return { success: true };
    }
    return { success: false, message: 'ไม่พบตาราง Order' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function updateMultipleOrderStatuses(updates) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Order');
    if (sheet) {
      const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');
      updates.forEach(u => {
        let statusToSave = u.newStatus;
        if (statusToSave !== 'รอจ่าย') {
          statusToSave = `${statusToSave} ${today}`;
        }
        sheet.getRange(u.rowIndex, 8).setValue(statusToSave);
      });
      return { success: true, message: `อัพเดท ${updates.length} รายการเรียบร้อยแล้ว` };
    }
    return { success: false, message: 'ไม่พบตาราง Order' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}
