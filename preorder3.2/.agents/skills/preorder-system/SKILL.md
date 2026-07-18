---
name: preorder-system-guide
description: A comprehensive guide and set of rules for modifying the Mobile Pre Order System (preorder3.2) — a Google Apps Script SPA using Google Sheets as a database. Trigger this when making changes to Code.js, JS.html, CSS.html, or Index.html.
---

# Mobile Pre Order System Guide (Apps Script + Google Sheets) — preorder3.2

Architectural context, rules, and hard-won lessons for developing and maintaining the preorder3.2 project. This is a fork of `../preorder3.1` (kept untouched as the baseline) — 3.2 is where active development continues, and it has since diverged significantly (PII handling, image upload, idempotency, admin settings consolidation, self-service password change, etc.). If you're looking at `preorder3.1`'s own skill file, that one describes the **old, unforked** state — don't use it for 3.2 work.

## 🏗️ Architecture Overview

Single Page Application (SPA) built entirely on **Google Apps Script (GAS)**, served via `HtmlService`, with **Google Sheets** as the database. UI text is Thai. Deployed with `clasp push -f` from `src/`.

### Core Files (src/)

1. **`Code.js` (Backend)**
   - `doGet(e)` serves `Index.html` with `XFrameOptionsMode.DEFAULT` (anti-clickjacking).
   - **All client-server calls go through `apiHandler(action, payload, userToken)`** — a switch-based router. Frontend calls it via `window.app.api(action, payload)`, which wraps `google.script.run` with a **45s `Promise.race` timeout** (google.script.run has none of its own — never remove this).
   - Auth: HMAC-SHA256 token (`generateToken`/`verifyToken`, `timingSafeEqual` compare) signed with a key auto-generated into `PropertiesService` (`getSecretKey()`, property `MPOS_SECRET_KEY`) — never hardcode a fallback secret. Token expiry is **30 days** (extended from 24h on 2026-07-10, owner request — "ขี้เกียจพิมพ์รหัสบ่อย"). Passwords are salted SHA-256 (`hashPassword`, salt `"Mpos2026!@#"`). `doLogin` auto-migrates plain-text/legacy-unsalted passwords to the current hash on first successful login. Login is rate-limited (5 fails / 5 min per username via `CacheService` key `LOGIN_FAIL_<username>`).
   - `apiHandler` re-loads the user from the Members sheet on every call (`secureUser`) — never trust role/branch sent from the client.
   - Key functions: `setupDatabase`, `doLogin`, `changePassword`, `processCheckout`, `updateFullOrder`, `saveRecord`, `deleteRecord`, `uploadImage`, `getTableDataAsJson`, `getAllInitialData`, `getSettingsList`, `saveSettingsItem`, `getAdvancedDashboard`, `logAudit`, `migrateDeobfuscatePII` (manual-run only, not exposed via `apiHandler`).

2. **`Index.html` (App shell + all screen templates)**
   - Loads Tailwind CSS (CDN), Font Awesome, Chart.js + chartjs-plugin-datalabels, SweetAlert2, html2canvas (2026-07-12, powers the table image-export feature — see the dedicated section below).
   - Screens live in `<template id="tmpl-...">` tags: `tmpl-login`, `tmpl-main`, `tmpl-dashboard`, `tmpl-pos`, `tmpl-datagrid`, `tmpl-analytics`, `tmpl-target`, `tmpl-invoice`, checkout modal, etc. Modals carry `role="dialog" aria-modal="true"` and (as of 2026-07-09) all four (`formModal`/`addToCartModal`/`checkoutModal`/cart drawer) cap at `max-h-[90vh]` or the drawer's own fixed viewport height. `tmpl-invoice`'s company logo/name/address/email fields default from Settings (see below) but stay editable per-document; its signature section has only one box ("ผู้อนุมัติ").
   - Imports styles/logic via `<?!= include('CSS'); ?>` and `<?!= include('JS'); ?>`.
   - `<base target="_top">` is required for genuine external links/forms to escape the GAS sandbox iframe — see pitfall below about internal `#hash` nav links.

