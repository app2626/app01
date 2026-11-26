// Forgot password: a 6-digit code is emailed to the address the user registered; the user then sets a
// new password with it. Called before login, so these take no token (like login / register).
// The password itself is never emailed, so a stranger triggering a reset cannot lock the owner out.

var RESET_TTL_ = 900;          // code valid 15 min
var RESET_MAX_TRIES_ = 5;
var RESET_THROTTLE_ = 60;      // one email per user per minute
var RESET_GENERIC_ = 'หากข้อมูลถูกต้อง ระบบได้ส่งรหัสยืนยัน 6 หลักไปที่อีเมลที่ลงทะเบียนไว้แล้ว (ใช้ได้ 15 นาที) ' +
  'หากไม่ได้รับ ให้ตรวจโฟลเดอร์สแปม หรือติดต่อแอดมิน';

function resetCode_() {
  // getUuid is random (v4); 8 hex digits mod 10^6 gives a uniform-enough 6-digit code
  return ('00000' + (parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 8), 16) % 1000000)).slice(-6);
}

/**
 * Public, no token. Sends a code only when empId exists AND email equals the registered one
 * (case-insensitive). The answer is the same either way, so it cannot be used to discover accounts.
 */
function requestPasswordReset(empId, email) {
  empId = String(empId == null ? '' : empId).trim();
  email = String(email == null ? '' : email).trim().toLowerCase();
  var answer = { message: RESET_GENERIC_ };
  if (!empId || !email) return answer;
  var user = findUser_(empId);
  if (!user || !user.email || user.email.toLowerCase() !== email) return answer;

  var cache = CacheService.getScriptCache();
  if (cache.get('pwreq_' + user.username)) return answer;
  cache.put('pwreq_' + user.username, '1', RESET_THROTTLE_);

  var code = resetCode_();
  cache.put('pwreset_' + user.username, JSON.stringify({ h: hashPassword_(code), tries: 0 }), RESET_TTL_);
  mailUser_(user.email, 'FN+ Consignment: รหัสยืนยันสำหรับตั้งรหัสผ่านใหม่', 'เรียน ' + user.name +
    '\n\nรหัสยืนยันสำหรับตั้งรหัสผ่านใหม่ของบัญชี ' + user.username + ' คือ\n\n' + code +
    '\n\nรหัสนี้ใช้ได้ภายใน 15 นาที และใช้ได้ครั้งเดียว\n' +
    'หากคุณไม่ได้ขอตั้งรหัสผ่านใหม่ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้ตามปกติ');
  return answer;
}

/** Public, no token. Sets a new password if the emailed code matches; the code is single-use. */
function resetPasswordWithCode(empId, code, newPwd) {
  empId = String(empId == null ? '' : empId).trim();
  code = String(code == null ? '' : code).trim();
  newPwd = String(newPwd == null ? '' : newPwd);
  if (newPwd.length < 6 || newPwd.length > 100) throw new Error('รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร');

  var cache = CacheService.getScriptCache();
  var user = findUser_(empId);
  var key = user ? 'pwreset_' + user.username : '';
  var raw = key ? cache.get(key) : null;
  if (!raw) throw new Error('รหัสยืนยันหมดอายุหรือไม่ถูกต้อง กรุณาขอรหัสใหม่');
  var rec = JSON.parse(raw);
  if (rec.tries >= RESET_MAX_TRIES_) { cache.remove(key); throw new Error('ใส่รหัสผิดหลายครั้ง รหัสหมดอายุแล้ว กรุณาขอรหัสใหม่'); }
  if (!/^\d{6}$/.test(code) || !verifyPassword_(code, rec.h)) {
    rec.tries++;
    if (rec.tries >= RESET_MAX_TRIES_) cache.remove(key); else cache.put(key, JSON.stringify(rec), RESET_TTL_);
    throw new Error('รหัสยืนยันไม่ถูกต้อง');
  }

  withLock_(function () {
    var u = findUser_(empId); // re-read under the lock
    if (!u) throw new Error('ไม่พบผู้ใช้งาน');
    SpreadsheetApp.getActive().getSheetByName('Admin').getRange(u.rowNum, 2).setValue(hashPassword_(newPwd));
  });
  cache.remove(key);
  cache.remove('fail_' + user.username); // a fresh password should not stay behind the login lockout
  audit_(user.username, 'ตั้งรหัสผ่านใหม่ (อีเมล)', user.username, '');
  return true;
}
