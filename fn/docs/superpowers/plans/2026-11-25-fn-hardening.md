# FN+ Consignment — Phase 1: Security & Reliability Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the anonymous-access/PII holes and make the approval workflow trustworthy server-side, without changing how users work day to day.

**Architecture:** Add a server-side session (token in ScriptCache) that every public server function checks with a role matrix; the server — not the browser — decides status transitions, net price and who acted. The client gets one `callServer()` wrapper that injects the token and handles expiry. Everything is covered by Node tests running the real `src/*.js` against an in-memory GAS mock (pattern copied from `../f9/tests/gasmock.js`).

**Tech Stack:** Google Apps Script (V8, clasp), Google Sheets, Bootstrap 5 / jQuery / DataTables / SweetAlert2 client, Node ≥18 (`node:vm`, `node:crypto`) for tests — no new npm dependencies.

**Spec:** Audit of 2026-11-25 (summarised in "Background" below; also `~/.claude/projects/D--New-folder-app01/memory/fn-project.md`).

## Background (audit findings this plan fixes)

1. Auth lives only in `localStorage`; no server function checks identity. Deployment is `ANYONE_ANONYMOUS` + `USER_DEPLOYING`, so anyone with the URL can call `getData` (national ID, address, phone), `getConfigProperties` (Telegram tokens), `getSettingsData('Admin')` (plaintext passwords), `addSettingData('Admin', …)`, `setConfigProperties`, `deleteSettingData`, `statusRecordWithRemark`, `setRemark`.
2. Passwords stored and displayed in plaintext.
3. Client sends `obj.status` and `obj.name`; server trusts them → steps can be skipped, actor spoofed.
4. Log rows have no record ID.
5. XSS: `innerHTML` with sheet data in settings tables, unescaped `<img src>` in DataTable, unescaped email `htmlBody`.
6. Lock failures return `true` silently; delete-by-row-index can delete the wrong row.
7. `index.html:678` includes `form` but `src/form.html` does not exist locally.
8. Headers duplicated 3×; columns addressed by magic numbers; barcode text prefixed into numeric discount cells.

**Out of scope (Phase 2, separate plan):** visual redesign (stepper, detail drawer, theme, dashboard KPIs). Do not restyle anything in this plan.

## Global Constraints

