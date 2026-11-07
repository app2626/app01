// คอลัมน์สเปคสินค้าในชีต Products (9 คอลัมน์มาตรฐานสำหรับตารางเปรียบเทียบสเปคและหน้ารายละเอียดสินค้า)
var PRODUCT_SPEC_COLS_ = ["Display", "Processor", "RAM", "Rear Camera", "Front Camera", "Battery", "OS", "Connectivity", "Warranty"];

function doGet(e) {
  // ชื่อเว็บแอปตั้งค่าได้จากเมนู "ตั้งค่าระบบ" (Settings sheet, key SystemName) — เพื่อให้สำเนาโปรเจกต์ไปใช้ที่อื่น
  // เปลี่ยนชื่อได้จากหน้าเว็บล้วนๆ โดยไม่ต้องแก้โค้ด/deploy ใหม่
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const appName = (getKeyValueSettings(ss).SystemName || '').toString().trim() || 'Mobile Pre Booking System';
  const template = HtmlService.createTemplateFromFile('Index');
  template.appName = appName;
  // เลขใบจองจากลิงก์ ?track= / ?orderId= — กรองเหลือเฉพาะอักขระปลอดภัยก่อนฝังลงสคริปต์ (กัน script injection)
  const rawTrack = (e && e.parameter && (e.parameter.track || e.parameter.orderId)) || '';
  template.trackParam = /^[A-Za-z0-9_\-]{1,64}$/.test(String(rawTrack)) ? String(rawTrack) : '';
  // ลิงก์สินค้าที่แชร์ (?p=ชื่อรุ่น): ส่งให้หน้าเว็บเพื่อพาไปหน้าสั่งจองแล้วเปิดรุ่นนั้น (ตัดความยาว; ฝั่งหน้าเว็บ escape เองตอนแสดง)
  const rawP = (e && e.parameter && e.parameter.p) ? String(e.parameter.p) : '';
  // ค่านี้ถูกฝังใน <script> ด้วย JSON.stringify ซึ่งไม่ escape </script> — ตัด < > & ตัวควบคุม และ U+2028/2029 ออกก่อน กัน script injection
  template.deepModel = rawP.length <= 120 ? rawP.replace(/[<>&\u0000-\u001f\u2028\u2029]/g, '') : '';
  // URL /exec ของ deployment ปัจจุบัน — ใช้สร้างลิงก์แชร์สินค้า (?p=รุ่น); ใน iframe ของ GAS หน้าเว็บอ่าน URL ชั้นนอกเองไม่ได้
  try { template.appUrl = ScriptApp.getService().getUrl() || ''; } catch (e) { template.appUrl = ''; }
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
    // เพิ่มคอลัมน์สเปคสินค้า 9 คอลัมน์ต่อท้ายชีต Products สำหรับตารางเปรียบเทียบสเปคและหน้ารายละเอียดสินค้า
    "Products": ["SKU", "Product Name", "Model", "Marketing Model", "Product Group", "Capacity", "Color", "Image URL", "Price", "Stock", "Unit", "Category", "Status", "Channel", "Original Price"].concat(PRODUCT_SPEC_COLS_),
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
    "UI_Banners": ["Banner ID", "Type", "URL", "Status", "Target Link", "Details", "Title", "Button Text", "Start Date", "End Date"],
    "Target": ["Area", "เป้า"],
    "Invoices": INVOICES_HEADERS_
  };

  const initialAdminPassword = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  const dummyData = {
    "Settings": [
      ["SystemName", "Mobile Pre Booking System", "ชื่อระบบ"],
      ["Currency", "THB", "สกุลเงิน"],
      ["ReserveStart", "2026-06-01T00:00:00", "วันเริ่มจองสินค้า"],
      ["ReserveEnd", "2026-06-30T23:59:59", "วันสิ้นสุดจองสินค้า"]
    ],
    "Target": [
      ["ALL BRANCHES", 1000]
    ],
    "UI_Banners": [
      ["B-001", "loginbg", "https://images.unsplash.com/photo-1616348436168-de43ad0db179?q=80&w=1000", "เปิด"],
      ["B-002", "herobanner", "https://via.placeholder.com/1200x400/4f46e5/ffffff?text=Promo+1", "เปิด"],
      ["B-003", "herobanner", "https://via.placeholder.com/1200x400/10b981/ffffff?text=Promo+2", "เปิด"],
      ["B-004", "herobanner", "https://via.placeholder.com/1200x400/8b5cf6/ffffff?text=Promo+3", "เปิด"],
      ["B-005", "promogrid", "https://via.placeholder.com/600x400/f59e0b/ffffff?text=Grid+1+(Featured)", "เปิด"],
      ["B-006", "promogrid", "https://via.placeholder.com/400x400/ec4899/ffffff?text=Grid+2", "เปิด"],
      ["B-007", "promogrid", "https://via.placeholder.com/400x400/06b6d4/ffffff?text=Grid+3", "เปิด"],
      ["B-008", "popupbanner", "https://via.placeholder.com/800x800/10b981/ffffff?text=Popup+Banner+1", "เปิด"]
    ],
    "Products": [
      ["SKU-S24U", "Samsung Galaxy S24 Ultra", "S24 Ultra", "Samsung Galaxy S24 Ultra", "S24-Series", "512GB", "Titanium Black", "https://images.samsung.com/is/image/samsung/p6pim/th/2401/gallery/th-galaxy-s24-s928-sm-s928bzththl-thumb-539325419", 46900, 50, "เครื่อง", "โมบาย", "เปิด", "ALL", "", "6.8\" Dynamic AMOLED 2X 120Hz (QHD+)", "Snapdragon 8 Gen 3 for Galaxy", "12GB LPDDR5X", "200MP + 50MP (5x) + 10MP (3x) + 12MP", "12MP Dual Pixel AF", "5,000 mAh (ชาร์จไว 45W)", "Android 14 (One UI 6.1 + Galaxy AI)", "5G / Wi-Fi 7 / Bluetooth 5.3 / S-Pen", "ศูนย์ไทย 1 ปี"],
      ["SKU-IP15P", "iPhone 15 Pro Max", "15 Pro Max", "iPhone 15 Pro Max", "IP15-Series", "256GB", "Natural", "https://store.storeimages.cdn-apple.com/8756/as-images.apple.com/is/iphone-15-pro-max-natural-titanium-select", 48900, 20, "เครื่อง", "โมบาย", "เปิด", "ALL", "", "6.7\" Super Retina XDR ProMotion 120Hz", "Apple A17 Pro (3nm)", "8GB", "48MP Main + 12MP Ultra Wide + 12MP 5x Telephoto", "12MP TrueDepth Camera", "4,422 mAh (USB-C PD 27W / MagSafe 15W)", "iOS 17", "5G / Wi-Fi 6E / Bluetooth 5.3 / USB-C 3.0", "ศูนย์ไทย 1 ปี (Apple ประเทศไทย)"],
      ["GF-SAM-ADPT", "Samsung Adapter 25W (Black)", "Adapter", "Adapter", "-", "-", "Black", "https://images.samsung.com/is/image/samsung/p6pim/th/ep-ta800nbegww/gallery/th-25w-pd-adapter-ta800-ep-ta800nbegww-thumb-536852431", 490, 100, "ชิ้น", "ของแถมแบรนด์", "เปิด", "ALL", "", "", "", "", "", "", "", "", "", ""],
      ["GF-SAM-CASE", "Samsung Clear Case S24U", "Case", "Case", "-", "-", "Clear", "https://images.samsung.com/is/image/samsung/p6pim/th/ef-qs928ctegww/gallery/th-clear-case-for-galaxy-s24-ultra-ef-qs928-ef-qs928ctegww-thumb-539326442", 590, 100, "ชิ้น", "ของแถมแบรนด์", "เปิด", "ALL", "", "", "", "", "", "", "", "", "", ""],
      ["GF-TG-PB10K", "TG Powerbank 10000mAh", "PB", "PB", "-", "10000", "White", "https://via.placeholder.com/150/ffffff/000000?text=Powerbank", 990, 200, "ชิ้น", "ของแถมช่องทาง", "เปิด", "ALL", "", "", "", "", "", "", "", "", "", ""],
      ["GF-TG-BAG", "TG Premium Bag (Canvas)", "Bag", "Bag", "-", "-", "Black", "https://via.placeholder.com/150/000000/ffffff?text=TG+Bag", 390, 200, "ชิ้น", "ของแถมช่องทาง", "เปิด", "ALL", "", "", "", "", "", "", "", "", "", ""]
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

// One-time migration (2026-09-19): ย้ายคอลัมน์ Products "Marketing Model" มาติด "Model" และ "Original Price" มาติด "Price"
// รันด้วยมือครั้งเดียวจาก Apps Script editor (Run) เท่านั้น — ไม่ได้ผูกกับ apiHandler/เว็บแอป เพราะเป็นงานปรับโครงสร้างชีตแบบ one-off
// ทุกจุดอ่าน/เขียนชีต Products ในโค้ด (saveRecord/processCheckout/getTableDataAsJson ฯลฯ) ใช้ headers.indexOf(...) หา column แบบไดนามิกทั้งหมด
// ไม่มีจุดไหน hardcode ตำแหน่งคอลัมน์ Products ตายตัว — ย้ายคอลัมน์ทางกายภาพจึงไม่กระทบโค้ดฝั่งแอปเลย
// กติกาเดียวที่ต้องรักษา: ห้ามมี header ชื่อซ้ำกันสองคอลัมน์พร้อมกัน (obj[h]=row[i] จะอ่านได้แค่ค่าขวาสุด และ headers.map(h=>dataObj[h])
// จะเขียนค่าเดียวกันทับทุกคอลัมน์ที่ชื่อซ้ำ) — ฟังก์ชันนี้จึงคัดลอกค่าไปคอลัมน์ใหม่แล้ว "เปลี่ยนชื่อ" คอลัมน์เดิมเป็น "(เดิม)"
// แทนที่จะปล่อยชื่อซ้ำ ข้อมูลคอลัมน์เดิมยังอยู่ครบ ไม่ถูกลบ ไม่ถูกทับ แค่แอปเลิกอ่าน/เขียนคอลัมน์นั้นต่อไป
function migrateProductColumnLayout_20260919() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Products");
  if (!sheet) throw new Error("ไม่พบชีต Products");
  if (sheet.getLastRow() < 1) throw new Error("ชีต Products ไม่มีแม้แต่แถว header");

  function readHeaders() {
    return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => h.toString().trim());
  }

  // กันรันซ้ำ — ถ้าเคยรันไปแล้วจะมีคอลัมน์ "(เดิม)" ค้างอยู่ รันซ้ำจะย้ายคอลัมน์ archive ทับกันเองอีกที ห้ามปล่อยผ่าน
  const existingHeaders = readHeaders();
  if (existingHeaders.includes("Original Price (เดิม)") || existingHeaders.includes("Marketing Model (เดิม)")) {
    throw new Error("พบคอลัมน์ '(เดิม)' อยู่แล้วในชีต Products — ดูเหมือนเคยรัน migration นี้ไปแล้ว ยกเลิกเพื่อกันข้อมูลซ้ำซ้อน");
  }

  // แทรกคอลัมน์ใหม่ถัดจาก anchor -> คัดลอกค่าจากคอลัมน์ sourceHeaderName เดิม -> คอลัมน์เดิมเปลี่ยนชื่อเป็น "(เดิม)"
  // อ่าน header สดใหม่ทุกครั้งก่อนเริ่ม เพราะการแทรกคอลัมน์รอบก่อนหน้าเลื่อนตำแหน่งคอลัมน์อื่นไปแล้ว
  function moveColumnNextTo(sourceHeaderName, anchorHeaderName) {
    const headers = readHeaders();
    const anchorIdx1b = headers.indexOf(anchorHeaderName) + 1; // 1-based, 0 = not found
    const sourceIdx1b = headers.indexOf(sourceHeaderName) + 1;
    if (anchorIdx1b === 0) throw new Error("ไม่พบคอลัมน์ '" + anchorHeaderName + "'");
    if (sourceIdx1b === 0) throw new Error("ไม่พบคอลัมน์ '" + sourceHeaderName + "'");

    const lastRow = sheet.getLastRow();
    sheet.insertColumnAfter(anchorIdx1b);
    const newCol1b = anchorIdx1b + 1;
    // ถ้าคอลัมน์ต้นทางเดิมอยู่ตำแหน่งหลังจุดที่เพิ่งแทรก มันเลื่อนขวาไป 1 ช่องแล้วจากการ insert บรรทัดบน
    const shiftedSourceCol1b = sourceIdx1b >= newCol1b ? sourceIdx1b + 1 : sourceIdx1b;

    if (lastRow > 1) {
      const values = sheet.getRange(2, shiftedSourceCol1b, lastRow - 1, 1).getValues();
      sheet.getRange(2, newCol1b, lastRow - 1, 1).setValues(values);
    }
    sheet.getRange(1, newCol1b).setValue(sourceHeaderName)
      .setFontWeight("bold").setBackground("#4F46E5").setFontColor("white");
    sheet.getRange(1, shiftedSourceCol1b).setValue(sourceHeaderName + " (เดิม)");
  }

  moveColumnNextTo("Marketing Model", "Model");
  moveColumnNextTo("Original Price", "Price");

  CacheService.getScriptCache().remove("TABLE_Products");
  logAudit('SYSTEM', "MIGRATE_SCHEMA", "ย้ายคอลัมน์ Products: Marketing Model ไปติด Model, Original Price ไปติด Price (คอลัมน์เดิมเปลี่ยนชื่อเป็น '(เดิม)' เก็บข้อมูลไว้ครบ ไม่ลบ/ไม่ทับ)");

  return "เสร็จสมบูรณ์ — ตรวจสอบแถว header ของชีต Products แล้วทดสอบหน้า Products/Pre Booking/Checkout ก่อนใช้งานจริง";
}

// One-time cleanup (2026-09-19): ลบคอลัมน์ archive "(เดิม)" ที่ migrateProductColumnLayout_20260919() สร้างไว้
// รันเฉพาะหลังจากตรวจสอบด้วยตาแล้วว่าคอลัมน์ใหม่ (Marketing Model ติด Model / Original Price ติด Price) มีข้อมูลถูกต้องครบถ้วนจริง
// คำสั่งนี้ลบข้อมูลถาวร กู้คืนได้ทาง Google Sheets Version History เท่านั้น — รันด้วยมือจาก Apps Script editor เช่นเดียวกับฟังก์ชัน migrate
function deleteArchivedProductColumns_20260919() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Products");
  if (!sheet) throw new Error("ไม่พบชีต Products");

  function readHeaders() {
    return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => h.toString().trim());
  }

  // กันลบ archive ทิ้งทั้งที่คอลัมน์ใหม่ (ตำแหน่งติด Model/Price) ยังไม่มีอยู่จริง — ป้องกันรันผิดขั้นตอน/ผิดชีต
  const headers = readHeaders();
  if (headers.indexOf("Marketing Model") === -1 || headers.indexOf("Original Price") === -1) {
    throw new Error("ไม่พบคอลัมน์ 'Marketing Model' หรือ 'Original Price' (ตำแหน่งใหม่) ในชีต Products — ห้ามลบ archive ก่อนแน่ใจว่าคอลัมน์ใหม่พร้อมใช้งานแล้ว");
  }

  ["Marketing Model (เดิม)", "Original Price (เดิม)"].forEach(archiveHeaderName => {
    const idx1b = readHeaders().indexOf(archiveHeaderName) + 1; // อ่านสดทุกรอบ กันตำแหน่งเพี้ยนหลังลบคอลัมน์ก่อนหน้าในลูปนี้
    if (idx1b === 0) return; // ไม่มีคอลัมน์นี้แล้ว (อาจเคยลบไปแล้ว) ข้ามไป ไม่ throw
    sheet.deleteColumn(idx1b);
  });

  CacheService.getScriptCache().remove("TABLE_Products");
  logAudit('SYSTEM', "MIGRATE_SCHEMA", "ลบคอลัมน์ archive 'Marketing Model (เดิม)' และ 'Original Price (เดิม)' ออกจาก Products หลังยืนยันคอลัมน์ใหม่ถูกต้องแล้ว");

  return "ลบคอลัมน์ archive เรียบร้อย — ชีต Products เหลือ 15 คอลัมน์ (SKU..Channel เดิม + Marketing Model ติด Model + Original Price ติด Price)";
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

// คืนค่า config สาธารณะที่หน้า login ต้องใช้ (เรียกได้โดยไม่ต้อง login) — ต้องไม่มีข้อมูลอ่อนไหวปนมาเด็ดขาด
// รูปทรงคืนค่าเป็น object {loginBg, logoUrl} (2026-09-19 เพิ่ม logoUrl — เดิมคืนค่าเป็น string เปล่าๆ ของ loginBg อย่างเดียว)
function getPublicConfig() {
  let loginBg = null;
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("UI_Banners");
    if(sheet) {
       const data = sheet.getDataRange().getValues();
       for(let i=1; i<data.length; i++) {
         if (data[i][1] === 'loginbg' && statusOn_(data[i][3])) {
           loginBg = data[i][2] ? data[i][2].toString() : null;
           break;
         }
       }
    }
    if (loginBg === null) {
      // Fallback to old Settings sheet just in case it hasn't been migrated
      const oldSheet = ss.getSheetByName("Settings");
      if(oldSheet) {
         const rows = oldSheet.getDataRange().getValues();
         for (let i = 1; i < rows.length; i++) {
           const key = (rows[i][0] || '').toString().trim().toLowerCase();
           if (['loginbg', 'login bg', 'loginbackground', 'login background'].includes(key)) {
             loginBg = rows[i][1] ? rows[i][1].toString() : null;
             break;
           }
         }
         if (loginBg === null) {
           const val = oldSheet.getRange("D2").getValue();
           loginBg = val ? val.toString() : null;
         }
      }
    }
    const logoUrl = (getKeyValueSettings(ss).LogoUrl || '').toString().trim() || null;
    return { loginBg: loginBg, logoUrl: logoUrl };
  } catch(e) { return { loginBg: loginBg, logoUrl: null }; }
}

function looksLikePasswordHash_(value) {
  return /^[a-f0-9]{64}$/i.test((value || '').toString().trim());
}

// action ที่ "อ่านอย่างเดียว" — ไม่ต้องล้างแคช Dashboard; action อื่นทั้งหมด (บันทึก/ลบ/จอง/แก้/อัปโหลด/เคลียร์แคช) ล้างแคชก่อนและหลังทำงาน
// (ล้างหลังด้วย กันผู้อ่านที่ยิงเข้ามาระหว่างเขียนแล้วเขียนค่าเก่ากลับลงแคช) — เพิ่ม action อ่านใหม่ต้องมาเพิ่มที่นี่ ไม่งั้นแค่ล้างแคชเกินจำเป็น (ปลอดภัย)
var DASH_READ_ACTIONS_ = ['LOGIN', 'GET_ADVANCED_DASHBOARD', 'GET_TABLE', 'GET_ALL_DATA', 'GET_SETTINGS_LIST', 'NEWS_LIST', 'GET_CUSTOMER_BY_PHONE', 'GET_INVOICES', 'TRACK_ORDER', 'PUBLIC_TRACK_ORDER', 'VALIDATE_COUPON'];

function apiHandler(action, payload, userToken) {
  const isWrite = DASH_READ_ACTIONS_.indexOf(action) === -1;
  if (isWrite) invalidateDashboardCache_();
  try {
    return apiHandlerInner_(action, payload, userToken);
  } finally {
    if (isWrite) invalidateDashboardCache_();
  }
}

