function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('ระบบเบิกอุปกรณ์สำนักงาน')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ===== Auth / Session =====
// CacheService caps expiration at 6 hours; sessions must be renewed by logging in again after that.
const SESSION_DURATION_SECONDS = 21600;

function getPepper() {
  const props = PropertiesService.getScriptProperties();
  let pepper = props.getProperty('PWD_PEPPER');
  if (!pepper) {
    pepper = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('PWD_PEPPER', pepper);
  }
  return pepper;
}

function sha256Hex(input) {
  const rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input, Utilities.Charset.UTF_8);
  let txtHash = '';
  for (let i = 0; i < rawHash.length; i++) {
    let hashVal = rawHash[i];
    if (hashVal < 0) hashVal += 256;
    if (hashVal.toString(16).length === 1) txtHash += '0';
    txtHash += hashVal.toString(16);
  }
  return txtHash;
}

// Current password hash (salted with a per-project pepper). Used for every new/changed password.
function hashPassword(password) {
  return sha256Hex(String(password) + getPepper());
}

// Unsalted hash kept ONLY to transparently upgrade passwords saved before the pepper existed.
function hashPasswordLegacy(password) {
  return sha256Hex(String(password));
}

function createSession(branchCode, branchName, name, role) {
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('sess_' + token, JSON.stringify({
    branchCode: branchCode,
    branchName: branchName,
    name: name,
    role: role
  }), SESSION_DURATION_SECONDS);
  return token;
}

function getSession(token) {
  if (!token) return null;
  const raw = CacheService.getScriptCache().get('sess_' + token);
  return raw ? JSON.parse(raw) : null;
}

function requireSession(token) {
  const session = getSession(token);
  if (!session) {
    throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
  }
  return session;
}

function requireAdmin(token) {
  const session = requireSession(token);
  if (session.role !== 'Admin') {
    throw new Error('คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้');
  }
  return session;
}

function logoutSession(token) {
  if (token) {
    CacheService.getScriptCache().remove('sess_' + token);
  }
  return { success: true };
}

function login(username, password) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let userSheet = ss.getSheetByName('Users');
  let locationSheet = ss.getSheetByName('Location');

  if (!userSheet) {
    userSheet = ss.insertSheet('Users');
    userSheet.appendRow(['Branch Code', 'Password', 'Name', 'Role']);
    userSheet.appendRow(['B001', hashPassword('1234'), 'ผู้ดูแลระบบ', 'Admin']);
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
  const trimmedPassword = String(password).trim();
  const hashedInput = hashPassword(trimmedPassword);
  const legacyHashedInput = hashPasswordLegacy(trimmedPassword);

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() !== String(username).trim()) continue;

    const storedPass = String(data[i][1]).trim();
    let matched = false;

    if (storedPass === hashedInput) {
      matched = true;
    } else if (storedPass === legacyHashedInput) {
      // Password was saved before the pepper was introduced - upgrade it transparently.
      userSheet.getRange(i + 1, 2).setValue(hashedInput);
      matched = true;
    } else if (!/^[0-9a-f]{64}$/i.test(storedPass) && storedPass === trimmedPassword) {
      // Never-hashed legacy account (e.g. bulk-imported data) - migrate it to a hash now.
      // The format check above ensures this can never match against an already-hashed value.
      userSheet.getRange(i + 1, 2).setValue(hashedInput);
      matched = true;
    }

    if (matched) {
      const branchCode = String(data[i][0]).trim();
      const branchName = locMap[branchCode] || branchCode;
      const name = data[i][2];
      const role = data[i][3];
      const token = createSession(branchCode, branchName, name, role);

      return {
        success: true,
        token: token,
        name: name,
        role: role,
        branchCode: branchCode,
        branchName: branchName
      };
    }
  }
  return { success: false, message: 'รหัสสาขาหรือรหัสผ่านไม่ถูกต้อง' };
}

function getInitialData(token) {
  const session = requireSession(token);
  const branchCode = session.branchCode;

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
      const pMaxQty = parseInt(prodData[i][3]) || 0; // Column D (จำนวนเบิก/ครั้ง)
      const pChannel = String(prodData[i][4] || '').trim(); // Column E (ช่องทางการมองเห็น)
      const pUnit = String(prodData[i][5] || '').trim(); // Column F (หน่วย)

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
          unit: pUnit,
          maxQty: pMaxQty
        });
      }
    }
  }

  return {
    products: products
  };
}

function getPendingItemsForBranch(orderSheet, branchCode) {
  const items = [];
  if (!orderSheet) return items;
  const data = orderSheet.getDataRange().getValues();
  const seen = {};
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][2]).trim() === String(branchCode).trim()) {
      const status = String(data[i][7] || 'รอจ่าย').trim();
      if (status === 'รอจ่าย') {
        const id = String(data[i][4] || '').trim();
        if (id && !seen[id]) {
          seen[id] = true;
          items.push({ id: id, name: String(data[i][5] || '').trim() });
        }
      }
    }
  }
  return items;
}

