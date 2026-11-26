// Server tests: src/*.js against the in-memory GAS mock. Run: npm run test:server
'use strict';
const { createGas } = require('./gasmock.js');

let pass = 0, fail = 0; const fails = [];
function t(name, fn) { try { const r = fn(); if (r === false) throw new Error('returned false'); pass++; console.log('  ok   ' + name); } catch (e) { fail++; fails.push(name + ' -> ' + e.message); console.log('  FAIL ' + name + ' -> ' + e.message); } }
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'neq') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); };
const ok = (c, m) => { if (!c) throw new Error(m || 'assert'); };
const throws = (fn, re) => { try { fn(); } catch (e) { if (re && !re.test(e.message)) throw new Error('wrong error: ' + e.message); return; } throw new Error('expected throw'); };

const OLD_HEADERS_41 = ["ID :", "วันที่ขออนุมัติ", "สาขา :", "รหัสพนักงาน :", "ชื่อ-สกุล(พนง.) :", "เบอร์ติดต่อ(พนง.) :", "เลขบัตรประชาชน :", "ชื่อตัวและสกุล (ลูกค้า) :", "เบอร์ติดต่อลูกค้า :", "ที่อยู่ :", "หมู่ที่ :", "ตำบล/แขวง :", "อำเภอ/เขต :", "จังหวัด :", "รหัสไปรษณีย์ :", "ชื่อรุ่นสินค้า", "IMEI :", "PREMIUM :", "การรับประกันจอแตก :", "ราคาขายปลีกปกติ :", "เงินดาวน์ :", "ส่วนลด เปิดเบอร์ AIS :", "ส่วนลด promotion :", "ส่วนลด Trade in :", "ส่วนลด Trade up :", "ส่วนลด Big point :", "ค่าธรรมเนียม :", "ราคาสุทธิ :", "จำนวนงวด :", "งวดละ :", "รูปสลิปเงินโอน :", "ใบเสร็จ :", "สถานะ :", "Remark(การเงิน) :", "ยอดเงินโอนที่ได้รับ(การเงิน) :", "Remark(การเงิน)ใส่หมายเหตุเพิ่มถ้ามี :", "Remark(SO) :", "Sales Order created :", "Remark(SO)ใส่หมายเหตุเพิ่มถ้ามี :", "Invoice บัญชี :", "AR ใส่หมายเกตุถ้ามี :"];

// ===================== Task 1: Schema =====================
console.log('== SCHEMA');
{
  const { ctx, sheets } = createGas();
  t('DATA_HEADERS has 49 columns', () => eq(ctx.DATA_HEADERS.length, 49));
  t('submitter is column 49', () => eq(ctx.col_('ผู้บันทึก (Username) :'), 49));
  t('document type is column 48', () => eq(ctx.col_('ประเภทเอกสาร :'), 48));
  t('finance is column 47', () => eq(ctx.col_('ไฟแนนซ์ :'), 47));
  t('DATA_HEADERS keeps the old 41 verbatim', () => eq(ctx.DATA_HEADERS.slice(0, 41), OLD_HEADERS_41));
  t('col_ status is 33', () => eq(ctx.col_('สถานะ :'), 33));
  t('col_ unknown throws', () => throws(() => ctx.col_('nope'), /Unknown column/));
  t('ensureSheets_ creates all 10 sheets', () => { ctx.ensureSheets_(); ['Data', 'Log', 'Audit', 'Admin', 'Config', 'location', 'Product', 'Premium', 'guarantee', 'Finance'].forEach(n => ok(sheets[n], n)); });
  t('ensureSheets_ seeds Finance with Ponmai, Vyvr', () => eq(sheets.Finance.rows, [['ชื่อไฟแนนซ์'], ['Ponmai'], ['Vyvr']]));
  t('ensureSheets_ does not reseed existing Finance', () => { sheets.Finance.rows.splice(1); ctx.ensureSheets_(); eq(sheets.Finance.rows, [['ชื่อไฟแนนซ์']]); });
  t('Log header has record id', () => eq(sheets.Log.rows[0], ctx.LOG_HEADERS));
}
{
  const { ctx, ss, sheets } = createGas();
  t('ensureSheets_ extends old 41-col header without touching data', () => {
    const d = ss.insertSheet('Data'); d.appendRow(OLD_HEADERS_41.slice()); const row = OLD_HEADERS_41.map((_, i) => 'v' + i); d.appendRow(row.slice());
    const lg = ss.insertSheet('Log'); lg.appendRow(['วันที่/เวลา', 'ผู้ดำเนินการ', 'สถานะการอนุมัติ']); lg.appendRow(['x', 'y', 'z']);
    ctx.ensureSheets_();
    eq(sheets.Data.rows[0].length, 49); eq(sheets.Data.rows[0][47], 'ประเภทเอกสาร :'); eq(sheets.Data.rows[0][45], 'บาร์โค้ด Big point :'); eq(sheets.Data.rows[0][46], 'ไฟแนนซ์ :'); eq(sheets.Data.rows[1], row);
    eq(sheets.Log.rows[0], ctx.LOG_HEADERS); eq(sheets.Log.rows[1], ['x', 'y', 'z']);
  });
  t('dropdowns work when Finance is missing and Log header drifted', () => {
    delete sheets.Finance; sheets.Log.rows[0][0] = 'Date';
    try { eq(ctx.financeList_(), ['Ponmai', 'Vyvr']); eq(sheets.Log.rows[0][0], 'Date', 'Log header must not be touched'); }
    finally { sheets.Log.rows[0][0] = ctx.LOG_HEADERS[0]; }
  });
  t('financeList_ creates Finance sheet when missing', () => { delete sheets.Finance; eq(ctx.financeList_(), ['Ponmai', 'Vyvr']); ok(sheets.Finance); });
  t('getDataSheet_ returns Data sheet', () => eq(ctx.getDataSheet_().getName(), 'Data'));
}

// ===================== shared fixtures =====================
function fixture() {
  const g = createGas();
  g.ctx.ensureSheets_();
  g.seedAdmin = row => g.sheets.Admin.appendRow(row);
  g.seedAdmin(['admin1', 'adminpw', 'แอดมินใหญ่', 'แอดมิน']);
  g.seedAdmin(['acc1', 'accpw', 'ฝ่ายบัญชี', 'บัญชี']);
  g.seedAdmin(['staff1', 'staffpw', 'พนักงานหนึ่ง', 'พนักงาน', '', '', 'สาขา A', '']);
  g.tok = u => g.ctx.login(u, u.replace(/1$/, '') + 'pw').token;
  return g;
}

// ===================== Task 2: Auth =====================
console.log('== AUTH');
{
  const g = fixture(); const { ctx, sheets } = g;
  t('hash roundtrip', () => ok(ctx.verifyPassword_('p@ss', ctx.hashPassword_('p@ss'))));
  t('hash wrong pw', () => ok(!ctx.verifyPassword_('x', ctx.hashPassword_('p@ss'))));
  t('hash format', () => ok(/^sha256\$[^$]+\$[0-9a-f]{64}$/.test(ctx.hashPassword_('p'))));
  t('login upgrades plaintext password', () => {
    g.seedAdmin(['u1', 'pw1', 'สมชาย', 'บัญชี']);
    const r = ctx.login('u1', 'pw1'); eq(r.role, 'บัญชี'); eq(r.name, 'สมชาย'); ok(r.token.length >= 32);
    ok(/^sha256\$/.test(sheets.Admin.rows[4][1]), 'not upgraded'); ok(ctx.login('u1', 'pw1'), 'hashed login failed');
  });
  t('login wrong pw returns null', () => eq(ctx.login('u1', 'bad'), null));
  t('login unknown user returns null', () => eq(ctx.login('ghost', 'x'), null));
  t('rate limit after 5 fails', () => { for (let i = 0; i < 5; i++) { try { ctx.login('u1', 'bad'); } catch (e) { /* lock may engage inside the loop */ } } throws(() => ctx.login('u1', 'pw1'), /หลายครั้ง/); });
  t('requireSession_ no token', () => throws(() => ctx.requireSession_(''), /AUTH_REQUIRED/));
  t('requireSession_ forged token', () => throws(() => ctx.requireSession_('abc'), /AUTH_REQUIRED/));
  t('requireSession_ ok returns user', () => eq(ctx.requireSession_(g.tok('acc1')).name, 'ฝ่ายบัญชี'));
  t('requireSession_ wrong role', () => throws(() => ctx.requireSession_(g.tok('staff1'), ['แอดมิน']), /FORBIDDEN/));
  t('demoted user loses role immediately', () => {
    const tk = g.tok('admin1'); ctx.requireSession_(tk, ['แอดมิน']);
    sheets.Admin.rows[1][3] = 'พนักงาน'; throws(() => ctx.requireSession_(tk, ['แอดมิน']), /FORBIDDEN/);
    sheets.Admin.rows[1][3] = 'แอดมิน';
  });
  t('removed user session dies', () => { g.seedAdmin(['tmp', 'tmppw', 't', 'บัญชี']); const tk = ctx.login('tmp', 'tmppw').token; sheets.Admin.rows.pop(); throws(() => ctx.requireSession_(tk), /AUTH_REQUIRED/); });
  t('logout kills session', () => { const tk = g.tok('acc1'); ctx.logout(tk); throws(() => ctx.requireSession_(tk), /AUTH_REQUIRED/); });
  t('blank role defaults to staff', () => { g.seedAdmin(['u3', 'x', 'c', '']); eq(ctx.login('u3', 'x').role, 'พนักงาน'); });
  t('checkLogin removed', () => eq(typeof ctx.checkLogin, 'undefined'));
}