3. **`JS.html` (Frontend controller)**
   - Everything hangs off the global `window.app` object. Global state: `window.app.user`, `window.app.globalData` (products, branches, channels, promotions, interests, giftMappings, autoPromotions, orderStatuses, banners, settings).
   - Session: **`localStorage`** key `tg_pos_user` (moved from sessionStorage 2026-07-10 so login survives browser close; `init()` reads localStorage first and auto-migrates any old sessionStorage value; both storages cleared on `logout()`). Trade-off accepted by owner: on a shared storefront device the session persists until someone presses ออกจากระบบ. `renderLayout()`'s error handling logs out **only** when the error matches /token|login/i — any other `GET_ALL_DATA` failure (e.g. 45s timeout) shows a ลองใหม่ dialog instead of destroying a valid session. Cart: localStorage key `tg_cart`. Remembered booking staff: sessionStorage `tg_bk_staff`/`tg_bk_phone`. All cleared on `logout()`.
   - Sub-modules: `window.app.pos` (cart/checkout), `window.app.dashboard`, `window.app.analytics`, `window.app.target`, `window.app.grid` (generic CRUD data grid driven by column configs), `window.app.invoice`, `window.app.systemSettings`, `window.app.settingsManager`.
   - Hash-based routing in `window.app.route()`. **Settings are one tabbed page**: `#systemsettings` (Admin only) renders a tab bar with 6 tabs — booking window, hero banners, promo grid, popup, login BG, ฐานข้อมูล (database/auto-setup). Each tab body is `settingsManager.init(type, 'ssTabContent')`. The 6 legacy hashes (`#bookingsettings` `#herobanners` `#promogrids` `#popupbanners` `#loginbg` `#autosetup`) are gone from `menuConfig` but `route()` redirects them (via `location.replace`, before the access check) to `#systemsettings` opening the matching tab; `systemSettings.tabs` is the single source for both the redirect map and the permission aliases in `checkMenuAccess`.
   - `formatImageUrl(url, size='w500')` rewrites Google Drive share/`uc?...id=` links to `https://drive.google.com/thumbnail?id=...&sz=<size>` (Drive blocks hotlinking otherwise). Hero banners use `w1600`, promo grid `w1000`.
   - `preloadBanners()` warms the browser image cache immediately after `GET_ALL_DATA` — preload sizes MUST match render sizes or the cache is useless.

4. **`CSS.html`** — custom CSS on top of Tailwind: glassmorphism, `.skeleton` shimmer, KPI gradients, cart-drawer 3-zone flex layout, print styles, `:focus-visible` ring, cross-device rules (iOS zoom prevention, `env(safe-area-inset-*)`). Theme tokens live in `:root` CSS variables (`--color-*`, `--shadow-*`) — use them instead of new hardcoded colors. **Note the Tailwind CDN cascade gotcha** — see pitfall 18 below before adding any custom rule that overlaps a Tailwind utility class on the same element.

### Frontend helpers (use these — don't reinvent)

- `window.app.esc(v)` — HTML-escape; mandatory for any sheet/user data in `innerHTML`/attributes.
- `window.app.escAttrJs(v)` — for values embedded as JS string literals inside `onclick="fn('...')"`.
- `window.app.highlightEsc(raw, term)` — escape + wrap search matches in `<mark>`; display text only, never `title=`/`alt=`.
- `window.app.emptyState({icon, title, subtitle, actionLabel, onclick})` — standard empty/error state (grid empty/search-miss/load-error, POS no-results, dashboard, analytics/target setup prompts). `onclick` must be trusted literal code, never user data.
- `window.app.buttonBusy(btn, text)` — disable + spinner for submit buttons awaiting API; returns a restore fn that **must** be called in `finally`; returns `null` if already busy (re-entry guard).
- `window.app.selectImageForUpload(inputEl, stateKey, onLocalPreview)` / `window.app.flushImageUpload(stateKey)` — deferred image upload (see below): selecting a file only validates + previews locally via `pendingImageUploads[stateKey]`; the real `UPLOAD_IMAGE` call happens when the Save handler calls `flushImageUpload`. Known stateKeys: `'gridImage'` (Products form), `'banner-<rowIndex>'` (banner edit), `'swalBanner'` (add-banner modal), `'loginBg'`.
- `window.app.chartExportButtons(canvasId)` / `window.app.tableExportButtons(cardEl)` — image-export buttons for charts/tables (see the dedicated section below). Both idempotent (check for an existing button node first), safe to call on every re-render.

## 🗄️ Database Structure (Google Sheets)

Sheets created by `setupDatabase()`: Products, Members, Branches, Channels, Promotions, Interests, GiftMappings, AutoPromotions, Orders, OrderStatus, InventoryLog, AuditLog, Settings, UI_Banners, Target, Invoices (added 2026-07-11, see the invoice approval workflow in CLAUDE.md). Always address columns **by header name, never by index**.

