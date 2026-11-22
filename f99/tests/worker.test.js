const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

function loadWorkerEsm() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f9-worker-test-'));
  const cf = path.join(__dirname, '..', 'cloudflare');
  const writeMjs = (srcRel, outName, xform) => {
    let txt = fs.readFileSync(path.join(cf, srcRel), 'utf8');
    if (xform) txt = xform(txt);
    fs.writeFileSync(path.join(dir, outName), txt, 'utf8');
  };
  writeMjs('dist/assets.js', 'assets.mjs');
  writeMjs('dist/backend.js', 'backend.mjs');
  writeMjs('src/gas-d1.js', 'gas-d1.mjs');
  writeMjs('src/worker.js', 'worker.mjs', (t) => t
    .replace("'./gas-d1.js'", "'./gas-d1.mjs'")
    .replace("'../dist/backend.js'", "'./backend.mjs'")
    .replace("'../dist/assets.js'", "'./assets.mjs'"));
  return {
    url: pathToFileURL(path.join(dir, 'worker.mjs')).href,
    gasD1Url: pathToFileURL(path.join(dir, 'gas-d1.mjs')).href,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true })
  };
}

// In-memory D1 mock matching cloudflare/src/gas-d1.js & worker.js SQL queries
function createD1Mock() {
  const sheetRows = new Map(); // sheet_name -> Map(row_idx -> row_json)
  const kvStore = new Map();   // key -> { value, expires_at }
  const images = new Map();    // id -> { file_name, mime_type, data_base64, created_at }

  function execStmt(sql, params) {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('SELECT COUNT(*) AS cnt FROM sheet_rows')) {
      let cnt = 0;
      for (const m of sheetRows.values()) cnt += m.size;
      return { results: [{ cnt }], first: { cnt } };
    }
    if (s.startsWith('SELECT sheet_name, row_idx, row_json FROM sheet_rows')) {
      const hasIn = s.includes('WHERE sheet_name IN');
      const filter = hasIn ? new Set(params) : null;
      const results = [];
      for (const name of [...sheetRows.keys()].sort()) {
        if (filter && !filter.has(name)) continue;
        const m = sheetRows.get(name);
        for (const idx of [...m.keys()].sort((a, b) => a - b)) {
          results.push({ sheet_name: name, row_idx: idx, row_json: m.get(idx) });
        }
      }
      return { results };
    }
    if (s.startsWith('SELECT key, value, expires_at FROM kv_store')) {
      const now = params[0];
      const results = [];
      for (const [key, entry] of kvStore.entries()) {
        if (entry.expires_at === null || entry.expires_at > now) {
          results.push({ key, value: entry.value, expires_at: entry.expires_at });
        }
      }
      return { results };
    }
    if (s.startsWith('DELETE FROM sheet_rows WHERE sheet_name = ? AND row_idx > ?')) {
      const [name, maxIdx] = params;
      const m = sheetRows.get(name);
      if (m) {
        for (const idx of [...m.keys()]) if (idx > maxIdx) m.delete(idx);
      }
      return { results: [] };
    }
    if (s.startsWith('INSERT OR REPLACE INTO sheet_rows')) {
      for (let i = 0; i < params.length; i += 3) {
        const name = params[i], idx = params[i + 1], json = params[i + 2];
        if (!sheetRows.has(name)) sheetRows.set(name, new Map());
        sheetRows.get(name).set(idx, json);
      }
      return { results: [] };
    }
    if (s.startsWith('DELETE FROM kv_store WHERE key = ? AND value = ?')) {
      const [key, val] = params;
      const cur = kvStore.get(key);
      if (cur && cur.value === val) kvStore.delete(key);
      return { results: [] };
    }
    if (s.startsWith('DELETE FROM kv_store WHERE key = ?')) {
      kvStore.delete(params[0]);
      return { results: [] };
    }
    if (s.startsWith('INSERT INTO kv_store (key, value, expires_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE')) {
      const [key, value, expires_at, now] = params;
      const cur = kvStore.get(key);
      if (!cur || (cur.expires_at !== null && cur.expires_at <= now)) {
        kvStore.set(key, { value, expires_at });
      }
      return { results: [] };
    }
    if (s.startsWith('SELECT value FROM kv_store WHERE key = ?')) {
      const cur = kvStore.get(params[0]);
      const results = cur ? [{ value: cur.value }] : [];
      return { results, first: results[0] || null };
    }
    if (s.startsWith('INSERT OR REPLACE INTO kv_store')) {
      const [key, value, expires_at] = params.length === 3 ? params : [params[0], params[1], null];
      kvStore.set(key, { value, expires_at: expires_at === undefined ? null : expires_at });
      return { results: [] };
    }
    if (s.startsWith('INSERT OR REPLACE INTO uploaded_images')) {
      const [id, file_name, mime_type, data_base64, created_at] = params;
      images.set(id, { file_name, mime_type, data_base64, created_at });
      return { results: [] };
    }
    if (s.startsWith('SELECT mime_type, data_base64 FROM uploaded_images WHERE id = ?')) {
      const row = images.get(params[0]) || null;
      return { results: row ? [row] : [], first: row };
    }
    if (s.startsWith('SELECT id, created_at FROM uploaded_images')) {
      const results = [];
      for (const [id, row] of images.entries()) results.push({ id, created_at: row.created_at });
      return { results };
    }
    if (s.startsWith('DELETE FROM uploaded_images WHERE id = ?')) {
      images.delete(params[0]);
      return { results: [] };
    }
    throw new Error('Unhandled SQL in D1 mock: ' + s);
  }

  return {
    prepare(sql) {
      let params = [];
      const stmt = {
        bind(...args) { params = args; return stmt; },
        async first() { return execStmt(sql, params).first || null; },
        async all() { return { results: execStmt(sql, params).results }; },
        async run() { return execStmt(sql, params); },
        _exec() { return execStmt(sql, params); }
      };
      return stmt;
    },
    async batch(stmts) {
      return stmts.map(st => st._exec());
    }
  };
}

