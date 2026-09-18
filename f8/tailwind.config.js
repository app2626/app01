// Precompile-time Tailwind config for f8 (Mobile Pre Order System).
// เหตุผลที่มีไฟล์นี้: cdn.tailwindcss.com (runtime JIT + window.tailwind.config) พบว่า "ไม่" apply config
// ที่ตั้งเองเมื่อรันจริงบน Google Apps Script /exec (ยืนยันด้วย headless screenshot ของหน้า live จริง 2026-09-18 —
// หน้า login render เป็นพาเลตเริ่มต้นของ Tailwind ล้วนๆ ไม่ใช่สีที่ config ไว้เลย) จึง compile เป็น static CSS แทน
// เพื่อตัดจุดเสี่ยงนี้ออกจากระบบถาวร — ดู memory ของโปรเจกต์ f8 สำหรับรายละเอียดการวินิจฉัย
//
// วิธี build ใหม่ (ต้องรันทุกครั้งที่มีการเพิ่ม/เปลี่ยน Tailwind utility class ใน src/Index.html หรือ src/JS.html):
//   npx tailwindcss@3 -i ./tw-input.css -o ./src/TailwindCompiled.css.txt -c ./tailwind.config.js --minify
//   แล้วห่อผลลัพธ์ด้วย <style>...</style> ใส่ใน src/TailwindCompiled.html (ดูสคริปต์ build-tailwind.js ในโฟลเดอร์นี้)
module.exports = {
  content: ['./src/Index.html', './src/JS.html'],
  theme: {
    extend: {
      colors: {
        // Samsung-inspired (2026-09-18): Samsung Blue family แทน indigo/violet เดิม — ดู comment เต็มใน src/Index.html ประวัติเดิม (ก่อนย้ายมาไฟล์นี้)
        indigo: { 50: '#eef1fb', 100: '#dbe1f5', 200: '#b8c5ee', 300: '#8ea0e0', 400: '#5b74d1', 500: '#3c58c8', 600: '#2748b8', 700: '#1428a0', 800: '#0e1c72', 900: '#081246' },
        // slate: กลับเป็นทิศทางมาตรฐานของ Tailwind แท้ๆ (50=อ่อนสุด/ขาว, 900=เข้มสุด) สำหรับธีมกลางวัน (2026-09-18 รอบนี้)
        // เดิมกลับด้านไว้ (50=เข้มสุด) สำหรับธีมมืด — ตอนนี้ผู้ใช้ต้องการธีมขาว จึงลบ override นี้ออก ใช้ค่า default ของ Tailwind ไปเลย (เท่ากับ scale นี้ทุกตัวเลข)
        slate: { 50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a' },
        emerald: { 50: '#ecfdf5', 100: '#d1fae5', 400: '#34d399', 500: '#10b981', 600: '#059669' },
        amber: { 50: '#fffbeb', 100: '#fef3c7', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706' },
        rose: { 50: '#fff1f2', 100: '#ffe4e6', 400: '#fb7185', 500: '#f43f5e', 600: '#e11d48' },
        cyan: { 50: '#ecfeff', 400: '#22d3ee', 500: '#06b6d4' },
        purple: { 50: '#faf5ff', 400: '#c084fc', 500: '#a855f7' },
      },
      fontFamily: {
        sans: ['Prompt', 'Inter', 'sans-serif'],
      },
      boxShadow: {
        enterprise: '0 10px 25px -3px rgba(0, 0, 0, 0.35), 0 4px 10px -4px rgba(0, 0, 0, 0.3)',
        'enterprise-lg': '0 20px 40px -8px rgba(0, 0, 0, 0.5), 0 8px 16px -6px rgba(0, 0, 0, 0.35)',
        'glow-indigo': '0 0 20px -5px rgba(60, 88, 200, 0.4)',
      },
    },
  },
};
