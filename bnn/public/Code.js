function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('i7 Store')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

const ADMIN_EMAILS = ["mahalala123@gmail.com"];

function isAdmin_(email) {
  return ADMIN_EMAILS.indexOf(email) !== -1;
}

function getOrCreateSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#FFD700");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function ensureColumn_(sheet, columnName) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const idx = headers.indexOf(columnName);
  if (idx !== -1) return idx + 1;
  const newCol = lastCol + 1;
  sheet.getRange(1, newCol).setValue(columnName);
  return newCol;
}

// หมายเหตุ: เก็บรหัสผ่านแบบข้อความล้วน เหมาะสำหรับ demo เท่านั้น ไม่ควรใช้กับระบบจริง
function registerMember(data) {
  const sheet = getOrCreateSheet_("Members", ["id", "name", "email", "password", "points", "createdAt", "resetCode", "resetExpiry"]);
  const rows = sheet.getDataRange().getValues();
  const exists = rows.slice(1).some(r => r[2] === data.email);
  if (exists) {
    return { success: false, message: "อีเมลนี้ถูกใช้งานแล้ว" };
  }
  const id = "M" + Date.now();
  sheet.appendRow([id, data.name, data.email, data.password, 0, new Date()]);
  return { success: true, member: { id: id, name: data.name, email: data.email, points: 0, isAdmin: isAdmin_(data.email) } };
}

function loginMember(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Members");
  if (!sheet) return { success: false, message: "ไม่พบบัญชีผู้ใช้ กรุณาลงทะเบียนก่อน" };
  const rows = sheet.getDataRange().getValues();
  const match = rows.slice(1).find(r => r[2] === data.email && r[3] === data.password);
  if (!match) return { success: false, message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };
  return { success: true, member: { id: match[0], name: match[1], email: match[2], points: match[4], isAdmin: isAdmin_(match[2]) } };
}

function requestPasswordReset(email) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Members");
  if (!sheet) return { success: false, message: "ไม่พบบัญชีผู้ใช้ที่ใช้อีเมลนี้" };

  const codeCol = ensureColumn_(sheet, "resetCode");
  const expiryCol = ensureColumn_(sheet, "resetExpiry");
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][2] === email) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expiry = new Date(Date.now() + 15 * 60 * 1000);
      sheet.getRange(i + 1, codeCol).setValue(code);
      sheet.getRange(i + 1, expiryCol).setValue(expiry);

      try {
        MailApp.sendEmail(
          email,
          "รหัสยืนยันการตั้งรหัสผ่านใหม่ - i7 Store",
          `รหัสยืนยันของคุณคือ: ${code}\n\nรหัสนี้จะหมดอายุใน 15 นาที หากคุณไม่ได้ทำรายการนี้ กรุณาเพิกเฉยต่ออีเมลฉบับนี้`
        );
      } catch (e) {
        Logger.log("ส่งอีเมลรหัสยืนยันไม่สำเร็จ: " + e);
      }

      return { success: true, message: "ส่งรหัสยืนยันไปที่อีเมลของคุณแล้ว" };
    }
  }

  return { success: false, message: "ไม่พบบัญชีผู้ใช้ที่ใช้อีเมลนี้" };
}

function resetPassword(email, code, newPassword) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Members");
  if (!sheet) return { success: false, message: "ไม่พบบัญชีผู้ใช้ที่ใช้อีเมลนี้" };

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const codeCol = headers.indexOf("resetCode");
  const expiryCol = headers.indexOf("resetExpiry");
  const pwCol = headers.indexOf("password");
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][2] === email) {
      const storedCode = codeCol !== -1 ? String(data[i][codeCol] || "") : "";
      const expiry = expiryCol !== -1 ? data[i][expiryCol] : null;

      if (!storedCode || storedCode !== String(code)) {
        return { success: false, message: "รหัสยืนยันไม่ถูกต้อง" };
      }
      if (!expiry || new Date(expiry).getTime() < Date.now()) {
        return { success: false, message: "รหัสยืนยันหมดอายุแล้ว กรุณาขอรหัสใหม่" };
      }

      sheet.getRange(i + 1, pwCol + 1).setValue(newPassword);
      sheet.getRange(i + 1, codeCol + 1).setValue("");
      sheet.getRange(i + 1, expiryCol + 1).setValue("");
      return { success: true };
    }
  }

  return { success: false, message: "ไม่พบบัญชีผู้ใช้ที่ใช้อีเมลนี้" };
}

function updateMemberPoints_(email, pointsRedeemed, pointsEarned) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Members");
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][2] === email) {
      const currentPoints = Number(data[i][4]) || 0;
      if (pointsRedeemed > currentPoints) return { error: "แต้มสะสมไม่เพียงพอ" };
      const newPoints = currentPoints - pointsRedeemed + pointsEarned;
      sheet.getRange(i + 1, 5).setValue(newPoints);
      return { points: newPoints };
    }
  }
  return null;
}

function getCart(email) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Members");
  if (!sheet || !email) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const emailCol = headers.indexOf("email");
  const cartCol = headers.indexOf("cartJson");
  if (emailCol === -1 || cartCol === -1) return [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][emailCol] === email) {
      try {
        return data[i][cartCol] ? JSON.parse(data[i][cartCol]) : [];
      } catch (e) {
        return [];
      }
    }
  }
  return [];
}

function saveCart(email, cart) {
  if (!email) return { success: false, message: "ไม่พบสมาชิก" };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Members");
  if (!sheet) return { success: false, message: "ไม่พบสมาชิก" };
  const cartCol = ensureColumn_(sheet, "cartJson");
  const data = sheet.getDataRange().getValues();
  const emailCol = data[0].indexOf("email");
  for (let i = 1; i < data.length; i++) {
    if (data[i][emailCol] === email) {
      sheet.getRange(i + 1, cartCol).setValue(JSON.stringify(cart || []));
      return { success: true };
    }
  }
  return { success: false, message: "ไม่พบสมาชิก" };
}

function adjustStock_(items, sign) {
  const sheet = getOrCreateSheet_("Stock", ["sku", "qty"]);
  const DEFAULT_STOCK = 20;
  const data = sheet.getDataRange().getValues();
  const rowBySku = {};
  for (let i = 1; i < data.length; i++) rowBySku[data[i][0]] = i + 1;

  (items || []).forEach(item => {
    if (!item.sku) return;
    const rowNum = rowBySku[item.sku];
    if (rowNum) {
      const currentQty = Number(sheet.getRange(rowNum, 2).getValue());
      sheet.getRange(rowNum, 2).setValue(Math.max(0, currentQty + sign * item.qty));
    } else if (sign < 0) {
      sheet.appendRow([item.sku, Math.max(0, DEFAULT_STOCK - item.qty)]);
    } else {
      sheet.appendRow([item.sku, DEFAULT_STOCK + item.qty]);
    }
  });
}

function decrementStock_(items) {
  adjustStock_(items, -1);
}

function incrementStock_(items) {
  adjustStock_(items, 1);
}

const GIFT_HEADERS_ = ["id", "name", "sku", "type", "image"];

function getAllGifts_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Gifts");
  if (!sheet || sheet.getLastRow() < 2) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return {
      id: obj.id,
      name: obj.name || "",
      sku: obj.sku || "",
      type: obj.type === "store" ? "store" : "brand",
      image: obj.image || null
    };
  });
}

function getAdminGifts(adminEmail) {
  if (!isAdmin_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  const stockMap = getStockMap_();
  return { success: true, gifts: withVariantStock_(getAllGifts_(), stockMap) };
}

function saveGift(gift, adminEmail) {
  if (!isAdmin_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };

  const sheet = getOrCreateSheet_("Gifts", GIFT_HEADERS_);
  const id = gift.id || ("gift" + Date.now());
  const data = sheet.getDataRange().getValues();
  let rowNum = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) { rowNum = i + 1; break; }
  }
  if (rowNum === -1) rowNum = sheet.getLastRow() + 1;

  const row = [id, gift.name || "", gift.sku || "", gift.type === "store" ? "store" : "brand", gift.image || ""];
  sheet.getRange(rowNum, 1, 1, GIFT_HEADERS_.length).setValues([row]);

  if (gift.sku && gift.stockQty !== undefined && gift.stockQty !== null && gift.stockQty !== "") {
    upsertStockRow_(gift.sku, Math.max(0, Number(gift.stockQty) || 0));
  }

  return { success: true, id: id };
}

function deleteGift(id, adminEmail) {
  if (!isAdmin_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Gifts");
  if (!sheet) return { success: false, message: "ไม่พบของแถมนี้" };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false, message: "ไม่พบของแถมนี้" };
}

const PROMOTION_HEADERS_ = ["id", "label", "discountType", "value", "groupsJson", "minQtyEach", "enabled"];

