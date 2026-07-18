function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Mobile Pre Order System')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tables = {
    "Products": ["SKU", "Product Name", "Model", "Product Group", "Capacity", "Color", "Image URL", "Price", "Stock", "Unit", "Category", "Status", "Channel"],
    "Members": ["Username", "Password", "Role", "Name", "Branch Code", "Accessible Menus"],
    "Branches": ["Channel", "Branch Code", "Branch Name", "Area", "Mall", "Region", "Province", "Type Name"],
    "Channels": ["Channel ID", "Channel Name", "Description"],
    "Promotions": ["Promo ID", "Promo Name", "Discount Type", "Value", "Status"],
    "Interests": ["Interest Name", "Status"],
    "GiftMappings": ["Mapping ID", "Target Mobile (SKU or Group)", "Channel", "Brand Gifts", "Channel Gifts", "Status"],
    // 🌟 จัดเรียงคอลัมน์ Orders ใหม่ตามที่ระบุ
    "Orders": [
      "OrderID", "Timestamp", "Channel", "Branch Code", "Customer Name", "Contact Number", "Email", "ID Card_Passport", "Code Handraiser",
      "SKU", "Product Name", "Qty", "Unit Price", "Promo", "Reservation Status", "Staff", "Booking Phone",
      "Customer Interests", "Remark", "Row Total", "Order Status", "Receipt No", "Deposit"
    ],
    "OrderStatus": ["Status ID", "Status Name", "Color Code"],
    "InventoryLog": ["Log ID", "Timestamp", "SKU", "Action", "Qty", "Branch Code", "User"],
    "AuditLog": ["Log ID", "Timestamp", "User", "Action", "Details"],
    "Settings": ["Key", "Value", "Remark"],
    "UI_Banners": ["Banner ID", "Type", "URL", "Status", "Target Link", "Details"],
    "Target": ["Area", "เป้า"]
  };

  const dummyData = {
    "Settings": [
      ["SystemName", "Mobile Pre Order System", "ชื่อระบบ"],
      ["Currency", "THB", "สกุลเงิน"],
      ["ReserveStart", "2026-06-01T00:00:00", "วันเริ่มจองสินค้า"],
      ["ReserveEnd", "2026-06-30T23:59:59", "วันสิ้นสุดจองสินค้า"]
    ],
    "Target": [
      ["ALL BRANCHES", 1000]
    ],
    "UI_Banners": [
      ["B-001", "loginbg", "https://images.unsplash.com/photo-1616348436168-de43ad0db179?q=80&w=1000", "Active"],
      ["B-002", "herobanner", "https://via.placeholder.com/1200x400/4f46e5/ffffff?text=Promo+1", "Active"],
      ["B-003", "herobanner", "https://via.placeholder.com/1200x400/10b981/ffffff?text=Promo+2", "Active"],
      ["B-004", "herobanner", "https://via.placeholder.com/1200x400/8b5cf6/ffffff?text=Promo+3", "Active"],
      ["B-005", "promogrid", "https://via.placeholder.com/600x400/f59e0b/ffffff?text=Grid+1+(Featured)", "Active"],
      ["B-006", "promogrid", "https://via.placeholder.com/400x400/ec4899/ffffff?text=Grid+2", "Active"],
      ["B-007", "promogrid", "https://via.placeholder.com/400x400/06b6d4/ffffff?text=Grid+3", "Active"],
      ["B-008", "popupbanner", "https://via.placeholder.com/800x800/10b981/ffffff?text=Popup+Banner+1", "Active"]
    ],
    "Products": [
      ["SKU-S24U", "Samsung Galaxy S24 Ultra", "S24 Ultra", "S24-Series", "512GB", "Titanium Black", "https://images.samsung.com/is/image/samsung/p6pim/th/2401/gallery/th-galaxy-s24-s928-sm-s928bzththl-thumb-539325419", 46900, 50, "เครื่อง", "โมบาย", "เปิด", "ALL"],
      ["SKU-IP15P", "iPhone 15 Pro Max", "15 Pro Max", "IP15-Series", "256GB", "Natural", "https://store.storeimages.cdn-apple.com/8756/as-images.apple.com/is/iphone-15-pro-max-natural-titanium-select", 48900, 20, "เครื่อง", "โมบาย", "เปิด", "ALL"],
      ["GF-SAM-ADPT", "Samsung Adapter 25W (Black)", "Adapter", "-", "-", "Black", "https://images.samsung.com/is/image/samsung/p6pim/th/ep-ta800nbegww/gallery/th-25w-pd-adapter-ta800-ep-ta800nbegww-thumb-536852431", 490, 100, "ชิ้น", "ของแถมแบรนด์", "เปิด", "ALL"],
      ["GF-SAM-CASE", "Samsung Clear Case S24U", "Case", "-", "-", "Clear", "https://images.samsung.com/is/image/samsung/p6pim/th/ef-qs928ctegww/gallery/th-clear-case-for-galaxy-s24-ultra-ef-qs928-ef-qs928ctegww-thumb-539326442", 590, 100, "ชิ้น", "ของแถมแบรนด์", "เปิด", "ALL"],
      ["GF-TG-PB10K", "TG Powerbank 10000mAh", "PB", "-", "10000", "White", "https://via.placeholder.com/150/ffffff/000000?text=Powerbank", 990, 200, "ชิ้น", "ของแถมช่องทาง", "เปิด", "ALL"],
      ["GF-TG-BAG", "TG Premium Bag (Canvas)", "Bag", "-", "-", "Black", "https://via.placeholder.com/150/000000/ffffff?text=TG+Bag", 390, 200, "ชิ้น", "ของแถมช่องทาง", "เปิด", "ALL"]
    ],
    "GiftMappings": [
      ["GM-001", "S24-Series", "Retail", "adapter, case", "bag", "เปิด"],
      ["GM-002", "S24-Series", "Online", "adapter", "powerbank, bag", "เปิด"],
      ["GM-003", "IP15-Series", "ALL", "*", "powerbank", "เปิด"]
    ],
    "Channels": [
      ["CH-01", "Retail", "ช่องทางหน้าร้านปกติ"],
      ["CH-02", "Online", "ช่องทางออนไลน์ / E-Commerce"],
      ["CH-03", "B2B", "ช่องทางลูกค้าองค์กร"]
    ],
    "Branches": [
      ["Retail", "B01", "สาขาเซ็นทรัลเวิลด์", "สมชาย ใจดี", "Central World", "BKK", "Bangkok", "Standard"],
      ["Retail", "B02", "สาขาเมกาบางนา", "สมหมาย รักการขาย", "Mega Bangna", "BKK", "Samut Prakan", "Premium"],
      ["Online", "O01", "Shopee Official", "สมศรี ออนไลน์", "Shopee", "Online", "Bangkok", "E-Com"]
    ],
    "Promotions": [
      ["P-001", "ส่วนลดลูกค้าเก่า 500 บาท", "Fixed", 500, "เปิด"],
      ["P-002", "ส่วนลดพนักงาน 1,000 บาท", "Fixed", 1000, "เปิด"],
      ["P-003", "แคมเปญหมดเขต (ซ่อนไว้)", "Fixed", 200, "ปิด"]
    ],
    "Interests": [
      ["เน้นกล้องถ่ายรูปสวย", "เปิด"],
      ["เน้นเล่นเกม / ดูหนัง", "เปิด"],
      ["แบตเตอรี่อึดใช้งานทั้งวัน", "เปิด"],
      ["ดีไซน์สวยงาม / น้ำหนักเบา", "เปิด"]
    ],
    "Members": [
      ["admin", hashPassword("admin123"), "Admin", "ผู้ดูแลระบบ", "ALL", "*"],
      ["sales", hashPassword("sales123"), "Sales", "สมชาย ใจดี", "B01", "dashboard, pos, orders"]
    ]
  };

  for (let sheetName in tables) {
    let sheet = ss.getSheetByName(sheetName);
    let isNewSheet = false;
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(tables[sheetName]);
      sheet.getRange(1, 1, 1, tables[sheetName].length).setFontWeight("bold").setBackground("#4F46E5").setFontColor("white");
      sheet.setFrozenRows(1);
      isNewSheet = true;
    }
    
    if (isNewSheet && dummyData[sheetName]) {
      const dataToInsert = dummyData[sheetName];
      sheet.getRange(2, 1, dataToInsert.length, dataToInsert[0].length).setValues(dataToInsert);
    }
  }
  return { status: 'success', message: 'Database Ready' };
}

