// Client helper tests: runs the <script> of src/api.html in a vm with stubbed browser globals.
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'api.html'), 'utf8');
const code = html.replace(/^[\s\S]*?<script>/, '').replace(/<\/script>[\s\S]*$/, '');

let pass = 0, fail = 0; const pending = [];
function t(name, fn) {
  pending.push(Promise.resolve().then(fn).then(() => { pass++; console.log('  ok   ' + name); },
    e => { fail++; console.log('  FAIL ' + name + ' -> ' + e.message); }));
}
const eq = (a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(JSON.stringify(a) + ' !== ' + JSON.stringify(b)); };

function makeCtx(server) {
  const store = {};
  const calls = [];
  const runner = () => {
    const r = { ok: null, ko: null };
    const p = new Proxy(r, { get: (o, k) => (k in o ? o[k] : (...args) => { calls.push([k, ...args]); Promise.resolve().then(() => server(k, args)).then(o.ok, o.ko); }) });
    r.withSuccessHandler = f => { r.ok = f; return p; };
    r.withFailureHandler = f => { r.ko = f; return p; };
    return p;
  };
  const jq = () => ({ show() { return this; }, hide() { return this; }, toggle() { return this; }, text() { return this; } });
  const ctx = {
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    google: { script: { get run() { return runner(); } } },
    $: jq, document: { getElementById: () => ({ value: '' }) },
    Swal: { fire: o => Promise.resolve(ctxSwal(o)), showValidationMessage() {} },
    Promise, Error, String, Array, JSON,
  };
  let swalCount = 0;
  function ctxSwal(o) { swalCount++; ctx._swalCount = swalCount; return o.preConfirm ? o.preConfirm() && Promise.resolve(o.preConfirm()).then(v => ({ isConfirmed: !!v, value: v })) : { isConfirmed: true }; }
  vm.createContext(ctx); vm.runInContext(code, ctx);
  ctx._store = store; ctx._calls = calls;
  return ctx;
}

console.log('== CLIENT UTIL');
const c = makeCtx(() => null);
t('escHtml escapes', () => eq(c.escHtml('<a href="x">\'&'), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;'));
t('escHtml null', () => eq(c.escHtml(null), ''));
t('safeUrl blocks javascript:', () => eq(c.safeUrl('javascript:alert(1)'), ''));
t('safeUrl blocks other hosts', () => eq(c.safeUrl('https://evil.example/x.png'), ''));
t('safeUrl blocks lookalike host', () => eq(c.safeUrl('https://drive.google.com.evil.example/x'), ''));
t('safeUrl allows drive', () => eq(c.safeUrl('https://drive.google.com/uc?id=1'), 'https://drive.google.com/uc?id=1'));
t('safeUrl allows lh3', () => eq(c.safeUrl('https://lh3.googleusercontent.com/d/abc'), 'https://lh3.googleusercontent.com/d/abc'));

t('callServer sends token first', async () => {
  const ctx = makeCtx((fn, args) => args);
  ctx.localStorage.setItem('fnToken', 'T1');
  eq(await ctx.callServer('getData', 'a'), ['T1', 'a']);
});
t('callServer re-logins on AUTH_REQUIRED and retries once', async () => {
  let first = true;
  const ctx = makeCtx((fn, args) => {
    if (fn === 'login') return { token: 'NEW', name: 'n', role: 'บัญชี' };
    if (first) { first = false; throw new Error('AUTH_REQUIRED'); }
    return 'saved with ' + args[0];
  });
  ctx.localStorage.setItem('fnToken', 'OLD');
  eq(await ctx.callServer('saveRequest', {}), 'saved with NEW');
  eq(ctx._store.fnToken, 'NEW');
});
t('callServer maps FORBIDDEN to Thai', async () => {
  const ctx = makeCtx(() => { throw new Error('FORBIDDEN'); });
  try { await ctx.callServer('getConfigProperties'); throw new Error('no throw'); } catch (e) { eq(e.message, 'คุณไม่มีสิทธิ์ดำเนินการนี้'); }
});

Promise.all(pending).then(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
});
