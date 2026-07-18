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

export function registerMemberLocal({ name, email, password }) {
  if (members.some(m => m.email === email)) {
    return { success: false, message: "อีเมลนี้ถูกใช้งานแล้ว" };
  }
  const member = { id: "M" + Date.now(), name, email, points: 0, isAdmin: ADMIN_EMAILS.includes(email) };
  members.push({ ...member, password });
  return { success: true, member };
}

const cartsByEmail = {};

export function getCartLocal(email) {
  return cartsByEmail[email] || [];
}

export function saveCartLocal(email, cart) {
  if (!email) return { success: false, message: "ไม่พบสมาชิก" };
  cartsByEmail[email] = cart || [];
  return { success: true };
}

export function loginMemberLocal({ email, password }) {
  const match = members.find(m => m.email === email && m.password === password);
  if (!match) return { success: false, message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };
  const { password: _pw, ...member } = match;
  return { success: true, member: { ...member, isAdmin: ADMIN_EMAILS.includes(member.email) } };
}

export function placeOrderLocal(data) {
  if (data.couponCode) {
    const coupon = coupons.find(c => c.code === data.couponCode);
    if (!coupon || !coupon.enabled) return { success: false, message: "ไม่พบคูปองนี้" };
    if (couponIsExpiredLocal_(coupon)) return { success: false, message: "คูปองนี้หมดอายุแล้ว" };
    if (couponIsExhaustedLocal_(coupon)) return { success: false, message: "คูปองนี้ถูกใช้ครบจำนวนแล้ว" };
    const customerEmail = data.memberEmail || data.guestEmail;
    if (coupon.perCustomerLimit > 0 && countCouponUsageByCustomerLocal_(data.couponCode, customerEmail) >= coupon.perCustomerLimit) {
      return { success: false, message: "คุณใช้สิทธิ์คูปองนี้ครบจำนวนแล้ว" };
    }
    coupon.usedCount += 1;
  }

  const pointsRedeemed = Number(data.pointsRedeemed) || 0;
  const pointsEarned = Math.round((Number(data.total) || 0) * 0.01);
  let pointsBalance = null;

  if (data.memberEmail) {
    const member = members.find(m => m.email === data.memberEmail);
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
  orders.push({ orderId, ...data, status: "รอดำเนินการ", createdAt: new Date().toISOString() });
  if (data.memberEmail) {
    console.log(`[local] ส่งอีเมลยืนยันคำสั่งซื้อ ${orderId} ไปที่ ${data.memberEmail}`);
  } else if (data.guestEmail) {
    console.log(`[local] ส่งอีเมลยืนยันคำสั่งซื้อ ${orderId} ไปที่ ${data.guestEmail} (guest)`);
  }
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

export function getMyOrdersLocal(email) {
  return orders.filter(o => o.memberEmail === email).slice().reverse();
}

function isAdminLocal_(email) {
  return ADMIN_EMAILS.includes(email);
}

export function getAdminProductsLocal(adminEmail) {
  if (!isAdminLocal_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  return { success: true, products: products.map(decorateProductStockLocal_) };
}

export function saveProductLocal(product, adminEmail) {
  if (!isAdminLocal_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
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

export function deleteProductLocal(id, adminEmail) {
  if (!isAdminLocal_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  const idx = products.findIndex(p => p.id === id);
  if (idx >= 0) {
    (products[idx].variants || []).forEach(v => { if (v.sku) delete stockBySku[v.sku]; });
    products.splice(idx, 1);
  }
  return { success: true };
}

export function getAdminOrdersLocal(adminEmail) {
  if (!isAdminLocal_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  return { success: true, orders: orders.slice().reverse() };
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

export function updateOrderStatusLocal(orderId, status, adminEmail) {
  if (!isAdminLocal_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  const order = orders.find(o => o.orderId === orderId);
  if (!order) return { success: false, message: "ไม่พบคำสั่งซื้อนี้" };
  order.status = status;
  if (status === "ยกเลิก" && !order.stockRestored) {
    restoreStockLocal_(order.items);
    order.stockRestored = true;
  }
  return { success: true };
}

function hasPurchasedLocal_(email, productId) {
  return orders.some(o => o.memberEmail === email && (o.items || []).some(it => it.productId === productId));
}

export function submitReviewLocal(data) {
  if (!data.memberEmail) return { success: false, message: "กรุณาเข้าสู่ระบบก่อนรีวิวสินค้า" };
  const rating = Number(data.rating);
  if (!rating || rating < 1 || rating > 5) return { success: false, message: "กรุณาให้คะแนน 1-5 ดาว" };

  const verified = hasPurchasedLocal_(data.memberEmail, data.productId);
  const existing = reviews.find(r => r.productId === data.productId && r.memberEmail === data.memberEmail);
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
    memberEmail: data.memberEmail,
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

export function getAdminReviewsLocal(adminEmail) {
  if (!isAdminLocal_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  const productNameMap = {};
  products.forEach(p => { productNameMap[p.id] = p.name; });
  const list = reviews.map(r => ({ ...r, productName: productNameMap[r.productId] || r.productId })).slice().reverse();
  return { success: true, reviews: list };
}

export function deleteReviewLocal(reviewId, adminEmail) {
  if (!isAdminLocal_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  const idx = reviews.findIndex(r => r.reviewId === reviewId);
  if (idx >= 0) reviews.splice(idx, 1);
  return { success: true };
}

let promoPopup = { enabled: false, imageUrl: "", title: "", description: "", buttonText: "", linkType: "none", linkValue: "" };

export function getPromoPopupLocal() {
  return { ...promoPopup };
}

export function savePromoPopupLocal(data, adminEmail) {
  if (!isAdminLocal_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
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

export function saveHeroBannersLocal(slides, adminEmail) {
  if (!isAdminLocal_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  heroBanners = slides || [];
  return { success: true };
}

let installmentSettings = { ...DEFAULT_INSTALLMENT_SETTINGS };

export function getInstallmentSettingsLocal() {
  return installmentSettings;
}

export function saveInstallmentSettingsLocal(settings, adminEmail) {
  if (!isAdminLocal_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
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

export function getAdminDashboardStatsLocal(adminEmail) {
  if (!isAdminLocal_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };

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

export function getAdminCouponsLocal(adminEmail) {
  if (!isAdminLocal_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  return { success: true, coupons: coupons.map(c => ({ ...c })) };
}

export function saveCouponLocal(coupon, adminEmail) {
  if (!isAdminLocal_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
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

export function deleteCouponLocal(code, adminEmail) {
  if (!isAdminLocal_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  const idx = coupons.findIndex(c => c.code === code);
  if (idx >= 0) coupons.splice(idx, 1);
  return { success: true };
}

export function getAdminGiftsLocal(adminEmail) {
  if (!isAdminLocal_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  return { success: true, gifts: withVariantStockLocal_(gifts) };
}

export function saveGiftLocal(gift, adminEmail) {
  if (!isAdminLocal_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
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

export function deleteGiftLocal(id, adminEmail) {
  if (!isAdminLocal_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  const idx = gifts.findIndex(g => g.id === id);
  if (idx >= 0) gifts.splice(idx, 1);
  return { success: true };
}

export function getPromotionsLocal() {
  return promotions.filter(p => p.enabled).map(p => ({ ...p }));
}

export function getAdminPromotionsLocal(adminEmail) {
  if (!isAdminLocal_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  return { success: true, promotions: promotions.map(p => ({ ...p })) };
}

export function savePromotionLocal(promo, adminEmail) {
  if (!isAdminLocal_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
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

export function deletePromotionLocal(id, adminEmail) {
  if (!isAdminLocal_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  const idx = promotions.findIndex(p => p.id === id);
  if (idx >= 0) promotions.splice(idx, 1);
  return { success: true };
}
