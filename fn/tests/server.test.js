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
  t('DATA_HEADERS has 47 columns', () => eq(ctx.DATA_HEADERS.length, 47));
  t('finance is column 47', () => eq(ctx.col_('ไฟแนนซ์ :'), 47));
  t('DATA_HEADERS keeps the old 41 verbatim', () => eq(ctx.DATA_HEADERS.slice(0, 41), OLD_HEADERS_41));
  t('col_ status is 33', () => eq(ctx.col_('สถานะ :'), 33));
  t('col_ unknown throws', () => throws(() => ctx.col_('nope'), /Unknown column/));
  t('ensureSheets_ creates all 9 sheets', () => { ctx.ensureSheets_(); ['Data', 'Log', 'Admin', 'Config', 'location', 'Product', 'Premium', 'guarantee', 'Finance'].forEach(n => ok(sheets[n], n)); });
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
    eq(sheets.Data.rows[0].length, 47); eq(sheets.Data.rows[0][45], 'บาร์โค้ด Big point :'); eq(sheets.Data.rows[0][46], 'ไฟแนนซ์ :'); eq(sheets.Data.rows[1], row);
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
    deleteSettingData: ['location', 0, 'x'], updateSettingData: ['location', 0, 'x', ['y']], addSettingDataBulk: ['location', ['a']], resetPassword: ['staff1', 'newpass1'], initializeAllSheets: [],
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
  t('update list item renames in place', () => { ctx.updateSettingData(admin, 'location', 0, 'สาขา A', [' สาขา A1 ']); eq(sheets.location.rows[1], ['สาขา A1']); sheets.location.rows[1] = ['สาขา A']; });
  t('update with stale key rejected', () => throws(() => ctx.updateSettingData(admin, 'location', 0, 'wrong', ['z']), /เปลี่ยนแปลง/));
  t('update to empty rejected', () => throws(() => ctx.updateSettingData(admin, 'location', 0, 'สาขา A', ['  ']), /กรุณากรอก/));
  t('update to duplicate rejected', () => { sheets.location.appendRow(['สาขา B']); try { throws(() => ctx.updateSettingData(admin, 'location', 0, 'สาขา A', ['สาขา B']), /มีอยู่แล้ว/); } finally { sheets.location.rows.pop(); } });
  t('update admin changes name and role, keeps username and hash', () => {
    const before = sheets.Admin.rows[3].slice();
    ctx.updateSettingData(admin, 'Admin', 2, 'staff1', ['ignored', '', 'พนักงานใหม่', 'บัญชี']);
    eq(sheets.Admin.rows[3], [before[0], before[1], 'พนักงานใหม่', 'บัญชี']);
    sheets.Admin.rows[3] = before;
  });
  t('update admin invalid role rejected', () => throws(() => ctx.updateSettingData(admin, 'Admin', 2, 'staff1', ['', '', 'x', 'root']), /สิทธิ์/));
  t('cannot demote last admin', () => throws(() => ctx.updateSettingData(admin, 'Admin', 0, 'admin1', ['', '', 'แอดมินใหญ่', 'บัญชี']), /อย่างน้อย 1/));
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

// ===================== Task 4: requests & workflow =====================
console.log('== REQUESTS / WORKFLOW');
{
  const g = fixture(); const { ctx, sheets, driveFiles, mail } = g;
  const admin = g.tok('admin1'), acc = g.tok('acc1'), staff = g.tok('staff1');
  const b64 = n => Buffer.alloc(n, 1).toString('base64');
  const form = (o = {}) => Object.assign({
    date: '2026-11-25', location: 'สาขา A', emp_id: 'E01', emp_name: 'พนักงานหนึ่ง', emp_phone: '0812345678',
    id_card_number: '1103700012345', customer_name: 'ลูกค้า ทดสอบ', customer_phone: '0898765432', address: '1/2', road: '3',
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
  t('row is 47 wide with uploaded file links', () => { const r = rowById(id); eq(r.length, 47); ok(/^https:\/\/lh3\.googleusercontent\.com\/d\//.test(r[C('รูปสลิปเงินโอน :')])); ok(/^https:\/\/drive\.google\.com\/uc\?id=/.test(r[C('ใบเสร็จ :')])); eq(driveFiles.length, 2); });
  t('barcode stored separately', () => { const i2 = ctx.saveRequest(staff, form({ barcode_ais: 'B1', discountais: '500' })).id; eq(rowById(i2)[C('ส่วนลด เปิดเบอร์ AIS :')], 500); eq(rowById(i2)[C('บาร์โค้ด AIS :')], 'B1'); });
  t('ids are unique on same millisecond', () => { const realNow = Date.now; Date.now = () => 1700000000000; try { const a = ctx.saveRequest(staff, form()).id, b = ctx.saveRequest(staff, form()).id; ok(a !== b, a + '==' + b); } finally { Date.now = realNow; } });
  t('invalid id card rejected', () => throws(() => ctx.saveRequest(staff, form({ id_card_number: '123' })), /เลขบัตรประชาชน/));
  t('invalid phone rejected', () => throws(() => ctx.saveRequest(staff, form({ customer_phone: '12345' })), /เบอร์ติดต่อลูกค้า/));
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
  t('new request email sent', () => { ctx.setConfigProperties(admin, { emailTo: 'a@b.c' }); const n = mail.length; ctx.saveRequest(staff, form()); eq(mail.length, n + 1); });

  t('staff cannot updateStatus', () => throws(() => ctx.updateStatus(staff, { record: id, action: 'approve', financeAmount: '1' }), /FORBIDDEN/));
  t('unknown action rejected', () => throws(() => ctx.updateStatus(acc, { record: id, action: 'hack' }), /INVALID_ACTION/));
  t('unknown record rejected', () => throws(() => ctx.updateStatus(acc, { record: 'nope', action: 'approve', financeAmount: '1' }), /ไม่พบ/));
  t('approve requires amount', () => throws(() => ctx.updateStatus(acc, { record: id, action: 'approve', financeAmount: '' }), /ยอดเงินโอน/));
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
  t('accounting sees full id card', () => eq(ctx.getData(acc)[0][6], '1103700012345'));
  t('getData rows padded to 47', () => ctx.getData(acc).forEach(r => eq(r.length, 47)));
  t('findRecord masks for staff', () => ok(/^X{9}2345$/.test(ctx.findRecord(staff, id)[6])));
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
  t('C1 getData works on a 41-column live sheet', () => { const rows = ctx.getData(tk); eq(rows.length, 1); eq(rows[0].length, 47); eq(rows[0][46], ''); });
  t('C1 data columns grown to 47 with headers', () => { ok(sheets.Data.getMaxColumns() >= 47); eq(sheets.Data.rows[0].slice(41), ctx.DATA_HEADERS.slice(41)); });
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
  ctx.saveRequest(staff, { date: '2026-11-25', location: 'A', emp_id: 'E', emp_name: 'N', emp_phone: '0812345678', id_card_number: '1103700012345', customer_name: 'C', customer_phone: '0812345678', address: 'a', road: 'r', district: 'd', amphoe: 'a', province: 'p', zipcode: '10200', productname: 'P', imei: 'I', price: '1', installments: '1', finance: 'Ponmai', file1Data: { base64: b64, mimeType: 'image/png', name: 'a' }, file2Data: { base64: b64, mimeType: 'application/pdf', name: 'b' } });
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
