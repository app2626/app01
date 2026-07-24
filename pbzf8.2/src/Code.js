function doGet(e) {
  // ชื่อเว็บแอปตั้งค่าได้จากเมนู "ตั้งค่าระบบ" (Settings sheet, key SystemName) — เพื่อให้สำเนาโปรเจกต์ไปใช้ที่อื่น
  // เปลี่ยนชื่อได้จากหน้าเว็บล้วนๆ โดยไม่ต้องแก้โค้ด/deploy ใหม่
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const appName = (getKeyValueSettings(ss).SystemName || '').toString().trim() || 'Mobile Pre Order System';
  const template = HtmlService.createTemplateFromFile('Index');
  template.appName = appName;
  return template.evaluate()
    .setTitle(appName)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT); // กัน clickjacking — เปลี่ยนกลับ ALLOWALL เฉพาะถ้าตั้งใจ embed ใน iframe
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function setupDatabase(userToken) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();
  const setupCompleted = props.getProperty('MPOS_SETUP_COMPLETED') === 'true';
  // ถ้าระบบถูกตั้งค่าแล้ว (มีสมาชิกในชีต Members) ต้องเป็น Admin ที่ login แล้วเท่านั้น
  // อนุญาตเรียกแบบไม่มี token เฉพาะการติดตั้งครั้งแรกที่ยังไม่มีข้อมูลผู้ใช้ให้ปกป้อง
  const membersSheetCheck = ss.getSheetByName("Members");
  if (setupCompleted && (!membersSheetCheck || membersSheetCheck.getLastRow() <= 1)) {
    throw new Error("Setup ถูกปิดใช้งานแล้ว กรุณาเปิดใช้งานใหม่จาก Script Properties โดยผู้ดูแลระบบ");
  }
  if (membersSheetCheck && membersSheetCheck.getLastRow() > 1) {
    const tokenPayload = (userToken && userToken.Token) ? verifyToken(userToken.Token) : null;
    if (!tokenPayload) throw new Error("Unauthorized: กรุณาเข้าสู่ระบบก่อนใช้งาน Auto Setup");
    const membersList = getTableDataAsJson(membersSheetCheck);
    const caller = membersList.find(u => u.Username === tokenPayload.Username);
    if (!caller || caller.Role !== 'Admin') throw new Error("Permission Denied: เฉพาะ Admin เท่านั้น");
  }
  const tables = {
    // 6C.1 — Original Price ต่อท้ายเสมอ (display-only: ป้าย "ประหยัด/เดิม" บนการ์ด POS — ราคาคิดเงินจริงคือ Price)
    "Products": ["SKU", "Product Name", "Model", "Product Group", "Capacity", "Color", "Image URL", "Price", "Stock", "Unit", "Category", "Status", "Channel", "Original Price"],
    "Members": ["Username", "Password", "Role", "Name", "Branch Code", "Accessible Menus"],
    "Branches": ["Channel", "Branch Code", "Branch Name", "Area", "Mall", "Region", "Province", "Type Name"],
    "Channels": ["Channel ID", "Channel Name", "Description"],
    "Promotions": ["Promo ID", "Promo Name", "Discount Type", "Value", "Status"],
    "Interests": ["Interest Name", "Status"],
    "GiftMappings": ["Mapping ID", "Target Mobile (SKU or Group)", "Channel", "Brand Gifts", "Channel Gifts", "Status"],
    // 🌟 จัดเรียงคอลัมน์ Orders ใหม่ตามที่ระบุ
    "Orders": ORDERS_HEADERS_,
    "OrderStatus": ["Status ID", "Status Name", "Color Code"],
    "InventoryLog": ["Log ID", "Timestamp", "SKU", "Action", "Qty", "Branch Code", "User"],
    "AuditLog": ["Log ID", "Timestamp", "User", "Action", "Details"],
    "Settings": ["Key", "Value", "Remark"],
    "UI_Banners": ["Banner ID", "Type", "URL", "Status", "Target Link", "Details"],
    "Target": ["Area", "เป้า"],
    "Invoices": INVOICES_HEADERS_
  };

  const initialAdminPassword = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
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
      ["admin", hashPassword(initialAdminPassword), "Admin", "ผู้ดูแลระบบ", "ALL", "*"]
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
  props.setProperty('MPOS_SETUP_COMPLETED', 'true');
  return { status: 'success', message: 'Database Ready', initialAdmin: { username: 'admin', password: initialAdminPassword } };
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

// คีย์ลับสำหรับเซ็น token — สร้างอัตโนมัติครั้งแรกและเก็บใน Script Properties (MPOS_SECRET_KEY)
// ห้ามใช้ค่าคงที่ในซอร์สโค้ดเป็น fallback มิฉะนั้นผู้อื่นสามารถปลอม token ได้
function getSecretKey() {
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty('MPOS_SECRET_KEY');
  if (!key) {
    key = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('MPOS_SECRET_KEY', key);
  }
  return key;
}

function generateToken(username) {
  // อายุ token 30 วัน (เดิม 24 ชม. — เจ้าของระบบขอให้อยู่ในระบบนานขึ้น ไม่ต้อง login ทุกวัน, 2026-07-10)
  const payloadStr = JSON.stringify({ Username: username, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 });
  const payloadB64 = Utilities.base64EncodeWebSafe(Utilities.newBlob(payloadStr).getBytes());
  const signature = Utilities.computeHmacSha256Signature(payloadB64, getSecretKey());
  const signatureB64 = Utilities.base64EncodeWebSafe(signature);
  return payloadB64 + "." + signatureB64;
}

// เทียบ string แบบ constant-time — กัน timing attack เดา signature ทีละตัวอักษร
function timingSafeEqual(a, b) {
  const aStr = String(a);
  const bStr = String(b);
  if (aStr.length !== bStr.length) return false;
  let diff = 0;
  for (let i = 0; i < aStr.length; i++) {
    diff |= aStr.charCodeAt(i) ^ bStr.charCodeAt(i);
  }
  return diff === 0;
}

function verifyToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const expectedSig = Utilities.computeHmacSha256Signature(parts[0], getSecretKey());
  const expectedSigB64 = Utilities.base64EncodeWebSafe(expectedSig);
  if (!timingSafeEqual(expectedSigB64, parts[1])) return null;
  
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

// 7.1 — Migration ครั้งเดียว: ถอดรหัส PII แถวเก่า (base64) ในชีต Orders ให้เป็น plain text ตามนโยบายใหม่ 2026-07-05
// ไม่ผูกกับ apiHandler — Admin รันมือจาก GAS editor เท่านั้น (เลือกฟังก์ชันนี้แล้วกด Run)
function migrateDeobfuscatePII() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Orders");
  if (!sheet) throw new Error("ไม่พบชีต Orders");
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return "ไม่มีข้อมูลให้ migrate";
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => h.toString().trim());
    const touched = {}; // แถว (0-based ในช่วงข้อมูล) ที่มีการถอดรหัสอย่างน้อย 1 คอลัมน์
    ["Contact Number", "ID Card_Passport"].forEach(colName => {
      const idx = headers.indexOf(colName);
      if (idx === -1) return;
      const rng = sheet.getRange(2, idx + 1, lastRow - 1, 1);
      const vals = rng.getValues();
      let changed = false;
      for (let r = 0; r < vals.length; r++) {
        const v = (vals[r][0] || "").toString();
        if (!v) continue;
        if (/^[\d\-+()\s]+$/.test(v)) continue; // ตัวเลขล้วน = plain อยู่แล้ว ข้าม
        const plain = deobfuscate(v);
        if (plain !== v) { vals[r][0] = plain; changed = true; touched[r] = true; }
      }
      if (changed) {
        // format '@' ก่อนเขียนกลับ กันเลข 0 นำหน้าหาย — เขียน batch ครั้งเดียวทั้งคอลัมน์
        rng.setNumberFormat('@');
        rng.setValues(vals);
      }
    });
    const rowCount = Object.keys(touched).length;
    logAudit((Session.getActiveUser().getEmail() || "ADMIN_MANUAL"), "MIGRATE_PII", "Deobfuscated PII in Orders: " + rowCount + " rows");
    return "Migrated " + rowCount + " rows";
  } finally {
    lock.releaseLock();
  }
}

// 12.1 — Migration ครั้งเดียว: จัดเรียง Channel ID ในชีต Channels ใหม่เป็น CH-01, CH-02, ... ตามลำดับแถว
// สาเหตุ: บางแถวถูกแก้ตรงในชีตให้เป็นค่าเดียวกับ Branch Code (เช่น B01) ทำให้ตัวสร้างรหัสอัตโนมัติฝั่งแอดมิน
// (ดู JS.html: autoIdFormats['Channel ID'], regex ^CH-(\d+)$) มองไม่เห็นว่ามี ID ตรงรูปแบบอยู่แล้ว
// ปลอดภัยที่จะรันได้เสมอ — Channel ID ไม่ถูกใช้ join/อ้างอิงที่ไหนในระบบเลย (Branches/GiftMappings/POS/Checkout
// เชื่อมกันด้วย Channel Name ทั้งหมด ไม่ใช่ Channel ID) การเขียนทับคอลัมน์นี้จึงไม่กระทบข้อมูลอื่น
// ไม่ผูกกับ apiHandler — Admin รันมือจาก GAS editor เท่านั้น (เลือกฟังก์ชันนี้แล้วกด Run)
function migrateResequenceChannelIds() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Channels");
  if (!sheet) throw new Error("ไม่พบชีต Channels");
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return "ไม่มีข้อมูลให้จัดเรียง";
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => h.toString().trim());
    const idCol = headers.indexOf("Channel ID");
    if (idCol === -1) throw new Error("ไม่พบคอลัมน์ Channel ID");

    const rng = sheet.getRange(2, idCol + 1, lastRow - 1, 1);
    const vals = rng.getValues();
    let changedCount = 0;
    for (let i = 0; i < vals.length; i++) {
      const newId = 'CH-' + String(i + 1).padStart(2, '0');
      if (String(vals[i][0] || '').trim() !== newId) { vals[i][0] = newId; changedCount++; }
    }
    if (changedCount > 0) {
      rng.setNumberFormat('@'); // กัน Sheets ตีความ ID เป็นชนิดอื่น เผื่ออนาคตมีรูปแบบตัวเลขล้วนปนมา
      rng.setValues(vals);
      CacheService.getScriptCache().remove("TABLE_Channels");
    }
    logAudit((Session.getActiveUser().getEmail() || "ADMIN_MANUAL"), "MIGRATE_CHANNEL_ID", "Resequenced Channel ID in Channels: " + changedCount + " of " + vals.length + " rows changed");
    return "จัดเรียง Channel ID เรียบร้อย: แก้ไข " + changedCount + " จาก " + vals.length + " แถว (ผลลัพธ์ CH-01 ถึง CH-" + String(vals.length).padStart(2, '0') + ")";
  } finally {
    lock.releaseLock();
  }
}

