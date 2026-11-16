# ผลตรวจระบบ f9 + แผนแก้ไข (2026-11-16)

ตรวจที่ commit `9bd83a8` (deploy @108) เทสต์ฝั่ง server ผ่าน 186/186 ตอนตรวจ

## ขอบเขตที่ตรวจ

| ส่วน | ระดับการตรวจ |
|---|---|
| `Code.js` — auth, token, `apiHandler`, login, เปลี่ยนรหัสผ่าน, `GET_TABLE`, `GET_ALL_DATA`, dashboard, checkout, ติดตามใบจองสาธารณะ, ค้นลูกค้าจากเบอร์, อัปโหลดรูป, ฟังก์ชัน migrate | อ่านโค้ดทีละบรรทัด |
| `Coupons.js`, `HealthCheck.gs`, `appsscript.json`, ส่วน `<script>`/CDN ของ `Index.html` | อ่านโค้ดทีละบรรทัด |
| `Code.js` ส่วนที่เหลือ (import, product group, invoice, news, settings, bulk) | ดูเฉพาะจุดตรวจสิทธิ์ (role check) ไม่ได้อ่านตรรกะทั้งหมด |
| `JS*.html` (ฝั่งหน้าเว็บ) | ค้นด้วย pattern หาจุดที่ไม่ผ่าน `esc()` และจุดแสดงข้อความ error ไม่ได้อ่านทุกบรรทัด |
| `CSS.html`, หน้าตา, การใช้งานบนมือถือ | ไม่ได้ตรวจรอบนี้ |
| เว็บจริง | ไม่ได้ทดลองโจมตีบนเว็บจริง ข้อ C1–C3 ยืนยันจากโค้ดเท่านั้น |

## สรุป

พบช่องโหว่ร้ายแรง 3 ข้อที่ควรแก้ก่อนอย่างอื่น ทั้งหมดมาจากสาเหตุเดียวกัน: ใน Google Apps Script
ฟังก์ชันระดับบนสุดทุกตัวที่ชื่อไม่ลงท้ายด้วย `_` ถูกเรียกจากหน้าเว็บได้ด้วย `google.script.run.<ชื่อ>()`
และเว็บนี้เปิดแบบ `ANYONE_ANONYMOUS` ดังนั้นคนที่ไม่ได้ login ก็เรียกได้ โดยไม่ผ่าน `apiHandler`

---

## ร้ายแรง (แก้ทันที)

### C1 — ใครก็สร้าง token ของ Admin ได้ (`generateToken`, `getSecretKey`)
- ที่: `src/Code.js:269` `getSecretKey()`, `src/Code.js:279` `generateToken(username)`
- ปัญหา: เปิดหน้า login แล้วสั่ง `google.script.run.generateToken('<username ของ admin>')` ใน console
  ได้ token ที่เซ็นถูกต้อง อายุ 30 วัน ใช้กับ `apiHandler` ได้ทุก action ในสิทธิ์ของคนนั้น
  `getSecretKey()` คืนคีย์ลับที่ใช้เซ็น token ออกมาตรง ๆ ด้วย
- ผล: เข้าระบบเป็น Admin ได้โดยไม่ต้องรู้รหัสผ่าน อ่าน/แก้/ลบข้อมูลทั้งหมด รวมข้อมูลลูกค้า
- แก้: เปลี่ยนชื่อเป็น `generateToken_`, `getSecretKey_`, `verifyToken_`, `timingSafeEqual_`, `hashPassword_`
  และแก้ทุกจุดที่เรียก (รวม `tests/`)
- หลังแก้: หมุนคีย์ — ลบ Script property `MPOS_SECRET_KEY` (ทุกคนต้อง login ใหม่) และให้ Admin เปลี่ยนรหัสผ่าน
  เพราะไม่รู้ว่าคีย์เคยถูกดึงออกไปหรือยัง ดู AuditLog ย้อนหลังหา action ที่ผิดปกติ

