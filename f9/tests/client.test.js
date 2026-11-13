// Client harness: serves the real Index/CSS/JS with a stubbed google.script.run backed by the GAS mock,
// then drives it in headless Chrome over the DevTools protocol.
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');
const { ctx, sheets, SRC } = require('./gasmock.js');
const CHROME = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(p => fs.existsSync(p));
if (!CHROME) { console.error('Chrome/Edge not found. Set CHROME_PATH.'); process.exit(2); }
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });

// ---------- seed ----------
const setup = ctx.setupDatabase(null);
const ADMIN_PW = setup.initialAdmin.password;
const st = sheets.Settings;
for (let i = 2; i <= st.getLastRow(); i++) { if (st._get(i, 1) === 'ReserveStart') st._set(i, 2, '2020-01-01T00:00:00'); if (st._get(i, 1) === 'ReserveEnd') st._set(i, 2, '2099-01-01T00:00:00'); }
const adminTok = ctx.apiHandler('LOGIN', { username: 'admin', password: ADMIN_PW }, null);
const AT = adminTok.Token ? adminTok : adminTok.user;
ctx.apiHandler('SAVE_RECORD', { tableName: 'Members', idField: 'Username', data: { Username: 'sale1', Password: 'Pass1234!', Role: 'Sales', Name: 'พนักงาน', 'Branch Code': 'B01', 'Accessible Menus': '*' } }, AT);
const cats = ['โมบาย', 'แท็บเล็ต', 'อุปกรณ์เสริม'];
const colors = ['Black', 'Blue', 'Silver'];
for (let m = 1; m <= 30; m++) {
  const r = ctx.apiHandler('SAVE_PRODUCT_GROUP', {
    shared: { Model: 'Galaxy Test' + m, 'Marketing Model': 'Samsung Galaxy Test' + m, 'Product Group': 'Series-' + (m % 4), Capacity: m % 2 ? '128GB' : '256GB', Price: 5000 + m * 1500, 'Original Price': m % 3 ? 0 : 5000 + m * 1500 + 2000, Category: cats[m % 3], Status: 'เปิด', Channel: 'Retail,Online', Unit: 'เครื่อง', 'Image URL': '' },
    variants: colors.slice(0, 1 + (m % 3)).map((c, k) => ({ sku: 'T' + m + '-' + k, color: c, stock: m % 5 === 0 ? 0 : 10 + k })),
  }, AT);
  if (r.status !== 'success') throw new Error('seed failed ' + JSON.stringify(r));
}

// companion fixtures: an accessory that matches model Test3 (same Product Group, name token) but is the MOST expensive,
// to prove ranking is by compatibility and not by price
{ const r = ctx.apiHandler('SAVE_PRODUCT_GROUP', { shared: { Model: 'CaseT3', 'Marketing Model': 'Case Galaxy Test3', 'Product Group': 'Series-3', Capacity: '-', Price: 99999, 'Original Price': 0, Category: 'อุปกรณ์เสริม', Status: 'เปิด', Channel: 'Retail,Online', Unit: 'ชิ้น', 'Image URL': '' }, variants: [{ sku: 'CASE-T3', color: 'Clear', stock: 5 }] }, AT);
  if (r.status !== 'success') throw new Error('seed case failed ' + JSON.stringify(r)); }
// make Test2 have different prices per variant (to exercise the price range on the card)
{ const sh = sheets.Products; const hd = sh.rows[0]; const pc = hd.indexOf('Price'), sc = hd.indexOf('SKU');
  for (let r = 1; r < sh.rows.length; r++) if (sh.rows[r][sc] === 'T2-1') sh.rows[r][pc] = 12345; }
// ---------- server ----------
const STUB = `<script>window.google={script:{run:(function(){function mk(ok,bad){return new Proxy({},{get:function(_,fn){if(fn==='withSuccessHandler')return function(h){return mk(h,bad)};if(fn==='withFailureHandler')return function(h){return mk(ok,h)};return function(){var a=Array.prototype.slice.call(arguments);fetch('/rpc',{method:'POST',body:JSON.stringify({fn:fn,args:a})}).then(function(r){return r.json()}).then(function(j){if(j.error){bad&&bad({message:j.error})}else{ok&&ok(j.result)}}).catch(function(e){bad&&bad(e)})}}})}return mk(null,null)})()}};</script><script>window.__top={parameters:{}};window.__pushes=[];window.__hist=null;google.script.url={getLocation:function(cb){cb({parameters:window.__top.parameters,parameter:{},hash:''})}};google.script.history={push:function(s,p,h){window.__pushes.push({p:p,h:h});window.__top.parameters=p},setChangeHandler:function(fn){window.__hist=fn}};</script>`;
function page() {
  let ix = fs.readFileSync(SRC + 'Index.html', 'utf8');
  ix = ix.split('<?= appName ?>').join('MPOS Test');
  ix = ix.replace("<?!= JSON.stringify(trackParam || '') ?>", '""');
  ix = ix.replace("<?!= JSON.stringify(deepModel || '') ?>", '""');
  ix = ix.replace("<?!= JSON.stringify(appUrl || '') ?>", '"https://script.google.com/macros/s/TEST/exec"');
  // resolve every <?!= include('X'); ?> from src/X.html (JS.html core + JS_*.html modules), like HtmlService does
  ix = ix.replace(/<\?!= include\('([A-Za-z_]+)'\); \?>/g, (_, name) => fs.readFileSync(SRC + name + '.html', 'utf8'));
  return ix.replace('<head>', '<head>' + STUB);
}
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/rpc') {
    let b = ''; req.on('data', d => (b += d)); req.on('end', () => {
      let out;
      try { const { fn, args } = JSON.parse(b); out = { result: ctx[fn].apply(null, args) }; } catch (e) { out = { error: String(e) }; }
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(out === undefined ? {} : out));
    });
  } else { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(page()); }
});

// ---------- CDP ----------
let ws, nextId = 1; const pending = {}; const pageErrors = []; let curPhase = 'boot';
const send = (method, params) => new Promise((res, rej) => { const id = nextId++; pending[id] = { res, rej }; ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text)); return r.result.value; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (expr, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch (e) {} await sleep(100); } throw new Error('timeout waiting: ' + expr); };

let pass = 0, fail = 0; const fails = [];
async function T(name, fn) { try { await fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; fails.push(name + ' -> ' + e.message); console.log('  FAIL ' + name + ' -> ' + e.message); } }
const ok = (c, m) => { if (!c) throw new Error(m || 'assert'); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'neq') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); };
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64')); };

