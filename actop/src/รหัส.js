/**
 * ACT SAMSUNG Management System V6.8 (Strict Model Mapping)
 * Architecture: Google Apps Script Web App (MVC Model + BI Analytics)
 * Author: Enterprise AI Business Commander
 */

const ADMIN_PIN = "9999";
const PASSWORD_EXPIRY_DAYS = 40;
const SESSION_MAX_AGE_DAYS = 30; // token ที่หลุด/ถูกขโมยจะใช้ได้สูงสุดตามนี้ก่อนถูกบังคับ login ใหม่
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MINUTES = 15;
const EXPORT_PIN_MAX_ATTEMPTS = 5;
const EXPORT_PIN_LOCKOUT_MINUTES = 15;

// สิทธิ์บัญชีสาขา: ทั่วไป = คีย์ข้อมูลได้ตามปกติ, พิเศษ = ดูข้อมูล/แดชบอร์ดได้แต่คีย์ฟอร์ม/เปลี่ยนสถานะไม่ได้
const ROLE_NORMAL = "ทั่วไป";
const ROLE_VIEWER = "พิเศษ";

function doGet(e) {
  let template = HtmlService.createTemplateFromFile('Index');
  return template.evaluate()
    .setTitle('ACT OPPO System')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ================= SMART SHEET DISCOVERY =================
function findSheet(ss, keyword) {
  const sheets = ss.getSheets();
  const lowerKeyword = keyword.toLowerCase();
  for (let s of sheets) {
    if (s.getName().toLowerCase().indexOf(lowerKeyword) !== -1) {
      return s;
    }
  }
  return null;
}

// ================= AUTH / SESSION LAYER =================
function getUsersSheet_(ss) {
  return findSheet(ss, "users");
}

function getSessionsSheet_(ss) {
  return findSheet(ss, "sessions");
}

function getAccessLogSheet_(ss) {
  return findSheet(ss, "accesslog");
}

function getTransferSheet_(ss) {
  return findSheet(ss, "transferrequests");
}

// ชื่อชีตตั้งใจไม่ให้มีคำว่า "transferrequests" ต่อท้าย เพื่อไม่ให้ findSheet ของ getTransferSheet_() ด้านบนจับชีตนี้ไปโดยไม่ตั้งใจ (substring match)
function getActTransferSheet_(ss) {
  return findSheet(ss, "actrecordtransfer");
}

// ตัดขั้นตอนอนุมัติออกแล้ว: สร้างคำขอ = โอนออกจากต้นทางทันที รอแค่ปลายทางกด "รับเข้า" เพื่อยืนยัน
const TRANSFER_STATUS_PENDING = "รอรับเข้า";
const TRANSFER_STATUS_RECEIVED = "รับเข้าแล้ว";
const TRANSFER_STATUS_CANCELLED = "ยกเลิก";

// บันทึกประวัติการเข้าใช้งาน (login สำเร็จ / เปลี่ยนสถานะสินค้า) ลงชีต AccessLog
// ล้มเหลวแบบเงียบถ้าไม่พบชีต เพื่อไม่ให้การ log ไปบล็อก flow หลัก (login/updateStatus)
function logAccess_(ss, locCode, locName, role, action, detail) {
  const sheet = getAccessLogSheet_(ss);
  if (!sheet) return;
  sheet.appendRow([
    "'" + Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy HH:mm:ss"),
    locCode || "",
    locName || "",
    role || "",
    action || "",
    detail || ""
  ]);
}

function parseDdMmYyyy_(str) {
  const parts = (str || "").toString().trim().split(/[-/]/);
  if (parts.length !== 3) return null;
  const d = new Date(parts[2], parts[1] - 1, parts[0]);
  return isNaN(d.getTime()) ? null : d;
}

// แปลง "dd/MM/yyyy HH:mm:ss" (รูปแบบที่ Sessions/AdminAuth เก็บ CreatedAt) เป็น Date object — ใช้เช็คอายุ session
function parseDdMmYyyyHms_(str) {
  const s = (str || "").toString().trim();
  const dateParts = s.split(' ')[0].split(/[-/]/);
  if (dateParts.length !== 3) return null;
  const timeParts = (s.split(' ')[1] || "00:00:00").split(':');
  const d = new Date(Number(dateParts[2]), Number(dateParts[1]) - 1, Number(dateParts[0]),
    Number(timeParts[0] || 0), Number(timeParts[1] || 0), Number(timeParts[2] || 0));
  return isNaN(d.getTime()) ? null : d;
}

// กันการเดารหัสผ่านซ้ำๆ (brute-force): นับจำนวนครั้งที่ login ผิดต่อ locCode ผ่าน CacheService (หมดอายุอัตโนมัติตาม TTL)
// key แยกด้วย prefix กันชนกับ cache key อื่นที่อาจใช้ในอนาคต
function getFailCount_(prefix, key) {
  const val = CacheService.getScriptCache().get(prefix + key);
  return val ? Number(val) : 0;
}
function incrementFailCount_(prefix, key, lockoutMinutes) {
  const cache = CacheService.getScriptCache();
  const count = getFailCount_(prefix, key) + 1;
  cache.put(prefix + key, String(count), lockoutMinutes * 60);
  return count;
}
function clearFailCount_(prefix, key) {
  CacheService.getScriptCache().remove(prefix + key);
}

function hashPassword_(password, salt) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + salt, Utilities.Charset.UTF_8);
  return bytes.map(function(b) { return (b < 0 ? b + 256 : b).toString(16).padStart(2, '0'); }).join('');
}

function getLocNameByCode_(ss, locCode) {
  const locSheet = findSheet(ss, "location");
  if (!locSheet || locSheet.getLastRow() <= 1) return "";
  const locData = locSheet.getRange(2, 1, locSheet.getLastRow() - 1, 5).getDisplayValues();
  for (let i = 0; i < locData.length; i++) {
    if ((locData[i][3] || "").toString().trim() === locCode) return locData[i][4];
  }
  return "";
}

// รายชื่อ LocCode ทั้งหมดที่มีบัญชี Active อยู่ในชีต Users จริง — ใช้จำกัดตัวเลือกปลายทางของฟีเจอร์โอนย้ายสต๊อก
// ให้เลือกได้เฉพาะสาขาที่มีบัญชีสำหรับ login เข้ามา "รับเข้า" ได้จริงเท่านั้น (บัญชีถูกระงับแล้วไม่นับ)
function getUsersLocCodes_(ss) {
  const usersSheet = getUsersSheet_(ss);
  if (!usersSheet || usersSheet.getLastRow() <= 1) return [];
  const data = usersSheet.getRange(2, 1, usersSheet.getLastRow() - 1, 5).getDisplayValues();
  const codes = [];
  data.forEach(function(r) {
    const code = (r[0] || "").toString().trim();
    const active = (r[4] || "").toString().trim().toUpperCase();
    if (code && (active === "TRUE" || active === "Y") && codes.indexOf(code) === -1) codes.push(code);
  });
  return codes;
}

// อ่านสถานะ+Role ของสาขาสดจากชีต Users ทุกครั้ง (ไม่ cache ไว้ใน Sessions) เพื่อให้ admin เปลี่ยนสิทธิ์/ปิดใช้งาน
// แล้วมีผลทันทีกับ session ที่ล็อกอินค้างอยู่ โดยไม่ต้องรอให้ผู้ใช้ login ใหม่ — คืน null ถ้าไม่พบแถวนี้แล้ว (เช่นถูกลบตรงจากชีต)
function getUserRecord_(ss, locCode) {
  const usersSheet = getUsersSheet_(ss);
  if (!usersSheet || usersSheet.getLastRow() <= 1) return null;
  const data = usersSheet.getRange(2, 1, usersSheet.getLastRow() - 1, 6).getDisplayValues();
  for (let i = 0; i < data.length; i++) {
    if ((data[i][0] || "").toString().trim() === locCode) {
      const active = (data[i][4] || "").toString().trim().toUpperCase();
      return {
        role: (data[i][5] || "").toString().trim() || ROLE_NORMAL,
        active: active === "TRUE" || active === "Y"
      };
    }
  }
  return null;
}

function resolveSession_(token) {
  if (!token) return null;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSessionsSheet_(ss);
  if (!sheet || sheet.getLastRow() <= 1) return null;
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getDisplayValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === token) {
      // เช็คอายุ session ก่อนทุกอย่าง — token ที่หลุด/ถูกขโมยจะใช้ได้ไม่เกิน SESSION_MAX_AGE_DAYS แล้วบังคับ login ใหม่
      const createdAt = parseDdMmYyyyHms_(data[i][2]);
      if (createdAt) {
        const ageDays = (new Date().getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays > SESSION_MAX_AGE_DAYS) return null;
      }

      const locCode = (data[i][1] || "").toString().trim();
      if (locCode === ADMIN_SESSION_LOCCODE) return { locCode: locCode, role: "admin" };

      // ตรวจสถานะ Active สดทุกครั้ง (ไม่ใช่แค่ตอน login) — ถ้าแถวถูกลบหรือปิดใช้งานตรงจากชีต ให้ session เดิมใช้ต่อไม่ได้
      const userRecord = getUserRecord_(ss, locCode);
      if (!userRecord || !userRecord.active) return null;
      return { locCode: locCode, role: userRecord.role };
    }
  }
  return null;
}

function requireSession_(token) {
  const session = resolveSession_(token);
  if (!session) throw new Error("AUTH_REQUIRED");
  return session;
}

// ================= ADMIN AUTH (แยกต่างหากจากระบบ login สาขา ใช้เฉพาะ "ตั้งค่าระบบ") =================
function getAdminsSheet_(ss) {
  return findSheet(ss, "admins");
}

function getAdminAuthSheet_(ss) {
  return findSheet(ss, "adminauth");
}

function resolveAdminSession_(token) {
  if (!token) return null;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getAdminAuthSheet_(ss);
  if (!sheet || sheet.getLastRow() <= 1) return null;
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getDisplayValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === token) {
      // token admin มีสิทธิ์สูง เช็คอายุเหมือน session สาขาปกติ ป้องกัน token หลุด/ถูกขโมยใช้ได้ตลอดไป
      const createdAt = parseDdMmYyyyHms_(data[i][2]);
      if (createdAt) {
        const ageDays = (new Date().getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays > SESSION_MAX_AGE_DAYS) return null;
      }
      return { username: (data[i][1] || "").toString().trim() };
    }
  }
  return null;
}

function requireAdminSession_(token) {
  const session = resolveAdminSession_(token);
  if (!session) throw new Error("ADMIN_AUTH_REQUIRED");
  return session;
}

// รันเองจาก Apps Script editor หรือ `clasp run adminBootstrapAccount --params '["username","password"]'` เท่านั้น
// ใช้สร้าง/รีเซ็ตรหัสผ่านบัญชี Admin คนแรก (ไม่มีปุ่มเรียกจากหน้าเว็บ)
function adminBootstrapAccount(username, password) {
  username = (username || "").toString().trim();
  password = (password || "").toString();
  if (!username || password.length < 4) throw new Error("ต้องระบุ username และรหัสผ่านอย่างน้อย 4 ตัวอักษร");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const adminsSheet = getAdminsSheet_(ss);
  if (!adminsSheet) throw new Error("ไม่พบชีต Admins — รัน setupAuthSheets() ก่อน");

  const salt = Utilities.getUuid();
  const hash = hashPassword_(password, salt);
  const existing = adminsSheet.getLastRow() > 1
    ? adminsSheet.getRange(2, 1, adminsSheet.getLastRow() - 1, 1).getDisplayValues().map(function(r) { return (r[0] || "").toString().trim(); })
    : [];
  const idx = existing.indexOf(username);

  if (idx !== -1) {
    adminsSheet.getRange(idx + 2, 2, 1, 2).setValues([[hash, salt]]);
  } else {
    adminsSheet.appendRow([username, hash, salt]);
  }
  return "สร้าง/รีเซ็ตบัญชี Admin: " + username + " สำเร็จ";
}

// LocCode สงวนไว้แทนบัญชี Admin ที่ login ผ่านหน้าแรกร่วมกับสาขา (ไม่ใช่ LocCode สาขาจริง)
const ADMIN_SESSION_LOCCODE = "__ADMIN__";