### C2 — อ่านใบจองและข้อมูลลูกค้าทั้งหมดได้โดยไม่ login (`getAdvancedDashboard`)
- ที่: `src/Code.js:1284`
- ปัญหา: เรียก `google.script.run.getAdvancedDashboard({Role:'Admin'}, null, {})` ตรง ๆ ได้
  ถ้าแคช dashboard ยังอุ่น (120 วินาทีหลังมีคนเปิด dashboard) ฟังก์ชันไม่แตะ `ss` เลย
  และคืน Orders ทุกแถว (ชื่อ เบอร์ เลขบัตร) กับรายชื่อสมาชิก
- แก้: เปลี่ยนชื่อเป็น `getAdvancedDashboard_` (แก้พร้อม C3)

### C3 — ฟังก์ชันภายในอื่น ๆ ที่เรียกจากหน้าเว็บได้
- ไม่มีตัวกั้นเลย: `logAudit` (เขียน AuditLog ปลอมได้, ไม่ผ่าน `sanitizeSheetText_`),
  `deleteArchivedProductColumns_20260919` (ลบคอลัมน์ชีต Products), `migrateProductColumnLayout_20260919`,
  `migrateResequenceChannelIds`, `migrateDeobfuscatePII`, `healthCheck` (คืนชื่อคีย์ Settings + จำนวนสินค้า),
  `obfuscate`, `deobfuscate`, `generateId`
- รับ `secureUser` จากผู้เรียก (ตอนนี้พังที่ `ss` เป็น null ก่อน แต่ไม่ควรพึ่งเรื่องนี้):
  `saveRecord`, `deleteRecord`, `deleteRecords`, `bulkSetStatus`, `processCheckout`, `updateFullOrder`,
  `setOrderStatus`, `uploadImage`, `saveSettingsItem`, `importProducts`, `importRecords`, และตัวอื่นใน `switch`
- แก้: ให้ฟังก์ชันที่ตั้งใจเปิดเหลือแค่ `doGet`, `include`, `apiHandler`, `getPublicConfig`, `setupDatabase`,
  `resetMemberPasswordFromProperties` (สองตัวหลังมีตัวกั้นของตัวเอง) ที่เหลือเติม `_` ทั้งหมด
  ฟังก์ชัน migrate ที่ใช้เสร็จแล้วให้ลบออก
- กันพลาดซ้ำ: เพิ่มเทสต์ที่อ่าน `src/*.js`/`*.gs` แล้ว fail ถ้ามีฟังก์ชันระดับบนสุดที่ไม่ลงท้าย `_`
  นอกรายชื่อที่อนุญาต และเพิ่มกฎนี้ใน `CLAUDE.md`

---

## สูง

### H1 — ติดตามใบจองสาธารณะเดาได้ง่าย (`publicTrackOrderLookup`)
- ที่: `src/Code.js:1880`
- ปัญหา: (1) เบอร์โทรที่ส่งมาตรวจด้วย `endsWith` โดยไม่บังคับความยาวขั้นต่ำ ส่งเลขตัวเดียวก็ผ่านได้ 1 ใน 10
  (2) เลขใบจองเรียงกัน `ORD-yyMMdd-001` เดาได้ (3) ไม่จำกัดจำนวนครั้ง
  (4) ใบจองที่ไม่มีเบอร์ (หรือสั้นกว่า 4 หลัก) เปิดดูได้โดยไม่ต้องยืนยัน
- ผล: ไล่ดูรายการสินค้า สาขา หมายเหตุ ชื่อ/เบอร์แบบปิดบางส่วน ของใบจองทุกใบได้
- แก้: บังคับเลขท้ายอย่างน้อย 4 หลัก, จำกัดครั้งที่ผิดต่อเลขใบจองด้วย `CacheService` (แบบเดียวกับ login),
  ใบจองไม่มีเบอร์ให้ปฏิเสธ, ไม่ส่ง `remark` ในผลลัพธ์สาธารณะ

