// Shared data layer (Cloudflare D1 via /api/data)
const DEFAULTS = {
  settings: {
    orgName: 'Nova Org',
    tagline: 'ศูนย์รวมข้อมูลขององค์กร',
    heroTitle: 'ทุกโปรเจกต์ ทุกลิงก์ที่ทีมต้องใช้ อยู่ในที่เดียว',
    heroDesc: 'รวบรวมโปรเจกต์ เอกสาร และเครื่องมือสำคัญขององค์กร ค้นหาง่าย เข้าถึงได้ทันที',
    email: 'hello@example.org',
    logoUrl: ''
  },
  sections: [
    { id: 's1', title: 'โปรเจกต์', subtitle: 'งานและระบบที่องค์กรกำลังดำเนินการ', items: [
      { id: 'i1', title: 'ระบบจัดการพนักงาน', desc: 'ระบบ HR สำหรับลางาน เงินเดือน และประเมินผล', badge: 'กำลังดำเนินการ', tags: 'HR, Web', url: '#' },
      { id: 'i2', title: 'แอปบริการลูกค้า', desc: 'แอปมือถือสำหรับติดตามคำสั่งซื้อและแจ้งปัญหา', badge: 'เสร็จสิ้น', tags: 'Mobile', url: '#' },
      { id: 'i3', title: 'แดชบอร์ดวิเคราะห์ข้อมูล', desc: 'รายงานยอดขายและ KPI แบบเรียลไทม์', badge: 'วางแผน', tags: 'Data', url: '#' }
    ] },
    { id: 's2', title: 'ลิงก์สำคัญ', subtitle: 'เอกสารและเครื่องมือที่ใช้บ่อย', items: [
      { id: 'i4', title: 'คู่มือพนักงาน', desc: 'นโยบายและแนวปฏิบัติ', badge: 'เอกสาร', tags: '', url: '#' },
      { id: 'i5', title: 'ปฏิทินองค์กร', desc: 'กิจกรรมและวันหยุด', badge: 'เครื่องมือ', tags: '', url: '#' },
      { id: 'i6', title: 'Git Repository', desc: 'ซอร์สโค้ดทั้งหมด', badge: 'เครื่องมือ', tags: '', url: '#' },
      { id: 'i7', title: 'แบบฟอร์มขอเบิก', desc: 'ดาวน์โหลดแบบฟอร์ม', badge: 'เอกสาร', tags: '', url: '#' }
    ] },
    { id: 's3', title: 'ติดต่อ', subtitle: 'ช่องทางติดต่อทีมงาน', items: [
      { id: 'i8', title: 'อีเมล', desc: 'hello@example.org', badge: 'ติดต่อ', tags: '', url: 'mailto:hello@example.org' }
    ] }
  ]
};
function normalize(d) {
  const settings = { ...DEFAULTS.settings, ...(d.settings || {}) };
  if (Array.isArray(d.sections)) return { settings, sections: d.sections };
  // migrate old shape {projects, links}
  const sections = [];
  if (d.projects) sections.push({ id: uid(), title: 'โปรเจกต์', subtitle: 'งานและระบบที่องค์กรกำลังดำเนินการ',
    items: d.projects.map(p => ({ id: p.id || uid(), title: p.name, desc: p.desc, badge: p.status, tags: p.tags, url: p.url })) });
  if (d.links) sections.push({ id: uid(), title: 'ลิงก์สำคัญ', subtitle: 'เอกสารและเครื่องมือที่ใช้บ่อย',
    items: d.links.map(l => ({ id: l.id || uid(), title: l.title, desc: l.desc, badge: l.category, tags: '', url: l.url })) });
  return { settings, sections };
}
async function loadData() {
  try {
    const h = {}; const pw = sessionStorage.getItem('pw'); if (pw) h['x-admin-password'] = pw;
    h['x-section-codes'] = encodeURIComponent(sessionStorage.getItem('codes') || '{}');
    const r = await fetch('/api/data', { cache: 'no-store', headers: h });
    const d = r.ok ? await r.json() : null;
    if (d) return normalize(d);
  } catch (e) {}
  return structuredClone(DEFAULTS);
}
async function saveData(d) {
  const r = await fetch('/api/data', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-admin-password': sessionStorage.getItem('pw') || '' }, body: JSON.stringify(d) });
  if (!r.ok) throw new Error(r.status === 401 ? 'unauthorized' : 'save failed');
}
async function checkLogin(pw) {
  const r = await fetch('/api/login', { method: 'POST', headers: { 'x-admin-password': pw } });
  return r.ok;
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function safeUrl(u) { return /^(https?:|mailto:|tel:|#|\/)/i.test(u || '') ? u : '#'; }
function safeImg(u) { return /^(https?:|\/|data:image\/(png|jpeg|webp|svg\+xml|gif);base64,)/i.test(u || '') ? u : 'logo.svg'; }
const uid = () => 'x' + Math.random().toString(36).slice(2, 9);

