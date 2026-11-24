#!/usr/bin/env node
// Checks the <script> blocks in src/*.html for code that the GAS serve-time
// comment stripper would break (see "GAS serve-time comment stripper" in CLAUDE.md).
// node --check and npm test both pass on such code, so this runs as its own gate.
//
// GAS re-reads the script when serving it (it even rewrites \x22 as "), and
// its comment handling is not fully string-aware. Its exact algorithm is unknown,
// so this checks the three patterns that have broken the live site, all as errors:
//   A. a slash-star that does not start a real block comment (in a string, template
//      or regex) - GAS deletes from there on, white screen.
//   B. a double slash inside a template literal - the rest of the line is cut.
//   C. a regex literal holding both quote characters - throws off quote tracking,
//      and a double slash in a later ordinary string is then cut (@87/@88).
// It cannot prove the served page is fine: after a deploy, run
// tools/check-served.js against the /exec URL for that.
//
// Usage: node tools/check-gas-serve.js [files...]   (default: every src/*.html)
'use strict';
const fs = require('fs');
const path = require('path');

const K_CODE = 0, K_COMMENT = 1, K_STR = 2, K_TPL = 3, K_RE = 4;
const KIND_NAME = ['code', 'comment', 'string', 'template literal', 'regex literal'];
const REGEX_AFTER_WORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);

// Real tokenizer: marks what each character of `code` is.
function classify(code) {
  const n = code.length;
  const kind = new Uint8Array(n);
  const tplStack = []; // brace depth inside each open ${ ... }
  let prev = null; // { t: 'name'|'num'|'punct', v }
  let i = 0;
  const mark = (from, to, k) => { for (let j = from; j < to && j < n; j++) kind[j] = k; };

  function scanTemplate(start) { // start = index just after the backtick or the closing brace of ${}
    let j = start;
    while (j < n) {
      const c = code[j];
      if (c === '\\') { j += 2; continue; }
      if (c === '`') { mark(start - 1, j + 1, K_TPL); return { end: j + 1, open: false }; }
      if (c === '$' && code[j + 1] === '{') { mark(start - 1, j + 2, K_TPL); return { end: j + 2, open: true }; }
      j++;
    }
    mark(start - 1, n, K_TPL);
    return { end: n, open: false };
  }

  while (i < n) {
    const c = code[i], d = code[i + 1];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && d === '/') {
      let j = code.indexOf('\n', i); if (j < 0) j = n;
      mark(i, j, K_COMMENT); i = j; continue;
    }
    if (c === '/' && d === '*') {
      let j = code.indexOf('*/', i + 2); j = j < 0 ? n : j + 2;
      mark(i, j, K_COMMENT); i = j; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && code[j] !== c && code[j] !== '\n') j += code[j] === '\\' ? 2 : 1;
      mark(i, j + 1, K_STR); i = j + 1; prev = { t: 'num' }; continue;
    }
    if (c === '`') {
      const r = scanTemplate(i + 1);
      if (r.open) tplStack.push(0);
      i = r.end; prev = r.open ? { t: 'punct', v: '${' } : { t: 'num' }; continue;
    }
    if (c === '}' && tplStack.length && tplStack[tplStack.length - 1] === 0) {
      tplStack.pop();
      const r = scanTemplate(i + 1);
      if (r.open) tplStack.push(0);
      i = r.end; prev = r.open ? { t: 'punct', v: '${' } : { t: 'num' }; continue;
    }
    if (c === '/') {
      const regexOk = !prev || (prev.t === 'punct' && !/^[)\]}]$/.test(prev.v)) || (prev.t === 'name' && REGEX_AFTER_WORDS.has(prev.v));
      if (regexOk) {
        let j = i + 1, inClass = false;
        while (j < n && code[j] !== '\n') {
          const ch = code[j];
          if (ch === '\\') { j += 2; continue; }
          if (ch === '[') inClass = true;
          else if (ch === ']') inClass = false;
          else if (ch === '/' && !inClass) break;
          j++;
        }
        j++;
        while (j < n && /[a-z]/i.test(code[j])) j++;
        mark(i, j, K_RE); i = j; prev = { t: 'num' }; continue;
      }
    }
    if (/[A-Za-z_$\u0080-￿]/.test(c)) {
      let j = i + 1; while (j < n && /[\w$\u0080-￿]/.test(code[j])) j++;
      prev = { t: 'name', v: code.slice(i, j) }; i = j; continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(d))) {
      let j = i + 1; while (j < n && /[\w.]/.test(code[j])) j++;
      prev = { t: 'num' }; i = j; continue;
    }
    if (tplStack.length) {
      if (c === '{') tplStack[tplStack.length - 1]++;
      else if (c === '}') tplStack[tplStack.length - 1]--;
    }
    prev = { t: 'punct', v: c }; i++;
  }
  return kind;
}

