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
| `src/Requests.js` | `saveRequest`, `getData`, `findRecord`, `updateStatus` (workflow) |
| `src/Notify.js` | Telegram + email (`sendNotify_`) |
| `src/api.html` | client `callServer()`, `escHtml()`, `safeUrl()`, `applyRoleUI()` |
| other `src/*.html` | UI partials (Bootstrap 5, jQuery, DataTables, Select2, SweetAlert2, Chart.js) |

## Rules

- **Every public server function takes `token` first and calls `requireSession_(token, roles)`.**
  Helpers that must not be callable from the browser end in `_` (GAS hides them from `google.script.run`).
- **Client calls go through `callServer('fn', ...args)` only** — never `google.script.run` directly
  (except `login`/`logout` in `api.html`/`Login-out.html`, which have no token yet).
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
| `พนักงาน` | submit requests, view table (national ID masked to last 4 digits) |
| `บัญชี` | + every workflow step, dashboard |
| `แอดมิน` | + settings, users, config, sheet setup |

| action | allowed from | to |
|---|---|---|
| `approve` (needs ยอดเงินโอน) | `''`, `รออนุมัติ` | `รอเปิด SO` |
| `reject` (needs remark) | `''`, `รออนุมัติ` | `ไม่อนุมัติ` |
| `updateSO` (needs SO no.) | `รอเปิด SO`, legacy `อนุมัติแล้ว` | `รอเปิด Invoice` |
| `updateAR` (needs invoice) | `รอเปิด Invoice` | `เสร็จสมบูรณ์` |

The server decides the new status and the actor (from the session); each step appends a Log row
`[time, actor, status, record id, action]`. Net price is recomputed server-side:
`price − down − all discounts + dues`.

Sessions: ScriptCache `sess_<token>`, 6 h sliding TTL; role re-read from the Admin sheet on every call.
Passwords: `sha256$<salt>$<hex>` (1000 rounds); legacy plaintext cells are upgraded on first login.
Login locks for 15 min after 5 failures per username.

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
