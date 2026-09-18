// รัน: node build-tailwind.js
// Compile Tailwind (ตาม tailwind.config.js ในโฟลเดอร์นี้) เป็น static CSS แล้วห่อด้วย <style> เขียนทับ src/TailwindCompiled.html
// ต้องรันทุกครั้งที่เพิ่ม/เปลี่ยน Tailwind utility class ใหม่ใน src/Index.html หรือ src/JS.html ก่อน clasp push
// (ดูเหตุผลเต็มใน tailwind.config.js ด้านบนไฟล์นี้ — cdn.tailwindcss.com runtime config ใช้งานจริงบน GAS ไม่ได้)
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const outCss = path.join(root, '_tailwind_compiled_tmp.css');

console.log('Compiling Tailwind CSS...');
execSync(`npx --yes tailwindcss@3 -i "${path.join(root, 'tw-input.css')}" -o "${outCss}" -c "${path.join(root, 'tailwind.config.js')}" --minify`, {
  stdio: 'inherit',
  cwd: root,
});

const css = fs.readFileSync(outCss, 'utf8');
const html = '<style>\n' + css + '\n</style>\n';
const dest = path.join(root, 'src', 'TailwindCompiled.html');
fs.writeFileSync(dest, html);
fs.unlinkSync(outCss);
console.log('Wrote', dest, '(' + css.length + ' bytes of CSS)');