function login(locCode, password) {
  locCode = (locCode || "").toString().trim();
  password = (password || "").toString();
  if (!locCode || !password) return { success: false, message: "กรุณากรอกรหัสสาขาและรหัสผ่าน" };

  // กันการเดารหัสผ่านซ้ำๆ (brute-force) — ล็อกชั่วคราวถ้าลองผิดติดกันเกินกำหนดภายในหน้าต่างเวลาที่ตั้งไว้
  if (getFailCount_('loginfail_', locCode) >= LOGIN_MAX_ATTEMPTS) {
    return { success: false, message: `พยายามเข้าสู่ระบบผิดเกินกำหนด กรุณารออีก ${LOGIN_LOCKOUT_MINUTES} นาทีแล้วลองใหม่` };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = getUsersSheet_(ss);

  if (usersSheet && usersSheet.getLastRow() > 1) {
    const data = usersSheet.getRange(2, 1, usersSheet.getLastRow() - 1, 6).getDisplayValues();
    for (let i = 0; i < data.length; i++) {
      const rowLocCode = (data[i][0] || "").toString().trim();
      if (rowLocCode !== locCode) continue;

      const storedHash = data[i][1];
      const salt = data[i][2];
      const lastChanged = data[i][3];
      const active = (data[i][4] || "").toString().trim().toUpperCase();
      const role = (data[i][5] || "").toString().trim() || ROLE_NORMAL;

      if (active !== "TRUE" && active !== "Y") {
        return { success: false, message: "บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ" };
      }
      if (hashPassword_(password, salt) !== storedHash) {
        incrementFailCount_('loginfail_', locCode, LOGIN_LOCKOUT_MINUTES);
        return { success: false, message: "รหัสสาขาหรือรหัสผ่านไม่ถูกต้อง" };
      }
      clearFailCount_('loginfail_', locCode);

      let passwordExpired = false;
      if (lastChanged) {
        const changedDate = parseDdMmYyyy_(lastChanged);
        if (changedDate) {
          const daysSince = Math.floor((new Date().getTime() - changedDate.getTime()) / (1000 * 60 * 60 * 24));
          passwordExpired = daysSince >= PASSWORD_EXPIRY_DAYS;
        }
      }

      const token = Utilities.getUuid();
      const sessionsSheet = getSessionsSheet_(ss);
      if (sessionsSheet) {
        sessionsSheet.appendRow([token, locCode, Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy HH:mm:ss")]);
      }

      const branchLocName = getLocNameByCode_(ss, locCode);
      logAccess_(ss, locCode, branchLocName, role, "LOGIN", "");

      return {
        success: true,
        token: token,
        locCode: locCode,
        locName: branchLocName,
        passwordExpired: passwordExpired,
        isAdmin: false,
        role: role
      };
    }
  }

  // ไม่พบ LocCode สาขาที่ตรง → ลองเทียบกับบัญชี Admin (ใช้ช่องเดียวกันเป็น Username)
  const adminResult = tryAdminLoginAsSession_(locCode, password);
  if (adminResult) { clearFailCount_('loginfail_', locCode); return adminResult; }

  incrementFailCount_('loginfail_', locCode, LOGIN_LOCKOUT_MINUTES);
  return { success: false, message: "รหัสสาขาหรือรหัสผ่านไม่ถูกต้อง" };
}

// login ด้วยบัญชี Admin ผ่านหน้าแรกเดียวกับสาขา — ออก token เดียวที่ใช้ได้ทั้งฝั่งสาขา (Sessions)
// และฝั่ง Admin (AdminAuth) เพื่อให้เข้าแท็บตั้งค่าระบบได้ทันทีโดยไม่ต้อง login ซ้อน
function tryAdminLoginAsSession_(username, password) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const adminsSheet = getAdminsSheet_(ss);
  if (!adminsSheet || adminsSheet.getLastRow() <= 1) return null;

  const data = adminsSheet.getRange(2, 1, adminsSheet.getLastRow() - 1, 3).getDisplayValues();
  for (let i = 0; i < data.length; i++) {
    const rowUsername = (data[i][0] || "").toString().trim();
    if (rowUsername !== username) continue;

    const storedHash = data[i][1];
    const salt = data[i][2];
    if (hashPassword_(password, salt) !== storedHash) return null;

    const token = Utilities.getUuid();
    const now = Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy HH:mm:ss");

    const sessionsSheet = getSessionsSheet_(ss);
    if (sessionsSheet) sessionsSheet.appendRow([token, ADMIN_SESSION_LOCCODE, now]);

    const authSheet = getAdminAuthSheet_(ss);
    if (authSheet) authSheet.appendRow([token, username, now]);

    logAccess_(ss, ADMIN_SESSION_LOCCODE, "Admin (" + username + ")", "admin", "LOGIN", "");

    return {
      success: true,
      token: token,
      locCode: ADMIN_SESSION_LOCCODE,
      locName: "Admin",
      passwordExpired: false,
      isAdmin: true
    };
  }
  return null;
}

function logout(token) {
  if (!token) return { success: true };
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sheet = getSessionsSheet_(ss);
  if (sheet && sheet.getLastRow() > 1) {
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues();
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === token) { sheet.deleteRow(i + 2); break; }
    }
  }

  // เพิกถอน admin session ที่ผูกกับ token เดียวกันด้วย เผื่อเป็น session ที่ login แบบ admin ผ่านหน้าแรก
  const authSheet = getAdminAuthSheet_(ss);
  if (authSheet && authSheet.getLastRow() > 1) {
    const authData = authSheet.getRange(2, 1, authSheet.getLastRow() - 1, 1).getDisplayValues();
    for (let i = 0; i < authData.length; i++) {
      if (authData[i][0] === token) { authSheet.deleteRow(i + 2); break; }
    }
  }

  return { success: true };
}

function validateSessionToken(token) {
  const session = resolveSession_(token);
  if (!session) return { valid: false };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const isAdmin = session.locCode === ADMIN_SESSION_LOCCODE;

  // เช็ครหัสผ่านหมดอายุตอน restore session ด้วย (ไม่ใช่แค่ตอน login ใหม่) กัน session ที่ค้างอยู่นานๆ
  // ไม่เคยถูกบังคับเปลี่ยนรหัสผ่านแม้เกิน PASSWORD_EXPIRY_DAYS แล้ว — ไม่ตรวจสอบฝั่ง Admin เพราะ Admin ไม่มีนโยบายหมดอายุรหัสผ่าน
  let passwordExpired = false;
  if (!isAdmin) {
    const usersSheet = getUsersSheet_(ss);
    if (usersSheet && usersSheet.getLastRow() > 1) {
      const data = usersSheet.getRange(2, 1, usersSheet.getLastRow() - 1, 4).getDisplayValues();
      for (let i = 0; i < data.length; i++) {
        if ((data[i][0] || "").toString().trim() === session.locCode) {
          const changedDate = parseDdMmYyyy_(data[i][3]);
          if (changedDate) {
            const daysSince = Math.floor((new Date().getTime() - changedDate.getTime()) / (1000 * 60 * 60 * 24));
            passwordExpired = daysSince >= PASSWORD_EXPIRY_DAYS;
          }
          break;
        }
      }
    }
  }

  return {
    valid: true,
    locCode: session.locCode,
    locName: isAdmin ? "Admin" : getLocNameByCode_(ss, session.locCode),
    isAdmin: isAdmin,
    role: session.role,
    passwordExpired: passwordExpired
  };
}

