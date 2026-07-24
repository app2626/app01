export const COUPONS = [
  {
    code: "I7STORE100",
    label: "ส่วนลด ฿100",
    description: "สำหรับยอดจองขั้นต่ำ ฿1,000",
    discountType: "fixed",
    value: 100,
    minSpend: 1000,
    maxDiscount: null,
    expiryDate: "",
    usageLimit: 0,
    usedCount: 0,
    perCustomerLimit: 0,
    enabled: true
  },
  {
    code: "I7STORE500",
    label: "ส่วนลด ฿500",
    description: "สำหรับยอดจองขั้นต่ำ ฿5,000",
    discountType: "fixed",
    value: 500,
    minSpend: 5000,
    maxDiscount: null,
    expiryDate: "",
    usageLimit: 0,
    usedCount: 0,
    perCustomerLimit: 0,
    enabled: true
  },
  {
    code: "NEWMEMBER10",
    label: "ลด 10%",
    description: "สำหรับสมาชิกใหม่ สูงสุด ฿300",
    discountType: "percent",
    value: 10,
    maxDiscount: 300,
    minSpend: 500,
    expiryDate: "",
    usageLimit: 0,
    usedCount: 0,
    perCustomerLimit: 1,
    enabled: true
  }
];

export function calcCouponDiscount(coupon, subtotal) {
  if (!coupon || subtotal < coupon.minSpend) return 0;
  if (coupon.discountType === "fixed") return Math.min(coupon.value, subtotal);
  const pct = subtotal * (coupon.value / 100);
  return Math.min(pct, coupon.maxDiscount ?? pct);
}
