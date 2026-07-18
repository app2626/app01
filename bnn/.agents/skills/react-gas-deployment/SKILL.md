---
name: React to Google Apps Script via Clasp
description: กระบวนการสร้าง Web App บน Google Apps Script (GAS) ด้วย React, Vite และ Tailwind CSS พร้อมการเชื่อมต่อ Clasp เพื่อ Push โค้ดอัตโนมัติ
---

# React to Google Apps Script (GAS) Builder Skill

Skill นี้ให้คำแนะนำและขั้นตอนมาตรฐานในการนำแอปพลิเคชัน React ที่พัฒนาด้วย Vite และ Tailwind CSS ไปใช้งานบน Google Apps Script (GAS) โดยใช้ `clasp` ในการ push โค้ด

## 1. การตั้งค่าโปรเจกต์
- เริ่มโปรเจกต์ด้วย `npx create-vite . --template react`
- ติดตั้ง Dependencies `npm install`
- ติดตั้ง Tailwind: `npm install tailwindcss @tailwindcss/vite`
- ติดตั้งปลั๊กอินสำหรับ GAS: `npm install vite-plugin-singlefile -D`

## 2. การตั้งค่า Vite (vite.config.js)
ตั้งค่าให้ Vite บิลด์แอปพลิเคชันเป็นไฟล์ HTML ไฟล์เดียว:
```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
})
```

## 3. การเตรียมไฟล์สำหรับฝั่ง Server ของ GAS
สร้างไฟล์เหล่านี้ไว้ในโฟลเดอร์ `public/` เพื่อให้ Vite นำไปใส่ใน `dist/` ตอนสั่ง Build:

**public/appsscript.json** (กำหนดสิทธิ์ Web App)
```json
{
  "timeZone": "Asia/Bangkok",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/spreadsheets"
  ],
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE"
  }
}
```

**public/Code.js** (คำสั่งฝั่ง Server และการส่งข้อมูล)
```javascript
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('React Web App')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ฟังก์ชันดึงข้อมูลจาก Sheet (ตัวอย่าง)
function getSpreadsheetData() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Products");
  const data = sheet.getDataRange().getValues();
  return JSON.stringify(data);
}

// ฟังก์ชันสร้างฐานข้อมูลเริ่มต้น (ใช้รันครั้งแรกจาก Editor)
function setupSampleDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Products");
  if (!sheet) sheet = ss.insertSheet("Products");
  sheet.appendRow(["id", "name", "price"]);
  sheet.appendRow(["1", "Sample Item", "100"]);
}
```

## 4. การจัดการไฟล์ .clasp.json
แก้ไฟล์ `.clasp.json` ให้เปลี่ยน `rootDir` ไปที่โฟลเดอร์ `dist` เพราะเราจะ push เฉพาะสิ่งที่ Build เสร็จแล้วขึ้นไปบน Google Apps Script
```json
{
  "scriptId": "YOUR_SCRIPT_ID",
  "rootDir": "dist"
}
```

## 5. การอัปเดตโค้ดขึ้น GAS
กระบวนการอัปเดตจะต้องทำ 2 คำสั่งนี้เสมอ:
1. `npm run build` (เพื่อสร้างไฟล์ `index.html` แบบ Single File และดึงไฟล์ `.js` `.json` จากโฟลเดอร์ public ไปลงที่ `dist/`)
2. `npx clasp push -f` (เพื่อยิงโค้ดจาก `dist/` ขึ้น Google Apps Script)