function hashPassword(password) {
  const salt = "Mpos2026!@#";
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + salt);
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

// ตั้งค่า Script Property ชื่อ "MPOS_SECRET_KEY" ใน GAS เพื่อความปลอดภัยสูงสุด
// (File → Project Properties → Script Properties)
function getSecretKey() {
  return PropertiesService.getScriptProperties().getProperty('MPOS_SECRET_KEY') || "MposSecret2026!@#";
}

function generateToken(username) {
  const payloadStr = JSON.stringify({ Username: username, exp: Date.now() + 1000 * 60 * 60 * 24 });
  const payloadB64 = Utilities.base64EncodeWebSafe(Utilities.newBlob(payloadStr).getBytes());
  const signature = Utilities.computeHmacSha256Signature(payloadB64, getSecretKey());
  const signatureB64 = Utilities.base64EncodeWebSafe(signature);
  return payloadB64 + "." + signatureB64;
}

function verifyToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const expectedSig = Utilities.computeHmacSha256Signature(parts[0], getSecretKey());
  const expectedSigB64 = Utilities.base64EncodeWebSafe(expectedSig);
  if (expectedSigB64 !== parts[1]) return null;
  
  const payloadStr = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString();
  const payload = JSON.parse(payloadStr);
  if (Date.now() > payload.exp) return null;
  return payload;
}

function obfuscate(text) {
  if (!text) return "";
  return Utilities.base64EncodeWebSafe(Utilities.newBlob(text).getBytes());
}

function deobfuscate(encoded) {
  if (!encoded) return "";
  // Check if it's already plain text (e.g. contains only digits/dashes and length <= 15)
  if (/^[\d\-+()\s]+$/.test(encoded)) return encoded;
  try {
    return Utilities.newBlob(Utilities.base64DecodeWebSafe(encoded)).getDataAsString();
  } catch(e) {
    return encoded;
  }
}

function generateId(prefix) {
  return prefix + '-' + Utilities.formatDate(new Date(), "GMT+7", "yyMMdd") + '-' + Math.floor(1000 + Math.random() * 9000);
}

function logAudit(user, action, details) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("AuditLog");
  if(sheet) sheet.appendRow([generateId('LOG'), new Date().toLocaleString("en-US", {timeZone: "Asia/Bangkok"}), user, action, details]);
}

