import { useState } from "react";
import { Ticket, Check } from "lucide-react";

export default function CouponsPage({ coupons, collectedCoupons, onCollect }) {
  const [justCollected, setJustCollected] = useState(null);

  const handleCollect = (coupon) => {
    onCollect(coupon);
    setJustCollected(coupon.code);
    setTimeout(() => setJustCollected(null), 1500);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900 mb-1">คูปองส่วนลด</h1>
      <p className="text-sm text-gray-500 mb-6">เก็บคูปองไว้ใช้ตอนชำระเงิน</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(coupons || []).map(coupon => {
          const collected = collectedCoupons.includes(coupon.code);
          const exhausted = coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit;
          const unavailable = coupon.expired || exhausted;
          return (
            <div key={coupon.code} className={`bg-white rounded-lg border border-dashed p-4 flex items-center gap-4 ${unavailable ? "border-gray-300 opacity-60" : "border-[#FFD700]"}`}>
              <div className="w-12 h-12 rounded-full bg-[#FFFBE6] flex items-center justify-center flex-shrink-0">
                <Ticket className="w-6 h-6 text-[#B8860B]" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-gray-900">{coupon.label}</h3>
                <p className="text-xs text-gray-500 mb-1">{coupon.description}</p>
                <p className="text-[11px] font-mono text-gray-400">โค้ด: {coupon.code}</p>
                {coupon.expiryDate && (
                  <p className="text-[11px] text-gray-400">
                    {coupon.expired ? "หมดอายุแล้ว" : `ใช้ได้ถึง ${new Date(coupon.expiryDate).toLocaleDateString("th-TH")}`}
                  </p>
                )}
                {coupon.usageLimit > 0 && (
                  <p className="text-[11px] text-gray-400">
                    {exhausted ? "ถูกใช้ครบจำนวนแล้ว" : `เหลือสิทธิ์ใช้ ${coupon.usageLimit - coupon.usedCount} ครั้ง`}
                  </p>
                )}
              </div>
              <button
                onClick={() => handleCollect(coupon)}
                disabled={collected || unavailable}
                className={`flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                  collected
                    ? "bg-green-50 text-green-600 border border-green-200"
                    : unavailable
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-[#FFD700] text-black hover:bg-[#E6C200]"
                }`}
              >
                {collected ? (
                  <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5" /> เก็บแล้ว</span>
                ) : unavailable ? (
                  "ใช้ไม่ได้แล้ว"
                ) : justCollected === coupon.code ? "เก็บแล้ว!" : "เก็บคูปอง"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
