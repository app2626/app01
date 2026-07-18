import { useState, useEffect } from "react";
import { Pencil, Trash2, Plus } from "lucide-react";
import { callGas } from "../../utils/gas";
import { getAdminCouponsLocal, saveCouponLocal, deleteCouponLocal } from "../../utils/localMock";
import { formatTHB } from "../../utils/format";
import CouponFormModal from "./CouponFormModal";

export default function AdminCouponsTab({ member }) {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = () => {
    setLoading(true);
    callGas("getAdminCoupons", [member.email], getAdminCouponsLocal)
      .then(res => {
        if (res.success) setCoupons(res.coupons);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [member.email]);

  const openNew = () => { setEditing(null); setShowForm(true); };
  const openEdit = (c) => { setEditing(c); setShowForm(true); };

  const handleSave = async (payload) => {
    const res = await callGas("saveCoupon", [payload, member.email], saveCouponLocal);
    if (res.success) {
      setShowForm(false);
      load();
    } else {
      alert(res.message || "บันทึกไม่สำเร็จ");
    }
  };

  const handleDelete = async (code) => {
    if (!window.confirm("ยืนยันการลบคูปองนี้?")) return;
    const res = await callGas("deleteCoupon", [code, member.email], deleteCouponLocal);
    if (res.success) load();
    else alert(res.message || "ลบไม่สำเร็จ");
  };

  const isExpired = (c) => !!c.expiryDate && new Date(c.expiryDate).getTime() < Date.now();
  const isExhausted = (c) => c.usageLimit > 0 && c.usedCount >= c.usageLimit;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-gray-900">คูปองส่วนลด</h2>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 bg-[#FFD700] text-black px-4 py-2 rounded-md font-medium text-sm hover:bg-[#E6C200] transition-colors"
        >
          <Plus className="w-4 h-4" /> เพิ่มคูปองใหม่
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-12">กำลังโหลด...</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="p-3 font-medium">โค้ด</th>
                <th className="p-3 font-medium">ส่วนลด</th>
                <th className="p-3 font-medium">วันหมดอายุ</th>
                <th className="p-3 font-medium">การใช้งาน</th>
                <th className="p-3 font-medium">สถานะ</th>
                <th className="p-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {coupons.map(c => {
                const expired = isExpired(c);
                const exhausted = isExhausted(c);
                return (
                  <tr key={c.code} className="border-b border-gray-50 last:border-0">
                    <td className="p-3">
                      <div className="font-mono font-medium">{c.code}</div>
                      <div className="text-xs text-gray-500">{c.label}</div>
                    </td>
                    <td className="p-3 text-gray-600">
                      {c.discountType === "percent" ? `${c.value}%` : formatTHB(c.value)}
                      {c.minSpend > 0 && <div className="text-xs text-gray-400">ขั้นต่ำ {formatTHB(c.minSpend)}</div>}
                    </td>
                    <td className="p-3 text-gray-600">
                      {c.expiryDate ? new Date(c.expiryDate).toLocaleDateString("th-TH") : "ไม่มีกำหนด"}
                    </td>
                    <td className="p-3 text-gray-600">
                      {c.usageLimit > 0 ? `${c.usedCount} / ${c.usageLimit}` : `${c.usedCount} / ไม่จำกัด`}
                      {c.perCustomerLimit > 0 && (
                        <div className="text-xs text-gray-400">สูงสุด {c.perCustomerLimit} ครั้ง/คน</div>
                      )}
                    </td>
                    <td className="p-3">
                      {!c.enabled ? (
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">ปิดใช้งาน</span>
                      ) : expired ? (
                        <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded">หมดอายุ</span>
                      ) : exhausted ? (
                        <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded">ใช้ครบแล้ว</span>
                      ) : (
                        <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded">ใช้งานได้</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => openEdit(c)} className="text-gray-500 hover:text-black">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(c.code)} className="text-gray-500 hover:text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {coupons.length === 0 && (
            <div className="text-center text-gray-400 py-12">ยังไม่มีคูปอง</div>
          )}
        </div>
      )}

      {showForm && (
        <CouponFormModal
          coupon={editing}
          onClose={() => setShowForm(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
