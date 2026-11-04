# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

f9 is a Google Apps Script (GAS) web app — a Mobile Pre-Order/POS/invoice system (`clasp` project, `rootDir: src`). It's one of several sibling GAS apps in this monorepo (`actss`, `actop`, `f8`, `Office`, `bnn`, `ipur`, etc.) but has no shared code with them — treat it as fully standalone. `scriptId` and `.clasp.json` live at the project root; all real source is under `src/`: `Code.js` (server), `Index.html` (SPA shell + all `<template>` markup), `JS.html` (all client JS, one `window.app` object), `CSS.html` (all styling), `appsscript.json` (manifest).

## Commands

There is no build step or bundler. Development is edit-the-file-directly, then run the local test harness before any push:

```bash
npm test              # server (Code.js against an in-memory GAS mock) + client (real Index/CSS/JS in headless Chrome)
npm run test:server  # ~100 checks, no browser needed
npm run test:client  # ~105 checks; needs Chrome/Edge (set CHROME_PATH if not in a standard location); screenshots land in tests/out/
```

The harness lives in `tests/` (`gasmock.js` = in-memory SpreadsheetApp/CacheService/LockService/etc., `server.test.js`, `client.test.js`). When changing seeded data or product counts, update the expected counts in `client.test.js`. It is not a substitute for a real deployment check. Deploy flow:

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

There is no local dev server, but `npm test` (above) is the pre-push gate. For a quick syntax-only check of the two source files:

```bash
node --check src/Code.js
# JS.html isn't valid JS on its own (it's HTML) — extract the <script> block first, e.g.:
node -e "const fs=require('fs'); const m=fs.readFileSync('src/JS.html','utf8').match(/<script>([\s\S]*)<\/script>/); fs.writeFileSync(process.env.TEMP+'/extract.js', m[1]);"
node --check "$TEMP/extract.js"
```

The harness cannot reproduce what GAS does when *serving* the page — see the serve-time comment stripper gotcha below, and verify UI changes on the live deployment (open it in a **fresh tab**; the browser caches the old iframe content, so a stale page after a deploy usually means a cached tab — hard-reload or add `?nocache=1`).

**Tailwind is precompiled** (no runtime CDN): after adding/changing any Tailwind class in `Index.html`/`JS.html`, run `npm run build:css` (`tools/build-css.js` → `src/TailwindCSS.html`, config in `tailwind.config.js`). Class names assembled from strings at runtime must be added to the `safelist` there or they silently get no CSS. Commit the regenerated `TailwindCSS.html`.

**GAS serve-time comment stripper is not string-aware**: a `/*` inside any string in a `<script>` deletes the rest of the file (white screen), and a `//` (e.g. `https://…`) inside a *template literal* (backticks) truncates that line and leaks following markup into attributes. `node --check` and `npm test` both pass on such code. Avoid both sequences in strings in `JS.html`/`Index.html` scripts (single/double-quoted `'https://…'` has been fine in practice).

## Architecture

