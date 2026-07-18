---
name: preorder-system-guide
description: A comprehensive guide and set of rules for modifying the Mobile Pre Order System (preorder3.1) — a Google Apps Script SPA using Google Sheets as a database. Trigger this when making changes to Code.js, JS.html, CSS.html, or Index.html.
---

# Mobile Pre Order System Guide (Apps Script + Google Sheets)

Architectural context, rules, and hard-won lessons for developing and maintaining the preorder3.1 project.

## 🏗️ Architecture Overview

Single Page Application (SPA) built entirely on **Google Apps Script (GAS)**, served via `HtmlService`, with **Google Sheets** as the database. Deployed with `clasp push` from `src/`.

### Core Files (src/)

1. **`Code.js` (Backend, ~1000 lines)**
   - `doGet(e)` serves `Index.html` as the app shell.
   - **All client-server calls go through `apiHandler(action, payload, userToken)`** — a switch-based router. Frontend calls it via `window.app.api(action, payload)` which wraps `google.script.run`.
   - Auth: HMAC-SHA256 token (`generateToken`/`verifyToken`) signed with a key from `PropertiesService` (`getSecretKey()`, property name `MPOS_SECRET_KEY`). Passwords are SHA-256 hashed with salt `"Mpos2026!@#"` (`hashPassword`). `doLogin` also auto-migrates plain-text passwords in the Members sheet to hashes on first successful login.
   - Key functions: `setupDatabase`, `doLogin`, `processCheckout`, `updateFullOrder`, `saveRecord`, `deleteRecord`, `getTableDataAsJson`, `getAllInitialData`, `getAdvancedDashboard`, `logAudit`.

2. **`Index.html` (App shell + all screen templates)**
   - Loads Tailwind CSS (CDN), Font Awesome, Chart.js + chartjs-plugin-datalabels, SweetAlert2, Google Fonts (Prompt/Sarabun).
   - Screens live in `<template id="tmpl-...">` tags: `tmpl-login`, `tmpl-main`, `tmpl-dashboard`, `tmpl-pos`, `tmpl-datagrid`, `tmpl-analytics`, `tmpl-target`, `tmpl-invoice`, checkout modal, etc.
   - Imports styles/logic via `<?!= include('CSS'); ?>` and `<?!= include('JS'); ?>`.

3. **`JS.html` (Frontend controller, ~3300 lines)**
   - Everything hangs off the global `window.app` object. Global state: `window.app.user`, `window.app.globalData` (products, branches, channels, promotions, interests, giftMappings, autoPromotions, banners, settings).
   - Session persistence uses **`sessionStorage`** key `tg_pos_user` (NOT localStorage — deliberate security choice). Cart uses localStorage key `tg_cart`.
   - Sub-modules: `window.app.pos` (POS/cart), `window.app.dashboard`, `window.app.analytics`, `window.app.target`, `window.app.grid` (generic data grid), `window.app.invoice`.
   - `formatImageUrl(url, size='w500')` rewrites Google Drive share links to `https://drive.google.com/thumbnail?id=...&sz=<size>` (Drive blocks hotlinking). Hero banners use `w1600`, promo grid `w1000`.
   - `preloadBanners()` warms the browser image cache immediately after `GET_ALL_DATA` — preload sizes MUST match render sizes or the cache is useless.

4. **`CSS.html`** — custom CSS on top of Tailwind: keyframes, glassmorphism (`.glass-nav`, `.glass-panel`), `.skeleton` shimmer, SweetAlert theming, cart drawer 3-zone flex layout, print styles.

## 🗄️ Database Structure (Google Sheets)

Sheets created by `setupDatabase()`: Products, Members, Branches, Channels, Promotions, Interests, GiftMappings, AutoPromotions, Orders, OrderStatus, InventoryLog, AuditLog, Settings, UI_Banners, Target.

Key schemas (query by header name, never by index):

- **Orders** (22+2 columns): `OrderID, Timestamp, Channel, Branch Code, Customer Name, Contact Number, Email, ID Card_Passport, Code Handraiser, SKU, Product Name, Qty, Unit Price, Promo, Reservation Status, Staff, Booking Phone, Customer Interests, Remark, Row Total, Order Status, Receipt No, Deposit`
  - One logical order = multiple rows sharing an `OrderID` (main items + gift rows + DISCOUNT rows). Customer fields are filled **only on the first row** of an order.
  - `Receipt No` / `Deposit` (deposit receipt + amount) were appended later — `processCheckout` auto-adds these headers to older sheets if missing. **Always append new columns at the END** of the schema so existing sheet data doesn't shift.
- **Members**: `Username, Password (hashed), Role (Admin/Manager/Sales), Name, Branch Code, Accessible Menus`
- **Branches**: `Channel, Branch Code, Branch Name, Area, Mall, Region, Province, Type Name`
- **Products**: `SKU, Product Name, Model, Product Group, Capacity, Color, Image URL, Price, Stock, Unit, Category, Status, Channel` — Category values include `โมบาย`, `อุปกรณ์เสริม`, `ของแถม`
- **Target**: `Area, เป้า` — column 1 matches an Area / Branch Code / Branch Name / Staff name; special value `ALL` or `ALL BRANCHES` = grand total of all mobile sales
- **Settings**: key-value rows; important keys: `ReserveStart`, `ReserveEnd` (drive Analytics & Target pages — both pages show an error prompt if unset)

