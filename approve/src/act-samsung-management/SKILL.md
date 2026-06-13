---
name: act-samsung-management
description: Expert guidance for maintaining and extending the ACT SAMSUNG Management System (V6.8+). Use when modifying the Google Apps Script logic, updating the Bootstrap UI, or adjusting the Spreadsheet-based data layer.
---

# ACT SAMSUNG Management System

This skill provides procedural knowledge and architectural context for the ACT SAMSUNG Management System, a Google Apps Script (GAS) web application designed for stock tracking and sales reporting.

## Architecture Overview

- **Backend (GAS):** Located in `รหัส.js`. Uses a Spreadsheet-as-a-Database model with dynamic sheet discovery.
- **Frontend (Web App):** Located in `Index.html`. Built with Bootstrap 5, DataTables (with Responsive and Search extensions), Select2, and SweetAlert2.
- **Data Layer:** Active Google Spreadsheet with specific sheet names and headers.

## Key Workflows

### 1. Data Discovery & Mapping
The system uses `findSheet(ss, keyword)` to dynamically locate sheets.
- **Product Mapping:** `getAppData()` scans the "product" sheet for "SKU" and "Model" headers. It uses fuzzy matching (e.g., "รุ่น", "ชื่อรุ่น") to find columns.
- **Stock Filtering:** `getStockByBranch(locCode)` filters out items already in the "ระหว่างดำเนินการแอค" sheet to prevent double-counting.

### 2. Transaction Recording
- **Validation:** `saveBatchRecords` checks if the IMEI exists in the branch stock and hasn't been used yet.
- **Batch Processing:** Supports multiple items per submission.
- **Timestamping:** Uses `'dd/MM/yyyy HH:mm:ss` format for spreadsheet entries.

### 3. Frontend UI Management
- **HUD Loader:** `showHUDLoader(msg)` provides a high-tech visual feedback during async operations.
- **Dynamic Selectors:** Select2 is used for branch and SKU selection. `initRowSelect2()` must be called whenever new rows are added to the form.
- **Reporting:** DataTables handles server-side fetched records with custom filtering for dates, status, and area.

## Maintenance Guidelines

### Updating Spreadsheet Schema
Refer to [references/spreadsheet-schema.md](references/spreadsheet-schema.md) for the required sheet structures. If a sheet name or header changes, update the discovery logic in `รหัส.js`.

### Modifying Business Logic
- **Admin PIN:** Controlled by `ADMIN_PIN` constant in `รหัส.js`.
- **Time Limits:** `checkIsTimeValid` handles both date ranges and daily time windows.
- **Status Updates:** Use `updateStatus(rowId, newStatus)` which targets the 9th column (Status) of the transaction sheet.

### UI Enhancements
- Styles are consolidated in the `<style>` block in `Index.html`.
- For new charts or KPIs, update `generateExecutiveDashboard` and ensure the corresponding HTML elements exist in the `#dash-pane`.

## Tool Usage
- Use `google.script.run` for all client-to-server communication.
- Always include `.withSuccessHandler()` and `.withFailureHandler()` to maintain HUD stability.
