import { useState } from "react";
import { X } from "lucide-react";

function toFormState(coupon) {
  if (!coupon) {
    return {
      code: "", label: "", description: "", discountType: "fixed", value: "",
      minSpend: "0", maxDiscount: "", expiryDate: "", usageLimit: "0", perCustomerLimit: "0", enabled: true
    };
  }
  return {
    code: coupon.code || "",
    label: coupon.label || "",
    description: coupon.description || "",
    discountType: coupon.discountType || "fixed",
    value: coupon.value ?? "",
    minSpend: coupon.minSpend ?? "0",
    maxDiscount: coupon.maxDiscount ?? "",
    expiryDate: coupon.expiryDate ? new Date(coupon.expiryDate).toISOString().slice(0, 10) : "",
    usageLimit: coupon.usageLimit ?? "0",
    perCustomerLimit: coupon.perCustomerLimit ?? "0",
    enabled: coupon.enabled !== false
  };
}

export default function CouponFormModal({ coupon, onClose, onSave }) {
  const [form, setForm] = useState(() => toFormState(coupon));
  const [saving, setSaving] = useState(false);
  const isEdit = !!coupon;

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        code: form.code,
        label: form.label,
        description: form.description,
        discountType: form.discountType,
        value: Number(form.value) || 0,
        minSpend: Number(form.minSpend) || 0,
        maxDiscount: form.discountType === "percent" && form.maxDiscount ? Number(form.maxDiscount) : null,
        expiryDate: form.expiryDate || "",
        usageLimit: Number(form.usageLimit) || 0,
        perCustomerLimit: Number(form.perCustomerLimit) || 0,
        enabled: !!form.enabled
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto p-6">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700">
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-bold text-gray-900 mb-6">{isEdit ? "แก้ไขคูปอง" : "เพิ่มคูปองใหม่"}</h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">โค้ดคูปอง</label>
            <input
              required
              disabled={isEdit}
              value={form.code}
              onChange={set("code")}
              placeholder="เช่น I7STORE100"
              className="input disabled:bg-gray-100 disabled:text-gray-400"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">ชื่อคูปอง</label>
            <input required value={form.label} onChange={set("label")} className="input" placeholder="เช่น ส่วนลด ฿100" />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">รายละเอียด</label>
            <input value={form.description} onChange={set("description")} className="input" placeholder="เงื่อนไขการใช้งาน" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">ประเภทส่วนลด</label>
              <select value={form.discountType} onChange={set("discountType")} className="input bg-white">
                <option value="fixed">ลดเป็นจำนวนเงิน (บาท)</option>
                <option value="percent">ลดเป็นเปอร์เซ็นต์ (%)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">
                {form.discountType === "percent" ? "ลด (%)" : "ลด (บาท)"}
              </label>
              <input required type="number" min="0" value={form.value} onChange={set("value")} className="input" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">ยอดซื้อขั้นต่ำ (บาท)</label>
              <input type="number" min="0" value={form.minSpend} onChange={set("minSpend")} className="input" />
            </div>
            {form.discountType === "percent" && (
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">ลดสูงสุด (บาท)</label>
                <input type="number" min="0" value={form.maxDiscount} onChange={set("maxDiscount")} className="input" placeholder="ไม่จำกัด" />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">วันหมดอายุ</label>
              <input type="date" value={form.expiryDate} onChange={set("expiryDate")} className="input" />
              <p className="text-[11px] text-gray-400 mt-1">เว้นว่าง = ไม่มีวันหมดอายุ</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">จำกัดจำนวนครั้งใช้</label>
              <input type="number" min="0" value={form.usageLimit} onChange={set("usageLimit")} className="input" />
              <p className="text-[11px] text-gray-400 mt-1">0 = ไม่จำกัด (รวมทุกลูกค้า)</p>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">จำกัดจำนวนครั้งใช้ต่อคน</label>
            <input type="number" min="0" value={form.perCustomerLimit} onChange={set("perCustomerLimit")} className="input" />
            <p className="text-[11px] text-gray-400 mt-1">0 = ไม่จำกัด (นับจากอีเมลสมาชิก/อีเมล guest ที่กรอกตอนเช็คเอาท์)</p>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 pt-1">
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm(prev => ({ ...prev, enabled: e.target.checked }))} />
            เปิดใช้งานคูปองนี้
          </label>

          <div className="flex items-center gap-3 pt-3">
            <button
              type="submit"
              disabled={saving}
              className="bg-[#1a1a1a] text-white text-sm font-bold px-5 py-2.5 rounded-md hover:bg-black transition-colors disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
            <button type="button" onClick={onClose} className="text-sm font-medium text-gray-600 hover:text-gray-900">
              ยกเลิก
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
