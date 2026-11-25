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

// @@TASK2@@

process.on('exit', () => {
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { fails.forEach(f => console.log('  - ' + f)); process.exitCode = 1; }
});