function getAllPromotions_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Promotions");
  if (!sheet || sheet.getLastRow() < 2) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    let groups = [];
    try {
      groups = obj.groupsJson ? JSON.parse(obj.groupsJson) : [];
    } catch (e) {
      groups = [];
    }
    return {
      id: obj.id,
      label: obj.label || "",
      discountType: obj.discountType === "percent" ? "percent" : "fixed",
      value: Number(obj.value) || 0,
      groups: groups,
      minQtyEach: Number(obj.minQtyEach) || 1,
      enabled: obj.enabled === true || obj.enabled === 'TRUE'
    };
  });
}

function getPromotions() {
  return getAllPromotions_().filter(p => p.enabled);
}

function getAdminPromotions(adminEmail) {
  if (!isAdmin_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  return { success: true, promotions: getAllPromotions_() };
}

function savePromotion(promo, adminEmail) {
  if (!isAdmin_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };

  const sheet = getOrCreateSheet_("Promotions", PROMOTION_HEADERS_);
  const id = promo.id || ("promo" + Date.now());
  const data = sheet.getDataRange().getValues();
  let rowNum = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) { rowNum = i + 1; break; }
  }
  if (rowNum === -1) rowNum = sheet.getLastRow() + 1;

  const groups = (promo.groups || []).map(g => ({
    type: g.type === "category" ? "category" : "product",
    ids: g.ids || []
  })).filter(g => g.ids.length > 0);

  const row = [
    id,
    promo.label || "",
    promo.discountType === "percent" ? "percent" : "fixed",
    Number(promo.value) || 0,
    JSON.stringify(groups),
    Number(promo.minQtyEach) || 1,
    promo.enabled !== false
  ];
  sheet.getRange(rowNum, 1, 1, PROMOTION_HEADERS_.length).setValues([row]);

  return { success: true, id: id };
}

function deletePromotion(id, adminEmail) {
  if (!isAdmin_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Promotions");
  if (!sheet) return { success: false, message: "ไม่พบโปรโมชั่นนี้" };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false, message: "ไม่พบโปรโมชั่นนี้" };
}

function resolveGiftStockItems_(items) {
  const productsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Products");
  if (!productsSheet) return [];

  const data = productsSheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf("id");
  const giftIdsCol = headers.indexOf("giftIds");
  if (idCol === -1 || giftIdsCol === -1) return [];

  const giftIdsByProductId = {};
  data.slice(1).forEach(row => {
    giftIdsByProductId[row[idCol]] = row[giftIdsCol] ? String(row[giftIdsCol]).split(",").filter(Boolean) : [];
  });

  const giftById = {};
  getAllGifts_().forEach(g => { giftById[g.id] = g; });

  const result = [];
  (items || []).forEach(item => {
    (giftIdsByProductId[item.productId] || []).forEach(gid => {
      const gift = giftById[gid];
      if (gift && gift.sku) result.push({ sku: gift.sku, qty: item.qty });
    });
  });
  return result;
}

function decrementGiftStock_(items) {
  const giftItems = resolveGiftStockItems_(items);
  if (giftItems.length) decrementStock_(giftItems);
}

function incrementGiftStock_(items) {
  const giftItems = resolveGiftStockItems_(items);
  if (giftItems.length) incrementStock_(giftItems);
}

function countCouponUsageByCustomer_(code, email) {
  if (!email) return 0;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Orders");
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const couponCol = headers.indexOf("couponCode");
  const memberCol = headers.indexOf("memberEmail");
  const guestCol = headers.indexOf("guestEmail");
  if (couponCol === -1) return 0;

  let count = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i][couponCol] !== code) continue;
    const rowEmail = (memberCol !== -1 && data[i][memberCol]) || (guestCol !== -1 && data[i][guestCol]) || "";
    if (rowEmail && rowEmail === email) count++;
  }
  return count;
}

function validateAndRedeemCoupon_(code, customerEmail) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Coupons");
  if (!sheet) return { valid: false, message: "ไม่พบคูปองนี้" };

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const codeCol = headers.indexOf("code");
  const enabledCol = headers.indexOf("enabled");
  const expiryCol = headers.indexOf("expiryDate");
  const usageLimitCol = headers.indexOf("usageLimit");
  const usedCountCol = headers.indexOf("usedCount");
  const perCustomerLimitCol = headers.indexOf("perCustomerLimit");

  for (let i = 1; i < data.length; i++) {
    if (data[i][codeCol] !== code) continue;

    const enabled = data[i][enabledCol] === true || data[i][enabledCol] === 'TRUE';
    if (!enabled) return { valid: false, message: "คูปองนี้ถูกปิดใช้งานแล้ว" };

    const expiry = data[i][expiryCol];
    if (expiry && new Date(expiry).getTime() < Date.now()) {
      return { valid: false, message: "คูปองนี้หมดอายุแล้ว" };
    }

    const usageLimit = Number(data[i][usageLimitCol]) || 0;
    const usedCount = Number(data[i][usedCountCol]) || 0;
    if (usageLimit > 0 && usedCount >= usageLimit) {
      return { valid: false, message: "คูปองนี้ถูกใช้ครบจำนวนแล้ว" };
    }

    const perCustomerLimit = perCustomerLimitCol !== -1 ? (Number(data[i][perCustomerLimitCol]) || 0) : 0;
    if (perCustomerLimit > 0 && countCouponUsageByCustomer_(code, customerEmail) >= perCustomerLimit) {
      return { valid: false, message: "คุณใช้สิทธิ์คูปองนี้ครบจำนวนแล้ว" };
    }

    sheet.getRange(i + 1, usedCountCol + 1).setValue(usedCount + 1);
    return { valid: true };
  }

  return { valid: false, message: "ไม่พบคูปองนี้" };
}

function placeOrder(data) {
  if (data.couponCode) {
    const couponCheck = validateAndRedeemCoupon_(data.couponCode, data.memberEmail || data.guestEmail);
    if (!couponCheck.valid) return { success: false, message: couponCheck.message };
  }

  const pointsRedeemed = Number(data.pointsRedeemed) || 0;
  const pointsEarned = Math.round((Number(data.total) || 0) * 0.01);
  let pointsBalance = null;

  if (data.memberEmail) {
    const result = updateMemberPoints_(data.memberEmail, pointsRedeemed, pointsEarned);
    if (result && result.error) {
      return { success: false, message: result.error };
    }
    if (result) pointsBalance = result.points;
  }

  const orderHeaderList = [
    "orderId", "customerName", "phone", "address", "province", "paymentMethod",
    "items", "subtotal", "discount", "pointsRedeemed", "total", "couponCode", "promotionIds", "status", "createdAt", "memberEmail", "guestEmail"
  ];
  const sheet = getOrCreateSheet_("Orders", orderHeaderList);
  const orderColIndex = {};
  orderHeaderList.forEach(h => { orderColIndex[h] = ensureColumn_(sheet, h); });

  const orderId = "ORD" + Date.now();
  const orderRowNum = sheet.getLastRow() + 1;
  const orderFields = {
    orderId, customerName: data.customerName, phone: data.phone, address: data.address, province: data.province,
    paymentMethod: data.paymentMethod, items: JSON.stringify(data.items), subtotal: data.subtotal,
    discount: data.discount || 0, pointsRedeemed: pointsRedeemed, total: data.total, couponCode: data.couponCode || "",
    promotionIds: (data.promotionIds || []).join(","),
    status: "รอดำเนินการ", createdAt: new Date(), memberEmail: data.memberEmail || "", guestEmail: data.guestEmail || ""
  };
  orderHeaderList.forEach(h => {
    sheet.getRange(orderRowNum, orderColIndex[h]).setValue(orderFields[h]);
  });

  decrementStock_(data.items);
  decrementGiftStock_(data.items);
  logOrderItems_(orderId, data.items, orderFields.createdAt);
  notifyNewOrder_(orderId, data);
  notifyCustomer_(orderId, data);

  return { success: true, orderId: orderId, pointsBalance: pointsBalance };
}

const ORDER_ITEMS_HEADERS_ = ["orderId", "productId", "sku", "name", "color", "variant", "qty", "price", "lineTotal", "createdAt"];

function logOrderItems_(orderId, items, createdAt) {
  const sheet = getOrCreateSheet_("OrderItems", ORDER_ITEMS_HEADERS_);
  const rows = (items || []).map(item => [
    orderId,
    item.productId || "",
    item.sku || "",
    item.name || "",
    item.color || "",
    item.variant || "",
    Number(item.qty) || 0,
    Number(item.price) || 0,
    (Number(item.price) || 0) * (Number(item.qty) || 0),
    createdAt
  ]);
  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, ORDER_ITEMS_HEADERS_.length).setValues(rows);
  }
}

