---
name: skillspreorderzf8
description: Ship-checklist for this Google Apps Script project (Mobile Pre Order System, pbzf8.2) — walks through syntax-checking, a /* -in-strings scan, and confirming the push target before any `clasp push -f`, then reminds about the CLAUDE.md changelog entry and the /exec version cut. Use this whenever you're about to push, deploy, or ship a change to Code.js, Index.html, JS.html, or CSS.html in this repo, or whenever the user says "push", "deploy", "clasp push", or "ship this" in this project — even if they don't spell out the full checklist themselves. Also load this early in a session that's about to touch this codebase, since two of the gotchas here (rule 14, rule 23) fail silently and only surface after deploy, not at write time.
---

# Shipping a change in this GAS project

This repo has no bundler, no linter, and no test suite — `clasp push -f` *is* the build step, and it pushes straight to what users see on `/dev`. That means normal safety nets (a failing build, a broken test) don't exist here to catch mistakes before they go live. This checklist exists because two specific failure modes in this project are silent at push time and only show up after a real user hits them — catching them now is much cheaper than debugging a white screen or a silently-overwritten deploy later.

Run through this in order before any `clasp push -f`. Skip steps that don't apply (e.g. no `/*` scan needed if you didn't touch `JS.html`).

## 1. Syntax-check what changed

- Touched `Code.js`? Run:
  ```bash
  node --check src/Code.js
  ```
- Touched `JS.html`? Its `<script>` body isn't valid JS on its own (it's HTML wrapping a script), so extract it first, then check:
  ```bash
  node -e "
  const fs = require('fs');
  let t = fs.readFileSync('src/JS.html','utf8');
  const start = t.indexOf('<script');
  const scriptOpenEnd = t.indexOf('>', start) + 1;
  const end = t.lastIndexOf('</script>');
  fs.writeFileSync(process.argv[1], t.slice(scriptOpenEnd, end));
  " /tmp/js_body_check.js
  node --check /tmp/js_body_check.js
  ```
  (On Windows/PowerShell, write the extracted body to a scratchpad path instead of `/tmp` — see the session's scratchpad directory.)

## 2. If you touched `JS.html`: scan for `/*` inside strings

This is the one bug class `node --check` cannot catch, because it isn't a JS syntax error — it's a GAS serving-time quirk. GAS strips comments from `<script>` blocks *when it serves the page*, and its stripper treats a literal `/*` inside a string or template literal as a comment opener. It can swallow everything up to end-of-file, drop the closing `</script>` tag, and white-screen the entire app for every user — while `node --check` (and the page looking fine in the editor) both pass clean.

```bash
grep -n '/\*' src/JS.html
```

Check every hit: is it an actual `/* comment */` in the source (fine), or is it inside a quoted string/template literal (fixes needed — e.g. rewrite `accept="image/*"` as an explicit MIME list like `accept="image/png,image/jpeg,image/webp,image/gif"`)?

## 3. Confirm you're pushing from the right directory

This repo's scriptId is also targeted by a sibling directory (`../.clasp.json` at the `app01/` repo root) whose `src/` tree has independently diverged from this one. `clasp` gives no warning if you push from the wrong place — whichever directory pushes last silently overwrites the other's deployed code. This has already happened once (an entire session's worth of fixes went missing from `app01/src`).

```bash
pwd
cat .clasp.json
```

Confirm `pwd` resolves inside `pbzf8.2/` and `.clasp.json`'s `scriptId` is `1iRop91Ew0A_0kB6V4cM3vo60zVl6pqdgRAXdkR12Q-6wUOjYXTllGFAk`. Never push after `cd`-ing to the `app01/` repo root.

## 4. Push — but only with a green light

```bash
clasp push -f
```

`clasp push -f` immediately updates what real users see on `/dev` (picked up on their next hard refresh) — treat it like any other production-affecting action. Only run it once the user has explicitly asked for a push in this conversation, or you've told them you're about to push and they've confirmed. Don't chain it automatically onto a code edit just because the checklist above passed.

If the change also needs to reach the **versioned** `/exec` URL (not just `/dev`), say so — `clasp push` alone does not advance it. That needs a new version cut, either in the GAS editor or:
```bash
clasp deployments               # find the deploymentId
clasp deploy -i <deploymentId>  # cut a new version for it
```

## 5. Add a CLAUDE.md changelog entry

`CLAUDE.md` in this repo is a living changelog, not a static spec — every session that changes code appends a dated, narrative entry documenting what broke, what the root cause actually was (including any wrong turns before landing on it), what fixed it, and what's still open or unverified. Skim a couple of recent entries in `CLAUDE.md` for the tone before writing yours — they're detailed English prose (with inline Thai quotes from the owner when relevant), not terse diff summaries, because future sessions rely on this file to avoid re-diagnosing the same bug from scratch.

Write the entry once you know the real fix (not the first hypothesis) — if an earlier theory in the same session turned out wrong or incomplete, say so explicitly rather than quietly replacing it, the same way this file's own past entries do. That history is often exactly what saves the next session from repeating a dead end.