// running number ภายใน execution เดียว — สุ่ม 4 หลักอย่างเดียวเคยเสี่ยง ID ชนกันใน batch (เช่น invRows หลายแถวในออเดอร์เดียว)
let __genIdSeq = 0;
function generateId(prefix) {
  __genIdSeq++;
  return prefix + '-' + Utilities.formatDate(new Date(), "GMT+7", "yyMMdd") + '-' + Date.now() + '-' + __genIdSeq + '-' + Math.floor(100 + Math.random() * 900);
}

// กัน formula/CSV injection: ค่าที่ user พิมพ์เอง (ชื่อลูกค้า/หมายเหตุ/ชื่อพนักงานจอง ฯลฯ) เขียนลง Sheets ตรงๆ
// ถ้าขึ้นต้นด้วย = + - @ ตัว Sheets จะตีความเป็นสูตรทันทีตอน setValues (ไม่เกี่ยวกับ number format ของคอลัมน์)
// นำหน้าด้วย ' (single quote) บังคับให้เก็บเป็นข้อความเสมอ ตามคำแนะนำมาตรฐานของ Google/OWASP สำหรับ formula injection
function sanitizeSheetText_(value) {
  const s = (value === null || value === undefined) ? '' : value.toString();
  if (/^[=+\-@]/.test(s)) return "'" + s;
  return s;
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
       const rows = oldSheet.getDataRange().getValues();
       for (let i = 1; i < rows.length; i++) {
         const key = (rows[i][0] || '').toString().trim().toLowerCase();
         if (['loginbg', 'login bg', 'loginbackground', 'login background'].includes(key)) {
           const val = rows[i][1];
           return val ? val.toString() : null;
         }
       }
       const val = oldSheet.getRange("D2").getValue();
       return val ? val.toString() : null;
    }
  } catch(e) { return null; }
  return null;
}

function looksLikePasswordHash_(value) {
  return /^[a-f0-9]{64}$/i.test((value || '').toString().trim());
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
        // ตารางอ่อนไหว (ข้อมูลสมาชิก/ตั้งค่า/ประวัติระบบ) อ่านได้เฉพาะ Admin — บังคับสิทธิ์ฝั่ง server เสมอ
        if (['Members', 'Settings', 'AuditLog'].includes(payload.tableName) && secureUser.Role !== 'Admin') {
          throw new Error("Permission Denied: Admin only");
        }
        // Target: หน้า Target/Analytics เปิดให้เฉพาะ Admin/Manager ใน menuConfig — ต้องบังคับฝั่ง server ด้วย ไม่งั้น Sales เรียก action นี้ตรงๆ ผ่าน console ได้
        if (payload.tableName === 'Target' && !['Admin', 'Manager'].includes(secureUser.Role)) {
          throw new Error("Permission Denied: Admin/Manager only");
        }
        let tableData = getTableDataAsJson(ss.getSheetByName(payload.tableName));
        if ((payload.tableName === 'Orders' || payload.tableName === 'InventoryLog') && secureUser.Role === 'Sales') {
          tableData = tableData.filter(row => row['Branch Code'] === secureUser['Branch Code']);
        }
        // Invoices: role อื่นนอกจาก Admin/Manager เห็นเฉพาะเอกสารที่ตนเองสร้าง (กันอ้อม GET_INVOICES มาเรียกตรง)
        if (payload.tableName === 'Invoices' && !['Admin', 'Manager'].includes(secureUser.Role)) {
          tableData = tableData.filter(row => row['Requested By'] === secureUser.Username);
        }
        if (payload.tableName === 'Members') {
          tableData = tableData.map(m => { const clean = Object.assign({}, m); delete clean.Password; return clean; });
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
      case 'GET_SETTINGS_LIST':
        if (secureUser.Role !== 'Admin') throw new Error("Permission Denied: Admin only");
        return getSettingsList(ss);
      case 'SAVE_SETTINGS_ITEM': return saveSettingsItem(payload, secureUser, ss);
      case 'DELETE_SETTINGS_ITEM': return deleteSettingsItem(payload, secureUser, ss);
      case 'UPLOAD_IMAGE': return uploadImage(payload, secureUser, ss);
      case 'CHANGE_PASSWORD': return changePassword(payload, secureUser, ss);
      case 'GET_CUSTOMER_BY_PHONE': return getCustomerByPhone(payload, secureUser, ss); // ทุก role ที่ login แล้ว — คืนเฉพาะฟิลด์เติมฟอร์ม
      case 'GET_INVOICES': return getInvoices(secureUser, ss);       // Admin/Manager เห็นทั้งหมด, role อื่นเห็นเฉพาะที่ตนสร้าง
      case 'SAVE_INVOICE': return saveInvoice(payload, secureUser, ss);
      case 'APPROVE_INVOICE': return approveInvoice(payload, secureUser, ss);
      case 'DELETE_INVOICE': return deleteInvoice(payload, secureUser, ss);
      default: throw new Error("Invalid API Action");
    }
  } catch (error) {
    return { status: 'error', message: error.toString() };
  }
}

function doLogin(username, password, ss) {
  const sheet = ss.getSheetByName("Members");
  if(!sheet) return { status: 'error', message: 'กรุณากด Auto Setup ก่อน' };

  // Rate limit กัน brute-force: นับครั้งที่พลาดต่อ username เกิน 5 ครั้งใน 5 นาที → ปฏิเสธชั่วคราว
  const rlCache = CacheService.getScriptCache();
  const rlKey = 'LOGIN_FAIL_' + username;
  const failCount = parseInt(rlCache.get(rlKey) || '0', 10);
  if (failCount >= 5) {
    return { status: 'error', message: 'พยายามเข้าสู่ระบบผิดพลาดเกินกำหนด กรุณารอ 5 นาทีแล้วลองใหม่' };
  }

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
    rlCache.remove(rlKey); // login สำเร็จ — ล้างตัวนับ
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
  rlCache.put(rlKey, String(failCount + 1), 300); // นับ fail — หมดอายุเอง 5 นาที
  return { status: 'error', message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
}

function changePassword(payload, secureUser, ss) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const oldPassword = (payload.oldPassword || '').toString();
    const newPassword = (payload.newPassword || '').toString();
    if (!oldPassword || !newPassword) throw new Error("กรุณากรอกรหัสผ่านให้ครบถ้วน");
    if (newPassword.length < 4) throw new Error("รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร");

    const sheet = ss.getSheetByName("Members");
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const userCol = headers.indexOf('Username');
    const pwCol = headers.indexOf('Password');
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][userCol] === secureUser.Username) { rowIndex = i + 1; break; }
    }
    if (rowIndex === -1) throw new Error("ไม่พบบัญชีผู้ใช้");

    const storedHash = data[rowIndex - 1][pwCol];
    const hashedOld = hashPassword(oldPassword);
    // รองรับรหัสผ่านเก่าที่ยังไม่ได้ salt (legacy) / plain text — เหมือน logic ใน doLogin
    const oldHashedLegacy = (() => {
      const d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, oldPassword);
      let h = ''; for (let i = 0; i < d.length; i++) { let v = d[i]; if (v < 0) v += 256; let s = v.toString(16); if (s.length == 1) s = '0' + s; h += s; }
      return h;
    })();
    if (storedHash !== hashedOld && storedHash !== oldHashedLegacy && storedHash !== oldPassword) {
      throw new Error("รหัสผ่านเดิมไม่ถูกต้อง");
    }

    sheet.getRange(rowIndex, pwCol + 1).setValue(hashPassword(newPassword));
    logAudit(secureUser.Username, "CHANGE_PASSWORD", "Changed own password");
    return { status: 'success' };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  } finally {
    lock.releaseLock();
  }
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
      sheet.appendRow(["Rule ID", "Buy Category", "Get Discount Category", "Discount Percent", "Message Suggest", "Message Apply", "Status", "Channel"]);
      sheet.appendRow(["AP-001", "โมบาย", "อุปกรณ์เสริม", 10, "ลูกค้าซื้อมือถือแล้ว! เสนอขายอุปกรณ์เสริม (เคส/ฟิล์ม/หัวชาร์จ) ตอนนี้ <strong class='text-rose-900'>รับส่วนลดอุปกรณ์เสริม 10% ทันที</strong>", "ลูกค้าได้รับส่วนลดอุปกรณ์เสริม 10% เรียบร้อยแล้ว", "Active", ""]);
      sheet.appendRow(["AP-002", "สมาร์ทวอทช์", "อุปกรณ์เสริม", 5, "ลูกค้าซื้อสมาร์ทวอทช์! เสนอขายสายนาฬิกาเพิ่ม รับส่วนลด 5%", "ได้รับส่วนลดสายนาฬิกา 5% เรียบร้อย", "Inactive", ""]);
      sheet.getRange("A1:H1").setFontWeight("bold").setBackground("#d9ead3");
      SpreadsheetApp.flush();
    } catch(e) {}
  }
  // Retrofit "Rule ID" ให้ชีตเก่าที่สร้างก่อนคอลัมน์นี้มี — เดิมตาราง AutoPromotions ใช้ Buy Category เป็น idField
  // ซึ่งซ้ำกันได้ (หลายกติกา Buy เดียวกันแต่ Get ต่างกัน) ทำให้แก้/ลบกติกาแล้วโดนแถวแรกที่ตรงแทนแถวที่ตั้งใจ
  try {
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim());
    let idCol = headers.indexOf("Rule ID");
    if (idCol === -1) {
      sheet.getRange(1, lastCol + 1).setValue("Rule ID");
      idCol = lastCol;
    }
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const rng = sheet.getRange(2, idCol + 1, lastRow - 1, 1);
      const vals = rng.getValues();
      let maxNum = 0;
      vals.forEach(v => { const mm = String(v[0] || '').match(/^AP-(\d+)$/); if (mm) maxNum = Math.max(maxNum, parseInt(mm[1], 10)); });
      let changed = false;
      for (let i = 0; i < vals.length; i++) {
        if (!String(vals[i][0] || '').trim()) { maxNum++; vals[i][0] = 'AP-' + String(maxNum).padStart(3, '0'); changed = true; }
      }
      if (changed) rng.setValues(vals);
    }
  } catch(e) {}
  // Retrofit "Channel" ให้ชีตเก่าที่สร้างก่อนคอลัมน์นี้มี — เว้นว่าง = ร่วมทุกช่องทางเหมือนเดิม (backward compatible ไม่ต้องแก้ข้อมูลแถวเก่า)
  try {
    const lastCol2 = sheet.getLastColumn();
    const headers2 = sheet.getRange(1, 1, 1, lastCol2).getValues()[0].map(h => h.toString().trim());
    if (headers2.indexOf("Channel") === -1) {
      sheet.getRange(1, lastCol2 + 1).setValue("Channel");
    }
  } catch(e) {}
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
    members: getTableDataAsJson(ss.getSheetByName("Members")).map(m => { const clean = Object.assign({}, m); delete clean.Password; return clean; }),
    // ใช้วาด order status timeline (5A.3) — ชีตอาจไม่มีในระบบเก่า จึงต้องกัน null
    orderStatuses: ss.getSheetByName("OrderStatus") ? getTableDataAsJson(ss.getSheetByName("OrderStatus")) : [],
    heroBanners: heroBanners,
    gridBanners: gridBanners,
    popupBanners: popupBanners,
    settings: getKeyValueSettings(ss)
  };
}

