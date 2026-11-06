// ตั้งค่า Tailwind แบบ build ล่วงหน้า (แทน cdn.tailwindcss.com) — ค่า theme ต้องตรงกับที่เคยฝังใน Index.html
module.exports = {
  darkMode: 'class',
  content: ['./src/Index.html', './src/JS.html', './src/JS_*.html', './src/CSS.html'],
  // คลาสที่โค้ดประกอบชื่อเองตอนรัน (สแกนไม่เจอ): JS.html `bg-${clr}-100 text-${clr}-700 border-${clr}-200` (emerald/amber/slate)
  // และ `'bg-' + color + '-500'` (indigo/pink/emerald/amber)
  safelist: [
    ...['emerald', 'amber', 'slate'].flatMap(c => [`bg-${c}-100`, `text-${c}-700`, `border-${c}-200`]),
    ...['indigo', 'pink', 'emerald', 'amber'].map(c => `bg-${c}-500`),
  ],
  theme: {
    extend: {
      colors: {
        indigo: { 50: '#eef3f8', 100: '#dce7f0', 200: '#b8cee1', 300: '#85abc9', 400: '#5485ad', 500: '#366891', 600: '#254d71', 700: '#1b3a59', 800: '#112840', 900: '#0a1a2a' },
        slate: { 50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a' },
        emerald: { 50: '#ecfdf5', 100: '#d1fae5', 400: '#34d399', 500: '#10b981', 600: '#059669' },
        amber: { 50: '#fffbeb', 100: '#fef3c7', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706' },
        rose: { 50: '#fff1f2', 100: '#ffe4e6', 400: '#fb7185', 500: '#f43f5e', 600: '#e11d48' },
        cyan: { 50: '#ecfeff', 400: '#22d3ee', 500: '#06b6d4' },
        purple: { 50: '#faf5ff', 400: '#c084fc', 500: '#a855f7' },
      },
      fontFamily: { sans: ['Plus Jakarta Sans', 'Sarabun', 'sans-serif'] },
      boxShadow: {
        'enterprise': '0 10px 25px -3px rgba(15, 42, 67, 0.08), 0 4px 10px -4px rgba(15, 42, 67, 0.05)',
        'enterprise-lg': '0 20px 40px -8px rgba(15, 42, 67, 0.12), 0 8px 16px -6px rgba(15, 42, 67, 0.06)',
        'glow-indigo': '0 0 20px -5px rgba(37, 77, 113, 0.35)',
      },
    },
  },
};