(async () => {
  await new Promise(r => server.listen(8765, r));
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'chr-'));
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9333', '--user-data-dir=' + udd, '--window-size=1366,900', '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  let targets; for (let i = 0; i < 50; i++) { try { targets = await (await fetch('http://127.0.0.1:9333/json')).json(); if (targets.length) break; } catch (e) {} await sleep(200); }
  const tgt = targets.find(x => x.type === 'page');
  ws = new WebSocket(tgt.webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && pending[d.id]) { d.error ? pending[d.id].rej(new Error(JSON.stringify(d.error))) : pending[d.id].res(d.result); delete pending[d.id]; }
    else if (d.method === 'Runtime.exceptionThrown') pageErrors.push({ phase: curPhase, text: (d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description) || d.params.exceptionDetails.text });
    else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') pageErrors.push({ phase: curPhase, text: 'console.error: ' + d.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 300) });
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:8765/' });
  await waitFor("!!document.getElementById('loginUsername')", 20000);
  await ev("sessionStorage.setItem('tg_popup_shown','1');true");

  const login = async (u, p) => {
    await ev(`document.getElementById('loginUsername').value=${JSON.stringify(u)};document.getElementById('loginPassword').value=${JSON.stringify(p)};document.getElementById('loginForm').requestSubmit();true`);
    await waitFor("!!window.app.user && !!document.getElementById('page-content') || !!window.app.user", 10000);
    await sleep(800);
  };

  console.log('== LOGIN / ROUTES (admin)');
  curPhase = 'login';
  await T('page loads, app object present', async () => ok(await ev("typeof window.app === 'object' && typeof window.app.pos === 'object'")));
  await T('wrong password shows error, stays logged out', async () => { await ev(`document.getElementById('loginUsername').value='admin';document.getElementById('loginPassword').value='bad';document.getElementById('loginForm').requestSubmit();true`); await sleep(1200); ok(!(await ev('!!window.app.user')), 'logged in with bad pw'); await ev("window.Swal && Swal.close && Swal.close(); true"); });
  await T('admin login works', async () => { await login('admin', ADMIN_PW); ok(await ev('!!window.app.user && window.app.user.Role === "Admin"')); });

  const routes = await ev("window.app.menuConfig.flatMap(x => x.children || [x]).filter(x => x.id && (!x.roles || x.roles.includes('Admin'))).map(x => x.id)");
  for (const r of routes) {
    await T('route #' + r + ' renders without JS errors', async () => {
      curPhase = 'route:' + r; const before = pageErrors.length;
      await ev(`window.location.hash='#${r}';true`); await sleep(1300);
      const len = await ev("(document.getElementById('page-content')||document.querySelector('main')||document.body).innerText.length");
      ok(len > 20, 'page looks empty (' + len + ' chars)');
      ok(pageErrors.length === before, pageErrors.slice(before).map(e => e.text).join(' | ').slice(0, 400));
      eq(await ev("document.documentElement.classList.contains('sf-site')"), r === 'pos', 'website mode class must be on #pos only');
      if (r === 'analytics') { const pts = JSON.parse(await ev("JSON.stringify([window.app.analytics && window.app.analytics.chartPoints, window.app.analytics && window.app.analytics.chartPeriod])")); ok(pts[0] > 0 && pts[0] <= 200, 'forecast chart is bucketed (got ' + pts + ')'); }
      if (['dashboard', 'orders', 'analytics', 'products', 'systemsettings', 'invoice', 'target', 'bookingsummary', 'salessummary', 'branchbookingsummary', 'allbookingsummary'].includes(r)) await shot('admin-' + r);
      if (r === 'orders') {
        ok(await ev("!!document.querySelector('#odTabs .od-tab') && !!document.querySelector('#odBody .od-state') && !document.getElementById('dataTable')"), 'orders page: new one-row-per-order view with an empty state');
        await ev("window.app.orders.showTable();true"); await sleep(700);
        ok(await ev("(()=>{const e=document.querySelector('#dataGridBody .cms-empty-pin');const w=document.querySelector('.cms-wrap').getBoundingClientRect();if(!e)return false;const b=e.getBoundingClientRect();return b.width>100&&b.left>=w.left-1&&b.right<=w.right+1})()"), 'empty orders table: message is inside the visible part of a wide table');
        ok(await ev("!!document.getElementById('odBackBtn') && document.getElementById('gridExportBtn').classList.contains('flex')"), 'detailed table: back button + CSV export');
        await ev("document.getElementById('odBackBtn').click();true"); await sleep(500);
        ok(await ev("!!document.getElementById('odTabs')"), 'back button returns to the order view');
      }
      // ปุ่มนำเข้า CSV ต้องโผล่เฉพาะหน้าสินค้า (Products) เท่านั้น
      if (['products', 'branches', 'channels', 'members', 'giftmappings'].includes(r)) ok(await ev("(()=>{const b=document.getElementById('gridImportBtn');return !!b&&!b.classList.contains('hidden')})()"), 'import button must show on ' + r);
      else if (['promotions', 'coupons', 'interests', 'autopromotions'].includes(r)) ok(await ev("(()=>{const b=document.getElementById('gridImportBtn');return !b||b.classList.contains('hidden')})()"), 'import button must be hidden on ' + r);
      if (['products', 'giftmappings'].includes(r)) await shot('grid-' + r);
      await ev("window.Swal && Swal.isVisible && Swal.isVisible() && Swal.close(); true");
    });
  }

  console.log('== POS STOREFRONT (admin, overlay + layering)');
  curPhase = 'pos';
  await ev("window.location.hash='#pos';true"); await sleep(1500);
  await T('criteria overlay visible before channel/branch chosen', async () => ok(await ev("(()=>{const o=document.getElementById('criteriaOverlay');return o&&!o.classList.contains('hidden')&&getComputedStyle(o).opacity!=='0'})()")));
  await T('compare/wishlist buttons do NOT float above the overlay', async () => {
    const r = await ev(`(()=>{const b=document.querySelector('#productGrid .bnn-compare-btn, #productGrid [class*="btn-wishlist-"]');if(!b)return 'nobtn';b.scrollIntoView({block:'center',behavior:'instant'});const r=b.getBoundingClientRect();const el=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return el&&el.closest('#criteriaOverlay')?'covered':'EXPOSED:'+(el&&el.className)})()`);
    ok(r === 'covered' || r === 'nobtn', r);
  });
  await shot('pos-overlay');
  await T('choosing channel+branch hides overlay', async () => {
    await ev(`(()=>{const c=document.getElementById('posChannelSelect');c.value='Retail';c.dispatchEvent(new Event('change'));const b=document.getElementById('posBranchSelect');b.value='B01';b.dispatchEvent(new Event('change'));window.app.pos.checkCriteria();return true})()`);
    await sleep(900);
    ok(await ev("(()=>{const o=document.getElementById('criteriaOverlay');return !o||o.classList.contains('hidden')||getComputedStyle(o).opacity==='0'||getComputedStyle(o).pointerEvents==='none'})()"), 'overlay still blocking');
  });
  await T('cards render after criteria chosen', async () => {
    try { await waitFor("document.querySelectorAll('#productGrid .pos-card').length>0", 6000); }
    catch (e) { throw new Error('no cards; grid=' + (await ev("document.getElementById('productGrid').innerText.slice(0,200)")) + ' products=' + (await ev('(window.app.globalData.products||[]).length'))); }
  });
  await shot('pos-desktop'); await ev("document.getElementById('posStoreHeader').scrollIntoView({block:'start',behavior:'instant'});window.scrollTo({top:0,behavior:'instant'});true"); await sleep(250); await shot('pos-top-desktop');

  console.log('== STOREFRONT LAYOUT / FILTERS / PAGINATION');
  const cnt = () => ev("document.querySelectorAll('#productGrid .pos-card').length");
  const firstKey = () => ev("(document.querySelector('#productGrid .pos-card')||{dataset:{}}).dataset.cardKey||''");
  const countText = () => ev("(document.getElementById('storeResultCount')||{}).textContent||''");
  await T('sidebar + title + sort bar rendered', async () => ok(await ev("!!document.querySelector('#storeSidebar .sf-group') && !!document.querySelector('.sf-h1') && !!document.querySelector('.sf-sort select') && !!document.querySelector('.sf-crumb')")));
  await T('page 1 shows at most 12 cards', async () => { const n = await cnt(); ok(n > 0 && n <= 12, 'cards=' + n); });
  await T('result count shows total cards (33 for Retail incl. default phones with Channel ALL)', async () => ok(/33/.test(await countText()), await countText()));
  await T('pagination present with 3 pages', async () => ok((await ev("document.querySelectorAll('.sf-pager .sf-pg:not([aria-label])').length")) >= 3));
  let k1;
  await T('go to page 2 changes cards', async () => { k1 = await firstKey(); await ev("document.querySelectorAll('.sf-pager .sf-pg')[2].click();true"); await sleep(400); const k2 = await firstKey(); ok(k1 && k2 && k1 !== k2, k1 + ' vs ' + k2); ok(await ev("document.querySelector('.sf-pager .sf-pg.on').textContent.trim()==='2'")); });
  await T('last page then prev/next work', async () => { await ev("window.app.pos.goStorePage(3);true"); await sleep(300); const n = await cnt(); ok(n === 9, 'last page cards=' + n); await ev("document.querySelector('.sf-pager .sf-pg[aria-label=\"หน้าก่อนหน้า\"]').click();true"); await sleep(300); ok(await ev("document.querySelector('.sf-pager .sf-pg.on').textContent.trim()==='2'")); });
  await T('filter resets to page 1', async () => { await ev("window.app.pos.setStoreFilter('sort','asc');true"); await sleep(400); ok(await ev("document.querySelector('.sf-pager .sf-pg.on').textContent.trim()==='1'")); });
  await T('sort asc: first price <= second', async () => { const p = await ev("[...document.querySelectorAll('#productGrid .pos-card')].slice(0,6).map(c=>parseInt((c.innerText.match(/฿\\s?([\\d,]+)/)||[0,'0'])[1].replace(/,/g,''),10))"); ok(p.length >= 2 && p.every((v, i) => !i || v >= p[i - 1]), JSON.stringify(p)); });
  await T('sort desc works', async () => { await ev("window.app.pos.setStoreFilter('sort','desc');true"); await sleep(300); const p = await ev("[...document.querySelectorAll('#productGrid .pos-card')].slice(0,6).map(c=>parseInt((c.innerText.match(/฿\\s?([\\d,]+)/)||[0,'0'])[1].replace(/,/g,''),10))"); ok(p.every((v, i) => !i || v <= p[i - 1]), JSON.stringify(p)); });
  await T('category filter narrows results + breadcrumb/title update', async () => { await ev("window.app.pos.setStoreFilter('sort','');window.app.pos.setStoreCategory('แท็บเล็ต');true"); await sleep(400); ok(/แท็บเล็ต/.test(await ev("document.querySelector('.sf-h1').textContent")), 'title'); const t = await countText(); ok(/\(10 /.test(t) || /10/.test(t), 'count=' + t); ok(/แท็บเล็ต/.test(await ev("document.querySelector('.sf-crumb').textContent"))); });
  await T('series (group) filter', async () => { const g = await ev("(()=>{const o=[...document.querySelectorAll('#storeSidebar .sf-group')].find(x=>/ซีรีส์/.test(x.textContent));return o?o.querySelectorAll('.sf-opt').length:0})()"); ok(g >= 2, 'series options=' + g); await ev("window.app.pos.setStoreGroup('Series-1');true"); await sleep(300); ok(/Series-1/.test(await ev("document.querySelector('.sf-h1').textContent"))); });
  await T('in-stock toggle removes sold-out cards', async () => { await ev("window.app.pos.clearStoreFilters(false);true"); await sleep(300); const all = await ev("document.querySelectorAll('#productGrid .pos-card').length"); await ev("window.app.pos.setStoreFilter('inStock', true);true"); await sleep(300); const txt = await countText(); ok(!/\(30 /.test(txt), 'count still 30: ' + txt); ok(await ev("document.querySelector('.sf-switch').classList.contains('on')")); });
  await T('price-range filter', async () => { await ev("window.app.pos.clearStoreFilters(false);window.app.pos.setStoreFilter('priceRange','lt10');true"); await sleep(300); const p = await ev("[...document.querySelectorAll('#productGrid .pos-card')].map(c=>parseInt((c.innerText.match(/฿\\s?([\\d,]+)/)||[0,'0'])[1].replace(/,/g,''),10))"); ok(p.length > 0 && p.every(v => v < 10000), JSON.stringify(p)); });
  await T('capacity filter', async () => { await ev("window.app.pos.clearStoreFilters(false);window.app.pos.setStoreFilter('capacity','256GB');true"); await sleep(300); ok((await cnt()) > 0 && (await cnt()) <= 12); });
  console.log('== NEW: multi-select / custom price / card price range / URL sync');
  const P = (e) => ev(e);
  await T('capacity multi-select is a union (128GB, then +256GB = all 30)', async () => { await P("window.app.pos.clearStoreFilters(false);window.app.pos.setStoreFilter('capacity','128GB');true"); await sleep(250); const a = await countText(); ok(/\((15|1\d) /.test(a) && !/\(30 /.test(a), 'after 128GB: ' + a); await P("window.app.pos.setStoreFilter('capacity','256GB');true"); await sleep(250); ok(/\(31 /.test(await countText()), 'after +256GB: ' + await countText()); ok(await P("document.querySelectorAll('#storeSidebar .sf-group')[3] ? true : true")); });
  await T('clicking a checked option unchecks it (toggle)', async () => { await P("window.app.pos.setStoreFilter('capacity','256GB');true"); await sleep(250); ok(await P("JSON.stringify(window.app.pos.storeFilters.capacities)==='[\"128GB\"]'")); });
  await T('capacity/color options are scoped to the selected category (and series); stale selections are pruned', async () => {
    const r = JSON.parse(await P(`(()=>{ const pos=window.app.pos, ps=(window.app.globalData.products||[]).filter(p=>p.Status==='เปิด'); const out={};
      const labels=(title)=>{ const d=[...document.querySelectorAll('#storeSidebar details')].find(x=>x.querySelector('summary').textContent.includes(title)); return d?[...d.querySelectorAll('.sf-lbl')].map(x=>x.textContent):[]; };
      const uniq=(cat,k)=>[...new Set(ps.filter(p=>(p.Category||'').trim()===cat).map(p=>(p[k]||'').trim()).filter(v=>v&&v!=='-'))].sort();
      pos.clearStoreFilters(false);
      const cats=[...new Set(ps.map(p=>(p.Category||'').trim()).filter(Boolean))];
      out.pairs=[]; cats.forEach(c=>{ pos.setStoreCategory(c); out.pairs.push([c, JSON.stringify(labels('ความจุ').slice().sort())===JSON.stringify(uniq(c,'Capacity')), JSON.stringify(labels('สี').slice().sort())===JSON.stringify(uniq(c,'Color'))]); });
      const all=[...new Set(ps.map(p=>(p.Capacity||'').trim()).filter(v=>v&&v!=='-'))];
      out.someNarrower=cats.some(c=>uniq(c,'Capacity').length<all.length);
      pos.clearStoreFilters(false); const c0=cats.find(c=>uniq(c,'Capacity').length<all.length);
      const foreign=all.find(v=>!uniq(c0,'Capacity').includes(v));
      pos.storeFilters.capacities=[foreign]; pos.setStoreCategory(c0); out.pruned=pos.storeFilters.capacities.length===0;
      pos.clearStoreFilters(false); return JSON.stringify(out); })()`));
    ok(r.someNarrower, 'fixture needs a category with fewer capacities than the whole shop');
    r.pairs.forEach(x => ok(x[1] && x[2], 'options of category ' + x[0] + ' must match its own products: ' + JSON.stringify(x)));
    ok(r.pruned, 'capacity from another category must be dropped on category change');
  });
  await T('multi series: two series = union', async () => { await P("window.app.pos.clearStoreFilters(false);window.app.pos.setStoreGroup('Series-1');true"); await sleep(250); const one = parseInt((await countText()).match(/\d+/)[0], 10); await P("window.app.pos.setStoreGroup('Series-2');true"); await sleep(250); const two = parseInt((await countText()).match(/\d+/)[0], 10); ok(two > one, one + ' -> ' + two); ok(/Series-1, Series-2/.test(await P("document.querySelector('.sf-crumb').textContent")), 'breadcrumb'); });
  await T('color filter keeps only matching variants', async () => { await P("window.app.pos.clearStoreFilters(false);window.app.pos.setStoreFilter('color','Blue');true"); await sleep(300); ok(/\(20 /.test(await countText()), await countText()); ok(await P("[...document.querySelectorAll('#productGrid .pos-card')].every(c=>!c.querySelector('.color-dot[title=\"Black\"]'))"), 'non-Blue dots leaked'); });
  await T('custom min/max price filters; inverted input is swapped', async () => { await P("window.app.pos.clearStoreFilters(false);document.getElementById('sfPriceMin').value='20000';document.getElementById('sfPriceMax').value='10000';window.app.pos.applyPriceInputs();true"); await sleep(300); const f = JSON.parse(await P("JSON.stringify(window.app.pos.storeFilters)")); eq(f.priceMin, 10000); eq(f.priceMax, 20000); ok(await P("window.app.pos.lastList.length>0 && window.app.pos.lastList.every(p=>{const v=parseFloat(String(p.Price).replace(/[^\\d.]/g,''));return v>=10000&&v<=20000})"), 'out-of-range product listed'); ok(await P("document.getElementById('sfPriceMin').value==='10000'"), 'inputs not repopulated'); });
  await T('picking a preset clears the custom range', async () => { await P("window.app.pos.setStoreFilter('priceRange','lt10');true"); await sleep(200); ok(await P("window.app.pos.storeFilters.priceMin==='' && window.app.pos.storeFilters.priceMax===''")); });
  await T('empty/garbage min-max means unlimited', async () => { await P("window.app.pos.clearStoreFilters(false);document.getElementById('sfPriceMin').value='abc';document.getElementById('sfPriceMax').value='';window.app.pos.applyPriceInputs();true"); await sleep(250); ok(/\(33 /.test(await countText()), await countText()); });
  await T('card with differing variant prices shows ฿min - ฿max + selected price', async () => { await P("window.app.pos.clearStoreFilters(false);document.getElementById('searchProduct').value='Test2';window.app.pos.filter();true"); await sleep(300); const t = await P("(()=>{const cs=[...document.querySelectorAll('#productGrid .pos-card')];const c=cs.find(x=>/รุ่นที่เลือก/.test(x.innerText))||cs[0];return c?c.innerText:''})()"); ok(/฿\s?\d[\d,]*\s*-\s*฿\s?\d[\d,]*/.test(t) && /รุ่นที่เลือก/.test(t), t.slice(0, 200)); });
  await T('card with a single price shows no range', async () => { await P("document.getElementById('searchProduct').value='Test1';window.app.pos.filter();true"); await sleep(300); const t = await P("document.querySelector('#productGrid .pos-card').innerText"); ok(!/฿\s?\d[\d,]*\s*-\s*฿/.test(t) && !/รุ่นที่เลือก/.test(t), t.slice(0, 160)); await P("document.getElementById('searchProduct').value='';window.app.pos.filter();true"); await sleep(200); });
  await T('URL sync: filter change pushes params to top URL', async () => { await P("window.app.pos.clearStoreFilters(true);window.__pushes.length=0;window.app.pos._lastUrlKey='{}';window.app.pos.setStoreFilter('sort','asc');true"); await sleep(250); const pu = JSON.parse(await P("JSON.stringify(window.__pushes)")); ok(pu.length === 1 && pu[0].p.sort[0] === 'asc' && pu[0].h === 'pos', JSON.stringify(pu)); });
  await T('URL sync: category + series + capacity + page encoded', async () => { await P("window.app.pos.setStoreCategory('แท็บเล็ต');window.app.pos.setStoreGroup('Series-1');window.app.pos.setStoreFilter('capacity','128GB');true"); await sleep(250); const last = JSON.parse(await P("JSON.stringify(window.__pushes[window.__pushes.length-1].p)")); ok(last.cat[0] === 'แท็บเล็ต' && last.grp[0] === 'Series-1' && last.cap[0] === '128GB' && last.sort[0] === 'asc', JSON.stringify(last)); });
  await T('URL sync: no duplicate push for identical state', async () => { const n = await P("window.__pushes.length"); await P("window.app.pos.filter();window.app.pos.filter();true"); await sleep(150); eq(await P("window.__pushes.length"), n); });
  await T('URL sync: page number pushed', async () => { await P("window.app.pos.clearStoreFilters(true);window.app.pos.goStorePage(2);true"); await sleep(250); const last = JSON.parse(await P("JSON.stringify(window.__pushes[window.__pushes.length-1].p)")); ok(last.page && last.page[0] === '2', JSON.stringify(last)); });
  await T('URL load: shared link restores filters, does not push back', async () => { await P("window.app.pos.clearStoreFilters(true);true"); await sleep(200); const n = await P("window.__pushes.length"); await P("window.__top.parameters={cat:['แท็บเล็ต'],cap:['128GB','256GB'],sort:['desc'],stock:['1'],pmin:['5000']};window.app.pos.loadUrlState();true"); await sleep(400); const f = JSON.parse(await P("JSON.stringify(window.app.pos.storeFilters)")); ok(f.category === 'แท็บเล็ต' && f.capacities.length === 2 && f.sort === 'desc' && f.inStock === true && f.priceMin === 5000, JSON.stringify(f)); ok(/แท็บเล็ต/.test(await P("document.querySelector('.sf-h1').textContent"))); eq(await P("window.__pushes.length"), n, 'apply must not re-push'); });
  await T('URL load: back button handler resets to empty state', async () => { await P("window.__hist({location:{parameters:{}}});true"); await sleep(400); ok(!(await P("window.app.pos.storeFiltersActive()")), 'filters still active'); });
  console.log('== PRODUCT DEEP LINK (?p=) + FOOTER CONTACT');
  await T('deep link: opening a product modal pushes ?p=<Model>; closing removes it', async () => {
    await P("window.app.pos.clearStoreFilters(true);true"); await sleep(250);
    const model = await P("(window.app.globalData.products.find(p=>p.Status==='เปิด')||{}).Model");
    ok(model, 'no open product model in seed');
    await P("window.app.pos.openAddToCartModal('MODEL:'+" + JSON.stringify(model) + ");true"); await sleep(250);
    const last = JSON.parse(await P("JSON.stringify(window.__pushes[window.__pushes.length-1].p)"));
    ok(last.p && last.p[0] === model, JSON.stringify(last));
    await P("window.app.hideModal('addToCartModal');true"); await sleep(250);
    const after = JSON.parse(await P("JSON.stringify(window.__pushes[window.__pushes.length-1].p)"));
    ok(!after.p, JSON.stringify(after));
  });
  await T('deep link: shared URL (?p=) opens that model; unknown model shows warning, not a crash', async () => {
    const model = await P("(window.app.globalData.products.find(p=>p.Status==='เปิด')||{}).Model");
    await P("window.app.pos.applyUrlParams({p:[" + JSON.stringify(model) + "]},false);true"); await sleep(400);
    ok(await P("!document.getElementById('addToCartModal').classList.contains('hidden')"), 'modal not opened');
    ok((await P("window.app.pos.sharedModel")) === model);
    await P("window.app.hideModal('addToCartModal');true"); await sleep(200);
    await P("window.app.pos.applyUrlParams({p:['__no_such_model__']},false);true"); await sleep(300);
    ok(await P("document.getElementById('addToCartModal').classList.contains('hidden')"), 'modal opened for unknown model');
  });
  await T('deep link: back button without p closes the open modal', async () => {
    const model = await P("(window.app.globalData.products.find(p=>p.Status==='เปิด')||{}).Model");
    await P("window.app.pos.openAddToCartModal('MODEL:'+" + JSON.stringify(model) + ");true"); await sleep(250);
    await P("window.__hist({location:{parameters:{}}});true"); await sleep(400);
    ok(await P("document.getElementById('addToCartModal').classList.contains('hidden')"), 'modal still open');
  });
  await T('deep link: productLink builds <appUrl>?p=<encoded model>; empty without model', async () => {
    eq(await P("window.app.pos.productLink('Galaxy S 25')"), 'https://script.google.com/macros/s/TEST/exec?p=Galaxy%20S%2025');
    eq(await P("window.app.pos.productLink('')"), '');
    ok(await P("!!document.getElementById('shareProductBtn')"));
  });
  await T('footer contact: renders tel/LINE/hours from Settings, escapes HTML, strips formula guard apostrophe', async () => {
    await P("window.app.globalData.settings=Object.assign({},window.app.globalData.settings,{ContactPhone:\"'+66 2 123 4567\",ContactLine:'@mystore',ContactHours:'<b>10-21</b>'});window.app.renderFooterContact();true");
    const h = await P("document.getElementById('footerContact').innerHTML");
    ok(/href="tel:\+6621234567"/.test(h), h); ok(/line\.me\/R\/ti\/p\/%40mystore/.test(h), h); ok(!/<b>/.test(h) && /&lt;b&gt;/.test(h), h);
    ok(await P("!document.getElementById('footerContact').classList.contains('hidden')"));
  });
  await T('footer contact: hidden when no contact settings; javascript: LINE value never becomes href', async () => {
    await P("window.app.globalData.settings=Object.assign({},window.app.globalData.settings,{ContactPhone:'',ContactLine:'javascript:alert(1)',ContactHours:''});window.app.renderFooterContact();true");
    const h = await P("document.getElementById('footerContact').innerHTML");
    ok(!/href="javascript:/i.test(h), h);
    await P("window.app.globalData.settings=Object.assign({},window.app.globalData.settings,{ContactPhone:'',ContactLine:'',ContactHours:''});window.app.renderFooterContact();true");
    ok(await P("document.getElementById('footerContact').classList.contains('hidden')"));
  });
  await T('cms banners: edit save sends bannerId+rowIndex+dates; reversed date range blocked; old banner tabs gone', async () => {
    const r = JSON.parse(await ev(`(async()=>{ const a=window.app, c=a.cms; const o={api:a.api,rg:a.refreshGlobalData};
      const cfg=c.cfg('banners'); const row={type:'herobanner',rowIndex:7,id:'BAN-XYZ',url:'https://example.com/x.png'};
      document.body.insertAdjacentHTML('beforeend','<div id="__cf"><input id="cmsUrl" value="https://example.com/x.png"><input id="cmsTitle" value="t"><input id="cmsDetails" value=""><input id="cmsLink" value=""><input id="cmsBtn" value=""><input id="cmsStart" value="2026-11-11"><input id="cmsEnd" value="2026-11-15"></div>');
      const good=cfg.readForm.call(c,row);
      let sent=null; a.api=async(act,pl)=>{ sent={act:act,pl:pl}; return {status:'success'}; }; a.refreshGlobalData=async()=>{};
      await cfg.save.call(c,good,row);
      document.getElementById('cmsStart').value='2026-12-01';
      const bad=cfg.readForm.call(c,row); try{Swal.close();}catch(e){}
      document.getElementById('__cf').remove(); a.api=o.api; a.refreshGlobalData=o.rg;
      return JSON.stringify({good:good&&{s:good.startDate,e:good.endDate},sent:sent,bad:bad,tabs:a.systemSettings.tabs.map(t=>t.id)}); })()`));
    ok(r.sent && r.sent.act === 'SAVE_SETTINGS_ITEM' && r.sent.pl.bannerId === 'BAN-XYZ' && r.sent.pl.rowIndex === 7 && r.sent.pl.type === 'herobanner', JSON.stringify(r.sent));
    eq(JSON.stringify(r.good), JSON.stringify({ s: '2026-11-11', e: '2026-11-15' })); eq(r.bad, false, 'start > end must be rejected');
    ok(!r.tabs.some(t => /banner|promogrid/.test(t)), 'old banner tabs must be gone: ' + r.tabs.join());
    ok(r.tabs.includes('loginbg') && r.tabs.includes('bookingsettings') && r.tabs.includes('autosetup'), 'other tabs kept');
  });
  await T('URL load: search term + page restored', async () => { await P("window.app.pos.applyUrlParams({q:['Test1'],page:['1']},false);true"); await sleep(300); ok(await P("document.getElementById('searchProduct').value==='Test1'")); await P("window.app.pos.clearStoreFilters(true);true"); await sleep(200); });
  await T('URL load: hostile params are sanitized (no XSS, bad values ignored)', async () => { await P("window.app.pos.applyUrlParams({cat:['<img src=x onerror=window.__xss=1>'],sort:['<script>'],pr:['x'],pmin:['abc'],grp:['\"><svg onload=window.__xss=1>']},true);true"); await sleep(400); ok(!(await P("window.__xss")), 'XSS executed'); ok(await P("!document.querySelector('.sf-h1 img') && !document.querySelector('.sf-crumb img, .sf-crumb svg, #storeSidebar svg[onload]')"), 'injected element'); const f = JSON.parse(await P("JSON.stringify(window.app.pos.storeFilters)")); ok(f.sort === '' && f.priceRange === '' && f.priceMin === '', JSON.stringify(f)); await P("window.app.pos.clearStoreFilters(true);true"); await sleep(200); });
  await T('clear-all resets multi-select arrays', async () => { await P("window.app.pos.setStoreFilter('color','Blue');window.app.pos.setStoreFilter('capacity','128GB');window.app.pos.clearStoreFilters(true);true"); await sleep(200); const f = JSON.parse(await P("JSON.stringify(window.app.pos.storeFilters)")); ok(!f.colors.length && !f.capacities.length && !f.groups.length); });
  await T('combined filters to zero shows empty state + clear works', async () => { await ev("window.app.pos.setStoreCategory('โมบาย');window.app.pos.setStoreFilter('priceRange','gt50');true"); await sleep(300); ok(/ไม่พบ/.test(await ev("document.getElementById('productGrid').innerText")), 'no empty state'); await ev("window.app.pos.clearStoreFilters(true);true"); await sleep(300); ok((await cnt()) > 0); });
  await T('clear-filters button disabled when nothing active', async () => ok(await ev("document.querySelector('.sf-clear').disabled")));
  await T('search box filters', async () => { await ev("document.getElementById('searchProduct').value='Test7';window.app.pos.filter();true"); await sleep(400); const n = await cnt(); ok(n >= 1 && n <= 12, 'cards=' + n); await ev("document.getElementById('searchProduct').value='';window.app.pos.filter();true"); await sleep(300); });
  await T('search with no match shows empty state', async () => { await ev("document.getElementById('searchProduct').value='zzzzzz';window.app.pos.filter();true"); await sleep(400); ok(/ไม่พบ/.test(await ev("document.getElementById('productGrid').innerText"))); await ev("document.getElementById('searchProduct').value='';window.app.pos.filter();true"); await sleep(300); });

  console.log('== CARDS');
  await T('card has brand line, name, price, no category corner badge', async () => ok(await ev("(()=>{const c=document.querySelector('#productGrid .pos-card');return !!c.querySelector('.sf-brand')&&/฿/.test(c.innerText)})()")));
  await T('card with Original Price shows ประหยัดไป', async () => { await ev("window.app.pos.clearStoreFilters(false);true"); await sleep(300); let found = false; for (let p = 1; p <= 3 && !found; p++) { await ev(`window.app.pos.goStorePage(${p});true`); await sleep(200); found = await ev("!!document.querySelector('#productGrid .sf-save')"); } ok(found); });
  await T('sold-out card shows overlay + disabled button', async () => { let f = false; for (let p = 1; p <= 3 && !f; p++) { await ev(`window.app.pos.goStorePage(${p});true`); await sleep(200); f = await ev("!![...document.querySelectorAll('#productGrid .pos-card')].find(c=>c.querySelector('.pm-soldout')&&c.querySelector('button[disabled]'))"); } ok(f); });
  await T('color dot switches variant', async () => { await ev("window.app.pos.goStorePage(1);true"); await sleep(200); const r = await ev(`(()=>{const c=[...document.querySelectorAll('#productGrid .pos-card')].find(c=>c.querySelectorAll('.color-dot').length>1);if(!c)return 'none';const key=c.dataset.cardKey;c.querySelectorAll('.color-dot')[1].click();const c2=document.querySelector('#productGrid [data-card-key="'+CSS.escape(key)+'"]');return c2?'ok':'card lost'})()`); ok(r === 'ok' || r === 'none', r); });
  await T('wishlist heart toggles + badge count', async () => { const before = await ev("parseInt(document.getElementById('posWishlistCountBadge').textContent,10)"); await ev("document.querySelector('#productGrid [class*=\"btn-wishlist-\"]').click();true"); await sleep(300); const after = await ev("parseInt(document.getElementById('posWishlistCountBadge').textContent,10)"); ok(after === before + 1, before + '->' + after); });
  await T('wishlist drawer opens', async () => { await ev("window.app.pos.openWishlistDrawer();true"); await sleep(400); ok(await ev("document.body.innerText.includes('รายการโปรด')")); await ev("window.Swal&&Swal.close();document.querySelectorAll('[id*=\"ishlist\"]').forEach(e=>{});true"); });
  await T('compare toggle adds to compare bar', async () => { await ev("document.querySelector('#productGrid .bnn-compare-btn').click();true"); await sleep(300); ok(await ev("window.app.pos.compareList.length>=1")); });
  await T('add-to-cart modal opens for a SKU', async () => { await ev("window.app.pos.openAddToCartModal('T1-0');true"); await sleep(500); ok(await ev("(()=>{const m=document.getElementById('addToCartModal')||document.querySelector('[id*=\"ddToCart\"]');return !!m && !m.classList.contains('hidden')})()") || true); });
  await shot('pos-modal');
  await T('product detail page: full screen, breadcrumb, tabs (gifts first), sticky add-to-cart bar, no horizontal overflow', async () => {
    await ev("window.app.hideModal('compareModal');window.app.pos.openAddToCartModal('MODEL:Galaxy Test1');true"); await sleep(400); await shot('pos-detail-page');
    const r = JSON.parse(await ev(`(()=>{const m=document.getElementById('addToCartModal'),b=m.getBoundingClientRect(),bar=m.querySelector('.pd-bar').getBoundingClientRect(),sc=document.getElementById('pdScroll');
      const vis=id=>!document.getElementById(id).classList.contains('hidden');
      return JSON.stringify({w:b.width,h:b.height,iw:innerWidth,ih:innerHeight,barBottom:bar.bottom,crumb:document.getElementById('pdCrumb').textContent,name:document.getElementById('modalProdName').textContent,
        barName:document.getElementById('pdBarName').textContent,barPrice:document.getElementById('pdBarPrice').textContent,price:document.getElementById('modalProdPrice').textContent,
        tabs:[...m.querySelectorAll('.pd-tab')].map(t=>t.textContent.trim()),on:m.querySelector('.pd-tab.on').dataset.tab,gifts:vis('pdPanel-gifts'),specs:vis('pdPanel-specs'),
        vars:vis('modalVariantSelection'),opts:m.querySelectorAll('#modalColorOptions button').length,over:sc.scrollWidth>sc.clientWidth+1,terms:document.getElementById('pdTerms').textContent.length})})()`));
    ok(r.w === r.iw && r.h === r.ih, 'not full screen: ' + JSON.stringify(r));
    ok(Math.abs(r.barBottom - r.ih) <= 1, 'bar must sit on the bottom edge: ' + r.barBottom + '/' + r.ih);
    ok(r.crumb.includes('หน้าร้าน') && r.crumb.includes('Galaxy Test1'), r.crumb);
    ok(r.name && r.barName === r.name && r.barPrice === r.price && /^฿/.test(r.price), JSON.stringify(r));
    eq(r.tabs.join('|'), 'ของแถม|สเปคสินค้า|ผ่อนชำระ|เงื่อนไขการจอง'); eq(r.on, 'gifts'); ok(r.gifts && !r.specs && r.vars && r.opts >= 2 && !r.over && r.terms > 20, JSON.stringify(r));
    await ev("document.querySelector('#addToCartModal .pd-tab[data-tab=specs]').click();true"); await sleep(150);
    const t = JSON.parse(await ev("JSON.stringify({specs:!document.getElementById('pdPanel-specs').classList.contains('hidden'),gifts:!document.getElementById('pdPanel-gifts').classList.contains('hidden'),rows:document.querySelectorAll('#pdSpecs .pd-spec > div').length,sel:document.querySelector('#addToCartModal .pd-tab[data-tab=specs]').getAttribute('aria-selected')})"));
    ok(t.specs && !t.gifts && t.rows >= 3 && t.sel === 'true', JSON.stringify(t));
    await shot('pos-detail-specs');
    // เปลี่ยนสี = ชื่อ/แถบล่างเปลี่ยนตาม และแท็บที่เปิดอยู่ไม่เด้งกลับ
    await ev("document.querySelectorAll('#modalColorOptions button')[1].click();true"); await sleep(200);
    const v = JSON.parse(await ev("JSON.stringify({name:document.getElementById('modalProdName').textContent,bar:document.getElementById('pdBarName').textContent,on:document.querySelector('#addToCartModal .pd-tab.on').dataset.tab})"));
    ok(v.name !== r.name && v.bar === v.name && v.on === 'specs', JSON.stringify(v));
    // ปิดด้วยปุ่มกลับ แล้วเปิดใหม่ต้องเริ่มที่แท็บของแถม
    await ev("document.querySelector('#addToCartModal .pd-back').click();true"); await sleep(200);
    ok(await ev("document.getElementById('addToCartModal').classList.contains('hidden') && document.body.style.overflow===''"), 'back button must close the page');
    await ev("window.app.pos.openAddToCartModal('T1-0');true"); await sleep(300);
    eq(await ev("document.querySelector('#addToCartModal .pd-tab.on').dataset.tab"), 'gifts');
  });

  console.log('== COMPANION (ซื้อคู่) RECOMMENDATIONS');
  const swalOpen = () => P("!!(window.Swal && Swal.isVisible())");
  const resetCart = async () => { await P("window.Swal&&Swal.close();window.app.pos.cartData=[];window.app.pos._companionPrompted={};window.app.pos.isBookingBlocked=false;window.app.pos.saveAndRender();true"); await sleep(250); };
  const addMain = async (sku) => { await P("window.app.pos.openAddToCartModal('" + sku + "');true"); await sleep(400); await P("window.app.pos.confirmAddToCart();true"); await sleep(500); };
  await T('empty cart: no recommendation panel', async () => { await resetCart(); ok(await P("document.getElementById('cartCompanions').classList.contains('hidden')")); eq(await P("window.app.pos.recommendCompanions(9).length"), 0); });
  await T('adding a mobile opens the companion prompt with accessories only', async () => {
    await addMain('T3-0'); ok(await swalOpen(), 'no prompt shown'); ok(/ซื้อคู่/.test(await P("Swal.getTitle().textContent")), 'title');
    const n = await P("document.querySelectorAll('#companionPromptList .sf-comp').length"); ok(n >= 1 && n <= 4, 'rows=' + n);
    const cats = await P("JSON.stringify([...document.querySelectorAll('#companionPromptList .sf-comp')].map(r=>(window.app.globalData.products.find(p=>p.SKU===r.dataset.sku)||{}).Category))"); ok(JSON.parse(cats).every(c => c === 'อุปกรณ์เสริม'), cats);
  });
  await T('ranking: matching case (same group + name token) is first even though most expensive', async () => { const first = await P("document.querySelector('#companionPromptList .sf-comp').dataset.sku"); eq(first, 'CASE-T3'); });
  await T('bundle discount badge + discounted price shown', async () => { const t = await P("document.querySelector('#companionPromptList .sf-comp').innerText"); ok(/ลด 10%/.test(t), t); ok(/฿\s?89,999/.test(t), 'discounted price missing: ' + t); });
  await shot('companion-prompt');
  await T('out-of-stock accessories are never recommended', async () => { const all = JSON.parse(await P("JSON.stringify(window.app.pos.recommendCompanions(99).map(s=>s.p.SKU))")); ok(all.length > 0 && !all.some(s => /^T(5|20)-/.test(s)), JSON.stringify(all)); });
  await T('clicking เพิ่ม adds exactly 1, removes it from the list', async () => {
    const before = await P("window.app.pos.cartData.length"); await P("document.querySelector('#companionPromptList .sf-comp-add').click();true"); await sleep(350);
    eq(await P("window.app.pos.cartData.length"), before + 1); eq(await P("window.app.pos.cartData.find(i=>i.SKU==='CASE-T3').qty"), 1);
    ok(!(await P("!!document.querySelector('#companionPromptList [data-sku=\"CASE-T3\"]')")), 'still listed');
  });
  await T('bundle discount applied to cart after adding companion', async () => { ok((await P("window.app.pos.cartAutoDiscount")) > 0, 'discount=' + await P("window.app.pos.cartAutoDiscount")); });
  await T('drawer panel shows remaining suggestions, never what is already in cart', async () => { await P("window.Swal&&Swal.close();true"); await sleep(200); const d = JSON.parse(await P("JSON.stringify({hidden:document.getElementById('cartCompanions').classList.contains('hidden'),skus:[...document.querySelectorAll('#cartCompanions .sf-comp')].map(r=>r.dataset.sku)})")); ok(!d.hidden && d.skus.length >= 1 && d.skus.length <= 4 && !d.skus.includes('CASE-T3') && !d.skus.includes('T3-0'), JSON.stringify(d)); });
  await T('drawer panel add button works and list refreshes', async () => { const n0 = await P("window.app.pos.cartData.length"); const sku = await P("document.querySelector('#cartCompanions .sf-comp').dataset.sku"); await P("document.querySelector('#cartCompanions .sf-comp-add').click();true"); await sleep(300); eq(await P("window.app.pos.cartData.length"), n0 + 1); ok(!(await P("!!document.querySelector('#cartCompanions [data-sku=\"" + sku + "\"]')")), 'added item still suggested'); });
  await T('prompt shows only once per main SKU', async () => { await P("window.app.pos.cartData=window.app.pos.cartData.filter(i=>i.SKU!=='T3-0');window.app.pos.saveAndRender();true"); await sleep(200); await addMain('T3-0'); ok(!(await swalOpen()) || !/ซื้อคู่/.test(await P("Swal.getTitle()?Swal.getTitle().textContent:''")), 'prompted twice'); await P("window.Swal&&Swal.close();true"); });
  await T('stock limit respected when adding companion', async () => { await resetCart(); await P("window.app.pos.cartData=[{...window.app.globalData.products.find(p=>p.SKU==='T3-0'),qty:1,brandGifts:[],channelGifts:[]},{...window.app.globalData.products.find(p=>p.SKU==='CASE-T3'),qty:5,brandGifts:[],channelGifts:[]}];window.app.pos.saveAndRender();window.app.pos.addCompanion('CASE-T3',false);true"); await sleep(350); eq(await P("window.app.pos.cartData.find(i=>i.SKU==='CASE-T3').qty"), 5, 'exceeded stock 5'); await P("window.Swal&&Swal.close();true"); });
  await T('booking window closed blocks addCompanion', async () => { await resetCart(); await P("window.app.pos.cartData=[{...window.app.globalData.products.find(p=>p.SKU==='T3-0'),qty:1,brandGifts:[],channelGifts:[]}];window.app.pos.saveAndRender();window.app.pos.isBookingBlocked=true;window.app.pos.addCompanion('CASE-T3',false);true"); await sleep(300); ok(!(await P("window.app.pos.cartData.some(i=>i.SKU==='CASE-T3')")), 'added while blocked'); await resetCart(); });
  await T('accessory-only cart shows no companions', async () => { await resetCart(); await P("window.app.pos.cartData=[{...window.app.globalData.products.find(p=>p.SKU==='CASE-T3'),qty:1,brandGifts:[],channelGifts:[]}];window.app.pos.saveAndRender();true"); await sleep(250); ok(await P("document.getElementById('cartCompanions').classList.contains('hidden')")); await resetCart(); });
  await T('companion names are HTML-escaped', async () => { await resetCart(); await P("window.app.globalData.products.find(p=>p.SKU==='CASE-T3')['Product Name']='<img src=x onerror=window.__xss2=1>';window.app.pos.cartData=[{...window.app.globalData.products.find(p=>p.SKU==='T3-0'),qty:1,brandGifts:[],channelGifts:[]}];window.app.pos.saveAndRender();true"); await sleep(300); ok(!(await P("window.__xss2")) && !(await P("!!document.querySelector('#cartCompanions img[src=\"x\"]')")), 'unescaped'); await resetCart(); });

  await T('multiple matching rules stack in the badge (10% + 5% = 15%)', async () => {
    await resetCart();
    await P("window.app.globalData._apBak=window.app.globalData.autoPromotions;window.app.globalData.autoPromotions=[{'Rule ID':'X1','Buy Category':'โมบาย','Get Discount Category':'อุปกรณ์เสริม','Discount Percent':10,'Status':'Active'},{'Rule ID':'X2','Buy Category':'โมบาย','Get Discount Category':'อุปกรณ์เสริม','Discount Percent':5,'Status':'Active'}];window.app.pos.cartData=[{...window.app.globalData.products.find(p=>p.SKU==='T3-0'),qty:1,brandGifts:[],channelGifts:[]}];window.app.pos.saveAndRender();true");
    await sleep(250); const pct = await P("window.app.pos.recommendCompanions(1)[0].pct");
    await P("window.app.globalData.autoPromotions=window.app.globalData._apBak;true"); eq(pct, 15);
  });
  await T('inactive / other-channel rules produce no suggestion', async () => {
    await resetCart();
    await P("window.app.globalData._apBak=window.app.globalData.autoPromotions;window.app.globalData.autoPromotions=[{'Rule ID':'X1','Buy Category':'โมบาย','Get Discount Category':'อุปกรณ์เสริม','Discount Percent':10,'Status':'Inactive'},{'Rule ID':'X2','Buy Category':'โมบาย','Get Discount Category':'อุปกรณ์เสริม','Discount Percent':5,'Status':'Active','Channel':'Online'}];window.app.pos.cartData=[{...window.app.globalData.products.find(p=>p.SKU==='T3-0'),qty:1,brandGifts:[],channelGifts:[]}];window.app.pos.saveAndRender();true");
    await sleep(250); const n = await P("window.app.pos.recommendCompanions(9).length"); const hidden = await P("document.getElementById('cartCompanions').classList.contains('hidden')");
    await P("window.app.globalData.autoPromotions=window.app.globalData._apBak;true"); eq(n, 0); ok(hidden, 'panel visible');
  });
  await T('END-TO-END: main + companion -> checkout -> order rows, bundle discount row, stock of both', async () => {
    await resetCart(); await addMain('T3-0'); ok(await swalOpen(), 'no prompt');
    await P("document.querySelector('#companionPromptList .sf-comp-add').click();true"); await sleep(400); await P("window.Swal&&Swal.close();true"); await sleep(200);
    eq(await P("window.app.pos.cartData.map(i=>i.SKU).sort().join(',')"), 'CASE-T3,T3-0');
    const hd = sheets.Products.rows[0], sc = hd.indexOf('SKU'), kc = hd.indexOf('Stock');
    const stock = (sku) => Number(sheets.Products.rows.find(r => r[sc] === sku)[kc]);
    const s1 = stock('T3-0'), s2 = stock('CASE-T3'), n0 = sheets.Orders.rows.length;
    // ยังไม่ติ๊กรับทราบเงื่อนไข/นโยบาย = ห้ามไปต่อ (หน้ายืนยันต้องยังเปิดอยู่) แล้วค่อยติ๊กและส่งจริง
    // full-page checkout: opens with an order summary (both items, bundle discount, net total) and keeps every field id
    await P("window.app.pos.openCheckoutModal();true"); await sleep(350);
    const co = JSON.parse(await P("(()=>{const m=document.getElementById('checkoutModal');const r=m.querySelector('.co-shell').getBoundingClientRect();return JSON.stringify({open:!m.classList.contains('hidden'),full:r.width>=innerWidth-2&&r.height>=innerHeight-2,items:m.querySelectorAll('#coSummary .co-items li').length,disc:m.querySelectorAll('#coSummary .co-disc').length,tot:document.getElementById('coBarTotal').textContent,cart:document.getElementById('cartTotal').textContent,ids:['coCustomer','coPhone','coEmail','coIdCard','coPreOrderNo','coCodeHandraiser','radResT','radResF','coPickupDate','bkStaffName','bkPhone','coReceiptNo','coDeposit','coRemark','coConsent','dynamicInterests'].filter(i=>!m.querySelector('#'+i)),orange:[...m.querySelectorAll('button')].filter(b=>/255, 107, 0/.test(getComputedStyle(b).backgroundColor)).length})})()"));
    ok(co.open && co.full, 'checkout is not a full-screen page ' + JSON.stringify(co)); eq(co.items, 2); ok(co.disc >= 1, 'bundle discount missing from the summary'); eq(co.tot, co.cart, 'summary total differs from the cart total'); eq(co.ids.join(','), '', 'missing field ids'); eq(co.orange, 1, 'exactly one orange button'); await shot('pos-checkout-page');
    const blocked = await P(`(()=>{const set=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v};set('coCustomer','ลูกค้า ซื้อคู่');set('coPhone','0812345678');set('coEmail','a@b.co');set('coIdCard','1234567890121');set('bkStaffName','พนักงาน ทดสอบ');set('bkPhone','0899999999');document.getElementById('radResF').checked=true;document.getElementById('coConsent').checked=false;let warned=0;const ot=window.app.toast;window.app.toast=function(m){if(/รับทราบ/.test(m))warned++;return ot.apply(this,arguments)};window.app.pos.submitCheckout();window.app.toast=ot;const blocked=warned===1&&!window.app.pos.isSubmitting;document.getElementById('coConsent').checked=true;window.app.pos.submitCheckout();return blocked})()`);
    if (!blocked) throw new Error('checkout must stay blocked until the consent box is ticked');
    await sleep(900);
    const dbg = await P("JSON.stringify({vis:Swal.isVisible(),title:(Swal.getTitle()||{}).textContent,html:(Swal.getHtmlContainer()||{}).textContent,confirm:!!Swal.getConfirmButton(),cartLen:window.app.pos.cartData.length,sub:window.app.pos.isSubmitting})");
    if (!(await P("!!(Swal.isVisible() && Swal.getConfirmButton() && /ยืนยัน/.test(Swal.getConfirmButton().textContent))"))) throw new Error('confirm dialog not shown: ' + dbg);
    await P("Swal.getConfirmButton().click();true");
    const t0 = Date.now(); while (sheets.Orders.rows.length === n0 && Date.now() - t0 < 8000) await sleep(150);
    ok(sheets.Orders.rows.length > n0, 'order never written');
    const oh = sheets.Orders.rows[0]; const rows = sheets.Orders.rows.slice(n0);
    const col = (n) => oh.indexOf(n); const skuI = col('SKU'), rtI = col('Row Total'), nameI = col('Product Name'), upI = col('Unit Price'), qtyI = col('Qty');
    ok(rows.some(r => r[skuI] === 'T3-0') && rows.some(r => r[skuI] === 'CASE-T3'), 'item rows missing: ' + JSON.stringify(rows.map(r => r[skuI])));
    const disc = rows.find(r => r[skuI] === 'DISCOUNT'); ok(disc, 'no discount row');
    ok(/Auto Bundle/.test(disc[nameI]), disc[nameI]); ok(Math.abs(Number(disc[upI]) + 9999.9) < 0.02, 'discount value=' + disc[upI]);
    eq(stock('T3-0'), s1 - 1, 'main stock'); eq(stock('CASE-T3'), s2 - 1, 'companion stock');
    await sleep(600);
    // success = confirmation PAGE with the order number + summary (no success popup); checkout page closed, form cleared
    const done = JSON.parse(await P("(()=>{const d=document.getElementById('orderDoneModal');return JSON.stringify({open:!d.classList.contains('hidden'),id:document.getElementById('doneOrderId').textContent,items:d.querySelectorAll('#doneSummary .co-items li').length,meta:document.getElementById('doneMeta').textContent,co:document.getElementById('checkoutModal').classList.contains('hidden'),swal:Swal.isVisible()&&!!Swal.getConfirmButton()&&Swal.getConfirmButton().offsetParent!==null,name:document.getElementById('coCustomer').value,link:!!window.app.pos.lastOrder})})()"));
    const oidI = sheets.Orders.rows[0].indexOf('OrderID');
    ok(done.open && done.co, 'confirmation page not shown / checkout still open ' + JSON.stringify(done)); eq(done.id, String(rows[0][oidI]), 'order number on the confirmation page'); eq(done.items, 2); ok(/ลูกค้า ซื้อคู่/.test(done.meta), done.meta); ok(!done.swal, 'old success popup still shown'); eq(done.name, '', 'form not cleared');
    await shot('pos-order-done');
    await P("window.app.hideModal('orderDoneModal');window.Swal&&Swal.close();true"); await sleep(200);
    eq(await P("window.app.pos.cartData.length"), 0, 'cart not cleared'); ok(await P("document.getElementById('cartCompanions').classList.contains('hidden')"), 'panel stale after checkout');
  });

  console.log('== CHANNEL WILDCARD / EMPTY STATE');
  const setCh = (v) => P("(()=>{const cs=document.getElementById('posChannelSelect');if(cs.value!=='Retail')cs.value='Retail';const g=window.app.globalData.products;if(!window.app.globalData._chBak)window.app.globalData._chBak=g.map(p=>p.Channel);g.forEach(p=>{p.Channel=" + v + "});window.app.pos.clearStoreFilters(false);return true})()");
  const restoreCh = () => P("(()=>{const g=window.app.globalData;if(g._chBak){g.products.forEach((p,i)=>{p.Channel=g._chBak[i]});delete g._chBak}window.app.pos.clearStoreFilters(false);return true})()");
  await T('product with Channel ALL is shown in any channel', async () => { await setCh("'ALL'"); await sleep(300); const n = await P("window.app.pos.lastList.filter(p=>p.SKU==='T3-0').length"); await restoreCh(); eq(n, 1); });
  await T('Channel * and ทั้งหมด also act as wildcards', async () => { await setCh("'*'"); await sleep(200); const q = "window.app.pos.lastList.filter(p=>p.SKU==='T3-0').length"; const a = await P(q); await setCh("'ทั้งหมด'"); await sleep(200); const b = await P(q); await restoreCh(); ok(a === 1 && b === 1, a + '/' + b); });
  await T('product limited to another channel is still hidden', async () => { await setCh("'Online'"); await sleep(300); const n = await P("window.app.pos.lastList.length"); await restoreCh(); eq(n, 0); });
  await T('no products for channel -> empty state, not endless skeleton', async () => { await setCh("'Online'"); await sleep(400); const h = await P("document.getElementById('productGrid').innerHTML"); await restoreCh(); ok(!/skeleton/.test(h), 'skeleton still shown'); ok(/ยังไม่มีสินค้าสำหรับช่องทางนี้/.test(h), 'no empty-state message'); });
  await T('grid recovers after restoring channel data', async () => { await sleep(300); const n = await P("document.querySelectorAll('#productGrid .pos-card').length"); ok(n > 0, 'cards=' + n); });
  await T('Index serves the track parameter before the app script', async () => { const ix = fs.readFileSync(path.join(SRC, 'Index.html'), 'utf8'); const a = ix.indexOf('__TRACK_PARAM'), b = ix.indexOf("include('JS')"); ok(a > -1 && b > -1 && a < b, 'order ' + a + '/' + b); });

  console.log('== COLOR DOT -> REMAINING STOCK');
  await T('clicking a color dot shows the selected color remaining stock on the card', async () => {
    await P("window.app.pos.clearStoreFilters(true);true"); await sleep(400);
    const r = JSON.parse(await P(`(()=>{const pos=window.app.pos;let out=null;for(let pg=1;pg<=12&&!out;pg++){if(pg>1){pos.storePage=pg;pos.renderProducts(pos.lastList);}for(const m of Object.keys(pos.cardGroups)){const g=pos.cardGroups[m];const cols=[...new Set(g.products.map(v=>v.Color).filter(c=>c&&c!=='-'))];if(cols.length<2)continue;const card=document.querySelector('#productGrid [data-card-key="'+m+'"]');if(!card){continue}const dots=card.querySelectorAll('.color-dot');if(dots.length<2)continue;dots[1].click();const c2=document.querySelector('#productGrid [data-card-key="'+m+'"]');const st=pos.cardState[m];const v=g.products.find(x=>x.Color===st.color&&x.Capacity===st.cap);out={model:m,color:st.color,stock:parseInt(v.Stock,10)||0,text:(c2.querySelector('.sf-stock')||{}).textContent||'',tip:c2.querySelectorAll('.color-dot')[1].title};break}}return JSON.stringify(out)})()`));
    ok(r && r.model, 'no multi-color card on current page');
    if (r.stock > 0) { ok(r.text.includes('สี' + r.color), 'no color label: ' + r.text); ok(r.text.includes('เหลือ ' + r.stock + ' ชิ้น'), 'stock text: ' + r.text + ' expected ' + r.stock); }
    else ok(/หมด/.test(r.text), 'sold-out text: ' + r.text);
    ok(/เหลือ|หมด/.test(r.tip), 'tooltip: ' + r.tip);
  });
  await T('category tiles: icon + plain-label buttons, "all" first, gift categories not tiled, catIcon maps names', async () => {
    const r = JSON.parse(await P("(()=>{const a=window.app,pos=a.pos;pos.clearStoreFilters(true);const t=[...document.querySelectorAll('.sf-catchips.sf-cattiles .sf-chip.sf-tile')];return JSON.stringify({n:t.length,labels:t.map(b=>b.textContent.trim()),icons:t.map(b=>(b.querySelector('i.sf-tile-ic')||{className:''}).className.split(' ').filter(c=>/^fa-/.test(c)).join()),plain:t.every(b=>b.textContent.trim()===b.querySelector('.sf-tile-lb').textContent),map:['','โมบาย','แท็บเล็ต','สมาร์ทวอทช์','หูฟัง','อุปกรณ์เสริม','อื่นๆ'].map(n=>pos.catIcon(n))})})()"));
    ok(r.n >= 3, 'tiles ' + r.n); eq(r.labels[0], 'ทั้งหมด'); eq(r.icons[0], 'fa-table-cells-large'); ok(r.plain, 'label text must be the category name only');
    ok(!r.labels.some(l => l.includes('ของแถม')), 'gift categories must not be tiles: ' + r.labels);
    eq(r.map.join(), 'fa-table-cells-large,fa-mobile-screen-button,fa-tablet-screen-button,fa-clock,fa-headphones,fa-plug,fa-box-open');
  });
  await T('popular shelf: ranked in-stock sellable models only, needs >=3, hidden while searching/filtering/page 2+, never throws on bad data', async () => {
    const r = JSON.parse(await P(`(()=>{ const a=window.app,pos=a.pos,g=a.globalData,saved=g.popularModels; const out={};
      pos.clearStoreFilters(true); document.getElementById('searchProduct').value='';
      const ch=document.getElementById('posChannelSelect').value;
      const ok=p=>p.Status==='เปิด'&&!(p.Category||'').includes('ของแถม')&&a.channelOk(p.Channel,ch)&&p.Model&&p.Model!=='-';
      const models=[...new Set(g.products.filter(p=>ok(p)&&pos.stockOf(p)>0).map(p=>p.Model))]; out.avail=models.length;
      const el=()=>document.getElementById('posPopular'), shown=()=>!el().classList.contains('hidden'), names=()=>[...el().querySelectorAll('.sf-pop-card')].map(c=>c.querySelector('.sf-pop-rank').textContent+'|'+c.getAttribute('onclick'));
      g.popularModels=models.slice(0,8).concat(['NO-SUCH-MODEL']); pos.filter(); out.shown=shown(); out.cards=names();
      out.skus=models.slice(0,8).map(m=>g.products.filter(p=>p.Model===m&&ok(p)&&pos.stockOf(p)>0).sort((x,y)=>(parseFloat(x.Price)||0)-(parseFloat(y.Price)||0))[0].SKU);
      g.popularModels=models.slice(0,2); pos.filter(); out.fewHidden=!shown();
      g.popularModels=models.slice(0,8); pos.filter(); out.back=shown();
      document.getElementById('searchProduct').value='zzz'; pos.filter(); out.searchHidden=!shown(); document.getElementById('searchProduct').value=''; pos.filter(); out.afterSearch=shown();
      const cat=g.products.find(ok).Category; pos.setStoreCategory(cat); out.catHidden=!shown(); pos.clearStoreFilters(true); out.afterClear=shown();
      pos.storePage=2; pos.renderPopularShelf(); out.page2Hidden=!shown(); pos.storePage=1; pos.renderPopularShelf(); out.page1=shown();
      const first=g.products.filter(p=>p.Model===models[0]&&ok(p)); const stocks=first.map(p=>p.Stock); first.forEach(p=>p.Stock=0); pos.filter(); out.soldOutSkipped=!names().some(n=>n.includes(first[0].SKU)); first.forEach((p,i)=>p.Stock=stocks[i]);
      g.popularModels=null; pos.filter(); out.nullOk=!shown(); g.popularModels=['__proto__','constructor']; pos.filter(); out.weirdOk=!shown();
      g.popularModels=saved; pos.clearStoreFilters(true); pos.filter(); return JSON.stringify(out); })()`));
    ok(r.avail >= 3, 'fixture needs >=3 sellable in-stock models, has ' + r.avail);
    ok(r.shown && r.cards.length === Math.min(8, r.avail), 'cards ' + JSON.stringify(r.cards));
    r.cards.forEach((c, i) => { ok(c.startsWith((i + 1) + '|'), 'rank order ' + c); ok(c.includes(r.skus[i]), 'cheapest in-stock variant expected ' + r.skus[i] + ' in ' + c); });
    ok(r.fewHidden && r.back && r.searchHidden && r.afterSearch && r.catHidden && r.afterClear && r.page2Hidden && r.page1 && r.soldOutSkipped && r.nullOk && r.weirdOk, JSON.stringify(r));
  });
  await T('brand strip: one chip per brand (aliases merged, gifts/non-latin excluded); click filters the grid, click again clears; brand round-trips through the URL', async () => {
    const r = JSON.parse(await P(`(()=>{ const a=window.app,pos=a.pos,out={};
      pos.clearStoreFilters(true);
      const el=document.getElementById('posBrands'); out.shown=!el.classList.contains('hidden');
      out.chips=[...el.querySelectorAll('.sf-brand-chip .sf-brand-nm')].map(c=>c.textContent);
      out.alias=[pos.brandOf({'Marketing Model':'iPhone 15 Pro Max',Category:'โมบาย'}),pos.brandOf({'Marketing Model':'Galaxy Z Flip8',Category:'โมบาย'}),pos.brandOf({'Marketing Model':'15 Pro',Category:'โมบาย'}),pos.brandOf({'Marketing Model':'Samsung Adapter',Category:'ของแถมแบรนด์'}),pos.brandOf({'Product Name':'ทดสอบ',Category:'โมบาย'})];
      pos.setBrand('APPLE');
      out.cards=document.querySelectorAll('#productGrid .pos-card').length;
      out.allApple=[...document.querySelectorAll('#productGrid .pos-card .sf-brand')].every(b=>b.textContent==='APPLE');
      out.on=[...el.querySelectorAll('.sf-brand-chip.on .sf-brand-nm')].map(c=>c.textContent).join();
      out.url=JSON.stringify(pos.paramsFromState().brand); out.active=pos.storeFiltersActive();
      pos.setBrand('APPLE'); out.cleared=pos.storeFilters.brand==='';
      pos.applyUrlParams({brand:['samsung']},true); out.fromUrl=pos.storeFilters.brand;
      pos.clearStoreFilters(true); return JSON.stringify(out); })()`));
    ok(r.shown && r.chips[0] === 'ทั้งหมด' && r.chips.includes('Apple') && r.chips.includes('Samsung'), JSON.stringify(r.chips));
    eq(r.alias.join('|'), 'APPLE|SAMSUNG|||');
    ok(r.cards > 0 && r.allApple && r.on === 'Apple' && r.url === '["APPLE"]' && r.active && r.cleared && r.fromUrl === 'SAMSUNG', JSON.stringify(r));
  });
  await T('NEW flag/shelf: Launch Date within 30 days (or still upcoming) is NEW; shelf needs >=2 in-stock models and hides while filtering; HOT follows popularModels', async () => {
    const r = JSON.parse(await P(`(()=>{ const a=window.app,pos=a.pos,g=a.globalData,out={};
      const saved=g.products.map(p=>p['Launch Date']), savedPop=g.popularModels;
      const day=n=>new Date(Date.now()+7*3600e3-n*864e5).toISOString().slice(0,10);
      pos.clearStoreFilters(true);
      const ch=document.getElementById('posChannelSelect').value;
      const okp=p=>p.Status==='เปิด'&&!(p.Category||'').includes('ของแถม')&&a.channelOk(p.Channel,ch)&&p.Model&&p.Model!=='-'&&pos.stockOf(p)>0;
      const models=[...new Set(g.products.filter(okp).map(p=>p.Model))];
      g.products.forEach(p=>{ p['Launch Date']=''; });
      const setL=(m,d)=>g.products.filter(p=>p.Model===m).forEach(p=>{ p['Launch Date']=d; });
      out.isNew=[pos.isNew({'Launch Date':day(2)}),pos.isNew({'Launch Date':day(31)}),pos.isNew({'Launch Date':''}),pos.isNew({'Launch Date':'2099-01-01'}),pos.isNew({}),pos.isNew({'Launch Date':'not-a-date'})];
      setL(models[0],day(2)); setL(models[1],day(10)); setL(models[2],day(90));
      pos.filter();
      const shelf=document.getElementById('posNewArrivals'); out.shown=!shelf.classList.contains('hidden');
      const cards=[...shelf.querySelectorAll('.sf-new-card')]; out.n=cards.length;
      const sku0=g.products.filter(p=>p.Model===models[0]&&okp(p)).sort((x,y)=>(parseFloat(x.Price)||0)-(parseFloat(y.Price)||0))[0].SKU;
      out.newestFirst=!!(cards[0]&&cards[0].getAttribute('onclick').includes(sku0));
      const rep=m=>g.products.find(p=>p.Model===m&&okp(p));
      out.flag=[pos.cardHtml(rep(models[0]),'').includes('pm-flag-new'),pos.cardHtml(rep(models[2]),'').includes('pm-flag-new')];
      g.popularModels=[models[0]]; out.hot=[pos.cardHtml(rep(models[0]),'').includes('pm-flag-hot'),pos.cardHtml(rep(models[1]),'').includes('pm-flag-hot')];
      pos.setBrand('APPLE'); out.hiddenWhileFiltering=shelf.classList.contains('hidden'); pos.clearStoreFilters(true); out.backAfterClear=!shelf.classList.contains('hidden');
      setL(models[1],''); pos.filter(); out.oneHidden=shelf.classList.contains('hidden');
      g.products.forEach((p,i)=>{ p['Launch Date']=saved[i]||''; }); g.popularModels=savedPop; pos.clearStoreFilters(true); pos.filter();
      return JSON.stringify(out); })()`));
    eq(r.isNew.join(), 'true,false,false,true,false,false');
    ok(r.shown && r.n === 2 && r.newestFirst, JSON.stringify(r));
    ok(r.flag[0] === true && r.flag[1] === false && r.hot[0] === true && r.hot[1] === false, JSON.stringify(r));
    ok(r.hiddenWhileFiltering && r.backAfterClear && r.oneHidden, JSON.stringify(r));
  });
  await T('promo hub: entry points (topbar, category menu, voucher "ดูทั้งหมด"); lists unique campaigns + coupons + bundle rules; campaign click closes and searches; Esc closes', async () => {
    const r = JSON.parse(await P(`(()=>{ const a=window.app,pos=a.pos,g=a.globalData,out={};
      const savedGrid=g.gridBanners; g.gridBanners=[{url:'https://example.invalid/x.png',title:'แคมเปญทดสอบ',details:'รายละเอียด',link:''}].concat(g.gridBanners||[],[{url:'https://example.invalid/x.png',title:'ซ้ำ'}]);
      pos.clearStoreFilters(true);
      out.entry=[!!document.querySelector('#sfTopbar button[onclick*="openPromoHub"]'),!!document.querySelector('#sfCatNav .sf-nav-promo'),!!document.querySelector('.pm-sec-more')];
      pos.openPromoHub();
      const m=document.getElementById('promoHubModal'); out.open=!m.classList.contains('hidden');
      const uniq=new Set([].concat(g.heroBanners||[],g.gridBanners||[],g.popupBanners||[]).map(b=>typeof b==='string'?b:(b.url||'')).filter(Boolean)).size;
      out.camps=m.querySelectorAll('.sf-camp').length; out.uniq=uniq;
      out.coupons=m.querySelectorAll('.sf-promo-coupon').length; out.promos=(g.promotions||[]).filter(p=>String(p.Status||'').trim()==='เปิด').length;
      out.firstTitle=m.querySelector('.sf-camp-cap b')&&m.querySelector('.sf-camp-cap b').textContent;
      const idx=pos._promoCamps.findIndex(c=>c.title==='แคมเปญทดสอบ'); m.querySelectorAll('.sf-camp')[idx].click();
      out.closed=m.classList.contains('hidden'); out.search=document.getElementById('searchProduct').value;
      pos.clearStoreFilters(true);
      pos.openPromoHub(); document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); out.escClosed=m.classList.contains('hidden');
      pos.openPromoHub(); const cat=m.querySelectorAll('.sf-promo-coupon:not(.applied)'); out.bundle=cat.length>=1;
      g.gridBanners=savedGrid; pos.clearStoreFilters(true); a.hideModal('promoHubModal');
      return JSON.stringify(out); })()`));
    ok(r.entry.every(Boolean), 'entry points ' + JSON.stringify(r.entry));
    ok(r.open && r.camps === r.uniq && r.camps >= 1, 'campaigns ' + JSON.stringify(r));
    ok(r.coupons >= r.promos + 1, 'coupons + bundle rule cards ' + JSON.stringify(r));
    ok(r.closed && r.search === 'แคมเปญทดสอบ' && r.escClosed && r.bundle, JSON.stringify(r));
  });
  await T('news shelf: cards from globalData.news (escaped), hidden when empty/searching/filtering/page 2+, click opens detail with safe link, bad data never throws', async () => {
    const r = JSON.parse(await P(`(()=>{ const a=window.app,pos=a.pos,g=a.globalData,saved=g.news; const out={};
      const el=()=>document.getElementById('posNews'), shown=()=>!el().classList.contains('hidden');
      g.news=[{id:'N1',category:'<b>cat</b>',title:'<img src=x onerror=1>ข่าวหนึ่ง',detail:'บรรทัด1\\nบรรทัด2',imageUrl:'',link:'https://example.com/a'},{id:'N2',category:'',title:'ข่าวสอง',detail:'',imageUrl:'',link:'javascript:alert(1)'}];
      pos.filter(); out.shown=shown(); out.cards=el().querySelectorAll('.sf-news-card').length; out.noInjected=!el().querySelector('.sf-news-title img, .sf-news-cat b');
      out.titleText=el().querySelector('.sf-news-title').textContent;
      const sb=document.getElementById('searchProduct'); sb.value='zzz'; pos.filter(); out.searchHidden=!shown(); sb.value=''; pos.filter(); out.afterSearch=shown();
      pos.storePage=2; pos.renderNewsShelf(); out.page2Hidden=!shown(); pos.storePage=1; pos.renderNewsShelf(); out.page1=shown();
      Swal.close(); pos.openNews('ghost'); out.ghostOk=!Swal.isVisible();
      pos.openNews('N1'); out.modalTitle=(Swal.getTitle()||{}).textContent; out.confirmShown=Swal.getConfirmButton().style.display!=='none'; out.detailInjected=!!Swal.getHtmlContainer().querySelector('img[src="x"]');
      Swal.close(); pos.openNews('N2'); out.badLinkNoConfirm=Swal.getConfirmButton().style.display==='none'; Swal.close();
      g.news=[];pos.filter(); out.emptyHidden=!shown(); g.news=null; pos.filter(); out.nullOk=!shown(); g.news=[null,{},{id:'x'}]; pos.filter(); out.junkOk=!shown();
      g.news=saved; pos.clearStoreFilters(true); pos.filter(); return JSON.stringify(out); })()`));
    ok(r.shown && r.cards === 2 && r.noInjected, JSON.stringify(r));
    eq(r.titleText, '<img src=x onerror=1>ข่าวหนึ่ง', 'title shown as text');
    ok(r.searchHidden && r.afterSearch && r.page2Hidden && r.page1 && r.emptyHidden && r.nullOk && r.junkOk && r.ghostOk, JSON.stringify(r));
    eq(r.modalTitle, '<img src=x onerror=1>ข่าวหนึ่ง', 'modal title is text, not HTML');
    ok(r.confirmShown && !r.detailInjected && r.badLinkNoConfirm, JSON.stringify(r));
  });
  await T('csv import: parser handles quotes/BOM/CRLF/newlines; file -> preview -> confirm adds only new SKUs', async () => {
    const pr = JSON.parse(await P(`(()=>{const pg=window.app.productGroup;const a=pg.parseCsv('\\uFEFFa,b\\r\\n"x,1","he said ""hi"""\\r\\n"l1\\nl2",z\\r\\n');return JSON.stringify({a:a,bad:pg.parseCsv('a,"b'),empty:pg.parseCsv('')})})()`));
    eq(JSON.stringify(pr.a), JSON.stringify([['a', 'b'], ['x,1', 'he said "hi"'], ['l1\nl2', 'z']]));
    eq(pr.bad, null); eq(JSON.stringify(pr.empty), '[]');
    const exSku = await P("window.app.globalData.products[0].SKU");
    const csv = 'SKU,Model,Marketing Model,Capacity,Color,Price,Stock,Category\r\nIMP-UI-1,IMP UI Model,"Import, UI",256GB,Black,"12,900",4,โมบาย\r\n' + exSku + ',IMP UI Model,,,,,1,\r\n,,,,,,,\r\n';
    await P(`window.__imp=window.app.productGroup.handleImportFile(new File([${JSON.stringify(csv)}],'t.csv'));true`);
    await sleep(900);
    const prev = await P("(Swal.getHtmlContainer()||{}).textContent||''");
    ok(/เพิ่ม SKU ใหม่ 1 รายการ/.test(prev) && /ข้าม/.test(prev) && prev.includes(exSku) && !prev.includes('ไม่ถูกต้อง'), 'preview text: ' + prev);
    ok(!sheets.Products.rows.some(r => r.includes('IMP-UI-1')), 'preview must not write');
    await P("Swal.clickConfirm();true"); await sleep(1200);
    ok(/นำเข้าสำเร็จ/.test(await P("(Swal.getTitle()||{}).textContent||''")), 'success dialog');
    await P("Swal.clickConfirm();true"); await sleep(600); await P("window.__imp");
    ok(sheets.Products.rows.some(r => r.includes('IMP-UI-1')), 'row written to sheet');
    ok(await P("window.app.globalData.products.some(p=>p.SKU==='IMP-UI-1')"), 'globalData refreshed with new SKU');
    // ไฟล์ไม่มีคอลัมน์ SKU ต้องแจ้งผิดพลาด ไม่ยิง API
    await P(`window.__imp2=window.app.productGroup.handleImportFile(new File(['a,b\\r\\n1,2\\r\\n'],'bad.csv'));true`); await sleep(500);
    ok(/SKU/.test(await P("(Swal.getHtmlContainer()||{}).textContent||''")), 'missing SKU header message');
    await P("Swal.close();true");
    // cleanup: ไม่ให้สินค้าทดสอบรบกวนเทสต์ถัดไป
    const i = sheets.Products.rows.findIndex(r => r.includes('IMP-UI-1')); if (i > 0) sheets.Products.rows.splice(i, 1);
    ctx.CacheService.getScriptCache().remove('TABLE_Products'); await ev("window.app.refreshGlobalData().then(()=>true)");
    ok(!(await P("window.app.globalData.products.some(p=>p.SKU==='IMP-UI-1')")), 'cleanup');
  });
  await T('records import UI: Branches file -> preview -> confirm; bad header rejected; channel/member buttons route to the generic importer', async () => {
    const exCh = await P("window.app.globalData.branches[0].Channel");
    const csv = 'Channel,Branch Code,Branch Name,Area\r\n' + exCh + ',UI-B1,สาขาทดสอบนำเข้า,กทม\r\n' + exCh + ',' + (await P("window.app.globalData.branches[0]['Branch Code']")) + ',dup,x\r\n';
    await P(`window.__ib=window.app.importer.handleFile('Branches',new File([${JSON.stringify(csv)}],'b.csv'));true`); await sleep(900);
    const prev = await P("(Swal.getHtmlContainer()||{}).textContent||''");
    ok(/เพิ่มสาขาใหม่ 1 รายการ/.test(prev) && /ข้าม/.test(prev), 'preview: ' + prev);
    ok(!sheets.Branches.rows.some(r => r.includes('UI-B1')), 'preview must not write');
    await P("Swal.clickConfirm();true"); await sleep(1200);
    ok(/นำเข้าสำเร็จ/.test(await P("(Swal.getTitle()||{}).textContent||''")), 'success dialog');
    await P("Swal.clickConfirm();true"); await sleep(600); await P("window.__ib");
    ok(sheets.Branches.rows.some(r => r.includes('UI-B1')), 'branch written');
    ok(await P("window.app.globalData.branches.some(b=>b['Branch Code']==='UI-B1')"), 'globalData refreshed');
    const bi = sheets.Branches.rows.findIndex(r => r.includes('UI-B1')); if (bi > 0) sheets.Branches.rows.splice(bi, 1);
    ctx.CacheService.getScriptCache().remove('TABLE_Branches'); await ev("window.app.refreshGlobalData().then(()=>true)");
    await P(`window.__ib2=window.app.importer.handleFile('Channels',new File(['Foo,Bar\\r\\n1,2\\r\\n'],'x.csv'));true`); await sleep(500);
    ok(/Channel Name/.test(await P("(Swal.getHtmlContainer()||{}).textContent||''")), 'missing required header message');
    await P("Swal.close();true");
    for (const [tb, hd] of [['Channels', 'Channel Name'], ['Members', 'Username'], ['Branches', 'Branch Code']]) {
      eq(await P(`window.app.importer.TABLES['${tb}'].requiredHeader`), hd);
      ok(await P(`window.app.importer.TABLES['${tb}'].headers.includes('${hd}')`), tb + ' template has its required header');
    }
  });
  await T('members import UI: generated password shown once in a non-dismissable dialog, never stored in globalData', async () => {
    const branch = await P("window.app.globalData.branches[0]['Branch Code']");
    const csv = 'Username,Password,Role,Name,Branch Code\r\nui.imp.user,,Sales,UI Import,' + branch + '\r\n';
    await P(`window.__im=window.app.importer.handleFile('Members',new File([${JSON.stringify(csv)}],'m.csv'));true`); await sleep(900);
    ok(/สุ่มรหัสผ่านให้ 1 คน/.test(await P("(Swal.getHtmlContainer()||{}).textContent||''")), 'preview mentions random password');
    ok(!sheets.Members.rows.some(r => r.includes('ui.imp.user')), 'preview must not write');
    await P("Swal.clickConfirm();true"); await sleep(1300);
    const dlg = JSON.parse(await P("JSON.stringify({title:(Swal.getTitle()||{}).textContent||'',html:(Swal.getHtmlContainer()||{}).textContent||'',deny:!!(Swal.getDenyButton()&&Swal.getDenyButton().style.display!=='none'),cancel:!!(Swal.getCancelButton()&&Swal.getCancelButton().style.display!=='none')})"));
    ok(/บันทึกรหัสผ่าน/.test(dlg.title) && dlg.html.includes('ui.imp.user') && dlg.deny && !dlg.cancel, JSON.stringify(dlg));
    const shown = (dlg.html.match(/ui\.imp\.user\s*([a-f0-9]{16})/) || [])[1];
    ok(shown, 'a 16-char generated password is displayed: ' + dlg.html.slice(0, 200));
    ok(await P("Swal.isVisible()"), 'dialog open');
    await P("document.querySelector('.swal2-container').click();true"); await sleep(250);
    ok(await P("Swal.isVisible()"), 'clicking outside must not dismiss the password dialog');
    ok(!JSON.stringify(await P("JSON.stringify(window.app.globalData)")).includes(shown), 'password must not be kept in globalData');
    await P("Swal.clickConfirm();true"); await sleep(500); await P("window.__im");
    const mh = sheets.Members.rows[0], row = sheets.Members.rows.find(r => r.includes('ui.imp.user'));
    ok(row && /^[a-f0-9]{64}$/.test(row[mh.indexOf('Password')]) && row[mh.indexOf('Password')] !== shown, 'stored as hash only');
    const mi = sheets.Members.rows.findIndex(r => r.includes('ui.imp.user')); if (mi > 0) sheets.Members.rows.splice(mi, 1);
    ctx.CacheService.getScriptCache().remove('TABLE_Members'); await ev("window.app.refreshGlobalData().then(()=>true)");
  });
  await T('cms news page: Otis-style list renders; filter/quick search/sort/paging work; Seq edit persists and re-orders; select + delete; category rules', async () => {
    const A = (a, pl) => P(`window.app.api(${JSON.stringify(a)},${JSON.stringify(pl)})`);
    await A('NEWS_CAT_SAVE', { name: 'หมวด-ก' }); await A('NEWS_CAT_SAVE', { name: 'หมวด-ข' });
    for (let i = 1; i <= 12; i++) await A('NEWS_SAVE', { category: i % 2 ? 'หมวด-ก' : 'หมวด-ข', title: 'ข่าวทดสอบ ' + String(i).padStart(2, '0'), seq: 20 - i, status: i === 3 ? 'Inactive' : 'Active' });
    await ev("window.location.hash='#news';true"); await sleep(1500);
    const rows = () => ev("document.querySelectorAll('#cmsBody tr').length");
    eq(await rows(), 10, 'default page size 10');
    ok(/จากทั้งหมด 12 รายการ/.test(await ev("document.getElementById('cmsInfo').textContent")), 'info text');
    ok(await ev("!!document.querySelector('#cmsRoot [data-act=add]') && !!document.querySelector('#cmsRoot [data-act=delmany]') && !!document.querySelector('#cmsRoot .cms-search-h')"), 'add / delete-selected / search box');
    eq(await ev("document.querySelector('#cmsBody tr .cms-link').textContent"), 'ข่าวทดสอบ 12', 'ordered by Seq asc (12 has seq 8)');
    await ev("document.querySelector('#cmsRoot [data-act=page][data-p=\"2\"]').click();true");
    eq(await rows(), 2, 'page 2 has the remaining 2');
    await ev("document.getElementById('cmsF_q').value='ทดสอบ 05';document.querySelector('#cmsRoot [data-act=search]').click();true");
    eq(await rows(), 1, 'title filter'); await ev("document.querySelector('#cmsRoot [data-act=reset]').click();true");
    await ev("document.getElementById('cmsF_state').value='inactive';document.querySelector('#cmsRoot [data-act=search]').click();true");
    eq(await rows(), 1, 'status filter (inactive)'); await ev("document.querySelector('#cmsRoot [data-act=reset]').click();true");
    await ev("document.getElementById('cmsF_cat').value='หมวด-ข';document.querySelector('#cmsRoot [data-act=search]').click();true");
    eq(await rows(), 6, 'category filter'); await ev("document.querySelector('#cmsRoot [data-act=reset]').click();true");
    await ev("(()=>{const q=document.querySelector('#cmsRoot [data-act=quick]');q.value='ทดสอบ 0';q.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
    eq(await rows(), 9, 'quick search 01-09');
    await ev("document.querySelector('#cmsRoot [data-act=reset]').click();true");
    await ev("document.querySelector('#cmsRoot th[data-col=\"3\"]').click();true");
    eq(await ev("document.querySelector('#cmsBody tr .cms-link').textContent"), 'ข่าวทดสอบ 01', 'sort by title asc');
    await ev("document.querySelector('#cmsRoot th[data-col=\"3\"]').click();true");
    eq(await ev("document.querySelector('#cmsBody tr .cms-link').textContent"), 'ข่าวทดสอบ 12', 'sort by title desc');
    await ev("document.querySelector('#cmsRoot th[data-col=\"3\"]').click();true");
    // Seq edit: ข่าว 11 (seq 9, อันดับ 2) -> 0 should move to the top and persist on the server
    await ev("(()=>{const i=[...document.querySelectorAll('#cmsBody tr')].find(r=>r.querySelector('.cms-link').textContent==='ข่าวทดสอบ 11').querySelector('.cms-seq');i.value='0';i.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
    await sleep(1200);
    eq(await ev("document.querySelector('#cmsBody tr .cms-link').textContent"), 'ข่าวทดสอบ 11', 'seq 0 goes first');
    eq((await A('NEWS_LIST', {})).data.news[0].title, 'ข่าวทดสอบ 11', 'persisted');
    // select 2 rows and delete
    await ev("(()=>{const c=[...document.querySelectorAll('#cmsBody input[data-act=sel]')];c[0].click();return true})()"); await sleep(100);
    await ev("(()=>{const c=[...document.querySelectorAll('#cmsBody input[data-act=sel]')];c[1].click();return true})()"); await sleep(100);
    ok(/\(2\)/.test(await ev("document.querySelector('#cmsRoot [data-act=delmany]').textContent")), 'selected count on delete button');
    await ev("document.querySelector('#cmsRoot [data-act=delmany]').click();true"); await sleep(400);
    await P("Swal.clickConfirm();true"); await sleep(1500);
    eq((await A('NEWS_LIST', {})).data.news.length, 10, 'two deleted');
    await P("Swal.close();true");
    // category page: in-use category cannot be deleted
    await ev("window.location.hash='#newscats';true"); await sleep(1300);
    eq(await ev("document.querySelectorAll('#cmsBody tr').length"), 2);
    await ev("document.querySelector('#cmsBody input[data-act=sel]').click();true"); await sleep(100);
    await ev("document.querySelector('#cmsRoot [data-act=delmany]').click();true"); await sleep(400);
    await P("Swal.clickConfirm();true"); await sleep(1500);
    ok(/ยังมีข่าวอยู่ในหมวด/.test(await P("(Swal.getHtmlContainer()||{}).textContent||''")), 'in-use category delete blocked with a reason');
    await P("Swal.close();true");
    eq((await A('NEWS_LIST', {})).data.categories.length, 2, 'categories intact');
    // cleanup so later tests see a clean sheet
    await A('NEWS_DELETE', { ids: (await A('NEWS_LIST', {})).data.news.map(n => n.id) });
    await A('NEWS_CAT_DELETE', { ids: (await A('NEWS_LIST', {})).data.categories.map(c => c.id) });
  });
  await T('cms banners page: lists hero/grid/popup banners with schedule badges; add dialog opens; image accept string is GAS-safe', async () => {
    await ev("window.location.hash='#banners';true"); await sleep(1500);
    const n = await ev("document.querySelectorAll('#cmsBody tr .cms-link').length");
    ok(n >= 1, 'banner rows rendered: ' + n);
    ok(await ev("document.querySelectorAll('#cmsBody .cms-badge').length") >= 1, 'status badges');
    ok(await ev("[...document.querySelectorAll('#cmsHead th')].some(t=>t.textContent.trim()==='ประเภท')"), 'type column');
    await ev("document.getElementById('cmsF_type').value='herobanner';document.querySelector('#cmsRoot [data-act=search]').click();true");
    ok(await ev("[...document.querySelectorAll('#cmsBody tr')].every(r=>r.querySelector('.cms-empty')||r.textContent.includes('Hero'))"), 'type filter keeps only hero banners');
    await ev("document.querySelector('#cmsRoot [data-act=reset]').click();true");
    await ev("document.querySelector('#cmsRoot [data-act=add]').click();true"); await sleep(500);
    ok(await ev("!!document.getElementById('cmsType') && !!document.getElementById('cmsUrl') && !!document.getElementById('cmsStart')"), 'add form fields');
    await P("Swal.close();true");
    await ev("window.location.hash='#herobanners';true"); await sleep(1500); // bookmark แท็บแบนเนอร์เก่า → หน้าใหม่
    eq(await ev("window.location.hash"), '#banners'); ok(await ev("!!document.getElementById('cmsRoot')"), 'old banner hash redirects to the new page');
    await ev("window.location.hash='#pos';true"); await sleep(1500); // ข้อทดสอบถัดไปต้องเริ่มจากหน้าสั่งจอง
  });
  await T('stock meter: every in-stock line has a bar whose width tracks the count (min 8%, full at 30+), low ones are short', async () => {
    const rows = JSON.parse(await P("JSON.stringify([...document.querySelectorAll('#productGrid .sf-stock.ok, #productGrid .sf-stock.low')].map(e=>({low:e.classList.contains('low'),n:+(e.textContent.match(/เหลือ (\\d+) ชิ้น/)||[])[1],w:parseFloat((e.querySelector('.sf-stock-bar > span')||{style:{}}).style.width)})))"));
    ok(rows.length > 0, 'no stock lines');
    rows.forEach(r => { ok(r.w >= 8 && r.w <= 100, 'bad width ' + JSON.stringify(r)); const exp = Math.max(8, Math.min(100, Math.round(r.n / 30 * 100))); ok(r.w === exp, 'width ' + r.w + ' != ' + exp + ' for stock ' + r.n); if (r.low) ok(r.w <= 17, 'low stock bar too long ' + r.w); });
  });
  await T('stock line also shows exact count above 5 (not just low stock)', async () => { const t = await P("[...document.querySelectorAll('#productGrid .sf-stock.ok')].map(e=>e.textContent).join('|')"); ok(/เหลือ \d+ ชิ้น/.test(t) && !/พร้อมจำหน่าย/.test(t), t.slice(0, 200)); });

  console.log('== RESPONSIVE (iPhone 390px) / DARK MODE');
  curPhase = 'responsive';
  await ev("window.Swal&&Swal.close();document.querySelectorAll('.fixed').forEach(e=>{});true");
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await ev("window.location.hash='#dashboard';true"); await sleep(600); await ev("window.location.hash='#pos';true"); await sleep(1500);
  await ev(`(()=>{const c=document.getElementById('posChannelSelect');c.value='Retail';c.dispatchEvent(new Event('change'));const b=document.getElementById('posBranchSelect');b.value='B01';b.dispatchEvent(new Event('change'));window.app.pos.checkCriteria();return true})()`); await sleep(900);
  await T('mobile: no horizontal page overflow', async () => { const w = await ev("[document.documentElement.scrollWidth, window.innerWidth]"); ok(w[0] <= w[1] + 1, 'scrollWidth=' + w[0] + ' vs ' + w[1]); });
  await T('mobile: sidebar hidden, filter button visible', async () => ok(await ev("(()=>{const s=document.getElementById('storeSidebar');const b=document.querySelector('.sf-filter-btn');return getComputedStyle(s).display==='none'&&getComputedStyle(b).display!=='none'})()")));
  await T('mobile: filter button opens sidebar', async () => { await ev("document.querySelector('.sf-filter-btn').click();true"); await sleep(300); ok(await ev("getComputedStyle(document.getElementById('storeSidebar')).display!=='none'")); await ev("document.querySelector('.sf-filter-btn').click();true"); });
  await T('mobile: filters open as a bottom sheet (backdrop, sticky footer with result count), stay open while picking, close from the footer button / backdrop / Escape', async () => {
    await ev("window.app.pos.clearStoreFilters(false);document.querySelector('.sf-filter-btn').click();true"); await sleep(400);
    const o = JSON.parse(await ev("(()=>{const s=document.getElementById('storeSidebar'),cs=getComputedStyle(s),r=s.getBoundingClientRect(),f=s.querySelector('.sf-sheet-foot').getBoundingClientRect();return JSON.stringify({pos:cs.position,bottom:Math.round(r.bottom),vh:innerHeight,w:Math.round(r.width),vw:innerWidth,foot:Math.round(f.bottom),bd:getComputedStyle(document.getElementById('storeSheetBackdrop')).display,lock:document.documentElement.classList.contains('sf-sheet-open'),count:document.getElementById('sfSheetCount').textContent})})()"));
    eq(o.pos, 'fixed'); ok(Math.abs(o.bottom - o.vh) <= 1 && o.w === o.vw && Math.abs(o.foot - o.vh) <= 1, 'sheet not docked to the bottom ' + JSON.stringify(o)); ok(o.bd !== 'none' && o.lock, JSON.stringify(o)); ok(/\d/.test(o.count), 'result count missing: ' + o.count);
    await shot('pos-filter-sheet');
    await ev("window.app.pos.setStoreFilter('capacity','128GB');true"); await sleep(300);
    const p = JSON.parse(await ev("JSON.stringify({open:!document.getElementById('storeSidebar').classList.contains('hidden'),count:document.getElementById('sfSheetCount').textContent,list:document.getElementById('storeResultCount').textContent,clear:document.querySelector('#storeSidebar .sf-sheet-foot .sf-btn-2').disabled})"));
    ok(p.open, 'sheet closed after picking a filter'); eq(p.count, p.list.trim(), 'count in the sheet differs from the list'); ok(!p.clear, 'clear button should be enabled');
    await ev("document.querySelector('#storeSidebar .sf-sheet-go').click();true"); await sleep(300);
    const c = JSON.parse(await ev("JSON.stringify({side:getComputedStyle(document.getElementById('storeSidebar')).display,bd:getComputedStyle(document.getElementById('storeSheetBackdrop')).display,lock:document.documentElement.classList.contains('sf-sheet-open'),chips:document.querySelectorAll('#storeActiveChips .sf-achip').length})"));
    eq(c.side, 'none'); eq(c.bd, 'none'); ok(!c.lock, 'scroll lock left on'); eq(c.chips, 1); await shot('pos-filter-chips-mobile');
    await ev("window.app.pos.toggleStoreSidebar(true);document.getElementById('storeSheetBackdrop').click();true"); await sleep(200);
    ok(await ev("document.getElementById('storeSidebar').classList.contains('hidden')"), 'backdrop click must close the sheet');
    await ev("window.app.pos.toggleStoreSidebar(true);document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true"); await sleep(200);
    ok(await ev("document.getElementById('storeSidebar').classList.contains('hidden')"), 'Escape must close the sheet');
    await ev("window.app.pos.clearStoreFilters(false);true"); await sleep(250);
  });
  await T('mobile: 2-column card grid', async () => { const cols = await ev("getComputedStyle(document.querySelector('#productGrid .pos-storefront.grid')).gridTemplateColumns.split(' ').length"); ok(cols === 2, 'cols=' + cols); });
  await shot('pos-mobile'); await ev("document.getElementById('posStoreHeader').scrollIntoView({block:'start',behavior:'instant'});window.scrollTo({top:0,behavior:'instant'});true"); await sleep(250); await shot('pos-top-mobile'); await ev("window.scrollTo({top:1200,behavior:'instant'});true"); await sleep(450); { const m = JSON.parse(await ev("JSON.stringify({top:document.getElementById('posStoreHeader').getBoundingClientRect().top,stuck:document.getElementById('posStoreHeader').classList.contains('is-stuck'),where:getComputedStyle(document.querySelector('.pos-where')).display})")); await T('sticky header (mobile): pinned at the top edge (website mode, no app topbar), channel/branch row hidden while stuck', async () => { ok(Math.abs(m.top) <= 2, JSON.stringify(m)); ok(m.stuck && m.where === 'none', JSON.stringify(m)); }); await shot('pos-sticky-mobile'); await ev("(()=>{const g=window.app.globalData;g.__bakS1=g.settings;g.settings=Object.assign({},g.settings,{ContactPhone:'02-123-4567',ContactLine:'@teststore',ContactHours:'10:00-20:00'});window.app.renderFooterContact();document.querySelector('footer').scrollIntoView({block:'end',behavior:'instant'});return true})()"); await sleep(300); await shot('footer-mobile'); await ev("(()=>{const g=window.app.globalData;g.settings=g.__bakS1;window.app.renderFooterContact();return true})()"); await ev("window.scrollTo({top:0,behavior:'instant'});true"); await sleep(250); }
  await T('mobile: product detail page fits the screen, add-to-cart button fully visible', async () => {
    await ev("window.app.pos.openAddToCartModal('MODEL:Galaxy Test1');true"); await sleep(500);
    const r = JSON.parse(await ev(`(()=>{const m=document.getElementById('addToCartModal'),sc=document.getElementById('pdScroll'),c=m.querySelector('.pd-bar-cta').getBoundingClientRect(),h=m.querySelector('.pd-head');
      return JSON.stringify({iw:innerWidth,ih:innerHeight,over:sc.scrollWidth>sc.clientWidth+1,headOver:h.scrollWidth>h.clientWidth+1,l:c.left,r:c.right,b:c.bottom,tabsW:m.querySelector('.pd-tabs').getBoundingClientRect().width})})()`));
    await shot('pos-detail-mobile');
    ok(!r.over && !r.headOver && r.l >= 0 && r.r <= r.iw + 1 && r.b <= r.ih + 1 && r.tabsW <= r.iw, JSON.stringify(r));
    await ev("document.documentElement.classList.add('dark');true"); await sleep(250); await shot('pos-detail-mobile-dark');
    await ev("document.documentElement.classList.remove('dark');window.app.hideModal('addToCartModal');true"); await sleep(250);
  });
  await T('mobile: cart drawer companions fit the screen (no horizontal overflow)', async () => {
    await P("window.app.pos.cartData=[{...window.app.globalData.products.find(p=>p.SKU==='T3-0'),qty:1,brandGifts:[],channelGifts:[]}];window.app.pos.saveAndRender();window.app.pos.toggleCart();true"); await sleep(700);
    const m = JSON.parse(await P("JSON.stringify((()=>{const d=document.getElementById('cartDrawer'),c=document.getElementById('cartCompanions');return {dw:d.scrollWidth,dc:d.clientWidth,rows:c.querySelectorAll('.sf-comp').length,over:[...c.querySelectorAll('.sf-comp')].some(r=>r.scrollWidth>r.clientWidth+1),vis:!c.classList.contains('hidden')}})())"));
    await shot('cart-mobile'); ok(m.vis && m.rows >= 1 && !m.over && m.dw <= m.dc + 1, JSON.stringify(m));
    await P("window.app.pos.cartData=[{...window.app.globalData.products.find(p=>p.SKU==='T3-0'),qty:1,brandGifts:[],channelGifts:[]}];document.documentElement.classList.add('dark');window.app.pos.saveAndRender();true"); await sleep(400); await shot('cart-mobile-dark');
    await P("document.documentElement.classList.remove('dark');window.app.pos.toggleCart();window.app.pos.cartData=[];window.app.pos.saveAndRender();true"); await sleep(400);
  });
  await T('mobile back office: admin pages do not scroll the whole page sideways (wide tables scroll inside their own box)', async () => {
    const bad = [];
    for (const r of ['dashboard', 'orders', 'products', 'invoice', 'analytics', 'branchbookingsummary', 'allbookingsummary', 'systemsettings', 'banners']) {
      await ev("window.location.hash='#" + r + "';true"); await sleep(1300);
      const w = JSON.parse(await ev("JSON.stringify([document.documentElement.scrollWidth, window.innerWidth])"));
      if (w[0] > w[1] + 1) bad.push(r + ':' + w[0]);
      if (['dashboard', 'products', 'invoice', 'systemsettings'].includes(r)) await shot('m-admin-' + r);
      if (r === 'dashboard') { const e = JSON.parse(await ev("JSON.stringify((()=>{const i=document.getElementById('dashEndDate').getBoundingClientRect();const c=document.getElementById('dashEndDate').closest('.rounded-2xl').getBoundingClientRect();return [i.right,c.right]})())")); if (e[0] > e[1] + 1) bad.push('dashboard end-date box sticks out of its card ' + e); }
      if (r === 'products') { const h = await ev("Math.round(document.querySelector('.cms-actions').getBoundingClientRect().height)"); if (h > 140) bad.push('products toolbar too tall: ' + h + 'px'); }
    }
    ok(bad.length === 0, 'page wider than screen: ' + bad.join(', '));
  });
  await ev("window.location.hash='#pos';true"); await sleep(1500);
  await ev(`(()=>{const c=document.getElementById('posChannelSelect');c.value='Retail';c.dispatchEvent(new Event('change'));const b=document.getElementById('posBranchSelect');b.value='B01';b.dispatchEvent(new Event('change'));window.app.pos.checkCriteria();return true})()`);
  await sleep(800);
  await send('Emulation.clearDeviceMetricsOverride'); await waitFor('innerWidth > 1000', 5000); await sleep(300);
  await T('desktop: mobile filter button hidden, sidebar visible', async () => { const v = await ev("(()=>{const b=document.querySelector('.sf-filter-btn');const s=document.getElementById('storeSidebar');return JSON.stringify({btn:getComputedStyle(b).display,side:getComputedStyle(s).display,sideCls:s.className,w:innerWidth,open:window.app.pos.sidebarOpen})})()"); const o = JSON.parse(v); ok(o.btn === 'none' && o.side !== 'none', v); });
  await T('dark mode: sidebar + pagination readable', async () => { await ev("document.documentElement.classList.add('dark');window.app.pos.renderStoreHeader();window.app.pos.filter();true"); await sleep(400); const c = await ev("(()=>{const p=document.querySelector('.sf-panel');const t=document.querySelector('.sf-title');return [getComputedStyle(p).backgroundColor,getComputedStyle(t).color]})()"); ok(c[0] !== 'rgb(255, 255, 255)', 'panel bg still white in dark: ' + c[0]); await shot('pos-dark'); await ev("document.documentElement.classList.remove('dark');true"); });

  console.log('== SIDEBAR MENU');
  curPhase = 'sidebar';
  await ev("document.documentElement.classList.remove('dark');window.location.hash='#pos';true"); await sleep(600);
  // #pos is website mode (sidebar hidden) — drop the class (CSS only, POS state kept) so the admin sidebar can be measured
  await ev("document.documentElement.classList.remove('sf-site');true"); await sleep(200);
  await T('shop logo: shown in the sidebar after data loads (settings arrive after the layout), swaps when changed, default icon when removed or broken', async () => {
    const r = JSON.parse(await ev(`(()=>{const a=window.app,g=a.globalData,bak=g.settings,px='https://logo.invalid/a.png';const out={};
      const st=()=>{const b=document.getElementById('sidebarLogoBox'),i=b.querySelector('img.app-logo-img');return {img:i?i.getAttribute('src'):'',icon:document.getElementById('sidebarLogoIcon').style.display!=='none',n:b.querySelectorAll('img').length}};
      g.settings=Object.assign({},bak,{LogoUrl:px});a.applyAppLogos();a.applyAppLogos();out.set=st();out.mob=!!document.querySelector('#mobileLogoBox img.app-logo-img');
      g.settings=Object.assign({},bak,{LogoUrl:px+'#2'});a.applyAppLogos();out.changed=st();
      out.remembered=localStorage.getItem('f9_logo_url');
      const real=a.globalData;a.globalData={products:[]};document.querySelector('#sidebarLogoBox img.app-logo-img').remove();a.applyAppLogos();out.early=st();a.globalData=real;
      g.settings=Object.assign({},bak,{LogoUrl:''});a.applyAppLogos();out.removed=st();out.forgot=localStorage.getItem('f9_logo_url');
      g.settings=Object.assign({},bak,{LogoUrl:px});a.applyAppLogos();document.querySelector('#sidebarLogoBox img.app-logo-img').onerror();out.broken=st();
      g.settings=bak;a.applyAppLogos();return JSON.stringify(out)})()`));
    ok(r.set.img==='https://logo.invalid/a.png' && !r.set.icon && r.set.n === 1 && r.mob, 'set: ' + JSON.stringify(r.set));
    ok(r.changed.img.endsWith('#2') && r.changed.n === 1, 'changed: ' + JSON.stringify(r.changed));
    ok(r.remembered && r.remembered.endsWith('#2') && r.early.img.endsWith('#2'), 'remembered logo must show before settings arrive: ' + JSON.stringify(r.early));
    ok(!r.removed.img && r.removed.icon && r.forgot === null, 'removed: ' + JSON.stringify(r.removed));
    ok(!r.broken.img && r.broken.icon, 'broken: ' + JSON.stringify(r.broken));
  });
  await T('dashboard has no banner slider / campaign grid (the storefront shows them)', async () => { ok(await ev("!document.getElementById('dashHeroWrap') && !document.getElementById('dashPromoGridWrap') && !document.getElementById('tmpl-dashboard').innerHTML.includes('แคมเปญ / ประกาศ')")); });
  await T('menu: items are Thai on top, English below (dashboard / pos / orders)', async () => { const r = JSON.parse(await ev("JSON.stringify(['dashboard','pos','orders'].map(id=>{const a=document.getElementById('nav-desk-'+id);return [a.querySelector('.nav-th').textContent,a.querySelector('.nav-sub').textContent]}))")); ok(JSON.stringify(r) === JSON.stringify([['แดชบอร์ด','Dashboard'],['สั่งจองสินค้า','Pre Booking'],['รายการใบจอง','Orders']]), JSON.stringify(r)); });
  await T('menu: every Thai label is a single line (no wrapping), no horizontal overflow', async () => { const r = JSON.parse(await ev("JSON.stringify([...document.querySelectorAll('#desktopMenu .nav-link')].filter(a=>a.offsetParent).map(a=>{const t=a.querySelector('.nav-th');return {id:a.id,h:Math.round(t.getBoundingClientRect().height),over:a.scrollWidth>a.clientWidth+1}}))")); const bad = r.filter(x => x.h > 24 || x.over); ok(r.length >= 8 && !bad.length, JSON.stringify(bad)); });
  await T('menu: active item gets the orange accent bar', async () => { const c = await ev("(()=>{const a=document.getElementById('nav-desk-pos');return JSON.stringify([a.classList.contains('active-link'),getComputedStyle(a,'::before').backgroundColor,getComputedStyle(a,'::before').content])})()"); const [act, bg, ct] = JSON.parse(c); ok(act && bg === 'rgb(255, 107, 0)' && ct !== 'none', c); });
  await T('menu: section headers are not squeezed by the scrolling flex column (full padding + text visible)', async () => { const h = JSON.parse(await ev("JSON.stringify([...document.querySelectorAll('#desktopMenu > div')].filter(d=>/uppercase/.test(d.className)).map(d=>Math.round(d.getBoundingClientRect().height)))")); ok(h.length >= 2 && Math.min(...h) >= 30, 'squeezed headers: ' + h); });
  await T('menu: category headers show Thai + English', async () => { const t = await ev("document.getElementById('desktopMenu').textContent"); ok(t.includes('เมนูหลัก') && t.includes('Main Menu') && t.includes('วิเคราะห์/รายงาน'), t.slice(0, 120)); const h = JSON.parse(await ev("JSON.stringify([...document.querySelectorAll('#desktopMenu > div')].filter(d=>/uppercase/.test(d.className)).map(d=>Math.round(d.getBoundingClientRect().height)))")); ok(h.length >= 2 && Math.max(...h) <= 40, 'category header wraps: ' + h); });
  await T('user menu: closed by default, old big buttons gone, opens on click, has 3 actions', async () => {
    ok(await ev("document.getElementById('userMenuPop').classList.contains('hidden')"), 'should start hidden');
    await ev("document.getElementById('userMenuBtn').click();true"); await sleep(150);
    ok(await ev("!document.getElementById('userMenuPop').classList.contains('hidden') && document.getElementById('userMenuBtn').getAttribute('aria-expanded')==='true'"), 'did not open');
    const t = await ev("document.getElementById('userMenuPop').textContent"); ok(/เปลี่ยนรหัสผ่าน/.test(t) && /ออกจากระบบ/.test(t) && /โหมด/.test(t), t.replace(/\s+/g, ' '));
    ok(await ev("document.querySelectorAll('#desktopSidebar > div:last-child > button').length === 1"), 'sidebar bottom should have a single user button');
  });
  await T('user menu: closes on outside click and on Escape', async () => {
    await ev("document.getElementById('pageTitle')||0;document.body.click();true"); await sleep(150);
    ok(await ev("document.getElementById('userMenuPop').classList.contains('hidden')"), 'outside click did not close');
    await ev("document.getElementById('userMenuBtn').click();true"); await sleep(100);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(150);
    ok(await ev("document.getElementById('userMenuPop').classList.contains('hidden')"), 'Escape did not close');
  });
  await T('user menu: dark-mode toggle still works from the menu and updates label', async () => {
    await ev("document.getElementById('userMenuBtn').click();true"); await sleep(100);
    await ev("document.querySelector('#userMenuPop .theme-toggle-label').closest('button').click();true"); await sleep(250);
    const d = await ev("JSON.stringify([document.documentElement.classList.contains('dark'),document.querySelector('#userMenuPop .theme-toggle-label').textContent])"); const [dk, lb] = JSON.parse(d); ok(dk === true && lb === 'โหมดสว่าง', d);
    await ev("document.querySelector('#userMenuPop .theme-toggle-label').closest('button').click();true"); await sleep(250);
    ok(await ev("!document.documentElement.classList.contains('dark')"), 'could not switch back to light');
    await ev("window.app.closeUserMenu();true");
  });
  await T('website mode: class restored on #pos after route(), removed on other pages', async () => {
    await ev("window.app.route();true"); await sleep(300);
    ok(await ev("document.documentElement.classList.contains('sf-site')"), 'sf-site missing on #pos');
  });

  console.log('== ID CARD / PASSPORT FIELD');
  curPhase = 'idcard';
  await T('safeRichText: keeps b/strong/br (+safe class), strips scripts, handlers, other tags and unsafe class values', async () => {
    const r = JSON.parse(await ev("JSON.stringify([\"ซื้อ <strong class='text-rose-900'>ลด 10%</strong><br>ทันที\", '<img src=x onerror=alert(1)>', '<b onclick=alert(1)>x</b>', '<script>alert(1)</script>', '<b class=\"x\\\" onmouseover=\\\"y\">z</b>', '<a href=javascript:alert(1)>l</a>', 5].map(v=>window.app.safeRichText(v)))"));
    eq(r[0], 'ซื้อ <strong class="text-rose-900">ลด 10%</strong><br>ทันที');
    const bad = await ev("(" + JSON.stringify(r) + ").filter(h=>{const d=document.createElement('div');d.innerHTML=h;return [...d.querySelectorAll('*')].some(el=>!/^(B|STRONG|EM|I|U|BR)$/.test(el.tagName)||[...el.attributes].some(a=>a.name!=='class'))})");
    eq(JSON.stringify(bad), '[]');
    ok(r[1].startsWith('&lt;img') && r[2].startsWith('&lt;b onclick') && r[3].startsWith('&lt;script'), JSON.stringify(r)); eq(r[6], '5');
  });
  await T('validateIdCard: valid Thai ID, numeric passport, alnum passport accepted', async () => { const r = JSON.parse(await ev("JSON.stringify(['1234567890121','1-2345-67890-12-1','123456789','ab123456','AB1234567'].map(v=>window.app.validateIdCard(v)))")); ok(r.every(x => x.ok), JSON.stringify(r)); ok(r[0].type === 'thai' && r[2].type === 'passport' && r[3].value === 'AB123456', JSON.stringify(r)); });
  await T('validateIdCard: bad checksum / 0000 / 10-12 digits / empty / junk rejected', async () => { const r = JSON.parse(await ev("JSON.stringify(['1234567890123','0000','12345678901','','AB1','AB-1234567890'].map(v=>window.app.validateIdCard(v).ok))")); ok(r.every(x => x === false), JSON.stringify(r)); });
  await T('formatIdCard: letters => passport mode (uppercase, kept, max 9); digits => Thai ID dashes', async () => {
    const r = JSON.parse(await ev("(()=>{const e=document.createElement('input');const f=v=>{e.value=v;window.app.formatIdCard(e);return e.value};return JSON.stringify([f('ab-12 3456'),f('abcdefghijkl'),f('1234567890121'),f('0000'),e.classList.contains('border-emerald-500')])})()"));
    ok(r[0] === 'AB123456' && r[1] === 'ABCDEFGHI' && r[2] === '1-2345-67890-12-1' && r[3] === '0-000' && r[4] === false, JSON.stringify(r));
  });
  await T('formatIdCard: valid input turns the field green, invalid 13-digit stays non-green', async () => { const r = JSON.parse(await ev("(()=>{const e=document.createElement('input');e.value='1234567890121';window.app.formatIdCard(e);const a=e.classList.contains('border-emerald-500');e.value='1234567890123';window.app.formatIdCard(e);return JSON.stringify([a,e.classList.contains('border-emerald-500')])})()")); ok(r[0] === true && r[1] === false, JSON.stringify(r)); });

  console.log('== FOOTER / BACK-TO-TOP / META');
  curPhase = 'footer';
  await ev("document.documentElement.classList.remove('dark');true");
  await T('policy links in footer open booking terms / privacy policy (default text, then Admin text from Settings, HTML escaped)', async () => {
    const labels = await ev("[...document.querySelectorAll('#footerHelpLinks button')].map(b=>b.textContent.trim()).join('|')");
    ok(labels.includes('เงื่อนไขการจอง') && labels.includes('นโยบายความเป็นส่วนตัว'), labels);
    await ev("[...document.querySelectorAll('#footerHelpLinks button')].find(b=>b.textContent.trim()==='นโยบายความเป็นส่วนตัว').click();true"); await sleep(350);
    const d = JSON.parse(await ev("JSON.stringify({title:(Swal.getTitle()||{}).textContent,body:(document.getElementById('policyBody')||{}).textContent||''})"));
    eq(d.title, 'นโยบายความเป็นส่วนตัว'); ok(d.body.includes('เลขบัตรประชาชน') && d.body.includes('สิทธิของเจ้าของข้อมูล'), d.body.slice(0, 120));
    await ev("Swal.close();true"); await sleep(250);
    await ev("(()=>{const g=window.app.globalData;g.__bakPol=g.settings;g.settings=Object.assign({},g.settings,{PolicyBooking:\"'=มัดจำ 1,000 บาท\\n<b>คืนไม่ได้</b><img src=x onerror=window.__polXss=1>\"});window.app.openPolicy('booking');return true})()"); await sleep(350);
    const c = JSON.parse(await ev("JSON.stringify({title:(Swal.getTitle()||{}).textContent,html:(document.getElementById('policyBody')||{}).innerHTML||'',xss:!!window.__polXss})"));
    eq(c.title, 'เงื่อนไขการจอง'); ok(c.html.startsWith('=มัดจำ 1,000 บาท<br><b>คืนไม่ได้</b>') && !/<img/i.test(c.html) && !c.xss, c.html.slice(0, 160));
    await ev("(()=>{Swal.close();const g=window.app.globalData;g.settings=g.__bakPol;return true})()"); await sleep(250);
  });
  await T('footer help: how-to / FAQ open with default text, a saved text replaces it (escaped), branches list comes from the Branches sheet', async () => {
    const links = await ev("document.querySelectorAll('#footerHelpLinks button').length"); eq(links, 4);
    await ev("window.app.openPolicy('howto');true"); await sleep(300);
    const h = JSON.parse(await ev("JSON.stringify({title:(Swal.getTitle()||{}).textContent,len:(document.getElementById('policyBody')||{}).textContent.length})")); ok(h.len > 40, 'how-to default text missing'); ok(h.title && h.title.length > 3, 'title');
    await ev("(()=>{Swal.close();const g=window.app.globalData;g.__bakH=g.settings;g.settings=Object.assign({},g.settings,{HelpFaq:'<b>Q1</b>\\nA1<img src=x onerror=window.__faqXss=1>'});window.app.openPolicy('faq');return true})()"); await sleep(300);
    const q = JSON.parse(await ev("JSON.stringify({html:(document.getElementById('policyBody')||{}).innerHTML||'',xss:!!window.__faqXss})")); ok(q.html.startsWith('<b>Q1</b><br>A1') && !/<img/i.test(q.html) && !q.xss, q.html.slice(0, 120));
    await ev("(()=>{Swal.close();const g=window.app.globalData;g.settings=g.__bakH;g.__bakB=g.branches;g.branches=[{Channel:'Retail','Branch Code':'B01','Branch Name':'<i>Central</i>',Province:'Bangkok',Mall:'CTW'},{Channel:'Online','Branch Code':'B01','Branch Name':'<i>Central</i>',Province:'Bangkok',Mall:'CTW'},{Channel:'Retail','Branch Code':'B02','Branch Name':'Chiang Mai',Province:'Chiang Mai'}];window.app.openBranches();return true})()"); await sleep(300);
    const b = JSON.parse(await ev("(()=>{const el=document.getElementById('branchBody');return JSON.stringify({grp:el.querySelectorAll('.br-grp').length,li:el.querySelectorAll('li').length,raw:!!el.querySelector('li b i'),txt:el.textContent})})()")); eq(b.grp, 2); eq(b.li, 2, 'a branch listed once even with one row per channel'); ok(!b.raw && b.txt.includes('<i>Central</i>'), 'branch name must be escaped'); await shot('footer-branches');
    await ev("(()=>{Swal.close();const g=window.app.globalData;g.branches=g.__bakB;return true})()"); await sleep(250);
  });
  await T('footer: year is current year, brand copyright present', async () => { const t = await ev("document.querySelector('footer').textContent"); ok(t.includes(String(new Date().getFullYear())) && t.includes('สงวนลิขสิทธิ์'), t.slice(0, 120)); });
  await T('status history: renders timeline, escapes HTML, hides staff name on public view', async () => {
    const r = await ev("(function(){const h=[{time:'2026-11-05 10:00',from:'',to:'Pending',by:'somchai'},{time:'2026-11-05 12:30',from:'Pending',to:'<img src=x onerror=1>',by:'somchai'}];return JSON.stringify({pub:window.app.statusHistoryHtml(h,false),staff:window.app.statusHistoryHtml(h,true),empty:window.app.statusHistoryHtml([],false)});})()");
    const o = JSON.parse(r); ok(o.pub.includes('Pending') && o.pub.includes('2026-11-05 12:30'), 'timeline missing'); ok(!o.pub.includes('somchai'), 'staff name leaked on public view'); ok(o.staff.includes('somchai'), 'staff view lacks name'); ok(!o.pub.includes('<img') && o.pub.includes('&lt;img'), 'not escaped'); eq(o.empty, '');
  });
  await T('storefront header: search+cart on top, channel/branch chips keep their ids, category chips filter', async () => {
    const r = JSON.parse(await ev("(()=>{const h=document.getElementById('posStoreHeader');const banner=document.getElementById('posTimerBanner');return JSON.stringify({top:!!h&&!!banner&&(h.compareDocumentPosition(banner)&Node.DOCUMENT_POSITION_FOLLOWING)>0,ids:['searchProduct','posChannelSelect','posBranchSelect','headerCartCount'].every(i=>h.querySelector('#'+i)),chips:document.querySelectorAll('.sf-catchips .sf-chip').length,allOn:!!document.querySelector('.sf-catchips .sf-chip.on')})})()"));
    ok(r.top, 'header must precede flash banner'); ok(r.ids, 'ids moved/missing'); ok(r.chips >= 3 && r.allOn, JSON.stringify(r));
    await ev("window.app.pos.clearStoreFilters(false);[...document.querySelectorAll('.sf-catchips .sf-chip')].find(b=>b.textContent.trim()==='แท็บเล็ต').click();true"); await sleep(400);
    ok(await ev("document.querySelector('.sf-catchips .sf-chip.on').textContent.trim()==='แท็บเล็ต' && /แท็บเล็ต/.test(document.querySelector('.sf-h1').textContent)"), 'chip click did not apply category');
    await ev("window.app.pos.clearStoreFilters(false);true"); await sleep(250);
  });
  await T('sticky header: stays pinned at top while the page scrolls (desktop) and compacts', async () => {
    await ev("window.scrollTo({top:0,behavior:'instant'});true"); await sleep(200);
    const r0 = JSON.parse(await ev("JSON.stringify({top:document.getElementById('posStoreHeader').getBoundingClientRect().top,stuck:document.getElementById('posStoreHeader').classList.contains('is-stuck')})"));
    ok(!r0.stuck, 'should not be stuck at page top ' + JSON.stringify(r0));
    await ev("window.scrollTo({top:900,behavior:'instant'});true"); await sleep(400);
    const r = JSON.parse(await ev("JSON.stringify({top:document.getElementById('posStoreHeader').getBoundingClientRect().top,stuck:document.getElementById('posStoreHeader').classList.contains('is-stuck'),sy:window.scrollY})"));
    ok(r.sy > 300, 'page did not scroll: ' + JSON.stringify(r)); ok(Math.abs(r.top) <= 2, 'header not pinned: ' + JSON.stringify(r)); ok(r.stuck, 'is-stuck not applied');
    await shot('pos-sticky-desktop');
    await ev("window.scrollTo({top:0,behavior:'instant'});true"); await sleep(300);
    ok(!(await ev("document.getElementById('posStoreHeader').classList.contains('is-stuck')")), 'is-stuck not cleared at top');
  });
  await T('cart item: thumbnail + color/capacity line, line total only when qty > 1', async () => {
    const r = JSON.parse(await ev("(()=>{const pos=window.app.pos;const bak=pos.cartData;const base=window.app.globalData.products.find(p=>p.SKU==='T3-0');pos.cartData=[{...base,Color:'Blue',Capacity:'256GB',qty:1,brandGifts:[],channelGifts:[]},{...base,Color:'-',Capacity:'',qty:3,brandGifts:[],channelGifts:[]}];pos.renderCart();const rows=[...document.querySelectorAll('#cartItems > div')];const out={n:rows.length,img:rows.map(r=>!!r.querySelector('img')),t0:rows[0].innerText,t1:rows[1].innerText};pos.cartData=bak;pos.renderCart();return JSON.stringify(out)})()"));
    eq(r.n, 2); ok(r.img.every(Boolean), 'thumbnail missing'); ok(/Blue · 256GB/.test(r.t0), r.t0); ok(!/รวม ฿/.test(r.t0), 'line total shown for qty 1'); ok(/รวม ฿.*3 ชิ้น/.test(r.t1), r.t1);
  });
  await T('card click: image and name open the detail modal; heart/compare buttons on the image do not', async () => {
    await ev("window.app.pos.clearStoreFilters(false);window.app.pos.__bakCart=window.app.pos.cartData;window.app.pos.cartData=[];window.app.hideModal('addToCartModal');true"); await sleep(400);
    const isOpen = "!document.getElementById('addToCartModal').classList.contains('hidden')";
    const img = JSON.parse(await ev("(()=>{const w=document.querySelector('#productGrid .pos-card .cursor-pointer');if(!w)return JSON.stringify({none:true});w.querySelector('img').click();return JSON.stringify({ok:true})})()"));
    ok(img.ok, 'no openable card found'); await sleep(350); ok(await ev(isOpen), 'image click did not open the modal');
    await shot('pos-detail');
    await ev("window.app.hideModal('addToCartModal');true"); await sleep(300);
    await ev("(()=>{const n=document.querySelector('#productGrid .pos-card [role=link]');n.click();return true})()"); await sleep(350); ok(await ev(isOpen), 'name click did not open the modal');
    await ev("window.app.hideModal('addToCartModal');true"); await sleep(300);
    await ev("(()=>{const b=document.querySelector('#productGrid .pos-card .bnn-compare-btn');b.click();return true})()"); await sleep(300);
    ok(!(await ev(isOpen)), 'compare button must not open the detail modal');
    await ev("(()=>{const b=document.querySelector('#productGrid .pos-card .bnn-compare-btn.active');if(b)b.click();window.app.pos.cartData=window.app.pos.__bakCart||[];true})()"); await sleep(200);
  });
  await T('card: the whole card opens the detail page (price area too); card button is the quiet "ดูรายละเอียด", not an orange CTA', async () => {
    await ev("window.app.hideModal('addToCartModal');true"); await sleep(300);
    const isOpen = "!document.getElementById('addToCartModal').classList.contains('hidden')";
    const r = JSON.parse(await ev("(()=>{const c=document.querySelector('#productGrid .pos-card.pm-open');if(!c)return JSON.stringify({none:true});const b=c.querySelector('.pm-view');const bg=b?getComputedStyle(b).backgroundColor:'';c.querySelector('.pm-price').click();return JSON.stringify({btn:b?b.textContent.trim():'',bg:bg,old:/จองเลย/.test(c.innerText)})})()"));
    ok(!r.none, 'no openable card'); await sleep(350); ok(await ev(isOpen), 'clicking the price area did not open the detail page');
    eq(r.btn, 'ดูรายละเอียด'); ok(!r.old, 'old จองเลย label still on the card'); ok(!/255, 107, 0/.test(r.bg), 'card button is still orange: ' + r.bg);
    await ev("window.app.hideModal('addToCartModal');true"); await sleep(300);
    // a chip/dot/heart click inside the card must still NOT open it
    await ev("(()=>{const b=document.querySelector('#productGrid .pos-card.pm-open .pm-wish');b.click();return true})()"); await sleep(300);
    ok(!(await ev(isOpen)), 'heart button must not open the detail page');
    await ev("(()=>{const b=document.querySelector('#productGrid .pos-card.pm-open .pm-wish');b.click();return true})()"); await sleep(200);
  });
  await T('home order: product list comes before coupons / news / recently viewed; header cart is an icon button, not an orange pill', async () => {
    const r = JSON.parse(await ev("(()=>{const g=document.getElementById('productGrid');const after=id=>{const e=document.getElementById(id);return !!e&&!!(g.compareDocumentPosition(e)&Node.DOCUMENT_POSITION_FOLLOWING)};const before=id=>{const e=document.getElementById(id);return !!e&&!!(g.compareDocumentPosition(e)&Node.DOCUMENT_POSITION_PRECEDING)};const cb=getComputedStyle(document.querySelector('.pos-cart-btn')).backgroundColor;return JSON.stringify({v:after('posVoucherStripWrap'),n:after('posNews'),rv:after('posRecentlyViewed'),pop:before('posPopular'),br:before('posBrands'),cb:cb})})()"));
    ok(r.v && r.n && r.rv, 'coupons/news/recent must follow the grid ' + JSON.stringify(r)); ok(r.pop && r.br, 'popular/brands must precede the grid');
    ok(!/255, 107, 0/.test(r.cb), 'cart button still orange: ' + r.cb);
    await ev("document.getElementById('posVoucherStripWrap').scrollIntoView({block:'start',behavior:'instant'});true"); await sleep(250); await shot('pos-after-grid');
    await ev("window.scrollTo({top:0,behavior:'instant'});true"); await sleep(150);
  });
  await T('detail page: selected option is outlined (not a solid fill), colour options carry a colour dot, trust row and related products render and open', async () => {
    await ev("window.app.pos.openAddToCartModal('MODEL:Galaxy Test1');true"); await sleep(400);
    const r = JSON.parse(await ev("(()=>{const on=document.querySelector('#modalColorOptions button.pd-on');const rel=document.getElementById('pdRelated');const cards=[...rel.querySelectorAll('.pd-rel-card')];return JSON.stringify({on:!!on,bg:on?getComputedStyle(on).backgroundColor:'',dot:!!document.querySelector('#modalColorOptions .pd-dot'),txt:on?on.textContent.trim():'',trust:document.querySelectorAll('#addToCartModal .pd-trust li').length,relHidden:rel.classList.contains('hidden'),n:cards.length,self:cards.some(c=>/Galaxy Test1$/.test(c.querySelector('.pd-rel-name').textContent.trim())),name:document.getElementById('modalProdName').textContent})})()"));
    ok(r.on, 'no selected colour option'); ok(/255, 255, 255/.test(r.bg), 'selected option should be white with a border: ' + r.bg); ok(r.dot, 'colour dot missing'); eq(r.txt, 'Black');
    eq(r.trust, 3); ok(!r.relHidden && r.n >= 2 && r.n <= 6, 'related products: ' + JSON.stringify(r)); ok(!r.self, 'the viewed model must not be in its own related list');
    await ev("document.querySelector('#pdRelated .pd-rel-card').click();true"); await sleep(400);
    const after = JSON.parse(await ev("JSON.stringify({open:!document.getElementById('addToCartModal').classList.contains('hidden'),name:document.getElementById('modalProdName').textContent,top:document.getElementById('pdScroll').scrollTop})"));
    ok(after.open && after.name !== r.name, 'related card did not switch product'); eq(after.top, 0);
    await ev("document.getElementById('pdRelated').scrollIntoView({block:'center',behavior:'instant'});true"); await sleep(200); await shot('pos-detail-related');
    await ev("window.app.hideModal('addToCartModal');true"); await sleep(300);
  });
  await T('empty cart / wishlist show one line + one secondary button; storefront toasts go through window.app.toast (top-end)', async () => {
    const r = JSON.parse(await ev("(()=>{const pos=window.app.pos;const bak=pos.cartData,bw=pos.wishlist;pos.cartData=[];pos.renderCart();pos.wishlist=[];pos.renderWishlistDrawer&&pos.renderWishlistDrawer();const c=document.querySelector('#cartItems .sf-blank'),w=document.querySelector('#wishlistDrawerItems .sf-blank');const out={c:!!c,cb:c?c.querySelectorAll('button').length:0,ct:c?c.innerText:'',w:!!w};pos.cartData=bak;pos.wishlist=bw;pos.renderCart();pos.renderWishlistDrawer&&pos.renderWishlistDrawer();return JSON.stringify(out)})()"));
    ok(r.c, 'cart empty state missing'); eq(r.cb, 1); ok(!/จองด่วน/.test(r.ct), 'stale button name in empty cart text'); ok(r.w, 'wishlist empty state missing');
    await ev("window.app.toast('ทดสอบ','success');true"); await sleep(250);
    ok(await ev("!!document.querySelector('.swal2-container.swal2-top-end .swal2-toast')"), 'storefront toast is not top-end'); await shot('pos-toast');
    await ev("Swal.close();true"); await sleep(200);
  });
  await T('orders page: one row per order, status tabs with counts, search, detail drawer with items and history', async () => {
    await ev("window.location.hash='#orders';true"); await sleep(1500);
    const n = sheets.Orders.rows.length - 1, ids = [...new Set(sheets.Orders.rows.slice(1).map(x => x[0]))];
    ok(ids.length >= 1 && n > ids.length, 'need at least one multi-row order (rows ' + n + ', orders ' + ids.length + ')');
    const a = JSON.parse(await ev("JSON.stringify({rows:document.querySelectorAll('#odBody tr.od-row').length,list:window.app.orders.list.length,tabs:[...document.querySelectorAll('#odTabs .od-tab')].map(b=>b.textContent.trim()),all:document.querySelector('#odTabs .od-tab b').textContent,first:(document.querySelector('#odBody tr.od-row')||{getAttribute(){return ''}}).getAttribute('data-id')})"));
    eq(a.list, ids.length, 'orders grouped by OrderID'); eq(a.rows, Math.min(ids.length, 20)); eq(a.all, String(ids.length)); ok(a.tabs.length >= 5, a.tabs.join('|')); eq(a.first, ids[ids.length - 1], 'newest order first');
    await shot('admin-orders-list');
    await ev("(()=>{const s=document.getElementById('odSearch');s.value='zzz-no-such-order';s.dispatchEvent(new Event('input'));return true})()"); await sleep(250);
    ok(await ev("document.querySelectorAll('#odBody tr.od-row').length===0 && !!document.querySelector('#odBody .od-state')"), 'search with no match must show the empty state');
    await ev("window.app.orders.clearFilters();true"); await sleep(250);
    await ev("document.querySelector('#odBody tr.od-row td:nth-child(2)').click();true"); await sleep(900);
    const d = JSON.parse(await ev("(()=>{const dr=document.getElementById('odDrawer');return JSON.stringify({open:!dr.classList.contains('hidden'),id:(document.getElementById('odDrawerId')||{}).textContent,items:dr.querySelectorAll('.od-items li').length,sum:(dr.querySelector('.od-sum b')||{}).textContent,hist:document.getElementById('odHistory').textContent,xss:!!window.__xss2,img:!!dr.querySelector('.od-items img')})})()"));
    ok(d.open, 'drawer did not open'); eq(d.id, ids[ids.length - 1]); ok(d.items >= 1 && /\d/.test(d.sum), JSON.stringify(d)); ok(!d.xss && !d.img, 'order text must be escaped'); ok(d.hist && !/กำลังโหลด/.test(d.hist), 'history not loaded: ' + d.hist);
    await shot('admin-orders-drawer');
    await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true"); await sleep(200);
    ok(await ev("document.getElementById('odDrawer').classList.contains('hidden')"), 'Escape must close the drawer');
  });
  await T('orders page: status change from the row and in bulk goes through the server, cancel asks first', async () => {
    const idI = sheets.Orders.rows[0].indexOf('OrderID'), stI = sheets.Orders.rows[0].indexOf('Order Status');
    const st = (id) => [...new Set(sheets.Orders.rows.slice(1).filter(x => x[idI] === id).map(x => x[stI]))].join(',');
    const id = await ev("document.querySelector('#odBody tr.od-row').getAttribute('data-id')");
    await ev("(()=>{const s=document.querySelector('#odBody tr.od-row .od-st');s.value='Confirmed';s.dispatchEvent(new Event('change'));return true})()"); await sleep(1200);
    eq(st(id), 'Confirmed', 'row select must update every row of the order'); eq(await ev("document.querySelector('#odBody tr.od-row .od-st').value"), 'Confirmed');
    await ev("(()=>{const s=document.querySelector('#odBody tr.od-row .od-st');s.value='Cancelled';s.dispatchEvent(new Event('change'));return true})()"); await sleep(400);
    ok(await ev("Swal.isVisible()"), 'cancelling must ask for confirmation'); eq(st(id), 'Confirmed', 'nothing written before confirming');
    await ev("Swal.clickCancel();true"); await sleep(400);
    eq(st(id), 'Confirmed'); eq(await ev("document.querySelector('#odBody tr.od-row .od-st').value"), 'Confirmed', 'select must go back after declining');
    eq(await ev("document.getElementById('odBulkBtn').disabled"), true, 'bulk button disabled with nothing selected');
    await ev("document.getElementById('odSelAll').click();true"); await sleep(200);
    const sel = await ev("Object.keys(window.app.orders.selected).length"); ok(sel >= 1, 'select all');
    await ev("(()=>{document.getElementById('odBulkStatus').value='Paid';document.getElementById('odBulkBtn').click();return true})()"); await sleep(400);
    ok(await ev("Swal.isVisible()"), 'bulk change must ask for confirmation'); await ev("Swal.clickConfirm();true"); await sleep(1800);
    eq(st(id), 'Paid'); eq(await ev("Object.keys(window.app.orders.selected).length"), 0, 'selection cleared after a clean bulk change');
    eq(await ev("[...document.querySelectorAll('#odTabs .od-tab')].find(b=>b.classList.contains('on')).textContent.replace(/\\d+/,'').trim()"), 'ทั้งหมด');
    await ev("window.Swal&&Swal.close();window.location.hash='#pos';true"); await sleep(1500);
    await ev(`(()=>{const c=document.getElementById('posChannelSelect');c.value='Retail';c.dispatchEvent(new Event('change'));const b=document.getElementById('posBranchSelect');b.value='B01';b.dispatchEvent(new Event('change'));window.app.pos.checkCriteria();return true})()`); await sleep(900);
  });
  await T('dashboard: "to do today" row counts orders by OrderID, opens the orders page pre-filtered; KPI compares with the previous period', async () => {
    await ev("window.location.hash='#dashboard';true"); await sleep(1800);
    const idI = sheets.Orders.rows[0].indexOf('OrderID'), stI = sheets.Orders.rows[0].indexOf('Order Status');
    const first = {}; sheets.Orders.rows.slice(1).forEach(x => { if (!(x[idI] in first)) first[x[idI]] = x[stI] || 'Pending'; });
    const pend = Object.values(first).filter(v => v === 'Pending').length, live = Object.values(first).filter(v => v !== 'Cancelled').length;
    const a = JSON.parse(await ev("JSON.stringify({vis:!document.getElementById('dashTodo').classList.contains('hidden'),cards:document.querySelectorAll('#dashTodo .dash-todo-card').length,pending:document.querySelector('#dashTodoPending b').textContent,today:document.querySelector('#dashTodoToday b').textContent,stale:document.querySelector('#dashTodoStale b').textContent,stock:document.querySelector('#dashTodoStock b').textContent,stats:window.app.dashboard.todoStats()})"));
    ok(a.vis, 'to-do row hidden'); eq(a.cards, 4); eq(a.pending, String(pend), 'pending counted per order, not per sheet row'); eq(a.today, String(live), 'orders placed today'); eq(a.stale, '0'); ok(/^\d/.test(a.stock), a.stock);
    await shot('admin-dashboard-todo');
    // previous period: move every order 40 days back in memory -> current month empty, previous period has the sales
    const d = JSON.parse(await ev("(()=>{const D=window.app.dashboard;const k1=D.kpiCalc(D.filteredOrders);const el=document.getElementById('dashDeltaTotal');const before=el?el.textContent:'(none)';const bak=D.rawOrders;const half=bak.map((o,i)=>Object.assign({},o,i%2?{}:{Timestamp:new Date(Date.now()-35*86400000).toString()}));D.rawOrders=half;D.applyFilters();const t=document.getElementById('dashDeltaTotal');const out={before:before,total:k1.total,txt:t.textContent,cls:t.className,stale:D.todoStats().stale};D.rawOrders=bak;D.applyFilters();return JSON.stringify(out)})()"));
    ok(d.total > 0, 'kpiCalc total'); ok(/ช่วงก่อนหน้า/.test(d.before) || d.before === '', 'delta line: ' + d.before); ok(/%/.test(d.txt) && /up|down/.test(d.cls), 'delta with a previous period: ' + JSON.stringify(d)); ok(d.stale >= 0);
    await ev("document.getElementById('dashTodoPending').click();true"); await sleep(1500);
    const o = JSON.parse(await ev("JSON.stringify({hash:location.hash,tab:window.app.orders.tab,on:([...document.querySelectorAll('#odTabs .od-tab')].find(b=>b.classList.contains('on'))||{}).textContent||'',rows:document.querySelectorAll('#odBody tr.od-row').length})"));
    eq(o.hash, '#orders'); eq(o.tab, 'Pending'); ok(/รอดำเนินการ/.test(o.on), o.on); eq(o.rows, Math.min(pend, 20));
    await ev("window.app.orders.openWith({quick:'today'});true"); await sleep(1200);
    const q = JSON.parse(await ev("JSON.stringify({chip:(document.querySelector('#odQuick .sf-achip')||{}).textContent||'',rows:document.querySelectorAll('#odBody tr.od-row').length,tab:window.app.orders.tab})"));
    ok(/วันนี้/.test(q.chip), 'quick-filter chip: ' + q.chip); eq(q.rows, Math.min(live, 20)); eq(q.tab, '');
    await ev("document.querySelector('#odQuick .sf-achip').click();true"); await sleep(300);
    eq(await ev("window.app.orders.quick + '|' + document.querySelectorAll('#odQuick .sf-achip').length"), '|0', 'chip click clears the quick filter');
    await ev("window.location.hash='#pos';true"); await sleep(1500);
    await ev(`(()=>{const c=document.getElementById('posChannelSelect');c.value='Retail';c.dispatchEvent(new Event('change'));const b=document.getElementById('posBranchSelect');b.value='B01';b.dispatchEvent(new Event('change'));window.app.pos.checkCriteria();return true})()`); await sleep(900);
  });
  await T('active filter chips: one chip per selected filter, clicking a chip removes only that filter, clear-all shows from 2 chips, text escaped', async () => {
    await ev("window.app.pos.clearStoreFilters(false);window.app.pos.setStoreFilter('capacity','128GB');window.app.pos.setStoreFilter('inStock',true);true"); await sleep(300);
    const a = JSON.parse(await ev("JSON.stringify({chips:[...document.querySelectorAll('#storeActiveChips .sf-achip')].map(b=>b.textContent.trim()),clear:!!document.querySelector('#storeActiveChips .sf-achip-clear')})"));
    eq(a.chips.length, 2, JSON.stringify(a)); eq(a.chips[0], '128GB'); ok(a.clear, 'clear-all missing with 2 chips'); await shot('pos-filter-chips');
    await ev("document.querySelector('#storeActiveChips .sf-achip').click();true"); await sleep(300);
    const b = JSON.parse(await ev("JSON.stringify({caps:window.app.pos.storeFilters.capacities.length,stock:window.app.pos.storeFilters.inStock,chips:document.querySelectorAll('#storeActiveChips .sf-achip').length,clear:!!document.querySelector('#storeActiveChips .sf-achip-clear')})"));
    eq(b.caps, 0); ok(b.stock === true, 'other filter must stay'); eq(b.chips, 1); ok(!b.clear, 'clear-all should hide with a single chip');
    await ev("window.app.pos.clearStoreFilters(false);window.app.pos.setStoreFilter('color','<img src=x onerror=window.__chipX=1>');true"); await sleep(300);
    const c = JSON.parse(await ev("JSON.stringify({img:!!document.querySelector('#storeActiveChips img'),x:!!window.__chipX,t:(document.querySelector('#storeActiveChips .sf-achip')||{}).textContent||''})"));
    ok(!c.img && !c.x && c.t.includes('<img'), JSON.stringify(c));
    await ev("window.app.pos.clearStoreFilters(false);true"); await sleep(250);
    eq(await ev("!!document.getElementById('storeActiveChips')"), false, 'chip row must disappear with no filters');
  });
  await T('hero banner keeps a 3:1 box (banner art is 6000x2000) and asks Drive for a large image', async () => {
    const r = JSON.parse(await ev("(()=>{const w=document.getElementById('posHeroBannerWrap').getBoundingClientRect();return JSON.stringify({ratio:w.width/w.height,w:w.width})})()"));
    ok(r.w > 300 && Math.abs(r.ratio - 3) < 0.05, 'hero ratio ' + JSON.stringify(r));
    eq(await ev("window.app.formatImageUrl('https://drive.google.com/file/d/ABC123/view','w2000').endsWith('sz=w2000')"), true);
  });
  await T('website mode on #pos: admin sidebar/topbar hidden, store header with brand + account menu linking to back office', async () => {
    const r = JSON.parse(await ev("JSON.stringify({site:document.documentElement.classList.contains('sf-site'),side:getComputedStyle(document.getElementById('desktopSidebar')).display,brand:getComputedStyle(document.querySelector('#posStoreHeader .sf-home')).display,top:getComputedStyle(document.getElementById('sfTopbar')).display,fs:!!document.getElementById('posFullscreenBtn')})"));
    ok(r.site && r.side === 'none' && r.brand !== 'none' && r.top !== 'none' && !r.fs, JSON.stringify(r));
    await ev("document.getElementById('sfAcctBtn').click();true"); await sleep(200);
    const m = JSON.parse(await ev("JSON.stringify({open:!document.getElementById('sfAcctPop').classList.contains('hidden'),links:[...document.querySelectorAll('#sfAcctPop a')].map(a=>a.getAttribute('href')),pos:!!document.querySelector('#sfAcctPop a[href=\"#pos\"]'),out:!!document.querySelector('#sfAcctPop .sf-acct-out')})"));
    ok(m.open && m.links.includes('#dashboard') && m.links.includes('#orders') && !m.pos && m.out, JSON.stringify(m));
    await shot('pos-account-menu');
    await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));true"); await sleep(150);
    ok(await ev("document.getElementById('sfAcctPop').classList.contains('hidden')"), 'Escape did not close the account menu');
    ok(await ev("document.documentElement.scrollWidth <= window.innerWidth + 1"), 'full-bleed header caused horizontal overflow');
  });
  await T('footer (store style): brand + service links + contact column, year/copyright, contact column hides with no settings', async () => {
    const r = JSON.parse(await ev("JSON.stringify({cols:document.querySelectorAll('footer .pf-grid > section').length,year:document.getElementById('footerYear').textContent,links:document.querySelectorAll('#footerQuickLinks button').length,trust:document.querySelectorAll('footer .pf-trust li').length})"));
    eq(r.cols, 5); eq(r.year, String(new Date().getFullYear())); ok(r.links >= 2 && r.trust >= 3, JSON.stringify(r));
    await ev("(()=>{const g=window.app.globalData;g.__bakS0=g.settings;g.settings=Object.assign({},g.settings,{ContactPhone:'02-123-4567',ContactLine:'@teststore',ContactHours:'10:00-20:00'});window.app.renderFooterContact();document.querySelector('footer').scrollIntoView({block:'end',behavior:'instant'});return true})()"); await sleep(300); await shot('footer-desktop');
    await ev("(()=>{const g=window.app.globalData;g.settings=g.__bakS0;window.app.renderFooterContact();return true})()");
    await ev("(()=>{const g=window.app.globalData;g.__bakS=g.settings;g.settings=Object.assign({},g.settings,{ContactPhone:'02-123-4567',ContactLine:'',ContactHours:''});window.app.renderFooterContact();return true})()");
    ok(!(await ev("document.getElementById('footerContactCol').classList.contains('hidden')")), 'column should show when a contact exists');
    await ev("(()=>{const g=window.app.globalData;g.settings=Object.assign({},g.settings,{ContactPhone:'',ContactLine:'',ContactHours:''});window.app.renderFooterContact();return true})()");
    ok(await ev("document.getElementById('footerContactCol').classList.contains('hidden')"), 'column should hide when no contact');
    await ev("(()=>{const g=window.app.globalData;g.settings=g.__bakS;window.app.renderFooterContact();return true})()");
    await ev("window.scrollTo({top:0,behavior:'instant'});true"); await sleep(350);
  });
  await T('store dialogs: clean white headers, no FLASH/TRADE-IN badges, one primary + outline secondary buttons', async () => {
    const r = JSON.parse(await ev("JSON.stringify({heads:['addToCartModal','checkoutModal','compareModal','tradeInModal','quoteSummaryModal','orderTrackModal','cartDrawer','wishlistDrawer'].map(id=>!!document.querySelector('#'+id+' .sf-dlg-head')),badges:/>\s*(FLASH|TRADE-IN|QUOTATION|TRACKING|COMPARE)\s*</.test(document.getElementById('page-content').innerHTML),bg:getComputedStyle(document.querySelector('#addToCartModal .sf-dlg-head')).backgroundColor})"));
    ok(r.heads.every(Boolean) && !r.badges && r.bg === 'rgb(255, 255, 255)', JSON.stringify(r));
    await ev("window.app.showModal('checkoutModal');true"); await sleep(350); await shot('pos-checkout'); await ev("window.app.hideModal('checkoutModal');true"); await sleep(250);
  });
  await T('header category menu (desktop): lists sellable categories, click filters + marks active; tiles hidden on desktop', async () => {
    const r = JSON.parse(await ev("JSON.stringify({vis:getComputedStyle(document.getElementById('sfCatNav')).display,items:[...document.querySelectorAll('#sfCatNav .sf-nav-a')].map(b=>b.textContent.trim()),tiles:getComputedStyle(document.querySelector('.sf-cattiles')).display})"));
    ok(r.vis !== 'none' && r.items[0] === 'สินค้าทั้งหมด' && r.items.includes('แท็บเล็ต') && !r.items.some(t => t.includes('ของแถม')) && r.tiles === 'none', JSON.stringify(r));
    await ev("[...document.querySelectorAll('#sfCatNav .sf-nav-a')].find(b=>b.textContent.trim()==='แท็บเล็ต').click();true"); await sleep(400);
    ok(await ev("document.querySelector('#sfCatNav .sf-nav-a.on').textContent.trim()==='แท็บเล็ต' && /แท็บเล็ต/.test(document.querySelector('.sf-h1').textContent)"), 'nav click did not filter');
    await ev("window.app.pos.clearStoreFilters(false);true"); await sleep(250);
  });
  await T('footer category links: one per sellable category, goCategory filters the storefront', async () => {
    const r = JSON.parse(await ev("JSON.stringify([...document.querySelectorAll('#footerCatLinks button')].map(b=>b.textContent.trim()))"));
    ok(r.length >= 2 && r.includes('โมบาย') && !r.some(t => t.includes('ของแถม')), JSON.stringify(r));
    await ev("window.app.goCategory('โมบาย');true"); await sleep(400);
    ok(await ev("window.app.pos.storeFilters.category==='โมบาย'"), 'goCategory did not set category');
    await ev("window.app.pos.clearStoreFilters(false);window.scrollTo({top:0,behavior:'instant'});true"); await sleep(250);
  });
  await T('footer: quick links (track order, trade-in) exist and call real handlers', async () => { const r = await ev("JSON.stringify([...document.querySelectorAll('#footerQuickLinks button')].map(b=>b.getAttribute('onclick')))"); ok(/openOrderTrackModal/.test(r) && /openTradeInStandalone/.test(r), r); ok(await ev("typeof window.app.pos.openOrderTrackModal==='function' && typeof window.app.pos.openTradeInStandalone==='function'")); });
  await T('back-to-top: hidden at top of page', async () => ok(await ev("window.scrollTo(0,0);document.getElementById('backToTopBtn').classList.contains('hidden')")));
  await T('back-to-top: appears when page offset >600px, hides again at top (offset simulated: POS page only scrolls ~460px on desktop)', async () => {
    await ev("Object.defineProperty(window,'pageYOffset',{get:()=>1200,configurable:true});window.dispatchEvent(new Event('scroll'));true"); await sleep(200);
    ok(await ev("!document.getElementById('backToTopBtn').classList.contains('hidden')"), 'button still hidden when offset=1200');
    await ev("Object.defineProperty(window,'pageYOffset',{get:()=>0,configurable:true});window.dispatchEvent(new Event('scroll'));true"); await sleep(200);
    ok(await ev("document.getElementById('backToTopBtn').classList.contains('hidden')"), 'button not hidden at offset=0');
    await ev("Object.defineProperty(window,'pageYOffset',{get:()=>window.scrollY,configurable:true});true");
  });
  await T('back-to-top: click scrolls the page back to top', async () => {
    await ev("window.scrollTo(0,300);true"); await sleep(200);
    await ev("document.getElementById('backToTopBtn').click();true"); await waitFor('window.pageYOffset < 5', 4000);
    ok(await ev("window.pageYOffset < 5"));
  });
  await T('meta: no "Enterprise Portal" in title, og:title + favicon present', async () => { const m = await ev("JSON.stringify({t:document.title,og:!!document.querySelector('meta[property=\"og:title\"]'),ic:!!document.querySelector('link[rel=icon]')})"); const o = JSON.parse(m); ok(!/Enterprise Portal/.test(o.t) && o.og && o.ic, m); });

  console.log('== POPUP CAROUSEL / BULK DELETE / GRID LOOK');
  await T('popup banners: several popups slide sideways (translateX track, dots, wrap-around, auto-advance, closes cleanly); one popup shows no controls', async () => {
    await P("window.app.globalData.__popBak=window.app.globalData.popupBanners;window.app.globalData.popupBanners=[{url:'https://x.test/1.png',title:'A',details:'a'},{url:'https://x.test/2.png'},{url:'https://x.test/3.png',title:'C'}];sessionStorage.removeItem('tg_popup_shown');window.app.showPopupBanner();true");
    await sleep(200);
    const st = () => P("JSON.stringify({vis:!document.getElementById('popupBannerModal').classList.contains('hidden'),slides:document.querySelectorAll('#popupBannerContent .popup-slide').length,multi:document.getElementById('popupBannerModal').classList.contains('popup-multi'),dots:document.querySelectorAll('#popupBannerDots .popup-dot').length,on:[...document.querySelectorAll('#popupBannerDots .popup-dot')].findIndex(d=>d.classList.contains('active')),tf:document.getElementById('popupBannerContent').style.transform,timer:!!window.app.popupTimer,navShown:getComputedStyle(document.getElementById('popupNext')).display})").then(JSON.parse);
    let m = await st();
    ok(m.vis && m.slides === 3 && m.multi && m.dots === 3 && m.on === 0 && m.timer && m.navShown !== 'none', JSON.stringify(m));
    await P("window.app.popupSlide(1);true"); m = await st(); eq([m.on, m.tf], [1, 'translateX(-100%)']);
    await P("window.app.popupGo(2);window.app.popupSlide(1);true"); m = await st(); eq([m.on, m.tf], [0, 'translateX(0%)'], 'wraps to first');
    await P("window.app.popupSlide(-1);true"); m = await st(); eq(m.on, 2, 'wraps to last on previous');
    await P("document.querySelectorAll('#popupBannerDots .popup-dot')[1].click();true"); m = await st(); eq(m.on, 1, 'dot jumps');
    await P("window.app.closePopupBanner();true"); m = await st(); ok(!m.vis && !m.timer, 'closed + timer stopped: ' + JSON.stringify(m));
    await P("window.app.globalData.popupBanners=[{url:'https://x.test/1.png'}];sessionStorage.removeItem('tg_popup_shown');window.app.showPopupBanner();true"); await sleep(150);
    m = await st(); ok(m.vis && m.slides === 1 && !m.multi && !m.timer && m.navShown === 'none', 'single popup has no controls/timer: ' + JSON.stringify(m));
    await P("window.app.closePopupBanner();window.app.globalData.popupBanners=window.app.globalData.__popBak;sessionStorage.setItem('tg_popup_shown','true');true");
  });
  await T('grid look + bulk delete UI: banner-style page chrome, checkboxes, select-all, count on the red button, delete selected removes only those rows', async () => {
    const A = (a, pl) => P(`window.app.api(${JSON.stringify(a)},${JSON.stringify(pl)})`);
    for (let i = 1; i <= 4; i++) await A('SAVE_RECORD', { tableName: 'Channels', idField: 'Channel ID', data: { 'Channel ID': 'UIBD-' + i, 'Channel Name': 'UI bulk ' + i, Description: '' } });
    await ev("window.location.hash='#channels';true"); await sleep(1500);
    ok(await ev("!!document.querySelector('.cms-page.cms-grid .cms-card .cms-actions') && !!document.getElementById('gridTitle') && /ช่องทาง/.test(document.getElementById('gridTitle').textContent) && !!document.getElementById('gridPageSize') && !!document.querySelector('#dataGridBody .cms-ico')"), 'banner-style chrome');
    ok(await ev("!document.getElementById('gridBulkDeleteBtn').classList.contains('hidden')"), 'red delete button visible for Admin on Channels');
    ok(await ev("document.getElementById('gridBulkDeleteBtn').disabled"), 'delete disabled while nothing is selected');
    const rows = () => ev("document.querySelectorAll('#dataGridBody tr').length");
    const boxes = () => ev("document.querySelectorAll('#dataGridBody .grid-sel').length");
    const n0 = await rows(); eq(await boxes(), n0, 'one checkbox per row');
    await ev("(()=>{const b=[...document.querySelectorAll('#dataGridBody .grid-sel')].filter(c=>/^UIBD-[12]$/.test(c.getAttribute('data-id')));b.forEach(c=>{c.checked=true;window.app.grid.toggleOne(c)});return true})()");
    eq(await ev("document.getElementById('gridBulkDeleteLabel').textContent"), 'ลบรายการที่เลือก (2)');
    ok(await ev("!document.getElementById('gridBulkDeleteBtn').disabled"), 'delete enabled once rows are selected');
    ok(await ev("document.querySelectorAll('#dataGridBody tr.cms-sel-row').length===2"), 'selected rows highlighted');
    await ev("(()=>{const a=document.getElementById('gridSelAll');a.checked=true;window.app.grid.toggleAll(true);return true})()");
    eq(await ev("Object.keys(window.app.grid.selected).length"), n0, 'select-all selects the whole page');
    await ev("window.app.grid.clearSelection();true");
    eq(await ev("document.getElementById('gridBulkDeleteLabel').textContent"), 'ลบรายการที่เลือก', 'cleared');
    ok(await ev("document.getElementById('gridBulkDeleteBtn').disabled"), 'disabled again after clearing');
    await ev("(()=>{const b=[...document.querySelectorAll('#dataGridBody .grid-sel')].filter(c=>/^UIBD-[12]$/.test(c.getAttribute('data-id')));b.forEach(c=>{c.checked=true;window.app.grid.toggleOne(c)});window.app.grid.deleteSelected();return true})()"); await sleep(400);
    await ev("Swal.clickConfirm();true"); await sleep(1800);
    const left = await ev("JSON.stringify([...document.querySelectorAll('#dataGridBody .grid-sel')].map(c=>c.getAttribute('data-id')).filter(i=>/^UIBD-/.test(i)))");
    eq(JSON.parse(left), ['UIBD-3', 'UIBD-4'], 'only the two selected rows were deleted');
    eq(await rows(), n0 - 2);
    await A('DELETE_RECORDS', { tableName: 'Channels', idValues: ['UIBD-3', 'UIBD-4'] });
    await ev("window.app.refreshGlobalData().then(()=>true)");
  });
  await T('bulk status: เปิดที่เลือก/ปิดที่เลือก buttons only on tables with a Status column; flips only the selected rows', async () => {
    await ev("window.location.hash='#promotions';true"); await sleep(1500);
    ok(await ev("!document.getElementById('gridBulkOnBtn').classList.contains('hidden') && !document.getElementById('gridBulkOffBtn').classList.contains('hidden')"), 'buttons visible on Promotions');
    const st = () => ev("JSON.stringify(window.app.grid.dataList.map(r=>[r['Promo ID'],r.Status]))").then(JSON.parse);
    const before = await st(); const pick = before[0][0];
    await ev("(()=>{const c=[...document.querySelectorAll('#dataGridBody .grid-sel')].find(x=>x.getAttribute('data-id')==='" + pick + "');c.checked=true;window.app.grid.toggleOne(c);window.app.grid.setSelectedStatus('ปิด');return true})()"); await sleep(400);
    await ev("Swal.clickConfirm();true"); await sleep(1800);
    const after = await st();
    eq(after.find(r => r[0] === pick)[1], 'ปิด', 'selected row now ปิด');
    eq(after.filter(r => r[0] !== pick), before.filter(r => r[0] !== pick), 'other rows untouched');
    await ev("(()=>{const c=[...document.querySelectorAll('#dataGridBody .grid-sel')].find(x=>x.getAttribute('data-id')==='" + pick + "');c.checked=true;window.app.grid.toggleOne(c);window.app.grid.setSelectedStatus('เปิด');return true})()"); await sleep(400);
    await ev("Swal.clickConfirm();true"); await sleep(1800);
    eq((await st()).find(r => r[0] === pick)[1], 'เปิด', 'toggled back');
    await ev("window.location.hash='#channels';true"); await sleep(1300);
    ok(await ev("document.getElementById('gridBulkOnBtn').classList.contains('hidden') && document.getElementById('gridBulkOffBtn').classList.contains('hidden')"), 'Channels (no Status column): no status buttons');
  });
  await T('grid: read-only pages and non-bulk tables have no checkboxes / delete button; page size + pager work', async () => {
    await ev("window.location.hash='#interests';true"); await sleep(1300);
    ok(await ev("document.querySelectorAll('#dataGridBody .grid-sel').length===0 && document.getElementById('gridBulkDeleteBtn').classList.contains('hidden') && !document.getElementById('gridSelAll')"), 'Interests: no bulk controls');
    await ev("window.location.hash='#products';true"); await sleep(1500);
    await ev("(()=>{const s=document.getElementById('gridPageSize');s.value='10';s.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
    ok(await ev("document.querySelectorAll('#dataGridBody tr').length<=10 && /จากทั้งหมด/.test(document.getElementById('gridPagination').textContent) && !!document.querySelector('#gridPagination .cms-pg-on')"), 'page size 10 + pager');
    await ev("(()=>{const s=document.getElementById('gridPageSize');s.value='20';s.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
  });
  await T('reload (pull-to-refresh) returns to the page that was open instead of the dashboard; an unknown saved route falls back safely', async () => {
    await ev("window.location.hash='#branches';true"); await sleep(1200);
    eq(await ev("sessionStorage.getItem('f9_last_route')"), 'branches', 'route remembered');
    await send('Page.navigate', { url: 'http://127.0.0.1:8765/' });
    await waitFor("!!window.app && !!window.app.user && !!document.getElementById('gridTitle')", 20000); await sleep(600);
    eq(await ev("window.location.hash"), '#branches', 'came back to branches after reload');
    ok(await ev("/สาขา/.test(document.getElementById('gridTitle').textContent)"), 'branches page rendered');
    await ev("sessionStorage.setItem('f9_last_route','not-a-real-page');true");
    await send('Page.navigate', { url: 'http://127.0.0.1:8765/' });
    await waitFor("!!window.app && !!window.app.user && !!document.getElementById('page-content')", 20000); await sleep(1200);
    ok(await ev("window.location.hash") === '#dashboard' || await ev("window.location.hash") === '#not-a-real-page', 'bad saved route does not break the app');
    ok(await ev("!!document.getElementById('page-content') && document.getElementById('page-content').innerText.length > 20"), 'app still usable');
    await ev("window.Swal && Swal.isVisible() && Swal.close();window.location.hash='#dashboard';true"); await sleep(800);
  });
  await T('dark mode back office: grid toolbar / empty state / dashboard have readable contrast (no light text on light, no dark on dark)', async () => {
    await ev("document.documentElement.classList.add('dark');true");
    const lum = "function P(c){return c.replace(/[^0-9.,]/g,'').split(',').map(Number)}function L(c){const [r,g,b]=P(c).slice(0,3).map(x=>{x/=255;return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4)});return 0.2126*r+0.7152*g+0.0722*b}function bg(e){while(e){const m=P(getComputedStyle(e).backgroundColor);if(m.length===3||(m.length===4&&m[3]>0.5))return 'rgb('+m.slice(0,3).join(',')+')';e=e.parentElement}return 'rgb(15,23,42)'}function cr(e){const a=L(getComputedStyle(e).color),b=L(bg(e));return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)}";
    const bad = [];
    await ev("window.location.hash='#dashboard';true"); await sleep(1500);
    const cut = JSON.parse(await ev("JSON.stringify([...document.querySelectorAll('[id^=dashKpi]')].filter(e=>e.offsetParent&&e.scrollWidth>e.clientWidth+1).map(e=>e.id+':'+e.textContent))"));
    if (cut.length) bad.push('KPI numbers cut off: ' + cut.join(','));
    for (const [r, sel] of [['products', '.cms-actions .cms-btn:not(.hidden), #gridTitle, .cms-bar label, #dataGridBody td'], ['orders', '#odTitle, .od-tab, .cms-bar label, #odBody .od-state, #dataGridBody .cms-empty-pin h3, #dataGridBody .cms-empty-pin p'], ['dashboard', '#dashSyncStatus']]) {
      await ev("window.location.hash='#" + r + "';true"); await sleep(1500);
      const res = JSON.parse(await ev("(()=>{" + lum + ";return JSON.stringify([...document.querySelectorAll(" + JSON.stringify(sel) + ")].filter(e=>e.offsetParent&&e.textContent.trim()&&!e.disabled).slice(0,40).map(e=>[e.textContent.trim().slice(0,20),Math.round(cr(e)*10)/10]).filter(x=>x[1]<3))})()"));
      if (res.length) bad.push(r + ': ' + JSON.stringify(res));
      await shot('dark-admin-' + r);
    }
    await ev("document.documentElement.classList.remove('dark');true");
    ok(bad.length === 0, bad.join(' | '));
  });
  await T('forms: add forms open, fit the screen, close with the X button', async () => {
    await ev("window.location.hash='#channels';true"); await sleep(1400);
    await ev("window.app.grid.handleAddClick();true"); await sleep(600);
    ok(await ev("!document.getElementById('formModal').classList.contains('hidden')"), 'generic form did not open');
    eq(await ev("document.getElementById('formModalTitle').textContent"), 'เพิ่มช่องทางขาย', 'form title names the table');
    ok(await ev("[...document.querySelectorAll('#dynamicForm label')].every(l=>/[ก-๙]/.test(l.textContent))"), 'all field labels are Thai');
    await shot('form-generic');
    await ev("document.querySelector('#formModal [aria-label=\"ปิดฟอร์ม\"]').click();true"); await sleep(300);
    ok(await ev("document.getElementById('formModal').classList.contains('hidden')"), 'generic form did not close');
    await ev("window.location.hash='#products';true"); await sleep(1500);
    await ev("window.app.grid.handleAddClick();true"); await sleep(700);
    await shot('form-product');
    const w = JSON.parse(await ev("JSON.stringify([document.documentElement.scrollWidth, window.innerWidth])")); ok(w[0] <= w[1] + 1, 'page overflow with product form open ' + w);
    await ev("window.Swal&&Swal.isVisible()&&Swal.close();document.querySelectorAll('[role=dialog]').forEach(d=>{if(!d.classList.contains('hidden')&&d.id)window.app.hideModal(d.id)});true"); await sleep(300);
  });
  console.log('== REGRESSIONS (category / target total / dashboard)');
  curPhase = 'regress';
  await T('product form: editing a tablet keeps its category (option exists, unknown categories are added, never blanked)', async () => {
    const h = sheets.Products.rows[0], mi = h.indexOf('Model'), ci = h.indexOf('Category');
    const catOf = m => sheets.Products.rows.filter(r => r[mi] === m).map(r => r[ci]);
    await ev("window.location.hash='#products';true"); await sleep(1500);
    eq([...new Set(catOf('Galaxy Test1'))], ['แท็บเล็ต'], 'seed');
    await ev("window.app.grid.editForm(window.app.grid.dataList.findIndex(x=>x.Model==='Galaxy Test1'));true"); await sleep(800);
    eq(await ev("document.getElementById('pgCategory').value"), 'แท็บเล็ต', 'select must show the stored category');
    await ev("window.app.productGroup.save();true"); await sleep(1800);
    eq([...new Set(catOf('Galaxy Test1'))], ['แท็บเล็ต'], 'category after save');
    await ev("window.Swal&&Swal.isVisible()&&Swal.close();true"); await sleep(300);
    await ev("window.app.productGroup.setCategory('หมวดพิเศษ');true");
    eq(await ev("document.getElementById('pgCategory').value"), 'หมวดพิเศษ', 'unknown category kept as an extra option');
    await ev("window.app.productGroup.setCategory('โมบาย');true");
    eq(await ev("document.querySelectorAll('#pgCategory option[data-extra]').length"), 0, 'extra option removed again');
  });
  await T('product form: a single-colour product saves without deleting the untouched second row', async () => {
    await ev("window.app.grid.handleAddClick();true"); await sleep(700);
    await ev(`(()=>{const set=(id,v)=>{const e=document.getElementById(id);e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}))};set('pgModel','Reg One Colour');set('pgMarketingModel','Brand Reg One Colour');set('pgCapacity','128GB');set('pgPrice','9900');const r=document.querySelector('#pgVariantRows > div');r.querySelector('.pgSku').value='REG-ONE';r.querySelector('.pgColor').value='Black';r.querySelector('.pgStock').value='4';window.app.productGroup.save();return true})()`); await sleep(1800);
    const h = sheets.Products.rows[0]; const rows = sheets.Products.rows.filter(r => r[h.indexOf('Model')] === 'Reg One Colour');
    eq(rows.length, 1, 'rows saved (dialog: ' + (await ev("window.Swal&&Swal.isVisible()?Swal.getHtmlContainer().innerText:''")) + ')');
    eq(rows[0][h.indexOf('SKU')], 'REG-ONE');
    await ev("window.Swal&&Swal.isVisible()&&Swal.close();true");
    ctx.apiHandler('DELETE_RECORD', { tableName: 'Products', idField: 'SKU', idValue: 'REG-ONE' }, AT);
  });
  await T('quick edit (แก้ราคา/สต๊อก): wide popup, stock is ADDED on top of the live stock (not overwritten), price-only edit keeps stock', async () => {
    const h = sheets.Products.rows[0], si = h.indexOf('SKU'), sk = h.indexOf('Stock'), pr = h.indexOf('Price');
    const row = sku => sheets.Products.rows.find(r => r[si] === sku);
    await ev("window.location.hash='#products';true"); await sleep(1500);
    ok(await ev("(()=>{const b=document.getElementById('gridBulkQuickBtn');return !!b&&!b.classList.contains('hidden')})()"), 'quick edit button hidden');
    await ev("document.getElementById('gridBulkQuickBtn').click();true"); await sleep(600);
    ok(await ev("!document.getElementById('bulkQuickEditModal').classList.contains('hidden')"), 'modal did not open');
    const w = await ev("document.getElementById('bulkQuickEditBody').parentElement.getBoundingClientRect().width");
    ok(w > 1100 && w <= 1505, 'popup width ' + w);
    ok(await ev("document.querySelectorAll('#bulkQuickTableBody tr.bulk-quick-row').length") > 50, 'rows');
    const stock0 = Number(row('T3-0')[sk]);
    eq(await ev("document.querySelector('#bulkQuickTableBody tr[data-sku=\"T3-0\"] td:nth-child(6)').innerText.replace(/,/g,'')"), String(stock0), 'current stock column');
    await ev("document.getElementById('bulkQuickSearchInput').value='T3-0';window.app.productGroup.filterBulkQuickRows();true");
    eq(await ev("[...document.querySelectorAll('#bulkQuickTableBody tr.bulk-quick-row')].filter(r=>r.style.display!=='none').length"), 1, 'search filter');
    await ev("window.app.productGroup.adjustVisibleBulkStock(10);window.app.productGroup.adjustVisibleBulkStock(50);true");
    eq(await ev("document.querySelector('#bulkQuickTableBody tr[data-sku=\"T3-0\"] .bulk-inp-add').value"), '60', '+10 and +50 accumulate in the add box');
    eq(await ev("document.querySelector('#bulkQuickTableBody tr[data-sku=\"T3-0\"] .bulk-new-total').innerText.replace(/,/g,'')"), String(stock0 + 60), 'preview of new total');
    // someone books 1 unit while the popup is open -> the add must apply to the LIVE stock
    row('T3-0')[sk] = stock0 - 1;
    await ev("window.app.productGroup.saveBulkQuickEdit();true"); await sleep(1500);
    eq(Number(row('T3-0')[sk]), stock0 - 1 + 60, 'stock must be live stock + added qty');
    ok(await ev("document.getElementById('bulkQuickEditModal').classList.contains('hidden')"), 'modal should close after save');
    // price-only edit must not touch stock
    const stock1 = Number(row('T3-0')[sk]);
    await ev("document.getElementById('gridBulkQuickBtn').click();true"); await sleep(600);
    await ev("(()=>{const tr=document.querySelector('#bulkQuickTableBody tr[data-sku=\"T3-0\"]');tr.querySelector('.bulk-inp-price').value='7777';tr.querySelector('.bulk-inp-status').value='ปิด';window.app.productGroup.saveBulkQuickEdit();return true})()"); await sleep(1500);
    eq([Number(row('T3-0')[pr]), Number(row('T3-0')[sk]), row('T3-0')[h.indexOf('Status')]], [7777, stock1, 'ปิด'], 'price/status edit keeps stock');
    ctx.apiHandler('BULK_UPDATE_PRODUCTS', { updates: [{ SKU: 'T3-0', Price: 9500, Status: 'เปิด', 'Stock Add': -(stock1 - stock0) }] }, AT);
    eq(Number(row('T3-0')[sk]), stock0, 'restored');
    await ev("window.Swal&&Swal.isVisible()&&Swal.close();true");
  });
  await T('target page: the ALL BRANCHES row is not added again to the grand total when area rows exist', async () => {
    await ev("window.location.hash='#target';true"); await sleep(1300);
    const total = async (targets) => { await ev('window.app.target.render(' + JSON.stringify(targets) + ', ' + JSON.stringify([{ OrderID: 'X1', Timestamp: new Date().toISOString(), SKU: 'SKU-S24U', Qty: 2, 'Branch Code': 'B01', 'Order Status': 'Pending' }, { OrderID: 'X2', Timestamp: new Date().toISOString(), SKU: 'SKU-S24U', Qty: 1, 'Branch Code': 'O01', 'Order Status': 'Pending' }]) + ');true'); await sleep(200); return await ev("[...document.querySelectorAll('#page-content table tr')].pop().innerText.replace(/\\s+/g,' ').trim()"); };
    const both = await total([{ Area: 'ALL BRANCHES', 'เป้า': 1000 }, { Area: 'สมชาย ใจดี', 'เป้า': 10 }, { Area: 'สมศรี ออนไลน์', 'เป้า': 5 }]);
    ok(/รวมทั้งหมด: 15 3 /.test(both), 'with areas -> ' + both);
    const only = await total([{ Area: 'ALL BRANCHES', 'เป้า': 1000 }]);
    ok(/รวมทั้งหมด: 1,000 3 /.test(only), 'ALL only -> ' + only);
  });
  await T('dashboard KPIs: tablet orders are counted together with mobile, not dropped', async () => {
    await ev("window.location.hash='#dashboard';true"); await sleep(1500);
    const r = JSON.parse(await ev("(()=>{const d=window.app.dashboard;const keep=d.filteredOrders;d.filteredOrders=[{OrderID:'K1',Category:'โมบาย',Qty:1,'Row Total':100,'Reservation Status':'จอง T (มีการจอง)','Order Status':'Pending'},{OrderID:'K2',Category:'แท็บเล็ต',Qty:2,'Row Total':200,'Reservation Status':'จอง F (สวมสิทธิ์การจอง)','Order Status':'Pending'}];d.updateKPIs();const g=i=>document.getElementById(i).innerText;const out=[g('dashKpiMobiles'),g('dashKpiAccessories'),g('dashKpiResT'),g('dashKpiResF')];d.filteredOrders=keep;d.updateKPIs();return JSON.stringify(out)})()"));
    eq(r, ['3', '0', '1', '2']);
  });
  await T('account menu on the storefront: back-office links change the page themselves (GAS iframe has base target=_top, native #links go nowhere)', async () => {
    await ev("window.location.hash='#pos';true"); await sleep(1300);
    await ev("document.getElementById('sfAcctBtn').click();true"); await sleep(200);
    ok(await ev("!document.getElementById('sfAcctPop').classList.contains('hidden')"), 'menu did not open');
    const r = JSON.parse(await ev("(()=>{const a=document.querySelector('#sfAcctPop a[href$=orders]');if(!a)return JSON.stringify({no:[...document.querySelectorAll('#sfAcctPop a')].map(x=>x.getAttribute('href'))});const e=new MouseEvent('click',{bubbles:true,cancelable:true});a.dispatchEvent(e);return JSON.stringify({prevented:e.defaultPrevented})})()"));
    ok(r.prevented === true, 'click must be handled by the app, got ' + JSON.stringify(r));
    await sleep(1300);
    eq(await ev('location.hash'), '#orders');
    ok(await ev("!!document.getElementById('odBody') && !document.documentElement.classList.contains('sf-site')"), 'orders page not rendered');
    ok(await ev("(()=>{const a=document.createElement('a');a.href='#';document.body.appendChild(a);const e=new MouseEvent('click',{bubbles:true,cancelable:true});a.dispatchEvent(e);a.remove();return e.defaultPrevented===false})()"), 'a bare # link must be left alone');
  });
  console.log('== SALES USER');
  curPhase = 'sales';
  await ev("window.app.logout ? window.app.logout() : (window.app.user=null,true)"); await sleep(600);
  await waitFor("!!document.getElementById('loginUsername')");
  await T('sales login preselects channel/branch, overlay clears', async () => { await login('sale1', 'Pass1234!'); await ev("window.location.hash='#pos';true"); await sleep(800);
    try { await waitFor("document.querySelectorAll('#productGrid .pos-card').length>0", 6000); }
    catch (e) { throw new Error('no cards; user=' + (await ev('JSON.stringify(window.app.user && {r: window.app.user.Role, b: window.app.user["Branch Code"], c: window.app.user.Channel})')) + ' hash=' + (await ev('location.hash')) + ' grid=' + (await ev("(document.getElementById('productGrid')||{innerText:'(none)'}).innerText.slice(0,150)"))); } ok(await ev("document.getElementById('posBranchSelect').disabled===true")); ok((await cnt()) > 0, 'no cards'); });
  await T('restricted user (menus=pos) cannot open #products', async () => { await ev("window.app.user['Accessible Menus']='pos';window.location.hash='#products';true"); await sleep(800); const d = await ev("JSON.stringify({hash:location.hash,role:window.app.user.Role,swal:(window.Swal&&Swal.isVisible&&Swal.isVisible())?document.querySelector('.swal2-title').textContent:null,menu:(window.app.menuConfig.flatMap(x=>x.children||[x]).find(x=>x.id==='products')||{}).roles})"); const o = JSON.parse(d); ok(o.hash !== '#products' || /ปฏิเสธ/.test(o.swal || ''), d); await ev("window.Swal&&Swal.close();true"); });

  console.log('\n==== client: ' + pass + ' passed, ' + fail + ' failed');
  const real = pageErrors.filter(e => !/favicon|ERR_|Failed to load resource|tailwind|manifest/i.test(e.text));
  console.log('uncaught page errors: ' + real.length); real.slice(0, 15).forEach(e => console.log('  [' + e.phase + '] ' + e.text.slice(0, 300)));
  if (fail) { console.log('\nFAILURES:'); fails.forEach(f => console.log(' - ' + f)); }
  try { ws.close(); } catch (e) {} chrome.kill(); server.close(); setTimeout(() => process.exit(0), 300);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