function notifyCustomer_(orderId, data) {
  const targetEmail = data.memberEmail || data.guestEmail;
  if (!targetEmail) return;
  try {
    const itemLines = (data.items || [])
      .map(item => `- ${item.name} (${item.color}, ${item.variant}) x${item.qty} = ฿${(item.price * item.qty).toLocaleString("th-TH")}`)
      .join("\n");
    const body =
      `ขอบคุณที่สั่งซื้อกับ i7 Store!\n\n` +
      `เลขที่คำสั่งซื้อ: ${orderId}\n\n` +
      `รายการสินค้า:\n${itemLines}\n\n` +
      `ยอดชำระทั้งหมด: ฿${Number(data.total).toLocaleString("th-TH")}\n` +
      `วิธีชำระเงิน: ${data.paymentMethod === "cod" ? "เก็บเงินปลายทาง" : "โอนเงินผ่านธนาคาร"}\n` +
      `จัดส่งไปที่: ${data.address}, ${data.province}\n\n` +
      `ทีมงานจะดำเนินการจัดส่งโดยเร็วที่สุด ขอบคุณที่ไว้วางใจ i7 Store ครับ`;
    MailApp.sendEmail(targetEmail, `ยืนยันคำสั่งซื้อ ${orderId} - i7 Store`, body);
  } catch (e) {
    Logger.log("ส่งอีเมลยืนยันคำสั่งซื้อให้ลูกค้าไม่สำเร็จ: " + e);
  }
}

function notifyNewOrder_(orderId, data) {
  try {
    const itemLines = (data.items || [])
      .map(item => `- ${item.name} (${item.color}, ${item.variant}) x${item.qty} = ฿${(item.price * item.qty).toLocaleString("th-TH")}`)
      .join("\n");
    const body =
      `มีคำสั่งซื้อใหม่เข้ามา!\n\n` +
      `เลขที่ออเดอร์: ${orderId}\n` +
      `ลูกค้า: ${data.customerName} (${data.phone})\n` +
      `ที่อยู่: ${data.address}, ${data.province}\n` +
      `ชำระเงิน: ${data.paymentMethod === "cod" ? "เก็บเงินปลายทาง" : "โอนเงินผ่านธนาคาร"}\n\n` +
      `รายการสินค้า:\n${itemLines}\n\n` +
      `ยอดรวม: ฿${Number(data.total).toLocaleString("th-TH")}`;
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), `คำสั่งซื้อใหม่ ${orderId}`, body);
  } catch (e) {
    Logger.log("ส่งอีเมลแจ้งเตือนไม่สำเร็จ: " + e);
  }
}

function getMyOrders(email) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Orders");
  if (!sheet || !email) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const emailCol = headers.indexOf("memberEmail");
  const rows = data.slice(1).filter(r => emailCol >= 0 && r[emailCol] === email);
  return rows.map(row => {
    let obj = {};
    headers.forEach((header, index) => { obj[header] = row[index]; });
    return {
      orderId: obj.orderId,
      items: obj.items ? JSON.parse(obj.items) : [],
      subtotal: obj.subtotal,
      discount: obj.discount,
      total: obj.total,
      status: obj.status,
      createdAt: obj.createdAt instanceof Date ? obj.createdAt.toISOString() : obj.createdAt
    };
  }).reverse();
}

function getStockMap_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Stock");
  const map = {};
  if (!sheet) return map;
  const rows = sheet.getDataRange().getValues().slice(1);
  rows.forEach(r => { map[r[0]] = Number(r[1]); });
  return map;
}

function withVariantStock_(variants, stockMap) {
  return (variants || []).map(v => ({
    ...v,
    stockQty: stockMap[v.sku] !== undefined ? stockMap[v.sku] : null,
    inStock: stockMap[v.sku] !== undefined ? stockMap[v.sku] > 0 : true
  }));
}

function getReviewStatsMap_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Reviews");
  const map = {};
  if (!sheet) return map;
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const pCol = headers.indexOf("productId");
  const rCol = headers.indexOf("rating");
  data.slice(1).forEach(row => {
    const pid = row[pCol];
    if (!map[pid]) map[pid] = { sum: 0, count: 0 };
    map[pid].sum += Number(row[rCol]) || 0;
    map[pid].count += 1;
  });
  const result = {};
  Object.keys(map).forEach(pid => {
    result[pid] = { avg: map[pid].sum / map[pid].count, count: map[pid].count };
  });
  return result;
}

function hasPurchased_(email, productId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Orders");
  if (!sheet || !email) return false;
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const emailCol = headers.indexOf("memberEmail");
  const itemsCol = headers.indexOf("items");
  for (let i = 1; i < data.length; i++) {
    if (data[i][emailCol] !== email) continue;
    try {
      const items = JSON.parse(data[i][itemsCol] || "[]");
      if (items.some(it => it.productId === productId)) return true;
    } catch (e) {
      // ข้อมูล items เสีย ข้ามแถวนี้
    }
  }
  return false;
}

function submitReview(data) {
  if (!data.memberEmail) return { success: false, message: "กรุณาเข้าสู่ระบบก่อนรีวิวสินค้า" };
  const rating = Number(data.rating);
  if (!rating || rating < 1 || rating > 5) return { success: false, message: "กรุณาให้คะแนน 1-5 ดาว" };

  const sheet = getOrCreateSheet_("Reviews", ["reviewId", "productId", "memberEmail", "memberName", "rating", "comment", "verifiedPurchase", "createdAt"]);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const pCol = headers.indexOf("productId");
  const eCol = headers.indexOf("memberEmail");
  const verified = hasPurchased_(data.memberEmail, data.productId);

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][pCol] === data.productId && rows[i][eCol] === data.memberEmail) {
      const rowNum = i + 1;
      sheet.getRange(rowNum, headers.indexOf("rating") + 1).setValue(rating);
      sheet.getRange(rowNum, headers.indexOf("comment") + 1).setValue(data.comment || "");
      sheet.getRange(rowNum, headers.indexOf("verifiedPurchase") + 1).setValue(verified);
      sheet.getRange(rowNum, headers.indexOf("createdAt") + 1).setValue(new Date());
      return { success: true };
    }
  }

  const reviewId = "RV" + Date.now();
  sheet.appendRow([reviewId, data.productId, data.memberEmail, data.memberName || "", rating, data.comment || "", verified, new Date()]);
  return { success: true };
}

function getProductReviews(productId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Reviews");
  if (!sheet) return { success: true, reviews: [], avg: 0, count: 0 };

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const reviews = data.slice(1)
    .map(row => {
      let obj = {};
      headers.forEach((h, idx) => { obj[h] = row[idx]; });
      return obj;
    })
    .filter(r => r.productId === productId)
    .map(r => ({
      reviewId: r.reviewId,
      memberName: r.memberName,
      rating: Number(r.rating),
      comment: r.comment,
      verifiedPurchase: r.verifiedPurchase === true || r.verifiedPurchase === 'TRUE',
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt
    }))
    .reverse();

  const count = reviews.length;
  const avg = count ? reviews.reduce((s, r) => s + r.rating, 0) / count : 0;
  return { success: true, reviews: reviews, avg: avg, count: count };
}

function getAdminReviews(adminEmail) {
  if (!isAdmin_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Reviews");
  if (!sheet) return { success: true, reviews: [] };

  const productsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Products");
  const productNameMap = {};
  if (productsSheet) {
    const pData = productsSheet.getDataRange().getValues();
    const pHeaders = pData[0];
    const idIdx = pHeaders.indexOf("id");
    const nameIdx = pHeaders.indexOf("name");
    pData.slice(1).forEach(row => { productNameMap[row[idIdx]] = row[nameIdx]; });
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const reviews = data.slice(1).map(row => {
    let obj = {};
    headers.forEach((h, idx) => { obj[h] = row[idx]; });
    return {
      reviewId: obj.reviewId,
      productId: obj.productId,
      productName: productNameMap[obj.productId] || obj.productId,
      memberName: obj.memberName,
      memberEmail: obj.memberEmail,
      rating: Number(obj.rating),
      comment: obj.comment,
      verifiedPurchase: obj.verifiedPurchase === true || obj.verifiedPurchase === 'TRUE',
      createdAt: obj.createdAt instanceof Date ? obj.createdAt.toISOString() : obj.createdAt
    };
  }).reverse();

  return { success: true, reviews: reviews };
}

function deleteReview(reviewId, adminEmail) {
  if (!isAdmin_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Reviews");
  if (!sheet) return { success: false, message: "ไม่พบข้อมูลรีวิว" };

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf("reviewId");
  for (let i = 1; i < data.length; i++) {
    if (data[i][idCol] === reviewId) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false, message: "ไม่พบรีวิวนี้" };
}

function getProductsData() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Products");
  if (!sheet) return JSON.stringify([]);

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);
  const stockMap = getStockMap_();
  const reviewStats = getReviewStatsMap_();
  const giftsById = {};
  getAllGifts_().forEach(g => { giftsById[g.id] = g; });

  const products = rows.map(row => {
    let obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });

    const storedColors = obj.colors ? obj.colors.split(',') : [];
    const rawVariants = (obj.variants ? JSON.parse(obj.variants) : []).map(v => ({
      ...v,
      color: v.color || storedColors[0] || null
    }));
    const variants = withVariantStock_(rawVariants, stockMap);
    const definedStock = variants.map(v => v.stockQty).filter(q => q !== null);
    const giftIds = obj.giftIds ? String(obj.giftIds).split(',').filter(Boolean) : [];
    const freeGiftItems = withVariantStock_(giftIds.map(gid => giftsById[gid]).filter(Boolean), stockMap);

    return {
      id: obj.id,
      brand: obj.brand,
      category: obj.category,
      name: obj.name,
      nameEn: obj.nameEn,
      sku: obj.sku,
      badge: obj.badge ? obj.badge : null,
      preOrder: obj.preOrder === true || obj.preOrder === 'TRUE',
      tags: obj.tags ? obj.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      images: obj.images ? obj.images.split(',') : [],
      imagesByColor: obj.imagesByColor ? JSON.parse(obj.imagesByColor) : {},
      priceMin: Number(obj.priceMin),
      priceMax: Number(obj.priceMax),
      priceDisplay: Number(obj.priceDisplay),
      originalPrice: obj.originalPrice ? Number(obj.originalPrice) : null,
      specList: obj.specList ? JSON.parse(obj.specList) : [],
      colors: storedColors,
      colorHex: obj.colorHex ? JSON.parse(obj.colorHex) : {},
      variants: variants,
      inStock: variants.length ? variants.some(v => v.inStock) : (obj.inStock === true || obj.inStock === 'TRUE'),
      stockQty: definedStock.length ? definedStock.reduce((s, q) => s + q, 0) : null,
      pointsRate: obj.pointsRate ? Number(obj.pointsRate) : 0.01,
      freeGiftItems: freeGiftItems,
      promotions: obj.promotions ? obj.promotions.split('|') : [],
      description: obj.description,
      ratingAvg: reviewStats[obj.id] ? reviewStats[obj.id].avg : 0,
      ratingCount: reviewStats[obj.id] ? reviewStats[obj.id].count : 0
    };
  });

  return JSON.stringify(products);
}

