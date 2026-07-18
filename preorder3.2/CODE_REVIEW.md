# CODE REVIEW v2 — preorder3.2 (รวมผลตรวจ Reviewer + ผลวิเคราะห์ CLI, 2026-07-04)

---

## 🔙 ROLLBACK (คำสั่งเจ้าของระบบ 2026-07-07) — ถอดฟีเจอร์ที่ต้องขอสิทธิ์เพิ่มออกทั้งหมด

**เหตุผล:** ฟีเจอร์กลุ่ม Drive/Email ทำให้ระบบวนขอสิทธิ์ (จอขาว) เจ้าของต้องการระบบนิ่งก่อน — **ถอดออกให้เกลี้ยง ห้ามเหลือโค้ด dead code** แต่**เก็บ bug fix ทุกตัวหลังรอบ 10 ไว้** (Members opts fix, numVal fix, invoice init fix, null guards, UI tweaks, phone autofill)

**ถอดออกจาก `Code.js`:**
1. ฟังก์ชัน `uploadImage()` ทั้งก้อน + case `UPLOAD_IMAGE` ใน apiHandler
2. block ส่งอีเมลใน `processCheckout` (ตั้งแต่ comment 8A.1 ถึงจบ try/catch mailErr) — ให้ return กลับเป็น `{ status:'success', orderId: orderId }` (ไม่มี emailSent)
3. ฟังก์ชัน `escHtml_`, `numFmt_`, `buildOrderConfirmEmail_` ทั้งก้อน
4. การ validate `DriveFolderId` ใน `saveSettingsItem` (block try/catch DriveApp.getFolderById)
5. แถว dummyData: `SendCustomerEmail` — ลบ; `DriveFolderId` ใน remarkMap เก็บไว้ได้ (ไม่มีผล)
6. **ผลลัพธ์ที่ต้องได้: `grep -c "DriveApp\|MailApp" Code.js = 0`** ← เกณฑ์ตัดสินว่าเกลี้ยงจริง (สิทธิ์จะเหลือแค่ Sheets เหมือนก่อนรอบ 10)
7. `getCustomerByPhone` + case `GET_CUSTOMER_BY_PHONE` **เก็บไว้** (ไม่ใช้สิทธิ์เพิ่ม ใช้งานได้ปกติ)

**ถอดออกจาก `JS.html`:**
1. `window.app.uploadImage` และ `window.app.handleImageUpload` ทั้งก้อน
2. ช่อง Image URL ใน grid (Products): เอาปุ่มอัปโหลด + input file ออก — เหลือ input URL + รูป preview (preview เก็บไว้ได้ ไม่เกี่ยวกับสิทธิ์)
3. ปุ่มอัปโหลด + input file ในการ์ดแบนเนอร์ (bannerUpBtn/bannerFile) และของ loginbg (loginBgUpBtn/loginBgFile) — เหลือช่องวาง URL แบบเดิม
4. section "โฟลเดอร์เก็บรูปอัปโหลด" + `saveDriveFolderId` ในแท็บฐานข้อมูล
5. ใน success dialog ของ checkout: เอา `(res.emailSent ? ...)` ออก เหลือข้อความเดิม
6. phone autofill (onPhoneInput/lookupCustomerByPhone/coPhoneSpin) **เก็บไว้**

**อื่น ๆ:** `appsscript.json` ไม่ต้องแก้ (ไม่มี oauthScopes ระบุ — สิทธิ์คำนวณจากโค้ดอัตโนมัติ) / แถว Settings `DriveFolderId`, `SendCustomerEmail` ในชีตของจริง ปล่อยไว้ได้ไม่มีผล / รูปที่เคยอัปขึ้น Drive แล้ว URL ยังใช้ได้ปกติ

**DoD:** `grep "DriveApp\|MailApp"` ใน Code.js = 0 ผลลัพธ์ / node --check ผ่านทั้งสองไฟล์ / จอง-แก้ออเดอร์-ตั้งค่าแบนเนอร์ ทำงานปกติ / push แล้วเปิด /dev ต้องไม่มีการขอสิทธิ์ใด ๆ อีก

*(หมายเหตุ: spec รอบ 8A/8B/8C และรอบ 10/11 ด้านล่างเก็บไว้เป็นประวัติ — ถ้าอนาคตจะกลับมาทำใหม่ ให้ทำตอนที่พร้อมจัดการเรื่องอนุมัติสิทธิ์ครั้งเดียวให้จบ)*

---

## 🔥 HOTFIX (เจอจากการเทสจริง — ทำก่อนทุกอย่าง)

**อาการ:** คีย์ออเดอร์แรกสำเร็จ → ออเดอร์ที่ 2 กด "ยืนยันการสั่งจอง" แล้วเงียบ (ปุ่มตาย)

**สาเหตุ (วิเคราะห์แล้ว):** ใน `submitCheckout` (JS.html ~2626-2672) — `finally` ที่ปลด `isSubmitting`/enable ปุ่ม ครอบทั้ง critical section รวมงานหลังบ้าน โดยเฉพาะ `await window.app.api('GET_ALL_DATA')` (บรรทัด ~2662) ซึ่งช้า/ค้างได้ (cache Products เพิ่งถูกเคลียร์ + `google.script.run` ไม่มี timeout — ถ้า handler ไม่ถูกเรียก Promise ค้างตลอดกาล) → `finally` ไม่เคยรัน → flag ค้าง `true` + ปุ่ม `disabled` ค้าง

**วิธีแก้ (3 จุด):**
1. **ปลดล็อกทันทีที่ CHECKOUT คืนผล:** ย้าย `isSubmitting = false` + `btnSubmit.disabled = false` มาไว้ทันทีหลัง `const res = await window.app.api('CHECKOUT', pay)` (ก่อน branch success/error) — งานหลังบ้าน (ล้างฟอร์ม, GET_ALL_DATA, filter) ต้องอยู่นอกช่วงที่ล็อกปุ่ม เก็บ `finally` ไว้เป็น safety net ได้แต่ต้องไม่ใช่ที่เดียวที่ปลด
2. **แยกงานรีเฟรชข้อมูลออกเป็น try/catch ของตัวเอง:** `GET_ALL_DATA` + `filter()` ถ้าพลาด แค่ `console.warn` — ห้ามเด้ง Swal error (ออเดอร์บันทึกสำเร็จไปแล้ว การเด้ง error ทำให้ผู้ใช้เข้าใจผิดว่าจองไม่สำเร็จ) และห้ามให้ผลของมันไปกั้นการคีย์ออเดอร์ถัดไป
3. **เพิ่ม timeout ให้ `window.app.api` (~บรรทัด 806):** wrap ด้วย `Promise.race` — 45 วินาทีไม่ตอบให้ reject `new Error('การเชื่อมต่อใช้เวลานานเกินไป กรุณาลองใหม่')` เพื่อไม่ให้มี await ใดค้างเงียบได้อีกทั้งระบบ

**เทสหลังแก้:** คีย์ออเดอร์ 3 ใบติดกันโดยไม่รีเฟรชหน้า — ทุกใบต้องกดยืนยันได้ และสต๊อกบนการ์ดสินค้าอัปเดตหลังแต่ละใบ

---

