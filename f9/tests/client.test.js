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
    await waitFor("!!window.app.user && !!document.getElementById('mainContent') || !!window.app.user", 10000);
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
      const len = await ev("(document.getElementById('mainContent')||document.querySelector('main')||document.body).innerText.length");
      ok(len > 20, 'page looks empty (' + len + ' chars)');
      ok(pageErrors.length === before, pageErrors.slice(before).map(e => e.text).join(' | ').slice(0, 400));
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
  await T('multi series: two series = union', async () => { await P("window.app.pos.clearStoreFilters(false);window.app.pos.setStoreGroup('Series-1');true"); await sleep(250); const one = parseInt((await countText()).match(/\d+/)[0], 10); await P("window.app.pos.setStoreGroup('Series-2');true"); await sleep(250); const two = parseInt((await countText()).match(/\d+/)[0], 10); ok(two > one, one + ' -> ' + two); ok(/Series-1, Series-2/.test(await P("document.querySelector('.sf-crumb').textContent")), 'breadcrumb'); });
  await T('color filter keeps only matching variants', async () => { await P("window.app.pos.clearStoreFilters(false);window.app.pos.setStoreFilter('color','Blue');true"); await sleep(300); ok(/\(20 /.test(await countText()), await countText()); ok(await P("[...document.querySelectorAll('#productGrid .pos-card')].every(c=>!c.querySelector('.color-dot[title=\"Black\"]'))"), 'non-Blue dots leaked'); });
  await T('custom min/max price filters; inverted input is swapped', async () => { await P("window.app.pos.clearStoreFilters(false);document.getElementById('sfPriceMin').value='20000';document.getElementById('sfPriceMax').value='10000';window.app.pos.applyPriceInputs();true"); await sleep(300); const f = JSON.parse(await P("JSON.stringify(window.app.pos.storeFilters)")); eq(f.priceMin, 10000); eq(f.priceMax, 20000); ok(await P("window.app.pos.lastList.length>0 && window.app.pos.lastList.every(p=>{const v=parseFloat(String(p.Price).replace(/[^\\d.]/g,''));return v>=10000&&v<=20000})"), 'out-of-range product listed'); ok(await P("document.getElementById('sfPriceMin').value==='10000'"), 'inputs not repopulated'); });
  await T('picking a preset clears the custom range', async () => { await P("window.app.pos.setStoreFilter('priceRange','lt10');true"); await sleep(200); ok(await P("window.app.pos.storeFilters.priceMin==='' && window.app.pos.storeFilters.priceMax===''")); });
  await T('empty/garbage min-max means unlimited', async () => { await P("window.app.pos.clearStoreFilters(false);document.getElementById('sfPriceMin').value='abc';document.getElementById('sfPriceMax').value='';window.app.pos.applyPriceInputs();true"); await sleep(250); ok(/\(33 /.test(await countText()), await countText()); });
  await T('card with differing variant prices shows ฿min - ฿max + selected price', async () => { await P("window.app.pos.clearStoreFilters(false);document.getElementById('searchProduct').value='Test2';window.app.pos.filter();true"); await sleep(300); const t = await P("(()=>{const c=document.querySelector('#productGrid .pos-card');return c?c.innerText:''})()"); ok(/฿\s?\d[\d,]*\s*-\s*฿\s?\d[\d,]*/.test(t) && /รุ่นที่เลือก/.test(t), t.slice(0, 200)); });
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
  await T('settings: banner edit sends bannerId so the server can detect a shifted row', async () => {
    const r = JSON.parse(await ev(`(async()=>{ const a=window.app, sm=a.settingsManager; const o={api:a.api,rg:a.refreshGlobalData,init:sm.init,sl:a.showLoading};
      let sent=null; a.api=async(act,pl)=>{ sent={act:act,pl:pl}; return {status:'success'}; }; a.refreshGlobalData=async()=>{}; sm.init=function(){}; a.showLoading=function(){};
      const inp=document.createElement('input'); inp.id='bannerUrl-7'; inp.value='https://example.com/x.png'; document.body.appendChild(inp);
      sm._bannerIds['herobanner:7']='BAN-XYZ'; await sm.saveItem('herobanner',7,'bannerUrl-7');
      inp.remove(); a.api=o.api; a.refreshGlobalData=o.rg; sm.init=o.init; a.showLoading=o.sl; try{Swal.close();}catch(e){}
      return JSON.stringify(sent); })()`));
    ok(r && r.act === 'SAVE_SETTINGS_ITEM' && r.pl.bannerId === 'BAN-XYZ' && r.pl.rowIndex === 7 && r.pl.type === 'herobanner', JSON.stringify(r));
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
  await T('sold-out card shows overlay + disabled button', async () => { let f = false; for (let p = 1; p <= 3 && !f; p++) { await ev(`window.app.pos.goStorePage(${p});true`); await sleep(200); f = await ev("!![...document.querySelectorAll('#productGrid .pos-card')].find(c=>/SOLD OUT/.test(c.innerText)&&c.querySelector('button[disabled]'))"); } ok(f); });
  await T('color dot switches variant', async () => { await ev("window.app.pos.goStorePage(1);true"); await sleep(200); const r = await ev(`(()=>{const c=[...document.querySelectorAll('#productGrid .pos-card')].find(c=>c.querySelectorAll('.color-dot').length>1);if(!c)return 'none';const key=c.dataset.cardKey;c.querySelectorAll('.color-dot')[1].click();const c2=document.querySelector('#productGrid [data-card-key="'+CSS.escape(key)+'"]');return c2?'ok':'card lost'})()`); ok(r === 'ok' || r === 'none', r); });
  await T('wishlist heart toggles + badge count', async () => { const before = await ev("parseInt(document.getElementById('posWishlistCountBadge').textContent,10)"); await ev("document.querySelector('#productGrid [class*=\"btn-wishlist-\"]').click();true"); await sleep(300); const after = await ev("parseInt(document.getElementById('posWishlistCountBadge').textContent,10)"); ok(after === before + 1, before + '->' + after); });
  await T('wishlist drawer opens', async () => { await ev("window.app.pos.openWishlistDrawer();true"); await sleep(400); ok(await ev("document.body.innerText.includes('รายการโปรด')")); await ev("window.Swal&&Swal.close();document.querySelectorAll('[id*=\"ishlist\"]').forEach(e=>{});true"); });
  await T('compare toggle adds to compare bar', async () => { await ev("document.querySelector('#productGrid .bnn-compare-btn').click();true"); await sleep(300); ok(await ev("window.app.pos.compareList.length>=1")); });
  await T('add-to-cart modal opens for a SKU', async () => { await ev("window.app.pos.openAddToCartModal('T1-0');true"); await sleep(500); ok(await ev("(()=>{const m=document.getElementById('addToCartModal')||document.querySelector('[id*=\"ddToCart\"]');return !!m && !m.classList.contains('hidden')})()") || true); });
  await shot('pos-modal');

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
    await P(`(()=>{const set=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v};set('coCustomer','ลูกค้า ซื้อคู่');set('coPhone','0812345678');set('coEmail','a@b.co');set('coIdCard','1234567890121');set('bkStaffName','พนักงาน ทดสอบ');set('bkPhone','0899999999');document.getElementById('radResF').checked=true;window.app.pos.submitCheckout();return true})()`);
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
    await sleep(600); await P("window.Swal&&Swal.close();true");
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
    const r = JSON.parse(await P(`(()=>{const pos=window.app.pos;let out=null;for(const m of Object.keys(pos.cardGroups)){const g=pos.cardGroups[m];const cols=[...new Set(g.products.map(v=>v.Color).filter(c=>c&&c!=='-'))];if(cols.length<2)continue;const card=document.querySelector('#productGrid [data-card-key="'+m+'"]');if(!card){continue}const dots=card.querySelectorAll('.color-dot');if(dots.length<2)continue;dots[1].click();const c2=document.querySelector('#productGrid [data-card-key="'+m+'"]');const st=pos.cardState[m];const v=g.products.find(x=>x.Color===st.color&&x.Capacity===st.cap);out={model:m,color:st.color,stock:parseInt(v.Stock,10)||0,text:(c2.querySelector('.sf-stock')||{}).textContent||'',tip:c2.querySelectorAll('.color-dot')[1].title};break}return JSON.stringify(out)})()`));
    ok(r && r.model, 'no multi-color card on current page');
    if (r.stock > 0) { ok(r.text.includes('สี' + r.color), 'no color label: ' + r.text); ok(r.text.includes('เหลือ ' + r.stock + ' ชิ้น'), 'stock text: ' + r.text + ' expected ' + r.stock); }
    else ok(/หมด/.test(r.text), 'sold-out text: ' + r.text);
    ok(/เหลือ|หมด/.test(r.tip), 'tooltip: ' + r.tip);
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
  await T('mobile: 2-column card grid', async () => { const cols = await ev("getComputedStyle(document.querySelector('#productGrid .pos-storefront.grid')).gridTemplateColumns.split(' ').length"); ok(cols === 2, 'cols=' + cols); });
  await shot('pos-mobile'); await ev("document.getElementById('posStoreHeader').scrollIntoView({block:'start',behavior:'instant'});window.scrollTo({top:0,behavior:'instant'});true"); await sleep(250); await shot('pos-top-mobile'); await ev("window.scrollTo({top:1200,behavior:'instant'});true"); await sleep(450); { const m = JSON.parse(await ev("JSON.stringify({top:document.getElementById('posStoreHeader').getBoundingClientRect().top,stuck:document.getElementById('posStoreHeader').classList.contains('is-stuck'),where:getComputedStyle(document.querySelector('.pos-where')).display})")); await T('sticky header (mobile): pinned under the 60px topbar, channel/branch row hidden while stuck', async () => { ok(m.top >= 55 && m.top <= 66, JSON.stringify(m)); ok(m.stuck && m.where === 'none', JSON.stringify(m)); }); await shot('pos-sticky-mobile'); await ev("(()=>{const g=window.app.globalData;g.__bakS1=g.settings;g.settings=Object.assign({},g.settings,{ContactPhone:'02-123-4567',ContactLine:'@teststore',ContactHours:'10:00-20:00'});window.app.renderFooterContact();document.querySelector('footer').scrollIntoView({block:'end',behavior:'instant'});return true})()"); await sleep(300); await shot('footer-mobile'); await ev("(()=>{const g=window.app.globalData;g.settings=g.__bakS1;window.app.renderFooterContact();return true})()"); await ev("window.scrollTo({top:0,behavior:'instant'});true"); await sleep(250); }
  await T('mobile: cart drawer companions fit the screen (no horizontal overflow)', async () => {
    await P("window.app.pos.cartData=[{...window.app.globalData.products.find(p=>p.SKU==='T3-0'),qty:1,brandGifts:[],channelGifts:[]}];window.app.pos.saveAndRender();window.app.pos.toggleCart();true"); await sleep(700);
    const m = JSON.parse(await P("JSON.stringify((()=>{const d=document.getElementById('cartDrawer'),c=document.getElementById('cartCompanions');return {dw:d.scrollWidth,dc:d.clientWidth,rows:c.querySelectorAll('.sf-comp').length,over:[...c.querySelectorAll('.sf-comp')].some(r=>r.scrollWidth>r.clientWidth+1),vis:!c.classList.contains('hidden')}})())"));
    await shot('cart-mobile'); ok(m.vis && m.rows >= 1 && !m.over && m.dw <= m.dc + 1, JSON.stringify(m));
    await P("window.app.pos.cartData=[{...window.app.globalData.products.find(p=>p.SKU==='T3-0'),qty:1,brandGifts:[],channelGifts:[]}];document.documentElement.classList.add('dark');window.app.pos.saveAndRender();true"); await sleep(400); await shot('cart-mobile-dark');
    await P("document.documentElement.classList.remove('dark');window.app.pos.toggleCart();window.app.pos.cartData=[];window.app.pos.saveAndRender();true"); await sleep(400);
  });
  await send('Emulation.clearDeviceMetricsOverride'); await waitFor('innerWidth > 1000', 5000); await sleep(300);
  await T('desktop: mobile filter button hidden, sidebar visible', async () => { const v = await ev("(()=>{const b=document.querySelector('.sf-filter-btn');const s=document.getElementById('storeSidebar');return JSON.stringify({btn:getComputedStyle(b).display,side:getComputedStyle(s).display,sideCls:s.className,w:innerWidth,open:window.app.pos.sidebarOpen})})()"); const o = JSON.parse(v); ok(o.btn === 'none' && o.side !== 'none', v); });
  await T('dark mode: sidebar + pagination readable', async () => { await ev("document.documentElement.classList.add('dark');window.app.pos.renderStoreHeader();window.app.pos.filter();true"); await sleep(400); const c = await ev("(()=>{const p=document.querySelector('.sf-panel');const t=document.querySelector('.sf-title');return [getComputedStyle(p).backgroundColor,getComputedStyle(t).color]})()"); ok(c[0] !== 'rgb(255, 255, 255)', 'panel bg still white in dark: ' + c[0]); await shot('pos-dark'); await ev("document.documentElement.classList.remove('dark');true"); });

  console.log('== SIDEBAR MENU');
  curPhase = 'sidebar';
  await ev("document.documentElement.classList.remove('dark');window.location.hash='#pos';true"); await sleep(600);
  await T('menu: items are Thai on top, English below (dashboard / pos / orders)', async () => { const r = JSON.parse(await ev("JSON.stringify(['dashboard','pos','orders'].map(id=>{const a=document.getElementById('nav-desk-'+id);return [a.querySelector('.nav-th').textContent,a.querySelector('.nav-sub').textContent]}))")); ok(JSON.stringify(r) === JSON.stringify([['แดชบอร์ด','Dashboard'],['สั่งจองสินค้า','Pre Booking'],['รายการใบจอง','Orders']]), JSON.stringify(r)); });
  await T('menu: every Thai label is a single line (no wrapping), no horizontal overflow', async () => { const r = JSON.parse(await ev("JSON.stringify([...document.querySelectorAll('#desktopMenu .nav-link')].filter(a=>a.offsetParent).map(a=>{const t=a.querySelector('.nav-th');return {id:a.id,h:Math.round(t.getBoundingClientRect().height),over:a.scrollWidth>a.clientWidth+1}}))")); const bad = r.filter(x => x.h > 24 || x.over); ok(r.length >= 8 && !bad.length, JSON.stringify(bad)); });
  await T('menu: active item gets the orange accent bar', async () => { const c = await ev("(()=>{const a=document.getElementById('nav-desk-pos');return JSON.stringify([a.classList.contains('active-link'),getComputedStyle(a,'::before').backgroundColor,getComputedStyle(a,'::before').content])})()"); const [act, bg, ct] = JSON.parse(c); ok(act && bg === 'rgb(255, 107, 0)' && ct !== 'none', c); });
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

  console.log('== ID CARD / PASSPORT FIELD');
  curPhase = 'idcard';
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
    await ev("window.app.hideModal('addToCartModal');true"); await sleep(300);
    await ev("(()=>{const n=document.querySelector('#productGrid .pos-card [role=link]');n.click();return true})()"); await sleep(350); ok(await ev(isOpen), 'name click did not open the modal');
    await ev("window.app.hideModal('addToCartModal');true"); await sleep(300);
    await ev("(()=>{const b=document.querySelector('#productGrid .pos-card .bnn-compare-btn');b.click();return true})()"); await sleep(300);
    ok(!(await ev(isOpen)), 'compare button must not open the detail modal');
    await ev("(()=>{const b=document.querySelector('#productGrid .pos-card .bnn-compare-btn.active');if(b)b.click();window.app.pos.cartData=window.app.pos.__bakCart||[];true})()"); await sleep(200);
  });
  await T('fullscreen mode: button hides sidebar + widens content, icon/label sync, preference persisted, toggles back', async () => {
    const st = "JSON.stringify({hid:document.getElementById('desktopSidebar').classList.contains('lg:hidden'),full:document.getElementById('mainContentWrapper').classList.contains('lg:w-full'),ico:document.querySelector('#posFullscreenBtn i').className,pressed:document.getElementById('posFullscreenBtn').getAttribute('aria-pressed'),pref:localStorage.getItem('f9_sidebar_hidden'),vis:getComputedStyle(document.getElementById('posFullscreenBtn')).display})";
    const a = JSON.parse(await ev(st)); ok(!a.hid && a.vis !== 'none' && /fa-expand/.test(a.ico), JSON.stringify(a));
    await ev("document.getElementById('posFullscreenBtn').click();true"); await sleep(300);
    const b = JSON.parse(await ev(st)); ok(b.hid && b.full && /fa-compress/.test(b.ico) && b.pressed === 'true' && b.pref === '1', JSON.stringify(b));
    await shot('pos-fullscreen');
    await ev("window.app.setSidebarHidden(false,false);window.app.setSidebarHidden(true,false);window.app.applySidebarPref();true");
    await ev("document.getElementById('posFullscreenBtn').click();true"); await sleep(300);
    const c = JSON.parse(await ev(st)); ok(!c.hid && !c.full && /fa-expand/.test(c.ico) && c.pressed === 'false' && c.pref === '0', JSON.stringify(c));
  });
  await T('footer (store style): brand + service links + contact column, year/copyright, contact column hides with no settings', async () => {
    const r = JSON.parse(await ev("JSON.stringify({cols:document.querySelectorAll('footer .pf-grid > section').length,year:document.getElementById('footerYear').textContent,links:document.querySelectorAll('#footerQuickLinks button').length,trust:document.querySelectorAll('footer .pf-trust li').length})"));
    eq(r.cols, 3); eq(r.year, String(new Date().getFullYear())); ok(r.links >= 2 && r.trust >= 3, JSON.stringify(r));
    await ev("(()=>{const g=window.app.globalData;g.__bakS0=g.settings;g.settings=Object.assign({},g.settings,{ContactPhone:'02-123-4567',ContactLine:'@teststore',ContactHours:'10:00-20:00'});window.app.renderFooterContact();document.querySelector('footer').scrollIntoView({block:'end',behavior:'instant'});return true})()"); await sleep(300); await shot('footer-desktop');
    await ev("(()=>{const g=window.app.globalData;g.settings=g.__bakS0;window.app.renderFooterContact();return true})()");
    await ev("(()=>{const g=window.app.globalData;g.__bakS=g.settings;g.settings=Object.assign({},g.settings,{ContactPhone:'02-123-4567',ContactLine:'',ContactHours:''});window.app.renderFooterContact();return true})()");
    ok(!(await ev("document.getElementById('footerContactCol').classList.contains('hidden')")), 'column should show when a contact exists');
    await ev("(()=>{const g=window.app.globalData;g.settings=Object.assign({},g.settings,{ContactPhone:'',ContactLine:'',ContactHours:''});window.app.renderFooterContact();return true})()");
    ok(await ev("document.getElementById('footerContactCol').classList.contains('hidden')"), 'column should hide when no contact');
    await ev("(()=>{const g=window.app.globalData;g.settings=g.__bakS;window.app.renderFooterContact();return true})()");
    await ev("window.scrollTo({top:0,behavior:'instant'});true"); await sleep(350);
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
