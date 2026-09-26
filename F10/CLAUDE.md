# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

f9 is a Google Apps Script (GAS) web app — a Mobile Pre-Order/POS/invoice system (`clasp` project, `rootDir: src`). It's one of several sibling GAS apps in this monorepo (`actss`, `actop`, `f8`, `Office`, `bnn`, `ipur`, etc.) but has no shared code with them — treat it as fully standalone. `scriptId` and `.clasp.json` live at the project root; all real source is under `src/`: `Code.js` (server), `Index.html` (SPA shell + all `<template>` markup), `JS.html` (all client JS, one `window.app` object), `CSS.html` (all styling), `appsscript.json` (manifest).

## Commands

There is no build step, bundler, or test suite — `package.json`'s `test` script is a placeholder. Development is edit-the-file-directly, then:

```bash
# Push local changes to the Apps Script project (updates @HEAD / the editor's live code only)
clasp push

# Update an EXISTING deployment in place (keeps its public /exec URL working) — NEVER a bare `clasp deploy`,
# which creates a new deployment with a different URL
clasp deploy -i <deploymentId> -d "<description>"

# List deployments to find the right <deploymentId> / confirm which one is the live public URL
clasp deployments
```

**`clasp push` alone does not update anything end users see.** It only updates `@HEAD` (the Apps Script editor's live code, viewable only by someone with edit access to the script, via a separate auth flow). Any already-created deployment (a versioned snapshot pinned to a public `/exec` URL) is frozen until you `clasp deploy -i` it explicitly. Confirm with the user which deployment is "live" before assuming a push is visible to real users — a push followed by silence is a common source of "why isn't my change showing up" confusion.

There is no local dev server and no headless test harness for this project. The only pre-push verification available is a syntax check, since `Code.js` is plain server-side JS and `JS.html`'s `<script>` block is plain client-side JS:

```bash
node --check Code.js
# JS.html isn't valid JS on its own (it's HTML) — extract the <script> block first, e.g.:
node -e "const fs=require('fs'); const m=fs.readFileSync('JS.html','utf8').match(/<script>([\s\S]*)<\/script>/); fs.writeFileSync('/tmp/extract.js', m[1]);"
node --check /tmp/extract.js
```

This only catches syntax errors, not logic bugs — there is no automated way to exercise the actual app UI in this environment. If UI verification is needed, it requires either a live deployment or a manually-built static harness (extracting the relevant `<template>` + `CSS.html` + `JS.html` into a standalone page with stubbed `google.script.run` calls).

## Architecture

**Server (`Code.js`)**: one dispatcher, `apiHandler(action, payload, userToken)`, called from the client via `google.script.run`. Every mutation runs under `LockService.getScriptLock()`. Auth is a custom HMAC-signed bearer token (`generateToken`/`verifyToken`, 30-day expiry, `timingSafeEqual` comparison), salted-SHA-256 password hashing with legacy-hash/plaintext auto-migration, and per-role checks re-verified server-side inside `apiHandler` (never trust the client's role claim) — Sales sees only its own branch's data, Manager has restricted field access on Orders, Admin is unrestricted. Login rate-limiting is 5 fails/5min via `CacheService`.

**Sheets and how they're accessed — this distinction matters a lot when changing schema:**
- Most sheets (`Products`, `Branches`, `Channels`, `Promotions`, `Interests`, `GiftMappings`, `AutoPromotions`, `Members`) are read via `getTableDataAsJson(sheet, skipCache)`, which maps the live header row to object keys dynamically (`headers.forEach((h,i) => obj[h] = row[i])`), and written via `saveRecord()`, which does the same in reverse (`headers.map(h => dataObj[h])`). **These sheets are safe to reorder columns in** — nothing hardcodes a position. The one invariant that must hold: no two columns can share the same header text at the same time (the object-key collision silently drops one of them, both on read and on write).
- `Orders` is the opposite: `processCheckout()` builds new rows as **positional arrays** (`orderRows.push([...])`, 3 separate call sites — main item row, gift row, discount row — all must stay the same length as `ORDERS_HEADERS_`), and there's a hard guard at the top of checkout that throws if the live sheet's header order doesn't exactly match `ORDERS_HEADERS_`. **Never reorder `Orders` columns in place.** To add a field to Orders, append it as a new trailing column (see the auto-retrofit pattern below) and extend `ORDERS_HEADERS_` to match — never insert in the middle.
- `UI_Banners` (hero/promo-grid/popup banner config) uses the same positional-array style as Orders (`data[i][1]`, `data[i][2]`, etc., not header-lookup) despite being edited generically.
- New trailing columns on `Orders`/`UI_Banners` are added via an idempotent retrofit run at the top of the relevant read path (`processCheckout`'s `["Receipt No","Deposit",...].forEach(col => { if (missing) append })`, `ensureBannerColumns_()`) rather than a one-time migration script — this means older spreadsheets self-heal the first time they're touched after a deploy, with no manual migration step required. `getKeyValueSettings(ss)`/`Settings` sheet is the generic key-value store (`SystemName`, `LogoUrl`, `DriveFolderId`, invoice company info, etc.) — also has this auto-append-if-missing behavior in `saveSettingsItem`.
- `getTableDataAsJson`'s cache (`CacheService`, 6h TTL, `TABLE_<name>` keys, only for the 7 tables listed above) is bypassed for Admin (`skipCache = secureUser.Role === 'Admin'`, passed from `GET_TABLE`/`GET_ALL_DATA`/`getAdvancedDashboard`) so an Admin always sees live data — including edits made by hand directly in the Sheets UI, which don't trigger any of the app's own `cache.remove()` calls. Non-Admin roles still get the cached copy. Every write path also busts the relevant table's cache directly.

**Products has its own multi-SKU add/edit flow** (`window.app.productGroup` in `JS.html`, `saveProductGroup`/`updateProductGroup` in `Code.js`) that fully replaces the generic single-row grid form for this one table (`grid.handleAddClick()`/`grid.editForm()` both special-case `tableName === 'Products'` and divert here). One request can add several SKU variants (color/capacity/stock/per-SKU image override) sharing one Model's common fields (Marketing Model, Product Group, Price, etc.); submitting an existing Model appends new SKUs to it instead of creating a duplicate (detected server-side by exact Model-string match, never trusting a client flag). Editing operates by deleting all rows of a Model and rewriting the full set — the Model field itself is guarded against renaming server-side even though the client also disables it in the UI (disabled inputs still submit their value, so the server check is the real guard). `Product Name` is never typed directly; it's always derived (`buildAutoProductName_(model, capacity, color)`), both client- and server-side.

**Generic CRUD (`grid` module in `JS.html`)** backs every other table's admin UI (a shared `<template id="tmpl-datagrid">`). It resolves which row to update in `saveRecord()` via a client-supplied `_rowIndex` (from the row object `getTableDataAsJson` already attached) when editing, or — for genuinely new records — checks the submitted ID against every existing row and rejects on collision (both client-side, for fast feedback, and server-side, as the actual enforcement; the client check alone is bypassable via a direct API call). ID fields with a client-side auto-generator (Promo ID, Channel ID, Mapping ID, Rule ID) are locked `disabled` on create as well as edit, so this collision path is mostly relevant to the three tables without one: Branches, Members, Interests.

**Frontend (`JS.html`)** is a single `window.app` object, no framework, no build step — plain template-literal HTML strings assigned to `.innerHTML`. Every string interpolated from user/sheet data goes through `window.app.esc()` (HTML-escape) or `escAttrJs()` (attribute-context escape) — this is the only XSS defense and it's manual per call site, not automatic. Images go through `formatImageUrl()`, which rewrites Google Drive share links into direct thumbnail URLs; uploads go through `selectImageForUpload()` (stages a local file in `pendingImageUploads[stateKey]`, previews immediately) then `flushImageUpload(stateKey)` (actually uploads to Drive) only at save time, not on file selection — this two-phase pattern is used everywhere images are editable (products, banners, invoice logos, login background, web app logo). Routing is a `menuConfig`-driven sidebar plus a `case` switch on a page identifier — there's no client-side router library.

**Server-side text sanitization** (`sanitizeSheetText_()`, a leading-`=+-@` formula-injection guard) is opt-in per column, via a `*_FREE_TEXT_COLS_`-style allowlist next to each write path (`SAVE_RECORD_FREE_TEXT_COLS_`, `PRODUCT_GROUP_FREE_TEXT_FIELDS_`, the `FREE_TEXT_COLS_` inside `updateFullOrder`) — **numeric/select/ID columns are deliberately excluded** (sanitizing a numeric column would corrupt it), so when adding a new free-text field to an existing table, it must be added to that table's allowlist explicitly or it silently ships unsanitized. This has happened before (`saveInvoice`'s `Invoice Date` field) — grep for `sanitizeSheetText_` near a save function before assuming a new field is covered.

**Dark mode** is a real per-viewer toggle (`html.dark` class), not a separate theme build — it works by overriding Tailwind *utility classes* wholesale in `CSS.html` (`html.dark .bg-indigo-50 { ... !important }`, `html.dark .text-black { ... !important }`, etc.), so any element built from those same utility classes gets dark-mode-correct colors automatically. The one thing this doesn't cover is CSS written as literal hex/ID-selector rules outside the Tailwind-class system (e.g. `#dataTable th`) — those need an explicit `html.dark #dataTable th { ... }` companion rule, easy to forget. The `indigo` and `slate` Tailwind color scales are remapped in `Index.html`'s inline `tailwind.config` (`indigo` → a navy/teal brand palette, not stock purple-indigo) — check that config before assuming a Tailwind color name maps to its default hex.
