import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { CATEGORIES } from "../../data/categories";
import ListEditor from "./ListEditor";
import UploadButton from "./UploadButton";
import { callGas } from "../../utils/gas";
import { getAdminGiftsLocal } from "../../utils/localMock";

function toFormState(product) {
  if (!product) {
    return {
      id: "", brand: "", category: CATEGORIES[0].slug, name: "", nameEn: "", sku: "", badge: "",
      tags: "", preOrder: false, priceMin: "", priceMax: "", priceDisplay: "", originalPrice: "",
      pointsRate: "0.01", images: "", description: "",
      colorRows: [], variants: [], specList: [], promotions: [], giftIds: []
    };
  }
  return {
    id: product.id || "",
    brand: product.brand || "",
    category: product.category || CATEGORIES[0].slug,
    name: product.name || "",
    nameEn: product.nameEn || "",
    sku: product.sku || "",
    badge: product.badge || "",
    tags: (product.tags || []).join(", "),
    preOrder: !!product.preOrder,
    priceMin: product.priceMin ?? "",
    priceMax: product.priceMax ?? "",
    priceDisplay: product.priceDisplay ?? "",
    originalPrice: product.originalPrice ?? "",
    pointsRate: product.pointsRate ?? "0.01",
    images: (product.images || []).join("\n"),
    description: product.description || "",
    colorRows: (product.colors || []).map(name => ({
      name,
      hex: (product.colorHex || {})[name] || "#000000",
      images: ((product.imagesByColor || {})[name] || []).join("\n")
    })),
    variants: product.variants || [],
    specList: product.specList || [],
    promotions: product.promotions || [],
    giftIds: (product.freeGiftItems || []).map(g => g.id).filter(Boolean)
  };
}