function getAdvancedDashboard(secureUser, ss) {
  let orders = getTableDataAsJson(ss.getSheetByName("Orders"));
  const products = getTableDataAsJson(ss.getSheetByName("Products"));
  // Dashboard เปิดได้ทุก role — ห้ามส่ง Password hash ออกไปหน้าบ้านเด็ดขาด
  const members = getTableDataAsJson(ss.getSheetByName("Members")).map(m => { const clean = Object.assign({}, m); delete clean.Password; return clean; });

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
    if (!orderSheet || !invSheet || !prodSheet) throw new Error("Database is not ready. Please run Auto Setup first.");

    // ==== กติกาการจองต้องบังคับฝั่ง server เสมอ (UI เช็คแล้วแต่เชื่อ client ไม่ได้) ====
    if (!payload.cart || !Array.isArray(payload.cart) || payload.cart.length === 0) throw new Error("ตะกร้าว่างเปล่า");
    const bookSettings = getKeyValueSettings(ss);
    if (bookSettings.ReserveStart && bookSettings.ReserveEnd) {
      const rStart = new Date(bookSettings.ReserveStart);
      const rEnd = new Date(bookSettings.ReserveEnd);
      const nowCheck = new Date();
      if (!isNaN(rStart.getTime()) && !isNaN(rEnd.getTime()) && (nowCheck < rStart || nowCheck > rEnd)) {
        throw new Error("ไม่อยู่ในช่วงเวลาการจองสินค้า");
      }
    }
    if (payload.resStatus && payload.resStatus.toString().indexOf('จอง T') > -1) {
      if (!payload.receiptNo || payload.receiptNo.toString().trim() === '') throw new Error("จอง T ต้องระบุเลขที่ใบเสร็จรับเงินมัดจำ");
      if (!(parseFloat(payload.depositAmount) > 0)) throw new Error("จอง T ต้องระบุจำนวนเงินมัดจำมากกว่า 0");
    }

    const dateStr = Utilities.formatDate(new Date(), "GMT+7", "yyMMdd");
    const orderData = orderSheet.getDataRange().getValues();
    const existingHeaders = orderData[0].map(h => h.toString().trim());
    const idIndex = existingHeaders.indexOf("OrderID");

    // Idempotency: ถ้า client ยิงซ้ำด้วย Client Request ID เดิม (เช่น กดยืนยันซ้ำหลัง timeout ทั้งที่ออเดอร์แรกบันทึกสำเร็จแล้ว)
    // ให้คืน OrderID เดิมแทนการเขียนออเดอร์ใหม่ — ตรวจใน lock เพื่อกัน race ระหว่างสอง request พร้อมกัน
    const clientRequestId = (payload.clientRequestId || "").toString().trim();
    if (clientRequestId && idIndex > -1) {
      const reqIdIndex = existingHeaders.indexOf("Client Request ID");
      if (reqIdIndex > -1) {
        for (let i = 1; i < orderData.length; i++) {
          if ((orderData[i][reqIdIndex] || "").toString().trim() === clientRequestId) {
            return { status: 'success', orderId: orderData[i][idIndex], duplicate: true };
          }
        }
      }
    }

    // เลขรันต้องมาจาก "เลขสูงสุดที่มีจริง + 1" — เดิมใช้จำนวนออเดอร์ของวัน +1 ซึ่งถ้ามีการลบออเดอร์กลางลำดับ
    // (เช่นมี 001,002,003 แล้วลบ 002) ออเดอร์ใหม่จะได้เลข 003 ชนกับที่มีอยู่ ทำให้ลบ/พิมพ์ใบจองเหมารวมสองออเดอร์
    let maxSeq = 0;
    if (idIndex > -1) {
      for (let i = 1; i < orderData.length; i++) {
        const oid = (orderData[i][idIndex] || '').toString();
        if (oid.startsWith('ORD-' + dateStr)) {
          const mm = oid.match(/-(\d+)$/);
          if (mm) maxSeq = Math.max(maxSeq, parseInt(mm[1], 10));
        }
      }
    }
    const orderId = 'ORD-' + dateStr + '-' + (maxSeq + 1).toString().padStart(3, '0');
    const now = new Date().toLocaleString("en-US", {timeZone: "Asia/Bangkok"});
    
    let actualBranch = payload.branch;
    let actualChannel = payload.channel;

    if (secureUser.Role === 'Sales') {
       actualBranch = secureUser['Branch Code'];
       actualChannel = secureUser.Channel;
    }

    const branches = getTableDataAsJson(ss.getSheetByName("Branches"));
    const branchInfo = branches.find(b => b['Branch Code'] === actualBranch && (b.Channel === actualChannel || actualChannel === 'ALL'));
    if (actualBranch !== 'ALL' && !branchInfo) throw new Error("Invalid branch or channel.");
    // branch === 'ALL' ข้ามการเช็คคู่ branch/channel ด้านบนไปเลย — ต้องเช็ค channel แยกว่ามีอยู่จริงในชีต Channels
    // ไม่งั้น payload ที่ครอบ branch:'ALL' ส่ง channel เป็นสตริงอะไรก็ได้ ผ่านเข้าไปปลดล็อกของแถม/ส่วนลดที่ผูก channel นั้นได้
    if (actualBranch === 'ALL' && actualChannel !== 'ALL') {
      const channels = getTableDataAsJson(ss.getSheetByName("Channels"));
      const channelExists = channels.some(c => (c['Channel Name'] || '').toString().trim() === (actualChannel || '').toString().trim());
      if (!channelExists) throw new Error("Invalid branch or channel.");
    }

    let prodData = prodSheet.getDataRange().getValues();
    let headers = prodData[0].map(h => h.toString().trim());
    let skuIdx = headers.indexOf("SKU");
    let nameIdx = headers.indexOf("Product Name");
    let stockIdx = headers.indexOf("Stock");
    let priceIdx = headers.indexOf("Price");
    let catIdx = headers.indexOf("Category");
    
    // ตรวจสอบว่าชีต Orders มีคอลัมน์ Receipt No / Deposit แล้วหรือยัง — ถ้ายังให้เพิ่มต่อท้ายอัตโนมัติ
    let orderHeaders = orderSheet.getRange(1, 1, 1, orderSheet.getLastColumn()).getValues()[0].map(h => h.toString().trim());
    ["Receipt No", "Deposit", "Client Request ID"].forEach(col => {
      if (orderHeaders.indexOf(col) === -1) {
        orderSheet.getRange(1, orderHeaders.length + 1).setValue(col);
        orderHeaders.push(col);
      }
    });
    // orderRows.push() ด้านล่างเขียนเป็น array ตำแหน่งตรงตัว 24 ช่อง (ไม่ได้ map ด้วยชื่อ header) — ถ้าคอลัมน์ในชีตจริงสลับตำแหน่งไปจาก
    // ORDERS_HEADERS_ (เช่น มีคนแทรก/ย้ายคอลัมน์ตรงๆ ใน Sheets UI) ข้อมูลจะเขียนผิดคอลัมน์แบบเงียบๆ — เช็คก่อนเขียนดีกว่าให้ข้อมูลเพี้ยนไม่รู้ตัว
    for (let i = 0; i < ORDERS_HEADERS_.length; i++) {
      if (orderHeaders[i] !== ORDERS_HEADERS_[i]) {
        throw new Error("โครงสร้างชีต Orders ไม่ตรงตามที่ระบบคาดไว้ (คอลัมน์ '" + ORDERS_HEADERS_[i] + "' ควรอยู่ตำแหน่งที่ " + (i + 1) + ") กรุณาติดต่อผู้ดูแลระบบ ห้ามแก้ไข/ย้ายคอลัมน์ในชีต Orders โดยตรง");
      }
    }

    let isFirstRow = true;
    let orderRows = [];
    let invRows = [];
    let totalMobileQty = 0;
    let catTotals = {};   // ยอดเงินต่อหมวด (ราคาจากชีต) — ใช้คำนวณ Auto Bundle ซ้ำฝั่ง server
    let catQtys = {};     // จำนวนชิ้นต่อหมวด

    const giftMappings = getTableDataAsJson(ss.getSheetByName("GiftMappings"));
    payload.cart.forEach(item => {
      // จำนวนต้องเป็นจำนวนเต็ม >= 1 — กันค่าติดลบ/ทศนิยมจาก client ทำสต๊อกเพิ่มเอง
      const qty = parseInt(item.qty, 10);
      if (!Number.isInteger(qty) || qty < 1) throw new Error("จำนวนสินค้าไม่ถูกต้อง: " + (item['Product Name'] || item.SKU));

      // ราคา/ชื่อสินค้า/หมวด อ่านจากชีต Products เท่านั้น — ห้ามเชื่อค่าที่ client ส่งมา
      let itemPrice = 0;
      let itemName = item['Product Name'];
      let itemCat = '';
      let foundMain = false;
      for(let i=1; i<prodData.length; i++) {
        if(prodData[i][skuIdx] == item.SKU) {
          let currentStock = parseInt(prodData[i][stockIdx] || 0);
          if (!Number.isInteger(currentStock) || currentStock < 0) throw new Error("Invalid stock value for SKU: " + item.SKU);
          if(currentStock < qty) throw new Error("สินค้า " + prodData[i][nameIdx] + " สต๊อกไม่พอ (เหลือ " + currentStock + ")");
          prodData[i][stockIdx] = currentStock - qty;
          itemPrice = parseFloat((prodData[i][priceIdx] || 0).toString().replace(/,/g, ''));
          if(isNaN(itemPrice)) itemPrice = 0;
          itemName = prodData[i][nameIdx];
          itemCat = catIdx > -1 ? (prodData[i][catIdx] || '').toString().trim() : '';
          foundMain = true; break;
        }
      }
      if(!foundMain) throw new Error("ไม่พบสินค้า SKU: " + item.SKU);

      const allowedGifts = { brand: [], channel: [] };
      const mainProductRow = prodData.find(r => r[skuIdx] == item.SKU) || [];
      const groupIdx = headers.indexOf("Product Group");
      const addGiftNames = (value, target) => (value || '').toString().split(',').map(v => v.trim().toLowerCase()).filter(Boolean).forEach(v => target.push(v));
      giftMappings.forEach(mapping => {
        const target = (mapping['Target Mobile (SKU or Group)'] || '').toString().trim();
        const mapChannel = (mapping.Channel || '').toString().trim();
        const targetTokens = target.split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
        const mainName = (mainProductRow[nameIdx] || '').toString().trim().toLowerCase();
        const mainGroup = groupIdx > -1 ? (mainProductRow[groupIdx] || '').toString().trim().toLowerCase() : '';
        const targetMatches = target === '*' || target.toUpperCase() === 'ALL' ||
          targetTokens.includes(item.SKU.toString().toLowerCase()) || targetTokens.includes(mainGroup) ||
          targetTokens.some(v => v !== '*' && mainName.includes(v));
        // Channel เป็น multi-select ฝั่งแอดมิน (ตั้งค่าระบบ > Set Premium) — ค่าที่เซฟมาเป็น comma list ได้ เช่น "Retail, Online"
        // ห้ามเทียบ mapChannel === actualChannel ตรงๆ ไม่งั้น mapping ที่เลือกหลายช่องทางจะไม่ match ช่องทางไหนเลยตอน checkout
        // (ของแถมเลือกได้ในหน้า POS เพราะ frontend match แบบ substring แต่ server เทียบทั้งสตริง ทำให้ processGift โยน error)
        const channelTokens = mapChannel.split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
        const channelMatches = mapChannel === '*' || mapChannel === '' || mapChannel.toLowerCase() === 'all' || channelTokens.includes(actualChannel.toString().trim().toLowerCase());
        if (targetMatches && channelMatches && (mapping.Status || '').toString().trim().toLowerCase() === 'เปิด') {
          addGiftNames(mapping['Brand Gifts'], allowedGifts.brand);
          addGiftNames(mapping['Channel Gifts'], allowedGifts.channel);
        }
      });

      let rowTotal = itemPrice * qty;
      catTotals[itemCat] = (catTotals[itemCat] || 0) + rowTotal;
      catQtys[itemCat] = (catQtys[itemCat] || 0) + qty;
      if (itemCat === 'โมบาย') {
        totalMobileQty += qty;
        // CLAUDE.md กฎข้อ 8 — จำกัดโมบาย 1 เครื่อง/ออเดอร์ ต้องบังคับฝั่ง server ด้วย
        if (totalMobileQty > 1) throw new Error("สินค้าประเภท โมบาย จำกัดสิทธิ์จองได้ออเดอร์ละ 1 เครื่อง");
      }

      invRows.push([generateId('INV'), now, item.SKU, "SALE", -qty, actualBranch, secureUser.Username]);
      
      // sanitizeSheetText_ กัน formula injection (=,+,-,@ นำหน้า) — ทุกฟิลด์นี้เป็นข้อความที่ user พิมพ์เองล้วนๆ
      let fCustName = isFirstRow ? sanitizeSheetText_(payload.customerName) : "";
      // นโยบายเจ้าของระบบ 2026-07-05 (รอบ 7.1): PII เขียน plain text เพื่ออ่านในชีตตรงๆ ได้
      // ฝั่งอ่าน (GET_TABLE/Dashboard) ยังผ่าน deobfuscate ซึ่งมี digit-passthrough — อ่านแถวเก่าที่เข้ารหัสไว้ได้ ห้ามลบ
      let fContact = isFirstRow ? sanitizeSheetText_(payload.contactPhone) : "";
      let fEmail = isFirstRow ? sanitizeSheetText_(payload.email) : "";
      let fIdCard = isFirstRow ? sanitizeSheetText_(payload.idCard) : "";
      let fCodeHand = isFirstRow ? sanitizeSheetText_(payload.codeHandraiser) : "";
      let fPromo = isFirstRow ? sanitizeSheetText_(payload.promo || "-") : "";
      let fResStatus = isFirstRow ? sanitizeSheetText_(payload.resStatus) : "";
      let fBkStaff = isFirstRow ? sanitizeSheetText_(payload.bkStaffName) : "";
      let fBkPhone = isFirstRow ? sanitizeSheetText_(payload.bkPhone) : "";
      let fInterests = isFirstRow ? sanitizeSheetText_(payload.customerInterests) : "";
      let fRemark = isFirstRow ? sanitizeSheetText_(payload.remark) : "";
      let fReceiptNo = isFirstRow ? sanitizeSheetText_(payload.receiptNo || "") : "";
      let fDeposit = isFirstRow ? (parseFloat(payload.depositAmount) || 0) : "";
      let fReqId = isFirstRow ? clientRequestId : "";

      orderRows.push([
        orderId, now, actualChannel, actualBranch, fCustName, fContact,
        fEmail, fIdCard, fCodeHand,
        item.SKU, itemName, qty, itemPrice,
        fPromo, fResStatus, fBkStaff, fBkPhone,
        fInterests, fRemark, rowTotal, "Pending", fReceiptNo, fDeposit, fReqId
      ]);
      
      isFirstRow = false; 

      const processGift = (giftObj) => {
        if(giftObj && giftObj.name) {
          const giftName = giftObj.name.toString().trim();
          const giftNameLower = giftName.toLowerCase();
          const giftAllowed = allowedGifts.brand.includes('*') || allowedGifts.channel.includes('*') ||
            allowedGifts.brand.some(v => v !== '*' && giftNameLower.includes(v)) ||
            allowedGifts.channel.some(v => v !== '*' && giftNameLower.includes(v));
          if (!giftAllowed) throw new Error("Gift is not allowed for this product/channel: " + giftName);
          const gQty = parseInt(giftObj.qty, 10);
          if (!Number.isInteger(gQty) || gQty < 1) throw new Error("จำนวนของแถมไม่ถูกต้อง: " + giftName);
          let giftSku = "GIFT";
          let giftHasStock = false;
          let giftFound = false;
          for(let i=1; i<prodData.length; i++) {
            if(prodData[i][nameIdx] == giftName) {
              giftFound = true;
              giftSku = prodData[i][skuIdx];
              let currentStock = parseInt(prodData[i][stockIdx] || 0);
              if(currentStock >= gQty) {
                prodData[i][stockIdx] = currentStock - gQty;
                giftHasStock = true;
              }
              break;
            }
          }
          if (!giftFound) throw new Error("Gift product was not found: " + giftName);
          // นโยบาย: ของแถมหมดต้องไม่ block การขายมือถือ แต่ InventoryLog ต้องตรงความจริง —
          // ตัดสต๊อกจริงเท่านั้นถึง log ติดลบ ถ้าไม่พอให้ log qty 0 และหมายเหตุที่แถวออเดอร์
          if (giftHasStock) {
            invRows.push([generateId('INV'), now, giftSku, "GIFT", -gQty, actualBranch, secureUser.Username]);
          } else {
            invRows.push([generateId('INV'), now, giftSku, "GIFT (NO STOCK)", 0, actualBranch, secureUser.Username]);
          }

          orderRows.push([
            orderId, now, actualChannel, actualBranch, "", "",
            "", "", "",
            giftSku, giftName, gQty, 0,
            "", "", "", "",
            "", (giftHasStock ? "" : "รอสต๊อกของแถม"), 0, "Pending", "", "", ""
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
    
    // ส่วนลดทุกแถวต้องตรวจกับชีตฝั่ง server — ห้ามเชื่อมูลค่าที่ client ส่งมา
    let discountsList = [];
    if (payload.discounts && Array.isArray(payload.discounts)) {
      discountsList = payload.discounts;
    } else if (payload.discount && parseFloat(payload.discount) > 0) {
      discountsList = [{ name: payload.promo, value: payload.discount }];
    }
    if (discountsList.length > 0) {
      const promoList = getTableDataAsJson(ss.getSheetByName("Promotions"));
      let autoRules = getTableDataAsJson(ss.getSheetByName("AutoPromotions"));
      // fallback rule เดียวกับหน้า POS (checkAutoPromotions) กรณีชีต AutoPromotions ว่าง
      if (autoRules.length === 0) {
        autoRules = [{ 'Buy Category': 'โมบาย', 'Get Discount Category': 'อุปกรณ์เสริม', 'Discount Percent': 10, 'Status': 'Active' }];
      }
      // เพดานส่วนลด Auto Bundle คำนวณครั้งเดียวรวมทั้งออเดอร์ (ไม่ใช่ต่อแถว) — client ปกติส่งแถว 'Auto Bundle' แถวเดียวต่อออเดอร์
      // (ดู JS.html pos.confirmCheckout) แต่ payload เป็น input จาก client ดิบๆ ห้ามเชื่อจำนวนแถว ต้องกันแยกกันส่งหลายแถวแล้วได้ส่วนลดคูณ
      let maxAutoTotal = 0;
      autoRules.forEach(r => {
        if ((r.Status || '').toString().trim().toLowerCase() !== 'active') return;
        const buyCat = (r['Buy Category'] || '').toString().trim();
        const getCat = (r['Get Discount Category'] || '').toString().trim();
        const pct = parseFloat(r['Discount Percent']) || 0;
        // เงื่อนไข Channel ร่วมรายการ (เว้นว่าง/'*'/'all' = ทุกช่องทาง) — tokenize เทียบทีละช่องทาง ตามรูปแบบเดียวกับ GiftMappings.Channel
        const ruleChRaw = (r['Channel'] || '').toString().trim();
        const ruleChTokens = ruleChRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        const ruleChMatches = ruleChRaw === '' || ruleChRaw === '*' || ruleChRaw.toLowerCase() === 'all' || ruleChTokens.includes(actualChannel.toString().trim().toLowerCase());
        if (!ruleChMatches) return;
        if ((catQtys[buyCat] || 0) > 0 && (catQtys[getCat] || 0) > 0) {
          maxAutoTotal += ((catTotals[getCat] || 0) * pct) / 100;
        }
      });
      let autoBundleUsed = 0;
      // สะสมยอดใช้ต่อชื่อโปรโมชั่น — กัน client ส่งชื่อโปรเดิมซ้ำหลายแถวแล้วแต่ละแถวผ่านเพดานแยกกันเป็นเอกเทศ (เพดานจริงต้องนับรวมต่อโปรหนึ่งชื่อ)
      const promoUsed = {};
      discountsList.forEach(d => {
        let val = parseFloat(d.value || 0);
        if (!(val > 0)) return;
        const dName = (d.name || '').toString().trim();
        if (dName.indexOf('Auto Bundle') > -1) {
          autoBundleUsed += val;
          if (autoBundleUsed > maxAutoTotal + 0.01) throw new Error("ส่วนลด Auto Bundle ไม่ตรงกับเงื่อนไขโปรโมชั่นของระบบ");
        } else {
          const promo = promoList.find(p => (p['Promo Name'] || '').toString().trim() === dName && (p.Status || '').toString().trim() === 'เปิด');
          if (!promo) throw new Error("ไม่พบโปรโมชั่นส่วนลด หรือโปรโมชั่นถูกปิดใช้งาน: " + dName);
          const promoVal = parseFloat((promo.Value || 0).toString().replace(/,/g, '')) || 0;
          // โปร Percent: เพดานส่วนลด = pct% ของยอดสินค้ารวมในออเดอร์ (ราคาจากชีต) — Fixed: เพดาน = Value ตรงๆ
          const promoType = (promo['Discount Type'] || 'Fixed').toString().trim();
          const goodsTotal = Object.keys(catTotals).reduce((s, k) => s + catTotals[k], 0);
          const maxVal = promoType === 'Percent' ? (goodsTotal * promoVal) / 100 : promoVal;
          promoUsed[dName] = (promoUsed[dName] || 0) + val;
          if (promoUsed[dName] > maxVal + 0.01) throw new Error("มูลค่าส่วนลดเกินที่โปรโมชั่นกำหนด: " + dName);
        }
        orderRows.push([
          orderId, now, actualChannel, actualBranch, "", "",
          "", "", "",
          "DISCOUNT", dName, 1, -val,
          "", "", "", "",
          "", "", -val, "Pending", "", "", ""
        ]);
      });
    }
    
    let newStocks = [];
    for (let i = 1; i < prodData.length; i++) {
       newStocks.push([prodData[i][stockIdx]]);
    }
    if (newStocks.length > 0) {
      prodSheet.getRange(2, stockIdx + 1, newStocks.length, 1).setValues(newStocks);
      // สต๊อกเปลี่ยนแล้วต้องเคลียร์ cache — ไม่งั้น POS เห็นสต๊อกเก่าได้ถึง 6 ชม. แล้วขายเกิน
      CacheService.getScriptCache().remove("TABLE_Products");
    }
    if (invRows.length > 0) {
      invSheet.getRange(invSheet.getLastRow() + 1, 1, invRows.length, invRows[0].length).setValues(invRows);
    }
    if (orderRows.length > 0) {
      const orderStartRow = orderSheet.getLastRow() + 1;
      // PII เป็น plain text แล้ว — บังคับ format '@' กัน Sheets ตีความเบอร์/เลขบัตรเป็นตัวเลข (เลข 0 นำหน้าหาย)
      ["Contact Number", "ID Card_Passport"].forEach(col => {
        const ci = orderHeaders.indexOf(col);
        if (ci > -1) orderSheet.getRange(orderStartRow, ci + 1, orderRows.length, 1).setNumberFormat('@');
      });
      orderSheet.getRange(orderStartRow, 1, orderRows.length, orderRows[0].length).setValues(orderRows);
    }
    
    logAudit(secureUser.Username, "CHECKOUT", "Created Order: " + orderId);
    return { status: 'success', orderId: orderId };
  } catch(e) {
    return { status: 'error', message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// 8A.2 — จำลูกค้าเก่าจากเบอร์โทร: สแกน Orders จากแถวล่างสุดขึ้นบน (ออเดอร์ล่าสุดก่อน)
// Contact Number อยู่เฉพาะแถวแรกของออเดอร์ — แถวเก่าอาจเป็น base64 จึงเทียบหลังผ่าน deobfuscate
// คืนเฉพาะ 4 ฟิลด์ที่ใช้เติมฟอร์ม checkout — ห้ามคืนทั้งแถว (มีข้อมูลออเดอร์อื่นปน)
function getCustomerByPhone(payload, secureUser, ss) {
  const phone = (payload && payload.phone ? payload.phone : '').toString().replace(/\D/g, '');
  if (!/^\d{9,10}$/.test(phone)) throw new Error("เบอร์โทรศัพท์ไม่ถูกต้อง (ต้องเป็นตัวเลข 9-10 หลัก)");
  const sheet = ss.getSheetByName("Orders");
  if (!sheet) return { status: 'success', found: false };
  const data = sheet.getDataRange().getDisplayValues();
  if (data.length <= 1) return { status: 'success', found: false };
  const headers = data[0].map(h => h.toString().trim());
  const phoneIdx = headers.indexOf("Contact Number");
  if (phoneIdx === -1) return { status: 'success', found: false };
  const nameIdx = headers.indexOf("Customer Name");
  const emailIdx = headers.indexOf("Email");
  const idCardIdx = headers.indexOf("ID Card_Passport");
  const codeIdx = headers.indexOf("Code Handraiser");
  const branchIdx = headers.indexOf("Branch Code");
  for (let i = data.length - 1; i >= 1; i--) {
    const raw = (data[i][phoneIdx] || '').toString().trim();
    if (!raw) continue; // แถวของแถม/ส่วนลด/แถวรอง — ข้าม
    if (deobfuscate(raw).replace(/\D/g, '') === phone &&
        (secureUser.Role !== 'Sales' || branchIdx === -1 || data[i][branchIdx] === secureUser['Branch Code'])) {
      return {
        status: 'success', found: true,
        customerName: nameIdx > -1 ? (data[i][nameIdx] || '') : '',
        email: emailIdx > -1 ? (data[i][emailIdx] || '') : '',
        idCard: idCardIdx > -1 ? deobfuscate((data[i][idCardIdx] || '').toString()) : '',
        codeHandraiser: codeIdx > -1 ? (data[i][codeIdx] || '') : ''
      };
    }
  }
  return { status: 'success', found: false };
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

    // นโยบาย 2026-07-05 (รอบ 7.1): PII เขียน plain text — ไม่ obfuscate อีกต่อไป (ฝั่งอ่านคง deobfuscate ไว้เพื่อแถวเก่า)

    const prodData = prodSheet.getDataRange().getValues(); 
    const pHeaders = prodData[0];
    const pSkuIdx = pHeaders.indexOf("SKU"); 
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
      // ไม่มีการเปลี่ยนแปลงที่กระทบสต๊อก — ข้าม ไม่งั้น InventoryLog มีคู่ REVERT/APPLY ขยะทุกแถวทุกครั้งที่แก้ออเดอร์
      if (oldStatusVal !== 'Cancelled' && newStatusVal !== 'Cancelled' && oldSkuVal === newSkuVal && oldQtyVal === newQtyVal) return;
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
        let newSkuFound = false;
        for (let i = 1; i < prodData.length; i++) {
          if (prodData[i][pSkuIdx] == newSkuVal) {
            newSkuFound = true;
            let currentStock = parseInt(prodData[i][pStockIdx] || 0);
            if (currentStock < newQtyVal) throw new Error("สินค้า " + prodData[i][pNameIdx] + " สต๊อกไม่พอสำหรับการแก้ไข (เหลือ " + currentStock + ")");
            prodData[i][pStockIdx] = currentStock - newQtyVal;
            invRows.push([generateId('INV'), now, newSkuVal, "EDIT (APPLY)", -newQtyVal, branchVal, secureUser.Username]);
            break;
          }
        }
        if (!newSkuFound) throw new Error("ไม่พบสินค้า SKU: " + newSkuVal);
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
        // Qty = 0 เป็นค่าที่ตั้งใจได้ — ห้ามใช้ || ที่ทำให้ 0 ตกกลับไปเป็นค่าเดิม
        newQtyVal = dataObj["Qty"] !== undefined ? parseInt(dataObj["Qty"], 10) : oldQtyVal;
        if (!Number.isInteger(newQtyVal) || newQtyVal < 0) throw new Error("จำนวน (Qty) ไม่ถูกต้อง");
        newStatusVal = newStatus;

        // Row Total คำนวณฝั่ง server เสมอ (qty × unit price) — ไม่รับค่าจาก client
        let unitPrice = parseFloat((rData[oHeaders.indexOf("Unit Price")] || 0).toString().replace(/,/g, '')) || 0;
        if (newSkuVal && newSkuVal !== 'DISCOUNT') {
          let priceFound = false;
          for (let p = 1; p < prodData.length; p++) {
            if (prodData[p][pSkuIdx] == newSkuVal) {
              unitPrice = parseFloat((prodData[p][pHeaders.indexOf("Price")] || 0).toString().replace(/,/g, '')) || 0;
              priceFound = true;
              break;
            }
          }
          if (!priceFound) throw new Error("ไม่พบสินค้า SKU สำหรับแก้ไข: " + newSkuVal);
        }
        dataObj["Row Total"] = newQtyVal * unitPrice;

        // กัน formula injection บนฟิลด์ข้อความอิสระที่ user พิมพ์เอง — ห้ามครอบคอลัมน์ตัวเลข/ควบคุม (Row Total, Qty, Order Status ฯลฯ)
        // ไม่งั้นค่าตัวเลขจะกลายเป็นสตริงและพังการรวมยอด/สถานะ
        const FREE_TEXT_COLS_ = ["Customer Name", "Contact Number", "Email", "ID Card_Passport", "Code Handraiser", "Promo", "Staff", "Booking Phone", "Customer Interests", "Remark"];
        oHeaders.forEach(h => {
          if (dataObj[h] !== undefined && h !== "_rowIndex") {
            newRowData.push(FREE_TEXT_COLS_.includes(h) ? sanitizeSheetText_(dataObj[h]) : dataObj[h]);
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
      // สต๊อกเปลี่ยนแล้วต้องเคลียร์ cache — ไม่งั้น POS เห็นสต๊อกเก่าได้ถึง 6 ชม.
      CacheService.getScriptCache().remove("TABLE_Products");
    }
    if (invRows.length > 0) {
      invSheet.getRange(invSheet.getLastRow() + 1, 1, invRows.length, invRows[0].length).setValues(invRows);
    }
    // (7.1) PII เป็น plain text — บังคับ format '@' ที่ 2 คอลัมน์นี้ก่อนเขียน กันเลข 0 นำหน้าเบอร์/เลขบัตรหาย
    const piiColIdx = ["Contact Number", "ID Card_Passport"].map(h => oHeaders.indexOf(h)).filter(i => i > -1);
    orderUpdates.forEach(update => {
      piiColIdx.forEach(ci => orderSheet.getRange(update.row, ci + 1).setNumberFormat('@'));
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
    // Orders ต้องผ่าน UPDATE_FULL_ORDER เท่านั้น — สายนี้ไม่ obfuscate PII, ไม่ปรับสต๊อก และไม่มีข้อจำกัด per-field ของ Manager
    if (tableName === 'Orders') throw new Error("Permission Denied: Orders แก้ไขได้ผ่านหน้าจัดการออเดอร์เท่านั้น");
    if (secureUser.Role !== 'Admin') throw new Error("Permission Denied: Admin only");
    const sheet = ss.getSheetByName(tableName); const data = sheet.getDataRange().getDisplayValues(); const headers = data[0].map(h => h.toString().trim()); let idIndex = headers.indexOf(idField); let rowIndex = -1;
    if (dataObj[idField]) { for (let i = 1; i < data.length; i++) { if (data[i][idIndex] == dataObj[idField]) { rowIndex = i + 1; break; } } }
    if (tableName === "Members") {
      if (!dataObj.Password || dataObj.Password.trim() === "") {
        if (rowIndex > -1) {
          dataObj.Password = data[rowIndex - 1][headers.indexOf("Password")];
        } else {
          dataObj.Password = hashPassword("1234");
        }
      } else if (!looksLikePasswordHash_(dataObj.Password)) {
        dataObj.Password = hashPassword(dataObj.Password);
      }
    }
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
        const pCatIdx = prodData[0].indexOf("Category");
        
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
            
            let shouldRestore = rowStatus !== 'Cancelled' && rowSku && rowSku !== 'DISCOUNT';
            if (shouldRestore && pCatIdx > -1) {
              for (let p = 1; p < prodData.length; p++) {
                if (prodData[p][pSkuIdx] == rowSku) {
                  const category = (prodData[p][pCatIdx] || '').toString().toLowerCase();
                  const currentStock = parseInt(prodData[p][pStockIdx] || 0, 10);
                  if ((category.includes('gift') || category.includes('ของแถม')) && currentStock < rowQty) shouldRestore = false;
                  break;
                }
              }
            }
            if (shouldRestore) {
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
            // สต๊อกเปลี่ยนแล้วต้องเคลียร์ cache — ไม่งั้น POS เห็นสต๊อกเก่าได้ถึง 6 ชม.
            CacheService.getScriptCache().remove("TABLE_Products");
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
      else if (type === 'herobanner') heroBanners.push({ rowIndex: rIdx, id: data[i][0] ? data[i][0].toString().trim() : '', url: url.toString().trim(), targetLink: targetLink, details: details });
      else if (type === 'promogrid') promoGrids.push({ rowIndex: rIdx, id: data[i][0] ? data[i][0].toString().trim() : '', url: url.toString().trim(), targetLink: targetLink, details: details });
      else if (type === 'popupbanner') popupBanners.push({ rowIndex: rIdx, id: data[i][0] ? data[i][0].toString().trim() : '', url: url.toString().trim(), targetLink: targetLink, details: details });
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
        if (key === 'DriveFolderId' && val !== '') {
          const idMatch = val.match(/folders\/([a-zA-Z0-9_-]+)/);
          if (idMatch && idMatch[1]) val = idMatch[1];
          try {
            DriveApp.getFolderById(val);
          } catch (e) {
            throw new Error("Drive Folder ID ที่ตั้งค่าไว้ไม่ถูกต้อง หรือบัญชีนี้ไม่มีสิทธิ์เข้าถึงโฟลเดอร์ (ตรวจที่ ตั้งค่าระบบ → ฐานข้อมูล)");
          }
        }
        for (let i = 1; i < data.length; i++) {
          if (data[i][0] === key) {
            // บังคับ cell เป็น plain text ก่อนเขียน — ไม่งั้น Sheets แปลง "2026-06-01T00:00" เป็น Date
            // แล้วอ่านกลับได้ format ที่ input datetime-local ไม่รับ (ช่องตั้งค่าแสดงค่าว่าง)
            const cell = sheet.getRange(i + 1, 2);
            cell.setNumberFormat('@');
            cell.setValue(val);
            found = true;
            break;
          }
        }
        if (!found) {
          const newRow = sheet.getLastRow() + 1;
          // Remark map ตาม key — path นี้เป็น key-value generic ไม่ได้มีแค่ค่าจองแล้ว (รอบ 11 เพิ่ม DriveFolderId)
          const remarkMap = { ReserveStart: 'วันเริ่มจองสินค้า', ReserveEnd: 'วันสิ้นสุดจองสินค้า', DriveFolderId: 'โฟลเดอร์ Drive เก็บรูปอัปโหลด', SystemName: 'ชื่อเว็บแอป (แสดงบนแท็บเบราว์เซอร์/หน้า login/เมนู — ใช้ตอนนำไปสำเนาใช้กับร้าน/แบรนด์อื่น)', InvoiceCompanyName: 'ชื่อบริษัท (ใบเสนอราคา/ใบแจ้งหนี้)', InvoiceCompanyAddress: 'ที่อยู่บริษัท (ใบเสนอราคา/ใบแจ้งหนี้)', InvoiceCompanyEmail: 'อีเมลติดต่อ (ใบเสนอราคา/ใบแจ้งหนี้)', InvoiceLogoUrl: 'โลโก้บริษัท (ใบเสนอราคา/ใบแจ้งหนี้)', ApproverSignatureUrl: 'รูปลายเซ็นผู้อนุมัติ (ประทับเมื่ออนุมัติใบเสนอราคา/ใบแจ้งหนี้)', ApproverName: 'ชื่อผู้อนุมัติ (ประทับเมื่ออนุมัติใบเสนอราคา/ใบแจ้งหนี้)' };
          sheet.getRange(newRow, 2).setNumberFormat('@');
          sheet.getRange(newRow, 1, 1, 3).setValues([[key, val, remarkMap[key] || key]]);
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
      // กัน rowIndex เพี้ยน (ค้างจาก UI เก่า/แถวถูกลบไปแล้ว) เขียนทับ header หรือแถวนอกขอบเขตชีตแบบเงียบๆ
      const ri = parseInt(rowIndex, 10);
      if (!Number.isInteger(ri) || ri < 2 || ri > bannersSheet.getLastRow()) throw new Error("ตำแหน่งแถวไม่ถูกต้อง กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง");
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

// ทำให้ไฟล์เปิดผ่านลิงก์ได้ (อย่างน้อย VIEW): ลองตั้ง ANYONE_WITH_LINK/VIEW ตรง ๆ ก่อน
// ถ้าโฟลเดอร์ปลายทางถูกแชร์ลิงก์แบบกว้างกว่าอยู่แล้ว (เช่น ANYONE_WITH_LINK/EDIT) ไฟล์ใหม่จะสืบทอดสิทธิ์นั้นมา
// และการ setSharing เป็น VIEW = การ "ลดสิทธิ์ inherited" ซึ่ง Drive ปฏิเสธด้วย Exception
// "ไม่ได้รับอนุญาตให้เข้าถึง: DriveApp" ที่ชวนเข้าใจผิด ทั้งที่ไฟล์เข้าถึงผ่านลิงก์ได้แล้ว
// (root cause ของบั๊ก 2026-07-08 กับโฟลเดอร์ "รูปสินค้า") — จึงเช็คสิทธิ์ effective แทนการเชื่อ error
function ensureLinkViewable_(file) {
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return true;
  } catch (e) {
    try {
      const acc = file.getSharingAccess();
      return (acc === DriveApp.Access.ANYONE_WITH_LINK || acc === DriveApp.Access.ANYONE) &&
             file.getSharingPermission() !== DriveApp.Permission.NONE;
    } catch (e2) {
      return false;
    }
  }
}

function uploadImage(payload, secureUser, ss) {
  if (secureUser.Role !== 'Admin') throw new Error("ไม่มีสิทธิ์อัปโหลดรูป (Admin only)");

  const mimeType = (payload.mimeType || '').toString();
  if (mimeType.indexOf('image/') !== 0) throw new Error("ไฟล์ต้องเป็นรูปภาพเท่านั้น (jpg, png, webp, gif)");

  const base64Data = (payload.base64Data || '').toString();
  if (!base64Data) throw new Error("ไม่พบข้อมูลไฟล์รูป");
  const approxBytes = Math.floor(base64Data.length * 3 / 4);
  if (approxBytes > 5 * 1024 * 1024) throw new Error("ไฟล์รูปใหญ่เกินไป (จำกัดไม่เกิน 5MB ต่อไฟล์)");

  const rawName = (payload.fileName || 'image').toString();
  const dotIdx = rawName.lastIndexOf('.');
  const baseName = (dotIdx > 0 ? rawName.slice(0, dotIdx) : rawName).replace(/[^a-zA-Z0-9._-]/g, '_');
  const ext = (dotIdx > 0 ? rawName.slice(dotIdx) : '').replace(/[^a-zA-Z0-9.]/g, '');
  const fileName = baseName + '_' + new Date().getTime() + ext;

  const settings = getKeyValueSettings(ss);
  const driveFolderId = (settings.DriveFolderId || '').toString().trim();
  let folder;
  if (driveFolderId) {
    try {
      folder = DriveApp.getFolderById(driveFolderId);
    } catch (e) {
      throw new Error("Drive Folder ID ที่ตั้งค่าไว้ไม่ถูกต้อง หรือบัญชีนี้ไม่มีสิทธิ์เข้าถึงโฟลเดอร์ (ตรวจที่ ตั้งค่าระบบ → ฐานข้อมูล)");
    }
  } else {
    const folders = DriveApp.getFoldersByName("MPOS Product Images");
    folder = folders.hasNext() ? folders.next() : DriveApp.createFolder("MPOS Product Images");
  }

  const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
  const file = folder.createFile(blob);

  // Drive มีดีเลย์สั้น ๆ หลังสร้างไฟล์ก่อนที่การเปลี่ยนสิทธิ์แชร์จะสำเร็จ (eventual consistency) — ลองซ้ำ 1 ครั้งกันพลาด
  let sharingOk = false;
  for (let attempt = 0; attempt < 2 && !sharingOk; attempt++) {
    if (attempt > 0) Utilities.sleep(800);
    sharingOk = ensureLinkViewable_(file);
  }
  if (!sharingOk) {
    // ลบไฟล์ทิ้งแทนที่จะปล่อยให้ค้างอยู่ด้วยสิทธิ์แชร์ที่ไม่ปลอดภัย/ไม่รู้สถานะ — ให้ Admin อัปโหลดใหม่แทน
    try { file.setTrashed(true); } catch (e2) {}
    throw new Error("อัปโหลดรูปสำเร็จแต่ตั้งค่าการแชร์ลิงก์ไม่สำเร็จ กรุณาลองอัปโหลดใหม่อีกครั้ง");
  }

  logAudit(secureUser.Username, "UPLOAD_IMAGE", "Uploaded image: " + fileName);

  return { status: 'success', url: 'https://drive.google.com/uc?export=view&id=' + file.getId() };
}

// ===== ใบเสนอราคา/ใบแจ้งหนี้ (Invoices) — เก็บลงชีต + workflow อนุมัติ (2026-07-11) =====
// หนึ่งเอกสาร = หนึ่งแถว; รายการสินค้าเก็บเป็น JSON ใน "Items JSON" (เอกสารอิสระ ไม่ผูกกับ Orders/Stock)
// สถานะ: "รออนุมัติ" → "อนุมัติแล้ว" (Admin/Manager กดอนุมัติ; เอกสารที่อนุมัติแล้วแก้ไข/ลบไม่ได้ ยกเว้น Admin ลบได้)
// ลำดับคอลัมน์ Orders ตามชีวิตจริง (setupDatabase ใช้สร้างชีตใหม่ + processCheckout ใช้ตรวจว่าชีตเดิมไม่ถูกสลับคอลัมน์)
// orderRows.push() ทั้ง 3 จุดใน processCheckout เป็น array ตำแหน่งตรงตัว (ไม่ได้ map ด้วยชื่อ header) — ถ้าคอลัมน์ในชีตจริงสลับตำแหน่งไปจากนี้
// (เช่น มีคนแทรก/ย้ายคอลัมน์ใน Sheets UI ตรงๆ) ข้อมูลจะเขียนผิดคอลัมน์แบบเงียบๆ จึงต้องเช็คก่อนเขียนทุกครั้ง ดู rule ที่เกี่ยวข้องใน CLAUDE.md
var ORDERS_HEADERS_ = [
  "OrderID", "Timestamp", "Channel", "Branch Code", "Customer Name", "Contact Number", "Email", "ID Card_Passport", "Code Handraiser",
  "SKU", "Product Name", "Qty", "Unit Price", "Promo", "Reservation Status", "Staff", "Booking Phone",
  "Customer Interests", "Remark", "Row Total", "Order Status", "Receipt No", "Deposit", "Client Request ID"
];

var INVOICES_HEADERS_ = [
  "Invoice ID", "Invoice No", "Type", "Invoice Date",
  "Customer Name", "Customer Address", "Customer Phone", "Customer Email", "Customer TaxID",
  "Job Name", "Payment Terms", "Items JSON", "Remarks",
  "VAT Enabled", "WHT Percent", "Sub Total", "VAT", "WHT", "Net Total",
  "Company Name", "Company Address", "Company Email", "Logo Url",
  "Status", "Requested By", "Requested At", "Approved By", "Approved At"
];

function getOrCreateInvoicesSheet_(ss) {
  let sheet = ss.getSheetByName("Invoices");
  if (!sheet) {
    sheet = ss.insertSheet("Invoices");
    sheet.getRange(1, 1, 1, INVOICES_HEADERS_.length).setValues([INVOICES_HEADERS_]).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getInvoices(secureUser, ss) {
  const sheet = getOrCreateInvoicesSheet_(ss);
  let rows = getTableDataAsJson(sheet);
  if (!['Admin', 'Manager'].includes(secureUser.Role)) {
    rows = rows.filter(r => r['Requested By'] === secureUser.Username);
  }
  return { status: 'success', data: rows };
}

function saveInvoice(payload, secureUser, ss) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getOrCreateInvoicesSheet_(ss);
    const d = payload.data || {};

    const invoiceNo = (d.invoiceNo || '').toString().trim();
    if (!invoiceNo) throw new Error("กรุณาระบุเลขที่เอกสาร");

    let items;
    try { items = JSON.parse((d.itemsJson || '[]').toString()); } catch (e) { throw new Error("รูปแบบรายการสินค้าไม่ถูกต้อง"); }
    if (!Array.isArray(items)) throw new Error("รูปแบบรายการสินค้าไม่ถูกต้อง");
    // คุมเฉพาะ shape/ชนิดข้อมูล — ตัวเลขในเอกสารเป็น informational ไม่กระทบสต๊อก/ยอดขายจริง
    items = items.map(it => ({
      desc: (it && it.desc ? it.desc : '').toString().slice(0, 500),
      qty: parseFloat(it && it.qty) || 0,
      price: parseFloat(it && it.price) || 0
    })).filter(it => it.desc !== '' || it.price > 0);
    if (items.length === 0) throw new Error("กรุณาเพิ่มรายการอย่างน้อย 1 รายการ");

    const logoUrl = (d.logoUrl || '').toString();
    const now = new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" });

    // sanitizeSheetText_ กัน formula injection — setNumberFormat('@') ด้านล่างกันแค่การแปลงชนิดตัวเลข/วันที่ ไม่กัน "=..." ตีความเป็นสูตร
    const values = {
      "Invoice No": sanitizeSheetText_(invoiceNo),
      "Type": sanitizeSheetText_(d.type || 'ใบเสนอราคา (Quotation)'),
      "Invoice Date": (d.invoiceDate || '').toString(),
      "Customer Name": sanitizeSheetText_(d.custName || ''),
      "Customer Address": sanitizeSheetText_(d.custAddress || ''),
      "Customer Phone": sanitizeSheetText_(d.custPhone || ''),
      "Customer Email": sanitizeSheetText_(d.custEmail || ''),
      "Customer TaxID": sanitizeSheetText_(d.custTaxId || ''),
      "Job Name": sanitizeSheetText_(d.jobName || ''),
      "Payment Terms": sanitizeSheetText_(d.payTerms || ''),
      "Items JSON": JSON.stringify(items),
      "Remarks": sanitizeSheetText_(d.remarks || ''),
      "VAT Enabled": d.vatEnabled ? 'TRUE' : 'FALSE',
      "WHT Percent": parseFloat(d.whtPct) || 0,
      "Sub Total": parseFloat(d.subTotal) || 0,
      "VAT": parseFloat(d.vat) || 0,
      "WHT": parseFloat(d.wht) || 0,
      "Net Total": parseFloat(d.netTotal) || 0,
      "Company Name": sanitizeSheetText_(d.companyName || ''),
      "Company Address": sanitizeSheetText_(d.companyAddress || ''),
      "Company Email": sanitizeSheetText_(d.companyEmail || ''),
      // เก็บเฉพาะ URL จริง — โลโก้ที่เปลี่ยนเฉพาะใบผ่าน FileReader เป็น data: URL ยาวมาก (เกิน cell limit ได้) จะไม่เก็บ
      "Logo Url": /^https?:\/\//.test(logoUrl) ? logoUrl : '',
      "Status": "รออนุมัติ",
      "Approved By": "",
      "Approved At": ""
    };

    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(h => h.toString());
    const idCol = headers.indexOf("Invoice ID");
    let invoiceId = (d.invoiceId || '').toString().trim();

    if (invoiceId) {
      // แก้ไขเอกสารเดิม — ได้เฉพาะของตัวเอง (หรือ Admin) และต้องยังไม่อนุมัติ
      let rowIdx = -1;
      for (let i = 1; i < data.length; i++) { if (data[i][idCol] === invoiceId) { rowIdx = i; break; } }
      if (rowIdx === -1) throw new Error("ไม่พบเอกสารที่ต้องการแก้ไข");
      const existing = {};
      headers.forEach((h, c) => existing[h] = data[rowIdx][c]);
      if (existing["Status"] === 'อนุมัติแล้ว') throw new Error("เอกสารนี้อนุมัติแล้ว ไม่สามารถแก้ไขได้");
      if (secureUser.Role !== 'Admin' && existing["Requested By"] !== secureUser.Username) throw new Error("แก้ไขได้เฉพาะเอกสารที่ตนเองสร้าง");
      values["Invoice ID"] = invoiceId;
      values["Requested By"] = existing["Requested By"];
      values["Requested At"] = existing["Requested At"];
      const rowArr = headers.map(h => (h in values) ? values[h] : '');
      const range = sheet.getRange(rowIdx + 1, 1, 1, headers.length);
      range.setNumberFormat('@'); // กัน Sheets แปลงวันที่/เบอร์โทร/JSON เป็นชนิดอื่น
      range.setValues([rowArr]);
      logAudit(secureUser.Username, "INVOICE_UPDATE", "Updated invoice " + invoiceNo + " (" + invoiceId + ")");
    } else {
      invoiceId = generateId('INVD');
      values["Invoice ID"] = invoiceId;
      values["Requested By"] = secureUser.Username;
      values["Requested At"] = now;
      const rowArr = headers.map(h => (h in values) ? values[h] : '');
      const newRow = sheet.getLastRow() + 1;
      const range = sheet.getRange(newRow, 1, 1, headers.length);
      range.setNumberFormat('@');
      range.setValues([rowArr]);
      logAudit(secureUser.Username, "INVOICE_CREATE", "Created invoice " + invoiceNo + " (" + invoiceId + ")");
    }

    return { status: 'success', invoiceId: invoiceId };
  } finally {
    lock.releaseLock();
  }
}

function approveInvoice(payload, secureUser, ss) {
  if (!['Admin', 'Manager'].includes(secureUser.Role)) throw new Error("เฉพาะ Admin/Manager เท่านั้นที่อนุมัติเอกสารได้");
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getOrCreateInvoicesSheet_(ss);
    const invoiceId = (payload.invoiceId || '').toString().trim();
    if (!invoiceId) throw new Error("ไม่พบรหัสเอกสาร");

    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(h => h.toString());
    const idCol = headers.indexOf("Invoice ID");
    const statusCol = headers.indexOf("Status");
    const abCol = headers.indexOf("Approved By");
    const aaCol = headers.indexOf("Approved At");

    let rowIdx = -1;
    for (let i = 1; i < data.length; i++) { if (data[i][idCol] === invoiceId) { rowIdx = i; break; } }
    if (rowIdx === -1) throw new Error("ไม่พบเอกสารนี้ในระบบ");
    if (data[rowIdx][statusCol] === 'อนุมัติแล้ว') throw new Error("เอกสารนี้ถูกอนุมัติไปแล้ว");

    // ชื่อบนตราประทับ = ชื่อผู้อนุมัติที่กำหนดใน ตั้งค่าระบบ → ข้อมูลบริษัท (ApproverName)
    // ไม่ใช่ชื่อ user ที่ล็อกอินกดปุ่ม (คนกดถูกบันทึกใน AuditLog อยู่แล้ว) — fallback เป็นชื่อคนกดเมื่อยังไม่ตั้งค่า
    const settings = getKeyValueSettings(ss);
    const approverName = ((settings.ApproverName || '').toString().trim() || secureUser.Name || secureUser.Username).toString();
    const now = new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" });
    data[rowIdx][statusCol] = 'อนุมัติแล้ว';
    data[rowIdx][abCol] = approverName;
    data[rowIdx][aaCol] = now;
    const range = sheet.getRange(rowIdx + 1, 1, 1, headers.length);
    range.setNumberFormat('@');
    range.setValues([data[rowIdx]]); // เขียนทั้งแถวครั้งเดียว (rule 8: batch write)

    logAudit(secureUser.Username, "INVOICE_APPROVE", "Approved invoice " + data[rowIdx][headers.indexOf("Invoice No")] + " (" + invoiceId + ")");
    return { status: 'success', approvedBy: approverName, approvedAt: now };
  } finally {
    lock.releaseLock();
  }
}

function deleteInvoice(payload, secureUser, ss) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getOrCreateInvoicesSheet_(ss);
    const invoiceId = (payload.invoiceId || '').toString().trim();
    if (!invoiceId) throw new Error("ไม่พบรหัสเอกสาร");

    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(h => h.toString());
    const idCol = headers.indexOf("Invoice ID");
    let rowIdx = -1;
    for (let i = 1; i < data.length; i++) { if (data[i][idCol] === invoiceId) { rowIdx = i; break; } }
    if (rowIdx === -1) throw new Error("ไม่พบเอกสารนี้ในระบบ");

    const status = data[rowIdx][headers.indexOf("Status")];
    const requestedBy = data[rowIdx][headers.indexOf("Requested By")];
    // Admin ลบได้ทุกใบ; คนอื่นลบได้เฉพาะใบของตนเองที่ยังไม่อนุมัติ
    if (secureUser.Role !== 'Admin') {
      if (requestedBy !== secureUser.Username) throw new Error("ลบได้เฉพาะเอกสารที่ตนเองสร้าง");
      if (status === 'อนุมัติแล้ว') throw new Error("เอกสารที่อนุมัติแล้วไม่สามารถลบได้");
    }

    sheet.deleteRow(rowIdx + 1);
    logAudit(secureUser.Username, "INVOICE_DELETE", "Deleted invoice " + data[rowIdx][headers.indexOf("Invoice No")] + " (" + invoiceId + ")");
    return { status: 'success' };
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
    let rowIndex = parseInt(payload.rowIndex);
    const bannerId = payload.bannerId ? payload.bannerId.toString().trim() : '';
    if (!rowIndex || rowIndex < 2) throw new Error("Invalid row index");

    // กันลบผิดแถวเมื่อชีตขยับ (มีคนลบ/แทรกแถวไปก่อน) — ยืนยันด้วย Banner ID ถ้าไม่ตรงให้ re-scan หาแถวจริง
    if (bannerId) {
      const data = bannersSheet.getDataRange().getValues();
      const idAtRow = (data[rowIndex - 1] && data[rowIndex - 1][0] !== undefined && data[rowIndex - 1][0] !== null)
        ? data[rowIndex - 1][0].toString().trim() : '';
      if (idAtRow !== bannerId) {
        rowIndex = -1;
        for (let i = 1; i < data.length; i++) {
          if ((data[i][0] || '').toString().trim() === bannerId) { rowIndex = i + 1; break; }
        }
        if (rowIndex < 2) throw new Error("ไม่พบรายการแบนเนอร์ที่ต้องการลบ (ข้อมูลอาจถูกแก้ไขไปแล้ว) กรุณารีเฟรชหน้า");
      }
    }

    bannersSheet.deleteRow(rowIndex);
    logAudit(secureUser.Username, "SETTING_DELETE", "Deleted Setting " + type + " at row " + rowIndex);
    return { status: 'success' };
  } catch(e) {
    return { status: 'error', message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}
