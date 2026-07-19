import { MOCK_PRODUCTS, GIFTS, PROMOTIONS } from "../data/products";
import { COUPONS } from "../data/coupons";
import { DEFAULT_INSTALLMENT_SETTINGS } from "../data/installments";

const ADMIN_EMAILS = ["mahalala123@gmail.com"];

const members = [];
const orders = [];
const products = MOCK_PRODUCTS.map(p => ({ ...p }));
const reviews = [];
const stockBySku = {};
const DEFAULT_STOCK = 20;
const coupons = COUPONS.map(c => ({ ...c }));
const gifts = GIFTS.map(g => ({ ...g }));
const promotions = PROMOTIONS.map(p => ({ ...p }));

function couponIsExpiredLocal_(c) {
  return !!c.expiryDate && new Date(c.expiryDate).getTime() < Date.now();
}

function couponIsExhaustedLocal_(c) {
  return c.usageLimit > 0 && c.usedCount >= c.usageLimit;
}

function countCouponUsageByCustomerLocal_(code, email) {
  if (!email) return 0;
  return orders.filter(o => o.couponCode === code && (o.memberEmail === email || o.guestEmail === email)).length;
}

function withVariantStockLocal_(variants) {
  return (variants || []).map(v => ({
    ...v,
    stockQty: stockBySku[v.sku] !== undefined ? stockBySku[v.sku] : null,
    inStock: stockBySku[v.sku] !== undefined ? stockBySku[v.sku] > 0 : true
  }));
}

function resolveGiftsLocal_(giftIds) {
  return (giftIds || []).map(gid => gifts.find(g => g.id === gid)).filter(Boolean);
}

function decorateProductStockLocal_(p) {
  const variants = withVariantStockLocal_(p.variants);
  const definedStock = variants.map(v => v.stockQty).filter(q => q !== null);
  return {
    ...p,
    variants,
    freeGiftItems: withVariantStockLocal_(resolveGiftsLocal_(p.giftIds)),
    inStock: variants.length ? variants.some(v => v.inStock) : p.inStock,
    stockQty: definedStock.length ? definedStock.reduce((s, q) => s + q, 0) : null
  };
}

// จำลอง session token เหมือนฝั่ง GAS จริง (public/Code.js) — ไม่เชื่ออีเมลที่ client ส่งมาตรงๆ
// อีกต่อไป ต้อง resolve ผ่าน token ที่สร้างตอน login/register เท่านั้น
function generateSessionTokenLocal_() {
  return "tok_" + Math.random().toString(36).slice(2) + Date.now();
}

function resolveEmailByTokenLocal_(token) {
  if (!token) return null;
  const member = members.find(m => m.sessionToken === token);
  if (!member || member.isBlocked) return null;
  return member.email;
}

function isAdminLocal_(email) {
  if (ADMIN_EMAILS.includes(email)) return true;
  const member = members.find(m => m.email === email);
  return !!member && member.adminStatus === "approved";
}

function requireAdminLocal_(token) {
  const email = resolveEmailByTokenLocal_(token);
  return email && isAdminLocal_(email) ? email : null;
}

export function logoutMemberLocal(token) {
  const member = members.find(m => m.sessionToken === token);
  if (member) delete member.sessionToken;
  return { success: true };
}

export function registerMemberLocal({ name, email, password, requestAdmin }) {
  if (members.some(m => m.email === email)) {
    return { success: false, message: "อีเมลนี้ถูกใช้งานแล้ว" };
  }
  const token = generateSessionTokenLocal_();
  const adminStatus = requestAdmin ? "pending" : "";
  const member = { id: "M" + Date.now(), name, email, points: 0, adminStatus, isBlocked: false };
  members.push({ ...member, password, sessionToken: token });
  return { success: true, member: { ...member, isAdmin: isAdminLocal_(email), token } };
}