export default function ProductFormModal({ product, member, onClose, onSave }) {
  const [form, setForm] = useState(() => toFormState(product));
  const [saving, setSaving] = useState(false);
  const [giftCatalog, setGiftCatalog] = useState([]);

  useEffect(() => {
    callGas("getAdminGifts", [member?.email], getAdminGiftsLocal)
      .then(res => { if (res.success) setGiftCatalog(res.gifts); })
      .catch(() => {});
  }, [member?.email]);

  const toggleGift = (giftId) => {
    setForm(prev => ({
      ...prev,
      giftIds: prev.giftIds.includes(giftId)
        ? prev.giftIds.filter(id => id !== giftId)
        : [...prev.giftIds, giftId]
    }));
  };

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        id: form.id || undefined,
        brand: form.brand,
        category: form.category,
        name: form.name,
        nameEn: form.nameEn,
        sku: form.sku,
        badge: form.badge,
        preOrder: !!form.preOrder,
        tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
        priceMin: Number(form.priceMin) || 0,
        priceMax: Number(form.priceMax) || 0,
        priceDisplay: Number(form.priceDisplay) || 0,
        originalPrice: form.originalPrice ? Number(form.originalPrice) : null,
        images: form.images.split("\n").map(s => s.trim()).filter(Boolean),
        specList: form.specList,
        colors: form.colorRows.map(c => c.name).filter(Boolean),
        colorHex: Object.fromEntries(form.colorRows.filter(c => c.name).map(c => [c.name, c.hex || "#000000"])),
        imagesByColor: Object.fromEntries(
          form.colorRows
            .filter(c => c.name && c.images && c.images.trim())
            .map(c => [c.name, c.images.split("\n").map(s => s.trim()).filter(Boolean)])
        ),
        variants: form.variants,
        pointsRate: Number(form.pointsRate) || 0.01,
        giftIds: form.giftIds,
        promotions: form.promotions,
        description: form.description
      };
      await onSave(payload);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto p-6">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700">
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-bold text-gray-900 mb-6">
          {form.id ? "แก้ไขสินค้า" : "เพิ่มสินค้าใหม่"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-gray-700">ข้อมูลพื้นฐาน</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="แบรนด์"><input required value={form.brand} onChange={set("brand")} className="input" /></Field>
              <Field label="หมวดหมู่">
                <select value={form.category} onChange={set("category")} className="input">
                  {CATEGORIES.map(c => <option key={c.slug} value={c.slug}>{c.label}</option>)}
                </select>
              </Field>
              <Field label="ชื่อสินค้า (ไทย)"><input required value={form.name} onChange={set("name")} className="input" /></Field>
              <Field label="ชื่อสินค้า (อังกฤษ)"><input value={form.nameEn} onChange={set("nameEn")} className="input" /></Field>
              <Field label="รุ่น (Model)"><input required value={form.sku} onChange={set("sku")} className="input" placeholder="เช่น IQOO-Z11" /></Field>
              <Field label="ป้ายกำกับ (badge)"><input value={form.badge} onChange={set("badge")} className="input" placeholder="เช่น สินค้าใหม่" /></Field>
              <Field label="แท็ก (คั่นด้วย ,)"><input value={form.tags} onChange={set("tags")} className="input" placeholder="new, bestseller" /></Field>
              <label className="flex items-center gap-2 text-sm text-gray-700 mt-6">
                <input type="checkbox" checked={form.preOrder} onChange={(e) => setForm(prev => ({ ...prev, preOrder: e.target.checked }))} />
                สินค้าพรีออเดอร์
              </label>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-bold text-gray-700">ราคา</h3>
            <div className="grid grid-cols-3 gap-3">
              <Field label="ราคาต่ำสุด"><input required type="number" value={form.priceMin} onChange={set("priceMin")} className="input" /></Field>
              <Field label="ราคาสูงสุด"><input required type="number" value={form.priceMax} onChange={set("priceMax")} className="input" /></Field>
              <Field label="ราคาแสดงผล"><input required type="number" value={form.priceDisplay} onChange={set("priceDisplay")} className="input" /></Field>
              <Field label="ราคาปกติ (ก่อนลด)"><input type="number" value={form.originalPrice} onChange={set("originalPrice")} className="input" /></Field>
              <Field label="อัตราสะสมแต้ม"><input type="number" step="0.01" value={form.pointsRate} onChange={set("pointsRate")} className="input" /></Field>
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-700">รูปภาพ (1 URL ต่อบรรทัด)</h3>
              <UploadButton
                adminEmail={member?.email}
                onUploaded={(urls) => setForm(prev => ({
                  ...prev,
                  images: [prev.images, ...urls].filter(Boolean).join("\n")
                }))}
              />
            </div>
            <textarea value={form.images} onChange={set("images")} rows={3} className="input font-mono text-xs" />
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-gray-700">สี</h3>
            <p className="text-[11px] text-gray-500">กำหนดสีที่มีขายและรูปภาพของแต่ละสี — เลือกใช้สีเหล่านี้ในตาราง SKU ด้านล่าง</p>
            <ListEditor
              items={form.colorRows}
              onChange={(v) => setForm(prev => ({ ...prev, colorRows: v }))}
              newItem={() => ({ name: "", hex: "#000000", images: "" })}
              addLabel="+ เพิ่มสี"
              renderRow={(item, update) => (
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input value={item.name} onChange={(e) => update({ name: e.target.value })} placeholder="ชื่อสี" className="input flex-1" />
                    <input type="color" value={item.hex} onChange={(e) => update({ hex: e.target.value })} className="w-10 h-9 border border-gray-300 rounded flex-shrink-0" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-500">รูปภาพเฉพาะสีนี้ (เว้นว่าง = ใช้รูปเริ่มต้นของสินค้า)</span>
                    <UploadButton
                      adminEmail={member?.email}
                      onUploaded={(urls) => update(prev => ({
                        ...prev,
                        images: [prev.images, ...urls].filter(Boolean).join("\n")
                      }))}
                    />
                  </div>
                  <textarea
                    value={item.images}
                    onChange={(e) => update({ images: e.target.value })}
                    placeholder="URL รูปภาพเฉพาะสีนี้"
                    rows={2}
                    className="input font-mono text-xs"
                  />
                </div>
              )}
            />
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-gray-700">SKU (สี + ความจำ + ราคา + สต๊อก)</h3>
            <p className="text-[11px] text-gray-500">แต่ละแถว = 1 SKU จริง คือสีหนึ่งจับคู่กับความจำหนึ่ง มีสต๊อกแยกเป็นของตัวเอง เว้นว่างช่องสต๊อก = ไม่เปลี่ยนแปลงสต๊อกเดิม</p>
            <ListEditor
              items={form.variants}
              onChange={(v) => setForm(prev => ({ ...prev, variants: v }))}
              newItem={() => ({ color: form.colorRows[0]?.name || "", label: "", sku: "", price: "", stockQty: "" })}
              addLabel="+ เพิ่ม SKU"
              renderRow={(item, update) => (
                <>
                  <select value={item.color || ""} onChange={(e) => update({ color: e.target.value })} className="input w-32 bg-white">
                    <option value="">-- สี --</option>
                    {form.colorRows.filter(c => c.name).map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                  <input value={item.label} onChange={(e) => update({ label: e.target.value })} placeholder="ความจำ เช่น 12+256GB" className="input flex-1" />
                  <input value={item.sku} onChange={(e) => update({ sku: e.target.value })} placeholder="SKU" className="input flex-1" />
                  <input type="number" value={item.price} onChange={(e) => update({ price: Number(e.target.value) })} placeholder="ราคา" className="input w-24" />
                  <input type="number" value={item.stockQty ?? ""} onChange={(e) => update({ stockQty: e.target.value })} placeholder="สต๊อก" className="input w-24" />
                </>
              )}
            />
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-gray-700">สเปคสินค้า</h3>
            <ListEditor
              items={form.specList}
              onChange={(v) => setForm(prev => ({ ...prev, specList: v }))}
              newItem={() => ({ label: "", value: "" })}
              addLabel="+ เพิ่มสเปค"
              renderRow={(item, update) => (
                <>
                  <input value={item.label} onChange={(e) => update({ label: e.target.value })} placeholder="หัวข้อ" className="input flex-1" />
                  <input value={item.value} onChange={(e) => update({ value: e.target.value })} placeholder="ค่า" className="input flex-1" />
                </>
              )}
            />
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-gray-700">โปรโมชั่น</h3>
            <ListEditor
              items={form.promotions}
              onChange={(v) => setForm(prev => ({ ...prev, promotions: v }))}
              newItem={() => ""}
              addLabel="+ เพิ่มโปรโมชั่น"
              renderRow={(item, update) => (
                <input value={item} onChange={(e) => update(() => e.target.value)} placeholder="ข้อความโปรโมชั่น" className="input flex-1" />
              )}
            />
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-bold text-gray-700">ของแถม</h3>
            <p className="text-[11px] text-gray-500">
              เลือกของแถมจากคลังมาแนบกับสินค้ารุ่นนี้ — ถ้ายังไม่มีในคลัง ให้ไปเพิ่มที่แท็บ "ของแถมแบรนด์"/"ของแถมทางร้าน" ก่อน (ของแถมชิ้นเดียวแนบกับสินค้าหลายรุ่นได้ สต๊อกนับรวมกัน)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <GiftPickerBox
                label="ของแถมแบรนด์"
                items={giftCatalog.filter(g => g.type !== "store")}
                selectedIds={form.giftIds}
                onToggle={toggleGift}
              />
              <GiftPickerBox
                label="ของแถมทางร้าน"
                items={giftCatalog.filter(g => g.type === "store")}
                selectedIds={form.giftIds}
                onToggle={toggleGift}
              />
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-gray-700">รายละเอียดสินค้า</h3>
            <textarea required value={form.description} onChange={set("description")} rows={3} className="input" />
          </section>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100">
              ยกเลิก
            </button>
            <button type="submit" disabled={saving} className="bg-[#FFD700] text-black px-6 py-2 rounded-md font-bold text-sm hover:bg-[#E6C200] transition-colors disabled:opacity-50">
              {saving ? "กำลังบันทึก..." : "บันทึกสินค้า"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-600 mb-1 block">{label}</label>
      {children}
    </div>
  );
}

function GiftPickerBox({ label, items, selectedIds, onToggle }) {
  return (
    <div>
      <div className="text-xs font-bold text-gray-600 mb-1.5">{label}</div>
      {items.length === 0 ? (
        <div className="border border-gray-200 rounded-md p-3 text-xs text-gray-400 italic">ยังไม่มีของแถมในคลังนี้</div>
      ) : (
        <div className="border border-gray-200 rounded-md divide-y divide-gray-100 max-h-56 overflow-y-auto">
          {items.map(g => (
            <label key={g.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
              <input type="checkbox" checked={selectedIds.includes(g.id)} onChange={() => onToggle(g.id)} />
              <span className="flex-1">{g.name}</span>
              <span className="text-[11px] text-gray-400 font-mono">{g.sku}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
