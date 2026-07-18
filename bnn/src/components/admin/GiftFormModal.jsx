import { useState } from "react";
import { X } from "lucide-react";

function toFormState(gift) {
  if (!gift) {
    return { name: "", sku: "", stockQty: "" };
  }
  return {
    name: gift.name || "",
    sku: gift.sku || "",
    stockQty: gift.stockQty ?? ""
  };
}

export default function GiftFormModal({ gift, type, title, onClose, onSave }) {
  const [form, setForm] = useState(() => toFormState(gift));
  const [saving, setSaving] = useState(false);
  const isEdit = !!gift;

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        id: gift?.id,
        name: form.name,
        sku: form.sku,
        type,
        stockQty: form.stockQty
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

        <h2 className="text-lg font-bold text-gray-900 mb-1">{isEdit ? "แก้ไขของแถม" : "เพิ่มของแถมใหม่"}</h2>
        <p className="text-xs text-gray-500 mb-6">{title}</p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">ชื่อของแถม</label>
            <input required value={form.name} onChange={set("name")} className="input" placeholder="เช่น เคสซิลิโคนกันกระแทก มูลค่า ฿290" />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">SKU</label>
            <input value={form.sku} onChange={set("sku")} className="input" placeholder="เช่น GIFT-CASE-001" />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">จำนวนสต๊อก</label>
            <input type="number" min="0" value={form.stockQty} onChange={set("stockQty")} className="input" placeholder="เว้นว่าง = ไม่เปลี่ยนแปลงสต๊อกเดิม" />
          </div>

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