- **Orders**: one logical order = **multiple rows sharing an `OrderID`** (main items + gift rows + `DISCOUNT` rows). Customer fields (and `Client Request ID`) are filled **only on the first row**. Schema ends with `..., Order Status, Receipt No, Deposit, Client Request ID` — **always append new columns at the END**; `processCheckout` auto-adds missing trailing headers to older sheets.
- **Idempotency**: the client sends `clientRequestId` (`pos.pendingRequestId`) with CHECKOUT, created once per order attempt, kept across retries/timeouts, cleared on server-confirmed success and reset in `saveAndRender()` (cart change = new attempt). Server scans `Client Request ID` inside the lock; on a hit returns `{status:'success', orderId, duplicate:true}` without writing.
- **OrderStatus**: `Status ID / Status Name / Color Code` drives the read-only status timeline in the Orders edit modal (`grid.orderTimelineHtml`). Row order = flow order (Cancelled excluded, rendered as a separate red banner). Fallback flow if <2 rows: Pending → Confirmed → Paid → Delivered.
- **Members**: `Username, Password (hashed), Role (Admin/Manager/Sales), Name, Branch Code, Accessible Menus`. Never return `Password` to the client from any endpoint.
- **Products**: `SKU, Product Name, Model, Product Group, Capacity, Color, Image URL, Price, Original Price, Stock, Unit, Category, Status, Channel`. Category values include `โมบาย`, `อุปกรณ์เสริม`, `ของแถม`.
- **Settings**: key-value rows. `ReserveStart`/`ReserveEnd` drive the POS booking window (enforced server-side too), Analytics, Target. `DriveFolderId` (optional) points image uploads at a specific Drive folder instead of the auto-created "MPOS Product Images". `InvoiceCompanyName`/`InvoiceCompanyAddress`/`InvoiceCompanyEmail`/`InvoiceLogoUrl` (set under ตั้งค่าระบบ → ฐานข้อมูล → "ข้อมูลบริษัท") default the invoice/quotation page's company header fields. All written via `setNumberFormat('@')` so Sheets can't coerce them into Dates/numbers; all go through `saveSettingsItem`'s `type:'bookingsettings'` path, which is a **generic key-value writer** despite the name.
- **Target**: column 1 matches Area / Branch Code / Branch Name / Staff name; `ALL`/`ALL BRANCHES` = grand total of mobile sales.

## 👤 Roles

**Admin**: everything. **Manager**: most pages; GiftMappings/AutoPromotions as readonly grids; on Orders can only change `Order Status`, cannot delete. **Sales**: locked to own Branch/Channel (POS selects pre-filled + disabled), read-only Orders grid, no settings. `Accessible Menus` on a member overrides role defaults — matched **exactly per comma-separated menu id** (never substring). Enforce every permission in `Code.js` too: `GET_TABLE` allows `Members`/`Settings`/`AuditLog` to Admin only; `SAVE_RECORD` rejects `Orders` entirely (use `UPDATE_FULL_ORDER`); Sales only sees own-branch rows of Orders/InventoryLog; `GET_TABLE` also now gates `Target` to Admin/Manager (added 2026-07-12 — `menuConfig` already restricted the Target/Analytics *pages* that way, but the API action itself had no server-side check, so any logged-in role could read it directly via `google.script.run`).

**Every `apiHandler` action needs its own role check — don't assume "the page is gated" is enough.** The 2026-07-12 audit found `GET_SETTINGS_LIST` had *no* role check at all (unlike `GET_TABLE`'s explicit Admin-only branch for Members/Settings/AuditLog) even though its data (DriveFolderId, ApproverName, invoice company info, etc.) is exactly as sensitive — any Sales/Manager could call it directly and read the whole Settings table despite `#systemsettings` being Admin-only in the UI. Fixed with the same `if (secureUser.Role !== 'Admin') throw` pattern. When adding a new `apiHandler` case, ask "what happens if a non-Admin calls this action directly, bypassing the menu?" — the answer must come from the action's own check, never from menu/route gating alone. Also, `Accessible Menus` granting a menu id doesn't guarantee the corresponding backend actions will actually let that role do anything — e.g. granting `systemsettings` to a Manager/Sales via the Members picker used to be possible even though `saveSettingsItem`/`deleteSettingsItem`/`uploadImage` are hard Admin-only with zero exceptions; the picker no longer offers `systemsettings` as an option (2026-07-12) since granting it was purely cosmetic/misleading.