### H2 — `GET_TABLE` รับชื่อชีตอะไรก็ได้ (กันด้วยรายชื่อห้าม)
- ที่: `src/Code.js:514`
- ปัญหา: ห้ามเฉพาะ Members/Settings/AuditLog/OrderStatusLog/Target/Coupons ชีตอื่นทุกชีตในไฟล์
  (รวมชีตสำรองที่สร้างด้วยมือ เช่น สำเนา Members) Sales/Manager อ่านได้
- แก้: เปลี่ยนเป็นรายชื่ออนุญาตต่อ role

### H3 — รายชื่อสมาชิกทั้งหมดส่งให้ทุก role
- ที่: `src/Code.js:1233` (`GET_ALL_DATA.members`), `src/Code.js:1294` (dashboard)
- ปัญหา: Sales ได้ Username, Role, สาขา, เมนูที่เข้าได้ ของทุกคน (ไม่มี Password)
  `CLAUDE.md` เขียนว่า `GET_ALL_DATA` ไม่มีรายชื่อสมาชิก ซึ่งไม่ตรงกับโค้ด
- แก้: ส่งเฉพาะ `Name`/`Username`/`Role`/`Branch Code` ที่ dashboard และหน้า Target ใช้จริง
  และกรองตามสาขาสำหรับ Sales; แก้ `CLAUDE.md` ให้ตรง

### H4 — การเก็บรหัสผ่านอ่อน
- ที่: `src/Code.js:253`, `602`, `669`
- ปัญหา: SHA-256 รอบเดียว + salt ค่าคงที่ในซอร์ส (salt เดียวกันทุกคน), ยังรับ hash แบบไม่มี salt และ plain text,
  รหัสใหม่ขั้นต่ำ 4 ตัว, token เดิมยังใช้ได้หลังเปลี่ยนรหัสผ่าน
- แก้: salt สุ่มต่อผู้ใช้ + วน hash หลายรอบ (รูปแบบ `v2$salt$hash`, ย้ายอัตโนมัติตอน login สำเร็จ),
  ขั้นต่ำ 8 ตัว, ใส่เวลาที่เปลี่ยนรหัสผ่านใน token เพื่อให้ token เก่าหมดสภาพ

---

## กลาง

| # | ที่ | ปัญหา | แก้ |
|---|---|---|---|
| M1 | `Index.html:1703-1707` | สคริปต์จาก CDN ไม่ล็อกเวอร์ชัน (`chart.js`, `sweetalert2@11`, `chartjs-plugin-datalabels@2`) และไม่มี `integrity` — ถ้า CDN หรือแพ็กเกจถูกแก้ สคริปต์นั้นอ่าน token และรหัสผ่านที่จำไว้ได้ | ล็อกเวอร์ชันเต็ม + SRI |
| M2 | `JS*.html` ราว 20 จุด เช่น `JS.html:2056`, `JS_Grid.html:321` | `Swal.fire(title, res.message, icon)` — อาร์กิวเมนต์ตัวที่สองของ Swal คือ HTML ข้อความ error จาก server บางอันมีข้อความจากชีต/ผู้ใช้ (ชื่อสินค้า, SKU) | ทำ helper `window.app.alertError(title, msg)` ที่ส่งเป็น `text:` แล้วแทนทุกจุด |
| M3 | `Code.js:1702-1722` | checkout เขียนสต๊อกก่อน แล้วค่อยเขียน InventoryLog และ Orders ถ้าขั้นหลังพัง สต๊อกถูกตัดไปแล้วแต่ไม่มีใบจอง | เขียน Orders ก่อน หรือคืนสต๊อกใน `catch` |
| M4 | `Code.js:1177-1180` | `GET_ALL_DATA` ล้างแคช AutoPromotions/Branches และเรียก `ensureProductSpecColumns_` ทุกครั้ง (อาจเขียนชีตโดยไม่มี lock) — แคช 2 ตารางนี้ไม่มีผล และโหลดช้าขึ้น | เอาการล้างแคชออก, ย้ายการเติมคอลัมน์ไปทำเฉพาะ Admin ภายใน lock |
| M5 | `Code.js:606` | ล็อก login นับต่อ username อย่างเดียว ใครก็ทำให้ Admin เข้าไม่ได้ 5 นาทีซ้ำ ๆ ได้ | ยอมรับได้ใน GAS (ไม่มี IP) — บันทึกไว้เป็นข้อจำกัด; ทางออกฉุกเฉินมีอยู่แล้ว |
| M6 | `appsscript.json` | ขอ scope `drive` เต็ม ทั้งที่ใช้แค่สร้างไฟล์/โฟลเดอร์รูป | ลองลดเป็น `drive.file` (ต้องทดสอบกับ `DriveFolderId` ที่ตั้งไว้ก่อน) |
| M7 | `Code.js:3531` | อัปโหลดรูปเชื่อ `mimeType` จากหน้าเว็บ รับ `image/svg+xml` ได้ (Admin เท่านั้น) | จำกัดเป็น jpeg/png/webp/gif |

