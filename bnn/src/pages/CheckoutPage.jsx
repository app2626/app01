import { useState } from "react";
import { CheckCircle2, Truck, Wallet } from "lucide-react";
import { formatTHB } from "../utils/format";
import { calcCouponDiscount } from "../data/coupons";
import { calcApplicablePromotions } from "../utils/promotions";
import { callGas } from "../utils/gas";
import { placeOrderLocal } from "../utils/localMock";

const PROVINCES = ["กรุงเทพมหานคร", "เชียงใหม่", "ขอนแก่น", "ชลบุรี", "สงขลา", "นครราชสีมา", "อื่นๆ"];

export default function CheckoutPage({ cart, member, coupons, promotions, collectedCoupons, onOrderComplete, onGoHome, onPointsUpdated }) {
  const [form, setForm] = useState({
    customerName: member?.name || "",
    phone: "",
    address: "",
    province: PROVINCES[0],
    paymentMethod: "transfer",
    guestEmail: "",
    needTaxInvoice: false,
    taxId: "",
    taxInvoiceName: "",
    taxInvoiceAddress: "",
    taxSameAsShipping: true
  });
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState("");
  const [usePoints, setUsePoints] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [orderResult, setOrderResult] = useState(null);
  const [error, setError] = useState("");

  const subtotal = cart.reduce((sum, item) => sum + item.selectedVariant.price * item.qty, 0);
  const couponDiscount = calcCouponDiscount(appliedCoupon, subtotal);
  const { appliedPromotions, totalDiscount: promotionDiscount } = calcApplicablePromotions(cart, promotions);
  // คูปองกับโปรโมชั่นต่างคำนวณ/จำกัดวงเงินแยกกันเอง (แต่ละอย่างไม่เกิน subtotal) แต่ถ้าเข้าเงื่อนไขพร้อมกันหลายรายการ
  // ผลรวมส่วนลดอาจเกิน subtotal ได้ — กันไม่ให้ยอดสุทธิติดลบ
  const discount = Math.min(couponDiscount + promotionDiscount, subtotal);
  const memberPoints = member?.points || 0;
  const maxPointsRedeemable = Math.min(memberPoints, subtotal - discount);
  const pointsDiscount = usePoints ? maxPointsRedeemable : 0;
  const total = Math.max(0, subtotal - discount - pointsDiscount);

  const update = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const applyCoupon = () => {
    setCouponError("");
    const code = couponCode.trim().toUpperCase();
    const coupon = (coupons || []).find(c => c.code === code);
    if (!coupon) {
      setCouponError("ไม่พบคูปองนี้");
      return;
    }
    if (!collectedCoupons.includes(code)) {
      setCouponError("กรุณาเก็บคูปองนี้ก่อนใช้งาน (หน้าคูปองส่วนลด)");
      return;
    }
    if (coupon.expired) {
      setCouponError("คูปองนี้หมดอายุแล้ว");
      return;
    }
    if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
      setCouponError("คูปองนี้ถูกใช้ครบจำนวนแล้ว");
      return;
    }
    if (subtotal < coupon.minSpend) {
      setCouponError(`ยอดซื้อขั้นต่ำ ${formatTHB(coupon.minSpend)}`);
      return;
    }
    setAppliedCoupon(coupon);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (cart.length === 0) return;
    setSubmitting(true);
    setError("");
    try {
      const orderData = {
        customerName: form.customerName,
        phone: form.phone,
        address: form.address,
        province: form.province,
        paymentMethod: form.paymentMethod,
        items: cart.map(item => ({
          productId: item.product.id,
          sku: item.selectedVariant.sku,
          name: item.product.name,
          color: item.selectedColor,
          variant: item.selectedVariant.label,
          qty: item.qty,
          price: item.selectedVariant.price
        })),
        subtotal,
        discount: discount + pointsDiscount,
        pointsRedeemed: pointsDiscount,
        total,
        couponCode: appliedCoupon?.code || "",
        promotionIds: appliedPromotions.map(p => p.id),
        memberToken: member?.token || "",
        guestEmail: !member ? form.guestEmail.trim() : "",
        needTaxInvoice: form.needTaxInvoice,
        taxId: form.needTaxInvoice ? form.taxId.trim() : "",
        taxInvoiceName: form.needTaxInvoice ? form.taxInvoiceName.trim() : "",
        taxInvoiceAddress: form.needTaxInvoice ? (form.taxSameAsShipping ? form.address : form.taxInvoiceAddress.trim()) : ""
      };
      const result = await callGas("placeOrder", [orderData], placeOrderLocal);
      if (result.success) {
        setOrderResult(result);
        if (result.pointsBalance != null) onPointsUpdated(result.pointsBalance);
        onOrderComplete();
      } else {
        setError(result.message || "ไม่สามารถบันทึกคำสั่งซื้อได้");
      }
    } catch {
      setError("เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setSubmitting(false);
    }
  };

  if (orderResult) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">สั่งซื้อสำเร็จ!</h1>
        <p className="text-gray-500 mb-1">หมายเลขคำสั่งซื้อของคุณคือ</p>
        <p className="text-lg font-mono font-bold text-[#FF6B00] mb-6">{orderResult.orderId}</p>
        <p className="text-sm text-gray-500 mb-8">ทีมงานจะติดต่อยืนยันคำสั่งซื้อเร็วๆ นี้</p>
        <button
          onClick={onGoHome}
          className="bg-[#FFD700] text-black font-bold px-6 py-3 rounded-md hover:bg-[#E6C200] transition-colors"
        >
          กลับสู่หน้าแรก
        </button>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center text-gray-500">
        ตะกร้าของคุณว่างเปล่า ไม่สามารถดำเนินการสั่งซื้อได้
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900 mb-6">ดำเนินการสั่งซื้อ</h1>

      <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-6">
        <div className="flex-1 space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Truck className="w-4 h-4" /> ที่อยู่จัดส่ง
            </h2>
            <div className="space-y-3">
              <input
                required
                placeholder="ชื่อ-นามสกุล"
                value={form.customerName}
                onChange={update("customerName")}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-[#FFD700]"
              />
              <input
                required
                placeholder="เบอร์โทรศัพท์"
                value={form.phone}
                onChange={update("phone")}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-[#FFD700]"
              />
              {!member && (
                <div>
                  <input
                    type="email"
                    placeholder="อีเมล (ไม่บังคับ)"
                    value={form.guestEmail}
                    onChange={update("guestEmail")}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-[#FFD700]"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">กรอกไว้เผื่อทีมงานต้องติดต่อกลับ</p>
                </div>
              )}
              <textarea
                required
                placeholder="ที่อยู่จัดส่ง"
                rows={3}
                value={form.address}
                onChange={update("address")}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-[#FFD700] resize-none"
              />
              <select
                value={form.province}
                onChange={update("province")}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-[#FFD700] bg-white"
              >
                {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <label className="flex items-center gap-2 cursor-pointer mb-3">
              <input
                type="checkbox"
                checked={form.needTaxInvoice}
                onChange={(e) => setForm(prev => ({ ...prev, needTaxInvoice: e.target.checked }))}
              />
              <span className="font-bold text-gray-900">ต้องการใบกำกับภาษี</span>
            </label>
            {form.needTaxInvoice && (
              <div className="space-y-3">
                <input
                  required
                  placeholder="เลขประจำตัวผู้เสียภาษี 13 หลัก"
                  value={form.taxId}
                  onChange={update("taxId")}
                  maxLength={13}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-[#FFD700]"
                />
                <input
                  required
                  placeholder="ชื่อสำหรับออกใบกำกับภาษี (บุคคล/บริษัท)"
                  value={form.taxInvoiceName}
                  onChange={update("taxInvoiceName")}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-[#FFD700]"
                />
                <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.taxSameAsShipping}
                    onChange={(e) => setForm(prev => ({ ...prev, taxSameAsShipping: e.target.checked }))}
                  />
                  ใช้ที่อยู่จัดส่งเดียวกันสำหรับออกใบกำกับภาษี
                </label>
                {!form.taxSameAsShipping && (
                  <textarea
                    required
                    placeholder="ที่อยู่สำหรับออกใบกำกับภาษี"
                    rows={3}
                    value={form.taxInvoiceAddress}
                    onChange={update("taxInvoiceAddress")}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-[#FFD700] resize-none"
                  />
                )}
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Wallet className="w-4 h-4" /> วิธีการชำระเงิน
            </h2>
            <div className="space-y-2">
              <label className="flex items-center gap-2 border border-gray-200 rounded-md px-3 py-2.5 cursor-pointer has-[:checked]:border-[#FFD700] has-[:checked]:bg-[#FFFBE6]">
                <input type="radio" name="payment" checked={form.paymentMethod === "transfer"} onChange={() => setForm(p => ({ ...p, paymentMethod: "transfer" }))} />
                <span className="text-sm">โอนเงินผ่านธนาคาร</span>
              </label>
              <label className="flex items-center gap-2 border border-gray-200 rounded-md px-3 py-2.5 cursor-pointer has-[:checked]:border-[#FFD700] has-[:checked]:bg-[#FFFBE6]">
                <input type="radio" name="payment" checked={form.paymentMethod === "cod"} onChange={() => setForm(p => ({ ...p, paymentMethod: "cod" }))} />
                <span className="text-sm">เก็บเงินปลายทาง (COD)</span>
              </label>
            </div>
          </div>
        </div>

        <div className="w-full md:w-80 flex-shrink-0">
          <div className="bg-white rounded-lg border border-gray-200 p-5 sticky top-24">
            <h2 className="font-bold text-gray-900 mb-4">สรุปคำสั่งซื้อ</h2>
            <div className="space-y-2 mb-4 max-h-56 overflow-y-auto">
              {cart.map((item, idx) => (
                <div key={idx} className="flex justify-between text-xs text-gray-600">
                  <span className="line-clamp-1 flex-1">{item.product.name} x{item.qty}</span>
                  <span className="flex-shrink-0 ml-2">{formatTHB(item.selectedVariant.price * item.qty)}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-2 mb-3">
              <input
                placeholder="โค้ดส่วนลด"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-xs outline-none focus:border-[#FFD700]"
              />
              <button type="button" onClick={applyCoupon} className="bg-gray-800 text-white text-xs font-medium px-3 py-1.5 rounded-md hover:bg-black">
                ใช้โค้ด
              </button>
            </div>
            {couponError && <p className="text-[11px] text-red-500 mb-3">{couponError}</p>}
            {appliedCoupon && <p className="text-[11px] text-green-600 mb-3">ใช้คูปอง {appliedCoupon.code} แล้ว</p>}

            {appliedPromotions.length > 0 && (
              <div className="mb-3 space-y-1">
                {appliedPromotions.map(promo => (
                  <p key={promo.id} className="text-[11px] text-green-600">🎉 {promo.label}</p>
                ))}
              </div>
            )}

            {member && memberPoints > 0 && (
              <label className="flex items-center justify-between gap-2 border border-gray-200 rounded-md px-3 py-2 mb-3 cursor-pointer has-[:checked]:border-[#FFD700] has-[:checked]:bg-[#FFFBE6]">
                <span className="flex items-center gap-2 text-xs text-gray-700">
                  <input type="checkbox" checked={usePoints} onChange={(e) => setUsePoints(e.target.checked)} />
                  ใช้แต้มสะสม ({memberPoints.toLocaleString("th-TH")} คะแนน)
                </span>
                <span className="text-xs font-medium text-[#B8860B]">-{formatTHB(maxPointsRedeemable)}</span>
              </label>
            )}

            <div className="border-t border-gray-100 pt-3 space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>ยอดรวมสินค้า</span>
                <span>{formatTHB(subtotal)}</span>
              </div>
              {couponDiscount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>ส่วนลดคูปอง</span>
                  <span>-{formatTHB(couponDiscount)}</span>
                </div>
              )}
              {promotionDiscount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>ส่วนลดโปรโมชั่น</span>
                  <span>-{formatTHB(promotionDiscount)}</span>
                </div>
              )}
              {pointsDiscount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>ใช้แต้มสะสม</span>
                  <span>-{formatTHB(pointsDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-gray-900 text-base pt-1.5 border-t border-gray-100">
                <span>ยอดชำระทั้งหมด</span>
                <span className="text-[#FF6B00]">{formatTHB(total)}</span>
              </div>
            </div>

            {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-4 bg-[#FF6B00] text-white font-bold py-3 rounded-md hover:bg-[#E65A00] transition-colors disabled:opacity-50"
            >
              {submitting ? "กำลังดำเนินการ..." : "ยืนยันคำสั่งซื้อ"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
