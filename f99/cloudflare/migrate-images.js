// Migrate Google Drive / lh3.googleusercontent.com image URLs in D1 (f9-db) into D1 uploaded_images (/api/images/<id>)
// Usage:
//   node cloudflare/migrate-images.js --dry-run
//   node cloudflare/migrate-images.js --apply
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const APPLY = process.argv.includes('--apply');
const ORIGIN = 'https://f9-booking.pages.dev';
const CF_DIR = __dirname;

function d1Query(sql) {
  const out = execSync(`npx wrangler d1 execute f9-db --remote --json --command "${sql}"`, {
    cwd: CF_DIR, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024
  });
  return JSON.parse(out)[0].results;
}

function extractDriveId(url) {
  const s = String(url || '').trim();
  if (!s) return null;
  let m = s.match(/lh3\.googleusercontent\.com\/d\/([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  m = s.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=|thumbnail\?(?:[^#]*&)?id=)([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  return null;
}

function detectMime(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

const MAX_B64_BYTES = 900 * 1024; // D1 statement/row limit is 1 MB

async function fetchDriveImage(id) {
  const urls = [
    `https://lh3.googleusercontent.com/d/${id}=w800`,
    `https://lh3.googleusercontent.com/d/${id}=w600`,
    `https://lh3.googleusercontent.com/d/${id}=w480`,
    `https://drive.google.com/uc?export=download&id=${id}`
  ];
  for (const u of urls) {
    try {
      const res = await fetch(u, { redirect: 'follow' });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const mime = detectMime(buf);
      if (mime && Math.ceil(buf.length * 4 / 3) <= MAX_B64_BYTES) return { buf, mime };
    } catch (e) {}
  }
  return null;
}

(async () => {
  const targets = [
    { sheet: 'Products', col: 'Image URL' },
    { sheet: 'UI_Banners', col: 'URL' },
    { sheet: 'News', col: 'Image URL' },
    { sheet: 'Settings', kv: true }
  ];

  const found = new Map(); // driveId -> { urls: Set, refs: [] }
  const sheetCache = new Map();

  for (const t of targets) {
    const rows = d1Query(`SELECT row_idx, row_json FROM sheet_rows WHERE sheet_name = '${t.sheet}' ORDER BY row_idx`);
    if (!rows.length) continue;
    const parsed = rows.map(r => ({ row_idx: r.row_idx, vals: JSON.parse(r.row_json) }));
    sheetCache.set(t.sheet, parsed);
    const header = parsed[0].vals.map(v => String(v || '').trim());
    const colIdx = t.kv ? 1 : header.indexOf(t.col);
    if (colIdx === -1) continue;

    for (let i = 1; i < parsed.length; i++) {
      const cell = parsed[i].vals[colIdx];
      const id = extractDriveId(cell);
      if (!id) continue;
      if (!found.has(id)) found.set(id, { urls: new Set(), refs: [] });
      found.get(id).urls.add(cell);
      found.get(id).refs.push({ sheet: t.sheet, rowIdx: parsed[i].row_idx, arrIdx: i, colIdx });
    }
  }

  console.log(`Found ${found.size} unique Google Drive image(s) across ${[...found.values()].reduce((s, v) => s + v.refs.length, 0)} cell(s).`);
  if (!APPLY) {
    for (const [id, info] of found.entries()) {
      console.log(`  - ${id} (${info.refs.length} ref(s))`);
    }
    console.log('Dry run complete. Re-run with --apply to migrate into D1.');
    return;
  }

  const sqlStmts = [];
  const updatedSheets = new Set();
  let okCount = 0, failCount = 0;

  for (const [driveId, info] of found.entries()) {
    const img = await fetchDriveImage(driveId);
    if (!img) {
      console.warn(`  [SKIP] Failed to download valid image for Drive ID: ${driveId}`);
      failCount++;
      continue;
    }
    const imgId = 'drv_' + crypto.createHash('sha1').update(driveId).digest('hex').slice(0, 20);
    const newUrl = `${ORIGIN}/api/images/${imgId}`;
    const b64 = img.buf.toString('base64');
    const CHUNK = 60000;
    const first = b64.slice(0, CHUNK);
    sqlStmts.push(
      `INSERT OR REPLACE INTO uploaded_images (id, file_name, mime_type, data_base64, created_at) VALUES ('${imgId}', '${driveId}', '${img.mime}', '${first}', ${Date.now()});`
    );
    for (let off = CHUNK; off < b64.length; off += CHUNK) {
      sqlStmts.push(`UPDATE uploaded_images SET data_base64 = data_base64 || '${b64.slice(off, off + CHUNK)}' WHERE id = '${imgId}';`);
    }
    for (const ref of info.refs) {
      const rows = sheetCache.get(ref.sheet);
      rows[ref.arrIdx].vals[ref.colIdx] = newUrl;
      updatedSheets.add(`${ref.sheet}:${ref.rowIdx}`);
    }
    okCount++;
    console.log(`  [OK] ${driveId} -> ${newUrl} (${img.mime}, ${Math.round(img.buf.length / 1024)} KB)`);
  }

  for (const key of updatedSheets) {
    const [sheet, rowIdxStr] = key.split(':');
    const rowIdx = Number(rowIdxStr);
    const rowObj = sheetCache.get(sheet).find(r => r.row_idx === rowIdx);
    const jsonEsc = JSON.stringify(rowObj.vals).replace(/'/g, "''");
    sqlStmts.push(`UPDATE sheet_rows SET row_json = '${jsonEsc}' WHERE sheet_name = '${sheet}' AND row_idx = ${rowIdx};`);
  }

  if (sqlStmts.length > 0) {
    sqlStmts.push(`DELETE FROM kv_store WHERE key LIKE 'cache:TABLE_%';`);
    const tmpSql = path.join(os.tmpdir(), 'f9-migrate-images.sql');
    // Group statements into files <= 400 KB so wrangler d1 execute --file stays fast and under limits
    let cur = [], curLen = 0;
    const flushBatch = () => {
      if (!cur.length) return;
      fs.writeFileSync(tmpSql, cur.join('\n'), 'utf8');
      execSync(`npx wrangler d1 execute f9-db --remote --yes --file "${tmpSql}"`, {
        cwd: CF_DIR, encoding: 'utf8', stdio: 'inherit'
      });
      cur = []; curLen = 0;
    };
    for (const st of sqlStmts) {
      if (cur.length && curLen + st.length > 400000) flushBatch();
      cur.push(st); curLen += st.length;
    }
    flushBatch();
    if (fs.existsSync(tmpSql)) fs.unlinkSync(tmpSql);
  }
  console.log(`Migration done: ${okCount} migrated, ${failCount} skipped.`);
})();