function changePassword(token, oldPassword, newPassword) {
  const session = resolveSession_(token);
  if (!session) return { success: false, message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" };
  newPassword = (newPassword || "").toString();
  if (newPassword.length < 4) return { success: false, message: "รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร" };

  if (session.locCode === ADMIN_SESSION_LOCCODE) {
    return changeAdminPassword_(token, oldPassword, newPassword);
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = getUsersSheet_(ss);
  if (!usersSheet || usersSheet.getLastRow() <= 1) return { success: false, message: "ไม่พบฐานข้อมูลผู้ใช้" };

  const data = usersSheet.getRange(2, 1, usersSheet.getLastRow() - 1, 5).getDisplayValues();
  for (let i = 0; i < data.length; i++) {
    const rowLocCode = (data[i][0] || "").toString().trim();
    if (rowLocCode !== session.locCode) continue;

    const storedHash = data[i][1];
    const salt = data[i][2];
    if (hashPassword_((oldPassword || "").toString(), salt) !== storedHash) {
      return { success: false, message: "รหัสผ่านเดิมไม่ถูกต้อง" };
    }

    const newSalt = Utilities.getUuid();
    const newHash = hashPassword_(newPassword, newSalt);
    usersSheet.getRange(i + 2, 2, 1, 3).setValues([[newHash, newSalt, Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy")]]);

    // เปลี่ยนรหัสผ่านแล้วเพิกถอนทุก session เดิมของสาขานี้ บังคับอุปกรณ์อื่นให้ login ใหม่
    const sessionsSheet = getSessionsSheet_(ss);
    const newToken = Utilities.getUuid();
    if (sessionsSheet && sessionsSheet.getLastRow() > 1) {
      const sessData = sessionsSheet.getRange(2, 1, sessionsSheet.getLastRow() - 1, 2).getDisplayValues();
      for (let r = sessData.length - 1; r >= 0; r--) {
        if ((sessData[r][1] || "").toString().trim() === session.locCode) {
          sessionsSheet.deleteRow(r + 2);
        }
      }
    }
    if (sessionsSheet) {
      sessionsSheet.appendRow([newToken, session.locCode, Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy HH:mm:ss")]);
    }

    return { success: true, token: newToken, message: "เปลี่ยนรหัสผ่านสำเร็จ" };
  }

  return { success: false, message: "ไม่พบบัญชีผู้ใช้" };
}

// เปลี่ยนรหัสผ่านบัญชี Admin ที่ login ผ่านหน้าแรก — แยกจาก changePassword หลักเพราะ Admin เก็บอยู่คนละชีต (Admins ไม่ใช่ Users)
function changeAdminPassword_(token, oldPassword, newPassword) {
  const adminSession = resolveAdminSession_(token);
  if (!adminSession) return { success: false, message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const adminsSheet = getAdminsSheet_(ss);
  if (!adminsSheet || adminsSheet.getLastRow() <= 1) return { success: false, message: "ไม่พบฐานข้อมูลผู้ใช้" };

  const data = adminsSheet.getRange(2, 1, adminsSheet.getLastRow() - 1, 3).getDisplayValues();
  for (let i = 0; i < data.length; i++) {
    const rowUsername = (data[i][0] || "").toString().trim();
    if (rowUsername !== adminSession.username) continue;

    const storedHash = data[i][1];
    const salt = data[i][2];
    if (hashPassword_((oldPassword || "").toString(), salt) !== storedHash) {
      return { success: false, message: "รหัสผ่านเดิมไม่ถูกต้อง" };
    }

    const newSalt = Utilities.getUuid();
    const newHash = hashPassword_(newPassword, newSalt);
    adminsSheet.getRange(i + 2, 2, 1, 2).setValues([[newHash, newSalt]]);

    // เพิกถอน session เดิมทั้งหมดของ Admin คนนี้ (ทั้งฝั่ง Sessions และ AdminAuth) แล้วออก token ใหม่ให้ session ปัจจุบัน
    const sessionsSheet = getSessionsSheet_(ss);
    const authSheet = getAdminAuthSheet_(ss);
    const oldTokens = [];
    if (authSheet && authSheet.getLastRow() > 1) {
      const authData = authSheet.getRange(2, 1, authSheet.getLastRow() - 1, 2).getDisplayValues();
      for (let r = authData.length - 1; r >= 0; r--) {
        if ((authData[r][1] || "").toString().trim() === adminSession.username) {
          oldTokens.push(authData[r][0]);
          authSheet.deleteRow(r + 2);
        }
      }
    }
    if (sessionsSheet && sessionsSheet.getLastRow() > 1 && oldTokens.length) {
      const sessData = sessionsSheet.getRange(2, 1, sessionsSheet.getLastRow() - 1, 1).getDisplayValues();
      for (let r = sessData.length - 1; r >= 0; r--) {
        if (oldTokens.indexOf(sessData[r][0]) !== -1) sessionsSheet.deleteRow(r + 2);
      }
    }

    const newToken = Utilities.getUuid();
    const now = Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy HH:mm:ss");
    if (sessionsSheet) sessionsSheet.appendRow([newToken, ADMIN_SESSION_LOCCODE, now]);
    if (authSheet) authSheet.appendRow([newToken, adminSession.username, now]);

    return { success: true, token: newToken, message: "เปลี่ยนรหัสผ่านสำเร็จ" };
  }

  return { success: false, message: "ไม่พบบัญชีผู้ใช้" };
}

// รันเองจาก Apps Script editor เท่านั้น (ไม่ผูกปุ่มใดๆ บนเว็บ) — สร้างชีต Users/Sessions/AccountSetup
// พร้อม header ให้ครบ ถ้าชีตมีอยู่แล้วจะข้ามไม่แตะของเดิม เรียกได้ซ้ำอย่างปลอดภัย
function setupAuthSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let usersSheet = getUsersSheet_(ss);
  if (!usersSheet) {
    usersSheet = ss.insertSheet("Users");
    usersSheet.getRange(1, 1, 1, 6).setValues([["LocCode", "PasswordHash", "Salt", "LastPasswordChangedDate", "Active", "Role"]]);
    usersSheet.setFrozenRows(1);
  }
  // เผื่อชีต Users เดิมสร้างไว้ก่อนเพิ่มฟีเจอร์สิทธิ์ผู้ใช้ (มีแค่ 5 คอลัมน์) — เติมหัวคอลัมน์ Role ให้โดยไม่กระทบข้อมูลเดิม
  if (usersSheet.getRange(1, 6).getValue() === "") {
    usersSheet.getRange(1, 6).setValue("Role");
  }

  if (!getSessionsSheet_(ss)) {
    const sheet = ss.insertSheet("Sessions");
    sheet.getRange(1, 1, 1, 3).setValues([["Token", "LocCode", "CreatedAt"]]);
    sheet.setFrozenRows(1);
  }

  if (!findSheet(ss, "accountsetup")) {
    const sheet = ss.insertSheet("AccountSetup");
    sheet.getRange(1, 1, 1, 2).setValues([["LocCode", "PlainPassword"]]);
    sheet.setFrozenRows(1);
  }

  // หมายเหตุ: ตั้งชื่อ "Admins"/"AdminAuth" (ไม่ใช่ "AdminUsers"/"AdminSessions") เพราะ findSheet()
  // จับคู่แบบ substring — ถ้าตั้งชื่อมี "users"/"sessions" อยู่ในนั้น จะไปชนกับ getUsersSheet_/getSessionsSheet_ โดยไม่ตั้งใจ
  if (!getAdminsSheet_(ss)) {
    const sheet = ss.insertSheet("Admins");
    sheet.getRange(1, 1, 1, 3).setValues([["Username", "PasswordHash", "Salt"]]);
    sheet.setFrozenRows(1);
  }

  if (!getAdminAuthSheet_(ss)) {
    const sheet = ss.insertSheet("AdminAuth");
    sheet.getRange(1, 1, 1, 3).setValues([["Token", "Username", "CreatedAt"]]);
    sheet.setFrozenRows(1);
  }

  if (!getAccessLogSheet_(ss)) {
    const sheet = ss.insertSheet("AccessLog");
    sheet.getRange(1, 1, 1, 6).setValues([["Timestamp", "LocCode", "LocName", "Role", "Action", "Detail"]]);
    sheet.setFrozenRows(1);
  }
}

// รันเองจาก Apps Script editor เท่านั้น (ไม่ผูกปุ่มใดๆ บนเว็บ) — สร้างชีต TransferRequests
// สำหรับฟีเจอร์โอนย้ายสต๊อกข้ามสาขา เรียกได้ซ้ำอย่างปลอดภัย (ข้ามถ้ามีชีตอยู่แล้ว)
function setupTransferSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!getTransferSheet_(ss)) {
    const sheet = ss.insertSheet("TransferRequests");
    sheet.getRange(1, 1, 1, 12).setValues([[
      "Timestamp", "SKU", "Desc", "IMEI", "FromLocCode", "FromLocName",
      "ToLocCode", "ToLocName", "RequestedBy", "Status",
      "ReceivedAt", "ReceivedBy"
    ]]);
    sheet.setFrozenRows(1);
  }
}

// รันเองจาก Apps Script editor เท่านั้น (ไม่ผูกปุ่มใดๆ บนเว็บ) — สร้างชีต ActRecordTransfers
// สำหรับฟีเจอร์โอนย้ายรายการ ACT ข้ามสาขา (คนละระบบ/คนละหน้ากับโอนย้ายสต๊อกด้านบน) เรียกได้ซ้ำอย่างปลอดภัย (ข้ามถ้ามีชีตอยู่แล้ว)
function setupActTransferSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!getActTransferSheet_(ss)) {
    const sheet = ss.insertSheet("ActRecordTransfers");
    sheet.getRange(1, 1, 1, 12).setValues([[
      "Timestamp", "SKU", "Desc", "IMEI", "FromLocCode", "FromLocName",
      "ToLocCode", "ToLocName", "RequestedBy", "Status",
      "ReceivedAt", "ReceivedBy"
    ]]);
    sheet.setFrozenRows(1);
  }
}

// รันเองจาก Apps Script editor เท่านั้น (ไม่ผูกปุ่มใดๆ บนเว็บ) — ใช้สร้าง/รีเซ็ตรหัสผ่านบัญชีสาขา
// อ่านชีต "AccountSetup" (A: LocCode, B: PlainPassword) แล้ว hash เขียนลงชีต "Users"
// ทำเสร็จแล้วให้ลบคอลัมน์ B ในชีต AccountSetup ทิ้ง อย่าปล่อยรหัสผ่าน plaintext ค้างไว้
function adminSetupUsers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const setupSheet = findSheet(ss, "accountsetup");
  const usersSheet = getUsersSheet_(ss);
  if (!setupSheet) throw new Error("ไม่พบชีต AccountSetup");
  if (!usersSheet) throw new Error("ไม่พบชีต Users");
  if (setupSheet.getLastRow() <= 1) return;

  const setupData = setupSheet.getRange(2, 1, setupSheet.getLastRow() - 1, 2).getDisplayValues();
  const existing = usersSheet.getLastRow() > 1
    ? usersSheet.getRange(2, 1, usersSheet.getLastRow() - 1, 1).getDisplayValues().map(function(r) { return (r[0] || "").toString().trim(); })
    : [];
  const today = Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy");

  setupData.forEach(function(row) {
    const locCode = (row[0] || "").toString().trim();
    const plainPassword = (row[1] || "").toString();
    if (!locCode || !plainPassword) return;

    const salt = Utilities.getUuid();
    const hash = hashPassword_(plainPassword, salt);
    const existingIdx = existing.indexOf(locCode);

    if (existingIdx !== -1) {
      usersSheet.getRange(existingIdx + 2, 2, 1, 4).setValues([[hash, salt, today, "TRUE"]]);
    } else {
      usersSheet.appendRow([locCode, hash, salt, today, "TRUE"]);
      existing.push(locCode);
    }
  });
}

// ================= MODEL / DATA ACCESS LAYER =================
function getAppData(token) {
  requireSession_(token);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const annSheet = findSheet(ss, "ประกาศ");
  let announcement = { title: "", detail: "" };
  if(annSheet && annSheet.getLastRow() > 1) {
    const annData = annSheet.getRange(2, 1, 1, 2).getDisplayValues()[0];
    announcement = { title: annData[0], detail: annData[1] };
  }

  const promoSheet = findSheet(ss, "ข่าวสารโปรโมชั่น");
  let promotions = [];
  if(promoSheet && promoSheet.getLastRow() > 1) {
    const promoData = promoSheet.getRange(2, 1, promoSheet.getLastRow() - 1, 3).getDisplayValues();
    promotions = promoData.map(r => ({ title: r[0], detail: r[1], link: r[2] }));
  }

  const locSheet = findSheet(ss, "location");
  let locations = [];
  if(locSheet && locSheet.getLastRow() > 1) {
    const locData = locSheet.getRange(2, 1, locSheet.getLastRow() - 1, 5).getDisplayValues();
    locations = locData.map(r => ({ 
      area: r[0] ? r[0].toString().trim() : "ไม่ระบุ Area",
      support: r[1],
      code: r[3] ? r[3].toString().trim() : "",
      name: r[4]
    })).filter(r => r.code !== "");
  }

  // 💡 อัปเดต: ระบบดึง Master Data จากชีต Product จับคู่หัวตาราง SKU และ Model แบบแม่นยำ 100%
  const productSheet = findSheet(ss, "product");
  let productMap = {};
  if (productSheet && productSheet.getLastRow() > 1) {
    const prodData = productSheet.getDataRange().getDisplayValues();
    let headers = prodData[0];
    let skuIdx = -1;
    let modelIdx = -1;
    
    // ค้นหาคอลัมน์อัตโนมัติจากชื่อหัวตาราง
    for (let i = 0; i < headers.length; i++) {
      let h = headers[i].toString().trim().toLowerCase();
      // เช็คหัวตาราง SKU
      if (h === "sku" || h === "รหัสสินค้า") skuIdx = i;
      // เช็คหัวตาราง Model
      if (h === "model" || h.includes("model") || h === "รุ่น" || h === "ชื่อรุ่น") modelIdx = i;
    }
    
    // ถ้าตั้งชื่อหัวตารางผิดแปลกไป ให้เดาว่าคอลัมน์ A=SKU, B=Model
    if (skuIdx === -1) skuIdx = 0; 
    if (modelIdx === -1) modelIdx = 1; 

    for (let i = 1; i < prodData.length; i++) {
      let sku = prodData[i][skuIdx] ? prodData[i][skuIdx].toString().trim() : "";
      let model = prodData[i][modelIdx] ? prodData[i][modelIdx].toString().trim() : "";
      // แมป SKU เป็น Key และ Model เป็น Value เตรียมส่งให้แดชบอร์ดหน้าเว็บ
      if (sku !== "") {
        productMap[sku] = model;
      }
    }
  }

  const timeSheet = findSheet(ss, "time");
  let timeValid = true;
  if(timeSheet && timeSheet.getLastRow() > 1) {
    const timeData = timeSheet.getRange(2, 1, 1, 2).getDisplayValues()[0];
    timeValid = checkIsTimeValid(timeData[0], timeData[1]);
  }
  const requireCodeMyOppo = isRequireCodeMyOppo_(ss);
  const usersLocCodes = getUsersLocCodes_(ss);

  return { announcement, promotions, locations, timeValid, productMap, requireCodeMyOppo, usersLocCodes }; // ส่งข้อมูล Model ออกไป
}

// IMEI ที่ถูกทำรายการ ACT ไปแล้ว (มีแถวอยู่ในชีต "อยู่ระหว่างดำเนินการ") — ถือว่าถูก "จับจอง" แล้ว
// ห้ามให้ทั้งฟอร์ม ACT และฟีเจอร์โอนย้ายสต๊อกเลือก/ประมวลผลซ้ำ
function getUsedImeis_(ss) {
  const actSheet = findSheet(ss, "อยู่ระหว่างดำเนินการ");
  const usedImeis = new Set();
  if (actSheet && actSheet.getLastRow() > 1) {
    const actData = actSheet.getDataRange().getDisplayValues();
    for (let i = 1; i < actData.length; i++) {
      const uImei = actData[i][7] ? actData[i][7].toString().trim() : "";
      if (uImei !== "") usedImeis.add(uImei);
    }
  }
  return usedImeis;
}

// IMEI ที่มีคำขอโอนย้ายสถานะ "รอรับเข้า" ค้างอยู่ในชีต TransferRequests — ห้ามให้ฟอร์ม ACT
// บันทึกขายซ้ำระหว่างที่คำขอยังไม่เสร็จสิ้น (ไม่งั้นคำขอโอนย้ายจะค้างและ IMEI จะถูกใช้ 2 ทางพร้อมกัน)
function getPendingTransferImeis_(ss) {
  const sheet = getTransferSheet_(ss);
  const pending = new Set();
  if (sheet && sheet.getLastRow() > 1) {
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getDisplayValues();
    for (let i = 0; i < data.length; i++) {
      const imei = (data[i][3] || "").toString().trim();
      const status = (data[i][9] || "").toString().trim();
      if (imei !== "" && status === TRANSFER_STATUS_PENDING) pending.add(imei);
    }
  }
  return pending;
}

function getStockByBranch(token, locCode) {
  requireSession_(token);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stockSheet = findSheet(ss, "stock");
  if(!stockSheet) return [];

  const usedImeis = getUsedImeis_(ss);

  const data = stockSheet.getDataRange().getDisplayValues();
  let result = [];
  
  for(let i = 1; i < data.length; i++) {
    let sLoc = data[i][0] ? data[i][0].toString().trim() : "";
    if(sLoc == locCode || sLoc == "Warehouse Transfer") {
      let imei = data[i][4] ? data[i][4].toString().trim() : "";
      if(imei !== "" && !usedImeis.has(imei)) {
        result.push({
          sku: data[i][2].toString().trim(),
          desc: data[i][3].toString().trim(),
          imei: imei,
          originalLoc: sLoc
        });
      }
    }
  }
  return result;
}

// อ่าน flag "บังคับกรอก Code MyOppo" จากคอลัมน์ C แถว 2 ของชีต "time" (คอลัมน์เดียวกับ A/B ที่เก็บช่วงเวลาทำการ)
function isRequireCodeMyOppo_(ss) {
  const timeSheet = findSheet(ss, "time");
  if (!timeSheet || timeSheet.getLastRow() <= 1) return false;
  const val = timeSheet.getRange(2, 3).getDisplayValue().toString().trim().toUpperCase();
  return val === "TRUE";
}

function checkIsTimeValid(startStr, endStr) {
  if(!startStr || !endStr) return true;
  try {
    let now = new Date();
    let sStr = startStr.toString().trim();
    let eStr = endStr.toString().trim();
    
    if (sStr.includes('/') || sStr.includes('-')) {
      let parseD = function(str) {
        let p = str.split(' ')[0].split(/[-/]/);
        if(p.length === 3) {
          return p[0].length === 4 ? new Date(p[0], p[1]-1, p[2]) : new Date(p[2], p[1]-1, p[0]);
        }
        return new Date(str);
      };
      
      let startDate = parseD(sStr);
      let endDate = parseD(eStr);
      
      if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
          startDate.setHours(0, 0, 0, 0);
          endDate.setHours(23, 59, 59, 999); 
          return (now >= startDate && now <= endDate);
      }
    }

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    let st = sStr.split(":");
    let startMinutes = parseInt(st[0]||0)*60 + parseInt(st[1]||0);
    let en = eStr.split(":");
    let endMinutes = parseInt(en[0]||0)*60 + parseInt(en[1]||0);
    return (currentMinutes >= startMinutes && currentMinutes <= endMinutes);
  } catch(e) {
    return true; 
  }
}

// ================= CONTROLLER / BUSINESS LOGIC =================

function getRecords(token) {
  requireSession_(token);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = findSheet(ss, "อยู่ระหว่างดำเนินการ");
  if(!sheet || sheet.getLastRow() <= 1) return [];
  
  const locSheet = findSheet(ss, "location");
  let locAreaMap = {};
  if(locSheet && locSheet.getLastRow() > 1) {
    const locData = locSheet.getRange(2, 1, locSheet.getLastRow() - 1, 4).getDisplayValues();
    locData.forEach(function(row) {
      let lCode = row[3] ? row[3].toString().trim() : "";
      let lArea = row[0] ? row[0].toString().trim() : "ไม่ระบุ Area";
      if(lCode) locAreaMap[lCode] = lArea;
    });
  }

  // คอลัมน์ J = "Code MyOppo" (เพิ่มโดย user แทรกไว้หลังคอลัมน์ I/สถานะ) ทำให้ rrp เป็นต้นไปเลื่อนขวาไป 1 คอลัมน์
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 15).getDisplayValues();

  let validData = [];
  data.forEach(function(r, index) {
    if(r[7] && r[7].toString().trim() !== "") {
      let targetLocCode = r[3] ? r[3].toString().trim() : "";
      let mappedArea = locAreaMap[targetLocCode] || "ไม่ระบุ Area";

      validData.push({
        rowId: index + 2,
        timestamp: r[0],
        actDate: r[1],
        empName: r[2],
        locCode: targetLocCode,
        locName: r[4],
        sku: r[5],
        desc: r[6],
        imei: r[7],
        status: r[8],
        codeMyOppo: r[9] || "",
        rrp: r[10] || "",
        discount: r[11] || "",
        promoPrice: r[12] || "",
        cutBarcode: r[13] || "",
        suggestPrice: r[14] || "",
        area: mappedArea
      });
    }
  });
  
  return validData;
}

function saveBatchRecords(token, payload) {
  const session = requireSession_(token);
  if (session.locCode === ADMIN_SESSION_LOCCODE) {
    return { success: false, message: "บัญชี Admin ไม่มีสาขา ไม่สามารถบันทึกรายการ ACT ได้" };
  }
  if (session.role === ROLE_VIEWER) {
    return { success: false, message: "บัญชีนี้เป็นบัญชีดูข้อมูลอย่างเดียว ไม่สามารถบันทึกรายการได้" };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000); // รอสูงสุด 15 วินาที
  } catch (e) {
    return { success: false, message: "ขณะนี้ระบบกำลังประมวลผลข้อมูลจากผู้ใช้อื่นจำนวนมาก กรุณารอสักครู่แล้วลองใหม่อีกครั้ง" };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // บังคับตรวจสอบเวลาทำการฝั่ง server ด้วย (ฝั่ง client แค่ล็อกฟอร์มด้วย CSS ซึ่งเลี่ยงได้ผ่าน console)
    const timeSheet = findSheet(ss, "time");
    if (timeSheet && timeSheet.getLastRow() > 1) {
      const timeData = timeSheet.getRange(2, 1, 1, 2).getDisplayValues()[0];
      if (!checkIsTimeValid(timeData[0], timeData[1])) {
        return { success: false, message: "ขณะนี้อยู่นอกเวลาทำการ ไม่สามารถบันทึกข้อมูลได้" };
      }
    }
    // บังคับตรวจสอบ Code MyOppo ฝั่ง server ด้วยเช่นกัน (ฝั่ง client แค่ล็อกฟอร์มด้วย required ซึ่งเลี่ยงได้ผ่าน console)
    const requireCodeMyOppo = isRequireCodeMyOppo_(ss);

    // บังคับสาขาจาก session ที่ login ไว้เท่านั้น ไม่เชื่อ locCode/locName ที่ client ส่งมา
    const branchLocCode = session.locCode;
    const branchLocName = getLocNameByCode_(ss, branchLocCode);
    const stockSheet = findSheet(ss, "stock");
    if(!stockSheet) return { success: false, message: "ไม่พบฐานข้อมูลชีต Stock" };
    const stockData = stockSheet.getDataRange().getDisplayValues();
    const validStockKeys = new Set();
    
    for(let i = 1; i < stockData.length; i++) {
      let sLoc = stockData[i][0] ? stockData[i][0].toString().trim() : "";
      let sSku = stockData[i][2] ? stockData[i][2].toString().trim() : "";
      let sImei = stockData[i][4] ? stockData[i][4].toString().trim() : "";
      validStockKeys.add(`${sLoc}|${sSku}|${sImei}`);
    }

    const targetSheet = findSheet(ss, "อยู่ระหว่างดำเนินการ");
    if(!targetSheet) return { success: false, message: "ไม่พบฐานข้อมูลชีต 'อยู่ระหว่างดำเนินการ'" };
    
    // เรียกใช้ SpreadsheetApp.flush() เผื่อคิวซิงค์ข้อมูลให้เสร็จก่อนอ่านค่า
    SpreadsheetApp.flush();
    
    let usedImeis = new Set();
    if(targetSheet.getLastRow() > 1) {
      const actData = targetSheet.getDataRange().getDisplayValues();
      for(let i = 1; i < actData.length; i++) {
        let uImei = actData[i][7] ? actData[i][7].toString().trim() : "";
        if(uImei !== "") usedImeis.add(uImei);
      }
    }
    const pendingTransferImeis = getPendingTransferImeis_(ss);

    const timestamp = "'" + Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy HH:mm:ss");
    let actD = payload.actDate.split('-');
    let formattedActDate = payload.actDate;
    if(actD.length === 3) { formattedActDate = "'" + actD[2] + "/" + actD[1] + "/" + actD[0]; }
    // นำหน้าด้วย ' เหมือน timestamp/actDate ด้านบน กันไม่ให้ Sheets ตีความค่าที่ผู้ใช้พิมพ์เอง (ขึ้นต้นด้วย =, +, -, @) เป็นสูตร
    const actEmpName = "'" + branchLocCode + "+" + payload.empName;
    const allowedStatus = ["ยังไม่ขาย", "ขายแล้ว"];

    let errors = [];
    let rowsToInsert = [];

    payload.items.forEach((item, index) => {
      let checkKey = `${branchLocCode}|${item.sku}|${item.imei}`;
      let transferKey = `Warehouse Transfer|${item.sku}|${item.imei}`;
      let itemStatus = allowedStatus.indexOf(item.status) !== -1 ? item.status : "ยังไม่ขาย";
      if(usedImeis.has(item.imei)) {
        errors.push(`รายการที่ ${index + 1} (IMEI: ${item.imei}) ถูกทำรายการแอคไปแล้ว`);
      } else if(pendingTransferImeis.has(item.imei)) {
        errors.push(`รายการที่ ${index + 1} (IMEI: ${item.imei}) มีคำขอโอนย้ายสต๊อกที่ยังไม่เสร็จสิ้นค้างอยู่ กรุณายกเลิกคำขอโอนย้ายก่อน`);
      } else if(!validStockKeys.has(checkKey) && !validStockKeys.has(transferKey)) {
        errors.push(`รายการที่ ${index + 1} (IMEI: ${item.imei}) ไม่มีในสต๊อกของสาขานี้ (หรือ Warehouse Transfer)`);
      } else if(requireCodeMyOppo && !(item.codeMyOppo || "").toString().trim()) {
        errors.push(`รายการที่ ${index + 1} (IMEI: ${item.imei}) กรุณาระบุ Code MyOppo`);
      } else {
        rowsToInsert.push([
          timestamp, formattedActDate, actEmpName, branchLocCode, branchLocName,
          item.sku, item.desc, item.imei, itemStatus, "'" + (item.codeMyOppo || "").toString().trim(), "", "", "", "", ""
        ]);
      }
    });

    if(errors.length > 0) return { success: false, message: "ตรวจพบข้อผิดพลาด:\n" + errors.join("\n") };
    
    rowsToInsert.forEach(row => targetSheet.appendRow(row));
    SpreadsheetApp.flush(); // บังคับเขียนลงแผ่นงานทันที
    
    return { success: true, message: `บันทึกข้อมูล ${rowsToInsert.length} รายการสำเร็จ` };
  } catch (err) {
    return { success: false, message: "เกิดข้อผิดพลาดในการบันทึก: " + err.message };
  } finally {
    lock.releaseLock();
  }
}

