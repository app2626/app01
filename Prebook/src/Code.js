const CONFIG = {
  SCHEMA: {
    "Products": ["SKU", "Product Name", "Model", "Capacity", "Color", "Image URL", "Price", "Stock", "Unit", "Category", "Status", "Channel"],
    "Members": ["Username", "Password", "Role", "Name", "Branch Code"],
    "Branches": ["Channel", "Branch Code", "Branch Name", "Supervisor Name", "Mall", "Region", "Province", "Type Name"],
    "Channels": ["Channel ID", "Channel Name", "Description"],
    "Promotions": ["Promo ID", "Promo Name", "Discount Type", "Value", "Status"],
    "Interests": ["Interest Name", "Status"],
    "Orders": [
      "OrderID", "Timestamp", "Channel", "Branch", "Customer Name", "Contact Number", "Email", "ID Card / Passport", "Code Handraiser",
      "SKU", "Product Name", "Qty", "Unit Price", "Brand Gift", "Channel Gift", "Promo", 
      "Reservation Status", "Booking Staff", "Booking Phone", 
      "Customer Interests", "Remark", "Row Total", "Order Status" 
    ],
    "InventoryLog": ["Log ID", "Timestamp", "SKU", "Action", "Qty", "Branch", "User"],
    "AuditLog": ["Log ID", "Timestamp", "User", "Action", "Details"]
  }
};

function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Mobile Phone Reservation System')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tables = CONFIG.SCHEMA;

  for (let sheetName in tables) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(tables[sheetName]);
      sheet.getRange(1, 1, 1, tables[sheetName].length).setFontWeight("bold").setBackground("#1e293b").setFontColor("white");
      sheet.setFrozenRows(1);
      
      if (sheetName === "Members") {
        sheet.appendRow(["admin", hashPassword("admin123"), "Admin", "ผู้ดูแลระบบ", "ALL"]);
        sheet.appendRow(["sales", hashPassword("sales123"), "Sales", "พนักงานขาย", "B01"]);
      }
      if (sheetName === "Branches") {
        sheet.appendRow(["Retail", "B01", "สาขาทดสอบ (Demo)", "หัวหน้าทดสอบ", "Central", "BKK", "Bangkok", "Standard"]);
      }
    }
  }
  return { status: 'success', message: 'Database Ready' };
}

function hashPassword(password) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
  let hexString = '';
  for (let i = 0; i < digest.length; i++) {
    let hashVal = digest[i];
    if (hashVal < 0) hashVal += 256;
    let hexStr = hashVal.toString(16);
    if (hexStr.length == 1) hexStr = '0' + hexStr;
    hexString += hexStr;
  }
  return hexString;
}

function generateId(prefix) {
  return prefix + '-' + Utilities.formatDate(new Date(), "GMT+7", "yyMMdd") + '-' + Math.floor(1000 + Math.random() * 9000);
}

function logAudit(user, action, details) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("AuditLog");
  if(sheet) sheet.appendRow([generateId('LOG'), new Date().toLocaleString("en-US", {timeZone: "Asia/Bangkok"}), user, action, details]);
}

function getHeaderIndex(headers, name) {
  const norm = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return headers.findIndex(h => h.toString().toLowerCase().replace(/[^a-z0-9]/g, '') === norm);
}

function apiHandler(action, payload, userToken) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let secureUser = null;
    if (action !== 'LOGIN') {
      if (!userToken || !userToken.Username) throw new Error("Unauthorized Access");
      const members = getTableDataAsJson(ss.getSheetByName("Members"));
      secureUser = members.find(u => u.Username === userToken.Username);
      if (!secureUser) throw new Error("Invalid User Session");
      
      if (secureUser['Branch Code'] !== 'ALL') {
        const branches = getTableDataAsJson(ss.getSheetByName("Branches"));
        const bInfo = branches.find(b => b['Branch Code'] === secureUser['Branch Code']);
        secureUser.Channel = bInfo ? bInfo.Channel : 'Unknown';
        secureUser['Branch Name'] = bInfo ? bInfo['Branch Name'] : 'Unknown Branch';
      } else {
        secureUser.Channel = 'ALL';
        secureUser['Branch Name'] = 'ALL Branches';
      }
    }

    switch(action) {
      case 'LOGIN': return doLogin(payload.username, payload.password, ss);
      case 'GET_ADVANCED_DASHBOARD': return getAdvancedDashboard(secureUser, ss);
      case 'GET_TABLE': 
        let tableData = getTableDataAsJson(ss.getSheetByName(payload.tableName));
        if ((payload.tableName === 'Orders' || payload.tableName === 'InventoryLog') && secureUser.Role === 'Sales') {
          tableData = tableData.filter(row => row['Branch'] === secureUser['Branch Code']);
        }
        return { status: 'success', data: tableData };
      case 'GET_ALL_DATA': return getAllInitialData(ss);
      case 'SAVE_RECORD': return saveRecord(payload.tableName, payload.data, payload.idField, secureUser, ss);
      case 'DELETE_RECORD': return deleteRecord(payload.tableName, payload.idField, payload.idValue, secureUser, ss);
      case 'CHECKOUT': return processCheckout(payload, secureUser, ss);
      case 'UPDATE_FULL_ORDER': return updateFullOrder(payload.data, secureUser, ss);
      default: throw new Error("Invalid API Action");
    }
  } catch (error) {
    return { status: 'error', message: error.toString() };
  }
}