**ถึง Claude CLI:** รายการนี้รวมข้อค้นพบของคุณ (ข้อ 1–9 + polish) กับผลตรวจอิสระอีกชุดแล้ว
ผลวิเคราะห์ของคุณ**ได้รับการยืนยันว่าถูกต้องทุกข้อ** ให้ทำตามลำดับรอบด้านล่างนี้แทนลำดับที่คุณเสนอ (1→3→5→2)
เพราะมี bug ที่คุณยังไม่เจอแทรกอยู่ และมีการตัดสินใจเชิงนโยบายให้แล้ว **ทำทีละรอบ เสร็จรอบแล้วรายงานก่อนเริ่มรอบถัดไป**

กติกา: ยึด CLAUDE.md ทุกข้อ / ทุก write อยู่ใต้ LockService / batch ด้วย setValues / เสร็จแต่ละรอบรัน `node --check src/Code.js` + ตรวจ script body ของ JS.html

---

## รอบที่ 1 — Security (แก้เล็ก ผลใหญ่ ทำก่อน)

**1.1 Password hash รั่ว** *(= ข้อ 1 ของคุณ — ยืนยัน)*
- `getAdvancedDashboard` (Code.js ~452): ลบ field `Password` ออกจาก `members` ก่อน return
- `GET_TABLE` (Code.js ~249): เพิ่ม whitelist — `Members`, `Settings`, `AuditLog` เฉพาะ Admin; ตารางอื่นตาม role เดิม และถ้า return Members ให้ strip `Password` เสมอ

**1.2 SAVE_RECORD เปิดช่องแก้ Orders ข้ามข้อจำกัด** *(= ข้อ 3 ของคุณ — ยืนยัน)*
- `saveRecord` (Code.js ~782): block `tableName === 'Orders'` ทิ้งทั้งสาย — throw ให้ไปใช้ `UPDATE_FULL_ORDER` เท่านั้น

**1.3 Substring matching สิทธิ์เมนู** *(= ข้อ 5 ของคุณ — ยืนยัน, ตรงกับ CLAUDE.md กฎ roles)*
- `grid.openForm` (JS.html ~2833): เปลี่ยน `opt.id.includes(cv)` → เทียบตรงตัว `===` ต่อ menu id (comma-separated, trim แล้วเทียบทั้งคำ)
- ไล่หา `.includes(` จุดอื่นที่ใช้เช็คสิทธิ์เมนูแล้วแก้แบบเดียวกันทั้งหมด (รวม checkMenuAccess ถ้ามีพฤติกรรม substring)

---

## รอบที่ 2 — Checkout integrity (หัวใจระบบจอง)

**2.1 ราคา/ส่วนลดเชื่อ client** *(= ข้อ 2 ของคุณ — ยืนยัน)*
- `processCheckout` (~518): ตอนเจอ SKU ใน prodData ให้อ่านราคาจากคอลัมน์ `Price` ของชีต (parse comma) มาใช้แทน `item.Price` ทุกจุด (รวม Row Total)
- validate `payload.discounts[]` กับชีต Promotions (ชื่อตรง + Status "เปิด" + value ≤ Value ในชีต); รายการ Auto Bundle ให้คำนวณซ้ำจาก AutoPromotions ฝั่ง server

**2.2 Qty ไม่ validate — ค่าติดลบทำสต๊อกเพิ่ม** *(คุณยังไม่เจอ — เพิ่มใหม่)*
- ต้นลูป cart: `const qty = parseInt(item.qty,10); if (!Number.isInteger(qty) || qty < 1) throw ...` ใช้ตัวแปรนี้แทน item.qty ทุกจุด รวม `giftObj.qty`
- เช็คหมวด `โมบาย` รวมกันเกิน 1 เครื่อง/ออเดอร์ ฝั่ง server (ตอนนี้บังคับแค่ UI — CLAUDE.md กฎข้อ 8)

**2.3 จอง T + ช่วงเวลาจอง ไม่บังคับฝั่ง backend** *(= ข้อ 6 ของคุณ + เพิ่มช่วงเวลา)*
- ต้น `processCheckout`: ถ้า `payload.resStatus` มี "จอง T" → ต้องมี `receiptNo` และ `depositAmount > 0` ไม่งั้น throw
- อ่าน `getKeyValueSettings(ss)` เช็ค `new Date()` อยู่ในช่วง ReserveStart–ReserveEnd ไม่งั้น throw "ไม่อยู่ในช่วงเวลาการจองสินค้า" (parse ด้วย `new Date(str)` — ห้าม toISOString ตาม CLAUDE.md กฎข้อ 1)

**2.4 แก้สต๊อกแล้วไม่เคลียร์ cache `TABLE_Products`** *(คุณยังไม่เจอ — สำคัญมาก)*
- หลังเขียนคอลัมน์ Stock สำเร็จใน `processCheckout`, `updateFullOrder`, `deleteRecord` (สาย Orders) ให้เรียก `CacheService.getScriptCache().remove("TABLE_Products");` ไม่งั้นหน้า POS เห็นสต๊อกเก่าได้ถึง 6 ชม. → ขายเกิน

**2.5 ของแถมสต๊อกไม่พอ → ledger ไม่ตรง** *(= ข้อ 7 ของคุณ — นโยบายตัดสินแล้ว: ห้าม block การขาย)*
- ใน `processGift`: ถ้าสต๊อกไม่พอ **ไม่ต้อง throw** แต่ InventoryLog ต้อง log ตามจริง — Action `"GIFT (NO STOCK)"` qty `0` และแถวออเดอร์ของแถมใส่ Remark/หมายเหตุว่า "รอสต๊อกของแถม" (เหตุผล: ไม่ควรเสียยอดขายมือถือเพราะของแถมหมด แต่บัญชีสต๊อกต้องตรงความจริง)

**2.6 กันกดยืนยันซ้ำ (double-submit)** *(คุณยังไม่เจอ)*
- `submitCheckout` (JS.html ~2538): เพิ่ม flag `isSubmitting` — set ก่อนยิง CHECKOUT, reset ใน finally; ระหว่างนั้น disable ปุ่ม (กันออเดอร์ซ้ำ)

---

## รอบที่ 3 — ความถูกต้องรอง + UX

**3.1 Manager กับเมนู GiftMappings/AutoPromotions** *(= ข้อ 4 ของคุณ — นโยบาย: อ่านได้ แก้ไม่ได้)*
- ให้ Manager เห็น 2 เมนูนี้แบบ **readonly grid** (ส่ง `readonly=true` ใน grid.init ตาม role) — backend คง Admin-only เหมือนเดิม

**3.2 Booking settings เพี้ยนเพราะ Sheets coerce เป็น Date** *(= ข้อ 8 ของคุณ — ยืนยัน)*
- `saveSettingsItem` (สาย bookingsettings): เขียนค่าเป็น plain text — ใช้ `setNumberFormat('@')` กับ cell ก่อน `setValue` (หรือ `'` prefix) เพื่อไม่ให้ Sheets แปลงเป็น Date แล้วอ่านกลับผิด format

**3.3 Logout ไม่ล้างตะกร้า** *(= ข้อ 9 ของคุณ — ยืนยัน)*
- `logout()`: เพิ่ม `localStorage.removeItem('tg_cart')` (เครื่องหน้าร้านใช้ร่วมกันหลายคน)