function updateStatus(token, rowId, newStatus) {
  const session = requireSession_(token);
  if (session.role === ROLE_VIEWER) {
    return { success: false, message: "บัญชีนี้เป็นบัญชีดูข้อมูลอย่างเดียว ไม่สามารถแก้ไขสถานะได้" };
  }
  const allowedStatus = ["ยังไม่ขาย", "ขายแล้ว"];
  if(allowedStatus.indexOf(newStatus) === -1) {
    return { success: false, message: "สถานะไม่ถูกต้อง" };
  }
  rowId = Number(rowId);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = findSheet(ss, "อยู่ระหว่างดำเนินการ");
    if (!sheet) return { success: false, message: "ไม่พบฐานข้อมูลชีต 'อยู่ระหว่างดำเนินการ'" };
    // rowId ต้องชี้ไปยังแถวข้อมูลจริงเท่านั้น (แถว 1 คือ header) ป้องกัน rowId ที่ถูกดัดแปลงจาก client ทำให้ header เสียหาย
    if (!Number.isInteger(rowId) || rowId < 2 || rowId > sheet.getLastRow()) {
      return { success: false, message: "หมายเลขแถวไม่ถูกต้อง" };
    }

    const rowVals = sheet.getRange(rowId, 6, 1, 4).getDisplayValues()[0]; // sku, desc, imei, oldStatus
    const oldStatus = rowVals[3] || "";
    sheet.getRange(rowId, 9).setValue(newStatus);

    const branchLocName = session.locCode === ADMIN_SESSION_LOCCODE ? "Admin" : getLocNameByCode_(ss, session.locCode);
    logAccess_(ss, session.locCode, branchLocName, session.role, "UPDATE_STATUS",
      `IMEI ${rowVals[2]} (${rowVals[0]}): ${oldStatus} -> ${newStatus}`);

    return { success: true, message: "อัปเดตสถานะสำเร็จ" };
  } catch(e) {
    return { success: false, message: e.message };
  }
}

// ================= STOCK TRANSFER (โอนย้ายสต๊อกข้ามสาขา) =================
// ค้นหาแถวสินค้าใน "Stock all system" ด้วยคู่ SKU+IMEI (คอลัมน์ A=LocCode, C=SKU, D=Desc, E=IMEI ตามโครงสร้างเดิมของระบบ)
function findStockRow_(stockSheet, sku, imei) {
  const data = stockSheet.getDataRange().getDisplayValues();
  for (let i = 1; i < data.length; i++) {
    const rSku = data[i][2] ? data[i][2].toString().trim() : "";
    const rImei = data[i][4] ? data[i][4].toString().trim() : "";
    if (rSku === sku && rImei === imei) {
      return { rowIndex: i + 1, locCode: data[i][0] ? data[i][0].toString().trim() : "", desc: data[i][3] || "" };
    }
  }
  return null;
}

// สแกนชีต Stock ทั้งชีตครั้งเดียวแล้วสร้าง index (key: "sku|imei") ใช้แทนการเรียก findStockRow_ ซ้ำในลูปโอนย้ายแบบหลายรายการ (createTransferRequest/receiveTransferBatch)
// เพื่อไม่ให้สแกนทั้งชีตซ้ำต่อ 1 รายการ (O(n*m) -> O(n+m)) ขณะที่ยังถือ script lock ซึ่งบล็อกผู้ใช้อื่นทั้งระบบอยู่
function buildStockIndex_(stockSheet) {
  const data = stockSheet.getDataRange().getDisplayValues();
  const index = new Map();
  for (let i = 1; i < data.length; i++) {
    const sSku = data[i][2] ? data[i][2].toString().trim() : "";
    const sImei = data[i][4] ? data[i][4].toString().trim() : "";
    if (!sSku || !sImei) continue;
    index.set(`${sSku}|${sImei}`, { rowIndex: i + 1, locCode: data[i][0] ? data[i][0].toString().trim() : "", desc: data[i][3] || "" });
  }
  return index;
}

function mapTransferRow_(r, rowId) {
  return {
    rowId: rowId,
    timestamp: r[0], sku: r[1], desc: r[2], imei: r[3],
    fromLocCode: r[4], fromLocName: r[5], toLocCode: r[6], toLocName: r[7],
    requestedBy: r[8], status: r[9],
    receivedAt: r[10], receivedBy: r[11]
  };
}

// สร้างคำขอโอนย้ายสต๊อกได้ครั้งละหลายรายการ (items = [{sku, imei}, ...] ปลายทางเดียวกันทั้งชุด):
// ตรวจว่า SKU+IMEI มีอยู่จริงใน Stock all system, ปลายทางมีอยู่จริง, และไม่ซ้ำกับคำขอที่ยังไม่เสร็จสิ้น (รอรับเข้า) ของสินค้าเดียวกัน
// ตรวจสอบทุกรายการก่อน ถ้ามีรายการใดผิดพลาดจะไม่สร้างคำขอเลยแม้แต่รายการเดียว (เหมือน saveBatchRecords) — ไม่มีขั้นตอนอนุมัติ รอแค่ปลายทางกด "รับเข้า"
function createTransferRequest(token, items, toLocCode) {
  const session = requireSession_(token);
  if (session.locCode === ADMIN_SESSION_LOCCODE) {
    return { success: false, message: "บัญชี Admin ไม่มีสาขา ไม่สามารถขอโอนย้ายสต๊อกได้" };
  }
  if (session.role === ROLE_VIEWER) {
    return { success: false, message: "บัญชีนี้เป็นบัญชีดูข้อมูลอย่างเดียว ไม่สามารถขอโอนย้ายสต๊อกได้" };
  }
  toLocCode = (toLocCode || "").toString().trim();
  if (!toLocCode) {
    return { success: false, message: "กรุณาเลือกรหัสสาขาปลายทางให้ครบถ้วน" };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { success: false, message: "กรุณาเลือกสินค้าอย่างน้อย 1 รายการ" };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    return { success: false, message: "ระบบกำลังประมวลผลคำขออื่นอยู่ กรุณารอสักครู่แล้วลองใหม่" };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const stockSheet = findSheet(ss, "stock");
    if (!stockSheet) return { success: false, message: "ไม่พบฐานข้อมูลชีต Stock" };

    const toLocName = getLocNameByCode_(ss, toLocCode);
    if (!toLocName) return { success: false, message: "ไม่พบรหัสสาขาปลายทางนี้ในระบบ" };
    if (getUsersLocCodes_(ss).indexOf(toLocCode) === -1) {
      return { success: false, message: "รหัสสาขาปลายทางนี้ยังไม่มีบัญชีผู้ใช้ (Users) ในระบบ ไม่สามารถโอนย้ายไปได้" };
    }

    const transferSheet = getTransferSheet_(ss);
    if (!transferSheet) return { success: false, message: "ไม่พบชีต TransferRequests — กรุณาให้ผู้ดูแลระบบรัน setupTransferSheet() ก่อน" };

    const usedImeis = getUsedImeis_(ss);
    const existingPendingImeis = new Set();
    if (transferSheet.getLastRow() > 1) {
      const existing = transferSheet.getRange(2, 1, transferSheet.getLastRow() - 1, 10).getDisplayValues();
      existing.forEach(function(r) {
        const eImei = (r[3] || "").toString().trim();
        const eStatus = (r[9] || "").toString().trim();
        if (eStatus === TRANSFER_STATUS_PENDING) existingPendingImeis.add(eImei);
      });
    }

    // สแกนชีต Stock ครั้งเดียวสร้าง index แทนการ findStockRow_ ต่อรายการ (กันสแกนทั้งชีตซ้ำ n รอบขณะถือ lock)
    const stockIndex = buildStockIndex_(stockSheet);

    const now = "'" + Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy HH:mm:ss");
    const seenImeis = new Set();
    const rowsToInsert = [];
    const errors = [];

    items.forEach(function(item, idx) {
      const sku = ((item && item.sku) || "").toString().trim();
      const imei = ((item && item.imei) || "").toString().trim();
      if (!sku || !imei) { errors.push(`รายการที่ ${idx + 1}: กรุณาเลือก SKU และ IMEI ให้ครบถ้วน`); return; }
      if (seenImeis.has(imei)) { errors.push(`รายการที่ ${idx + 1} (IMEI: ${imei}): ถูกเลือกซ้ำในคำขอนี้`); return; }
      seenImeis.add(imei);

      const stockRow = stockIndex.get(`${sku}|${imei}`);
      if (!stockRow) { errors.push(`รายการที่ ${idx + 1} (IMEI: ${imei}): ไม่พบสินค้า SKU/IMEI นี้ในระบบ Stock all system`); return; }
      // บังคับต้นทางต้องเป็นสาขาของผู้ขอเองเท่านั้น (ฝั่ง client ล็อก dropdown ไว้แล้ว แต่ server ต้องเช็กซ้ำ กัน google.script.run ถูกเรียกตรงข้ามคำสั่งฝั่งเว็บ)
      if (stockRow.locCode !== session.locCode) { errors.push(`รายการที่ ${idx + 1} (IMEI: ${imei}): สินค้านี้ไม่ได้อยู่ที่สาขาของคุณ`); return; }
      if (stockRow.locCode === toLocCode) { errors.push(`รายการที่ ${idx + 1} (IMEI: ${imei}): สินค้าอยู่ที่ Location ปลายทางนี้อยู่แล้ว`); return; }
      // กันโอนย้ายสินค้าที่ถูกทำรายการ ACT (ขาย/บันทึกสถานะ) ไปแล้ว ไม่ให้ถูกจับจองซ้ำ
      if (usedImeis.has(imei)) { errors.push(`รายการที่ ${idx + 1} (IMEI: ${imei}): ถูกทำรายการ ACT ไปแล้ว`); return; }
      if (existingPendingImeis.has(imei)) { errors.push(`รายการที่ ${idx + 1} (IMEI: ${imei}): มีคำขอโอนย้ายที่ยังไม่เสร็จสิ้นค้างอยู่แล้ว`); return; }

      const fromLocName = stockRow.locCode ? getLocNameByCode_(ss, stockRow.locCode) : "";
      rowsToInsert.push([now, sku, stockRow.desc, imei, stockRow.locCode, fromLocName, toLocCode, toLocName, session.locCode, TRANSFER_STATUS_PENDING, "", ""]);
    });

    if (errors.length > 0) return { success: false, message: "ตรวจพบข้อผิดพลาด:\n" + errors.join("\n") };

    rowsToInsert.forEach(function(row) { transferSheet.appendRow(row); });
    SpreadsheetApp.flush();

    logAccess_(ss, session.locCode, getLocNameByCode_(ss, session.locCode), session.role, "TRANSFER_REQUEST",
      `${rowsToInsert.length} รายการ: ${session.locCode} -> ${toLocCode}`);

    return { success: true, message: `สร้างคำขอโอนย้าย ${rowsToInsert.length} รายการสำเร็จ รอสาขาปลายทางกดรับเข้า` };
  } catch (err) {
    return { success: false, message: "เกิดข้อผิดพลาด: " + err.message };
  } finally {
    lock.releaseLock();
  }
}

// รายการโอนย้ายของสาขาที่ login อยู่ — incoming = ปลายทางคือสาขานี้, outgoing = สาขานี้เป็นผู้ขอ
function getMyTransfers(token) {
  const session = requireSession_(token);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getTransferSheet_(ss);
  if (!sheet || sheet.getLastRow() <= 1) return { incoming: [], outgoing: [] };

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getDisplayValues();
  let incoming = [], outgoing = [];
  data.forEach(function(r, idx) {
    const rowId = idx + 2;
    const toLoc = (r[6] || "").toString().trim();
    const reqBy = (r[8] || "").toString().trim();
    if (toLoc === session.locCode) incoming.push(mapTransferRow_(r, rowId));
    if (reqBy === session.locCode) outgoing.push(mapTransferRow_(r, rowId));
  });
  incoming.sort(function(a, b) { return b.rowId - a.rowId; });
  outgoing.sort(function(a, b) { return b.rowId - a.rowId; });
  return { incoming: incoming, outgoing: outgoing };
}

