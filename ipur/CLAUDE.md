# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`ipur` is a Vite + React single-page app that compiles down to **one standalone Google Apps Script (GAS) web app**. It gives CRUD/search access to two tabs ("Cost", "PriceSet") and a read-only view of a third ("Code ส่วนลด") in the Google Sheet hardcoded as `SPREADSHEET_ID` in `public/Code.js`. There is no separate backend server — `Code.js` *is* the backend, running inside Apps Script, and the sheet itself is the database.

This folder is one of many independent small app projects inside a larger `app01` monorepo (siblings: `bnn`, `preorder3.1`, `preorder3.2`, `shiftf2`, etc). Treat `ipur` as self-contained — don't reach into sibling folders unless the user explicitly asks for a cross-project change.

## Commands

```bash
npm run dev       # vite dev server — UI only; google.script.run is unavailable outside GAS, so any real API call will fail here
npm run build     # builds dist/index.html (single inlined file via vite-plugin-singlefile)
npx clasp push --force   # pushes dist/ (Code.js, appsscript.json, index.html) to the bound Apps Script project's HEAD
```

There is no lint or test script configured.

**Testing a change end-to-end** (since `npm run dev` can't reach `apiHandler`): `npm run build && npx clasp push --force`, then open the Apps Script editor → Deploy → "การนำการทดสอบไปใช้งาน" (Test deployments) to get a `/dev` URL that always reflects the latest push. The live `/exec` URL is pinned to a specific deployment version and does **not** update on push.

**Never run `clasp deploy -i <deploymentId>` without the user's explicit go-ahead in that turn.** `clasp push` is routine and safe (only updates HEAD/`/dev`); `clasp deploy` updates the production `/exec` URL that real users hit.

## Architecture

**Build → GAS pipeline:** `public/Code.js` and `public/appsscript.json` are copied verbatim into `dist/` by Vite's public-dir passthrough (not bundled/transformed). `src/` is bundled + inlined into a single `dist/index.html` by `vite-plugin-singlefile`. `.clasp.json`'s `rootDir` is `dist`, so `clasp push` uploads all three files together. `doGet()` in `Code.js` serves that inlined HTML via `HtmlService.createHtmlOutputFromFile('index')`.

**One API entry point:** the frontend never uses `fetch`. `src/lib/api.js` wraps every call through `google.script.run.apiHandler(action, payload, { Token })`, and `apiHandler` in `Code.js` is the single router (`LOGIN`, `DESCRIBE_SHEET`, `GET_FILTER_OPTIONS`, `GET_RECORDS`, `SAVE_RECORD`, `DELETE_RECORD`). Add new capabilities as a new `action` case there, not a new entry point.

**Per-sheet config, not per-sheet code.** Three parallel objects in `Code.js`, all keyed by the exact sheet tab name string, drive everything sheet-specific:
- `SHEET_META` — `headerRow`, `dataStartRow`, and `readOnly` flag.
- `PRIMARY_LABELS` — which columns show in the compact table view (everything else is still returned by `describeSheet` for the edit form, just not shown as a table column).
- `FILTER_FIELDS` — filter-bar fields per sheet; `mode: 'select'` gets a dropdown of distinct values from `getFilterOptions`, `mode: 'text'` gets a free contains-match input.

To add a new sheet tab: add entries to all three of the above (keys must exactly match the sheet's actual header labels), then add it to the `SHEETS` array in `src/App.jsx`.

**Runtime schema detection, not a hardcoded model.** `describeSheet()`/`getColumnMeta()` infer each column's type, editability, and (for validation-backed columns) dropdown options by sampling the live sheet — header-row formulas, data-row formulas, data validations, and sample values — rather than from a fixed schema. This is intentional: these sheets get restructured externally and the app needs to keep working.

**Header-anchored formula gotcha:** some columns' formula lives in the *header* cell (e.g. `={"Status"; ARRAYFORMULA(...)}` or an `IMPORTRANGE` anchored at row 1) and spills down through every data row below — the spilled cells report no formula of their own via `getFormulas()`. Column-meta detection samples the header row's formulas *and* the data rows for exactly this reason; writing into a cell that's part of such a spill breaks the whole column. `Code ส่วนลด` is entirely one `IMPORTRANGE` spilling across all 12 columns — that's why it's marked `readOnly: true` in `SHEET_META`, and both `saveRecord`/`deleteRecord` hard-reject writes to any `readOnly` sheet regardless of role.

**RowUID pattern:** editable sheets get a `RowUID` column appended at `sheet.getLastColumn()+1` (never assume a fixed column letter) and backfilled with `Utilities.getUuid()` once. `getReadHeaders()` is a cheap variant used by `getRecords`/`getFilterOptions` that only checks the header exists — it skips the full backfill scan, since that only ever needs to happen once and already runs inside `saveRecord`/`deleteRecord`'s `ensureRowUidColumn` call.

**Auth:** custom HMAC-signed token (`generateToken`/`verifyToken` in `Code.js`), not Google's built-in auth — a `Users` sheet (`Username`/`PasswordHash`/`Role`) is seeded with one admin account on first run via `ensureSupportSheets`, password hashed with SHA-256 + a static salt. The frontend persists both the token *and* the user object in `sessionStorage` (`src/lib/api.js`) so a page refresh restores the logged-in UI without re-hitting the server — the client-side expiry check on load is UX only; `verifyToken`'s signature check on every `apiHandler` call is the real enforcement. On a genuine server-side session-expiry error, `api.js`'s `onSessionExpired` hook forces a clean logout back to the login screen.

**Frontend state:** `src/hooks/useSheetData.js` centralizes schema, filter config/options, search, filters, sort, and pagination for whichever sheet tab is active. Search and filter inputs are debounced 400ms before triggering a `GET_RECORDS` call — don't remove this, typing directly into a large sheet's search box without it fires a full round-trip per keystroke.

**Permissions:** `Role` is `Admin` or `Viewer`. `canWrite` (server) and `canWrite` (client, `user.Role === 'Admin'`) both gate `SAVE_RECORD`/`DELETE_RECORD` — always check both sides when touching write paths, the client check is UX only.
