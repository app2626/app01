# FN+ Consignment (fn)

Google Apps Script web app (clasp, `rootDir: src`). Branch staff submit installment-sale approval
requests; finance/accounting move them through a fixed workflow. Data lives in the bound Google Sheet.

## Layout

| File | Responsibility |
|---|---|
| `src/รหัส.js` | `doGet`, `include` |
| `src/Schema.js` | `DATA_HEADERS`, `LOG_HEADERS`, `col_()`, `STATUS`, `SETTINGS_SHEETS`, `ensureSheets_()` |
| `src/Auth.js` | password hashing, `login`/`logout`, `requireSession_` |
| `src/Settings.js` | config (masked secrets), dropdown lists, settings CRUD, `withLock_` |
| `src/Register.js` | self-registration (`register`, `getRegisterOptions`, no token), `approveUser` / `approveUsers` (bulk), `setUserStatus` (block / unblock) |
| `src/Recovery.js` | forgot password: emailed 6-digit code (`requestPasswordReset`, `resetPasswordWithCode`, no token) |
| `src/Validate.js` | Thai ID check digit, passport no., phone rules (`normalizePhone_`); mirrored in `api.html` |
| `src/Requests.js` | `saveRequest`, `getData`, `findRecord`, `updateStatus` (workflow) |
| `src/Notify.js` | Telegram + email (`sendNotify_`); **every email goes through `sendMail_` / `mailUser_`** (checks the daily MailApp quota, Telegram warning when ≤ 20 left) |
| `src/Audit.js` | `audit_(actor, action, target, detail)` → `Audit` sheet; never throws; config changes log key names only, never values |
| `src/api.html` | client `callServer()`, `escHtml()`, `safeUrl()`, `applyRoleUI()` |
| other `src/*.html` | UI partials (Bootstrap 5, jQuery, DataTables, Select2, SweetAlert2, Chart.js) |

## Rules

- **Every public server function takes `token` first and calls `requireSession_(token, roles)`.**
  Helpers that must not be callable from the browser end in `_` (GAS hides them from `google.script.run`).
- **Client calls go through `callServer('fn', ...args)` only** — never `google.script.run` directly
  (except `login`/`logout`/`register`/`getRegisterOptions`/`requestPasswordReset`/`resetPasswordWithCode` in `api.html`/`Login-out.html`, which have no token yet).
- **No top-level code that reads another file's globals** (GAS file load order is not guaranteed) —
  wrap it in a function, e.g. `workflow_()`.
- **Data columns are append-only.** Address columns by header via `col_('สถานะ :')`, never by number.
  Add a column by appending to `DATA_HEADERS`; `ensureSheets_()` extends the live header row.
- **Escape on output:** sheet values into HTML → `escHtml()`; URLs → `safeUrl()` (Google Drive hosts only).
- **GAS serve-time comment stripper:** never put a slash-star sequence inside a JS string, template
  or regex in `src/*.html`; `npm test` runs `tools/check-gas-serve.js` to catch it.

## Roles and workflow

| Role | Can |
|---|---|
| `พนักงาน` | submit requests, view table (national ID masked to last 4 digits) — **only for their registered branches** (`branchScope_`: getData, findRecord, saveRequest, location dropdown); no branch = no data |
| `บัญชี` | + every workflow step, dashboard, all branches |
| `แอดมิน` | + settings, users, config, sheet setup |

| action | allowed from | to |
|---|---|---|
| `approve` (needs ยอดเงินโอน) | `''`, `รออนุมัติ` | `รอเปิด SO` |
| `reject` (needs remark) | `''`, `รออนุมัติ` | `ไม่อนุมัติ` |
| `updateSO` (needs SO no.) | `รอเปิด SO`, legacy `อนุมัติแล้ว` with SO empty | `รอเปิด Invoice` |
| `updateAR` (needs invoice) | `รอเปิด Invoice`, legacy `อนุมัติแล้ว` with SO filled | `เสร็จสมบูรณ์` |

The server decides the new status and the actor (from the session); each step appends a Log row
`[time, actor, status, record id, action]`. Approve / reject also emails the submitter
(`ผู้บันทึก (Username) :`, falling back to the account named in `รหัสพนักงาน :` for older rows).
Account and settings changes (register, approve, block, password resets, settings CRUD, config) go to the `Audit` sheet. Net price is recomputed server-side:
`price − down − all discounts + dues`.

Sessions: ScriptCache `sess_<token>`, 6 h sliding TTL; role re-read from the Admin sheet on every call.
Passwords: `sha256$<salt>$<hex>` (1000 rounds); legacy plaintext cells are upgraded on first login.
Login locks for 15 min after 5 failures per username. Sessions store `pv` (password fingerprint): any password
change (email reset or admin reset) ends that user's older sessions.
Admin sheet columns: `ADMIN_HEADERS` (Username, Password, name, role, email, phone, branch, status).
Self-registered accounts are `พนักงาน` with status `รออนุมัติ` and cannot log in until an แอดมิน approves;
Status `ระงับ` (blocked via `setUserStatus`) = cannot log in, session ends on the next call; an admin cannot block themself.
blank status (older rows) = active. Branch cell may list several branches (relief staff), joined by ", " in location order. Registration is throttled to 30 sign-ups / 10 min app-wide.
Blank role cell = แอดมิน only while no row says แอดมิน explicitly (legacy behaviour), otherwise พนักงาน.

Sheet grid: sheets created by `appendRow` are only as wide as their first row, and `getRange` past
`getMaxColumns()` throws in real GAS. `getDataSheet_()` widens the grid; the mock enforces the limit (26 default).

## Commands

```
npm test              # serve-hazard check + server tests (GAS mock) + client util tests
npm run test:server
npm run check:gas
```

## Deploy

- Never `clasp push` / `clasp deploy` without the user's explicit go-ahead each time.
- `clasp push` updates only @HEAD (`/dev` URL). Run `clasp deployments` and confirm which URL is live
  before testing; production is `clasp deploy -i <deploymentId>`.
- After the first deploy of the session/hash change, every user must log in again once.
