# Mobile Pre Order System (MPOS) — Full System Spec

> Reverse-engineered functional/technical spec of `pbzf8.2`, written to hand off to a developer (or an AI coding agent) building a **new implementation on the same stack** (Google Apps Script + Google Sheets). It describes *what the system must do*, not just what the current code happens to do — read it as requirements, and treat file/line references back to the reference implementation as pointers, not gospel.

---

## 1. What this system is

A **Single Page Application for taking mobile-phone/accessory pre-orders** across retail branches, online channels, and B2B — used by a company's own Sales/Manager/Admin staff (not a public storefront). Built entirely on:

- **Backend**: Google Apps Script (GAS), served via `HtmlService.createTemplateFromFile(...).evaluate()`.
- **Database**: Google Sheets (one spreadsheet = one deployment's entire database).
- **Frontend**: vanilla JS + Tailwind (CDN) + Chart.js + SweetAlert2, all inlined into one served HTML document via GAS's `include()` templating — no bundler, no framework.
- **UI language**: Thai. **Timezone**: Asia/Bangkok (UTC+7) — this matters everywhere dates are involved (see §9.1).

The core loop: a staff member logs in → picks a sales channel/branch → builds a cart of products (with optional bundled gifts and promotions) → checks the customer out → the order and every line item land in a shared `Orders` sheet → management views aggregated sales through dashboards, analytics, and exportable reports.

---

## 2. Tech stack & deployment model

| Concern | Choice | Why it matters for a rebuild |
|---|---|---|
| Runtime | Google Apps Script (V8), single project, one `scriptId` | No servers to provision; execution has GAS's quotas (6-min execution limit per call, `LockService` for concurrency) |
| Database | Google Sheets, one tab per entity | No real transactions — atomicity is hand-rolled via `LockService.getScriptLock()` around every write (§9.2) |
| Frontend delivery | `doGet()` returns one big HTML document; all CSS/JS is inlined via GAS's `<?!= include('X'); ?>` templating | There is no separate static-asset pipeline; "deploy" = push source to the script project |
| Frontend framework | None — a single global object (`window.app`) with sub-modules, hash-based routing (`window.location.hash`) | Every "page" is a `<template>` swapped into a `#page-content` div |
| Auth | Custom HMAC-signed bearer tokens stored client-side, verified server-side on every call | No Google Identity / OAuth login for end users — this is a from-scratch username/password system layered on top of GAS |
| Styling | Tailwind CDN (`<script src="https://cdn.tailwindcss.com">`) + a hand-written CSS layer for anything Tailwind can't express | No Tailwind build step exists; Tailwind's config is a runtime `window.tailwind.config` object |
| Charts | Chart.js + `chartjs-plugin-datalabels`, loaded from CDN | Draws to `<canvas>`, so it cannot read CSS variables/theme — colors must be passed in as JS at chart-creation time |
| Export | `html2canvas` for PNG export of charts/tables; client-side CSV generation | No server-side reporting/export pipeline |
| Source layout | 4 files: `Code.js` (backend), `Index.html` (shell + page templates), `JS.html` (all frontend logic), `CSS.html` (all custom styles) | Keep this file count small and inlined — it's a deliberate constraint of the platform, not an oversight |
| "Build" | `clasp push -f` from the project directory (matching `.clasp.json`'s `scriptId`) | No compilation; a syntax error only surfaces after push, so validate JS syntax locally first (`node --check`) before every push |
| Environments | A **test deployment** (`/dev` URL, always serves latest pushed source) and one or more **versioned deployments** (`/exec` URL, frozen at a specific pushed version) | `/dev` for iterating, `/exec` for what real users hit — pushing doesn't update `/exec` until a new version is cut |

### 2.1 First-run bootstrap

A one-time `setupDatabase()` function (run manually from the Apps Script editor, not exposed over the public API after first use) must:
1. Create every required sheet with the correct header row (bold, colored) if it doesn't already exist.
2. Seed each *newly created* sheet with a small amount of realistic demo data (branches, channels, a few products, gift-mapping rules, promotions, interests) — enough that a fresh deployment is immediately explorable, not enough that it looks like production data.
3. Seed exactly one `Members` row: an `admin` account with `Role=Admin`, `Branch Code=ALL`, `Accessible Menus=*`, and a **randomly generated password** (not a hardcoded default) returned once in the function's result so the operator can capture it from the execution log.
4. **Lock itself after first successful run**: store a script property (e.g. `MPOS_SETUP_COMPLETED`). Once the `Members` sheet has real rows, re-running this function must require a valid, already-logged-in Admin token — never let it silently reset a live database. Before that point (first-ever run, empty `Members`), it must be callable without a token so there's a way to bootstrap at all.

---

## 3. Roles & permissions

Three roles, enforced **on both sides** — the UI hides things a role shouldn't see, but every single privileged server action must independently re-check the role, because the UI is not a trust boundary.

| Role | Can do |
|---|---|
| **Admin** | Everything: all pages, all CRUD, all settings, Members management, Audit Log, approve invoices, delete anything. |
| **Manager** | Most pages, including Analytics/Target/report pages. `GiftMappings`/`AutoPromotions` are **read-only** for Manager (server enforces this — Manager-authored writes to these two tables must be rejected regardless of what the UI allows through). On `Orders`, may change only the `Order Status` field, cannot delete orders. Can approve invoices. No Settings/Members/Audit access. |
| **Sales** | Locked to their **own Branch/Channel** — the POS branch/channel selectors are pre-filled from their Member record and disabled, not just visually but the server must independently derive branch/channel from the logged-in user, never trust a client-supplied branch/channel for a Sales user. Read-only `Orders`/`InventoryLog` grids scoped to their own branch. No settings access. Invoices they create are visible only to themselves (not other Sales staff). |

**Per-member menu override**: a `Members.Accessible Menus` field can override the role defaults with a comma-separated list of page/menu ids (or `*`/`ALL` for everything). Matching must be **exact per token**, never substring — a member granted access to `autopromotions` must not thereby gain access to a `promotions` page just because one string contains the other.

**Every privileged backend action must independently enforce role**, not just the router-level auth check that a valid token exists. Concretely, a rebuild must reject at minimum:
- Reading `Members`/`Settings`/`AuditLog` tables to non-Admin (and always strip the password field from any `Members` row before it leaves the server, for any role, always).
- Reading the settings-list endpoint to non-Admin.
- Any direct write to the `Orders` table through the generic "save one record" endpoint (orders are multi-row and must go through the dedicated checkout/update-order workflow, never the generic CRUD save).
- Non-Admin/Manager users listing or reading Invoices/Orders/InventoryLog belonging to someone else's branch or username.

---

## 4. Data model (spreadsheet schema)

Every "table" is a Sheet tab. **Columns must always be addressed by header name, never by positional index**, in every part of the system *except* the one documented exception in §6.3 (`Orders` append writes) — that exception exists because of a specific historical performance/complexity tradeoff and must be treated as a hard invariant if reproduced, not a shortcut to copy elsewhere.

| Sheet | Columns (in order) | Notes |
|---|---|---|
| **Products** | `SKU, Product Name, Model, Product Group, Capacity, Color, Image URL, Price, Stock, Unit, Category, Status, Channel, Original Price` | `Category` is one of a fixed set (`โมบาย`, `อุปกรณ์เสริม`, `สมาร์ทวอทช์`, `หูฟัง`, `ของแถมแบรนด์`, `ของแถมช่องทาง`). `Channel` is a comma-list of channels this product is sellable through, or `ALL`. `Original Price` is display-only (shows a "was ↔ now" price on the product card); the price actually charged is always `Price`. |
| **Members** | `Username, Password, Role, Name, Branch Code, Accessible Menus` | `Password` is a salted SHA-256 hex digest, never plaintext, never returned to any client for any reason. `Branch Code = ALL` means an HQ/multi-branch user (their effective Channel becomes `ALL` too). |
| **Branches** | `Channel, Branch Code, Branch Name, Area, Mall, Region, Province, Type Name` | One row per physical/virtual sales point. `Channel` here is the *single* channel this branch belongs to (contrast with `Products.Channel`, which is a multi-value list). |
| **Channels** | `Channel ID, Channel Name, Description` | `Channel Name` (a plain string, e.g. `"Retail"`, `"Online"`, `"B2B"`) is the only real join key used anywhere else in the system to mean "channel" — `Channel ID` is decorative and must not be given any downstream meaning. Don't invent a numeric-ID-based join for channels. |
| **Promotions** | `Promo ID, Promo Name, Discount Type, Value, Status` | `Discount Type` is `Fixed` or `Percent`. These are the manually-added, cart-level discount rows a staff member picks at checkout (contrast with `AutoPromotions`, which apply themselves). |
| **Interests** | `Interest Name, Status` | A simple lookup list shown as checkboxes at checkout ("what is this customer interested in") for post-hoc marketing analytics — not a business rule input. |
| **GiftMappings** | `Mapping ID, Target Mobile (SKU or Group), Channel, Brand Gifts, Channel Gifts, Status` | Defines "buy this phone/group through this channel → these gifts become pickable." `Target Mobile` may be an exact SKU, a Product Group name, or `*` for any. `Channel`, `Brand Gifts`, `Channel Gifts` are all comma-lists (see §7.1 on comma-list matching rules — this is the most important correctness rule in the whole spec). `Mapping ID` is the primary key; never key logic off `Target Mobile`, it isn't unique. |
| **AutoPromotions** | `Rule ID, Buy Category, Get Discount Category, Discount Percent, Message Suggest, Message Apply, Status, Channel` | Rules that auto-suggest/auto-apply a percentage discount on one product category when the cart contains another category (e.g. "buy a phone, get 10% off headphones"), scoped optionally by `Channel` (comma-list, blank/`*`/`ALL` = every channel). `Rule ID` is the primary key. `Message Suggest`/`Message Apply` are the **one deliberate exception** to "always HTML-escape sheet data" — they are meant to be authored with basic HTML by an Admin and rendered as-is. |
| **Orders** | `OrderID, Timestamp, Channel, Branch Code, Customer Name, Contact Number, Email, ID Card_Passport, Code Handraiser, SKU, Product Name, Qty, Unit Price, Promo, Reservation Status, Staff, Booking Phone, Customer Interests, Remark, Row Total, Order Status, Receipt No, Deposit, Client Request ID` (24 columns) | **One logical order = multiple rows sharing an `OrderID`** — one row per cart line item, plus one row per awarded gift, plus one row per applied discount (a synthetic `SKU='DISCOUNT'`-style row). Customer-level fields (`Customer Name` through `Client Request ID`-adjacent identity fields) are populated **only on the first row** of the order; later rows leave them blank. New columns must always be appended at the end, never inserted in the middle — see §6.3 for why. |
| **OrderStatus** | `Status ID, Status Name, Color Code` | Defines the ordered pipeline of order states shown as a read-only timeline (e.g. Pending → Confirmed → Paid → Delivered), with `Cancelled` as a special terminal state excluded from the linear timeline and shown separately. If this sheet has fewer than 2 rows, fall back to that same default 4-stage flow. |
| **InventoryLog** | `Log ID, Timestamp, SKU, Action, Qty, Branch Code, User` | An append-only ledger of every stock movement (sale, gift-given, gift-out-of-stock, manual adjustment). |
| **AuditLog** | `Log ID, Timestamp, User, Action, Details` | An append-only ledger of sensitive actions (logins, settings changes, deletions) for accountability — Admin-only to read. |
| **Settings** | `Key, Value, Remark` | A generic key-value store. Values must be written as **plain text** (force a text number-format on that column) so Sheets never silently coerces a date-like or numeric-looking value. Known keys: `SystemName`, `Currency`, `ReserveStart`, `ReserveEnd` (ISO-like datetime strings defining the booking window), `DriveFolderId`, `Invoice*` (invoice-branding fields), `ApproverName`, `ApproverSignatureUrl`. |
| **UI_Banners** | `Banner ID, Type, URL, Status, Target Link, Details` | `Type` is one of `loginbg`, `herobanner`, `promogrid`, `popupbanner` — drives the login background image, dashboard hero carousel, dashboard promo grid, and a one-time popup modal respectively. |
| **Target** | `Area, เป้า` (+ a synthetic grand-total row, see §8 known-limitations) | Sales targets per area/branch/staff for the Target & Forecast page, keyed by a value that may match `Branch Code`, `Branch Name`, an Area name, or a Staff name, plus a special `ALL`/`ALL BRANCHES` row meaning "grand total." |
| **Invoices** | `Invoice ID, Invoice No, Type, Invoice Date, Customer Name, Customer Address, Customer Phone, Customer Email, Customer TaxID, Job Name, Payment Terms, Items JSON, Remarks, VAT Enabled, WHT Percent, Sub Total, VAT, WHT, Net Total, Company Name, Company Address, Company Email, Logo Url, Status, Requested By, Requested At, Approved By, Approved At` (28 columns) | One document = one row; line items are serialized as a JSON array string in `Items JSON`, not as separate rows. `Status` flows `รออนุมัติ` (pending) → `อนุมัติแล้ว` (approved); once approved, the document is locked from editing (Admin can still delete). `Approved By` must be stamped from the `ApproverName` setting, not the identity of whoever clicked "approve" (that person's identity goes to `AuditLog` instead, for accountability without misrepresenting who the official approver is). |

---

## 5. Authentication & security model

- **Login**: username + password only. Password is compared as a salted SHA-256 hash (constant, app-wide salt + per-password hash — not a per-user salt/bcrypt scheme, a deliberate simplicity tradeoff for a GAS-hosted internal tool; a rebuild on a different stack should feel free to upgrade this to bcrypt/argon2 without breaking anything else described here).
- **Rate limiting**: failed login attempts are capped (5 failures / 5 minutes per username) using a short-lived cache, to blunt brute-force guessing. This counter increment does not need to be perfectly race-safe under concurrent requests — that's an accepted low-severity gap, not something worth adding heavyweight locking for.
- **Session tokens**: on successful login, issue a signed token: `base64(JSON{Username, exp})` + `.` + `base64(HMAC-SHA256(that base64 string, server secret))`. Verify by recomputing the HMAC and comparing with a **constant-time** comparison (never a plain `===`/`!==` on secret-derived values — timing differences leak information character-by-character). Token expiry: 30 days (a deliberate choice — this is staff tooling used daily, not a high-turnover consumer session; don't shorten it without being asked). The signing secret is generated once and stored in the platform's secret/config store — **never hardcode a fallback secret in source**, and changing the secret invalidates every existing session (acceptable; document it if you do it).
- **Every authenticated call re-loads the user's role/branch fresh from the `Members` table on the server** — never trust a role or branch value the client sends or one that was true when the token was issued. A user's role can change between two calls in the same session; the second call must reflect the *current* row, not a cached identity from login time.
- **Never return the password field to any client, for any role, from any endpoint** — even Admin. Admin can *see that a password exists / reset it*, never read its hash back.
- **PII handling**: phone numbers and ID card/passport numbers are stored as **plain text** in the sheet (not encrypted/obfuscated) — but the column must be forced to text format first, or Sheets will silently coerce a phone number to a number and drop a leading zero. If porting from an older system that *did* obfuscate this data (e.g. base64), keep a read-time deobfuscation step that passes plain digit strings through untouched, so both old and new rows read correctly — don't require a hard cutover migration before the read path works.
- **Formula/CSV injection**: any user-typed free-text value that gets written into a spreadsheet cell (customer name, remarks, staff name, invoice fields, etc.) must be sanitized before writing — if the string starts with `=`, `+`, `-`, or `@`, spreadsheet software will interpret it as a formula regardless of the column's number format. Prefix such values with a literal `'` before writing (the standard OWASP-recommended mitigation). Apply this narrowly, at each specific free-text write site — **never blanket-apply it to every column**, or numeric fields get stringified and downstream sums silently break. Audit *every* code path that can produce that free-text value, not just the obvious "user typed it into a form field" one — a value can also originate from a less-direct branch (e.g. a synthetic discount-row label assembled from a client-supplied name on a promotion-matching code path) and still needs the same sanitization at its own write site; a per-field sweep that only checks the primary input path can miss these.
- **Stored XSS**: absolutely everything read from a sheet or supplied by a user and placed into `innerHTML` or an HTML attribute must be HTML-escaped at render time, with no exceptions except the one documented in §4 (`AutoPromotions` message fields, which are Admin-authored HTML by design). This includes values placed inside dynamically-built `<option value="...">` elements — a generic "select field" renderer is not exempt just because it feels like structured data.
- **Server-side whitelist validation for controlled-vocabulary fields**: any field the client UI presents as a fixed-option `<select>` (order status, reservation type, etc.) must still be validated against the real list of allowed values **on the server**, independent of the UI constraint — a direct API call can submit any string for a field the UI never lets a user free-type. This is a distinct requirement from formula-injection sanitization (don't "fix" a controlled-vocabulary field by running it through the free-text sanitizer instead — a legitimate status value never starts with `=`/`+`/`-`/`@` anyway, and blanket-sanitizing risks corrupting a field other code compares with strict equality).
- **New accounts must never default to a hardcoded password.** This isn't only a bootstrap-time rule (§2.1's initial admin) — it applies to *every* account-creation path in the system (e.g. an Admin adding a new staff member through a management UI and leaving the password field blank). Generate a random password the same way the bootstrap path does and surface it once to the person who just created the account; never fall back to a fixed, guessable default "to keep things simple."
- **Anti-clickjacking**: the served page must set an X-Frame-Options / frame-ancestors policy that prevents third-party framing by default; only relax it for a deliberate, explicit iframe-embedding use case.

---

## 6. Business logic — checkout & orders (the core workflow)

### 6.1 Checkout payload contract

The client sends one payload with (at minimum) these fields — treat this as the fixed contract, don't invent alternate field names for the same concepts:

`cart[]` (each line: SKU, qty, unit price *as sent, but never trusted*, chosen gifts), `channel`, `branch`, `customerName`, `contactPhone`, `email`, `idCard`, `codeHandraiser`, `customerInterests`, `resStatus` (reservation status), `bkStaffName`, `bkPhone` (booking staff / booking phone), `remark`, `promo`, `discount`, `discounts[]` (structured discount rows: manual promo picks + at most one Auto-Bundle row per real checkout), `receiptNo`, `depositAmount`, `clientRequestId`.

### 6.2 Server-side checkout validation (never trust the client for any of this)

1. **Price, product name, and category always come from the `Products` sheet**, looked up by SKU — never from whatever the client's cart payload claims. This is the single most important rule in the whole spec: a client can send any price it wants, the server must ignore it and re-derive from the authoritative product record.
2. **Quantity** must be a positive integer. The `โมบาย` (mobile phone) category is capped at **1 unit per order**, enforced independently at add-to-cart time, at quantity-update time, *and* again server-side at checkout — all three layers, not just one.
3. **Cart stock checks must sum quantity across every cart line for the same SKU**, not just the line being touched — the same SKU can legitimately appear as multiple separate cart lines when different gift selections were made for each, and checking only one line's quantity against available stock lets the cart silently overcommit stock.
4. **Reservation types**: `จอง T` (a deposit-backed reservation) requires a non-empty receipt number and a deposit amount `> 0`; `จอง F` (no deposit) does not require either.
5. **Booking window**: if `Settings.ReserveStart`/`ReserveEnd` are set, checkout must be rejected outside that window — enforced server-side even though the UI also blocks it, since the UI is not a trust boundary.
6. **Channel/branch pairing must be validated even when branch is the special value `ALL`** — don't skip the channel-membership check just because branch is a wildcard; a crafted payload could otherwise claim an arbitrary channel string and unlock channel-restricted gift/promotion rules that shouldn't apply.
7. **Manual discounts** (from `Promotions`) are re-validated against the sheet, not trusted from the client; a `Percent`-type promo is capped at that percentage of the sheet-priced goods subtotal (not of whatever inflated subtotal a crafted cart might imply).
8. **Auto-Bundle discounts** (from `AutoPromotions`) are recomputed from the rules table server-side, never trusted from the client's `discounts[]` array directly.
9. **Discount-ceiling accumulation must be tracked across the whole `discounts[]` array, grouped by Auto-Bundle-vs-named-promo, not validated per individual row against the full ceiling independently** — checking each row in isolation lets a payload with multiple duplicate/synthetic discount rows multiply the allowed total discount, since a legitimate checkout only ever sends **one** Auto-Bundle row plus distinct-named manual promo rows.
10. **Gifts that are out of stock must never block the underlying sale.** If a gift's stock has run out, log a zero-quantity inventory entry noting the shortfall, mark that specific gift's order row with a "pending gift stock" status, and let the phone/product sale itself complete normally. The customer got their phone; the gift ledger just reflects reality and gets fulfilled later.
11. **Idempotency**: the client sends a `clientRequestId` with every checkout attempt. Inside the write lock, scan existing orders for a matching request id; if found, return the existing order as a success with a `duplicate: true` flag rather than writing a second copy. This covers the double-submit case (user double-clicks, or a slow network causes a client-side retry).
12. **All of the above happens inside a script-wide write lock** with a bounded wait, released in a `finally` — see §9.2.

### 6.3 Orders header-order invariant

Because each order writes several fixed-length positional rows (main item rows, gift rows, discount rows) rather than mapping values by header name, **the live sheet's actual header row must match the expected schema, column-for-column, or data silently lands in the wrong field** (e.g. a phone number ending up in a "customer interests" column). A rebuild has two acceptable choices, pick one deliberately:
- **(a)** Keep the positional-array approach for performance, but hard-block checkout with a clear error the moment the sheet's header order doesn't match the expected schema — never write positionally-mismatched data silently. This only works if you can trust the column order is never manually reordered outside the app (confirm this assumption with whoever owns the spreadsheet before relying on it).
- **(b)** Map every write by header name like the "update an existing order" pathway does, at some cost to write performance. Prefer this for a rebuild unless there's a specific, measured performance reason not to.

Either way: **new Orders columns must always be appended at the end** of the schema, never inserted in the middle, and any header-name-mapped update path (editing an existing order) must be kept consistent with whichever approach checkout uses.

### 6.4 Multi-select comma-list matching (applies to `GiftMappings.Channel`, `AutoPromotions.Channel`, and any future field of this shape)

Any field that can hold a multi-select value saved as a comma-separated string (e.g. `"Retail, Online"`) must be matched by **splitting into trimmed, lowercased tokens and checking token membership** — never:
- exact whole-string equality (`=== wholeString`) — fails the instant more than one option is selected, and
- naive substring matching (`wholeString.includes(candidate)`) — false-positives across unrelated values (e.g. a channel literally named `"RetailPlus"` would wrongly match a check for `"Retail"`).

Blank / `*` / `ALL` should be treated as "matches everything." **Client-side pickers and server-side validation must implement this identically** — if the picker shows an option as selectable that the server would later reject (or vice versa), that's a bug, because the two must always agree on the same set of valid selections.

### 6.5 Editing an existing order

- **Role restriction**: a Manager may change only the order-status field of an existing order (§3) — enforce this by having the server itself construct the update payload from just that one field when the caller is a Manager, not by trusting that the client only sent that field.
- **Every status-shaped field on an order (order status, reservation type) must be validated server-side against its real list of allowed values**, per §5's controlled-vocabulary rule — an order-edit endpoint is exactly the kind of place a direct API call can bypass a client `<select>`'s constraint.
- **Any field the server re-derives/validates (e.g. re-parsing a submitted quantity into a clamped, guaranteed-integer value) must have that same derived value written back to the sheet** — not the original raw client value the derivation started from. If a computed field elsewhere in the same write (e.g. a line-total recalculated from quantity × price) uses the derived value while the quantity column itself stores the raw one, the two columns can silently disagree after a single edit.
- **Reversing a gift's stock effect (because the order line is being deleted, or the whole order is being cancelled) must be driven by whether that specific gift line actually had stock deducted at checkout — not inferred from comparing current stock levels against the line's quantity.** Record that fact explicitly at checkout time (§7's out-of-stock-gift rule already requires marking the line somehow) and read that same marker back on any later reversal path; a stock-level heuristic can be wrong in either direction once other orders have moved that SKU's stock in the meantime.

---

## 7. Business logic — gifts, promotions, and stock

- **Gift eligibility** is derived by matching the cart's mobile-phone product (by SKU, Product Group, or wildcard) plus the current channel against `GiftMappings` rows (comma-list matching per §6.4), producing a set of "Brand Gifts" and "Channel Gifts" that become pickable, at zero additional charge, when adding that phone to the cart.
- **Auto-Bundle promotions** (`AutoPromotions`) watch the cart's category composition and, when a rule's "buy category" is present, surface a suggested (and optionally auto-applied) percentage discount on the rule's "get discount category," scoped to channel if the rule specifies one. The discount is always recomputed server-side from the rule at checkout time, never trusted from the client (§6.2 item 8).
- **Stock decrements** happen once per checkout, computed in memory from a single read of the `Products` sheet, then written back in one batched call — never as a loop of individual cell writes (§9.2). A cached copy of the `Products` table must be invalidated on every write that touches stock (checkout, order edit, order delete) or the POS will oversell against a stale cached stock number.
- **Out-of-stock UI**: a product/variant that's out of stock must render without its "add to cart" affordance *and* a visible out-of-stock badge — both together, not just a visual badge with the click-handler still silently wired up underneath.
- **A gift line that couldn't be stocked at checkout (§6.2 item 10) needs a durable, explicit marker recording that fact** (a status flag or note on that specific order line) — see §6.5 for why any later code that might reverse its stock effect depends on reading this marker back rather than re-deriving it.

---

## 8. Pages / navigation

A single left-hand (desktop) / hamburger-dropdown (mobile) menu, filtered per-user by role and by the `Accessible Menus` override (§3). Menu groups and pages, in order:

**Main menu**: Dashboard · Pre Order (POS) · Orders (grid) · ใบเสนอราคา/ใบแจ้งหนี้ (Invoices)

**Analytics & Reports** (Admin/Manager only): Sales Analytics · Target & Forecast · สรุปยอดจองรายวัน (daily booking summary) · สรุปยอดรุ่น/แอเรีย/ช่องทาง (model/area/channel summary) · สรุปข้อมูลจองทั้งหมด (all-bookings summary)

**Settings** (Admin/Manager, most sub-items Admin-only), nested under one "ตั้งค่าระบบ" parent:
- Master Data: Products · Branches · Channels · Members · Inventory (log)
- Promotions: Set Premium (= GiftMappings) · Auto Promotions (= AutoPromotions) · Promotions · Interests
- ตั้งค่าระบบ: a consolidated system-settings page (covers system name, invoice branding, approver info, booking window, banners, popup)
- System: Audit (log)

Each non-CRUD-grid page (Dashboard, POS, Analytics, Target, the three summary reports) is its own module with its own data-fetching and rendering logic; every CRUD page (Products, Branches, Channels, Members, GiftMappings, AutoPromotions, Promotions, Interests, Orders, InventoryLog) is driven by one generic data-grid component configured with a column-definition list per table (field key, label, input type — text/number/select/multi-select/etc.) — build one reusable grid component rather than one bespoke CRUD screen per table.

**Percentage-comparison sub-views**: alongside a raw pivot/breakdown table (e.g. quantity by date, or by reservation-status, or by product model), a report page should offer a companion view that collapses the same underlying rows down to one dimension (day, status, model-group, etc.) and expresses each bucket as a percentage share of the total — this is a distinct, reusable table shape (label + qty + % bar + a footer that sums to 100%), not something to bolt onto the pivot table itself. Build it as one shared helper the report module calls per dimension, rather than duplicating the qty→% math per table.

**Row/column display order is sometimes a business decision, not a computed one**: a report's row or group order defaults to "biggest total first," but the business owner may require a **fixed, named order** instead (e.g. a specific product-line sequence that doesn't track sales volume) — treat such an order as fully owner-directed and revisit it whenever asked, rather than inferring a "natural" replacement order from the data.

### 8.1 Standard states every page needs

- **Loading**: a spinner/skeleton while the initial data fetch is in flight.
- **Empty**: a friendly "no data yet" state with an icon, message, and (where applicable) a call-to-action.
- **Error**: pairs a failure message with a retry action that re-runs the page's own data load — never a silent catch that leaves the user looking at a blank or stale screen.
- These three states should share one reusable component/helper, not be re-implemented per page.

---

## 9. Non-functional requirements

### 9.1 Timezone & data-type gotchas (specific to a Sheets-backed system)

- The company operates in **Thailand (UTC+7)**. Any date-key derivation, date-input default, or export filename must be computed from **local** time — never `toISOString()` or any UTC-based date math, which shifts dates back a day for anything before 7am local time.
- Numbers read from spreadsheet cells may come back as **display strings containing thousands separators** (e.g. `"1,234"`) — strip separators before parsing as a number, for every numeric field (stock, price, totals), everywhere.
- Timestamps read back from the sheet are **display-formatted strings**, not ISO datetimes — parse them with a normal date parser and then re-derive your own canonical local date key; don't assume the raw string sorts correctly as text (a Thai-locale date string like `"10/1/2569"` does not lexicographically sort in calendar order — sort by a separate zero-padded `YYYY-MM-DD` key instead).
- If a spec/capacity-style field combines two numbers into one string (e.g. `"RAM/Storage"` written as `"12/256GB"`), any parser that extracts one of those numbers for sorting or grouping must anchor on something that disambiguates which number it wants (e.g. requiring the unit suffix `GB`/`TB`/`MB` to immediately follow the target number) — a naive "grab the first number in the string" regex will silently pick the wrong one and make otherwise-distinct rows sort/group as ties.

### 9.2 Concurrency & write safety

- **Every write operation must hold a script-wide lock** (bounded wait, e.g. 10 seconds) for its entire duration, released in a `finally` block so a mid-operation exception can't leave the lock held forever.
- **Batch reads/writes**: read a sheet's full range once into memory, mutate in memory, write back once with a single range-write call — never loop calling an append/single-cell-write operation, both for performance and because GAS has per-call execution time budgets.
- **Cache invalidation discipline**: if reference tables (Products, Promotions, Branches, Channels, Interests, GiftMappings, AutoPromotions) are cached to reduce spreadsheet reads (recommended — a multi-hour TTL is fine for anything that changes rarely), every write path that touches a cached table must invalidate that specific cache key as part of the same operation. Missing this is the single easiest way to introduce a "changes don't show up" bug class.

### 9.3 Error contract

Every backend call returns a consistent shape: `{ status: 'success' | 'error', message?, data?/...other fields }`. The frontend must check this on every single call — no call site is allowed to assume success and skip the check. Surface failures either through a modal/toast for user-initiated actions, or through the page-level error state (§8.1) for page loads — never a silently-swallowed `catch` block.

### 9.4 Submit/loading UX discipline

- A submit button awaiting a server response should show a busy/spinner state and be disabled against double-submission, restored in a `finally` as a safety net — but the *primary* path to re-enabling it should be immediately after the meaningful response arrives, not delayed behind unrelated follow-up work.
- Any "refresh the page's data after a successful write" step should be wrapped in its own try/catch that only logs a warning on failure — a refresh failure must never surface as an error to the user or block them from starting their next action, because the underlying write already succeeded.

---

## 10. UI / design system requirements

- **Visual style**: flat, not glassmorphic — solid surfaces, no backdrop-blur panels, no heavy gradient backgrounds. Small/medium border radii (not the very large "pill" radii associated with a glass aesthetic). Thai-optimized font (a font with strong Thai glyph support, e.g. Sarabun).
- **Theme tokens as CSS custom properties**: define the color/shadow/radius palette once as CSS variables (`--color-surface`, `--color-text-primary`, `--color-border`, `--shadow-sm/md/lg`, `--radius-*`, etc.) and have every custom component reference the variables — never hardcode a new one-off color when an existing token expresses the same intent. This is what makes theming (including dark mode, next bullet) a one-place change instead of a find-and-replace across the codebase.
- **Dark mode**: user-toggled (not forced by system preference, though system preference is a reasonable *default* on first visit), persisted per-user, applied via a single class/attribute on the root element read at the very top of page load (before first paint) to avoid a flash of the wrong theme. Any component styled through the CSS-variable tokens above re-themes automatically; anything using a utility-class-based styling system with hardcoded color classes needs an explicit parallel dark-mode rule set, and print output must always force light/white regardless of the user's current theme (invoices and reports are meant to be printed on white paper).
- **Charts must re-derive their colors from the current theme at creation time** (not just inherit page CSS), since canvas-based rendering can't read CSS variables — and must be destroyed/recreated (not live-repainted) whenever the theme changes.
- **Accessibility basics**: icon-only buttons need a text alternative (aria-label) in the UI's language; focus-visible outlines on interactive elements (but only for keyboard navigation, not distracting on every mouse click); modals get proper dialog semantics (`role="dialog"`, `aria-modal`).
- **Deferred image upload pattern**: selecting a file for upload should validate + show a local preview immediately, but defer the actual upload call until the surrounding form is actually saved — don't upload on file-select and then discard it if the user cancels the form.
- **Decorative layers** (background blobs, overlay badges) must not intercept clicks meant for the content beneath them.

---

## 11. Known judgment calls to make explicitly (don't silently pick one)

These are places where the reference implementation made a deliberate, sometimes debatable tradeoff — a rebuild should make its own explicit decision rather than copying blindly, and should ask the business owner where the answer depends on intent rather than pure correctness:

- **Target/Forecast grand-total row**: if the sales-target sheet has both a synthetic "ALL BRANCHES" grand-total row *and* individual branch/area rows, does a report's footer total mean "sum of the individual rows" (excluding the aggregate) or "the aggregate row alone"? Naively summing every row double-counts. Ask before assuming.
- **Fuzzy vs. exact matching for saved multi-select selections when re-opening an edit form**: if a saved rule references a product by name and a similarly-named product now exists, should re-opening that rule for editing pre-tick only the exact original match, or anything containing that substring? Tightening to exact-match is usually "more correct" but can silently break rows that were originally hand-typed with an intentionally fuzzy keyword rather than picked from a checkbox list — confirm no such legacy rows exist before tightening.
- **Wildcard channel semantics in product filtering**: whether a product's channel field being `ALL`/wildcard should match via substring-inclusion or the stricter tokenized-list method described in §6.4 is a real, non-obvious product decision (not just a bug) in some corners of this system — don't "fix" it unilaterally without confirming the intended semantics with the business owner first.

---

## 12. What "done" looks like for a from-scratch rebuild

A rebuild on this same stack (GAS + Sheets) should be considered functionally complete when:

1. `setupDatabase()` produces a working, explorable, empty-but-seeded system from a blank spreadsheet, and locks itself after first use.
2. A Sales-role user can log in, be confined to their own branch/channel, build a cart (including gift eligibility and auto-bundle discounts), and complete a checkout that survives a double-submit without duplicating the order.
3. An Admin can manage every master-data table through one consistent CRUD grid pattern, edit an existing order (respecting the role-based field-level lock-down for non-Admins), and see dashboards/analytics that correctly aggregate across the `Orders` sheet's multi-row-per-order structure.
4. Every rule in §5 (security) and §9 (non-functional) holds — these are the ones that don't show up as a visible bug in a demo but matter the moment the system carries real customer data and real money.
5. The three items in §11 have been explicitly decided (and ideally confirmed with whoever owns the business rules) rather than silently defaulted.