## ⚠️ Critical Rules & Known Pitfalls (learned from real bugs)

### 1. `getTableDataAsJson` returns DISPLAY strings, not values
Uses `getDisplayValues()` — `Timestamp` is the sheet's display format, **never ISO**. Parse with `new Date(str)` then build a **local** `YYYY-MM-DD` key. **Never use `toISOString()`** for date keys, date-input defaults, or export filenames — Thailand is UTC+7 and dates shift back a day. Numbers from sheets may contain commas — strip with `.replace(/,/g,'')` (or `.replace(/[^\d.\-]/g,'')` in POS flow) before `parseInt`/`parseFloat`. Two more instances from the 2026-07-12 audit, same rule family: (a) `pos.confirmAddToCart`/`updateQtyInCart`/gift-stock checks were comparing raw `.Stock` display strings instead of the comma-stripped pattern the storefront cards already used — fixed with a shared `pos.stockOf(v)` helper, use it for *every* Stock comparison in the `pos` module, not just card rendering; (b) `target.render`/`analytics.render` computed `totalDays` via `Math.ceil` on a raw millisecond diff between `ReserveStart`/`ReserveEnd` instead of a calendar-day diff — since those are `datetime-local` inputs almost never exactly N×24h apart, this over-counted the campaign end by up to 1 day (an "off-by-one via UTC/timezone-adjacent math" bug, not literally the toISOString mistake but the same category — always normalize to local calendar days before doing date arithmetic, don't trust raw ms diffs).

### 2. Escape everything injected into HTML
`window.app.esc(value)` for any sheet/user data in `innerHTML`/attributes; `escAttrJs()` inside onclick literals. Exception: AutoPromotions `Message Suggest`/`Message Apply` are intentionally rendered as HTML.

### 3. Never trust the client in `processCheckout`
Price/name/category come from the Products sheet only; Qty must be an integer ≥ 1; category `โมบาย` capped at 1 unit/order; จอง T requires `receiptNo` + `depositAmount > 0`; booking window checked server-side; every discount row re-validated against Promotions; Auto Bundle discounts recomputed from AutoPromotions.

### 4. Gift out-of-stock must not block the sale
`processGift` logs `"GIFT (NO STOCK)"` qty 0 to InventoryLog and marks the gift order row "รอสต๊อกของแถม" — the ledger reflects reality, the mobile sale still completes.

### 5. PII is written as plain text (owner's decision, 2026-07-05)
`Contact Number` and `ID Card_Passport` are written **unobfuscated** by `processCheckout`/`updateFullOrder` (with `setNumberFormat('@')` first, or Sheets coerces phone strings to numbers and drops leading zeros). Read paths still call `deobfuscate()` for backward compat with old base64 rows (digit-passthrough returns plain values untouched) — never remove it. `migrateDeobfuscatePII()` is a one-time manual migration (GAS editor only).

### 6. Data grid indices
Rows render from `filteredDataList` (search/sort/pagination applied). Any per-row action must use the absolute index into `filteredDataList`, never the page-local index or `dataList`. Export CSV also exports `filteredDataList`.

### 7. Caching (CacheService, 6h TTL)
`Products, Promotions, Branches, Channels, Interests, GiftMappings, AutoPromotions` cached as `TABLE_<name>`. `saveRecord`/`deleteRecord` clear the edited table's cache; **every stock write** (`processCheckout`, `updateFullOrder`, `deleteRecord` Orders path) must clear `TABLE_Products` — otherwise POS oversells against stale stock.

### 8. Atomic writes
Every write op holds `LockService.getScriptLock()` with `waitLock(10000)`, released in `finally`. Batch writes: build arrays in memory, write once with `Range.setValues()` — never `appendRow`/`setValue` in a loop.

