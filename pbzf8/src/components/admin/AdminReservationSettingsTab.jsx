import { useState, useEffect } from "react";
import { callGas } from "../../utils/gas";
import { getReservationSettingsLocal, saveReservationSettingsLocal } from "../../utils/localMock";
import { formatTHB } from "../../utils/format";

const SAMPLE_TOTAL = 10000;

export default function AdminReservationSettingsTab({ member }) {
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    callGas("getReservationSettings", [], getReservationSettingsLocal)
      .then(setForm)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    const res = await callGas("saveReservationSettings", [form, member.token], saveReservationSettingsLocal);
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

  const depositAmount = Math.max(0, Number(form.depositAmount) || 0);
  const remainingAmount = Math.max(0, SAMPLE_TOTAL - depositAmount);

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-4">ตั้งค่ามัดจำการจอง</h2>
      <p className="text-xs text-gray-500 mb-4">
        ยอดนี้คือ "ยอดแนะนำ" ที่จะขึ้นให้พนักงานดูอ้างอิงตอนกรอกฟอร์มรับจอง (พนักงานยังแก้ไขเป็นยอดจริงที่เก็บได้เสมอ) — ปรับยอดนี้แล้วจะมีผลกับการจองใหม่ตั้งแต่ตอนนั้นเป็นต้นไป (ไม่กระทบการจองเก่าที่บันทึกไว้แล้ว)
      </p>

      <div className="bg-white rounded-lg border border-gray-200 p-5 max-w-md space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">จำนวนเงินมัดจำ (บาท)</label>
          <input
            type="number"
            min="0"
            value={form.depositAmount}
            onChange={(e) => setForm(prev => ({ ...prev, depositAmount: e.target.value }))}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-[#FFD700]"
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#1a1a1a] text-white text-sm font-bold px-5 py-2.5 rounded-md hover:bg-black transition-colors disabled:opacity-50"
          >
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
          {saved && <span className="text-sm text-green-600">บันทึกแล้ว</span>}
        </div>
      </div>

      <div className="mt-6 max-w-md">
        <h3 className="text-sm font-bold text-gray-900 mb-2">ตัวอย่าง (ยอดจอง {formatTHB(SAMPLE_TOTAL)})</h3>
        <div className="border border-gray-100 rounded-lg overflow-hidden text-sm">
          <div className="flex justify-between p-3 bg-white border-b border-gray-100">
            <span className="text-gray-600">ยอดมัดจำแนะนำ</span>
            <span className="font-bold text-[#FF6B00]">{formatTHB(depositAmount)}</span>
          </div>
          <div className="flex justify-between p-3 bg-gray-50">
            <span className="text-gray-600">ยอดคงเหลือ (ชำระตอนรับสินค้า)</span>
            <span className="font-medium text-gray-900">{formatTHB(remainingAmount)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