- Never run `clasp push` or `clasp deploy` without a separate explicit go-ahead from the user, each time. Before testing on a URL, run `clasp deployments` and ask which URL is live (push only updates @HEAD / `/dev`).
- Existing Data sheet rows must keep working unchanged: never reorder or delete existing columns; new columns are appended after column 41 (`AR ใส่หมายเกตุถ้ามี :`).
- Existing Admin sheet passwords (plaintext) must still log in once, then be upgraded in place.
- Role names are exactly `แอดมิน`, `บัญชี`, `พนักงาน`. Status values exactly `รออนุมัติ`, `รอเปิด SO`, `รอเปิด Invoice`, `เสร็จสมบูรณ์`, `ไม่อนุมัติ`; legacy `อนุมัติแล้ว` and empty string must still be read correctly.
- Every server helper not meant for `google.script.run` ends in `_` (GAS hides these from the client).
- All user-facing error text stays Thai.
- No `/*` inside JS strings/regex/templates in `src/*.html` (GAS serve-time comment stripper); `npm test` enforces it.
- Commits on branch `fn-hardening` in the `D:\New folder\app01` repo; message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Legacy plaintext password** — first login after deploy must succeed and rewrite the cell as a hash (Task 2 test `login upgrades plaintext password`).
2. **Token expires mid-form** — a staff member who filled the 4-step form for >6h and submits must not lose input; they get a re-login prompt and the submit retries (Task 5 manual check M3).
3. **Legacy statuses** — rows with `''` or `อนุมัติแล้ว` must still advance (Task 4 tests `approve from empty status`, `updateSO from อนุมัติแล้ว`).
4. **Two approvers on the same row** — second click must get a clear "รายการนี้ถูกดำเนินการไปแล้ว" instead of overwriting (Task 4 test `double approve rejected`).
5. **Admin lockout** — deleting/demoting the last `แอดมิน` must be refused (Task 3 test `cannot delete last admin`).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/รหัส.js` | `doGet`, `include` only (shrinks) |
| `src/Schema.js` *(new)* | `DATA_HEADERS`, `LOG_HEADERS`, `col_(name)`, `STATUS`, sheet whitelist, `ensureSheets_()` |
| `src/Auth.js` *(new)* | password hashing, `login`, `logout`, `requireSession_` |
| `src/Requests.js` *(new)* | `saveRequest`, `getData`, `findRecord`, `updateStatus`, net-price calc, validation |
| `src/Settings.js` *(new)* | config get/set (masked), settings CRUD, `initializeAllSheets` |
| `src/Notify.js` *(new)* | `sendNotify_` (Telegram + escaped email) |
| `src/api.html` *(new)* | client `callServer()`, `escHtml()`, `safeUrl()`, session-expiry handling |
| `src/Login-out.html`, `dataTable.html`, `status.html`, `showPic.html`, `jsAdd.html`, `index.html` | switch to `callServer`, escape output |
| `tests/gasmock.js` *(new, adapted from f9)* | in-memory SpreadsheetApp/Cache/Lock/Utilities/Drive/Mail/UrlFetch |
| `tests/server.test.js` *(new)* | server tests |
| `tests/client-util.test.js` *(new)* | runs `src/api.html` script in vm, tests `escHtml`/`safeUrl` |
| `tools/check-gas-serve.js` *(copied from `../f9/tools/`)* | serve-hazard gate |
| `package.json`, `.gitignore`, `CLAUDE.md` | scripts, docs |

---

### Task 1: Baseline — branch, test harness, Schema module, fix `form` include

**Files:**
- Create: `tests/gasmock.js`, `tests/server.test.js`, `tools/check-gas-serve.js`, `src/Schema.js`, `.gitignore`
- Modify: `package.json`, `src/รหัส.js`, `src/index.html:678`

**Interfaces:**
- Produces (globals in `Schema.js`):
  - `DATA_HEADERS: string[]` — the existing 41 headers verbatim + 5 appended: `"บาร์โค้ด AIS :"`, `"บาร์โค้ด promotion :"`, `"บาร์โค้ด Trade in :"`, `"บาร์โค้ด Trade up :"`, `"บาร์โค้ด Big point :"` (46 total)
  - `LOG_HEADERS = ["วันที่/เวลา","ผู้ดำเนินการ","สถานะการอนุมัติ","ID รายการ","รายละเอียด"]`
  - `col_(header: string): number` — 1-based index in `DATA_HEADERS`; throws `Error('Unknown column: '+header)`
  - `STATUS = {WAIT:'รออนุมัติ', SO:'รอเปิด SO', INV:'รอเปิด Invoice', DONE:'เสร็จสมบูรณ์', REJECT:'ไม่อนุมัติ', LEGACY_APPROVED:'อนุมัติแล้ว'}`
  - `SETTINGS_SHEETS = ['Admin','location','Product','Premium','guarantee']`
  - `ensureSheets_(): {name:string,status:string}[]` — the old `initializeAllSheets` body; if Data header row is shorter than `DATA_HEADERS`, writes the missing trailing headers only; same for Log.
  - `getDataSheet_(): Sheet` — calls `ensureSheets_()` only when the Data sheet is missing.
- Mock exposes `{ ctx, sheets, cache, mail, fetches, driveFiles }` and loads every `src/*.js` in alphabetical order into `ctx`.

- [ ] **Step 1:** `cd "D:/New folder/app01" && git checkout -b fn-hardening`. Add `fn/.gitignore` with `node_modules/`, `.clasprc.json`, `tests/out/`.
- [ ] **Step 2:** Check whether `form.html` exists remotely: `cd fn && npx clasp pull` into a scratch copy (`clasp pull` overwrites `src/` — so first copy `fn` to the scratchpad and pull there). If remote has `form.html`, add it to `src/` and note in commit; if not, delete the `<?!= include('form'); ?>` line.
- [ ] **Step 3:** Copy `../f9/tests/gasmock.js` → `tests/gasmock.js`; adapt: load all `src/*.js`; add mocks `DriveApp.getFolderById/createFolder` (records files in `driveFiles`), `MailApp.sendEmail` (pushes to `mail`), `UrlFetchApp.fetch` (pushes to `fetches`), `Utilities.getUuid` (crypto.randomUUID), `SpreadsheetApp.getActive` = `getActiveSpreadsheet`, `HtmlService` stub. Copy `../f9/tools/check-gas-serve.js` unchanged.
- [ ] **Step 4: Write failing tests** in `tests/server.test.js` (same tiny runner style as f9: `t`, `eq`, `ok`, `throws`; exit code 1 on any failure):
  ```js
  t('DATA_HEADERS has 46 columns', () => eq(ctx.DATA_HEADERS.length, 46));
  t('col_ status is 33', () => eq(ctx.col_('สถานะ :'), 33));
  t('col_ unknown throws', () => throws(() => ctx.col_('nope'), /Unknown column/));
  t('ensureSheets_ creates all 8 sheets', () => { ctx.ensureSheets_(); ['Data','Log','Admin','Config','location','Product','Premium','guarantee'].forEach(n => ok(sheets[n], n)); });
  t('ensureSheets_ extends old 41-col header without touching data', () => { /* seed Data with 41 headers + 1 row, run, expect header len 46 and row unchanged */ });
  ```
- [ ] **Step 5:** `npm test` → FAIL (`ctx.DATA_HEADERS` undefined).
- [ ] **Step 6:** Implement `src/Schema.js`; in `src/รหัส.js` delete `updateHeadersNow`, `initializeSheets`, `setRemark`, the three duplicated header arrays, and the `initializeSheets()` call in `doGet`. `package.json` scripts: `"test": "node tools/check-gas-serve.js && node tests/server.test.js && node tests/client-util.test.js"`, `"test:server"`, `"check:gas"`. (Create an empty-pass `tests/client-util.test.js` now; Task 6 fills it.)
- [ ] **Step 7:** `npm test` → all PASS, check-gas-serve reports 0 problems.
- [ ] **Step 8:** Commit `fn: test harness, Schema module, remove dead code and missing form include`.

---

### Task 2: Server sessions and password hashing

**Files:**
- Create: `src/Auth.js`
- Modify: `src/รหัส.js` (remove `checkLogin`), `tests/server.test.js`

**Interfaces:**
- Produces:
  - `hashPassword_(plain: string, salt?: string): string` → `"sha256$<salt>$<hex>"`; salt = `Utilities.getUuid()` when omitted; digest of `salt + plain`, iterated 1000 times.
  - `verifyPassword_(plain: string, stored: string): boolean` — stored without `sha256$` prefix is compared as plaintext (legacy).
  - `login(username: string, pwd: string): {token:string,name:string,role:string} | null` — on legacy match, rewrites the Admin cell (col 2) with `hashPassword_(pwd)`. Rate limit: 5 failures per username in ScriptCache key `fail_<username>` (TTL 900 s) → throws `Error('พยายามเข้าสู่ระบบผิดหลายครั้ง กรุณารอ 15 นาที')`.
  - Session: ScriptCache key `sess_<token>` → `JSON {username,name,role}`, TTL 21600 s; refreshed (re-put) on each `requireSession_`.
  - `requireSession_(token: string, roles?: string[]): {username,name,role}` — throws `Error('AUTH_REQUIRED')` if missing/expired, `Error('FORBIDDEN')` if role not in `roles`. Role is re-read from the Admin sheet by username on each call (so demotion takes effect immediately); user missing from sheet → `AUTH_REQUIRED`.
  - `logout(token: string): true`.
  - Role constants: `ROLES = {ADMIN:'แอดมิน', ACC:'บัญชี', STAFF:'พนักงาน'}`; blank role cell defaults to `พนักงาน` (was `แอดมิน` — least privilege).

- [ ] **Step 1: Write failing tests:**
  ```js
  t('hash roundtrip', () => ok(ctx.verifyPassword_('p@ss', ctx.hashPassword_('p@ss'))));
  t('hash wrong pw', () => ok(!ctx.verifyPassword_('x', ctx.hashPassword_('p@ss'))));
  t('login upgrades plaintext password', () => { seedAdmin(['u1','pw1','สมชาย','บัญชี']); const r = ctx.login('u1','pw1'); eq(r.role,'บัญชี'); ok(/^sha256\$/.test(sheets.Admin.rows[1][1])); ok(ctx.login('u1','pw1')); });
  t('login wrong pw returns null', () => eq(ctx.login('u1','bad'), null));
  t('rate limit after 5 fails', () => { for (let i=0;i<5;i++) ctx.login('u1','bad'); throws(() => ctx.login('u1','pw1'), /หลายครั้ง/); });
  t('requireSession_ no token', () => throws(() => ctx.requireSession_(''), /AUTH_REQUIRED/));
  t('requireSession_ wrong role', () => throws(() => ctx.requireSession_(staffToken, ['แอดมิน']), /FORBIDDEN/));
  t('demoted user loses role immediately', () => { /* change sheet role to พนักงาน, expect FORBIDDEN for แอดมิน-only */ });
  t('blank role defaults to staff', () => { seedAdmin(['u3','x','c','']); eq(ctx.login('u3','x').role,'พนักงาน'); });
  ```
- [ ] **Step 2:** `npm run test:server` → FAIL.
- [ ] **Step 3:** Implement `src/Auth.js`; delete `checkLogin` from `รหัส.js`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `fn: server-side sessions and hashed passwords with legacy upgrade`.

---

### Task 3: Guard every public function; safe settings & config

**Files:**
- Create: `src/Settings.js`, `src/Notify.js`
- Modify: `src/รหัส.js` (move remaining functions out), `tests/server.test.js`

**Interfaces:**
- Consumes: `requireSession_`, `ROLES`, `SETTINGS_SHEETS`, `hashPassword_`, `ensureSheets_`.
- Produces (public — first param is always `token`):

| Function | Roles | Notes |
|---|---|---|
| `getAllDropdownData(token)` | all 3 | unchanged shape |
| `getConfigProperties(token)` | แอดมิน | secrets (`notifyNewToken`, `notifyApproveToken`) returned as `'••••' + last4` or `''` |
| `setConfigProperties(token, cfg)` | แอดมิน | a value starting with `••••` is ignored (keeps old); only keys in the 7 known config keys accepted |
| `getSettingsData(token, sheet)` | แอดมิน | sheet must be in `SETTINGS_SHEETS` else `Error('INVALID_SHEET')`; Admin rows returned as `[username, '', name, role]` |
| `addSettingData(token, sheet, row)` | แอดมิน | Admin: `row[1]` hashed; username must be unique (`Error('ชื่อผู้ใช้นี้มีอยู่แล้ว')`); role must be one of `ROLES` |
| `deleteSettingData(token, sheet, rowIndex, expectedKey)` | แอดมิน | deletes only if column A of that row equals `expectedKey`, else `Error('ข้อมูลมีการเปลี่ยนแปลง กรุณารีเฟรช')`; refuses deleting the last `แอดมิน` (`Error('ต้องมีแอดมินอย่างน้อย 1 คน')`) |
| `resetPassword(token, username, newPwd)` | แอดมิน | new; hashes; min length 6 |
| `initializeAllSheets(token)` | แอดมิน | wraps `ensureSheets_()` |

- Internal: `getConfig_()` (unmasked, server only), `withLock_(fn)` — `waitLock(10000)`; on timeout throws `Error('ระบบกำลังประมวลผลข้อมูลอื่นอยู่ กรุณาลองใหม่อีกครั้ง')`. All writers use `withLock_`.
- `sendNotify_(msg, isApprove, attachments, subject, image)` in `Notify.js`: skips Telegram when token/chatId empty; email `htmlBody` = HTML-escaped msg with `\n`→`<br>`.
- `authorizeEmail` stays as-is (editor-only OAuth helper; it mails only the active user, which is empty for anonymous callers, so it is harmless from the client).

- [ ] **Step 1: Write failing tests:** a loop asserting every public function listed above throws `AUTH_REQUIRED` with `''` token; `FORBIDDEN` for a staff token on each แอดมิน-only function; plus:
  ```js
  t('Admin settings hide passwords', () => ctx.getSettingsData(adminTok,'Admin').forEach(r => eq(r[1], '')));
  t('config masks bot token', () => { ctx.setConfigProperties(adminTok,{notifyNewToken:'123456:ABCDEF'}); eq(ctx.getConfigProperties(adminTok).notifyNewToken,'••••CDEF'); });
  t('masked value does not overwrite', () => { ctx.setConfigProperties(adminTok,{notifyNewToken:'••••CDEF'}); eq(ctx.getConfig_().notifyNewToken,'123456:ABCDEF'); });
  t('invalid sheet rejected', () => throws(() => ctx.getSettingsData(adminTok,'Data'), /INVALID_SHEET/));
  t('delete with stale key rejected', () => throws(() => ctx.deleteSettingData(adminTok,'location',0,'wrong'), /เปลี่ยนแปลง/));
  t('cannot delete last admin', () => throws(() => ctx.deleteSettingData(adminTok,'Admin',0,'admin1'), /อย่างน้อย 1/));
  t('added admin password is hashed', () => { ctx.addSettingData(adminTok,'Admin',['u9','secret9','n','พนักงาน']); ok(/^sha256\$/.test(lastRow('Admin')[1])); });
  t('email body escaped', () => { ctx.sendNotify_('<b>x</b>', false, [], 's'); ok(mail.at(-1).htmlBody.includes('&lt;b&gt;')); });
  ```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `Settings.js`, `Notify.js`; `รหัส.js` keeps only `doGet` + `include`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `fn: role-guard all server functions, mask secrets, safe settings CRUD`.

---

### Task 4: Server-owned workflow, validation, net price, audit log

**Files:**
- Create: `src/Requests.js`
- Modify: `tests/server.test.js`

**Interfaces:**
- Consumes: Schema, Auth, `withLock_`, `getConfig_`, `sendNotify_`.
- Produces:
  - `saveRequest(token, form): {id:string}` — replaces `saveDataB64`; any role. Validates: required fields as in the current form; `emp_phone`/`customer_phone` `/^0\d{9}$/`; `id_card_number` `/^\d{13}$/`; `zipcode` `/^\d{5}$/`; amounts numeric ≥ 0; `installments` integer 1–60; `file1Data` image mime, `file2Data` `application/pdf`, each ≤ 10 MB decoded. Error message names the Thai field label. Barcodes go to the 5 new columns; discount cells hold numbers only. `ราคาสุทธิ` = `calcNetPrice_(form)`, client value ignored. Status `รออนุมัติ`. ID = `Date.now()` string; if it already exists in col A, add 1 until unique (inside lock).
  - `calcNetPrice_(f): number` — same formula as today's client: `price − down − ais − promotion − tradein − tradeup − bigpoint + dues` (**confirm with user — see Open Questions**).
  - `getData(token): string[][]` — rows padded to 46. For role `พนักงาน`: national ID (col 7) returned as `'XXXXXXXXX' + last4`. (Visibility rule — see Open Questions.)
  - `findRecord(token, id): string[]` — same masking rule.
  - `updateStatus(token, {record, action, ...fields}): {status:string}` — replaces `statusRecordWithRemark`; roles แอดมิน, บัญชี. Inside lock, re-reads current status and applies:

| action | allowed current status | new status | fields written (by header name) |
|---|---|---|---|
| `approve` | `''`, `รออนุมัติ` | `รอเปิด SO` | Remark(การเงิน), ยอดเงินโอนที่ได้รับ(การเงิน) (required, numeric), Remark…เพิ่ม |
| `reject` | `''`, `รออนุมัติ` | `ไม่อนุมัติ` | Remark(การเงิน) (required) |
| `updateSO` | `รอเปิด SO`, `อนุมัติแล้ว` | `รอเปิด Invoice` | Remark(SO), Sales Order created (required), Remark(SO)…เพิ่ม |
| `updateAR` | `รอเปิด Invoice` | `เสร็จสมบูรณ์` | Invoice บัญชี (required), AR remark |

    Otherwise `Error('รายการนี้ถูกดำเนินการไปแล้ว (สถานะปัจจุบัน: <status>)')`. Unknown action → `Error('INVALID_ACTION')`. Actor = session name. Appends Log row `[new Date(), name, newStatus, record, action]`. Notifies on approve/reject exactly as today.

- [ ] **Step 1: Write failing tests:**
  ```js
  t('saveRequest computes net price server-side', () => { const {id} = ctx.saveRequest(staffTok, form({price:10000, down:1000, discountais:500, dues:200, netprice:1})); eq(Number(rowById(id)[ctx.col_('ราคาสุทธิ :')-1]), 8700); });
  t('barcode stored separately', () => { /* barcode_ais 'B1', discountais 500 → AIS cell 500, barcode col 'B1' */ });
  t('invalid id card rejected', () => throws(() => ctx.saveRequest(staffTok, form({id_card_number:'123'})), /เลขบัตรประชาชน/));
  t('pdf mime enforced', () => throws(() => ctx.saveRequest(staffTok, form({file2Data:{mimeType:'image/png',base64:'AA==',name:'x'}})), /PDF/));
  t('staff cannot updateStatus', () => throws(() => ctx.updateStatus(staffTok,{record:id,action:'approve'}), /FORBIDDEN/));
  t('approve from empty status', () => { setStatus(id,''); eq(ctx.updateStatus(accTok,{record:id,action:'approve',financeAmount:'8700'}).status,'รอเปิด SO'); });
  t('double approve rejected', () => throws(() => ctx.updateStatus(accTok,{record:id,action:'approve',financeAmount:'1'}), /ดำเนินการไปแล้ว/));
  t('cannot skip to AR', () => { const {id:i2}=ctx.saveRequest(staffTok, form()); throws(() => ctx.updateStatus(accTok,{record:i2,action:'updateAR',invoice:'X'}), /ดำเนินการไปแล้ว/); });
  t('updateSO from อนุมัติแล้ว', () => { setStatus(id,'อนุมัติแล้ว'); eq(ctx.updateStatus(accTok,{record:id,action:'updateSO',soCreated:'SO1'}).status,'รอเปิด Invoice'); });
  t('log has record id and session actor', () => { const l = sheets.Log.rows.at(-1); eq(l[3], id); eq(l[1], 'ฝ่ายบัญชี'); });
  t('reject requires remark', () => throws(() => ctx.updateStatus(accTok,{record:i3,action:'reject',Remark:''}), /หมายเหตุ/));
  t('staff sees masked id card', () => ok(/^X+\d{4}$/.test(ctx.getData(staffTok)[0][6])));
  ```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `src/Requests.js`; delete `saveDataB64`, `statusRecordWithRemark`, old `getData`/`findRecord` from `รหัส.js`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `fn: server-owned workflow transitions, validation, net price, audit log`.

---

### Task 5: Client session wrapper and call-site migration

**Files:**
- Create: `src/api.html`
- Modify: `src/index.html` (include `api` before other partials), `Login-out.html`, `dataTable.html`, `status.html`, `showPic.html`, `jsAdd.html`

**Interfaces:**
- Consumes: Task 2–4 public functions.
- Produces (client globals):
  - `callServer(fnName: string, ...args): Promise<any>` — prepends `localStorage.fnToken`; on error message `AUTH_REQUIRED` opens a SweetAlert login dialog (username/password), on success stores new token and **retries the same call once**; on `FORBIDDEN` shows `'คุณไม่มีสิทธิ์ดำเนินการนี้'`. Never calls `switchView`, so form state survives.
  - `localStorage` keys: `fnToken`, `fnName`, `fnRole` (old `userName`/`userRole` removed on load → forces one fresh login after deploy).
  - `applyRoleUI(role: string)` — the duplicated show/hide block from `Login-out.html` in one function.
- Call-site mapping: `checkLogin`→`login`, `saveDataB64`→`saveRequest`, `statusRecordWithRemark`→`updateStatus` (client sends `action:'reject'` instead of status), `deleteSettingData` passes `row[0]` as `expectedKey`; client no longer sends `status`, `name`, or `netprice` for saving (netprice still displayed live). Admin table shows `••••••` + a "รีเซ็ตรหัสผ่าน" button calling `resetPassword`. Barcode inputs map to new fields `barcode_*` unchanged names; remove the `[barcode] amount` concatenation in `addData`.
- DataTable: add the 5 barcode columns to `columns` (after AR column).

- [ ] **Step 1:** Implement `api.html` and migrate every `google.script.run` call — `grep -n "google.script.run" src/*.html` must return matches only inside `api.html`.
- [ ] **Step 2:** `npm test` → PASS (serve-hazard check included).
- [ ] **Step 3:** **Ask the user** for permission to `clasp push`; after approval, `npx clasp push` and run `npx clasp deployments`; ask which URL to test; test on `/dev` (HEAD).
- [ ] **Step 4: Manual checks** (Chrome, record results in commit body):
  - M1 open URL in a private window → login screen; calling `google.script.run.getData('')` from console → failure `AUTH_REQUIRED`.
  - M2 log in as each role → menus match today's behaviour; staff sees masked ID; staff "จัดการ" blocked.
  - M3 fill form, delete `fnToken` from localStorage in devtools, submit → login dialog → after login the request saves and the form data was not lost.
  - M4 run full workflow on a test row: approve → SO → AR; Log sheet has 3 rows with the ID.
  - M5 a legacy Admin user logs in; their sheet cell becomes `sha256$…`.
- [ ] **Step 5:** Commit `fn: client callServer wrapper with re-login; migrate all calls`.

---

### Task 6: Client XSS hardening

**Files:**
- Modify: `src/api.html`, `dataTable.html`, `showPic.html`, `jsAdd.html`, `Login-out.html`, `tests/client-util.test.js`

**Interfaces:**
- Produces: `escHtml(v): string` (moved from `showPic.html` into `api.html`); `safeUrl(u): string` — returns `u` only if it starts with `https://lh3.googleusercontent.com/`, `https://drive.google.com/`, else `''`.

- [ ] **Step 1: Write failing tests** in `tests/client-util.test.js` — extract the `<script>` body of `src/api.html`, run it in `vm` with stub `window/localStorage/google`, then:
  ```js
  t('escHtml escapes', () => eq(ctx.escHtml('<a href="x">\'&'), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;'));
  t('safeUrl blocks javascript:', () => eq(ctx.safeUrl('javascript:alert(1)'), ''));
  t('safeUrl allows drive', () => eq(ctx.safeUrl('https://drive.google.com/uc?id=1'), 'https://drive.google.com/uc?id=1'));
  ```
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement; then in every template that interpolates sheet/config data (`dataTable.html` columns 30/31 render, `jsAdd.html` `loadSettingsData`, `addEmailInput`, `loadGeneralConfig`, `addPremium` options, `initAllSheets` result, `Login-out.html` `#msg-name` → `.text()`), wrap with `escHtml`/`safeUrl`. DataTable: add `render: $.fn.dataTable.render.text()` as the default `columnDefs` for all plain-text columns.
- [ ] **Step 4:** `npm test` → PASS. Manual: add a location named `<img src=x onerror=alert(1)>` on /dev → renders as text, no alert. Delete it.
- [ ] **Step 5:** Commit `fn: escape all sheet data rendered on the client`.

---

### Task 7: Library pinning, cleanup, docs

**Files:**
- Modify: `src/index.html`, `src/Login-out.html`, `src/dataTable.html`, `src/jsAdd.html`, delete `src/contact.html`
- Create: `CLAUDE.md`

- [ ] **Step 1:** Pin CDN versions: Select2 css+js both `4.1.0-rc.0`; `chart.js@4.4.1`; `jquery-3.6.1.min.js`; DataTables Thai i18n `plug-ins/1.13.4/i18n/th.json`; SweetAlert2 `https://cdn.jsdelivr.net/npm/sweetalert2@11.10.5`; jquery.Thailand via `https://cdn.jsdelivr.net/gh/earthchie/jquery.Thailand.js@<tag or commit>/…` (implementer picks a tag that exists and verifies the DB JSON loads — the plugin fetches `db.json`, so set `database:` option to the same jsdelivr path).
- [ ] **Step 2:** Remove dead code: `.fablogin/.fablogout/#btnlogin` references, `contact.html` + its include, `$('#loader, .demo').toggle()`, `console.log`/`console.info` debug lines, `trustedTypes` default policy (allows everything — verify the page still loads without it on /dev; keep only if it breaks).
- [ ] **Step 3:** Write `CLAUDE.md`: architecture table (from File Structure), sheet schema (by header name, `col_()` rule, append-only columns), role matrix (Task 3 table), status machine (Task 4 table), `npm test`, deploy rules from Global Constraints, GAS comment-stripper rule.
- [ ] **Step 4:** `npm test` → PASS; with approval, push to /dev and repeat M1, M2, M4.
- [ ] **Step 5:** Commit `fn: pin CDN versions, remove dead code, add CLAUDE.md`.
- [ ] **Step 6:** Production deploy only on the user's explicit instruction: `clasp deploy -i <live deployment id>`; then M1 against `/exec`.

---

## Open Questions (need the user's answer before Task 4)

1. **Staff visibility:** the server filter for staff was commented out on purpose ("ปลดล็อกให้พนักงานเห็นข้อมูลในตารางได้ทั้งหมด"). Plan default: staff still see all rows, but the national ID shows only its last 4 digits. Alternatives: staff see only their own branch's rows / their own rows.
2. **Net price formula:** is subtracting `เงินดาวน์` from `ราคาสุทธิ` correct (so ราคาสุทธิ = amount financed), or should ราคาสุทธิ exclude the down payment? Plan keeps the current formula.
3. **Who does each step:** plan lets both `แอดมิน` and `บัญชี` perform approve / SO / AR. Should there be separate roles (e.g. การเงิน, SO, AR)?
