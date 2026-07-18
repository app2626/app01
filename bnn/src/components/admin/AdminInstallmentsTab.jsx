import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { callGas } from "../../utils/gas";
import { getInstallmentSettingsLocal, saveInstallmentSettingsLocal } from "../../utils/localMock";
import { calcInstallments, formatTHB } from "../../utils/format";

const inputClass = "w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-[#FFD700]";
const SAMPLE_PRICE = 10000;

export default function AdminInstallmentsTab({ member }) {
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    callGas("getInstallmentSettings", [], getInstallmentSettingsLocal)
      .then(setForm)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    const res = await callGas("saveInstallmentSettings", [form, member.email], saveInstallmentSettingsLocal);
    setSaving(false);
    if (res.success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      alert(res.message || "บันทึกไม่สำเร็จ");
    }
  };

  const updateBank = (idx, patch) => {
    setForm(prev => ({
      ...prev,
      banks: prev.banks.map((b, i) => i === idx ? (typeof patch === "function" ? patch(b) : { ...b, ...patch }) : b)
    }));
  };
  const removeBank = (idx) => {
    setForm(prev => ({ ...prev, banks: prev.banks.filter((_, i) => i !== idx) }));
  };
  const addBank = () => {
    setForm(prev => ({ ...prev, banks: [...prev.banks, { name: "", months: [] }] }));
  };

  const addMonth = (bankIdx) => {
    updateBank(bankIdx, b => ({ ...b, months: [...b.months, ""] }));
  };
  const updateMonth = (bankIdx, monthIdx, value) => {
    updateBank(bankIdx, b => ({ ...b, months: b.months.map((m, i) => i === monthIdx ? value : m) }));
  };
  const removeMonth = (bankIdx, monthIdx) => {
    updateBank(bankIdx, b => ({ ...b, months: b.months.filter((_, i) => i !== monthIdx) }));
  };

  if (loading || !form) {
    return <div className="text-center text-gray-500 py-12">กำลังโหลด...</div>;
  }

  const previewRows = form.enabled
    ? calcInstallments(
        SAMPLE_PRICE,
        form.banks
          .filter(b => b.name)
          .map(b => ({ name: b.name, months: b.months.map(Number).filter(m => m > 0) }))
      )
    : [];

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-4">ผ่อนชำระผ่านบัตรเครดิต</h2>
      <p className="text-xs text-gray-500 mb-4">
        ตารางนี้จะแสดงในหน้ารายละเอียดสินค้าทุกชิ้น (ดอกเบี้ย 0% เสมอ ยอดผ่อน/เดือนคำนวณจากราคาสินค้าอัตโนมัติ) — แต่ละธนาคารกำหนดระยะเวลาผ่อนของตัวเองได้ เพราะบางธนาคารร่วมรายการจำนวนเดือนไม่เท่ากัน
      </p>

      <div className="bg-white rounded-lg border border-gray-200 p-5 max-w-xl space-y-5">
        <label className="flex items-center gap-2 cursor-pointer w-fit">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm(prev => ({ ...prev, enabled: e.target.checked }))} />
          <span className="text-sm font-bold text-gray-900">แสดงตารางผ่อนชำระ</span>
        </label>

        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">ธนาคาร/บัตรเครดิตที่รองรับ</label>
          <div className="space-y-3">
            {form.banks.map((bank, bankIdx) => (
              <div key={bankIdx} className="border border-gray-100 rounded-md p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    value={bank.name}
                    onChange={(e) => updateBank(bankIdx, { name: e.target.value })}
                    placeholder="เช่น KBANK"
                    className={inputClass}
                  />
                  <button type="button" onClick={() => removeBank(bankIdx)} className="text-gray-400 hover:text-red-600 flex-shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="pl-1">
                  <span className="text-xs text-gray-500 mb-1 block">ระยะเวลาผ่อนของธนาคารนี้ (เดือน)</span>
                  <div className="flex flex-wrap gap-2">
                    {bank.months.map((m, monthIdx) => (
                      <div key={monthIdx} className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-md px-2 py-1">
                        <input
                          type="number"
                          min="1"
                          value={m}
                          onChange={(e) => updateMonth(bankIdx, monthIdx, e.target.value)}
                          placeholder="6"
                          className="w-14 text-sm outline-none bg-transparent"
                        />
                        <button type="button" onClick={() => removeMonth(bankIdx, monthIdx)} className="text-gray-400 hover:text-red-600">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addMonth(bankIdx)}
                      className="text-xs font-medium text-[#B8860B] hover:underline px-1"
                    >
                      + เพิ่มเดือน
                    </button>
                  </div>
                </div>
              </div>
            ))}
            <button type="button" onClick={addBank} className="text-xs font-medium text-[#B8860B] hover:underline">
              + เพิ่มธนาคาร
            </button>
          </div>
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

      <div className="mt-6 max-w-xl">
        <h3 className="text-sm font-bold text-gray-900 mb-2">ตัวอย่าง (ราคาสินค้าสมมติ {formatTHB(SAMPLE_PRICE)})</h3>
        {previewRows.length === 0 ? (
          <div className="text-xs text-gray-400 border border-gray-100 rounded-lg p-4 text-center">
            {form.enabled ? "ยังไม่มีธนาคาร/ระยะเวลาให้แสดง" : "ปิดการแสดงผลอยู่ — จะไม่ขึ้นในหน้าสินค้า"}
          </div>
        ) : (
          <div className="border border-gray-100 rounded-lg overflow-hidden text-xs">
            <div className="grid grid-cols-3 bg-gray-50 font-medium text-gray-500 p-2">
              <span>ธนาคาร</span>
              <span>ระยะเวลา</span>
              <span className="text-right">ยอดผ่อน/เดือน</span>
            </div>
            {previewRows.map((row, idx) => (
              <div key={idx} className={`grid grid-cols-3 p-2 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                <span className="font-medium text-gray-800">{row.bank}</span>
                <span className="text-gray-600">0% x {row.months} เดือน</span>
                <span className="text-right font-medium text-gray-900">{formatTHB(row.monthly)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