function checkScript(code) {
  const kind = classify(code);
  const issues = [];
  for (let i = code.indexOf('/*'); i >= 0; i = code.indexOf('/*', i + 1)) {
    if (kind[i] !== K_COMMENT) issues.push({ pos: i, rule: 'A', msg: 'slash-star inside a ' + KIND_NAME[kind[i]] + ' - GAS deletes everything after it (white screen)' });
  }
  for (let i = code.indexOf('//'); i >= 0; i = code.indexOf('//', i + 1)) {
    if (kind[i] === K_TPL) issues.push({ pos: i, rule: 'B', msg: 'double slash inside a template literal - GAS cuts the rest of the line as a comment' });
  }
  // A quote character inside a regex literal throws off the stripper's quote tracking;
  // a double slash in a later ordinary string is then cut (took the site down on @87/@88).
  // One quote kind alone (/"/g, /^'+/) is served fine all over the live code; the
  // regex that broke it held both, so only that is reported.
  for (let i = 0; i < code.length; i++) {
    if (kind[i] !== K_RE) continue;
    let j = i; while (j < code.length && kind[j] === K_RE) j++;
    const body = code.slice(i, j);
    if (body.includes('"') && body.includes("'")) issues.push({ pos: i, rule: 'C', msg: 'regex literal holds both quote characters - write them as \\x22 / \\x27' });
    i = j;
  }
  return issues.sort((a, b) => a.pos - b.pos);
}

function checkFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const issues = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(text))) {
    if (/\bsrc\s*=/.test(m[1]) || !m[2].trim()) continue;
    const base = m.index + m[0].indexOf('>') + 1;
    for (const it of checkScript(m[2])) {
      const abs = base + it.pos;
      const before = text.slice(0, abs);
      const line = before.split('\n').length;
      const col = abs - before.lastIndexOf('\n');
      const lineText = text.split('\n')[line - 1].trim();
      issues.push({ file, line, col, rule: it.rule, msg: it.msg, snippet: lineText.length > 140 ? lineText.slice(0, 140) + '...' : lineText });
    }
  }
  return issues;
}

function selfTest() {
  const cases = [
    ['var a = "x/*y";', ['A']],
    ['var t = `see https:' + '//x`;', ['B']],
    ["var r = /'/g, s = /\"/g; var a = 'x';", []],
    ['if (!/^https:[/][/][^\\s<>"\']+$/i.test(u)) f();', ['C']],
    ['var ok = /[^\\s<>\\x22\\x27]/.test(u);', []],
    ["var u = 'https:" + "//x'; // note\n/* ok */ var re = /a\\/b/; var t = `${'a'}`; var d = 4 / 2 / 1;", []],
    ['var t = `a ${ `b ${x}` } c`; // ok\nvar o = {a:1}; var z = `${o.a}`;', []],
    ['var t = `${ {a:1}.a } https:' + '//x`;', ['B']],
    ['x = y\n/* real */\nreturn /ab*/.test(s);', []],
    ['var ok = /^https?:\\/\\//i.test(u);', []],  ];
  let bad = 0;
  for (const [code, want] of cases) {
    const got = checkScript(code).map(x => x.rule);
    if (got.join() !== want.join()) { bad++; console.error('self-test failed:', JSON.stringify(code), 'want', want, 'got', got); }
  }
  return bad === 0;
}

function main() {
  if (!selfTest()) process.exit(2);
  const src = path.join(__dirname, '..', 'src');
  const files = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(src).filter(f => /\.html$/i.test(f)).map(f => path.join(src, f));
  const issues = files.flatMap(checkFile);
  for (const it of issues) console.error(`${path.relative(process.cwd(), it.file)}:${it.line}:${it.col} [${it.rule}] ${it.msg}\n    ${it.snippet}`);
  if (issues.length) { console.error(`\nGAS serve check: ${issues.length} problem(s) in ${files.length} file(s).`); process.exit(1); }
  console.log(`GAS serve check: OK (${files.length} files)`);
}

if (require.main === module) main();
module.exports = { checkScript, checkFile, selfTest };