// สาขาปลายทางกดรับสินค้าเข้า: อัปเดต LocCode ในชีต Stock all system ให้เป็นปลายทาง แล้วปิดคำขอเป็น "รับเข้าแล้ว"
// อนุญาตให้ Admin รับแทนได้ด้วย (กรณีสาขาปลายทางไม่สะดวกเข้าระบบ)
function receiveTransfer(token, rowId) {
  const session = requireSession_(token);
  if (session.role === ROLE_VIEWER) {
    return { success: false, message: "บัญชีนี้เป็นบัญชีดูข้อมูลอย่างเดียว ไม่สามารถรับสินค้าเข้าได้" };
  }
  rowId = Number(rowId);

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    return { success: false, message: "ระบบกำลังประมวลผลรายการอื่นอยู่ กรุณารอสักครู่แล้วลองใหม่" };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const transferSheet = getTransferSheet_(ss);
    if (!transferSheet) return { success: false, message: "ไม่พบชีต TransferRequests" };
    if (!Number.isInteger(rowId) || rowId < 2 || rowId > transferSheet.getLastRow()) {
      return { success: false, message: "หมายเลขแถวไม่ถูกต้อง" };
    }

    const rowVals = transferSheet.getRange(rowId, 1, 1, 12).getDisplayValues()[0];
    const sku = (rowVals[1] || "").toString().trim();
    const imei = (rowVals[3] || "").toString().trim();
    const fromLocCode = (rowVals[4] || "").toString().trim();
    const toLocCode = (rowVals[6] || "").toString().trim();
    const status = (rowVals[9] || "").toString().trim();

    if (status !== TRANSFER_STATUS_PENDING) {
      return { success: false, message: "คำขอนี้ถูกดำเนินการไปแล้ว หรือไม่อยู่ในสถานะที่รับเข้าได้" };
    }
    const isAdmin = session.locCode === ADMIN_SESSION_LOCCODE;
    if (!isAdmin && session.locCode !== toLocCode) {
      return { success: false, message: "คำขอนี้ไม่ได้ระบุปลายทางเป็นสาขาของคุณ" };
    }
    // กันรับเข้าสินค้าที่ถูกทำรายการ ACT ไปแล้วระหว่างที่คำขอโอนย้ายค้างอยู่
    if (getUsedImeis_(ss).has(imei)) {
      return { success: false, message: "สินค้า IMEI นี้ถูกทำรายการ ACT ไปแล้วระหว่างรอรับเข้า ไม่สามารถรับเข้าได้" };
    }

    const stockSheet = findSheet(ss, "stock");
    if (!stockSheet) return { success: false, message: "ไม่พบฐานข้อมูลชีต Stock" };
    const stockRow = findStockRow_(stockSheet, sku, imei);
    if (!stockRow) return { success: false, message: "ไม่พบสินค้านี้ในชีต Stock all system กรุณาติดต่อผู้ดูแลระบบ" };
    // กันเผลอทับ Location Code ถ้าสินค้าถูกย้ายไปที่อื่นแล้วโดยวิธีอื่นระหว่างที่คำขอนี้ค้างอยู่ (ข้อมูลไม่ตรงกับตอนสร้างคำขอ)
    if (stockRow.locCode !== fromLocCode) {
      return { success: false, message: "ข้อมูลต้นทางในชีต Stock all system เปลี่ยนไปจากตอนสร้างคำขอ กรุณาติดต่อผู้ดูแลระบบเพื่อตรวจสอบ" };
    }

    // อัปเดตทั้ง Location Code (คอลัมน์ A) และ Location Name (คอลัมน์ B) ให้ตรงกับปลายทาง ไม่ใช่แค่ Location Code
    const toLocNameFresh = getLocNameByCode_(ss, toLocCode);
    stockSheet.getRange(stockRow.rowIndex, 1, 1, 2).setValues([[toLocCode, toLocNameFresh]]);

    const now = "'" + Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy HH:mm:ss");
    transferSheet.getRange(rowId, 10, 1, 3).setValues([[TRANSFER_STATUS_RECEIVED, now, session.locCode]]);

    const actorLocName = isAdmin ? "Admin" : getLocNameByCode_(ss, session.locCode);
    logAccess_(ss, session.locCode, actorLocName, session.role, "TRANSFER_RECEIVE",
      `SKU ${sku} IMEI ${imei}: รับเข้าที่ ${toLocCode}`);

    return { success: true, message: "รับสินค้าเข้าสาขาสำเร็จ อัปเดต Location Code เรียบร้อย" };
  } catch (err) {
    return { success: false, message: "เกิดข้อผิดพลาด: " + err.message };
  } finally {
    lock.releaseLock();
  }
}

// เหมือน receiveTransfer แต่รับเข้าได้ครั้งละหลาย rowId พร้อมกัน (ติ๊กเลือกจากตาราง) ภายใต้ lock เดียว
// แต่ละแถวตรวจสอบและเขียนแยกเป็นอิสระจากกัน — แถวไหนไม่ผ่านเงื่อนไข (สถานะเปลี่ยนไปแล้ว/ข้อมูลไม่ตรง ฯลฯ) จะถูกข้ามและรายงานเป็น error โดยไม่กระทบแถวอื่นที่ผ่าน
function receiveTransferBatch(token, rowIds) {
  const session = requireSession_(token);
  if (session.role === ROLE_VIEWER) {
    return { success: false, message: "บัญชีนี้เป็นบัญชีดูข้อมูลอย่างเดียว ไม่สามารถรับสินค้าเข้าได้" };
  }
  if (!Array.isArray(rowIds) || rowIds.length === 0) {
    return { success: false, message: "กรุณาเลือกรายการที่จะรับเข้าอย่างน้อย 1 รายการ" };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    return { success: false, message: "ระบบกำลังประมวลผลรายการอื่นอยู่ กรุณารอสักครู่แล้วลองใหม่" };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const transferSheet = getTransferSheet_(ss);
    if (!transferSheet) return { success: false, message: "ไม่พบชีต TransferRequests" };
    const stockSheet = findSheet(ss, "stock");
    if (!stockSheet) return { success: false, message: "ไม่พบฐานข้อมูลชีต Stock" };

    const isAdmin = session.locCode === ADMIN_SESSION_LOCCODE;
    const usedImeis = getUsedImeis_(ss);
    // สแกนชีต Stock ครั้งเดียวสร้าง index แทนการ findStockRow_ ต่อรายการ (กันสแกนทั้งชีตซ้ำ n รอบขณะถือ lock) — แต่ละแถวคำขออ้าง sku|imei ไม่ซ้ำกันในชุดเดียวกันอยู่แล้วจึงไม่กระทบผลลัพธ์
    const stockIndex = buildStockIndex_(stockSheet);
    const now = "'" + Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy HH:mm:ss");
    const uniqueRowIds = Array.from(new Set(rowIds.map(Number)));

    let successCount = 0;
    const errors = [];

    uniqueRowIds.forEach(function(rowId) {
      if (!Number.isInteger(rowId) || rowId < 2 || rowId > transferSheet.getLastRow()) {
        errors.push(`แถว ${rowId}: หมายเลขแถวไม่ถูกต้อง`); return;
      }
      const rowVals = transferSheet.getRange(rowId, 1, 1, 12).getDisplayValues()[0];
      const sku = (rowVals[1] || "").toString().trim();
      const imei = (rowVals[3] || "").toString().trim();
      const fromLocCode = (rowVals[4] || "").toString().trim();
      const toLocCode = (rowVals[6] || "").toString().trim();
      const status = (rowVals[9] || "").toString().trim();

      if (status !== TRANSFER_STATUS_PENDING) { errors.push(`IMEI ${imei || rowId}: คำขอนี้ถูกดำเนินการไปแล้ว หรือไม่อยู่ในสถานะที่รับเข้าได้`); return; }
      if (!isAdmin && session.locCode !== toLocCode) { errors.push(`IMEI ${imei}: คำขอนี้ไม่ได้ระบุปลายทางเป็นสาขาของคุณ`); return; }
      if (usedImeis.has(imei)) { errors.push(`IMEI ${imei}: ถูกทำรายการ ACT ไปแล้วระหว่างรอรับเข้า ไม่สามารถรับเข้าได้`); return; }

      const stockRow = stockIndex.get(`${sku}|${imei}`);
      if (!stockRow) { errors.push(`IMEI ${imei}: ไม่พบสินค้านี้ในชีต Stock all system กรุณาติดต่อผู้ดูแลระบบ`); return; }
      if (stockRow.locCode !== fromLocCode) { errors.push(`IMEI ${imei}: ข้อมูลต้นทางในชีต Stock all system เปลี่ยนไปจากตอนสร้างคำขอ`); return; }

      const toLocNameFresh = getLocNameByCode_(ss, toLocCode);
      stockSheet.getRange(stockRow.rowIndex, 1, 1, 2).setValues([[toLocCode, toLocNameFresh]]);
      transferSheet.getRange(rowId, 10, 1, 3).setValues([[TRANSFER_STATUS_RECEIVED, now, session.locCode]]);
      successCount++;
    });

    if (successCount > 0) {
      const actorLocName = isAdmin ? "Admin" : getLocNameByCode_(ss, session.locCode);
      logAccess_(ss, session.locCode, actorLocName, session.role, "TRANSFER_RECEIVE", `รับเข้า ${successCount} รายการ (เลือกหลายรายการ)`);
    }

    if (errors.length > 0) {
      return {
        success: successCount > 0,
        message: `รับเข้าสำเร็จ ${successCount} รายการ\nไม่สำเร็จ ${errors.length} รายการ:\n` + errors.join("\n")
      };
    }
    return { success: true, message: `รับเข้า ${successCount} รายการสำเร็จ อัปเดต Location Code เรียบร้อย` };
  } catch (err) {
    return { success: false, message: "เกิดข้อผิดพลาด: " + err.message };
  } finally {
    lock.releaseLock();
  }
}

// ยกเลิกคำขอโอนย้ายที่ยังไม่ถูกรับเข้า — ทำได้ทั้งสาขาต้นทาง (ผู้ขอ) และสาขาปลายทาง (ปฏิเสธ)
// ไม่แตะ Stock all system เลย เพราะสินค้ายังไม่เคยถูกย้าย LocCode จริง (ย้ายจริงตอนกด "รับเข้า" เท่านั้น)
// ใช้คอลัมน์ ReceivedAt/ReceivedBy ร่วมบันทึกเวลา/ผู้ยกเลิกด้วย เพราะคำขอหนึ่งจบที่สถานะปลายทางเดียวเสมอ (รับเข้า หรือ ยกเลิก อย่างใดอย่างหนึ่ง)
function cancelTransfer(token, rowId) {
  const session = requireSession_(token);
  if (session.role === ROLE_VIEWER) {
    return { success: false, message: "บัญชีนี้เป็นบัญชีดูข้อมูลอย่างเดียว ไม่สามารถยกเลิกคำขอโอนย้ายได้" };
  }
  rowId = Number(rowId);

  // ล็อกเหมือน receiveTransfer เพื่อกันแข่งกันเขียนแถวเดียวกันกับ "รับเข้า" พร้อมกัน (ไม่งั้นสถานะในชีต log กับ LocCode จริงอาจไม่ตรงกัน)
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    return { success: false, message: "ระบบกำลังประมวลผลรายการอื่นอยู่ กรุณารอสักครู่แล้วลองใหม่" };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const transferSheet = getTransferSheet_(ss);
    if (!transferSheet) return { success: false, message: "ไม่พบชีต TransferRequests" };
    if (!Number.isInteger(rowId) || rowId < 2 || rowId > transferSheet.getLastRow()) {
      return { success: false, message: "หมายเลขแถวไม่ถูกต้อง" };
    }

    const rowVals = transferSheet.getRange(rowId, 1, 1, 12).getDisplayValues()[0];
    const sku = (rowVals[1] || "").toString().trim();
    const imei = (rowVals[3] || "").toString().trim();
    const fromLocCode = (rowVals[4] || "").toString().trim();
    const toLocCode = (rowVals[6] || "").toString().trim();
    const status = (rowVals[9] || "").toString().trim();

    if (status !== TRANSFER_STATUS_PENDING) {
      return { success: false, message: "คำขอนี้ถูกดำเนินการไปแล้ว ไม่สามารถยกเลิกได้" };
    }
    const isAdmin = session.locCode === ADMIN_SESSION_LOCCODE;
    if (!isAdmin && session.locCode !== fromLocCode && session.locCode !== toLocCode) {
      return { success: false, message: "คุณไม่มีสิทธิ์ยกเลิกคำขอนี้" };
    }

    const now = "'" + Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy HH:mm:ss");
    transferSheet.getRange(rowId, 10, 1, 3).setValues([[TRANSFER_STATUS_CANCELLED, now, session.locCode]]);

    const actorLocName = isAdmin ? "Admin" : getLocNameByCode_(ss, session.locCode);
    logAccess_(ss, session.locCode, actorLocName, session.role, "TRANSFER_CANCEL",
      `SKU ${sku} IMEI ${imei}: ${fromLocCode} -> ${toLocCode} ถูกยกเลิก`);

    return { success: true, message: "ยกเลิกคำขอโอนย้ายสำเร็จ สินค้ายังคงอยู่ที่สาขาต้นทางเดิม" };
  } catch (err) {
    return { success: false, message: "เกิดข้อผิดพลาด: " + err.message };
  } finally {
    lock.releaseLock();
  }
}

// เหมือน cancelTransfer แต่ยกเลิกได้ครั้งละหลาย rowId พร้อมกัน (ติ๊กเลือกจากตาราง) ภายใต้ lock เดียว
// แต่ละแถวตรวจสอบและเขียนแยกเป็นอิสระจากกัน — แถวไหนไม่ผ่านเงื่อนไข (ถูกดำเนินการไปแล้ว/ไม่มีสิทธิ์) จะถูกข้ามและรายงานเป็น error โดยไม่กระทบแถวอื่นที่ผ่าน
function cancelTransferBatch(token, rowIds) {
  const session = requireSession_(token);
  if (session.role === ROLE_VIEWER) {
    return { success: false, message: "บัญชีนี้เป็นบัญชีดูข้อมูลอย่างเดียว ไม่สามารถยกเลิกคำขอโอนย้ายได้" };
  }
  if (!Array.isArray(rowIds) || rowIds.length === 0) {
    return { success: false, message: "กรุณาเลือกรายการที่จะยกเลิกอย่างน้อย 1 รายการ" };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    return { success: false, message: "ระบบกำลังประมวลผลรายการอื่นอยู่ กรุณารอสักครู่แล้วลองใหม่" };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const transferSheet = getTransferSheet_(ss);
    if (!transferSheet) return { success: false, message: "ไม่พบชีต TransferRequests" };

    const isAdmin = session.locCode === ADMIN_SESSION_LOCCODE;
    const now = "'" + Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy HH:mm:ss");
    const uniqueRowIds = Array.from(new Set(rowIds.map(Number)));

    let successCount = 0;
    const errors = [];

    uniqueRowIds.forEach(function(rowId) {
      if (!Number.isInteger(rowId) || rowId < 2 || rowId > transferSheet.getLastRow()) {
        errors.push(`แถว ${rowId}: หมายเลขแถวไม่ถูกต้อง`); return;
      }
      const rowVals = transferSheet.getRange(rowId, 1, 1, 12).getDisplayValues()[0];
      const imei = (rowVals[3] || "").toString().trim();
      const fromLocCode = (rowVals[4] || "").toString().trim();
      const toLocCode = (rowVals[6] || "").toString().trim();
      const status = (rowVals[9] || "").toString().trim();

      if (status !== TRANSFER_STATUS_PENDING) { errors.push(`IMEI ${imei || rowId}: คำขอนี้ถูกดำเนินการไปแล้ว ไม่สามารถยกเลิกได้`); return; }
      if (!isAdmin && session.locCode !== fromLocCode && session.locCode !== toLocCode) { errors.push(`IMEI ${imei}: คุณไม่มีสิทธิ์ยกเลิกคำขอนี้`); return; }

      transferSheet.getRange(rowId, 10, 1, 3).setValues([[TRANSFER_STATUS_CANCELLED, now, session.locCode]]);
      successCount++;
    });

    if (successCount > 0) {
      const actorLocName = isAdmin ? "Admin" : getLocNameByCode_(ss, session.locCode);
      logAccess_(ss, session.locCode, actorLocName, session.role, "TRANSFER_CANCEL", `ยกเลิก ${successCount} รายการ (เลือกหลายรายการ)`);
    }

    if (errors.length > 0) {
      return { success: successCount > 0, message: `ยกเลิกสำเร็จ ${successCount} รายการ\nไม่สำเร็จ ${errors.length} รายการ:\n` + errors.join("\n") };
    }
    return { success: true, message: `ยกเลิกคำขอ ${successCount} รายการสำเร็จ สินค้ายังคงอยู่ที่สาขาต้นทางเดิม` };
  } catch (err) {
    return { success: false, message: "เกิดข้อผิดพลาด: " + err.message };
  } finally {
    lock.releaseLock();
  }
}