## ⚠️ Critical Rules & Known Pitfalls (learned from real bugs)

### 1. `getTableDataAsJson` returns DISPLAY strings, not values
It uses `getDisplayValues()` — so `Timestamp` arrives as the sheet's display format (e.g. `7/3/2026 13:05:22`), **never ISO**. Parsing rules:
- ❌ `o.Timestamp.split('T')[0]` — silently produces garbage keys
- ✅ `new Date(o.Timestamp)` then build a local `YYYY-MM-DD` key: `dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0')`
- Never mix `toISOString()` (UTC) keys with local-date keys — Thailand is UTC+7, dates shift near midnight.
- Compare days by **date-key string**, not by Date objects with time components.

### 2. Caching (CacheService, 6-hour TTL)
Tables `Products, Promotions, Branches, Channels, Interests, GiftMappings, AutoPromotions` are cached as `TABLE_<name>`. Consequences:
- Direct edits to those sheets won't appear for up to 6h unless the cache is cleared.
- `saveRecord` clears the cache for the edited table; `getAllInitialData` clears `TABLE_AutoPromotions` and `TABLE_Branches` on every call (login/refresh).
- If you add a column to a cached sheet, clear its cache or users see stale headers.

### 3. Checkout payload field names (printReceipt bug class)
The checkout payload (`submitCheckout` → `pay`) uses: `cart, channel, branch, customerName, contactPhone, email, idCard, codeHandraiser, customerInterests, resStatus, bkStaffName, bkPhone, remark, promo, discount, discounts[], receiptNo, depositAmount`.
**Do not invent aliases** (`items`, `customer`, `phone`, `subTotal`, `total` do not exist). `printReceipt` computes subtotal/total from `pay.cart` itself. Cart items are `{...product, qty, brandGifts, channelGifts}` so they carry `Price`, `SKU`, `Product Name`.

### 4. Validation gates in the POS flow
- `openCheckoutModal` blocks when: cart empty → channel unselected → **branch unselected** (all three checked separately; the branch check was once missing and caused blank Branch Code in Orders).
- จอง T (real deposit booking) **requires** `receiptNo` + `depositAmount > 0`; จอง F (สวมสิทธิ์) does not.
- Mobile category (`โมบาย`) is limited to 1 unit per order — enforced in both `addToCart` and `updateQtyInCart`.

### 5. Atomic transactions & performance
- Write operations (`processCheckout`, `updateFullOrder`, `deleteRecord`) must hold `LockService.getScriptLock()` with `waitLock(10000)` and release in `finally`.
- Batch all sheet writes: build arrays in memory, write once with `Range.setValues()`. Never `appendRow`/`setValue` in a loop.
- Stock updates: read `Products` once into memory, mutate the array, write the Stock column back in one `setValues`.

### 6. Roles & security (validate backend-side, always)
- **Admin**: everything. **Manager**: most pages, no user management. **Sales**: locked to own `Branch Code`/`Channel` (selects are pre-filled and disabled), cannot delete orders or edit settings.
- `apiHandler` verifies the HMAC token and re-loads the user from Members on every call (`secureUser`) — never trust role/branch data sent from the client.
- PII (`Contact Number`, `ID Card_Passport`) is obfuscated in the sheet and deobfuscated on read (`deobfuscate`).

### 7. UI conventions
- Decorative absolutely-positioned layers (blur overlays, gradient orbs, glow accents) MUST have `pointer-events-none` — a backdrop-blur overlay once made the login form untappable.
- Images: render with `.skeleton` on the container + `opacity-0` img + `onload` fade-in; remove skeleton class on load.
- Errors: backend returns `{status:'success'|'error', message}`; frontend always checks and shows `Swal.fire` — no silent failures.
- Thai text in Code.js must stay UTF-8 — corrupted escape garbage (`���...`) has appeared before; if you see it, rewrite the string.

## 🚀 Common Workflows

### Deploy
```
clasp push        # from D:\New folder\app01\preorder3.1
```
Then hard-refresh the web app (test deployments pick up pushes immediately; versioned deployments need a new version).

### Add a column to Orders
1. Append it to the END of the Orders schema in `setupDatabase`.
2. In `processCheckout`: extend the header auto-add block, and append the value to **all four** `orderRows.push()` calls (main item, gift, discounts-array, legacy-discount) — arrays are positional and must all have the same length.
3. Add a column config in the Orders grid (`JS.html`, the `grid.init` call for Orders).
4. If it prints, add it to `printReceipt`.

### Add a new page
1. `<template id="tmpl-xxx">` in `Index.html`.
2. Menu entry in the `window.app.menus` array (JS.html top) with allowed roles.
3. A module `window.app.xxx = { init, render }` and a route case in `window.app.route()`.

### First-time setup / login
- Run `setupDatabase` (or the Auto Setup button) → creates sheets + seed users `admin/admin123`, `sales/sales123`.
- Plain-text passwords typed directly into the Members sheet work once and are auto-hashed on first login.
