// Visual audit: screenshots of key screens into tests/out (node tests/shots.js [tag]).
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
  // resolve every include('X') (CSS, TailwindCSS, JS core + JS_*.html modules) like HtmlService does
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

  const TAG = process.argv[2] || 'v';
  const view = async (w, h, mobile) => { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile: !!mobile }); await sleep(500); };
  const snap = async (n) => { await shot(TAG + '-' + n); console.log('shot', TAG + '-' + n); };
  await view(1366, 860, false);
  if (process.env.DARK) { await ev("localStorage.setItem('tg_theme','dark');document.documentElement.classList.add('dark');true"); await sleep(400); }
  await snap('login-desktop');
  await view(390, 800, true); await snap('login-mobile');
  await view(1366, 860, false);
  await login('admin', ADMIN_PW);
  await ev("window.location.hash='#dashboard';true"); await sleep(1500); await snap('dashboard');
  await ev("window.location.hash='#pos';true"); await sleep(1500); await snap('pos-overlay');
  await ev(`(()=>{const c=document.getElementById('posChannelSelect');c.value='Retail';c.dispatchEvent(new Event('change'));const b=document.getElementById('posBranchSelect');b.value='B01';b.dispatchEvent(new Event('change'));window.app.pos.checkCriteria();return true})()`); await sleep(1200);
  // ตัวอย่างหน้าตาป้าย NEW/ขายดี + ชั้นสินค้าใหม่: ใส่ Launch Date ให้ 3 รุ่นแรกที่ขายได้ และตั้งรุ่นขายดี (เฉพาะภาพ ไม่แตะข้อมูลจริง)
  await ev("(()=>{const a=window.app,g=a.globalData,pos=a.pos;const ms=[...new Set(g.products.filter(p=>p.Status==='เปิด'&&!(p.Category||'').includes('ของแถม')&&p.Model&&p.Model!=='-'&&pos.stockOf(p)>0).map(p=>p.Model))];const d=n=>new Date(Date.now()+7*3600e3-n*864e5).toISOString().slice(0,10);g.products.forEach(p=>{const i=ms.indexOf(p.Model);if(i>-1&&i<3)p['Launch Date']=d(i*4+1);});g.popularModels=ms.slice(1,5);pos.filter();return true})()"); await sleep(600);
  await snap('pos-desktop');
  await ev("window.scrollTo(0,document.getElementById('storeFilterBar').getBoundingClientRect().top+window.scrollY-130);true"); await sleep(700); await snap('pos-cards');
  await ev("window.scrollTo(0,document.body.scrollHeight);true"); await sleep(700); await snap('pos-bottom');
  await ev("window.scrollTo(0,0);window.app.pos.openPromoHub();true"); await sleep(900); await snap('pos-promos'); await ev("window.app.hideModal('promoHubModal');true"); await sleep(300);
  await ev("window.scrollTo(0,0);document.querySelector('#productGrid .pos-card .bnn-buy-btn').click();true"); await sleep(900); await snap('pos-modal'); await ev("window.Swal&&Swal.close();document.querySelectorAll('[id$=Modal]').forEach(m=>m.classList.add('hidden'));true");
  await view(390, 800, true); await sleep(600); await snap('pos-mobile');
  await ev("window.app.pos.toggleCart&&window.app.pos.toggleCart();true"); await sleep(500); await snap('cart-mobile');
  await ev("window.app.pos.toggleCart&&window.app.pos.toggleCart();true");
  await view(1366, 860, false);
  await ev("window.location.hash='#orders';true"); await sleep(1500); await snap('orders');
  try { ws.close(); } catch (e) {} chrome.kill(); server.close(); setTimeout(() => process.exit(0), 300);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