**3.5 โปรโมชันประเภท Percent ใช้งานไม่ได้จริง** *(เจอตอนตรวจรอบ 2)*
- `addPromoRow` (JS.html ~1940): render `<option value="${p.Value}">` เป็นจำนวนบาทตรง ๆ ไม่สน `Discount Type` — โปร Percent (เช่น Value=10) กลายเป็นส่วนลด ฿10 แทนที่จะเป็น 10% (server validation ผ่านโดยบังเอิญเพราะเทียบเลขเดียวกัน แต่คณิตผิด)
- **ทางแก้:** ฝั่ง client ถ้า `Discount Type === 'Percent'` ให้เก็บ type+pct ไว้ใน data attribute แล้วคำนวณส่วนลด = pct% ของ subtotal ใน `updateTotal`/`submitCheckout`; ฝั่ง server ใน `processCheckout` validate โปร Percent ด้วยเพดาน = pct% ของยอดรวมสินค้าในออเดอร์ (ราคาจากชีต) ไม่ใช่เทียบกับ Value ตรง ๆ
- ทางเลือกถ้าธุรกิจไม่ใช้ % : ตัด option 'Percent' ออกจากหน้า Promotions grid ไปเลย — แจ้งกลับมาว่าเลือกทางไหน

**3.4 Polish (ตามที่คุณ list — ยืนยันทุกข้อ)**
- `updateFullOrder`: `parseInt(dataObj["Qty"] || oldQtyVal)` — Qty = 0 เป็น falsy → ใช้ `dataObj["Qty"] !== undefined ? parseInt(dataObj["Qty"],10) : oldQtyVal` และ **คำนวณ Row Total ใหม่ฝั่ง server** (qty × unit price) ห้ามรับจาก client
- XSS ใน onclick attrs (JS.html ~2049, 2118, 2139): `p.SKU, p.Model, Capacity/Color` ต้องผ่าน `window.app.esc()` (ข้อยกเว้นเดียวคือ AutoPromotions Message ตาม CLAUDE.md กฎข้อ 2)
- `deleteSettingsItem`: อย่าลบตาม rowIndex ดิบ — ให้ยืนยันด้วย Banner ID (คอลัมน์ 1) ก่อนลบ ถ้าไม่ตรงให้ re-scan หา row จาก ID
- `updateFullOrder`: ข้าม REVERT+APPLY เมื่อ status/SKU/Qty ไม่เปลี่ยน (ลด InventoryLog ขยะ): ถ้า `oldStatus !== 'Cancelled' && newStatus !== 'Cancelled' && oldSku === newSku && oldQty === newQty` → return

---

## รอบที่ 4 — Hardening (ทำเมื่อ 1–3 เสร็จและผ่านเทส)
- Rate limit login: CacheService นับ fail ต่อ username, เกิน 5 ครั้ง/5 นาที → ปฏิเสธชั่วคราว
- `doGet`: `XFrameOptionsMode.ALLOWALL` → `DEFAULT` (กัน clickjacking) — ยกเว้นตั้งใจ embed
- `generateId`: กันชนกันใน batch เดียว (ต่อ timestamp ms + running number)
- `verifyToken`: เทียบ signature แบบ constant-time

## รอบที่ 5 — UX/UI ระดับองค์กร (แบ่งเป็น 5A / 5B — ทำ 5A ให้เสร็จและรายงานก่อน)

**กติการวมของรอบนี้ (สำคัญมาก):**
- ห้ามเพิ่ม library ใหม่ — ใช้ Tailwind + Font Awesome + Chart.js + SweetAlert2 ที่มีอยู่
- ทุกข้อความจากชีต/ผู้ใช้ที่แทรก innerHTML ต้องผ่าน `window.app.esc()` / ใน onclick ใช้ `escAttrJs()`
- layer ตกแต่ง absolute ทุกชิ้นต้องมี `pointer-events-none` (CLAUDE.md กฎข้อ 11)
- โทนสี/รัศมี/เงา ใช้ CSS variables ที่มีใน CSS.html (`--color-*`, `--radius-*`, `--shadow-*`) ให้กลมกลืนของเดิม
- แก้เสร็จแต่ละรอบย่อย: `node --check` ทั้งสองไฟล์ + รายงาน diff

### 5A — Data integrity + จุดที่ผู้ใช้เห็นบ่อยที่สุด

**5A.1 Idempotency key กันออเดอร์ซ้ำจาก timeout/คีย์ซ้ำ**
- client (`submitCheckout`): สร้าง `clientRequestId` (`'REQ-' + Date.now() + '-' + Math.random().toString(36).slice(2,10)`) **หนึ่งครั้งต่อการเปิด confirm dialog** ใส่ใน `pay` — ถ้าผู้ใช้กดยืนยันซ้ำหลัง timeout ให้ใช้ id เดิม
- server (`processCheckout`): เพิ่มคอลัมน์ `Client Request ID` ต่อ**ท้าย** schema Orders (ตาม workflow ใน CLAUDE.md: อัปเดต header auto-add + `orderRows.push` ทั้ง 4 จุดให้ยาวเท่ากัน) — ก่อนสร้างออเดอร์ สแกนคอลัมน์นี้ ถ้าพบ id ซ้ำให้ return `{status:'success', orderId: <ของเดิม>, duplicate: true}` แทนการเขียนใหม่
- client: ถ้า `res.duplicate` แสดง toast "ออเดอร์นี้ถูกบันทึกไปแล้ว" แทน success dialog ปกติ

**5A.2 Stock badge บนการ์ดสินค้า POS**
- มุมการ์ดสินค้า (ใน `pos.filter`/render การ์ด): เขียว `มีสินค้า` เมื่อ Stock > 10, เหลือง `เหลือ n ชิ้น` เมื่อ 1–10, เทา/จาง `สินค้าหมด` เมื่อ 0 พร้อม disable ปุ่ม/คลิกจอง (`pointer-events-none opacity-60` ที่ปุ่ม ไม่ใช่ทั้งการ์ด)
- ตัวเลขต้อง parse comma (`parseInt(String(p.Stock).replace(/,/g,''))`) เพราะข้อมูลผ่าน getDisplayValues
- ตำแหน่ง badge ห้ามทับรูปสินค้าจนดูรก — มุมขวาบน ขนาดเล็ก font-bold text-[10px]

**5A.3 Order status timeline ใน modal แก้ไข/ดูออเดอร์**
- stepper แนวนอน: Pending → Confirmed → Paid → Delivered (Cancelled แสดงเป็นสถานะแดงแยก ไม่อยู่ใน flow)
- ใช้สีจากชีต OrderStatus ถ้ามี (`Color Code`) ไม่มีให้ fallback: Pending=amber, Confirmed=indigo, Paid=emerald, Delivered=slate-800, Cancelled=rose
- step ที่ผ่านแล้ว = วงเต็ม + เส้นทึบ, ปัจจุบัน = วงใหญ่ + ring, ยังไม่ถึง = วงจาง
- แสดงในหัว modal ของ Orders grid (ส่วนที่เปิดดู/แก้ไขออเดอร์) — read-only visual ไม่ใช่ตัวเปลี่ยนสถานะ