// ===================== Self-registration =====================
console.log('== REGISTER');
{
  const g = fixture(); const { ctx, sheets, mail } = g;
  const admin = g.tok('admin1');
  sheets.location.appendRow(['สาขา A']); sheets.location.appendRow(['สาขา B']);
  ctx.setConfigProperties(admin, { emailTo: 'boss@x.y' });
  const reg = (o = {}) => Object.assign({ empId: 'E1001', name: 'สมหญิง ใจดี', email: 'som@x.co', phone: '081-234-5678', branches: ['สาขา A'], password: 'secret12' }, o);
  const row = u => sheets.Admin.rows.find(r => String(r[0]).replace(/^'/, '') === u);
  t('Admin sheet has the new profile headers', () => eq(sheets.Admin.rows[0], ['Username', 'Password', 'ชื่อผู้ใช้งาน', 'สิทธิ์', 'อีเมล', 'เบอร์ติดต่อ', 'สาขา', 'สถานะบัญชี']));
  t('register options list branches', () => eq(ctx.getRegisterOptions().branches, ['สาขา A', 'สาขา B']));
  t('register stores pending staff with hashed pw and text phone', () => {
    const n = mail.length;
    eq(ctx.register(reg()), { status: 'รออนุมัติ' });
    const r = row('E1001');
    eq([r[0], r[2], r[3], r[4], r[5], r[6], r[7]], ["'E1001", 'สมหญิง ใจดี', 'พนักงาน', 'som@x.co', "'0812345678", 'สาขา A', 'รออนุมัติ']);
    ok(/^sha256\$/.test(r[1]));
    eq(mail.length, n + 1, 'admin notified');
  });
  t('pending user cannot log in', () => throws(() => ctx.login('E1001', 'secret12'), /รอแอดมินอนุมัติ/));
  t('pending user wrong pw still returns null (no status leak)', () => eq(ctx.login('E1001', 'nope'), null));
  t('duplicate employee id rejected', () => throws(() => ctx.register(reg({ email: 'b@x.co' })), /มีอยู่แล้ว/));
  t('unknown branch rejected', () => throws(() => ctx.register(reg({ empId: 'E2', branches: ['สาขา A', 'ไม่มี'] })), /สาขา/));
  t('no branch rejected', () => throws(() => ctx.register(reg({ empId: 'E2', branches: [] })), /สาขา/));
  t('relief staff: several branches stored once each, in list order', () => {
    ctx.register(reg({ empId: 'R1', branches: ['สาขา B', ' สาขา A ', 'สาขา B'] })); eq(row('R1')[6], 'สาขา A, สาขา B');
    eq(ctx.getSettingsData(admin, 'Admin').find(x => x[0] === 'R1')[6], 'สาขา A, สาขา B');
  });
  t('single branch string still accepted', () => { ctx.register(reg({ empId: 'R2', branches: undefined, branch: 'สาขา B' })); eq(row('R2')[6], 'สาขา B'); });
  t('bad email rejected', () => throws(() => ctx.register(reg({ empId: 'E3', email: 'nope' })), /อีเมล/));
  t('bad phone rejected', () => throws(() => ctx.register(reg({ empId: 'E4', phone: '12' })), /เบอร์/));
  t('register accepts a foreign number', () => { ctx.register(reg({ empId: 'INT1', phone: '+44 20 7946 0958' })); ok(sheets.Admin.rows.some(r => r[5] === "'+442079460958")); });
  t('short password rejected', () => throws(() => ctx.register(reg({ empId: 'E5', password: '123' })), /6/));
  t('bad employee id rejected', () => throws(() => ctx.register(reg({ empId: 'a b<' })), /รหัสพนักงาน/));
  t('missing name rejected', () => throws(() => ctx.register(reg({ empId: 'E6', name: ' ' })), /ชื่อ/));
  t('approveUser needs admin', () => { throws(() => ctx.approveUser('', 'E1001'), /AUTH_REQUIRED/); throws(() => ctx.approveUser(g.tok('acc1'), 'E1001'), /FORBIDDEN/); });
  t('approved user can log in as staff', () => { ctx.approveUser(admin, 'E1001'); eq(row('E1001')[7], 'ใช้งาน'); const s = ctx.login('E1001', 'secret12'); eq(s.role, 'พนักงาน'); eq(s.name, 'สมหญิง ใจดี'); });
  t('session dies when set back to pending', () => { const tk = ctx.login('E1001', 'secret12').token; row('E1001')[7] = 'รออนุมัติ'; throws(() => ctx.requireSession_(tk), /AUTH_REQUIRED/); row('E1001')[7] = 'ใช้งาน'; });
  t('dropdown data carries my profile for the request form', () => {
    ctx.register(reg({ empId: 'P1', name: 'ผู้ช่วย สาขา', phone: '0811112222', branches: ['สาขา B', 'สาขา A'] }));
    ctx.approveUser(admin, 'P1');
    eq(ctx.getAllDropdownData(ctx.login('P1', 'secret12').token).me, { empId: 'P1', name: 'ผู้ช่วย สาขา', phone: '0811112222', scoped: true, branches: ['สาขา A', 'สาขา B'] });
  });
  t('legacy user profile has blank contact and no branches', () => { g.seedAdmin(['old1', 'oldpw', 'เก่า', 'พนักงาน']); const me = ctx.getAllDropdownData(ctx.login('old1', 'oldpw').token).me; eq([me.phone, me.branches, me.scoped], ['', [], true]); });
  t('approveUsers approves only pending accounts, emails each', () => {
    ['M1', 'M2'].forEach(id => ctx.register(reg({ empId: id, email: id.toLowerCase() + '@x.co' })));
    const n = mail.length;
    eq(ctx.approveUsers(admin, ['M1', 'M2', 'E1001', 'ghost', 'M1']), { approved: ['M1', 'M2'], skipped: 2 });
    eq([row('M1')[7], row('M2')[7]], ['ใช้งาน', 'ใช้งาน']);
    eq(mail.slice(n).map(m => m.to), ['m1@x.co', 'm2@x.co']);
    ok(ctx.login('M2', 'secret12'));
  });
  t('approveUsers needs admin and a list', () => {
    throws(() => ctx.approveUsers(g.tok('acc1'), ['M1']), /FORBIDDEN/);
    throws(() => ctx.approveUsers(admin, []), /เลือก/);
  });
  t('legacy 4-column users still log in', () => ok(ctx.login('staff1', 'staffpw')));
  t('settings list returns profile + status', () => { const r = ctx.getSettingsData(admin, 'Admin').find(x => x[0] === 'E1001'); eq(r, ['E1001', '', 'สมหญิง ใจดี', 'พนักงาน', 'som@x.co', '0812345678', 'สาขา A', 'ใช้งาน']); });
  t('admin edit updates contact fields', () => {
    const i = ctx.getSettingsData(admin, 'Admin').findIndex(x => x[0] === 'E1001');
    ctx.updateSettingData(admin, 'Admin', i, 'E1001', ['', '', 'สมหญิง ใหม่', 'บัญชี', 'new@x.co', '0899999999', ['สาขา B', 'สาขา A']]);
    const r = row('E1001'); eq([r[2], r[3], r[4], r[5], r[6], r[7]], ['สมหญิง ใหม่', 'บัญชี', 'new@x.co', "'0899999999", 'สาขา A, สาขา B', 'ใช้งาน']);
  });
  t('registration throttled after burst', () => {
    for (let i = 0; i < 35; i++) { try { ctx.register(reg({ empId: 'B' + i })); } catch (e) { /* throttle engages inside the loop */ } }
    throws(() => ctx.register(reg({ empId: 'B99' })), /ลองใหม่/);
  });
}
{
  const { ctx, ss, sheets } = createGas();
  t('ensureSheets_ fills new Admin headers on an old 4-column sheet without touching rows', () => {
    const a = ss.insertSheet('Admin'); a.maxCols = 4; a.appendRow(['Username', 'Password', 'ชื่อผู้ใช้งาน', 'สิทธิ์']); a.appendRow(['u', 'p', 'n', 'แอดมิน']);
    ctx.ensureSheets_();
    eq(sheets.Admin.rows[0].slice(4), ['อีเมล', 'เบอร์ติดต่อ', 'สาขา', 'สถานะบัญชี']); eq(sheets.Admin.rows[1], ['u', 'p', 'n', 'แอดมิน']);
  });
  t('login works on a narrow Admin grid', () => { sheets.Admin.maxCols = 4; sheets.Admin.rows[0].length = 4; ok(ctx.login('u', 'p')); });
}

// ===================== Block / unblock accounts =====================
console.log('== BLOCK USERS');
{
  const g = fixture(); const { ctx, sheets } = g;
  const admin = g.tok('admin1');
  const row = u => sheets.Admin.rows.find(r => String(r[0]).replace(/^'/, '') === u);
  t('block needs admin', () => { throws(() => ctx.setUserStatus('', 'staff1', 'ระงับ'), /AUTH_REQUIRED/); throws(() => ctx.setUserStatus(g.tok('acc1'), 'staff1', 'ระงับ'), /FORBIDDEN/); });
  t('blocking ends the session at once and stops login', () => {
    const tk = g.tok('staff1');
    eq(ctx.setUserStatus(admin, 'staff1', 'ระงับ'), { username: 'staff1', status: 'ระงับ' });
    eq(row('staff1')[7], 'ระงับ');
    throws(() => ctx.requireSession_(tk), /AUTH_REQUIRED/);
    throws(() => ctx.login('staff1', 'staffpw'), /ถูกระงับ/);
  });
  t('blocked: wrong password still answers null (no status leak)', () => eq(ctx.login('staff1', 'nope'), null));
  t('blocked account shows as ระงับ in the admin list', () => eq(ctx.getSettingsData(admin, 'Admin').find(r => r[0] === 'staff1')[7], 'ระงับ'));
  t('unblock lets the user log in again', () => { ctx.setUserStatus(admin, 'staff1', 'ใช้งาน'); ok(ctx.login('staff1', 'staffpw')); });
  t('cannot block yourself', () => throws(() => ctx.setUserStatus(admin, 'admin1', 'ระงับ'), /ตัวเอง/));
  t('cannot block the last active admin', () => {
    g.seedAdmin(['admin2', 'admin2pw', 'แอดมินสอง', 'แอดมิน']);
    const a2 = ctx.login('admin2', 'admin2pw').token;
    ctx.setUserStatus(a2, 'admin1', 'ระงับ');
    throws(() => ctx.setUserStatus(ctx.login('admin2', 'admin2pw').token, 'admin2', 'ระงับ'), /ตัวเอง/);
    ctx.setUserStatus(a2, 'admin1', 'ใช้งาน');
  });
  t('blocked admins do not count as the remaining admin', () => {
    // admin1 + admin2 exist; admin2 blocked -> admin1 is the only active admin and cannot be demoted
    ctx.setUserStatus(admin, 'admin2', 'ระงับ');
    throws(() => ctx.updateSettingData(admin, 'Admin', 0, 'admin1', ['', '', 'x', 'บัญชี']), /อย่างน้อย 1/);
  });
  t('unknown status / user rejected', () => { throws(() => ctx.setUserStatus(admin, 'staff1', 'root'), /สถานะ/); throws(() => ctx.setUserStatus(admin, 'ghost', 'ระงับ'), /ไม่พบ/); });
}

// ===================== Forgot password (email code) =====================
console.log('== FORGOT PASSWORD');
{
  const g = fixture(); const { ctx, sheets, mail, cache } = g;
  g.seedAdmin(['F1', 'oldpass1', 'ลืมรหัส', 'พนักงาน', 'f1@x.co', "'0812345678", 'สาขา A', 'ใช้งาน']);
  g.seedAdmin(['F2', 'oldpass2', 'ไม่มีเมล', 'พนักงาน', '', '', 'สาขา A', 'ใช้งาน']);
  const GENERIC = /หากข้อมูลถูกต้อง/;
  const lastCode = () => (mail[mail.length - 1].htmlBody.match(/\b(\d{6})\b/) || [])[1];
  const clearThrottle = u => cache.remove('pwreq_' + u);
  t('request with matching id + email sends a 6-digit code to that email', () => {
    const n = mail.length; ok(GENERIC.test(ctx.requestPasswordReset('F1', ' F1@X.co ').message));
    eq(mail.length, n + 1); eq(mail[n].to, 'f1@x.co'); ok(/^\d{6}$/.test(lastCode()));
  });
  t('wrong email: same generic answer, nothing sent', () => { clearThrottle('F1'); const n = mail.length; ok(GENERIC.test(ctx.requestPasswordReset('F1', 'evil@x.co').message)); eq(mail.length, n); });
  t('unknown id: same generic answer, nothing sent', () => { const n = mail.length; ok(GENERIC.test(ctx.requestPasswordReset('ghost', 'a@b.co').message)); eq(mail.length, n); });
  t('account without email: nothing sent', () => { const n = mail.length; ctx.requestPasswordReset('F2', ''); eq(mail.length, n); });
  t('second request within a minute sends nothing', () => { clearThrottle('F1'); ctx.requestPasswordReset('F1', 'f1@x.co'); const n = mail.length; ctx.requestPasswordReset('F1', 'f1@x.co'); eq(mail.length, n); });
  t('wrong code rejected, old password still works', () => { throws(() => ctx.resetPasswordWithCode('F1', '000000', 'newpass9'), /ไม่ถูกต้อง/); ok(ctx.login('F1', 'oldpass1')); });
  t('right code sets new password, code is single-use', () => {
    const code = lastCode(); const old = ctx.login('F1', 'oldpass1').token;
    eq(ctx.resetPasswordWithCode('F1', code, 'newpass9'), true);
    ok(ctx.login('F1', 'newpass9')); eq(ctx.login('F1', 'oldpass1'), null);
    throws(() => ctx.requireSession_(old), /AUTH_REQUIRED/);
    throws(() => ctx.resetPasswordWithCode('F1', code, 'again123'), /ไม่ถูกต้อง|หมดอายุ/);
  });
  t('code dies after 5 wrong tries', () => {
    clearThrottle('F1'); ctx.requestPasswordReset('F1', 'f1@x.co'); const code = lastCode();
    for (let i = 0; i < 5; i++) { try { ctx.resetPasswordWithCode('F1', '111111', 'zzzzzz1'); } catch (e) { /* counting tries */ } }
    throws(() => ctx.resetPasswordWithCode('F1', code, 'zzzzzz1'), /หมดอายุ|ขอรหัสใหม่/);
  });
  t('new password must be 6+ chars', () => { clearThrottle('F1'); ctx.requestPasswordReset('F1', 'f1@x.co'); throws(() => ctx.resetPasswordWithCode('F1', lastCode(), '123'), /6/); });
  t('sessions from before an admin reset also die', () => { const tk = ctx.login('F1', 'newpass9').token; ctx.resetPassword(g.tok('admin1'), 'F1', 'byadmin1'); throws(() => ctx.requireSession_(tk), /AUTH_REQUIRED/); });
  t('old sessions without a fingerprint keep working', () => { const tk = 'legacytoken'; cache.put('sess_' + tk, JSON.stringify({ username: 'admin1' })); eq(ctx.requireSession_(tk).username, 'admin1'); });
}

// ===================== Trust: mail quota, audit trail, staff notifications =====================
console.log('== DATE RANGE');
{
  const g = fixture(); const { ctx, sheets } = g;
  const acc = g.tok('acc1'), staff = g.tok('staff1');
  const now = new Date(2026, 10, 26).getTime();
  t('requestDate_ parses ISO, d/m/yyyy, Buddhist years; junk is null', () => {
    eq(ctx.requestDate_('2026-11-25'), new Date(2026, 10, 25).getTime());
    eq(ctx.requestDate_('25/11/2026'), new Date(2026, 10, 25).getTime());
    eq(ctx.requestDate_('25/11/2569'), new Date(2026, 10, 25).getTime());
    eq(ctx.requestDate_('2026-11-25 10:30:00'), new Date(2026, 10, 25).getTime());
    eq(ctx.requestDate_(''), null); eq(ctx.requestDate_('เมื่อวาน'), null); eq(ctx.requestDate_('2026-13-40'), null);
  });
  const b64 = n => Buffer.alloc(n, 1).toString('base64');
  const req = (date, imei) => ({ date, location: 'สาขา A', emp_id: 'staff1', emp_name: 'x', emp_phone: '0812345678', id_card_number: '1103700012346', customer_name: 'c', customer_phone: '0898765432', address: 'a', road: 'r', district: 'd', amphoe: 'a', province: 'p', zipcode: '10200', productname: 'P', imei, price: '1000', installments: '1', finance: 'Ponmai', file1Data: { base64: b64(4), mimeType: 'image/png', name: 'a' }, file2Data: { base64: b64(4), mimeType: 'application/pdf', name: 'b' } });
  const oldDone = ctx.saveRequest(staff, req('2025-01-10', 'OLD-DONE')).id;
  ctx.updateStatus(acc, { record: oldDone, action: 'reject', Remark: 'x' });
  ctx.saveRequest(staff, req('2025-01-11', 'OLD-OPEN'));
  ctx.saveRequest(staff, req('2026-11-20', 'NEW'));
  ctx.saveRequest(staff, req('??', 'NODATE'));
  ctx.nowMs_ = () => now; // fixed clock for the cutoff
  const imeis = rows => rows.map(r => r[ctx.col_('IMEI :') - 1]).sort();
  t('getData without options returns everything (old callers)', () => eq(imeis(ctx.getData(acc)), ['NEW', 'NODATE', 'OLD-DONE', 'OLD-OPEN']));
  t('days=90 keeps recent, unfinished and undated rows, drops old finished ones', () => eq(imeis(ctx.getData(acc, { days: 90 })), ['NEW', 'NODATE', 'OLD-OPEN']));
  t('days=0 means all', () => eq(ctx.getData(acc, { days: 0 }).length, 4));
  t('bad days value is rejected', () => throws(() => ctx.getData(acc, { days: -5 }), /ช่วงวันที่/));
  t('range filter still applies branch scope', () => { g.seedAdmin(['staff9', 'staffpw', 'อื่น', 'พนักงาน', '', '', 'สาขา B', '']); eq(ctx.getData(ctx.login('staff9', 'staffpw').token, { days: 90 }).length, 0); });
}

console.log('== TRUST');
{
  const g = fixture(); const { ctx, sheets, mail, fetches, mailState, cache } = g;
  const admin = g.tok('admin1'), acc = g.tok('acc1');
  ctx.setConfigProperties(admin, { emailTo: 'boss@x.y', notifyNewToken: '1:A', notifyNewChatId: '99' });
  const audit = () => sheets.Audit.rows.slice(1);
  const lastAudit = () => audit()[audit().length - 1];
  const tg = () => fetches.filter(f => /sendMessage/.test(f.url)).map(f => f.opt.payload.text);

  t('config shows the remaining mail quota', () => { mailState.quota = 1234; eq(ctx.getConfigProperties(admin).mailQuotaRemaining, 1234); });
  t('no quota left: email skipped without error, Telegram warned once', () => {
    mailState.quota = 0; const n = mail.length; const warned = () => tg().filter(m => /โควตาอีเมล/.test(m)).length;
    const before = warned();
    ctx.sendNotify_('hello', false, [], 'subj'); ctx.sendNotify_('again', false, [], 'subj');
    eq(mail.length, n); eq(warned() - before, 1);
  });
  t('low quota: email still sent, warning not repeated', () => {
    cache.remove('mailq_alert'); mailState.quota = 5; const n = mail.length;
    ctx.sendNotify_('x', false, [], 's'); ctx.sendNotify_('y', false, [], 's');
    eq(mail.length, n + 2); eq(tg().filter(m => /โควตาอีเมล/.test(m)).length, 2);
    mailState.quota = 1500;
  });

  sheets.location.appendRow(['สาขา A']);
  t('audit: self-registration', () => { ctx.register({ empId: 'S9', name: 'ส่งคำขอ', email: 's9@x.co', phone: '0812345678', branches: ['สาขา A'], password: 'secret12' }); eq(lastAudit().slice(1, 4), ['S9', 'ลงทะเบียน', 'S9']); });
  t('audit: approve, block, unblock, reset password', () => {
    ctx.approveUsers(admin, ['S9']); eq(lastAudit().slice(1, 4), ['แอดมินใหญ่ (admin1)', 'อนุมัติบัญชี', 'S9']);
    ctx.setUserStatus(admin, 'S9', 'ระงับ'); eq(lastAudit()[2], 'ระงับบัญชี');
    ctx.setUserStatus(admin, 'S9', 'ใช้งาน'); eq(lastAudit()[2], 'เปิดใช้งานบัญชี');
    ctx.resetPassword(admin, 'S9', 'secret12'); eq(lastAudit().slice(2, 4), ['รีเซ็ตรหัสผ่าน', 'S9']);
  });
  t('audit: settings add / edit / delete / bulk', () => {
    ctx.addSettingData(admin, 'Product', ['รุ่น X']); eq(lastAudit().slice(2, 5), ['เพิ่มข้อมูล', 'Product', 'รุ่น X']);
    ctx.updateSettingData(admin, 'Product', 0, 'รุ่น X', ['รุ่น Y']); eq(lastAudit().slice(2, 5), ['แก้ไขข้อมูล', 'Product', 'รุ่น X → รุ่น Y']);
    ctx.addSettingDataBulk(admin, 'Product', ['p1', 'p2']); eq(lastAudit().slice(2, 5), ['นำเข้าไฟล์', 'Product', '2 รายการ']);
    ctx.deleteSettingDataBulk(admin, 'Product', ['p1', 'p2']); eq(lastAudit().slice(2, 5), ['ลบหลายรายการ', 'Product', 'p1, p2']);
    ctx.deleteSettingData(admin, 'Product', 0, 'รุ่น Y'); eq(lastAudit().slice(2, 5), ['ลบข้อมูล', 'Product', 'รุ่น Y']);
  });
  t('audit: config change lists keys, never secret values', () => {
    ctx.setConfigProperties(admin, { notifyApproveToken: '777:SECRET', emailCc: 'c@x.y' });
    const r = lastAudit(); eq(r[2], 'แก้ไขการตั้งค่า'); ok(/notifyApproveToken/.test(r[4]) && /emailCc/.test(r[4])); ok(!/SECRET/.test(r.join(' ')), 'secret leaked');
  });
  t('audit: password reset by email code', () => {
    ctx.requestPasswordReset('S9', 's9@x.co'); const code = mail[mail.length - 1].htmlBody.match(/\b(\d{6})\b/)[1];
    ctx.resetPasswordWithCode('S9', code, 'brandnew9'); eq(lastAudit().slice(1, 4), ['S9', 'ตั้งรหัสผ่านใหม่ (อีเมล)', 'S9']);
  });
  t('audit sheet is not writable from settings screens', () => throws(() => ctx.getSettingsData(admin, 'Audit'), /INVALID_SHEET/));

  const b64 = n => Buffer.alloc(n, 1).toString('base64');
  const req = () => ({ date: '2026-11-25', location: 'สาขา A', emp_id: 'S9', emp_name: 'ส่งคำขอ', emp_phone: '0812345678', id_card_number: '1103700012346', customer_name: 'ลูกค้า ก', customer_phone: '0898765432', address: 'a', road: 'r', district: 'd', amphoe: 'a', province: 'p', zipcode: '10200', productname: 'Phone Z', imei: 'I1', price: '1000', installments: '1', finance: 'Ponmai', file1Data: { base64: b64(4), mimeType: 'image/png', name: 'a' }, file2Data: { base64: b64(4), mimeType: 'application/pdf', name: 'b' } });
  let rid;
  t('saveRequest records who submitted it', () => {
    const tk = ctx.login('S9', 'brandnew9').token; rid = ctx.saveRequest(tk, req()).id;
    const row = sheets.Data.rows.find(r => String(r[0]).replace(/^'/, '') === rid); eq(row[ctx.col_('ผู้บันทึก (Username) :') - 1], 'S9');
  });
  t('approve emails the submitter with the result', () => {
    const n = mail.length; ctx.updateStatus(acc, { record: rid, action: 'approve', financeAmount: '900', Remark: 'ok' });
    const m = mail.slice(n).find(x => x.to === 's9@x.co'); ok(m, 'submitter not emailed'); ok(/อนุมัติ/.test(m.subject) && /ลูกค้า ก/.test(m.htmlBody) && /รอเปิด SO/.test(m.htmlBody));
  });
  t('reject emails the submitter with the remark', () => {
    const tk = ctx.login('S9', 'brandnew9').token; const id2 = ctx.saveRequest(tk, req()).id; const n = mail.length;
    ctx.updateStatus(acc, { record: id2, action: 'reject', Remark: 'สลิปไม่ชัด' });
    const m = mail.slice(n).find(x => x.to === 's9@x.co'); ok(m && /ไม่อนุมัติ/.test(m.subject) && /สลิปไม่ชัด/.test(m.htmlBody));
  });
  t('submitter without email: no personal mail, workflow still fine', () => {
    const id3 = ctx.saveRequest(g.tok('staff1'), Object.assign(req(), { emp_id: 'staff1' })); const n = mail.length;
    eq(ctx.updateStatus(acc, { record: id3.id, action: 'approve', financeAmount: '1' }).status, 'รอเปิด SO');
    ok(!mail.slice(n).some(x => x.to === ''), 'mailed an empty address');
  });
}

// ===================== Task 3: guards, settings, config =====================
console.log('== GUARDS / SETTINGS');
{
  const g = fixture(); const { ctx, sheets, mail, fetches, lockState } = g;
  const admin = g.tok('admin1'), acc = g.tok('acc1'), staff = g.tok('staff1');
  const lastRow = n => sheets[n].rows[sheets[n].getLastRow() - 1];
  const adminOnly = {
    getConfigProperties: [], setConfigProperties: [{}], getSettingsData: ['location'], addSettingData: ['location', ['x']],
    deleteSettingData: ['location', 0, 'x'], updateSettingData: ['location', 0, 'x', ['y']], addSettingDataBulk: ['location', ['a']], deleteSettingDataBulk: ['location', ['a']], resetPassword: ['staff1', 'newpass1'], initializeAllSheets: [],
  };
  const anyRole = { getAllDropdownData: [] };
  Object.keys(Object.assign({}, adminOnly, anyRole)).forEach(fn => {
    const args = adminOnly[fn] || anyRole[fn];
    t(fn + ' without token -> AUTH_REQUIRED', () => throws(() => ctx[fn]('', ...args), /AUTH_REQUIRED/));
  });
  Object.keys(adminOnly).forEach(fn => {
    t(fn + ' as staff -> FORBIDDEN', () => throws(() => ctx[fn](staff, ...adminOnly[fn]), /FORBIDDEN/));
    t(fn + ' as บัญชี -> FORBIDDEN', () => throws(() => ctx[fn](acc, ...adminOnly[fn]), /FORBIDDEN/));
  });
  t('getAllDropdownData as staff ok', () => { sheets.location.appendRow(['สาขา A']); eq(ctx.getAllDropdownData(staff).location, [['สาขา A']]); });
  t('Admin settings hide passwords', () => { const rows = ctx.getSettingsData(admin, 'Admin'); eq(rows.length, 3); rows.forEach(r => eq(r[1], '')); eq(rows[0][0], 'admin1'); });
  t('config masks bot token', () => { ctx.setConfigProperties(admin, { notifyNewToken: '123456:ABCDEF' }); eq(ctx.getConfigProperties(admin).notifyNewToken, '••••CDEF'); });
  t('masked value does not overwrite', () => { ctx.setConfigProperties(admin, { notifyNewToken: '••••CDEF' }); eq(ctx.getConfig_().notifyNewToken, '123456:ABCDEF'); });
  t('unknown config key ignored', () => { ctx.setConfigProperties(admin, { evil: 'x' }); ok(!sheets.Config.rows.some(r => r[0] === 'evil')); });
  t('invalid sheet rejected', () => throws(() => ctx.getSettingsData(admin, 'Data'), /INVALID_SHEET/));
  t('invalid sheet rejected on add', () => throws(() => ctx.addSettingData(admin, 'Config', ['k', 'v']), /INVALID_SHEET/));
  t('delete with stale key rejected', () => throws(() => ctx.deleteSettingData(admin, 'location', 0, 'wrong'), /เปลี่ยนแปลง/));
  t('bulk add appends new names, skips blanks and duplicates', () => {
    const before = sheets.Product.rows.length;
    sheets.Product.appendRow(['Galaxy S25']);
    const r = ctx.addSettingDataBulk(admin, 'Product', [' Galaxy A56 ', '', 'Galaxy S25', 'Galaxy A56', 'iPhone 16', null]);
    eq(r, { added: ['Galaxy A56', 'iPhone 16'], skipped: 4 });
    eq(sheets.Product.rows.slice(before).map(x => x[0]), ['Galaxy S25', 'Galaxy A56', 'iPhone 16']);
    sheets.Product.rows.splice(before);
  });
  t('bulk add only for location/Product/Premium', () => { throws(() => ctx.addSettingDataBulk(admin, 'Admin', ['x']), /INVALID_SHEET/); throws(() => ctx.addSettingDataBulk(admin, 'Finance', ['x']), /INVALID_SHEET/); });
  t('bulk add over 2000 rejected', () => throws(() => ctx.addSettingDataBulk(admin, 'Premium', Array.from({ length: 2001 }, (_, i) => 'p' + i)), /2,000/));
  t('bulk add grows the grid past its last row', () => { const sh = sheets.Premium; const n = sh.rows.length; sh.maxRows = sh.getLastRow(); eq(ctx.addSettingDataBulk(admin, 'Premium', ['g1', 'g2', 'g3']).added.length, 3); sh.rows.splice(n); });
  t('bulk add with nothing new adds nothing', () => { const n = sheets.Premium.rows.length; eq(ctx.addSettingDataBulk(admin, 'Premium', ['', ' ']), { added: [], skipped: 2 }); eq(sheets.Premium.rows.length, n); });
  t('bulk delete removes selected names, keeps the rest in order', () => {
    const sh = sheets.guarantee; const before = sh.rows.length;
    ['g-a', 'g-b', 'g-c', 'g-d', 'g-e'].forEach(n => sh.appendRow([n]));
    eq(ctx.deleteSettingDataBulk(admin, 'guarantee', [' g-b ', 'g-c', 'g-e', 'gone']), { deleted: 3, missing: 1 });
    eq(sh.rows.slice(before).map(x => x[0]), ['g-a', 'g-d']);
    sh.rows.splice(before);
  });
  t('bulk delete with nothing matching rejected', () => throws(() => ctx.deleteSettingDataBulk(admin, 'Finance', ['nope']), /เปลี่ยนแปลง/));
  t('bulk delete empty list rejected', () => throws(() => ctx.deleteSettingDataBulk(admin, 'Finance', []), /เลือก/));
  t('bulk delete not allowed on Admin/Data', () => { throws(() => ctx.deleteSettingDataBulk(admin, 'Admin', ['staff1']), /INVALID_SHEET/); throws(() => ctx.deleteSettingDataBulk(admin, 'Data', ['x']), /INVALID_SHEET/); });
  t('bulk delete over 2000 rejected', () => throws(() => ctx.deleteSettingDataBulk(admin, 'Premium', Array.from({ length: 2001 }, (_, i) => 'p' + i)), /2,000/));
  t('update list item renames in place', () => { ctx.updateSettingData(admin, 'location', 0, 'สาขา A', [' สาขา A1 ']); eq(sheets.location.rows[1], ['สาขา A1']); sheets.location.rows[1] = ['สาขา A']; });
  t('update with stale key rejected', () => throws(() => ctx.updateSettingData(admin, 'location', 0, 'wrong', ['z']), /เปลี่ยนแปลง/));
  t('update to empty rejected', () => throws(() => ctx.updateSettingData(admin, 'location', 0, 'สาขา A', ['  ']), /กรุณากรอก/));
  t('update to duplicate rejected', () => { sheets.location.appendRow(['สาขา B']); try { throws(() => ctx.updateSettingData(admin, 'location', 0, 'สาขา A', ['สาขา B']), /มีอยู่แล้ว/); } finally { sheets.location.rows.pop(); } });
  t('update admin changes name and role, keeps username and hash', () => {
    const before = sheets.Admin.rows[3].slice();
    ctx.updateSettingData(admin, 'Admin', 2, 'staff1', ['ignored', '', 'พนักงานใหม่', 'บัญชี']);
    eq(sheets.Admin.rows[3], [before[0], before[1], 'พนักงานใหม่', 'บัญชี', ...before.slice(4)]);
    sheets.Admin.rows[3] = before;
  });
  t('update admin invalid role rejected', () => throws(() => ctx.updateSettingData(admin, 'Admin', 2, 'staff1', ['', '', 'x', 'root']), /สิทธิ์/));
  t('cannot demote last admin', () => throws(() => ctx.updateSettingData(admin, 'Admin', 0, 'admin1', ['', '', 'แอดมินใหญ่', 'บัญชี']), /อย่างน้อย 1/));
  t('delete with matching key ok', () => { ctx.deleteSettingData(admin, 'location', 0, 'สาขา A'); eq(sheets.location.getLastRow(), 1); });
  t('cannot delete last admin', () => throws(() => ctx.deleteSettingData(admin, 'Admin', 0, 'admin1'), /อย่างน้อย 1/));
  t('admin-added staff needs a branch', () => throws(() => ctx.addSettingData(admin, 'Admin', ['u8', 'secret8', 'n', 'พนักงาน']), /สาขา/));
  t('admin-added staff stores branches, active', () => {
    sheets.location.appendRow(['สาขา X']);
    ctx.addSettingData(admin, 'Admin', ['u7', 'secret7', 'n', 'พนักงาน', '', '', ['สาขา X']]);
    eq(lastRow('Admin').slice(6), ['สาขา X', 'ใช้งาน']); eq(ctx.getAllDropdownData(ctx.login('u7', 'secret7').token).me.branches, ['สาขา X']);
  });
  t('added admin password is hashed', () => { ctx.addSettingData(admin, 'Admin', ['u9', 'secret9', 'n', 'บัญชี']); ok(/^sha256\$/.test(lastRow('Admin')[1])); ok(ctx.login('u9', 'secret9')); });
  t('duplicate username rejected', () => throws(() => ctx.addSettingData(admin, 'Admin', ['u9', 'x', 'n', 'พนักงาน']), /มีอยู่แล้ว/));
  t('invalid role rejected', () => throws(() => ctx.addSettingData(admin, 'Admin', ['u10', 'secret10', 'n', 'root']), /สิทธิ์/));
  t('duplicate list item rejected on add', () => { ctx.addSettingData(admin, 'location', ['สาขาซ้ำ']); throws(() => ctx.addSettingData(admin, 'location', [' สาขาซ้ำ ']), /มีอยู่แล้ว/); });
  t('formula-like setting name stored as text', () => { ctx.addSettingData(admin, 'Product', ['=1+1']); eq(lastRow('Product')[0], "'=1+1"); });
  t('resetPassword hashes and works', () => { ctx.resetPassword(admin, 'staff1', 'brandnew1'); ok(ctx.login('staff1', 'brandnew1')); ok(/^sha256\$/.test(sheets.Admin.rows[3][1])); });
  t('resetPassword too short', () => throws(() => ctx.resetPassword(admin, 'staff1', '123'), /6/));
  t('lock timeout surfaces error', () => { lockState.fail = true; try { throws(() => ctx.addSettingData(admin, 'location', ['y']), /กำลังประมวลผล/); } finally { lockState.fail = false; } });
  t('email body escaped', () => { ctx.setConfigProperties(admin, { emailTo: 'a@b.c' }); ctx.sendNotify_('<b>x</b>\nline2', false, [], 's'); const m = mail[mail.length - 1]; ok(m.htmlBody.includes('&lt;b&gt;x&lt;/b&gt;<br>line2'), m.htmlBody); });
  t('telegram skipped when chat id empty', () => { const n = fetches.length; ctx.sendNotify_('m', true, [], 's'); eq(fetches.length, n); });
  t('old unguarded helpers removed', () => ['setRemark', 'updateHeadersNow', 'getDataSheet'].forEach(f => eq(typeof ctx[f], 'undefined', f)));
}

// ===================== Task 4: requests & workflow =====================
console.log('== REQUESTS / WORKFLOW');
{
  const g = fixture(); const { ctx, sheets, driveFiles, mail, lockState } = g;
  const admin = g.tok('admin1'), acc = g.tok('acc1'), staff = g.tok('staff1');
  const b64 = n => Buffer.alloc(n, 1).toString('base64');
  const form = (o = {}) => Object.assign({
    date: '2026-11-25', location: 'สาขา A', emp_id: 'E01', emp_name: 'พนักงานหนึ่ง', emp_phone: '0812345678',
    id_card_number: '1103700012346', customer_name: 'ลูกค้า ทดสอบ', customer_phone: '0898765432', address: '1/2', road: '3',
    district: 'ตำบล', amphoe: 'อำเภอ', province: 'จังหวัด', zipcode: '10200', productname: 'Phone X', imei: '356789012345678',
    premium_combined: 'เคส', guarantee: '', price: '10000', down: '1000', discountais: '0', discountpromotion: '0',
    discounttradein: '0', discounttradeup: '0', discountbigc: '0', dues: '0', installments: '10', installment_amount: '900', finance: 'Ponmai',
    file1Data: { base64: b64(10), mimeType: 'image/jpeg', name: 'slip.jpg' },
    file2Data: { base64: b64(10), mimeType: 'application/pdf', name: 'c.pdf' },
  }, o);
  const C = h => ctx.col_(h) - 1;
  const rowById = id => sheets.Data.rows.find(r => String(r[0]).replace(/^'/, '') === id);
  const setStatus = (id, s) => { rowById(id)[C('สถานะ :')] = s; };

  t('saveRequest needs session', () => throws(() => ctx.saveRequest('', form()), /AUTH_REQUIRED/));
  let id;
  t('saveRequest computes net price server-side', () => {
    id = ctx.saveRequest(staff, form({ price: '10000', down: '1000', discountais: '500', dues: '200', netprice: '1' })).id;
    eq(Number(rowById(id)[C('ราคาสุทธิ :')]), 8700); eq(rowById(id)[C('สถานะ :')], 'รออนุมัติ');
  });
  t('row is 48 wide with uploaded file links', () => { const r = rowById(id); eq(r.length, 49); ok(/^https:\/\/lh3\.googleusercontent\.com\/d\//.test(r[C('รูปสลิปเงินโอน :')])); ok(/^https:\/\/drive\.google\.com\/uc\?id=/.test(r[C('ใบเสร็จ :')])); eq(driveFiles.length, 2); });
  t('barcode stored separately', () => { const i2 = ctx.saveRequest(staff, form({ barcode_ais: 'B1', discountais: '500' })).id; eq(rowById(i2)[C('ส่วนลด เปิดเบอร์ AIS :')], 500); eq(rowById(i2)[C('บาร์โค้ด AIS :')], 'B1'); });
  t('ids are unique on same millisecond', () => { const realNow = Date.now; Date.now = () => 1700000000000; try { const a = ctx.saveRequest(staff, form()).id, b = ctx.saveRequest(staff, form()).id; ok(a !== b, a + '==' + b); } finally { Date.now = realNow; } });
  t('invalid id card rejected', () => throws(() => ctx.saveRequest(staff, form({ id_card_number: '123' })), /เลขบัตรประชาชน/));
  t('invalid phone rejected', () => throws(() => ctx.saveRequest(staff, form({ customer_phone: '12345' })), /เบอร์ติดต่อลูกค้า/));
  t('Thai ID with a wrong check digit rejected', () => throws(() => ctx.saveRequest(staff, form({ id_card_number: '1103700012345' })), /เลขตรวจสอบ/));
  t('Thai ID typed with dashes is accepted and stored as 13 digits', () => { const i = ctx.saveRequest(staff, form({ id_card_number: '1-1037-00012-34-6' })).id; eq(rowById(i)[C('เลขบัตรประชาชน :')], "'1103700012346"); eq(rowById(i)[C('ประเภทเอกสาร :')], 'บัตรประชาชน'); });
  t('passport stored upper-case with its type', () => { const i = ctx.saveRequest(staff, form({ id_type: 'พาสปอร์ต', id_card_number: ' aa 1234567 ' })).id; eq(rowById(i)[C('เลขบัตรประชาชน :')], "'AA1234567"); eq(rowById(i)[C('ประเภทเอกสาร :')], 'พาสปอร์ต'); });
  t('passport too short / with symbols rejected', () => { throws(() => ctx.saveRequest(staff, form({ id_type: 'พาสปอร์ต', id_card_number: 'A12' })), /พาสปอร์ต/); throws(() => ctx.saveRequest(staff, form({ id_type: 'พาสปอร์ต', id_card_number: 'A1234#67' })), /พาสปอร์ต/); });
  t('unknown document type rejected', () => throws(() => ctx.saveRequest(staff, form({ id_type: 'ใบขับขี่' })), /ประเภทเอกสาร/));
  t('phones: Thai mobile, landline, +66 and foreign numbers', () => {
    const ph = v => ctx.normalizePhone_(v);
    eq([ph('081-234-5678'), ph('02 123 4567'), ph('+66 81 234 5678'), ph('+1 (415) 555-2671'), ph('+44 20 7946 0958')], ['0812345678', '021234567', '0812345678', '+14155552671', '+442079460958']);
    eq([ph('0112345678'), ph('081234567'), ph('12345'), ph('+0123456789'), ph('+1234567890123456'), ph('08x2345678')], ['', '', '', '', '', '']);
  });
  t('customer phone stored normalised, foreign number kept with +', () => { const i = ctx.saveRequest(staff, form({ customer_phone: '+1 415 555 2671', emp_phone: '081-234-5678' })).id; eq(rowById(i)[C('เบอร์ติดต่อลูกค้า :')], "'+14155552671"); eq(rowById(i)[C('เบอร์ติดต่อ(พนง.) :')], "'0812345678"); });
  t('missing required field rejected', () => throws(() => ctx.saveRequest(staff, form({ customer_name: ' ' })), /ชื่อตัวและสกุล/));
  t('negative amount rejected', () => throws(() => ctx.saveRequest(staff, form({ down: '-5' })), /เงินดาวน์/));
  t('installments out of range rejected', () => throws(() => ctx.saveRequest(staff, form({ installments: '0' })), /จำนวนงวด/));
  t('pdf mime enforced', () => throws(() => ctx.saveRequest(staff, form({ file2Data: { mimeType: 'image/png', base64: 'AA==', name: 'x' } })), /PDF/));
  t('slip must be image', () => throws(() => ctx.saveRequest(staff, form({ file1Data: { mimeType: 'text/html', base64: 'AA==', name: 'x' } })), /รูป/));
  t('missing file rejected', () => throws(() => ctx.saveRequest(staff, form({ file2Data: null })), /PDF/));
  t('file over 10MB rejected', () => throws(() => ctx.saveRequest(staff, form({ file1Data: { mimeType: 'image/jpeg', base64: 'A'.repeat(14 * 1024 * 1024), name: 'x' } })), /10 MB/));
  t('saveRequest stores finance trimmed', () => { const i = ctx.saveRequest(staff, form({ finance: ' Vyvr ' })).id; eq(rowById(i)[C('ไฟแนนซ์ :')], 'Vyvr'); });
  t('unknown finance rejected', () => throws(() => ctx.saveRequest(staff, form({ finance: 'KTC' })), /ไฟแนนซ์/));
  t('empty finance rejected', () => throws(() => ctx.saveRequest(staff, form({ finance: '' })), /ไฟแนนซ์/));
  t('getAllDropdownData returns finance', () => eq(ctx.getAllDropdownData(staff).finance, [['Ponmai'], ['Vyvr']]));
  t('new request message contains finance', () => { ctx.setConfigProperties(admin, { emailTo: 'a@b.c' }); ctx.saveRequest(staff, form({ finance: 'Vyvr' })); ok(/ไฟแนนซ์: Vyvr/.test(mail[mail.length - 1].htmlBody), 'no finance in mail'); });
  t('empty Finance list rejects save', () => { const keep = sheets.Finance.rows.splice(1); try { throws(() => ctx.saveRequest(staff, form()), /ไฟแนนซ์/); } finally { sheets.Finance.rows.push(...keep); } });
  t('formula-like text stored as plain text', () => { const i = ctx.saveRequest(staff, form({ customer_name: '=IMPORTXML("x")', imei: '+123', premium_combined: '@a', barcode_ais: '-1+1' })).id; const r = rowById(i); eq(r[C('ชื่อตัวและสกุล (ลูกค้า) :')], "'=IMPORTXML(\"x\")"); eq(r[C('IMEI :')], "'+123"); eq(r[C('PREMIUM :')], "'@a"); eq(r[C('บาร์โค้ด AIS :')], "'-1+1"); });
  t('plain text and lone dash untouched', () => { const i = ctx.saveRequest(staff, form({ customer_name: 'สมชาย', barcode_ais: '-' })).id; eq(rowById(i)[C('ชื่อตัวและสกุล (ลูกค้า) :')], 'สมชาย'); eq(rowById(i)[C('บาร์โค้ด AIS :')], '-'); });
  t('uploaded files trashed when the save fails', () => { const n = driveFiles.length; lockState.fail = true; try { throws(() => ctx.saveRequest(staff, form()), /กำลังประมวลผล/); } finally { lockState.fail = false; } eq(driveFiles.length, n + 2); ok(driveFiles.slice(n).every(f => f.trashed), 'orphan files not trashed'); });
  t('new request email sent', () => { ctx.setConfigProperties(admin, { emailTo: 'a@b.c' }); const n = mail.length; ctx.saveRequest(staff, form()); eq(mail.length, n + 1); });

  t('staff cannot updateStatus', () => throws(() => ctx.updateStatus(staff, { record: id, action: 'approve', financeAmount: '1' }), /FORBIDDEN/));
  t('unknown action rejected', () => throws(() => ctx.updateStatus(acc, { record: id, action: 'hack' }), /INVALID_ACTION/));
  t('unknown record rejected', () => throws(() => ctx.updateStatus(acc, { record: 'nope', action: 'approve', financeAmount: '1' }), /ไม่พบ/));
  t('approve requires amount', () => throws(() => ctx.updateStatus(acc, { record: id, action: 'approve', financeAmount: '' }), /ยอดเงินโอน/));
  t('workflow remarks stored as plain text', () => { const i = ctx.saveRequest(staff, form()).id; ctx.updateStatus(acc, { record: i, action: 'reject', Remark: '=HYPERLINK("x")' }); eq(rowById(i)[C('Remark(การเงิน) :')], "'=HYPERLINK(\"x\")"); });
  t('approve from empty status', () => { setStatus(id, ''); eq(ctx.updateStatus(acc, { record: id, action: 'approve', financeAmount: '8,700', Remark: 'ok' }).status, 'รอเปิด SO'); eq(rowById(id)[C('ยอดเงินโอนที่ได้รับ(การเงิน) :')], '8,700'); });
  t('double approve rejected', () => throws(() => ctx.updateStatus(acc, { record: id, action: 'approve', financeAmount: '1' }), /ดำเนินการไปแล้ว/));
  t('log has record id and session actor', () => { const l = sheets.Log.rows[sheets.Log.getLastRow() - 1]; eq(l[1], 'ฝ่ายบัญชี'); eq(l[2], 'รอเปิด SO'); eq(l[3], id); eq(l[4], 'approve'); });
  t('client-sent name/status ignored', () => { const i4 = ctx.saveRequest(staff, form()).id; ctx.updateStatus(acc, { record: i4, action: 'approve', financeAmount: '1', status: 'เสร็จสมบูรณ์', name: 'hacker' }); eq(rowById(i4)[C('สถานะ :')], 'รอเปิด SO'); eq(sheets.Log.rows[sheets.Log.getLastRow() - 1][1], 'ฝ่ายบัญชี'); });
  t('cannot skip to AR', () => { const i2 = ctx.saveRequest(staff, form()).id; throws(() => ctx.updateStatus(acc, { record: i2, action: 'updateAR', invoice: 'X' }), /ดำเนินการไปแล้ว/); });
  t('updateSO requires SO number', () => throws(() => ctx.updateStatus(acc, { record: id, action: 'updateSO', soCreated: '' }), /Sales Order/));
  t('updateSO from อนุมัติแล้ว', () => { setStatus(id, 'อนุมัติแล้ว'); eq(ctx.updateStatus(admin, { record: id, action: 'updateSO', soCreated: 'SO1' }).status, 'รอเปิด Invoice'); eq(rowById(id)[C('Sales Order created :')], 'SO1'); });
  t('updateAR completes', () => { eq(ctx.updateStatus(acc, { record: id, action: 'updateAR', invoice: 'INV1' }).status, 'เสร็จสมบูรณ์'); eq(rowById(id)[C('Invoice บัญชี :')], 'INV1'); });
  t('reject requires remark', () => { const i3 = ctx.saveRequest(staff, form()).id; throws(() => ctx.updateStatus(acc, { record: i3, action: 'reject', Remark: '' }), /หมายเหตุ/); eq(ctx.updateStatus(acc, { record: i3, action: 'reject', Remark: 'เอกสารไม่ครบ' }).status, 'ไม่อนุมัติ'); });

  t('getData needs session', () => throws(() => ctx.getData(''), /AUTH_REQUIRED/));
  t('staff sees masked id card', () => { const rows = ctx.getData(staff); ok(rows.length > 0); rows.forEach(r => ok(/^X{9}\d{4}$/.test(r[6]), r[6])); });
  t('accounting sees full id card', () => eq(ctx.getData(acc)[0][6], '1103700012346'));
  t('getData rows padded to 49', () => ctx.getData(acc).forEach(r => eq(r.length, 49)));
  t('branch scope: staff sees only rows of registered branches', () => {
    const other = ctx.saveRequest(admin, form({ location: 'สาขา Z' })).id;
    ok(ctx.getData(staff).length > 0); ok(ctx.getData(staff).every(r => r[2] === 'สาขา A'), 'foreign row leaked');
    ok(ctx.getData(acc).some(r => r[0] === other), 'บัญชี must see all branches');
    throws(() => ctx.findRecord(staff, other), /ไม่พบข้อมูล/);
    eq(ctx.findRecord(acc, other)[2], 'สาขา Z');
  });
  t('branch scope: staff cannot submit for another branch', () => throws(() => ctx.saveRequest(staff, form({ location: 'สาขา Z' })), /ไม่ใช่สาขาที่ลงทะเบียน/));
  t('branch scope: relief staff covers each registered branch', () => {
    g.seedAdmin(['relief1', 'reliefpw', 'หน่วยแทน', 'พนักงาน', '', '', 'สาขา A, สาขา Z', '']);
    const tk = ctx.login('relief1', 'reliefpw').token;
    ctx.saveRequest(tk, form({ location: 'สาขา Z' }));
    const seen = new Set(ctx.getData(tk).map(r => r[2])); eq([...seen].sort(), ['สาขา A', 'สาขา Z']);
  });
  t('branch scope: staff without a branch sees nothing and cannot submit', () => {
    g.seedAdmin(['nob1', 'nobpw', 'ไม่มีสาขา', 'พนักงาน']);
    const tk = ctx.login('nob1', 'nobpw').token;
    eq(ctx.getData(tk), []); throws(() => ctx.saveRequest(tk, form()), /ยังไม่ได้กำหนดสาขา/);
  });
  t('branch scope: dropdown lists only my branches for staff, all for บัญชี', () => {
    ['สาขา A', 'สาขา Z', 'สาขา Q'].forEach(n => sheets.location.appendRow([n]));
    eq(ctx.getAllDropdownData(staff).location, [['สาขา A']]);
    eq(ctx.getAllDropdownData(acc).location.length, 3); eq(ctx.getAllDropdownData(acc).me.scoped, false);
    sheets.location.rows.splice(1);
  });
  t('findRecord masks for staff', () => ok(/^X{9}2346$/.test(ctx.findRecord(staff, id)[6])));
  t('findRecord unknown id', () => throws(() => ctx.findRecord(acc, 'zzz'), /ไม่พบ/));
  t('legacy functions removed', () => ['saveDataB64', 'statusRecordWithRemark'].forEach(f => eq(typeof ctx[f], 'undefined', f)));
}

// ===================== Final review fixes =====================
console.log('== FINAL REVIEW FIXES');
{
  // C1: live Data sheet created by the original code is exactly 41 columns wide.
  const g = createGas(); const { ctx, ss, sheets } = g;
  const d = ss.insertSheet('Data'); d.maxCols = 41; d.appendRow(OLD_HEADERS_41.slice());
  const legacy = OLD_HEADERS_41.map(() => ''); legacy[0] = '111'; legacy[6] = '1103700012345'; legacy[32] = 'อนุมัติแล้ว'; legacy[37] = 'SO9'; d.appendRow(legacy);
  const lg = ss.insertSheet('Log'); lg.maxCols = 3; lg.appendRow(['วันที่/เวลา', 'ผู้ดำเนินการ', 'สถานะการอนุมัติ']);
  const ad = ss.insertSheet('Admin'); ad.appendRow(['Username', 'Password', 'ชื่อผู้ใช้งาน', 'สิทธิ์']); ad.appendRow(['boss', 'bosspw', 'บอส', 'แอดมิน']);
  const tk = ctx.login('boss', 'bosspw').token;
  t('C1 getData works on a 41-column live sheet', () => { const rows = ctx.getData(tk); eq(rows.length, 1); eq(rows[0].length, 49); eq(rows[0][46], ''); });
  t('C1 data columns grown to 48 with headers', () => { ok(sheets.Data.getMaxColumns() >= 49); eq(sheets.Data.rows[0].slice(41), ctx.DATA_HEADERS.slice(41)); });
  // I1: legacy 'อนุมัติแล้ว' row whose SO is already filled must be finishable via updateAR.
  t('I1 updateAR from อนุมัติแล้ว with SO filled', () => eq(ctx.updateStatus(tk, { record: '111', action: 'updateAR', invoice: 'INV9' }).status, 'เสร็จสมบูรณ์'));
  t('C1 Log extended and written on narrow sheet', () => { const l = sheets.Log.rows[sheets.Log.getLastRow() - 1]; eq(l[3], '111'); });
  t('C1 initializeAllSheets on narrow sheets', () => ok(ctx.initializeAllSheets(tk).length >= 8));
}
{
  const g = fixture(); const { ctx, sheets } = g;
  const acc = g.tok('acc1');
  const row = OLD_HEADERS_41.map(() => ''); row[0] = '222'; row[32] = 'อนุมัติแล้ว'; sheets.Data.appendRow(row.concat(['', '', '', '', '']));
  t('I1 updateAR from อนุมัติแล้ว without SO rejected', () => throws(() => ctx.updateStatus(acc, { record: '222', action: 'updateAR', invoice: 'X' }), /ดำเนินการไปแล้ว/));
  const row2 = row.slice(); row2[0] = '333'; row2[37] = 'SO1'; sheets.Data.appendRow(row2.concat(['', '', '', '', '']));
  t('I1 updateSO from อนุมัติแล้ว with SO already filled rejected', () => throws(() => ctx.updateStatus(acc, { record: '333', action: 'updateSO', soCreated: 'SO2' }), /ดำเนินการไปแล้ว/));
}
{
  // I2: Drive uploads must happen outside the script lock.
  const g = fixture(); const { ctx, lockState } = g;
  const staff = g.tok('staff1');
  let uploadsUnderLock = 0;
  const realGet = ctx.DriveApp.getFolderById;
  ctx.DriveApp.getFolderById = id => { const f = realGet(id); return { getId: f.getId, createFile: b => { if (lockState.held) uploadsUnderLock++; return f.createFile(b); } }; };
  const realLock = ctx.LockService.getScriptLock;
  ctx.LockService.getScriptLock = () => { const l = realLock(); return { waitLock: x => { l.waitLock(x); lockState.held = true; }, releaseLock: () => { lockState.held = false; l.releaseLock(); } }; };
  const b64 = Buffer.alloc(8, 1).toString('base64');
  ctx.saveRequest(staff, { date: '2026-11-25', location: 'สาขา A', emp_id: 'E', emp_name: 'N', emp_phone: '0812345678', id_card_number: '1103700012346', customer_name: 'C', customer_phone: '0812345678', address: 'a', road: 'r', district: 'd', amphoe: 'a', province: 'p', zipcode: '10200', productname: 'P', imei: 'I', price: '1', installments: '1', finance: 'Ponmai', file1Data: { base64: b64, mimeType: 'image/png', name: 'a' }, file2Data: { base64: b64, mimeType: 'application/pdf', name: 'b' } });
  t('I2 uploads happen outside the lock', () => eq(uploadsUnderLock, 0));
}
{
  // I3: header back-fill must not misplace columns when the live header row differs.
  const g = createGas(); const { ctx, ss, sheets } = g;
  const h = OLD_HEADERS_41.slice(); h[10] = ''; const d = ss.insertSheet('Data'); d.appendRow(h);
  t('I3 mismatched header row refused', () => throws(() => ctx.ensureSheets_(), /หัวตาราง/));
  t('I3 nothing written on mismatch', () => eq(sheets.Data.rows[0].length, 41));
}
{
  // I4: legacy blank role meant admin; keep that when the sheet has no explicit แอดมิน.
  const g = createGas(); const { ctx, ss } = g; ctx.ensureSheets_();
  const ad = ss.getSheetByName('Admin'); ad.appendRow(['old', 'oldpw', 'เจ้าของ', '']); ad.appendRow(['s', 'spw', 'พนง', 'พนักงาน']);
  t('I4 blank role is admin when no explicit admin exists', () => eq(ctx.login('old', 'oldpw').role, 'แอดมิน'));
  ad.appendRow(['real', 'realpw', 'แอดมินจริง', 'แอดมิน']);
  t('I4 blank role is staff once an explicit admin exists', () => eq(ctx.login('old', 'oldpw').role, 'พนักงาน'));
}

// @@TASK6@@

process.on('exit', () => {
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { fails.forEach(f => console.log('  - ' + f)); process.exitCode = 1; }
});
