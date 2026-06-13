# Spreadsheet Schema Reference

The ACT SAMSUNG Management System depends on a Google Spreadsheet with the following sheets. The system uses keyword matching to find these sheets.

## Required Sheets

### 1. ประกาศ (Announcement)
- **Keyword:** "ประกาศ"
- **Structure:**
  - Row 1: Headers
  - Row 2, Col 1: Title
  - Row 2, Col 2: Detail

### 2. ข่าวสารโปรโมชั่น (Promotions)
- **Keyword:** "ข่าวสารโปรโมชั่น"
- **Structure:**
  - Col A: Title
  - Col B: Detail
  - Col C: Link

### 3. location
- **Keyword:** "location"
- **Structure:**
  - Col A: Area (e.g., Central, North)
  - Col B: Support Name
  - Col D: Location Code (Primary Key)
  - Col E: Location Name

### 4. product
- **Keyword:** "product"
- **Headers (Fuzzy Match):** 
  - SKU: "sku", "รหัสสินค้า"
  - Model: "model", "รุ่น", "ชื่อรุ่น"

### 5. time
- **Keyword:** "time"
- **Structure:**
  - Col A: Start Time/Date
  - Col B: End Time/Date

### 6. stock
- **Keyword:** "stock"
- **Structure:**
  - Col A: Location Code
  - Col C: SKU
  - Col D: Description
  - Col E: IMEI (Unique Identifier)

### 7. ระหว่างดำเนินการแอค (Transactions)
- **Keyword:** "ระหว่างดำเนินการแอค"
- **Structure:**
  - Col A: Timestamp
  - Col B: ACT Date
  - Col C: Employee Name (Format: `locCode+name`)
  - Col D: Location Code
  - Col E: Location Name
  - Col F: SKU
  - Col G: Description
  - Col H: IMEI
  - Col I: Status (Default: "ยังไม่ขาย")
  - Col J-N: RRP, Discount, Promo Price, Cut Barcode, Suggest Price
