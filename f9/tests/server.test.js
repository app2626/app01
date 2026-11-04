// Server-side tests: Code.js + Coupons.js against the in-memory GAS mock (gasmock.js). Run: npm run test:server
const fs = require('fs'), crypto = require('crypto');
const { ctx, sheets, cache, ss, SRC } = require('./gasmock.js');
// ---------- tiny test runner ----------
let pass = 0, fail = 0; const fails = [];
function t(name, fn) { try { const r = fn(); if (r === false) throw new Error('returned false'); pass++; console.log('  ok   ' + name); } catch (e) { fail++; fails.push(name + ' -> ' + e.message); console.log('  FAIL ' + name + ' -> ' + e.message); } }
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'neq') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); };
const ok = (c, m) => { if (!c) throw new Error(m || 'assert'); };
const throws = (fn, re) => { try { fn(); } catch (e) { if (re && !re.test(e.message)) throw new Error('wrong error: ' + e.message); return; } throw new Error('expected throw'); };
const api = (a, p, u) => ctx.apiHandler(a, p || {}, u);
const unwrap = r => (r && typeof r === 'object' && 'status' in r && r.status === 'error') ? (() => { throw new Error(r.message); })() : r;

console.log('== SETUP');
let admin, adminPw;
t('setupDatabase creates sheets + admin', () => { const r = ctx.setupDatabase(null); eq(r.status, 'success'); adminPw = r.initialAdmin.password; ok(adminPw.length >= 8); ok(Object.keys(sheets).length >= 15); });
t('setupDatabase re-run requires admin token', () => throws(() => ctx.setupDatabase(null), /Unauthorized/));
t('Products header has Original Price + specs', () => ok(sheets.Products.rows[0].includes('Original Price') && sheets.Products.rows[0].includes('Warranty')));

console.log('== AUTH');
t('login wrong password rejected', () => { const r = api('LOGIN', { username: 'admin', password: 'nope' }); ok(r.status === 'error' || r.success === false || !r.Token, JSON.stringify(r)); });
t('login ok returns token', () => { const r = api('LOGIN', { username: 'admin', password: adminPw }); ok(r && (r.Token || (r.user && r.user.Token)), JSON.stringify(r).slice(0, 200)); admin = r.Token ? r : r.user; });
t('no token => Unauthorized', () => { const r = api('GET_ALL_DATA', {}, null); ok(r && r.status === 'error' && /Unauthorized/.test(r.message), JSON.stringify(r)); });
t('forged token rejected', () => { const r = api('GET_ALL_DATA', {}, { Token: admin.Token.slice(0, -3) + 'abc' }); ok(r.status === 'error', JSON.stringify(r)); });
t('verifyToken(valid) username', () => eq(ctx.verifyToken(admin.Token).Username, 'admin'));
t('login rate-limit after 5 fails', () => { for (let i = 0; i < 6; i++) api('LOGIN', { username: 'ghost', password: 'x' }); const r = api('LOGIN', { username: 'ghost', password: 'x' }); ok(/พยายาม|หลาย|ล็อก|lock|many/i.test(JSON.stringify(r)), JSON.stringify(r)); });

console.log('== READ');
let all;
t('GET_ALL_DATA', () => { all = unwrap(api('GET_ALL_DATA', {}, admin)); ok(all.products && all.products.length === 6, 'products=' + (all.products || []).length); });
['Products', 'Branches', 'Channels', 'Promotions', 'Interests', 'GiftMappings', 'Members', 'Orders', 'Settings', 'UI_Banners', 'Target', 'AuditLog', 'InventoryLog'].forEach(n =>
  t('GET_TABLE ' + n, () => { const r = api('GET_TABLE', { tableName: n }, admin); ok(Array.isArray(r) || (r && r.status !== 'error'), JSON.stringify(r).slice(0, 150)); }));