**5A.4 Empty & error states มาตรฐานเดียวทั้งระบบ**
- สร้าง helper `window.app.emptyState({icon, title, subtitle, actionLabel, onclick})` คืน HTML มาตรฐาน (icon วงกลมจาง + heading + คำอธิบาย + ปุ่ม action ถ้ามี)
- ใช้กับ: ตาราง grid ไม่มีข้อมูล/ค้นหาไม่เจอ (พร้อมปุ่ม "ล้างตัวกรอง"), POS ค้นหาไม่เจอสินค้า, Dashboard ไม่มีออเดอร์ในช่วงที่เลือก, Analytics/Target ยังไม่ตั้งค่า ReserveStart/End (มี prompt เดิมอยู่แล้ว — เปลี่ยนให้ใช้ helper เดียวกัน)
- error state จาก API: heading "โหลดข้อมูลไม่สำเร็จ" + ปุ่ม "ลองใหม่" ที่เรียก init ของหน้านั้นซ้ำ

### 5B — ความลื่นไหล + accessibility (เริ่มหลัง 5A ผ่านตรวจ)

**5B.1 ค้นหา POS อัปเกรด** — debounce 250ms, ค้น SKU/ชื่อ/Model/Product Group แบบ case-insensitive, highlight คำที่เจอด้วย `<mark class="bg-amber-100 text-inherit rounded px-0.5">` (ระวัง: highlight หลัง esc แล้วเท่านั้น — esc ก่อน แล้วค่อย replace คำค้นที่ esc แล้วเช่นกัน)
**5B.2 จำค่าพนักงาน** — `bkStaffName`/`bkPhone` เก็บ sessionStorage หลัง checkout สำเร็จ, prefill ตอนเปิด checkout modal ครั้งถัดไป (per-เครื่อง ไม่ใช่ per-user — เคลียร์ตอน logout ด้วย)
**5B.3 ปุ่ม Export CSV ในหน้า Orders** — export `filteredDataList` (ไม่ใช่ dataList — ตามที่กรอง/ค้นอยู่), BOM `﻿` นำหน้าเพื่อให้ Excel เปิดภาษาไทยถูก, ชื่อไฟล์ `orders_YYYY-MM-DD.csv` (วันที่ local — ห้าม toISOString)
**5B.4 Accessibility ขั้นต่ำ** — `aria-label` ภาษาไทยให้ปุ่ม icon-only ทุกปุ่ม (ลบ, แก้ไข, ปิด modal, +/- qty, ตะกร้า), กด Esc ปิด modal บนสุด + cart drawer, `:focus-visible` ring ให้ input/ปุ่มหลัก (มี CSS var แล้ว), `role="dialog"` + `aria-modal="true"` ให้ modal ทุกตัว
**5B.5 ปุ่ม submit ทุกจุดในระบบมี spinner + disabled ระหว่างรอ API** — ตอนนี้มีเฉพาะ checkout/login ให้เพิ่ม: saveForm ของ grid, saveSettingsItem ทุกปุ่มในหน้า Settings, updateFullOrder

### เก็บตก (ทำท้ายสุดหรือถ้ามีเวลา)
- ข้อความ error timeout ของ CHECKOUT เปลี่ยนเป็น "การเชื่อมต่อช้า กรุณาตรวจสอบหน้ารายการจองก่อนคีย์ซ้ำ" (5A.1 ทำให้ปลอดภัยอยู่แล้ว แต่ข้อความควรชัด)
- แถว DISCOUNT/gift ใน Orders grid: แสดง icon แยกประเภท (ของแถม = gift icon, ส่วนลด = tag icon) ให้อ่านบิลง่ายขึ้น
- grid `exportCSV`: BOM ฝังเป็นตัวอักษรล่องหนในซอร์ส — เปลี่ยนเป็น `"﻿"` แบบเดียวกับ dashboard

---

## รอบที่ 6 — POS Storefront สไตล์ Samsung (อ้างอิงภาพตัวอย่าง samsung.com/th/smartphones)

**ขอบเขตที่ตกลงกับเจ้าของระบบแล้ว:** เฉพาะหน้า POS เท่านั้น (หน้าอื่นคงธีมเดิม) / เลือกสี+ความจุบนการ์ดโดยตรง / ยังไม่ทำฟีเจอร์เปรียบเทียบรุ่น

**หลักการใหญ่:** นี่คือ**การเปลี่ยนหน้าตา ไม่ใช่เปลี่ยน logic** — validation, stock check, add-to-cart, checkout flow, cart drawer, ของแถม (GiftMappings), โมบาย 1 เครื่อง/ออเดอร์ ใช้ของเดิมทั้งหมด ห้ามแตะ `submitCheckout`/`processCheckout`

**สไตล์รวม (scope ด้วย wrapper class `pos-storefront` ครอบเฉพาะหน้า POS ห้ามรั่วไปหน้าอื่น):**
- พื้นหลังขาวสะอาด `#ffffff` / เส้นแบ่ง `#e5e7eb` บาง ๆ / ตัวหนังสือดำ `#0f172a` / มุมโค้งการ์ด ~14px
- ปุ่มหลักดำ (`bg-slate-900 text-white rounded-full`) ปุ่มรองขาวขอบดำ (`border border-slate-900 rounded-full`) — เหมือนปุ่ม "ซื้อ / เรียนรู้เพิ่มเติม" ในภาพ
- ไม่มี gradient/glassmorphism ในโซนนี้ ฟอนต์ Prompt เดิม

### 6A — การ์ดสินค้าแบบเลือก variant บนการ์ด (หัวใจของรอบนี้)

**โครงการ์ด (บนลงล่าง):** รูปสินค้าใหญ่กลางการ์ด (พื้นขาว ไม่มีกรอบ) → ชื่อรุ่น (bold, 15px) → จุดสี → chip ความจุ → ราคา → ปุ่ม "จอง" เต็มความกว้างสีดำ + stock badge เดิมมุมขวาบน