function getPublicConfig() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("UI_Banners");
    if(sheet) {
       const data = sheet.getDataRange().getValues();
       for(let i=1; i<data.length; i++) {
         if (data[i][1] === 'loginbg' && data[i][3] === 'Active') {
           return data[i][2] ? data[i][2].toString() : null;
         }
       }
    }
    // Fallback to old Settings sheet just in case it hasn't been migrated
    const oldSheet = ss.getSheetByName("Settings");
    if(oldSheet) {
       const val = oldSheet.getRange("D2").getValue();
       return val ? val.toString() : null;
    }
  } catch(e) { return null; }
  return null;
}

function apiHandler(action, payload, userToken) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let secureUser = null;
    if (action !== 'LOGIN') {
      if (!userToken || !userToken.Token) throw new Error("Unauthorized Access: No Token");
      const payloadObj = verifyToken(userToken.Token);
      if (!payloadObj) throw new Error("Invalid or Expired Token. Please login again.");
      
      const members = getTableDataAsJson(ss.getSheetByName("Members"));
      secureUser = members.find(u => u.Username === payloadObj.Username);
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
          tableData = tableData.filter(row => row['Branch Code'] === secureUser['Branch Code']);
        }
        if (payload.tableName === 'Orders') {
          tableData = tableData.map(o => {
            if (o['Contact Number']) o['Contact Number'] = deobfuscate(o['Contact Number']);
            if (o['ID Card_Passport']) o['ID Card_Passport'] = deobfuscate(o['ID Card_Passport']);
            return o;
          });
        }
        return { status: 'success', data: tableData };
      case 'GET_ALL_DATA': return getAllInitialData(ss);
      case 'SAVE_RECORD': return saveRecord(payload.tableName, payload.data, payload.idField, secureUser, ss);
      case 'DELETE_RECORD': return deleteRecord(payload.tableName, payload.idField, payload.idValue, secureUser, ss);
      case 'CHECKOUT': return processCheckout(payload, secureUser, ss);
      case 'UPDATE_FULL_ORDER': return updateFullOrder(payload.data, secureUser, ss);
      case 'GET_SETTINGS_LIST': return getSettingsList(ss);
      case 'SAVE_SETTINGS_ITEM': return saveSettingsItem(payload, secureUser, ss);
      case 'DELETE_SETTINGS_ITEM': return deleteSettingsItem(payload, secureUser, ss);
      default: throw new Error("Invalid API Action");
    }
  } catch (error) {
    return { status: 'error', message: error.toString() };
  }
}

function doLogin(username, password, ss) {
  const sheet = ss.getSheetByName("Members");
  if(!sheet) return { status: 'error', message: 'กรุณากด Auto Setup ก่อน' };
  const data = getTableDataAsJson(sheet);
  const hashedPw = hashPassword(password);
  
  // Backward compatibility for un-salted passwords
  const oldHashedPw = (() => {
    const d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
    let h = '';
    for (let i=0; i<d.length; i++) {
      let v = d[i]; if(v<0) v+=256;
      let s = v.toString(16); if(s.length==1) s='0'+s;
      h+=s;
    }
    return h;
  })();

  let user = data.find(u => u.Username === username && (u.Password === hashedPw || u.Password === oldHashedPw));

  // Auto-migrate plain text password: hash it and save back to sheet
  if (!user) {
    const plainUser = data.find(u => u.Username === username && u.Password === password);
    if (plainUser) {
      const sheetData = sheet.getDataRange().getValues();
      const headers = sheetData[0];
      const pwCol = headers.indexOf('Password');
      const userCol = headers.indexOf('Username');
      for (let i = 1; i < sheetData.length; i++) {
        if (sheetData[i][userCol] === username) {
          sheet.getRange(i + 1, pwCol + 1).setValue(hashedPw);
          break;
        }
      }
      user = plainUser;
    }
  }

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
    user.Token = generateToken(user.Username);
    logAudit(user.Username, "LOGIN", "System Login");
    return { status: 'success', user: user };
  }
  return { status: 'error', message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
}

function getTableDataAsJson(sheet) {
  if (!sheet) return [];
  const tableName = sheet.getName();
  const cache = CacheService.getScriptCache();
  const cacheableTables = ["Products", "Promotions", "Branches", "Channels", "Interests", "GiftMappings", "AutoPromotions"];
  
  if (cacheableTables.includes(tableName)) {
    const cachedData = cache.get("TABLE_" + tableName);
    if (cachedData) return JSON.parse(cachedData);
  }

  const data = sheet.getDataRange().getDisplayValues();
  if (data.length <= 1) return [];
  const headers = data[0].map(h => h.toString().trim()); 
  const result = data.slice(1).map((row, index) => {
    let obj = { _rowIndex: index + 2 }; 
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });

  if (cacheableTables.includes(tableName)) {
    try {
      const jsonStr = JSON.stringify(result);
      if (jsonStr.length < 100000) cache.put("TABLE_" + tableName, jsonStr, 21600);
    } catch(e) {}
  }
  
  return result;
}

function getKeyValueSettings(ss) {
  const sheet = ss.getSheetByName("Settings");
  if (!sheet) return {};
  const data = sheet.getDataRange().getValues();
  const settings = {};
  for (let i = 1; i < data.length; i++) {
    const key = data[i][0];
    if (key && key.toString().trim() !== "") {
      settings[key.toString().trim()] = data[i][1] ? data[i][1].toString().trim() : "";
    }
  }
  return settings;
}

