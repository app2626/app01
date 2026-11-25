# Finance provider selection: design (short)

Date: 2026-11-25 · Size: small change · Status: awaiting approval

## Intent
Until now every request was implicitly a Ponmai installment sale. The shop now also sells through
**Vyvr**, so each request must record which finance company the customer pays through.
The only difference between providers is the name: same form fields, documents, approvers,
notifications and workflow steps.

## Goals / non-goals
- Goal: staff choose the finance company on every new request, and everyone can see and filter by it.
- Goal: admins can add or rename providers without a code change or redeploy.
- Non-goal: per-provider fields, documents, approval routes or Telegram groups.
- Anti-goal: old requests must not break or become "unknown"; they belong to Ponmai.

## Approaches
- **A. Admin-managed list (chosen by the user).** New settings sheet `Finance` with a tab on the
  settings page, like Location/Product. Server validates the submitted value against the list.
- B. Hard-coded list in code. Fastest, but every new provider needs a code change and deploy.

## Design
- **Data:** append `ไฟแนนซ์ :` to the end of `DATA_HEADERS` (append-only rule; `ensureSheets_()`
  extends the live header). Blank on existing rows is read as **Ponmai** everywhere it is shown,
  filtered or counted.
- **Settings:** new sheet `Finance` (header `ชื่อไฟแนนซ์`) added to `SHEET_DEFS` and
  `SETTINGS_SHEETS`; seeded with `Ponmai` and `Vyvr` when created. New admin tab "Finance" using the
  existing add/delete settings UI. `getAllDropdownData` returns `finance`.
- **Form:** required select "ไฟแนนซ์" as the first field of step 3.
- **Server:** `saveRequest` rejects a value not in the `Finance` list (fails closed, Thai message)
  and writes it via `col_('ไฟแนนซ์ :')`.
- **Table:** new column shown as a small neutral badge, visible to all roles; a finance filter
  (ทั้งหมด / each provider) above the table that combines with the status cards; the status card
  counts follow the finance filter.
- **Detail popup, Telegram and email:** include the finance name.
- **Dashboard:** new chart "สัดส่วนตามไฟแนนซ์" (approved requests per provider).
- **Tests:** server tests for the new column, validation (unknown / empty value rejected),
  seeding, and blank-means-Ponmai; existing tests stay green.

## Builder's calls (flag if wrong)
- Default label for blank legacy rows is the literal "Ponmai".
- Deleting a provider from the list does not change existing rows; they keep showing the old name.
- Status-card counts follow the finance filter (so "รออนุมัติ 3" means 3 for the selected provider).
