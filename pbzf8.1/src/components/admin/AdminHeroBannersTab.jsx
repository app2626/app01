import { useState, useEffect } from "react";
import { callGas } from "../../utils/gas";
import { getHeroBannersLocal, saveHeroBannersLocal } from "../../utils/localMock";
import { CATEGORIES } from "../../data/categories";
import ListEditor from "./ListEditor";
import UploadButton from "./UploadButton";
import HeroBanner from "../HeroBanner";

const inputClass = "w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-[#FFD700]";

function newSlide() {
  return { imageUrl: "", title: "", subtitle: "", bgColor: "#FFD700", textColor: "black", linkType: "none", linkValue: "" };
}

export default function AdminHeroBannersTab({ member }) {
  const [slides, setSlides] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [previewIdx, setPreviewIdx] = useState(null);

  useEffect(() => {
    callGas("getHeroBanners", [], getHeroBannersLocal)
      .then(setSlides)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    const res = await callGas("saveHeroBanners", [slides, member.token], saveHeroBannersLocal);
    setSaving(false);
    if (res.success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      alert(res.message || "บันทึกไม่สำเร็จ");
    }
  };

  if (loading || !slides) {
    return <div className="text-center text-gray-500 py-12">กำลังโหลด...</div>;
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-4">แบนเนอร์หน้าแรก (Hero Banner)</h2>
      <p className="text-xs text-gray-500 mb-4">สไลด์แบนเนอร์บนสุดของหน้าแรก ถ้าไม่มีสไลด์เลยจะใช้แบนเนอร์เริ่มต้นของระบบแทน</p>

      <div className="max-w-2xl">
        <ListEditor
          items={slides}
          onChange={setSlides}
          newItem={newSlide}
          addLabel="+ เพิ่มสไลด์แบนเนอร์"
          renderRow={(item, update) => (
            <div className="flex-1 bg-white rounded-lg border border-gray-200 p-4 space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-700">รูปพื้นหลัง (ไม่บังคับ)</label>
                  <UploadButton token={member?.token} onUploaded={(urls) => update({ imageUrl: urls[0] })} />
                </div>
                <input value={item.imageUrl} onChange={(e) => update({ imageUrl: e.target.value })} placeholder="URL รูปภาพ" className={inputClass} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">หัวข้อ</label>
                  <input value={item.title} onChange={(e) => update({ title: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">คำโปรย</label>
                  <input value={item.subtitle} onChange={(e) => update({ subtitle: e.target.value })} className={inputClass} />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">สีพื้นหลัง</label>
                  <input type="color" value={item.bgColor} onChange={(e) => update({ bgColor: e.target.value })} className="w-full h-8 border border-gray-300 rounded" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">สีตัวอักษร</label>
                  <select value={item.textColor} onChange={(e) => update({ textColor: e.target.value })} className={`${inputClass} bg-white`}>
                    <option value="black">ดำ</option>
                    <option value="white">ขาว</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-700 mb-1 block">คลิกแล้วพาไปที่</label>
                  <select value={item.linkType} onChange={(e) => update({ linkType: e.target.value })} className={`${inputClass} bg-white`}>
                    <option value="none">ไม่มีลิงก์</option>
                    <option value="promotions">หน้าโปรโมชั่น</option>
                    <option value="coupons">หน้าคูปองส่วนลด</option>
                    <option value="category">หมวดหมู่สินค้า</option>
                  </select>
                </div>
              </div>

              {item.linkType === "category" && (
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">เลือกหมวดหมู่</label>
                  <select value={item.linkValue} onChange={(e) => update({ linkValue: e.target.value })} className={`${inputClass} bg-white`}>
                    <option value="">-- เลือกหมวดหมู่ --</option>
                    {CATEGORIES.map(c => <option key={c.slug} value={c.slug}>{c.label}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}
        />

        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#1a1a1a] text-white text-sm font-bold px-5 py-2.5 rounded-md hover:bg-black transition-colors disabled:opacity-50"
          >
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
          <button
            onClick={() => setPreviewIdx(0)}
            type="button"
            className="text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            ดูตัวอย่าง
          </button>
          {saved && <span className="text-sm text-green-600">บันทึกแล้ว</span>}
        </div>

        {previewIdx !== null && (
          <div className="mt-6">
            <p className="text-xs text-gray-500 mb-2">ตัวอย่าง:</p>
            <HeroBanner slides={slides} onNavigate={() => {}} />
          </div>
        )}
      </div>
    </div>
  );
}