function initAutoPromotionsSheet(ss) {
  let sheet = ss.getSheetByName("AutoPromotions");
  if (!sheet) {
    try {
      sheet = ss.insertSheet("AutoPromotions");
      sheet.appendRow(["Buy Category", "Get Discount Category", "Discount Percent", "Message Suggest", "Message Apply", "Status"]);
      sheet.appendRow(["โมบาย", "อุปกรณ์เสริม", 10, "ลูกค้าซื้อมือถือแล้ว! เสนอขายอุปกรณ์เสริม (เคส/ฟิล์ม/หัวชาร์จ) ตอนนี้ <strong class='text-rose-900'>รับส่วนลดอุปกรณ์เสริม 10% ทันที</strong>", "ลูกค้าได้รับส่วนลดอุปกรณ์เสริม 10% เรียบร้อยแล้ว", "Active"]);
      sheet.appendRow(["สมาร์ทวอทช์", "อุปกรณ์เสริม", 5, "ลูกค้าซื้อสมาร์ทวอทช์! เสนอขายสายนาฬิกาเพิ่ม รับส่วนลด 5%", "ได้รับส่วนลดสายนาฬิกา 5% เรียบร้อย", "Inactive"]);
      sheet.getRange("A1:F1").setFontWeight("bold").setBackground("#d9ead3");
      SpreadsheetApp.flush();
    } catch(e) {}
  }
}

function getAllInitialData(ss) {
  initAutoPromotionsSheet(ss);
  CacheService.getScriptCache().remove("TABLE_AutoPromotions");
  CacheService.getScriptCache().remove("TABLE_Branches");
  
  let heroBanners = [];
  let gridBanners = [];
  let popupBanners = []; 
  
  try {
    const bannersSheet = ss.getSheetByName("UI_Banners");
    if(bannersSheet) {
      const data = bannersSheet.getDataRange().getValues();
      for(let i=1; i<data.length; i++) {
        const type = data[i][1];
        const url = data[i][2];
        const status = data[i][3];
        const targetLink = data[i][4] ? data[i][4].toString().trim() : "";
        const details = data[i][5] ? data[i][5].toString().trim() : "";
        if (status !== 'Deleted' && url && url.toString().trim() !== "") {
          if (type === 'herobanner') heroBanners.push({url: url.toString().trim(), link: targetLink, details: details});
          else if (type === 'promogrid') gridBanners.push({url: url.toString().trim(), link: targetLink, details: details});
          else if (type === 'popupbanner') popupBanners.push({url: url.toString().trim(), link: targetLink, details: details});
        }
      }
    } else {
      // Fallback for old structure
      const setSheet = ss.getSheetByName("Settings");
      if(setSheet) {
        const lr = setSheet.getLastRow();
        if(lr >= 2) {
           const eVals = setSheet.getRange(2, 5, lr-1, 1).getValues();
           heroBanners = eVals.flat().filter(v => v && v.toString().trim() !== "");
           const fVals = setSheet.getRange(2, 6, lr-1, 1).getValues();
           gridBanners = fVals.flat().filter(v => v && v.toString().trim() !== "");
           const gVals = setSheet.getRange(2, 7, lr-1, 1).getValues();
           popupBanners = gVals.flat().filter(v => v && v.toString().trim() !== "");
        }
      }
    }
  } catch(e) {}

  return {
    status: 'success',
    products: getTableDataAsJson(ss.getSheetByName("Products")),
    promotions: getTableDataAsJson(ss.getSheetByName("Promotions")),
    branches: getTableDataAsJson(ss.getSheetByName("Branches")),
    channels: getTableDataAsJson(ss.getSheetByName("Channels")),
    interests: getTableDataAsJson(ss.getSheetByName("Interests")),
    giftMappings: getTableDataAsJson(ss.getSheetByName("GiftMappings")),
    autoPromotions: getTableDataAsJson(ss.getSheetByName("AutoPromotions")),
    heroBanners: heroBanners,
    gridBanners: gridBanners,
    popupBanners: popupBanners,
    settings: getKeyValueSettings(ss)
  };
}

