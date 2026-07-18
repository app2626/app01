# Preorder System (V3.1) - Developer Skills & Architecture Guide

เอกสารฉบับนี้ใช้สำหรับเป็นคู่มือ (Skill/Rules) เพื่อให้นักพัฒนา หรือ AI Agent เข้าใจโครงสร้างระบบปัจจุบันของโปรเจกต์นี้

## 1. 🏗️ โครงสร้างสถาปัตยกรรม (Architecture)
ระบบถูกเขียนด้วย **Google Apps Script (GAS)** โดยมีโครงสร้างแบบ Single Page Application (SPA) และใช้ Google Sheets เป็นฐานข้อมูล

*   **`Code.js` (Backend):** ทำหน้าที่เป็น API Gateway รับส่งข้อมูลกับ Frontend ผ่านฟังก์ชัน `handleAPI(action, payload)` และจัดการ Google Sheets ด้วยการทำงานแบบ Batch (เพื่อลดคอขวดและเพิ่มประสิทธิภาพ) รวมถึงการทำ Data Caching ด้วย `CacheService`
*   **`Index.html` (UI Layout):** โครงร่าง HTML หลัก ใช้ Tailwind CSS ผ่าน CDN มีการประกาศ `<template>` ต่างๆ สำหรับแต่ละหน้าจอ (เช่น `#tmpl-dashboard`, `#tmpl-pos`, `#tmpl-datagrid`, `#tmpl-invoice`)
*   **`JS.html` (Frontend Controller):** หัวใจหลักของฝั่ง Client โค้ดทั้งหมดจะถูกผูกไว้ใน Object `window.app` ซึ่งจัดการทั้ง Routing, การ Render ข้อมูลแบบตาราง (DataGrid), ระบบตะกร้า POS, การคำนวณโปรโมชั่น และระบบพิมพ์เอกสาร
*   **`CSS.html`:** สไตล์เพิ่มเติมและการตั้งค่า Tailwind Config รวมไปถึง `@media print` สำหรับการสั่งพิมพ์เอกสาร

## 2. 🧩 ระบบ Frontend (window.app)
*   **การจัดการเมนู (Routing):** ควบคุมผ่าน `window.app.menuConfig` หากต้องการเพิ่ม/ลดเมนู ให้ปรับแก้ที่ตัวแปรนี้ และจัดการการแสดงผลใน `window.app.route(hash)`
*   **ตารางข้อมูล (DataGrid):** ทำงานผ่าน `window.app.grid` ซึ่งสามารถวาดตารางได้อัตโนมัติตาม `columns` ที่ส่งให้ เช่น การตั้งค่า `type: 'readonly'` หรือ `type: 'text'` เพื่อให้แก้ไขข้อมูลได้
*   **การสื่อสารกับ Backend:** ใช้ `window.app.api(action, payload)` เพื่อส่งคำขอไปหา `Code.js` (เช่น `GET_ALL_DATA`, `SAVE_RECORD`)

## 3. 🛍️ ระบบ POS / Pre Order และโปรโมชั่น
*   **ตะกร้าสินค้า (Cart):** จัดการโดย `window.app.pos` มีระบบตรวจสอบสิทธิ์การจอง (Reservation Status: จอง T / จอง F)
*   **Auto Bundle Promotion:** ระบบโปรโมชั่นอัตโนมัติจะคำนวณอยู่ใน `window.app.pos.calculateTotal()` โดยจะเช็คเงื่อนไขจากหมวดหมู่สินค้าที่ซื้อ (Buy Category) และหมวดหมู่ที่ได้รับส่วนลด (Get Discount Category) 
    *   ระบบจะสรุปคำอธิบายโปรโมชั่นลงใน `this.autoDiscountDesc` (เช่น *20% หมวด ของที่ระลึก*) และแสดงในใบเสร็จด้วย
*   **ใบเสร็จชั่วคราว (Booking Receipt):** ควบคุมโดยฟังก์ชัน `window.app.printReceipt()` ซึ่งจะเปิด Popup หน้าต่างใหม่และสร้าง HTML สำหรับใบเสร็จขนาด 80mm หรือ A4

## 4. 📝 ระบบใบเสนอราคาและใบแจ้งหนี้ (Invoice/Quotation)
*   **Template:** ใช้ `<template id="tmpl-invoice">` ใน `Index.html` 
*   **Logic:** ถูกควบคุมโดย `window.app.invoice` 
*   **ฟีเจอร์เด่น:** 
    *   เลขที่เอกสารรันอัตโนมัติ (`INV-YYMMDD-XXX`)
    *   คำนวณ VAT 7% และ หัก ณ ที่จ่าย (%) อัตโนมัติใน `window.app.invoice.calc()`
    *   มีพื้นที่เซ็นเอกสารด้านล่าง (Customer, Issuer, Manager)
    *   การสั่งพิมพ์จะทำงานผ่าน `window.print()` โดยอาศัย `@media print` ใน `CSS.html` เพื่อซ่อนปุ่มและแก้ไข layout ให้พอดีกับหน้า A4 (เช่น class `.no-print`)

## 5. ⚠️ ข้อควรระวังในการพัฒนา (Best Practices)
1. **ห้ามใช้ `.appendRow()` ใน Loop:** ใน `Code.js` หากจะเขียนข้อมูลทีละมากๆ ให้ประกอบเป็น Array 2D แล้วใช้ `Range.setValues()` เพื่อป้องกันโควต้า Limit ของ Google Apps Script
2. **การล็อคข้อมูล (LockService):** ใช้ Lock เสมอเมื่อมีการสั่งจองสินค้า เพื่อป้องกันไม่ให้ Stock ชนกันเมื่อลูกค้ากดพร้อมกัน
3. **การลบแคช (Clear Cache):** ทุกครั้งที่มีการบันทึก ลบ หรือแก้ข้อมูล ให้เรียก `window.app.refreshGlobalData()` เพื่อดึงข้อมูลใหม่ และใน `Code.js` ต้อง clear `CacheService` เสมอ
4. **Tailwind Classes:** โปรเจกต์นี้ใช้ Tailwind แบบ CDN จึงไม่ควรอ้างอิง Class ผ่านไฟล์ CSS ภายนอก หากจำเป็นให้เขียนไว้ใน `CSS.html` โดยใช้ Tag `<style type="text/tailwindcss">`