**Server (`Code.js`)**: one dispatcher, `apiHandler(action, payload, userToken)`, called from the client via `google.script.run`. Every mutation runs under `LockService.getScriptLock()`. Auth is a custom HMAC-signed bearer token (`generateToken`/`verifyToken`, 30-day expiry, `timingSafeEqual` comparison), salted-SHA-256 password hashing with legacy-hash/plaintext auto-migration, and per-role checks re-verified server-side inside `apiHandler` (never trust the client's role claim) — Sales sees only its own branch's data, Manager has restricted field access on Orders, Admin is unrestricted. Login rate-limiting is 5 fails/5min via `CacheService`.

**Sheets and how they're accessed — this distinction matters a lot when changing schema:**
- Most sheets (`Products`, `Branches`, `Channels`, `Promotions`, `Interests`, `GiftMappings`, `AutoPromotions`, `Members`) are read via `getTableDataAsJson(sheet, skipCache)`, which maps the live header row to object keys dynamically (`headers.forEach((h,i) => obj[h] = row[i])`), and written via `saveRecord()`, which does the same in reverse (`headers.map(h => dataObj[h])`). **These sheets are safe to reorder columns in** — nothing hardcodes a position. The one invariant that must hold: no two columns can share the same header text at the same time (the object-key collision silently drops one of them, both on read and on write).
- `Orders` is the opposite: `processCheckout()` builds new rows as **positional arrays** (`orderRows.push([...])`, 3 separate call sites — main item row, gift row, discount row — all must stay the same length as `ORDERS_HEADERS_`), and there's a hard guard at the top of checkout that throws if the live sheet's header order doesn't exactly match `ORDERS_HEADERS_`. **Never reorder `Orders` columns in place.** To add a field to Orders, append it as a new trailing column (see the auto-retrofit pattern below) and extend `ORDERS_HEADERS_` to match — never insert in the middle.
- `UI_Banners` (hero/promo-grid/popup banner config) uses the same positional-array style as Orders (`data[i][1]`, `data[i][2]`, etc., not header-lookup) despite being edited generically.
- New trailing columns on `Orders`/`UI_Banners` are added via an idempotent retrofit run at the top of the relevant read path (`processCheckout`'s `["Receipt No","Deposit",...].forEach(col => { if (missing) append })`, `ensureBannerColumns_()`) rather than a one-time migration script — this means older spreadsheets self-heal the first time they're touched after a deploy, with no manual migration step required. `getKeyValueSettings(ss)`/`Settings` sheet is the generic key-value store (`SystemName`, `LogoUrl`, `DriveFolderId`, invoice company info, etc.) — also has this auto-append-if-missing behavior in `saveSettingsItem`.
- `getTableDataAsJson`'s cache (`CacheService`, 6h TTL, `TABLE_<name>` keys, only for the 7 tables listed above) is bypassed for Admin (`skipCache = secureUser.Role === 'Admin'`, passed from `GET_TABLE`/`GET_ALL_DATA`/`getAdvancedDashboard`) so an Admin always sees live data — including edits made by hand directly in the Sheets UI, which don't trigger any of the app's own `cache.remove()` calls. Non-Admin roles still get the cached copy. Every write path also busts the relevant table's cache directly.

**Dashboard cache**: `GET_ADVANCED_DASHBOARD` serves a raw (pre-role-filter, Password-stripped) snapshot of Orders/Products/Members from `CacheService` (`DASH_BASE_*` chunks, 120s TTL; `dashCachePut_`/`dashCacheGet_`). `apiHandler` wraps `apiHandlerInner_` and invalidates it before and after every action NOT listed in `DASH_READ_ACTIONS_` — a new read-only action should be added there, a new write action needs nothing. The client's refresh button sends `{refresh:true}` to bypass it. Sales branch filtering and PII deobfuscation happen after the cache, never inside it.

**Product deep links**: `?p=<Model>` (storefront `sharedModel` → `paramsFromState`/`applyUrlParams`). Share URLs are built from `window.__APP_URL` (`ScriptApp.getService().getUrl()` injected by `doGet`). `doGet` also injects `window.__DEEP_MODEL` (the sanitized `p`, `<>&`/control chars stripped, ≤120 chars — it lands inside a `<script>` via `JSON.stringify`, which does not escape `</script>`, so any new user-controlled value injected this way needs the same treatment); a link with `p` and no hash lands on `#pos` instead of `#dashboard`. Footer contact info comes from Settings keys `ContactPhone`/`ContactLine`/`ContactHours` (`renderFooterContact`).

**Products has its own multi-SKU add/edit flow** (`window.app.productGroup` in `JS.html`, `saveProductGroup`/`updateProductGroup` in `Code.js`) that fully replaces the generic single-row grid form for this one table (`grid.handleAddClick()`/`grid.editForm()` both special-case `tableName === 'Products'` and divert here). One request can add several SKU variants (color/capacity/stock/per-SKU image override) sharing one Model's common fields (Marketing Model, Product Group, Price, etc.); submitting an existing Model appends new SKUs to it instead of creating a duplicate (detected server-side by exact Model-string match, never trusting a client flag). Editing operates by deleting all rows of a Model and rewriting the full set — the Model field itself is guarded against renaming server-side even though the client also disables it in the UI (disabled inputs still submit their value, so the server check is the real guard). `Product Name` is never typed directly; it's always derived (`buildAutoProductName_(model, color)`), both client- and server-side.

**Generic CRUD (`grid` module in `JS.html`)** backs every other table's admin UI (a shared `<template id="tmpl-datagrid">`). It resolves which row to update in `saveRecord()` via a client-supplied `_rowIndex` (from the row object `getTableDataAsJson` already attached) when editing, or — for genuinely new records — checks the submitted ID against every existing row and rejects on collision (both client-side, for fast feedback, and server-side, as the actual enforcement; the client check alone is bypassable via a direct API call). ID fields with a client-side auto-generator (Promo ID, Channel ID, Mapping ID, Rule ID) are locked `disabled` on create as well as edit, so this collision path is mostly relevant to the three tables without one: Branches, Members, Interests.

**Frontend (`JS.html`)** is a single `window.app` object, no framework, no build step — plain template-literal HTML strings assigned to `.innerHTML`. Every string interpolated from user/sheet data goes through `window.app.esc()` (HTML-escape) or `escAttrJs()` (attribute-context escape) — this is the only XSS defense and it's manual per call site, not automatic. Images go through `formatImageUrl()`, which rewrites Google Drive share links into direct thumbnail URLs; uploads go through `selectImageForUpload()` (stages a local file in `pendingImageUploads[stateKey]`, previews immediately) then `flushImageUpload(stateKey)` (actually uploads to Drive) only at save time, not on file selection — this two-phase pattern is used everywhere images are editable (products, banners, invoice logos, login background, web app logo). Routing is a `menuConfig`-driven sidebar plus a `case` switch on a page identifier — there's no client-side router library.

**Server-side text sanitization** (`sanitizeSheetText_()`, a leading-`=+-@` formula-injection guard) is opt-in per column, via a `*_FREE_TEXT_COLS_`-style allowlist next to each write path (`SAVE_RECORD_FREE_TEXT_COLS_`, `PRODUCT_GROUP_FREE_TEXT_FIELDS_`, the `FREE_TEXT_COLS_` inside `updateFullOrder`) — **numeric/select/ID columns are deliberately excluded** (sanitizing a numeric column would corrupt it), so when adding a new free-text field to an existing table, it must be added to that table's allowlist explicitly or it silently ships unsanitized. This has happened before (`saveInvoice`'s `Invoice Date` field) — grep for `sanitizeSheetText_` near a save function before assuming a new field is covered.

**Storefront (`window.app.pos`)** keeps its filter state in `storeFilters` and mirrors it to the URL through `syncUrl`/`applyUrlParams` (`google.script.history`, because the app runs inside the GAS iframe and `window.location.search` never sees the outer URL). Public order tracking works the same way: `doGet` validates `?track=`/`?orderId=` (`^[A-Za-z0-9_-]{1,64}$`) and injects it as `window.__TRACK_PARAM` in `Index.html`. Product channel matching goes through `window.app.channelOk()` (`ALL`/`*`/`ทั้งหมด` = every channel) — but the storefront filter deliberately keeps the old strict match for gift rows, because `setupDatabase` seeds gifts with channel `ALL` and they must not become sellable cards. Cards group SKUs by `Model`, so price sorting uses each model's minimum price. Companion ("ซื้อคู่") suggestions are derived from `AutoPromotions` rules (`recommendCompanions`), with no extra sheet column; `window.app.NO_IMG` is the inline SVG placeholder used instead of external placeholder services.

**Dark mode** is a real per-viewer toggle (`html.dark` class), not a separate theme build — it works by overriding Tailwind *utility classes* wholesale in `CSS.html` (`html.dark .bg-indigo-50 { ... !important }`, `html.dark .text-black { ... !important }`, etc.), so any element built from those same utility classes gets dark-mode-correct colors automatically. The one thing this doesn't cover is CSS written as literal hex/ID-selector rules outside the Tailwind-class system (e.g. `#dataTable th`) — those need an explicit `html.dark #dataTable th { ... }` companion rule, easy to forget. The `indigo` and `slate` Tailwind color scales are remapped in `tailwind.config.js` (precompiled — see above; the old runtime-CDN `window.tailwind` assignment is gone). Tailwind's own `borderRadius`/`backdropBlur` overrides were intentionally left out. The remap (`indigo` → a navy/teal brand palette, not stock purple-indigo) — check `tailwind.config.js` before assuming a Tailwind color name maps to its default hex.

**Wording & UI conventions**: user-visible text says "Pre Booking" (not "Pre Order"/"POS"), but internal names stay — route/menu id `pos`, `window.app.pos`, Orders column `Pre Order No` (Orders is positional, never rename). Sidebar items are two-line (Thai `label` over English `sub` in `menuConfig`, rendered by `navLabelHtml`; permissions/routes key on `id`, never the label); the bottom of the sidebar is a single user-menu card (`#userMenuBtn`/`#userMenuPop`), and the mobile menu keeps its own older bottom buttons. Thai-ID/passport validation lives in `normalizeIdCard_` (server, authoritative) and `validateIdCard` (client). Footer contact info (`ContactPhone`/`ContactLine`/`ContactHours` in Settings → `renderFooterContact`) and the Settings contact card are Admin-editable without a redeploy.