function getAdvancedDashboard(secureUser, ss) {
  let orders = getTableDataAsJson(ss.getSheetByName("Orders"));
  const products = getTableDataAsJson(ss.getSheetByName("Products"));
  const members = getTableDataAsJson(ss.getSheetByName("Members"));

  // Deobfuscate PII for display
  orders = orders.map(o => {
    if (o['Contact Number']) o['Contact Number'] = deobfuscate(o['Contact Number']);
    if (o['ID Card_Passport']) o['ID Card_Passport'] = deobfuscate(o['ID Card_Passport']);
    return o;
  });

  if (secureUser.Role === 'Sales') {
    orders = orders.filter(o => o['Branch Code'] === secureUser['Branch Code']); 
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
    
    const dateStr = Utilities.formatDate(new Date(), "GMT+7", "yyMMdd");
    const orderData = orderSheet.getDataRange().getValues();
    const idIndex = orderData[0].map(h => h.toString().trim()).indexOf("OrderID");
    let uniqueOrders = new Set();
    if (idIndex > -1) {
      for (let i = 1; i < orderData.length; i++) {
        const oid = orderData[i][idIndex];
        if (oid && oid.toString().startsWith('ORD-' + dateStr)) {
          uniqueOrders.add(oid);
        }
      }
    }
    const orderId = 'ORD-' + dateStr + '-' + (uniqueOrders.size + 1).toString().padStart(3, '0');
    const now = new Date().toLocaleString("en-US", {timeZone: "Asia/Bangkok"});
    
    let actualBranch = payload.branch;
    let actualChannel = payload.channel;

    if (secureUser.Role === 'Sales') {
       actualBranch = secureUser['Branch Code'];
       actualChannel = secureUser.Channel;
    }

    let prodData = prodSheet.getDataRange().getValues();
    let headers = prodData[0].map(h => h.toString().trim());
    let skuIdx = headers.indexOf("SKU");
    let nameIdx = headers.indexOf("Product Name");
    let stockIdx = headers.indexOf("Stock");
    
    // ตรวจสอบว่าชีต Orders มีคอลัมน์ Receipt No / Deposit แล้วหรือยัง — ถ้ายังให้เพิ่มต่อท้ายอัตโนมัติ
    let orderHeaders = orderSheet.getRange(1, 1, 1, orderSheet.getLastColumn()).getValues()[0].map(h => h.toString().trim());
    ["Receipt No", "Deposit"].forEach(col => {
      if (orderHeaders.indexOf(col) === -1) {
        orderSheet.getRange(1, orderHeaders.length + 1).setValue(col);
        orderHeaders.push(col);
      }
    });

    let isFirstRow = true;
    let orderRows = [];
    let invRows = [];
    
    payload.cart.forEach(item => {
      let itemPrice = parseFloat((item.Price||0).toString().replace(/,/g, ''));
      if(isNaN(itemPrice)) itemPrice = 0;
      let rowTotal = itemPrice * item.qty;
      
      let foundMain = false;
      for(let i=1; i<prodData.length; i++) {
        if(prodData[i][skuIdx] == item.SKU) {
          let currentStock = parseInt(prodData[i][stockIdx] || 0);
          if(currentStock < item.qty) throw new Error("สินค้า " + item['Product Name'] + " สต๊อกไม่พอ (เหลือ " + currentStock + ")");
          prodData[i][stockIdx] = currentStock - item.qty;
          foundMain = true; break;
        }
      }
      if(!foundMain) throw new Error("ไม่พบสินค้า SKU: " + item.SKU);
      
      invRows.push([generateId('INV'), now, item.SKU, "SALE", -item.qty, actualBranch, secureUser.Username]);
      
      let fCustName = isFirstRow ? payload.customerName : "";
      let fContact = isFirstRow ? payload.contactPhone : "";
      let fEmail = isFirstRow ? payload.email : "";
      let fIdCard = isFirstRow ? payload.idCard : "";
      let fCodeHand = isFirstRow ? payload.codeHandraiser : "";
      let fPromo = isFirstRow ? (payload.promo || "-") : "";
      let fResStatus = isFirstRow ? payload.resStatus : "";
      let fBkStaff = isFirstRow ? payload.bkStaffName : "";
      let fBkPhone = isFirstRow ? payload.bkPhone : "";
      let fInterests = isFirstRow ? payload.customerInterests : "";
      let fRemark = isFirstRow ? payload.remark : "";
      let fReceiptNo = isFirstRow ? (payload.receiptNo || "") : "";
      let fDeposit = isFirstRow ? (parseFloat(payload.depositAmount) || 0) : "";

      orderRows.push([
        orderId, now, actualChannel, actualBranch, fCustName, fContact,
        fEmail, fIdCard, fCodeHand,
        item.SKU, item['Product Name'], item.qty, itemPrice,
        fPromo, fResStatus, fBkStaff, fBkPhone,
        fInterests, fRemark, rowTotal, "Pending", fReceiptNo, fDeposit
      ]);
      
      isFirstRow = false; 

      const processGift = (giftObj) => {
        if(giftObj && giftObj.name) {
          let giftSku = "GIFT"; 
          let foundGift = false;
          for(let i=1; i<prodData.length; i++) {
            if(prodData[i][nameIdx] == giftObj.name) {
              giftSku = prodData[i][skuIdx];
              let currentStock = parseInt(prodData[i][stockIdx] || 0);
              if(currentStock >= giftObj.qty) {
                prodData[i][stockIdx] = currentStock - giftObj.qty;
              }
              foundGift = true; break;
            }
          }
          invRows.push([generateId('INV'), now, giftSku, "GIFT", -giftObj.qty, actualBranch, secureUser.Username]);
          
          orderRows.push([
            orderId, now, actualChannel, actualBranch, "", "",
            "", "", "",
            giftSku, giftObj.name, giftObj.qty, 0,
            "", "", "", "",
            "", "", 0, "Pending", "", ""
          ]);
        }
      };

      if(item.brandGifts && Array.isArray(item.brandGifts)) {
         item.brandGifts.forEach(g => processGift(g));
      }
      if(item.channelGifts && Array.isArray(item.channelGifts)) {
         item.channelGifts.forEach(g => processGift(g));
      }
    });
    
    if (payload.discounts && Array.isArray(payload.discounts)) {
      payload.discounts.forEach(d => {
        let val = parseFloat(d.value || 0);
        if (val > 0) {
          orderRows.push([
            orderId, now, actualChannel, actualBranch, "", "",
            "", "", "",
            "DISCOUNT", d.name, 1, -val,
            "", "", "", "",
            "", "", -val, "Pending", "", ""
          ]);
        }
      });
    } else if (payload.discount && parseFloat(payload.discount) > 0) {
      orderRows.push([
        orderId, now, actualChannel, actualBranch, "", "",
        "", "", "",
        "DISCOUNT", payload.promo, 1, -parseFloat(payload.discount),
        "", "", "", "",
        "", "", -parseFloat(payload.discount), "Pending", "", ""
      ]);
    }
    
    let newStocks = [];
    for (let i = 1; i < prodData.length; i++) {
       newStocks.push([prodData[i][stockIdx]]);
    }
    if (newStocks.length > 0) {
      prodSheet.getRange(2, stockIdx + 1, newStocks.length, 1).setValues(newStocks);
    }
    if (invRows.length > 0) {
      invSheet.getRange(invSheet.getLastRow() + 1, 1, invRows.length, invRows[0].length).setValues(invRows);
    }
    if (orderRows.length > 0) {
      orderSheet.getRange(orderSheet.getLastRow() + 1, 1, orderRows.length, orderRows[0].length).setValues(orderRows);
    }
    
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

    const orderSheet = ss.getSheetByName("Orders"); 
    const prodSheet = ss.getSheetByName("Products"); 
    const invSheet = ss.getSheetByName("InventoryLog"); 
    const now = new Date().toLocaleString("en-US", {timeZone: "Asia/Bangkok"});
    
    const rowIdx = parseInt(dataObj._rowIndex); 
    if (!rowIdx) throw new Error("ไม่พบตำแหน่งข้อมูล");
    
    const oHeaders = orderSheet.getRange(1, 1, 1, orderSheet.getLastColumn()).getValues()[0].map(h => h.toString().trim());
    const oldDataRow = orderSheet.getRange(rowIdx, 1, 1, orderSheet.getLastColumn()).getValues()[0];
    
    const orderId = oldDataRow[oHeaders.indexOf("OrderID")];
    if (!orderId) throw new Error("ไม่พบ OrderID");
    
    let newStatus = dataObj["Order Status"] || oldDataRow[oHeaders.indexOf("Order Status")];
      if (secureUser.Role === 'Manager') {
        dataObj = { "_rowIndex": dataObj["_rowIndex"], "Order Status": newStatus };
      }
    
    const prodData = prodSheet.getDataRange().getValues(); 
    const pSkuIdx = prodData[0].indexOf("SKU"); 
    const pStockIdx = prodData[0].indexOf("Stock");
    const pNameIdx = prodData[0].indexOf("Product Name");
    
    const allRows = orderSheet.getDataRange().getValues();
    const orderIdColIdx = oHeaders.indexOf("OrderID");
    
    const matchingRows = [];
    for (let i = 1; i < allRows.length; i++) {
      if (allRows[i][orderIdColIdx] === orderId) {
        matchingRows.push({ rowIndex: i + 1, rowData: allRows[i] });
      }
    }
    
    let invRows = [];
    
    const adjustStockAndLog = (oldStatusVal, newStatusVal, oldSkuVal, newSkuVal, oldQtyVal, newQtyVal, branchVal) => {
      if (oldStatusVal !== 'Cancelled' && oldSkuVal && oldSkuVal !== 'DISCOUNT') {
        for (let i = 1; i < prodData.length; i++) {
          if (prodData[i][pSkuIdx] == oldSkuVal) {
            prodData[i][pStockIdx] = parseInt(prodData[i][pStockIdx] || 0) + oldQtyVal;
            invRows.push([generateId('INV'), now, oldSkuVal, "EDIT (REVERT)", oldQtyVal, branchVal, secureUser.Username]);
            break;
          }
        }
      }
      if (newStatusVal !== 'Cancelled' && newSkuVal && newSkuVal !== 'DISCOUNT') {
        for (let i = 1; i < prodData.length; i++) {
          if (prodData[i][pSkuIdx] == newSkuVal) {
            let currentStock = parseInt(prodData[i][pStockIdx] || 0);
            if (currentStock < newQtyVal) throw new Error("สินค้า " + prodData[i][pNameIdx] + " สต๊อกไม่พอสำหรับการแก้ไข (เหลือ " + currentStock + ")");
            prodData[i][pStockIdx] = currentStock - newQtyVal;
            invRows.push([generateId('INV'), now, newSkuVal, "EDIT (APPLY)", -newQtyVal, branchVal, secureUser.Username]);
            break;
          }
        }
      }
    };
    
    let orderUpdates = [];
    
    matchingRows.forEach(item => {
      let r = item.rowIndex;
      let rData = item.rowData;
      
      let oldSkuVal = rData[oHeaders.indexOf("SKU")];
      let oldQtyVal = parseInt(rData[oHeaders.indexOf("Qty")] || 0);
      let oldStatusVal = rData[oHeaders.indexOf("Order Status")];
      let branchVal = rData[oHeaders.indexOf("Branch Code")];
      
      let newSkuVal, newQtyVal, newStatusVal;
      let newRowData = [];
      
      if (r === rowIdx) {
        newSkuVal = dataObj["SKU"] || oldSkuVal;
        newQtyVal = parseInt(dataObj["Qty"] || oldQtyVal);
        newStatusVal = newStatus;
        
        oHeaders.forEach(h => {
          if (dataObj[h] !== undefined && h !== "_rowIndex") {
            newRowData.push(dataObj[h]);
          } else {
            newRowData.push(rData[oHeaders.indexOf(h)]);
          }
        });
      } else {
        newSkuVal = oldSkuVal;
        newQtyVal = oldQtyVal;
        newStatusVal = newStatus;
        
        oHeaders.forEach(h => {
          if (h === "Order Status") {
            newRowData.push(newStatus);
          } else {
            newRowData.push(rData[oHeaders.indexOf(h)]);
          }
        });
      }
      
      adjustStockAndLog(oldStatusVal, newStatusVal, oldSkuVal, newSkuVal, oldQtyVal, newQtyVal, branchVal);
      orderUpdates.push({row: r, data: newRowData});
    });
    
    let newStocks = [];
    for (let i = 1; i < prodData.length; i++) {
       newStocks.push([prodData[i][pStockIdx]]);
    }
    if (newStocks.length > 0) {
      prodSheet.getRange(2, pStockIdx + 1, newStocks.length, 1).setValues(newStocks);
    }
    if (invRows.length > 0) {
      invSheet.getRange(invSheet.getLastRow() + 1, 1, invRows.length, invRows[0].length).setValues(invRows);
    }
    orderUpdates.forEach(update => {
      orderSheet.getRange(update.row, 1, 1, update.data.length).setValues([update.data]);
    });
    
    logAudit(secureUser.Username, "EDIT_ORDER", "Edited Order Bill: " + orderId + " (Status: " + newStatus + ")");
    return { status: 'success' };
  } catch(e) {
    return { status: 'error', message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function saveRecord(tableName, dataObj, idField, secureUser, ss) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = ss.getSheetByName(tableName); const data = sheet.getDataRange().getDisplayValues(); const headers = data[0].map(h => h.toString().trim()); let idIndex = headers.indexOf(idField); let rowIndex = -1;
    if (dataObj[idField]) { for (let i = 1; i < data.length; i++) { if (data[i][idIndex] == dataObj[idField]) { rowIndex = i + 1; break; } } }
    if (tableName === 'Orders') {
      if (secureUser.Role === 'Sales') throw new Error("ไม่มีสิทธิ์แก้ไข");
    } else {
      if (secureUser.Role !== 'Admin') throw new Error("Permission Denied: Admin only");
    }
    if(tableName === "Members") { if (!dataObj.Password || dataObj.Password.trim() === "") { if (rowIndex > -1) { dataObj.Password = data[rowIndex - 1][headers.indexOf("Password")]; } else { dataObj.Password = "1234"; } } else { if (dataObj.Password.length < 50) dataObj.Password = hashPassword(dataObj.Password); } }
    let rowData = headers.map(h => dataObj[h] !== undefined ? dataObj[h] : "");
    if (rowIndex > -1) { sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]); logAudit(secureUser.Username, "UPDATE", "Updated " + tableName); } else { sheet.appendRow(rowData); logAudit(secureUser.Username, "INSERT", "Added to " + tableName); } const cacheableTables = ["Products", "Promotions", "Branches", "Channels", "Interests", "GiftMappings", "AutoPromotions"]; if (cacheableTables.includes(tableName)) CacheService.getScriptCache().remove("TABLE_" + tableName);
    return { status: 'success' };
  } catch(e) {
    return { status: 'error', message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function deleteRecord(tableName, idField, idValue, secureUser, ss) {
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sheet = ss.getSheetByName(tableName); 
      const data = sheet.getDataRange().getDisplayValues(); 
      const idIndex = data[0].indexOf(idField);
      
      if (tableName !== 'Orders' && secureUser.Role !== 'Admin') {
        return { status: 'error', message: 'Permission Denied: Admin only' };
      }
  
      if (tableName === 'Orders') {
          if (secureUser.Role === 'Sales' || secureUser.Role === 'Manager') return { status: 'error', message: 'ไม่มีสิทธิ์ลบรายการออเดอร์' };
        
        const prodSheet = ss.getSheetByName("Products");
        const invSheet = ss.getSheetByName("InventoryLog");
        const now = new Date().toLocaleString("en-US", {timeZone: "Asia/Bangkok"});
        const prodData = prodSheet.getDataRange().getValues();
        const pSkuIdx = prodData[0].indexOf("SKU");
        const pStockIdx = prodData[0].indexOf("Stock");
        
        const skuIdx = data[0].indexOf("SKU");
        const qtyIdx = data[0].indexOf("Qty");
        const statusIdx = data[0].indexOf("Order Status");
        const branchIdx = data[0].indexOf("Branch Code");
        
        let deletedCount = 0;
        let invRows = [];
        
        for (let i = data.length - 1; i >= 1; i--) {
          if (data[i][idIndex] == idValue) {
            let rowStatus = data[i][statusIdx];
            let rowSku = data[i][skuIdx];
            let rowQty = parseInt(data[i][qtyIdx] || 0);
            let rowBranch = data[i][branchIdx];
            
            if (rowStatus !== 'Cancelled' && rowSku && rowSku !== 'DISCOUNT') {
              for (let p = 1; p < prodData.length; p++) {
                if (prodData[p][pSkuIdx] == rowSku) {
                  prodData[p][pStockIdx] = parseInt(prodData[p][pStockIdx] || 0) + rowQty;
                  invRows.push([generateId('INV'), now, rowSku, "DELETE (REVERT)", rowQty, rowBranch, secureUser.Username]);
                  break;
                }
              }
            }
            
            sheet.deleteRow(i + 1);
            deletedCount++;
          }
        }
        
        if (deletedCount > 0) {
          let newStocks = [];
          for (let p = 1; p < prodData.length; p++) {
             newStocks.push([prodData[p][pStockIdx]]);
          }
          if (newStocks.length > 0) {
            prodSheet.getRange(2, pStockIdx + 1, newStocks.length, 1).setValues(newStocks);
          }
          if (invRows.length > 0) {
            invSheet.getRange(invSheet.getLastRow() + 1, 1, invRows.length, invRows[0].length).setValues(invRows);
          }
          logAudit(secureUser.Username, "DELETE_ORDER", "Deleted Order ID: " + idValue + " (" + deletedCount + " rows)");
          return { status: 'success' };
        }
      } else {
        for (let i = 1; i < data.length; i++) {
          if (data[i][idIndex] == idValue) {
            sheet.deleteRow(i + 1); 
            logAudit(secureUser.Username, "DELETE", "Deleted ID: " + idValue + " from " + tableName); 
            const cacheableTables = ["Products", "Promotions", "Branches", "Channels", "Interests", "GiftMappings", "AutoPromotions"];
            if (cacheableTables.includes(tableName)) CacheService.getScriptCache().remove("TABLE_" + tableName);
            return { status: 'success' }; 
          }
        }
      }
      return { status: 'error', message: 'Record not found' };
    } catch(e) {
    return { status: 'error', message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function getSettingsList(ss) {
  const bannersSheet = ss.getSheetByName("UI_Banners");
  const settingsSheet = ss.getSheetByName("Settings");
  if (!bannersSheet) return { status: 'error', message: 'UI_Banners sheet not found. Please click Auto Setup to initialize new database structure.' };
  
  const heroBanners = [];
  const promoGrids = [];
  const popupBanners = [];
  let loginBg = "";
  
  const data = bannersSheet.getDataRange().getValues();
  for(let i=1; i<data.length; i++) {
    const rIdx = i + 1;
    const type = data[i][1];
    const url = data[i][2];
    const status = data[i][3];
    const targetLink = data[i][4] ? data[i][4].toString().trim() : "";
    const details = data[i][5] ? data[i][5].toString().trim() : "";
    
    if (status !== 'Deleted' && url && url.toString().trim() !== "") {
      if (type === 'loginbg') loginBg = url.toString().trim();
      else if (type === 'herobanner') heroBanners.push({ rowIndex: rIdx, url: url.toString().trim(), targetLink: targetLink, details: details });
      else if (type === 'promogrid') promoGrids.push({ rowIndex: rIdx, url: url.toString().trim(), targetLink: targetLink, details: details });
      else if (type === 'popupbanner') popupBanners.push({ rowIndex: rIdx, url: url.toString().trim(), targetLink: targetLink, details: details });
    }
  }
  
  return {
    status: 'success',
    data: {
      loginBg: loginBg,
      heroBanners: heroBanners,
      promoGrids: promoGrids,
      popupBanners: popupBanners,
      keyValueSettings: getKeyValueSettings(ss)
    }
  };
}

function saveSettingsItem(payload, secureUser, ss) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (secureUser.Role !== 'Admin') throw new Error("ไม่มีสิทธิ์แก้ไขตั้งค่าระบบ");
    const type = payload.type;
    
    if (type === 'bookingsettings') {
      const sheet = ss.getSheetByName("Settings");
      if (!sheet) throw new Error("Settings sheet not found");
      const settings = payload.settings;
      const data = sheet.getDataRange().getValues();
      for (let key in settings) {
        let found = false;
        let val = settings[key].toString().trim();
        for (let i = 1; i < data.length; i++) {
          if (data[i][0] === key) {
            sheet.getRange(i + 1, 2).setValue(val);
            found = true;
            break;
          }
        }
        if (!found) {
          sheet.appendRow([key, val, key === 'ReserveStart' ? 'วันเริ่มจองสินค้า' : 'วันสิ้นสุดจองสินค้า']);
        }
      }
      logAudit(secureUser.Username, "SETTING_UPDATE", "Updated Booking Settings: " + JSON.stringify(settings));
      return { status: 'success' };
    }
    
    const url = payload.url ? payload.url.toString().trim() : "";
    const targetLink = payload.targetLink ? payload.targetLink.toString().trim() : "";
    const details = payload.details ? payload.details.toString().trim() : "";
    const rowIndex = payload.rowIndex;
    const bannersSheet = ss.getSheetByName("UI_Banners");
    if (!bannersSheet) throw new Error("UI_Banners sheet not found. Please click Auto Setup.");
    
    if (type === 'loginbg') {
      const data = bannersSheet.getDataRange().getValues();
      let found = false;
      for (let i = 1; i < data.length; i++) {
        if (data[i][1] === 'loginbg') {
          bannersSheet.getRange(i + 1, 3).setValue(url);
          bannersSheet.getRange(i + 1, 4).setValue('Active');
          found = true;
          break;
        }
      }
      if (!found) {
        bannersSheet.appendRow([generateId('BAN'), 'loginbg', url, 'Active', '']);
      }
      logAudit(secureUser.Username, "SETTING_UPDATE", "Updated Login BG: " + url);
      return { status: 'success' };
    }
    
    if (rowIndex) {
      bannersSheet.getRange(rowIndex, 3).setValue(url);
      bannersSheet.getRange(rowIndex, 4).setValue('Active');
      bannersSheet.getRange(rowIndex, 5).setValue(targetLink);
      bannersSheet.getRange(rowIndex, 6).setValue(details);
      logAudit(secureUser.Username, "SETTING_UPDATE", "Updated Setting " + type + " at row " + rowIndex + ": " + url);
    } else {
      bannersSheet.appendRow([generateId('BAN'), type, url, 'Active', targetLink, details]);
      logAudit(secureUser.Username, "SETTING_INSERT", "Added Setting " + type + ": " + url);
    }
    return { status: 'success' };
  } catch(e) {
    return { status: 'error', message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function deleteSettingsItem(payload, secureUser, ss) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (secureUser.Role !== 'Admin') throw new Error("ไม่มีสิทธิ์แก้ไขตั้งค่าระบบ");
    const bannersSheet = ss.getSheetByName("UI_Banners");
    if (!bannersSheet) throw new Error("UI_Banners sheet not found");
    
    const type = payload.type;
    const rowIndex = parseInt(payload.rowIndex);
    if (!rowIndex || rowIndex < 2) throw new Error("Invalid row index");
    
    bannersSheet.deleteRow(rowIndex);
    logAudit(secureUser.Username, "SETTING_DELETE", "Deleted Setting " + type + " at row " + rowIndex);
    return { status: 'success' };
  } catch(e) {
    return { status: 'error', message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}