// ================= ACT RECORD TRANSFER (โอนย้ายรายการ ACT ข้ามสาขา) =================
// แยกระบบจากโอนย้ายสต๊อกด้านบนเพราะทำงานคนละหน้า/คนละข้อมูลต้นทาง: อันนี้แก้ไข LocCode/LocName
// ของ "แถวรายการ ACT" ที่คีย์ไปแล้วในชีต "อยู่ระหว่างดำเนินการ" (ไม่ใช่สต๊อกที่ยังไม่ได้ ACT ในชีต Stock all system)
// ใช้หลักการเดียวกันทุกประการ: สร้างคำขอ -> ปลายทางกด "รับเข้า" หรือฝ่ายใดฝ่ายหนึ่งกด "ยกเลิก" — ไม่มีขั้นตอนอนุมัติเช่นเดียวกับด้านบน
// ค้นหาแถวรายการ ACT ด้วย IMEI (คอลัมน์ H) — IMEI ไม่ซ้ำกันในชีตนี้อยู่แล้ว (ดู getUsedImeis_) จึงใช้เป็นคีย์ค้นหาได้ตรงตัว
// ค้นหาสดทุกครั้งแทนการจำ rowIndex ไว้ เพราะ adminDeleteActRecord() ลบแถวได้ ทำให้ rowIndex ของแถวถัดไปเลื่อนขึ้น
function findActRecordRow_(actSheet, imei) {
  const data = actSheet.getDataRange().getDisplayValues();
  for (let i = 1; i < data.length; i++) {
    const rImei = data[i][7] ? data[i][7].toString().trim() : "";
    if (rImei === imei) {
      return {
        rowIndex: i + 1,
        sku: data[i][5] ? data[i][5].toString().trim() : "",
        desc: data[i][6] || "",
        locCode: data[i][3] ? data[i][3].toString().trim() : "",
        status: data[i][8] || ""
      };
    }
  }
  return null;
}

// สแกนชีต "อยู่ระหว่างดำเนินการ" ทั้งชีตครั้งเดียวแล้วสร้าง index (key: imei) ใช้แทนการเรียก findActRecordRow_ ซ้ำในลูปโอนย้ายแบบหลายรายการ (createActTransferRequest/receiveActTransferBatch)
// เหตุผลเดียวกับ buildStockIndex_ — กันสแกนทั้งชีตซ้ำต่อ 1 รายการขณะถือ script lock อยู่
function buildActRecordIndex_(actSheet) {
  const data = actSheet.getDataRange().getDisplayValues();
  const index = new Map();
  for (let i = 1; i < data.length; i++) {
    const rImei = data[i][7] ? data[i][7].toString().trim() : "";
    if (!rImei) continue;
    index.set(rImei, {
      rowIndex: i + 1,
      sku: data[i][5] ? data[i][5].toString().trim() : "",
      desc: data[i][6] || "",
      locCode: data[i][3] ? data[i][3].toString().trim() : "",
      status: data[i][8] || ""
    });
  }
  return index;
}

// รายการ ACT ของสาขาที่ระบุ — ใช้เติม dropdown SKU/IMEI ในฟอร์มสร้างคำขอโอนย้ายรายการ ACT (หน้าคนละหน้ากับโอนย้ายสต๊อก)
function getActRecordsByBranch(token, locCode) {
  const session = requireSession_(token);
  // ห้ามเชื่อ locCode ที่ client ส่งมาเฉยๆ ต้องตรงกับสาขาของ session เท่านั้น กันสาขาอื่นแอบดูรายการ ACT ข้ามสาขา (เช่นเดียวกับ getStockByBranch)
  if ((locCode || "").toString().trim() !== session.locCode) return [];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = findSheet(ss, "อยู่ระหว่างดำเนินการ");
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getDisplayValues();
  const result = [];
  for (let i = 0; i < data.length; i++) {
    const rLoc = data[i][3] ? data[i][3].toString().trim() : "";
    const rImei = data[i][7] ? data[i][7].toString().trim() : "";
    if (rLoc === locCode && rImei !== "") {
      result.push({ sku: data[i][5], desc: data[i][6], imei: rImei, status: data[i][8] || "" });
    }
  }
  return result;
}

// สร้างคำขอโอนย้ายรายการ ACT ได้ครั้งละหลายรายการ (items = [{imei}, ...] ปลายทางเดียวกันทั้งชุด):
// ตรวจว่า IMEI มีอยู่จริงในชีต "อยู่ระหว่างดำเนินการ" ที่สาขาของผู้ขอ, ปลายทางมีอยู่จริง,
// และไม่ซ้ำกับคำขอที่ยังไม่เสร็จสิ้นของรายการเดียวกัน — ตรวจสอบทุกรายการก่อน ถ้ามีรายการใดผิดพลาดจะไม่สร้างคำขอเลยแม้แต่รายการเดียว — ไม่มีขั้นตอนอนุมัติ รอแค่ปลายทางกด "รับเข้า"
function createActTransferRequest(token, items, toLocCode) {
  const session = requireSession_(token);
  if (session.locCode === ADMIN_SESSION_LOCCODE) {
    return { success: false, message: "บัญชี Admin ไม่มีสาขา ไม่สามารถขอโอนย้ายรายการ ACT ได้" };
  }
  if (session.role === ROLE_VIEWER) {
    return { success: false, message: "บัญชีนี้เป็นบัญชีดูข้อมูลอย่างเดียว ไม่สามารถขอโอนย้ายรายการ ACT ได้" };
  }
  toLocCode = (toLocCode || "").toString().trim();
  if (!toLocCode) {
    return { success: false, message: "กรุณาเลือกรหัสสาขาปลายทางให้ครบถ้วน" };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { success: false, message: "กรุณาเลือกรายการอย่างน้อย 1 รายการ" };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    return { success: false, message: "ระบบกำลังประมวลผลคำขออื่นอยู่ กรุณารอสักครู่แล้วลองใหม่" };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const actSheet = findSheet(ss, "อยู่ระหว่างดำเนินการ");
    if (!actSheet) return { success: false, message: "ไม่พบฐานข้อมูลชีต 'อยู่ระหว่างดำเนินการ'" };

    const toLocName = getLocNameByCode_(ss, toLocCode);
    if (!toLocName) return { success: false, message: "ไม่พบรหัสสาขาปลายทางนี้ในระบบ" };
    if (getUsersLocCodes_(ss).indexOf(toLocCode) === -1) {
      return { success: false, message: "รหัสสาขาปลายทางนี้ยังไม่มีบัญชีผู้ใช้ (Users) ในระบบ ไม่สามารถโอนย้ายไปได้" };
    }

    const actTransferSheet = getActTransferSheet_(ss);
    if (!actTransferSheet) return { success: false, message: "ไม่พบชีต ActRecordTransfers — กรุณาให้ผู้ดูแลระบบรัน setupActTransferSheet() ก่อน" };

    const existingPendingImeis = new Set();
    if (actTransferSheet.getLastRow() > 1) {
      const existing = actTransferSheet.getRange(2, 1, actTransferSheet.getLastRow() - 1, 10).getDisplayValues();
      existing.forEach(function(r) {
        const eImei = (r[3] || "").toString().trim();
        const eStatus = (r[9] || "").toString().trim();
        if (eStatus === TRANSFER_STATUS_PENDING) existingPendingImeis.add(eImei);
      });
    }

    // สแกนชีต "อยู่ระหว่างดำเนินการ" ครั้งเดียวสร้าง index แทนการ findActRecordRow_ ต่อรายการ (กันสแกนทั้งชีตซ้ำ n รอบขณะถือ lock)
    const actIndex = buildActRecordIndex_(actSheet);

    const now = "'" + Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy HH:mm:ss");
    const seenImeis = new Set();
    const rowsToInsert = [];
    const errors = [];

    items.forEach(function(item, idx) {
      const imei = ((item && item.imei) || "").toString().trim();
      if (!imei) { errors.push(`รายการที่ ${idx + 1}: กรุณาเลือก IMEI`); return; }
      if (seenImeis.has(imei)) { errors.push(`รายการที่ ${idx + 1} (IMEI: ${imei}): ถูกเลือกซ้ำในคำขอนี้`); return; }
      seenImeis.add(imei);

      const actRow = actIndex.get(imei);
      if (!actRow) { errors.push(`รายการที่ ${idx + 1} (IMEI: ${imei}): ไม่พบรายการ ACT นี้ในระบบ`); return; }
      // บังคับต้นทางต้องเป็นสาขาของผู้ขอเองเท่านั้น (ฝั่ง client ล็อก dropdown ไว้แล้ว แต่ server ต้องเช็กซ้ำ กัน google.script.run ถูกเรียกตรงข้ามคำสั่งฝั่งเว็บ)
      if (actRow.locCode !== session.locCode) { errors.push(`รายการที่ ${idx + 1} (IMEI: ${imei}): รายการนี้ไม่ได้อยู่ที่สาขาของคุณ`); return; }
      if (actRow.locCode === toLocCode) { errors.push(`รายการที่ ${idx + 1} (IMEI: ${imei}): รายการนี้อยู่ที่ปลายทางนี้อยู่แล้ว`); return; }
      if (existingPendingImeis.has(imei)) { errors.push(`รายการที่ ${idx + 1} (IMEI: ${imei}): มีคำขอโอนย้ายที่ยังไม่เสร็จสิ้นค้างอยู่แล้ว`); return; }

      const fromLocName = actRow.locCode ? getLocNameByCode_(ss, actRow.locCode) : "";
      rowsToInsert.push([now, actRow.sku, actRow.desc, imei, actRow.locCode, fromLocName, toLocCode, toLocName, session.locCode, TRANSFER_STATUS_PENDING, "", ""]);
    });

    if (errors.length > 0) return { success: false, message: "ตรวจพบข้อผิดพลาด:\n" + errors.join("\n") };

    rowsToInsert.forEach(function(row) { actTransferSheet.appendRow(row); });
    SpreadsheetApp.flush();

    logAccess_(ss, session.locCode, getLocNameByCode_(ss, session.locCode), session.role, "ACT_TRANSFER_REQUEST",
      `${rowsToInsert.length} รายการ: ${session.locCode} -> ${toLocCode}`);

    return { success: true, message: `สร้างคำขอโอนย้ายรายการ ACT ${rowsToInsert.length} รายการสำเร็จ รอสาขาปลายทางกดรับเข้า` };
  } catch (err) {
    return { success: false, message: "เกิดข้อผิดพลาด: " + err.message };
  } finally {
    lock.releaseLock();
  }
}

// รายการโอนย้ายรายการ ACT ของสาขาที่ login อยู่ — incoming = ปลายทางคือสาขานี้, outgoing = สาขานี้เป็นผู้ขอ
function getMyActTransfers(token) {
  const session = requireSession_(token);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getActTransferSheet_(ss);
  if (!sheet || sheet.getLastRow() <= 1) return { incoming: [], outgoing: [] };

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getDisplayValues();
  let incoming = [], outgoing = [];
  data.forEach(function(r, idx) {
    const rowId = idx + 2;
    const toLoc = (r[6] || "").toString().trim();
    const reqBy = (r[8] || "").toString().trim();
    if (toLoc === session.locCode) incoming.push(mapTransferRow_(r, rowId));
    if (reqBy === session.locCode) outgoing.push(mapTransferRow_(r, rowId));
  });
  incoming.sort(function(a, b) { return b.rowId - a.rowId; });
  outgoing.sort(function(a, b) { return b.rowId - a.rowId; });
  return { incoming: incoming, outgoing: outgoing };
}