**พฤติกรรม variant (สินค้า `isGroup` — Model เดียวกันหลาย SKU):**
1. state ต่อการ์ด: `selectedCapacity`, `selectedColor` — default = variant แรกที่**มีสต๊อก** (ถ้าหมดทุกตัวเอาตัวแรก)
2. **จุดสี:** วงกลม 18px เรียงแถว — สีของวงจาก mapping ชื่อสี→hex (สร้าง map ชื่อสีที่มีในชีตปัจจุบัน เช่น Titanium Black→#3a3a3c, Natural→#c2bcb2, Clear→เทาอ่อนขอบเส้น, White→#fff ขอบเส้น, Black→#000; ชื่อที่ไม่รู้จัก fallback วงเทาพร้อม title=ชื่อสี) — ตัวที่เลือกมี ring ดำครอบ, ตัวที่หมดสต๊อกทุก capacity ให้จางลง + เส้นทแยงขีดทับ แต่ยังกดได้ (กดแล้วเห็นราคา/สถานะ)
3. **chip ความจุ:** ปุ่มเล็ก rounded-lg ขอบเทา — เลือกแล้วขอบดำหนา font-bold (ตามภาพ 512GB/256GB), ความจุที่ไม่มีในสีที่เลือกให้ซ่อนหรือจาง
4. เปลี่ยน variant → อัปเดต **รูป, ราคา, stock badge, ปุ่มจอง** ของการ์ดนั้นทันที (re-render เฉพาะการ์ด — มี `data-model` บนการ์ด, function `updateCardVariant(model)`)
5. ปุ่ม "จอง": เรียก path เดิมของการเพิ่มลงตะกร้า (validation โมบาย 1 เครื่อง + สต๊อก + ของแถม auto ตาม GiftMappings ทำงานเหมือนเดิม) — **ห้ามเขียน add-to-cart logic ใหม่** ให้ refactor ของเดิมจาก modal เป็น function กลางที่รับ SKU แล้วเรียกจากทั้งการ์ดและ modal (modal เดิมเก็บไว้เป็น fallback มือถือจอแคบถ้าจุด/chip แน่นเกิน — ดูข้อ responsive)
6. สินค้าเดี่ยว (ไม่มี group): การ์ดเดียวกันแต่ไม่มีจุดสี/chip
7. **Escape ทุกอย่าง:** ชื่อสี/ความจุ/Model ที่ฝังใน onclick ใช้ `escAttrJs()`, ที่แสดงผลใช้ `esc()` — จุดสีเป็น element ที่สร้างจากข้อมูลชีตทั้งหมด
8. **Responsive:** ≥md 3-4 คอลัมน์เหมือนภาพ; จอมือถือ 2 คอลัมน์ จุดสี/chip ย่อ — ถ้าพื้นที่ไม่พอให้จุดสีแสดงสูงสุด 4 จุด + "+n"

### 6B — ส่วนหัวหน้า POS: category tiles + filter chips (ทำหลัง 6A ผ่านตรวจ)

1. **แถว category tiles** (แบบแถบ "สมาร์ทโฟน Galaxy / Galaxy Tab / ..." ในภาพ): สร้างจาก `Category` ของสินค้า Status=เปิด — tile ละ 1 หมวด + tile "ทั้งหมด" ซ้ายสุด, tile ที่เลือกมีขอบดำ, แต่ละ tile มีรูปสินค้าตัวแทน (ชิ้นแรกของหมวด) เล็ก ๆ ขวา
2. **แถว sub-chips รุ่น** (แบบ "ทั้งหมด Galaxy S | Galaxy Z | Galaxy A"): จาก `Product Group` ของหมวดที่เลือก — text chip มีเส้นใต้ตัวที่ active
3. **แถว filter chips แบบ dropdown** (แบบ "โปรโมชัน | รุ่น | ความจุ | ราคา"): เอา 3 ตัวพอ — **ความจุ** (จาก Capacity ที่มีจริง), **ราคา** (ช่วง: <10,000 / 10,000-30,000 / 30,000-50,000 / >50,000), **เรียงลำดับ** (แนะนำ=ตามชีต, ราคาต่ำ-สูง, ราคาสูง-ต่ำ) — dropdown เป็น popover ขาวเงาเบา ปิดเมื่อคลิกนอก/Esc, chip ที่มี filter active แสดงจุดดำ + ปุ่ม "ล้างตัวกรอง" โผล่เมื่อมี filter ใด ๆ
4. filter ทั้งหมดทำงานร่วมกับช่องค้นหา + debounce เดิม (5B.1) และ "ผลลัพธ์ n รายการ" แสดงเหมือนภาพ
5. ค้นหา/กรองแล้วว่าง → `emptyState` เดิม (5A.4) พร้อมปุ่มล้างตัวกรอง

**Definition of Done รอบ 6:** ทุก interaction ไม่มี regression กับ: เพิ่มลงตะกร้า+ของแถม, โมบาย 1 เครื่อง, สต๊อกหมดกดไม่ได้, cart drawer, checkout จบได้ปกติ / `node --check` ผ่านทั้งสองไฟล์ / หน้าอื่นนอก POS หน้าตาเดิมทุก pixel

### 6C — แถบโปรโมชัน/ลดราคาบนการ์ด (สไตล์ "ประหยัด ฿1,000 (เดิม ฿10,999)" ของ Samsung)

**หลักการ: display-only ทั้งหมด — ราคาคิดเงินจริงคือ `Price` เหมือนเดิม ห้ามแตะ `processCheckout`/ตะกร้า/ยอดใด ๆ**

**6C.1 ราคาเดิม + แถบประหยัด (ต้องเพิ่มคอลัมน์ใหม่)**
1. เพิ่มคอลัมน์ `Original Price` **ต่อท้าย** headers ของ Products ใน `setupDatabase` (ชีตที่มีอยู่แล้วผู้ใช้เพิ่มเองในชีต — โค้ดอ่านตาม header name อยู่แล้ว คอลัมน์ไม่มี = ไม่แสดงแถบ ปลอดภัย)
2. หน้า Products grid (`route()` case 'products'): เพิ่มคอลัมน์ config `{ key: 'Original Price', label: 'ราคาเดิม (เว้นว่างถ้าไม่ลดราคา)', type: 'number' }`
3. บนการ์ด (`cardHtml`): parse ทั้งสองราคาแบบถอด comma — แสดงแถบเฉพาะเมื่อ `originalPrice > price` เท่านั้น (ค่าว่าง/0/น้อยกว่า = ไม่แสดง):
   - บรรทัดราคา: ราคาขายจริงตัวดำหนาเหมือนเดิม
   - ใต้ราคา: `<span class="text-[10px] text-rose-600 font-bold">ประหยัด ฿X</span> <span class="text-[10px] text-slate-400 line-through">เดิม ฿Y</span>` (X = original - price, toLocaleString)
   - **ต่อ variant**: ราคาเดิมอ่านจาก variant ที่เลือกอยู่ (แต่ละ SKU มีคอลัมน์ของตัวเอง) — สลับสี/ความจุแล้วแถบต้องอัปเดตตาม (ผ่าน `updateCardVariant` เดิม ไม่ต้องทำอะไรเพิ่มถ้าอ่านค่าใน cardHtml)
4. มุมซ้ายบนการ์ด (ถ้ามีส่วนลด): ป้ายแดงเล็ก `ลด n%` (คำนวณจากส่วนต่าง ปัดลง) — อย่าชนกับ stock badge มุมขวา / gift tag ใช้มุมซ้ายอยู่แล้ว ให้ป้ายลดอยู่ใต้ gift tag ในกรณีเป็นของแถม (ปกติของแถมไม่มีส่วนลดอยู่แล้ว)
5. **Cache:** Products เป็นตาราง cached — ระบุใน commit message + แจ้งในรายงานว่า หลังผู้ใช้เพิ่มคอลัมน์/กรอกราคาเดิมในชีตโดยตรง ต้องบันทึกสินค้าตัวใดตัวหนึ่งผ่านหน้า Products (ให้ cache เคลียร์) หรือรอ 6 ชม.

**6C.2 ป้ายโปร bundle จาก AutoPromotions (ไม่ต้องแก้ schema — ข้อมูลมีแล้ว)**
1. การ์ดของสินค้าที่ `Category` ตรงกับ `Get Discount Category` ของ AutoPromotions ที่ `Status=Active`: แสดงป้ายเล็กใต้ชื่อสินค้า `<span class="text-[9px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-100 font-bold">ลด n% เมื่อซื้อคู่ <หมวด Buy Category></span>`
2. ข้อความสร้างเองจากตัวเลขในชีต (`Discount Percent`, `Buy Category`) — **ห้ามใช้ `Message Suggest` บนการ์ด** (ฟิลด์นั้นเป็น HTML ที่ตั้งใจ render เฉพาะจุดเดิม — บนการ์ดต้อง esc ทุกอย่าง)
3. มีหลาย rule ตรงหมวดเดียวกัน: แสดงอันที่เปอร์เซ็นต์สูงสุดอันเดียวพอ การ์ดต้องไม่รก

**DoD 6C:** ราคาที่คิดเงินใน checkout ไม่เปลี่ยนไม่ว่ากรณีใด (Original Price เป็นแค่ป้าย) / การ์ดที่ไม่มีราคาเดิม = หน้าตาเหมือน 6A เป๊ะ / node --check ผ่าน

---

## รอบที่ 7 — คำขอจากเจ้าของระบบ (2026-07-05)

### 7.1 ยกเลิกการเข้ารหัส PII ในชีต Orders (นโยบายใหม่จากเจ้าของระบบ — ตัดสินใจแล้ว)
เจ้าของระบบต้องการอ่าน `Contact Number` และ `ID Card_Passport` ในชีตตรง ๆ:
1. `processCheckout`: เลิกเรียก `obfuscate()` กับ `contactPhone` / `idCard` — เขียน plain text ลงชีต
2. `updateFullOrder`: เอา block ที่ obfuscate 2 ฟิลด์นี้ออก
3. **ฝั่งอ่านคง `deobfuscate()` ไว้ทุกจุดตามเดิม** (GET_TABLE Orders, dashboard) — ฟังก์ชันมี digit-passthrough อยู่แล้ว จึงอ่านได้ถูกทั้งแถวเก่า (base64) และแถวใหม่ (plain) ห้ามลบ
4. **Migration แถวเก่า:** เพิ่มฟังก์ชัน `migrateDeobfuscatePII()` (ไม่ผูกกับ apiHandler — รันมือครั้งเดียวจาก GAS editor โดย Admin): อ่านชีต Orders ทั้งหมด, สองคอลัมน์นี้ค่าไหนไม่ใช่ตัวเลขล้วนให้ `deobfuscate()` แล้วเขียนกลับ (batch `setValues` ครั้งเดียว, ใต้ LockService), log AuditLog ว่า migrate กี่แถว
5. อัปเดต CLAUDE.md ส่วนกฎ PII (rule 5) ให้ตรงนโยบายใหม่ — ระบุว่า "เขียน plain ตามคำสั่งเจ้าของระบบ [วันที่], ฝั่งอ่านคง deobfuscate เพื่อ backward compat"

### 7.2 ใบจอง (printReceipt): เพิ่มของแถม + ตัดบรรทัดประเภทสิทธิ์การจอง
1. **เพิ่มรายการของแถม:** วนตาม `pay.cart` — แต่ละ item ที่มี `brandGifts`/`channelGifts` ให้พิมพ์บรรทัดของแถมใต้สินค้าหลักนั้น: ชื่อของแถม + `x จำนวน` + ราคาแสดงเป็น `ฟรี` (อย่านับรวมในยอดเงิน — ยอดคำนวณจากสินค้าหลัก+ส่วนลดเท่านั้นตามเดิม) จัดสไตล์ให้แยกจากสินค้าหลักชัดเจน (ตัวเล็กลง/สีเทา/ขีดหน้า เช่น "— ของแถม: Samsung Adapter 25W x1 ฟรี") esc ทุกชื่อ
2. **ตัดบรรทัด "ประเภทสิทธิ์การจอง: ..."** ออกจากใบพิมพ์ทั้งบรรทัด (เช่น "ประเภทสิทธิ์การจอง: จอง T (มีการจอง)") — ข้อมูล `resStatus` ยังบันทึกลงชีตตามเดิม แค่ไม่พิมพ์
3. เช็คใบจองที่พิมพ์ซ้ำจากหน้า Orders (ถ้ามี path พิมพ์จากออเดอร์เก่า) ให้พฤติกรรมตรงกัน — ของแถมในออเดอร์เก่าคือแถวที่ Unit Price = 0 และไม่ใช่ DISCOUNT

**DoD รอบ 7:** จองใหม่ → ชีตแสดงเบอร์/เลขบัตรอ่านได้ตรง ๆ, หน้า Orders ในระบบแสดงถูกทั้งออเดอร์เก่า-ใหม่, ใบจองมีของแถมครบและไม่มีบรรทัดประเภทสิทธิ์, ยอดเงินในใบจองเท่าเดิมเป๊ะ / node --check ผ่านทั้งสองไฟล์

---

## รอบที่ 8 — Professional features (ทำทีละรอบย่อย 8A → 8B → 8C รายงาน diff ทุกรอบ)

### 8A — อีเมลยืนยันการจอง + จำลูกค้าเก่าจากเบอร์

**8A.1 อีเมลยืนยันการจองถึงลูกค้า (MailApp — ฟรี ในตัว GAS)**
1. ใน `processCheckout` **หลังเขียนข้อมูลสำเร็จ ก่อน return**: ถ้า Settings key `SendCustomerEmail` = `TRUE` (เพิ่ม key นี้ใน dummyData default `TRUE`) และ `payload.email` มี `@` → ส่งอีเมล HTML ถึงลูกค้า
2. เนื้ออีเมล: หัวเรื่อง `ยืนยันการจอง #<orderId> — <SystemName>` เนื้อหาตาราง: รายการสินค้า (ชื่อ/จำนวน/ราคา), ของแถม (ฟรี), ส่วนลด, ยอดรวม, มัดจำ+เลขใบเสร็จ (ถ้าจอง T), สาขา/ช่องทาง, ชื่อพนักงาน — ค่าทุกตัวที่มาจาก user/ชีตต้อง escape HTML ฝั่ง server (เขียน helper `escHtml_` เล็ก ๆ ใน Code.js)
3. **การส่งเมลห้ามทำให้ออเดอร์ fail:** ครอบ try/catch — พลาดให้ `logAudit(..., "EMAIL_FAIL", ...)` แล้วไปต่อ และเช็ค `MailApp.getRemainingDailyQuota()` ก่อนส่ง (เหลือ 0 = ข้าม+log; quota บัญชีฟรี ~100/วัน แจ้ง limit นี้ในรายงาน)
4. response ของ CHECKOUT เพิ่ม field `emailSent: true/false` — client แสดงใน success dialog ว่า "ส่งอีเมลยืนยันแล้ว" หรือไม่แสดงถ้าไม่ได้ส่ง

**8A.2 จำลูกค้าเก่าจากเบอร์โทร**
1. action ใหม่ `GET_CUSTOMER_BY_PHONE` ใน `apiHandler` (ทุก role ที่ login แล้ว): รับ `phone` (validate เป็นตัวเลข 9-10 หลัก ไม่งั้น throw) → สแกนชีต Orders จากแถวล่างสุดขึ้นบน หา `Contact Number` ตรงกัน (ค่าเก่าอาจเป็น base64 — เทียบหลังผ่าน `deobfuscate`) → เจอแถวแรก (ล่าสุด) return `{customerName, email, idCard, codeHandraiser}` จากแถวแรกของออเดอร์นั้น / ไม่เจอ return `{found:false}`
2. client (checkout modal): เมื่อช่อง `coPhone` ครบ 10 หลัก (event input + debounce 400ms) → เรียก API → **เติมเฉพาะช่องที่ยังว่าง** (ห้ามทับที่ผู้ใช้พิมพ์แล้ว) + toast เบา ๆ "พบข้อมูลลูกค้าเดิม เติมข้อมูลให้แล้ว" / ไม่เจอ = เงียบ ไม่รบกวน
3. ระหว่างรอ API แสดง spinner เล็กท้ายช่องเบอร์; เรียกซ้ำขณะ pending ให้ยกเลิกอันเก่า (เก็บ token/flag)

### 8B — งานอัตโนมัติเบื้องหลัง (time-driven triggers)

1. **`installTriggers()`** (รันมือครั้งเดียวจาก GAS editor — ห้ามผูก apiHandler): ลบ trigger เดิมของ handler เดียวกันก่อนสร้างใหม่ (กันซ้ำ) แล้วสร้าง: `dailySummary` ทุกวัน 20:00-21:00, `nightlyBackup` ทุกวัน 01:00-02:00 (timezone Asia/Bangkok — เช็ค appsscript.json ว่า timeZone ถูก)
2. **`dailySummary()`**: อ่าน Orders ของ "วันนี้" (เทียบวันแบบ local จาก Timestamp display string — parse `new Date(str)` แล้วเทียบ y/m/d **ห้าม toISOString** ตาม Critical Rule 1) → อีเมลถึง Settings key `ReportEmail` (ไม่ตั้ง = ข้าม+log): จำนวนออเดอร์, ยอดรวม, แยกตามสาขา, top 5 สินค้า + **ท้ายเมล: รายการสินค้า Stock ≤ Settings key `LowStockThreshold` (default 5)** — escape ทุกค่า, ไม่มีออเดอร์ก็ส่ง ("วันนี้ไม่มียอดจอง") เพื่อให้เจ้าของรู้ว่าระบบยังทำงาน
3. **`nightlyBackup()`**: `DriveApp` copy spreadsheet ปัจจุบัน ชื่อ `MPOS_Backup_YYYY-MM-DD` (วันที่ local) ลงโฟลเดอร์ `MPOS Backups` (สร้างถ้ายังไม่มี) → ลบ backup เก่ากว่า 14 ไฟล์ล่าสุด → logAudit จำนวนที่ลบ/สร้าง — ครอบ try/catch + log fail
4. เพิ่ม Settings dummyData: `ReportEmail` (ค่าว่าง + Remark บอกวิธีตั้ง), `LowStockThreshold` = 5, `SendCustomerEmail` = TRUE

### 8C — แบรนด์ดิ้งของร้าน

1. Settings keys ใหม่: `LogoUrl` (ค่าว่าง = ใช้ icon เดิม) — `SystemName` มีอยู่แล้ว
2. จุดที่ใช้: โลโก้+ชื่อระบบที่หน้า login, header/sidebar, `<title>` + favicon (ใส่ `<link rel="icon">` แบบ dynamic จาก LogoUrl), หัวใบจอง `printReceipt` แบบ letterhead (โลโก้ซ้าย ชื่อร้านขวา เส้นคั่น) และหัวอีเมล 8A.1
3. โหลดผ่าน `getKeyValueSettings` ที่มีอยู่ — esc URL ทุกจุด, รูปโหลดพลาดให้ fallback icon เดิม (onerror)
4. เพิ่มช่องตั้งค่า LogoUrl ใน UI หน้า Booking Settings เดิม (rename หัวข้อหน้าเป็น "ตั้งค่าระบบ" ได้) — Admin only ตามเดิม

**DoD รอบ 8:** ส่งเมลพลาด/quota หมด ออเดอร์ต้องสำเร็จปกติ / autofill ไม่ทับข้อมูลที่พิมพ์แล้ว / trigger รันซ้ำไม่สร้างผลซ้ำ (backup ชื่อวันเดียวกันให้ทับ/ข้าม) / ทุก HTML ในอีเมล escape แล้ว / node --check ผ่าน

---

## รอบที่ 9 — จัดหน้า Admin ให้เรียบ (UI reorganization เท่านั้น — ห้ามแตะ backend)

**เป้าหมาย:** ลดเมนูลูกใต้ "ตั้งค่าระบบ" จาก 16 เหลือ ~11 โดยรวมงานตั้งค่าที่กระจาย 6 เมนูให้เป็นหน้าเดียวแบบ tab

**9.1 หน้าใหม่ `systemsettings` — "ตั้งค่าระบบ" (Admin only) มี tab ภายใน 6 แท็บ:**
| Tab | เนื้อหา (ใช้ของเดิมทั้งหมด — ย้ายที่อยู่ ไม่เขียน logic ใหม่) |
|---|---|
| ⏰ เวลารับจอง | ฟอร์ม ReserveStart/End จาก `bookingsettings` เดิม |
| 🖼️ Hero Banners | settingsManager type 'herobanners' เดิม |
| 🔲 Promo Grid | type 'promogrids' เดิม |
| 🪟 Popup | type 'popupbanners' เดิม |
| 🎨 พื้นหลัง Login | type 'loginbg' เดิม |
| 🗄️ ฐานข้อมูล | ปุ่ม Auto Setup เดิม + คำอธิบายว่าใช้เมื่อไหร่ (ติดตั้งครั้งแรก/มีตารางใหม่) |

- tab bar สไตล์เดียวกับ sub-chips ของ POS (เส้นใต้ตัว active) / render เนื้อหาเฉพาะ tab ที่เปิด (เรียก `settingsManager.init(type)` เดิมใส่ container ของ tab)
- **Backward compat:** hash เดิม `#herobanners` `#promogrids` `#popupbanners` `#loginbg` `#bookingsettings` `#autosetup` ต้อง redirect ไป `#systemsettings` แล้วเปิด tab ที่ตรงกัน (คนเคย bookmark ไว้ต้องไม่เจอหน้าตาย)

**9.2 จัดเมนู `menuConfig` ใหม่:**
- Master Data: Products, Branches, Channels, Members, Inventory (เดิม)
- Promotions: Set Premium, Auto Promotions, Promotions, Interests (เดิม)
- ตั้งค่าระบบ: `systemsettings` เมนูเดียว (แทน 6 เมนูเดิม)
- System: Audit (เดิม)
- ลบ entry เก่า 6 ตัวออกจากเมนู (route ยังรับ hash เก่าเพื่อ redirect ตาม 9.1)

**ข้อควรระวัง:** สิทธิ์คงเดิมทุกจุด (settings ทั้งหมด Admin only — Manager ไม่เห็นเมนูนี้), `Accessible Menus` ของสมาชิกที่เคยระบุ id เก่า (เช่น 'bookingsettings') ให้ `checkMenuAccess` ของ `systemsettings` ยอมรับ id เก่าทั้ง 6 ตัวเป็น alias ด้วย / esc เดิมทุกจุด / ห้ามแตะ `saveSettingsItem`/`deleteSettingsItem` backend

**DoD รอบ 9:** ทุก tab ใช้งานได้เหมือนหน้าเดิมทุกฟังก์ชัน (บันทึก/ลบ/อัปโหลด URL), hash เก่า redirect ถูก, เมนูเหลือตามโครงใหม่, หน้าอื่นไม่กระทบ / node --check ผ่าน

---

## รอบที่ 10 — อัปโหลดรูปสินค้าตรงจากฟอร์ม (เก็บใน Google Drive)

**Backend (`Code.js`):**
1. action ใหม่ `UPLOAD_IMAGE` ใน `apiHandler` — **Admin only** (throw ถ้าไม่ใช่)
2. payload: `{ fileName, mimeType, base64Data }` — validate: mimeType ต้องขึ้นต้น `image/`, ขนาด base64 ไม่เกิน ~5MB (throw ข้อความไทยชัดเจน), fileName sanitize เหลือ [a-zA-Z0-9._-] และต่อ timestamp กันชื่อซ้ำ
3. หาโฟลเดอร์ `MPOS Product Images` ใน Drive (`DriveApp.getFoldersByName` — ไม่มีให้สร้าง) → `folder.createFile(Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName))`
4. `file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW)` แล้ว return `{ status:'success', url: 'https://drive.google.com/uc?export=view&id=' + file.getId() }` — เช็คก่อนว่า `formatImageUrl` ฝั่ง client รองรับ URL รูปแบบนี้ (มัน handle drive/googleusercontent อยู่แล้ว — ถ้า format ที่มันแปลงได้ดีกว่าคือแบบ id ให้ return แบบที่เข้ากับ helper เดิม)
5. logAudit การอัปโหลด (ชื่อไฟล์ + ผู้อัป)

**Frontend (`JS.html`):**
1. ใน `grid.openForm`: ช่องที่ `key === 'Image URL'` (ตาราง Products) render เพิ่มปุ่ม "อัปโหลดรูป" + `<input type="file" accept="image/*" class="hidden">` ข้างช่อง URL เดิม (ช่องเดิมยังพิมพ์/วางลิงก์เองได้เหมือนเดิม)
2. เลือกไฟล์แล้ว: **ย่อรูปฝั่ง client ก่อนอัป** — canvas ย่อด้านยาวสุดเหลือ 1200px, `toDataURL('image/jpeg', 0.85)` (ไฟล์ png โปร่งใสให้คง png ถ้าจำเป็น) → ตัด prefix `data:...;base64,` ออกก่อนส่ง
3. ระหว่างอัป: ปุ่มเป็น spinner ผ่าน `buttonBusy` เดิม + แสดง % ไม่ต้อง (call เดียวจบ) — สำเร็จ: เติม URL ลงช่อง + แสดง preview รูปเล็กใต้ช่อง / พลาด: Swal error ข้อความจาก server
4. เพิ่มปุ่มเดียวกันให้ช่อง URL ในหน้า ตั้งค่าระบบ (แบนเนอร์/พื้นหลัง login) ด้วย — ใช้ function อัปโหลดกลางร่วมกัน (`window.app.uploadImage(file, callback)`)

**ข้อระวัง:** การอัปโหลดห้าม block การกรอกฟอร์มส่วนอื่น / esc ทุกค่า URL ที่เติมกลับ / ห้ามแตะ logic บันทึกสินค้าเดิม — ปุ่มนี้แค่ช่วยเติมค่าในช่อง Image URL

**DoD รอบ 10:** อัปรูปจากมือถือ/คอมได้, รูปโชว์บนการ์ด POS ทันทีหลังบันทึก+เคลียร์ cache, วางลิงก์เองแบบเดิมยังใช้ได้, ไฟล์ >5MB หรือไม่ใช่รูป โดนปฏิเสธพร้อมข้อความชัดเจน, non-Admin เรียก UPLOAD_IMAGE โดนปฏิเสธ / node --check ผ่าน

---

## รอบที่ 11 — ตั้งค่า Drive Folder ID ปลายทางรูปอัปโหลด (จากหน้าตั้งค่าระบบ)

**เป้าหมาย:** Admin กำหนดเองได้ว่ารูปจาก UPLOAD_IMAGE ไปลงโฟลเดอร์ Drive ไหน — ไม่ตั้ง = พฤติกรรมเดิม (โฟลเดอร์ "MPOS Product Images" สร้างอัตโนมัติ)

**Backend (`Code.js`):**
1. `uploadImage`: อ่าน `getKeyValueSettings(ss)` — ต้องรับ `ss` เพิ่มจาก apiHandler (ปรับ signature + จุดเรียก)
2. ถ้ามี key `DriveFolderId` (trim แล้วไม่ว่าง): `DriveApp.getFolderById(id)` ใน try/catch — พลาดให้ throw `"Drive Folder ID ที่ตั้งค่าไว้ไม่ถูกต้อง หรือบัญชีนี้ไม่มีสิทธิ์เข้าถึงโฟลเดอร์ (ตรวจที่ ตั้งค่าระบบ → ฐานข้อมูล)"` — **ห้าม fallback เงียบ** (Admin ตั้งเองต้องรู้ว่าผิด)
3. ไม่มี key/ว่าง: ใช้ logic เดิม (getFoldersByName/createFolder)

**Frontend (`JS.html`) — tab "ฐานข้อมูล" ใน systemsettings:**
1. เพิ่ม section "โฟลเดอร์เก็บรูปอัปโหลด": input `DriveFolderId` (โหลดค่าปัจจุบันจาก keyValueSettings ที่ GET_SETTINGS_LIST ส่งมาแล้ว) + ปุ่มบันทึก (ใช้ `buttonBusy`)
2. **วางได้ทั้งลิงก์เต็มและ ID:** ก่อนบันทึก ถ้าค่า match `/folders\/([a-zA-Z0-9_-]+)/` ให้ดึงเฉพาะ ID; วาง ID ตรง ๆ ก็ได้; ค่าว่าง = ล้างกลับไปใช้ค่าเริ่มต้น
3. บันทึกผ่าน path เดิม `SAVE_SETTINGS_ITEM` type `bookingsettings` (server loop key-value generic อยู่แล้ว) — ปรับ Remark ตอน appendRow ให้ map ตาม key (`DriveFolderId` → "โฟลเดอร์ Drive เก็บรูปอัปโหลด") แทน ternary เดิมที่มีแค่ 2 key
4. ใต้ input มี hint: "เปิดโฟลเดอร์ใน Google Drive แล้วคัดลอกลิงก์มาวางได้เลย ระบบจะดึง ID ให้อัตโนมัติ — เว้นว่างเพื่อใช้โฟลเดอร์อัตโนมัติ (MPOS Product Images)"

**DoD รอบ 11:** ตั้ง ID ถูก → รูปใหม่ลงโฟลเดอร์นั้น / ตั้ง ID ผิด → อัปโหลดแจ้ง error ชัดเจน ไม่พังอย่างอื่น / ล้างค่า → กลับพฤติกรรมเดิม / วางลิงก์เต็มแล้วระบบดึง ID ให้ / node --check ผ่าน

## Definition of Done ต่อรอบ
1. `node --check src/Code.js` ผ่าน 2. script body ของ JS.html ผ่าน node --check 3. ไม่ hardcode secret 4. รายงานสรุป diff ที่แก้ก่อนเริ่มรอบถัดไป