function productToFieldMap_(p) {
  return {
    id: p.id,
    brand: p.brand || "",
    category: p.category || "",
    name: p.name || "",
    nameEn: p.nameEn || "",
    sku: p.sku || "",
    badge: p.badge || "",
    preOrder: !!p.preOrder,
    tags: (p.tags || []).join(","),
    priceMin: Number(p.priceMin) || 0,
    priceMax: Number(p.priceMax) || 0,
    priceDisplay: Number(p.priceDisplay) || 0,
    originalPrice: p.originalPrice ? Number(p.originalPrice) : 0,
    images: (p.images || []).join(","),
    imagesByColor: JSON.stringify(p.imagesByColor || {}),
    specList: JSON.stringify(p.specList || []),
    colors: (p.colors || []).join(","),
    colorHex: JSON.stringify(p.colorHex || {}),
    variants: JSON.stringify(p.variants || []),
    inStock: true,
    pointsRate: Number(p.pointsRate) || 0.01,
    giftIds: (p.giftIds || []).join(","),
    promotions: (p.promotions || []).join("|"),
    description: p.description || ""
  };
}

function getAdminProducts(adminEmail) {
  if (!isAdmin_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  return { success: true, products: JSON.parse(getProductsData()) };
}

function saveProduct(product, adminEmail) {
  if (!isAdmin_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };

  const headerList = [
    "id", "brand", "category", "name", "nameEn", "sku", "badge", "preOrder", "tags",
    "priceMin", "priceMax", "priceDisplay", "originalPrice", "images", "imagesByColor", "specList",
    "colors", "colorHex", "variants", "inStock", "pointsRate", "giftIds",
    "promotions", "description"
  ];
  const sheet = getOrCreateSheet_("Products", headerList);
  const colIndex = {};
  headerList.forEach(h => { colIndex[h] = ensureColumn_(sheet, h); });

  const id = product.id || ("p" + Date.now());
  const fields = productToFieldMap_({ ...product, id: id });

  const data = sheet.getDataRange().getValues();
  const idCol = colIndex.id - 1;
  let rowNum = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][idCol] === id) { rowNum = i + 1; break; }
  }
  if (rowNum === -1) rowNum = sheet.getLastRow() + 1;

  headerList.forEach(h => {
    sheet.getRange(rowNum, colIndex[h]).setValue(fields[h]);
  });

  (product.variants || []).forEach(v => {
    if (v.sku && v.stockQty !== undefined && v.stockQty !== null && v.stockQty !== "") {
      upsertStockRow_(v.sku, Math.max(0, Number(v.stockQty) || 0));
    }
  });

  return { success: true, id: id };
}

function upsertStockRow_(sku, qty) {
  const stockSheet = getOrCreateSheet_("Stock", ["sku", "qty"]);
  const stockData = stockSheet.getDataRange().getValues();
  let stockRow = -1;
  for (let i = 1; i < stockData.length; i++) {
    if (stockData[i][0] === sku) { stockRow = i + 1; break; }
  }
  if (stockRow > 0) {
    stockSheet.getRange(stockRow, 2).setValue(qty);
  } else {
    stockSheet.appendRow([sku, qty]);
  }
}

function getOrCreateImageFolder_() {
  const name = "i7 Store Product Images";
  const folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

function ensureLinkViewable_(file) {
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return true;
  } catch (e) {
    const acc = file.getSharingAccess();
    return (acc === DriveApp.Access.ANYONE_WITH_LINK || acc === DriveApp.Access.ANYONE) &&
      file.getSharingPermission() !== DriveApp.Permission.NONE;
  }
}

function uploadProductImage(base64Data, filename, mimeType, adminEmail) {
  if (!isAdmin_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };

  try {
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, filename);
    const folder = getOrCreateImageFolder_();
    const file = folder.createFile(blob);
    ensureLinkViewable_(file);
    return { success: true, url: "https://lh3.googleusercontent.com/d/" + file.getId() };
  } catch (e) {
    return { success: false, message: "อัปโหลดรูปไม่สำเร็จ: " + e };
  }
}

function deleteProduct(id, adminEmail) {
  if (!isAdmin_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Products");
  let skus = [];
  if (sheet) {
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const variantsCol = headers.indexOf("variants");
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === id) {
        if (variantsCol !== -1 && data[i][variantsCol]) {
          try {
            skus = JSON.parse(data[i][variantsCol]).map(v => v.sku).filter(Boolean);
          } catch (e) {
            // ข้อมูล variants เสีย ข้ามการลบสต๊อกไป
          }
        }
        sheet.deleteRow(i + 1);
        break;
      }
    }
  }

  const stockSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Stock");
  if (stockSheet && skus.length) {
    const stockData = stockSheet.getDataRange().getValues();
    for (let i = stockData.length - 1; i >= 1; i--) {
      if (skus.indexOf(stockData[i][0]) !== -1) stockSheet.deleteRow(i + 1);
    }
  }

  return { success: true };
}

function getAdminOrders(adminEmail) {
  if (!isAdmin_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Orders");
  if (!sheet) return { success: true, orders: [] };

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const orders = data.slice(1).map(row => {
    let obj = {};
    headers.forEach((header, index) => { obj[header] = row[index]; });
    return {
      orderId: obj.orderId,
      customerName: obj.customerName,
      phone: obj.phone,
      address: obj.address,
      province: obj.province,
      paymentMethod: obj.paymentMethod,
      items: obj.items ? JSON.parse(obj.items) : [],
      subtotal: obj.subtotal,
      discount: obj.discount,
      pointsRedeemed: obj.pointsRedeemed,
      total: obj.total,
      couponCode: obj.couponCode,
      promotionIds: obj.promotionIds ? String(obj.promotionIds).split(",").filter(Boolean) : [],
      status: obj.status,
      createdAt: obj.createdAt instanceof Date ? obj.createdAt.toISOString() : obj.createdAt,
      memberEmail: obj.memberEmail,
      guestEmail: obj.guestEmail
    };
  }).reverse();

  return { success: true, orders: orders };
}

function updateOrderStatus(orderId, status, adminEmail) {
  if (!isAdmin_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Orders");
  if (!sheet) return { success: false, message: "ไม่พบข้อมูลคำสั่งซื้อ" };

  const stockRestoredCol = ensureColumn_(sheet, "stockRestored");
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const statusCol = headers.indexOf("status") + 1;
  const itemsCol = headers.indexOf("items");
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === orderId) {
      const rowNum = i + 1;
      sheet.getRange(rowNum, statusCol).setValue(status);

      const alreadyRestored = data[i][stockRestoredCol - 1] === true || data[i][stockRestoredCol - 1] === 'TRUE';
      if (status === "ยกเลิก" && !alreadyRestored) {
        let items = [];
        try {
          items = itemsCol !== -1 && data[i][itemsCol] ? JSON.parse(data[i][itemsCol]) : [];
        } catch (e) {
          items = [];
        }
        if (items.length) {
          incrementStock_(items);
          incrementGiftStock_(items);
        }
        sheet.getRange(rowNum, stockRestoredCol).setValue(true);
      }
      return { success: true };
    }
  }
  return { success: false, message: "ไม่พบคำสั่งซื้อนี้" };
}

