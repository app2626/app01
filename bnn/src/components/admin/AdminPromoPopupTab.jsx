import { useState, useEffect } from "react";
import { callGas } from "../../utils/gas";
import { getPromoPopupLocal, savePromoPopupLocal } from "../../utils/localMock";
import { CATEGORIES } from "../../data/categories";
import UploadButton from "./UploadButton";
import PromoPopupModal from "../PromoPopupModal";

const inputClass = "w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-[#FFD700]";

export default function AdminPromoPopupTab({ member }) {
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    callGas("getPromoPopup", [], getPromoPopupLocal)
      .then(setForm)
      .finally(() => setLoading(false));
  }, []);

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    const res = await callGas("savePromoPopup", [form, member.email], savePromoPopupLocal);
    setSaving(false);
    if (res.success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      alert(res.message || "บันทึกไม่สำเร็จ");
    }
  };

  if (loading || !form) {
    return <div className="text-center text-gray-500 py-12">กำลังโหลด...</div>;
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-4">ป๊อปอัพโปรโมชั่น</h2>
      <p className="text-xs text-gray-500 mb-4">แสดงเมื่อลูกค้าเข้าเว็บครั้งแรกของแต่ละเซสชัน (ปิดแล้วจะไม่ขึ้นซ้ำจนกว่าจะเปิดแท็บใหม่)</p>

      <div className="bg-white rounded-lg border border-gray-200 p-5 max-w-xl space-y-4">
        <label className="flex items-center gap-2 cursor-pointer w-fit">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm(prev => ({ ...prev, enabled: e.target.checked }))} />
          <span className="text-sm font-bold text-gray-900">เปิดใช้งานป๊อปอัพ</span>
        </label>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-gray-700">รูปภาพ</label>
            <UploadButton adminEmail={member?.email} onUploaded={(urls) => setForm(prev => ({ ...prev, imageUrl: urls[0] }))} />
          </div>
          <input value={form.imageUrl} onChange={set("imageUrl")} placeholder="URL รูปภาพ (ไม่บังคับ)" className={inputClass} />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 mb-1.5 block">หัวข้อ</label>
          <input value={form.title} onChange={set("title")} placeholder="เช่น โปรโมชั่นพิเศษเดือนนี้!" className={inputClass} />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 mb-1.5 block">รายละเอียด</label>
          <textarea value={form.description} onChange={set("description")} rows={3} className={`${inputClass} resize-none`} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">ปุ่มกด (ไม่บังคับ)</label>
            <input value={form.buttonText} onChange={set("buttonText")} placeholder="เช่น ดูโปรโมชั่น" className={inputClass} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">ปุ่มกดพาไปที่</label>
            <select value={form.linkType} onChange={set("linkType")} className={`${inputClass} bg-white`}>
              <option value="none">ไม่มีลิงก์ (แค่ปิด)</option>
              <option value="promotions">หน้าโปรโมชั่น</option>
              <option value="coupons">หน้าคูปองส่วนลด</option>
              <option value="category">หมวดหมู่สินค้า</option>
            </select>
          </div>
        </div>

        {form.linkType === "category" && (
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">เลือกหมวดหมู่</label>
            <select value={form.linkValue} onChange={set("linkValue")} className={`${inputClass} bg-white`}>
              <option value="">-- เลือกหมวดหมู่ --</option>
              {CATEGORIES.map(c => <option key={c.slug} value={c.slug}>{c.label}</option>)}
            </select>
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#1a1a1a] text-white text-sm font-bold px-5 py-2.5 rounded-md hover:bg-black transition-colors disabled:opacity-50"
          >
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
          <button
            onClick={() => setPreview(true)}
            type="button"
            className="text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            ดูตัวอย่าง
          </button>
          {saved && <span className="text-sm text-green-600">บันทึกแล้ว</span>}
        </div>
      </div>

      {preview && (
        <PromoPopupModal popup={form} onClose={() => setPreview(false)} onNavigate={() => {}} />
      )}
    </div>
  );
}
