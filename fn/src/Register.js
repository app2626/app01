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

var BRANCH_SEP_ = ', ';
var BRANCH_MAX_ = 30;

/**
 * Relief staff work at several branches. Accepts an array or a comma-separated string, trims and
 * de-duplicates, and returns the names in location-sheet order joined by ", ". With strict, every
 * name must be in the list (sign-up); otherwise unknown names (e.g. a branch since removed) are kept last.
 */
function normalizeBranches_(input, strict) {
  var raw = Array.isArray(input) ? input : String(input == null ? '' : input).split(',');
  var seen = {}, names = [];
  raw.forEach(function (v) { var n = String(v == null ? '' : v).trim(); if (n && !seen[n]) { seen[n] = true; names.push(n); } });
  if (names.length > BRANCH_MAX_) throw new Error('เลือกสาขาได้ไม่เกิน ' + BRANCH_MAX_ + ' สาขา');
  var list = branchList_();
  var unknown = names.filter(function (n) { return list.indexOf(n) < 0; });
  if (strict && unknown.length) throw new Error('ไม่พบสาขา "' + unknown[0] + '" กรุณาเลือกสาขาจากรายการ');
  return list.filter(function (n) { return seen[n]; }).concat(unknown).join(BRANCH_SEP_);
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
  var password = String(form.password == null ? '' : form.password);

  if (!EMP_ID_RE_.test(empId)) throw new Error('รหัสพนักงานใช้ได้เฉพาะ A-Z, 0-9, . _ - ยาว 2-30 ตัว');
  if (!name || name.length > 100) throw new Error('กรุณากรอกชื่อ-สกุล');
  if (!validEmail_(email)) throw new Error('รูปแบบอีเมลไม่ถูกต้อง');
  if (!phone) throw new Error('เบอร์ติดต่อไม่ถูกต้อง: ' + PHONE_RULE_TEXT_);
  // form.branch: single-branch clients from before multi-branch support
  var branch = normalizeBranches_(form.branches !== undefined ? form.branches : form.branch, true);
  if (!branch) throw new Error('กรุณาเลือกสาขาอย่างน้อย 1 สาขา');
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

  // Telegram only: anyone can call register without logging in, so an email per sign-up would let a
  // stranger burn the daily mail quota that password resets and result emails depend on.
  try {
    sendTelegram_('🆕 มีผู้ลงทะเบียนใช้งานใหม่ รออนุมัติ\nรหัสพนักงาน: ' + empId + '\nชื่อ: ' + name +
      '\nสาขา: ' + branch + '\nอีเมล: ' + email + '\nเบอร์: ' + phone +
      '\n\nอนุมัติได้ที่ ตั้งค่าระบบ > ผู้ใช้งาน', false);
  } catch (e) {
    console.error('Register notify failed: ' + e.message);
  }
  audit_(empId, 'ลงทะเบียน', empId, branch);
  return { status: ACCOUNT_STATUS.PENDING };
}

/** แอดมิน accounts that can actually log in (blocked / pending ones do not count). */
function activeAdmins_() {
  return readUsers_().filter(function (u) { return u.role === ROLES.ADMIN && isActiveUser_(u); });
}

/**
 * Public (แอดมิน). Block (ระงับ) or re-open (ใช้งาน) an account. Blocking takes effect on the
 * user's next server call, because requireSession_ re-reads the status every time.
 * An admin cannot block themself, so at least one active admin always remains.
 */
function setUserStatus(token, username, status) {
  var me = requireSession_(token, [ROLES.ADMIN]);
  status = String(status == null ? '' : status).trim();
  if (status !== ACCOUNT_STATUS.ACTIVE && status !== ACCOUNT_STATUS.BLOCKED) throw new Error('สถานะบัญชีไม่ถูกต้อง');
  var res = withLock_(function () {
    var u = findUser_(username);
    if (!u) throw new Error('ไม่พบผู้ใช้งาน');
    if (status === ACCOUNT_STATUS.BLOCKED && u.username === me.username) throw new Error('ไม่สามารถระงับบัญชีของตัวเองได้');
    if (status === ACCOUNT_STATUS.BLOCKED && u.role === ROLES.ADMIN && isActiveUser_(u) && activeAdmins_().length <= 1) {
      throw new Error('ต้องมีแอดมินที่ใช้งานได้อย่างน้อย 1 คน');
    }
    var sheet = SpreadsheetApp.getActive().getSheetByName('Admin');
    fillBlankHeaders_(sheet, ADMIN_HEADERS);
    sheet.getRange(u.rowNum, 8).setValue(status);
    return { username: u.username, status: status };
  });
  audit_(me, status === ACCOUNT_STATUS.BLOCKED ? 'ระงับบัญชี' : 'เปิดใช้งานบัญชี', res.username, '');
  return res;
}

/** Public (แอดมิน). Activates one account (also re-activates one that is not pending). */
function approveUser(token, username) {
  var me = requireSession_(token, [ROLES.ADMIN]);
  if (!findUser_(username)) throw new Error('ไม่พบผู้ใช้งาน');
  activateUsers_([username], false).forEach(function (u) { audit_(me, 'อนุมัติบัญชี', u, ''); });
  return true;
}

/**
 * Public (แอดมิน). Approves the ticked รออนุมัติ accounts in one go; names that are unknown or
 * already active are skipped. Returns { approved: string[], skipped: number }.
 */
function approveUsers(token, usernames) {
  var me = requireSession_(token, [ROLES.ADMIN]);
  usernames = Array.isArray(usernames) ? usernames : [];
  if (usernames.length > BULK_MAX_) throw new Error('อนุมัติได้ครั้งละไม่เกิน 2,000 รายการ');
  var want = {};
  usernames.forEach(function (v) { var n = String(v == null ? '' : v).trim(); if (n) want[n] = true; });
  var names = Object.keys(want);
  if (!names.length) throw new Error('กรุณาเลือกบัญชีที่ต้องการอนุมัติ');
  var approved = activateUsers_(names, true);
  approved.forEach(function (u) { audit_(me, 'อนุมัติบัญชี', u, ''); });
  return { approved: approved, skipped: names.length - approved.length };
}

/** Sets status ใช้งาน (onlyPending: skip accounts that are not รออนุมัติ) and emails each user. */
function activateUsers_(names, onlyPending) {
  var users = withLock_(function () {
    var want = {};
    names.forEach(function (n) { want[String(n).trim()] = true; });
    var hits = readUsers_().filter(function (u) {
      return want[u.username] && (!onlyPending || u.status === ACCOUNT_STATUS.PENDING);
    });
    if (!hits.length) return [];
    var sheet = SpreadsheetApp.getActive().getSheetByName('Admin');
    fillBlankHeaders_(sheet, ADMIN_HEADERS);
    hits.forEach(function (u) { sheet.getRange(u.rowNum, 8).setValue(ACCOUNT_STATUS.ACTIVE); });
    return hits;
  });
  users.forEach(function (user) {
    if (!user.email || !validEmail_(user.email)) return;
    mailUser_(user.email, 'FN+ Consignment: บัญชีของคุณได้รับการอนุมัติแล้ว', 'เรียน ' + user.name +
      '\n\nบัญชีผู้ใช้ ' + user.username + ' ได้รับการอนุมัติแล้ว เข้าสู่ระบบได้ด้วยรหัสพนักงานและรหัสผ่านที่ตั้งไว้');
  });
  return users.map(function (u) { return u.username; });
}
