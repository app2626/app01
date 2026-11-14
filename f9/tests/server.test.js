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
t('UPDATE_PRODUCT_GROUP with a blank Category is rejected and the stored category is kept', () => { const r = api('UPDATE_PRODUCT_GROUP', { originalModel: 'Galaxy Z Flip8', shared: Object.assign({}, flipShared, { Price: 34900, Category: '' }), variants: [{ sku: 'ZF8-BLK', color: 'Black', stock: 8 }, { sku: 'ZF8-BLU', color: 'Blue', stock: 2 }] }, admin); eq(r.status, 'error', JSON.stringify(r)); ok(tbl('Products').filter(x => x.Model === 'Galaxy Z Flip8').every(x => x.Category === 'โมบาย')); });
t('SAVE_PRODUCT_GROUP new model needs a Category; a tablet category is stored as-is', () => { const base = { Model: 'Tab Reg1', 'Marketing Model': 'Brand Tab Reg1', 'Product Group': 'Tab', Capacity: '128GB', Price: 9900, Status: 'เปิด', Channel: 'ALL', Unit: 'เครื่อง', 'Image URL': '' }; eq(api('SAVE_PRODUCT_GROUP', { shared: Object.assign({}, base, { Category: '' }), variants: [{ sku: 'TABR-1', color: 'Gray', stock: 3 }] }, admin).status, 'error'); eq(api('SAVE_PRODUCT_GROUP', { shared: Object.assign({}, base, { Category: 'แท็บเล็ต' }), variants: [{ sku: 'TABR-1', color: 'Gray', stock: 3 }] }, admin).status, 'success'); eq(tbl('Products').find(x => x.SKU === 'TABR-1').Category, 'แท็บเล็ต'); eq(api('DELETE_RECORD', { tableName: 'Products', idField: 'SKU', idValue: 'TABR-1' }, admin).status, 'success'); });
// ---- Launch Date (ป้าย NEW / ชั้นสินค้าใหม่)
t('Products header has Launch Date column', () => ok(sheets.Products.rows[0].includes('Launch Date')));
t('SAVE_PRODUCT_GROUP new model without Launch Date is stamped today (Thai time)', () => { const r = api('SAVE_PRODUCT_GROUP', { shared: Object.assign({}, flipShared, { Model: 'LD-Auto', 'Marketing Model': 'Brand LD-Auto' }), variants: [{ sku: 'LD-A1', color: 'Black', stock: 5 }] }, admin); eq(r.status, 'success', JSON.stringify(r)); const p = tbl('Products').find(x => x.SKU === 'LD-A1'); eq(p['Launch Date'], ctx.todayThai_()); ok(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(p["Launch Date"])); });
t('SAVE_PRODUCT_GROUP keeps an explicit Launch Date', () => { api('SAVE_PRODUCT_GROUP', { shared: Object.assign({}, flipShared, { Model: 'LD-Set', 'Marketing Model': 'Brand LD-Set', 'Launch Date': '2026-01-15' }), variants: [{ sku: 'LD-S1', color: 'Black', stock: 5 }] }, admin); eq(tbl('Products').find(x => x.SKU === 'LD-S1')['Launch Date'], '2026-01-15'); });
t('SAVE_PRODUCT_GROUP rejects a malformed / impossible Launch Date', () => { ['15/01/2026', 'yesterday', '2026-02-30'].forEach((d, i) => eq(api('SAVE_PRODUCT_GROUP', { shared: Object.assign({}, flipShared, { Model: 'LD-Bad' + i, 'Marketing Model': 'Brand LD-Bad' + i, 'Launch Date': d }), variants: [{ sku: 'LD-B' + i, color: 'c', stock: 1 }] }, admin).status, 'error', d)); });
t('UPDATE_PRODUCT_GROUP changes Launch Date; a blank value clears it; an omitted key keeps it', () => {
  const up = (sh) => api('UPDATE_PRODUCT_GROUP', { originalModel: 'LD-Set', shared: Object.assign({}, flipShared, { Model: 'LD-Set', 'Marketing Model': 'Brand LD-Set' }, sh), variants: [{ sku: 'LD-S1', color: 'Black', stock: 5 }] }, admin);
  const ld = () => tbl('Products').find(x => x.SKU === 'LD-S1')['Launch Date'];
  eq(up({ 'Launch Date': '2026-03-01' }).status, 'success'); eq(ld(), '2026-03-01');
  eq(up({}).status, 'success'); eq(ld(), '2026-03-01', 'omitted key must keep the stored date');
  eq(up({ 'Launch Date': '' }).status, 'success'); eq(ld(), '');
});
t('GET_ALL_DATA exposes Launch Date to the storefront', () => { const g = unwrap(api('GET_ALL_DATA', {}, sales)); ok(g.products.some(p => p.SKU === 'LD-A1' && p['Launch Date'] === ctx.todayThai_())); });
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
t('CHECKOUT channel gifts: only one of the three sets per item; brandGifts cannot carry a channel gift', () => {
  const gm = sheets.GiftMappings, h = gm.rows[0], c2 = h.indexOf('Channel Gifts 2'); ok(c2 > -1, 'Channel Gifts 2 column missing');
  const row = gm.rows.find(r => r[0] === 'GM-001'), old = row[c2]; row[c2] = 'powerbank'; cache.remove('TABLE_GiftMappings');
  const BAG = { name: 'TG Premium Bag (Canvas)', qty: 1 }, PB = { name: 'TG Powerbank 10000mAh', qty: 1 };
  const run = (b, c) => api('CHECKOUT', co({ cart: [{ SKU: 'SKU-S24U', qty: 1, brandGifts: b, channelGifts: c }] }), sales);
  try {
    const both = run([], [BAG, PB]); eq(both.status, 'error', 'two sets must be rejected'); ok(/ชุดเดียว/.test(both.message || ''), 'message=' + both.message);
    eq(run([], [BAG]).status, 'success', 'set 1 alone'); eq(run([], [PB]).status, 'success', 'set 2 alone');
    eq(run([PB], [BAG]).status, 'error', 'channel gift smuggled through brandGifts');
  } finally { row[c2] = old; cache.remove('TABLE_GiftMappings'); }
});
t('GiftMappings: set 2/3 columns are moved/inserted right after Channel Gifts, data follows, system still works', () => {
  const gm = sheets.GiftMappings, keep = gm.rows.map(r => r.slice());
  const col = n => gm.rows[0].indexOf(n);
  const order = () => ['Channel Gifts', 'Channel Gifts 2', 'Channel Gifts 3', 'Status'].map(col);
  const consecutive = () => { const o = order(); return o[0] > -1 && o[1] === o[0] + 1 && o[2] === o[0] + 2 && o[3] === o[0] + 3; };
  try {
    ok(consecutive(), 'fresh sheet order ' + order());
    // layout of the previous version: Status, then the two set columns appended at the end
    const st = col('Status'); gm.rows.forEach(r => { while (r.length < gm.rows[0].length) r.push(''); const v = r.splice(st, 1)[0]; r.splice(col('Channel Gifts') + 1, 0, v); });
    gm.rows.find(r => r[0] === 'GM-001')[col('Channel Gifts 2')] = 'powerbank'; cache.remove('TABLE_GiftMappings');
    ok(!consecutive(), 'precondition: old layout');
    const rows = tbl('GiftMappings', admin); ok(consecutive(), 'after admin GET_TABLE ' + order());
    const g1 = rows.find(r => r['Mapping ID'] === 'GM-001'); eq(g1['Channel Gifts 2'], 'powerbank', 'data moved with its column'); eq(g1.Status, 'เปิด'); eq(g1['Channel Gifts'], 'bag');
    eq(api('CHECKOUT', co({ cart: [{ SKU: 'SKU-S24U', qty: 1, brandGifts: [], channelGifts: [{ name: 'TG Powerbank 10000mAh', qty: 1 }] }] }), sales).status, 'success', 'checkout reads moved column');
    // sheet that never had the new columns: they are inserted before Status
    ['Channel Gifts 3', 'Channel Gifts 2'].forEach(n => { const ci = col(n); gm.rows.forEach(r => { r.splice(ci, 1); }); }); cache.remove('TABLE_GiftMappings');
    eq(col('Channel Gifts 2'), -1); tbl('GiftMappings', admin); ok(consecutive(), 'inserted ' + order());
    eq(tbl('GiftMappings', admin).find(r => r['Mapping ID'] === 'GM-002').Status, 'เปิด', 'Status intact after insert');
  } finally { gm.rows.length = 0; keep.forEach(r => gm.rows.push(r)); cache.remove('TABLE_GiftMappings'); }
});
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
console.log('== ORDER STATUS HISTORY');
t('status log: checkout wrote initial Pending row', () => { const h = ctx.getOrderStatusHistory_(ss, oid, true); ok(h.length >= 1 && h[0].to === 'Pending' && h[0].from === '', JSON.stringify(h)); });
t('status log: UPDATE_FULL_ORDER status change appends from->to + by', () => { const n = ctx.getOrderStatusHistory_(ss, oid, true).length; const row = sheets.Orders.rows.findIndex((r, i) => i > 0 && r[0] === oid) + 1; const cur = sheets.Orders.rows[row - 1][ctx.ORDERS_HEADERS_.indexOf('Order Status')]; const to = cur === 'Paid' ? 'Delivered' : 'Paid'; const r = api('UPDATE_FULL_ORDER', { data: { _rowIndex: row, 'Order Status': to } }, admin); ok(r.status !== 'error', JSON.stringify(r).slice(0, 200)); const h = ctx.getOrderStatusHistory_(ss, oid, true); eq(h.length, n + 1); eq(h[h.length - 1].to, to); eq(h[h.length - 1].from, cur); eq(h[h.length - 1].by, 'admin'); });
t('status log: saving without status change adds no row', () => { const n = ctx.getOrderStatusHistory_(ss, oid, true).length; const row = sheets.Orders.rows.findIndex((r, i) => i > 0 && r[0] === oid) + 1; const cur = sheets.Orders.rows[row - 1][ctx.ORDERS_HEADERS_.indexOf('Order Status')]; api('UPDATE_FULL_ORDER', { data: { _rowIndex: row, 'Order Status': cur } }, admin); eq(ctx.getOrderStatusHistory_(ss, oid, true).length, n); });
t('status log: public tracking returns history without staff names', () => { const r = api('PUBLIC_TRACK_ORDER', { orderId: oid, phone: '0812345678' }, null); ok(r.order.history.length >= 2, JSON.stringify(r.order.history)); ok(!JSON.stringify(r.order.history).includes('admin') && r.order.history.every(h => h.by === undefined), 'staff name leaked'); });
t('status log: staff TRACK_ORDER includes who changed it', () => { const r = api('TRACK_ORDER', { query: oid }, admin); ok(r.orders[0].history.some(h => h.by === 'admin'), JSON.stringify(r.orders[0].history)); });
t('status log: OrderStatusLog table readable by Admin only', () => { eq(api('GET_TABLE', { tableName: 'OrderStatusLog' }, sales).status, 'error'); });

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
t('B: policy texts + favicon are saveable settings, reach the storefront, favicon must be https', () => {
  eq(saveSet({ PolicyBooking: 'มัดจำ 1,000 บาท\nคืนไม่ได้', PolicyPrivacy: 'เก็บชื่อและเบอร์โทร', FaviconUrl: 'https://example.com/icon.png' }).status, 'success');
  eq(ksv().PolicyBooking, 'มัดจำ 1,000 บาท\nคืนไม่ได้'); eq(ctx.publicSettings_(ksv()).PolicyPrivacy, 'เก็บชื่อและเบอร์โทร');
  ok(saveSet({ PolicyBooking: 'x'.repeat(6001) }).status !== 'success', 'over-long policy must be rejected');
  eq(saveSet({ HelpHowTo: 'step 1\nstep 2', HelpFaq: 'q\na' }).status, 'success'); eq(ctx.publicSettings_(ksv()).HelpHowTo, 'step 1\nstep 2'); eq(ksv().HelpFaq, 'q\na');
  ok(saveSet({ HelpFaq: 'x'.repeat(6001) }).status !== 'success', 'over-long help text must be rejected');
  eq(saveSet({ HelpHowTo: '', HelpFaq: '' }).status, 'success');
  ok(saveSet({ FaviconUrl: 'javascript:alert(1)' }).status !== 'success', 'non-https favicon must be rejected');
  eq(saveSet({ PolicyBooking: '', PolicyPrivacy: '' }).status, 'success'); eq(ksv().PolicyBooking, '');
});
t('doGet sets the favicon: FaviconUrl first, else the logo (Drive link -> direct png link); a rejected icon never breaks the page', () => {
  eq(ctx.faviconUrlFor_({ FaviconUrl: 'https://example.com/icon.png', LogoUrl: 'https://example.com/logo.png' }), 'https://example.com/icon.png');
  eq(ctx.faviconUrlFor_({ FaviconUrl: '', LogoUrl: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing' }), 'https://drive.google.com/uc?id=1AbCdEfGhIjKlMnOp&export=download&format=png');
  eq(ctx.faviconUrlFor_({ LogoUrl: 'https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOp&sz=w500' }), 'https://drive.google.com/uc?id=1AbCdEfGhIjKlMnOp&export=download&format=png');
  eq(ctx.faviconUrlFor_({ FaviconUrl: 'http://example.com/a.png' }), ''); eq(ctx.faviconUrlFor_({}), '');
  ctx.__lastFavicon = null; ctx.doGet({}); eq(ctx.__lastFavicon, 'https://example.com/icon.png');
  eq(saveSet({ FaviconUrl: 'https://example.com/bad-favicon.txt' }).status, 'success');
  ctx.__lastFavicon = null; const o = ctx.doGet({}); ok(o.html.includes('tmpl-pos'), 'page must still render'); eq(ctx.__lastFavicon, null);
  eq(saveSet({ FaviconUrl: '' }).status, 'success');
});
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
// ----- ตั้งเวลาแสดงแบนเนอร์ (Start Date / End Date) -----
const isoDay = off => { const d = new Date(); d.setDate(d.getDate() + off); const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
t('schedule: legacy 8-column UI_Banners gets Start/End Date headers (idempotent retrofit)', () => {
  const sh = sheets.UI_Banners; sh.rows[0].length = 8;
  api('GET_SETTINGS_LIST', {}, admin); api('GET_SETTINGS_LIST', {}, admin);
  eq(sh.rows[0].slice(6, 10).join('|'), 'Title|Button Text|Start Date|End Date'); eq(sh.rows[0].length, 10);
});
t('schedule: invalid / impossible / reversed dates rejected, nothing appended', () => {
  const n = sheets.UI_Banners.getLastRow(), u = 'https://example.com/sch.png';
  ['2026-13-01', '2026-02-31', 'tomorrow', '26-1-1'].forEach(d => eq(api('SAVE_SETTINGS_ITEM', { type: 'herobanner', url: u, startDate: d }, admin).status, 'error', d));
  eq(api('SAVE_SETTINGS_ITEM', { type: 'herobanner', url: u, startDate: '2026-12-31', endDate: '2026-12-01' }, admin).status, 'error');
  eq(sheets.UI_Banners.getLastRow(), n);
});
t('schedule: dates saved as text; storefront hides upcoming/expired, keeps live + unscheduled; settings list shows all with state', () => {
  const add = (u, s, e, type) => eq(api('SAVE_SETTINGS_ITEM', { type: type || 'herobanner', url: 'https://example.com/' + u + '.png', startDate: s, endDate: e }, admin).status, 'success', u);
  add('sch-live', isoDay(-1), isoDay(1)); add('sch-open', '', ''); add('sch-today-only', isoDay(0), isoDay(0));
  add('sch-future', isoDay(2), isoDay(9)); add('sch-past', isoDay(-9), isoDay(-1)); add('sch-endonly-past', '', isoDay(-1)); add('sch-startonly-future', isoDay(3), '');
  add('sch-popup-future', isoDay(1), isoDay(5), 'popupbanner'); add('sch-grid-past', '', isoDay(-2), 'promogrid');
  const last = sheets.UI_Banners.rows.find(r => String(r[2]).includes('sch-future')); eq(typeof last[8], 'string'); eq(last[8], isoDay(2)); eq(last[9], isoDay(9));
  const d = unwrap(api('GET_ALL_DATA', {}, admin)), has = (list, k) => list.some(b => b.url.includes(k));
  ['sch-live', 'sch-open', 'sch-today-only'].forEach(k => ok(has(d.heroBanners, k), 'store should show ' + k));
  ['sch-future', 'sch-past', 'sch-endonly-past', 'sch-startonly-future'].forEach(k => ok(!has(d.heroBanners, k), 'store must hide ' + k));
  ok(!has(d.popupBanners, 'sch-popup-future') && !has(d.gridBanners, 'sch-grid-past'), 'popup/grid also scheduled');
  const sl = api('GET_SETTINGS_LIST', {}, admin).data, st = k => sl.heroBanners.find(b => b.url.includes(k)).schedule;
  eq(st('sch-live'), 'live'); eq(st('sch-open'), 'live'); eq(st('sch-future'), 'upcoming'); eq(st('sch-past'), 'expired'); eq(st('sch-startonly-future'), 'upcoming'); eq(st('sch-endonly-past'), 'expired');
  eq(sl.popupBanners.find(b => b.url.includes('sch-popup-future')).schedule, 'upcoming'); eq(sl.promoGrids.find(b => b.url.includes('sch-grid-past')).schedule, 'expired');
  eq(sl.heroBanners.find(b => b.url.includes('sch-future')).startDate, isoDay(2));
});
t('schedule: editing a banner can set and clear its dates; Date-typed cells are normalised', () => {
  const sh = sheets.UI_Banners, row = sh.rows.findIndex(r => String(r[2]).includes('sch-past')) + 1, id = sh._get(row, 1);
  eq(api('SAVE_SETTINGS_ITEM', { type: 'herobanner', rowIndex: row, bannerId: id, url: 'https://example.com/sch-past.png', startDate: '', endDate: '' }, admin).status, 'success');
  eq(sh._get(row, 9), ''); eq(sh._get(row, 10), '');
  ok(unwrap(api('GET_ALL_DATA', {}, admin)).heroBanners.some(b => b.url.includes('sch-past')), 'cleared schedule => visible again');
  // Sheets may turn "2026-11-11" into a real Date cell — must read back identically
  const dayDate = off => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + off); return d; };
  sh._set(row, 9, dayDate(2));
  ok(!unwrap(api('GET_ALL_DATA', {}, admin)).heroBanners.some(b => b.url.includes('sch-past')), 'Date-typed future start => hidden');
  eq(api('GET_SETTINGS_LIST', {}, admin).data.heroBanners.find(b => b.url.includes('sch-past')).startDate, isoDay(2));
  sh._set(row, 9, dayDate(-3));
  ok(unwrap(api('GET_ALL_DATA', {}, admin)).heroBanners.some(b => b.url.includes('sch-past')), 'Date-typed past start => visible');
});
// ----- ยอดนิยม (popularModels) -----
t('popular: ranks models by booked qty, windows widen 7→30d, ignores cancelled/gift/discount/closed/unknown, caches 30 min, ships names only', () => {
  const pRows = sheets.Products.rows.length, savedOrders = sheets.Orders.rows.splice(1), ph = sheets.Products.rows[0], oh = ctx.ORDERS_HEADERS_; // isolate: earlier CHECKOUT tests left real orders in the sheet
  const addP = (sku, model, cat, status) => { const o = { SKU: sku, 'Product Name': model, Model: model, Category: cat, Status: status, Price: 100, Stock: 10, Channel: 'ALL' }; sheets.Products.rows.push(ph.map(h => (h in o ? o[h] : ''))); };
  const NOW = new Date(), day = n => new Date(NOW.getTime() - n * 86400000);
  const addO = (sku, qty, ts, status) => { const o = { OrderID: 'POP-' + sheets.Orders.rows.length, Timestamp: ts, SKU: sku, Qty: qty, 'Order Status': status || 'Pending' }; sheets.Orders.rows.push(oh.map(h => (h in o ? o[h] : ''))); };
  const clear = () => { cache.remove('TABLE_Products'); cache.remove('POPULAR_MODELS_V1'); };
  try {
    ['A', 'B', 'C', 'D', 'E'].forEach(k => addP('POP-' + k, 'M-' + k, 'โมบาย', 'เปิด'));
    addP('POP-GIFT', 'GIFT-M', 'ของแถมแบรนด์', 'เปิด'); addP('POP-X', 'M-X', 'โมบาย', 'ปิด');
    addO('POP-A', 3, day(1)); addO('POP-A', 2, day(2)); addO('POP-B', 4, day(3)); addO('POP-C', 3, day(4)); addO('POP-D', 1, day(5));
    addO('POP-C', 100, day(1), 'Cancelled'); addO('POP-GIFT', 99, day(1)); addO('DISCOUNT', 99, day(1)); addO('POP-X', 99, day(1)); addO('NO-SUCH-SKU', 99, day(1));
    addO('POP-E', 50, day(20));
    clear();
    eq(ctx.getPopularModels_(ss, NOW), ['M-A', 'M-B', 'M-C', 'M-D'], '7-day window has 4 models, M-E (20 days ago) excluded');
    const later = new Date(NOW.getTime() + 10 * 86400000);
    eq(ctx.getPopularModels_(ss, later), ['M-A', 'M-B', 'M-C', 'M-D'], 'served from cache');
    cache.remove('POPULAR_MODELS_V1');
    eq(ctx.getPopularModels_(ss, later), ['M-E', 'M-A', 'M-B', 'M-C', 'M-D'], '7-day window empty (<4) -> widens to 30 days');
    clear(); const d = unwrap(api('GET_ALL_DATA', {}, sales));
    ok(Array.isArray(d.popularModels) && d.popularModels.length > 0 && d.popularModels.every(s => typeof s === 'string'), JSON.stringify(d.popularModels));
    ok(!JSON.stringify(d.popularModels).match(/\d{3,}/), 'no counts/customer data in payload: ' + JSON.stringify(d.popularModels));
  } finally {
    sheets.Products.rows.length = pRows; sheets.Orders.rows.length = 1; sheets.Orders.rows.push(...savedOrders); clear();
  }
});
// ----- IMPORT_PRODUCTS: คอลัมน์ Launch Date -----
t('import: Launch Date column - kept as yyyy-MM-dd text, Buddhist-year/slash forms normalised, ambiguous or impossible dates reject only that row, blank allowed, existing model keeps its date with a warning', () => {
  const base = { Model: 'IMP-LD', 'Marketing Model': 'Import LD', Capacity: '128GB', Price: '9,900', Category: 'โมบาย', Stock: '2' };
  const mk = (sku, model, ld) => { const o = { SKU: sku, Model: model, 'Marketing Model': 'Import ' + model, Capacity: '128GB', Price: '1', Category: 'โมบาย', Stock: '1' }; if (ld !== undefined) o['Launch Date'] = ld; return o; };
  const rows = [
    Object.assign({}, base, { SKU: 'LD-I1', Color: 'Black', 'Launch Date': '2026-11-01' }),
    Object.assign({}, base, { SKU: 'LD-I2', Color: 'White', 'Launch Date': '2026-12-25' }),
    mk('LD-I3', 'IMP-LD2', '2569/3/5'),
    mk('LD-I4', 'IMP-LD3'),
    mk('LD-I5', 'IMP-LD4', '1/11/2026'),
    mk('LD-I6', 'IMP-LD5', '2026-02-30'),
    mk('LD-I7', 'IMP-LD6', 'พรุ่งนี้')
  ];
  const before = sheets.Products.rows.length;
  const dry = unwrap(api('IMPORT_PRODUCTS', { rows: rows, dryRun: true }, admin));
  eq(dry.created, 4, JSON.stringify(dry)); eq(dry.errorCount, 3, JSON.stringify(dry.errors));
  ok(dry.warnings.some(w => w.sku === 'LD-I2' && /2026-11-01/.test(w.reason)), JSON.stringify(dry.warnings));
  eq(sheets.Products.rows.length, before, 'dryRun must not write');
  const real = unwrap(api('IMPORT_PRODUCTS', { rows: rows, dryRun: false }, admin));
  eq(real.created, 4);
  const ld = sku => tbl('Products').find(x => x.SKU === sku);
  eq(ld('LD-I1')['Launch Date'], '2026-11-01'); eq(ld('LD-I2')['Launch Date'], '2026-11-01', 'same model keeps the first date');
  eq(ld('LD-I3')['Launch Date'], '2026-03-05', 'Buddhist year converted'); eq(ld('LD-I4')['Launch Date'], '');
  ok(!ld('LD-I5') && !ld('LD-I6') && !ld('LD-I7'), 'rows with a bad date must not be imported');
});
// ----- IMPORT_PRODUCTS (นำเข้า CSV) -----
t('import: Admin only; dryRun never writes; real run adds only new valid SKUs; reports skipped/rejected', () => {
  const ph = sheets.Products.rows[0], before = sheets.Products.rows.length;
  const existing = sheets.Products.rows[1], exSku = existing[ph.indexOf('SKU')];
  const base = { Model: 'IMP-M1', 'Marketing Model': 'Import One', Capacity: '256GB', Price: '29,900', Category: 'โมบาย', Stock: '5' };
  const rows = [
    Object.assign({}, base, { SKU: 'IMP-A', Color: 'Black' }),
    Object.assign({}, base, { SKU: 'IMP-B', Color: 'White', Stock: '0', Status: 'ปิด' }),
    { SKU: exSku, Model: 'IMP-M1', Stock: '1' },
    { SKU: 'IMP-A', Model: 'IMP-M1', Stock: '1' },
    { SKU: '', Model: 'IMP-M1', Stock: '1' },
    { SKU: 'IMP-BADSTOCK', Model: 'IMP-M1', Stock: '-3' },
    { SKU: 'IMP-BADSTATUS', Model: 'IMP-M1', Stock: '1', Status: 'พัง' },
    { SKU: '=HYPERLINK("x")', Model: 'IMP-M1', Stock: '1' },
    { SKU: 'IMP-NEWMODEL-NOPRICE', Model: 'IMP-M2', 'Marketing Model': 'x', Capacity: '1', Category: 'โมบาย', Stock: '1' },
    { SKU: 'IMP-NEWMODEL-NOCAT', Model: 'IMP-M3', 'Marketing Model': 'x', Capacity: '1', Price: '10', Stock: '1' }
  ];
  try {
    eq(api('IMPORT_PRODUCTS', { rows: rows, dryRun: true }, sales).status, 'error', 'Sales must be rejected');
    const dry = unwrap(api('IMPORT_PRODUCTS', { rows: rows, dryRun: true }, admin));
    eq([dry.dryRun, dry.created, dry.skippedCount, dry.errorCount, dry.total], [true, 2, 2, 6, 10]);
    eq(sheets.Products.rows.length, before, 'dryRun must not write');
    const real = unwrap(api('IMPORT_PRODUCTS', { rows: rows, dryRun: false }, admin));
    eq([real.created, real.skippedCount, real.errorCount], [2, 2, 6]);
    eq(sheets.Products.rows.length, before + 2);
    const get = (sku) => { const r = sheets.Products.rows.find(x => x[ph.indexOf('SKU')] === sku); const o = {}; ph.forEach((h, i) => { o[h] = r ? r[i] : undefined; }); return r ? o : null; };
    const a = get('IMP-A'), b = get('IMP-B');
    eq(a.Price, 29900); eq(a.Stock, 5); eq(a.Status, 'เปิด'); eq(a.Channel, 'ALL'); eq(a.Category, 'โมบาย'); eq(a.Model, 'IMP-M1');
    eq(a['Product Name'], ctx.buildAutoProductName_('IMP-M1', 'Black'), 'Product Name is derived, never typed');
    ok(a.Display !== '' || a.Processor !== '', 'specs inferred when none given');
    eq([b.Stock, b.Status, b.Price], [0, 'ปิด', 29900], 'second SKU of same new model shares first row price');
    eq(get('IMP-BADSTOCK'), null); eq(get('IMP-NEWMODEL-NOPRICE'), null); eq(get('IMP-NEWMODEL-NOCAT'), null);
    ok(!sheets.Products.rows.some(x => String(x[ph.indexOf('SKU')]).startsWith('=')), 'formula-looking SKU rejected');
    sheets.Products.rows.slice(before).forEach(r => eq(r.length, ph.length, 'row width'));
    eq(all.products.length, 6); // GET_ALL_DATA snapshot taken earlier is unaffected
    ok(unwrap(api('GET_ALL_DATA', {}, admin)).products.some(p => p.SKU === 'IMP-A'), 'cache busted: new SKU visible');
    ok(sheets.AuditLog.rows.some(r => r.join('|').includes('IMPORT_PRODUCTS')), 'audit log entry written');
    eq(unwrap(api('IMPORT_PRODUCTS', { rows: rows, dryRun: false }, admin)).created, 0, 're-import adds nothing (idempotent)');
  } finally { sheets.Products.rows.length = before; cache.remove('TABLE_Products'); }
});
t('import: existing Model keeps its shared fields (warns on price/capacity mismatch); formula text in free fields is neutralised', () => {
  const ph = sheets.Products.rows[0], before = sheets.Products.rows.length, ex = sheets.Products.rows[1];
  const exModel = ex[ph.indexOf('Model')], exPrice = ex[ph.indexOf('Price')];
  try {
    const r = unwrap(api('IMPORT_PRODUCTS', { rows: [{ SKU: 'IMP-EX1', Model: exModel, Color: '=cmd|calc', Price: '1', Capacity: 'ZZ', Stock: '2', 'Image URL': '+evil' }], dryRun: false }, admin));
    eq([r.created, r.warningCount], [1, 2]);
    const row = sheets.Products.rows[sheets.Products.rows.length - 1];
    eq(row[ph.indexOf('Price')], exPrice, 'price taken from the existing model row');
    ok(!String(row[ph.indexOf('Color')]).startsWith('='), 'Color neutralised: ' + row[ph.indexOf('Color')]);
    ok(!String(row[ph.indexOf('Image URL')]).startsWith('+'), 'Image URL neutralised');
    ok(!String(row[ph.indexOf('Product Name')]).startsWith('='), 'Product Name neutralised');
  } finally { sheets.Products.rows.length = before; cache.remove('TABLE_Products'); }
});
t('import: scientific-notation SKU/Model (Excel 8.65E+13) rejected with a clear reason; ="..." and leading-apostrophe text forms are unwrapped; SKU values written as strings', () => {
  const ph = sheets.Products.rows[0], before = sheets.Products.rows.length;
  const base = { Model: 'SCI-M', 'Marketing Model': 'Sci', Capacity: '1', Price: '10', Category: 'โมบาย', Stock: '1' };
  const rows = [
    Object.assign({}, base, { SKU: '8.65E+13' }),
    Object.assign({}, base, { SKU: '1E+13' }),
    Object.assign({}, base, { SKU: 'OK-1', Model: '3.2E+9' }),
    Object.assign({}, base, { SKU: '="86500000000001"' }),
    Object.assign({}, base, { SKU: "'86500000000002" }),
    Object.assign({}, base, { SKU: 'e+13x' }),
    Object.assign({}, base, { SKU: 'ABC-E+13' })
  ];
  try {
    const dry = unwrap(api('IMPORT_PRODUCTS', { rows: rows, dryRun: true }, admin));
    eq([dry.created, dry.errorCount], [4, 3], JSON.stringify(dry.errors));
    ok(dry.errors.every(e => /เลขวิทยาศาสตร์/.test(e.reason)), 'reason must explain scientific notation: ' + JSON.stringify(dry.errors));
    ok(unwrap(api('IMPORT_PRODUCTS', { rows: rows, dryRun: false }, admin)).created === 4);
    const col = (h) => sheets.Products.rows.slice(before).map(r => r[ph.indexOf(h)]);
    eq(col('SKU').sort(), ['86500000000001', '86500000000002', 'ABC-E+13', 'e+13x'].sort(), 'wrapped/apostrophe forms stored as plain digits');
    ok(col('SKU').every(v => typeof v === 'string'), 'SKU values written as strings');
  } finally { sheets.Products.rows.length = before; cache.remove('TABLE_Products'); }
});
// ----- IMPORT_RECORDS (สาขา / ช่องทางขาย / สมาชิก) -----
const importSnap = (names) => { const snap = {}; names.forEach(n => { snap[n] = sheets[n].rows.length; }); return () => { names.forEach(n => { sheets[n].rows.length = snap[n]; cache.remove('TABLE_' + n); }); }; };
const imp = (table, rows, dryRun, who) => api('IMPORT_RECORDS', { table: table, rows: rows, dryRun: dryRun === true }, who || admin);
t('import records: Admin only, unknown/forbidden tables rejected (Orders/Products/Members-secret paths unreachable)', () => {
  eq(imp('Branches', [{ 'Branch Code': 'X1', 'Branch Name': 'x', Channel: 'c' }], true, sales).status, 'error');
  ['Orders', 'Products', 'AuditLog', 'Settings', '__proto__', 'constructor', '', undefined].forEach(tb => eq(imp(tb, [{ a: 1 }], true).status, 'error', 'table ' + tb));
});
t('import branches: adds new codes only; Channel/Name required; dup + in-file dup skipped; sci-notation/formula codes rejected; code stored as text', () => {
  const restore = importSnap(['Branches']); const bh = sheets.Branches.rows[0], before = sheets.Branches.rows.length;
  const exCode = sheets.Branches.rows[1][bh.indexOf('Branch Code')], exChannel = sheets.Branches.rows[1][bh.indexOf('Channel')];
  const rows = [
    { Channel: exChannel, 'Branch Code': 'IMPB1', 'Branch Name': 'Import B1', Area: 'A', Province: 'กทม' },
    { Channel: 'NEW-CH', 'Branch Code': '="86500000000001"', 'Branch Name': 'Import B2' },
    { Channel: exChannel, 'Branch Code': exCode, 'Branch Name': 'dup of existing' },
    { Channel: exChannel, 'Branch Code': 'IMPB1', 'Branch Name': 'dup in file' },
    { Channel: exChannel, 'Branch Code': '8.65E+13', 'Branch Name': 'sci' },
    { Channel: exChannel, 'Branch Code': '=cmd', 'Branch Name': 'formula id' },
    { Channel: '', 'Branch Code': 'IMPB-NOCH', 'Branch Name': 'no channel' },
    { Channel: exChannel, 'Branch Code': 'IMPB-NONAME', 'Branch Name': '' },
    { Channel: '=evil', 'Branch Code': 'IMPB3', 'Branch Name': '+bad' }
  ];
  try {
    const dry = unwrap(imp('Branches', rows, true));
    eq([dry.created, dry.skippedCount, dry.errorCount], [3, 2, 4], JSON.stringify(dry.errors));
    ok(dry.warnings.some(w => /NEW-CH/.test(w.reason)), 'unknown channel warning');
    eq(sheets.Branches.rows.length, before, 'dryRun must not write');
    const real = unwrap(imp('Branches', rows, false));
    eq([real.created, real.skippedCount, real.errorCount], [3, 2, 4]);
    const added = sheets.Branches.rows.slice(before).map(r => { const o = {}; bh.forEach((h, i) => { o[h] = r[i]; }); return o; });
    eq(added.map(o => o['Branch Code']), ['IMPB1', '86500000000001', 'IMPB3']);
    ok(added.every(o => typeof o['Branch Code'] === 'string'), 'codes are strings');
    ok(!added.some(o => String(o.Channel).startsWith('=') || String(o['Branch Name']).startsWith('+')), 'free text neutralised');
    ok(unwrap(api('GET_ALL_DATA', {}, admin)).branches.some(b => b['Branch Code'] === 'IMPB1'), 'cache busted');
    eq(unwrap(imp('Branches', rows, false)).created, 0, 're-import idempotent');
  } finally { restore(); }
});
t('import gift mappings: auto-numbers GM-nnn after highest; target + at least one gift required; Status normalised; unknown channel warned; formulas neutralised', () => {
  const restore = importSnap(['GiftMappings']); const gh = sheets.GiftMappings.rows[0], before = sheets.GiftMappings.rows.length;
  const T = 'Target Mobile (SKU or Group)';
  const rows = [
    { 'Mapping ID': '', [T]: 'ZZ-Series', Channel: 'NOPE-CH', 'Brand Gifts': 'adapter, case', 'Channel Gifts': '', Status: '' },
    { 'Mapping ID': 'GM-900', [T]: '*', Channel: '', 'Brand Gifts': '', 'Channel Gifts': 'bag', Status: 'ปิด' },
    { 'Mapping ID': '', [T]: '', Channel: '', 'Brand Gifts': 'x', Status: 'เปิด' },
    { 'Mapping ID': '', [T]: 'AA', Channel: '', 'Brand Gifts': '', 'Channel Gifts': '', Status: 'เปิด' },
    { 'Mapping ID': '', [T]: 'BB', Channel: '', 'Brand Gifts': 'x', Status: 'maybe' },
    { 'Mapping ID': '', [T]: '=evil', Channel: '', 'Brand Gifts': '+bad', Status: 'Inactive' },
    { 'Mapping ID': 'GM-900', [T]: 'dup', Channel: '', 'Brand Gifts': 'x' }
  ];
  try {
    const dry = unwrap(imp('GiftMappings', rows, true));
    eq([dry.created, dry.skippedCount, dry.errorCount], [3, 1, 3], JSON.stringify(dry));
    ok(dry.warnings.some(w => /NOPE-CH/.test(w.reason)), 'unknown channel warning');
    eq(sheets.GiftMappings.rows.length, before, 'dryRun must not write');
    unwrap(imp('GiftMappings', rows, false));
    const added = sheets.GiftMappings.rows.slice(before).map(r => { const o = {}; gh.forEach((h, i) => { o[h] = r[i]; }); return o; });
    eq(added.map(o => o['Status']), ['เปิด', 'ปิด', 'ปิด']);
    ok(/^GM-\d{3,}$/.test(added[0]['Mapping ID']) && added[1]['Mapping ID'] === 'GM-900', JSON.stringify(added.map(o => o['Mapping ID'])));
    ok(!added.some(o => String(o[T]).startsWith('=') || String(o['Brand Gifts']).startsWith('+')), 'free text neutralised');
    eq(imp('GiftMappings', rows, true, sales).status, 'error', 'Admin only');
  } finally { restore(); }
});
t('bulk delete: Admin only, whitelisted tables, server-side id column, max 200, removes only chosen rows, reports notFound, keeps own account, busts cache', () => {
  const del = (table, ids, who) => api('DELETE_RECORDS', { tableName: table, idField: 'ignored', idValues: ids }, who || admin);
  eq(del('Channels', ['x'], sales).status, 'error', 'Admin only');
  ['Orders', 'Settings', 'AuditLog', '__proto__', ''].forEach(tb => eq(del(tb, ['x']).status, 'error', 'table ' + tb));
  eq(del('Channels', []).status, 'error', 'empty selection');
  eq(del('Channels', Array.from({ length: 201 }, (_, i) => 'C' + i)).status, 'error', 'over max');
  const restore = importSnap(['Channels', 'Members']);
  try {
    const rows = [1, 2, 3, 4].map(i => ({ 'Channel ID': 'BD-' + i, 'Channel Name': 'Bulk ' + i, Description: '' }));
    unwrap(imp('Channels', rows, false));
    const ch = sheets.Channels.rows[0], idCol = ch.indexOf('Channel ID'), before = sheets.Channels.rows.length;
    const res = unwrap(del('Channels', ['BD-1', 'BD-3', 'BD-3', 'NOPE']));
    eq(res.deleted, 2); eq(res.notFound, ['NOPE']);
    eq(sheets.Channels.rows.length, before - 2);
    const left = sheets.Channels.rows.slice(1).map(r => r[idCol]);
    ok(left.indexOf('BD-2') > -1 && left.indexOf('BD-4') > -1 && left.indexOf('BD-1') === -1 && left.indexOf('BD-3') === -1, JSON.stringify(left));
    ok(!unwrap(api('GET_ALL_DATA', {}, admin)).channels.some(c => c['Channel ID'] === 'BD-1'), 'cache busted');
    const mh = sheets.Members.rows[0], self = sheets.Members.rows.slice(1).map(r => r[mh.indexOf('Username')]).filter(u => String(u).toLowerCase() === 'admin')[0];
    ok(self, 'seeded admin present'); const r2 = unwrap(del('Members', [self])); eq(r2.deleted, 0); eq(r2.protectedIds, [self]);
  } finally { restore(); }
});
t('bulk status: Admin only, whitelisted tables, explicit เปิด/ปิด, only chosen rows change, unchanged/notFound reported, cache busted', () => {
  const setSt = (table, ids, status, who) => api('BULK_SET_STATUS', { tableName: table, idValues: ids, status: status }, who || admin);
  eq(setSt('Promotions', ['x'], 'ปิด', sales).status, 'error', 'Admin only');
  ['Members', 'Branches', 'Orders', '__proto__', ''].forEach(tb => eq(setSt(tb, ['x'], 'ปิด').status, 'error', 'table ' + tb));
  eq(setSt('Promotions', [], 'ปิด').status, 'error', 'empty'); eq(setSt('Promotions', ['x'], '').status, 'error', 'blank status'); eq(setSt('Promotions', ['x'], 'maybe').status, 'error', 'bad status');
  eq(setSt('Promotions', Array.from({ length: 201 }, (_, i) => 'P' + i), 'ปิด').status, 'error', 'over max');
  const sh = sheets.Promotions, h = sh.rows[0], idc = h.indexOf('Promo ID'), stc = h.indexOf('Status');
  const snap = sh.rows.map(r => r.slice());
  try {
    const first = sh.rows[1][idc], second = sh.rows[2][idc], third = sh.rows[3] ? sh.rows[3][idc] : null;
    const r1 = unwrap(setSt('Promotions', [first, second, 'NOPE'], 'ปิด'));
    eq([r1.updated, r1.unchanged, r1.notFound, r1.newStatus], [2, 0, ['NOPE'], 'ปิด']);
    eq([sh.rows[1][stc], sh.rows[2][stc]], ['ปิด', 'ปิด']);
    if (third) eq(sh.rows[3][stc], snap[3][stc], 'unselected row untouched');
    const r2 = unwrap(setSt('Promotions', [first], 'Inactive')); eq([r2.updated, r2.unchanged], [0, 1], 'legacy word accepted, already ปิด');
    const r3 = unwrap(setSt('Promotions', [first, second], 'Active')); eq([r3.updated, r3.newStatus], [2, 'เปิด']);
    ok(unwrap(api('GET_ALL_DATA', {}, admin)).promotions.filter(p => p['Promo ID'] === first)[0].Status === 'เปิด', 'cache busted');
  } finally { sh.rows.length = 0; snap.forEach(r => sh.rows.push(r)); cache.remove('TABLE_Promotions'); }
});
t('emergency password reset: needs MPOS_RESET_ENABLE, validates input, hashes, clears rate-limit + its own properties, never leaks the password', () => {
  const props = ctx.PropertiesService.getScriptProperties();
  const run = () => ctx.resetMemberPasswordFromProperties();
  let threw = false; try { run(); } catch (e) { threw = /MPOS_RESET_ENABLE/.test(String(e)); } ok(threw, 'refuses without the enable flag');
  const mh = sheets.Members.rows[0], uc = mh.indexOf('Username'), pc = mh.indexOf('Password');
  const row = () => sheets.Members.rows.find((r, i) => i > 0 && r[uc] === 'admin');
  const before = row()[pc];
  const attempt = (u, pw) => { props.setProperty('MPOS_RESET_ENABLE', 'true'); if (u !== null) props.setProperty('MPOS_RESET_USERNAME', u); if (pw !== null) props.setProperty('MPOS_RESET_PASSWORD', pw); try { return { ok: run() }; } catch (e) { return { err: String(e) }; } };
  ok(attempt('admin', 'short').err, 'short password rejected'); eq(row()[pc], before, 'unchanged after reject');
  ok(attempt('no.such.user', 'LongEnough#1').err, 'unknown user rejected');
  ok(attempt(null, 'LongEnough#1').err, 'missing username rejected');
  ['MPOS_RESET_ENABLE', 'MPOS_RESET_USERNAME', 'MPOS_RESET_PASSWORD'].forEach(k => eq(props.getProperty(k), null, k + ' cleared after a failed run'));
  cache.put('LOGIN_FAIL_admin', '5');
  const res = attempt('admin', 'Brand#New2026');
  ok(res.ok && !/Brand#New2026/.test(res.ok), JSON.stringify(res));
  ok(/^[a-f0-9]{64}$/.test(row()[pc]) && row()[pc] !== before, 'stored as salted hash');
  eq(cache.get('LOGIN_FAIL_admin'), null, 'rate-limit lock cleared');
  ['MPOS_RESET_ENABLE', 'MPOS_RESET_USERNAME', 'MPOS_RESET_PASSWORD'].forEach(k => eq(props.getProperty(k), null, k + ' cleared after success'));
  const login = api('LOGIN', { username: 'admin', password: 'Brand#New2026' }); ok(login && (login.Token || (login.user && login.user.Token)), 'can log in with the new password');
  eq(api('LOGIN', { username: 'admin', password: adminPw }).status, 'error', 'old password no longer works');
  // restore the original password so later tests keep working
  props.setProperty('MPOS_RESET_ENABLE', 'true'); props.setProperty('MPOS_RESET_USERNAME', 'admin'); props.setProperty('MPOS_RESET_PASSWORD', adminPw); run();
  const again = api('LOGIN', { username: 'admin', password: adminPw }); ok(again && (again.Token || (again.user && again.user.Token)), 'original password restored');
});
t('import channels: blank ID auto-numbers after the highest CH-nn; explicit IDs kept; dup ID skipped; duplicate name warned', () => {
  const restore = importSnap(['Channels']); const ch = sheets.Channels.rows[0], before = sheets.Channels.rows.length;
  const ids = sheets.Channels.rows.slice(1).map(r => String(r[ch.indexOf('Channel ID')]));
  const maxN = Math.max(0, ...ids.map(v => { const m = /^CH-(\d+)$/.exec(v); return m ? parseInt(m[1], 10) : 0; }));
  const exName = sheets.Channels.rows[1][ch.indexOf('Channel Name')], exId = sheets.Channels.rows[1][ch.indexOf('Channel ID')];
  const pad = n => String(n).padStart(2, '0');
  try {
    const r = unwrap(imp('Channels', [
      { 'Channel ID': '', 'Channel Name': 'Imp One', Description: 'd1' },
      { 'Channel ID': '', 'Channel Name': '' },
      { 'Channel Name': 'Imp Two' },
      { 'Channel ID': 'CUSTOM-9', 'Channel Name': 'Imp Custom' },
      { 'Channel ID': exId, 'Channel Name': 'dup id' },
      { 'Channel ID': '', 'Channel Name': exName }
    ], false));
    eq([r.created, r.skippedCount, r.errorCount, r.warningCount], [4, 1, 1, 1], JSON.stringify([r.errors, r.warnings]));
    const added = sheets.Channels.rows.slice(before).map(x => x[ch.indexOf('Channel ID')]);
    eq(added, ['CH-' + pad(maxN + 1), 'CH-' + pad(maxN + 2), 'CUSTOM-9', 'CH-' + pad(maxN + 3)]);
  } finally { restore(); }
});
t('import members: roles/branches validated; passwords hashed (login works); blank => random shown once only on real run; hashes pass through; never logged', () => {
  const restore = importSnap(['Members']); const mh = sheets.Members.rows[0], before = sheets.Members.rows.length;
  const branch = sheets.Branches.rows[1][sheets.Branches.rows[0].indexOf('Branch Code')];
  const knownHash = ctx.hashPassword('Known-Pass-1');
  const rows = [
    { Username: 'imp.sales', Password: 'Secret-123', Role: 'sales', Name: 'Imp Sales', 'Branch Code': branch, 'Accessible Menus': 'pos, orders' },
    { Username: 'imp.mgr', Password: '', Role: 'Manager', Name: 'Imp Mgr', 'Branch Code': 'ALL' },
    { Username: 'imp.admin', Password: knownHash, Role: 'Admin', Name: 'Imp Admin', 'Branch Code': '', 'Accessible Menus': '*' },
    { Username: 'IMP.SALES', Role: 'Sales', Name: 'case dup', 'Branch Code': branch },
    { Username: 'admin', Role: 'Sales', Name: 'dup existing', 'Branch Code': branch },
    { Username: 'imp.badrole', Role: 'Owner', Name: 'x', 'Branch Code': branch },
    { Username: 'imp.nobranch', Role: 'Sales', Name: 'x' },
    { Username: 'imp.ghostbranch', Role: 'Sales', Name: 'x', 'Branch Code': 'NOPE-999' },
    { Username: 'imp.shortpw', Password: 'abc', Role: 'Sales', Name: 'x', 'Branch Code': branch },
    { Username: 'bad name!', Role: 'Sales', Name: 'x', 'Branch Code': branch },
    { Username: 'imp.badmenu', Role: 'Sales', Name: 'x', 'Branch Code': branch, 'Accessible Menus': 'pos;<script>' },
    { Username: 'imp.noname', Role: 'Sales', Name: '', 'Branch Code': branch }
  ];
  try {
    const dry = unwrap(imp('Members', rows, true));
    eq([dry.created, dry.skippedCount, dry.errorCount, dry.generatedCount], [3, 2, 7, 1], JSON.stringify([dry.errors, dry.skipped]));
    ok(dry.generatedPasswords === undefined && !JSON.stringify(dry).includes('Secret-123'), 'dryRun must not generate or echo passwords');
    ok(dry.warnings.some(w => /Admin/.test(w.reason)) && dry.warnings.some(w => /ALL/.test(w.reason)), 'admin / ALL warnings');
    eq(sheets.Members.rows.length, before, 'dryRun must not write');
    const real = unwrap(imp('Members', rows, false));
    eq([real.created, real.errorCount], [3, 7]);
    eq(real.generatedPasswords.length, 1); eq(real.generatedPasswords[0].username, 'imp.mgr'); eq(real.generatedPasswords[0].password.length, 16);
    const row = (u) => { const r = sheets.Members.rows.find(x => x[mh.indexOf('Username')] === u); const o = {}; mh.forEach((h, i) => { o[h] = r[i]; }); return o; };
    const s1 = row('imp.sales'), m1 = row('imp.mgr'), a1 = row('imp.admin');
    eq([s1.Role, s1['Accessible Menus'], s1['Branch Code']], ['Sales', 'pos,orders', branch]);
    eq([m1.Role, a1['Branch Code'], a1.Password], ['Manager', 'ALL', knownHash], 'blank branch => ALL for Admin; given hash kept');
    ok(/^[a-f0-9]{64}$/.test(s1.Password) && s1.Password !== 'Secret-123', 'plain password stored hashed');
    ok(api('LOGIN', { username: 'imp.sales', password: 'Secret-123' }).status !== 'error', 'imported password logs in');
    ok(api('LOGIN', { username: 'imp.mgr', password: real.generatedPasswords[0].password }).status !== 'error', 'generated password logs in');
    ok(api('LOGIN', { username: 'imp.admin', password: 'Known-Pass-1' }).status !== 'error', 'hash-imported password logs in');
    const log = JSON.stringify(sheets.AuditLog.rows);
    ok(!log.includes('Secret-123') && !log.includes(real.generatedPasswords[0].password), 'no password in AuditLog');
    ok(!JSON.stringify(unwrap(api('GET_ALL_DATA', {}, admin)).members).includes('Password'), 'members payload still strips Password');
    ok(unwrap(imp('Members', rows, false)).generatedPasswords === undefined, 're-import generates nothing');
  } finally { restore(); }
});
// ----- NEWS (ข่าวสาร) -----
const newsSnap = () => { const had = { News: !!sheets.News, NewsCategories: !!sheets.NewsCategories }; return () => { Object.keys(had).forEach(n => { if (!had[n]) delete sheets[n]; }); cache.removeAll && cache.removeAll(); }; };
const newsLoad = () => unwrap(api('NEWS_LIST', {}, admin)).data;
t('news: every action is Admin-only; NEWS_LIST auto-creates both sheets with the fixed headers', () => {
  const restore = newsSnap();
  try {
    ['NEWS_LIST', 'NEWS_SAVE', 'NEWS_DELETE', 'NEWS_SET_SEQ', 'NEWS_CAT_SAVE', 'NEWS_CAT_DELETE'].forEach(a => eq(api(a, { ids: ['x'], id: 'x', seq: 1, name: 'n', title: 't' }, sales).status, 'error', a));
    ok(!sheets.News, 'sales must not create the sheets');
    const d = newsLoad();
    eq([d.news.length, d.categories.length], [0, 0]);
    eq(sheets.News.rows[0], ctx.NEWS_HEADERS_); eq(sheets.NewsCategories.rows[0], ctx.NEWS_CAT_HEADERS_);
  } finally { restore(); }
});
t('news: categories — name required/unique (case-insensitive), rename cascades to news, delete blocked while in use', () => {
  const restore = newsSnap();
  try {
    newsLoad();
    eq(api('NEWS_CAT_SAVE', { name: '  ' }, admin).status, 'error');
    const a = unwrap(api('NEWS_CAT_SAVE', { name: 'SAMSUNG' }, admin));
    eq(api('NEWS_CAT_SAVE', { name: 'samsung' }, admin).status, 'error', 'dup name');
    unwrap(api('NEWS_CAT_SAVE', { name: 'We are family' }, admin));
    const n = unwrap(api('NEWS_SAVE', { category: 'SAMSUNG', title: 'ข่าวหนึ่ง' }, admin));
    const del = api('NEWS_CAT_DELETE', { ids: [a.id] }, admin);
    ok(del.status === 'error' && /SAMSUNG/.test(del.message), 'in-use category must not be deleted: ' + JSON.stringify(del));
    unwrap(api('NEWS_CAT_SAVE', { id: a.id, name: 'SAMSUNG GALAXY', status: 'Active' }, admin));
    eq(newsLoad().news[0].category, 'SAMSUNG GALAXY', 'rename cascades');
    unwrap(api('NEWS_DELETE', { ids: [n.id] }, admin));
    eq(unwrap(api('NEWS_CAT_DELETE', { ids: [a.id] }, admin)).deleted, 1);
    eq(newsLoad().categories.map(c => c.name), ['We are family']);
  } finally { restore(); }
});
t('status wording: NewsCategories + AutoPromotions store เปิด/ปิด; old Active/Inactive still read and are migrated', () => {
  const restore = newsSnap();
  try {
    const c1 = unwrap(api('NEWS_CAT_SAVE', { name: 'สถานะ-ทดสอบ' }, admin));
    eq(newsLoad().categories.filter(c => c.id === c1.id)[0].status, 'เปิด', 'default is เปิด');
    unwrap(api('NEWS_CAT_SAVE', { id: c1.id, name: 'สถานะ-ทดสอบ', status: 'ปิด' }, admin));
    eq(sheets.NewsCategories.rows.filter(r => r[0] === c1.id)[0][2], 'ปิด', 'stored as ปิด');
    unwrap(api('NEWS_CAT_SAVE', { id: c1.id, name: 'สถานะ-ทดสอบ', status: 'Active' }, admin));
    eq(sheets.NewsCategories.rows.filter(r => r[0] === c1.id)[0][2], 'เปิด', 'legacy input normalised');
    eq(api('NEWS_CAT_SAVE', { id: c1.id, name: 'สถานะ-ทดสอบ', status: 'maybe' }, admin).status, 'error');
    sheets.NewsCategories.rows.filter(r => r[0] === c1.id)[0][2] = 'Inactive';
    eq(newsLoad().categories.filter(c => c.id === c1.id)[0].status, 'ปิด', 'legacy Inactive read as ปิด');
    newsLoad(); // ensureNewsSheets_ migrates
    eq(sheets.NewsCategories.rows.filter(r => r[0] === c1.id)[0][2], 'ปิด', 'legacy value migrated in sheet');
  } finally { restore(); }
  const ap = sheets.AutoPromotions, st = ap.rows[0].indexOf('Status');
  ok(ap.rows.slice(1).every(r => r[st] === 'เปิด' || r[st] === 'ปิด'), 'seed uses เปิด/ปิด: ' + JSON.stringify(ap.rows.slice(1).map(r => r[st])));
  const keep = ap.rows[1][st];
  try {
    ap.rows[1][st] = 'Active'; ap.rows[2] && (ap.rows[2][st] = 'Inactive');
    const res = unwrap(api('GET_TABLE', { tableName: 'AutoPromotions' }, admin));
    eq(res.data.slice(0, 2).map(r => r.Status), ['เปิด', ap.rows[2] ? 'ปิด' : undefined].slice(0, res.data.length >= 2 ? 2 : 1));
  } finally { ap.rows[1][st] = keep; }
});
t('news: save validation — title/category required, category must exist, links http(s)/#route only, dates/seq/status checked, nothing written on failure', () => {
  const restore = newsSnap();
  try {
    newsLoad(); unwrap(api('NEWS_CAT_SAVE', { name: 'A' }, admin));
    const bad = (o, re) => { const r = api('NEWS_SAVE', Object.assign({ category: 'A', title: 'T' }, o), admin); ok(r.status === 'error' && (!re || re.test(r.message)), JSON.stringify(o) + ' => ' + JSON.stringify(r)); };
    bad({ title: '' }, /หัวข้อ/); bad({ category: '' }, /หมวดหมู่/); bad({ category: 'ZZZ' }, /ไม่พบหมวดหมู่/);
    bad({ link: 'javascript:alert(1)' }); bad({ imageUrl: 'data:image/png;base64,AAAA' }); bad({ link: 'ftp://x.y' });
    bad({ startDate: '2026-13-40' }); bad({ startDate: '2026-05-02', endDate: '2026-05-01' }, /ก่อน/);
    bad({ seq: -1 }); bad({ seq: 1.5 }); bad({ seq: 10000 }); bad({ status: 'Deleted' });
    bad({ title: 'x'.repeat(151) }); bad({ detail: 'x'.repeat(5001) });
    eq(newsLoad().news.length, 0, 'failed saves must not write');
    unwrap(api('NEWS_SAVE', { category: 'A', title: 'ok', link: '#pos', imageUrl: 'https://x.y/a.png' }, admin));
    eq(newsLoad().news.length, 1);
  } finally { restore(); }
});
t('news: create/edit/seq/order; formula text neutralised; creator+updater recorded; dates stored as text; audit has no body text', () => {
  const restore = newsSnap();
  try {
    newsLoad(); unwrap(api('NEWS_CAT_SAVE', { name: 'A' }, admin));
    const a = unwrap(api('NEWS_SAVE', { category: 'A', title: '=HYPERLINK("x")', detail: '+evil', seq: 5, startDate: '2026-01-01', endDate: '2099-12-31' }, admin));
    const b = unwrap(api('NEWS_SAVE', { category: 'A', title: 'B', seq: 1 }, admin));
    let list = newsLoad().news;
    eq(list.map(n => n.id), [b.id, a.id], 'ordered by Seq asc');
    ok(String(sheets.News.rows[1][2]).startsWith("'=") && String(sheets.News.rows[1][3]).startsWith("'+"), 'formula guard: ' + sheets.News.rows[1].slice(2, 4));
    eq([list[1].createdBy, list[1].updatedBy], ['admin', ''], 'created by admin, not yet updated');
    unwrap(api('NEWS_SET_SEQ', { id: a.id, seq: 0 }, admin));
    eq(newsLoad().news.map(n => n.id), [a.id, b.id], 'seq edit re-orders');
    eq(api('NEWS_SET_SEQ', { id: a.id, seq: 'abc' }, admin).status, 'error');
    eq(api('NEWS_SET_SEQ', { id: 'ghost', seq: 1 }, admin).status, 'error');
    unwrap(api('NEWS_SAVE', { id: b.id, category: 'A', title: 'B2', seq: 1, status: 'Inactive' }, admin));
    list = newsLoad().news; const b2 = list.find(n => n.id === b.id);
    eq([b2.title, b2.status, b2.updatedBy], ['B2', 'ปิด', 'admin']);
    ok(typeof sheets.News.rows[1][8] === 'string', 'start date stored as text');
    eq(api('NEWS_SAVE', { id: 'ghost', category: 'A', title: 'x' }, admin).status, 'error', 'unknown id must not create');
    ok(!JSON.stringify(sheets.AuditLog.rows).includes('+evil'), 'detail text not copied into AuditLog');
  } finally { restore(); }
});
t('news: storefront (GET_ALL_DATA) gets only Active + in-window news, without creator/audit fields; bulk delete works and is capped', () => {
  const restore = newsSnap();
  try {
    newsLoad(); unwrap(api('NEWS_CAT_SAVE', { name: 'A' }, admin));
    const mk = (o) => unwrap(api('NEWS_SAVE', Object.assign({ category: 'A', title: 'n' }, o), admin)).id;
    const live = mk({ title: 'live', seq: 2 }), live2 = mk({ title: 'live-first', seq: 1 });
    mk({ title: 'off', status: 'Inactive' }); mk({ title: 'future', startDate: '2099-01-01' }); mk({ title: 'old', endDate: '2000-01-01' });
    const pub = unwrap(api('GET_ALL_DATA', {}, sales)).news;
    eq(pub.map(n => n.title), ['live-first', 'live']);
    ok(pub.every(n => !('createdBy' in n) && !('updatedBy' in n) && !('status' in n)), 'no internal fields');
    eq(unwrap(api('NEWS_DELETE', { ids: [live, live2, 'ghost'] }, admin)).deleted, 2);
    eq(unwrap(api('GET_ALL_DATA', {}, sales)).news.length, 0);
    eq(api('NEWS_DELETE', { ids: [] }, admin).status, 'error');
    eq(api('NEWS_DELETE', { ids: Array.from({ length: 201 }, (_, i) => 'x' + i) }, admin).status, 'error', 'cap');
  } finally { restore(); }
});
t('import: empty / >1000 rows rejected; malformed payload never throws', () => {
  eq(api('IMPORT_PRODUCTS', { rows: [] }, admin).status, 'error');
  eq(api('IMPORT_PRODUCTS', {}, admin).status, 'error');
  const many = Array.from({ length: 1001 }, (_, i) => ({ SKU: 'X' + i, Model: 'X', Stock: '1' }));
  const r = api('IMPORT_PRODUCTS', { rows: many, dryRun: true }, admin);
  ok(r.status === 'error' && /1000/.test(r.message), JSON.stringify(r).slice(0, 160));
  const odd = unwrap(api('IMPORT_PRODUCTS', { rows: [null, 5, 'x', {}, { SKU: { a: 1 }, Model: ['m'] }], dryRun: true }, admin));
  eq([odd.created, odd.errorCount], [0, 5]);
});
t('popular: no Orders sheet data => empty list, never throws', () => { const o = sheets.Orders.rows.splice(1); cache.remove('POPULAR_MODELS_V1'); try { eq(ctx.getPopularModels_(ss, new Date()), []); } finally { sheets.Orders.rows.push(...o); cache.remove('POPULAR_MODELS_V1'); } });
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
t('BULK_UPDATE_PRODUCTS applies the exact payload the quick-edit modal sends (SKU/Price/Stock Qty) and the API-style keys', () => {
  const ph = sheets.Products.rows[0], row = sheets.Products.rows[1], sku = row[ph.indexOf('SKU')], si = ph.indexOf('Stock'), pi = ph.indexOf('Price'), oldStock = row[si], oldPrice = row[pi];
  try {
    const a = unwrap(api('BULK_UPDATE_PRODUCTS', { updates: [{ SKU: sku, Price: 1234, 'Original Price': '', 'Stock Qty': 77, Status: 'เปิด' }] }, admin));
    eq([a.updatedCount, row[si], row[pi]], [1, 77, 1234], 'client-shaped payload must change the sheet');
    const b = unwrap(api('BULK_UPDATE_PRODUCTS', { updates: [{ sku: sku, price: 1500, stock: 55 }] }, admin));
    eq([b.updatedCount, row[si], row[pi]], [1, 55, 1500], 'API-shaped payload still works');
    eq(unwrap(api('BULK_UPDATE_PRODUCTS', { updates: [{ SKU: 'NO-SUCH', Price: 1 }, null, 7] }, admin)).updatedCount, 0);
  } finally { row[si] = oldStock; row[pi] = oldPrice; cache.remove('TABLE_Products'); }
});
t('BULK_UPDATE_PRODUCTS "Stock Add" adds to the live stock, never below 0, ignores 0/garbage', () => {
  const ph = sheets.Products.rows[0], row = sheets.Products.rows[1], sku = row[ph.indexOf('SKU')], si = ph.indexOf('Stock'), old = row[si];
  try {
    row[si] = 10;
    unwrap(api('BULK_UPDATE_PRODUCTS', { updates: [{ SKU: sku, 'Stock Add': 25 }] }, admin)); eq(row[si], 35, '+25');
    unwrap(api('BULK_UPDATE_PRODUCTS', { updates: [{ SKU: sku, 'Stock Add': '5' }] }, admin)); eq(row[si], 40, 'string number');
    unwrap(api('BULK_UPDATE_PRODUCTS', { updates: [{ SKU: sku, 'Stock Add': 0 }, { SKU: sku, 'Stock Add': 'abc' }] }, admin)); eq(row[si], 40, 'zero/garbage ignored');
    unwrap(api('BULK_UPDATE_PRODUCTS', { updates: [{ SKU: sku, 'Stock Add': -100 }] }, admin)); eq(row[si], 0, 'floor at 0');
  } finally { row[si] = old; cache.remove('TABLE_Products'); }
});
t('BULK_UPDATE_PRODUCTS admin', () => { const r = api('BULK_UPDATE_PRODUCTS', { updates: [{ SKU: 'SKU-S24U', Stock: 77 }], rows: [{ SKU: 'SKU-S24U', Stock: 77 }] }, admin); ok(r && typeof r === 'object', JSON.stringify(r).slice(0, 150)); });
console.log('== SET_ORDER_STATUS');
{
  const place = () => { const r = api('CHECKOUT', co({ clientRequestId: 'SOS-' + Math.random() }), sales); eq(r.status, 'success', JSON.stringify(r)); return r.orderId; };
  const statusOf = (id) => [...new Set(tbl('Orders').filter(x => x.OrderID === id).map(x => x['Order Status']))].join(',');
  let a, b;
  t('SET_ORDER_STATUS: Sales cannot change a status', () => { a = place(); b = place(); const r = api('SET_ORDER_STATUS', { orderIds: [a], status: 'Confirmed' }, sales); eq(r.status, 'error', JSON.stringify(r)); eq(statusOf(a), 'Pending'); });
  t('SET_ORDER_STATUS: Admin changes several orders by OrderID, every row of each order, history logged', () => {
    const r = api('SET_ORDER_STATUS', { orderIds: [a, b, a], status: 'Confirmed' }, admin);
    eq(r.status, 'success', JSON.stringify(r)); eq(r.updated.length, 2, JSON.stringify(r)); eq(r.failed.length, 0);
    eq(statusOf(a), 'Confirmed'); eq(statusOf(b), 'Confirmed');
    const log = sheets.OrderStatusLog.rows.filter(x => x[0] === a); ok(log.some(x => x[2] === 'Pending' && x[3] === 'Confirmed'), 'status log row missing: ' + JSON.stringify(log));
  });
  t('SET_ORDER_STATUS: same status = unchanged, unknown order = failed, the rest still updated', () => {
    const r = api('SET_ORDER_STATUS', { orderIds: [a, 'ORD-NOPE-1'], status: 'Confirmed' }, admin);
    eq(r.status, 'success', JSON.stringify(r)); eq(r.unchanged.join(), a); eq(r.failed.length, 1); eq(r.failed[0].orderId, 'ORD-NOPE-1'); eq(r.updated.length, 0);
  });
  t('SET_ORDER_STATUS: cancelling returns stock, un-cancelling takes it again', () => {
    const s0 = stockOf('SKU-S24U');
    eq(api('SET_ORDER_STATUS', { orderIds: [a], status: 'Cancelled' }, admin).updated.join(), a); eq(stockOf('SKU-S24U'), s0 + 1); eq(statusOf(a), 'Cancelled');
    eq(api('SET_ORDER_STATUS', { orderIds: [a], status: 'Pending' }, admin).updated.join(), a); eq(stockOf('SKU-S24U'), s0);
  });
  t('SET_ORDER_STATUS: invalid status / bad id / empty list / over the limit rejected, nothing written', () => {
    const r1 = api('SET_ORDER_STATUS', { orderIds: [b], status: '=HYPERLINK("x")' }, admin); ok(r1.status === 'error' || (r1.failed && r1.failed.length === 1), JSON.stringify(r1)); eq(statusOf(b), 'Confirmed');
    eq(api('SET_ORDER_STATUS', { orderIds: ['bad id!'], status: 'Paid' }, admin).status, 'error');
    eq(api('SET_ORDER_STATUS', { orderIds: [], status: 'Paid' }, admin).status, 'error');
    eq(api('SET_ORDER_STATUS', { orderIds: [b], status: '' }, admin).status, 'error');
    eq(api('SET_ORDER_STATUS', { orderIds: Array.from({ length: 51 }, (_, i) => 'ORD-X-' + i), status: 'Paid' }, admin).status, 'error');
    eq(statusOf(b), 'Confirmed');
  });
}
console.log('== SAVE_RECORD field rules (Members branch / Coupons dates)');
const mem = (d) => api('SAVE_RECORD', { tableName: 'Members', idField: 'Username', data: Object.assign({ Password: 'Pass1234!', Name: 'ทดสอบ', 'Accessible Menus': '' }, d) }, admin);
t('Members: unknown branch / blank branch for Sales / bad role rejected, nothing written', () => {
  const n = tbl('Members').length;
  ok(/ไม่พบสาขา/.test(mem({ Username: 'rule.a', Role: 'Sales', 'Branch Code': 'NO-SUCH' }).message), 'unknown branch');
  ok(/เลือกสาขา/.test(mem({ Username: 'rule.b', Role: 'Sales', 'Branch Code': '' }).message), 'blank branch');
  ok(/บทบาท/.test(mem({ Username: 'rule.c', Role: 'Boss', 'Branch Code': 'B01' }).message), 'bad role');
  eq(tbl('Members').length, n);
});
t('Members: Admin with a blank branch is stored as ALL; ALL and a real branch accepted', () => {
  eq(mem({ Username: 'rule.d', Role: 'Admin', 'Branch Code': '' }).status, 'success');
  eq(tbl('Members').find(x => x.Username === 'rule.d')['Branch Code'], 'ALL');
  eq(mem({ Username: 'rule.e', Role: 'Manager', 'Branch Code': 'ALL' }).status, 'success');
  eq(mem({ Username: 'rule.f', Role: 'Sales', 'Branch Code': 'B01' }).status, 'success');
});
t('Members: a stored branch that no longer exists does not block editing other fields, but changing to another unknown one does', () => {
  const sh = sheets.Members, h = sh.rows[0], bi = h.indexOf('Branch Code'), ri = sh.rows.findIndex(r => r[0] === 'rule.f');
  sh.rows[ri][bi] = 'GONE-01';
  const row = tbl('Members').find(x => x.Username === 'rule.f');
  eq(api('SAVE_RECORD', { tableName: 'Members', idField: 'Username', data: Object.assign({}, row, { Password: '', Name: 'เปลี่ยนชื่อ' }) }, admin).status, 'success');
  const after = tbl('Members').find(x => x.Username === 'rule.f'); eq(after.Name, 'เปลี่ยนชื่อ'); eq(after['Branch Code'], 'GONE-01');
  eq(api('SAVE_RECORD', { tableName: 'Members', idField: 'Username', data: Object.assign({}, after, { Password: '', 'Branch Code': 'GONE-02' }) }, admin).status, 'error');
});
const cpn = (d) => api('SAVE_RECORD', { tableName: 'Coupons', idField: 'Code', data: Object.assign({ Description: 'ทดสอบ', 'Discount Type': 'Fixed', Value: 100, 'Min Spend': 0, 'Max Uses': 0, 'Used Count': 0, Status: 'เปิด' }, d) }, admin);
t('Coupons: dates are stored as yyyy-MM-dd text (dd/mm/yyyy and Buddhist year accepted), blank stays blank', () => {
  eq(cpn({ Code: 'RULE1', 'Start Date': '2026-12-01', 'Expiry Date': '31/12/2569' }).status, 'success');
  const c = tbl('Coupons').find(x => x.Code === 'RULE1'); eq(c['Start Date'], '2026-12-01'); eq(c['Expiry Date'], '2026-12-31');
  eq(cpn({ Code: 'RULE2', 'Start Date': '', 'Expiry Date': '' }).status, 'success');
  eq(tbl('Coupons').find(x => x.Code === 'RULE2')['Expiry Date'], '');
});
t('Coupons: unreadable date and start-after-end rejected', () => {
  ok(/ไม่ถูกต้อง/.test(cpn({ Code: 'RULE3', 'Start Date': 'สิ้นปี', 'Expiry Date': '' }).message));
  ok(/ไม่หลัง/.test(cpn({ Code: 'RULE4', 'Start Date': '2026-12-31', 'Expiry Date': '2026-12-01' }).message));
  ok(!tbl('Coupons').some(x => x.Code === 'RULE3' || x.Code === 'RULE4'));
});
t('unknown action rejected', () => eq(api('NOPE', {}, admin).status, 'error'));

console.log('\n==== ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('\nFAILURES:'); fails.forEach(f => console.log(' - ' + f)); }