t('GET_ADVANCED_DASHBOARD', () => { const r = api('GET_ADVANCED_DASHBOARD', {}, admin); ok(r && r.status !== 'error', JSON.stringify(r).slice(0, 200)); });
t('dashboard cache: 2nd read served from cache (same builtAt); never contains Password', () => {
  const r1 = api('GET_ADVANCED_DASHBOARD', {}, admin); const r2 = api('GET_ADVANCED_DASHBOARD', {}, admin);
  ok(r1.data.builtAt && r1.data.builtAt === r2.data.builtAt, 'builtAt ' + r1.data.builtAt + ' vs ' + r2.data.builtAt);
  ok(ctx.dashCacheGet_() !== null, 'cache empty');
  ok(!JSON.stringify(ctx.dashCacheGet_()).includes('"Password"'), 'password leaked into cache');
  ok(r1.data.members.every(m => !('Password' in m)));
});
t('dashboard cache: refresh:true rebuilds; any write action invalidates it', () => {
  api('GET_ADVANCED_DASHBOARD', {}, admin); ok(ctx.dashCacheGet_() !== null);
  api('CLEAR_CACHE', {}, admin); eq(ctx.dashCacheGet_(), null);
  api('GET_ADVANCED_DASHBOARD', {}, admin); ok(ctx.dashCacheGet_() !== null);
  const r = api('GET_ADVANCED_DASHBOARD', { refresh: true }, admin); ok(r.status === 'success' && ctx.dashCacheGet_() !== null);
});
t('dashboard cache: large payload is chunked and round-trips intact', () => {
  const big = { orders: Array.from({ length: 400 }, (_, i) => ({ id: i, note: 'ทดสอบข้อความไทยยาว'.repeat(8) })), builtAt: 1 };
  ctx.dashCachePut_(JSON.stringify(big)); const back = ctx.dashCacheGet_(); eq(back.orders.length, 400); eq(back.orders[399].note, big.orders[399].note);
  ctx.invalidateDashboardCache_(); eq(ctx.dashCacheGet_(), null);
});
t('GET_SETTINGS_LIST', () => { const r = api('GET_SETTINGS_LIST', {}, admin); ok(r && r.status !== 'error', JSON.stringify(r).slice(0, 200)); });
t('getPublicConfig', () => { const r = ctx.getPublicConfig(); ok('loginBg' in r && 'logoUrl' in r); });
t('doGet renders Index', () => { const o = ctx.doGet({}); ok(o.html.includes('tmpl-pos')); });
t('doGet passes a safe ?track= value to the template', () => { ctx.doGet({ parameter: { track: 'ORD-20261104-001' } }); eq(ctx.__lastTemplate.trackParam, 'ORD-20261104-001'); ctx.doGet({ parameter: { orderId: 'ORD-9' } }); eq(ctx.__lastTemplate.trackParam, 'ORD-9'); });
t('doGet drops an unsafe ?track= value (script injection)', () => { ctx.doGet({ parameter: { track: '</script><script>alert(1)</script>' } }); eq(ctx.__lastTemplate.trackParam, ''); ctx.doGet({ parameter: { track: 'x'.repeat(65) } }); eq(ctx.__lastTemplate.trackParam, ''); ctx.doGet({}); eq(ctx.__lastTemplate.trackParam, ''); });
t('doGet passes ?p= model to template, stripping script-breaking characters', () => { ctx.doGet({ parameter: { p: 'SAMSUNG GALAXY S26</script><script>alert(1)</script>' } }); const v = ctx.__lastTemplate.deepModel; ok(v && !/[<>&]/.test(v), String(v)); ctx.doGet({ parameter: { p: 'SAMSUNG GALAXY Z FOLD 8 ULTRA 12/256GB' } }); eq(ctx.__lastTemplate.deepModel, 'SAMSUNG GALAXY Z FOLD 8 ULTRA 12/256GB'); });
t('doGet ignores an over-long ?p= value', () => { ctx.doGet({ parameter: { p: 'x'.repeat(500) } }); eq(ctx.__lastTemplate.deepModel, ''); });
t('include()', () => ok(ctx.include('CSS').includes('<style')));