export function getAdminMembersLocal(token) {
  if (!requireAdminLocal_(token)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  return {
    success: true,
    members: members.slice().reverse().map(m => ({
      id: m.id,
      name: m.name,
      email: m.email,
      points: m.points,
      isSuperAdmin: ADMIN_EMAILS.includes(m.email),
      adminStatus: m.adminStatus || "",
      isBlocked: !!m.isBlocked
    }))
  };
}

export function setMemberAdminStatusLocal(memberId, status, token) {
  if (!requireAdminLocal_(token)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  const member = members.find(m => m.id === memberId);
  if (!member) return { success: false, message: "ไม่พบสมาชิกนี้" };
  member.adminStatus = status;
  return { success: true };
}

export function setMemberBlockedLocal(memberId, blocked, token) {
  const adminEmail = requireAdminLocal_(token);
  if (!adminEmail) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  const member = members.find(m => m.id === memberId);
  if (!member) return { success: false, message: "ไม่พบสมาชิกนี้" };
  if (ADMIN_EMAILS.includes(member.email)) return { success: false, message: "ไม่สามารถบล็อกบัญชีผู้ดูแลระบบหลักได้" };
  if (member.email === adminEmail) return { success: false, message: "ไม่สามารถบล็อกบัญชีของตัวเองได้" };
  member.isBlocked = !!blocked;
  return { success: true };
}

const cartsByEmail = {};

export function getCartLocal(token) {
  const email = resolveEmailByTokenLocal_(token);
  return email ? (cartsByEmail[email] || []) : [];
}

export function saveCartLocal(token, cart) {
  const email = resolveEmailByTokenLocal_(token);
  if (!email) return { success: false, message: "ไม่พบสมาชิก" };
  cartsByEmail[email] = cart || [];
  return { success: true };
}

export function loginMemberLocal({ email, password }) {
  const match = members.find(m => m.email === email && m.password === password);
  if (!match) return { success: false, message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };
  if (match.isBlocked) return { success: false, message: "บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อร้านค้า" };
  const token = generateSessionTokenLocal_();
  match.sessionToken = token;
  const { password: _pw, sessionToken: _st, ...member } = match;
  return { success: true, member: { ...member, isAdmin: isAdminLocal_(member.email), token } };
}

function checkStockAvailableLocal_(items) {
  const needed = {};
  (items || []).forEach(item => {
    if (!item.sku) return;
    needed[item.sku] = (needed[item.sku] || 0) + (Number(item.qty) || 0);
  });
  const shortages = [];
  Object.keys(needed).forEach(sku => {
    const available = stockBySku[sku] !== undefined ? stockBySku[sku] : DEFAULT_STOCK;
    if (needed[sku] > available) shortages.push({ sku, requested: needed[sku], available });
  });
  return shortages;
}

function giftStockItemsLocal_(items) {
  const result = [];
  (items || []).forEach(item => {
    const product = products.find(p => p.id === item.productId);
    resolveGiftsLocal_(product?.giftIds).forEach(g => {
      if (g.sku) result.push({ sku: g.sku, qty: item.qty });
    });
  });
  return result;
}

export function placeOrderLocal(data) {
  const memberEmail = data.memberToken ? resolveEmailByTokenLocal_(data.memberToken) : null;

  const shortages = checkStockAvailableLocal_((data.items || []).concat(giftStockItemsLocal_(data.items)));
  if (shortages.length) {
    const s = shortages[0];
    return { success: false, message: `สินค้า SKU ${s.sku} เหลือไม่พอ (เหลือ ${s.available} ชิ้น, สั่ง ${s.requested} ชิ้น) กรุณาลดจำนวนหรือลองใหม่อีกครั้ง` };
  }

  if (data.couponCode) {
    const coupon = coupons.find(c => c.code === data.couponCode);
    if (!coupon || !coupon.enabled) return { success: false, message: "ไม่พบคูปองนี้" };
    if (couponIsExpiredLocal_(coupon)) return { success: false, message: "คูปองนี้หมดอายุแล้ว" };
    if (couponIsExhaustedLocal_(coupon)) return { success: false, message: "คูปองนี้ถูกใช้ครบจำนวนแล้ว" };
    const customerEmail = memberEmail || data.guestEmail;
    if (coupon.perCustomerLimit > 0 && countCouponUsageByCustomerLocal_(data.couponCode, customerEmail) >= coupon.perCustomerLimit) {
      return { success: false, message: "คุณใช้สิทธิ์คูปองนี้ครบจำนวนแล้ว" };
    }
    coupon.usedCount += 1;
  }

  const pointsRedeemed = Number(data.pointsRedeemed) || 0;
  const pointsEarned = Math.round((Number(data.total) || 0) * 0.01);
  let pointsBalance = null;

  if (memberEmail) {
    const member = members.find(m => m.email === memberEmail);
    if (member) {
      if (pointsRedeemed > member.points) {
        return { success: false, message: "แต้มสะสมไม่เพียงพอ" };
      }
      member.points = member.points - pointsRedeemed + pointsEarned;
      pointsBalance = member.points;
    }
  }

  (data.items || []).forEach(item => {
    if (!item.sku) return;
    const current = stockBySku[item.sku] !== undefined ? stockBySku[item.sku] : DEFAULT_STOCK;
    stockBySku[item.sku] = Math.max(0, current - item.qty);
  });

  (data.items || []).forEach(item => {
    const product = products.find(p => p.id === item.productId);
    resolveGiftsLocal_(product?.giftIds).forEach(g => {
      if (!g.sku) return;
      const current = stockBySku[g.sku] !== undefined ? stockBySku[g.sku] : DEFAULT_STOCK;
      stockBySku[g.sku] = Math.max(0, current - item.qty);
    });
  });

  const orderId = "ORD" + Date.now();
  const { memberToken: _memberToken, ...orderData } = data;
  orders.push({
    ...orderData,
    orderId,
    memberEmail: memberEmail || "",
    status: "รอดำเนินการ",
    createdAt: new Date().toISOString(),
    trackingNumber: ""
  });
  return { success: true, orderId, pointsBalance };
}

export function requestPasswordResetLocal(email) {
  const member = members.find(m => m.email === email);
  if (!member) return { success: false, message: "ไม่พบบัญชีผู้ใช้ที่ใช้อีเมลนี้" };
  const code = String(Math.floor(100000 + Math.random() * 900000));
  member.resetCode = code;
  member.resetExpiry = Date.now() + 15 * 60 * 1000;
  console.log(`[local] รหัสยืนยันสำหรับ ${email}: ${code}`);
  return { success: true, message: "ส่งรหัสยืนยันไปที่อีเมลของคุณแล้ว (โหมด local: ดูรหัสได้ที่ console)" };
}

export function resetPasswordLocal(email, code, newPassword) {
  const member = members.find(m => m.email === email);
  if (!member) return { success: false, message: "ไม่พบบัญชีผู้ใช้ที่ใช้อีเมลนี้" };
  if (!member.resetCode || member.resetCode !== String(code)) {
    return { success: false, message: "รหัสยืนยันไม่ถูกต้อง" };
  }
  if (!member.resetExpiry || member.resetExpiry < Date.now()) {
    return { success: false, message: "รหัสยืนยันหมดอายุแล้ว กรุณาขอรหัสใหม่" };
  }
  member.password = newPassword;
  delete member.resetCode;
  delete member.resetExpiry;
  return { success: true };
}

export function getMyOrdersLocal(token) {
  const email = resolveEmailByTokenLocal_(token);
  return orders.filter(o => o.memberEmail === email).slice().reverse();
}

export function getAdminProductsLocal(token) {
  if (!requireAdminLocal_(token)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  return { success: true, products: products.map(decorateProductStockLocal_) };
}

export function saveProductLocal(product, token) {
  if (!requireAdminLocal_(token)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  const id = product.id || ("p" + Date.now());
  const saved = { ...product, id };
  const idx = products.findIndex(p => p.id === id);
  if (idx >= 0) products[idx] = saved;
  else products.push(saved);

  (product.variants || []).forEach(v => {
    if (v.sku && v.stockQty !== undefined && v.stockQty !== null && v.stockQty !== "") {
      stockBySku[v.sku] = Math.max(0, Number(v.stockQty) || 0);
    }
  });

  return { success: true, id };
}

export function deleteProductLocal(id, token) {
  if (!requireAdminLocal_(token)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  const idx = products.findIndex(p => p.id === id);
  if (idx >= 0) {
    (products[idx].variants || []).forEach(v => { if (v.sku) delete stockBySku[v.sku]; });
    products.splice(idx, 1);
  }
  return { success: true };
}

export function getAdminOrdersLocal(token) {
  if (!requireAdminLocal_(token)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  return { success: true, orders: orders.slice().reverse() };
}

export function updateOrderTrackingLocal(orderId, trackingNumber, token) {
  if (!requireAdminLocal_(token)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  const order = orders.find(o => o.orderId === orderId);
  if (!order) return { success: false, message: "ไม่พบคำสั่งซื้อนี้" };
  order.trackingNumber = trackingNumber || "";
  return { success: true };
}

function restoreStockLocal_(items) {
  (items || []).forEach(item => {
    if (!item.sku) return;
    const current = stockBySku[item.sku] !== undefined ? stockBySku[item.sku] : DEFAULT_STOCK;
    stockBySku[item.sku] = current + item.qty;
  });
  (items || []).forEach(item => {
    const product = products.find(p => p.id === item.productId);
    resolveGiftsLocal_(product?.giftIds).forEach(g => {
      if (!g.sku) return;
      const current = stockBySku[g.sku] !== undefined ? stockBySku[g.sku] : DEFAULT_STOCK;
      stockBySku[g.sku] = current + item.qty;
    });
  });
}

function setOrderStatusLocal_(orderId, status) {
  const order = orders.find(o => o.orderId === orderId);
  if (!order) return { success: false, message: "ไม่พบคำสั่งซื้อนี้" };
  order.status = status;
  if (status === "ยกเลิก" && !order.stockRestored) {
    restoreStockLocal_(order.items);
    order.stockRestored = true;
  }
  return { success: true };
}

export function updateOrderStatusLocal(orderId, status, token) {
  if (!requireAdminLocal_(token)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  return setOrderStatusLocal_(orderId, status);
}

const CANCELLABLE_ORDER_STATUS_LOCAL_ = "รอดำเนินการ";

export function requestCancelOrderLocal(orderId, token, reason) {
  const email = resolveEmailByTokenLocal_(token);
  if (!email) return { success: false, message: "กรุณาเข้าสู่ระบบก่อน" };
  const order = orders.find(o => o.orderId === orderId);
  if (!order || order.memberEmail !== email) return { success: false, message: "ไม่พบคำสั่งซื้อนี้" };
  if (order.status !== CANCELLABLE_ORDER_STATUS_LOCAL_) {
    return { success: false, message: "ไม่สามารถยกเลิกได้ เนื่องจากคำสั่งซื้อนี้เริ่มดำเนินการแล้ว กรุณาติดต่อร้านค้าโดยตรง" };
  }
  order.cancelReason = reason || "";
  return setOrderStatusLocal_(orderId, "ยกเลิก");
}

function hasPurchasedLocal_(email, productId) {
  return orders.some(o => o.memberEmail === email && (o.items || []).some(it => it.productId === productId));
}

export function submitReviewLocal(data) {
  const memberEmail = data.memberToken ? resolveEmailByTokenLocal_(data.memberToken) : null;
  if (!memberEmail) return { success: false, message: "กรุณาเข้าสู่ระบบก่อนรีวิวสินค้า" };
  const rating = Number(data.rating);
  if (!rating || rating < 1 || rating > 5) return { success: false, message: "กรุณาให้คะแนน 1-5 ดาว" };

  const verified = hasPurchasedLocal_(memberEmail, data.productId);
  const existing = reviews.find(r => r.productId === data.productId && r.memberEmail === memberEmail);
  if (existing) {
    existing.rating = rating;
    existing.comment = data.comment || "";
    existing.verifiedPurchase = verified;
    existing.createdAt = new Date().toISOString();
    return { success: true };
  }

  reviews.push({
    reviewId: "RV" + Date.now(),
    productId: data.productId,
    memberEmail: memberEmail,
    memberName: data.memberName || "",
    rating,
    comment: data.comment || "",
    verifiedPurchase: verified,
    createdAt: new Date().toISOString()
  });
  return { success: true };
}

export function getProductReviewsLocal(productId) {
  const list = reviews.filter(r => r.productId === productId).slice().reverse();
  const count = list.length;
  const avg = count ? list.reduce((s, r) => s + r.rating, 0) / count : 0;
  return { success: true, reviews: list, avg, count };
}

export function getAdminReviewsLocal(token) {
  if (!requireAdminLocal_(token)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  const productNameMap = {};
  products.forEach(p => { productNameMap[p.id] = p.name; });
  const list = reviews.map(r => ({ ...r, productName: productNameMap[r.productId] || r.productId })).slice().reverse();
  return { success: true, reviews: list };
}

export function deleteReviewLocal(reviewId, token) {
  if (!requireAdminLocal_(token)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  const idx = reviews.findIndex(r => r.reviewId === reviewId);
  if (idx >= 0) reviews.splice(idx, 1);
  return { success: true };
}

let promoPopup = { enabled: false, imageUrl: "", title: "", description: "", buttonText: "", linkType: "none", linkValue: "" };

export function getPromoPopupLocal() {
  return { ...promoPopup };
}

export function savePromoPopupLocal(data, token) {
  if (!requireAdminLocal_(token)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  promoPopup = {
    enabled: !!data.enabled,
    imageUrl: data.imageUrl || "",
    title: data.title || "",
    description: data.description || "",
    buttonText: data.buttonText || "",
    linkType: data.linkType || "none",
    linkValue: data.linkValue || ""
  };
  return { success: true };
}

let heroBanners = [];

export function getHeroBannersLocal() {
  return heroBanners;
}

export function saveHeroBannersLocal(slides, token) {
  if (!requireAdminLocal_(token)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  heroBanners = slides || [];
  return { success: true };
}

let installmentSettings = { ...DEFAULT_INSTALLMENT_SETTINGS };

export function getInstallmentSettingsLocal() {
  return installmentSettings;
}

export function saveInstallmentSettingsLocal(settings, token) {
  if (!requireAdminLocal_(token)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  installmentSettings = {
    enabled: !!settings.enabled,
    banks: Array.isArray(settings.banks)
      ? settings.banks
        .map(b => ({
          name: (b.name || "").trim(),
          months: Array.isArray(b.months) ? b.months.map(Number).filter(m => m > 0) : []
        }))
        .filter(b => b.name && b.months.length > 0)
      : []
  };
  return { success: true };
}

function dateKey_(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getAdminDashboardStatsLocal(token) {
  if (!requireAdminLocal_(token)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };

  const CANCELLED = "ยกเลิก";
  let totalRevenue = 0;
  const statusBreakdown = {};
  const productTally = {};
  const dayTally = {};

  orders.forEach(order => {
    statusBreakdown[order.status] = (statusBreakdown[order.status] || 0) + 1;
    if (order.status === CANCELLED) return;

    totalRevenue += Number(order.total) || 0;

    const key = dateKey_(order.createdAt);
    if (!dayTally[key]) dayTally[key] = { revenue: 0, orders: 0 };
    dayTally[key].revenue += Number(order.total) || 0;
    dayTally[key].orders += 1;

    (order.items || []).forEach(item => {
      const name = item.name || "ไม่ทราบชื่อสินค้า";
      if (!productTally[name]) productTally[name] = { name, qty: 0, revenue: 0 };
      productTally[name].qty += Number(item.qty) || 0;
      productTally[name].revenue += (Number(item.price) || 0) * (Number(item.qty) || 0);
    });
  });

  const topProducts = Object.values(productTally).sort((a, b) => b.qty - a.qty).slice(0, 5);

  const dailyRevenue = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dateKey_(d);
    const entry = dayTally[key];
    dailyRevenue.push({ date: key, revenue: entry ? entry.revenue : 0, orders: entry ? entry.orders : 0 });
  }

  return {
    success: true,
    totalRevenue,
    totalOrders: orders.length,
    statusBreakdown,
    topProducts,
    dailyRevenue
  };
}

export function getCouponsLocal() {
  return coupons
    .filter(c => c.enabled)
    .map(c => ({ ...c, expired: couponIsExpiredLocal_(c) }));
}

export function getAdminCouponsLocal(token) {
  if (!requireAdminLocal_(token)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  return { success: true, coupons: coupons.map(c => ({ ...c })) };
}

export function saveCouponLocal(coupon, token) {
  if (!requireAdminLocal_(token)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  const code = (coupon.code || "").trim().toUpperCase();
  if (!code) return { success: false, message: "กรุณาระบุโค้ดคูปอง" };

  const idx = coupons.findIndex(c => c.code === code);
  const usedCount = idx >= 0 ? coupons[idx].usedCount : 0;
  const saved = {
    code,
    label: coupon.label || "",
    description: coupon.description || "",
    discountType: coupon.discountType === "percent" ? "percent" : "fixed",
    value: Number(coupon.value) || 0,
    minSpend: Number(coupon.minSpend) || 0,
    maxDiscount: coupon.maxDiscount ? Number(coupon.maxDiscount) : null,
    expiryDate: coupon.expiryDate || "",
    usageLimit: Number(coupon.usageLimit) || 0,
    usedCount,
    enabled: coupon.enabled !== false,
    perCustomerLimit: Number(coupon.perCustomerLimit) || 0
  };
  if (idx >= 0) coupons[idx] = saved;
  else coupons.push(saved);
  return { success: true, code };
}

export function deleteCouponLocal(code, token) {
  if (!requireAdminLocal_(token)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  const idx = coupons.findIndex(c => c.code === code);
  if (idx >= 0) coupons.splice(idx, 1);
  return { success: true };
}

export function getAdminGiftsLocal(token) {
  if (!requireAdminLocal_(token)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  return { success: true, gifts: withVariantStockLocal_(gifts) };
}

export function saveGiftLocal(gift, token) {
  if (!requireAdminLocal_(token)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  const id = gift.id || ("gift" + Date.now());
  const saved = {
    id,
    name: gift.name || "",
    sku: gift.sku || "",
    type: gift.type === "store" ? "store" : "brand",
    image: gift.image || null
  };
  const idx = gifts.findIndex(g => g.id === id);
  if (idx >= 0) gifts[idx] = saved;
  else gifts.push(saved);

  if (gift.sku && gift.stockQty !== undefined && gift.stockQty !== null && gift.stockQty !== "") {
    stockBySku[gift.sku] = Math.max(0, Number(gift.stockQty) || 0);
  }

  return { success: true, id };
}

export function deleteGiftLocal(id, token) {
  if (!requireAdminLocal_(token)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  const idx = gifts.findIndex(g => g.id === id);
  if (idx >= 0) gifts.splice(idx, 1);
  return { success: true };
}

export function getPromotionsLocal() {
  return promotions.filter(p => p.enabled).map(p => ({ ...p }));
}

export function getAdminPromotionsLocal(token) {
  if (!requireAdminLocal_(token)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  return { success: true, promotions: promotions.map(p => ({ ...p })) };
}

export function savePromotionLocal(promo, token) {
  if (!requireAdminLocal_(token)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  const id = promo.id || ("promo" + Date.now());
  const saved = {
    id,
    label: promo.label || "",
    discountType: promo.discountType === "percent" ? "percent" : "fixed",
    value: Number(promo.value) || 0,
    groups: (promo.groups || []).map(g => ({ type: g.type === "category" ? "category" : "product", ids: g.ids || [] })).filter(g => g.ids.length > 0),
    minQtyEach: Number(promo.minQtyEach) || 1,
    enabled: promo.enabled !== false
  };
  const idx = promotions.findIndex(p => p.id === id);
  if (idx >= 0) promotions[idx] = saved;
  else promotions.push(saved);
  return { success: true, id };
}

export function deletePromotionLocal(id, token) {
  if (!requireAdminLocal_(token)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  const idx = promotions.findIndex(p => p.id === id);
  if (idx >= 0) promotions.splice(idx, 1);
  return { success: true };
}