### 9. Checkout payload field names are fixed
`cart, channel, branch, customerName, contactPhone, email, idCard, codeHandraiser, customerInterests, resStatus, bkStaffName, bkPhone, remark, promo, discount, discounts[], receiptNo, depositAmount, clientRequestId`. Do not invent aliases (`items`, `customer`, `phone`, `total` don't exist). `printReceipt` computes totals from `pay.cart` itself.

### 10. Checkout submit flow (hotfix — don't regress)
`isSubmitting`/button disable is released **immediately after CHECKOUT returns**, before any post-success work. The post-sale refresh (`GET_ALL_DATA` + `pos.filter()`) lives in its own try/catch that only `console.warn`s — must never surface an error dialog or block the next order.

### 11. POS validation gates
cart non-empty → channel selected → branch selected (all three, separately). จอง T requires `receiptNo` + `depositAmount > 0`. Category `โมบาย` limited to 1 unit/order (enforced client AND server). Out-of-stock cards render without their onclick.

### 12. Error contract
Backend returns `{status:'success'|'error', message}`; frontend always checks — `Swal.fire` for actions, `emptyState` error card (with retry) for page loads. No silent catches.

### 13. Changing `getSecretKey`/`MPOS_SECRET_KEY` invalidates all sessions — users must re-login once.

### 14. Never put `/*` inside any string/template literal in `JS.html`
GAS strips JS comments from `<script>` blocks **at serve time**, and its stripper treats `/*` inside a string as a comment opener — it will swallow everything to EOF, the closing `</script>` disappears, and the app white-screens. Use explicit MIME lists (`accept="image/png,image/jpeg,image/webp,image/gif"`), never `accept="image/*"`. `node --check` passes on such code — it only breaks after deploy, so grep for `/\*` in JS.html strings before pushing. (This rule is specific to `JS.html`'s served `<script>` content — `Code.js` is executed directly by the Apps Script runtime, not served, so normal block comments there are fine.)

### 15. UI conventions
Decorative absolutely-positioned layers need `pointer-events-none`. Images: `.skeleton` container + `opacity-0` img + `onload` fade-in. Banner preload sizes must match render sizes. Icon-only buttons need a Thai `aria-label`. Thai strings in `Code.js` must stay UTF-8 — rewrite any `���` mojibake.

### 16. Never let internal `#hash` nav links fall through to default anchor behavior
`<base target="_top">` means a bare `<a href="#pos" class="nav-link">` click navigates the **top-level** frame instead of just changing the hash, causing Google's wrapper to tear down/re-embed the sandboxed app iframe — sometimes leaving a permanent white screen after any menu click post-login. Fixed via a delegated listener in `init()` that does `e.preventDefault()` on `a.nav-link[href^="#"]` clicks and sets `window.location.hash` manually. Don't add new internal nav links without going through `.nav-link` + this handler.

### 17. Changing `oauthScopes` in `appsscript.json` does not reliably trigger a new consent prompt
Re-running a function from the GAS editor after a scope change may show no "Authorization required" dialog at all, even though the deployed `/dev` web app still throws an authorization error on the newly-required scope. If this happens, fully revoke the project's access at myaccount.google.com/permissions and re-authorize from scratch — and even that isn't guaranteed to fix it (see Known parked issues). Don't assume "I added the scope and re-authorized" means the deployed app actually has it; verify by testing the real feature on `/dev`.

### 18a. Tailwind CDN: new named colors in config don't render — use arbitrary values
Adding a **new** color name (e.g. `bronze:`) to `window.tailwind.config.theme.extend.colors` silently produces no CSS in this app — `bg-bronze-500` etc. render as blank/unstyled even with a full 50–900 shade set, while overriding the **existing** `indigo` scale works fine (that's how the 2026-07-10 slate-navy retone was done). Root cause unknown. Workaround: arbitrary-value syntax (`bg-[#c19a4b]`, `from-[#c19a4b]`, `shadow-[#8a6428]/20`) — works reliably and is how the bronze/gold logo accents are implemented. Theme note: the whole app's primary palette = the remapped `indigo` scale in Index.html's tailwind config + matching `--color-*` variables in CSS.html `:root` — change both together.

### 18. Tailwind CDN's cascade order is later than it looks
`CSS.html` is included near the top of `Index.html`, but the Tailwind CDN `<script>` sits near the bottom and injects its generated `<style>` into `<head>` when it runs — so Tailwind's utility classes land **later** in the cascade than custom CSS.html rules despite appearing earlier in the document source. Any custom rule targeting a property a Tailwind class also sets on the same element (`padding-bottom` via a custom class vs Tailwind's `p-2`; `bottom` via a custom `#id` vs Tailwind's `bottom-6`) needs `!important` or it silently loses. Hit this during the 2026-07-09 responsive pass (`.cart-drawer-footer` safe-area padding, `#posCartFab` safe-area bottom offset).

### 18b. Never name a custom CSS class after a Tailwind utility keyword
The 2026-07-12 chart/table export feature named a button-row modifier class `.inline` — it silently collided with Tailwind's own `.inline{display:inline}` utility. Same root cause as 18/18a (Tailwind loads after CSS.html and wins ties in the cascade), just hitting a *class name* instead of a *property* — the custom rule's `position:static` still "won" (different property, no real conflict there), but `display:flex` on the same selector lost to Tailwind's `display:inline`, turning a horizontal button row into a broken vertical stack. Avoid `inline`, `flex`, `hidden`, `block`, `relative`, `absolute`, and other bare Tailwind utility words as custom class names; this file's fix renamed it to `.table-export-btns` with `!important` as a belt-and-suspenders measure.

### 19. The cart drawer's 3-zone flex layout has interdependent fixed sizes
`#cartDrawer`/`.cart-drawer-header`/`.cart-drawer-content`/`.cart-drawer-footer` in `CSS.html`: header is `flex: 0 0 60px`, footer is `flex: 0 0 (50px + safe-area)`, and content's explicit `height: calc(100dvh - 60px - 50px - safe-area)` must stay in sync with the footer's actual height — the whole design point (per the file's own comment block) is that content can never scroll under the header or footer. Change the footer's height without updating content's calc in the same edit and the drawer's "no overlap ever" guarantee breaks silently.

## 🖼️ Image upload (Drive) — re-approved 2026-07-08, deferred-to-Save

Image upload to Google Drive was rolled back 2026-07-07 (OAuth re-consent white-screen loop) and re-approved 2026-07-08 for image upload only (not email). Current design:

- **Backend**: `UPLOAD_IMAGE` action → `uploadImage(payload, secureUser, ss)` — Admin-only, validates `image/*` + ~5MB, sanitizes filename + timestamp, uses `DriveFolderId` setting (`DriveApp.getFolderById` in try/catch) or falls back to `getFoldersByName`/`createFolder("MPOS Product Images")`. Sharing goes through `ensureLinkViewable_(file)`: try `setSharing(ANYONE_WITH_LINK, VIEW)`, and on exception accept the file if its **effective** access is already `ANYONE_WITH_LINK`/`ANYONE` with permission ≠ NONE (covers folders that are themselves link-shared — see resolved bug below); retried once (800ms delay, Drive eventual-consistency) — if still not link-viewable, trashes the orphaned file and throws rather than leaving a file with unknown/unsafe sharing. Returns `drive.google.com/uc?export=view&id=...` (compatible with `formatImageUrl`'s regex).
- **Frontend**: upload timing is **deferred to Save** (owner decision) — selecting a file only calls `selectImageForUpload` (validate + local preview via `pendingImageUploads[stateKey]`); the actual `UPLOAD_IMAGE` call happens inside the Save handler via `await flushImageUpload(stateKey)`. If it throws, the save is aborted and nothing is written. Screens that re-render their own upload UI (`grid.openForm`, `settingsManager.init`) clear their stale pending key first. There is no `handleImageUpload` function anymore — don't reintroduce an immediate-upload pattern.
- **`appsscript.json`** explicitly declares `oauthScopes` (`spreadsheets`, `drive` full, `userinfo.email`) instead of relying on auto-detection.

### ✅ Resolved: `setSharing` "authorization" bug (2026-07-08 → fixed 2026-07-11, deployed @34)
`folder.createFile()` succeeded but `file.setSharing(ANYONE_WITH_LINK, VIEW)` threw `Exception: ไม่ได้รับอนุญาตให้เข้าถึง: DriveApp`. **Not OAuth/scopes/account** (all that ruling-out was a red herring caused by the misleading error text). Root cause: the configured `DriveFolderId` folder ("รูปสินค้า" `1G86C1DV8VWyKWg2Ohu5EQP3VVA06Sz9m`) is itself link-shared **ANYONE_WITH_LINK/EDIT**, files created inside inherit that, and setting link-VIEW = downgrading an inherited permission on a child, which Drive rejects. `file.getSharingAccess()` reports the inherited effective value, which is what the `ensureLinkViewable_` fallback checks. Diagnosed via a temporary `?diag=<secret>` ContentService branch in `doGet` opened through `/dev` (real webapp auth context, plain-text report; add a cache-buster param — GAS echoes cached output for identical URLs). Note: files uploaded into that folder are link-**EDIT** (inherited) rather than link-VIEW.

## 📤 Chart/table image export — download & copy-to-clipboard (added 2026-07-12, deployed @50)

Every Chart.js chart (Dashboard's 12 charts + Analytics' forecast chart) and every summary-table card across 4 report pages (Target & Forecast, สรุปยอดจองรายวัน, สรุปยอดรุ่น/แอเรีย/ช่องทาง, สรุปข้อมูลจองทั้งหมด — 9 table cards total) has a 📥/📋 button pair in its header for "download as PNG" and "copy to clipboard".

- **Charts**: `window.app.chartExportButtons(canvasId)` — call once right after each `new Chart(...)`. `downloadChartImage`/`copyChartImage` use `Chart.getChart(canvasId)` (Chart.js's own registry lookup) rather than tracking chart instances ourselves, so it works no matter which module (`dashboard.charts`, `analytics.chart`, ...) actually holds the reference. `.toBase64Image()` for download, `.canvas.toBlob()` + `navigator.clipboard.write([new ClipboardItem(...)])` for copy.
- **Tables**: `window.app.tableExportButtons(cardEl)` — call once per `.chart-card` after setting the container's `innerHTML` (loop `container.querySelectorAll('.chart-card').forEach(...)` for multi-card pages like allBookingSummary/salesSummary; for the one static table on Target, call it once inside `render()` off `targetBodyEl.closest('.chart-card')`). Tables aren't canvases, so `renderTableToCanvas(scrollWrap)` uses the `html2canvas` CDN library — **critically, it clones the table's `.overflow-x-auto` scroll wrapper off-screen (`position:absolute; top:-99999px`) and strips `.sticky` classes + `max-height`/`overflow` from the clone before capturing**, because every summary table here uses `position:sticky` for its frozen header row and first column (see the pivot-table helpers in `bookingSummary`/`salesSummary`/`allBookingSummary`) and html2canvas is known to render sticky elements incorrectly when capturing content that's clipped by an ancestor's `overflow`/`max-height`. Without the clone-and-strip step you'd only get whatever was scrolled into view; with it, the exported PNG contains the *entire* table at full natural size (verified live: a table with columns scrolled off to the right and rows scrolled below the fold both came through correctly at ~2600×750px and ~2150×1930px respectively).
- **Shared bits**: `chartTitleOf(el)` walks up to 4 parent levels looking for an `<h6>` to name the downloaded file — works for the `.chart-card` structure most cards use *and* Analytics' one-off `.rounded-3xl` wrapper (no `.chart-card` class) since it doesn't hardcode a selector. `iconBtnBusy(btn)` is like `buttonBusy` but icon-only — swaps in a bare spinner `<i>`, no text — because these buttons are 26px square and `buttonBusy`'s default "กำลังบันทึก..." text would overflow one.
- **Verified live** (not just `/dev`): download → real PNG files saved with correct multi-KB sizes and dimensions taller/wider than the viewport; copy → `navigator.clipboard.write` succeeds from inside the GAS sandboxed iframe with no permission-policy block (this was a real open question before testing — Google's iframe wrapper *could* have restricted `clipboard-write` via `Permissions-Policy`, it doesn't).
- **Bug hit while building this**: see Critical Rule 18b — a CSS class named `.inline` collided with Tailwind's own utility of the same name.

## 📊 Dashboard booking-summary table (added 2026-07-10, revised 2026-07-11)

`window.app.dashboard.renderProductQuotaTable` renders into `#productQuotaTablesContainer` in `tmpl-dashboard` (Index.html, after the demographics charts) — **one `.chart-card`/table per Category** (not one big table), each listing its Product Names with จำนวนโควต้า / ยอดจอง T / ยอดจอง F / ยอดจองรวม / คงเหลือ and a "รวม <category>" footer row. Categories and products within them are ordered by total booked qty desc. Orders don't have their own Category column, so each order row's category is resolved via a `SKU → Category` map built from `window.app.globalData.products` (unmapped SKU falls back to `'ไม่ระบุหมวดหมู่'`). DISCOUNT rows are skipped via `SKU === 'DISCOUNT'` (their Product Name holds a promo name, not a real product).

**The by-Channel and by-Area variants were removed 2026-07-11** (owner: "นำออกก่อนยังไม่ใช่ที่ต้องการ") — `renderChannelBookingTable`, `renderAreaBookingTable`, and the shared `renderDimensionBookingTable(tbodyId, dimField)` helper are gone from JS.html, along with their two `.chart-card` blocks in Index.html. Don't assume they still exist; if the owner asks for channel/area breakdowns again they need to be rebuilt (git history before 2026-07-11 has the old grouped-rows-with-rowspan implementation as a reference, but it was grouped by Product Name per dimension — confirm the desired shape doesn't repeat that mistake).

**Reprint receipt (2026-07-10):** Orders grid has a print button (Admin/Manager only, same gate as edit/delete) calling `grid.reprintOrder(orderId)` → groups `this.dataList` by OrderID, rebuilds a `pay` object (SKU==='DISCOUNT' rows → `pay.discounts`; Unit Price=0 && Row Total=0 rows → cart items flagged `isGiftLine:true`) → calls the existing `printReceipt(orderId, pay)`. `printReceipt` gained an additive `item.isGiftLine` flag (shows "ฟรี") since reconstructed gift rows have no stored parent-item link (unlike live checkout's `item.brandGifts`/`channelGifts`) — zero risk to the live checkout path, which never sets this flag. Remember `pay.discount` (flat sum) must be set alongside `pay.discounts` (array) — `printReceipt`'s actual grand-total math reads `pay.discount`, not the array.

Products has no "original quota" column — `Stock` is already *current remaining* (decremented live by `processCheckout`). So `จำนวนโควต้า` is derived as `คงเหลือ (current Stock) + ยอดจองรวม (all-time booked qty)`, confirmed correct with the owner. **These 3 tables deliberately read `dashboard.rawOrders`, not `filteredOrders`** — they ignore the dashboard's date/branch/sales filters, because quota/remaining are live stock snapshots with no time dimension; filtering them would make the quota math not reconcile. The section header says so explicitly ("ไม่ขึ้นกับตัวกรองด้านบน"). Area is joined onto each order via `Branches` lookup (`bInfo.Area`) — added to the existing Mall/Region/Province/Type Name join in `dashboard.init()`/`startAutoRefresh()`; Channel is already a direct column on Orders, no join needed. Section is `admin-filter`-gated (hidden for Sales role), matching the neighboring demographics charts.

## 🚀 Common Workflows

### Deploy
```bash
clasp push -f     # from D:\New folder\app01\preorder3.2 — the only "build" step
```
No tests/linter/bundler. Verify JS syntax before pushing: `node --check src/Code.js`; for `src/JS.html` extract the script body first (strip `<script>`/`</script>` wrapper lines) then `node --check`. A **test deployment** (`/dev`) picks up changes on hard refresh; a **versioned deployment** (`/exec`) needs a new version, either from the GAS editor UI or `clasp deploy -i <deploymentId>` (creates a new numbered version and re-points that exact `/exec` URL at it — find the deployment ID with `clasp deployments`). As of 2026-07-12 the owner's main `/exec` link (deployment `AKfycbxtjT0...`) is pinned at version **@50**, which includes everything through the invoice approval workflow (see CLAUDE.md Project Overview for the full pre-2026-07-12 history) plus the 2026-07-12 full-codebase audit (11 bug fixes — see Critical Rules 1 and the Roles section for the notable ones) and the chart/table image-export feature (see the dedicated section above). `clasp push -f` alone only updates `/dev`, not `/exec` — don't assume a push is visible on `/exec` without also redeploying.

### Add a column to Orders
1. Append to the END of the schema in `setupDatabase`.
2. In `processCheckout`: extend the header auto-add block and append the value to **all three** `orderRows.push()` calls (main item, gift, discount — same length, positional).
3. Add a column config to the Orders `grid.init` call in `JS.html` **only if user-visible** (internal columns like `Client Request ID` are deliberately omitted).
4. Add to `printReceipt` if it prints.

### Add a new page
1. `<template id="tmpl-xxx">` in `Index.html`.
2. Menu entry in `window.app.menuConfig` (JS.html top) with allowed roles.
3. Module `window.app.xxx = { init, ... }` + a case in `window.app.route()`.
4. If it needs backend data, add an action to `apiHandler` (enforce role there too).
5. Use `emptyState` for empty/error/setup states and `buttonBusy` on submit buttons.

### First-time setup / login
Run `setupDatabase` (or Auto Setup button) → creates sheets + seed users `admin/admin123`, `sales/sales123`. Once Members has data, Auto Setup requires a logged-in Admin token. Plain-text passwords typed directly into Members work once and auto-hash on first login. Self-service password change is available from the user menu (key icon next to logout) for any logged-in role, own account only.
