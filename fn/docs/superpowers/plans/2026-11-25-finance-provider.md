# Finance Provider Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every request records which finance company (Ponmai, Vyvr, …) the customer pays through; admins manage the list.

**Architecture:** New admin-managed settings sheet `Finance`; new appended Data column `ไฟแนนซ์ :` (index 46); server validates against the list; blank legacy rows read as Ponmai on the client.

**Tech Stack:** Google Apps Script, HtmlService, Bootstrap 5.1 / jQuery / DataTables / Chart.js 4; tests on the in-memory GAS mock (`npm test`).

**Spec:** `docs/superpowers/specs/2026-11-25-finance-provider-design.md`

## Global Constraints
- Data columns are append-only; address by header via `col_()`. New header text: `ไฟแนนซ์ :`.
- Settings sheet name `Finance`, header `ชื่อไฟแนนซ์`, seeded `Ponmai`, `Vyvr` only when the sheet is created.
- Blank finance on a row means `Ponmai` (client constant `DEFAULT_FINANCE = 'Ponmai'`).
- Every public server function takes `token` first; no `/*` inside JS strings in `src/*.html`.

## Review Focus
1. Live deployment whose spreadsheet has no `Finance` sheet yet → first dropdown load/save must create and seed it, not fail. (Task 1 test: `financeList_ creates Finance sheet when missing`.)
2. Value with surrounding spaces (`' Vyvr '`) → accepted and stored trimmed. (Task 1 test.)
3. Admin deletes every provider → save fails with a clear Thai message, not a silent blank row. (Task 1 test.)
4. Legacy rows (46 columns, no finance) → getData returns `''` at index 46; client shows Ponmai. (Task 1 test + Task 2 manual check.)
5. Finance filter + status card filter together → counts and rows agree. (Task 2 manual check in preview.)

---

### Task 1: Server — Finance sheet, column, validation, notifications

**Files:** Modify `src/Schema.js`, `src/Settings.js`, `src/Requests.js`; Test `tests/server.test.js`

**Interfaces — Produces:**
- `DATA_HEADERS[46] === 'ไฟแนนซ์ :'` (length 47)
- `SETTINGS_SHEETS` includes `'Finance'`; `SHEET_DEFS` entry `{ name: 'Finance', headers: ['ชื่อไฟแนนซ์'], seed: [['Ponmai'], ['Vyvr']] }`
- `financeList_(): string[]` (trimmed, non-empty; creates/seeds sheet if missing)
- `getAllDropdownData(token).finance: Array<[string]>` (same shape as other lists)
- form field `f.finance`

- [ ] Step 1: tests — `DATA_HEADERS has 47 columns`; `ensureSheets_ seeds Finance with Ponmai, Vyvr`; `ensureSheets_ does not reseed existing Finance`; `financeList_ creates Finance sheet when missing`; `saveRequest stores finance trimmed` (`' Vyvr '` → `'Vyvr'` at `C('ไฟแนนซ์ :')`); `unknown finance rejected` (/ไฟแนนซ์/); `empty finance rejected`; `empty Finance list rejects save`; `getAllDropdownData returns finance`; `new request Telegram/email text contains finance`. Update `form()` fixture and the line-215 call to pass `finance: 'Ponmai'`; update "46 columns"/"8 sheets" assertions to 47/9.
- [ ] Step 2: run `npm run test:server` → new tests FAIL.
- [ ] Step 3: implement (seed only on `isNew` in `ensureSheets_`; validate in `saveRequest` after `validateForm_`; add `'\nไฟแนนซ์: '` line after the date line of the new-request message; add finance to the `updateStatus` notify message).
- [ ] Step 4: `npm test` → all PASS.

### Task 2: Client — form, table, filter, detail, admin tab, dashboard

**Files:** Modify `src/index.html`, `src/jsAdd.html`, `src/dataTable.html`, `src/showPic.html`, `src/dashboard.html`, `src/css.html`

**Interfaces — Consumes:** `getAllDropdownData().finance`, row index 46, `addSetting/deleteSetting/loadSettingsData('Finance')`.

- [ ] Step 1: form — required `<select id="finance" name="finance">` first in step 3, filled by `loadAllDropdowns`.
- [ ] Step 2: table — column `ไฟแนนซ์` (data 46, render blank → `DEFAULT_FINANCE`, class `fin` badge, always visible); finance filter `<select id="financeFilter">` in the page head; `showData` counts respect the filter; filter uses DataTables column search by name `finance`.
- [ ] Step 3: detail popup + dashboard chart `financeChart` (doughnut, approved rows, blank → Ponmai).
- [ ] Step 4: admin tab "Finance" mirroring the Product tab.
- [ ] Step 5: `npm test` (serve check) + local preview: filter Vyvr + รออนุมัติ shows consistent count/rows.