function apiHandlerInner_(action, payload, userToken) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let secureUser = null;
    if (action !== 'LOGIN' && action !== 'PUBLIC_TRACK_ORDER') {
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
      case 'GET_ADVANCED_DASHBOARD': return getAdvancedDashboard(secureUser, ss, payload);
      case 'GET_TABLE':
        // ตารางอ่อนไหว (ข้อมูลสมาชิก/ตั้งค่า/ประวัติระบบ) อ่านได้เฉพาะ Admin — บังคับสิทธิ์ฝั่ง server เสมอ
        if (['Members', 'Settings', 'AuditLog', 'OrderStatusLog'].includes(payload.tableName) && secureUser.Role !== 'Admin') {
          throw new Error("Permission Denied: Admin only");
        }
        // Target: หน้า Target/Analytics เปิดให้เฉพาะ Admin/Manager ใน menuConfig — ต้องบังคับฝั่ง server ด้วย ไม่งั้น Sales เรียก action นี้ตรงๆ ผ่าน console ได้
        if (payload.tableName === 'Target' && !['Admin', 'Manager'].includes(secureUser.Role)) {
          throw new Error("Permission Denied: Admin/Manager only");
        }
        // Coupons: โค้ดส่วนลดเป็นความลับ — อ่านได้เฉพาะ Admin (ฝั่ง POS ตรวจโค้ดผ่าน VALIDATE_COUPON เท่านั้น)
        // AutoPromotions: Admin เปิดหน้านี้ครั้งแรกหลังอัปเดต → แปลง Active/Inactive เดิมเป็น เปิด/ปิด (idempotent)
        if (payload.tableName === 'AutoPromotions' && secureUser.Role === 'Admin' && migrateStatusColumn_(ss.getSheetByName('AutoPromotions'), 'Status') > 0) CacheService.getScriptCache().remove('TABLE_AutoPromotions');
        if (payload.tableName === 'Coupons') {
          if (secureUser.Role !== 'Admin') throw new Error("Permission Denied: Admin only");
          ensureCouponsSheet_(ss);
        }
        if (payload.tableName === 'Products') {
          ensureProductSpecColumns_(ss);
        }
        let tableData = getTableDataAsJson(ss.getSheetByName(payload.tableName), secureUser.Role === 'Admin');
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
      case 'GET_ALL_DATA': return getAllInitialData(ss, secureUser.Role === 'Admin');
      case 'SAVE_RECORD': return saveRecord(payload.tableName, payload.data, payload.idField, secureUser, ss);
      case 'DELETE_RECORDS': return deleteRecords(payload, secureUser, ss);
      case 'BULK_SET_STATUS': return bulkSetStatus(payload, secureUser, ss);
      case 'DELETE_RECORD': return deleteRecord(payload.tableName, payload.idField, payload.idValue, secureUser, ss);
      case 'SAVE_PRODUCT_GROUP': return saveProductGroup(payload, secureUser, ss);
      case 'UPDATE_PRODUCT_GROUP': return updateProductGroup(payload, secureUser, ss);
      case 'CHECKOUT': return processCheckout(payload, secureUser, ss);
      case 'UPDATE_FULL_ORDER': return updateFullOrder(payload.data, secureUser, ss);
      case 'GET_SETTINGS_LIST':
        if (secureUser.Role !== 'Admin') throw new Error("Permission Denied: Admin only");
        return getSettingsList(ss);
      case 'SAVE_SETTINGS_ITEM': return saveSettingsItem(payload, secureUser, ss);
      case 'DELETE_SETTINGS_ITEM': return deleteSettingsItem(payload, secureUser, ss);
      case 'NEWS_LIST': return newsList(secureUser, ss);
      case 'NEWS_SAVE': return saveNews(payload, secureUser, ss);
      case 'NEWS_DELETE': return deleteNews(payload, secureUser, ss);
      case 'NEWS_SET_SEQ': return setNewsSeq(payload, secureUser, ss);
      case 'NEWS_CAT_SAVE': return saveNewsCategory(payload, secureUser, ss);
      case 'NEWS_CAT_DELETE': return deleteNewsCategories(payload, secureUser, ss);
      case 'UPLOAD_IMAGE': return uploadImage(payload, secureUser, ss);
      case 'CHANGE_PASSWORD': return changePassword(payload, secureUser, ss);
      case 'GET_CUSTOMER_BY_PHONE': return getCustomerByPhone(payload, secureUser, ss); // ทุก role ที่ login แล้ว — คืนเฉพาะฟิลด์เติมฟอร์ม
      case 'GET_INVOICES': return getInvoices(secureUser, ss);       // Admin/Manager เห็นทั้งหมด, role อื่นเห็นเฉพาะที่ตนสร้าง
      case 'SAVE_INVOICE': return saveInvoice(payload, secureUser, ss);
      case 'APPROVE_INVOICE': return approveInvoice(payload, secureUser, ss);
      case 'DELETE_INVOICE': return deleteInvoice(payload, secureUser, ss);
      case 'TRACK_ORDER': return trackOrderLookup(payload, secureUser, ss);
      case 'PUBLIC_TRACK_ORDER': return publicTrackOrderLookup(payload, ss);
      case 'BULK_UPDATE_PRODUCTS': return bulkUpdateProducts(payload, secureUser, ss);
      case 'IMPORT_PRODUCTS': return importProducts(payload, secureUser, ss);
      case 'IMPORT_RECORDS': return importRecords(payload, secureUser, ss);
      case 'VALIDATE_COUPON': return validateCouponApi_(payload, ss);
      case 'CLEAR_CACHE':
        if (secureUser.Role !== 'Admin') throw new Error("Permission Denied: Admin only");
        return clearAllCaches_(secureUser);
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

// skipCache=true (ใช้กับ Admin) ข้ามการ "อ่าน" จาก cache เสมอ อ่านสดจากชีตตรงๆ ทุกครั้ง — กันแอดมินเห็นข้อมูลเก่าค้างได้นานสุด 6 ชม. (21600 วิ ด้านล่าง)
// หลังจากคนอื่นแก้ไขชีตตรงๆ ใน Google Sheets UI (ไม่ผ่านฟอร์มของแอป จึงไม่มีจุดไหนสั่ง cache.remove() ให้) ยังคง "เขียน" ทับ cache ตามปกติ
// ไม่ว่า skipCache หรือไม่ — ผลคือพลอยรีเฟรช cache ให้ role อื่นที่ยังใช้ cache อยู่ (Sales/Manager) เห็นข้อมูลใหม่ไปด้วยทันทีที่แอดมินเข้าเปิดหน้าไหนก็ตาม
function getTableDataAsJson(sheet, skipCache) {
  if (!sheet) return [];
  const tableName = sheet.getName();
  const cache = CacheService.getScriptCache();
  const cacheableTables = ["Products", "Promotions", "Branches", "Channels", "Interests", "GiftMappings", "AutoPromotions"];

  if (!skipCache && cacheableTables.includes(tableName)) {
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
      sheet.appendRow(["AP-001", "โมบาย", "อุปกรณ์เสริม", 10, "ลูกค้าซื้อมือถือแล้ว! เสนอขายอุปกรณ์เสริม (เคส/ฟิล์ม/หัวชาร์จ) ตอนนี้ <strong class='text-rose-900'>รับส่วนลดอุปกรณ์เสริม 10% ทันที</strong>", "ลูกค้าได้รับส่วนลดอุปกรณ์เสริม 10% เรียบร้อยแล้ว", "เปิด", ""]);
      sheet.appendRow(["AP-002", "สมาร์ทวอทช์", "อุปกรณ์เสริม", 5, "ลูกค้าซื้อสมาร์ทวอทช์! เสนอขายสายนาฬิกาเพิ่ม รับส่วนลด 5%", "ได้รับส่วนลดสายนาฬิกา 5% เรียบร้อย", "ปิด", ""]);
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

// Retrofit "Title"/"Button Text" ให้ชีต UI_Banners ที่สร้างไว้ก่อนหน้านี้ (เดิมมีแค่ 6 คอลัมน์) — idempotent, เรียกซ้ำได้ปลอดภัย
// พอร์ตแนวคิดมาจาก pbzf8 (PromoPopupModal.jsx) 2026-09-19 — popup แจ้งเตือนของ f9 เดิมเป็นรูปเปล่าๆ อย่างเดียว ไม่มีหัวข้อ/คำอธิบาย/ปุ่ม CTA
// ขยายเป็น 10 คอลัมน์ (2026-11-06: เพิ่ม "Start Date"/"End Date" ต่อท้าย = ตั้งเวลาเปิด-ปิดแบนเนอร์) — เพิ่มเฉพาะคอลัมน์ที่ยังไม่มี ตำแหน่ง 7..10 คงที่
// (UI_Banners อ่าน/เขียนตามตำแหน่ง ห้ามแทรกกลาง)
function ensureBannerColumns_(sheet) {
  try {
    const lastCol = sheet.getLastColumn();
    if (lastCol >= 10) return;
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim());
    ["Title", "Button Text", "Start Date", "End Date"].forEach((name, k) => {
      const col = 7 + k;
      if (col > lastCol && headers.indexOf(name) === -1) sheet.getRange(1, col).setValue(name);
    });
  } catch(e) {}
}

// ===== ตั้งเวลาแสดงแบนเนอร์: Start Date / End Date เป็นข้อความ yyyy-MM-dd (เวลาไทย) — ว่าง = ไม่จำกัดฝั่งนั้น, End Date นับรวมทั้งวัน =====
var BANNER_DATE_RE_ = /^\d{4}-\d{2}-\d{2}$/;
// ค่าในเซลล์อาจเป็น Date (ชีตแปลงสตริงวันที่ให้เอง) หรือข้อความ — ทำให้เป็น yyyy-MM-dd เสมอ, ค่าที่อ่านไม่ได้ = '' (ไม่จำกัด)
function bannerDateStr_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, "GMT+7", "yyyy-MM-dd");
  const s = v.toString().trim();
  return BANNER_DATE_RE_.test(s) ? s : '';
}
function bannerDateValid_(s) {
  if (!BANNER_DATE_RE_.test(s)) return false;
  const p = s.split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2];
}
// 'live' = แสดงอยู่, 'upcoming' = ยังไม่ถึงวันเริ่ม, 'expired' = เลยวันสิ้นสุดแล้ว (เทียบสตริง ISO ตรงๆ ได้)
function bannerScheduleState_(start, end, now) {
  const today = Utilities.formatDate(now || new Date(), "GMT+7", "yyyy-MM-dd");
  if (start && today < start) return 'upcoming';
  if (end && today > end) return 'expired';
  return 'live';
}
// เขียนวันที่เป็น "ข้อความ" (format @) กัน Sheets แปลงเป็น Date เอง
function writeBannerDates_(sheet, row, start, end) {
  const r = sheet.getRange(row, 9, 1, 2);
  r.setNumberFormat('@');
  r.setValues([[start || '', end || '']]);
}

// ดึงสเปคเริ่มต้นอัตโนมัติตามชื่อรุ่น/หมวดหมู่ สำหรับเติมลงชีต Products กรณีแถวเดิมยังไม่มีข้อมูลสเปค
function inferDefaultProductSpecs_(rowObj) {
  const m = [rowObj['Marketing Model'], rowObj['Model'], rowObj['Product Name'], rowObj['Product Group']].filter(Boolean).join(' ');
  const ml = m.toLowerCase();
  const cat = (rowObj['Category'] || 'โมบาย').toString().trim();

  if (cat === 'ของแถมแบรนด์' || cat === 'ของแถมช่องทาง') {
    return {
      "Display": "", "Processor": "", "RAM": "", "Rear Camera": "", "Front Camera": "",
      "Battery": "", "OS": "", "Connectivity": "", "Warranty": ""
    };
  }

  let spec = {
    "Display": "6.7\" FHD+ AMOLED 120Hz",
    "Processor": "Octa-Core 5G Flagship Processor (4nm)",
    "RAM": "8GB / 12GB LPDDR5X",
    "Rear Camera": "50MP OIS Main + 12MP Ultra-Wide + Telephoto",
    "Front Camera": "12MP Auto-Focus",
    "Battery": "5,000 mAh (รองรับ Fast Charge)",
    "OS": "Android 14 / iOS",
    "Connectivity": "5G / Wi-Fi 6E / Bluetooth 5.3 / NFC",
    "Warranty": "ประกันศูนย์ไทย 1 ปี"
  };

  if (ml.indexOf('s25 ultra') !== -1 || ml.indexOf('s24 ultra') !== -1) {
    spec["Display"] = "6.8\" Dynamic AMOLED 2X 120Hz (QHD+ 2600 nits)";
    spec["Processor"] = ml.indexOf('s25') !== -1 ? "Snapdragon 8 Elite for Galaxy (3nm)" : "Snapdragon 8 Gen 3 for Galaxy (4nm)";
    spec["RAM"] = "12GB LPDDR5X";
    spec["Rear Camera"] = "200MP OIS + 50MP Periscope (5x) + 10MP (3x) + 12MP UW";
    spec["Front Camera"] = "12MP Dual Pixel AF (4K 60fps)";
    spec["Battery"] = "5,000 mAh (Super Fast Charging 2.0 45W / Wireless 15W)";
    spec["OS"] = "Android 14 (One UI 6.1 พร้อม Galaxy AI)";
    spec["Connectivity"] = "5G / Wi-Fi 7 / Bluetooth 5.3 / UWB / S-Pen ในตัว";
    spec["Warranty"] = "ศูนย์ไทย 1 ปี + Samsung Care+ (ตามเงื่อนไขโปรฯ)";
  } else if (ml.indexOf('s24+') !== -1 || ml.indexOf('s24 plus') !== -1) {
    spec["Display"] = "6.7\" Dynamic AMOLED 2X 120Hz (QHD+)";
    spec["Processor"] = "Exynos 2400 for Galaxy (4nm)";
    spec["RAM"] = "12GB LPDDR5X";
    spec["Rear Camera"] = "50MP OIS + 10MP Telephoto (3x) + 12MP Ultra-Wide";
    spec["Front Camera"] = "12MP Dual Pixel AF";
    spec["Battery"] = "4,900 mAh (Fast Charge 45W)";
    spec["OS"] = "Android 14 (One UI 6.1 พร้อม Galaxy AI)";
    spec["Connectivity"] = "5G / Wi-Fi 6E / Bluetooth 5.3 / NFC";
  } else if (ml.indexOf('s24') !== -1) {
    spec["Display"] = "6.2\" Dynamic AMOLED 2X 120Hz (FHD+)";
    spec["Processor"] = "Exynos 2400 for Galaxy (4nm)";
    spec["RAM"] = "8GB LPDDR5X";
    spec["Rear Camera"] = "50MP OIS + 10MP Telephoto (3x) + 12MP Ultra-Wide";
    spec["Front Camera"] = "12MP Dual Pixel AF";
    spec["Battery"] = "4,000 mAh (Fast Charge 25W)";
    spec["OS"] = "Android 14 (One UI 6.1 พร้อม Galaxy AI)";
    spec["Connectivity"] = "5G / Wi-Fi 6E / Bluetooth 5.3 / NFC";
  } else if (ml.indexOf('z fold') !== -1 || ml.indexOf('fold 6') !== -1 || ml.indexOf('fold6') !== -1) {
    spec["Display"] = "7.6\" QXGA+ Dynamic AMOLED 2X 120Hz + จอนอก 6.3\"";
    spec["Processor"] = "Snapdragon 8 Gen 3 for Galaxy (4nm)";
    spec["RAM"] = "12GB LPDDR5X";
    spec["Rear Camera"] = "50MP OIS + 10MP Telephoto (3x) + 12MP Ultra-Wide";
    spec["Front Camera"] = "10MP (Cover) + 4MP Under Display (Main)";
    spec["Battery"] = "4,400 mAh (Fast Charge 25W / Wireless 15W)";
    spec["OS"] = "Android 14 (One UI 6.1.1 พร้อม Galaxy AI)";
    spec["Connectivity"] = "5G / Wi-Fi 6E / Bluetooth 5.3 / รองรับ S-Pen Fold Edition";
  } else if (ml.indexOf('z flip') !== -1 || ml.indexOf('flip 6') !== -1 || ml.indexOf('flip6') !== -1) {
    spec["Display"] = "6.7\" FHD+ Dynamic AMOLED 2X 120Hz + จอนอก FlexWindow 3.4\"";
    spec["Processor"] = "Snapdragon 8 Gen 3 for Galaxy (4nm)";
    spec["RAM"] = "12GB LPDDR5X";
    spec["Rear Camera"] = "50MP Dual Pixel OIS + 12MP Ultra-Wide";
    spec["Front Camera"] = "10MP FlexCam Auto-Zoom";
    spec["Battery"] = "4,000 mAh (Fast Charge 25W / Wireless 15W)";
    spec["OS"] = "Android 14 (One UI 6.1.1 พร้อม Galaxy AI)";
    spec["Connectivity"] = "5G / Wi-Fi 6E / Bluetooth 5.3 / NFC";
  } else if (ml.indexOf('16 pro max') !== -1 || ml.indexOf('15 pro max') !== -1) {
    const is16 = ml.indexOf('16') !== -1;
    spec["Display"] = (is16 ? "6.9\"" : "6.7\"") + " Super Retina XDR OLED ProMotion 120Hz";
    spec["Processor"] = is16 ? "Apple A18 Pro (3nm รุ่นที่ 2)" : "Apple A17 Pro (3nm)";
    spec["RAM"] = "8GB Unified Memory (รองรับ Apple Intelligence)";
    spec["Rear Camera"] = is16 ? "48MP Fusion + 48MP Ultra-Wide + 12MP 5x Tetraprism" : "48MP Main OIS + 12MP Ultra-Wide + 12MP 5x Telephoto";
    spec["Front Camera"] = "12MP TrueDepth Camera (4K Dolby Vision)";
    spec["Battery"] = (is16 ? "4,685 mAh" : "4,422 mAh") + " (USB-C PD Fast Charge / MagSafe 25W)";
    spec["OS"] = is16 ? "iOS 18 (รองรับ Apple Intelligence)" : "iOS 17 (อัปเกรด iOS 18 ได้)";
    spec["Connectivity"] = "5G / Wi-Fi 7 / Bluetooth 5.3 / USB-C 3.2 (10Gbps)";
    spec["Warranty"] = "ศูนย์ไทย 1 ปี (Apple ประเทศไทย)";
  } else if (ml.indexOf('16 pro') !== -1 || ml.indexOf('15 pro') !== -1) {
    const is16p = ml.indexOf('16') !== -1;
    spec["Display"] = (is16p ? "6.3\"" : "6.1\"") + " Super Retina XDR OLED ProMotion 120Hz";
    spec["Processor"] = is16p ? "Apple A18 Pro (3nm)" : "Apple A17 Pro (3nm)";
    spec["RAM"] = "8GB Unified Memory";
    spec["Rear Camera"] = "48MP Main + Ultra-Wide + Telephoto Optical Zoom";
    spec["Front Camera"] = "12MP TrueDepth Camera";
    spec["Battery"] = "แบตเตอรี่ใช้งานตลอดวัน (รองรับ MagSafe / USB-C PD)";
    spec["OS"] = is16p ? "iOS 18" : "iOS 17 / iOS 18";
    spec["Connectivity"] = "5G / Wi-Fi 6E-7 / Bluetooth 5.3 / USB-C 3.2";
    spec["Warranty"] = "ศูนย์ไทย 1 ปี (Apple ประเทศไทย)";
  } else if (ml.indexOf('iphone 16') !== -1 || ml.indexOf('iphone 15') !== -1 || ml.indexOf('15 plus') !== -1 || ml.indexOf('16 plus') !== -1) {
    const isPlus = ml.indexOf('plus') !== -1;
    const is16b = ml.indexOf('16') !== -1;
    spec["Display"] = (isPlus ? "6.7\"" : "6.1\"") + " Super Retina XDR OLED (Dynamic Island)";
    spec["Processor"] = is16b ? "Apple A18 (3nm)" : "Apple A16 Bionic (4nm)";
    spec["RAM"] = is16b ? "8GB" : "6GB";
    spec["Rear Camera"] = "48MP Main (2x Optical-Quality Telephoto) + 12MP Ultra-Wide";
    spec["Front Camera"] = "12MP TrueDepth Camera";
    spec["Battery"] = (isPlus ? "4,383 mAh" : "3,349 mAh") + " (USB-C Fast Charge / MagSafe 15W)";
    spec["OS"] = is16b ? "iOS 18" : "iOS 17";
    spec["Connectivity"] = "5G / Wi-Fi 6E / Bluetooth 5.3 / USB-C";
    spec["Warranty"] = "ศูนย์ไทย 1 ปี (Apple ประเทศไทย)";
  } else if (cat === 'แท็บเล็ต' || ml.indexOf('ipad') !== -1 || ml.indexOf('tab') !== -1) {
    const isIpad = ml.indexOf('ipad') !== -1;
    spec["Display"] = isIpad ? "11\" / 13\" Liquid Retina XDR / Tandem OLED" : "11\" / 12.4\" Dynamic AMOLED 2X 120Hz (พร้อม S-Pen)";
    spec["Processor"] = isIpad ? "Apple M-Series / A-Series Chip" : "Snapdragon 8 Series for Galaxy";
    spec["RAM"] = "8GB / 12GB";
    spec["Rear Camera"] = "12MP Smart HDR + สแกนเอกสาร 4K";
    spec["Front Camera"] = "12MP Ultra-Wide Landscape (Center Stage)";
    spec["Battery"] = "8,000 - 10,090 mAh (ใช้งานต่อเนื่องสูงสุด 10-14 ชม.)";
    spec["OS"] = isIpad ? "iPadOS 17 / 18" : "Android 14 (One UI for Tab + DeX Mode)";
    spec["Connectivity"] = "Wi-Fi 6E / 5G (รุ่น Cellular) / Bluetooth 5.3 / USB-C";
  } else if (cat === 'สมาร์ทวอทช์' || ml.indexOf('watch') !== -1) {
    spec["Display"] = "1.5\" Super AMOLED / Retina LTPO OLED (Sapphire Crystal)";
    spec["Processor"] = "Dual-Core / Penta-Core Wearable Processor";
    spec["RAM"] = "2GB RAM + 32GB/64GB Storage";
    spec["Rear Camera"] = "เซนเซอร์ BioActive / วัดหัวใจ ECG / SpO2 / อุณหภูมิผิว";
    spec["Front Camera"] = "ติดตามการนอนหลับ + วิเคราะห์องค์ประกอบร่างกาย (BIA)";
    spec["Battery"] = "ใช้งานสูงสุด 36 - 72 ชม. (รองรับแท่นชาร์จไร้สายแม่เหล็ก)";
    spec["OS"] = ml.indexOf('apple') !== -1 ? "watchOS 11" : "Wear OS Powered by Samsung";
    spec["Connectivity"] = "Bluetooth 5.3 / Wi-Fi / GPS Dual-Frequency / NFC / กันน้ำ 5ATM+IP68";
  } else if (cat === 'หูฟัง' || ml.indexOf('buds') !== -1 || ml.indexOf('airpods') !== -1) {
    spec["Display"] = "เคสชาร์จไร้สาย พร้อมไฟสถานะ LED แจ้งแบตเตอรี่";
    spec["Processor"] = ml.indexOf('airpods') !== -1 ? "Apple H2 Headphone Chip" : "ชิปประมวลผลเสียง Hi-Fi 24-bit + AI ANC";
    spec["RAM"] = "ระบบตัดเสียงรบกวน Active Noise Cancelling (ANC) อัจฉริยะ";
    spec["Rear Camera"] = "ไดรเวอร์เสียง 2-Way Dynamic + Planar Tweeter";
    spec["Front Camera"] = "ไมโครโฟน 6 ตัว พร้อม AI Voice Pickup ตัดเสียงลมขณะคุยสาย";
    spec["Battery"] = "ฟังต่อเนื่อง 6-8 ชม. (รวมเคสชาร์จสูงสุด 30 ชม.)";
    spec["OS"] = "รองรับทั้ง iOS / Android / Windows / macOS";
    spec["Connectivity"] = "Bluetooth 5.3 / Auto-Switch / Spatial Audio 360° / กันน้ำ IP57";
  }

  return spec;
}

// Retrofit คอลัมน์สเปค 9 คอลัมน์ลงชีต Products อัตโนมัติ + เติมข้อมูลสเปคเริ่มต้นลงแถวเดิมที่ยังว่างอยู่
function ensureProductSpecColumns_(ss) {
  try {
    const sheet = ss.getSheetByName("Products");
    if (!sheet) return;
    let lastCol = sheet.getLastColumn();
    if (lastCol < 1) return;
    let headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim());
    const missingCols = PRODUCT_SPEC_COLS_.filter(col => headers.indexOf(col) === -1);
    let schemaChanged = false;

    if (missingCols.length > 0) {
      const startCol = lastCol + 1;
      sheet.getRange(1, startCol, 1, missingCols.length)
        .setValues([missingCols])
        .setFontWeight("bold")
        .setBackground("#4F46E5")
        .setFontColor("#FFFFFF");
      headers = headers.concat(missingCols);
      lastCol = headers.length;
      schemaChanged = true;
    }

    // ตรวจสอบแถวสินค้าที่มีอยู่ ถ้าคอลัมน์สเปคทั้ง 9 ช่องยังว่างเปล่าทั้งหมด (และไม่ใช่ของแถม) ให้เติมสเปคเริ่มต้นลงชีตทันที
    const lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      const allData = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
      const specColIndices = PRODUCT_SPEC_COLS_.map(col => headers.indexOf(col));
      const catIdx = headers.indexOf("Category");
      let rowsUpdated = false;

      for (let r = 0; r < allData.length; r++) {
        const row = allData[r];
        const cat = catIdx !== -1 ? (row[catIdx] || '').toString().trim() : '';
        if (cat === 'ของแถมแบรนด์' || cat === 'ของแถมช่องทาง') continue;

        const hasAnySpec = specColIndices.some(idx => idx !== -1 && row[idx] !== undefined && row[idx].toString().trim() !== '');
        if (!hasAnySpec) {
          const rowObj = {};
          headers.forEach((h, i) => { rowObj[h] = row[i]; });
          const defaultSpecs = inferDefaultProductSpecs_(rowObj);
          specColIndices.forEach((colIdx, sIdx) => {
            if (colIdx !== -1) {
              const colName = PRODUCT_SPEC_COLS_[sIdx];
              row[colIdx] = defaultSpecs[colName] || '';
            }
          });
          rowsUpdated = true;
        }
      }

      if (rowsUpdated) {
        sheet.getRange(2, 1, allData.length, lastCol).setValues(allData);
      }
      if (schemaChanged || rowsUpdated) {
        CacheService.getScriptCache().remove("TABLE_Products");
      }
    }
  } catch (e) {}
}