let passed = 0, failed = 0;
const tests = [];
function t(name, fn) { tests.push({ name, fn }); }

(async () => {
  const loaded = loadWorkerEsm();
  const workerMod = await import(loaded.url);
  const worker = workerMod.default;
  const db = createD1Mock();
  const env = { DB: db, AUTH_SECRET: 'test-secret-key-for-worker-tests' };
  const ctx = { waitUntil() {} };

  async function req(method, p, body) {
    const url = 'https://f9-booking.test' + p;
    const init = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await worker.fetch(new Request(url, init), env, ctx);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) {}
    return { status: res.status, headers: res.headers, text, json };
  }
  async function api(action, payload, userToken) {
    return (await req('POST', '/api', { action, payload: payload || {}, userToken: userToken || null })).json;
  }

  let adminPw = '';
  let adminToken = '';
  let salesToken = '';

  t('GET /api/health returns ok + db connected', async () => {
    const r = await req('GET', '/api/health');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.status, 'ok');
    assert.strictEqual(r.json.db, 'connected');
  });

  t('POST /api/setup initializes database', async () => {
    const r = await req('POST', '/api/setup', {});
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.status, 'success');
    adminPw = r.json.initialAdmin && r.json.initialAdmin.password;
    assert.ok(adminPw && adminPw.length >= 8, 'initialAdmin.password returned');
  });

  t('GET / renders HTML and sanitizes ?p= / ?track=', async () => {
    const r = await req('GET', '/?p=<script>evil&track=BAD!ID');
    assert.strictEqual(r.status, 200);
    assert.ok(r.text.includes('window.__APP_URL'));
    assert.ok(!r.text.includes('<script>evil'));
  });

  t('GET /api/public-config returns public config object', async () => {
    const r = await req('GET', '/api/public-config');
    assert.strictEqual(r.status, 200);
    assert.ok(r.json && typeof r.json === 'object' && 'loginBg' in r.json, JSON.stringify(r.json));
  });

  t('LOGIN admin returns token', async () => {
    const r = await api('LOGIN', { username: 'admin', password: adminPw });
    assert.strictEqual(r.status, 'success', JSON.stringify(r));
    adminToken = { Token: r.user.Token };
    assert.ok(adminToken.Token);
  });

  t('Sales LOGIN loads Branches and resolves Channel + Branch Name (regression)', async () => {
    const bRes = await api('GET_TABLE', { tableName: 'Branches' }, adminToken);
    assert.strictEqual(bRes.status, 'success', JSON.stringify(bRes));
    const branch = bRes.data[0];
    assert.ok(branch && branch['Branch Code'] && branch.Channel, 'seeded branch exists');

    const saveM = await api('SAVE_RECORD', {
      tableName: 'Members',
      data: {
        Username: 'sales_cf_test',
        Password: 'Password123!',
        Role: 'Sales',
        Name: 'Sales CF',
        'Branch Code': branch['Branch Code'],
        'Accessible Menus': 'dashboard,pos,orders'
      }
    }, adminToken);
    assert.strictEqual(saveM.status, 'success', JSON.stringify(saveM));

    const loginRes = await api('LOGIN', { username: 'sales_cf_test', password: 'Password123!' });
    assert.strictEqual(loginRes.status, 'success', JSON.stringify(loginRes));
    assert.strictEqual(loginRes.user.Channel, branch.Channel, 'Sales Channel must match Branches.Channel');
    assert.strictEqual(loginRes.user['Branch Name'], branch['Branch Name'], 'Sales Branch Name must match Branches');
    assert.notStrictEqual(loginRes.user.Channel, 'Unknown');
    salesToken = { Token: loginRes.user.Token };
  });

  t('sheetsForAction covers all read actions without missing sheets', async () => {
    const checks = [
      ['GET_ALL_DATA', {}, salesToken],
      ['GET_TABLE', { tableName: 'Products' }, salesToken],
      ['GET_TABLE', { tableName: 'Target' }, adminToken],
      ['GET_ADVANCED_DASHBOARD', {}, adminToken],
      ['GET_SETTINGS_LIST', {}, adminToken],
      ['GET_INVOICES', {}, adminToken],
      ['NEWS_LIST', {}, adminToken],
      ['EXPORT_BACKUP', {}, adminToken]
    ];
    for (const [act, pay, tok] of checks) {
      const r = await api(act, pay, tok);
      assert.strictEqual(r.status, 'success', act + ' failed: ' + JSON.stringify(r));
    }
  });

  t('D1 distributed lock blocks concurrent writers, takes over expired lock, and releases on finish', async () => {
    const { acquireD1Lock, releaseD1Lock } = await import(loaded.gasD1Url);
    // 1. Expired lock is taken over immediately
    await db.prepare('INSERT OR REPLACE INTO kv_store (key, value, expires_at) VALUES (?, ?, ?)').bind('lock:global', 'stale-owner', Date.now() - 1000).run();
    const tok1 = await acquireD1Lock(db, 5000, 300);
    assert.ok(tok1, 'expired lock should be acquired');

    // 2. Active lock blocks another acquirer until timeout
    const tok2 = await acquireD1Lock(db, 5000, 150);
    assert.strictEqual(tok2, null, 'active lock should block second acquirer');

    // 3. Releasing with wrong token does not release
    await releaseD1Lock(db, 'wrong-token');
    const stillLocked = await db.prepare('SELECT value FROM kv_store WHERE key = ?').bind('lock:global').first();
    assert.strictEqual(stillLocked.value, tok1);

    // 4. Releasing with owner token frees the lock
    await releaseD1Lock(db, tok1);
    const afterFree = await db.prepare('SELECT value FROM kv_store WHERE key = ?').bind('lock:global').first();
    assert.strictEqual(afterFree, null);
  });

  t('UPLOAD_IMAGE rejects images exceeding D1 900KB base64 limit with clear message', async () => {
    // Valid PNG magic header padded beyond 900KB base64 (~700KB binary)
    const bigBuf = Buffer.alloc(700 * 1024, 0);
    bigBuf[0] = 0x89; bigBuf[1] = 0x50; bigBuf[2] = 0x4e; bigBuf[3] = 0x47;
    bigBuf[4] = 0x0d; bigBuf[5] = 0x0a; bigBuf[6] = 0x1a; bigBuf[7] = 0x0a;
    const res = await api('UPLOAD_IMAGE', {
      fileName: 'huge.png',
      mimeType: 'image/png',
      base64Data: bigBuf.toString('base64')
    }, adminToken);
    assert.strictEqual(res.status, 'error');
    assert.ok(String(res.message).includes('900KB'), 'unexpected error: ' + res.message);
  });

  t('sheetsForAction write actions (settings, checkout) work with scoped sheet loading', async () => {
    const prodRes = await api('GET_TABLE', { tableName: 'Products' }, adminToken);
    assert.strictEqual(prodRes.status, 'success');
    const sellable = prodRes.data.find(p => Number(p.Stock) > 0 && !String(p.Category || '').includes('ของแถม'));
    assert.ok(sellable, 'seeded sellable product exists');

    const saveSet = await api('SAVE_SETTINGS_ITEM', {
      type: 'bookingsettings',
      settings: {
        CampaignName: 'CF Test Campaign',
        ReserveStart: '2020-01-01T00:00',
        ReserveEnd: '2030-12-31T23:59'
      }
    }, adminToken);
    assert.strictEqual(saveSet.status, 'success', JSON.stringify(saveSet));

    const co = await api('CHECKOUT', {
      customerName: 'ลูกค้าทดสอบ',
      contactPhone: '0812345678',
      idCard: '1234567890121',
      resStatus: 'จอง F (สวมสิทธิ์การจอง)',
      cart: [{ SKU: sellable.SKU, 'Product Name': sellable['Product Name'], qty: 1, Price: Number(sellable.Price), brandGifts: [], channelGifts: [] }],
      clientRequestId: 'cf-worker-test-1'
    }, salesToken);
    assert.strictEqual(co.status, 'success', JSON.stringify(co));
    assert.ok(co.orderId, 'orderId returned');
  });

  t('EXPORT_BACKUP + IMPORT_BACKUP round-trip works on Cloudflare D1', async () => {
    const exp = await api('EXPORT_BACKUP', {}, adminToken);
    assert.strictEqual(exp.status, 'success');
    const origInterests = exp.backup.sheets.Interests;
    const res = await api('IMPORT_BACKUP', {
      backup: {
        exportedAt: exp.backup.exportedAt,
        sheets: { Interests: [['Interest ID', 'Interest Name'], ['INT-99', 'D1 Restored']] }
      },
      dryRun: false
    }, adminToken);
    assert.strictEqual(res.status, 'success', JSON.stringify(res));
    assert.strictEqual(res.restored, 1);
    const tblRes = await api('GET_TABLE', { tableName: 'Interests' }, adminToken);
    assert.ok(tblRes.data.some(x => x['Interest ID'] === 'INT-99'));
    // restore original
    await api('IMPORT_BACKUP', { backup: { sheets: { Interests: origInterests } }, dryRun: false }, adminToken);
  });

  t('CLEANUP_IMAGES removes old unreferenced D1 images while keeping referenced and recent ones', async () => {
    const oldMs = Date.now() - 3600 * 1000;
    const nowMs = Date.now();
    await db.prepare('INSERT OR REPLACE INTO uploaded_images (id, file_name, mime_type, data_base64, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind('imgused1', 'used.png', 'image/png', 'AAAA', oldMs).run();
    await db.prepare('INSERT OR REPLACE INTO uploaded_images (id, file_name, mime_type, data_base64, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind('imgold1', 'old.png', 'image/png', 'AAAA', oldMs).run();
    await db.prepare('INSERT OR REPLACE INTO uploaded_images (id, file_name, mime_type, data_base64, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind('imgnew1', 'new.png', 'image/png', 'AAAA', nowMs).run();

    await api('SAVE_SETTINGS_ITEM', {
      type: 'bookingsettings',
      settings: { LogoUrl: 'https://f9-booking.test/api/images/imgused1' }
    }, adminToken);

    const res = await api('CLEANUP_IMAGES', {}, adminToken);
    assert.strictEqual(res.status, 'success', JSON.stringify(res));
    assert.strictEqual(res.deleted, 1);
    assert.ok(await db.prepare('SELECT mime_type, data_base64 FROM uploaded_images WHERE id = ?').bind('imgused1').first(), 'referenced image kept');
    assert.ok(await db.prepare('SELECT mime_type, data_base64 FROM uploaded_images WHERE id = ?').bind('imgnew1').first(), 'recent image kept');
    assert.strictEqual(await db.prepare('SELECT mime_type, data_base64 FROM uploaded_images WHERE id = ?').bind('imgold1').first(), null, 'old orphan deleted');
  });

  for (const tc of tests) {
    try {
      await tc.fn();
      console.log('  ok  ', tc.name);
      passed++;
    } catch (e) {
      console.error('  FAIL', tc.name, '->', e && e.stack ? e.stack : e);
      failed++;
    }
  }
  loaded.cleanup();
  console.log(`\n==== worker: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
