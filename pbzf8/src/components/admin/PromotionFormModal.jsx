import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { callGas } from "../../utils/gas";
import { getAdminProductsLocal } from "../../utils/localMock";
import { CATEGORIES } from "../../data/categories";
import ListEditor from "./ListEditor";

function toFormState(promo) {
  if (!promo) {
    return { label: "", discountType: "fixed", value: "", minQtyEach: "1", groups: [], enabled: true };
  }
  return {
    label: promo.label || "",
    discountType: promo.discountType || "fixed",
    value: promo.value ?? "",
    minQtyEach: promo.minQtyEach ?? "1",
    groups: (promo.groups || []).map(g => ({ type: g.type === "category" ? "category" : "product", ids: g.ids || [] })),
    enabled: promo.enabled !== false
  };
}

export default function PromotionFormModal({ promotion, member, onClose, onSave }) {
  const [form, setForm] = useState(() => toFormState(promotion));
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState([]);
  const isEdit = !!promotion;

  useEffect(() => {
    callGas("getAdminProducts", [member?.token], getAdminProductsLocal)
      .then(res => { if (res.success) setProducts(res.products); })
      .catch(() => {});
  }, [member?.token]);

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const toggleGroupId = (groupIdx, id) => {
    setForm(prev => {
      const groups = prev.groups.slice();
      const group = groups[groupIdx];
      groups[groupIdx] = {
        ...group,
        ids: group.ids.includes(id) ? group.ids.filter(x => x !== id) : [...group.ids, id]
      };
      return { ...prev, groups };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        id: promotion?.id,
        label: form.label,
        discountType: form.discountType === "percent" ? "percent" : "fixed",
        value: Number(form.value) || 0,
        minQtyEach: Number(form.minQtyEach) || 1,
        groups: form.groups.filter(g => g.ids.length > 0),
        enabled: !!form.enabled
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto p-6">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700">
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-bold text-gray-900 mb-6">{isEdit ? "แก้ไขโปรโมชั่น" : "เพิ่มโปรโมชั่นใหม่"}</h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">ข้อความโปรโมชั่น</label>
            <input required value={form.label} onChange={set("label")} className="input" placeholder="เช่น ซื้อคู่กับสมาร์ทโฟนลดเพิ่ม ฿500" />
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

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">จำนวนขั้นต่ำต่อเงื่อนไข 1 ข้อ</label>
            <input type="number" min="1" value={form.minQtyEach} onChange={set("minQtyEach")} className="input w-32" />
            <p className="text-[11px] text-gray-400 mt-1">
              1 เงื่อนไข + สินค้า/หมวดหมู่เดียว + จำนวน 2 = "ซื้อ 2 ชิ้นลด" ・ 2 เงื่อนไข + จำนวน 1 = "ซื้อคู่กัน"
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-600 block">เงื่อนไขสินค้า (ต้องซื้อครบทุกเงื่อนไข — แต่ละเงื่อนไขเลือกได้หลายรายการ นับรวมกันแบบ "หรือ")</label>
            <ListEditor
              items={form.groups}
              onChange={(v) => setForm(prev => ({ ...prev, groups: v }))}
              newItem={() => ({ type: "product", ids: [] })}
              addLabel="+ เพิ่มเงื่อนไข"
              renderRow={(group, update) => {
                const groupIdx = form.groups.indexOf(group);
                return (
                  <div className="flex-1 border border-gray-200 rounded-md p-3 space-y-2">
                    <select
                      value={group.type}
                      onChange={(e) => update({ type: e.target.value, ids: [] })}
                      className="input w-40 bg-white"
                    >
                      <option value="product">สินค้าที่ระบุ</option>
                      <option value="category">หมวดหมู่สินค้า</option>
                    </select>

                    {group.type === "category" ? (
                      <div className="border border-gray-200 rounded-md divide-y divide-gray-100 max-h-40 overflow-y-auto">
                        {CATEGORIES.map(c => (
                          <label key={c.slug} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50">
                            <input
                              type="checkbox"
                              checked={group.ids.includes(c.slug)}
                              onChange={() => toggleGroupId(groupIdx, c.slug)}
                            />
                            <span>{c.label}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="border border-gray-200 rounded-md divide-y divide-gray-100 max-h-40 overflow-y-auto">
                        {products.length === 0 ? (
                          <p className="text-xs text-gray-400 italic p-2">กำลังโหลดรายการสินค้า...</p>
                        ) : products.map(p => (
                          <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50">
                            <input
                              type="checkbox"
                              checked={group.ids.includes(p.id)}
                              onChange={() => toggleGroupId(groupIdx, p.id)}
                            />
                            <span className="line-clamp-1">{p.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 pt-1">
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm(prev => ({ ...prev, enabled: e.target.checked }))} />
            เปิดใช้งานโปรโมชั่นนี้
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