// ===== ยอดนิยม (ชั้น "ยอดนิยมตอนนี้" บนหน้าร้าน): รุ่น (Model) ที่ถูกจองมากสุด =====
// ส่งให้ทุก role เห็นเฉพาะ "ชื่อรุ่นเรียงตามอันดับ" — ไม่มีตัวเลขยอด/สาขา/ข้อมูลลูกค้าเลย (ผลรวมทุกสาขา แต่ไม่รั่วรายละเอียดข้ามสาขา)
// ช่วงเวลาไล่ขยาย 7 → 30 → 365 วัน จนมีอย่างน้อย POPULAR_MIN_MODELS_ รุ่น (ช่วงแคมเปญเงียบๆ ยังมีอันดับให้โชว์); cache 30 นาทีกันอ่านชีต Orders ทุกครั้งที่โหลดหน้า
var POPULAR_CACHE_KEY_ = 'POPULAR_MODELS_V1';
var POPULAR_TOP_N_ = 8;
var POPULAR_MIN_MODELS_ = 4;
var POPULAR_WINDOWS_DAYS_ = [7, 30, 365];
function getPopularModels_(ss, now) {
  const cache = CacheService.getScriptCache();
  try { const hit = cache.get(POPULAR_CACHE_KEY_); if (hit) return JSON.parse(hit); } catch (e) {}
  let result = [];
  try {
    const sheet = ss.getSheetByName("Orders");
    if (sheet && sheet.getLastRow() >= 2) {
      const lastCol = sheet.getLastColumn();
      const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim());
      const skuI = headers.indexOf("SKU"), qtyI = headers.indexOf("Qty"), tsI = headers.indexOf("Timestamp"), stI = headers.indexOf("Order Status");
      if (skuI > -1 && tsI > -1) {
        // SKU -> Model เฉพาะสินค้าขายปกติที่เปิดอยู่ (ของแถม/ส่วนลด/รุ่นที่ไม่มี Model ไม่นับ — หน้าร้านไม่แสดงเป็นการ์ดอยู่แล้ว)
        const modelOfSku = {};
        getTableDataAsJson(ss.getSheetByName("Products")).forEach(p => {
          const model = (p.Model || '').toString().trim();
          if (!model || model === '-') return;
          if ((p.Category || '').toString().includes('ของแถม')) return;
          if ((p.Status || '').toString().trim() !== 'เปิด') return;
          modelOfSku[(p.SKU || '').toString().trim()] = model;
        });
        const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, lastCol).getValues();
        const nowMs = (now || new Date()).getTime();
        const events = [];
        rows.forEach(r => {
          const sku = (r[skuI] || '').toString().trim();
          const model = modelOfSku[sku];
          if (!model) return;
          if (stI > -1 && (r[stI] || '').toString().trim() === 'Cancelled') return;
          const t = new Date(r[tsI]).getTime();
          if (isNaN(t)) return;
          const q = qtyI > -1 ? (parseInt(r[qtyI], 10) || 1) : 1;
          events.push({ model: model, t: t, q: q > 0 ? q : 1 });
        });
        for (let w = 0; w < POPULAR_WINDOWS_DAYS_.length; w++) {
          const since = nowMs - POPULAR_WINDOWS_DAYS_[w] * 86400000;
          const tally = {};
          events.forEach(e => { if (e.t >= since && e.t <= nowMs + 86400000) tally[e.model] = (tally[e.model] || 0) + e.q; });
          const ranked = Object.keys(tally).sort((a, b) => (tally[b] - tally[a]) || (a < b ? -1 : a > b ? 1 : 0));
          if (ranked.length >= POPULAR_MIN_MODELS_ || w === POPULAR_WINDOWS_DAYS_.length - 1) { result = ranked.slice(0, POPULAR_TOP_N_); break; }
        }
      }
    }
  } catch (e) { result = []; }
  try { cache.put(POPULAR_CACHE_KEY_, JSON.stringify(result), 1800); } catch (e) {}
  return result;
}