function doLogin(username, password, ss) {
  const data = getTableDataAsJson(ss.getSheetByName("Members"));
  const hashedPw = hashPassword(password);
  const user = data.find(u => u.Username === username && (u.Password === hashedPw || u.Password === password));
  if (user) {
    delete user.Password; 
    if (user['Branch Code'] !== 'ALL') {
      const branches = getTableDataAsJson(ss.getSheetByName("Branches"));
      const bInfo = branches.find(b => b['Branch Code'] === user['Branch Code']);
      user.Channel = bInfo ? bInfo.Channel : 'Unknown';
      user['Branch Name'] = bInfo ? bInfo['Branch Name'] : 'Unknown Branch';
    } else {
      user.Channel = 'ALL';
      user['Branch Name'] = 'ALL Branches';
    }
    logAudit(user.Username, "LOGIN", "System Login");
    return { status: 'success', user: user };
  }
  return { status: 'error', message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
}

function getTableDataAsJson(sheet) {
  if (!sheet) return [];
  const data = sheet.getDataRange().getDisplayValues();
  if (data.length <= 1) return [];
  const headers = data[0].map(h => h.toString().trim()); 
  return data.slice(1).map((row, index) => {
    let obj = { _rowIndex: index + 2 }; 
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function getAllInitialData(ss) {
  return {
    status: 'success',
    products: getTableDataAsJson(ss.getSheetByName("Products")),
    promotions: getTableDataAsJson(ss.getSheetByName("Promotions")),
    branches: getTableDataAsJson(ss.getSheetByName("Branches")),
    channels: getTableDataAsJson(ss.getSheetByName("Channels")),
    interests: getTableDataAsJson(ss.getSheetByName("Interests")) 
  };
}

function getAdvancedDashboard(secureUser, ss) {
  let orders = getTableDataAsJson(ss.getSheetByName("Orders"));
  const products = getTableDataAsJson(ss.getSheetByName("Products"));
  const members = getTableDataAsJson(ss.getSheetByName("Members"));

  if (secureUser.Role === 'Sales') {
    orders = orders.filter(o => o.Branch === secureUser['Branch Code']); 
  }
  return { status: 'success', data: { orders: orders, products: products, members: members } };
}

function processCheckout(payload, secureUser, ss) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const orderSheet = ss.getSheetByName("Orders");
    const invSheet = ss.getSheetByName("InventoryLog");
    const prodSheet = ss.getSheetByName("Products");
    
    const orderId = generateId('ORD');
    const now = new Date().toLocaleString("en-US", {timeZone: "Asia/Bangkok"});
    
    let actualBranch = payload.branch;
    let actualChannel = payload.channel;
    
    if (secureUser.Role === 'Sales') {
       actualBranch = secureUser['Branch Code'];
       actualChannel = secureUser.Channel;
    }
    
    let prodData = prodSheet.getDataRange().getValues();
    let pHeaders = prodData[0].map(h => h.toString().trim());
    let skuIdx = getHeaderIndex(pHeaders, "SKU");
    let nameIdx = getHeaderIndex(pHeaders, "Product Name");
    let stockIdx = getHeaderIndex(pHeaders, "Stock");
    
    let allBrandGifts = [];
    let allChannelGifts = [];
    payload.cart.forEach(item => {
      if(item.brandGifts) item.brandGifts.forEach(g => allBrandGifts.push(g.name + " (" + g.qty + ")"));
      if(item.channelGifts) item.channelGifts.forEach(g => allChannelGifts.push(g.name + " (" + g.qty + ")"));
    });
    let fBrandGiftStr = allBrandGifts.join(", ");
    let fChannelGiftStr = allChannelGifts.join(", ");

    let isFirstRow = true; 
    
    payload.cart.forEach(item => {
      let itemPrice = parseFloat((item.Price||0).toString().replace(/,/g, ''));
      if(isNaN(itemPrice)) itemPrice = 0;
      let rowTotal = itemPrice * item.qty;
      
      let foundMain = false;
      for(let i=1; i<prodData.length; i++) {
        if(prodData[i][skuIdx] == item.SKU) {
          let currentStock = parseInt(prodData[i][stockIdx] || 0);
          if(currentStock < item.qty) throw new Error("สินค้า " + item['Product Name'] + " สต๊อกไม่พอ");
          prodSheet.getRange(i+1, stockIdx+1).setValue(currentStock - item.qty);
          foundMain = true; break;
        }
      }
      if(!foundMain) throw new Error("ไม่พบสินค้า SKU: " + item.SKU);
      invSheet.appendRow([generateId('INV'), now, item.SKU, "SALE", -item.qty, actualBranch, secureUser.Username]);
      
      let fCustName = isFirstRow ? payload.customerName : "";
      let fContact = isFirstRow ? payload.contactPhone : "";
      let fEmail = isFirstRow ? payload.email : "";
      let fIdCard = isFirstRow ? payload.idCard : "";
      let fCodeHand = isFirstRow ? payload.codeHandraiser : "";
      let fBrandGCol = isFirstRow ? fBrandGiftStr : "";
      let fChanGCol = isFirstRow ? fChannelGiftStr : "";
      let fPromo = isFirstRow ? (payload.promo || "-") : "";
      let fResStatus = isFirstRow ? payload.resStatus : "";
      let fBkStaff = isFirstRow ? payload.bkStaffName : "";
      let fBkPhone = isFirstRow ? payload.bkPhone : "";
      let fInterests = isFirstRow ? payload.customerInterests : "";
      let fRemark = isFirstRow ? payload.remark : "";
      let fStatus = isFirstRow ? "Pending" : "";
      
      orderSheet.appendRow([
        orderId, now, actualChannel, actualBranch, fCustName, fContact, 
        fEmail, fIdCard, fCodeHand,
        item.SKU, item['Product Name'], item.qty, itemPrice, 
        fBrandGCol, fChanGCol, fPromo, 
        fResStatus, fBkStaff, fBkPhone, 
        fInterests, fRemark, rowTotal, fStatus
      ]);
      
      isFirstRow = false; 

      const processGift = (giftObj, giftType) => {
        if(giftObj && giftObj.name) {
          let giftSku = "GIFT"; 
          let foundGift = false;
          for(let i=1; i<prodData.length; i++) {
            if(prodData[i][nameIdx] == giftObj.name) {
              giftSku = prodData[i][skuIdx];
              let currentStock = parseInt(prodData[i][stockIdx] || 0);
              if(currentStock >= giftObj.qty) {
                prodSheet.getRange(i+1, stockIdx+1).setValue(currentStock - giftObj.qty);
              }
              foundGift = true; break;
            }
          }
          invSheet.appendRow([generateId('INV'), now, giftSku, "GIFT", -giftObj.qty, actualBranch, secureUser.Username]);
          orderSheet.appendRow([
            orderId, now, actualChannel, actualBranch, "", "", 
            "", "", "",
            giftSku, "[" + giftType + "] " + giftObj.name, giftObj.qty, 0, 
            "", "", "", 
            "", "", "",
            "", "", 0, "Pending" 
          ]);
        }
      };

      if(item.brandGifts && Array.isArray(item.brandGifts)) {
         item.brandGifts.forEach(g => processGift(g, "ของแถมแบรนด์"));
      }
      if(item.channelGifts && Array.isArray(item.channelGifts)) {
         item.channelGifts.forEach(g => processGift(g, "ของแถมช่องทาง"));
      }
    });
    
    logAudit(secureUser.Username, "CHECKOUT", "Created Order: " + orderId);
    return { status: 'success', orderId: orderId };
  } catch(e) {
    return { status: 'error', message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function updateFullOrder(dataObj, secureUser, ss) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    if (secureUser.Role === 'Sales') throw new Error("พนักงานขาย (Sales) ไม่มีสิทธิ์แก้ไขออเดอร์");

    const orderSheet = ss.getSheetByName("Orders"); const prodSheet = ss.getSheetByName("Products"); const invSheet = ss.getSheetByName("InventoryLog"); const now = new Date().toLocaleString("en-US", {timeZone: "Asia/Bangkok"});
    const rowIdx = parseInt(dataObj._rowIndex); if (!rowIdx) throw new Error("ไม่พบตำแหน่งข้อมูล");
    
    const oHeaders = orderSheet.getRange(1, 1, 1, orderSheet.getLastColumn()).getValues()[0].map(h => h.toString().trim());
    const oldDataRow = orderSheet.getRange(rowIdx, 1, 1, orderSheet.getLastColumn()).getValues()[0];
    
    let oldSku = oldDataRow[getHeaderIndex(oHeaders, "SKU")]; 
    let oldQty = parseInt(oldDataRow[getHeaderIndex(oHeaders, "Qty")] || 0); 
    let oldStatus = oldDataRow[getHeaderIndex(oHeaders, "Order Status")]; 
    let branch = oldDataRow[getHeaderIndex(oHeaders, "Branch")]; 

    let newSku = dataObj["SKU"] || oldSku; 
    let newQty = parseInt(dataObj["Qty"] || oldQty); 
    let newStatus = dataObj["Order Status"] || oldStatus;

    const prodData = prodSheet.getDataRange().getValues(); 
    const pHeaders = prodData[0].map(h => h.toString().trim());
    const pSkuIdx = getHeaderIndex(pHeaders, "SKU"); 
    const pStockIdx = getHeaderIndex(pHeaders, "Stock");
    
    if (oldStatus !== 'Cancelled' && oldSku) {
      for(let i=1; i<prodData.length; i++) { if(prodData[i][pSkuIdx] == oldSku) { prodSheet.getRange(i+1, pStockIdx+1).setValue(parseInt(prodData[i][pStockIdx] || 0) + oldQty); invSheet.appendRow([generateId('INV'), now, oldSku, "EDIT (REVERT)", oldQty, branch, secureUser.Username]); break; } }
    }
    if (newStatus !== 'Cancelled' && newSku) {
      for(let i=1; i<prodData.length; i++) { if(prodData[i][pSkuIdx] == newSku) { prodSheet.getRange(i+1, pStockIdx+1).setValue(parseInt(prodData[i][pStockIdx] || 0) - newQty); invSheet.appendRow([generateId('INV'), now, newSku, "EDIT (APPLY)", -newQty, branch, secureUser.Username]); break; } }
    }
    
    let newRowData = []; oHeaders.forEach(h => { if (dataObj[h] !== undefined && h !== "_rowIndex") newRowData.push(dataObj[h]); else newRowData.push(oldDataRow[oHeaders.indexOf(h)]); });
    orderSheet.getRange(rowIdx, 1, 1, newRowData.length).setValues([newRowData]); logAudit(secureUser.Username, "EDIT_ORDER", "Edited Order Row: " + dataObj["OrderID"]); return { status: 'success' };
  } catch(e) { return { status: 'error', message: e.toString() }; } finally { lock.releaseLock(); }
}

function saveRecord(tableName, dataObj, idField, secureUser, ss) {
  const sheet = ss.getSheetByName(tableName); const data = sheet.getDataRange().getDisplayValues(); const headers = data[0].map(h => h.toString().trim()); let idIndex = getHeaderIndex(headers, idField); let rowIndex = -1;
  if (dataObj[idField]) { for (let i = 1; i < data.length; i++) { if (data[i][idIndex] == dataObj[idField]) { rowIndex = i + 1; break; } } }
  if(tableName === 'Orders' && secureUser.Role === 'Sales') throw new Error("ไม่มีสิทธิ์แก้ไข");
  if(tableName === "Members") { if (!dataObj.Password || dataObj.Password.trim() === "") { if (rowIndex > -1) { dataObj.Password = data[rowIndex - 1][headers.indexOf("Password")]; } else { dataObj.Password = "1234"; } } else { if (dataObj.Password.length < 50) dataObj.Password = hashPassword(dataObj.Password); } }
  let rowData = headers.map(h => dataObj[h] !== undefined ? dataObj[h] : "");
  if (rowIndex > -1) { sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]); logAudit(secureUser.Username, "UPDATE", "Updated " + tableName); } else { sheet.appendRow(rowData); logAudit(secureUser.Username, "INSERT", "Added to " + tableName); }
  return { status: 'success' };
}

function deleteRecord(tableName, idField, idValue, secureUser, ss) {
  const sheet = ss.getSheetByName(tableName); const data = sheet.getDataRange().getDisplayValues(); const idIndex = getHeaderIndex(data[0], idField);
  for (let i = 1; i < data.length; i++) { if (data[i][idIndex] == idValue) { 
      if(tableName === 'Orders' && secureUser.Role === 'Sales') return { status: 'error', message: 'ไม่อนุญาตให้ลบ' };
      sheet.deleteRow(i + 1); logAudit(secureUser.Username, "DELETE", "Deleted ID: " + idValue); return { status: 'success' }; } }
  return { status: 'error', message: 'Record not found' };
}