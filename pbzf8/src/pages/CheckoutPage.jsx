import { useState, useEffect, useRef } from "react";
import { CheckCircle2, User, Wallet } from "lucide-react";
import { formatTHB } from "../utils/format";
import { calcCouponDiscount } from "../data/coupons";
import { calcApplicablePromotions } from "../utils/promotions";
import { callGas } from "../utils/gas";
import { placeOrderLocal, getCustomerByPhoneLocal } from "../utils/localMock";
import { RESERVATION_CHANNELS } from "../data/channels";

const INTEREST_OPTIONS = ["เปิดเบอร์รับส่วนลด", "ผ่อนไฟแนนซ์", "ซื้ออุปกรณ์เสริม"];

export default function CheckoutPage({ cart, member, coupons, promotions, collectedCoupons, reservationSettings, onOrderComplete, onGoHome, onPointsUpdated }) {
  const [form, setForm] = useState({
    customerName: member?.name || "",
    phone: "",
    email: member?.email || "",
    nationalId: "",
    registrationCode: "",
    customerInterests: [],
    channel: "",
    reservationType: "T",
    staffName: "",
    staffPhone: "",
    depositStatus: "unpaid",
    receiptNumber: "",
    depositAmountInput: "",
    notes: ""
  });
  const [depositTouched, setDepositTouched] = useState(false);
  // requestId คงที่ตลอดอายุของฟอร์มนี้ — กันกดยืนยันจองซ้ำ (double-submit) ให้เซิร์ฟเวอร์คืนออเดอร์เดิมแทนที่จะสร้างซ้ำ
  const [requestId] = useState(() => "REQ-" + Date.now() + "-" + Math.random().toString(36).slice(2));
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
  const suggestedDeposit = Math.min(Math.max(0, reservationSettings?.depositAmount ?? 0), total);

  // ยอดมัดจำที่พนักงานกรอกเองคือค่าจริงที่บันทึก — ยอดแนะนำจาก % แค่ช่วย prefill ให้ตอนพนักงานยังไม่แก้เอง
  useEffect(() => {
    if (!depositTouched) {
      setForm(prev => ({ ...prev, depositAmountInput: String(suggestedDeposit) }));
    }
  }, [suggestedDeposit, depositTouched]);

  const depositAmount = Math.max(0, Math.min(Number(form.depositAmountInput) || 0, total));
  const remainingAmount = total - depositAmount;

  // ค้นข้อมูลลูกค้าจากเบอร์โทรที่เคยจองไว้ก่อนหน้า เติมเฉพาะช่องที่ยังว่างอยู่ (ไม่ทับข้อมูลที่พนักงานพิมพ์เอง)
  // phoneLookupSeq กันผลลัพธ์เก่าที่มาช้า (เน็ตช้า) ทับข้อมูลที่พนักงานพิมพ์เบอร์ใหม่ไปแล้ว
  const phoneLookupSeq = useRef(0);
  useEffect(() => {
    const phone = form.phone.trim();
    if (phone.length < 9) return;
    const seq = ++phoneLookupSeq.current;
    const timer = setTimeout(() => {
      callGas("getCustomerByPhone", [phone], () => getCustomerByPhoneLocal(phone))
        .then(res => {
          if (seq !== phoneLookupSeq.current || !res?.found) return;
          setForm(prev => ({
            ...prev,
            customerName: prev.customerName || res.customerName,
            email: prev.email || res.email,
            nationalId: prev.nationalId || res.nationalId,
            registrationCode: prev.registrationCode || res.registrationCode
          }));
        })
        .catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [form.phone]);

  const update = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const toggleInterest = (opt) => {
    setForm(prev => ({
      ...prev,
      customerInterests: prev.customerInterests.includes(opt)
        ? prev.customerInterests.filter(i => i !== opt)
        : [...prev.customerInterests, opt]
    }));
  };

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
    if (form.customerInterests.length === 0) {
      setError("กรุณาเลือกความสนใจและพฤติกรรมลูกค้าอย่างน้อย 1 อย่าง");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const orderData = {
        customerName: form.customerName,
        phone: form.phone,
        email: form.email.trim(),
        nationalId: form.nationalId.trim(),
        registrationCode: form.registrationCode.trim(),
        customerInterests: form.customerInterests,
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
        channel: form.channel,
        reservationType: form.reservationType,
        staffName: form.staffName,
        staffPhone: form.staffPhone,
        depositStatus: form.depositStatus,
        receiptNumber: form.receiptNumber,
        depositAmount,
        notes: form.notes.trim(),
        requestId
      };
      const result = await callGas("placeOrder", [orderData], placeOrderLocal);
      if (result.success) {
        setOrderResult(result);
        if (result.pointsBalance != null) onPointsUpdated(result.pointsBalance);
        onOrderComplete();
      } else {
        setError(result.message || "ไม่สามารถบันทึกการจองได้");
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
        <h1 className="text-2xl font-bold text-gray-900 mb-2">จองสำเร็จ!</h1>
        <p className="text-gray-500 mb-1">หมายเลขการจองของคุณคือ</p>
        <p className="text-lg font-mono font-bold text-[#FF6B00] mb-6">{orderResult.orderId}</p>
        <div className="bg-[#FFFBE6] border border-[#FFD700] rounded-lg p-4 mb-6 text-left space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">ยอดมัดจำ</span>
            <span className="font-bold text-[#FF6B00]">{formatTHB(orderResult.depositAmount)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">ยอดคงเหลือ (ชำระตอนรับสินค้า)</span>
            <span className="font-medium text-gray-900">{formatTHB(orderResult.remainingAmount)}</span>
          </div>
        </div>
        <p className="text-sm text-gray-500 mb-8">ทีมงานจะติดต่อยืนยันการจองเร็วๆ นี้</p>
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
        ตะกร้าของคุณว่างเปล่า ไม่สามารถดำเนินการจองได้
      </div>
    );
  }

  const inputClass = "w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-[#FFD700]";

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900 mb-6">ดำเนินการจองสินค้า</h1>

      <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-6">
        <div className="flex-1 space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <User className="w-4 h-4" /> ฟอร์มกรอกข้อมูลลูกค้า
            </h2>
            <div className="space-y-3">
              <input required placeholder="ชื่อ-นามสกุล" value={form.customerName} onChange={update("customerName")} className={inputClass} />
              <input required placeholder="เบอร์โทรศัพท์" value={form.phone} onChange={update("phone")} className={inputClass} />
              <input required type="email" placeholder="อีเมล" value={form.email} onChange={update("email")} className={inputClass} />
              <input required placeholder="บัตรประชาชน" maxLength={13} value={form.nationalId} onChange={update("nationalId")} className={inputClass} />
              <input placeholder="รหัสลงทะเบียน (Code Handraiser)" value={form.registrationCode} onChange={update("registrationCode")} className={inputClass} />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="font-bold text-gray-900 mb-3">ความสนใจและพฤติกรรมลูกค้า</h2>
            <p className="text-xs text-gray-400 mb-3">ติ๊กเลือกได้หลายอย่าง</p>
            <div className="space-y-2">
              {INTEREST_OPTIONS.map(opt => (
                <label key={opt} className="flex items-center gap-2 border border-gray-200 rounded-md px-3 py-2.5 cursor-pointer has-[:checked]:border-[#FFD700] has-[:checked]:bg-[#FFFBE6]">
                  <input type="checkbox" checked={form.customerInterests.includes(opt)} onChange={() => toggleInterest(opt)} />
                  <span className="text-sm">{opt}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="font-bold text-gray-900 mb-4">ข้อมูลการจอง</h2>
            <div className="space-y-3">
              <select required value={form.channel} onChange={update("channel")} className={`${inputClass} bg-white`}>
                <option value="" disabled>-- เลือกช่องทางการรับจอง --</option>
                {RESERVATION_CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="space-y-2">
                <label className="flex items-center gap-2 border border-gray-200 rounded-md px-3 py-2.5 cursor-pointer has-[:checked]:border-[#FFD700] has-[:checked]:bg-[#FFFBE6]">
                  <input type="radio" name="reservationType" checked={form.reservationType === "T"} onChange={() => setForm(p => ({ ...p, reservationType: "T" }))} />
                  <span className="text-sm">จอง T (มัดจำจองจริง)</span>
                </label>
                <label className="flex items-center gap-2 border border-gray-200 rounded-md px-3 py-2.5 cursor-pointer has-[:checked]:border-[#FFD700] has-[:checked]:bg-[#FFFBE6]">
                  <input type="radio" name="reservationType" checked={form.reservationType === "F"} onChange={() => setForm(p => ({ ...p, reservationType: "F" }))} />
                  <span className="text-sm">จอง F (สวมสิทธิ์แคมเปญ)</span>
                </label>
              </div>
              <input required placeholder="พนักงานรับจอง" value={form.staffName} onChange={update("staffName")} className={inputClass} />
              <input required placeholder="เบอร์พนักงาน" value={form.staffPhone} onChange={update("staffPhone")} className={inputClass} />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Wallet className="w-4 h-4" /> การชำระมัดจำ
            </h2>
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="flex items-center gap-2 border border-gray-200 rounded-md px-3 py-2.5 cursor-pointer has-[:checked]:border-[#FFD700] has-[:checked]:bg-[#FFFBE6]">
                  <input type="radio" name="depositStatus" checked={form.depositStatus === "paid"} onChange={() => setForm(p => ({ ...p, depositStatus: "paid" }))} />
                  <span className="text-sm">มัดจำแล้ว</span>
                </label>
                <label className="flex items-center gap-2 border border-gray-200 rounded-md px-3 py-2.5 cursor-pointer has-[:checked]:border-[#FFD700] has-[:checked]:bg-[#FFFBE6]">
                  <input type="radio" name="depositStatus" checked={form.depositStatus === "unpaid"} onChange={() => setForm(p => ({ ...p, depositStatus: "unpaid" }))} />
                  <span className="text-sm">ยังไม่มัดจำ</span>
                </label>
              </div>
              <input required placeholder="เลขที่ใบเสร็จรับเงิน" value={form.receiptNumber} onChange={update("receiptNumber")} className={inputClass} />
              <div>
                <input
                  required
                  type="number"
                  min="0"
                  placeholder="จำนวนเงินมัดจำ (บาท)"
                  value={form.depositAmountInput}
                  onChange={(e) => { setDepositTouched(true); setForm(prev => ({ ...prev, depositAmountInput: e.target.value })); }}
                  className={inputClass}
                />
                <p className="text-[11px] text-gray-400 mt-1">ยอดแนะนำ: {formatTHB(suggestedDeposit)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="font-bold text-gray-900 mb-3">หมายเหตุ / ข้อมูลเพิ่มเติม</h2>
            <textarea rows={3} value={form.notes} onChange={update("notes")} className={`${inputClass} resize-none`} />
          </div>
        </div>

        <div className="w-full md:w-80 flex-shrink-0">
          <div className="bg-white rounded-lg border border-gray-200 p-5 sticky top-24">
            <h2 className="font-bold text-gray-900 mb-4">สรุปการจอง</h2>
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
              <div className="flex justify-between text-gray-600 pt-1.5 border-t border-gray-100">
                <span>ยอดสุทธิ</span>
                <span>{formatTHB(total)}</span>
              </div>
              <div className="flex justify-between font-bold text-gray-900 text-base">
                <span>ยอดมัดจำ (ตามที่กรอก)</span>
                <span className="text-[#FF6B00]">{formatTHB(depositAmount)}</span>
              </div>
              <div className="flex justify-between text-gray-500 text-xs">
                <span>ยอดคงเหลือ (ชำระตอนรับสินค้า)</span>
                <span>{formatTHB(remainingAmount)}</span>
              </div>
            </div>

            {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-4 bg-[#FF6B00] text-white font-bold py-3 rounded-md hover:bg-[#E65A00] transition-colors disabled:opacity-50"
            >
              {submitting ? "กำลังดำเนินการ..." : "ยืนยันการจอง"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
