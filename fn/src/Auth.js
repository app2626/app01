// Authentication: hashed passwords + server-side sessions kept in ScriptCache.

var ROLES = { ADMIN: 'แอดมิน', ACC: 'บัญชี', STAFF: 'พนักงาน' };
var SESSION_TTL_ = 21600;      // 6 h (CacheService maximum)
var LOGIN_MAX_FAILS_ = 5;
var LOGIN_LOCK_TTL_ = 900;     // 15 min
var HASH_ROUNDS_ = 1000;

function toHex_(bytes) {
  return bytes.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}

/** "sha256$<salt>$<hex>" — salted, iterated SHA-256. */
function hashPassword_(plain, salt) {
  salt = salt || Utilities.getUuid();
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + String(plain), Utilities.Charset.UTF_8);
  for (var i = 1; i < HASH_ROUNDS_; i++) {
    digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, digest);
  }
  return 'sha256$' + salt + '$' + toHex_(digest);
}

/** Stored values without the sha256$ prefix are legacy plaintext. */
function verifyPassword_(plain, stored) {
  stored = String(stored || '');
  if (stored.indexOf('sha256$') !== 0) return stored !== '' && stored === String(plain);
  var salt = stored.split('$')[1];
  return hashPassword_(plain, salt) === stored;
}

function normalizeRole_(role) {
  role = String(role || '').trim();
  return (role === ROLES.ADMIN || role === ROLES.ACC || role === ROLES.STAFF) ? role : ROLES.STAFF;
}

/** Admin sheet rows as objects; rowNum is the 1-based sheet row. */
function readUsers_() {
  var sheet = SpreadsheetApp.getActive().getSheetByName('Admin');
  if (!sheet || sheet.getLastRow() < 2) return [];
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getDisplayValues();
  var users = [];
  data.forEach(function (r, i) {
    var username = String(r[0]).trim();
    if (username) users.push({ rowNum: i + 2, username: username, password: r[1], name: String(r[2]).trim(), role: normalizeRole_(r[3]) });
  });
  return users;
}

function findUser_(username) {
  username = String(username || '').trim();
  return readUsers_().filter(function (u) { return u.username === username; })[0] || null;
}

/** Public. Returns {token,name,role} or null. */
function login(username, pwd) {
  username = String(username || '').trim();
  var cache = CacheService.getScriptCache();
  var failKey = 'fail_' + username;
  var fails = Number(cache.get(failKey) || 0);
  if (fails >= LOGIN_MAX_FAILS_) throw new Error('พยายามเข้าสู่ระบบผิดหลายครั้ง กรุณารอ 15 นาที');

  var user = findUser_(username);
  if (!user || !verifyPassword_(pwd, user.password)) {
    cache.put(failKey, String(fails + 1), LOGIN_LOCK_TTL_);
    return null;
  }
  cache.remove(failKey);

  if (String(user.password).indexOf('sha256$') !== 0) {
    SpreadsheetApp.getActive().getSheetByName('Admin').getRange(user.rowNum, 2).setValue(hashPassword_(pwd));
  }

  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  cache.put('sess_' + token, JSON.stringify({ username: user.username }), SESSION_TTL_);
  return { token: token, name: user.name, role: user.role };
}

/** Public. */
function logout(token) {
  if (token) CacheService.getScriptCache().remove('sess_' + token);
  return true;
}

/**
 * Throws AUTH_REQUIRED (no/expired session or user removed) or FORBIDDEN (role not allowed).
 * Name and role are re-read from the Admin sheet on every call so changes apply immediately.
 */
function requireSession_(token, roles) {
  if (!token || typeof token !== 'string') throw new Error('AUTH_REQUIRED');
  var cache = CacheService.getScriptCache();
  var raw = cache.get('sess_' + token);
  if (!raw) throw new Error('AUTH_REQUIRED');
  var user = findUser_(JSON.parse(raw).username);
  if (!user) { cache.remove('sess_' + token); throw new Error('AUTH_REQUIRED'); }
  cache.put('sess_' + token, raw, SESSION_TTL_);
  if (roles && roles.indexOf(user.role) < 0) throw new Error('FORBIDDEN');
  return { username: user.username, name: user.name, role: user.role };
}