function checkPendingOrder(token) {
  const session = requireSession(token);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const orderSheet = ss.getSheetByName('Order');
  return { pendingItems: getPendingItemsForBranch(orderSheet, session.branchCode) };
}

function submitOrder(token, orderData) {
  const session = requireSession(token);
  const branchCode = session.branchCode;
  const branchName = session.branchName;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let orderSheet = ss.getSheetByName('Order');
  if (!orderSheet) {
    orderSheet = ss.insertSheet('Order');
    orderSheet.appendRow(['Timestamp', 'ชื่อผู้เบิก', 'รหัสสาขา', 'ชื่อสาขา', 'รหัสสินค้า', 'ชื่อสินค้า', 'จำนวน', 'สถานะจ่าย']);
    orderSheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#f3f4f6');
    orderSheet.getRange("A:A").setNumberFormat('dd/MM/yyyy HH:mm:ss');
  }

  const timestamp = new Date();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000); // wait 10 seconds for others to finish
  try {
    const items = (orderData.items || [])
      .map(item => ({
        id: String(item.id || '').trim(),
        name: String(item.name || '').trim(),
        qty: parseInt(item.qty, 10) || 0
      }))
      .filter(item => item.id && item.qty > 0);

    if (items.length === 0) {
      return { success: false, message: 'กรุณาระบุอย่างน้อย 1 รายการที่ถูกต้อง' };
    }

    // Block re-ordering only the specific items that already have a pending (รอจ่าย) request for this branch
    const pendingItems = getPendingItemsForBranch(orderSheet, branchCode);
    const pendingIds = {};
    pendingItems.forEach(p => pendingIds[p.id] = p.name);

    const blockedItems = items.filter(item => pendingIds[item.id]);
    const allowedItems = items.filter(item => !pendingIds[item.id]);

    if (allowedItems.length === 0) {
      return { success: false, message: 'ไม่สามารถเบิกรายการที่เลือกได้ เนื่องจากยังรอจ่ายอยู่: ' + blockedItems.map(i => i.name).join(', ') };
    }

    // Validate maxQty against Product sheet
    let maxQtyMap = {};
    const productSheet = ss.getSheetByName('Product');
    if (productSheet) {
      const prodData = productSheet.getDataRange().getValues();
      for (let i = 1; i < prodData.length; i++) {
        const pId = String(prodData[i][0] || '').trim();
        const maxQ = parseInt(prodData[i][3]) || 0;
        if (pId) maxQtyMap[pId] = maxQ;
      }
    }

    // Enforce maxQty limit
    allowedItems.forEach(item => {
      const max = maxQtyMap[item.id] || 0;
      if (max > 0 && item.qty > max) {
        item.qty = max; // clamp to max allowed
      }
    });

    const rowsToInsert = allowedItems.map(item => {
      return [
        timestamp,
        String(orderData.requester || '').trim(),
        branchCode,
        branchName,
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
      orderSheet.getRange(startRow, 1, numRows, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
    }

    let message = 'บันทึกข้อมูลเรียบร้อยแล้ว!';
    if (blockedItems.length > 0) {
      message += ' (ยกเว้นรายการที่ยังรอจ่ายอยู่: ' + blockedItems.map(i => i.name).join(', ') + ')';
    }
    return { success: true, message: message };
  } catch (e) {
    return { success: false, message: 'เกิดข้อผิดพลาด: ' + e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function getAdminData(token) {
  requireAdmin(token);
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const getSheetData = (name) => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    return data.map((row, idx) => {
      let r = row.map((cell, colIdx) => {
        // Never send password hashes to the client, even for display purposes
        if (name === 'Users' && colIdx === 1 && idx > 0) {
          return '';
        }
        if (cell instanceof Date) {
          return Utilities.formatDate(cell, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
        }
        return String(cell);
      });
      if (idx > 0) r.push(idx + 1);
      return r;
    });
  };

  return {
    Users: getSheetData('Users'),
    Location: getSheetData('Location'),
    Product: getSheetData('Product')
  };
}

function addAdminRowData(token, sheetName, rowData) {
  requireAdmin(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }

    // Users sheet must always have a non-empty password, otherwise the account can never log in
    if (sheetName === 'Users') {
      if (!String(rowData[1] || '').trim()) {
        return { success: false, message: 'กรุณาระบุรหัสผ่าน' };
      }
      rowData[1] = hashPassword(rowData[1]);
    }

    sheet.appendRow(rowData);
    return { success: true, message: 'เพิ่มข้อมูลเรียบร้อยแล้ว' };
  } catch(e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function updateAdminRowData(token, sheetName, rowIndex, rowData) {
  requireAdmin(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (sheet) {
      // If Users sheet and password is changed, hash it
      if (sheetName === 'Users') {
        const oldPass = sheet.getRange(rowIndex, 2).getValue();
        if (rowData[1] === '********' || !rowData[1]) {
          rowData[1] = oldPass; // Keep original
        } else if (String(rowData[1]) !== String(oldPass)) {
          rowData[1] = hashPassword(rowData[1]);
        }
      }
      sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
      return { success: true, message: 'แก้ไขข้อมูลเรียบร้อยแล้ว' };
    }
    return { success: false, message: 'ไม่พบชีต ' + sheetName };
  } catch(e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function updateMultipleAdminRows(token, sheetName, updates) {
  requireAdmin(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      return { success: false, message: 'ไม่พบชีต ' + sheetName };
    }

    updates.forEach(u => {
      const rowData = u.rowData;
      if (sheetName === 'Users') {
        const oldPass = sheet.getRange(u.rowIndex, 2).getValue();
        if (rowData[1] === '********' || !rowData[1]) {
          rowData[1] = oldPass; // Keep original
        } else if (String(rowData[1]) !== String(oldPass)) {
          rowData[1] = hashPassword(rowData[1]);
        }
      }
      sheet.getRange(u.rowIndex, 1, 1, rowData.length).setValues([rowData]);
    });

    return { success: true, message: `บันทึกการแก้ไข ${updates.length} รายการเรียบร้อยแล้ว` };
  } catch(e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function deleteMultipleAdminRows(token, sheetName, rowIndices) {
  requireAdmin(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      return { success: false, message: 'ไม่พบชีต ' + sheetName };
    }

    // Sort indices descending so deleting lower rows doesn't shift higher ones
    rowIndices.sort((a, b) => b - a);
    for (let i = 0; i < rowIndices.length; i++) {
      sheet.deleteRow(rowIndices[i]);
    }

    return { success: true, message: `ลบข้อมูล ${rowIndices.length} รายการเรียบร้อยแล้ว` };
  } catch(e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function deleteAdminRowData(token, sheetName, rowIndex) {
  requireAdmin(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (sheet) {
      sheet.deleteRow(rowIndex);
      return { success: true, message: 'ลบข้อมูลเรียบร้อยแล้ว' };
    }
    return { success: false, message: 'ไม่พบชีต ' + sheetName };
  } catch(e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function getBranchOrders(token) {
  const session = requireSession(token);
  const role = session.role;
  const branchCode = session.branchCode;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const orderSheet = ss.getSheetByName('Order');
  if (!orderSheet) return { orders: [], locations: [], products: [] };

  const data = orderSheet.getDataRange().getValues();
  if (data.length <= 1) return { orders: [], locations: [], products: [] };

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
        ts,         // 0: Timestamp
        data[i][1], // 1: ชื่อผู้เบิก
        data[i][2], // 2: รหัสสาขา
        data[i][3], // 3: ชื่อสาขา
        data[i][4], // 4: รหัสสินค้า
        data[i][5], // 5: ชื่อสินค้า
        data[i][6], // 6: จำนวน
        status,     // 7: สถานะการจ่าย
        i + 1       // 8: Add row number for updates
      ]);
    }
  }

  const locations = [];
  const locSheet = ss.getSheetByName('Location');
  if (locSheet) {
    const locData = locSheet.getDataRange().getValues();
    for(let i=1; i<locData.length; i++) {
       const loc = String(locData[i][1] || '').trim();
       if(loc) locations.push(loc);
    }
  }

  const products = [];
  const prodSheet = ss.getSheetByName('Product');
  if (prodSheet) {
    const prodData = prodSheet.getDataRange().getValues();
    for(let i=1; i<prodData.length; i++) {
       const prod = String(prodData[i][1] || '').trim();
       if(prod) products.push(prod);
    }
  }

  return {
    orders: rows.reverse(), // Newest first
    locations: locations,
    products: products
  };
}

function updateOrderStatus(token, rowIndex, newStatus) {
  requireAdmin(token);
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

function deleteOrderRow(token, rowIndex) {
  requireAdmin(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Order');
    if (sheet) {
      sheet.deleteRow(rowIndex);
      return { success: true };
    }
    return { success: false, message: 'ไม่พบตาราง Order' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function updateOrderRowData(token, rowIndex, rowData) {
  requireAdmin(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Order');
    if (sheet) {
      sheet.getRange(rowIndex, 2, 1, 6).setValues([[
        rowData.requester,
        rowData.branchCode,
        rowData.branchName,
        rowData.itemCode,
        rowData.itemName,
        rowData.qty
      ]]);
      return { success: true };
    }
    return { success: false, message: 'ไม่พบตาราง Order' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function deleteMultipleOrderRows(token, rowIndices) {
  requireAdmin(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Order');
    if (sheet) {
      // Sort indices descending so deleting lower rows doesn't shift higher ones
      rowIndices.sort((a, b) => b - a);
      for (let i = 0; i < rowIndices.length; i++) {
        sheet.deleteRow(rowIndices[i]);
      }
      return { success: true };
    }
    return { success: false, message: 'ไม่พบตาราง Order' };
  } catch (e) {
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function updateMultipleOrderStatuses(token, updates) {
  requireAdmin(token);
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