function getAllInitialData(ss, isAdmin) {
  initAutoPromotionsSheet(ss);
  ensureProductSpecColumns_(ss);
  CacheService.getScriptCache().remove("TABLE_AutoPromotions");
  CacheService.getScriptCache().remove("TABLE_Branches");

  let heroBanners = [];
  let gridBanners = [];
  let popupBanners = []; 
  
  try {
    const bannersSheet = ss.getSheetByName("UI_Banners");
    if(bannersSheet) {
      ensureBannerColumns_(bannersSheet);
      const data = bannersSheet.getDataRange().getValues();
      for(let i=1; i<data.length; i++) {
        const type = data[i][1];
        const url = data[i][2];
        const status = data[i][3];
        const targetLink = data[i][4] ? data[i][4].toString().trim() : "";
        const details = data[i][5] ? data[i][5].toString().trim() : "";
        const title = data[i][6] ? data[i][6].toString().trim() : "";
        const buttonText = data[i][7] ? data[i][7].toString().trim() : "";
        // หน้าร้านเห็นเฉพาะแบนเนอร์ที่อยู่ในช่วงเวลา (ว่าง = แสดงตลอด) — หน้าตั้งค่า (getSettingsList) เห็นครบพร้อมสถานะ
        const live = bannerScheduleState_(bannerDateStr_(data[i][8]), bannerDateStr_(data[i][9])) === 'live';
        if (live && status !== 'Deleted' && url && url.toString().trim() !== "") {
          if (type === 'herobanner') heroBanners.push({url: url.toString().trim(), link: targetLink, details: details, title: title});
          else if (type === 'promogrid') gridBanners.push({url: url.toString().trim(), link: targetLink, details: details});
          else if (type === 'popupbanner') popupBanners.push({url: url.toString().trim(), link: targetLink, details: details, title: title, buttonText: buttonText});
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
    products: getTableDataAsJson(ss.getSheetByName("Products"), isAdmin),
    promotions: getTableDataAsJson(ss.getSheetByName("Promotions"), isAdmin),
    branches: getTableDataAsJson(ss.getSheetByName("Branches"), isAdmin),
    channels: getTableDataAsJson(ss.getSheetByName("Channels"), isAdmin),
    interests: getTableDataAsJson(ss.getSheetByName("Interests"), isAdmin),
    giftMappings: getTableDataAsJson(ss.getSheetByName("GiftMappings"), isAdmin),
    autoPromotions: getTableDataAsJson(ss.getSheetByName("AutoPromotions"), isAdmin),
    members: getTableDataAsJson(ss.getSheetByName("Members")).map(m => { const clean = Object.assign({}, m); delete clean.Password; return clean; }),
    // ใช้วาด order status timeline (5A.3) — ชีตอาจไม่มีในระบบเก่า จึงต้องกัน null
    orderStatuses: ss.getSheetByName("OrderStatus") ? getTableDataAsJson(ss.getSheetByName("OrderStatus")) : [],
    heroBanners: heroBanners,
    gridBanners: gridBanners,
    popupBanners: popupBanners,
    popularModels: getPopularModels_(ss),
    news: getLiveNews_(ss),
    // เฉพาะคีย์ที่ไม่ใช่ความลับ (Webhook URL / Drive Folder ID ไม่ส่งให้หน้าเว็บของ role ใดเลย — Admin อ่านผ่าน GET_SETTINGS_LIST)
    settings: publicSettings_(getKeyValueSettings(ss))
  };
}

// ---- แคช Dashboard (ชุดข้อมูลดิบก่อนกรองตามสิทธิ์) ----
// Dashboard เดิมอ่านทั้งชีต Orders + Products + Members จากชีตใหม่ทุกครั้ง และหน้าเว็บยิงซ้ำทุก 30 วินาที → ช้า/timeout
// แคชเฉพาะ "ข้อมูลดิบ" (Orders ยังเป็นค่าตามชีต ไม่ถอดรหัส PII, Members ตัด Password แล้ว) แล้วกรองสาขาของ Sales / ถอดรหัสทีหลังตอนส่งออก
// ค่าที่ใหญ่เกิน 100KB/คีย์ของ CacheService จึงแบ่งเป็นก้อนละไม่เกิน 30,000 ตัวอักษร (ไทย 3 ไบต์/ตัว → ≤ 90KB)
var DASH_CACHE_KEY_ = 'DASH_BASE';
var DASH_CACHE_TTL_ = 120; // วินาที — เขียนผ่านแอปจะล้างทันที; แก้ชีตตรงๆ เห็นภายใน 2 นาที หรือกดปุ่มรีเฟรช (refresh:true)
var DASH_CHUNK_ = 30000;

function dashCachePut_(str) {
  const cache = CacheService.getScriptCache();
  const n = Math.ceil(str.length / DASH_CHUNK_);
  for (let i = 0; i < n; i++) cache.put(DASH_CACHE_KEY_ + '_' + i, str.substr(i * DASH_CHUNK_, DASH_CHUNK_), DASH_CACHE_TTL_);
  cache.put(DASH_CACHE_KEY_ + '_meta', JSON.stringify({ n: n, len: str.length }), DASH_CACHE_TTL_); // meta เขียนทีหลังสุด: ผู้อ่านเห็นก็ต่อเมื่อก้อนครบ
}

function dashCacheGet_() {
  const cache = CacheService.getScriptCache();
  const metaRaw = cache.get(DASH_CACHE_KEY_ + '_meta');
  if (!metaRaw) return null;
  try {
    const meta = JSON.parse(metaRaw);
    let out = '';
    for (let i = 0; i < meta.n; i++) {
      const part = cache.get(DASH_CACHE_KEY_ + '_' + i);
      if (part === null || part === undefined) return null; // ก้อนหาย (หมดอายุ/ถูกไล่ออก) = ถือว่าไม่มีแคช
      out += part;
    }
    if (out.length !== meta.len) return null;
    return JSON.parse(out);
  } catch (e) { return null; }
}

function invalidateDashboardCache_() {
  try { CacheService.getScriptCache().remove(DASH_CACHE_KEY_ + '_meta'); } catch (e) {}
}

function getAdvancedDashboard(secureUser, ss, payload) {
  const isAdmin = secureUser.Role === 'Admin';
  const forceRefresh = !!(payload && payload.refresh === true);
  let base = forceRefresh ? null : dashCacheGet_();
  if (!base) {
    base = {
      orders: getTableDataAsJson(ss.getSheetByName("Orders")),
      // Admin เห็นข้อมูลสินค้าสดเสมอ (ข้ามแคชตาราง) ตอนสร้างชุดข้อมูลใหม่
      products: getTableDataAsJson(ss.getSheetByName("Products"), isAdmin || forceRefresh),
      // Dashboard เปิดได้ทุก role — ห้ามส่ง Password hash ออกไปหน้าบ้านเด็ดขาด (ตัดก่อนลงแคชด้วย)
      members: getTableDataAsJson(ss.getSheetByName("Members")).map(m => { const clean = Object.assign({}, m); delete clean.Password; return clean; }),
      builtAt: new Date().getTime()
    };
    try { dashCachePut_(JSON.stringify(base)); } catch (e) {}
  }

  // Deobfuscate PII for display (ทำกับสำเนา ไม่แก้ base ที่แคชไว้)
  let orders = base.orders.map(o => {
    const c = Object.assign({}, o);
    if (c['Contact Number']) c['Contact Number'] = deobfuscate(c['Contact Number']);
    if (c['ID Card_Passport']) c['ID Card_Passport'] = deobfuscate(c['ID Card_Passport']);
    return c;
  });

  if (secureUser.Role === 'Sales') {
    orders = orders.filter(o => o['Branch Code'] === secureUser['Branch Code']);
  }
  return { status: 'success', data: { orders: orders, products: base.products, members: base.members, builtAt: base.builtAt } };
}


// ตรวจ/ทำให้เป็นรูปมาตรฐาน "เลขบัตรประชาชน / Passport" (ฝั่ง server เป็นตัวบังคับจริง — client ตรวจซ้ำเพื่อแจ้งเร็ว)
//  - ตัวเลขล้วน 13 หลัก = บัตรประชาชนไทย ต้องผ่าน checksum (mod 11)
//  - ตัวเลขล้วน 6-9 หลัก หรือ ตัวอักษร+ตัวเลข 6-9 ตัว (A-Z, 0-9) = Passport (เก็บเป็นตัวพิมพ์ใหญ่)
//  - อย่างอื่นไม่ผ่าน (เช่น 0000, 10-12 หลัก) — คืนสตริงที่ normalize แล้ว หรือ throw ข้อความภาษาไทย
function normalizeIdCard_(raw) {
  const v = (raw === null || raw === undefined ? '' : raw).toString().replace(/[\s-]/g, '').toUpperCase();
  if (!v) throw new Error("กรุณากรอกเลขบัตรประชาชน / Passport");
  if (/^\d+$/.test(v)) {
    if (v.length === 13) {
      let sum = 0;
      for (let i = 0; i < 12; i++) sum += parseInt(v.charAt(i), 10) * (13 - i);
      if ((11 - (sum % 11)) % 10 !== parseInt(v.charAt(12), 10)) throw new Error("เลขบัตรประชาชนไม่ถูกต้อง (ตรวจเลขหลักสุดท้ายไม่ผ่าน)");
      return v;
    }
    if (v.length >= 6 && v.length <= 9) return v; // Passport ตัวเลขล้วน
    throw new Error("เลขบัตรประชาชนต้องมี 13 หลัก หรือ Passport 6-9 ตัวอักษร");
  }
  if (/^[A-Z0-9]{6,9}$/.test(v)) return v; // Passport มีตัวอักษร
  throw new Error("เลข Passport ต้องเป็นตัวอักษรอังกฤษ/ตัวเลข 6-9 ตัว");
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
    // whitelist ค่าเดียวกับที่ updateFullOrder เช็ค (rule 25 style) — เดิม processCheckout เช็คแค่ .indexOf('จอง T') แล้วปล่อยสตริงอื่นใดผ่าน sanitizeSheetText_ เขียนตรงๆ
    // ทำให้รายงาน/พีวอตที่ key ด้วยสองสตริงนี้แน่นอน (bookingSummary, salesSummary, ฯลฯ) จัดกลุ่มแถวที่มีค่าอื่นไม่ได้เลย
    const validResStatuses = ['', 'จอง T (มีการจอง)', 'จอง F (สวมสิทธิ์การจอง)'];
    if (payload.resStatus && !validResStatuses.includes(payload.resStatus.toString().trim())) {
      throw new Error("ประเภทการจองไม่ถูกต้อง: " + payload.resStatus);
    }
    if (payload.resStatus && payload.resStatus.toString().indexOf('จอง T') > -1) {
      if (!payload.receiptNo || payload.receiptNo.toString().trim() === '') throw new Error("จอง T ต้องระบุเลขที่ใบเสร็จรับเงินมัดจำ");
      if (!(parseFloat(payload.depositAmount) > 0)) throw new Error("จอง T ต้องระบุจำนวนเงินมัดจำมากกว่า 0");
    }

    payload.idCard = normalizeIdCard_(payload.idCard); // บังคับรูปแบบเลขบัตร/Passport ก่อนแตะสต็อก
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
    
    // ตรวจสอบว่าชีต Orders มีคอลัมน์ Receipt No / Deposit / Pre Order No / Pickup Date แล้วหรือยัง — ถ้ายังให้เพิ่มต่อท้ายอัตโนมัติ
    let orderHeaders = orderSheet.getRange(1, 1, 1, orderSheet.getLastColumn()).getValues()[0].map(h => h.toString().trim());
    ["Receipt No", "Deposit", "Client Request ID", "Pre Order No", "Pickup Date"].forEach(col => {
      if (orderHeaders.indexOf(col) === -1) {
        orderSheet.getRange(1, orderHeaders.length + 1).setValue(col);
        orderHeaders.push(col);
      }
    });
    // orderRows.push() ด้านล่างเขียนเป็น array ตำแหน่งตรงตัว 26 ช่อง (ไม่ได้ map ด้วยชื่อ header) — ถ้าคอลัมน์ในชีตจริงสลับตำแหน่งไปจาก
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
      const qty = Number(item.qty);
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
      let fPreOrderNo = isFirstRow ? sanitizeSheetText_(payload.preOrderNo || "") : "";
      let fPickupDate = isFirstRow ? sanitizeSheetText_(payload.pickupDate || "") : "";

      orderRows.push([
        orderId, now, actualChannel, actualBranch, fCustName, fContact,
        fEmail, fIdCard, fCodeHand,
        item.SKU, itemName, qty, itemPrice,
        fPromo, fResStatus, fBkStaff, fBkPhone,
        fInterests, fRemark, rowTotal, "Pending", fReceiptNo, fDeposit, fReqId, fPreOrderNo, fPickupDate
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
          const gQty = Number(giftObj.qty);
          if (!Number.isInteger(gQty) || gQty < 1) throw new Error("จำนวนของแถมไม่ถูกต้อง: " + giftName);
          let giftSku = "GIFT";
          let giftHasStock = false;
          let giftFound = false;
          for(let i=1; i<prodData.length; i++) {
            if(prodData[i][nameIdx] == giftName) {
              // giftAllowed ด้านบนเช็คแค่ว่าชื่อ "มี" keyword จาก GiftMappings เป็น substring — ไม่ได้จำกัดว่าต้องเป็นสินค้าหมวดของแถมจริง
              // ถ้าไม่เช็ค Category ตรงนี้ด้วย payload ที่ปลอม giftObj.name เป็นชื่อสินค้าราคาเต็มที่บังเอิญมี keyword ปนอยู่ (เช่น "เคส")
              // จะได้สินค้านั้นไปฟรีพร้อมตัดสต๊อกจริง — ต้องเป็นสินค้าหมวด "ของแถม..." เท่านั้นถึงจะนับเป็นของแถมได้
              const giftRowCat = catIdx > -1 ? (prodData[i][catIdx] || '').toString().trim() : '';
              if (giftRowCat.indexOf('ของแถม') === -1) continue;
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
            "", (giftHasStock ? "" : "รอสต๊อกของแถม"), 0, "Pending", "", "", "", "", ""
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
        autoRules = [{ 'Buy Category': 'โมบาย', 'Get Discount Category': 'อุปกรณ์เสริม', 'Discount Percent': 10, 'Status': 'เปิด' }];
      }
      // เพดานส่วนลด Auto Bundle คำนวณครั้งเดียวรวมทั้งออเดอร์ (ไม่ใช่ต่อแถว) — client ปกติส่งแถว 'Auto Bundle' แถวเดียวต่อออเดอร์
      // (ดู JS.html pos.confirmCheckout) แต่ payload เป็น input จาก client ดิบๆ ห้ามเชื่อจำนวนแถว ต้องกันแยกกันส่งหลายแถวแล้วได้ส่วนลดคูณ
      let maxAutoTotal = 0;
      autoRules.forEach(r => {
        if (!statusOn_(r.Status)) return;
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
      // โค้ดคูปอง (ชื่อส่วนลดขึ้นต้นด้วย COUPON:) — ตรวจกับชีต Coupons ฝั่ง server ทุกครั้ง และนับการใช้งานหลังบันทึกออเดอร์สำเร็จ
      const couponRows = getTableDataAsJson(ss.getSheetByName("Coupons"), true);
      var couponCodesUsed = [];
      discountsList.forEach(d => {
        let val = parseFloat(d.value || 0);
        if (!(val > 0)) return;
        const dName = (d.name || '').toString().trim();
        if (dName.indexOf('Auto Bundle') > -1) {
          autoBundleUsed += val;
          if (autoBundleUsed > maxAutoTotal + 0.01) throw new Error("ส่วนลด Auto Bundle ไม่ตรงกับเงื่อนไขโปรโมชั่นของระบบ");
        } else if (dName.indexOf('COUPON:') === 0) {
          const cCode = dName.substring(7).trim();
          if (couponCodesUsed.indexOf(cCode.toUpperCase()) > -1) throw new Error("ใช้โค้ดคูปองซ้ำในออเดอร์เดียวกันไม่ได้: " + cCode);
          const goodsTotalC = Object.keys(catTotals).reduce((s, k) => s + catTotals[k], 0);
          const ev = evaluateCoupon_(couponRows, cCode, goodsTotalC);
          if (!ev.ok) throw new Error(ev.message);
          if (val > ev.discount + 0.01) throw new Error("มูลค่าส่วนลดเกินที่คูปองกำหนด: " + cCode);
          couponCodesUsed.push(cCode.toUpperCase());
        } else {
          const promo = promoList.find(p => (p['Promo Name'] || '').toString().trim() === dName && ['เปิด', 'open', 'active', 'on', 'true'].includes((p.Status || '').toString().trim().toLowerCase()));
          if (!promo) throw new Error("ไม่พบโปรโมชั่นส่วนลด หรือโปรโมชั่นถูกปิดใช้งาน: " + dName);
          // รองรับค่าที่มีสัญลักษณ์ เช่น "฿500", "10%", "1,000 บาท" ให้ตรงกับที่หน้า POS อ่านได้
          const promoVal = parseFloat((promo.Value || 0).toString().replace(/[^\d.\-]/g, '')) || 0;
          // โปร Percent: เพดานส่วนลด = pct% ของยอดสินค้ารวมในออเดอร์ (ราคาจากชีต) — Fixed: เพดาน = Value ตรงๆ
          const promoType = /percent|%/i.test((promo['Discount Type'] || '').toString()) ? 'Percent' : 'Fixed';
          const goodsTotal = Object.keys(catTotals).reduce((s, k) => s + catTotals[k], 0);
          const maxVal = promoType === 'Percent' ? (goodsTotal * promoVal) / 100 : promoVal;
          promoUsed[dName] = (promoUsed[dName] || 0) + val;
          if (promoUsed[dName] > maxVal + 0.01) throw new Error("มูลค่าส่วนลดเกินที่โปรโมชั่นกำหนด: " + dName);
        }
        orderRows.push([
          orderId, now, actualChannel, actualBranch, "", "",
          "", "", "",
          "DISCOUNT", sanitizeSheetText_(dName), 1, -val,
          "", "", "", "",
          "", "", -val, "Pending", "", "", "", "", ""
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
    if (orderRows.length > 0) logOrderStatus_(ss, orderId, '', 'Pending', secureUser.Username);
    try { bumpCouponUsage_(ss, couponCodesUsed || []); } catch (cuErr) {}
    try {
      sendCheckoutWebhookNotification_(ss, orderId, actualChannel, actualBranch, payload, orderRows, prodData, skuIdx, nameIdx, stockIdx);
    } catch (whErr) {}
    return { status: 'success', orderId: orderId };
  } catch(e) {
    return { status: 'error', message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// 5. ระบบส่งแจ้งเตือนออเดอร์ใหม่ + แจ้งเตือนสต๊อกใกล้หมด (Low Stock Alert) ผ่าน Webhook / LINE Messaging / Discord / Google Chat
function sendCheckoutWebhookNotification_(ss, orderId, channel, branch, payload, orderRows, prodData, skuIdx, nameIdx, stockIdx) {
  const settings = getKeyValueSettings(ss);
  const webhookUrl = (settings.WebhookUrl || settings.LineWebhookUrl || '').toString().trim();
  if (!webhookUrl || !/^https:\/\//i.test(webhookUrl)) return;

  const lowThreshold = parseInt(settings.LowStockThreshold || '5', 10) || 5;
  const custName = (payload.customer && payload.customer.name) ? payload.customer.name : '-';
  let netTotal = 0;
  const mainItems = [];
  const lowStockItems = [];

  orderRows.forEach(r => {
    const net = parseFloat(r[19]) || 0;
    netTotal += net;
    const sku = (r[9] || '').toString();
    const pName = (r[10] || '').toString();
    const qty = parseInt(r[11] || 0, 10);
    if (sku && sku !== 'DISCOUNT' && net > 0) {
      mainItems.push(pName + ' x' + qty);
      for (let i = 1; i < prodData.length; i++) {
        if (prodData[i][skuIdx] == sku) {
          const rem = parseInt(prodData[i][stockIdx] || 0, 10);
          if (rem <= lowThreshold) {
            lowStockItems.push(prodData[i][nameIdx] + ' (เหลือ ' + rem + ' ชิ้น)');
          }
          break;
        }
      }
    }
  });

  const msgText = "⚡ [Pre Booking ORDER] ใบจองใหม่: " + orderId +
    "\nสาขา: " + branch + " (" + channel + ")" +
    "\nลูกค้า: " + custName +
    "\nรายการ: " + (mainItems.join(', ') || '-') +
    "\nยอดสุทธิ: ฿" + netTotal.toLocaleString() +
    (lowStockItems.length > 0 ? "\n⚠️ แจ้งเตือนสต๊อกใกล้หมด: " + lowStockItems.join(', ') : "");

  UrlFetchApp.fetch(webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      text: msgText,
      content: msgText,
      orderId: orderId,
      branch: branch,
      channel: channel,
      netTotal: netTotal,
      lowStockAlerts: lowStockItems
    }),
    muteHttpExceptions: true
  });
}

// 4. ระบบค้นหาและติดตามสถานะใบจอง (Order Tracking & Digital Booking Pass)
function trackOrderLookup(payload, secureUser, ss) {
  const qRaw = ((payload && payload.query) ? payload.query : '').toString().trim();
  if (!qRaw || qRaw.length < 3) throw new Error("กรุณากรอกเลขที่ใบจอง (เช่น ORD-...) หรือเบอร์โทรศัพท์อย่างน้อย 4 หลัก");
  const sheet = ss.getSheetByName("Orders");
  if (!sheet) return { status: 'success', orders: [] };
  const data = sheet.getDataRange().getDisplayValues();
  if (data.length <= 1) return { status: 'success', orders: [] };

  const headers = data[0].map(h => h.toString().trim());
  const idx = (name) => headers.indexOf(name);
  const oIdIdx = idx("OrderID"), tsIdx = idx("Timestamp"), chIdx = idx("Channel"), brIdx = idx("Branch Code");
  const cNameIdx = idx("Customer Name"), phoneIdx = idx("Contact Number"), skuIdx = idx("SKU");
  const prodIdx = idx("Product Name"), qtyIdx = idx("Qty"), priceIdx = idx("Unit Price");
  const netIdx = idx("Row Total"), stIdx = idx("Order Status"), remIdx = idx("Remark");
  const depIdx = idx("Deposit");

  const qLower = qRaw.toLowerCase();
  const qDigits = qRaw.replace(/\D/g, '');
  const matchedOrderIds = {};

  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    const oid = (row[oIdIdx] || '').toString().trim();
    if (!oid) continue;
    if (secureUser.Role === 'Sales' && brIdx > -1 && row[brIdx] !== secureUser['Branch Code']) continue;

    const rawPhone = phoneIdx > -1 ? deobfuscate((row[phoneIdx] || '').toString().trim()) : '';
    const phoneDigits = rawPhone.replace(/\D/g, '');
    const cName = cNameIdx > -1 ? (row[cNameIdx] || '').toString().trim().toLowerCase() : '';

    const matchOid = oid.toLowerCase().indexOf(qLower) !== -1;
    const matchPhone = qDigits.length >= 4 && phoneDigits.indexOf(qDigits) !== -1;
    const matchName = qLower.length >= 3 && cName.indexOf(qLower) !== -1;

    if (matchOid || matchPhone || matchName) {
      matchedOrderIds[oid] = true;
      if (Object.keys(matchedOrderIds).length >= 10) break;
    }
  }

  const orderMap = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const oid = (row[oIdIdx] || '').toString().trim();
    if (!matchedOrderIds[oid]) continue;
    if (!orderMap[oid]) {
      const rawPhone = phoneIdx > -1 ? deobfuscate((row[phoneIdx] || '').toString().trim()) : '';
      const maskedPhone = rawPhone.length >= 7 ? (rawPhone.slice(0, 3) + '-XXX-' + rawPhone.slice(-4)) : rawPhone;
      orderMap[oid] = {
        orderId: oid,
        timestamp: tsIdx > -1 ? row[tsIdx] : '',
        channel: chIdx > -1 ? row[chIdx] : '',
        branch: brIdx > -1 ? row[brIdx] : '',
        customerName: cNameIdx > -1 ? row[cNameIdx] : '',
        maskedPhone: maskedPhone,
        status: stIdx > -1 ? (row[stIdx] || 'Pending') : 'Pending',
        deposit: depIdx > -1 ? (parseFloat(String(row[depIdx] || '0').replace(/,/g, '')) || 0) : 0,
        remark: remIdx > -1 ? row[remIdx] : '',
        netTotal: 0,
        items: [],
        gifts: [],
        discounts: []
      };
    }
    const o = orderMap[oid];
    if (!o.customerName && cNameIdx > -1 && row[cNameIdx]) o.customerName = row[cNameIdx];
    if (stIdx > -1 && row[stIdx]) o.status = row[stIdx];
    const sku = skuIdx > -1 ? (row[skuIdx] || '').toString().trim() : '';
    const pName = prodIdx > -1 ? (row[prodIdx] || '').toString().trim() : '';
    const qty = qtyIdx > -1 ? (parseInt(row[qtyIdx] || '1', 10) || 1) : 1;
    const unitPrice = priceIdx > -1 ? (parseFloat(String(row[priceIdx] || '0').replace(/,/g, '')) || 0) : 0;
    const netPrice = netIdx > -1 ? (parseFloat(String(row[netIdx] || '0').replace(/,/g, '')) || 0) : 0;
    o.netTotal += netPrice;
    if (sku === 'DISCOUNT' || netPrice < 0) {
      o.discounts.push({ name: pName, amount: Math.abs(netPrice) });
    } else if (unitPrice === 0 && netPrice === 0) {
      o.gifts.push({ sku: sku, name: pName, qty: qty });
    } else {
      o.items.push({ sku: sku, name: pName, qty: qty, price: unitPrice, net: netPrice });
    }
  }

  Object.keys(orderMap).forEach(k => { orderMap[k].history = getOrderStatusHistory_(ss, k, true); });
  return { status: 'success', orders: Object.values(orderMap).reverse() };
}

// 4.1 ระบบติดตามสถานะคำสั่งจอง & บัตรรับเครื่องดิจิทัลสำหรับลูกค้า (Public Booking Tracking & Digital Pass)
// ปลอดภัยตามมาตรฐาน PDPA: ค้นหาด้วย Order ID + ตรวจสอบเบอร์โทร 4 ตัวท้าย (หรือเบอร์เต็ม) และ Mask ข้อมูลส่วนตัว
function publicTrackOrderLookup(payload, ss) {
  const orderId = ((payload && payload.orderId) ? payload.orderId : '').toString().trim();
  const phone = ((payload && payload.phone) ? payload.phone : '').toString().trim();
  if (!orderId) throw new Error("กรุณาระบุเลขที่ใบจอง (Order ID)");

  const sheet = ss.getSheetByName("Orders");
  if (!sheet) return { status: 'error', message: "ไม่พบข้อมูลใบจองในระบบ" };
  const data = sheet.getDataRange().getDisplayValues();
  if (data.length <= 1) return { status: 'error', message: "ยังไม่มีข้อมูลใบจองในระบบ" };

  const headers = data[0].map(h => h.toString().trim());
  const idx = (name) => headers.indexOf(name);
  const oIdIdx = idx("OrderID"), tsIdx = idx("Timestamp"), chIdx = idx("Channel"), brIdx = idx("Branch Code");
  const cNameIdx = idx("Customer Name"), phoneIdx = idx("Contact Number"), skuIdx = idx("SKU");
  const prodIdx = idx("Product Name"), qtyIdx = idx("Qty"), priceIdx = idx("Unit Price");
  const netIdx = idx("Row Total"), stIdx = idx("Order Status"), remIdx = idx("Remark");
  const depIdx = idx("Deposit"), pickDateIdx = idx("Pickup Date");

  const qOrderUpper = orderId.toUpperCase();
  const phoneDigits = phone.replace(/\D/g, '');

  let matched = false;
  let orderData = null;
  let storedPhoneDigits = '';

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const oid = (row[oIdIdx] || '').toString().trim();
    if (oid.toUpperCase() !== qOrderUpper) continue;

    const rawPhone = phoneIdx > -1 ? deobfuscate((row[phoneIdx] || '').toString().trim()) : '';
    storedPhoneDigits = rawPhone.replace(/\D/g, '');

    // หากมีการระบุเบอร์โทรมาด้วย ต้องตรงกันอย่างน้อย 4 ตัวท้าย
    if (phoneDigits) {
      const matchPhone = storedPhoneDigits.endsWith(phoneDigits) || storedPhoneDigits === phoneDigits;
      if (!matchPhone) {
        return { status: 'error', message: "เบอร์โทรศัพท์ไม่ตรงกับข้อมูลใบจองนี้ กรุณาตรวจสอบเบอร์ 4 ตัวท้าย" };
      }
    }

    if (!orderData) {
      matched = true;
      let rawCust = cNameIdx > -1 ? (row[cNameIdx] || '').toString().trim() : '';
      let maskedName = '-';
      if (rawCust) {
        const parts = rawCust.split(' ');
        if (parts.length > 1) {
          maskedName = parts[0] + ' ' + (parts[1].length > 1 ? parts[1].slice(0, 1) + '***' : '*');
        } else {
          maskedName = rawCust.length > 3 ? rawCust.slice(0, 3) + '***' : rawCust;
        }
      }
      const maskedPhone = storedPhoneDigits.length >= 7 
        ? (storedPhoneDigits.slice(0, 3) + '-XXX-' + storedPhoneDigits.slice(-4)) 
        : (storedPhoneDigits ? '***' + storedPhoneDigits.slice(-4) : '-');

      orderData = {
        orderId: oid,
        timestamp: tsIdx > -1 ? row[tsIdx] : '',
        channel: chIdx > -1 ? row[chIdx] : '',
        branch: brIdx > -1 ? row[brIdx] : '',
        pickupDate: pickDateIdx > -1 ? row[pickDateIdx] : '',
        customerName: maskedName,
        maskedPhone: maskedPhone,
        status: stIdx > -1 ? (row[stIdx] || 'Pending') : 'Pending',
        deposit: depIdx > -1 ? (parseFloat(String(row[depIdx] || '0').replace(/,/g, '')) || 0) : 0,
        remark: remIdx > -1 ? row[remIdx] : '',
        netTotal: 0,
        items: [],
        gifts: [],
        discounts: []
      };
    }

    const sku = skuIdx > -1 ? (row[skuIdx] || '').toString().trim() : '';
    const pName = prodIdx > -1 ? (row[prodIdx] || '').toString().trim() : '';
    const qty = qtyIdx > -1 ? (parseInt(row[qtyIdx] || '1', 10) || 1) : 1;
    const unitPrice = priceIdx > -1 ? (parseFloat(String(row[priceIdx] || '0').replace(/,/g, '')) || 0) : 0;
    const netPrice = netIdx > -1 ? (parseFloat(String(row[netIdx] || '0').replace(/,/g, '')) || 0) : 0;
    orderData.netTotal += netPrice;
    if (sku === 'DISCOUNT' || netPrice < 0) {
      orderData.discounts.push({ name: pName, amount: Math.abs(netPrice) });
    } else if (unitPrice === 0 && netPrice === 0) {
      orderData.gifts.push({ sku: sku, name: pName, qty: qty });
    } else {
      orderData.items.push({ sku: sku, name: pName, qty: qty, price: unitPrice, net: netPrice });
    }
  }

  if (!matched || !orderData) {
    return { status: 'error', message: "ไม่พบข้อมูลใบจองตามเลขที่ \"" + orderId + "\" กรุณาตรวจสอบความถูกต้อง" };
  }

  // หากไม่ได้ระบุเบอร์โทรมา และในออเดอร์มีเบอร์โทร ให้แจ้งเตือนให้ระบุเบอร์ 4 ตัวท้ายเพื่อความปลอดภัย
  if (!phoneDigits && storedPhoneDigits && storedPhoneDigits.length >= 4) {
    return { 
      status: 'require_phone', 
      orderId: orderData.orderId, 
      message: "เพื่อความปลอดภัยของข้อมูล กรุณาระบุเบอร์โทรศัพท์ 4 ตัวท้ายที่ใช้สั่งจอง" 
    };
  }

  // คำนวณยอดคงเหลือชำระหน้าร้าน
  orderData.balanceDue = Math.max(0, orderData.netTotal - orderData.deposit);
  orderData.history = getOrderStatusHistory_(ss, orderData.orderId, false);

  return { status: 'success', order: orderData };
}

// 6. ระบบแก้ไขราคา/ราคาเดิม/สต๊อกแบบกลุ่มด่วน (Bulk Quick Price & Stock Editor สำหรับ Admin)
// ===== นำเข้าสินค้าจาก CSV (Admin) =====
// payload.rows = แถวที่ client แปลงจาก CSV (คีย์ = ชื่อหัวคอลัมน์ตรงกับปุ่ม Export ของ Products); dryRun=true คืนรายงานโดยไม่เขียนชีต
// เพิ่ม SKU ใหม่เท่านั้น — SKU ที่มีอยู่แล้ว (ในระบบหรือซ้ำในไฟล์) ถูกข้ามและรายงาน ไม่เขียนทับข้อมูลเดิม; ตรวจทุกแถวฝั่งนี้ซ้ำเสมอ (ไม่เชื่อผล dryRun/client)
// Product Name สร้างจาก Model+Color เสมอ (กฎเดียวกับ saveProductGroup); รุ่นที่มีอยู่แล้ว/ซ้ำในไฟล์ใช้ฟิลด์ร่วม (ราคา ความจุ ฯลฯ) ของแถวแรก
// รูปแบบที่ Excel/Sheets ใช้แสดงเลขยาว (เช่น 8.65E+13, 1E+13) — ตัวเลขเดิมสูญหายไปแล้ว ห้ามรับเป็นรหัส
function isSciNotation_(v) { return /^[0-9]+(\.[0-9]+)?E\+[0-9]+$/i.test((v === null || v === undefined ? '' : v).toString().trim()); }
var PRODUCT_IMPORT_MAX_ROWS_ = 1000;
var PRODUCT_IMPORT_REPORT_CAP_ = 200;
var PRODUCT_IMPORT_SHARED_FIELDS_ = ['Marketing Model', 'Product Group', 'Capacity', 'Price', 'Original Price', 'Unit', 'Category', 'Channel', 'Image URL'].concat(PRODUCT_SPEC_COLS_);
function importProducts(payload, secureUser, ss) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (secureUser.Role !== 'Admin') throw new Error("Permission Denied: Admin only");
    const rowsIn = Array.isArray(payload && payload.rows) ? payload.rows : [];
    if (rowsIn.length === 0) throw new Error("ไม่พบข้อมูลสินค้าในไฟล์");
    if (rowsIn.length > PRODUCT_IMPORT_MAX_ROWS_) throw new Error("นำเข้าได้ครั้งละไม่เกิน " + PRODUCT_IMPORT_MAX_ROWS_ + " แถว (ไฟล์มี " + rowsIn.length + " แถว)");
    const dryRun = !!(payload && payload.dryRun === true);

    ensureProductSpecColumns_(ss);
    const sheet = ss.getSheetByName("Products");
    if (!sheet) throw new Error("ไม่พบชีต Products กรุณากด Auto Setup ก่อน");
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => h.toString().trim());
    const skuIdx = headers.indexOf('SKU'), modelIdx = headers.indexOf('Model');
    if (skuIdx === -1 || modelIdx === -1) throw new Error("โครงสร้างชีต Products ไม่ถูกต้อง (ไม่พบคอลัมน์ Model/SKU)");
    const data = sheet.getDataRange().getValues();

    const existingSkus = {}, sharedByModel = {};
    for (let i = 1; i < data.length; i++) {
      const s = (data[i][skuIdx] || '').toString().trim();
      if (s) existingSkus[s] = true;
      const m = (data[i][modelIdx] || '').toString().trim();
      if (m && !sharedByModel[m]) { const o = {}; headers.forEach((h, c) => { o[h] = data[i][c]; }); sharedByModel[m] = o; }
    }

    const num = (v) => { const t = (v === null || v === undefined ? '' : v).toString().replace(/[,\s฿]/g, ''); return t === '' ? NaN : Number(t); };
    const seenSku = {}, outRows = [], skipped = [], errors = [], warnings = [];
    let skippedCount = 0, errorCount = 0, warningCount = 0;
    const note = (list, cnt, item) => { if (list.length < PRODUCT_IMPORT_REPORT_CAP_) list.push(item); return cnt + 1; };

    rowsIn.forEach((r, idx) => {
      const line = idx + 2; // แถว 1 = หัวตาราง
      // ค่าที่มาจาก Excel: ="8650000000001" (สูตรบังคับเป็นข้อความ) หรือมีเครื่องหมาย ' นำหน้าตัวเลข (text marker) — ถอดออกให้เหลือค่าจริง
      const get = (k) => {
        let v = (r && r[k] !== undefined && r[k] !== null) ? r[k].toString().trim() : '';
        const wrapped = /^=\s*"(.*)"$/.exec(v);
        if (wrapped) v = wrapped[1].trim(); else if (/^'\d/.test(v)) v = v.slice(1).trim();
        return v;
      };
      const sku = get('SKU');
      const fail = (reason) => { errorCount = note(errors, errorCount, { line: line, sku: sku, reason: reason }); };
      if (!sku) return fail('ไม่มี SKU');
      if (sku.length > 64 || /^[=+\-@]/.test(sku) || /[\u0000-\u001f]/.test(sku)) return fail('SKU ไม่ถูกต้อง (ยาวเกิน 64 ตัวอักษร หรือขึ้นต้นด้วย = + - @)');
      if (isSciNotation_(sku)) return fail('SKU เป็นเลขวิทยาศาสตร์ (' + sku + ') — Excel แปลงตัวเลขยาวจนข้อมูลเดิมหาย กู้คืนไม่ได้ ให้ตั้งคอลัมน์ SKU เป็นข้อความ (Text) ก่อนวางข้อมูล แล้วนำเข้าใหม่');
      const model = sanitizeSheetText_(get('Model'));
      if (!model) return fail('ไม่มี Model');
      if (isSciNotation_(model)) return fail('Model เป็นเลขวิทยาศาสตร์ (' + model + ') — Excel แปลงตัวเลขยาวจนข้อมูลเดิมหาย ให้ตั้งคอลัมน์ Model เป็นข้อความ (Text) ก่อนวางข้อมูล');
      if (seenSku[sku]) { skippedCount = note(skipped, skippedCount, { line: line, sku: sku, reason: 'SKU ซ้ำกันในไฟล์' }); return; }
      if (existingSkus[sku]) { skippedCount = note(skipped, skippedCount, { line: line, sku: sku, reason: 'มี SKU นี้ในระบบแล้ว' }); return; }

      const stockStr = get('Stock').replace(/[,\s]/g, '');
      if (!/^\d{1,9}$/.test(stockStr)) return fail('สต๊อกต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป');
      const status = get('Status') || 'เปิด';
      if (status !== 'เปิด' && status !== 'ปิด') return fail("สถานะต้องเป็น 'เปิด' หรือ 'ปิด'");

      let shared = sharedByModel[model];
      if (shared) {
        const filePrice = num(get('Price'));
        if (get('Price') !== '' && !isNaN(filePrice) && filePrice !== Number(shared['Price'])) { warningCount = note(warnings, warningCount, { line: line, sku: sku, reason: 'ราคาในไฟล์ต่างจากรุ่น ' + model + ' ที่มีอยู่ — ใช้ราคาของรุ่นเดิม' }); }
        const fileCap = get('Capacity');
        if (fileCap !== '' && fileCap !== (shared['Capacity'] || '').toString().trim()) { warningCount = note(warnings, warningCount, { line: line, sku: sku, reason: 'ความจุในไฟล์ต่างจากรุ่น ' + model + ' ที่มีอยู่ — ใช้ความจุของรุ่นเดิม' }); }
      } else {
        const price = num(get('Price'));
        if (isNaN(price) || price < 0) return fail('ราคาไม่ถูกต้อง (รุ่นใหม่ต้องระบุราคา)');
        if (!get('Marketing Model')) return fail('รุ่นใหม่ต้องระบุ Marketing Model');
        if (!get('Capacity')) return fail('รุ่นใหม่ต้องระบุความจุ (Capacity)');
        if (!get('Category')) return fail('รุ่นใหม่ต้องระบุหมวด (Category)');
        let origPrice = '';
        if (get('Original Price') !== '') { origPrice = num(get('Original Price')); if (isNaN(origPrice) || origPrice < 0) return fail('ราคาก่อนลด (Original Price) ไม่ถูกต้อง'); }
        shared = { 'Model': model, 'Price': price, 'Original Price': origPrice };
        PRODUCT_IMPORT_SHARED_FIELDS_.forEach(f => { if (f !== 'Price' && f !== 'Original Price') shared[f] = sanitizeSheetText_(get(f)); });
        if (!shared['Channel']) shared['Channel'] = 'ALL';
        if (!PRODUCT_SPEC_COLS_.some(c => (shared[c] || '').toString().trim() !== '')) {
          const auto = inferDefaultProductSpecs_(shared);
          PRODUCT_SPEC_COLS_.forEach(c => { shared[c] = auto[c] || ''; });
        }
        sharedByModel[model] = shared; // แถวถัดไปของรุ่นเดียวกันในไฟล์ใช้ฟิลด์ร่วมนี้
      }

      const color = sanitizeSheetText_(get('Color'));
      const rowObj = Object.assign({}, shared, { 'SKU': sku, 'Model': model, 'Color': color, 'Stock': Number(stockStr), 'Status': status, 'Product Name': sanitizeSheetText_(buildAutoProductName_(model, color)) });
      const ownImage = sanitizeSheetText_(get('Image URL'));
      if (ownImage) rowObj['Image URL'] = ownImage; // รูปเฉพาะ SKU เหมือนฟอร์มเพิ่มสินค้า
      seenSku[sku] = true;
      outRows.push(headers.map(h => rowObj[h] !== undefined ? rowObj[h] : ''));
    });

    if (!dryRun && outRows.length > 0) {
      const startRow = sheet.getLastRow() + 1;
      // SKU/Model เป็นข้อความเสมอ — ไม่ให้ Sheets ตีความรหัสตัวเลขยาวเป็นตัวเลข (ปัดเป็น 8.65E+13 / เสียความแม่นยำเกิน 15 หลัก)
      [skuIdx, modelIdx].forEach(ci => sheet.getRange(startRow, ci + 1, outRows.length, 1).setNumberFormat('@'));
      sheet.getRange(startRow, 1, outRows.length, headers.length).setValues(outRows);
      CacheService.getScriptCache().remove("TABLE_Products");
      logAudit(secureUser.Username, "IMPORT_PRODUCTS", "Imported " + outRows.length + " SKU(s) from CSV (skipped " + skippedCount + ", rejected " + errorCount + ")");
    }
    return { status: 'success', dryRun: dryRun, total: rowsIn.length, created: outRows.length, skippedCount: skippedCount, errorCount: errorCount, warningCount: warningCount, skipped: skipped, errors: errors, warnings: warnings };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ===== นำเข้า CSV: Branches / Channels / Members (Admin) =====
// payload = { table, rows, dryRun } — กติกาเดียวกับนำเข้าสินค้า: เพิ่มรายการใหม่เท่านั้น (ID ซ้ำ = ข้ามและรายงาน ไม่เขียนทับ), ตรวจทุกแถวฝั่งนี้ซ้ำเสมอ, dryRun ไม่เขียนชีต
// Members: รหัสผ่านถูกแฮชที่นี่เสมอ (ว่าง = สุ่มให้แล้วคืน generatedPasswords ครั้งเดียวเฉพาะรอบเขียนจริง — ห้ามลง AuditLog/ข้อความสรุป); Username ซ้ำเทียบแบบไม่สนตัวพิมพ์
var IMPORT_RECORD_TABLES_ = {
  Branches: { idField: 'Branch Code', textCols: ['Branch Code'], free: ['Channel', 'Branch Name', 'Area', 'Mall', 'Region', 'Province', 'Type Name'], cache: 'TABLE_Branches' },
  Channels: { idField: 'Channel ID', textCols: ['Channel ID'], free: ['Channel Name', 'Description'], autoId: { prefix: 'CH-', pad: 2 }, cache: 'TABLE_Channels' },
  Members: { idField: 'Username', textCols: ['Username'], free: ['Name'], ciId: true, cache: 'TABLE_Members' },
  GiftMappings: { idField: 'Mapping ID', textCols: ['Mapping ID'], free: ['Target Mobile (SKU or Group)', 'Channel', 'Brand Gifts', 'Channel Gifts'], autoId: { prefix: 'GM-', pad: 3 }, cache: 'TABLE_GiftMappings' }
};
var IMPORT_MEMBER_ROLES_ = ['Admin', 'Manager', 'Sales'];

// ค่าที่มาจาก Excel: ="123" (สูตรบังคับเป็นข้อความ) หรือมี ' นำหน้าตัวเลข (text marker) — ถอดออกให้เหลือค่าจริง
function importCell_(r, k) {
  let v = (r && typeof r === 'object' && r[k] !== undefined && r[k] !== null) ? r[k].toString().trim() : '';
  const wrapped = /^=\s*"(.*)"$/.exec(v);
  if (wrapped) v = wrapped[1].trim(); else if (/^'\d/.test(v)) v = v.slice(1).trim();
  return v;
}

function importRecords(payload, secureUser, ss) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (secureUser.Role !== 'Admin') throw new Error("Permission Denied: Admin only");
    const table = ((payload && payload.table) || '').toString();
    const spec = Object.prototype.hasOwnProperty.call(IMPORT_RECORD_TABLES_, table) ? IMPORT_RECORD_TABLES_[table] : null;
    if (!spec) throw new Error("ไม่รองรับการนำเข้าตาราง: " + table);
    const rowsIn = Array.isArray(payload.rows) ? payload.rows : [];
    if (rowsIn.length === 0) throw new Error("ไม่พบข้อมูลในไฟล์");
    if (rowsIn.length > PRODUCT_IMPORT_MAX_ROWS_) throw new Error("นำเข้าได้ครั้งละไม่เกิน " + PRODUCT_IMPORT_MAX_ROWS_ + " แถว (ไฟล์มี " + rowsIn.length + " แถว)");
    const dryRun = payload.dryRun === true;

    const sheet = ss.getSheetByName(table);
    if (!sheet) throw new Error("ไม่พบชีต " + table + " กรุณากด Auto Setup ก่อน");
    const data = sheet.getDataRange().getDisplayValues();
    const headers = data[0].map(h => h.toString().trim());
    const idIdx = headers.indexOf(spec.idField);
    if (idIdx === -1) throw new Error("โครงสร้างชีต " + table + " ไม่ถูกต้อง (ไม่พบคอลัมน์ " + spec.idField + ")");
    const idKey = (v) => { const t = (v === null || v === undefined ? '' : v).toString().trim(); return spec.ciId ? t.toLowerCase() : t; };

    const existing = {};
    let maxAuto = 0;
    const autoRe = spec.autoId ? new RegExp('^' + spec.autoId.prefix + '(\\d+)$') : null;
    for (let i = 1; i < data.length; i++) {
      const v = (data[i][idIdx] || '').toString().trim();
      if (!v) continue;
      existing[idKey(v)] = true;
      const m = autoRe ? autoRe.exec(v) : null;
      if (m) maxAuto = Math.max(maxAuto, parseInt(m[1], 10));
    }

    // บริบทอ้างอิงข้ามตาราง (อ่านครั้งเดียว)
    const colValues = (name, col) => {
      const sh = ss.getSheetByName(name);
      if (!sh || sh.getLastRow() < 2) return [];
      const hs = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0].map(h => h.toString().trim());
      const ci = hs.indexOf(col);
      return ci === -1 ? [] : sh.getRange(2, ci + 1, sh.getLastRow() - 1, 1).getDisplayValues().map(r => r[0].toString().trim()).filter(Boolean);
    };
    const knownBranches = {}, knownChannels = {}, knownChannelNames = {};
    if (table === 'Members') colValues('Branches', 'Branch Code').forEach(v => { knownBranches[v] = true; });
    if (table === 'Branches' || table === 'GiftMappings') {
      colValues('Branches', 'Channel').concat(colValues('Channels', 'Channel Name'), colValues('Channels', 'Channel ID')).forEach(v => { knownChannels[v.toLowerCase()] = true; });
    }
    if (table === 'Channels') colValues('Channels', 'Channel Name').forEach(v => { knownChannelNames[v.toLowerCase()] = true; });

    const seen = {}, outRows = [], skipped = [], errors = [], warnings = [], generated = [];
    let skippedCount = 0, errorCount = 0, warningCount = 0, generatedCount = 0;
    const note = (list, cnt, item) => { if (list.length < PRODUCT_IMPORT_REPORT_CAP_) list.push(item); return cnt + 1; };

    rowsIn.forEach((r, idx) => {
      const line = idx + 2;
      const get = (k) => importCell_(r, k);
      let id = get(spec.idField);
      const fail = (reason) => { errorCount = note(errors, errorCount, { line: line, sku: id, reason: reason }); };
      const warn = (reason) => { warningCount = note(warnings, warningCount, { line: line, sku: id, reason: reason }); };

      const needsAutoId = !id && !!spec.autoId; // เว้นว่าง = ให้ระบบออกเลขต่อจากสูงสุด — จองเลขหลังตรวจผ่านเท่านั้น (แถวที่ถูกปฏิเสธไม่กินเลข)
      if (!needsAutoId) {
        if (!id) return fail('ไม่มี ' + spec.idField);
        if (id.length > 64 || /^[=+\-@]/.test(id) || /[\u0000-\u001f]/.test(id)) return fail(spec.idField + ' ไม่ถูกต้อง (ยาวเกิน 64 ตัวอักษร หรือขึ้นต้นด้วย = + - @)');
        if (isSciNotation_(id)) return fail(spec.idField + ' เป็นเลขวิทยาศาสตร์ (' + id + ') — Excel แปลงตัวเลขยาวจนข้อมูลเดิมหาย ให้ตั้งคอลัมน์เป็นข้อความ (Text) ก่อนวางข้อมูล แล้วนำเข้าใหม่');
      }
      const key = needsAutoId ? '' : idKey(id);
      if (!needsAutoId && seen[key]) { skippedCount = note(skipped, skippedCount, { line: line, sku: id, reason: spec.idField + ' ซ้ำกันในไฟล์' }); return; }
      if (!needsAutoId && existing[key]) { skippedCount = note(skipped, skippedCount, { line: line, sku: id, reason: 'มี ' + spec.idField + ' นี้ในระบบแล้ว' + (spec.ciId ? ' (ไม่สนตัวพิมพ์เล็ก/ใหญ่)' : '') }); return; }

      const obj = {};
      spec.free.forEach(f => { obj[f] = sanitizeSheetText_(get(f)); });
      obj[spec.idField] = id;

      if (table === 'Branches') {
        if (!obj['Branch Name']) return fail('ไม่มี Branch Name');
        if (!obj['Channel']) return fail('ไม่มี Channel (สาขาที่ไม่มี Channel จะไม่แสดงในหน้าสั่งจอง)');
        if (!knownChannels[obj['Channel'].toLowerCase()]) { warn("Channel '" + obj['Channel'] + "' ยังไม่มีในระบบ — จะเกิดเป็นช่องทางใหม่ในหน้าสั่งจอง ตรวจตัวสะกดอีกครั้ง"); knownChannels[obj['Channel'].toLowerCase()] = true; }
      } else if (table === 'Channels') {
        if (!obj['Channel Name']) return fail('ไม่มี Channel Name');
        if (knownChannelNames[obj['Channel Name'].toLowerCase()]) warn("ชื่อช่องทาง '" + obj['Channel Name'] + "' ซ้ำกับที่มีอยู่แล้ว");
        knownChannelNames[obj['Channel Name'].toLowerCase()] = true;
      } else if (table === 'GiftMappings') {
        if (!obj['Target Mobile (SKU or Group)']) return fail('ไม่มี Target Mobile (SKU or Group) — ใส่ SKU/ชื่อสินค้า/กลุ่มสินค้า หรือ * = ทุกรุ่น');
        if (!obj['Brand Gifts'] && !obj['Channel Gifts']) return fail('ไม่มีของแถม — ต้องมี Brand Gifts หรือ Channel Gifts อย่างน้อยหนึ่งช่อง');
        const stIn = get('Status').toLowerCase();
        if (stIn === '' || stIn === 'เปิด' || stIn === 'active') obj['Status'] = 'เปิด';
        else if (stIn === 'ปิด' || stIn === 'inactive') obj['Status'] = 'ปิด';
        else return fail("Status ต้องเป็น 'เปิด' หรือ 'ปิด' (หรือเว้นว่าง = เปิด)");
        obj['Channel'].split(/[,;\n]+/).map(t => t.trim()).filter(t => t && !/^(\*|all|ทั้งหมด)$/i.test(t)).forEach(t => { if (!knownChannels[t.toLowerCase()]) warn("Channel '" + t + "' ยังไม่มีในระบบ — เงื่อนไขนี้จะไม่ตรงกับช่องทางใด ตรวจตัวสะกดอีกครั้ง"); });
      } else if (table === 'Members') {
        if (!/^[A-Za-z0-9._@\-]{3,50}$/.test(id)) return fail('Username ใช้ได้เฉพาะ A-Z a-z 0-9 . _ @ - ความยาว 3-50 ตัวอักษร');
        const roleIn = get('Role').toLowerCase();
        const role = IMPORT_MEMBER_ROLES_.filter(x => x.toLowerCase() === roleIn)[0];
        if (!role) return fail('Role ต้องเป็น Admin, Manager หรือ Sales');
        obj['Role'] = role;
        if (!obj['Name']) return fail('ไม่มี Name');
        let branch = get('Branch Code');
        if (!branch) { if (role === 'Admin') branch = 'ALL'; else return fail("ไม่มี Branch Code (Manager/Sales ต้องระบุสาขา หรือ ALL ถ้าเห็นทุกสาขา)"); }
        if (branch !== 'ALL' && !knownBranches[branch]) return fail("ไม่พบ Branch Code '" + branch + "' ในชีต Branches (นำเข้าสาขาก่อน)");
        obj['Branch Code'] = branch;
        const menuTokens = get('Accessible Menus').split(/[,;\n]+/).map(t => t.trim()).filter(Boolean);
        if (menuTokens.some(t => !/^[A-Za-z0-9_*\-]+$/.test(t))) return fail("Accessible Menus ใช้ได้เฉพาะรหัสเมนู (ตัวอักษร/ตัวเลข) คั่นด้วยจุลภาค หรือ *");
        obj['Accessible Menus'] = menuTokens.join(',');
        if (role === 'Admin') warn('สร้างผู้ใช้สิทธิ์ Admin (เข้าถึงได้ทุกอย่าง)');
        else if (branch === 'ALL') warn('ผู้ใช้ ' + role + ' ตั้งสาขาเป็น ALL — เห็นข้อมูลทุกสาขา');
        const pw = get('Password');
        if (pw === '') {
          generatedCount++;
          obj['Password'] = '';
          if (!dryRun) { const g = Utilities.getUuid().replace(/-/g, '').slice(0, 16); generated.push({ username: id, password: g }); obj['Password'] = hashPassword(g); }
        } else if (looksLikePasswordHash_(pw)) {
          obj['Password'] = pw;
        } else if (pw.length < 4) {
          return fail('รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร (หรือเว้นว่างให้ระบบสุ่มให้)');
        } else {
          obj['Password'] = dryRun ? '' : hashPassword(pw);
        }
      }
      if (needsAutoId) {
        id = spec.autoId.prefix + String(++maxAuto).padStart(spec.autoId.pad, '0');
        obj[spec.idField] = id;
      } else {
        seen[key] = true;
      }
      outRows.push(headers.map(h => obj[h] !== undefined ? obj[h] : ''));
    });

    if (!dryRun && outRows.length > 0) {
      const startRow = sheet.getLastRow() + 1;
      spec.textCols.forEach(c => { const ci = headers.indexOf(c); if (ci > -1) sheet.getRange(startRow, ci + 1, outRows.length, 1).setNumberFormat('@'); });
      sheet.getRange(startRow, 1, outRows.length, headers.length).setValues(outRows);
      CacheService.getScriptCache().remove(spec.cache);
      logAudit(secureUser.Username, "IMPORT_" + table.toUpperCase(), "Imported " + outRows.length + " " + table + " row(s) from CSV (skipped " + skippedCount + ", rejected " + errorCount + ")");
    }
    const res = { status: 'success', table: table, dryRun: dryRun, total: rowsIn.length, created: outRows.length, skippedCount: skippedCount, errorCount: errorCount, warningCount: warningCount, skipped: skipped, errors: errors, warnings: warnings, generatedCount: generatedCount };
    if (!dryRun && generated.length > 0) res.generatedPasswords = generated; // แสดงครั้งเดียวหลังนำเข้า — ไม่เก็บไว้ที่ใด
    return res;
  } catch (e) {
    return { status: 'error', message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function bulkUpdateProducts(payload, secureUser, ss) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (secureUser.Role !== 'Admin') throw new Error("Permission Denied: Admin only");
    const updates = Array.isArray(payload && payload.updates) ? payload.updates : [];
    if (updates.length === 0) throw new Error("ไม่มีรายการที่เปลี่ยนแปลง");

    ensureProductSpecColumns_(ss);
    const sheet = ss.getSheetByName("Products");
    if (!sheet) throw new Error("ไม่พบชีต Products");
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) throw new Error("ไม่มีข้อมูลสินค้าในชีต");
    const headers = data[0].map(h => h.toString().trim());
    const skuIdx = headers.indexOf("SKU");
    const priceIdx = headers.indexOf("Price");
    const origPriceIdx = headers.indexOf("Original Price");
    const stockIdx = headers.indexOf("Stock");
    const statusIdx = headers.indexOf("Status");

    // หน้า "แก้ไขราคา/สต๊อกด่วน" ส่งคีย์แบบ SKU/Price/'Original Price'/'Stock Qty'/Status ส่วน API เดิมใช้ sku/price/originalPrice/stock/status — รับทั้งสองแบบ
    // (เดิมอ่านได้แค่แบบหลัง ทำให้หน้าจอบันทึกแล้วไม่มีอะไรเปลี่ยนแต่ขึ้นว่าสำเร็จ)
    const pick = (u, names) => { for (let k = 0; k < names.length; k++) { if (u[names[k]] !== undefined) return u[names[k]]; } return undefined; };
    const updMap = {};
    updates.forEach(raw => {
      if (!raw || typeof raw !== 'object') return;
      const s = (pick(raw, ['sku', 'SKU']) || '').toString().trim();
      if (s) updMap[s] = { sku: s, price: pick(raw, ['price', 'Price']), originalPrice: pick(raw, ['originalPrice', 'Original Price']), stock: pick(raw, ['stock', 'Stock', 'Stock Qty']), status: pick(raw, ['status', 'Status']) };
    });

    let updatedCount = 0;
    for (let i = 1; i < data.length; i++) {
      const sku = (data[i][skuIdx] || '').toString().trim();
      const u = updMap[sku];
      if (!u) continue;
      if (priceIdx > -1 && u.price !== undefined && u.price !== '') {
        const p = parseFloat(u.price);
        if (!isNaN(p) && p >= 0) data[i][priceIdx] = p;
      }
      if (origPriceIdx > -1 && u.originalPrice !== undefined) {
        if (u.originalPrice === '' || u.originalPrice === null) data[i][origPriceIdx] = '';
        else {
          const op = parseFloat(u.originalPrice);
          if (!isNaN(op) && op >= 0) data[i][origPriceIdx] = op;
        }
      }
      if (stockIdx > -1 && u.stock !== undefined && u.stock !== '') {
        const st = parseInt(u.stock, 10);
        if (Number.isInteger(st) && st >= 0) data[i][stockIdx] = st;
      }
      if (statusIdx > -1 && (u.status === 'เปิด' || u.status === 'ปิด')) {
        data[i][statusIdx] = u.status;
      }
      updatedCount++;
    }

    if (updatedCount > 0) {
      sheet.getRange(2, 1, data.length - 1, headers.length).setValues(data.slice(1));
      CacheService.getScriptCache().remove("TABLE_Products");
      logAudit(secureUser.Username, "BULK_UPDATE_PRODUCTS", "Updated " + updatedCount + " SKU(s)");
    }
    return { status: 'success', updatedCount: updatedCount };
  } catch (e) {
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
    // Order Status/Reservation Status เป็นค่าจาก <select> ที่ควบคุมชุดค่าตายตัว — ไม่อยู่ใน FREE_TEXT_COLS_ (ห้าม sanitize ทับ ดู comment บรรทัดล่าง)
    // แต่ก็ต้อง whitelist-validate ฝั่ง server เพราะ API รับ payload ดิบได้โดยไม่ผ่าน <select> ของ UI — ไม่งั้นเขียนสตริงใดๆ (รวมถึง formula) ลงคอลัมน์นี้ได้ตรงๆ
    if (dataObj["Order Status"] !== undefined) {
      const statusSheet = ss.getSheetByName("OrderStatus");
      const rawStatuses = statusSheet ? statusSheet.getDataRange().getValues().slice(1).map(r => (r[1] || '').toString().trim()).filter(Boolean) : [];
      // ต้องใช้ fallback ชุดเดียวกับ window.app.getOrderStatusFlow() ฝั่ง client เมื่อชีต OrderStatus มีไม่ถึง 2 แถว — ไม่งั้นสถานะมาตรฐาน (Pending/Confirmed/Paid/Delivered) จะถูกบล็อกตอนบันทึกแก้ไขออเดอร์
      const validStatuses = rawStatuses.length >= 2 ? rawStatuses.slice() : ['Pending', 'Confirmed', 'Paid', 'Delivered'];
      if (!validStatuses.includes('Cancelled')) validStatuses.push('Cancelled');
      if (!validStatuses.includes(newStatus.toString().trim())) throw new Error("สถานะออเดอร์ไม่ถูกต้อง: " + newStatus);
    }
    if (dataObj["Reservation Status"] !== undefined) {
      const validResStatuses = ['', 'จอง T (มีการจอง)', 'จอง F (สวมสิทธิ์การจอง)'];
      if (!validResStatuses.includes(dataObj["Reservation Status"].toString().trim())) throw new Error("ประเภทการจองไม่ถูกต้อง: " + dataObj["Reservation Status"]);
    }
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
    
    const adjustStockAndLog = (oldStatusVal, newStatusVal, oldSkuVal, newSkuVal, oldQtyVal, newQtyVal, branchVal, oldRemarkVal) => {
      // ไม่มีการเปลี่ยนแปลงที่กระทบสต๊อก — ข้าม ไม่งั้น InventoryLog มีคู่ REVERT/APPLY ขยะทุกแถวทุกครั้งที่แก้ออเดอร์
      if (oldStatusVal !== 'Cancelled' && newStatusVal !== 'Cancelled' && oldSkuVal === newSkuVal && oldQtyVal === newQtyVal) return;
      // ของแถมที่ตอน checkout สต๊อกไม่พอ (processGift) ไม่เคยตัดสต๊อกจริง — ต้องไม่ REVERT (เติมสต๊อกคืน) ให้แถวที่มี marker "รอสต๊อกของแถม" ใน Remark
      const oldWasGiftNoStock = (oldRemarkVal || '').toString().trim() === 'รอสต๊อกของแถม';
      if (oldStatusVal !== 'Cancelled' && oldSkuVal && oldSkuVal !== 'DISCOUNT' && !oldWasGiftNoStock) {
        for (let i = 1; i < prodData.length; i++) {
          if (prodData[i][pSkuIdx] == oldSkuVal) {
            prodData[i][pStockIdx] = parseInt(prodData[i][pStockIdx] || 0) + oldQtyVal;
            invRows.push([generateId('INV'), now, oldSkuVal, "EDIT (REVERT)", oldQtyVal, branchVal, secureUser.Username]);
            break;
          }
        }
      }
      // แถวของแถมที่เดิมไม่เคยตัดสต๊อกจริง (marker "รอสต๊อกของแถม") แล้ว SKU/Qty ไม่ได้ถูกแก้ไข (แค่สถานะออเดอร์เปลี่ยน เช่น un-cancel)
      // ต้องไม่ตัดสต๊อกจริงตรงนี้ด้วย (สมมาตรกับฝั่ง REVERT ด้านบนที่ข้ามการคืนสต๊อกด้วย marker เดียวกัน) — ไม่งั้น un-cancel ออเดอร์ที่มีของแถมค้างสต๊อก
      // จะไปตัดสต๊อกจริงทั้งที่ Remark ยังบอกว่า "รอสต๊อกของแถม" อยู่ กลายเป็นสต๊อกรั่วตอน cancel ครั้งถัดไป (REVERT จะข้ามคืนสต๊อกที่เพิ่งถูกตัดไปจริง)
      const skipApplyForUnresolvedGift = oldWasGiftNoStock && newSkuVal === oldSkuVal && newQtyVal === oldQtyVal;
      if (newStatusVal !== 'Cancelled' && newSkuVal && newSkuVal !== 'DISCOUNT' && !skipApplyForUnresolvedGift) {
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
      let oldRemarkVal = rData[oHeaders.indexOf("Remark")];
      
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
        // เขียนค่า Qty ที่ validate/parseInt แล้วกลับเข้า sheet เสมอ — ห้ามปล่อย dataObj["Qty"] ดิบ (เช่น "5.5") ผ่านไปตรงๆ
        // ไม่งั้น Qty ที่เก็บจริงจะไม่ตรงกับ newQtyVal ที่ใช้คำนวณ Row Total ด้านบน ทำให้สองคอลัมน์ไม่สอดคล้องกัน
        dataObj["Qty"] = newQtyVal;

        // Deposit เป็นคอลัมน์ตัวเลข (ไม่อยู่ใน FREE_TEXT_COLS_ ด้านล่าง จึงไม่ผ่าน sanitizeSheetText_) แต่ก็ไม่เคย validate มาก่อน
        // เหมือน Qty ด้านบน — payload ดิบส่งสตริง/formula เข้าคอลัมน์ตัวเลขนี้ตรงๆ ได้ ถ้าไม่ parse+เช็คก่อน
        if (dataObj["Deposit"] !== undefined) {
          const depositVal = parseFloat(dataObj["Deposit"].toString().replace(/,/g, ''));
          if (isNaN(depositVal) || depositVal < 0) throw new Error("จำนวนเงินมัดจำไม่ถูกต้อง");
          dataObj["Deposit"] = depositVal;
        }

        // กัน formula injection บนฟิลด์ข้อความอิสระที่ user พิมพ์เอง — ห้ามครอบคอลัมน์ตัวเลข/ควบคุม (Row Total, Qty, Order Status ฯลฯ)
        // ไม่งั้นค่าตัวเลขจะกลายเป็นสตริงและพังการรวมยอด/สถานะ
        // Receipt No เป็นข้อความอิสระเหมือนกัน (sanitize แล้วตอนสร้างออเดอร์ใน processCheckout) — เดิมหลุดจากลิสต์นี้ตอนแก้ไขออเดอร์
        const FREE_TEXT_COLS_ = ["Customer Name", "Contact Number", "Email", "ID Card_Passport", "Code Handraiser", "Promo", "Staff", "Booking Phone", "Customer Interests", "Remark", "Receipt No", "Pre Order No", "Pickup Date"];
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
      
      adjustStockAndLog(oldStatusVal, newStatusVal, oldSkuVal, newSkuVal, oldQtyVal, newQtyVal, branchVal, oldRemarkVal);
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
    const prevOrderStatus = matchingRows.length ? (matchingRows[0].rowData[oHeaders.indexOf("Order Status")] || 'Pending').toString().trim() : '';
    if (prevOrderStatus !== (newStatus || '').toString().trim()) logOrderStatus_(ss, orderId, prevOrderStatus, newStatus.toString().trim(), secureUser.Username);
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
    if (tableName === 'Products') ensureProductSpecColumns_(ss);
    if (tableName === 'Coupons') ensureCouponsSheet_(ss);
    const sheet = ss.getSheetByName(tableName); const data = sheet.getDataRange().getDisplayValues(); const headers = data[0].map(h => h.toString().trim()); let idIndex = headers.indexOf(idField); let rowIndex = -1;
    // แก้ไข: ใช้ _rowIndex ที่ client ส่งมา (มาจากแถวจริงที่โหลดไว้ตอนเปิดฟอร์มแก้ไข) เป็นตัวชี้แถวหลัก แม่นยำกว่าไล่เทียบค่า ID เฉยๆ
    // สร้างใหม่ (ไม่มี _rowIndex ส่งมา): ถ้า ID ที่พิมพ์ตรงกับแถวที่มีอยู่แล้ว ต้อง "บล็อก" ไม่ใช่อัปเดตทับเงียบๆ — เดิมมีแค่เช็คฝั่ง client (saveForm, JS.html) ซึ่งข้ามได้ผ่านการยิง API ตรงๆ
    // กระทบเฉพาะตารางที่ ID พิมพ์เองได้อิสระ (Branches/Members/Interests) — ตารางอื่น (Products ผ่าน productGroup, Promo/Channel/Mapping/Rule ID auto-gen+readonly ตอนสร้าง) ไม่มีทางชนได้อยู่แล้ว โค้ดนี้เป็น safety net เฉยๆ
    const editingRowIndex = parseInt(dataObj._rowIndex, 10);
    if (!isNaN(editingRowIndex) && editingRowIndex >= 2 && editingRowIndex <= data.length) {
      rowIndex = editingRowIndex;
    } else if (dataObj[idField]) {
      for (let i = 1; i < data.length; i++) {
        if (data[i][idIndex] == dataObj[idField]) {
          throw new Error("มีรายการที่ใช้ " + idField + " \"" + dataObj[idField] + "\" อยู่แล้ว — หากต้องการแก้ไขรายการเดิม กรุณากดปุ่มแก้ไขที่รายการนั้นแทน");
        }
      }
    }
    let generatedPassword = null;
    if (tableName === "Members") {
      if (!dataObj.Password || dataObj.Password.trim() === "") {
        if (rowIndex > -1) {
          dataObj.Password = data[rowIndex - 1][headers.indexOf("Password")];
        } else {
          // สมาชิกใหม่เว้นรหัสผ่านว่าง — สุ่มรหัสผ่านแบบเดียวกับ initialAdmin ใน setupDatabase (ห้าม hardcode ค่าเดาง่ายอย่าง "1234")
          generatedPassword = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
          dataObj.Password = hashPassword(generatedPassword);
        }
      } else if (!looksLikePasswordHash_(dataObj.Password)) {
        dataObj.Password = hashPassword(dataObj.Password);
      }
    }
    // กัน formula injection (rule 24) — เดิม saveRecord (CRUD กลางของ Products/Branches/Channels/Promotions/Interests/GiftMappings/AutoPromotions/Members)
    // ไม่เคยผ่าน sanitizeSheetText_ เลยสักคอลัมน์ ทั้งที่เป็นจุดที่ Admin พิมพ์ข้อความอิสระบ่อยที่สุดในระบบ — ห้ามครอบคอลัมน์ตัวเลข/select/ID
    // (เช่น Value ที่ตั้งใจติดลบ) จึงต้องระบุเฉพาะคอลัมน์ข้อความอิสระจริงๆ ต่อชีต ไม่ blanket-apply ทั้งแถว
    const SAVE_RECORD_FREE_TEXT_COLS_ = {
      "Products": ["Product Name", "Model", "Marketing Model", "Product Group", "Capacity", "Color", "Image URL", "Unit"].concat(PRODUCT_SPEC_COLS_),
      "Branches": ["Channel", "Branch Name", "Area", "Mall", "Region", "Province", "Type Name"],
      "Channels": ["Channel Name", "Description"],
      "Promotions": ["Promo Name"],
      "Interests": ["Interest Name"],
      "GiftMappings": ["Target Mobile (SKU or Group)", "Brand Gifts", "Channel Gifts"],
      "AutoPromotions": ["Message Suggest", "Message Apply"],
      "Coupons": ["Code", "Description"],
      "Members": ["Name"]
    };
    const freeTextCols = SAVE_RECORD_FREE_TEXT_COLS_[tableName] || [];
    let rowData = headers.map(h => dataObj[h] !== undefined ? (freeTextCols.includes(h) ? sanitizeSheetText_(dataObj[h]) : dataObj[h]) : "");
    if (rowIndex > -1) { sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]); logAudit(secureUser.Username, "UPDATE", "Updated " + tableName); } else { sheet.appendRow(rowData); logAudit(secureUser.Username, "INSERT", "Added to " + tableName); } const cacheableTables = ["Products", "Promotions", "Branches", "Channels", "Interests", "GiftMappings", "AutoPromotions"]; if (cacheableTables.includes(tableName)) CacheService.getScriptCache().remove("TABLE_" + tableName);
    return generatedPassword ? { status: 'success', generatedPassword: generatedPassword } : { status: 'success' };
  } catch(e) {
    return { status: 'error', message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// พอร์ตมาจากโปรเจกต์ f8 (ฟีเจอร์ "เพิ่ม/แก้ไขสินค้าแบบหลาย SKU", 2026-09-19) — ปรับให้เข้ากับ f9:
// ผ่าน sanitizeSheetText_ ทุกฟิลด์ข้อความอิสระ (f8 ต้นทางยังไม่มีจุดนี้ ตามคอนเวนชัน SAVE_RECORD_FREE_TEXT_COLS_ ของ f9 เอง)
// และไม่แตะ Category options ของ f9 (6 หมวด รวม สมาร์ทวอทช์/หูฟัง ซึ่ง f8 ยังไม่มี) — ฟังก์ชันนี้ไม่ hardcode รายการหมวดหมู่อยู่แล้ว จึงใช้ได้ตรงๆ
const PRODUCT_GROUP_FREE_TEXT_FIELDS_ = ['Model', 'Marketing Model', 'Product Group', 'Capacity', 'Unit', 'Image URL'].concat(PRODUCT_SPEC_COLS_);

function buildAutoProductName_(model, color) {
  return [model, color].map(s => (s || '').toString().trim()).filter(Boolean).join(' ');
}

function saveProductGroup(payload, secureUser, ss) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (secureUser.Role !== 'Admin') throw new Error("Permission Denied: Admin only");

    const shared = payload.shared || {};
    const model = (shared['Model'] || '').toString().trim();
    if (!model) throw new Error("กรุณาระบุ Model");

    const variantsIn = Array.isArray(payload.variants) ? payload.variants : [];
    if (variantsIn.length === 0) throw new Error("กรุณาเพิ่มอย่างน้อย 1 SKU");

    ensureProductSpecColumns_(ss);
    const sheet = ss.getSheetByName("Products");
    if (!sheet) throw new Error("ไม่พบชีต Products กรุณากด Auto Setup ก่อน");
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => h.toString().trim());
    const modelIdx = headers.indexOf('Model');
    const skuIdx = headers.indexOf('SKU');
    if (modelIdx === -1 || skuIdx === -1) throw new Error("โครงสร้างชีต Products ไม่ถูกต้อง (ไม่พบคอลัมน์ Model/SKU)");

    const data = sheet.getDataRange().getValues();

    // หา Model เดิม (ถ้ามี) — แถวแรกที่เจอใช้เป็นต้นแบบฟิลด์ร่วมตอน append
    let firstExistingRow = null;
    for (let i = 1; i < data.length; i++) {
      if ((data[i][modelIdx] || '').toString().trim() === model) { firstExistingRow = data[i]; break; }
    }
    const isAppend = !!firstExistingRow;

    let sharedForRows;
    if (isAppend) {
      // append เข้าสินค้าเดิม — ใช้ฟิลด์ร่วมจากแถวเดิมในชีตเสมอ (ผ่าน sanitize มาแล้วตอนสร้าง/แก้ไขครั้งก่อน ไม่ต้อง sanitize ซ้ำ) ไม่ใช้ค่าที่ client ส่งมา
      sharedForRows = {};
      headers.forEach((h, i) => { sharedForRows[h] = firstExistingRow[i]; });
    } else {
      sharedForRows = shared;
      sharedForRows['Model'] = model;
      const hasSubmittedSpecs = PRODUCT_SPEC_COLS_.some(col => (sharedForRows[col] || '').toString().trim() !== '');
      if (!hasSubmittedSpecs) {
        const autoSpecs = inferDefaultProductSpecs_(sharedForRows);
        PRODUCT_SPEC_COLS_.forEach(col => { sharedForRows[col] = autoSpecs[col] || ''; });
      }
      PRODUCT_GROUP_FREE_TEXT_FIELDS_.forEach(f => { sharedForRows[f] = sanitizeSheetText_((sharedForRows[f] || '').toString().trim()); });
    }

    // ราคาเป็นฟิลด์ร่วมของสินค้า (ทุก SKU ของสินค้าเดียวกันใช้ราคาเดียวกัน) — ตรวจครั้งเดียวจากค่าที่จะใช้จริง
    const sharedPrice = parseFloat(sharedForRows['Price']);
    if (isNaN(sharedPrice) || sharedPrice < 0) throw new Error("กรุณาระบุราคาให้ถูกต้อง");
    sharedForRows['Price'] = sharedPrice;
    // ความจุเป็นฟิลด์ร่วมของสินค้าเช่นเดียวกับราคา — ทุก SKU ของ Model เดียวกันใช้ความจุเดียวกัน มีแค่สีที่ต่างกันต่อแถว
    const sharedCapacity = (sharedForRows['Capacity'] || '').toString().trim();
    sharedForRows['Capacity'] = sharedCapacity;
    // Marketing Model และความจุเป็นฟิลด์บังคับเช่นเดียวกับ Model (owner request 2026-09-19)
    if (!sharedForRows['Marketing Model']) throw new Error("กรุณาระบุ Marketing Model");
    if (!sharedCapacity) throw new Error("กรุณาระบุความจุ");

    // SKU เป็นรหัสหลักของทั้งชีต ต้องไม่ซ้ำทั้งกันเองในฟอร์มและกับ SKU ใดๆ ที่มีอยู่แล้วในระบบ (รวมถึง SKU เดิมของสินค้านี้เองตอน append)
    const existingSkus = {};
    for (let i = 1; i < data.length; i++) {
      const s = (data[i][skuIdx] || '').toString().trim();
      if (s) existingSkus[s] = true;
    }

    const seenSku = {};
    const newRows = variantsIn.map(v => {
      const sku = (v.sku || '').toString().trim();
      if (!sku) throw new Error("กรุณาระบุ SKU ให้ครบทุกแถว");
      if (seenSku[sku]) throw new Error("SKU ซ้ำกันในฟอร์ม: " + sku);
      if (existingSkus[sku]) throw new Error("SKU ซ้ำกับสินค้าอื่นที่มีอยู่แล้วในระบบ: " + sku);
      seenSku[sku] = true;

      const stock = parseInt(v.stock, 10);
      if (!Number.isInteger(stock) || stock < 0) throw new Error("สต๊อกของ SKU " + sku + " ไม่ถูกต้อง");

      const color = sanitizeSheetText_((v.color || '').toString().trim());
      const rowObj = Object.assign({}, sharedForRows, {
        'SKU': sku,
        'Color': color,
        'Stock': stock,
        'Product Name': sanitizeSheetText_(buildAutoProductName_(model, color))
      });
      // รูปเฉพาะ SKU นี้ (ถ้ามี) แทนที่รูปเริ่มต้นของสินค้าเฉพาะแถวนี้แถวเดียว
      const perSkuImage = (v.image || '').toString().trim();
      if (perSkuImage) rowObj['Image URL'] = sanitizeSheetText_(perSkuImage);
      return headers.map(h => rowObj[h] !== undefined ? rowObj[h] : '');
    });

    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, headers.length).setValues(newRows);
    CacheService.getScriptCache().remove("TABLE_Products");
    logAudit(secureUser.Username, isAppend ? "INSERT_PRODUCT_SKUS" : "INSERT_PRODUCT_GROUP",
      (isAppend ? "Added " + newRows.length + " SKU(s) to existing product: " : "Created product: ") + model + " (" + newRows.length + " SKUs)");

    return { status: 'success', model: model, skuCount: newRows.length, appended: isAppend };
  } catch(e) {
    return { status: 'error', message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// แก้ไขสินค้าเดิมทั้งกลุ่ม (ทุก SKU ของ Model เดียวกัน) ในคำขอเดียว — คู่กับ saveProductGroup ด้านบน
// ลบแถวเดิมทั้งหมดของ originalModel แล้วเขียนชุด SKU ใหม่ทั้งหมดแทน (เพิ่ม/ลบ/แก้ SKU ได้อิสระในหน้าเดียว)
// ห้ามเปลี่ยนชื่อ Model ผ่านฟังก์ชันนี้ (ฟอร์มฝั่ง client ล็อกฟิลด์ Model ไว้แล้ว แต่ตรวจซ้ำฝั่ง server) — กัน SKU เดิมหลุดกลุ่ม/ชนกับ Model อื่นโดยไม่ตั้งใจ
function updateProductGroup(payload, secureUser, ss) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (secureUser.Role !== 'Admin') throw new Error("Permission Denied: Admin only");

    const originalModel = (payload.originalModel || '').toString().trim();
    if (!originalModel) throw new Error("ไม่พบ Model ที่จะแก้ไข");

    const shared = payload.shared || {};
    // เทียบ Model ที่ client ส่งมากับของเดิมก่อน sanitize เสมอ (ฟอร์มฝั่ง client ล็อกฟิลด์นี้ไว้ ค่าที่ส่งมาควรตรงเป๊ะกับของเดิม) — sanitize อาจเติม ' นำหน้าทำให้เทียบตรงๆ ผิดพลาดได้
    const submittedModel = (shared['Model'] || '').toString().trim();
    if (submittedModel && submittedModel !== originalModel) throw new Error("ไม่สามารถเปลี่ยนชื่อ Model ผ่านฟอร์มแก้ไขนี้ได้");

    const hasSubmittedSpecsUpd = PRODUCT_SPEC_COLS_.some(col => (shared[col] || '').toString().trim() !== '');
    if (!hasSubmittedSpecsUpd) {
      const autoSpecsUpd = inferDefaultProductSpecs_(Object.assign({}, shared, { 'Model': originalModel }));
      PRODUCT_SPEC_COLS_.forEach(col => { shared[col] = autoSpecsUpd[col] || ''; });
    }
    PRODUCT_GROUP_FREE_TEXT_FIELDS_.forEach(f => { shared[f] = sanitizeSheetText_((shared[f] || '').toString().trim()); });

    const variantsIn = Array.isArray(payload.variants) ? payload.variants : [];
    if (variantsIn.length === 0) throw new Error("กรุณาเหลืออย่างน้อย 1 SKU (ถ้าต้องการลบสินค้าทั้งหมด กรุณาลบทีละแถวจากตารางแทน)");

    // ราคาเป็นฟิลด์ร่วมของสินค้า (ทุก SKU ใช้ราคาเดียวกัน) — ตรวจครั้งเดียวจากค่าที่ client ส่งมา
    const sharedPrice = parseFloat(shared['Price']);
    if (isNaN(sharedPrice) || sharedPrice < 0) throw new Error("กรุณาระบุราคาให้ถูกต้อง");
    shared['Price'] = sharedPrice;
    // ความจุเป็นฟิลด์ร่วมของสินค้าเช่นเดียวกับราคา — ทุก SKU ของ Model เดียวกันใช้ความจุเดียวกัน มีแค่สีที่ต่างกันต่อแถว
    const sharedCapacity = (shared['Capacity'] || '').toString().trim();
    shared['Capacity'] = sharedCapacity;
    // Marketing Model และความจุเป็นฟิลด์บังคับเช่นเดียวกับ Model (owner request 2026-09-19)
    if (!shared['Marketing Model']) throw new Error("กรุณาระบุ Marketing Model");
    if (!sharedCapacity) throw new Error("กรุณาระบุความจุ");

    ensureProductSpecColumns_(ss);
    const sheet = ss.getSheetByName("Products");
    if (!sheet) throw new Error("ไม่พบชีต Products");
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => h.toString().trim());
    const modelIdx = headers.indexOf('Model');
    const skuIdx = headers.indexOf('SKU');
    if (modelIdx === -1 || skuIdx === -1) throw new Error("โครงสร้างชีต Products ไม่ถูกต้อง (ไม่พบคอลัมน์ Model/SKU)");

    const data = sheet.getDataRange().getValues();
    const hasExisting = data.some((row, i) => i > 0 && (row[modelIdx] || '').toString().trim() === originalModel);
    if (!hasExisting) throw new Error("ไม่พบสินค้า Model \"" + originalModel + "\" ในระบบ (อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า)");

    // SKU ต้องไม่ซ้ำกับสินค้า "อื่น" ที่ไม่ใช่กลุ่มที่กำลังแก้ไข — แถวเดิมของกลุ่มนี้กำลังจะถูกลบแล้วเขียนใหม่อยู่แล้ว จึงชนกันเองไม่ได้ (อนุญาตให้คง SKU เดิมไว้ได้ตามปกติ)
    const otherSkus = {};
    for (let i = 1; i < data.length; i++) {
      if ((data[i][modelIdx] || '').toString().trim() === originalModel) continue;
      const s = (data[i][skuIdx] || '').toString().trim();
      if (s) otherSkus[s] = true;
    }

    const seenSku = {};
    const newRows = variantsIn.map(v => {
      const sku = (v.sku || '').toString().trim();
      if (!sku) throw new Error("กรุณาระบุ SKU ให้ครบทุกแถว");
      if (seenSku[sku]) throw new Error("SKU ซ้ำกันในฟอร์ม: " + sku);
      if (otherSkus[sku]) throw new Error("SKU ซ้ำกับสินค้าอื่นที่มีอยู่แล้วในระบบ: " + sku);
      seenSku[sku] = true;

      const stock = parseInt(v.stock, 10);
      if (!Number.isInteger(stock) || stock < 0) throw new Error("สต๊อกของ SKU " + sku + " ไม่ถูกต้อง");

      const color = sanitizeSheetText_((v.color || '').toString().trim());
      const rowObj = Object.assign({}, shared, {
        'Model': originalModel,
        'SKU': sku,
        'Color': color,
        'Stock': stock,
        'Product Name': sanitizeSheetText_(buildAutoProductName_(originalModel, color))
      });
      const perSkuImage = (v.image || '').toString().trim();
      if (perSkuImage) rowObj['Image URL'] = sanitizeSheetText_(perSkuImage);
      return headers.map(h => rowObj[h] !== undefined ? rowObj[h] : '');
    });

    // ลบแถวเดิมทั้งหมดของ Model นี้ (ไล่จากล่างขึ้นบนกันเลขแถวเลื่อน) แล้วเขียนแถวใหม่ทั้งหมดแทน
    for (let i = data.length - 1; i >= 1; i--) {
      if ((data[i][modelIdx] || '').toString().trim() === originalModel) sheet.deleteRow(i + 1);
    }
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, headers.length).setValues(newRows);
    CacheService.getScriptCache().remove("TABLE_Products");
    logAudit(secureUser.Username, "UPDATE_PRODUCT_GROUP", "Updated product: " + originalModel + " (" + newRows.length + " SKUs)");

    return { status: 'success', model: originalModel, skuCount: newRows.length };
  } catch(e) {
    return { status: 'error', message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ลบหลายรายการพร้อมกัน (Admin) — ตารางและคอลัมน์ ID มาจากตารางกำหนดฝั่งนี้เท่านั้น (ไม่เชื่อ idField จาก client)
// ลบแถวแรกที่ ID ตรงของแต่ละค่า (เหมือน deleteRecord ทีละรายการ); ID ที่ไม่พบรายงานใน notFound; ไม่ลบบัญชีของตัวเอง
var BULK_DELETE_TABLES_ = {
  Products: { idField: 'SKU' }, Branches: { idField: 'Branch Code' }, Channels: { idField: 'Channel ID' },
  Members: { idField: 'Username' }, GiftMappings: { idField: 'Mapping ID' }, AutoPromotions: { idField: 'Rule ID' },
  Promotions: { idField: 'Promo ID' }
};
var BULK_DELETE_MAX_ = 200;
function deleteRecords(payload, secureUser, ss) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (secureUser.Role !== 'Admin') return { status: 'error', message: 'Permission Denied: Admin only' };
    const table = ((payload && payload.tableName) || '').toString();
    const spec = Object.prototype.hasOwnProperty.call(BULK_DELETE_TABLES_, table) ? BULK_DELETE_TABLES_[table] : null;
    if (!spec) return { status: 'error', message: 'ไม่รองรับการลบหลายรายการของตาราง: ' + table };
    const raw = Array.isArray(payload.idValues) ? payload.idValues : [];
    const ids = [];
    const seen = {};
    raw.forEach(v => { const t = (v === null || v === undefined ? '' : v).toString().trim(); if (t && !seen[t]) { seen[t] = true; ids.push(t); } });
    if (ids.length === 0) return { status: 'error', message: 'ยังไม่ได้เลือกรายการ' };
    if (ids.length > BULK_DELETE_MAX_) return { status: 'error', message: 'ลบได้ครั้งละไม่เกิน ' + BULK_DELETE_MAX_ + ' รายการ (เลือกมา ' + ids.length + ')' };
    const sheet = ss.getSheetByName(table);
    if (!sheet) return { status: 'error', message: 'ไม่พบชีต ' + table };
    const data = sheet.getDataRange().getDisplayValues();
    const idIdx = data[0].map(h => h.toString().trim()).indexOf(spec.idField);
    if (idIdx === -1) return { status: 'error', message: 'โครงสร้างชีต ' + table + ' ไม่ถูกต้อง (ไม่พบคอลัมน์ ' + spec.idField + ')' };
    const want = {};
    ids.forEach(id => { want[id] = true; });
    const rowsToDelete = [], deletedIds = [], found = {}, protectedIds = [];
    for (let i = 1; i < data.length; i++) {
      const v = (data[i][idIdx] || '').toString().trim();
      if (!want[v] || found[v]) continue;
      found[v] = true;
      if (table === 'Members' && v.toLowerCase() === (secureUser.Username || '').toString().toLowerCase()) { protectedIds.push(v); continue; }
      rowsToDelete.push(i + 1);
      deletedIds.push(v);
    }
    for (let k = rowsToDelete.length - 1; k >= 0; k--) sheet.deleteRow(rowsToDelete[k]);
    const notFound = ids.filter(id => !found[id]);
    if (rowsToDelete.length > 0) {
      const cacheableTables = ["Products", "Promotions", "Branches", "Channels", "Interests", "GiftMappings", "AutoPromotions", "Members"];
      if (cacheableTables.includes(table)) CacheService.getScriptCache().remove("TABLE_" + table);
      logAudit(secureUser.Username, "BULK_DELETE", "Deleted " + rowsToDelete.length + " row(s) from " + table + ": " + deletedIds.slice(0, 10).join(','));
    }
    return { status: 'success', deleted: rowsToDelete.length, notFound: notFound, protectedIds: protectedIds };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// เปิด/ปิด หลายรายการพร้อมกัน (Admin) — เฉพาะตารางที่มีคอลัมน์ Status จริง; คอลัมน์ ID มาจากตารางฝั่งนี้ ไม่เชื่อ client
var BULK_STATUS_TABLES_ = {
  Products: { idField: 'SKU' }, GiftMappings: { idField: 'Mapping ID' }, AutoPromotions: { idField: 'Rule ID' }, Promotions: { idField: 'Promo ID' }
};
function bulkSetStatus(payload, secureUser, ss) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (secureUser.Role !== 'Admin') return { status: 'error', message: 'Permission Denied: Admin only' };
    const table = ((payload && payload.tableName) || '').toString();
    const spec = Object.prototype.hasOwnProperty.call(BULK_STATUS_TABLES_, table) ? BULK_STATUS_TABLES_[table] : null;
    if (!spec) return { status: 'error', message: 'ไม่รองรับการเปลี่ยนสถานะหลายรายการของตาราง: ' + table };
    const target = (payload.status === undefined || payload.status === null || String(payload.status).trim() === '') ? null : statusFromInput_(payload.status);
    if (target === null) return { status: 'error', message: "สถานะต้องเป็น 'เปิด' หรือ 'ปิด'" };
    const raw = Array.isArray(payload.idValues) ? payload.idValues : [];
    const ids = [], seen = {};
    raw.forEach(v => { const t = (v === null || v === undefined ? '' : v).toString().trim(); if (t && !seen[t]) { seen[t] = true; ids.push(t); } });
    if (ids.length === 0) return { status: 'error', message: 'ยังไม่ได้เลือกรายการ' };
    if (ids.length > BULK_DELETE_MAX_) return { status: 'error', message: 'เปลี่ยนได้ครั้งละไม่เกิน ' + BULK_DELETE_MAX_ + ' รายการ (เลือกมา ' + ids.length + ')' };
    const sheet = ss.getSheetByName(table);
    if (!sheet) return { status: 'error', message: 'ไม่พบชีต ' + table };
    const data = sheet.getDataRange().getDisplayValues();
    const headers = data[0].map(h => h.toString().trim());
    const idIdx = headers.indexOf(spec.idField), stIdx = headers.indexOf('Status');
    if (idIdx === -1 || stIdx === -1) return { status: 'error', message: 'โครงสร้างชีต ' + table + ' ไม่ถูกต้อง (ไม่พบคอลัมน์ ' + spec.idField + ' หรือ Status)' };
    const want = {};
    ids.forEach(id => { want[id] = true; });
    const found = {};
    let updated = 0, unchanged = 0;
    for (let i = 1; i < data.length; i++) {
      const v = (data[i][idIdx] || '').toString().trim();
      if (!want[v] || found[v]) continue;
      found[v] = true;
      const cur = (data[i][stIdx] || '').toString().trim();
      if (cur === target) { unchanged++; continue; }
      sheet.getRange(i + 1, stIdx + 1).setValue(target);
      updated++;
    }
    const notFound = ids.filter(id => !found[id]);
    if (updated > 0) {
      CacheService.getScriptCache().remove("TABLE_" + table);
      logAudit(secureUser.Username, "BULK_STATUS", "Set " + updated + " row(s) in " + table + " to " + target);
    }
    return { status: 'success', updated: updated, unchanged: unchanged, notFound: notFound, newStatus: target };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ===== รีเซ็ตรหัสผ่านฉุกเฉิน (เจ้าของโปรเจกต์ Apps Script เท่านั้น) =====
// ใช้เมื่อลืมรหัสผ่านและไม่มี Admin คนอื่น: ตั้ง Script Properties 3 ค่า (Project Settings → Script properties)
//   MPOS_RESET_ENABLE = true, MPOS_RESET_USERNAME = <username>, MPOS_RESET_PASSWORD = <รหัสใหม่ อย่างน้อย 8 ตัว>
// แล้วรันฟังก์ชันนี้จาก Apps Script editor (Run) — ฟังก์ชันล้างค่าทั้ง 3 ตัวทุกครั้งที่ทำงาน (สำเร็จหรือไม่ก็ตาม) ไม่ทิ้งรหัสผ่านไว้
// ไม่มี property MPOS_RESET_ENABLE = true จะไม่ทำอะไรเลย (ฟังก์ชันนี้ถูกเรียกจากหน้าเว็บได้ในทางเทคนิค จึงต้องมีประตูนี้); ไม่คืนรหัสผ่านในผลลัพธ์
function resetMemberPasswordFromProperties() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('MPOS_RESET_ENABLE') !== 'true') throw new Error('ไม่ได้เปิดใช้งาน: ตั้ง Script property MPOS_RESET_ENABLE = true ก่อน (ดูคอมเมนต์ของฟังก์ชัน)');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const username = (props.getProperty('MPOS_RESET_USERNAME') || '').toString().trim();
    const password = (props.getProperty('MPOS_RESET_PASSWORD') || '').toString();
    if (!username) throw new Error('ไม่ได้ตั้ง MPOS_RESET_USERNAME');
    if (password.length < 8 || password.length > 100) throw new Error('MPOS_RESET_PASSWORD ต้องยาว 8-100 ตัวอักษร');
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Members');
    if (!sheet || sheet.getLastRow() < 2) throw new Error('ไม่พบชีต Members หรือยังไม่มีสมาชิก');
    const data = sheet.getDataRange().getDisplayValues();
    const headers = data[0].map(h => h.toString().trim());
    const uCol = headers.indexOf('Username'), pCol = headers.indexOf('Password');
    if (uCol === -1 || pCol === -1) throw new Error('โครงสร้างชีต Members ไม่ถูกต้อง');
    let row = -1;
    for (let i = 1; i < data.length; i++) { if ((data[i][uCol] || '').toString().trim() === username) { row = i + 1; break; } }
    if (row === -1) throw new Error("ไม่พบ Username '" + username + "' ในชีต Members (ตัวพิมพ์เล็ก/ใหญ่ต้องตรง)");
    sheet.getRange(row, pCol + 1).setNumberFormat('@').setValue(hashPassword(password));
    CacheService.getScriptCache().remove('LOGIN_FAIL_' + username); // ปลดล็อกการล็อกอินผิดเกินกำหนดของ user นี้
    logAudit('SCRIPT_OWNER', 'RESET_PASSWORD', "Password reset for '" + username + "' via script properties");
    return "รีเซ็ตรหัสผ่านของ '" + username + "' แล้ว — ล็อกอินด้วยรหัสใหม่ได้ทันที (แนะนำให้เปลี่ยนรหัสอีกครั้งหลังเข้าระบบ)";
  } finally {
    ['MPOS_RESET_ENABLE', 'MPOS_RESET_USERNAME', 'MPOS_RESET_PASSWORD'].forEach(function(k) { props.deleteProperty(k); });
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
        const remarkIdx = data[0].indexOf("Remark");
        
        let deletedCount = 0;
        let invRows = [];
        
        for (let i = data.length - 1; i >= 1; i--) {
          if (data[i][idIndex] == idValue) {
            let rowStatus = data[i][statusIdx];
            let rowSku = data[i][skuIdx];
            let rowQty = parseInt(data[i][qtyIdx] || 0);
            let rowBranch = data[i][branchIdx];
            
            // ของแถมที่ตอน checkout สต๊อกไม่พอ (processGift) ไม่เคยตัดสต๊อกจริง — ต้องเช็คจาก marker "รอสต๊อกของแถม" ที่ Remark ของแถวนั้นโดยตรง
            // ไม่ใช่เดาจากสต๊อกปัจจุบัน (currentStock < rowQty) เพราะสต๊อกอาจถูกเติม/ตัดจากรายการอื่นไปแล้วหลัง checkout ทำให้เดาผิดทั้งสองทาง
            let shouldRestore = rowStatus !== 'Cancelled' && rowSku && rowSku !== 'DISCOUNT'
              && !(remarkIdx > -1 && (data[i][remarkIdx] || '').toString().trim() === 'รอสต๊อกของแถม');
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
  if (bannersSheet) migrateStatusColumn_(bannersSheet, 'Status'); // ค่าเก่า Active → เปิด (Admin เปิดหน้าแบนเนอร์)
  if (!bannersSheet) return { status: 'error', message: 'UI_Banners sheet not found. Please click Auto Setup to initialize new database structure.' };
  
  ensureBannerColumns_(bannersSheet);
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
    const title = data[i][6] ? data[i][6].toString().trim() : "";
    const buttonText = data[i][7] ? data[i][7].toString().trim() : "";
    const startDate = bannerDateStr_(data[i][8]);
    const endDate = bannerDateStr_(data[i][9]);
    const sched = { startDate: startDate, endDate: endDate, schedule: bannerScheduleState_(startDate, endDate) };

    if (status !== 'Deleted' && url && url.toString().trim() !== "") {
      if (type === 'loginbg') loginBg = url.toString().trim();
      else if (type === 'herobanner') heroBanners.push(Object.assign({ rowIndex: rIdx, id: data[i][0] ? data[i][0].toString().trim() : '', url: url.toString().trim(), targetLink: targetLink, details: details, title: title }, sched));
      else if (type === 'promogrid') promoGrids.push(Object.assign({ rowIndex: rIdx, id: data[i][0] ? data[i][0].toString().trim() : '', url: url.toString().trim(), targetLink: targetLink, details: details }, sched));
      else if (type === 'popupbanner') popupBanners.push(Object.assign({ rowIndex: rIdx, id: data[i][0] ? data[i][0].toString().trim() : '', url: url.toString().trim(), targetLink: targetLink, details: details, title: title, buttonText: buttonText }, sched));
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

// ===== ตั้งค่าระบบ (Settings sheet): allowlist คีย์ + กฎตรวจค่า บังคับฝั่ง server เสมอ (หน้าเว็บตรวจแค่เพื่อ UX) =====
// คีย์ที่เป็นความลับ/ใช้ฝั่ง server เท่านั้น: ห้ามส่งให้ role อื่นผ่าน GET_ALL_DATA และห้ามลง AuditLog เป็นข้อความธรรมดา
// (Admin ยังอ่านค่าจริงได้จาก GET_SETTINGS_LIST เพื่อแสดงในหน้าตั้งค่า) — คีย์ใหม่ที่ชื่อมี webhook/secret/token/password/apikey ถูกซ่อนให้อัตโนมัติ
var SETTING_SECRET_KEY_RE_ = /webhook|secret|token|password|passwd|api[_-]?key|private/i;
var SETTING_SERVER_ONLY_KEYS_ = ['DriveFolderId'];
var BANNER_TYPES_ = ['loginbg', 'herobanner', 'promogrid', 'popupbanner'];

function isSecretSettingKey_(k) { return SETTING_SECRET_KEY_RE_.test(String(k)); }
function publicSettings_(settings) {
  const out = {};
  Object.keys(settings || {}).forEach(k => {
    if (!isSecretSettingKey_(k) && SETTING_SERVER_ONLY_KEYS_.indexOf(k) === -1) out[k] = settings[k];
  });
  return out;
}
function redactSettingsForAudit_(settings) {
  const out = {};
  Object.keys(settings || {}).forEach(k => { out[k] = (isSecretSettingKey_(k) && settings[k]) ? '[redacted]' : settings[k]; });
  return out;
}

// คีย์ที่แก้ได้ผ่าน SAVE_SETTINGS_ITEM(bookingsettings) — คีย์อื่นถูกปฏิเสธ (กันเขียนคีย์มั่ว/ทับคีย์ภายในระบบ)
var SETTING_RULES_ = {
  SystemName:            { label: 'ชื่อเว็บแอป', required: true, max: 80 },
  Currency:              { label: 'สกุลเงิน', max: 10 },
  ReserveStart:          { label: 'วันเริ่มจอง', type: 'datetime', required: true },
  ReserveEnd:            { label: 'วันสิ้นสุดการจอง', type: 'datetime', required: true },
  FlashCampaignTitle:    { label: 'ชื่อแคมเปญ', max: 120 },
  LowStockThreshold:     { label: 'เกณฑ์เตือนสต๊อกต่ำ', type: 'int', required: true, min: 0, max: 9999 },
  WebhookUrl:            { label: 'Webhook URL', type: 'https', max: 500 },
  LineWebhookUrl:        { label: 'LINE Webhook URL', type: 'https', max: 500 },
  DriveFolderId:         { label: 'Drive Folder ID', type: 'drive', max: 300 },
  LogoUrl:               { label: 'โลโก้เว็บแอป', type: 'url', max: 500 },
  InvoiceLogoUrl:        { label: 'โลโก้ใบเสนอราคา', type: 'url', max: 500 },
  ApproverSignatureUrl:  { label: 'ลายเซ็นผู้อนุมัติ', type: 'url', max: 500 },
  InvoiceCompanyName:    { label: 'ชื่อบริษัท', max: 120 },
  InvoiceCompanyAddress: { label: 'ที่อยู่บริษัท', max: 400 },
  InvoiceCompanyEmail:   { label: 'อีเมลบริษัท', type: 'email', max: 120 },
  ApproverName:          { label: 'ชื่อผู้อนุมัติ', max: 120 },
  ContactPhone:          { label: 'เบอร์โทร', type: 'phone' },
  ContactLine:           { label: 'LINE', type: 'line', max: 120 },
  ContactHours:          { label: 'เวลาทำการ', max: 120 }
};

// คืนค่าที่ผ่านการตรวจ/ทำให้เป็นมาตรฐานแล้ว หรือ throw Error ข้อความไทย — current = ค่าที่เก็บอยู่ในชีต (ถ้าไม่เปลี่ยนจากเดิมจะไม่ตรวจซ้ำ
// กันค่าเก่าในระบบจริงที่เก่ากว่ากติกานี้ ทำให้บันทึกช่องอื่นไม่ได้)
function validateSettingValue_(key, raw, current) {
  const rule = SETTING_RULES_[key];
  let v = (raw === null || raw === undefined) ? '' : String(raw).trim();
  if (current !== undefined && v === String(current).trim()) return v;
  const label = rule.label || key;
  if (rule.required && v === '') throw new Error(label + ' ห้ามเว้นว่าง');
  if (rule.max && v.length > rule.max) throw new Error(label + ' ยาวเกินไป (สูงสุด ' + rule.max + ' ตัวอักษร)');
  if (v === '') return v;
  switch (rule.type) {
    case 'datetime':
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v) || isNaN(new Date(v).getTime())) throw new Error(label + ' รูปแบบวันเวลาไม่ถูกต้อง');
      break;
    case 'int':
      if (!/^\d{1,6}$/.test(v) || parseInt(v, 10) < rule.min || parseInt(v, 10) > rule.max) throw new Error(label + ' ต้องเป็นจำนวนเต็ม ' + rule.min + '–' + rule.max);
      break;
    case 'https':
      if (!/^https:\/\/[^\s<>"']+$/i.test(v)) throw new Error(label + ' ต้องเป็นลิงก์ที่ขึ้นต้นด้วย https://');
      break;
    case 'url':
      if (!/^https?:\/\/[^\s<>"']+$/i.test(v)) throw new Error(label + ' ต้องเป็นลิงก์ http(s)');
      break;
    case 'email':
      if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v)) throw new Error(label + ' รูปแบบอีเมลไม่ถูกต้อง');
      break;
    case 'phone':
      if (!/^[0-9+\-\s().#,]{5,40}$/.test(v)) throw new Error(label + ' ใช้ได้เฉพาะตัวเลข เว้นวรรค และเครื่องหมาย + - ( ) . # ,');
      break;
    case 'line':
      if (!(/^https:\/\/[^\s<>"']+$/i.test(v) || /^@?[A-Za-z0-9._-]{2,60}$/.test(v))) throw new Error(label + ' ใส่ LINE ID หรือลิงก์ https:// เท่านั้น');
      break;
    case 'drive': {
      const idMatch = v.match(/folders\/([a-zA-Z0-9_-]+)/);
      if (idMatch && idMatch[1]) v = idMatch[1];
      if (!/^[a-zA-Z0-9_-]{10,100}$/.test(v)) throw new Error(label + ' ไม่ถูกต้อง');
      try {
        DriveApp.getFolderById(v);
      } catch (e) {
        throw new Error("Drive Folder ID ที่ตั้งค่าไว้ไม่ถูกต้อง หรือบัญชีนี้ไม่มีสิทธิ์เข้าถึงโฟลเดอร์นั้น");
      }
      break;
    }
  }
  return v;
}

// ช่องของแบนเนอร์ (UI_Banners): ลิงก์ต้องเป็น http(s) (หรือ #เส้นทางภายใน) — กัน javascript: ที่จะกลายเป็น href คลิกได้บนหน้าร้าน
function validateBannerFields_(f) {
  const lim = (v, max, label) => { if (v.length > max) throw new Error(label + ' ยาวเกินไป (สูงสุด ' + max + ' ตัวอักษร)'); };
  lim(f.url, 1000, 'ลิงก์รูป'); lim(f.targetLink, 1000, 'ลิงก์ปลายทาง'); lim(f.details, 500, 'คำอธิบาย'); lim(f.title, 120, 'หัวข้อ'); lim(f.buttonText, 40, 'ข้อความปุ่ม');
  [['startDate', 'วันที่เริ่มแสดง'], ['endDate', 'วันที่สิ้นสุด']].forEach(p => { if (f[p[0]] && !bannerDateValid_(f[p[0]])) throw new Error(p[1] + 'ไม่ถูกต้อง (ต้องเป็นวันที่จริงรูปแบบ ปปปป-ดด-วว)'); });
  if (f.startDate && f.endDate && f.startDate > f.endDate) throw new Error('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มแสดง');
  if (f.url && !/^https?:\/\/[^\s<>"']+$/i.test(f.url)) throw new Error('ลิงก์รูปต้องขึ้นต้นด้วย http:// หรือ https://');
  if (f.targetLink && !(/^https?:\/\/[^\s<>"']+$/i.test(f.targetLink) || /^#[A-Za-z0-9_-]{1,40}$/.test(f.targetLink))) throw new Error('ลิงก์ปลายทางต้องขึ้นต้นด้วย http:// หรือ https:// (หรือ #ชื่อหน้า)');
}

function saveSettingsItem(payload, secureUser, ss) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (secureUser.Role !== 'Admin') throw new Error("ไม่มีสิทธิ์แก้ไขตั้งค่าระบบ");
    payload = payload || {};
    const type = payload.type;
    if (type !== 'bookingsettings' && BANNER_TYPES_.indexOf(type) === -1) throw new Error("ประเภทการตั้งค่าไม่ถูกต้อง");

    if (type === 'bookingsettings') {
      const sheet = ss.getSheetByName("Settings");
      if (!sheet) throw new Error("Settings sheet not found");
      const settings = payload.settings;
      if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error("รูปแบบข้อมูลตั้งค่าไม่ถูกต้อง");
      const keys = Object.keys(settings);
      if (keys.length === 0 || keys.length > 30) throw new Error("จำนวนรายการตั้งค่าไม่ถูกต้อง");
      const data = sheet.getDataRange().getValues();
      const current = {};
      for (let i = 1; i < data.length; i++) {
        const k = (data[i][0] === null || data[i][0] === undefined) ? '' : data[i][0].toString().trim();
        if (k) current[k] = (data[i][1] === null || data[i][1] === undefined) ? '' : data[i][1].toString();
      }

      // ตรวจทุกคีย์ก่อนเขียนจริง — คีย์ใดไม่ผ่านจะไม่มีคีย์ใดถูกบันทึกเลย (ไม่ให้เขียนค้างครึ่งๆ กลางๆ)
      const clean = {};
      keys.forEach(key => {
        if (!Object.prototype.hasOwnProperty.call(SETTING_RULES_, key)) throw new Error("ไม่รู้จักคีย์ตั้งค่า: " + String(key).slice(0, 40));
        clean[key] = validateSettingValue_(key, settings[key], current[key]);
      });
      const effStart = clean.ReserveStart !== undefined ? clean.ReserveStart : current.ReserveStart;
      const effEnd = clean.ReserveEnd !== undefined ? clean.ReserveEnd : current.ReserveEnd;
      if (effStart && effEnd) {
        const ds = new Date(effStart), de = new Date(effEnd);
        if (!isNaN(ds.getTime()) && !isNaN(de.getTime()) && ds.getTime() >= de.getTime()) throw new Error("วันเวลาเริ่มจองต้องมาก่อนวันเวลาสิ้นสุดการจอง");
      }

      Object.keys(clean).forEach(key => {
        // กัน formula injection (rule 24) — path นี้เป็น key-value generic ครอบข้อความอิสระที่ Admin พิมพ์เอง
        // phone/line ผ่าน whitelist อักขระแล้ว และเซลล์ถูกบังคับเป็นข้อความ (@) — ไม่ต้องเติม ' หน้าค่าที่ขึ้นต้น + หรือ @ (ไม่งั้น "'@mystore" ถูกเก็บจริงในชีต)
        const val = (SETTING_RULES_[key].type === 'phone' || SETTING_RULES_[key].type === 'line') ? clean[key] : sanitizeSheetText_(clean[key]);
        let found = false;
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
          // Remark map ตาม key — path นี้เป็น key-value generic ไม่ได้มีแค่ค่าจองแล้ว
          const remarkMap = { ReserveStart: 'วันเริ่มจองสินค้า', ReserveEnd: 'วันสิ้นสุดจองสินค้า', FlashCampaignTitle: 'ข้อความแคมเปญบนแถบ Pre Booking หน้าร้าน', LowStockThreshold: 'เกณฑ์แจ้งเตือนสต๊อกใกล้หมด (ชิ้น)', WebhookUrl: 'Webhook URL แจ้งเตือนเมื่อมีใบจองใหม่หรือสต๊อกใกล้หมด', DriveFolderId: 'โฟลเดอร์ Drive เก็บรูปอัปโหลด', SystemName: 'ชื่อเว็บแอป (แสดงบนแท็บเบราว์เซอร์/หน้า login/เมนู — ใช้ตอนนำไปสำเนาใช้กับร้าน/แบรนด์อื่น)', LogoUrl: 'โลโก้เว็บแอป (แสดงหน้า login/แถบเมนู/ส่วนท้าย)', InvoiceCompanyName: 'ชื่อบริษัท (ใบเสนอราคา/ใบแจ้งหนี้)', InvoiceCompanyAddress: 'ที่อยู่บริษัท (ใบเสนอราคา/ใบแจ้งหนี้)', InvoiceCompanyEmail: 'อีเมลติดต่อ (ใบเสนอราคา/ใบแจ้งหนี้)', InvoiceLogoUrl: 'โลโก้บริษัท (ใบเสนอราคา/ใบแจ้งหนี้)', ApproverSignatureUrl: 'รูปลายเซ็นผู้อนุมัติ (ประทับเมื่ออนุมัติใบเสนอราคา/ใบแจ้งหนี้)', ApproverName: 'ชื่อผู้อนุมัติ (ประทับเมื่ออนุมัติใบเสนอราคา/ใบแจ้งหนี้)' };
          sheet.getRange(newRow, 2).setNumberFormat('@');
          sheet.getRange(newRow, 1, 1, 3).setValues([[key, val, remarkMap[key] || key]]);
        }
      });
      // AuditLog: ค่าที่เป็นความลับ (Webhook ฯลฯ) ถูกแทนด้วย [redacted]
      logAudit(secureUser.Username, "SETTING_UPDATE", "Updated Booking Settings: " + JSON.stringify(redactSettingsForAudit_(clean)));
      return { status: 'success' };
    }

    // กัน formula injection (rule 24) — banner url/targetLink/details/title/buttonText เป็นข้อความอิสระที่ Admin พิมพ์
    const rawFields = {
      url: payload.url ? payload.url.toString().trim() : "",
      targetLink: payload.targetLink ? payload.targetLink.toString().trim() : "",
      details: payload.details ? payload.details.toString().trim() : "",
      title: payload.title ? payload.title.toString().trim() : "",
      buttonText: payload.buttonText ? payload.buttonText.toString().trim() : "",
      // ตั้งเวลาแสดง (yyyy-MM-dd) — ตรวจรูปแบบ/วันที่จริง/ลำดับใน validateBannerFields_ (ไม่ผ่าน sanitizeSheetText_ เพราะเป็นค่าที่ผ่าน regex เท่านั้น)
      startDate: payload.startDate ? payload.startDate.toString().trim() : "",
      endDate: payload.endDate ? payload.endDate.toString().trim() : ""
    };
    validateBannerFields_(rawFields);
    const url = sanitizeSheetText_(rawFields.url);
    const targetLink = sanitizeSheetText_(rawFields.targetLink);
    const details = sanitizeSheetText_(rawFields.details);
    // Title/Button Text — ใช้เฉพาะ popupbanner เท่านั้น แต่รับ/sanitize ทุก type เพื่อให้ path เดียวกัน
    const title = sanitizeSheetText_(rawFields.title);
    const buttonText = sanitizeSheetText_(rawFields.buttonText);
    const rowIndex = payload.rowIndex;
    const bannersSheet = ss.getSheetByName("UI_Banners");
    if (!bannersSheet) throw new Error("UI_Banners sheet not found. Please click Auto Setup.");
    ensureBannerColumns_(bannersSheet);

    if (type === 'loginbg') {
      const data = bannersSheet.getDataRange().getValues();
      let found = false;
      for (let i = 1; i < data.length; i++) {
        if (data[i][1] === 'loginbg') {
          bannersSheet.getRange(i + 1, 3).setValue(url);
          bannersSheet.getRange(i + 1, 4).setValue('เปิด');
          found = true;
          break;
        }
      }
      if (!found) {
        bannersSheet.appendRow([generateId('BAN'), 'loginbg', url, 'เปิด', '']);
      }
      logAudit(secureUser.Username, "SETTING_UPDATE", "Updated Login BG: " + url);
      return { status: 'success' };
    }

    if (rowIndex) {
      // กัน rowIndex เพี้ยน (ค้างจาก UI เก่า/แถวถูกลบไปแล้ว) เขียนทับ header หรือแถวนอกชีต
      const ri = parseInt(rowIndex, 10);
      if (!Number.isInteger(ri) || ri < 2 || ri > bannersSheet.getLastRow()) throw new Error("ตำแหน่งแถวไม่ถูกต้อง กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง");
      // ยืนยันว่าแถวนี้ยังเป็นแบนเนอร์ใบเดิม (ID + type ตรงกัน) — ถ้ามี Admin อีกคนลบ/แทรกแถวไปก่อน เลขแถวจะเลื่อน
      // และการเขียนทับจะไปโดนแบนเนอร์ใบอื่น (ตอนลบมีเช็คนี้อยู่แล้ว ตอนแก้เดิมไม่มี)
      const head = bannersSheet.getRange(ri, 1, 1, 2).getValues()[0];
      const idAtRow = (head[0] === null || head[0] === undefined) ? '' : head[0].toString().trim();
      const typeAtRow = (head[1] === null || head[1] === undefined) ? '' : head[1].toString().trim();
      const bid = payload.bannerId ? payload.bannerId.toString().trim() : '';
      if (typeAtRow !== type || (idAtRow && idAtRow !== bid)) throw new Error("ข้อมูลแบนเนอร์เปลี่ยนไปแล้ว (อาจมีผู้ดูแลคนอื่นแก้ไข/ลบ) กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง");
      bannersSheet.getRange(ri, 3).setValue(url);
      bannersSheet.getRange(ri, 4).setValue('เปิด');
      bannersSheet.getRange(ri, 5).setValue(targetLink);
      bannersSheet.getRange(ri, 6).setValue(details);
      bannersSheet.getRange(ri, 7).setValue(title);
      bannersSheet.getRange(ri, 8).setValue(buttonText);
      writeBannerDates_(bannersSheet, ri, rawFields.startDate, rawFields.endDate);
      logAudit(secureUser.Username, "SETTING_UPDATE", "Updated Setting " + type + " at row " + ri + ": " + url);
    } else {
      bannersSheet.appendRow([generateId('BAN'), type, url, 'เปิด', targetLink, details, title, buttonText]);
      writeBannerDates_(bannersSheet, bannersSheet.getLastRow(), rawFields.startDate, rawFields.endDate);
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
// ประวัติการเปลี่ยนสถานะออเดอร์ (ชีตแยก — ไม่แตะ Orders ที่เขียนแบบ positional) สร้างเองอัตโนมัติเมื่อมีการเขียนครั้งแรก
var ORDER_STATUS_LOG_HEADERS_ = ["OrderID", "Timestamp", "From", "To", "By"];

function ensureOrderStatusLog_(ss) {
  let sheet = ss.getSheetByName("OrderStatusLog");
  if (!sheet) {
    sheet = ss.insertSheet("OrderStatusLog");
    sheet.appendRow(ORDER_STATUS_LOG_HEADERS_);
    try { sheet.setFrozenRows(1); } catch (e) {}
  }
  return sheet;
}

// เขียนประวัติ 1 บรรทัด — ห้ามให้ความล้มเหลวของ log ไปทำให้การจอง/แก้ไขออเดอร์ล้ม (ครอบ try/catch ไว้เสมอ)
function logOrderStatus_(ss, orderId, fromStatus, toStatus, by) {
  try {
    const sheet = ensureOrderStatusLog_(ss);
    const ts = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd HH:mm");
    sheet.appendRow([sanitizeSheetText_(String(orderId)), "'" + ts, sanitizeSheetText_(String(fromStatus || '')), sanitizeSheetText_(String(toStatus || '')), sanitizeSheetText_(String(by || ''))]);
  } catch (e) {}
}

// คืนประวัติสถานะของออเดอร์ เรียงเก่า→ใหม่ — includeBy=false สำหรับหน้า public (ไม่เปิดเผยชื่อพนักงาน)
function getOrderStatusHistory_(ss, orderId, includeBy) {
  try {
    const sheet = ss.getSheetByName("OrderStatusLog");
    if (!sheet) return [];
    const data = sheet.getDataRange().getDisplayValues();
    const out = [];
    for (let i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() !== orderId) continue;
      const item = { time: (data[i][1] || '').toString().replace(/^'/, ''), from: data[i][2] || '', to: data[i][3] || '' };
      if (includeBy) item.by = data[i][4] || '';
      out.push(item);
    }
    return out;
  } catch (e) { return []; }
}

var ORDERS_HEADERS_ = [
  "OrderID", "Timestamp", "Channel", "Branch Code", "Customer Name", "Contact Number", "Email", "ID Card_Passport", "Code Handraiser",
  "SKU", "Product Name", "Qty", "Unit Price", "Promo", "Reservation Status", "Staff", "Booking Phone",
  "Customer Interests", "Remark", "Row Total", "Order Status", "Receipt No", "Deposit", "Client Request ID", "Pre Order No", "Pickup Date"
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
      "Invoice Date": sanitizeSheetText_(d.invoiceDate || ''),
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

// ===== ข่าวสาร (ชีต News + NewsCategories) — จัดการจากเมนู "จัดการข่าวสาร" (Admin เท่านั้น) =====
// News อ่าน/เขียนตามตำแหน่งคอลัมน์ (เหมือน Orders/UI_Banners) — ห้ามแทรกกลาง เพิ่มคอลัมน์ใหม่ต่อท้ายและขยาย NEWS_HEADERS_ เท่านั้น
// ชีตถูกสร้างเองครั้งแรกที่ Admin เปิดหน้าจัดการ (ensureNewsSheets_) — หน้าร้านอ่านผ่าน getLiveNews_ ซึ่งไม่สร้างชีต
var NEWS_HEADERS_ = ['News ID', 'Category', 'Title', 'Detail', 'Image URL', 'Link', 'Seq', 'Status', 'Start Date', 'End Date', 'Created At', 'Created By', 'Updated At', 'Updated By'];
var NEWS_CAT_HEADERS_ = ['Category ID', 'Category Name', 'Status'];
var NEWS_MAX_ROWS_ = 3000;
var NEWS_DELETE_MAX_ = 200;

function ensureNewsSheets_(ss) {
  [['News', NEWS_HEADERS_, [1, 9, 10, 11, 13]], ['NewsCategories', NEWS_CAT_HEADERS_, [1]]].forEach(function(p) {
    let sh = ss.getSheetByName(p[0]);
    if (!sh) sh = ss.insertSheet(p[0]);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, p[1].length).setValues([p[1]]);
      sh.setFrozenRows(1);
      // ID / วันที่ เป็นข้อความ — กัน Sheets แปลงเป็น Date/ตัวเลขเอง
      p[2].forEach(function(c) { sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@'); });
    } else {
      const cur = sh.getRange(1, 1, 1, p[1].length).getValues()[0].map(function(h) { return String(h).trim(); });
      if (cur.join('|') !== p[1].join('|')) throw new Error('หัวคอลัมน์ชีต ' + p[0] + ' ไม่ตรงกับที่ระบบกำหนด — แก้ให้ตรงหรือเปลี่ยนชื่อชีตเดิมก่อน');
      if (p[0] === 'NewsCategories' || p[0] === 'News') migrateStatusColumn_(sh, 'Status'); // ค่าเก่า Active/Inactive → เปิด/ปิด
    }
  });
}

function newsStr_(v) { return (v === null || v === undefined) ? '' : String(v); }

// สถานะเปิด/ปิด ของ NewsCategories และ AutoPromotions — ค่าที่เก็บคือ 'เปิด'/'ปิด' (เหมือนตารางอื่น); ยังอ่านค่าเก่า Active/Inactive ได้
function statusOn_(v) { const t = newsStr_(v).trim().toLowerCase(); return t === 'เปิด' || t === 'active'; }
function statusOff_(v) { const t = newsStr_(v).trim().toLowerCase(); return t === 'ปิด' || t === 'inactive'; }
// ค่าจาก payload → 'เปิด'/'ปิด' (ว่าง = เปิด); ค่าอื่น = null (ไม่ถูกต้อง)
function statusFromInput_(v) {
  const t = newsStr_(v).trim();
  if (t === '') return 'เปิด';
  if (statusOn_(t)) return 'เปิด';
  if (statusOff_(t)) return 'ปิด';
  return null;
}
// แปลงค่าเก่า Active/Inactive ในคอลัมน์ที่กำหนดเป็น เปิด/ปิด (idempotent — เขียนเฉพาะเมื่อมีค่าที่ต้องแก้)
function migrateStatusColumn_(sheet, headerName) {
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(h) { return String(h).trim(); });
  const ci = headers.indexOf(headerName);
  if (ci === -1) return 0;
  const rng = sheet.getRange(2, ci + 1, sheet.getLastRow() - 1, 1);
  const vals = rng.getValues();
  let changed = 0;
  vals.forEach(function(r) {
    const t = newsStr_(r[0]).trim();
    if (t.toLowerCase() === 'active') { r[0] = 'เปิด'; changed++; }
    else if (t.toLowerCase() === 'inactive') { r[0] = 'ปิด'; changed++; }
  });
  if (changed > 0) rng.setValues(vals);
  return changed;
}

function newsRowToObj_(r) {
  const start = bannerDateStr_(r[8]), end = bannerDateStr_(r[9]);
  const seq = parseInt(r[6], 10);
  return {
    id: newsStr_(r[0]).trim(), category: newsStr_(r[1]), title: newsStr_(r[2]), detail: newsStr_(r[3]),
    imageUrl: newsStr_(r[4]), link: newsStr_(r[5]), seq: isNaN(seq) ? 0 : seq,
    status: statusOff_(r[7]) ? 'ปิด' : 'เปิด',
    startDate: start, endDate: end, schedule: bannerScheduleState_(start, end),
    createdAt: newsStr_(r[10]), createdBy: newsStr_(r[11]), updatedAt: newsStr_(r[12]), updatedBy: newsStr_(r[13])
  };
}

function newsSort_(a, b) {
  if (a.seq !== b.seq) return a.seq - b.seq;
  return a.createdAt < b.createdAt ? 1 : (a.createdAt > b.createdAt ? -1 : 0);
}

// หน้าร้าน: เฉพาะข่าวที่เปิดใช้งานและอยู่ในช่วงเวลา — ไม่ส่งข้อมูลผู้สร้าง/ผู้แก้ไข ไม่สร้างชีต
function getLiveNews_(ss) {
  const sh = ss.getSheetByName('News');
  if (!sh || sh.getLastRow() < 2) return [];
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, NEWS_HEADERS_.length).getValues();
  return rows.map(newsRowToObj_)
    .filter(function(n) { return n.id && n.title && n.status === 'เปิด' && n.schedule === 'live'; })
    .sort(newsSort_).slice(0, 30)
    .map(function(n) { return { id: n.id, category: n.category, title: n.title, detail: n.detail.slice(0, 600), imageUrl: n.imageUrl, link: n.link, startDate: n.startDate, endDate: n.endDate }; });
}

function newsList(secureUser, ss) {
  if (secureUser.Role !== 'Admin') return { status: 'error', message: 'Permission Denied: Admin only' };
  ensureNewsSheets_(ss);
  const nsh = ss.getSheetByName('News'), csh = ss.getSheetByName('NewsCategories');
  const news = nsh.getLastRow() < 2 ? [] : nsh.getRange(2, 1, nsh.getLastRow() - 1, NEWS_HEADERS_.length).getValues().map(newsRowToObj_).filter(function(n) { return n.id; }).sort(newsSort_);
  const cats = csh.getLastRow() < 2 ? [] : csh.getRange(2, 1, csh.getLastRow() - 1, 3).getValues()
    .map(function(r) { return { id: newsStr_(r[0]).trim(), name: newsStr_(r[1]), status: statusOff_(r[2]) ? 'ปิด' : 'เปิด' }; })
    .filter(function(c) { return c.id; });
  const used = {};
  news.forEach(function(n) { used[n.category] = (used[n.category] || 0) + 1; });
  cats.forEach(function(c) { c.used = used[c.name] || 0; });
  return { status: 'success', data: { news: news, categories: cats } };
}

function newsLinkOk_(v) { return /^https?:\/\/[^\s<>"']+$/i.test(v) || /^#[A-Za-z0-9_-]{1,40}$/.test(v); }

function saveNews(payload, secureUser, ss) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (secureUser.Role !== 'Admin') throw new Error('ไม่มีสิทธิ์จัดการข่าวสาร');
    payload = payload || {};
    ensureNewsSheets_(ss);
    const t = function(v) { return (v === null || v === undefined) ? '' : String(v).trim(); };
    const f = { id: t(payload.id), category: t(payload.category), title: t(payload.title), detail: t(payload.detail), imageUrl: t(payload.imageUrl), link: t(payload.link), status: statusFromInput_(payload.status), startDate: t(payload.startDate), endDate: t(payload.endDate) };
    if (!f.title) throw new Error('กรุณากรอกหัวข้อ');
    if (f.title.length > 150) throw new Error('หัวข้อยาวเกินไป (สูงสุด 150 ตัวอักษร)');
    if (f.detail.length > 5000) throw new Error('รายละเอียดยาวเกินไป (สูงสุด 5000 ตัวอักษร)');
    if (f.imageUrl.length > 1000 || f.link.length > 1000) throw new Error('ลิงก์ยาวเกินไป');
    if (f.imageUrl && !/^https?:\/\/[^\s<>"']+$/i.test(f.imageUrl)) throw new Error('ลิงก์รูปต้องขึ้นต้นด้วย http:// หรือ https://');
    if (f.link && !newsLinkOk_(f.link)) throw new Error('ลิงก์ปลายทางต้องขึ้นต้นด้วย http:// https:// หรือเป็น #เส้นทางในระบบ');
    if (f.status === null) throw new Error('สถานะไม่ถูกต้อง');
    [['startDate', 'วันที่เริ่ม'], ['endDate', 'วันที่สิ้นสุด']].forEach(function(p) { if (f[p[0]] && !bannerDateValid_(f[p[0]])) throw new Error(p[1] + 'ไม่ถูกต้อง (รูปแบบ ปปปป-ดด-วว)'); });
    if (f.startDate && f.endDate && f.startDate > f.endDate) throw new Error('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม');
    const seq = payload.seq === undefined || payload.seq === '' || payload.seq === null ? 0 : Number(payload.seq);
    if (!Number.isInteger(seq) || seq < 0 || seq > 9999) throw new Error('ลำดับต้องเป็นจำนวนเต็ม 0-9999');
    if (!f.category) throw new Error('กรุณาเลือกหมวดหมู่');
    const csh = ss.getSheetByName('NewsCategories');
    const catNames = csh.getLastRow() < 2 ? [] : csh.getRange(2, 2, csh.getLastRow() - 1, 1).getValues().map(function(r) { return newsStr_(r[0]); });
    if (catNames.indexOf(f.category) === -1) throw new Error('ไม่พบหมวดหมู่นี้ในระบบ — สร้างหมวดหมู่ก่อน');

    const sh = ss.getSheetByName('News');
    const now = Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd HH:mm');
    const clean = [sanitizeSheetText_(f.category), sanitizeSheetText_(f.title), sanitizeSheetText_(f.detail), sanitizeSheetText_(f.imageUrl), sanitizeSheetText_(f.link)];
    const last = sh.getLastRow();
    if (f.id) {
      const ids = last < 2 ? [] : sh.getRange(2, 1, last - 1, 1).getValues().map(function(r) { return newsStr_(r[0]).trim(); });
      const idx = ids.indexOf(f.id);
      if (idx === -1) throw new Error('ไม่พบข่าวนี้ (อาจถูกลบไปแล้ว) กรุณาโหลดหน้าใหม่');
      const row = idx + 2;
      sh.getRange(row, 2, 1, 5).setValues([clean]);
      sh.getRange(row, 7, 1, 2).setValues([[seq, f.status]]);
      sh.getRange(row, 9, 1, 2).setNumberFormat('@').setValues([[f.startDate, f.endDate]]);
      sh.getRange(row, 13, 1, 2).setNumberFormat('@').setValues([[now, secureUser.Username]]);
      logAudit(secureUser.Username, 'NEWS_UPDATE', 'Updated news ' + f.id + ': ' + f.title.slice(0, 80));
      return { status: 'success', id: f.id };
    }
    if (last - 1 >= NEWS_MAX_ROWS_) throw new Error('จำนวนข่าวถึงขีดจำกัด (' + NEWS_MAX_ROWS_ + ') — ลบข่าวเก่าก่อน');
    const id = generateId('NEWS');
    const row = last + 1;
    sh.getRange(row, 1, 1, 14).setNumberFormat('@');
    sh.getRange(row, 1, 1, 14).setValues([[id, clean[0], clean[1], clean[2], clean[3], clean[4], seq, f.status, f.startDate, f.endDate, now, secureUser.Username, '', '']]);
    sh.getRange(row, 7).setNumberFormat('0');
    logAudit(secureUser.Username, 'NEWS_INSERT', 'Added news ' + id + ': ' + f.title.slice(0, 80));
    return { status: 'success', id: id };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function newsIdList_(payload) {
  const ids = payload && Array.isArray(payload.ids) ? payload.ids.map(function(v) { return String(v).trim(); }).filter(Boolean) : [];
  if (ids.length === 0) throw new Error('ไม่ได้เลือกรายการ');
  if (ids.length > NEWS_DELETE_MAX_) throw new Error('ลบได้ครั้งละไม่เกิน ' + NEWS_DELETE_MAX_ + ' รายการ');
  return ids;
}

function deleteNews(payload, secureUser, ss) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (secureUser.Role !== 'Admin') throw new Error('ไม่มีสิทธิ์จัดการข่าวสาร');
    const ids = newsIdList_(payload);
    ensureNewsSheets_(ss);
    const sh = ss.getSheetByName('News');
    const last = sh.getLastRow();
    let deleted = 0;
    if (last >= 2) {
      const have = sh.getRange(2, 1, last - 1, 1).getValues().map(function(r) { return newsStr_(r[0]).trim(); });
      for (let i = have.length - 1; i >= 0; i--) { // ลบจากล่างขึ้นบน แถวไม่เลื่อน
        if (ids.indexOf(have[i]) !== -1) { sh.deleteRow(i + 2); deleted++; }
      }
    }
    logAudit(secureUser.Username, 'NEWS_DELETE', 'Deleted ' + deleted + ' news: ' + ids.slice(0, 10).join(','));
    return { status: 'success', deleted: deleted };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function setNewsSeq(payload, secureUser, ss) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (secureUser.Role !== 'Admin') throw new Error('ไม่มีสิทธิ์จัดการข่าวสาร');
    ensureNewsSheets_(ss);
    const id = payload && payload.id ? String(payload.id).trim() : '';
    const seq = Number(payload && payload.seq);
    if (!id) throw new Error('ไม่พบรหัสข่าว');
    if (!Number.isInteger(seq) || seq < 0 || seq > 9999) throw new Error('ลำดับต้องเป็นจำนวนเต็ม 0-9999');
    const sh = ss.getSheetByName('News');
    const last = sh.getLastRow();
    const have = last < 2 ? [] : sh.getRange(2, 1, last - 1, 1).getValues().map(function(r) { return newsStr_(r[0]).trim(); });
    const idx = have.indexOf(id);
    if (idx === -1) throw new Error('ไม่พบข่าวนี้ (อาจถูกลบไปแล้ว)');
    sh.getRange(idx + 2, 7).setNumberFormat('0').setValue(seq);
    return { status: 'success' };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function saveNewsCategory(payload, secureUser, ss) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (secureUser.Role !== 'Admin') throw new Error('ไม่มีสิทธิ์จัดการข่าวสาร');
    payload = payload || {};
    ensureNewsSheets_(ss);
    const id = payload.id ? String(payload.id).trim() : '';
    const name = payload.name ? String(payload.name).trim() : '';
    const status = statusFromInput_(payload.status);
    if (!name) throw new Error('กรุณากรอกชื่อหมวดหมู่');
    if (name.length > 60) throw new Error('ชื่อหมวดหมู่ยาวเกินไป (สูงสุด 60 ตัวอักษร)');
    if (status === null) throw new Error('สถานะไม่ถูกต้อง');
    const sh = ss.getSheetByName('NewsCategories');
    const last = sh.getLastRow();
    const rows = last < 2 ? [] : sh.getRange(2, 1, last - 1, 3).getValues();
    const clean = sanitizeSheetText_(name);
    let at = -1;
    rows.forEach(function(r, i) {
      if (newsStr_(r[0]).trim() === id && id) at = i;
      else if (newsStr_(r[1]).trim().toLowerCase() === name.toLowerCase()) throw new Error('มีหมวดหมู่ชื่อนี้อยู่แล้ว');
    });
    if (id && at === -1) throw new Error('ไม่พบหมวดหมู่นี้ (อาจถูกลบไปแล้ว)');
    if (at === -1) {
      const newId = generateId('NCAT');
      const row = last + 1;
      sh.getRange(row, 1, 1, 3).setNumberFormat('@').setValues([[newId, clean, status]]);
      logAudit(secureUser.Username, 'NEWS_CAT_INSERT', 'Added news category: ' + name);
      return { status: 'success', id: newId };
    }
    const oldName = newsStr_(rows[at][1]);
    sh.getRange(at + 2, 2, 1, 2).setValues([[clean, status]]);
    if (oldName !== clean) { // เปลี่ยนชื่อหมวด → ข่าวที่อยู่ในหมวดนี้ตามไปด้วย
      const nsh = ss.getSheetByName('News');
      const nl = nsh.getLastRow();
      if (nl >= 2) {
        const cats = nsh.getRange(2, 2, nl - 1, 1).getValues();
        let changed = false;
        const out = cats.map(function(r) { if (newsStr_(r[0]) === oldName) { changed = true; return [clean]; } return r; });
        if (changed) nsh.getRange(2, 2, nl - 1, 1).setValues(out);
      }
    }
    logAudit(secureUser.Username, 'NEWS_CAT_UPDATE', 'Updated news category: ' + oldName + ' -> ' + name);
    return { status: 'success', id: id };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function deleteNewsCategories(payload, secureUser, ss) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (secureUser.Role !== 'Admin') throw new Error('ไม่มีสิทธิ์จัดการข่าวสาร');
    const ids = newsIdList_(payload);
    ensureNewsSheets_(ss);
    const csh = ss.getSheetByName('NewsCategories'), nsh = ss.getSheetByName('News');
    const cl = csh.getLastRow();
    const rows = cl < 2 ? [] : csh.getRange(2, 1, cl - 1, 3).getValues();
    const nl = nsh.getLastRow();
    const used = nl < 2 ? [] : nsh.getRange(2, 2, nl - 1, 1).getValues().map(function(r) { return newsStr_(r[0]); });
    const blocked = [];
    rows.forEach(function(r) { if (ids.indexOf(newsStr_(r[0]).trim()) !== -1 && used.indexOf(newsStr_(r[1])) !== -1) blocked.push(newsStr_(r[1])); });
    if (blocked.length) throw new Error('ลบไม่ได้ — ยังมีข่าวอยู่ในหมวด: ' + blocked.slice(0, 5).join(', ') + ' (ย้ายหรือลบข่าวก่อน)');
    let deleted = 0;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (ids.indexOf(newsStr_(rows[i][0]).trim()) !== -1) { csh.deleteRow(i + 2); deleted++; }
    }
    logAudit(secureUser.Username, 'NEWS_CAT_DELETE', 'Deleted ' + deleted + ' news categories');
    return { status: 'success', deleted: deleted };
  } catch (e) {
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
    let rowIndex = parseInt(payload.rowIndex);
    const bannerId = payload.bannerId ? payload.bannerId.toString().trim() : '';
    // เดิมเช็คแค่ขอบล่าง (saveSettingsItem เช็คทั้งขอบบน-ล่างอยู่แล้ว) — rowIndex ที่เกิน lastRow ยังหลุดผ่านมาถึง deleteRow() ได้ถ้าไม่มี bannerId แนบมา
    if (!rowIndex || rowIndex < 2 || rowIndex > bannersSheet.getLastRow()) throw new Error("Invalid row index");

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

    // ยืนยัน type ของแถวที่จะลบตรงกับที่หน้าเว็บส่งมา (กันลบผิดใบเมื่อชีตขยับ แม้ไม่มี bannerId)
    if (BANNER_TYPES_.indexOf(type) === -1) throw new Error("ประเภทการตั้งค่าไม่ถูกต้อง");
    const rowType = (bannersSheet.getRange(rowIndex, 2).getValue() || '').toString().trim();
    if (rowType !== type) throw new Error("ข้อมูลแบนเนอร์เปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง");
    bannersSheet.deleteRow(rowIndex);
    logAudit(secureUser.Username, "SETTING_DELETE", "Deleted Setting " + type + " at row " + rowIndex);
    return { status: 'success' };
  } catch(e) {
    return { status: 'error', message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}
