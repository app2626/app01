Here is the complete source code for the project. Please use this to recreate or analyze the project.


### File: src/appsscript.json
`$lang
{
  "timeZone": "Asia/Bangkok",
  "dependencies": {},
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  },
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8"
}
``n
### File: src/Code.js
`$lang
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
    "Branches": ["Channel", "Branch Code", "Branch Name", "Supervisor Name", "Mall", "Region", "Province", "Type Name"],
    "Channels": ["Channel ID", "Channel Name", "Description"],
    "Promotions": ["Promo ID", "Promo Name", "Discount Type", "Value", "Status"],
    "Interests": ["Interest Name", "Status"],
    "GiftMappings": ["Mapping ID", "Target Mobile (SKU or Group)", "Channel", "Brand Gifts", "Channel Gifts", "Status"],
    // 🌟 จัดเรียงคอลัมน์ Orders ใหม่ตามที่ระบุ
    "Orders": [
      "OrderID", "Timestamp", "Channel", "Branch", "Customer Name", "Contact Number", "Email", "ID Card_Passport", "Code Handraiser",
      "SKU", "Product Name", "Qty", "Unit Price", "Promo", "Reservation Status", "Booking Staff", "Booking Phone", 
      "Customer Interests", "Remark", "Row Total", "Order Status" 
    ],
    "OrderStatus": ["Status ID", "Status Name", "Color Code"],
    "InventoryLog": ["Log ID", "Timestamp", "SKU", "Action", "Qty", "Branch", "User"],
    "AuditLog": ["Log ID", "Timestamp", "User", "Action", "Details"],
    "Settings": ["Key", "Value", "Remark"],
    "UI_Banners": ["Banner ID", "Type", "URL", "Status", "Target Link"]
  };

  const dummyData = {
    "Settings": [
      ["SystemName", "Mobile Pre Order System", "ชื่อระบบ"],
      ["Currency", "THB", "สกุลเงิน"],
      ["ReserveStart", "2026-06-01T00:00:00", "วันเริ่มจองสินค้า"],
      ["ReserveEnd", "2026-06-30T23:59:59", "วันสิ้นสุดจองสินค้า"]
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

const SECRET_KEY = "MposSecret2026!@#";

function generateToken(username) {
  const payloadStr = JSON.stringify({ Username: username, exp: Date.now() + 1000 * 60 * 60 * 24 });
  const payloadB64 = Utilities.base64EncodeWebSafe(Utilities.newBlob(payloadStr).getBytes());
  const signature = Utilities.computeHmacSha256Signature(payloadB64, SECRET_KEY);
  const signatureB64 = Utilities.base64EncodeWebSafe(signature);
  return payloadB64 + "." + signatureB64;
}

function verifyToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const expectedSig = Utilities.computeHmacSha256Signature(parts[0], SECRET_KEY);
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
          tableData = tableData.filter(row => row['Branch'] === secureUser['Branch Code']);
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

  const user = data.find(u => u.Username === username && (u.Password === hashedPw || u.Password === oldHashedPw || u.Password === password));
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
  const cacheableTables = ["Products", "Promotions", "Branches", "Channels", "Interests", "GiftMappings"];
  
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

function getAllInitialData(ss) {
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
        if (status !== 'Deleted' && url && url.toString().trim() !== "") {
          if (type === 'herobanner') heroBanners.push({url: url.toString().trim(), link: targetLink});
          else if (type === 'promogrid') gridBanners.push({url: url.toString().trim(), link: targetLink});
          else if (type === 'popupbanner') popupBanners.push({url: url.toString().trim(), link: targetLink});
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
    let headers = prodData[0].map(h => h.toString().trim());
    let skuIdx = headers.indexOf("SKU");
    let nameIdx = headers.indexOf("Product Name");
    let stockIdx = headers.indexOf("Stock");
    
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
      let fContact = isFirstRow ? obfuscate(payload.contactPhone) : "";
      let fEmail = isFirstRow ? payload.email : "";
      let fIdCard = isFirstRow ? obfuscate(payload.idCard) : "";
      let fCodeHand = isFirstRow ? payload.codeHandraiser : "";
      let fPromo = isFirstRow ? (payload.promo || "-") : "";
      let fResStatus = isFirstRow ? payload.resStatus : "";
      let fBkStaff = isFirstRow ? payload.bkStaffName : "";
      let fBkPhone = isFirstRow ? payload.bkPhone : "";
      let fInterests = isFirstRow ? payload.customerInterests : "";
      let fRemark = isFirstRow ? payload.remark : "";
      
      // 🌟 แถวของสินค้าหลัก เรียงตามลำดับ 21 คอลัมน์ (ใส่ Pending คอลัมน์สุดท้ายเสมอ)
      orderSheet.appendRow([
        orderId, now, actualChannel, actualBranch, fCustName, fContact, 
        fEmail, fIdCard, fCodeHand,
        item.SKU, item['Product Name'], item.qty, itemPrice, 
        fPromo, fResStatus, fBkStaff, fBkPhone, 
        fInterests, fRemark, rowTotal, "Pending"
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
                prodSheet.getRange(i+1, stockIdx+1).setValue(currentStock - giftObj.qty);
              }
              foundGift = true; break;
            }
          }
          invSheet.appendRow([generateId('INV'), now, giftSku, "GIFT", -giftObj.qty, actualBranch, secureUser.Username]);
          
          // 🌟 แถวของแถม เรียงตามลำดับ 21 คอลัมน์ (ใส่ Pending คอลัมน์สุดท้ายเสมอ)
          orderSheet.appendRow([
            orderId, now, actualChannel, actualBranch, "", "", 
            "", "", "",
            giftSku, giftObj.name, giftObj.qty, 0, 
            "", "", "", "", 
            "", "", 0, "Pending" 
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
    
    // Add discount rows if multiple discounts are applied
    if (payload.discounts && Array.isArray(payload.discounts)) {
      payload.discounts.forEach(d => {
        let val = parseFloat(d.value || 0);
        if (val > 0) {
          orderSheet.appendRow([
            orderId, now, actualChannel, actualBranch, "", "", 
            "", "", "",
            "DISCOUNT", d.name, 1, -val, 
            "", "", "", "", 
            "", "", -val, "Pending"
          ]);
        }
      });
    } else if (payload.discount && parseFloat(payload.discount) > 0) {
      orderSheet.appendRow([
        orderId, now, actualChannel, actualBranch, "", "", 
        "", "", "",
        "DISCOUNT", payload.promo, 1, -parseFloat(payload.discount), 
        "", "", "", "", 
        "", "", -parseFloat(payload.discount), "Pending"
      ]);
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
    
    const prodData = prodSheet.getDataRange().getValues(); 
    const pSkuIdx = prodData[0].indexOf("SKU"); 
    const pStockIdx = prodData[0].indexOf("Stock");
    
    // ดึงรายการสั่งซื้อทั้งหมดเพื่อหาแถวที่อยู่ในบิลเดียวกัน
    const allRows = orderSheet.getDataRange().getValues();
    const orderIdColIdx = oHeaders.indexOf("OrderID");
    
    const matchingRows = [];
    for (let i = 1; i < allRows.length; i++) {
      if (allRows[i][orderIdColIdx] === orderId) {
        matchingRows.push({
          rowIndex: i + 1,
          rowData: allRows[i]
        });
      }
    }
    
    // ฟังก์ชันในการจัดการสต๊อกและสร้างล็อก
    const adjustStockAndLog = (oldStatusVal, newStatusVal, oldSkuVal, newSkuVal, oldQtyVal, newQtyVal, branchVal) => {
      if (oldStatusVal !== 'Cancelled' && oldSkuVal) {
        for (let i = 1; i < prodData.length; i++) {
          if (prodData[i][pSkuIdx] == oldSkuVal) {
            let currentStock = parseInt(prodData[i][pStockIdx] || 0);
            prodSheet.getRange(i + 1, pStockIdx + 1).setValue(currentStock + oldQtyVal);
            prodData[i][pStockIdx] = currentStock + oldQtyVal;
            invSheet.appendRow([generateId('INV'), now, oldSkuVal, "EDIT (REVERT)", oldQtyVal, branchVal, secureUser.Username]);
            break;
          }
        }
      }
      if (newStatusVal !== 'Cancelled' && newSkuVal) {
        for (let i = 1; i < prodData.length; i++) {
          if (prodData[i][pSkuIdx] == newSkuVal) {
            let currentStock = parseInt(prodData[i][pStockIdx] || 0);
            prodSheet.getRange(i + 1, pStockIdx + 1).setValue(currentStock - newQtyVal);
            prodData[i][pStockIdx] = currentStock - newQtyVal;
            invSheet.appendRow([generateId('INV'), now, newSkuVal, "EDIT (APPLY)", -newQtyVal, branchVal, secureUser.Username]);
            break;
          }
        }
      }
    };
    
    // วนลูปอัปเดตแต่ละแถวในบิลเดียวกัน
    matchingRows.forEach(item => {
      let r = item.rowIndex;
      let rData = item.rowData;
      
      let oldSkuVal = rData[oHeaders.indexOf("SKU")];
      let oldQtyVal = parseInt(rData[oHeaders.indexOf("Qty")] || 0);
      let oldStatusVal = rData[oHeaders.indexOf("Order Status")];
      let branchVal = rData[oHeaders.indexOf("Branch")];
      
      let newSkuVal, newQtyVal, newStatusVal;
      let newRowData = [];
      
      if (r === rowIdx) {
        // แถวที่ผู้ใช้เลือกแก้ไขโดยตรง: ใช้ข้อมูลจากฟอร์มที่ส่งมา
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
        // แถวอื่นๆ ในบิลเดียวกัน: เปลี่ยนเฉพาะสถานะ
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
      
      // ปรับปรุงสต๊อกของแถวนี้
      adjustStockAndLog(oldStatusVal, newStatusVal, oldSkuVal, newSkuVal, oldQtyVal, newQtyVal, branchVal);
      
      // บันทึกแถวนี้ลงชีต
      orderSheet.getRange(r, 1, 1, newRowData.length).setValues([newRowData]);
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
    if(tableName === 'Orders' && secureUser.Role === 'Sales') throw new Error("ไม่มีสิทธิ์แก้ไข");
    if(tableName === "Members") { if (!dataObj.Password || dataObj.Password.trim() === "") { if (rowIndex > -1) { dataObj.Password = data[rowIndex - 1][headers.indexOf("Password")]; } else { dataObj.Password = "1234"; } } else { if (dataObj.Password.length < 50) dataObj.Password = hashPassword(dataObj.Password); } }
    let rowData = headers.map(h => dataObj[h] !== undefined ? dataObj[h] : "");
    if (rowIndex > -1) { sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]); logAudit(secureUser.Username, "UPDATE", "Updated " + tableName); } else { sheet.appendRow(rowData); logAudit(secureUser.Username, "INSERT", "Added to " + tableName); } const cacheableTables = ["Products", "Promotions", "Branches", "Channels", "Interests", "GiftMappings"]; if (cacheableTables.includes(tableName)) CacheService.getScriptCache().remove("TABLE_" + tableName);
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
    
    if (tableName === 'Orders') {
      if (secureUser.Role === 'Sales') return { status: 'error', message: 'ไม่อนุญาตให้ลบ' };
      
      const prodSheet = ss.getSheetByName("Products");
      const invSheet = ss.getSheetByName("InventoryLog");
      const now = new Date().toLocaleString("en-US", {timeZone: "Asia/Bangkok"});
      const prodData = prodSheet.getDataRange().getValues();
      const pSkuIdx = prodData[0].indexOf("SKU");
      const pStockIdx = prodData[0].indexOf("Stock");
      
      const skuIdx = data[0].indexOf("SKU");
      const qtyIdx = data[0].indexOf("Qty");
      const statusIdx = data[0].indexOf("Order Status");
      const branchIdx = data[0].indexOf("Branch");
      
      let deletedCount = 0;
      // วนลูปจากล่างขึ้นบนเพื่อป้องกันดัชนีแถวเลื่อน
      for (let i = data.length - 1; i >= 1; i--) {
        if (data[i][idIndex] == idValue) {
          let rowStatus = data[i][statusIdx];
          let rowSku = data[i][skuIdx];
          let rowQty = parseInt(data[i][qtyIdx] || 0);
          let rowBranch = data[i][branchIdx];
          
          // คืนสต๊อกหากสถานะไม่ใช่ Cancelled และเป็นสินค้าจริง
          if (rowStatus !== 'Cancelled' && rowSku && rowSku !== 'DISCOUNT') {
            for (let p = 1; p < prodData.length; p++) {
              if (prodData[p][pSkuIdx] == rowSku) {
                let currentStock = parseInt(prodData[p][pStockIdx] || 0);
                prodSheet.getRange(p + 1, pStockIdx + 1).setValue(currentStock + rowQty);
                prodData[p][pStockIdx] = currentStock + rowQty; // อัปเดตแคช
                invSheet.appendRow([generateId('INV'), now, rowSku, "DELETE (REVERT)", rowQty, rowBranch, secureUser.Username]);
                break;
              }
            }
          }
          
          sheet.deleteRow(i + 1);
          deletedCount++;
        }
      }
      if (deletedCount > 0) {
        logAudit(secureUser.Username, "DELETE_ORDER", "Deleted Order ID: " + idValue + " (" + deletedCount + " rows)");
        return { status: 'success' };
      }
    } else {
      for (let i = 1; i < data.length; i++) {
        if (data[i][idIndex] == idValue) {
          sheet.deleteRow(i + 1); 
          logAudit(secureUser.Username, "DELETE", "Deleted ID: " + idValue + " from " + tableName); 
          const cacheableTables = ["Products", "Promotions", "Branches", "Channels", "Interests", "GiftMappings"];
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
    
    if (status !== 'Deleted' && url && url.toString().trim() !== "") {
      if (type === 'loginbg') loginBg = url.toString().trim();
      else if (type === 'herobanner') heroBanners.push({ rowIndex: rIdx, url: url.toString().trim(), targetLink: targetLink });
      else if (type === 'promogrid') promoGrids.push({ rowIndex: rIdx, url: url.toString().trim(), targetLink: targetLink });
      else if (type === 'popupbanner') popupBanners.push({ rowIndex: rIdx, url: url.toString().trim(), targetLink: targetLink });
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
      logAudit(secureUser.Username, "SETTING_UPDATE", "Updated Setting " + type + " at row " + rowIndex + ": " + url);
    } else {
      bannersSheet.appendRow([generateId('BAN'), type, url, 'Active', targetLink]);
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



``n
### File: src/CSS.html
`$lang
<style>
  /* Base & Custom Scrollbar */
  body {
    font-family: 'Prompt', sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  
  .custom-scrollbar::-webkit-scrollbar { 
    width: 6px; 
    height: 6px; 
  }
  .custom-scrollbar::-webkit-scrollbar-track { 
    background: transparent; 
  }
  .custom-scrollbar::-webkit-scrollbar-thumb { 
    background: #cbd5e1; 
    border-radius: 10px; 
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover { 
    background: #94a3b8; 
  }

  /* Animations & Transitions */
  .animate-fade-in { 
    animation: fadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards; 
  }
  .animate-fade-in-up { 
    animation: fadeInUp 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards; 
  }
  
  @keyframes fadeIn { 
    from { opacity: 0; } 
    to { opacity: 1; } 
  }
  @keyframes fadeInUp {
    from { 
      opacity: 0; 
      transform: translateY(16px); 
    }
    to { 
      opacity: 1; 
      transform: translateY(0); 
    }
  }

  /* Skeleton Loading Effect */
  .skeleton {
    background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
    background-size: 200% 100%;
    animation: skeleton-glow 1.5s infinite ease-in-out;
    border-radius: 0.75rem;
  }
  @keyframes skeleton-glow {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  /* Premium Card Styles */
  .premium-card {
    background: #ffffff;
    border: 1px solid rgba(226, 232, 240, 0.8);
    border-radius: 1.5rem;
    box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.02), 0 2px 4px -1px rgba(15, 23, 42, 0.01);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .premium-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 20px 25px -5px rgba(15, 23, 42, 0.06), 0 10px 10px -5px rgba(15, 23, 42, 0.02);
    border-color: rgba(99, 102, 241, 0.2);
  }

  /* Glassmorphism Styles */
  .glass-panel {
    background: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.6);
  }
  
  .glass-nav {
    background: rgba(255, 255, 255, 0.8);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-bottom: 1px solid rgba(226, 232, 240, 0.8);
  }

  /* POS Product Cards */
  .product-card-hover {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    border: 1px solid rgba(241, 245, 249, 1);
  }
  .product-card-hover:hover {
    transform: translateY(-5px);
    box-shadow: 0 12px 20px -3px rgba(79, 70, 229, 0.06), 0 4px 12px -2px rgba(79, 70, 229, 0.02);
    border-color: rgba(99, 102, 241, 0.3);
  }

  /* SweetAlert Theme Tweaks */
  .swal2-popup { 
    border-radius: 1.75rem !important; 
    font-family: 'Prompt', sans-serif !important; 
    box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.15) !important; 
    padding: 2.25rem !important; 
  }
  .swal2-title { 
    font-size: 1.35rem !important; 
    color: #0f172a !important; 
    font-weight: 800 !important; 
    letter-spacing: -0.025em !important;
  }
  .swal2-html-container { 
    font-size: 0.95rem !important; 
    color: #475569 !important; 
    line-height: 1.6 !important;
  }
  .swal2-actions { 
    margin-top: 1.75rem !important; 
    gap: 0.75rem !important; 
  }
  .swal2-styled.swal2-confirm { 
    background-color: #4f46e5 !important; 
    border-radius: 0.875rem !important; 
    font-weight: 700 !important; 
    padding: 0.75rem 1.75rem !important; 
    font-size: 0.875rem !important; 
    box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2), 0 2px 4px -1px rgba(79, 70, 229, 0.1) !important;
  }
  .swal2-styled.swal2-confirm:hover {
    background-color: #4338ca !important;
  }
  .swal2-styled.swal2-cancel { 
    background-color: #ffffff !important; 
    color: #334155 !important; 
    border: 1px solid #cbd5e1 !important; 
    border-radius: 0.875rem !important; 
    font-weight: 700 !important; 
    padding: 0.75rem 1.75rem !important; 
    font-size: 0.875rem !important; 
  }
  .swal2-styled.swal2-cancel:hover {
    background-color: #f8fafc !important;
  }

  /* Data Table Customizations */
  #dataTable {
    border-spacing: 0;
  }
  #dataTable th {
    position: sticky;
    top: 0;
    z-index: 10;
  }
  #dataTable tbody tr {
    transition: all 0.2s ease;
  }
  #dataTable tbody tr:hover { 
    background-color: rgba(248, 250, 252, 0.95); 
  }

  /* Elegant KPI Cards */
  .kpi-gradient-total {
    background: linear-gradient(135deg, #ffffff 0%, #f5f3ff 100%);
    border-left: 4px solid #6366f1;
  }
  .kpi-gradient-mob {
    background: linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%);
    border-left: 4px solid #10b981;
  }
  .kpi-gradient-acc {
    background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
    border-left: 4px solid #64748b;
  }
  .kpi-gradient-resT {
    background: linear-gradient(135deg, #ffffff 0%, #fffbeb 100%);
    border-left: 4px solid #f59e0b;
  }
  .kpi-gradient-resF {
    background: linear-gradient(135deg, #ffffff 0%, #eff6ff 100%);
    border-left: 4px solid #3b82f6;
  }
  .kpi-gradient-aov {
    background: linear-gradient(135deg, #ffffff 0%, #faf5ff 100%);
    border-left: 4px solid #a855f7;
  }
  .kpi-gradient-conv {
    background: linear-gradient(135deg, #ffffff 0%, #ecfdf5 100%);
    border-left: 4px solid #10b981;
  }

  /* UI Input focus effects */
  input:focus, select:focus, textarea:focus {
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15) !important;
    border-color: #6366f1 !important;
  }

  /* Dynamic Active Navbar State */
  .nav-link.active-link {
    background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%) !important;
    color: #ffffff !important;
    box-shadow: 0 4px 12px -1px rgba(79, 70, 229, 0.3) !important;
  }
  
  /* Badge Glow Effect */
  .badge-glow-emerald {
    box-shadow: 0 0 8px rgba(16, 185, 129, 0.2);
  }
  .badge-glow-amber {
    box-shadow: 0 0 8px rgba(245, 158, 11, 0.2);
  }
  .badge-glow-rose {
    box-shadow: 0 0 8px rgba(244, 63, 94, 0.2);
  }

  /* Blob Animations */
  @keyframes blob {
    0% { transform: translate(0px, 0px) scale(1); }
    33% { transform: translate(30px, -50px) scale(1.1); }
    66% { transform: translate(-20px, 20px) scale(0.9); }
    100% { transform: translate(0px, 0px) scale(1); }
  }
  .animate-blob {
    animation: blob 7s infinite;
  }
  .animation-delay-2000 {
    animation-delay: 2s;
  }
  .animation-delay-4000 {
    animation-delay: 4s;
  }
</style>

``n
### File: src/Index.html
`$lang
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mobile Pre Order System</title>
  
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            indigo: { 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 900: '#312e81' },
            slate: { 50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 700: '#334155', 800: '#1e293b', 900: '#0f172a' },
            emerald: { 500: '#10b981' },
            amber: { 500: '#f59e0b' },
            rose: { 500: '#f43f5e' }
          },
          fontFamily: {
            sans: ['Prompt', 'sans-serif'],
          }
        }
      }
    }
  </script>
  
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2"></script>
  <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
  <?!= include('CSS'); ?>
</head>
<body class="bg-gradient-to-br from-slate-50 via-indigo-50/20 to-cyan-50/30 text-slate-800 antialiased min-h-screen relative overflow-x-hidden">
  <div id="app" class="w-full min-h-screen flex flex-col"></div>

  <template id="tmpl-login">
    <div class="relative flex items-center justify-center min-h-screen bg-slate-900 px-4 overflow-hidden">
      <div id="loginBg" class="absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-1000 opacity-30"></div>
      <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] z-0"></div>
      
      <div class="relative z-10 bg-white/80 backdrop-blur-2xl p-8 rounded-3xl shadow-2xl border border-white/40 w-full max-w-sm animate-fade-in-up">
        <div class="text-center mb-6">
          <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-50 mb-4 shadow-inner">
             <i class="fas fa-layer-group text-3xl text-indigo-600"></i>
          </div>
          <h3 class="text-xl font-black text-slate-800 tracking-tight">Mobile Pre Order System</h3>
          <p class="text-xs text-slate-500 mt-1 font-semibold">Portal Management System</p>
        </div>
        
        <form id="loginForm" onsubmit="window.app.handleLogin(event)" class="space-y-4">
          <div>
            <input type="text" class="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-inner" id="loginUsername" placeholder="ชื่อผู้ใช้งาน (Username)" required>
          </div>
          <div>
            <input type="password" class="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-inner" id="loginPassword" placeholder="รหัสผ่าน (Password)" required>
          </div>
          <button type="submit" class="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-bold rounded-2xl shadow-lg shadow-indigo-100 hover:shadow-xl transition-all" id="btnLogin">เข้าสู่ระบบ</button>
        </form>
      </div>
    </div>
  </template>

  <template id="tmpl-main">
    <div class="min-h-screen flex flex-col w-full relative z-10"><div class="fixed top-0 -left-40 w-96 h-96 bg-indigo-300 rounded-full mix-blend-multiply filter blur-[128px] opacity-40 animate-blob z-[-1]"></div><div class="fixed top-0 -right-40 w-96 h-96 bg-cyan-300 rounded-full mix-blend-multiply filter blur-[128px] opacity-40 animate-blob animation-delay-2000 z-[-1]"></div><div class="fixed -bottom-40 left-20 w-96 h-96 bg-pink-300 rounded-full mix-blend-multiply filter blur-[128px] opacity-40 animate-blob animation-delay-4000 z-[-1]"></div>
      <nav class="glass-nav sticky top-0 z-50 shadow-sm w-full">
        <div class="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div class="flex justify-between h-16 w-full">
            <div class="flex items-center">
              <i class="fas fa-layer-group text-indigo-600 text-2xl mr-2"></i>
              <span class="font-black text-xl text-slate-800 tracking-tight">Mobile Pre Order System</span>
            </div>
            
            <div class="hidden lg:flex lg:items-center lg:space-x-1" id="desktopMenu"></div>
            
            <div class="hidden lg:flex lg:items-center lg:space-x-4">
              <div class="text-xs text-slate-400 font-semibold mr-2" id="clock"></div>
              <div class="text-right">
                <div class="text-sm font-bold text-slate-700 leading-tight" id="headerUserName">Name</div>
                <div class="text-[0.65rem] uppercase tracking-wider text-indigo-600 font-bold" id="headerRole">Role</div>
              </div>
              <button onclick="window.app.logout()" class="w-10 h-10 rounded-full bg-slate-50 border border-slate-200 text-slate-400 hover:text-rose-500 hover:bg-rose-50 hover:border-rose-200 transition-all flex items-center justify-center" title="ออกจากระบบ">
                 <i class="fas fa-sign-out-alt"></i>
              </button>
            </div>
            
            <div class="flex items-center lg:hidden">
              <button onclick="window.app.toggleMobileMenu()" class="text-slate-500 hover:text-indigo-600 focus:outline-none p-2 rounded-lg hover:bg-slate-100 transition-colors">
                <i class="fas fa-bars text-2xl"></i>
              </button>
            </div>
          </div>
        </div>

        <div class="lg:hidden hidden border-t border-slate-100 bg-white shadow-xl absolute w-full left-0 z-40 transition-all" id="mobileMenuPanel">
          <div class="px-4 py-3 space-y-1 max-h-[60vh] overflow-y-auto custom-scrollbar" id="mobileMenu"></div>
          <div class="p-4 border-t border-slate-100 flex justify-between items-center bg-slate-50">
             <div>
               <div class="text-sm font-bold text-slate-700" id="mobileUserName">Name</div>
               <div class="text-[0.65rem] uppercase tracking-wider text-indigo-600 font-bold" id="mobileRole">Role</div>
             </div>
             <button onclick="window.app.logout()" class="px-4 py-2 bg-white border border-slate-200 text-rose-500 hover:bg-rose-50 rounded-xl text-sm font-bold transition-colors shadow-sm">
                 <i class="fas fa-sign-out-alt mr-2"></i> ออกจากระบบ
             </button>
          </div>
        </div>
      </nav>
      
      <main class="flex-1 w-full max-w-[1600px] mx-auto p-4 md:p-6 lg:p-8 animate-fade-in" id="page-content"></main>
      
      <footer class="bg-white border-t border-slate-200 mt-auto w-full">
         <div class="max-w-[1600px] mx-auto py-6 px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center">
            <p class="text-slate-400 text-sm">© 2026 Mobile Pre Order System System. All rights reserved.</p>
            <p class="text-slate-400 text-sm mt-2 md:mt-0 flex items-center"><i class="fas fa-shield-alt text-indigo-400 mr-2"></i> Secure Enterprise Portal</p>
         </div>
      </footer>

      <div id="popupBannerModal" class="fixed inset-0 z-[100] hidden">
        <div class="fixed inset-0 bg-slate-900/80 backdrop-blur-sm transition-opacity" onclick="window.app.closePopupBanner()"></div>
        <div class="fixed inset-0 z-10 overflow-y-auto">
          <div class="flex min-h-full items-center justify-center p-4 text-center">
            <div class="relative transform overflow-hidden rounded-3xl bg-transparent text-left shadow-2xl transition-all w-full max-w-3xl flex flex-col items-center animate-fade-in-up">
              <div class="w-full flex justify-end mb-3">
                 <button type="button" class="w-10 h-10 bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-full text-white flex items-center justify-center transition-all shadow-md focus:outline-none" onclick="window.app.closePopupBanner()">
                   <i class="fas fa-times text-xl"></i>
                 </button>
              </div>
              <div id="popupBannerContent" class="w-full flex flex-col gap-4 max-h-[80vh] overflow-y-auto custom-scrollbar rounded-2xl">
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </template>

  <template id="tmpl-dashboard">
    <div class="space-y-6">
        
        <div id="dashHeroWrap" class="w-full h-[30vh] md:h-[40vh] rounded-3xl overflow-hidden shadow-md relative group mb-6 hidden bg-slate-200">
            <div id="sliderTrack" class="flex w-full h-full transition-transform duration-700 ease-in-out"></div>
            <button onclick="window.app.dashboard.slider.prev()" class="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/30 hover:bg-white/90 backdrop-blur-md rounded-full text-slate-800 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-md focus:outline-none"><i class="fas fa-chevron-left"></i></button>
            <button onclick="window.app.dashboard.slider.next()" class="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/30 hover:bg-white/90 backdrop-blur-md rounded-full text-slate-800 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-md focus:outline-none"><i class="fas fa-chevron-right"></i></button>
            <div id="sliderDots" class="absolute bottom-4 left-1/2 -translate-x-1/2 flex space-x-2"></div>
        </div>

        <div id="dashPromoGridWrap" class="hidden">
            <div class="flex items-center mb-4 pl-1">
                <i class="fas fa-bolt text-amber-500 mr-2 text-xl"></i>
                <h2 class="font-black text-xl text-slate-800 tracking-tight">แคมเปญสุดพิเศษ</h2>
            </div>
            <div id="dashPromoGrid" class="grid grid-cols-1 md:grid-cols-3 gap-6"></div>
        </div>

        <div class="bg-white border border-slate-200 shadow-sm rounded-2xl p-4">
          <div class="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div class="flex items-center gap-2 w-full md:w-auto">
              <i class="far fa-calendar-alt text-indigo-500"></i>
              <input type="date" class="border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" id="dashStartDate" onchange="window.app.dashboard.applyFilters()">
              <span class="text-slate-400">-</span>
              <input type="date" class="border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" id="dashEndDate" onchange="window.app.dashboard.applyFilters()">
            </div>
            
            <div class="flex flex-wrap md:flex-nowrap gap-4 items-center w-full md:w-auto">
                <div class="flex items-center gap-2 admin-filter">
                  <i class="fas fa-store text-indigo-500"></i>
                  <select class="border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" id="dashBranch" onchange="window.app.dashboard.applyFilters()"><option value="ALL">ทุกสาขา</option></select>
                </div>
                <div class="flex items-center gap-2 admin-filter">
                  <i class="fas fa-user-tie text-indigo-500"></i>
                  <select class="border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" id="dashSales" onchange="window.app.dashboard.applyFilters()"><option value="ALL">ทุกคน</option></select>
                </div>
            </div>

            <div class="flex items-center gap-2 w-full md:w-auto justify-end">
              <span id="dashSyncStatus" class="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200"><i class="fas fa-sync fa-spin text-indigo-500 mr-1.5"></i> Live</span>
              <button class="w-9 h-9 flex items-center justify-center text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm transition-colors" onclick="window.app.dashboard.resetFilters()"><i class="fas fa-undo"></i></button>
              <button class="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 font-bold border border-indigo-100 rounded-xl hover:bg-indigo-100 transition-colors text-sm shadow-sm" onclick="window.app.dashboard.exportCSV()"><i class="fas fa-file-csv"></i> Export</button>
            </div>
          </div>
        </div>
        
        <div class="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
          <div class="kpi-gradient-total border border-slate-100 shadow-sm rounded-2xl p-5 text-center transform transition hover:-translate-y-1 hover:shadow-md"><p class="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2"><i class="fas fa-coins text-indigo-500 mr-1.5 opacity-80"></i>ยอดขายรวม</p><h3 class="text-xl md:text-2xl font-black text-indigo-600 truncate" id="dashKpiTotal">฿0</h3></div>
          <div class="kpi-gradient-mob border border-slate-100 shadow-sm rounded-2xl p-5 text-center transform transition hover:-translate-y-1 hover:shadow-md"><p class="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2"><i class="fas fa-mobile-alt text-emerald-600 mr-1.5 opacity-80"></i>ยอดจองโมบาย</p><h3 class="text-xl md:text-2xl font-black text-slate-800 truncate" id="dashKpiMobiles">0</h3></div>
          <div class="kpi-gradient-acc border border-slate-100 shadow-sm rounded-2xl p-5 text-center transform transition hover:-translate-y-1 hover:shadow-md"><p class="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2"><i class="fas fa-headphones text-slate-600 mr-1.5 opacity-80"></i>ยอดจองอุปกรณ์เสริม</p><h3 class="text-xl md:text-2xl font-black text-slate-800 truncate" id="dashKpiAccessories">0</h3></div>
          <div class="kpi-gradient-resT border border-slate-100 shadow-sm rounded-2xl p-5 text-center transform transition hover:-translate-y-1 hover:shadow-md"><p class="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2"><i class="fas fa-calendar-check text-amber-500 mr-1.5 opacity-80"></i>ยอดจอง T</p><h3 class="text-xl md:text-2xl font-black text-amber-500 truncate" id="dashKpiResT">0</h3></div>
          <div class="kpi-gradient-resF border border-slate-100 shadow-sm rounded-2xl p-5 text-center transform transition hover:-translate-y-1 hover:shadow-md"><p class="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2"><i class="fas fa-calendar-check text-blue-500 mr-1.5 opacity-80"></i>ยอดจอง F</p><h3 class="text-xl md:text-2xl font-black text-blue-600 truncate" id="dashKpiResF">0</h3></div>
          <div class="kpi-gradient-aov border border-slate-100 shadow-sm rounded-2xl p-5 text-center transform transition hover:-translate-y-1 hover:shadow-md"><p class="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2"><i class="fas fa-receipt text-purple-500 mr-1.5 opacity-80"></i>เฉลี่ยต่อบิล</p><h3 class="text-xl md:text-2xl font-black text-slate-800 truncate" id="dashKpiAov">฿0</h3></div>
          <div class="kpi-gradient-conv border border-slate-100 shadow-sm rounded-2xl p-5 text-center transform transition hover:-translate-y-1 hover:shadow-md"><p class="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2"><i class="fas fa-percentage text-emerald-500 mr-1.5 opacity-80"></i>อัตราปิดการขาย</p><h3 class="text-xl md:text-2xl font-black text-emerald-600 truncate" id="dashKpiConv">0%</h3></div>
        </div>

        <!-- Section 1: Sales Trends & Performance -->
        <div class="flex items-center gap-3 pt-6 pb-2 border-b border-slate-200 mb-6">
           <div class="w-1.5 h-6 bg-indigo-600 rounded-full"></div>
           <h4 class="font-extrabold text-base text-slate-800 tracking-tight flex items-center gap-2">
             <i class="fas fa-chart-line text-indigo-500"></i> วิเคราะห์แนวโน้มยอดจองและผลงาน
           </h4>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
           <div class="bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] p-6 hover:shadow-md transition-shadow">
             <h6 class="font-bold text-slate-800 text-sm mb-4 flex items-center"><i class="fas fa-chart-line text-indigo-500 mr-2"></i>แนวโน้มยอดจองรายวัน (เครื่อง)</h6>
             <div class="relative w-full h-[300px]"><canvas id="chartSalesTrend"></canvas></div>
           </div>
           <div class="bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] p-6 hover:shadow-md transition-shadow">
             <h6 class="font-bold text-slate-800 text-sm mb-4 flex items-center"><i class="fas fa-chart-bar text-indigo-500 mr-2"></i>เปรียบเทียบยอดจองรายสัปดาห์ (Week vs Week)</h6>
             <div class="relative w-full h-[300px]"><canvas id="chartWeeklyTrend"></canvas></div>
           </div>
        </div>
        
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
           <div class="lg:col-span-2 bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] p-6 hover:shadow-md transition-shadow admin-filter">
               <h6 class="font-bold text-slate-800 text-sm mb-4 flex items-center"><i class="fas fa-store text-indigo-500 mr-2"></i>10 อันดับสาขาที่มียอดจองดีที่สุด (จำนวนเครื่อง)</h6>
               <div class="relative w-full h-[300px]"><canvas id="chartTopBranches"></canvas></div>
           </div>
           <div class="bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] p-6 hover:shadow-md transition-shadow">
               <h6 class="font-bold text-slate-800 text-sm mb-4 flex items-center"><i class="fas fa-user-tie text-indigo-500 mr-2"></i>อันดับพนักงานขาย</h6>
               <div class="relative w-full h-[300px]"><canvas id="chartSalesRank"></canvas></div>
           </div>
        </div>

        <!-- Section 2: Products & Campaigns -->
        <div class="flex items-center gap-3 pt-6 pb-2 border-b border-slate-200 mb-6">
           <div class="w-1.5 h-6 bg-emerald-500 rounded-full"></div>
           <h4 class="font-extrabold text-base text-slate-800 tracking-tight flex items-center gap-2">
             <i class="fas fa-mobile-alt text-emerald-500"></i> เจาะลึกแคมเปญสินค้าและพฤติกรรมลูกค้า
           </h4>
        </div>

        <div class="bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] p-6 hover:shadow-md transition-shadow mb-6">
           <h6 class="font-bold text-slate-800 text-sm mb-4 flex items-center"><i class="fas fa-layer-group text-indigo-500 mr-2"></i>การวิเคราะห์โมเดลสินค้ายอดนิยม (รวมความจุ)</h6>
           <div class="relative w-full h-[350px]"><canvas id="chartModelAdvanced"></canvas></div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8"><div class="p-6 bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]"><div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6"><h6 class="font-bold text-slate-800 text-sm md:text-base flex items-center"><i class="fas fa-mobile-alt text-indigo-500 mr-2"></i>ช่องทางที่ขายดี (โมบาย)</h6></div><div class="relative w-full h-[400px]"><canvas id="chartChannelModelMobile"></canvas></div></div><div class="p-6 bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]"><div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6"><h6 class="font-bold text-slate-800 text-sm md:text-base flex items-center"><i class="fas fa-headphones text-pink-500 mr-2"></i>ช่องทางที่ขายดี (อุปกรณ์เสริม)</h6></div><div class="relative w-full h-[400px]"><canvas id="chartChannelModelAcc"></canvas></div></div></div>
        
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
           <div class="bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] p-6 hover:shadow-md transition-shadow">
             <h6 class="font-bold text-slate-800 text-sm mb-4 flex items-center"><i class="fas fa-tags text-indigo-500 mr-2"></i>โปรโมชั่นที่นิยม (บิล)</h6>
             <div class="relative w-full h-[250px]"><canvas id="chartPromotionsBar"></canvas></div>
           </div>
           <div class="bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] p-6 hover:shadow-md transition-shadow">
             <h6 class="font-bold text-slate-800 text-sm mb-4 flex items-center"><i class="fas fa-gift text-indigo-500 mr-2"></i>สรุปของแถมทั้งหมด (ชิ้น)</h6>
             <div class="relative w-full h-[250px]"><canvas id="chartGifts"></canvas></div>
           </div>
           <div class="bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] overflow-hidden hover:shadow-md transition-shadow flex flex-col h-full">
             <div class="bg-slate-50 border-b border-slate-200 p-4 shrink-0"><h6 class="font-bold text-slate-800 text-sm mb-0 flex items-center"><i class="fas fa-users text-indigo-500 mr-2"></i>สรุปสัดส่วนความสนใจของลูกค้า</h6></div>
             <div class="overflow-y-auto custom-scrollbar flex-1 max-h-[250px]">
                 <table class="w-full text-xs text-left whitespace-nowrap">
                    <tbody id="tableInterestsBody" class="divide-y divide-slate-100"></tbody>
                 </table>
             </div>
           </div>
        </div>

        <!-- Section 3: Branch Dimensions & Regions -->
        <div class="flex items-center gap-3 pt-6 pb-2 border-b border-slate-200 mb-6 admin-filter">
           <div class="w-1.5 h-6 bg-amber-500 rounded-full"></div>
           <h4 class="font-extrabold text-base text-slate-800 tracking-tight flex items-center gap-2">
             <i class="fas fa-map-marked-alt text-amber-500"></i> วิเคราะห์มิติสาขาและภูมิภาค (Demographics)
           </h4>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8 admin-filter">
           <div class="bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] p-5 hover:shadow-md transition-shadow"><h6 class="font-bold text-slate-800 text-sm mb-4 truncate flex items-center"><i class="fas fa-shopping-bag text-indigo-500 mr-2"></i>ยอดจองตาม Mall</h6><div class="relative w-full h-[200px]"><canvas id="chartMall"></canvas></div></div>
           <div class="bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] p-5 hover:shadow-md transition-shadow"><h6 class="font-bold text-slate-800 text-sm mb-4 truncate flex items-center"><i class="fas fa-map-marked-alt text-indigo-500 mr-2"></i>ยอดจองตาม Region</h6><div class="relative w-full h-[200px]"><canvas id="chartRegion"></canvas></div></div>
           <div class="bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] p-5 hover:shadow-md transition-shadow"><h6 class="font-bold text-slate-800 text-sm mb-4 truncate flex items-center"><i class="fas fa-map-marker-alt text-indigo-500 mr-2"></i>ยอดจองตาม Province</h6><div class="relative w-full h-[200px]"><canvas id="chartProvince"></canvas></div></div>
           <div class="bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] p-5 hover:shadow-md transition-shadow"><h6 class="font-bold text-slate-800 text-sm mb-4 truncate flex items-center"><i class="fas fa-network-wired text-indigo-500 mr-2"></i>ยอดจองตาม Type Name</h6><div class="relative w-full h-[200px]"><canvas id="chartType"></canvas></div></div>
        </div>
    </div>
  </template>

  <template id="tmpl-pos">
    <div class="flex flex-col lg:h-full gap-4 pb-8 lg:pb-0 relative">
      <!-- Floating Cart Button (FAB) -->
      <button onclick="window.app.pos.toggleCart()" class="fixed bottom-6 right-6 lg:bottom-10 lg:right-10 z-[40] bg-indigo-600 text-white rounded-full w-16 h-16 shadow-[0_10px_25px_rgba(79,70,229,0.5)] hover:bg-indigo-700 hover:scale-105 transition-all flex items-center justify-center group border-2 border-white">
         <i class="fas fa-shopping-cart text-2xl group-hover:animate-bounce"></i>
         <span id="floatingCartCount" class="absolute -top-1 -right-1 bg-rose-500 text-white text-xs font-black w-7 h-7 rounded-full flex items-center justify-center shadow-md border-2 border-white">0</span>
      </button>

      <!-- Off-canvas Cart Overlay -->
      <div id="cartOverlay" class="fixed top-16 inset-x-0 bg-slate-900/60 backdrop-blur-sm z-[40] hidden transition-opacity opacity-0" style="height: calc(100dvh - 64px);" onclick="window.app.pos.toggleCart()"></div>
      
      <div class="flex-1 flex flex-col bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] p-4 md:p-6 overflow-hidden relative h-[65vh] lg:h-full shrink-0 lg:shrink">
          <!-- Countdown Timer Banner -->
          <div id="posTimerBanner" class="hidden mb-4 p-4 rounded-2xl bg-gradient-to-r from-indigo-50 via-slate-50 to-indigo-50 border border-indigo-100/80 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
             <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
                   <i class="fas fa-hourglass-half text-lg"></i>
                </div>
                <div>
                   <h4 class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">ระยะเวลาจองสินค้า</h4>
                   <p id="posTimerPeriodText" class="text-xs font-bold text-slate-700">-</p>
                </div>
             </div>
             <div class="flex items-center gap-2">
                <span class="text-[10px] font-bold text-indigo-600 mr-2 uppercase tracking-wide" id="posTimerBadge">เหลือเวลาจอง</span>
                <div class="flex items-center gap-1.5" id="posTimerCountdownDisplay"></div>
             </div>
          </div>

          <div class="flex flex-col md:flex-row gap-4 mb-6 z-10 shrink-0">
              <div class="flex-1 w-full relative">
                <label class="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">ช่องทางการขาย</label>
                <select class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-all" id="posChannelSelect" onchange="window.app.pos.onChannelChange()"><option value="">-- เลือกช่องทาง --</option></select>
              </div>
              <div class="flex-1 w-full relative">
                <label class="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">สาขาที่ทำรายการ</label>
                <select class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-all" id="posBranchSelect" onchange="window.app.pos.checkCriteria()"><option value="">-- เลือกช่องทางก่อน --</option></select>
              </div>
          </div>
          
          <div class="flex-1 flex flex-col relative overflow-hidden">
              <div id="criteriaOverlay" class="absolute inset-0 bg-white/90 backdrop-blur-sm flex items-center justify-center z-20 rounded-2xl transition-opacity duration-300">
                  <div class="text-center px-4">
                      <i class="fas fa-store-slash text-4xl text-slate-300 mb-3"></i>
                      <h3 class="text-lg font-bold text-slate-700">กรุณาเลือกสาขาเพื่อเริ่มการทำรายการ</h3>
                  </div>
              </div>

              <div id="bookingBlockOverlay" class="absolute inset-0 bg-white/95 backdrop-blur-sm flex items-center justify-center z-30 rounded-2xl transition-opacity duration-300 hidden opacity-0">
                  <div class="text-center px-4">
                      <div class="w-16 h-16 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-4 border border-rose-100 shadow-sm animate-pulse">
                          <i class="fas fa-lock text-2xl"></i>
                      </div>
                      <h3 class="text-lg font-black text-slate-800" id="bookingBlockTitle">สิ้นสุดระยะเวลารับจองสินค้าแล้ว</h3>
                      <p class="text-xs text-slate-500 mt-2 font-medium">ไม่สามารถทำรายการคีย์ข้อมูลจองสินค้า หรือชำระเงินได้ในขณะนี้</p>
                  </div>
              </div>
              
              <div class="relative mb-6 shrink-0">
                  <i class="fas fa-search absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400"></i>
                  <input type="text" class="w-full pl-12 pr-4 py-3 bg-slate-100 border-transparent rounded-2xl text-sm font-medium focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all outline-none shadow-inner" id="searchProduct" placeholder="ค้นหาชื่อสินค้าที่ต้องการ..." onkeyup="window.app.pos.filter()">
              </div>
              <div class="flex-1 overflow-y-auto custom-scrollbar pr-2" id="productGrid"></div>
          </div>
      </div>

      <!-- Off-canvas Cart Drawer -->
      <div id="cartDrawer" class="fixed top-16 right-0 z-[45] w-full sm:w-[400px] lg:w-[450px] max-w-full bg-white shadow-2xl transform translate-x-full transition-transform duration-300 flex flex-col" style="height: calc(100dvh - 64px); padding-bottom: env(safe-area-inset-bottom);">
          <div class="bg-indigo-600 text-white p-5 flex justify-between items-center z-10 shrink-0">
              <div class="flex items-center">
                  <i class="fas fa-shopping-cart mr-2 opacity-80 text-lg"></i>
                  <h3 class="font-bold text-lg tracking-wide">ตะกร้าออเดอร์</h3>
                  <span class="ml-3 bg-white text-indigo-700 text-sm font-black px-3 py-1 rounded-full shadow-sm" id="cartCount">0</span>
              </div>
              <button onclick="window.app.pos.toggleCart()" class="text-white hover:text-indigo-200 transition p-1"><i class="fas fa-times text-xl"></i></button>
          </div>
          
          <div class="flex-1 overflow-y-auto p-4 bg-slate-50 custom-scrollbar" id="cartItems"></div>
          
          <div class="bg-white p-4 border-t border-slate-100 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.02)] z-10 shrink-0">
              <div id="cartPromosContainer" class="space-y-2 mb-2 max-h-24 overflow-y-auto custom-scrollbar pr-1">
                 <!-- Dropdowns populated dynamically -->
              </div>
              <button type="button" onclick="window.app.pos.addPromoRow()" class="w-full py-2 border border-dashed border-slate-200 text-indigo-600 hover:text-indigo-700 hover:bg-slate-50 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 mb-3 shadow-sm">
                 <i class="fas fa-plus"></i> เพิ่มส่วนลดท้ายบิล
              </button>
              <div class="space-y-1.5 mb-3">
                  <div class="flex justify-between text-xs text-slate-400 font-bold">
                      <span>ยอดรวมก่อนลด</span>
                      <span id="cartSubtotal" class="text-slate-600">฿0.00</span>
                  </div>
                  <div class="flex justify-between text-xs text-rose-500 font-bold bg-rose-50 px-2.5 py-1 rounded-md">
                      <span>ส่วนลด</span>
                      <span id="cartDiscount">-฿0.00</span>
                  </div>
              </div>
              <div class="flex justify-between items-center border-t border-slate-200 pt-2.5 mb-4">
                  <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">ยอดสุทธิ</span>
                  <span class="text-xl font-black text-indigo-600 tracking-tight" id="cartTotal">฿0.00</span>
              </div>
              <button class="w-full bg-slate-900 hover:bg-black text-white text-sm font-bold py-3 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center group" onclick="window.app.pos.openCheckoutModal()">
                  ดำเนินการข้อมูลลูกค้า <i class="fas fa-arrow-right ml-2 opacity-70 group-hover:translate-x-1 transition-transform"></i>
              </button>
          </div>
      </div>
    </div>

    <div id="addToCartModal" class="fixed inset-0 z-[60] hidden">
      <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onclick="window.app.hideModal('addToCartModal')"></div>
      
      <div class="fixed inset-0 z-10 overflow-y-auto">
        <div class="flex min-h-full items-center justify-center p-4 text-center">
          <div class="relative transform overflow-hidden rounded-3xl bg-white text-left shadow-2xl transition-all w-full max-w-4xl border border-slate-100 flex flex-col max-h-[90vh]">
            
            <div class="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
               <h3 class="text-base font-bold text-slate-800"><i class="fas fa-check-circle text-indigo-500 mr-2"></i>ยืนยันรายละเอียดสินค้า</h3>
               <button type="button" class="text-slate-400 hover:text-rose-500 focus:outline-none transition-colors" onclick="window.app.hideModal('addToCartModal')"><i class="fas fa-times text-xl"></i></button>
            </div>
            
            <div class="p-6 md:p-8 overflow-y-auto custom-scrollbar flex-1 bg-white">
               
               <div class="flex flex-col md:flex-row gap-6 md:gap-8 mb-6">
                  <!-- Left side: Image -->
                  <div class="w-full md:w-4/12 flex flex-col justify-start items-center shrink-0">
                     <div class="w-full max-w-[300px] aspect-square p-4 bg-white border border-slate-100 rounded-3xl shadow-sm flex items-center justify-center sticky top-0 hover:shadow-md transition-shadow relative group overflow-hidden cursor-zoom-in">
                        <img id="modalProdImg" src="" class="max-h-full max-w-full object-contain drop-shadow-md transition-transform duration-500 hover:scale-[1.5]">
                        <button id="btnPrevImg" onclick="window.app.pos.prevImage(event)" class="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/90 rounded-full shadow-md hover:bg-white text-slate-600 hover:text-indigo-600 flex items-center justify-center hidden opacity-0 group-hover:opacity-100 transition-opacity z-10"><i class="fas fa-chevron-left"></i></button>
                        <button id="btnNextImg" onclick="window.app.pos.nextImage(event)" class="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/90 rounded-full shadow-md hover:bg-white text-slate-600 hover:text-indigo-600 flex items-center justify-center hidden opacity-0 group-hover:opacity-100 transition-opacity z-10"><i class="fas fa-chevron-right"></i></button>
                     </div>
                     <div id="modalThumbnails" class="flex gap-2 justify-center w-full max-w-[240px] mx-auto overflow-x-auto p-1 mt-3 hidden"></div>
                  </div>
                  
                  <!-- Right side: Details & Variants -->
                  <div class="w-full md:w-8/12 flex flex-col">
                     <div class="mb-5 md:mb-6">
                        <h4 id="modalProdName" class="font-black text-slate-800 mb-1.5 md:mb-2 leading-tight text-sm md:text-base"></h4>
                        <div class="text-lg md:text-xl font-black text-indigo-600" id="modalProdPrice"></div>
                        <input type="hidden" id="modalProdSKU">
                     </div>
                     
                     <div id="modalVariantSelection" class="mb-5 md:mb-6 hidden text-left bg-slate-50 p-4 md:p-5 rounded-2xl border border-slate-100">
                        <div class="mb-4">
                           <label class="block text-[9px] md:text-[10px] font-bold text-slate-500 mb-2 md:mb-3 uppercase tracking-wider"><i class="fas fa-hdd text-indigo-500 mr-1"></i> ความจุ (Capacity)</label>
                           <div id="modalCapacityOptions" class="flex flex-wrap gap-2"></div>
                        </div>
                        <div>
                           <label class="block text-[9px] md:text-[10px] font-bold text-slate-500 mb-2 md:mb-3 uppercase tracking-wider"><i class="fas fa-palette text-indigo-500 mr-1"></i> สี (Color)</label>
                           <div id="modalColorOptions" class="flex flex-wrap gap-2"></div>
                        </div>
                     </div>
                     
                     <div class="bg-slate-50 p-2.5 md:p-3 rounded-xl border border-slate-100 mt-auto flex flex-col gap-1.5 md:gap-2">
                        <label class="block text-[9px] md:text-[10px] font-bold text-slate-500 uppercase tracking-wider">ระบุจำนวน <span class="font-medium text-slate-400 ml-1" id="modalProdStock"></span></label>
                        <div class="flex items-center gap-2">
                            <input type="number" class="w-[38px] text-center font-black text-[10px] md:text-[12px] text-slate-800 bg-white border border-slate-200 rounded-lg py-1 px-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm" id="modalProdQty" value="1" min="1">
                            <span class="text-[9px] md:text-[10px] font-bold text-slate-400">ชิ้น</span>
                        </div>
                     </div>
                  </div>
               </div>
               
               <div class="flex items-center gap-3 mb-4 md:mb-5">
                   <div class="flex-1 h-px bg-slate-100"></div>
                   <h5 class="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider"><i class="fas fa-gifts text-indigo-400 mr-1"></i> ของแถมที่ได้รับ</h5>
                   <div class="flex-1 h-px bg-slate-100"></div>
               </div>
               
               <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div class="bg-emerald-50/30 p-3 md:p-4 rounded-2xl border border-emerald-100/50">
                      <label class="block text-[9px] md:text-[10px] font-bold text-emerald-600 mb-2 md:mb-3 uppercase tracking-wider"><i class="fas fa-gem mr-1.5"></i> ของแถมจากแบรนด์</label>
                      <div id="modalBrandGifts" class="space-y-1.5 pr-1"></div>
                   </div>
                   
                   <div class="bg-indigo-50/30 p-3 md:p-4 rounded-2xl border border-indigo-100/50">
                      <label class="block text-[9px] md:text-[10px] font-bold text-indigo-600 mb-2 md:mb-3 uppercase tracking-wider"><i class="fas fa-store mr-1.5"></i> ของแถมจากช่องทาง</label>
                      <div id="modalChannelGifts" class="space-y-1.5 pr-1"></div>
                   </div>
               </div>
            </div>
            
            <div class="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 rounded-b-3xl">
               <button type="button" class="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 text-sm font-bold rounded-xl hover:bg-slate-100 transition-colors shadow-sm" onclick="window.app.hideModal('addToCartModal')">ยกเลิก</button>
               <button type="button" class="px-6 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl shadow-md hover:bg-indigo-700 transition-colors" onclick="window.app.pos.confirmAddToCart()">เพิ่มลงตะกร้า</button>
            </div>
            
          </div>
        </div>
      </div>
    </div>

    <!-- Modal บันทึกใบจอง -->
    <div id="checkoutModal" class="fixed inset-0 z-[60] hidden">
      <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onclick="window.app.hideModal('checkoutModal')"></div>
      
      <div class="fixed inset-0 z-10 overflow-y-auto py-6">
        <div class="flex min-h-full items-center justify-center px-4 text-center">
          <div class="relative transform overflow-hidden rounded-3xl bg-slate-50 text-left shadow-2xl transition-all w-full max-w-5xl flex flex-col max-h-[90vh]">
            
            <div class="px-8 py-5 flex justify-between items-center bg-slate-900 text-white">
               <h3 class="text-lg font-bold tracking-wide"><i class="fas fa-file-invoice mr-2 opacity-80"></i>ข้อมูลลูกค้า</h3>
               <button type="button" class="text-white/50 hover:text-white focus:outline-none transition-colors" onclick="window.app.hideModal('checkoutModal')"><i class="fas fa-times text-2xl"></i></button>
            </div>
            
            <div class="p-5 md:p-6 overflow-y-auto custom-scrollbar flex-1 space-y-5 md:space-y-0 md:grid md:grid-cols-12 md:gap-5">
              
              <!-- Left Column: Customer & Interests -->
              <div class="md:col-span-7 flex flex-col gap-5">
                  <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                     <h4 class="text-sm font-bold text-slate-800 mb-4 flex items-center"><i class="fas fa-user-circle text-indigo-500 mr-2 text-lg"></i> ข้อมูลลูกค้า</h4>
                     <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div><label class="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">ชื่อ-นามสกุล <span class="text-rose-500">*</span></label><input type="text" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors" id="coCustomer" required></div>
                        <div><label class="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">เบอร์โทรศัพท์ <span class="text-rose-500">*</span></label><input type="tel" maxlength="10" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors" id="coPhone" required></div>
                        <div><label class="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">อีเมล (Email) <span class="text-rose-500">*</span></label><input type="email" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors" id="coEmail" required></div>
                        <div><label class="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">บัตรประชาชน / Passport <span class="text-rose-500">*</span></label><input type="text" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors" id="coIdCard" required></div>
                        <div class="sm:col-span-2"><label class="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">รหัสลงทะเบียน (Code Handraiser)</label><input type="text" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors" id="coCodeHandraiser" placeholder="เว้นว่างได้ถ้าไม่มี"></div>
                     </div>
                  </div>
    
                  <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex-1">
                     <h4 class="text-sm font-bold text-slate-800 mb-3 flex items-center"><i class="fas fa-heart text-rose-500 mr-2 text-lg"></i> ความสนใจและพฤติกรรมลูกค้า</h4>
                     <div id="dynamicInterests" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2"></div>
                  </div>
              </div>
              
              <!-- Right Column: Conditions & Remarks -->
              <div class="md:col-span-5 bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
                 <h4 class="text-sm font-bold text-slate-800 mb-4 flex items-center"><i class="fas fa-file-contract text-emerald-500 mr-2 text-lg"></i> เงื่อนไขและหมายเหตุ</h4>
                 
                 <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                    <label class="block text-xs font-bold text-amber-800 mb-2">ประเภทสิทธิ์การจอง <span class="text-rose-500">*</span></label>
                    <div class="space-y-2">
                       <label class="flex items-center cursor-pointer p-2 bg-white border border-amber-100 rounded-lg hover:bg-amber-100/50 transition-colors">
                          <input type="radio" name="resStatus" id="radResT" value="จอง T (มีการจอง)" class="w-4 h-4 text-amber-600 bg-white border-slate-300 focus:ring-amber-500">
                          <span class="ml-2 text-xs font-bold text-slate-800">จอง T <span class="font-normal text-slate-500 ml-1">(มัดจำจองจริง)</span></span>
                       </label>
                       <label class="flex items-center cursor-pointer p-2 bg-white border border-amber-100 rounded-lg hover:bg-amber-100/50 transition-colors">
                          <input type="radio" name="resStatus" id="radResF" value="จอง F (สวมสิทธิ์การจอง)" class="w-4 h-4 text-amber-600 bg-white border-slate-300 focus:ring-amber-500">
                          <span class="ml-2 text-xs font-bold text-slate-800">จอง F <span class="font-normal text-slate-500 ml-1">(สวมสิทธิ์แคมเปญ)</span></span>
                       </label>
                    </div>
                 </div>
                 
                 <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div><label class="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">พนักงานรับจอง <span class="text-rose-500">*</span></label><input type="text" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors" id="bkStaffName" required></div>
                    <div><label class="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">เบอร์พนักงาน <span class="text-rose-500">*</span></label><input type="tel" maxlength="10" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors" id="bkPhone" required></div>
                 </div>
                 <div class="flex-1 flex flex-col">
                    <label class="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">หมายเหตุ / ข้อมูลเพิ่มเติม</label>
                    <textarea class="w-full flex-1 min-h-[80px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors custom-scrollbar" id="coRemark" placeholder="ระบุหมายเหตุ..."></textarea>
                 </div>
              </div>

            </div>
            
            <div class="px-8 py-5 bg-white border-t border-slate-200 flex justify-between items-center rounded-b-3xl">
               <button type="button" class="px-5 py-3 text-slate-500 font-bold hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors text-sm" onclick="window.app.hideModal('checkoutModal')">ย้อนกลับ</button>
               <button type="button" class="px-8 py-3 bg-slate-900 text-white font-bold rounded-xl shadow-lg hover:bg-black hover:shadow-xl transition-all flex items-center" onclick="window.app.pos.submitCheckout()">
                  ยืนยันการสั่งจอง <i class="fas fa-check-circle ml-2"></i>
               </button>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  </template>

  <template id="tmpl-datagrid">
    <div class="bg-white/80 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] flex flex-col overflow-hidden mb-8">
      <div class="bg-white border-b border-slate-200 p-5 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div class="relative w-full sm:w-1/2 md:w-1/3">
           <i class="fas fa-search absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400"></i>
           <input type="text" class="w-full pl-11 pr-4 py-2.5 bg-slate-100 border-transparent rounded-xl text-sm font-medium focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all outline-none" id="gridSearch" placeholder="พิมพ์เพื่อค้นหาข้อมูล..." onkeyup="window.app.grid.filter()">
        </div>
        <button class="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-md transition-colors flex items-center justify-center" id="gridAddBtn" onclick="window.app.grid.openForm()">
           <i class="fas fa-plus mr-2"></i> เพิ่มข้อมูล
        </button>
      </div>
      
      <div class="w-full overflow-x-auto custom-scrollbar max-h-[75vh]">
        <table class="w-full min-w-[1000px] text-left border-collapse whitespace-nowrap" id="dataTable">
          <thead id="dataGridHead" class="bg-slate-50 border-b border-slate-200 relative z-20"></thead>
          <tbody id="dataGridBody" class="divide-y divide-slate-100 bg-white relative z-0"></tbody>
        </table>
      </div>
    </div>

    <div id="formModal" class="fixed inset-0 z-[60] hidden">
      <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onclick="window.app.hideModal('formModal')"></div>
      <div class="fixed inset-0 z-10 overflow-y-auto py-6">
        <div class="flex min-h-full items-center justify-center px-4 text-center">
          <div class="relative transform overflow-hidden rounded-3xl bg-white text-left shadow-2xl transition-all w-full max-w-4xl flex flex-col">
            
            <div class="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
               <h3 class="text-lg font-bold text-slate-800" id="formModalTitle">จัดการข้อมูล</h3>
               <button type="button" class="text-slate-400 hover:text-rose-500 focus:outline-none transition-colors" onclick="window.app.hideModal('formModal')"><i class="fas fa-times text-xl"></i></button>
            </div>
            
            <div class="p-5 md:p-6 overflow-y-auto custom-scrollbar bg-white" style="max-height: 80vh;">
               <form id="dynamicForm" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4"></form>
            </div>
            
            <div class="px-8 py-5 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 rounded-b-3xl">
               <button type="button" class="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 text-sm font-bold rounded-xl hover:bg-slate-100 transition-colors shadow-sm" onclick="window.app.hideModal('formModal')">ยกเลิก</button>
               <button type="button" class="px-6 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl shadow-md hover:bg-indigo-700 transition-colors flex items-center" onclick="window.app.grid.saveForm()"><i class="fas fa-save mr-2"></i> บันทึกข้อมูล</button>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  </template>

  <?!= include('JS'); ?>
</body>
</html>







``n
### File: src/JS.html
`$lang
<script>
window.app = {
  user: null,
  globalData: { products: [], promotions: [], branches: [], channels: [], interests: [], heroBanners: [], gridBanners: [], popupBanners: [], giftMappings: [] },
  cart: [],
  currentRoute: '',

  menuConfig: [
      { id: 'dashboard', icon: 'fa-tachometer-alt', label: 'Dashboard', roles: ['Admin', 'Manager', 'Sales'] },
      { id: 'pos', icon: 'fa-shopping-cart', label: 'POS', roles: ['Admin', 'Manager', 'Sales'] },
      { id: 'orders', icon: 'fa-file-invoice-dollar', label: 'Orders', roles: ['Admin', 'Manager', 'Sales'] },
      { 
        id: 'admin_settings', icon: 'fa-cogs', label: 'ตั้งค่าระบบ', roles: ['Admin', 'Manager'],
        isParent: true,
        children: [
          { id: 'loginbg', icon: 'fa-image', label: 'Login BG', roles: ['Admin'] },
          { id: 'herobanners', icon: 'fa-images', label: 'Hero Banners', roles: ['Admin'] },
          { id: 'promogrids', icon: 'fa-th-large', label: 'Promo Grid', roles: ['Admin'] },
          { id: 'popupbanners', icon: 'fa-window-maximize', label: 'Popup Banner', roles: ['Admin'] },
          { id: 'bookingsettings', icon: 'fa-clock', label: 'ตั้งเวลารับจองสินค้า', roles: ['Admin'] },
          { id: 'products', icon: 'fa-box-open', label: 'Products', roles: ['Admin'] },
          { id: 'giftmappings', icon: 'fa-project-diagram', label: 'Gift Setup', roles: ['Admin', 'Manager'] }, 
          { id: 'promotions', icon: 'fa-tags', label: 'Promotions', roles: ['Admin'] },
          { id: 'interests', icon: 'fa-heart', label: 'Interests', roles: ['Admin'] },
          { id: 'branches', icon: 'fa-store-alt', label: 'Branches', roles: ['Admin'] },
          { id: 'channels', icon: 'fa-network-wired', label: 'Channels', roles: ['Admin'] },
          { id: 'members', icon: 'fa-users', label: 'Members', roles: ['Admin'] },
          { id: 'inventorylog', icon: 'fa-boxes', label: 'Inventory', roles: ['Admin'] },
          { id: 'auditlog', icon: 'fa-history', label: 'Audit', roles: ['Admin'] },
          { id: 'autosetup', icon: 'fa-database', label: 'Auto Setup ฐานข้อมูล', roles: ['Admin'] }
        ]
      }
  ],

  showLoading: function(text) { 
    Swal.fire({ 
      toast: true, 
      position: 'bottom-end', 
      showConfirmButton: false, 
      width: 'auto',
      padding: '0',
      html: '<div class="flex items-center space-x-2.5 px-4 h-full w-full"><svg class="animate-spin h-4 w-4 text-indigo-600 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span class="text-[13px] font-black text-indigo-900 tracking-wide whitespace-nowrap">' + (text || 'กำลังโหลดข้อมูล...') + '</span></div>',
      customClass: { 
        popup: '!bg-white !shadow-[0_5px_20px_rgba(0,0,0,0.15)] !rounded-lg !border !border-slate-200 !h-[38px] !min-h-[38px] !max-h-[38px] !p-0 !flex !items-center !justify-center !mb-5 !mr-5',
        htmlContainer: '!m-0 !p-0 !h-full !flex !items-center'
      } 
    }); 
  },
  hideLoading: function() { Swal.close(); },

  formatImageUrl: function(url) {
    if (!url || url.trim() === '-' || url.trim() === '') return "https://via.placeholder.com/150?text=No+Image";
    if (url.includes(',')) url = url.split(',')[0].trim();
    const driveRegex = /(?:drive\.google\.com\/.*[?&]id=|drive\.google\.com\/file\/d\/)([^/?&]+)/;
    const match = url.match(driveRegex);
    if (match && match[1]) return 'https://drive.google.com/uc?export=view&id=' + match[1];
    return url;
  },
  parseImageUrls: function(urlsStr) {
    if (!urlsStr || urlsStr.trim() === '-' || urlsStr.trim() === '') return ["https://via.placeholder.com/150?text=No+Image"];
    return urlsStr.split(',').map(u => {
        let trimmed = u.trim();
        if (!trimmed) return null;
        const match = trimmed.match(/(?:drive\.google\.com\/.*[?&]id=|drive\.google\.com\/file\/d\/)([^/?&]+)/);
        return (match && match[1]) ? 'https://drive.google.com/uc?export=view&id=' + match[1] : trimmed;
    }).filter(u => u);
  },
  
  refreshGlobalData: async function() {
    try {
      const res = await window.app.api('GET_ALL_DATA', {});
      if (res && res.status === 'success') {
        window.app.globalData = res;
      }
    } catch(e) {
      console.error("Failed to refresh global data:", e);
    }
  },
  
  showModal: function(modalId) {
    const el = document.getElementById(modalId);
    if(el) {
        el.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
  },
  
  hideModal: function(modalId) {
    const el = document.getElementById(modalId);
    if(el) {
        el.classList.add('hidden');
        document.body.style.overflow = '';
    }
  },

  showPopupBanner: function() {
    if(!this.globalData.popupBanners || this.globalData.popupBanners.length === 0) return;
    if(sessionStorage.getItem('tg_popup_shown')) return;
    
    const modal = document.getElementById('popupBannerModal');
    const content = document.getElementById('popupBannerContent');
    
    if(modal && content) {
        let html = '';
        this.globalData.popupBanners.forEach(item => {
            let img = this.formatImageUrl(item.url);
            let linkTag = item.link ? `<a href="${item.link}" target="_blank" class="block w-full h-full cursor-pointer">` : '';
            let endLinkTag = item.link ? `</a>` : '';
            html += `${linkTag}<img src="${img}" class="w-full h-auto object-contain rounded-2xl shadow-lg border border-white/10">${endLinkTag}`;
        });
        content.innerHTML = html;
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        sessionStorage.setItem('tg_popup_shown', 'true');
    }
  },

  closePopupBanner: function() {
    const modal = document.getElementById('popupBannerModal');
    if(modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
  },

  getWeekString: function(dateStr) {
    let d = new Date(dateStr);
    if (isNaN(d.getTime())) return "Unknown Week";
    d.setHours(0,0,0,0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    let yearStart = new Date(d.getFullYear(), 0, 1);
    let weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return d.getFullYear() + " - W" + String(weekNo).padStart(2, '0');
  },
  
  toggleMobileMenu: function() {
    const panel = document.getElementById('mobileMenuPanel');
    if(panel) panel.classList.toggle('hidden');
  },
  
  closeMobileMenu: function() {
    const panel = document.getElementById('mobileMenuPanel');
    if(panel && !panel.classList.contains('hidden')) panel.classList.add('hidden');
  },
  
  init: function() {
    setInterval(() => {
      const d = new Date();
      const clk = document.getElementById('clock');
      if(clk) clk.innerText = d.toLocaleString('th-TH');
    }, 1000);

    const storedUser = localStorage.getItem('tg_pos_user');
    if (storedUser) {
      window.app.user = JSON.parse(storedUser);
      window.app.renderLayout();
    } else {
      window.app.renderLogin();
    }
    window.addEventListener('hashchange', () => window.app.route());
  },

  initDB: async function() {
    Swal.fire({
       title: 'กำลังตรวจสอบและสร้างฐานข้อมูล...',
       html: 'กรุณารอสักครู่ ระบบกำลังตั้งค่าแผ่นงานและข้อมูลทดสอบ',
       allowOutsideClick: false,
       didOpen: () => { Swal.showLoading(); }
    });
    try {
      const res = await new Promise((resolve, reject) => {
        google.script.run.withSuccessHandler(resolve).withFailureHandler(reject).setupDatabase();
      });
      Swal.fire({ icon: 'success', title: 'สร้างฐานข้อมูลสำเร็จ!', text: 'กรุณาเข้าสู่ระบบด้วย admin / admin123', confirmButtonColor: '#4f46e5' });
    } catch(e) {
      Swal.fire('ข้อผิดพลาด', e.toString(), 'error');
    }
  },

  renderLogin: function() {
    const el = document.getElementById('app');
    const tmpl = document.getElementById('tmpl-login');
    if(el && tmpl) {
        el.innerHTML = tmpl.innerHTML;
        google.script.run.withSuccessHandler(bgUrl => {
            const bgEl = document.getElementById('loginBg');
            if(bgEl && bgUrl) {
                bgEl.style.backgroundImage = `url('${window.app.formatImageUrl(bgUrl)}')`;
                bgEl.classList.remove('opacity-30');
                bgEl.classList.add('opacity-100');
            }
        }).getPublicConfig();
    }
  },

  renderLayout: async function() {
    const el = document.getElementById('app');
    const tmpl = document.getElementById('tmpl-main');
    if(el && tmpl) el.innerHTML = tmpl.innerHTML;
    
    if(document.getElementById('headerUserName')) document.getElementById('headerUserName').innerText = window.app.user.Name;
    if(document.getElementById('headerRole')) document.getElementById('headerRole').innerText = window.app.user.Role;
    if(document.getElementById('mobileUserName')) document.getElementById('mobileUserName').innerText = window.app.user.Name;
    if(document.getElementById('mobileRole')) document.getElementById('mobileRole').innerText = window.app.user.Role;
    
    window.app.buildMenu();
    window.app.showLoading('กำลังเข้าสู่ระบบ...');
    
    try {
      const res = await window.app.api('GET_ALL_DATA', {});
      Swal.close();
      if(res && res.status === 'success') {
         window.app.globalData = res;
         if(!window.location.hash) window.location.hash = '#dashboard';
         window.app.route();
         
         setTimeout(() => { window.app.showPopupBanner(); }, 500);
         
      } else {
         Swal.fire('ข้อผิดพลาด', res ? res.message : 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้', 'error');
         window.app.logout();
      }
    } catch(err) {
      Swal.close();
      Swal.fire('Session หมดอายุ', 'กรุณาเข้าสู่ระบบใหม่อีกครั้ง', 'error');
      window.app.logout();
    }
  },

  checkMenuAccess: function(menuId, defaultRoles) {
      if(!window.app.user) return false;
      const uRole = window.app.user.Role;
      if (uRole === 'Admin') return true; 
      
      const allowed = window.app.user['Accessible Menus'];
      if (allowed && allowed.trim() !== '') {
          if (allowed === '*' || allowed.toUpperCase() === 'ALL') return true;
          return allowed.includes(menuId);
      }
      return defaultRoles.includes(uRole); 
  },

  buildMenu: function() {
    const deskNav = document.getElementById('desktopMenu');
    const mobNav = document.getElementById('mobileMenu');
    if(!deskNav || !mobNav) return;
    
    let deskHtmlStr = '';
    let mobHtmlStr = '';
    
    this.menuConfig.forEach(m => {
      if(m.isParent) {
          let childDeskHtml = '';
          let childMobHtml = '';
          let hasChildAccess = false;
          
          m.children.forEach(child => {
             if(this.checkMenuAccess(child.id, child.roles)) {
                childDeskHtml += `<a href="#${child.id}" class="nav-link block px-3 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors" id="nav-desk-${child.id}"><i class="fas ${child.icon} mr-2 w-4 text-center opacity-60"></i>${child.label}</a>`;
                childMobHtml += `<a href="#${child.id}" class="nav-link block px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors" id="nav-mob-${child.id}" onclick="window.app.closeMobileMenu()"><i class="fas ${child.icon} mr-2 w-4 text-center opacity-60"></i>${child.label}</a>`;
                hasChildAccess = true;
             }
          });

          if(hasChildAccess) { 
             deskHtmlStr += `<div class="relative group">
                <button class="nav-link px-3 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors flex items-center" id="nav-desk-${m.id}">
                  <i class="fas ${m.icon} mr-1.5 opacity-70"></i>${m.label} <i class="fas fa-chevron-down ml-1.5 text-[0.6rem]"></i>
                </button>
                <div class="absolute left-0 mt-1 w-56 bg-white border border-slate-100 rounded-2xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 transform origin-top-left flex flex-col p-2">
                ${childDeskHtml}
                </div></div>`;

             mobHtmlStr += `<div>
               <button onclick="document.getElementById('sub-${m.id}').classList.toggle('hidden')" class="w-full text-left px-4 py-3 rounded-xl text-base font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors flex justify-between items-center" id="nav-mob-${m.id}">
                 <span><i class="fas ${m.icon} mr-3 w-5 text-center opacity-70"></i>${m.label}</span>
                 <i class="fas fa-chevron-down text-sm"></i>
               </button>
               <div id="sub-${m.id}" class="hidden pl-6 pr-2 py-2 space-y-1 bg-slate-50/50 rounded-xl mt-1 border border-slate-100/50">
                  ${childMobHtml}
               </div>
             </div>`;
          }
      } else {
          if(this.checkMenuAccess(m.id, m.roles)) {
             deskHtmlStr += `<a href="#${m.id}" class="nav-link px-3 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors" id="nav-desk-${m.id}"><i class="fas ${m.icon} mr-1.5 opacity-70"></i>${m.label}</a>`;
             mobHtmlStr += `<a href="#${m.id}" class="nav-link block px-4 py-3 rounded-xl text-base font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors" id="nav-mob-${m.id}" onclick="window.app.closeMobileMenu()"><i class="fas ${m.icon} mr-3 w-5 text-center opacity-70"></i>${m.label}</a>`;
          }
      }
    });
    
    deskNav.innerHTML = deskHtmlStr;
    mobNav.innerHTML = mobHtmlStr;
  },

  route: function() {
    if (window.app.pos && window.app.pos.countdownInterval) {
      clearInterval(window.app.pos.countdownInterval);
      window.app.pos.countdownInterval = null;
    }
    if(!window.app.user) return window.app.renderLogin();
    const hash = window.location.hash.substring(1) || 'dashboard';
    window.app.currentRoute = hash;

    const targetMenu = this.menuConfig.flatMap(x => x.children || [x]).find(x => x.id === hash);
    if (!targetMenu || !this.checkMenuAccess(hash, targetMenu.roles)) {
       Swal.fire('ปฏิเสธการเข้าถึง', 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลในส่วนนี้', 'warning');
       window.location.hash = '#dashboard';
       return;
    }
    
    document.querySelectorAll('.nav-link').forEach(el => {
       el.classList.remove('bg-indigo-600', 'text-white', 'hover:bg-indigo-700', 'bg-indigo-50', 'text-indigo-600', 'active-link');
       if(el.id.startsWith('nav-desk-')) el.classList.add('text-slate-500', 'hover:bg-indigo-50', 'hover:text-indigo-600');
       if(el.id.startsWith('nav-mob-')) el.classList.add('text-slate-600', 'hover:bg-indigo-50', 'hover:text-indigo-600');
    });
    
    const deskActive = document.getElementById('nav-desk-' + hash);
    const mobActive = document.getElementById('nav-mob-' + hash);
    
    if(deskActive) {
      deskActive.classList.remove('text-slate-500', 'hover:bg-indigo-50');
      deskActive.classList.add('bg-indigo-600', 'text-white', 'hover:bg-indigo-700', 'active-link');
      if(document.getElementById('pageTitle')) document.getElementById('pageTitle').innerText = deskActive.innerText;
    }
    if(mobActive) {
      mobActive.classList.remove('text-slate-600', 'hover:bg-indigo-50');
      mobActive.classList.add('bg-indigo-50', 'text-indigo-600', 'active-link');
    }

    const content = document.getElementById('page-content');
    if(!content) return;
    
    try {
      switch(hash) {
        case 'dashboard': 
          const dbTmpl = document.getElementById('tmpl-dashboard');
          if(dbTmpl) content.innerHTML = dbTmpl.innerHTML; 
          window.app.dashboard.init(); 
          break;
        case 'pos': 
          const posTmpl = document.getElementById('tmpl-pos');
          if(posTmpl) content.innerHTML = posTmpl.innerHTML; 
          window.app.pos.init(); 
          break;
        case 'bookingsettings':
          window.app.settingsManager.init('bookingsettings');
          break;
        case 'autosetup':
          window.app.settingsManager.init('autosetup');
          break;
        case 'loginbg':
          window.app.settingsManager.init('loginbg');
          break;
        case 'herobanners':
          window.app.settingsManager.init('herobanners');
          break;
        case 'promogrids':
          window.app.settingsManager.init('promogrids');
          break;
        case 'popupbanners':
          window.app.settingsManager.init('popupbanners');
          break;
        case 'products': 
          window.app.grid.init('Products', 'SKU', [
            { key: 'SKU', label: 'SKU', type: 'text' }, 
            { key: 'Product Name', label: 'Product Name', type: 'text' },
            { key: 'Model', label: 'Model', type: 'text' },
            { key: 'Product Group', label: 'Product Group', type: 'text' },
            { key: 'Capacity', label: 'Capacity', type: 'text' }, 
            { key: 'Color', label: 'Color', type: 'text' },
            { key: 'Image URL', label: 'Image URL', type: 'text' }, 
            { key: 'Price', label: 'Price', type: 'number' },
            { key: 'Stock', label: 'Stock', type: 'number' }, 
            { key: 'Unit', label: 'Unit', type: 'text' },
            { key: 'Category', label: 'Category', type: 'select', options: ['โมบาย', 'อุปกรณ์เสริม', 'ของแถมแบรนด์', 'ของแถมช่องทาง'] },
            { key: 'Status', label: 'Status', type: 'select', options: ['เปิด', 'ปิด'] },
            { key: 'Channel', label: 'Channel Allowed', type: 'multi_select_channel' }
          ]); break;
        case 'giftmappings': 
          window.app.grid.init('GiftMappings', 'Mapping ID', [
            { key: 'Mapping ID', label: 'รหัสเงื่อนไข (เช่น GM-001)', type: 'text' }, 
            { key: 'Target Mobile (SKU or Group)', label: 'SKU หรือ กลุ่มสินค้า (* = ทุกรุ่น)', type: 'text' }, 
            { key: 'Channel', label: 'ช่องทางการขาย', type: 'multi_select_channel' }, 
            { key: 'Brand Gifts', label: 'ของแถมแบรนด์', type: 'multi_select_brand_gifts' }, 
            { key: 'Channel Gifts', label: 'ของแถมช่องทาง', type: 'multi_select_channel_gifts' }, 
            { key: 'Status', label: 'สถานะการใช้', type: 'select', options: ['เปิด', 'ปิด'] }
        ]); break;
        case 'interests': window.app.grid.init('Interests', 'Interest Name', [{ key: 'Interest Name', label: 'Interest', type: 'text' }, { key: 'Status', label: 'Status', type: 'select', options: ['เปิด', 'ปิด'] }]); break;
        case 'branches': window.app.grid.init('Branches', 'Branch Code', [{ key: 'Channel', label: 'Channel', type: 'text' }, { key: 'Branch Code', label: 'Branch Code', type: 'text' }, { key: 'Branch Name', label: 'Branch Name', type: 'text' }, { key: 'Supervisor Name', label: 'Supervisor', type: 'text' }, { key: 'Mall', label: 'Mall', type: 'text' }, { key: 'Region', label: 'Region', type: 'text' }, { key: 'Province', label: 'Province', type: 'text' }, { key: 'Type Name', label: 'Type Name', type: 'text' }]); break;
        case 'channels': window.app.grid.init('Channels', 'Channel ID', [{ key: 'Channel ID', label: 'ID', type: 'text' }, { key: 'Channel Name', label: 'Name', type: 'text' }, { key: 'Description', label: 'Desc', type: 'text' }]); break;
        case 'members': window.app.grid.init('Members', 'Username', [
            { key: 'Username', label: 'Username', type: 'text' }, 
            { key: 'Password', label: 'Password (เว้นว่างถ้าไม่เปลี่ยน)', type: 'password' }, 
            { key: 'Role', label: 'Role', type: 'select', options: ['Admin', 'Manager', 'Sales'] }, 
            { key: 'Name', label: 'Name', type: 'text' }, 
            { key: 'Branch Code', label: 'Branch Code', type: 'text' },
            { key: 'Accessible Menus', label: 'สิทธิ์การเข้าถึงเมนู (* = ให้ทั้งหมด)', type: 'multi_select_menu' }
        ]); break;
        case 'promotions': window.app.grid.init('Promotions', 'Promo ID', [{ key: 'Promo ID', label: 'ID', type: 'text' }, { key: 'Promo Name', label: 'Name', type: 'text' }, { key: 'Discount Type', label: 'Type', type: 'select', options: ['Fixed', 'Percent'] }, { key: 'Value', label: 'Value', type: 'number' }, { key: 'Status', label: 'Status', type: 'select', options: ['เปิด', 'ปิด'] }]); break;
        case 'inventorylog': window.app.grid.init('InventoryLog', 'Log ID', [{ key: 'Log ID', label: 'Log ID', type: 'readonly' }, { key: 'Timestamp', label: 'Date', type: 'readonly' }, { key: 'SKU', label: 'SKU', type: 'readonly' }, { key: 'Action', label: 'Action', type: 'readonly' }, { key: 'Qty', label: 'Qty', type: 'readonly' }, { key: 'Branch', label: 'Branch', type: 'readonly' }, { key: 'User', label: 'User', type: 'readonly' }], true); break;
        case 'auditlog': window.app.grid.init('AuditLog', 'Log ID', [{ key: 'Log ID', label: 'Log ID', type: 'readonly' }, { key: 'Timestamp', label: 'Date', type: 'readonly' }, { key: 'User', label: 'User', type: 'readonly' }, { key: 'Action', label: 'Action', type: 'readonly' }, { key: 'Details', label: 'Details', type: 'readonly' }], true); break;
        case 'orders':
          let isSalesRole = (window.app.user.Role === 'Sales');
          window.app.grid.init('Orders', 'OrderID', [
            { key: '_rowIndex', type: 'hidden' }, 
            { key: 'OrderID', label: 'เลขที่บิล', type: 'readonly' },
            { key: 'Timestamp', label: 'วันที่', type: 'readonly' },
            { key: 'Channel', label: 'Channel', type: 'readonly' },
            { key: 'Branch', label: 'Branch', type: 'readonly' },
            { key: 'Customer Name', label: 'ชื่อ-สกุล', type: 'datalist', listId: 'customerList' },
            { key: 'Contact Number', label: 'เบอร์ติดต่อ', type: 'text' },
            { key: 'Email', label: 'Email', type: 'text' },
            { key: 'ID Card_Passport', label: 'ID Card / Passport', type: 'text' },
            { key: 'Code Handraiser', label: 'Code Handraiser', type: 'text' },
            { key: 'SKU', label: 'SKU', type: 'readonly' },
            { key: 'Product Name', label: 'สินค้า', type: 'product_select' },
            { key: 'Qty', label: 'จำนวน', type: 'number', onchange: 'window.app.grid.calcOrderTotal()' },
            { key: 'Unit Price', label: 'ราคาต่อหน่วย', type: 'number', onchange: 'window.app.grid.calcOrderTotal()' },
            { key: 'Promo', label: 'Promo', type: 'text' },
            { key: 'Reservation Status', label: 'ประเภทการจอง', type: 'select', options: ['จอง T (มีการจอง)', 'จอง F (สวมสิทธิ์การจอง)'] },
            { key: 'Booking Staff', label: 'Booking Staff', type: 'text' },
            { key: 'Booking Phone', label: 'Booking Phone', type: 'text' },
            { key: 'Customer Interests', label: 'Customer Interests', type: 'text' },
            { key: 'Remark', label: 'Remark', type: 'text' },
            { key: 'Row Total', label: 'ยอดรวม', type: 'readonly' },
            { key: 'Order Status', label: 'สถานะออเดอร์', type: 'select', options: ['Pending', 'Completed', 'Cancelled'] }
          ], isSalesRole); break;
      }
    } catch(err) {
      console.error(err);
      Swal.fire('ข้อผิดพลาดระบบ', err.message, 'error');
    }
  },

  api: function(action, payload) {
    return new Promise((resolve, reject) => {
      google.script.run.withSuccessHandler(resolve).withFailureHandler(reject).apiHandler(action, payload, window.app.user);
    });
  },

  handleLogin: async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btnLogin');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Wait...';
    const res = await this.api('LOGIN', { username: document.getElementById('loginUsername').value, password: document.getElementById('loginPassword').value });
    if(res && res.status === 'success') {
      window.app.user = res.user; localStorage.setItem('tg_pos_user', JSON.stringify(window.app.user));
      Swal.fire({icon: 'success', title: 'Welcome', text: res.user.Name, timer: 1500, showConfirmButton: false});
      window.app.renderLayout();
    } else {
      Swal.fire('Error', res ? res.message : 'Unknown Error', 'error'); btn.disabled = false; btn.innerHTML = 'เข้าสู่ระบบ';
    }
  },

  logout: function() {
    if(window.app.dashboard.refreshTimer) clearInterval(window.app.dashboard.refreshTimer);
    if(window.app.dashboard.slider.timer) clearInterval(window.app.dashboard.slider.timer);
    if(window.app.pos && window.app.pos.countdownInterval) clearInterval(window.app.pos.countdownInterval);
    window.app.user = null; localStorage.removeItem('tg_pos_user'); window.location.hash = ''; window.app.renderLogin();
    sessionStorage.removeItem('tg_popup_shown');
  },

  dashboard: {
    rawOrders: [], filteredOrders: [], charts: {}, refreshTimer: null,
    
    slider: {
        index: 0, count: 0, timer: null,
        init: function(data) {
            this.count = data.length; this.index = 0;
            let track = document.getElementById('sliderTrack'); let dots = document.getElementById('sliderDots');
            if(!track || !dots) return;
            
            let trackHtml = ''; let dotsHtml = '';
            data.forEach((item, i) => {
                let img = window.app.formatImageUrl(item.url);
                let linkTag = item.link ? `<a href="${item.link}" target="_blank" class="block w-full h-full">` : `<div class="w-full h-full">`;
                let endLinkTag = item.link ? `</a>` : `</div>`;
                trackHtml += `<div class="w-full h-full shrink-0">${linkTag}<img src="${img}" class="w-full h-full object-cover">${endLinkTag}</div>`;
                dotsHtml += `<button onclick="window.app.dashboard.slider.goTo(${i})" class="h-2.5 rounded-full transition-all duration-300 focus:outline-none ${i===0?'bg-white w-8 shadow-sm':'bg-white/50 w-2.5 hover:bg-white/80'}"></button>`;
            });
            track.innerHTML = trackHtml; dots.innerHTML = dotsHtml;
            this.startAuto();
        },
        updateDOM: function() {
            let track = document.getElementById('sliderTrack'); let dots = document.getElementById('sliderDots');
            if(track) track.style.transform = `translateX(-${this.index * 100}%)`;
            if(dots) {
                Array.from(dots.children).forEach((dot, i) => {
                    dot.className = i === this.index ? "h-2.5 rounded-full transition-all duration-300 focus:outline-none bg-white w-8 shadow-sm" : "h-2.5 rounded-full transition-all duration-300 focus:outline-none bg-white/50 w-2.5 hover:bg-white/80";
                });
            }
        },
        next: function() { this.index = (this.index + 1) % this.count; this.updateDOM(); this.startAuto(); },
        prev: function() { this.index = (this.index - 1 + this.count) % this.count; this.updateDOM(); this.startAuto(); },
        goTo: function(idx) { this.index = idx; this.updateDOM(); this.startAuto(); },
        startAuto: function() {
            if(this.timer) clearInterval(this.timer);
            if(this.count > 1) { this.timer = setInterval(() => { this.next(); }, 5000); }
        }
    },

    renderBanners: function() {
        const heroData = window.app.globalData.heroBanners || [];
        const gridData = window.app.globalData.gridBanners || [];

        const heroWrap = document.getElementById('dashHeroWrap');
        if(heroData.length > 0) {
            if(heroWrap) heroWrap.classList.remove('hidden');
            this.slider.init(heroData);
        } else {
            if(heroWrap) heroWrap.classList.add('hidden');
        }

        const gridWrap = document.getElementById('dashPromoGridWrap');
        const gridBox = document.getElementById('dashPromoGrid');
        if(gridData.length > 0) {
            if(gridWrap) gridWrap.classList.remove('hidden');
            let html = '';
            gridData.forEach((item, idx) => {
                let formattedUrl = window.app.formatImageUrl(item.url);
                let baseClass = "rounded-3xl overflow-hidden shadow-sm group relative bg-white border border-slate-100 h-48 md:h-64";
                if(idx === 0 && gridData.length >= 3) baseClass += " md:col-span-2 md:row-span-2 md:h-full";
                
                let linkTag = item.link ? `<a href="${item.link}" target="_blank" class="block w-full h-full">` : `<div class="w-full h-full">`;
                let endLinkTag = item.link ? `</a>` : `</div>`;
                
                html += `<div class="${baseClass}">${linkTag}<img src="${formattedUrl}" class="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700">${endLinkTag}</div>`;
            });
            if(gridBox) gridBox.innerHTML = html;
        } else {
            if(gridWrap) gridWrap.classList.add('hidden');
        }
    },

    init: async function() {
      if(window.app.user.Role === 'Sales') {
        document.querySelectorAll('.admin-filter').forEach(el => el.style.display = 'none');
      }
      window.app.showLoading('กำลังโหลดข้อมูล...');
      
      try {
        const res = await window.app.api('GET_ADVANCED_DASHBOARD', {});
        Swal.close();
        if(res && res.status === 'success') {
          this.rawOrders = res.data.orders.map(o => {
             let bInfo = window.app.globalData.branches.find(b => b['Branch Code'] === o.Branch) || {};
             let pInfo = window.app.globalData.products.find(p => p.SKU == o.SKU) || {};
             o.Mall = bInfo.Mall || '-'; o.Region = bInfo.Region || '-'; o.Province = bInfo.Province || '-'; o['Type Name'] = bInfo['Type Name'] || '-'; 
             o.Category = pInfo.Category || '-'; o.Model = pInfo.Model || '-'; o.Capacity = pInfo.Capacity || '-';
             return o;
          });
          
          this.renderBanners();

          const bSel = document.getElementById('dashBranch'); const sSel = document.getElementById('dashSales');
          if(bSel && sSel) {
            let bHtml = '<option value="ALL">ทุกสาขา</option>';
            [...new Set(window.app.globalData.branches.map(b => b['Branch Code']))].forEach(b => { if(b) bHtml += '<option value="' + b + '">' + b + '</option>'; });
            bSel.innerHTML = bHtml;
            
            let sHtml = '<option value="ALL">ทุกคน</option>';
            res.data.members.forEach(m => { if(m.Name && (m.Role === 'Sales' || m.Role === 'Manager')) sHtml += '<option value="' + m.Name + '">' + m.Name + '</option>'; });
            sSel.innerHTML = sHtml;
          }
          
          const now = new Date();
          const dStart = document.getElementById('dashStartDate');
          const dEnd = document.getElementById('dashEndDate');
          if(dStart) dStart.value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
          if(dEnd) dEnd.value = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
          this.applyFilters(); this.startAutoRefresh(); 
        } else {
          Swal.fire('Error', res ? res.message : 'Dashboard Load Failed', 'error');
        }
      } catch(err) {
        Swal.close(); console.error(err);
      }
    },
    startAutoRefresh: function() {
      if(this.refreshTimer) clearInterval(this.refreshTimer);
      this.refreshTimer = setInterval(async () => {
        if(window.app.currentRoute !== 'dashboard') return; 
        const stat = document.getElementById('dashSyncStatus'); if(stat) { stat.classList.remove('bg-slate-100','text-slate-600'); stat.classList.add('bg-emerald-50','text-emerald-600'); }
        try {
          const res = await window.app.api('GET_ADVANCED_DASHBOARD', {});
          if(res && res.status === 'success') { 
            this.rawOrders = res.data.orders.map(o => {
               let bInfo = window.app.globalData.branches.find(b => b['Branch Code'] === o.Branch) || {};
               let pInfo = window.app.globalData.products.find(p => p.SKU == o.SKU) || {};
               o.Mall = bInfo.Mall || '-'; o.Region = bInfo.Region || '-'; o.Province = bInfo.Province || '-'; o['Type Name'] = bInfo['Type Name'] || '-'; 
               o.Category = pInfo.Category || '-'; o.Model = pInfo.Model || '-'; o.Capacity = pInfo.Capacity || '-';
               return o;
            });
            this.applyFilters(); 
          }
        } catch(e) {}
        setTimeout(() => { if(stat) { stat.classList.remove('bg-emerald-50','text-emerald-600'); stat.classList.add('bg-slate-100','text-slate-600'); } }, 1500);
      }, 30000); 
    },
    resetFilters: function() { 
      ['dashStartDate','dashEndDate','dashBranch','dashSales'].forEach(id=>{
        const el = document.getElementById(id);
        if(el) el.value = id.includes('Date') ? '' : 'ALL';
      });
      this.applyFilters(); 
    },
    applyFilters: function() {
      const elSD = document.getElementById('dashStartDate'); const elED = document.getElementById('dashEndDate');
      const elB = document.getElementById('dashBranch'); const elS = document.getElementById('dashSales');
      const sD = elSD ? elSD.value : ''; const eD = elED ? elED.value : '';
      const b = elB ? elB.value : 'ALL'; const s = elS ? elS.value : 'ALL';

      this.filteredOrders = this.rawOrders.filter(o => {
        if (sD && new Date(o.Timestamp) < new Date(sD + "T00:00:00")) return false;
        if (eD && new Date(o.Timestamp) > new Date(eD + "T23:59:59")) return false;
        if (b !== 'ALL' && o.Branch !== b) return false;
        if (s !== 'ALL' && o['Booking Staff'] !== s) return false;
        return true;
      });
      this.updateKPIs(); this.renderCharts(); this.renderInterestsTable();
    },
    updateKPIs: function() {
      let t = 0; let c = 0; let u = new Set();
      let resT = 0; let resF = 0;
      let totalMobiles = 0; let totalAccessories = 0;
      const orderResStatusMap = {};
      this.filteredOrders.forEach(o => { if(o['Reservation Status'] && o['Reservation Status'].trim() !== '') { orderResStatusMap[o.OrderID] = o['Reservation Status']; } });

      this.filteredOrders.forEach(o => {
        if (o['Order Status'] !== 'Cancelled') { 
            let rTotal = parseFloat((o['Row Total'] || '0').toString().replace(/,/g,''));
            t += isNaN(rTotal) ? 0 : rTotal;
            u.add(o.OrderID); 
            if (o['Order Status'] === 'Completed') c++; 
            
            let isMobile = o.Category === 'โมบาย';
            let isAcc = o.Category === 'อุปกรณ์เสริม';
            if (isMobile || isAcc) {
                let qty = parseInt(o.Qty || 0); if(isNaN(qty)) qty = 0;
                if(isMobile) totalMobiles += qty;
                if(isAcc) totalAccessories += qty;
                
                let rStatus = o['Reservation Status'] || orderResStatusMap[o.OrderID] || '';
                if(rStatus.includes('จอง T')) resT += qty;
                if(rStatus.includes('จอง F')) resF += qty;
            }
        }
      });
      
      if(document.getElementById('dashKpiTotal')) document.getElementById('dashKpiTotal').innerText = '฿' + t.toLocaleString();
      if(document.getElementById('dashKpiMobiles')) document.getElementById('dashKpiMobiles').innerText = totalMobiles; 
      if(document.getElementById('dashKpiAccessories')) document.getElementById('dashKpiAccessories').innerText = totalAccessories; 
      if(document.getElementById('dashKpiResT')) document.getElementById('dashKpiResT').innerText = resT;
      if(document.getElementById('dashKpiResF')) document.getElementById('dashKpiResF').innerText = resF;
      if(document.getElementById('dashKpiConv')) document.getElementById('dashKpiConv').innerText = (u.size>0 ? ((c/this.filteredOrders.length)*100).toFixed(1) : 0) + '%';
      if(document.getElementById('dashKpiAov')) document.getElementById('dashKpiAov').innerText = '฿' + (u.size>0 ? (t/u.size) : 0).toLocaleString();
    },
    renderCharts: function() {
      if (typeof ChartDataLabels !== 'undefined') {
          Chart.register(ChartDataLabels);
          Chart.defaults.set('plugins.datalabels', {
              color: '#334155',
              font: { family: 'Prompt', weight: 'bold', size: 10 },
              align: 'end',
              anchor: 'end',
              offset: 4,
              formatter: function(value) { return value > 0 ? value.toLocaleString() : ''; }
          });
      }
      const validCategories = ['โมบาย', 'อุปกรณ์เสริม'];
      const isDevice = (o) => o && o.Category && validCategories.includes(o.Category.toString().trim());
      const isGift = (o) => o && (o.Category||'').includes('ของแถม');

      const trendData = {}; 
      this.filteredOrders.forEach(o => { 
        if(o['Order Status'] !== 'Cancelled' && isDevice(o)) { 
          let d = new Date(o.Timestamp).toLocaleDateString('th-TH'); 
          let qty = parseInt(o.Qty || 0); trendData[d] = (trendData[d] || 0) + (isNaN(qty) ? 0 : qty); 
        }
      });
      this.createChart('chartSalesTrend', 'line', Object.keys(trendData), Object.values(trendData), 'จำนวนเครื่อง', '#4f46e5');
      
      const weeklyTrend = {};
      this.filteredOrders.forEach(o => {
        if(o['Order Status'] !== 'Cancelled' && isDevice(o)) {
          let w = window.app.getWeekString(o.Timestamp);
          let qty = parseInt(o.Qty || 0); weeklyTrend[w] = (weeklyTrend[w] || 0) + (isNaN(qty) ? 0 : qty);
        }
      });
      const sortedWeeks = Object.keys(weeklyTrend).sort();
      this.createChart('chartWeeklyTrend', 'bar', sortedWeeks, sortedWeeks.map(w => weeklyTrend[w]), 'จำนวนเครื่อง', '#64748b');

      const modelsData = {}; 
      let grandTotalQty = 0;
      this.filteredOrders.forEach(o => {
        if(o['Order Status'] === 'Cancelled' || !isDevice(o)) return;
        let mName = o.Model && o.Model !== '-' ? o.Model : o['Product Name'];
        if (o.Capacity && o.Capacity !== '-' && o.Capacity.trim() !== '') mName += ` (${o.Capacity})`;
        let qty = parseInt(o.Qty || 0); if(isNaN(qty)) qty = 0;
        modelsData[mName] = (modelsData[mName] || 0) + qty;
        grandTotalQty += qty;
      });
      let sortedModels = Object.keys(modelsData).sort((a,b) => modelsData[b] - modelsData[a]).slice(0, 15);
      
      if(this.charts['chartModelAdvanced']) this.charts['chartModelAdvanced'].destroy();
      const ctxModel = document.getElementById('chartModelAdvanced');
      if(ctxModel) {
        this.charts['chartModelAdvanced'] = new Chart(ctxModel.getContext('2d'), {
            type: 'bar',
            data: { labels: sortedModels, datasets: [{ label: 'จำนวนเครื่อง', data: sortedModels.map(m => modelsData[m]), backgroundColor: '#4f46e5', borderRadius: 6 }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' }, grace: '15%' }, x: { grid: { display: false } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { footer: (tooltipItems) => { let mName = tooltipItems[0].label; let part = modelsData[mName] || 0; let percent = grandTotalQty > 0 ? ((part / grandTotalQty) * 100).toFixed(1) : 0; return 'คิดเป็นสัดส่วน: ' + percent + '% ของยอดจองทั้งหมด'; } } } } }
        });
      }

      const promoData = {}; const promoProcessed = new Set();
      this.filteredOrders.forEach(o => {
        if(o['Order Status'] !== 'Cancelled' && !promoProcessed.has(o.OrderID)) {
           let orderItems = this.filteredOrders.filter(x => x.OrderID === o.OrderID);
           if(orderItems.some(x => isDevice(x))) {
               let firstRow = orderItems[0];
               if(firstRow && firstRow.Promo && firstRow.Promo !== '-') promoData[firstRow.Promo] = (promoData[firstRow.Promo] || 0) + 1;
           }
           promoProcessed.add(o.OrderID);
        }
      });
      let sortedPromos = Object.keys(promoData).sort((a,b)=>promoData[b]-promoData[a]);
      this.createChart('chartPromotionsBar', 'bar', sortedPromos, sortedPromos.map(p=>promoData[p]), 'จำนวนบิล', '#ec4899');

      const buildCountChart = (field, canvasId, colorHex) => {
          const counts = {};
          this.filteredOrders.forEach(o => {
            if (o['Order Status'] !== 'Cancelled' && isDevice(o) && o[field] && o[field] !== '-') {
              let qty = parseInt(o.Qty || 0); counts[o[field]] = (counts[o[field]] || 0) + (isNaN(qty) ? 0 : qty);
            }
          });
          let labels = Object.keys(counts).sort((a,b)=>counts[b]-counts[a]);
          let data = labels.map(l => counts[l]);
          this.createChart(canvasId, 'bar', labels, data, 'จำนวนเครื่อง', colorHex);
      };
      
      buildCountChart('Mall', 'chartMall', '#17a2b8'); buildCountChart('Region', 'chartRegion', '#10b981');
      buildCountChart('Province', 'chartProvince', '#f59e0b'); buildCountChart('Type Name', 'chartType', '#8b5cf6');

      const branchCounts = {};
      this.filteredOrders.forEach(o => { if(o['Order Status'] !== 'Cancelled' && isDevice(o)) { let qty = parseInt(o.Qty || 0); branchCounts[o.Branch] = (branchCounts[o.Branch] || 0) + (isNaN(qty) ? 0 : qty); } });
      let sortedBranches = Object.keys(branchCounts).sort((a,b)=>branchCounts[b]-branchCounts[a]).slice(0, 10);
      this.createChart('chartTopBranches', 'bar', sortedBranches, sortedBranches.map(b=>branchCounts[b]), 'จำนวนเครื่องรวม', '#4f46e5');

      const salesCounts = {};
      this.filteredOrders.forEach(o => { if(o['Order Status'] !== 'Cancelled' && isDevice(o) && o['Booking Staff']) { let qty = parseInt(o.Qty || 0); salesCounts[o['Booking Staff']] = (salesCounts[o['Booking Staff']] || 0) + (isNaN(qty) ? 0 : qty); } });
      let sortedSales = Object.keys(salesCounts).sort((a,b)=>salesCounts[b]-salesCounts[a]).slice(0, 10);
      this.createChart('chartSalesRank', 'bar', sortedSales, sortedSales.map(s=>salesCounts[s]), 'จำนวนเครื่อง', '#64748b', true);

      const giftCounts = {};
      this.filteredOrders.forEach(o => {
         if(o['Order Status'] !== 'Cancelled' && isGift(o)) {
            let name = o['Product Name'] || ''; 
            let qty = parseInt(o.Qty || 0); giftCounts[name] = (giftCounts[name] || 0) + (isNaN(qty) ? 0 : qty);
         }
      });
      let sortedGifts = Object.keys(giftCounts).sort((a,b)=>giftCounts[b]-giftCounts[a]);
      this.createChart('chartGifts', 'bar', sortedGifts, sortedGifts.map(g=>giftCounts[g]), 'จำนวน (ชิ้น)', '#10b981', true);

      // Data for Channel vs Model (Split Mobile and Accessories)
      const channelModelDataMobile = {};
      const channelModelDataAcc = {};
      const allChannelsMobile = new Set();
      const allChannelsAcc = new Set();
      
      this.filteredOrders.forEach(o => {
        if(o['Order Status'] === 'Cancelled' || !isDevice(o)) return;
        let mName = o.Model && o.Model !== '-' ? o.Model : o['Product Name'];
        if (o.Capacity && o.Capacity !== '-' && o.Capacity.trim() !== '') mName += ` (${o.Capacity})`;
        
        let ch = o.Channel || 'Unknown';
        let qty = parseInt(o.Qty || 0); if(isNaN(qty)) qty = 0;
        
        if (o.Category === 'โมบาย') {
            allChannelsMobile.add(ch);
            if(!channelModelDataMobile[mName]) channelModelDataMobile[mName] = { total: 0, channels: {} };
            channelModelDataMobile[mName].total += qty;
            channelModelDataMobile[mName].channels[ch] = (channelModelDataMobile[mName].channels[ch] || 0) + qty;
        } else if (o.Category === 'อุปกรณ์เสริม') {
            allChannelsAcc.add(ch);
            if(!channelModelDataAcc[mName]) channelModelDataAcc[mName] = { total: 0, channels: {} };
            channelModelDataAcc[mName].total += qty;
            channelModelDataAcc[mName].channels[ch] = (channelModelDataAcc[mName].channels[ch] || 0) + qty;
        }
      });
      
      const renderStackedChart = (canvasId, dataMap, channelsSet) => {
          let topModels = Object.keys(dataMap).sort((a,b) => dataMap[b].total - dataMap[a].total).slice(0, 15);
          let datasets = [];
          let colorsChannel = ['#4f46e5', '#ec4899', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#14b8a6', '#f43f5e', '#64748b'];
          let chIdx = 0;
          
          Array.from(channelsSet).forEach(ch => {
             let dataPoints = topModels.map(m => dataMap[m].channels[ch] || 0);
             if (dataPoints.some(v => v > 0)) {
                 datasets.push({
                     label: ch,
                     data: dataPoints,
                     backgroundColor: colorsChannel[chIdx % colorsChannel.length],
                     borderRadius: 4
                 });
                 chIdx++;
             }
          });
          
          if(this.charts[canvasId]) this.charts[canvasId].destroy();
          const ctx = document.getElementById(canvasId);
          if(ctx) {
            this.charts[canvasId] = new Chart(ctx.getContext('2d'), {
                type: 'bar',
                data: { labels: topModels, datasets: datasets },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    indexAxis: 'y',
                    scales: { 
                        x: { stacked: true, grid: { color: '#f1f5f9' }, grace: '15%' }, 
                        y: { stacked: true, grid: { display: false }, ticks: { font: { family: 'Prompt', size: 10 } } } 
                    },
                    plugins: {
                        legend: { display: true, position: 'top', labels: { font: { family: 'Prompt' } } },
                        datalabels: {
                            color: '#fff',
                            font: { family: 'Prompt', weight: 'bold', size: 10 },
                            anchor: 'center',
                            align: 'center',
                            formatter: (val) => val > 0 ? val : ''
                        }
                    }
                }
            });
          }
      };

      renderStackedChart('chartChannelModelMobile', channelModelDataMobile, allChannelsMobile);
      renderStackedChart('chartChannelModelAcc', channelModelDataAcc, allChannelsAcc);
    },
    renderInterestsTable: function() {
      const tbody = document.getElementById('tableInterestsBody'); if(!tbody) return;
      let tbodyHtml = ''; let counts = {}; let totalInterests = 0; const ordersById = {};
      this.filteredOrders.forEach(o => {
        if(o['Order Status'] !== 'Cancelled') {
           if(!ordersById[o.OrderID]) ordersById[o.OrderID] = [];
           ordersById[o.OrderID].push(o);
        }
      });
      
      const validCat = ['โมบาย', 'อุปกรณ์เสริม'];
      Object.values(ordersById).forEach(orderLines => {
         let hasDevice = orderLines.some(x => x.Category && validCat.includes(x.Category.toString().trim()));
         if(hasDevice) {
             let firstRow = orderLines.find(r => r['Customer Interests'] && r['Customer Interests'].trim() !== ""); 
             if(firstRow) {
                 firstRow['Customer Interests'].split(',').forEach(i => {
                    let interest = i.trim();
                    if (interest) { counts[interest] = (counts[interest] || 0) + 1; totalInterests++; }
                 });
             }
         }
      });
      const sorted = Object.keys(counts).sort((a,b) => counts[b]-counts[a]);
      if(sorted.length===0){ tbody.innerHTML='<tr><td colspan="3" class="text-center p-6 text-slate-400">ไม่มีข้อมูลความสนใจ</td></tr>'; return; }
      sorted.forEach(k => { 
          let p = ((counts[k]/totalInterests)*100).toFixed(1); 
          tbodyHtml +='<tr class="hover:bg-slate-50 transition-colors"><td class="py-4 px-4 text-slate-700 font-medium whitespace-nowrap">'+k+'</td><td class="py-4 px-4 text-center font-black text-indigo-600 whitespace-nowrap">'+counts[k]+'</td><td class="py-4 px-4 text-center whitespace-nowrap"><div class="flex items-center gap-2 justify-end"><span class="text-xs text-slate-500 w-8 text-right">'+p+'%</span><div class="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div class="bg-indigo-500 h-full rounded-full" style="width:'+p+'%"></div></div></div></td></tr>'; 
      });
      tbody.innerHTML = tbodyHtml;
    },
    createChart: function(id, type, lbls, data, lblName='Data', col=null, isHoriz=false) {
      if(window.app.dashboard.charts[id]) window.app.dashboard.charts[id].destroy();
      const el = document.getElementById(id); if(!el) return;
      const ctx = el.getContext('2d');
      
      const themeColor = col || '#4f46e5';
      let datasetConfig = {
        label: lblName,
        data: data,
        borderWidth: type === 'line' ? 2.5 : 0,
        borderRadius: type === 'bar' ? (isHoriz ? [0, 8, 8, 0] : [8, 8, 0, 0]) : 0
      };
      
      if (type === 'line') {
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, hexToRgba(themeColor, 0.18));
        gradient.addColorStop(1, hexToRgba(themeColor, 0.0));
        
        datasetConfig.borderColor = themeColor;
        datasetConfig.backgroundColor = gradient;
        datasetConfig.fill = true;
        datasetConfig.tension = 0.4;
        datasetConfig.pointBackgroundColor = '#ffffff';
        datasetConfig.pointBorderColor = themeColor;
        datasetConfig.pointBorderWidth = 2;
        datasetConfig.pointRadius = 4;
        datasetConfig.pointHoverRadius = 6;
      } else {
        datasetConfig.backgroundColor = themeColor;
      }
      
      function hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }

      window.app.dashboard.charts[id] = new Chart(ctx, {
        type: type,
        data: {
          labels: lbls,
          datasets: [datasetConfig]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: isHoriz ? 'y' : 'x',
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#0f172a',
              titleFont: { family: 'Prompt', size: 12, weight: '700' },
              bodyFont: { family: 'Prompt', size: 11, weight: '400' },
              padding: 10,
              cornerRadius: 10,
              displayColors: false,
              titleColor: '#ffffff',
              bodyColor: '#e2e8f0'
            }
          },
          scales: {
            y: {
              grid: { color: 'rgba(226, 232, 240, 0.4)', drawBorder: false },
              ticks: {
                color: '#64748b',
                font: { family: 'Prompt', size: 10, weight: '500' }
              },
              grace: '15%'
            },
            x: {
              grid: { display: false, drawBorder: false },
              ticks: {
                color: '#64748b',
                font: { family: 'Prompt', size: 10, weight: '500' }
              },
              grace: '15%'
            }
          }
        }
      });
    },
    switchTab: function(tabId) {
      document.querySelectorAll('.dash-tab-content').forEach(el => el.classList.add('hidden'));
      document.querySelectorAll('.dash-tab').forEach(btn => {
        btn.classList.remove('text-indigo-600', 'border-indigo-600', 'font-bold');
        btn.classList.add('text-slate-500', 'border-transparent', 'font-semibold');
      });
      
      const activeContent = document.getElementById('tab-content-' + tabId);
      if(activeContent) activeContent.classList.remove('hidden');
      
      const activeBtn = document.getElementById('tab-btn-' + tabId);
      if(activeBtn) {
        activeBtn.classList.remove('text-slate-500', 'border-transparent', 'font-semibold');
        activeBtn.classList.add('text-indigo-600', 'border-indigo-600', 'font-bold');
      }
      
      // Re-render charts for active tab to adjust sizing correctly
      this.renderCharts();
    },
    exportCSV: function() {
      if(window.app.dashboard.filteredOrders.length===0) return Swal.fire('ไม่มีข้อมูล', '', 'warning');
      const headers = Object.keys(window.app.dashboard.filteredOrders[0]); 
      let csvContent = "\uFEFF" + headers.join(",") + "\r\n";
      window.app.dashboard.filteredOrders.forEach(row => { 
        csvContent += headers.map(h => '"' + (row[h]?row[h].toString().replace(/"/g, '""'):"") + '"').join(",") + "\r\n"; 
      });
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const lnk = document.createElement("a"); 
      lnk.href = url; 
      lnk.download = 'Report_' + new Date().toISOString().split('T')[0] + '.csv'; 
      document.body.appendChild(lnk); 
      lnk.click(); 
      document.body.removeChild(lnk);
    }
  },

  pos: {
    cartData: [],
    currentImages: [],
    currentImageIndex: 0,
    countdownInterval: null,
    isBookingBlocked: false,
    bookingBlockedMessage: '',
    
    startCountdown: function() {
      if (this.countdownInterval) clearInterval(this.countdownInterval);
      
      const timerBanner = document.getElementById('posTimerBanner');
      const periodText = document.getElementById('posTimerPeriodText');
      const timerDisplay = document.getElementById('posTimerCountdownDisplay');
      const timerBadge = document.getElementById('posTimerBadge');
      
      if (!timerBanner || !timerDisplay) return;
      
      const settings = window.app.globalData.settings || {};
      const startStr = settings.ReserveStart;
      const endStr = settings.ReserveEnd;
      
      if (!startStr || !endStr) {
        timerBanner.classList.add('hidden');
        return;
      }
      
      timerBanner.classList.remove('hidden');
      
      const startDate = new Date(startStr);
      const endDate = new Date(endStr);
      
      const options = { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' };
      const startFormatted = isNaN(startDate.getTime()) ? startStr : startDate.toLocaleDateString('th-TH', options);
      const endFormatted = isNaN(endDate.getTime()) ? endStr : endDate.toLocaleDateString('th-TH', options);
      if (periodText) periodText.innerText = `${startFormatted} - ${endFormatted}`;
      
      const updateTimer = () => {
        const now = new Date();
        
        if (now < startDate) {
          if (timerBadge) {
            timerBadge.innerText = 'สถานะ';
            timerBadge.className = 'text-xs font-bold text-amber-500 mr-2 uppercase tracking-wide';
          }
          timerDisplay.innerHTML = `
            <div class="px-3 py-1.5 rounded-xl bg-amber-500 text-white font-bold text-[11px] flex items-center gap-1.5 shadow-sm">
              <i class="fas fa-lock"></i> ยังไม่เปิดจอง
            </div>
          `;
          this.togglePOSBookingBlock(true, 'ยังไม่เปิดให้บริการจองสินค้า');
        } else if (now > endDate) {
          if (timerBadge) {
            timerBadge.innerText = 'สถานะ';
            timerBadge.className = 'text-xs font-bold text-rose-500 mr-2 uppercase tracking-wide';
          }
          timerDisplay.innerHTML = `
            <div class="px-3 py-1.5 rounded-xl bg-rose-500 text-white font-bold text-[11px] flex items-center gap-1.5 shadow-sm">
              <i class="fas fa-lock"></i> สิ้นสุดเวลาจองแล้ว
            </div>
          `;
          this.togglePOSBookingBlock(true, 'สิ้นสุดระยะเวลารับจองสินค้าแล้ว');
        } else {
          if (timerBadge) {
            timerBadge.innerText = 'เหลือเวลาจอง';
            timerBadge.className = 'text-[10px] font-bold text-indigo-600 mr-2 uppercase tracking-wide animate-pulse';
          }
          
          const diff = endDate - now;
          const days = Math.floor(diff / (1000 * 60 * 60 * 24));
          const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const secs = Math.floor((diff % (1000 * 60)) / 1000);
          
          timerDisplay.innerHTML = `
            <div class="flex items-center gap-1.5">
              <div class="flex flex-col items-center bg-slate-900 text-white px-2 py-0.5 rounded-lg shadow-sm min-w-[32px]">
                <span class="text-xs font-black">${String(days).padStart(2, '0')}</span>
                <span class="text-[7px] text-slate-400 font-bold uppercase -mt-0.5">วัน</span>
              </div>
              <div class="text-slate-400 font-bold text-xs">:</div>
              <div class="flex flex-col items-center bg-slate-900 text-white px-2 py-0.5 rounded-lg shadow-sm min-w-[32px]">
                <span class="text-xs font-black">${String(hours).padStart(2, '0')}</span>
                <span class="text-[7px] text-slate-400 font-bold uppercase -mt-0.5">ชม.</span>
              </div>
              <div class="text-slate-400 font-bold text-xs">:</div>
              <div class="flex flex-col items-center bg-slate-900 text-white px-2 py-0.5 rounded-lg shadow-sm min-w-[32px]">
                <span class="text-xs font-black">${String(mins).padStart(2, '0')}</span>
                <span class="text-[7px] text-slate-400 font-bold uppercase -mt-0.5">น.</span>
              </div>
              <div class="text-slate-400 font-bold text-xs">:</div>
              <div class="flex flex-col items-center bg-slate-950 text-rose-500 px-2 py-0.5 rounded-lg shadow-sm min-w-[32px] border border-rose-500/10">
                <span class="text-xs font-black">${String(secs).padStart(2, '0')}</span>
                <span class="text-[7px] text-rose-400 font-bold uppercase -mt-0.5">วิ.</span>
              </div>
            </div>
          `;
          
          this.togglePOSBookingBlock(false);
        }
      };
      
      updateTimer();
      this.countdownInterval = setInterval(updateTimer, 1000);
    },
    
    togglePOSBookingBlock: function(isBlocked, message = '') {
      this.isBookingBlocked = isBlocked;
      this.bookingBlockedMessage = message;
      
      const overlay = document.getElementById('bookingBlockOverlay');
      const titleEl = document.getElementById('bookingBlockTitle');
      if (overlay) {
        if (isBlocked) {
          if (titleEl) titleEl.innerText = message;
          overlay.classList.remove('hidden');
          setTimeout(() => overlay.style.opacity = '1', 10);
        } else {
          overlay.style.opacity = '0';
          setTimeout(() => overlay.classList.add('hidden'), 300);
        }
      }
      
      const checkoutBtn = document.querySelector('[onclick="window.app.pos.openCheckoutModal()"]');
      if (checkoutBtn) {
        if (isBlocked) {
          checkoutBtn.disabled = true;
          checkoutBtn.className = 'w-full bg-slate-200 text-slate-400 text-sm font-bold py-3 rounded-xl cursor-not-allowed transition-all flex items-center justify-center';
        } else {
          checkoutBtn.disabled = false;
          checkoutBtn.className = 'w-full bg-slate-900 hover:bg-black text-white text-sm font-bold py-3 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center group';
        }
      }
    },

    init: function() {
      const c = localStorage.getItem('tg_cart'); if(c) this.cartData = JSON.parse(c);
      const chSel = document.getElementById('posChannelSelect'); const bSel = document.getElementById('posBranchSelect');
      if(!chSel || !bSel) return;
      
      if(window.app.user.Role === 'Sales') {
        chSel.innerHTML = '<option value="' + window.app.user.Channel + '">' + window.app.user.Channel + '</option>';
        bSel.innerHTML = '<option value="' + window.app.user['Branch Code'] + '">' + window.app.user['Branch Name'] + ' (' + window.app.user['Branch Code'] + ')</option>';
        chSel.disabled = true; bSel.disabled = true;
      } else {
        const channels = [...new Set(window.app.globalData.branches.map(b => b.Channel))].filter(Boolean);
        let chHtml = '<option value="">-- เลือกช่องทาง --</option>'; 
        channels.forEach(ch=>{ chHtml += '<option value="' + ch + '">' + ch + '</option>'; });
        chSel.innerHTML = chHtml;
        

        bSel.innerHTML='<option value="">-- เลือกช่องทางก่อน --</option>'; 
        chSel.disabled = false; bSel.disabled = false;
      }
      this.populateSelects(); this.renderProducts(window.app.globalData.products); this.renderCart(); this.checkCriteria();
      this.startCountdown();
    },
    populateSelects: function() {
      const pContainer = document.getElementById('cartPromosContainer');
      if(pContainer) {
        pContainer.innerHTML = '';
        this.addPromoRow();
      }
      const intContainer=document.getElementById('dynamicInterests'); 
      if(intContainer) { 
          let intHtml = ''; 
          window.app.globalData.interests.forEach((i, idx)=>{ if(i.Status==='เปิด') intHtml += '<div class="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors bg-white"><label class="flex items-center space-x-3 cursor-pointer w-full"><input type="checkbox" class="form-check-input w-5 h-5 text-indigo-600 bg-slate-100 border-slate-300 rounded focus:ring-indigo-500" id="chkInt' + idx + '" value="' + i['Interest Name'] + '"><span class="text-sm font-bold text-slate-700 select-none">' + i['Interest Name'] + '</span></label></div>'; }); 
          intContainer.innerHTML = intHtml;
      }
    },
    addPromoRow: function() {
      const container = document.getElementById('cartPromosContainer');
      if(!container) return;
      
      const row = document.createElement('div');
      row.className = 'flex items-center gap-2 mb-2 animate-fade-in';
      
      let optionsHtml = '<option value="">-- ไม่ใช้ส่วนลด --</option>';
      window.app.globalData.promotions.forEach(p => {
        if(p.Status === 'เปิด') {
          optionsHtml += `<option value="${p.Value}">${p['Promo Name']}</option>`;
        }
      });
      
      row.innerHTML = `
        <select class="cart-promo-select flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-all" onchange="window.app.pos.updateTotal()">
           ${optionsHtml}
        </select>
        <button type="button" onclick="window.app.pos.removePromoRow(this)" class="w-8 h-8 flex items-center justify-center text-rose-500 bg-rose-50 hover:bg-rose-100 rounded-xl border border-rose-100 transition-colors shrink-0 shadow-sm" title="ลบส่วนลดนี้">
           <i class="fas fa-trash-alt text-[0.7rem]"></i>
        </button>
      `;
      
      container.appendChild(row);
      this.updateTotal();
    },
    removePromoRow: function(btn) {
      const row = btn.parentElement;
      if(row) {
        row.remove();
      }
      this.updateTotal();
    },
    onChannelChange: function() {
      const ch = document.getElementById('posChannelSelect').value; const bSel = document.getElementById('posBranchSelect');
      if(!bSel) return;
      let bHtml = '<option value="">-- กรุณาเลือกสาขา --</option>';
      if(ch) { window.app.globalData.branches.filter(b => b.Channel === ch).forEach(b => { bHtml += '<option value="' + b['Branch Code'] + '">' + b['Branch Name'] + ' (' + b['Branch Code'] + ')</option>'; }); }
      bSel.innerHTML = bHtml;
      
      
      this.checkCriteria(); this.filter();
    },
    checkCriteria: function() {
      const ch = document.getElementById('posChannelSelect'); const br = document.getElementById('posBranchSelect'); const ov = document.getElementById('criteriaOverlay');
      if(!ch || !br || !ov) return;
      if(ch.value && br.value) {
          ov.style.opacity = '0'; setTimeout(()=>ov.classList.add('hidden'), 300);
      } else {
          ov.classList.remove('hidden'); setTimeout(()=>ov.style.opacity = '1', 10);
      }
    },
    filter: function() {
      const searchEl = document.getElementById('searchProduct');
      if(!searchEl) return;
      const term = searchEl.value.toLowerCase();
      const currentChannel = document.getElementById('posChannelSelect').value;
      window.app.globalData.products = window.app.globalData.products || [];
      this.renderProducts(window.app.globalData.products.filter(p => {
        const matchType = p.Status==='เปิด'; 
        const matchSearch = (p['Product Name']||'').toLowerCase().includes(term)||(p.SKU||'').toString().toLowerCase().includes(term);
        const matchChannel = (currentChannel && p.Channel) ? p.Channel.includes(currentChannel) : true;
        return matchType && matchSearch && matchChannel;
      }));
    },
    renderProducts: function(products) {
      const row = document.getElementById('productGrid'); 
      if(!row) return;
      
      const searchEl = document.getElementById('searchProduct');
      if(products.length === 0 && searchEl && searchEl.value === '') {
         let skel = '<div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">';
         for(let k=0; k<12; k++) { skel += '<div class="bg-white border border-slate-100 p-3 rounded-2xl shadow-sm"><div class="skeleton mb-4" style="height:100px; width:100%;"></div><div class="skeleton mb-3" style="height:12px; width:80%;"></div><div class="skeleton" style="height:14px; width:40%;"></div></div>'; }
         skel += '</div>'; row.innerHTML = skel; return;
      }

      // Group products
      const grouped = {};
      const renderedList = [];
      products.forEach(p => {
        if(p.Status !== 'เปิด') return;
        const isGift = (p.Category||'').includes('ของแถม');
        
        if (!isGift && p.Model && p.Model !== '-' && p.Model !== '') {
            if (!grouped[p.Model]) {
                grouped[p.Model] = {
                    isGroup: true,
                    Model: p.Model,
                    'Product Name': p.Model,
                    Category: p.Category,
                    Price: p.Price,
                    'Image URL': p['Image URL'],
                    Stock: 0,
                    products: []
                };
                renderedList.push(grouped[p.Model]);
            }
            grouped[p.Model].products.push(p);
            grouped[p.Model].Stock += (parseInt(p.Stock) || 0);
            
            let currMin = parseFloat((grouped[p.Model].Price||'0').toString().replace(/,/g,'')) || 0;
            let pPrice = parseFloat((p.Price||'0').toString().replace(/,/g,'')) || 0;
            if (pPrice < currMin || currMin === 0) grouped[p.Model].Price = p.Price;
        } else {
            renderedList.push(p);
        }
      });

      let html = '<div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 pb-6">';
      renderedList.forEach(p => {
        const isGift = (p.Category||'').includes('ของแถม');
        const price = p.Price ? parseFloat(p.Price.toString().replace(/,/g,'')).toLocaleString() : '0';
        
        let stockHtml = '';
        if(p.Stock > 5) stockHtml = '<div class="w-full text-center py-2 mt-auto border-t border-slate-100 bg-emerald-50 text-emerald-600 text-[0.7rem] font-bold">มีสินค้า: ' + p.Stock + '</div>';
        else if(p.Stock > 0) stockHtml = '<div class="w-full text-center py-2 mt-auto border-t border-slate-100 bg-amber-50 text-amber-600 text-[0.7rem] font-bold">ใกล้หมด: ' + p.Stock + '</div>';
        else stockHtml = '<div class="w-full text-center py-2 mt-auto border-t border-slate-100 bg-rose-50 text-rose-600 text-[0.7rem] font-bold">สินค้าหมดแล้ว</div>';

        const imgUrl = window.app.formatImageUrl(p['Image URL']);
        const clickAction = isGift ? '' : (p.isGroup ? 'onclick="window.app.pos.openAddToCartModal(\'MODEL:' + p.Model.replace(/'/g, "\\'") + '\')"' : 'onclick="window.app.pos.openAddToCartModal(\'' + p.SKU + '\')"');
        const cursorStyle = isGift ? 'cursor-default opacity-80 bg-slate-50' : 'cursor-pointer product-card-hover';
        const giftTag = isGift ? '<div class="absolute top-3 left-3 px-2 py-1 bg-slate-200 text-slate-600 text-[0.6rem] font-bold rounded-lg z-10 shadow-sm">สินค้าแถม</div>' : '';

        html += '<div class="relative flex flex-col h-full bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm ' + cursorStyle + '" ' + clickAction + '>';
        html +=      giftTag;
        html += '    <div class="h-[120px] p-[10px] flex items-center justify-center border-b border-slate-50">';
        html += '       <img src="' + imgUrl + '" loading="lazy" onerror="this.onerror=null;this.src=\'https://via.placeholder.com/150?text=No+Image\';" alt="' + p['Product Name'] + '" class="max-h-full max-w-full object-contain hover:scale-105 transition-transform duration-300">';
        html += '    </div>';
        html += '    <div class="p-3 flex flex-col flex-1">';
        html += '      <div class="font-bold text-slate-700 text-[11px] md:text-sm mb-2 line-clamp-3 leading-tight" title="' + p['Product Name'] + '">' + p['Product Name'] + '</div>';
        html += '      <div class="text-indigo-600 font-black text-base mt-auto">' + (p.isGroup ? 'เริ่มต้น ฿' : '฿') + price + '</div>';
        html += '    </div>';
        html +=      stockHtml;
        html += '</div>';
      });
      html += '</div>';
      row.innerHTML = html;
    },
    openAddToCartModal: function(id) {
      if (this.isBookingBlocked) {
        return Swal.fire('ไม่สามารถดำเนินการได้', this.bookingBlockedMessage || 'ไม่อยู่ในช่วงเวลาการจองสินค้า', 'warning');
      }
      
      const modalVarSel = document.getElementById('modalVariantSelection');
      let isModelGroup = id.startsWith('MODEL:');
      let prod = null;
      let groupProducts = [];
      
      if (isModelGroup) {
          let modelName = id.substring(6);
          // Only show variants that are in current channel and active
          const currentChannel = document.getElementById('posChannelSelect').value;
          groupProducts = window.app.globalData.products.filter(p => p.Model === modelName && p.Status === 'เปิด' && (!currentChannel || !p.Channel || p.Channel.includes(currentChannel)));
          if (groupProducts.length === 0) return Swal.fire('สินค้าหมด', 'สินค้ารุ่นนี้ไม่มีสต๊อกในระบบสำหรับช่องทางที่เลือก', 'warning');
          
          prod = groupProducts[0]; 
          if (modalVarSel) modalVarSel.classList.remove('hidden');
          this.currentGroupProducts = groupProducts;
          this.renderVariantOptions(prod.Capacity, prod.Color);
          
      } else {
          prod = window.app.globalData.products.find(p=>p.SKU==id); 
          if(!prod||prod.Stock<=0) return Swal.fire('สินค้าหมด','สินค้าชิ้นนี้ไม่มีสต๊อกในระบบ','warning');
          if (modalVarSel) modalVarSel.classList.add('hidden');
          this.currentGroupProducts = null;
          this.updateModalWithProduct(prod);
      }
      
      if(prod && prod.Category === 'โมบาย') {
         let mobileCount = this.cartData.filter(i => i.Category === 'โมบาย').reduce((sum, i) => sum + i.qty, 0);
         if(mobileCount >= 1) {
             return Swal.fire('สิทธิ์ออเดอร์เต็ม', 'สามารถทำรายการจองสินค้าประเภท โมบาย ได้เพียง 1 เครื่อง ต่อ 1 ออเดอร์เท่านั้น', 'warning');
         }
      }

      window.app.showModal('addToCartModal');
    },
    renderVariantOptions: function(selectedCapacity, selectedColor) {
        const groupProducts = this.currentGroupProducts;
        if (!groupProducts) return;
        
        const capacities = [...new Set(groupProducts.map(p => p.Capacity).filter(c => c && c !== '-'))];
        if (capacities.length > 0 && !capacities.includes(selectedCapacity)) selectedCapacity = capacities[0];
        
        let capHtml = '';
        capacities.forEach(cap => {
            let isSelected = cap === selectedCapacity;
            let btnClass = isSelected ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400 hover:text-indigo-600';
            capHtml += `<button type="button" class="px-2 md:px-2.5 py-1 md:py-1.5 border rounded-lg text-[9px] md:text-[10px] font-bold transition-all ${btnClass}" onclick="window.app.pos.selectVariant('${cap}', '${selectedColor}')">${cap}</button>`;
        });
        document.getElementById('modalCapacityOptions').innerHTML = capHtml || '<span class="text-[9px] md:text-[10px] text-slate-400">ไม่มีตัวเลือกความจุ</span>';
        
        const productsForCap = groupProducts.filter(p => (!selectedCapacity || p.Capacity === selectedCapacity));
        const colors = [...new Set(productsForCap.map(p => p.Color).filter(c => c && c !== '-'))];
        
        if (colors.length > 0 && !colors.includes(selectedColor)) selectedColor = colors[0];
        
        let colHtml = '';
        colors.forEach(col => {
            let isSelected = col === selectedColor;
            let p = productsForCap.find(x => x.Color === col);
            let outOfStock = p && p.Stock <= 0;
            
            let btnClass = '';
            if (outOfStock) {
                btnClass = 'bg-slate-100 text-slate-400 border-slate-200 opacity-60 cursor-not-allowed';
                colHtml += `<button type="button" class="px-2 md:px-2.5 py-1 md:py-1.5 border rounded-lg text-[9px] md:text-[10px] font-bold transition-all ${btnClass}" disabled>${col}</button>`;
            } else {
                btnClass = isSelected ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400 hover:text-indigo-600';
                colHtml += `<button type="button" class="px-2 md:px-2.5 py-1 md:py-1.5 border rounded-lg text-[9px] md:text-[10px] font-bold transition-all ${btnClass}" onclick="window.app.pos.selectVariant('${selectedCapacity}', '${col}')">${col}</button>`;
            }
        });
        document.getElementById('modalColorOptions').innerHTML = colHtml || '<span class="text-[9px] md:text-[10px] text-slate-400">ไม่มีตัวเลือกสี</span>';
        
        let targetProduct = productsForCap.find(p => p.Color === selectedColor) || productsForCap[0] || groupProducts[0];
        this.updateModalWithProduct(targetProduct);
    },
    selectVariant: function(capacity, color) {
        this.renderVariantOptions(capacity, color);
    },
    setModalImage: function(index) {
        if (!this.currentImages || this.currentImages.length === 0) return;
        if (index < 0) index = this.currentImages.length - 1;
        if (index >= this.currentImages.length) index = 0;
        this.currentImageIndex = index;
        
        document.getElementById('modalProdImg').src = this.currentImages[index];
        
        const thumbContainer = document.getElementById('modalThumbnails');
        if (thumbContainer && this.currentImages.length > 1) {
            Array.from(thumbContainer.children).forEach((img, i) => {
                if (i === index) {
                    img.classList.add('border-indigo-500', 'scale-105');
                    img.classList.remove('border-slate-200');
                } else {
                    img.classList.remove('border-indigo-500', 'scale-105');
                    img.classList.add('border-slate-200');
                }
            });
        }
    },
    prevImage: function(e) { if(e) e.stopPropagation(); this.setModalImage(this.currentImageIndex - 1); },
    nextImage: function(e) { if(e) e.stopPropagation(); this.setModalImage(this.currentImageIndex + 1); },
    updateModalWithProduct: function(prod) {
      if (!prod) return;
      document.getElementById('modalProdSKU').value = prod.SKU; 
      document.getElementById('modalProdName').innerText = prod['Product Name']; 
      document.getElementById('modalProdPrice').innerText = '฿' + (prod.Price ? parseFloat(prod.Price.toString().replace(/,/g,'')).toLocaleString() : '0'); 
      document.getElementById('modalProdStock').innerText = '(มีสินค้า: ' + prod.Stock + ')'; 
      document.getElementById('modalProdQty').value = 1; 
      document.getElementById('modalProdQty').max = (prod.Category === 'โมบาย') ? 1 : prod.Stock; 
      this.currentImages = window.app.parseImageUrls(prod['Image URL']);
      
      const thumbContainer = document.getElementById('modalThumbnails');
      const btnPrev = document.getElementById('btnPrevImg');
      const btnNext = document.getElementById('btnNextImg');
      
      if (thumbContainer) {
          if (this.currentImages.length > 1) {
              thumbContainer.innerHTML = this.currentImages.map((u, i) => `<img src="${u}" onclick="window.app.pos.setModalImage(${i})" class="w-12 h-12 md:w-16 md:h-16 object-cover rounded-xl border-2 border-slate-200 hover:border-indigo-500 cursor-pointer shadow-sm transition-all">`).join('');
              thumbContainer.classList.remove('hidden');
              if(btnPrev) btnPrev.classList.remove('hidden');
              if(btnNext) btnNext.classList.remove('hidden');
          } else {
              thumbContainer.innerHTML = '';
              thumbContainer.classList.add('hidden');
              if(btnPrev) btnPrev.classList.add('hidden');
              if(btnNext) btnNext.classList.add('hidden');
          }
      }
      this.setModalImage(0);
      
      const bGifts = document.getElementById('modalBrandGifts'); 
      const cGifts = document.getElementById('modalChannelGifts');
      const currentChannel = document.getElementById('posChannelSelect').value;
      const sku = prod.SKU;
      
      let bGiftsHTML = '';
      let cGiftsHTML = '';

      let allowedBrandGifts = [];
      let allowedChannelGifts = [];
      let hasMapping = false;

      const mappings = (window.app.globalData.giftMappings || []).filter(m => {
          if(m.Status !== 'เปิด') return false;
          const mCh = (m.Channel || '').trim().toLowerCase();
          const chMatch = (mCh === 'all' || mCh === '' || mCh.includes(currentChannel.toLowerCase()));
          if(!chMatch) return false;

          const target = (m['Target Mobile (SKU or Group)'] || '').trim();
          const skuLower = sku.toLowerCase();
          const groupLower = (prod['Product Group'] || '').trim().toLowerCase();
          
          if (target === '*' || target.toUpperCase() === 'ALL') return true;
          
          const targets = target.split(',').map(t => t.trim().toLowerCase());
          return targets.some(t => {
              if (t === skuLower) return true; 
              if (t === groupLower && groupLower !== '') return true; 
              if (t.includes('*')) {
                  const regexStr = '^' + t.replace(/\*/g, '.*') + '$';
                  try { if (new RegExp(regexStr).test(skuLower)) return true; } catch(e){}
              }
              return false;
          });
      });

      if (mappings.length > 0) {
          hasMapping = true;
          mappings.forEach(m => {
              if(m['Brand Gifts']) allowedBrandGifts.push(...m['Brand Gifts'].split(',').map(s=>s.trim().toLowerCase()).filter(s=>s!==''));
              if(m['Channel Gifts']) allowedChannelGifts.push(...m['Channel Gifts'].split(',').map(s=>s.trim().toLowerCase()).filter(s=>s!==''));
          });
      }

      window.app.globalData.products.forEach((p, idx)=>{ 
        if(p.Status==='เปิด'){ 
          let pNameLower = p['Product Name'].toLowerCase();
          
          if(p.Category==='ของแถมแบรนด์' && hasMapping && allowedBrandGifts.some(g => g === '*' || pNameLower.includes(g))) {
            bGiftsHTML += `<div class="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 shadow-sm mb-2 hover:bg-slate-50 transition-colors"><input class="w-3.5 h-3.5 md:w-4 md:h-4 text-emerald-500 bg-slate-50 border-slate-300 rounded focus:ring-emerald-500 cursor-pointer shrink-0" type="checkbox" value="${p['Product Name'].replace(/"/g, '&quot;')}" id="bgift${idx}" onchange="document.getElementById('bgiftQty${idx}').disabled = !this.checked"><label class="flex-1 text-[9px] md:text-[10px] font-normal text-slate-700 break-words whitespace-normal cursor-pointer select-none" for="bgift${idx}">${p['Product Name']} <span class="text-emerald-600 font-bold ml-1">(คงเหลือ ${p.Stock})</span></label><input type="number" id="bgiftQty${idx}" class="w-12 md:w-14 px-1.5 py-1 text-[10px] md:text-[11px] font-bold text-center border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white shrink-0" value="1" min="1" max="${p.Stock}" disabled></div>`; 
          } 
          else if(p.Category==='ของแถมช่องทาง' && hasMapping && allowedChannelGifts.some(g => g === '*' || pNameLower.includes(g))) {
            cGiftsHTML += `<div class="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 shadow-sm mb-2 hover:bg-slate-50 transition-colors"><input class="w-3.5 h-3.5 md:w-4 md:h-4 text-indigo-500 bg-slate-50 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer shrink-0" type="checkbox" value="${p['Product Name'].replace(/"/g, '&quot;')}" id="cgift${idx}" onchange="document.getElementById('cgiftQty${idx}').disabled = !this.checked"><label class="flex-1 text-[9px] md:text-[10px] font-normal text-slate-700 break-words whitespace-normal cursor-pointer select-none" for="cgift${idx}">${p['Product Name']} <span class="text-indigo-600 font-bold ml-1">(คงเหลือ ${p.Stock})</span></label><input type="number" id="cgiftQty${idx}" class="w-12 md:w-14 px-1.5 py-1 text-[10px] md:text-[11px] font-bold text-center border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white shrink-0" value="1" min="1" max="${p.Stock}" disabled></div>`; 
          }
        } 
      });

      if(!hasMapping || bGiftsHTML === '') bGiftsHTML = '<div class="text-sm font-medium text-slate-400 p-4 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">ไม่มีของแถมสำหรับสินค้ารุ่นนี้</div>';
      if(!hasMapping || cGiftsHTML === '') cGiftsHTML = '<div class="text-sm font-medium text-slate-400 p-4 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">ไม่มีของแถมสำหรับสินค้ารุ่นนี้</div>';

      if(bGifts) bGifts.innerHTML = bGiftsHTML;
      if(cGifts) cGifts.innerHTML = cGiftsHTML;
    },
    confirmAddToCart: function() {
      if (this.isBookingBlocked) {
        return Swal.fire('ไม่สามารถดำเนินการได้', this.bookingBlockedMessage || 'ไม่อยู่ในช่วงเวลาการจองสินค้า', 'warning');
      }
      const sku=document.getElementById('modalProdSKU').value; const qty=parseInt(document.getElementById('modalProdQty').value); 
      const p = window.app.globalData.products.find(x=>x.SKU==sku); 
      
      if (p.Category === 'โมบาย') {
          let currentMobileQty = this.cartData.filter(i => i.Category === 'โมบาย').reduce((sum, i) => sum + i.qty, 0);
          if (currentMobileQty + qty > 1) {
              return Swal.fire('ข้อจำกัดการจอง', 'สินค้าประเภท โมบาย จำกัดสิทธิ์จองได้ออเดอร์ละ 1 เครื่อง', 'warning');
          }
      }

      const bGifts = []; let giftError = false;
      const modelCounts = {};
      
      document.querySelectorAll('#modalBrandGifts input[type="checkbox"]:checked').forEach(cb => {
         const gQty = parseInt(document.getElementById(cb.id.replace('bgift','bgiftQty')).value) || 1;
         const pData = window.app.globalData.products.find(x => x['Product Name'] === cb.value);
         if (pData) {
            if (gQty > pData.Stock) giftError = true;
            let model = pData.Model || 'UNKNOWN';
            if (model !== '-' && model !== '') {
               if (!modelCounts[model]) modelCounts[model] = 0;
               modelCounts[model] += gQty;
            }
         }
         bGifts.push({name: cb.value, qty: gQty});
      });
      
      const cGifts = [];
      document.querySelectorAll('#modalChannelGifts input[type="checkbox"]:checked').forEach(cb => {
         const gQty = parseInt(document.getElementById(cb.id.replace('cgift','cgiftQty')).value) || 1;
         const pData = window.app.globalData.products.find(x => x['Product Name'] === cb.value);
         if (pData) {
            if (gQty > pData.Stock) giftError = true;
            let model = pData.Model || 'UNKNOWN';
            if (model !== '-' && model !== '') {
               if (!modelCounts[model]) modelCounts[model] = 0;
               modelCounts[model] += gQty;
            }
         }
         cGifts.push({name: cb.value, qty: gQty});
      });

      if (giftError) return Swal.fire('สต๊อกของแถมไม่พอ', 'คุณเลือกจำนวนของแถมเกินกว่าที่มีในคลังคงเหลือ', 'warning');
      
      for (let model in modelCounts) {
         if (modelCounts[model] > 1) {
             return Swal.fire('ข้อจำกัดของแถม', 'ของแถมรุ่นเดียวกัน (' + model + ') สามารถเลือกได้สูงสุด 1 ชิ้นเท่านั้น', 'warning');
         }
      }
      
      const ex = this.cartData.find(i=>i.SKU==sku && JSON.stringify(i.brandGifts)===JSON.stringify(bGifts) && JSON.stringify(i.channelGifts)===JSON.stringify(cGifts));
      if(ex){ if(ex.qty+qty>p.Stock) return Swal.fire('สต๊อกไม่พอ','','warning'); ex.qty+=qty; } 
      else { if(qty>p.Stock) return Swal.fire('สต๊อกไม่พอ','','warning'); this.cartData.unshift({...p, qty:qty, brandGifts:bGifts, channelGifts:cGifts}); }
      
      window.app.hideModal('addToCartModal'); 
      this.saveAndRender();
      Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2500 }).fire({ icon: 'success', title: 'เพิ่มลงตะกร้าแล้ว' });
    },
    updateQtyInCart: function(idx, c) {
      const itm = this.cartData[idx]; const p = window.app.globalData.products.find(x=>x.SKU==itm.SKU); 
      if (c > 0 && p.Category === 'โมบาย') {
          let totalMobile = this.cartData.filter(i => i.Category === 'โมบาย').reduce((sum, i) => sum + i.qty, 0);
          if (totalMobile >= 1) { return Swal.fire('จำกัดจำนวน', 'สินค้าประเภท โมบาย จำกัดสิทธิ์จองได้ออเดอร์ละ 1 เครื่อง', 'warning'); }
      }
      itm.qty+=c;
      if(itm.qty>p.Stock){ itm.qty=p.Stock; Swal.fire('คลังจำกัด','จำนวนสิทธิ์เกินสต๊อกสินค้าหลัก','warning'); } 
      if(itm.qty<=0) this.cartData.splice(idx,1); 
      this.saveAndRender();
    },
    removeCartItem: function(idx) { this.cartData.splice(idx, 1); this.saveAndRender(); },
    saveAndRender: function() { localStorage.setItem('tg_cart', JSON.stringify(this.cartData)); this.renderCart(); this.updateTotal(); },
    renderCart: function() {
      const cD = document.getElementById('cartItems'); const cL = document.getElementById('cartCount'); const flC = document.getElementById('floatingCartCount');
      if(!cD) return;
      if(this.cartData.length===0){ 
          cD.innerHTML='<div class="h-full min-h-[200px] flex flex-col items-center justify-center text-slate-400 opacity-70"><i class="fas fa-shopping-bag text-5xl mb-4"></i><p class="text-sm font-bold uppercase tracking-wider">ยังไม่มีสินค้าในตะกร้า</p></div>'; 
          if(cL) cL.innerText='0'; 
          if(flC) flC.innerText='0';
          return; 
      }
      
      let html=''; let c=0; 
      this.cartData.forEach((i, idx)=>{ 
        c+=i.qty; let gHtml=''; 
        if(i.channelGifts && i.channelGifts.length > 0) {
            gHtml += '<div class="mt-3 p-2 bg-indigo-50/50 rounded-lg"><div class="text-[0.65rem] font-bold text-indigo-500 uppercase tracking-wider mb-1">ของแถมช่องทาง</div>';
            i.channelGifts.forEach(g => gHtml+=`<div class="text-[11px] font-normal text-slate-600 mb-0.5"><i class="fas fa-check text-indigo-400 mr-1 text-[0.6rem]"></i> ` + g.name + (g.qty > 1 ? ` <span class="font-bold text-indigo-600">(x${g.qty})</span>` : '') + `</div>`); 
            gHtml += '</div>';
        }
        if(i.brandGifts && i.brandGifts.length > 0) {
            gHtml += '<div class="mt-2 p-2 bg-emerald-50/50 rounded-lg"><div class="text-[0.65rem] font-bold text-emerald-500 uppercase tracking-wider mb-1">ของแถมแบรนด์</div>';
            i.brandGifts.forEach(g => gHtml+=`<div class="text-[11px] font-normal text-slate-600 mb-0.5"><i class="fas fa-check text-emerald-400 mr-1 text-[0.6rem]"></i> ` + g.name + (g.qty > 1 ? ` <span class="font-bold text-emerald-600">(x${g.qty})</span>` : '') + `</div>`); 
            gHtml += '</div>';
        }
        let pPrice = i.Price ? parseFloat(i.Price.toString().replace(/,/g,'')).toLocaleString() : '0';
        
        html+='<div class="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm mb-4 relative group hover:shadow-md transition-shadow">';
        html+='  <div class="pr-6"><h6 class="text-sm font-bold text-slate-800 leading-tight mb-1">' + i['Product Name'] + '</h6></div>';
        html+=   gHtml;
        html+='  <div class="flex justify-between items-end mt-4 pt-4 border-t border-slate-100">';
        html+='    <div class="text-indigo-600 font-black text-lg">฿' + pPrice + '</div>';
        html+='    <div class="flex bg-slate-50 rounded-xl border border-slate-200 items-center overflow-hidden p-1">';
        html+='      <button class="w-8 h-8 flex items-center justify-center text-slate-500 bg-white rounded-lg shadow-sm hover:bg-slate-100 hover:text-rose-500 transition-colors" onclick="window.app.pos.updateQtyInCart(' + idx + ',-1)"><i class="fas fa-minus text-[0.7rem]"></i></button>';
        html+='      <span class="w-10 text-center text-sm font-black text-slate-800">' + i.qty + '</span>';
        html+='      <button class="w-8 h-8 flex items-center justify-center text-slate-500 bg-white rounded-lg shadow-sm hover:bg-slate-100 hover:text-indigo-500 transition-colors" onclick="window.app.pos.updateQtyInCart(' + idx + ',1)"><i class="fas fa-plus text-[0.7rem]"></i></button>';
        html+='    </div>';
        html+='  </div>';
        html+='  <button class="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-slate-300 hover:text-white hover:bg-rose-500 rounded-lg transition-colors" title="ลบสินค้า" onclick="window.app.pos.removeCartItem(' + idx + ')"><i class="fas fa-trash-alt text-[0.8rem]"></i></button>';
        html+='</div>'; 
      }); 
      cD.innerHTML=html; 
      if(cL) cL.innerText=c;
      if(flC) flC.innerText=c;
    },
    toggleCart: function() {
        const drawer = document.getElementById('cartDrawer');
        const overlay = document.getElementById('cartOverlay');
        if(!drawer || !overlay) return;
        
        if (drawer.classList.contains('translate-x-full')) {
            overlay.classList.remove('hidden');
            setTimeout(() => {
                overlay.classList.remove('opacity-0');
                drawer.classList.remove('translate-x-full');
            }, 10);
        } else {
            drawer.classList.add('translate-x-full');
            overlay.classList.add('opacity-0');
            setTimeout(() => {
                overlay.classList.add('hidden');
            }, 300);
        }
    },
    updateTotal: function() {
      let s = 0; this.cartData.forEach(i=>{ let price = parseFloat((i.Price||'0').toString().replace(/,/g,'')); s += (isNaN(price)?0:price) * i.qty; }); 
      
      let d = 0;
      document.querySelectorAll('.cart-promo-select').forEach(el => {
        let val = parseFloat(el.value || 0);
        if(!isNaN(val)) d += val;
      });
      
      let t = s-d;
      if(document.getElementById('cartSubtotal')) document.getElementById('cartSubtotal').innerText = '฿'+s.toLocaleString(); 
      if(document.getElementById('cartDiscount')) document.getElementById('cartDiscount').innerText = '-฿'+d.toLocaleString(); 
      if(document.getElementById('cartTotal')) document.getElementById('cartTotal').innerText = '฿'+(t>0?t:0).toLocaleString();
    },
    openCheckoutModal: function() {
      if (this.isBookingBlocked) {
        return Swal.fire('ไม่สามารถดำเนินการได้', this.bookingBlockedMessage || 'ไม่อยู่ในช่วงเวลาการจองสินค้า', 'warning');
      }
      const chSel = document.getElementById('posChannelSelect');
      if(this.cartData.length===0 || !chSel || !chSel.value) return Swal.fire('ใบจองว่างเปล่า','กรุณาเลือกสาขาและเลือกสินค้าหลักลงตะกร้าก่อนส่งบันทึก','warning');
      
      const drawer = document.getElementById('cartDrawer');
      if (drawer && !drawer.classList.contains('translate-x-full')) {
          this.toggleCart();
      }
      
      window.app.showModal('checkoutModal');
    },
    submitCheckout: async function() {
      const custName = document.getElementById('coCustomer').value;
      const phone = document.getElementById('coPhone').value;
      const email = document.getElementById('coEmail').value;
      const idCard = document.getElementById('coIdCard').value;
      const bkStaffName = document.getElementById('bkStaffName').value.trim();
      const bkPhone = document.getElementById('bkPhone').value.trim();
      
      if(!custName || !phone || !email || !idCard || !bkStaffName || !bkPhone) { 
          return Swal.fire('ข้อมูลไม่ครบ', 'กรุณากรอกข้อมูลที่มีเครื่องหมาย * ให้ครบถ้วน', 'warning'); 
      }
      
      if(!/^\d{10}$/.test(phone)) {
          return Swal.fire('เบอร์โทรศัพท์ลูกค้าไม่ถูกต้อง', 'กรุณากรอกเบอร์โทรศัพท์เป็นตัวเลข 10 หลักเท่านั้น', 'warning');
      }
      
      if(!email.includes('@')) {
          return Swal.fire('อีเมลไม่ถูกต้อง', 'กรุณากรอกอีเมลให้ถูกต้อง (ต้องมีสัญลักษณ์ @)', 'warning');
      }
      
      if(!/^\d{10}$/.test(bkPhone)) {
          return Swal.fire('เบอร์พนักงานไม่ถูกต้อง', 'กรุณากรอกเบอร์พนักงานเป็นตัวเลข 10 หลักเท่านั้น', 'warning');
      }
      
      let rs=null; document.getElementsByName('resStatus').forEach(r=>{if(r.checked) rs=r.value;}); if(!rs) return Swal.fire('เลือกเงื่อนไขจอง','กรุณาระบุว่าเป็นการจอง T หรือ จอง F','warning');
      
      const discountsList = [];
      let totalDiscountVal = 0;
      document.querySelectorAll('.cart-promo-select').forEach(el => {
        let val = parseFloat(el.value || 0);
        if (val > 0) {
          let name = el.options[el.selectedIndex].text;
          discountsList.push({ name: name, value: val });
          totalDiscountVal += val;
        }
      });
      
      const ints=[]; document.querySelectorAll('#dynamicInterests input[type="checkbox"]:checked').forEach(e=>ints.push(e.value));
      
      const pay = { 
        cart:this.cartData, channel: document.getElementById('posChannelSelect').value, branch: document.getElementById('posBranchSelect').value, 
        customerName: custName, contactPhone: phone, email: email, idCard: idCard, codeHandraiser: document.getElementById('coCodeHandraiser').value,
        customerInterests:ints.join(', '), resStatus:rs, bkStaffName:document.getElementById('bkStaffName').value, bkPhone:document.getElementById('bkPhone').value, remark:document.getElementById('coRemark').value, 
        promo: discountsList.map(x => x.name).join(' + ') || '-', 
        discount: totalDiscountVal,
        discounts: discountsList
      };
      
      window.app.hideModal('checkoutModal'); 
      
      setTimeout(async () => {
          if((await Swal.fire({ title: 'ยืนยันการบันทึกใบจอง?', text: "กรุณาตรวจสอบข้อมูลให้ถูกต้องก่อนกดยืนยันออเดอร์", icon: 'question', showCancelButton: true, confirmButtonColor: '#0f172a', confirmButtonText: 'ยืนยันการจอง', cancelButtonText: 'ย้อนกลับ' })).isConfirmed) {
             window.app.showLoading('กำลังบันทึกข้อมูล...');
             try {
               const res = await window.app.api('CHECKOUT', pay);
               if(res && res.status==='success'){ 
                  Swal.fire('สำเร็จ','จัดเก็บข้อมูลใบจองเข้าระบบเรียบร้อยแล้ว','success'); 
                  window.app.cartData=[]; localStorage.removeItem('tg_cart'); window.app.pos.cartData=[];
                  window.app.pos.saveAndRender(); 
                  ['coCustomer','coPhone','coEmail','coIdCard','coCodeHandraiser','bkStaffName','bkPhone','coRemark'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = ''; });
                  document.getElementsByName('resStatus').forEach(r => r.checked = false);
                  
                  const pContainer = document.getElementById('cartPromosContainer');
                  if(pContainer) {
                    pContainer.innerHTML = '';
                    window.app.pos.addPromoRow();
                  }
                  
                  document.querySelectorAll('#dynamicInterests input[type="checkbox"]').forEach(c=>c.checked=false);
                  const newGlobal = await window.app.api('GET_ALL_DATA', {});
                  if(newGlobal && newGlobal.status === 'success') window.app.globalData = newGlobal;
                  window.app.pos.filter(); 
               } else { Swal.fire('ระบบขัดข้อง',res ? res.message : 'Error', 'error'); }
             } catch(e) { Swal.fire('เกิดข้อผิดพลาด', e.message, 'error'); }
          }
      }, 350);
    }
  },

  grid: {
    tableName: '', idField: '', columns: [], dataList: [], isReadonly: false,
    init: async function(table, idCol, cols, readonly=false) {
      this.tableName = table; this.idField = idCol; this.columns = cols; this.isReadonly = readonly;
      const content = document.getElementById('page-content');
      const tmpl = document.getElementById('tmpl-datagrid');
      if(content && tmpl) content.innerHTML = tmpl.innerHTML;
      const btn = document.getElementById('gridAddBtn');
      if(btn) btn.style.display = (readonly || table==='Orders') ? 'none' : 'flex';
      
      let h = '<tr>'; 
      this.columns.forEach(c => { 
        if(c.type!=='hidden') h+=`<th class="sticky top-0 z-20 bg-slate-100 border-b border-slate-200 py-2.5 px-4 text-left text-[11px] font-bold text-slate-700 whitespace-nowrap shadow-[inset_0_-1px_0_#e2e8f0]">${c.label}</th>`; 
      }); 
      if(!readonly) h += `<th class="sticky top-0 z-20 bg-slate-100 border-b border-slate-200 py-2.5 px-4 text-right text-[11px] font-bold text-slate-700 whitespace-nowrap shadow-[inset_0_-1px_0_#e2e8f0]">จัดการ</th>`;
      h += '</tr>'; 
      const head = document.getElementById('dataGridHead');
      if(head) head.innerHTML = h; 
      this.loadData();
    },
    loadData: async function() {
      window.app.showLoading(); 
      try {
        const res = await window.app.api('GET_TABLE', { tableName: this.tableName }); 
        Swal.close();
        if(res && res.status === 'success') { this.dataList = res.data; this.renderTable(this.dataList); }
        else { Swal.fire('Error', res ? res.message : 'Failed to load', 'error'); }
      } catch(e) { Swal.close(); Swal.fire('Error', 'Failed to load table', 'error'); }
    },
    renderTable: function(data) {
      const tbody = document.getElementById('dataGridBody'); if(!tbody) return;
      let tbodyHtml = '';
      data.forEach((row, index) => {
        let tr = '<tr class="hover:bg-slate-50 transition-colors">';
        this.columns.forEach(c => {
          if(c.type==='hidden') return; let val = row[c.key] || '';
          if(c.key==='Password') val = '********';
          else if(c.key==='Order Status' || c.key==='Status') { 
              let clr = val==='เปิด'||val==='Completed'?'emerald':(val==='Pending'?'amber':'slate'); 
              val=`<span class="px-2.5 py-1 rounded-md text-[10px] font-bold bg-${clr}-100 text-${clr}-700 border border-${clr}-200">${val}</span>`; 
          }
          if(c.key==='Image URL' && val.length>30) val = val.substring(0,30)+'...';
          tr += `<td class="py-2.5 px-4 border-b border-slate-100 text-[11px] text-slate-700 whitespace-nowrap">${val}</td>`;
        });
        if(!this.isReadonly) {
            let act = `<button class="w-8 h-8 rounded-lg bg-white border border-slate-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-colors shadow-sm" onclick="window.app.grid.editForm(${index})" title="แก้ไข"><i class="fas fa-edit"></i></button>`;
            act+=`<button class="w-8 h-8 rounded-lg bg-white border border-slate-200 text-rose-500 hover:bg-rose-50 hover:border-rose-200 transition-colors shadow-sm ml-2" onclick="window.app.grid.deleteRecord('${row[this.idField]}')" title="ลบ"><i class="fas fa-trash"></i></button>`;
            tr += `<td class="py-2.5 px-4 border-b border-slate-100 text-right whitespace-nowrap">${act}</td>`;
        }
        tr += '</tr>'; 
        tbodyHtml += tr;
      });
      tbody.innerHTML = tbodyHtml;
    },
    filter: function() { 
      const input = document.getElementById('gridSearch'); if(!input) return;
      const term = input.value.toLowerCase(); 
      this.renderTable(this.dataList.filter(row => JSON.stringify(Object.values(row)).toLowerCase().includes(term))); 
    },
    openForm: function(data = null) {
      const f = document.getElementById('dynamicForm'); if(!f) return;
      let fHtml = '';
      
      if (this.tableName === 'Orders') fHtml += '<datalist id="customerList">' + [...new Set(this.dataList.map(o=>o['Customer Name']))].filter(Boolean).map(c=>'<option value="' + c + '">').join('') + '</datalist>';
      
      let datalistOpts = [];
      window.app.globalData.products.forEach(p => {
          if(p.Category==='โมบาย') {
              datalistOpts.push(`<option value="${p.SKU}">`);
              if(p['Product Group']) datalistOpts.push(`<option value="${p['Product Group']}">`);
          }
      });
      fHtml += `<datalist id="targetList">${[...new Set(datalistOpts)].join('')}</datalist>`;

      this.columns.forEach(c => {
        let val = data ? (data[c.key] || '') : ''; let inp = '';
        let dis = (c.key==='Order Status' && window.app.user.Role==='Sales') ? 'disabled' : '';
        let inputClass = 'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white shadow-sm transition-all';
        if(dis) inputClass += ' opacity-70 cursor-not-allowed';

        if(c.type==='hidden') { 
            fHtml += '<input type="hidden" id="field_' + c.key + '" value="' + val + '">'; return; 
        }
        else if(c.type.startsWith('multi_select_')) {
            let currentVals = val ? val.split(',').map(s=>s.trim()) : [];
            let safeKey = c.key.replace(/\s+/g, '');
            let allVal = c.type === 'multi_select_channel' ? 'ALL' : '*';
            let allLabel = c.type === 'multi_select_channel' ? 'เลือกทุกช่องทาง (ALL)' : 'ให้สิทธิ์เข้าถึงทั้งหมด (*)';
            if(c.type === 'multi_select_brand_gifts' || c.type === 'multi_select_channel_gifts') allLabel = 'แจกทุกชิ้นในหมวดนี้ (*)';
            
            let isAll = currentVals.includes(allVal) || val === 'ALL' || val === '*';
            
            let opts = [];
            if(c.type === 'multi_select_channel') {
                opts = [...new Set(window.app.globalData.channels.map(x=>x['Channel Name']))].filter(Boolean).map(n => ({id: n, label: n}));
            } else if (c.type === 'multi_select_menu') {
                window.app.menuConfig.forEach(m => {
                    if(m.isParent) {
                        opts.push({id: m.id, label: `[กลุ่ม] ${m.label}`});
                        m.children.forEach(child => opts.push({id: child.id, label: `--- ${child.label}`}));
                    } else {
                        opts.push({id: m.id, label: m.label});
                    }
                });
            } else {
                let targetCat = c.type === 'multi_select_brand_gifts' ? 'ของแถมแบรนด์' : 'ของแถมช่องทาง';
                opts = window.app.globalData.products.filter(p => p.Category === targetCat && p.Status === 'เปิด').map(p => ({id: p['Product Name'], label: p['Product Name']}));
            }
            
            inp = `<div class="max-h-48 overflow-y-auto bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 mt-1 shadow-inner">`;
            
            inp += `<label class="flex items-center space-x-3 cursor-pointer p-2 bg-white rounded-lg border border-slate-100 hover:bg-indigo-50 transition-colors shadow-sm">
                       <input type="checkbox" class="chk-group-${safeKey} w-5 h-5 text-indigo-600 bg-slate-100 border-slate-300 rounded focus:ring-indigo-500" value="${allVal}" onchange="if(this.checked) document.querySelectorAll('.chk-group-${safeKey}').forEach(cb=>{if(cb!==this)cb.checked=false})" ${isAll?'checked':''}> 
                       <span class="text-[11px] font-bold text-indigo-600">${allLabel}</span>
                    </label>`;
                    
            opts.forEach(opt => {
                let isChecked = !isAll && currentVals.some(cv => opt.id.toLowerCase().includes(cv.toLowerCase()));
                inp += `<label class="flex items-center space-x-3 cursor-pointer p-2 hover:bg-slate-100 rounded-lg transition-colors">
                           <input type="checkbox" class="chk-group-${safeKey} w-5 h-5 text-indigo-600 bg-white border-slate-300 rounded focus:ring-indigo-500" value="${opt.id.replace(/"/g, '&quot;')}" onchange="if(this.checked) { let allCb = document.querySelector('.chk-group-${safeKey}[value=\\'${allVal}\\']'); if(allCb) allCb.checked=false; }" ${isChecked?'checked':''}> 
                           <span class="text-[11px] font-normal text-slate-700">${opt.label}</span>
                        </label>`;
            });
            inp += `</div>`;
        }
        else if(c.type==='select') { inp='<select class="'+inputClass+'" id="field_' + c.key + '" ' + dis + '>' + c.options.map(opt=>'<option value="' + opt + '" ' + (val===opt?'selected':'') + '>' + opt + '</option>').join('') + '</select>'; }
        else if(c.type==='product_select') {
          if (data && data.SKU === 'DISCOUNT') {
            inp = '<input type="text" class="' + inputClass + ' bg-slate-100" id="field_' + c.key + '" value="' + val + '" readonly>';
          } else {
            inp='<select class="'+inputClass+'" id="field_' + c.key + '" onchange="window.app.grid.onProductChange(this)">'; 
            window.app.globalData.products.forEach(p=>{ 
              if(p.Status==='เปิด'||val===p['Product Name']) inp+='<option value="' + p['Product Name'] + '" data-sku="' + p.SKU + '" data-price="' + parseFloat((p.Price||0).toString().replace(/,/g,'')) + '" ' + (val===p['Product Name']?'selected':'') + '>' + p['Product Name'] + ' (SKU: ' + p.SKU + ')</option>';
            }); 
            inp+='</select>';
          }
        }
        else if(c.type==='datalist') inp='<input type="text" class="'+inputClass+'" id="field_' + c.key + '" value="' + val + '" list="' + c.listId + '">';
        else if(c.type==='readonly') inp='<input type="text" class="'+inputClass+' bg-slate-100" id="field_' + c.key + '" value="' + val + '" readonly>';
        else if(c.type==='password') inp='<input type="password" class="'+inputClass+'" id="field_' + c.key + '" placeholder="' + (data?'เว้นว่างถ้าไม่ต้องการเปลี่ยน':'รหัสผ่านใหม่') + '">';
        else if(c.type==='number') {
          let numDis = '';
          if (data && data.SKU === 'DISCOUNT' && c.key === 'Qty') {
            numDis = 'readonly bg-slate-100';
          }
          inp='<input type="number" class="'+inputClass + ' ' + numDis +'" id="field_' + c.key + '" value="' + val + '" onkeyup="' + (c.onchange||'') + '" onchange="' + (c.onchange||'') + '" ' + (numDis?'readonly':'') + '>';
        }
        else if(this.tableName === 'GiftMappings' && c.key === 'Target Mobile (SKU or Group)') inp=`<input type="text" class="${inputClass}" id="field_${c.key}" value="${val}" list="targetList" placeholder="เช่น SKU-123, S24-Series หรือ *">`;
        else inp='<input type="' + c.type + '" class="'+inputClass+'" id="field_' + c.key + '" value="' + val + '">';
        
        fHtml += '<div><label class="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">' + c.label + '</label>' + inp + '</div>';
      });
      f.innerHTML = fHtml;
      if(document.getElementById('formModalTitle')) document.getElementById('formModalTitle').innerText = data ? 'จัดการแก้ไขข้อมูลเอกสาร' : 'ลงทะเบียนบันทึกข้อมูลใหม่'; 
      window.app.showModal('formModal');
    },
    onProductChange: function(sel) {
      const o = sel.options[sel.selectedIndex]; if(!o) return;
      const sku = document.getElementById('field_SKU'); const pr = document.getElementById('field_Unit Price');
      if(sku) sku.value=o.getAttribute('data-sku'); if(pr) pr.value=o.getAttribute('data-price'); this.calcOrderTotal();
    },
    calcOrderTotal: function() {
      const elQty = document.getElementById('field_Qty');
      const elPrice = document.getElementById('field_Unit Price');
      const t = document.getElementById('field_Row Total'); 
      if(!elQty || !elPrice || !t) return;
      const q = parseFloat(elQty.value||0); const p = parseFloat(elPrice.value||0);
      t.value=q*p;
    },
    editForm: function(index) { this.openForm(this.dataList[index]); },
    saveForm: async function() {
      const pay = {}; 
      
      this.columns.forEach(c => { 
        if (c.type.startsWith('multi_select_')) {
           let safeKey = c.key.replace(/\s+/g, '');
           let checked = Array.from(document.querySelectorAll(`.chk-group-${safeKey}:checked`)).map(el => el.value);
           if(c.type === 'multi_select_channel' && checked.includes('ALL')) pay[c.key] = 'ALL';
           else if(checked.includes('*')) pay[c.key] = '*';
           else pay[c.key] = checked.join(', ');
        } else {
           const el=document.getElementById('field_' + c.key); 
           if(el) pay[c.key]=el.value; 
        }
      });

      window.app.hideModal('formModal'); 
      setTimeout(async () => {
         window.app.showLoading('กำลังบันทึกข้อมูล...');
         try {
           let res;
           if(this.tableName==='Orders') res = await window.app.api('UPDATE_FULL_ORDER', { data: pay });
           else res = await window.app.api('SAVE_RECORD', { tableName: this.tableName, idField: this.idField, data: pay });
           if(res && res.status==='success'){ await window.app.refreshGlobalData(); Swal.fire({ icon: 'success', title: 'อัปเดตข้อมูลเสร็จสิ้น', showConfirmButton: false, timer: 1500 }); this.loadData(); } else Swal.fire('ผิดพลาด',res ? res.message : 'Error', 'error');
         } catch(e) { Swal.fire('ผิดพลาด', e.message || 'Error', 'error'); }
      }, 350);
    },
    deleteRecord: async function(id) {
      if((await Swal.fire({ title: 'คุณต้องการลบข้อมูลนี้?', text: "การดำเนินการนี้ไม่สามารถย้อนกลับได้ประจำระบบล็อกไฟล์", icon: 'warning', showCancelButton: true, confirmButtonColor: '#e11d48', confirmButtonText: 'ลบถาวร', cancelButtonText: 'ยกเลิก' })).isConfirmed){
        window.app.showLoading('กำลังลบข้อมูล...');
        try {
          const res = await window.app.api('DELETE_RECORD', { tableName:this.tableName, idField:this.idField, idValue:id });
          if(res && res.status==='success') { await window.app.refreshGlobalData(); Swal.fire({ icon: 'success', title: 'ลบข้อมูลสำเร็จแล้ว', showConfirmButton: false, timer: 1200 }); this.loadData(); } else Swal.fire('Error',res ? res.message : 'Error','error');
        } catch(e) { Swal.fire('Error', e.message || 'Error', 'error'); }
      }
    }
  },

  settingsManager: {
    currentType: '',
    data: null,
    
    init: async function(type) {
      this.currentType = type;
      const content = document.getElementById('page-content');
      if(!content) return;
      
      if (type === 'autosetup') {
        this.data = {};
        this.render();
        return;
      }
      
      window.app.showLoading('กำลังโหลดข้อมูล...');
      try {
        const res = await window.app.api('GET_SETTINGS_LIST');
        Swal.close();
        if (res && res.status === 'success') {
          this.data = res.data;
          this.render();
        } else {
          Swal.fire('ข้อผิดพลาด', res ? res.message : 'ไม่สามารถโหลดข้อมูลได้', 'error');
        }
      } catch(e) {
        Swal.close();
        Swal.fire('ข้อผิดพลาด', e.message || 'ไม่สามารถโหลดข้อมูลได้', 'error');
      }
    },
    
    render: function() {
      const content = document.getElementById('page-content');
      if(!content || !this.data) return;
      
      let html = '';
      
      if (this.currentType === 'autosetup') {
        html = `
          <div class="max-w-2xl mx-auto bg-white border border-slate-200 shadow-xl rounded-3xl overflow-hidden animate-fade-in-up">
            <div class="p-6 bg-slate-50 border-b border-slate-100">
              <h3 class="text-lg font-extrabold text-slate-800"><i class="fas fa-database text-indigo-500 mr-2"></i> สร้างฐานข้อมูลครั้งแรก (Auto Setup)</h3>
              <p class="text-xs text-slate-500 mt-1">ใช้สำหรับการตั้งค่า Google Sheets และข้อมูลเริ่มต้นระบบทั้งหมด (ตาราง, สินค้าตัวอย่าง, บัญชีแอดมิน)</p>
            </div>
            <div class="p-8 space-y-6 text-center">
              <div class="inline-flex items-center justify-center w-20 h-20 rounded-full bg-indigo-50 mb-2">
                 <i class="fas fa-database text-4xl text-indigo-600"></i>
              </div>
              <div class="text-slate-600 text-sm max-w-md mx-auto space-y-3">
                 <p class="font-bold text-slate-800">คำเตือนสำหรับระบบ!</p>
                 <p>หากคุณกดดำเนินการ ระบบจะสร้างแผ่นงานที่จำเป็นสำหรับระบบขายของแบรนด์นี้ หากมีตารางเดิมอยู่แล้ว จะทำการตรวจสอบความสมบูรณ์และเสริมตารางที่หายไป</p>
              </div>
              
              <div class="pt-6 border-t border-slate-100 flex justify-center">
                <button type="button" class="inline-flex items-center justify-center px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all" onclick="window.app.initDB()">
                    <i class="fas fa-cogs mr-2"></i> เริ่มการดำเนินการ Auto Setup
                </button>
              </div>
            </div>
          </div>
        `;
      } else if (this.currentType === 'bookingsettings') {
        const start = (this.data.keyValueSettings && this.data.keyValueSettings.ReserveStart) || '';
        const end = (this.data.keyValueSettings && this.data.keyValueSettings.ReserveEnd) || '';
        
        html = `
          <div class="max-w-2xl mx-auto bg-white border border-slate-200 shadow-xl rounded-3xl overflow-hidden animate-fade-in-up">
            <div class="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 class="text-lg font-extrabold text-slate-800"><i class="fas fa-clock text-indigo-500 mr-2"></i> ตั้งเวลารับจองสินค้า (Booking Period)</h3>
                <p class="text-xs text-slate-500 mt-1">กำหนดวันเวลาเริ่มต้นและสิ้นสุดการจองสินค้า สำหรับควบคุมการสั่งซื้อหน้า POS</p>
              </div>
              <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-600 border border-indigo-100">
                <i class="fas fa-history mr-1 animate-pulse"></i> กำหนดเวลาจอง
              </span>
            </div>
            
            <div class="p-8 space-y-6">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="space-y-2">
                  <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center">
                    <i class="fas fa-play text-emerald-500 mr-1.5 text-[10px]"></i> วันเวลาเริ่มการจอง (Start Booking)
                  </label>
                  <input type="datetime-local" id="reserveStartInput" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-sm" value="${start}">
                </div>
                
                <div class="space-y-2">
                  <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center">
                    <i class="fas fa-stop text-rose-500 mr-1.5 text-[10px]"></i> วันเวลาสิ้นสุดการจอง (End Booking)
                  </label>
                  <input type="datetime-local" id="reserveEndInput" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-sm" value="${end}">
                </div>
              </div>
              
              <div class="bg-indigo-50/50 border border-indigo-100/50 rounded-2xl p-5 space-y-3">
                <h4 class="text-xs font-bold text-indigo-800 uppercase tracking-wider flex items-center"><i class="fas fa-info-circle mr-1.5"></i> คำแนะนำการทำงานของระบบ</h4>
                <ul class="text-xs text-slate-600 space-y-2 pl-5 list-disc leading-relaxed">
                  <li>ระบบจะเริ่มเปิดให้จองสินค้าหน้า POS เมื่อเวลาปัจจุบันถึงวันเริ่มจอง</li>
                  <li>หากเวลาปัจจุบันเลยวันสิ้นสุดการจองที่ตั้งค่าไว้ หน้าจอ POS จะ <strong class="text-rose-600 font-bold">ปิดการทำงานทั้งหมด</strong> โดยจะไม่สามารถค้นหา/คลิกเลือกสินค้าเพื่อใส่ตะกร้า และปุ่มดำเนินการข้อมูลลูกค้าจะถูกล็อกทันที</li>
                  <li>จะมีแถบเวลานับถอยหลัง (Countdown Timer) แสดงให้เห็นเวลาเหลือจอง ณ ขณะนั้นเพื่อกระตุ้นยอดขาย</li>
                </ul>
              </div>
              
              <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button onclick="window.app.settingsManager.saveBookingSettings()" class="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center"><i class="fas fa-save mr-2"></i> บันทึกข้อมูลตั้งค่า</button>
              </div>
            </div>
          </div>
        `;
      } else if (this.currentType === 'loginbg') {
        const bgUrl = this.data.loginBg || '';
        const previewUrl = window.app.formatImageUrl(bgUrl);
        
        html = `
          <div class="max-w-2xl mx-auto bg-white border border-slate-200 shadow-xl rounded-3xl overflow-hidden animate-fade-in-up">
            <div class="p-6 bg-slate-50 border-b border-slate-100">
              <h3 class="text-lg font-extrabold text-slate-800"><i class="fas fa-image text-indigo-500 mr-2"></i> ตั้งค่ารูปพื้นหลังหน้าล็อกอิน (Login BG)</h3>
              <p class="text-xs text-slate-500 mt-1">กำหนดลิ้งก์รูปภาพที่จะแสดงในพื้นหลังของหน้าจอเข้าสู่ระบบ</p>
            </div>
            <div class="p-8 space-y-6">
              <div class="h-[240px] w-full rounded-2xl border border-slate-200 bg-slate-100 flex items-center justify-center overflow-hidden relative group">
                <img id="loginBgPreview" src="${previewUrl}" class="max-h-full max-w-full object-cover w-full h-full transition-transform duration-300 group-hover:scale-105" onerror="this.src='https://via.placeholder.com/600x300?text=No+Preview+Available'">
                <div class="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span class="text-white text-xs font-bold bg-slate-900/80 px-3 py-1.5 rounded-full"><i class="fas fa-search-plus mr-1"></i> ภาพตัวอย่าง</span>
                </div>
              </div>
              
              <div class="space-y-2">
                <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider">ลิงก์รูปภาพ (Image URL)</label>
                <input type="text" id="loginBgUrlInput" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-sm" value="${bgUrl}" placeholder="วาง URL ของรูปภาพ เช่น https://images.unsplash.com/... หรือ Google Drive link" oninput="document.getElementById('loginBgPreview').src = window.app.formatImageUrl(this.value)">
              </div>
              
              <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button onclick="window.app.settingsManager.testImage('loginBgUrlInput')" class="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 text-sm font-bold rounded-xl hover:bg-slate-50 transition-colors shadow-sm"><i class="fas fa-eye mr-2"></i> พรีวิวภาพ</button>
                <button onclick="window.app.settingsManager.saveLoginBg()" class="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-md transition-colors flex items-center"><i class="fas fa-save mr-2"></i> บันทึกข้อมูล</button>
              </div>
            </div>
          </div>
        `;
      } else {
        let title = '';
        let desc = '';
        let list = [];
        let typeKey = '';
        
        if (this.currentType === 'herobanners') {
          title = 'ตั้งค่ารูปภาพภาพสไลด์หน้าแรก (Hero Banners)';
          desc = 'จัดการรูปภาพโปรโมชั่นแบบสไลด์ (Slide Carousel) ที่อยู่ส่วนบนสุดของหน้าขายสินค้า';
          list = this.data.heroBanners || [];
          typeKey = 'herobanner';
        } else if (this.currentType === 'promogrids') {
          title = 'ตั้งค่าตารางโปรโมชั่น (Promo Grid)';
          desc = 'จัดการรูปภาพตารางแบนเนอร์โปรโมชั่นที่แสดงด้านล่างของหน้าจอขายสินค้า';
          list = this.data.promoGrids || [];
          typeKey = 'promogrid';
        } else if (this.currentType === 'popupbanners') {
          title = 'ตั้งค่าป๊อปอัปแจ้งเตือน (Popup Banner)';
          desc = 'จัดการรูปภาพโฆษณา / ป้ายประกาศป๊อปอัปที่จะแสดงเมื่อเข้าสู่หน้าขายสินค้า';
          list = this.data.popupBanners || [];
          typeKey = 'popupbanner';
        }
        
        let cardsHtml = '';
        if (list.length === 0) {
          cardsHtml = `
            <div class="col-span-full py-12 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50">
              <i class="fas fa-images text-slate-300 text-5xl mb-4"></i>
              <p class="text-sm font-bold text-slate-400">ยังไม่มีข้อมูลรูปภาพในระบบ</p>
            </div>
          `;
        } else {
          list.forEach(item => {
            const previewUrl = window.app.formatImageUrl(item.url);
            cardsHtml += `
              <div class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-all duration-300">
                <div class="h-[140px] bg-slate-100 flex items-center justify-center overflow-hidden border-b border-slate-100 relative group">
                  <img src="${previewUrl}" class="max-h-full max-w-full object-cover w-full h-full" onerror="this.src='https://via.placeholder.com/300x150?text=Invalid+Image+URL'">
                  <div class="absolute top-2 right-2 px-2 py-0.5 bg-slate-900/80 text-white text-[10px] font-bold rounded-lg shadow-sm">
                    แถวที่: ${item.rowIndex}
                  </div>
                </div>
                <div class="p-4 flex flex-col flex-1 space-y-3">
                  <div class="space-y-2">
                    <label class="block text-[10px] font-bold text-slate-400 uppercase">ลิงก์ภาพ (Image URL)</label>
                    <input type="text" id="bannerUrl-${item.rowIndex}" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all" value="${item.url}" placeholder="URL">
                    
                    <label class="block text-[10px] font-bold text-slate-400 uppercase mt-2">ลิงก์ปลายทาง (Target Link)</label>
                    <input type="text" id="targetLink-${item.rowIndex}" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all" value="${item.targetLink || ''}" placeholder="URL ให้คลิก (ปล่อยว่างได้)">
                  </div>
                  <div class="flex gap-2 mt-auto pt-2 border-t border-slate-50 justify-end">
                    <button onclick="window.app.settingsManager.deleteItem('${typeKey}', ${item.rowIndex})" class="w-8 h-8 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors flex items-center justify-center shadow-sm" title="ลบภาพ"><i class="fas fa-trash"></i></button>
                    <button onclick="window.app.settingsManager.saveItem('${typeKey}', ${item.rowIndex}, 'bannerUrl-${item.rowIndex}', 'targetLink-${item.rowIndex}')" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-md transition-colors flex items-center" title="บันทึกแก้ไข"><i class="fas fa-save mr-1"></i> บันทึก</button>
                  </div>
                </div>
              </div>
            `;
          });
        }
        
        html = `
          <div class="space-y-6 animate-fade-in-up">
            <div class="bg-white border border-slate-200 shadow-sm rounded-3xl p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 class="text-lg font-extrabold text-slate-800"><i class="fas fa-images text-indigo-500 mr-2"></i> ${title}</h3>
                <p class="text-xs text-slate-500 mt-1">${desc}</p>
              </div>
              <button onclick="window.app.settingsManager.openAddModal('${typeKey}')" class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-md transition-colors flex items-center w-full sm:w-auto justify-center">
                <i class="fas fa-plus mr-2"></i> เพิ่มแบนเนอร์ใหม่
              </button>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              ${cardsHtml}
            </div>
          </div>
        `;
      }
      
      content.innerHTML = html;
    },
    
    testImage: function(inputId) {
      const url = document.getElementById(inputId).value;
      if (!url || url.trim() === '') return Swal.fire('คำแนะนำ', 'กรุณากรอกลิงก์รูปภาพก่อนดูตัวอย่าง', 'info');
      Swal.fire({
        title: 'รูปภาพพรีวิว',
        imageUrl: window.app.formatImageUrl(url),
        imageAlt: 'Preview',
        confirmButtonColor: '#4f46e5',
        confirmButtonText: 'ปิด'
      });
    },
    
    saveLoginBg: async function() {
      const url = document.getElementById('loginBgUrlInput').value.trim();
      window.app.showLoading('กำลังบันทึกข้อมูล...');
      try {
        const res = await window.app.api('SAVE_SETTINGS_ITEM', { type: 'loginbg', url: url });
        if(res && res.status==='success') {
          await window.app.refreshGlobalData();
          Swal.fire({ icon: 'success', title: 'บันทึกภาพพื้นหลังสำเร็จ', showConfirmButton: false, timer: 1500 });
          this.init(this.currentType);
        } else {
          Swal.fire('ผิดพลาด', res ? res.message : 'Error', 'error');
        }
      } catch(e) {
        Swal.fire('ผิดพลาด', e.message || 'Error', 'error');
      }
    },
    
    saveItem: async function(type, rowIndex, inputId, targetLinkId) {
      const url = document.getElementById(inputId).value.trim();
      const targetLink = targetLinkId ? document.getElementById(targetLinkId).value.trim() : '';
      if (!url) return Swal.fire('แจ้งเตือน', 'กรุณากรอกลิงก์รูปภาพ', 'warning');
      
      window.app.showLoading('กำลังบันทึกข้อมูล...');
      try {
        const res = await window.app.api('SAVE_SETTINGS_ITEM', { type: type, rowIndex: rowIndex, url: url, targetLink: targetLink });
        if(res && res.status==='success') {
          await window.app.refreshGlobalData();
          Swal.fire({ icon: 'success', title: 'บันทึกข้อมูลสำเร็จ', showConfirmButton: false, timer: 1200 });
          this.init(this.currentType);
        } else {
          Swal.fire('ผิดพลาด', res ? res.message : 'Error', 'error');
        }
      } catch(e) {
        Swal.fire('ผิดพลาด', e.message || 'Error', 'error');
      }
    },
    
    openAddModal: function(type) {
      Swal.fire({
        title: 'เพิ่มลิงก์แบนเนอร์ใหม่',
        html: `
          <div class="space-y-4 text-left px-2">
            <div>
              <label class="block text-sm font-bold text-slate-700 mb-1">ลิงก์ภาพ (Image URL) *</label>
              <input type="text" id="swal-url" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all" placeholder="https://...">
            </div>
            <div>
              <label class="block text-sm font-bold text-slate-700 mb-1">ลิงก์ปลายทาง (Target Link)</label>
              <input type="text" id="swal-link" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all" placeholder="ลิงก์สำหรับคลิก (ปล่อยว่างได้)">
            </div>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'บันทึก',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#4f46e5',
        preConfirm: () => {
          const url = document.getElementById('swal-url').value.trim();
          const link = document.getElementById('swal-link').value.trim();
          if (!url) {
            Swal.showValidationMessage('กรุณากรอกลิงก์รูปภาพ!');
            return false;
          }
          return { url: url, targetLink: link };
        }
      }).then(async (result) => {
        if (result.isConfirmed) {
          window.app.showLoading('กำลังบันทึกข้อมูล...');
          try {
            const res = await window.app.api('SAVE_SETTINGS_ITEM', { type: type, url: result.value.url, targetLink: result.value.targetLink });
            if(res && res.status==='success') {
              await window.app.refreshGlobalData();
              Swal.fire({ icon: 'success', title: 'เพิ่มรูปภาพสำเร็จ', showConfirmButton: false, timer: 1200 });
              this.init(this.currentType);
            } else {
              Swal.fire('ผิดพลาด', res ? res.message : 'Error', 'error');
            }
          } catch(e) {
            Swal.fire('ผิดพลาด', e.message || 'Error', 'error');
          }
        }
      });
    },
    
    deleteItem: async function(type, rowIndex) {
      const confirm = await Swal.fire({
        title: 'ยืนยันการลบรูปภาพ?',
        text: 'ต้องการลบรูปภาพแบนเนอร์แถวที่ ' + rowIndex + ' ใช่หรือไม่?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e11d48',
        confirmButtonText: 'ลบรูปภาพ',
        cancelButtonText: 'ยกเลิก'
      });
      
      if (confirm.isConfirmed) {
        window.app.showLoading('กำลังลบข้อมูล...');
        try {
          const res = await window.app.api('DELETE_SETTINGS_ITEM', { type: type, rowIndex: rowIndex });
          if(res && res.status==='success') {
            await window.app.refreshGlobalData();
            Swal.fire({ icon: 'success', title: 'ลบรูปภาพสำเร็จ', showConfirmButton: false, timer: 1200 });
            this.init(this.currentType);
          } else {
            Swal.fire('ผิดพลาด', res ? res.message : 'Error', 'error');
          }
        } catch(e) {
          Swal.fire('ผิดพลาด', e.message || 'Error', 'error');
        }
      }
    },
    
    saveBookingSettings: async function() {
      const start = document.getElementById('reserveStartInput').value;
      const end = document.getElementById('reserveEndInput').value;
      
      if (!start || !end) {
        return Swal.fire('แจ้งเตือน', 'กรุณาระบุวันเวลาให้ครบถ้วน', 'warning');
      }
      
      if (new Date(start) >= new Date(end)) {
        return Swal.fire('แจ้งเตือน', 'วันเวลาเริ่มจองต้องมาก่อนวันเวลาสิ้นสุดการจอง', 'warning');
      }
      
      window.app.showLoading('กำลังบันทึกข้อมูล...');
      try {
        const res = await window.app.api('SAVE_SETTINGS_ITEM', {
          type: 'bookingsettings',
          settings: {
            ReserveStart: start,
            ReserveEnd: end
          }
        });
        if(res && res.status==='success') {
          await window.app.refreshGlobalData();
          Swal.fire({ icon: 'success', title: 'บันทึกเวลาการจองสำเร็จ', showConfirmButton: false, timer: 1500 });
          this.init(this.currentType);
        } else {
          Swal.fire('ผิดพลาด', res ? res.message : 'Error', 'error');
        }
      } catch(e) {
        Swal.fire('ผิดพลาด', e.message || 'Error', 'error');
      }
    }
  }
};
window.onload = () => window.app.init();
</script>



``n
