// ============================================================================
// ระบบโค้ดคูปอง (Coupon Codes) + ล้างแคช
// ชีต "Coupons" สร้างอัตโนมัติเมื่อ Admin เปิดหน้า Coupons ครั้งแรก
// คอลัมน์: Code | Description | Discount Type (Fixed/Percent) | Value | Min Spend | Max Uses (0/ว่าง = ไม่จำกัด)
//          | Used Count | Start Date | Expiry Date | Status (เปิด/ปิด)
// ============================================================================
var COUPON_HEADERS_ = ["Code", "Description", "Discount Type", "Value", "Min Spend", "Max Uses", "Used Count", "Start Date", "Expiry Date", "Status"];

function ensureCouponsSheet_(ss) {
  let sheet = ss.getSheetByName("Coupons");
  if (!sheet) {
    sheet = ss.insertSheet("Coupons");
    sheet.appendRow(COUPON_HEADERS_);
    sheet.getRange(1, 1, 1, COUPON_HEADERS_.length).setFontWeight("bold").setBackground("#4F46E5").setFontColor("white");
    sheet.setFrozenRows(1);
    sheet.appendRow(["WELCOME500", "ส่วนลดต้อนรับ 500 บาท (ตัวอย่าง)", "Fixed", 500, 5000, 100, 0, "", "", "ปิด"]);
  }
  return sheet;
}

// รองรับ yyyy-mm-dd, yyyy/mm/dd, dd/mm/yyyy (และปี พ.ศ.) — คืน null ถ้าว่าง/อ่านไม่ได้
function parseCouponDate_(raw, endOfDay) {
  const s = (raw === null || raw === undefined) ? '' : raw.toString().trim();
  if (!s) return null;
  let d = null;
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (m) {
    let y = parseInt(m[3], 10);
    if (y > 2400) y -= 543;
    d = new Date(y, parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  } else {
    m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (m) {
      let y = parseInt(m[1], 10);
      if (y > 2400) y -= 543;
      d = new Date(y, parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    } else {
      const t = Date.parse(s);
      if (!isNaN(t)) d = new Date(t);
    }
  }
  if (!d || isNaN(d.getTime())) return null;
  if (endOfDay) d.setHours(23, 59, 59, 999);
  return d;
}

function normalizeCouponNumber_(v) {
  return parseFloat((v === null || v === undefined ? '' : v).toString().replace(/[^\d.\-]/g, '')) || 0;
}

// ตรวจโค้ดกับรายการคูปอง (rows จาก getTableDataAsJson) — คืน {ok, message, code, type, value, minSpend, discount}
function evaluateCoupon_(rows, code, goodsTotal) {
  const key = (code || '').toString().trim().toUpperCase();
  if (!key) return { ok: false, message: 'กรุณากรอกโค้ดคูปอง' };
  const c = (rows || []).find(r => (r.Code || '').toString().trim().toUpperCase() === key);
  if (!c) return { ok: false, message: 'ไม่พบโค้ดคูปองนี้' };
  const status = (c.Status || '').toString().trim().toLowerCase();
  if (['เปิด', 'open', 'active', 'on', 'true'].indexOf(status) === -1) return { ok: false, message: 'โค้ดคูปองนี้ถูกปิดใช้งาน' };

  const now = new Date();
  const start = parseCouponDate_(c['Start Date'], false);
  const end = parseCouponDate_(c['Expiry Date'], true);
  if (start && now < start) return { ok: false, message: 'โค้ดคูปองนี้ยังไม่เริ่มใช้งาน' };
  if (end && now > end) return { ok: false, message: 'โค้ดคูปองนี้หมดอายุแล้ว' };

  const maxUses = parseInt(normalizeCouponNumber_(c['Max Uses']), 10) || 0;
  const used = parseInt(normalizeCouponNumber_(c['Used Count']), 10) || 0;
  if (maxUses > 0 && used >= maxUses) return { ok: false, message: 'โค้ดคูปองนี้ถูกใช้ครบจำนวนสิทธิ์แล้ว' };

  const minSpend = normalizeCouponNumber_(c['Min Spend']);
  const total = Number(goodsTotal) || 0;
  if (minSpend > 0 && total < minSpend) {
    return { ok: false, message: 'ยอดซื้อขั้นต่ำสำหรับโค้ดนี้ ฿' + minSpend.toLocaleString() + ' (ตอนนี้ ฿' + total.toLocaleString() + ')' };
  }

  const value = normalizeCouponNumber_(c.Value);
  if (!(value > 0)) return { ok: false, message: 'ตั้งค่ามูลค่าส่วนลดของคูปองนี้ไม่ถูกต้อง' };
  const type = /percent|%/i.test((c['Discount Type'] || '').toString()) ? 'Percent' : 'Fixed';
  let discount = type === 'Percent' ? (total * value) / 100 : value;
  discount = Math.min(discount, total);
  return { ok: true, code: (c.Code || '').toString().trim(), type: type, value: value, minSpend: minSpend, discount: Math.round(discount * 100) / 100, description: (c.Description || '').toString() };
}

// API: ตรวจโค้ดคูปองสำหรับตะกร้าปัจจุบัน (ทุก role ที่ login) — ส่งเฉพาะข้อมูลที่จำเป็นกลับไป ไม่เปิดเผยรายการคูปองทั้งหมด
function validateCouponApi_(payload, ss) {
  const rows = getTableDataAsJson(ss.getSheetByName("Coupons"), true);
  const ev = evaluateCoupon_(rows, payload && payload.code, payload && payload.subtotal);
  if (!ev.ok) return { status: 'error', message: ev.message };
  return { status: 'success', coupon: { code: ev.code, type: ev.type, value: ev.value, minSpend: ev.minSpend, discount: ev.discount, description: ev.description } };
}

// นับการใช้งานคูปอง (+1 ต่อโค้ดต่อออเดอร์) — เรียกภายใน lock ของ processCheckout
function bumpCouponUsage_(ss, codes) {
  if (!codes || codes.length === 0) return;
  const sheet = ss.getSheetByName("Coupons");
  if (!sheet || sheet.getLastRow() < 2) return;
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => h.toString().trim());
  const codeIdx = headers.indexOf("Code");
  const usedIdx = headers.indexOf("Used Count");
  if (codeIdx === -1 || usedIdx === -1) return;
  codes.forEach(code => {
    for (let i = 1; i < data.length; i++) {
      if ((data[i][codeIdx] || '').toString().trim().toUpperCase() === code) {
        const cur = parseInt(data[i][usedIdx], 10) || 0;
        data[i][usedIdx] = cur + 1;
        sheet.getRange(i + 1, usedIdx + 1).setValue(cur + 1);
        break;
      }
    }
  });
}

// ล้างแคชตารางทั้งหมด (Admin) — ใช้หลังแก้ชีตตรงๆ เพื่อให้ POS เห็นข้อมูลล่าสุดทันที ไม่ต้องรอแคช 6 ชั่วโมง
function clearAllCaches_(secureUser) {
  const tables = ["Products", "Promotions", "Branches", "Channels", "Interests", "GiftMappings", "AutoPromotions", "Members", "Settings", "Coupons"];
  CacheService.getScriptCache().removeAll(tables.map(t => "TABLE_" + t));
  logAudit(secureUser.Username, "CLEAR_CACHE", "ล้างแคชข้อมูล: " + tables.join(', '));
  return { status: 'success', cleared: tables.length };
}
