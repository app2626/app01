# Settings bulk upload: design (short)

Date: 2026-11-25 · Size: small change · Approved in chat ("1" = Excel + CSV; append only)

## Intent
Admins fill the Location, Product and PREMIUM lists from a file instead of adding items one by one.

## Approaches
- **Excel (.xlsx/.xls) + CSV via SheetJS (chosen).** SheetJS 0.18.5 from cdnjs, loaded lazily on first upload (~880 KB).
- CSV only, no library: users would have to "Save as CSV" every time.
- Replace-all mode: rejected for now; one wrong file would wipe a list.

## Design
- Server `addSettingDataBulk(token, sheetName, names)`: admin only; sheet must be `location`, `Product` or
  `Premium`; trims, drops blanks, duplicates within the file and names already in the sheet; max 2,000 names
  per call; appends in one write under the lock; returns `{ added: string[], skipped: number }`.
- Client: "อัปโหลดไฟล์" button on the three tabs; reads the first column of the first worksheet; skips row 1
  when it equals the sheet's header text; shows a preview (new count, duplicate count, first 10 names)
  before calling the server; refreshes the table and form dropdowns afterwards.
- Template download is out of scope.