## ต่ำ / ข้อสังเกต

- `Code.js:1464` เทียบ SKU ด้วย `==` — ใช้ `String(a) === String(b)`
- `Code.js:1730` การนับจำนวนใช้คูปองถูกกลืน error เงียบ ๆ — ถ้าพัง คูปองจำกัดสิทธิ์จะใช้เกินได้ ควร log
- `Code.js:424` `logAudit` ไม่ผ่าน `sanitizeSheetText_`
- `src/Test.gs` ว่างเปล่า ลบได้
- ข้อมูลจริง: เงื่อนไขของแถมซ้ำ 4 คู่ (GM-001/003, GM-002/004, GM-011/013, GM-012/014) — รอเจ้าของยืนยันก่อนลบ
- รับทราบแล้ว ไม่ต้องแก้ (เจ้าของตัดสินใจเอง): จำรหัสผ่านใน `localStorage` (2026-11-15), token อายุ 30 วัน

---

## แผนแก้ไข (เรียงตามลำดับที่ควรทำ)

แต่ละเฟส = 1 commit, รัน `npm test` ก่อน, deploy เมื่อเจ้าของสั่ง

| เฟส | งาน | ข้อ | ขนาด |
|---|---|---|---|
| 1 | เติม `_` ให้ฟังก์ชันภายในทั้งหมด, ลบ migrate เก่า, เทสต์กันฟังก์ชันสาธารณะเกินรายชื่อ, อัปเดต `CLAUDE.md` → deploy → หมุน `MPOS_SECRET_KEY` + Admin เปลี่ยนรหัสผ่าน + ดู AuditLog | C1 C2 C3 | เล็ก (เปลี่ยนชื่อ) แต่ด่วนที่สุด |
| 2 | ปิดช่องติดตามใบจองสาธารณะ | H1 | เล็ก |
| 3 | `GET_TABLE` แบบรายชื่ออนุญาต + ตัดข้อมูลสมาชิกที่ส่งออก | H2 H3 | เล็ก–กลาง (ต้องเช็กหน้า Target/Dashboard) |
| 4 | รหัสผ่านแบบใหม่ + ย้ายอัตโนมัติ + token หมดสภาพเมื่อเปลี่ยนรหัส | H4 | กลาง |
| 5 | ล็อกเวอร์ชัน CDN + SRI, helper แสดง error แบบ text | M1 M2 | กลาง (แก้หลายไฟล์ ต้องดูบนเว็บจริงตามกฎ comment stripper) |
| 6 | ลำดับการเขียนตอน checkout, แคชใน `GET_ALL_DATA`, ชนิดไฟล์รูป, ข้อย่อย | M3 M4 M7 + ต่ำ | กลาง |
| 7 | ลด scope Drive (ทดลองแยก เพราะผู้ deploy ต้องอนุญาตสิทธิ์ใหม่) | M6 | เล็ก แต่เสี่ยงกระทบอัปโหลดรูป |

เฟส 1 ต้องตามด้วยการหมุนคีย์เสมอ ไม่อย่างนั้น token ที่อาจถูกสร้างไว้ก่อนหน้าจะยังใช้ได้ถึง 30 วัน
