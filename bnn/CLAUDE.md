# i7 Store (bnn) — Project Guide

React + Vite + Tailwind SPA that builds to a **single HTML file** and runs as a **Google Apps Script (GAS) web app** backed by a Google Sheet as the database. Brand: **i7 Store** (mobile/electronics retailer, structurally modeled on jaymartstore.com — a structural reference, not a clone).

This file is the authoritative, current-state guide. For the build-and-deploy mechanics in isolation (reusable across any React→GAS project), see `.agents/skills/react-gas-deployment/SKILL.md` — this document folds in everything from that skill plus everything specific to *this* project (deploy IDs, schema, architecture, known gaps).

## Deployment

- Script ID: `1e2uYnhEq3K0ioYzJ-4qmBWjOwU8ilnFTET7ywAkrf8oMzU3YE27odH6h`
- Deployment ID (stable across redeploys): `AKfycbxQ57NTPGeN1Gf3tZx6foSXCQFmpwlDcbHHXlu3nwtAhz8IIayjZY_-EFCd_j1_dEIR`
- Live URL: `https://script.google.com/macros/s/AKfycbxQ57NTPGeN1Gf3tZx6foSXCQFmpwlDcbHHXlu3nwtAhz8IIayjZY_-EFCd_j1_dEIR/exec`
- Access: Anyone, Execute as: script owner

**Deploy flow (always both steps — pushing alone does NOT update what visitors see):**
```
npm run build
npx clasp push --force
npx clasp deploy -i AKfycbxQ57NTPGeN1Gf3tZx6foSXCQFmpwlDcbHHXlu3nwtAhz8IIayjZY_-EFCd_j1_dEIR -d "description"
```
After any change to `Products` schema/seed data, re-run `setupSampleDatabase()` from the Apps Script editor's function dropdown to refresh the live sheet — pushing code never touches sheet data.

**Never deploy without the user explicitly saying "deploy"** — implement and verify first, always wait for a separate confirmation before running `clasp deploy`, even if the change is fully tested. This applies doubly to anything touching member accounts or payments.

## Architecture