function getAdminDashboardStats(adminEmail) {
  if (!isAdmin_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };

  const result = getAdminOrders(adminEmail);
  if (!result.success) return result;
  const orders = result.orders;

  const CANCELLED = "ยกเลิก";
  let totalRevenue = 0;
  const statusBreakdown = {};
  const productTally = {};
  const dayTally = {};

  orders.forEach(order => {
    statusBreakdown[order.status] = (statusBreakdown[order.status] || 0) + 1;
    if (order.status === CANCELLED) return;

    totalRevenue += Number(order.total) || 0;

    const dateKey = Utilities.formatDate(new Date(order.createdAt), "Asia/Bangkok", "yyyy-MM-dd");
    if (!dayTally[dateKey]) dayTally[dateKey] = { revenue: 0, orders: 0 };
    dayTally[dateKey].revenue += Number(order.total) || 0;
    dayTally[dateKey].orders += 1;

    (order.items || []).forEach(item => {
      const key = item.name || "ไม่ทราบชื่อสินค้า";
      if (!productTally[key]) productTally[key] = { name: key, qty: 0, revenue: 0 };
      productTally[key].qty += Number(item.qty) || 0;
      productTally[key].revenue += (Number(item.price) || 0) * (Number(item.qty) || 0);
    });
  });

  const topProducts = Object.values(productTally)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const dailyRevenue = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = Utilities.formatDate(d, "Asia/Bangkok", "yyyy-MM-dd");
    const entry = dayTally[key];
    dailyRevenue.push({ date: key, revenue: entry ? entry.revenue : 0, orders: entry ? entry.orders : 0 });
  }

  return {
    success: true,
    totalRevenue: totalRevenue,
    totalOrders: orders.length,
    statusBreakdown: statusBreakdown,
    topProducts: topProducts,
    dailyRevenue: dailyRevenue
  };
}

function getPromoPopup() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("PromoPopup");
  if (!sheet || sheet.getLastRow() < 2) {
    return { enabled: false, imageUrl: "", title: "", description: "", buttonText: "", linkType: "none", linkValue: "" };
  }
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0];
  const obj = {};
  headers.forEach((h, i) => { obj[h] = row[i]; });
  return {
    enabled: obj.enabled === true || obj.enabled === 'TRUE',
    imageUrl: obj.imageUrl || "",
    title: obj.title || "",
    description: obj.description || "",
    buttonText: obj.buttonText || "",
    linkType: obj.linkType || "none",
    linkValue: obj.linkValue || ""
  };
}

function savePromoPopup(data, adminEmail) {
  if (!isAdmin_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };

  const headerList = ["enabled", "imageUrl", "title", "description", "buttonText", "linkType", "linkValue", "updatedAt"];
  const sheet = getOrCreateSheet_("PromoPopup", headerList);
  const fields = {
    enabled: !!data.enabled,
    imageUrl: data.imageUrl || "",
    title: data.title || "",
    description: data.description || "",
    buttonText: data.buttonText || "",
    linkType: data.linkType || "none",
    linkValue: data.linkValue || "",
    updatedAt: new Date()
  };

  headerList.forEach((h, i) => {
    sheet.getRange(2, i + 1).setValue(fields[h]);
  });

  return { success: true };
}

const DEFAULT_INSTALLMENT_SETTINGS_ = {
  enabled: true,
  banks: [
    { name: "KBANK", months: [6, 10] },
    { name: "KTC", months: [6, 10] },
    { name: "SCB", months: [6, 10] },
    { name: "BBL", months: [6, 10] }
  ]
};

function getInstallmentSettings() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("InstallmentSettings");
  if (!sheet || sheet.getLastRow() < 2) return DEFAULT_INSTALLMENT_SETTINGS_;
  const json = sheet.getRange(2, 1).getValue();
  try {
    return json ? JSON.parse(json) : DEFAULT_INSTALLMENT_SETTINGS_;
  } catch (e) {
    return DEFAULT_INSTALLMENT_SETTINGS_;
  }
}

function saveInstallmentSettings(settings, adminEmail) {
  if (!isAdmin_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  const sheet = getOrCreateSheet_("InstallmentSettings", ["settingsJson", "updatedAt"]);
  const data = {
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
  sheet.getRange(2, 1).setValue(JSON.stringify(data));
  sheet.getRange(2, 2).setValue(new Date());
  return { success: true };
}

function getHeroBanners() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("HeroBanners");
  if (!sheet || sheet.getLastRow() < 2) return [];
  const json = sheet.getRange(2, 1).getValue();
  try {
    return json ? JSON.parse(json) : [];
  } catch (e) {
    return [];
  }
}

function saveHeroBanners(slides, adminEmail) {
  if (!isAdmin_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  const sheet = getOrCreateSheet_("HeroBanners", ["slidesJson", "updatedAt"]);
  sheet.getRange(2, 1).setValue(JSON.stringify(slides || []));
  sheet.getRange(2, 2).setValue(new Date());
  return { success: true };
}

const COUPON_HEADERS_ = ["code", "label", "description", "discountType", "value", "minSpend", "maxDiscount", "expiryDate", "usageLimit", "usedCount", "enabled", "perCustomerLimit"];

function couponRowToObj_(headers, row) {
  const obj = {};
  headers.forEach((h, i) => { obj[h] = row[i]; });
  return {
    code: obj.code,
    label: obj.label || "",
    description: obj.description || "",
    discountType: obj.discountType === "percent" ? "percent" : "fixed",
    value: Number(obj.value) || 0,
    minSpend: Number(obj.minSpend) || 0,
    maxDiscount: obj.maxDiscount ? Number(obj.maxDiscount) : null,
    expiryDate: obj.expiryDate instanceof Date ? obj.expiryDate.toISOString() : (obj.expiryDate || ""),
    usageLimit: Number(obj.usageLimit) || 0,
    usedCount: Number(obj.usedCount) || 0,
    enabled: obj.enabled === true || obj.enabled === 'TRUE',
    perCustomerLimit: Number(obj.perCustomerLimit) || 0
  };
}

function getCoupons() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Coupons");
  if (!sheet || sheet.getLastRow() < 2) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  return data.slice(1)
    .map(row => couponRowToObj_(headers, row))
    .filter(c => c.enabled)
    .map(c => ({ ...c, expired: !!c.expiryDate && new Date(c.expiryDate).getTime() < Date.now() }));
}

function getAdminCoupons(adminEmail) {
  if (!isAdmin_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Coupons");
  if (!sheet || sheet.getLastRow() < 2) return { success: true, coupons: [] };
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  return { success: true, coupons: data.slice(1).map(row => couponRowToObj_(headers, row)) };
}

function saveCoupon(coupon, adminEmail) {
  if (!isAdmin_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };

  const code = (coupon.code || "").trim().toUpperCase();
  if (!code) return { success: false, message: "กรุณาระบุโค้ดคูปอง" };

  const sheet = getOrCreateSheet_("Coupons", COUPON_HEADERS_);
  ensureColumn_(sheet, "perCustomerLimit");
  const data = sheet.getDataRange().getValues();
  let rowNum = -1;
  let usedCount = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === code) { rowNum = i + 1; usedCount = Number(data[i][9]) || 0; break; }
  }
  if (rowNum === -1) rowNum = sheet.getLastRow() + 1;

  const row = [
    code,
    coupon.label || "",
    coupon.description || "",
    coupon.discountType === "percent" ? "percent" : "fixed",
    Number(coupon.value) || 0,
    Number(coupon.minSpend) || 0,
    coupon.maxDiscount ? Number(coupon.maxDiscount) : "",
    coupon.expiryDate || "",
    Number(coupon.usageLimit) || 0,
    usedCount,
    coupon.enabled !== false,
    Number(coupon.perCustomerLimit) || 0
  ];
  sheet.getRange(rowNum, 1, 1, COUPON_HEADERS_.length).setValues([row]);

  return { success: true, code: code };
}

function deleteCoupon(code, adminEmail) {
  if (!isAdmin_(adminEmail)) return { success: false, message: "ไม่มีสิทธิ์เข้าถึง" };

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Coupons");
  if (!sheet) return { success: false, message: "ไม่พบคูปองนี้" };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === code) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false, message: "ไม่พบคูปองนี้" };
}

function setupSampleDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Products");

  if (!sheet) {
    sheet = ss.insertSheet("Products");
  } else {
    sheet.clear();
  }

  const headers = [
    "id", "brand", "category", "name", "nameEn", "sku", "badge", "preOrder", "tags",
    "priceMin", "priceMax", "priceDisplay", "originalPrice", "images", "imagesByColor", "specList",
    "colors", "colorHex", "variants", "inStock", "pointsRate", "giftIds",
    "promotions", "description"
  ];

  const mockData = [
    [
      "sm-001", "iQOO", "smartphone", "สมาร์ทโฟน iQOO Z11 5G", "iQOO Z11 5G", "IQOO-Z11-12-256-BLU", "สินค้าใหม่", false, "new",
      15900, 17900, 17900, 19900,
      "https://picsum.photos/seed/iqoo1/400/400,https://picsum.photos/seed/iqoo2/400/400,https://picsum.photos/seed/iqoo3/400/400,https://picsum.photos/seed/iqoo4/400/400",
      JSON.stringify({"Glacier Blue":["https://picsum.photos/seed/iqoo-glacierblue-1/400/400","https://picsum.photos/seed/iqoo-glacierblue-2/400/400"],"Dark Knight":["https://picsum.photos/seed/iqoo-darkknight-1/400/400","https://picsum.photos/seed/iqoo-darkknight-2/400/400"]}),
      JSON.stringify([
        { label: "หน้าจอ", value: "6.83 inch" },
        { label: "ชิปประมวลผล", value: "Snapdragon 7s Gen 4" },
        { label: "หน่วยความจำ", value: "RAM 12GB / ROM 256GB" },
        { label: "กล้องหลัง", value: "50MP" },
        { label: "กล้องหน้า", value: "16MP" },
        { label: "ระบบปฏิบัติการ", value: "Android 16" },
        { label: "แบตเตอรี่", value: "9,020 mAh" },
        { label: "การรับประกัน", value: "1 Year" }
      ]),
      "Glacier Blue,Dark Knight", JSON.stringify({ "Glacier Blue": "#8BBCD4", "Dark Knight": "#2A2A2A" }),
      JSON.stringify([{ label: "8+128GB", sku: "IQOO-Z11-8-128-BLU", price: 15900 }, { label: "12+256GB", sku: "IQOO-Z11-12-256-BLU", price: 17900 }]),
      true, 0.01, "gift-iqoo-watchz1",
      "รับโบนัส ฿3,000 เมื่อซื้อครบ ฿10,000|รับส่วนลดเพิ่ม ฿1,500 เมื่อแลกซื้อ",
      "iQOO Z11 เปิดตัวสู่ไทยพร้อม Snapdragon 7s Gen 4 แบตเตอรี่ขนาดใหญ่สุดในคลาส ตอบโจทย์เกมเมอร์และการใช้งานหนัก."
    ],
    [
      "sm-002", "Samsung", "smartphone", "สมาร์ทโฟน Samsung Galaxy S24 Ultra 5G", "Samsung Galaxy S24 Ultra 5G", "SAM-S24U-12-512-BLK", "ราคาพิเศษ", false, "bestseller",
      45900, 52900, 45900, 48900,
      "https://picsum.photos/seed/sam1/400/400,https://picsum.photos/seed/sam2/400/400,https://picsum.photos/seed/sam3/400/400,https://picsum.photos/seed/sam4/400/400",
      JSON.stringify({"Titanium Black":["https://picsum.photos/seed/sam-titaniumblack-1/400/400","https://picsum.photos/seed/sam-titaniumblack-2/400/400"],"Titanium Gray":["https://picsum.photos/seed/sam-titaniumgray-1/400/400","https://picsum.photos/seed/sam-titaniumgray-2/400/400"]}),
      JSON.stringify([
        { label: "หน้าจอ", value: "6.8 inch" },
        { label: "ชิปประมวลผล", value: "Snapdragon 8 Gen 3" },
        { label: "หน่วยความจำ", value: "RAM 12GB / ROM 512GB" },
        { label: "กล้องหลัง", value: "200MP" },
        { label: "กล้องหน้า", value: "12MP" },
        { label: "ระบบปฏิบัติการ", value: "Android 14" },
        { label: "แบตเตอรี่", value: "5,000 mAh" },
        { label: "การรับประกัน", value: "1 Year" }
      ]),
      "Titanium Black,Titanium Gray", JSON.stringify({ "Titanium Black": "#3B3B3B", "Titanium Gray": "#7B7B7B" }),
      JSON.stringify([{ label: "12+256GB", sku: "SAM-S24U-12-256-BLK", price: 45900 }, { label: "12+512GB", sku: "SAM-S24U-12-512-BLK", price: 52900 }]),
      true, 0.01, "gift-sam-budsfe",
      "ผ่อน 0% นานสูงสุด 36 เดือน|ฟรี Samsung Care+ 1 ปี",
      "ที่สุดของสมาร์ทโฟนแห่งปี มาพร้อมพลัง Galaxy AI อัปเกรดทุกประสบการณ์ให้ง่ายและสมาร์ทกว่าที่เคย."
    ],
    [
      "watch-001", "i7Wear", "smartwatch", "i7Wear Active 2 สมาร์ทวอทช์", "i7Wear Active 2", "BNW-ACT2-BLK", "สินค้าใหม่", false, "new",
      3990, 3990, 3990, 4990,
      "https://picsum.photos/seed/watch1/400/400,https://picsum.photos/seed/watch2/400/400",
      JSON.stringify({"Black":["https://picsum.photos/seed/watch-black-1/400/400"],"Silver":["https://picsum.photos/seed/watch-silver-1/400/400"]}),
      JSON.stringify([
        { label: "หน้าจอ", value: "1.5 inch AMOLED" },
        { label: "กันน้ำ", value: "5ATM" },
        { label: "แบตเตอรี่", value: "ใช้งานได้ 10 วัน" },
        { label: "การรับประกัน", value: "1 Year" }
      ]),
      "Black,Silver", JSON.stringify({ "Black": "#111111", "Silver": "#C0C0C0" }),
      JSON.stringify([{ label: "44mm", sku: "BNW-ACT2-BLK-44", price: 3990 }]),
      true, 0.01, "",
      "ซื้อคู่กับสมาร์ทโฟนลดเพิ่ม ฿500",
      "ติดตามสุขภาพและการออกกำลังกายแบบเรียลไทม์ แบตอึดใช้งานได้นานสูงสุด 10 วัน."
    ],
    [
      "ear-001", "i7Audio", "headphone", "i7Audio Pods Pro หูฟังไร้สาย", "i7Audio Pods Pro", "BNA-PODSPRO-WHT", "ของแถม", false, "bestseller",
      2490, 2490, 2490, 2990,
      "https://picsum.photos/seed/ear1/400/400,https://picsum.photos/seed/ear2/400/400",
      JSON.stringify({}),
      JSON.stringify([
        { label: "ประเภท", value: "True Wireless In-Ear" },
        { label: "ตัดเสียงรบกวน", value: "Active Noise Cancelling" },
        { label: "แบตเตอรี่", value: "ใช้งานได้ 6 ชม. ต่อครั้งชาร์จ" },
        { label: "การรับประกัน", value: "1 Year" }
      ]),
      "White", JSON.stringify({ "White": "#FAFAFA" }),
      JSON.stringify([{ label: "ชุดมาตรฐาน", sku: "BNA-PODSPRO-WHT", price: 2490 }]),
      true, 0.01, "gift-case-silicone",
      "ส่งฟรีทั่วไทย",
      "เสียงคมชัดพร้อมระบบตัดเสียงรบกวน ใส่กระชับสบายหูตลอดวัน."
    ],
    [
      "book-001", "i7Book", "notebook", "i7Book Slim 14 โน้ตบุ๊ค", "i7Book Slim 14", "BNB-SLIM14-16-512", "สินค้าใหม่", true, "new",
      24990, 24990, 24990, 27990,
      "https://picsum.photos/seed/book1/400/400,https://picsum.photos/seed/book2/400/400",
      JSON.stringify({}),
      JSON.stringify([
        { label: "หน้าจอ", value: "14 inch 2.8K OLED" },
        { label: "ซีพียู", value: "Intel Core Ultra 7" },
        { label: "หน่วยความจำ", value: "RAM 16GB / SSD 512GB" },
        { label: "น้ำหนัก", value: "1.2 กก." },
        { label: "การรับประกัน", value: "2 Years" }
      ]),
      "Space Gray", JSON.stringify({ "Space Gray": "#4B4B4B" }),
      JSON.stringify([{ label: "16+512GB", sku: "BNB-SLIM14-16-512", price: 24990 }]),
      true, 0.01, "gift-bag-notebook",
      "ผ่อน 0% นานสูงสุด 10 เดือน",
      "บางเบาพกพาง่าย จอ OLED คมชัด แบตอึดใช้งานได้ทั้งวัน เหมาะกับสายทำงานและสายสร้างสรรค์."
    ],
    [
      "fold-001", "Samsung", "foldable", "Samsung Galaxy Z Fold6 5G", "Samsung Galaxy Z Fold6 5G", "SAM-ZF6-12-256-BLK", "สินค้าใหม่", false, "new",
      61900, 61900, 61900, 64900,
      "https://picsum.photos/seed/fold1/400/400,https://picsum.photos/seed/fold2/400/400",
      JSON.stringify({"Silver Shadow":["https://picsum.photos/seed/fold-silvershadow-1/400/400"],"Navy":["https://picsum.photos/seed/fold-navy-1/400/400"]}),
      JSON.stringify([
        { label: "หน้าจอหลัก", value: "7.6 inch Foldable" },
        { label: "หน้าจอนอก", value: "6.3 inch" },
        { label: "ชิปประมวลผล", value: "Snapdragon 8 Gen 3 for Galaxy" },
        { label: "หน่วยความจำ", value: "RAM 12GB / ROM 256GB" },
        { label: "แบตเตอรี่", value: "4,400 mAh" },
        { label: "การรับประกัน", value: "1 Year" }
      ]),
      "Silver Shadow,Navy", JSON.stringify({ "Silver Shadow": "#B0B3B8", "Navy": "#1B2A4A" }),
      JSON.stringify([{ label: "12+256GB", sku: "SAM-ZF6-12-256-BLK", price: 61900 }]),
      true, 0.01, "gift-sam-budsfe",
      "ผ่อน 0% นานสูงสุด 10 เดือน",
      "จอพับใหญ่สุดในตระกูล Fold เปิดประสบการณ์มัลติทาสก์แบบไร้ขีดจำกัด."
    ],
    [
      "fold-002", "OPPO", "foldable", "OPPO Find N5 5G จอพับ", "OPPO Find N5 5G", "OPP-FN5-16-512", "สินค้าใหม่", false, "new",
      59900, 59900, 59900, 0,
      "https://picsum.photos/seed/fold2a/400/400,https://picsum.photos/seed/fold2b/400/400",
      JSON.stringify({"Cosmic Black":["https://picsum.photos/seed/fold2-cosmicblack-1/400/400"],"Misty White":["https://picsum.photos/seed/fold2-mistywhite-1/400/400"]}),
      JSON.stringify([
        { label: "หน้าจอหลัก", value: "8.12 inch Foldable" },
        { label: "หน้าจอนอก", value: "6.62 inch" },
        { label: "ชิปประมวลผล", value: "Snapdragon 8 Elite" },
        { label: "หน่วยความจำ", value: "RAM 16GB / ROM 512GB" },
        { label: "แบตเตอรี่", value: "5,600 mAh" },
        { label: "การรับประกัน", value: "1 Year" }
      ]),
      "Cosmic Black,Misty White", JSON.stringify({ "Cosmic Black": "#1A1A1A", "Misty White": "#E8E6E1" }),
      JSON.stringify([{ label: "16+512GB", sku: "OPP-FN5-16-512", price: 59900 }]),
      true, 0.01, "",
      "ผ่อน 0% นานสูงสุด 10 เดือน",
      "จอพับบางที่สุดในตระกูล Find N พร้อมกล้อง Hasselblad ทำงานและถ่ายภาพได้ในเครื่องเดียว."
    ],
    [
      "acc-001", "i7Audio", "accessory", "สายชาร์จ USB-C to USB-C 100W", "i7 USB-C Cable 100W", "BN-CABLE100W-1M", "", false, "",
      290, 290, 290, 0,
      "https://picsum.photos/seed/acc1/400/400",
      JSON.stringify({}),
      JSON.stringify([
        { label: "ความยาว", value: "1 เมตร" },
        { label: "กำลังไฟ", value: "สูงสุด 100W" },
        { label: "วัสดุ", value: "ถักไนลอนกันพันกัน" }
      ]),
      "Black", JSON.stringify({ "Black": "#111111" }),
      JSON.stringify([{ label: "1 เมตร", sku: "BN-CABLE100W-1M", price: 290 }]),
      true, 0.01, "",
      "",
      "ชาร์จไวรองรับสูงสุด 100W สายถักไนลอนทนทาน ไม่พันกันง่าย."
    ],
    [
      "acc-002", "i7Audio", "accessory", "แท่นชาร์จไร้สาย 3in1 สำหรับมือถือ นาฬิกา หูฟัง", "i7 3-in-1 Wireless Charger", "BN-CHG3IN1-BLK", "ของแถม", false, "bestseller",
      890, 890, 890, 1190,
      "https://picsum.photos/seed/acc2/400/400",
      JSON.stringify({}),
      JSON.stringify([
        { label: "กำลังชาร์จ", value: "สูงสุด 15W" },
        { label: "รองรับ", value: "มือถือ, นาฬิกา, หูฟังไร้สายที่รองรับ Qi" },
        { label: "วัสดุ", value: "อลูมิเนียมอัลลอย" }
      ]),
      "Black", JSON.stringify({ "Black": "#111111" }),
      JSON.stringify([{ label: "ชุดมาตรฐาน", sku: "BN-CHG3IN1-BLK", price: 890 }]),
      true, 0.01, "gift-cable-usbc",
      "",
      "ชาร์จมือถือ นาฬิกา และหูฟังพร้อมกันได้ในแท่นเดียว ดีไซน์เรียบหรูวางบนโต๊ะทำงาน."
    ],
    [
      "spk-001", "i7Audio", "speaker", "i7Audio Boom Mini ลำโพงพกพา", "i7Audio Boom Mini", "BNA-BOOMMINI-BLU", "", false, "",
      1290, 1290, 1290, 0,
      "https://picsum.photos/seed/spk1/400/400,https://picsum.photos/seed/spk2/400/400",
      JSON.stringify({"Blue":["https://picsum.photos/seed/spk-blue-1/400/400"],"Black":["https://picsum.photos/seed/spk-black-1/400/400"]}),
      JSON.stringify([
        { label: "กำลังขับ", value: "10W" },
        { label: "การเชื่อมต่อ", value: "Bluetooth 5.3" },
        { label: "กันน้ำ", value: "IPX7" },
        { label: "การรับประกัน", value: "1 Year" }
      ]),
      "Blue,Black", JSON.stringify({ "Blue": "#2563EB", "Black": "#111111" }),
      JSON.stringify([{ label: "ชุดมาตรฐาน", sku: "BNA-BOOMMINI-BLU", price: 1290 }]),
      true, 0.01, "",
      "ซื้อ 2 ลดเพิ่ม 10%",
      "เสียงเบสหนักแน่น พกพาสะดวก กันน้ำกันฝุ่นเล่นได้ทุกที่."
    ],
    [
      "home-001", "i7Home", "smarthome", "i7Home หลอดไฟอัจฉริยะ Wi-Fi", "i7Home Smart Bulb", "BNH-BULB-WIFI", "ของแถม", false, "bestseller",
      390, 390, 390, 490,
      "https://picsum.photos/seed/home1/400/400",
      JSON.stringify({}),
      JSON.stringify([
        { label: "การเชื่อมต่อ", value: "Wi-Fi 2.4GHz" },
        { label: "แสง", value: "16 ล้านสี ปรับได้ผ่านแอป" },
        { label: "ใช้งานร่วมกับ", value: "Google Home / Alexa" }
      ]),
      "White", JSON.stringify({ "White": "#FFFFFF" }),
      JSON.stringify([{ label: "ชุดมาตรฐาน", sku: "BNH-BULB-WIFI", price: 390 }]),
      true, 0.01, "gift-plug-smart",
      "ซื้อ 3 แถม 1",
      "สั่งเปิดปิดและปรับสีผ่านแอปมือถือหรือสั่งงานด้วยเสียง เปลี่ยนบ้านให้อัจฉริยะได้ง่ายๆ."
    ],
    [
      "app-001", "i7Home", "appliance", "i7Home หม้อทอดไร้น้ำมัน 5.5 ลิตร", "i7Home Air Fryer 5.5L", "BNH-AIRFRY-55", "สินค้าใหม่", false, "new",
      1990, 1990, 1990, 2490,
      "https://picsum.photos/seed/app1/400/400",
      JSON.stringify({}),
      JSON.stringify([
        { label: "ความจุ", value: "5.5 ลิตร" },
        { label: "กำลังไฟ", value: "1700W" },
        { label: "โปรแกรมปรุงอาหาร", value: "8 โปรแกรมอัตโนมัติ" },
        { label: "การรับประกัน", value: "1 Year" }
      ]),
      "Black", JSON.stringify({ "Black": "#1A1A1A" }),
      JSON.stringify([{ label: "5.5L", sku: "BNH-AIRFRY-55", price: 1990 }]),
      true, 0.01, "",
      "ผ่อน 0% นานสูงสุด 6 เดือน",
      "ทอดไร้น้ำมัน อาหารกรอบอร่อยแบบไขมันต่ำ ทำความสะอาดง่าย เหมาะกับทุกครัวเรือน."
    ],
    [
      "app-002", "i7Home", "appliance", "i7Home เครื่องฟอกอากาศ HEPA", "i7Home Air Purifier HEPA", "BNH-AIRPURE-H13", "ของแถม", false, "",
      3290, 3290, 3290, 0,
      "https://picsum.photos/seed/app2/400/400",
      JSON.stringify({}),
      JSON.stringify([
        { label: "แผ่นกรอง", value: "HEPA H13 กรองฝุ่น PM2.5" },
        { label: "พื้นที่ใช้งาน", value: "สูงสุด 40 ตร.ม." },
        { label: "ระดับเสียง", value: "ต่ำสุด 22dB" },
        { label: "การรับประกัน", value: "1 Year" }
      ]),
      "White", JSON.stringify({ "White": "#FAFAFA" }),
      JSON.stringify([{ label: "ชุดมาตรฐาน", sku: "BNH-AIRPURE-H13", price: 3290 }]),
      true, 0.01, "gift-filter-airpure",
      "",
      "กรองฝุ่น PM2.5 และสารก่อภูมิแพ้ในอากาศ เงียบขณะทำงาน เหมาะกับห้องนอนและห้องทำงาน."
    ],
    [
      "life-001", "i7", "lifestyle", "กระบอกน้ำเก็บอุณหภูมิ i7 500ml", "i7 Vacuum Flask 500ml", "BN-FLASK-500", "", false, "bestseller",
      390, 390, 390, 0,
      "https://picsum.photos/seed/life1/400/400",
      JSON.stringify({"Matte Black":["https://picsum.photos/seed/life1-matteblack/400/400"],"Sage Green":["https://picsum.photos/seed/life1-sagegreen/400/400"],"Cream":["https://picsum.photos/seed/life1-cream/400/400"]}),
      JSON.stringify([
        { label: "ความจุ", value: "500 มิลลิลิตร" },
        { label: "เก็บความเย็น", value: "นานสูงสุด 24 ชั่วโมง" },
        { label: "เก็บความร้อน", value: "นานสูงสุด 12 ชั่วโมง" },
        { label: "วัสดุ", value: "สแตนเลส 304" }
      ]),
      "Matte Black,Sage Green,Cream", JSON.stringify({ "Matte Black": "#222222", "Sage Green": "#87A96B", "Cream": "#F5EFE0" }),
      JSON.stringify([{ label: "500ml", sku: "BN-FLASK-500", price: 390 }]),
      true, 0.01, "",
      "ซื้อ 2 ลดเพิ่ม 15%",
      "เก็บความเย็น-ร้อนได้ยาวนาน ดีไซน์เพรียวพกพาสะดวก เหมาะกับการใช้งานทุกวัน."
    ],
    [
      "life-002", "i7", "lifestyle", "กระเป๋าเป้กันน้ำ i7 Commuter 20L", "i7 Commuter Backpack 20L", "BN-BAG-20L", "สินค้าใหม่", false, "new",
      1290, 1290, 1290, 1590,
      "https://picsum.photos/seed/life2/400/400",
      JSON.stringify({"Black":["https://picsum.photos/seed/life2-black/400/400"],"Navy":["https://picsum.photos/seed/life2-navy/400/400"]}),
      JSON.stringify([
        { label: "ความจุ", value: "20 ลิตร" },
        { label: "วัสดุ", value: "ผ้ากันน้ำ 900D" },
        { label: "ช่องใส่โน้ตบุ๊ค", value: "สูงสุด 15.6 นิ้ว" },
        { label: "น้ำหนัก", value: "0.8 กก." }
      ]),
      "Black,Navy", JSON.stringify({ "Black": "#111111", "Navy": "#1B2A4A" }),
      JSON.stringify([{ label: "20L", sku: "BN-BAG-20L", price: 1290 }]),
      true, 0.01, "gift-raincover-bag",
      "",
      "กันน้ำได้ดี ช่องเก็บของเป็นระเบียบ เหมาะกับการเดินทางและใช้งานประจำวัน."
    ],
    [
      "oth-001", "i7", "other", "บัตรของขวัญ i7 Store มูลค่า 500 บาท", "i7 Store Gift Card 500", "BN-GIFTCARD-500", "", false, "",
      500, 500, 500, 0,
      "https://picsum.photos/seed/gift1/400/400",
      JSON.stringify({}),
      JSON.stringify([
        { label: "มูลค่า", value: "500 บาท" },
        { label: "ใช้ได้กับ", value: "สินค้าทุกหมวดหมู่" },
        { label: "อายุการใช้งาน", value: "1 ปีนับจากวันที่ซื้อ" }
      ]),
      "", "{}",
      JSON.stringify([{ label: "500 บาท", sku: "BN-GIFTCARD-500", price: 500 }]),
      true, 0.01, "",
      "",
      "บัตรของขวัญสำหรับช้อปสินค้าที่ i7 Store ใช้เป็นของขวัญหรือสิทธิพิเศษให้ลูกค้า."
    ],
    [
      "oth-002", "i7Audio", "other", "พาวเวอร์แบงค์ i7 20000mAh ชาร์จเร็ว 22.5W", "i7 Power Bank 20000mAh", "BNA-PWB-20000", "ของแถม", false, "bestseller",
      690, 690, 690, 890,
      "https://picsum.photos/seed/oth2/400/400",
      JSON.stringify({"Black":["https://picsum.photos/seed/oth2-black/400/400"],"White":["https://picsum.photos/seed/oth2-white/400/400"]}),
      JSON.stringify([
        { label: "ความจุ", value: "20,000 mAh" },
        { label: "กำลังชาร์จ", value: "สูงสุด 22.5W" },
        { label: "พอร์ต", value: "USB-C x1, USB-A x1" },
        { label: "การรับประกัน", value: "1 Year" }
      ]),
      "Black,White", JSON.stringify({ "Black": "#111111", "White": "#FAFAFA" }),
      JSON.stringify([{ label: "20000mAh", sku: "BNA-PWB-20000", price: 690 }]),
      true, 0.01, "gift-cable-usbc",
      "ซื้อคู่กับมือถือลดเพิ่ม ฿100",
      "ชาร์จเร็ว พกพาง่าย แบตอึดใช้งานได้หลายรอบ เหมาะกับการเดินทาง."
    ]
  ];

  sheet.appendRow(headers);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#FFD700");

  sheet.getRange(2, 1, mockData.length, headers.length).setValues(mockData);

  sheet.setFrozenRows(1);

  let giftsSheet = ss.getSheetByName("Gifts");
  if (!giftsSheet) {
    giftsSheet = ss.insertSheet("Gifts");
  } else {
    giftsSheet.clear();
  }

  const giftRows = [
    ["gift-iqoo-watchz1", "iQOO Watch Phone Z1 Pink มูลค่า ฿3,999", "GIFT-IQOO-WATCHZ1-PINK", "brand", ""],
    ["gift-sam-budsfe", "Samsung Galaxy Buds FE มูลค่า ฿2,990", "GIFT-SAM-BUDSFE", "brand", ""],
    ["gift-case-silicone", "เคสซิลิโคนกันกระแทก มูลค่า ฿290", "GIFT-CASE-SILICONE", "store", ""],
    ["gift-bag-notebook", "กระเป๋าโน้ตบุ๊ค มูลค่า ฿990", "GIFT-BAG-NOTEBOOK", "store", ""],
    ["gift-cable-usbc", "สายชาร์จ USB-C มูลค่า ฿190", "GIFT-CABLE-USBC", "store", ""],
    ["gift-plug-smart", "ปลั๊กไฟอัจฉริยะ มูลค่า ฿290", "GIFT-PLUG-SMART", "store", ""],
    ["gift-filter-airpure", "แผ่นกรองสำรอง มูลค่า ฿590", "GIFT-FILTER-AIRPURE", "store", ""],
    ["gift-raincover-bag", "ปลอกกันฝนกระเป๋า มูลค่า ฿190", "GIFT-RAINCOVER-BAG", "store", ""]
  ];

  giftsSheet.appendRow(GIFT_HEADERS_);
  giftsSheet.getRange(1, 1, 1, GIFT_HEADERS_.length).setFontWeight("bold").setBackground("#FFD700");
  giftsSheet.getRange(2, 1, giftRows.length, GIFT_HEADERS_.length).setValues(giftRows);
  giftsSheet.setFrozenRows(1);

  let promotionsSheet = ss.getSheetByName("Promotions");
  if (!promotionsSheet) {
    promotionsSheet = ss.insertSheet("Promotions");
  } else {
    promotionsSheet.clear();
  }

  const promotionRows = [
    ["promo-bundle-earphone-phone", "ซื้อคู่กับสมาร์ทโฟนลดเพิ่ม ฿500", "fixed", 500,
      JSON.stringify([{ type: "product", ids: ["ear-001"] }, { type: "product", ids: ["sm-001"] }]), 1, true],
    ["promo-qty-speaker", "ซื้อ 2 ลดเพิ่ม 10%", "percent", 10,
      JSON.stringify([{ type: "product", ids: ["spk-001"] }]), 2, true],
    ["promo-bundle-smarthome-wearable", "ซื้อสมาร์ทโฮมคู่กับสมาร์ทวอทช์หรืออุปกรณ์เสริมลดเพิ่ม ฿200", "fixed", 200,
      JSON.stringify([{ type: "category", ids: ["smarthome"] }, { type: "category", ids: ["smartwatch", "accessory"] }]), 1, true]
  ];

  promotionsSheet.appendRow(PROMOTION_HEADERS_);
  promotionsSheet.getRange(1, 1, 1, PROMOTION_HEADERS_.length).setFontWeight("bold").setBackground("#FFD700");
  promotionsSheet.getRange(2, 1, promotionRows.length, PROMOTION_HEADERS_.length).setValues(promotionRows);
  promotionsSheet.setFrozenRows(1);

  try {
    SpreadsheetApp.getUi().alert("ฐานข้อมูลสินค้าตัวอย่างสร้างเสร็จเรียบร้อยแล้ว!");
  } catch (e) {
    // getUi() ใช้ไม่ได้เมื่อรันจาก Apps Script editor โดยตรง (ใช้ได้เฉพาะรันจากเมนูใน Sheet)
    Logger.log("ฐานข้อมูลสินค้าตัวอย่างสร้างเสร็จเรียบร้อยแล้ว!");
  }
}
