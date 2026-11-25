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
  t('DATA_HEADERS has 46 columns', () => eq(ctx.DATA_HEADERS.length, 46));
  t('DATA_HEADERS keeps the old 41 verbatim', () => eq(ctx.DATA_HEADERS.slice(0, 41), OLD_HEADERS_41));
  t('col_ status is 33', () => eq(ctx.col_('สถานะ :'), 33));
  t('col_ unknown throws', () => throws(() => ctx.col_('nope'), /Unknown column/));
  t('ensureSheets_ creates all 8 sheets', () => { ctx.ensureSheets_(); ['Data', 'Log', 'Admin', 'Config', 'location', 'Product', 'Premium', 'guarantee'].forEach(n => ok(sheets[n], n)); });
  t('Log header has record id', () => eq(sheets.Log.rows[0], ctx.LOG_HEADERS));
}
{
  const { ctx, ss, sheets } = createGas();
  t('ensureSheets_ extends old 41-col header without touching data', () => {
    const d = ss.insertSheet('Data'); d.appendRow(OLD_HEADERS_41.slice()); const row = OLD_HEADERS_41.map((_, i) => 'v' + i); d.appendRow(row.slice());
    const lg = ss.insertSheet('Log'); lg.appendRow(['วันที่/เวลา', 'ผู้ดำเนินการ', 'สถานะการอนุมัติ']); lg.appendRow(['x', 'y', 'z']);
    ctx.ensureSheets_();
    eq(sheets.Data.rows[0].length, 46); eq(sheets.Data.rows[0][45], 'บาร์โค้ด Big point :'); eq(sheets.Data.rows[1], row);
    eq(sheets.Log.rows[0], ctx.LOG_HEADERS); eq(sheets.Log.rows[1], ['x', 'y', 'z']);
  });
  t('getDataSheet_ returns Data sheet', () => eq(ctx.getDataSheet_().getName(), 'Data'));
}

// ===================== shared fixtures =====================
function fixture() {
  const g = createGas();
  g.ctx.ensureSheets_();
  g.seedAdmin = row => g.sheets.Admin.appendRow(row);
  g.seedAdmin(['admin1', 'adminpw', 'แอดมินใหญ่', 'แอดมิน']);
  g.seedAdmin(['acc1', 'accpw', 'ฝ่ายบัญชี', 'บัญชี']);
  g.seedAdmin(['staff1', 'staffpw', 'พนักงานหนึ่ง', 'พนักงาน']);
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

// ===================== Task 3: guards, settings, config =====================
console.log('== GUARDS / SETTINGS');
{
  const g = fixture(); const { ctx, sheets, mail, fetches, lockState } = g;
  const admin = g.tok('admin1'), acc = g.tok('acc1'), staff = g.tok('staff1');
  const lastRow = n => sheets[n].rows[sheets[n].getLastRow() - 1];
  const adminOnly = {
    getConfigProperties: [], setConfigProperties: [{}], getSettingsData: ['location'], addSettingData: ['location', ['x']],
    deleteSettingData: ['location', 0, 'x'], resetPassword: ['staff1', 'newpass1'], initializeAllSheets: [],
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
  t('delete with matching key ok', () => { ctx.deleteSettingData(admin, 'location', 0, 'สาขา A'); eq(sheets.location.getLastRow(), 1); });
  t('cannot delete last admin', () => throws(() => ctx.deleteSettingData(admin, 'Admin', 0, 'admin1'), /อย่างน้อย 1/));
  t('added admin password is hashed', () => { ctx.addSettingData(admin, 'Admin', ['u9', 'secret9', 'n', 'พนักงาน']); ok(/^sha256\$/.test(lastRow('Admin')[1])); ok(ctx.login('u9', 'secret9')); });
  t('duplicate username rejected', () => throws(() => ctx.addSettingData(admin, 'Admin', ['u9', 'x', 'n', 'พนักงาน']), /มีอยู่แล้ว/));
  t('invalid role rejected', () => throws(() => ctx.addSettingData(admin, 'Admin', ['u10', 'secret10', 'n', 'root']), /สิทธิ์/));
  t('resetPassword hashes and works', () => { ctx.resetPassword(admin, 'staff1', 'brandnew1'); ok(ctx.login('staff1', 'brandnew1')); ok(/^sha256\$/.test(sheets.Admin.rows[3][1])); });
  t('resetPassword too short', () => throws(() => ctx.resetPassword(admin, 'staff1', '123'), /6/));
  t('lock timeout surfaces error', () => { lockState.fail = true; try { throws(() => ctx.addSettingData(admin, 'location', ['y']), /กำลังประมวลผล/); } finally { lockState.fail = false; } });
  t('email body escaped', () => { ctx.setConfigProperties(admin, { emailTo: 'a@b.c' }); ctx.sendNotify_('<b>x</b>\nline2', false, [], 's'); const m = mail[mail.length - 1]; ok(m.htmlBody.includes('&lt;b&gt;x&lt;/b&gt;<br>line2'), m.htmlBody); });
  t('telegram skipped when chat id empty', () => { const n = fetches.length; ctx.sendNotify_('m', true, [], 's'); eq(fetches.length, n); });
  t('old unguarded helpers removed', () => ['setRemark', 'updateHeadersNow', 'getDataSheet'].forEach(f => eq(typeof ctx[f], 'undefined', f)));
}

// @@TASK4@@

process.on('exit', () => {
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { fails.forEach(f => console.log('  - ' + f)); process.exitCode = 1; }
});