- `src/` — React app (Vite). Builds via `vite-plugin-singlefile` into one `dist/index.html`.
- `public/Code.js` — the entire GAS backend (all server functions: auth, products, orders, admin CRUD). Copied into `dist/` at build time via Vite's `publicDir`. This is the file that becomes the live Apps Script project.
- `public/appsscript.json` — GAS manifest (oauthScopes, webapp access). If a feature needs a new scope (e.g. `DriveApp`, `MailApp`), add it here or GAS silently fails that call.
- Every real backend function in `public/Code.js` has a **local mirror** with a `Local` suffix in `src/utils/localMock.js`, used when running `npm run dev` (no `google.script.run` available). `src/utils/gas.js`'s `callGas(fnName, args, localFn)` picks GAS vs local automatically via `isGasEnv()`. **Any new backend function must get a local mirror**, or `npm run dev` breaks for that feature.
- Local dev only has fake/static data (`src/data/products.js`, `src/data/coupons.js`, etc.) and an **in-memory, non-persistent** `members`/`orders`/etc. state in `localMock.js` — everything resets on every dev-server restart or page refresh (localStorage `member`/`cart`/`wishlist`/`compare` sessions survive refreshes but the in-memory server-side data doesn't, causing session/data mismatches after a restart — expected, not a bug).

## Auth model

- Members are rows in the `Members` sheet. Passwords are **salted SHA-256 hashes** (`passwordHash`/`passwordSalt` columns via `Utilities.computeDigest`), not plaintext. Legacy plaintext rows (if any ever existed) self-migrate to hashed storage the next time that account logs in successfully — no forced reset.
- Login/register issue a **session token** (`Utilities.getUuid()`, stored as `sessionToken`/`sessionExpiry` on the Members row, 30-day expiry). **Every identity-gated backend function takes a `token`, never a raw email** — `resolveEmailByToken_(token)` is the single choke point that resolves a token to a real, server-verified email (or `null`). Do not add a function that accepts an email/adminEmail directly from the client for anything privilege- or identity-sensitive; that was the exact vulnerability fixed this project's history (client could impersonate anyone by passing an arbitrary email string).
- Two-tier admin: `ADMIN_EMAILS` (hardcoded array in `Code.js`, superadmin — always admin, cannot be blocked) plus a dynamic tier via `adminStatus` (`""`/`"pending"`/`"approved"`/`"rejected"`) on Members. New members can check "สมัครเป็นผู้ดูแลระบบ" at registration to request admin (goes to `"pending"`); an existing admin approves/rejects from the "สมาชิก" admin tab. `isAdmin_(email)` checks `ADMIN_EMAILS` first, then `adminStatus === "approved"`.
- Members can be **blocked** (`isBlocked` column) by an admin (not blockable: `ADMIN_EMAILS` accounts, or your own account — both guarded server-side). `resolveEmailByToken_` also checks `isBlocked`, so a block takes effect on the very next request even if the victim's session token hasn't expired — not just on their next login.
- `google.script.run` calls execute with whatever the client sends and there's no Google-session binding (deployment is "Execute as: script owner, Access: Anyone") — this is why token verification server-side matters; a client can call any exposed function directly from devtools.

## Data model (Google Sheet, one tab per concept)

`Members`, `Products`, `Orders`, `OrderItems` (denormalized one-row-per-line-item log for pivot/reporting, doesn't affect app logic), `Stock` (keyed by variant/gift **sku**, not product id), `Gifts` (shared catalog, many-to-many via `giftIds` on Products), `Promotions` (bundle/quantity discounts via `groups: [{type: "product"|"category", ids}]`), `Coupons`, `Reviews`, `PromoPopup`, `HeroBanners`, `InstallmentSettings` — most of the single-row-config sheets (`PromoPopup`/`HeroBanners`/`InstallmentSettings`) store one JSON blob in one cell rather than one-row-per-field.

New columns are self-provisioned via `ensureColumn_(sheet, name)` rather than requiring manual migration — this is the standard pattern for adding a field to an already-live sheet without breaking existing rows.

## Known gaps / deliberately deferred

- **No real payment gateway** — checkout is bank-transfer-self-report or COD only.
- **No real product photos** — still placeholder images; this is explicitly the store owner's own task (upload button exists in admin), not something to build again.
- **No shipping fee** — every order ships free regardless of amount; flag if this seems unintentional.
- **Sheets-as-DB doesn't scale** — every read is `getDataRange().getValues()` over the whole sheet; fine for a small/medium store, will degrade as Orders/Products/Reviews grow into the thousands.
- **`LockService.getScriptLock()` in `placeOrder`** serializes *all* checkouts globally (not per-SKU) to prevent overselling — correct but a throughput bottleneck at high concurrent traffic. Acceptable trade-off at current scale.
- **`MailApp` quota** — consumer Gmail ~100 emails/day. Customer order-confirmation email was deliberately removed (only the owner-notification email remains) specifically to reduce volume; don't re-add a per-order customer email without discussing quota impact.
- **No shipping-status customer notifications** (LINE/email) beyond the one owner-notification email at order placement.

## UI/brand conventions

- Primary accent colors: yellow `#FFD700` (buttons/CTAs elsewhere), orange `#FF6B00` (prices, savings text, search bar, primary submit buttons) — orange was deliberately chosen over yellow for anything price/action-critical.
- All customer-facing copy is Thai.
- Admin actions that need a native `confirm()` are avoided where an inline UI is feasible (e.g. the customer cancel-order flow uses an inline reason box, not `window.confirm()`) — this also makes those flows fully click-testable via browser automation, unlike admin delete buttons elsewhere that still use `window.confirm()` and can only be verified by code review, not live clicks (Chrome automation loses control once a native dialog opens).
- On the **live** `/exec` URL the app renders inside a cross-origin sandboxed iframe: accessibility-tree tools (`find`/`read_page`) can't see inside it, only raw pixel-coordinate clicks work. This doesn't apply to `npm run dev` (same-origin, normal DOM access).

## Testing conventions

- Prefer testing in `npm run dev` when the feature doesn't touch a GAS-only API (`Utilities.*`, `MailApp`, `DriveApp`, `LockService`). Restart the dev server to reset in-memory `localMock.js` state.
- Features using GAS-only APIs (crypto hashing, email, Drive uploads, locks) **cannot** be exercised via `npm run dev` — verify by pushing/deploying and testing against the real live site with a disposable test account, then flag any leftover test data (e.g. a test member row) for cleanup since there's no in-app delete-account feature and this project doesn't have `clasp run` API-execution configured.