// สาขาปลายทางกดรับรายการเข้า: อัปเดต LocCode/LocName ในชีต "อยู่ระหว่างดำเนินการ" ให้เป็นปลายทาง แล้วปิดคำขอเป็น "รับเข้าแล้ว"
// อนุญาตให้ Admin รับแทนได้ด้วย (กรณีสาขาปลายทางไม่สะดวกเข้าระบบ)
function receiveActTransfer(token, rowId) {
  const session = requireSession_(token);
  if (session.role === ROLE_VIEWER) {
    return { success: false, message: "บัญชีนี้เป็นบัญชีดูข้อมูลอย่างเดียว ไม่สามารถรับรายการเข้าได้" };
  }
  rowId = Number(rowId);

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    return { success: false, message: "ระบบกำลังประมวลผลรายการอื่นอยู่ กรุณารอสักครู่แล้วลองใหม่" };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const actTransferSheet = getActTransferSheet_(ss);
    if (!actTransferSheet) return { success: false, message: "ไม่พบชีต ActRecordTransfers" };
    if (!Number.isInteger(rowId) || rowId < 2 || rowId > actTransferSheet.getLastRow()) {
      return { success: false, message: "หมายเลขแถวไม่ถูกต้อง" };
    }

    const rowVals = actTransferSheet.getRange(rowId, 1, 1, 12).getDisplayValues()[0];
    const sku = (rowVals[1] || "").toString().trim();
    const imei = (rowVals[3] || "").toString().trim();
    const fromLocCode = (rowVals[4] || "").toString().trim();
    const toLocCode = (rowVals[6] || "").toString().trim();
    const status = (rowVals[9] || "").toString().trim();

    if (status !== TRANSFER_STATUS_PENDING) {
      return { success: false, message: "คำขอนี้ถูกดำเนินการไปแล้ว หรือไม่อยู่ในสถานะที่รับเข้าได้" };
    }
    const isAdmin = session.locCode === ADMIN_SESSION_LOCCODE;
    if (!isAdmin && session.locCode !== toLocCode) {
      return { success: false, message: "คำขอนี้ไม่ได้ระบุปลายทางเป็นสาขาของคุณ" };
    }

    const actSheet = findSheet(ss, "อยู่ระหว่างดำเนินการ");
    if (!actSheet) return { success: false, message: "ไม่พบฐานข้อมูลชีต 'อยู่ระหว่างดำเนินการ'" };
    const actRow = findActRecordRow_(actSheet, imei);
    if (!actRow) return { success: false, message: "ไม่พบรายการ ACT นี้ในระบบ กรุณาติดต่อผู้ดูแลระบบ" };
    // กันเผลอทับ Location Code ถ้ารายการถูกย้ายไปที่อื่นแล้วโดยวิธีอื่นระหว่างที่คำขอนี้ค้างอยู่ (ข้อมูลไม่ตรงกับตอนสร้างคำขอ)
    if (actRow.locCode !== fromLocCode) {
      return { success: false, message: "ข้อมูลต้นทางของรายการนี้เปลี่ยนไปจากตอนสร้างคำขอ กรุณาติดต่อผู้ดูแลระบบเพื่อตรวจสอบ" };
    }

    // อัปเดตทั้ง Location Code (คอลัมน์ D) และ Location Name (คอลัมน์ E) ของแถว ACT ให้ตรงกับปลายทาง
    const toLocNameFresh = getLocNameByCode_(ss, toLocCode);
    actSheet.getRange(actRow.rowIndex, 4, 1, 2).setValues([[toLocCode, toLocNameFresh]]);

    const now = "'" + Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy HH:mm:ss");
    actTransferSheet.getRange(rowId, 10, 1, 3).setValues([[TRANSFER_STATUS_RECEIVED, now, session.locCode]]);

    const actorLocName = isAdmin ? "Admin" : getLocNameByCode_(ss, session.locCode);
    logAccess_(ss, session.locCode, actorLocName, session.role, "ACT_TRANSFER_RECEIVE",
      `SKU ${sku} IMEI ${imei}: รับเข้าที่ ${toLocCode}`);

    return { success: true, message: "รับรายการ ACT เข้าสาขาสำเร็จ อัปเดต Location Code เรียบร้อย" };
  } catch (err) {
    return { success: false, message: "เกิดข้อผิดพลาด: " + err.message };
  } finally {
    lock.releaseLock();
  }
}

// เหมือน receiveActTransfer แต่รับเข้าได้ครั้งละหลาย rowId พร้อมกัน (ติ๊กเลือกจากตาราง) ภายใต้ lock เดียว
// แต่ละแถวตรวจสอบและเขียนแยกเป็นอิสระจากกัน — แถวไหนไม่ผ่านเงื่อนไขจะถูกข้ามและรายงานเป็น error โดยไม่กระทบแถวอื่นที่ผ่าน
function receiveActTransferBatch(token, rowIds) {
  const session = requireSession_(token);
  if (session.role === ROLE_VIEWER) {
    return { success: false, message: "บัญชีนี้เป็นบัญชีดูข้อมูลอย่างเดียว ไม่สามารถรับรายการเข้าได้" };
  }
  if (!Array.isArray(rowIds) || rowIds.length === 0) {
    return { success: false, message: "กรุณาเลือกรายการที่จะรับเข้าอย่างน้อย 1 รายการ" };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    return { success: false, message: "ระบบกำลังประมวลผลรายการอื่นอยู่ กรุณารอสักครู่แล้วลองใหม่" };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const actTransferSheet = getActTransferSheet_(ss);
    if (!actTransferSheet) return { success: false, message: "ไม่พบชีต ActRecordTransfers" };
    const actSheet = findSheet(ss, "อยู่ระหว่างดำเนินการ");
    if (!actSheet) return { success: false, message: "ไม่พบฐานข้อมูลชีต 'อยู่ระหว่างดำเนินการ'" };

    const isAdmin = session.locCode === ADMIN_SESSION_LOCCODE;
    // สแกนชีต "อยู่ระหว่างดำเนินการ" ครั้งเดียวสร้าง index แทนการ findActRecordRow_ ต่อรายการ (กันสแกนทั้งชีตซ้ำ n รอบขณะถือ lock)
    const actIndex = buildActRecordIndex_(actSheet);
    const now = "'" + Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy HH:mm:ss");
    const uniqueRowIds = Array.from(new Set(rowIds.map(Number)));

    let successCount = 0;
    const errors = [];

    uniqueRowIds.forEach(function(rowId) {
      if (!Number.isInteger(rowId) || rowId < 2 || rowId > actTransferSheet.getLastRow()) {
        errors.push(`แถว ${rowId}: หมายเลขแถวไม่ถูกต้อง`); return;
      }
      const rowVals = actTransferSheet.getRange(rowId, 1, 1, 12).getDisplayValues()[0];
      const imei = (rowVals[3] || "").toString().trim();
      const fromLocCode = (rowVals[4] || "").toString().trim();
      const toLocCode = (rowVals[6] || "").toString().trim();
      const status = (rowVals[9] || "").toString().trim();

      if (status !== TRANSFER_STATUS_PENDING) { errors.push(`IMEI ${imei || rowId}: คำขอนี้ถูกดำเนินการไปแล้ว หรือไม่อยู่ในสถานะที่รับเข้าได้`); return; }
      if (!isAdmin && session.locCode !== toLocCode) { errors.push(`IMEI ${imei}: คำขอนี้ไม่ได้ระบุปลายทางเป็นสาขาของคุณ`); return; }

      const actRow = actIndex.get(imei);
      if (!actRow) { errors.push(`IMEI ${imei}: ไม่พบรายการ ACT นี้ในระบบ กรุณาติดต่อผู้ดูแลระบบ`); return; }
      if (actRow.locCode !== fromLocCode) { errors.push(`IMEI ${imei}: ข้อมูลต้นทางของรายการนี้เปลี่ยนไปจากตอนสร้างคำขอ`); return; }

      const toLocNameFresh = getLocNameByCode_(ss, toLocCode);
      actSheet.getRange(actRow.rowIndex, 4, 1, 2).setValues([[toLocCode, toLocNameFresh]]);
      actTransferSheet.getRange(rowId, 10, 1, 3).setValues([[TRANSFER_STATUS_RECEIVED, now, session.locCode]]);
      successCount++;
    });

    if (successCount > 0) {
      const actorLocName = isAdmin ? "Admin" : getLocNameByCode_(ss, session.locCode);
      logAccess_(ss, session.locCode, actorLocName, session.role, "ACT_TRANSFER_RECEIVE", `รับเข้า ${successCount} รายการ (เลือกหลายรายการ)`);
    }

    if (errors.length > 0) {
      return {
        success: successCount > 0,
        message: `รับเข้าสำเร็จ ${successCount} รายการ\nไม่สำเร็จ ${errors.length} รายการ:\n` + errors.join("\n")
      };
    }
    return { success: true, message: `รับเข้า ${successCount} รายการสำเร็จ อัปเดต Location Code เรียบร้อย` };
  } catch (err) {
    return { success: false, message: "เกิดข้อผิดพลาด: " + err.message };
  } finally {
    lock.releaseLock();
  }
}

// ยกเลิกคำขอโอนย้ายรายการ ACT ที่ยังไม่ถูกรับเข้า — ทำได้ทั้งสาขาต้นทาง (ผู้ขอ) และสาขาปลายทาง (ปฏิเสธ)
// ไม่แตะชีต "อยู่ระหว่างดำเนินการ" เลย เพราะรายการยังไม่เคยถูกย้าย LocCode จริง (ย้ายจริงตอนกด "รับเข้า" เท่านั้น)
function cancelActTransfer(token, rowId) {
  const session = requireSession_(token);
  if (session.role === ROLE_VIEWER) {
    return { success: false, message: "บัญชีนี้เป็นบัญชีดูข้อมูลอย่างเดียว ไม่สามารถยกเลิกคำขอโอนย้ายได้" };
  }
  rowId = Number(rowId);

  // ล็อกเหมือน receiveActTransfer เพื่อกันแข่งกันเขียนแถวเดียวกันกับ "รับเข้า" พร้อมกัน (ไม่งั้นสถานะในชีต log กับ LocCode จริงอาจไม่ตรงกัน)
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    return { success: false, message: "ระบบกำลังประมวลผลรายการอื่นอยู่ กรุณารอสักครู่แล้วลองใหม่" };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const actTransferSheet = getActTransferSheet_(ss);
    if (!actTransferSheet) return { success: false, message: "ไม่พบชีต ActRecordTransfers" };
    if (!Number.isInteger(rowId) || rowId < 2 || rowId > actTransferSheet.getLastRow()) {
      return { success: false, message: "หมายเลขแถวไม่ถูกต้อง" };
    }

    const rowVals = actTransferSheet.getRange(rowId, 1, 1, 12).getDisplayValues()[0];
    const sku = (rowVals[1] || "").toString().trim();
    const imei = (rowVals[3] || "").toString().trim();
    const fromLocCode = (rowVals[4] || "").toString().trim();
    const toLocCode = (rowVals[6] || "").toString().trim();
    const status = (rowVals[9] || "").toString().trim();

    if (status !== TRANSFER_STATUS_PENDING) {
      return { success: false, message: "คำขอนี้ถูกดำเนินการไปแล้ว ไม่สามารถยกเลิกได้" };
    }
    const isAdmin = session.locCode === ADMIN_SESSION_LOCCODE;
    if (!isAdmin && session.locCode !== fromLocCode && session.locCode !== toLocCode) {
      return { success: false, message: "คุณไม่มีสิทธิ์ยกเลิกคำขอนี้" };
    }

    const now = "'" + Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy HH:mm:ss");
    actTransferSheet.getRange(rowId, 10, 1, 3).setValues([[TRANSFER_STATUS_CANCELLED, now, session.locCode]]);

    const actorLocName = isAdmin ? "Admin" : getLocNameByCode_(ss, session.locCode);
    logAccess_(ss, session.locCode, actorLocName, session.role, "ACT_TRANSFER_CANCEL",
      `SKU ${sku} IMEI ${imei}: ${fromLocCode} -> ${toLocCode} ถูกยกเลิก`);

    return { success: true, message: "ยกเลิกคำขอโอนย้ายรายการ ACT สำเร็จ ข้อมูลยังคงอยู่ที่สาขาต้นทางเดิม" };
  } catch (err) {
    return { success: false, message: "เกิดข้อผิดพลาด: " + err.message };
  } finally {
    lock.releaseLock();
  }
}

// เหมือน cancelActTransfer แต่ยกเลิกได้ครั้งละหลาย rowId พร้อมกัน (ติ๊กเลือกจากตาราง) ภายใต้ lock เดียว
// แต่ละแถวตรวจสอบและเขียนแยกเป็นอิสระจากกัน — แถวไหนไม่ผ่านเงื่อนไขจะถูกข้ามและรายงานเป็น error โดยไม่กระทบแถวอื่นที่ผ่าน
function cancelActTransferBatch(token, rowIds) {
  const session = requireSession_(token);
  if (session.role === ROLE_VIEWER) {
    return { success: false, message: "บัญชีนี้เป็นบัญชีดูข้อมูลอย่างเดียว ไม่สามารถยกเลิกคำขอโอนย้ายได้" };
  }
  if (!Array.isArray(rowIds) || rowIds.length === 0) {
    return { success: false, message: "กรุณาเลือกรายการที่จะยกเลิกอย่างน้อย 1 รายการ" };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    return { success: false, message: "ระบบกำลังประมวลผลรายการอื่นอยู่ กรุณารอสักครู่แล้วลองใหม่" };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const actTransferSheet = getActTransferSheet_(ss);
    if (!actTransferSheet) return { success: false, message: "ไม่พบชีต ActRecordTransfers" };

    const isAdmin = session.locCode === ADMIN_SESSION_LOCCODE;
    const now = "'" + Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy HH:mm:ss");
    const uniqueRowIds = Array.from(new Set(rowIds.map(Number)));

    let successCount = 0;
    const errors = [];

    uniqueRowIds.forEach(function(rowId) {
      if (!Number.isInteger(rowId) || rowId < 2 || rowId > actTransferSheet.getLastRow()) {
        errors.push(`แถว ${rowId}: หมายเลขแถวไม่ถูกต้อง`); return;
      }
      const rowVals = actTransferSheet.getRange(rowId, 1, 1, 12).getDisplayValues()[0];
      const imei = (rowVals[3] || "").toString().trim();
      const fromLocCode = (rowVals[4] || "").toString().trim();
      const toLocCode = (rowVals[6] || "").toString().trim();
      const status = (rowVals[9] || "").toString().trim();

      if (status !== TRANSFER_STATUS_PENDING) { errors.push(`IMEI ${imei || rowId}: คำขอนี้ถูกดำเนินการไปแล้ว ไม่สามารถยกเลิกได้`); return; }
      if (!isAdmin && session.locCode !== fromLocCode && session.locCode !== toLocCode) { errors.push(`IMEI ${imei}: คุณไม่มีสิทธิ์ยกเลิกคำขอนี้`); return; }

      actTransferSheet.getRange(rowId, 10, 1, 3).setValues([[TRANSFER_STATUS_CANCELLED, now, session.locCode]]);
      successCount++;
    });

    if (successCount > 0) {
      const actorLocName = isAdmin ? "Admin" : getLocNameByCode_(ss, session.locCode);
      logAccess_(ss, session.locCode, actorLocName, session.role, "ACT_TRANSFER_CANCEL", `ยกเลิก ${successCount} รายการ (เลือกหลายรายการ)`);
    }

    if (errors.length > 0) {
      return { success: successCount > 0, message: `ยกเลิกสำเร็จ ${successCount} รายการ\nไม่สำเร็จ ${errors.length} รายการ:\n` + errors.join("\n") };
    }
    return { success: true, message: `ยกเลิกคำขอโอนย้ายรายการ ACT ${successCount} รายการสำเร็จ ข้อมูลยังคงอยู่ที่สาขาต้นทางเดิม` };
  } catch (err) {
    return { success: false, message: "เกิดข้อผิดพลาด: " + err.message };
  } finally {
    lock.releaseLock();
  }
}