const tbl = (n, u) => { const r = api('GET_TABLE', { tableName: n }, u || admin); if (r.status !== 'success') throw new Error(JSON.stringify(r)); return r.data; };
// open the booking window so checkout rules (not the date gate) are what we test
t('Settings: reservation window covers today', () => { const st = sheets.Settings; for (let i = 2; i <= st.getLastRow(); i++) { if (st._get(i, 1) === 'ReserveStart') st._set(i, 2, '2020-01-01T00:00:00'); if (st._get(i, 1) === 'ReserveEnd') st._set(i, 2, '2099-01-01T00:00:00'); } cache.remove('TABLE_Settings'); });
console.log('== CRUD / security');
t('SAVE_RECORD new Branch', () => { const r = api('SAVE_RECORD', { tableName: 'Branches', idField: 'Branch Code', data: { Channel: 'Retail', 'Branch Code': 'B99', 'Branch Name': 'ทดสอบ', Area: 'x', Mall: 'm', Region: 'r', Province: 'p', 'Type Name': 't' } }, admin); eq(r.status, 'success', JSON.stringify(r)); });
t('SAVE_RECORD duplicate ID rejected', () => eq(api('SAVE_RECORD', { tableName: 'Branches', idField: 'Branch Code', data: { Channel: 'Retail', 'Branch Code': 'B99', 'Branch Name': 'dup' } }, admin).status, 'error'));
t('SAVE_RECORD edit via _rowIndex', () => { const row = tbl('Branches').find(x => x['Branch Code'] === 'B99'); const r = api('SAVE_RECORD', { tableName: 'Branches', idField: 'Branch Code', data: Object.assign({}, row, { 'Branch Name': 'แก้ไขแล้ว' }) }, admin); eq(r.status, 'success', JSON.stringify(r)); eq(tbl('Branches').find(x => x['Branch Code'] === 'B99')['Branch Name'], 'แก้ไขแล้ว'); });
t('formula injection sanitized (SAVE_RECORD)', () => { api('SAVE_RECORD', { tableName: 'Interests', idField: 'Interest Name', data: { 'Interest Name': '=HYPERLINK("x")', Status: 'เปิด' } }, admin); const row = tbl('Interests').find(x => /HYPERLINK/.test(x['Interest Name'])); ok(row && row['Interest Name'].startsWith("'"), JSON.stringify(row)); });
t('DELETE_RECORD', () => { eq(api('DELETE_RECORD', { tableName: 'Branches', idField: 'Branch Code', idValue: 'B99' }, admin).status, 'success'); ok(!tbl('Branches').some(x => x['Branch Code'] === 'B99')); });
console.log('== USERS / ROLES');
let sales;
t('create Sales member', () => eq(api('SAVE_RECORD', { tableName: 'Members', idField: 'Username', data: { Username: 'sale1', Password: 'Pass1234!', Role: 'Sales', Name: 'พนักงาน', 'Branch Code': 'B01', 'Accessible Menus': '*' } }, admin).status, 'success'));
t('Sales login', () => { const r = api('LOGIN', { username: 'sale1', password: 'Pass1234!' }); sales = r.Token ? r : r.user; ok(sales && sales.Token, JSON.stringify(r).slice(0, 200)); });
t('Members password stored hashed, not plaintext', () => { const row = sheets.Members.rows.find(r => r[0] === 'sale1'); ok(/^[a-f0-9]{64}$/i.test(row[1]), 'stored=' + row[1]); });
t('GET_TABLE Members hides Password', () => ok(tbl('Members').every(m => !('Password' in m))));
t('Sales cannot read Members/Settings/AuditLog', () => ['Members', 'Settings', 'AuditLog'].forEach(n => eq(api('GET_TABLE', { tableName: n }, sales).status, 'error', n)));
t('Sales cannot read Target', () => eq(api('GET_TABLE', { tableName: 'Target' }, sales).status, 'error'));
t('dashboard cache: Sales gets only own-branch orders even when the shared cache was built by Admin', () => {
  const a = api('GET_ADVANCED_DASHBOARD', {}, admin); ok(ctx.dashCacheGet_() !== null, 'admin did not warm cache');
  const r = api('GET_ADVANCED_DASHBOARD', {}, sales); ok(r.status === 'success', JSON.stringify(r).slice(0, 150));
  ok(r.data.orders.every(o => o['Branch Code'] === sales['Branch Code']), 'foreign branch rows leaked');
  ok(r.data.orders.length <= a.data.orders.length);
  ok(!JSON.stringify(r).includes('"Password"'));
});
t('Sales cannot SAVE_RECORD Members', () => eq(api('SAVE_RECORD', { tableName: 'Members', idField: 'Username', data: { Username: 'evil', Password: 'x', Role: 'Admin' } }, sales).status, 'error'));
t('Sales cannot DELETE_RECORD', () => eq(api('DELETE_RECORD', { tableName: 'Products', idField: 'SKU', idValue: 'SKU-S24U' }, sales).status, 'error'));
t('Sales cannot BULK_UPDATE/CLEAR_CACHE/SAVE_PRODUCT_GROUP', () => { eq(api('BULK_UPDATE_PRODUCTS', { updates: [] }, sales).status, 'error'); eq(api('CLEAR_CACHE', {}, sales).status, 'error'); eq(api('SAVE_PRODUCT_GROUP', { shared: { Model: 'X' }, variants: [{ sku: 'X1', stock: 1 }] }, sales).status, 'error'); });
t('role claim in client token object ignored', () => eq(api('SAVE_RECORD', { tableName: 'Members', idField: 'Username', data: { Username: 'evil2', Password: 'x' } }, Object.assign({}, sales, { Role: 'Admin' })).status, 'error'));
t('CHANGE_PASSWORD + relogin', () => { const r = api('CHANGE_PASSWORD', { oldPassword: 'Pass1234!', newPassword: 'NewPass5678!' }, sales); ok(r.status !== 'error', JSON.stringify(r)); const l = api('LOGIN', { username: 'sale1', password: 'NewPass5678!' }); ok(l.Token || l.user, JSON.stringify(l).slice(0, 120)); sales = l.Token ? l : l.user; });
t('CHANGE_PASSWORD wrong old pw rejected', () => eq(api('CHANGE_PASSWORD', { oldPassword: 'bad', newPassword: 'Another1234!' }, sales).status, 'error'));
console.log('== PRODUCTS');
const flipShared = { Model: 'Galaxy Z Flip8', 'Marketing Model': 'Samsung Galaxy Z Flip8', 'Product Group': 'Z-Series', Capacity: '256GB', Price: 35900, 'Original Price': 39900, Category: 'โมบาย', Status: 'เปิด', Channel: 'ALL', Unit: 'เครื่อง', 'Image URL': '' };
t('SAVE_PRODUCT_GROUP new model w/ 2 colors', () => { const r = api('SAVE_PRODUCT_GROUP', { shared: Object.assign({}, flipShared), variants: [{ sku: 'ZF8-BLK', color: 'Black', stock: 10 }, { sku: 'ZF8-BLU', color: 'Blue', stock: 0 }] }, admin); eq(r.status, 'success', JSON.stringify(r)); eq(r.skuCount, 2); });
t('derived Product Name contains model+color', () => { const p = tbl('Products').filter(x => x.Model === 'Galaxy Z Flip8'); eq(p.length, 2); ok(/Flip8/.test(p[0]['Product Name']) && /Black/.test(p[0]['Product Name']), p[0]['Product Name']); });
t('SAVE_PRODUCT_GROUP duplicate SKU rejected', () => eq(api('SAVE_PRODUCT_GROUP', { shared: Object.assign({}, flipShared, { Model: 'Other' }), variants: [{ sku: 'ZF8-BLK', color: 'X', stock: 1 }] }, admin).status, 'error'));
t('SAVE_PRODUCT_GROUP appends to existing model (no dup)', () => { const r = api('SAVE_PRODUCT_GROUP', { shared: Object.assign({}, flipShared), variants: [{ sku: 'ZF8-RED', color: 'Red', stock: 3 }] }, admin); eq(r.appended, true, JSON.stringify(r)); eq(tbl('Products').filter(x => x.Model === 'Galaxy Z Flip8').length, 3); });
t('SAVE_PRODUCT_GROUP negative price/stock rejected', () => { eq(api('SAVE_PRODUCT_GROUP', { shared: Object.assign({}, flipShared, { Model: 'N1', Price: -1 }), variants: [{ sku: 'N1A', color: 'c', stock: 1 }] }, admin).status, 'error'); eq(api('SAVE_PRODUCT_GROUP', { shared: Object.assign({}, flipShared, { Model: 'N2' }), variants: [{ sku: 'N2A', color: 'c', stock: -5 }] }, admin).status, 'error'); });
t('product-name formula injection sanitized', () => { api('SAVE_PRODUCT_GROUP', { shared: Object.assign({}, flipShared, { Model: '=EVIL()', 'Marketing Model': '=EVIL()' }), variants: [{ sku: 'EV1', color: 'c', stock: 1 }] }, admin); const p = tbl('Products').find(x => x.SKU === 'EV1'); ok(p && p.Model.startsWith("'"), JSON.stringify(p && p.Model)); });
t('UPDATE_PRODUCT_GROUP edits price, keeps model', () => { const r = api('UPDATE_PRODUCT_GROUP', { originalModel: 'Galaxy Z Flip8', shared: Object.assign({}, flipShared, { Price: 34900 }), variants: [{ sku: 'ZF8-BLK', color: 'Black', stock: 8 }, { sku: 'ZF8-BLU', color: 'Blue', stock: 2 }] }, admin); eq(r.status, 'success', JSON.stringify(r)); const p = tbl('Products').filter(x => x.Model === 'Galaxy Z Flip8'); eq(p.length, 2); eq(Number(p[0].Price), 34900); });
t('UPDATE_PRODUCT_GROUP rename Model rejected', () => eq(api('UPDATE_PRODUCT_GROUP', { originalModel: 'Galaxy Z Flip8', shared: Object.assign({}, flipShared, { Model: 'Renamed' }), variants: [{ sku: 'ZF8-BLK', color: 'Black', stock: 8 }] }, admin).status, 'error'));
console.log('== CHECKOUT');
const FSTAT = 'จอง F (สวมสิทธิ์การจอง)', TSTAT = 'จอง T (มีการจอง)';
const cartFor = (qty, sku) => [{ SKU: sku || 'SKU-S24U', 'Product Name': 'Samsung Galaxy S24 Ultra', qty, Price: 46900, brandGifts: [], channelGifts: [] }];
const co = (over) => Object.assign({ cart: cartFor(1), branch: 'B01', channel: 'Retail', customerName: 'ลูกค้าทดสอบ', contactPhone: '0812345678', email: 'a@b.c', idCard: '1234567890121', resStatus: FSTAT, clientRequestId: 'REQ-' + Math.random(), discount: 0 }, over || {});
const stockOf = sku => Number(tbl('Products').find(x => x.SKU === sku).Stock);
t('CHECKOUT happy path decrements stock', () => { const b = stockOf('SKU-S24U'); const r = api('CHECKOUT', co(), sales); eq(r.status, 'success', JSON.stringify(r)); eq(stockOf('SKU-S24U'), b - 1); });
t('CHECKOUT rows have exact header width', () => { const rows = sheets.Orders.rows; ok(rows.length >= 2); rows.slice(1).forEach((r, i) => eq(r.length, ctx.ORDERS_HEADERS_.length, 'row ' + (i + 2))); });
t('CHECKOUT writes InventoryLog SALE row', () => ok(sheets.InventoryLog.rows.some(r => r[3] === 'SALE' && r[2] === 'SKU-S24U')));
t('CHECKOUT idempotent (same clientRequestId)', () => { const p = co({ clientRequestId: 'SAME-1' }); api('CHECKOUT', p, sales); const n = sheets.Orders.rows.length, s = stockOf('SKU-S24U'); api('CHECKOUT', p, sales); eq(sheets.Orders.rows.length, n, 'dup rows'); eq(stockOf('SKU-S24U'), s, 'double stock deduction'); });
t('CHECKOUT idCard: valid Thai ID (checksum) / numeric & alnum passport accepted', () => { ['1234567890121', '1-2345-67890-12-1', '123456789', 'ab123456', 'AB1234567'].forEach(id => eq(api('CHECKOUT', co({ idCard: id, clientRequestId: 'ID-' + id + Math.random() }), sales).status, 'success', 'id=' + id)); });
t('CHECKOUT idCard: stored normalized (digits only / uppercase passport)', () => { api('CHECKOUT', co({ idCard: '1-2345-67890-12-1', clientRequestId: 'ID-N1' + Math.random() }), sales); api('CHECKOUT', co({ idCard: 'ab123456', clientRequestId: 'ID-N2' + Math.random() }), sales); const col = ctx.ORDERS_HEADERS_.indexOf('ID Card_Passport'); const vals = sheets.Orders.rows.map(r => String(r[col])); ok(vals.includes('1234567890121') && vals.includes('AB123456'), vals.slice(-6).join('|')); });
t('CHECKOUT idCard: bad checksum / 0000 / 10-12 digits / empty / junk rejected, stock untouched', () => { const s0 = stockOf('SKU-S24U'); ['1234567890123', '0000', '12345678901', '', 'AB1', 'AB-1234567890', '12 34 5'].forEach(id => eq(api('CHECKOUT', co({ idCard: id, clientRequestId: 'IDX-' + Math.random() }), sales).status, 'error', 'id=' + id)); eq(stockOf('SKU-S24U'), s0); });
t('CHECKOUT empty cart rejected', () => eq(api('CHECKOUT', co({ cart: [] }), sales).status, 'error'));
t('CHECKOUT qty > stock rejected, stock unchanged', () => { const s = stockOf('SKU-S24U'); eq(api('CHECKOUT', co({ cart: cartFor(9999) }), sales).status, 'error'); eq(stockOf('SKU-S24U'), s); });
t('CHECKOUT qty 0 / negative / fractional rejected', () => { [0, -3, 'abc'].forEach(q => eq(api('CHECKOUT', co({ cart: cartFor(q) }), sales).status, 'error', 'qty=' + q)); });
t('CHECKOUT fractional qty 1.5 rejected', () => eq(api('CHECKOUT', co({ cart: cartFor(1.5) }), sales).status, 'error'));
t('CHECKOUT non-numeric qty rejected', () => eq(api('CHECKOUT', co({ cart: cartFor('abc') }), sales).status, 'error'));
t('CHECKOUT zero qty rejected', () => eq(api('CHECKOUT', co({ cart: cartFor(0) }), sales).status, 'error'));
t('CHECKOUT unknown SKU rejected', () => eq(api('CHECKOUT', co({ cart: [{ SKU: 'NOPE', qty: 1 }] }), sales).status, 'error'));
t('CHECKOUT invalid resStatus rejected', () => eq(api('CHECKOUT', co({ resStatus: 'hack' }), sales).status, 'error'));
t('CHECKOUT จอง T needs receipt + deposit', () => { eq(api('CHECKOUT', co({ resStatus: TSTAT }), sales).status, 'error'); eq(api('CHECKOUT', co({ resStatus: TSTAT, receiptNo: 'R1', depositAmount: 0 }), sales).status, 'error'); eq(api('CHECKOUT', co({ resStatus: TSTAT, receiptNo: 'R1', depositAmount: 500 }), sales).status, 'success'); });
t('CHECKOUT with brand gift + discount line', () => { const g = stockOf('GF-SAM-ADPT'); const r = api('CHECKOUT', co({ cart: [{ SKU: 'SKU-S24U', qty: 1, brandGifts: [{ name: 'Samsung Adapter 25W (Black)', qty: 1 }], channelGifts: [] }], discounts: [{ name: 'ส่วนลดลูกค้าเก่า 500 บาท', value: 500 }] }), sales); eq(r.status, 'success', JSON.stringify(r)); eq(stockOf('GF-SAM-ADPT'), g - 1, 'gift stock'); });
t('CHECKOUT PII formula-injection sanitized', () => { api('CHECKOUT', co({ customerName: '=cmd()' }), sales); ok(sheets.Orders.rows.some(r => r[4] === "'=cmd()")); });
t('CHECKOUT closed booking window rejected', () => { const st = sheets.Settings; let rowE; for (let i = 2; i <= st.getLastRow(); i++) if (st._get(i, 1) === 'ReserveEnd') rowE = i; st._set(rowE, 2, '2020-02-01T00:00:00'); const r = api('CHECKOUT', co(), sales); st._set(rowE, 2, '2099-01-01T00:00:00'); eq(r.status, 'error', JSON.stringify(r)); });
t('Sales checkout is forced to own branch', () => { api('CHECKOUT', co({ branch: 'O01', channel: 'Online' }), sales); const last = sheets.Orders.rows[sheets.Orders.rows.length - 1]; eq(last[3], 'B01', 'branch written=' + last[3]); });
t('Sales sees only own-branch Orders', () => ok(tbl('Orders', sales).every(r => r['Branch Code'] === 'B01')));
console.log('== ORDERS / TRACKING');
let oid; t('have an order id', () => { oid = sheets.Orders.rows[1][0]; ok(/./.test(oid), 'oid=' + oid); });
t('TRACK_ORDER finds order by ID', () => { const r = api('TRACK_ORDER', { query: oid }, sales); eq(r.status, 'success', JSON.stringify(r).slice(0, 200)); ok(r.orders && r.orders.length >= 1, 'orders found=' + (r.orders || []).length); });
t('TRACK_ORDER finds order by phone', () => { const r = api('TRACK_ORDER', { query: '0812345678' }, sales); ok(r.orders && r.orders.length >= 1, 'orders found=' + (r.orders || []).length); });
t('TRACK_ORDER order has items + net total', () => { const r = api('TRACK_ORDER', { query: oid }, sales); const o = r.orders[0]; ok(o.items && o.items.length >= 1, 'items=' + JSON.stringify(o.items)); ok(o.netTotal > 0, 'netTotal=' + o.netTotal); });
t('TRACK_ORDER shows deposit for จอง T order', () => { const tRow = sheets.Orders.rows.find(r => r[14] === TSTAT); const r = api('TRACK_ORDER', { query: tRow[0] }, sales); eq(r.orders[0].deposit, 500, 'deposit=' + r.orders[0].deposit); });
t('PUBLIC_TRACK_ORDER correct phone', () => { const r = api('PUBLIC_TRACK_ORDER', { orderId: oid, phone: '0812345678' }, null); eq(r.status, 'success', JSON.stringify(r).slice(0, 200)); });
t('PUBLIC_TRACK_ORDER wrong phone => no data/PII', () => { const r = api('PUBLIC_TRACK_ORDER', { orderId: oid, phone: '0000000000' }, null); ok(r.status === 'error' && !/1234567890123|ลูกค้าทดสอบ/.test(JSON.stringify(r)), JSON.stringify(r).slice(0, 200)); });
t('PUBLIC_TRACK_ORDER masks PII on success', () => { const r = api('PUBLIC_TRACK_ORDER', { orderId: oid, phone: '0812345678' }, null); ok(!/1234567890123/.test(JSON.stringify(r)) && !/0812345678/.test(JSON.stringify(r)), 'unmasked PII in ' + JSON.stringify(r).slice(0, 300)); });
t('GET_CUSTOMER_BY_PHONE', () => { const r = api('GET_CUSTOMER_BY_PHONE', { phone: '0812345678' }, sales); ok(r && r.status !== 'error', JSON.stringify(r).slice(0, 200)); });
t('UPDATE_FULL_ORDER (admin) sets status', () => { const r = api('UPDATE_FULL_ORDER', { data: { _rowIndex: 2, 'Order Status': 'Confirmed' } }, admin); ok(r && r.status !== 'error', JSON.stringify(r).slice(0, 200)); });
t('UPDATE_FULL_ORDER by Sales blocked', () => eq(api('UPDATE_FULL_ORDER', { data: { _rowIndex: 2, 'Order Status': 'Confirmed' } }, sales).status, 'error'));
console.log('== SETTINGS / COUPON / INVOICE / CACHE');
console.log('== SETTINGS HARDENING (A: secrets never leave Admin, B: server-side validation)');
const ksv = () => ctx.getKeyValueSettings(ctx.SpreadsheetApp.getActiveSpreadsheet());
const saveSet = (settings, u) => api('SAVE_SETTINGS_ITEM', { type: 'bookingsettings', settings }, u || admin);
const origWindow = { ReserveStart: ksv().ReserveStart, ReserveEnd: ksv().ReserveEnd };
t('SAVE_SETTINGS_ITEM bookingsettings valid', () => { const r = saveSet({ SystemName: 'ทดสอบระบบ' }); eq(r.status, 'success', JSON.stringify(r)); eq(ksv().SystemName, 'ทดสอบระบบ'); });
t('Sales cannot SAVE/DELETE settings', () => { eq(saveSet({ SystemName: 'x' }, sales).status, 'error'); eq(api('DELETE_SETTINGS_ITEM', { type: 'herobanner', rowIndex: 2 }, sales).status, 'error'); });
t('A: save Webhook URL as Admin', () => { const r = saveSet({ WebhookUrl: 'https://discord.com/api/webhooks/123/SECRETTOKEN' }); eq(r.status, 'success', JSON.stringify(r)); });
t('A: GET_ALL_DATA hides WebhookUrl/DriveFolderId from Sales AND Admin payloads', () => {
  [sales, admin].forEach(u => { const raw = api('GET_ALL_DATA', {}, u); const d = unwrap(raw); ok(d.settings && d.settings.SystemName, 'settings missing'); ok(!('WebhookUrl' in d.settings) && !('DriveFolderId' in d.settings)); ok(!JSON.stringify(raw).includes('SECRETTOKEN'), 'secret leaked'); });
});
t('A: Admin still reads WebhookUrl via GET_SETTINGS_LIST (settings page)', () => { const r = api('GET_SETTINGS_LIST', {}, admin); ok(String(r.data.keyValueSettings.WebhookUrl).includes('SECRETTOKEN')); });
t('A: AuditLog never contains the webhook secret (redacted)', () => { const log = JSON.stringify(tbl('AuditLog')); ok(!log.includes('SECRETTOKEN'), 'secret in audit log'); ok(log.includes('[redacted]')); });
t('A: secret-looking keys are hidden by pattern (future-proof)', () => { const o = ctx.publicSettings_({ SystemName: 'a', MyApiKey: 'x', foo_token: 'y', ClientSecret: 'z', DriveFolderId: 'd', LineWebhookUrl: 'w' }); eq(JSON.stringify(Object.keys(o)), JSON.stringify(['SystemName'])); });
t('B: unknown key rejected and NOTHING is written (atomic)', () => { const before = ksv().SystemName; const r = saveSet({ SystemName: 'ShouldNotSave', BogusKey: 'x' }); eq(r.status, 'error'); eq(ksv().SystemName, before); ok(ksv().BogusKey === undefined); });
t('B: invalid values rejected server-side', () => {
  [{ ReserveStart: '2026-13-45' }, { LowStockThreshold: 'abc' }, { LowStockThreshold: '-1' }, { WebhookUrl: 'http://x.com/h' }, { ContactPhone: 'abc' }, { InvoiceCompanyEmail: 'nope' },
   { ContactLine: 'javascript:alert(1)' }, { LogoUrl: 'javascript:alert(1)' }, { SystemName: '' }, { FlashCampaignTitle: 'x'.repeat(200) }, { ReserveEnd: '' }].forEach(o => { const r = saveSet(o); eq(r.status, 'error', JSON.stringify(o) + ' -> ' + JSON.stringify(r)); });
  eq(saveSet('nope').status, 'error'); eq(saveSet({}).status, 'error'); eq(saveSet(['x']).status, 'error');
});
t('B: booking window order enforced server-side, even when only one side is sent', () => {
  eq(saveSet({ ReserveStart: '2026-06-01T00:00', ReserveEnd: '2026-07-01T00:00' }).status, 'success');
  eq(saveSet({ ReserveEnd: '2026-05-01T00:00' }).status, 'error'); eq(saveSet({ ReserveStart: '2026-08-01T00:00' }).status, 'error');
});
t('B: valid contact settings accepted and stored', () => { const r = saveSet({ ContactPhone: '02-123-4567', ContactLine: '@mystore', ContactHours: '10:00 - 21:00' }); eq(r.status, 'success', JSON.stringify(r)); eq(ksv().ContactLine, '@mystore'); eq(saveSet({ ContactLine: 'https://line.me/R/ti/p/@x' }).status, 'success'); });
t('B: unchanged legacy value is not re-validated (does not block saving other fields)', () => eq(ctx.validateSettingValue_('LogoUrl', 'weird-legacy', 'weird-legacy'), 'weird-legacy'));
t('B: restore original booking window', () => { eq(saveSet(origWindow).status, 'success'); });
t('B: unknown banner type rejected, no row appended', () => { const n = sheets.UI_Banners.getLastRow(); eq(api('SAVE_SETTINGS_ITEM', { type: 'foo', url: 'https://x.com/a.png' }, admin).status, 'error'); eq(sheets.UI_Banners.getLastRow(), n); });
t('B: banner fields validated (javascript: links rejected)', () => {
  const n = sheets.UI_Banners.getLastRow();
  eq(api('SAVE_SETTINGS_ITEM', { type: 'herobanner', url: 'javascript:alert(1)' }, admin).status, 'error');
  eq(api('SAVE_SETTINGS_ITEM', { type: 'herobanner', url: 'https://example.com/a.png', targetLink: 'javascript:alert(1)' }, admin).status, 'error');
  eq(sheets.UI_Banners.getLastRow(), n);
});
let bnId, bnRow;
t('B: add banner', () => { const r = api('SAVE_SETTINGS_ITEM', { type: 'herobanner', url: 'https://example.com/a.png', targetLink: 'https://example.com/x' }, admin); eq(r.status, 'success', JSON.stringify(r)); bnRow = sheets.UI_Banners.getLastRow(); bnId = sheets.UI_Banners._get(bnRow, 1); ok(bnId); });
t('B: edit banner with matching ID works (and #route links allowed)', () => { const r = api('SAVE_SETTINGS_ITEM', { type: 'herobanner', rowIndex: bnRow, bannerId: bnId, url: 'https://example.com/b.png', targetLink: '#pos' }, admin); eq(r.status, 'success', JSON.stringify(r)); eq(sheets.UI_Banners._get(bnRow, 3), 'https://example.com/b.png'); });
t('B: stale-row protection — wrong/missing ID or wrong type cannot overwrite a banner', () => {
  const before = sheets.UI_Banners._get(bnRow, 3);
  eq(api('SAVE_SETTINGS_ITEM', { type: 'herobanner', rowIndex: bnRow, bannerId: 'BAN-OTHER', url: 'https://example.com/evil.png' }, admin).status, 'error');
  eq(api('SAVE_SETTINGS_ITEM', { type: 'herobanner', rowIndex: bnRow, url: 'https://example.com/evil.png' }, admin).status, 'error');
  eq(api('SAVE_SETTINGS_ITEM', { type: 'promogrid', rowIndex: bnRow, bannerId: bnId, url: 'https://example.com/evil.png' }, admin).status, 'error');
  eq(sheets.UI_Banners._get(bnRow, 3), before);
});
t('B: delete requires matching type; correct delete works', () => {
  const n = sheets.UI_Banners.getLastRow();
  eq(api('DELETE_SETTINGS_ITEM', { type: 'promogrid', rowIndex: bnRow, bannerId: bnId }, admin).status, 'error'); eq(sheets.UI_Banners.getLastRow(), n);
  const r = api('DELETE_SETTINGS_ITEM', { type: 'herobanner', rowIndex: bnRow, bannerId: bnId }, admin); eq(r.status, 'success', JSON.stringify(r)); eq(sheets.UI_Banners.getLastRow(), n - 1);
});
t('DELETE_SETTINGS_ITEM bad row rejected', () => eq(api('DELETE_SETTINGS_ITEM', { type: 'banner', rowIndex: 9999 }, admin).status, 'error'));
t('VALIDATE_COUPON unknown code', () => { const r = api('VALIDATE_COUPON', { code: 'NOPE', total: 1000 }, sales); ok(r && (r.valid === false || r.status === 'error' || r.success === false), JSON.stringify(r)); });
let invId;
t('SAVE_INVOICE', () => { const r = api('SAVE_INVOICE', { data: { invoiceNo: 'INV-T1', invoiceDate: '=1+1', customerName: 'x', itemsJson: JSON.stringify([{ desc: 'ของ', qty: 1, price: 100 }]) } }, sales); eq(r.status, 'success', JSON.stringify(r)); invId = r.invoiceId || r.id; });
t('SAVE_INVOICE Invoice Date formula-injection sanitized', () => { const row = sheets.Invoices.rows[sheets.Invoices.rows.length - 1]; ok(!row.some(v => v === '=1+1'), 'raw formula stored: ' + JSON.stringify(row)); });
t('SAVE_INVOICE empty items rejected', () => eq(api('SAVE_INVOICE', { data: { invoiceNo: 'INV-T2', itemsJson: '[]' } }, sales).status, 'error'));
t('GET_INVOICES admin sees it', () => { const g = api('GET_INVOICES', {}, admin); const list = g.data || g; ok(Array.isArray(list) && list.length >= 1, JSON.stringify(g).slice(0, 150)); });
t('APPROVE_INVOICE by Sales blocked', () => { let blocked = false; try { const r = api('APPROVE_INVOICE', { invoiceId: invId || 'x' }, sales); blocked = r.status === 'error'; } catch (e) { blocked = true; } ok(blocked); });
t('APPROVE_INVOICE by admin', () => { const r = api('APPROVE_INVOICE', { invoiceId: invId }, admin); ok(r.status !== 'error', JSON.stringify(r)); });
t('DELETE_INVOICE', () => { const r = api('DELETE_INVOICE', { invoiceId: invId }, admin); ok(r.status !== 'error', JSON.stringify(r)); });
t('CLEAR_CACHE admin', () => { const r = api('CLEAR_CACHE', {}, admin); ok(r && r.status !== 'error', JSON.stringify(r)); });
t('BULK_UPDATE_PRODUCTS admin', () => { const r = api('BULK_UPDATE_PRODUCTS', { updates: [{ SKU: 'SKU-S24U', Stock: 77 }], rows: [{ SKU: 'SKU-S24U', Stock: 77 }] }, admin); ok(r && typeof r === 'object', JSON.stringify(r).slice(0, 150)); });
t('unknown action rejected', () => eq(api('NOPE', {}, admin).status, 'error'));

console.log('\n==== ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('\nFAILURES:'); fails.forEach(f => console.log(' - ' + f)); }
