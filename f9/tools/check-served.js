#!/usr/bin/env node
// After a deploy: fetches the page GAS really serves and compiles every inline
// <script> block (compile only, nothing is run). This catches what the GAS serve-time
// comment stripper did to the code, which no local test can see.
//
// Usage: node tools/check-served.js <exec url>
//   or   F9_EXEC_URL=<exec url> node tools/check-served.js
// Open a deployment's URL, not /dev (that one needs a login).
'use strict';
const vm = require('vm');

async function fetchUserHtml(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' from ' + url);
  const page = await res.text();
  const m = page.match(/goog\.script\.init\("((?:\\.|[^"\\])*)"/);
  if (!m) throw new Error('goog.script.init payload not found (is this a web app /exec URL?)');
  // The payload is a JS string literal with \xNN escapes, which JSON does not allow.
  const json = JSON.parse('"' + m[1].replace(/\\x([0-9a-fA-F]{2})/g, '\\u00$1') + '"');
  const payload = JSON.parse(json);
  if (typeof payload.userHtml !== 'string') throw new Error('payload has no userHtml');
  return payload.userHtml;
}

function checkHtml(html) {
  const problems = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m, n = 0;
  while ((m = re.exec(html))) {
    if (/\bsrc\s*=/.test(m[1]) || !m[2].trim()) continue;
    n++;
    try {
      new vm.Script(m[2], { filename: 'served-script-' + n + '.js' });
    } catch (e) {
      const line = html.slice(0, m.index).split('\n').length;
      const lines = m[2].split('\n');
      const at = (e.stack || '').match(/served-script-\d+\.js:(\d+)/);
      const errLine = at ? Number(at[1]) : 0;
      problems.push({ block: n, htmlLine: line, error: e.message, code: errLine ? (lines[errLine - 1] || '').trim().slice(0, 160) : '' });
    }
  }
  return { blocks: n, problems };
}

async function main() {
  const url = process.argv[2] || process.env.F9_EXEC_URL;
  if (!url) { console.error('usage: node tools/check-served.js <exec url>'); process.exit(2); }
  const html = await fetchUserHtml(url);
  const { blocks, problems } = checkHtml(html);
  if (!blocks) { console.error('No inline <script> blocks in the served page - the page itself looks broken.'); process.exit(1); }
  for (const p of problems) console.error(`script block ${p.block} (served html line ${p.htmlLine}): ${p.error}\n    ${p.code}`);
  if (problems.length) { console.error(`\nServed page check: ${problems.length} of ${blocks} script blocks do not compile.`); process.exit(1); }
  console.log(`Served page check: OK (${blocks} script blocks compile, ${html.length} bytes)`);
}

if (require.main === module) main().catch(e => { console.error('Served page check failed: ' + e.message); process.exit(2); });
module.exports = { fetchUserHtml, checkHtml };
