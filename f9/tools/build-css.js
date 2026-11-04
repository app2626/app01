// สร้าง src/TailwindCSS.html (<style> ก้อนเดียว) จาก Tailwind CLI — รันด้วย `npm run build:css` ทุกครั้งที่เพิ่ม/เปลี่ยนคลาส Tailwind ใน Index/JS/CSS
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const tmp = path.join(root, 'tools', '.tw-out.css');
execFileSync(process.execPath, [path.join(root, 'node_modules', 'tailwindcss', 'lib', 'cli.js'), '-c', 'tailwind.config.js', '-i', 'tools/tailwind-input.css', '-o', tmp, '--minify'], { cwd: root, stdio: 'inherit' });
const css = fs.readFileSync(tmp, 'utf8').replace(/\/\*![\s\S]*?\*\//g, ''); // ตัดคอมเมนต์ license (กัน GAS comment-stripper)
if (/<\/style/i.test(css)) throw new Error('css contains </style');
if (css.includes('/*')) console.warn('warn: CSS มี "/*" — GAS comment-stripper อาจกวนได้');
fs.writeFileSync(path.join(root, 'src', 'TailwindCSS.html'), '<style>\n' + css + '\n</style>\n');
fs.unlinkSync(tmp);
console.log('wrote src/TailwindCSS.html', (css.length / 1024).toFixed(1) + ' KB');
