// Self-registration: staff sign up themselves; the account stays รออนุมัติ until an แอดมิน approves it.
// register / getRegisterOptions are called before login, so they take no token (like login).

var REG_LIMIT_ = 30;        // successful sign-ups per window, whole app
var REG_WINDOW_ = 600;      // 10 min
var EMP_ID_RE_ = /^[A-Za-z0-9._-]{2,30}$/;
var EMAIL_RE_ = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function branchList_() {
  var sheet = SpreadsheetApp.getActive().getSheetByName('location');
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues()
    .map(function (r) { return String(r[0]).trim(); })
    .filter(function (n) { return n !== ''; });
}

/** Digits only; Thai mobile/landline: 0 + 8-9 digits. Returns '' when invalid. */
function normalizePhone_(v) {
  var d = String(v == null ? '' : v).replace(/[\s-]/g, '');
  return /^0\d{8,9}$/.test(d) ? d : '';
}

function validEmail_(v) {
  return v.length <= 100 && EMAIL_RE_.test(v);
}

/** Public, no token. Branch names for the sign-up form. */
function getRegisterOptions() {
  return { branches: branchList_() };
}

/**
 * Public, no token. form = { empId, name, email, phone, branch, password }.
 * Creates a พนักงาน account with status รออนุมัติ and notifies the admins.
 */
function register(form) {
  form = form || {};
  var empId = String(form.empId == null ? '' : form.empId).trim();
  var name = String(form.name == null ? '' : form.name).trim();
  var email = String(form.email == null ? '' : form.email).trim();
  var phone = normalizePhone_(form.phone);
  var branch = String(form.branch == null ? '' : form.branch).trim();
  var password = String(form.password == null ? '' : form.password);

  if (!EMP_ID_RE_.test(empId)) throw new Error('รหัสพนักงานใช้ได้เฉพาะ A-Z, 0-9, . _ - ยาว 2-30 ตัว');
  if (!name || name.length > 100) throw new Error('กรุณากรอกชื่อ-สกุล');
  if (!validEmail_(email)) throw new Error('รูปแบบอีเมลไม่ถูกต้อง');
  if (!phone) throw new Error('เบอร์ติดต่อไม่ถูกต้อง (ตัวเลข 9-10 หลัก ขึ้นต้นด้วย 0)');
  if (branchList_().indexOf(branch) < 0) throw new Error('กรุณาเลือกสาขาจากรายการ');
  if (password.length < 6 || password.length > 100) throw new Error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');

  var cache = CacheService.getScriptCache();
  var count = Number(cache.get('reg_count') || 0);
  if (count >= REG_LIMIT_) throw new Error('มีการลงทะเบียนจำนวนมากในขณะนี้ กรุณาลองใหม่ในอีก 10 นาที');

  withLock_(function () {
    var lower = empId.toLowerCase();
    if (readUsers_().some(function (u) { return u.username.toLowerCase() === lower; })) {
      throw new Error('รหัสพนักงาน ' + empId + ' มีอยู่แล้วในระบบ หากลืมรหัสผ่านกรุณาติดต่อแอดมิน');
    }
    var sheet = ensureSheetByName_('Admin');
    fillBlankHeaders_(sheet, ADMIN_HEADERS);
    // leading ' keeps IDs like 00123 and phone 08x as text (Sheets would drop the leading zero)
    sheet.appendRow(["'" + empId, hashPassword_(password), cellText_(name), ROLES.STAFF,
      cellText_(email), "'" + phone, cellText_(branch), ACCOUNT_STATUS.PENDING]);
  });
  cache.put('reg_count', String(count + 1), REG_WINDOW_);

  try {
    sendNotify_('🆕 มีผู้ลงทะเบียนใช้งานใหม่ รออนุมัติ\nรหัสพนักงาน: ' + empId + '\nชื่อ: ' + name +
      '\nสาขา: ' + branch + '\nอีเมล: ' + email + '\nเบอร์: ' + phone +
      '\n\nอนุมัติได้ที่ ตั้งค่าระบบ > ผู้ใช้งาน', false, [], 'มีผู้ลงทะเบียนใช้งานใหม่ รออนุมัติ');
  } catch (e) {
    console.error('Register notify failed: ' + e.message);
  }
  return { status: ACCOUNT_STATUS.PENDING };
}

/** Public (แอดมิน). Activates a รออนุมัติ account and emails the user. */
function approveUser(token, username) {
  requireSession_(token, [ROLES.ADMIN]);
  var user = withLock_(function () {
    var u = findUser_(username);
    if (!u) throw new Error('ไม่พบผู้ใช้งาน');
    var sheet = SpreadsheetApp.getActive().getSheetByName('Admin');
    fillBlankHeaders_(sheet, ADMIN_HEADERS);
    sheet.getRange(u.rowNum, 8).setValue(ACCOUNT_STATUS.ACTIVE);
    return u;
  });
  if (user.email && validEmail_(user.email)) {
    try {
      MailApp.sendEmail({ to: user.email, subject: 'FN+ Consignment: บัญชีของคุณได้รับการอนุมัติแล้ว',
        htmlBody: escapeHtmlServer_('เรียน ' + user.name + '\n\nบัญชีผู้ใช้ ' + user.username +
          ' ได้รับการอนุมัติแล้ว เข้าสู่ระบบได้ด้วยรหัสพนักงานและรหัสผ่านที่ตั้งไว้').replace(/\n/g, '<br>') });
    } catch (e) {
      console.error('Approve mail failed: ' + e.message);
    }
  }
  return true;
}
