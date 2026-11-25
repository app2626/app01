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

// @@TASK3@@

process.on('exit', () => {
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { fails.forEach(f => console.log('  - ' + f)); process.exitCode = 1; }
});