// ================= ADMIN: แก้ไข/ลบข้อมูล ACT (หน้า "ข้อมูลACTทั้งหมด") =================
function adminUpdateActRecord(adminToken, rowId, fields) {
  requireAdminSession_(adminToken);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = findSheet(ss, "อยู่ระหว่างดำเนินการ");
  if (!sheet) return { success: false, message: "ไม่พบฐานข้อมูลชีต 'อยู่ระหว่างดำเนินการ'" };

  rowId = Number(rowId);
  if (!Number.isInteger(rowId) || rowId < 2 || rowId > sheet.getLastRow()) {
    return { success: false, message: "หมายเลขแถวไม่ถูกต้อง" };
  }

  fields = fields || {};
  const codeMyOppo = (fields.codeMyOppo || "").toString().trim();
  const cutBarcode = (fields.cutBarcode || "").toString().trim();
  const suggestPrice = (fields.suggestPrice || "").toString().trim();
  const allowedStatus = ["ยังไม่ขาย", "ขายแล้ว"];
  const status = allowedStatus.indexOf(fields.status) !== -1 ? fields.status : "ยังไม่ขาย";

  let formattedActDate = (fields.actDate || "").toString().trim();
  const actD = formattedActDate.split('-');
  if (actD.length === 3) formattedActDate = "'" + actD[2] + "/" + actD[1] + "/" + actD[0];

  // sku/imei/desc ผูกกับสต๊อกจริงที่ถูกตัดตอนคีย์ ACT ไว้แล้ว ไม่อนุญาตให้แก้ไขผ่านช่องทางนี้ (กันข้อมูลไม่ตรงกับ Stock/ชนกับแถวอื่น) — อ่านไว้แค่สำหรับ log
  const oldVals = sheet.getRange(rowId, 6, 1, 4).getDisplayValues()[0]; // sku, desc, imei, status เดิม

  sheet.getRange(rowId, 2).setValue(formattedActDate);
  sheet.getRange(rowId, 9).setValue(status);
  sheet.getRange(rowId, 10).setValue("'" + codeMyOppo);
  sheet.getRange(rowId, 14).setValue(cutBarcode);
  sheet.getRange(rowId, 15).setValue(suggestPrice);

  logAccess_(ss, ADMIN_SESSION_LOCCODE, "Admin", "admin", "EDIT_ACT_RECORD",
    `แถว ${rowId}: IMEI ${oldVals[2]} (${oldVals[0]}) สถานะ ${oldVals[3]} -> ${status}`);

  return { success: true, message: "แก้ไขรายการสำเร็จ" };
}

function adminDeleteActRecord(adminToken, rowId) {
  requireAdminSession_(adminToken);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = findSheet(ss, "อยู่ระหว่างดำเนินการ");
  if (!sheet) return { success: false, message: "ไม่พบฐานข้อมูลชีต 'อยู่ระหว่างดำเนินการ'" };

  rowId = Number(rowId);
  if (!Number.isInteger(rowId) || rowId < 2 || rowId > sheet.getLastRow()) {
    return { success: false, message: "หมายเลขแถวไม่ถูกต้อง" };
  }

  const rowVals = sheet.getRange(rowId, 6, 1, 3).getDisplayValues()[0]; // sku, desc, imei
  sheet.deleteRow(rowId);

  logAccess_(ss, ADMIN_SESSION_LOCCODE, "Admin", "admin", "DELETE_ACT_RECORD",
    `แถว ${rowId}: IMEI ${rowVals[2]} (${rowVals[0]})`);

  return { success: true, message: "ลบรายการสำเร็จ" };
}

// ================= ADMIN SETTINGS (gate ด้วยระบบ login Admin แยกต่างหาก) =================
function adminGetSettings(adminToken) {
  requireAdminSession_(adminToken);
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const usersSheet = getUsersSheet_(ss);
  let users = [];
  if (usersSheet && usersSheet.getLastRow() > 1) {
    const data = usersSheet.getRange(2, 1, usersSheet.getLastRow() - 1, 6).getDisplayValues();
    users = data
      .map(function(r) {
        return {
          locCode: (r[0] || "").toString().trim(),
          lastPasswordChangedDate: r[3] || "",
          active: (r[4] || "").toString().trim().toUpperCase() === "TRUE",
          role: (r[5] || "").toString().trim() || ROLE_NORMAL
        };
      })
      .filter(function(u) { return u.locCode !== ""; });
  }

  const annSheet = findSheet(ss, "ประกาศ");
  let announcement = { title: "", detail: "" };
  if (annSheet && annSheet.getLastRow() > 1) {
    const a = annSheet.getRange(2, 1, 1, 2).getDisplayValues()[0];
    announcement = { title: a[0] || "", detail: a[1] || "" };
  }

  const promoSheet = findSheet(ss, "ข่าวสารโปรโมชั่น");
  let promotions = [];
  if (promoSheet && promoSheet.getLastRow() > 1) {
    promotions = promoSheet.getRange(2, 1, promoSheet.getLastRow() - 1, 3).getDisplayValues()
      .map(function(r) { return { title: r[0] || "", detail: r[1] || "", link: r[2] || "" }; })
      .filter(function(p) { return p.title !== ""; });
  }

  const timeSheet = findSheet(ss, "time");
  let timeWindow = { start: "", end: "" };
  if (timeSheet && timeSheet.getLastRow() > 1) {
    const t = timeSheet.getRange(2, 1, 1, 2).getDisplayValues()[0];
    timeWindow = { start: t[0] || "", end: t[1] || "" };
  }
  const requireCodeMyOppo = isRequireCodeMyOppo_(ss);

  return { success: true, users: users, announcement: announcement, promotions: promotions, timeWindow: timeWindow, requireCodeMyOppo: requireCodeMyOppo };
}

// role: ระบุเฉพาะตอนสร้างบัญชีใหม่เท่านั้น (ค่าเริ่มต้น ROLE_NORMAL ถ้าไม่ระบุ) — ตอนรีเซ็ตรหัสผ่านบัญชีเดิม
// จะไม่แตะคอลัมน์ Role เลย กัน bug ที่รีเซ็ตรหัสผ่านแล้วสิทธิ์ "พิเศษ" ที่ตั้งไว้หลุดกลับเป็นทั่วไปโดยไม่ตั้งใจ
// เปลี่ยนสิทธิ์ของบัญชีที่มีอยู่แล้วให้ใช้ adminSetUserRole แทน
function adminUpsertUser(adminToken, locCode, newPassword, role) {
  requireAdminSession_(adminToken);
  locCode = (locCode || "").toString().trim();
  newPassword = (newPassword || "").toString();
  if (!locCode) return { success: false, message: "กรุณากรอกรหัสสาขา (LocCode)" };
  if (newPassword.length < 4) return { success: false, message: "รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร" };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = getUsersSheet_(ss);
  if (!usersSheet) return { success: false, message: "ไม่พบชีต Users" };

  const salt = Utilities.getUuid();
  const hash = hashPassword_(newPassword, salt);
  const today = Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy");
  const newAccountRole = (role === ROLE_VIEWER) ? ROLE_VIEWER : ROLE_NORMAL;

  const existing = usersSheet.getLastRow() > 1
    ? usersSheet.getRange(2, 1, usersSheet.getLastRow() - 1, 1).getDisplayValues().map(function(r) { return (r[0] || "").toString().trim(); })
    : [];
  const idx = existing.indexOf(locCode);

  if (idx !== -1) {
    usersSheet.getRange(idx + 2, 2, 1, 4).setValues([[hash, salt, today, "TRUE"]]);
  } else {
    usersSheet.appendRow([locCode, hash, salt, today, "TRUE", newAccountRole]);
  }

  // เปลี่ยนรหัสผ่านแล้วเพิกถอน session เดิมของสาขานี้ทั้งหมด บังคับ login ใหม่
  const sessionsSheet = getSessionsSheet_(ss);
  if (sessionsSheet && sessionsSheet.getLastRow() > 1) {
    const sessData = sessionsSheet.getRange(2, 1, sessionsSheet.getLastRow() - 1, 2).getDisplayValues();
    for (let r = sessData.length - 1; r >= 0; r--) {
      if ((sessData[r][1] || "").toString().trim() === locCode) {
        sessionsSheet.deleteRow(r + 2);
      }
    }
  }

  return { success: true, message: "บันทึกบัญชี " + locCode + " สำเร็จ" };
}

function adminSetUserActive(adminToken, locCode, active) {
  requireAdminSession_(adminToken);
  locCode = (locCode || "").toString().trim();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = getUsersSheet_(ss);
  if (!usersSheet || usersSheet.getLastRow() <= 1) return { success: false, message: "ไม่พบบัญชีผู้ใช้" };

  const data = usersSheet.getRange(2, 1, usersSheet.getLastRow() - 1, 1).getDisplayValues();
  for (let i = 0; i < data.length; i++) {
    if ((data[i][0] || "").toString().trim() === locCode) {
      usersSheet.getRange(i + 2, 5).setValue(active ? "TRUE" : "FALSE");

      if (!active) {
        // ปิดใช้งานบัญชีแล้วเพิกถอน session ที่ค้างอยู่ทั้งหมดของสาขานี้
        const sessionsSheet = getSessionsSheet_(ss);
        if (sessionsSheet && sessionsSheet.getLastRow() > 1) {
          const sessData = sessionsSheet.getRange(2, 1, sessionsSheet.getLastRow() - 1, 2).getDisplayValues();
          for (let r = sessData.length - 1; r >= 0; r--) {
            if ((sessData[r][1] || "").toString().trim() === locCode) {
              sessionsSheet.deleteRow(r + 2);
            }
          }
        }
      }
      return { success: true, message: "อัปเดตสถานะบัญชี " + locCode + " สำเร็จ" };
    }
  }
  return { success: false, message: "ไม่พบบัญชี " + locCode };
}

// เปลี่ยนสิทธิ์บัญชีสาขาที่มีอยู่แล้ว (ทั่วไป <-> พิเศษ) โดยไม่แตะรหัสผ่าน
// ไม่ต้องเพิกถอน session เดิม เพราะ resolveSession_ อ่าน Role สดจากชีต Users ทุกครั้ง เปลี่ยนแล้วมีผลทันที
function adminSetUserRole(adminToken, locCode, role) {
  requireAdminSession_(adminToken);
  locCode = (locCode || "").toString().trim();
  const roleValue = (role === ROLE_VIEWER) ? ROLE_VIEWER : ROLE_NORMAL;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = getUsersSheet_(ss);
  if (!usersSheet || usersSheet.getLastRow() <= 1) return { success: false, message: "ไม่พบบัญชีผู้ใช้" };

  const data = usersSheet.getRange(2, 1, usersSheet.getLastRow() - 1, 1).getDisplayValues();
  for (let i = 0; i < data.length; i++) {
    if ((data[i][0] || "").toString().trim() === locCode) {
      usersSheet.getRange(i + 2, 6).setValue(roleValue);
      return { success: true, message: "อัปเดตสิทธิ์บัญชี " + locCode + " เป็น " + roleValue + " สำเร็จ" };
    }
  }
  return { success: false, message: "ไม่พบบัญชี " + locCode };
}

function adminSaveAnnouncement(adminToken, title, detail) {
  requireAdminSession_(adminToken);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const annSheet = findSheet(ss, "ประกาศ");
  if (!annSheet) return { success: false, message: "ไม่พบชีตประกาศ" };
  annSheet.getRange(2, 1, 1, 2).setValues([[(title || "").toString(), (detail || "").toString()]]);
  return { success: true, message: "บันทึกประกาศสำเร็จ" };
}

function adminSavePromotions(adminToken, promotions) {
  requireAdminSession_(adminToken);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const promoSheet = findSheet(ss, "ข่าวสารโปรโมชั่น");
  if (!promoSheet) return { success: false, message: "ไม่พบชีตข่าวสารโปรโมชั่น" };

  const lastRow = promoSheet.getLastRow();
  if (lastRow > 1) {
    promoSheet.getRange(2, 1, lastRow - 1, 3).clearContent();
  }
  if (promotions && promotions.length > 0) {
    const rows = promotions.map(function(p) { return [(p.title || "").toString(), (p.detail || "").toString(), (p.link || "").toString()]; });
    promoSheet.getRange(2, 1, rows.length, 3).setValues(rows);
  }
  return { success: true, message: "บันทึกโปรโมชั่นสำเร็จ" };
}

function adminSaveTimeWindow(adminToken, startStr, endStr) {
  requireAdminSession_(adminToken);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const timeSheet = findSheet(ss, "time");
  if (!timeSheet) return { success: false, message: "ไม่พบชีต time" };
  timeSheet.getRange(2, 1, 1, 2).setValues([[(startStr || "").toString(), (endStr || "").toString()]]);
  return { success: true, message: "บันทึกช่วงเวลาทำการสำเร็จ" };
}

function adminSaveRequireCodeMyOppo(adminToken, required) {
  requireAdminSession_(adminToken);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const timeSheet = findSheet(ss, "time");
  if (!timeSheet) return { success: false, message: "ไม่พบชีต time" };
  timeSheet.getRange(2, 3).setValue(required ? "TRUE" : "FALSE");
  return { success: true, message: "บันทึกการตั้งค่าบังคับกรอก Code MyOppo สำเร็จ" };
}

// ต้อง login (สาขาหรือ admin) ด้วย session token ที่ถูกต้องก่อน ถึงจะลองกรอก PIN export ได้ — กันคนที่ไม่เคย login เลย
// ยิง google.script.run.verifyAdminAndExport(...) ตรงจาก console ของหน้าเว็บสาธารณะ (access: ANYONE_ANONYMOUS) มา brute-force PIN 4 หลัก
function verifyAdminAndExport(token, pin, rowIds) {
  const session = requireSession_(token);
  const failKey = session.locCode;
  if (getFailCount_('exportpinfail_', failKey) >= EXPORT_PIN_MAX_ATTEMPTS) {
    return { success: false, message: `กรอกรหัส PIN ผิดเกินกำหนด กรุณารออีก ${EXPORT_PIN_LOCKOUT_MINUTES} นาทีแล้วลองใหม่` };
  }
  if(pin === ADMIN_PIN) {
    clearFailCount_('exportpinfail_', failKey);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = findSheet(ss, "อยู่ระหว่างดำเนินการ");
    if (!sheet || sheet.getLastRow() < 1) return { success: false, message: "ไม่พบข้อมูลสำหรับส่งออก" };
    const allData = sheet.getRange(1, 1, sheet.getLastRow(), 15).getDisplayValues();
    const idSet = (rowIds && rowIds.length) ? new Set(rowIds.map(Number)) : null;
    // แถวที่ 1 (header) เก็บไว้เสมอ, ที่เหลือกรองตามชุดแถวที่ถูกกรองไว้ในตาราง (rowId = เลขแถวจริงในชีต)
    const data = idSet ? allData.filter((row, idx) => idx === 0 || idSet.has(idx + 1)) : allData;
    let csvString = data.map((row, rIdx) =>
      row.map(field => {
        let text = field.toString();
        // แถวข้อมูล: ครอบเลขยาว (IMEI) และวันที่ ด้วย ="..." กัน Excel แปลงค่าเพี้ยน
        if (rIdx > 0 && (/^\d{11,}$/.test(text) || /^\d{1,2}\/\d{1,2}\/\d{4}/.test(text))) {
          return '"=""' + text.replace(/"/g, '""""') + '"""';
        }
        if (/[",\r\n]/.test(text)) text = '"' + text.replace(/"/g, '""') + '"';
        return text;
      }).join(",")
    ).join("\r\n");
    return { success: true, csvData: csvString };
  } else {
    incrementFailCount_('exportpinfail_', failKey, EXPORT_PIN_LOCKOUT_MINUTES);
    return { success: false, message: "รหัส Admin ไม่ถูกต้อง!" };
  }
}