import { useState, useEffect } from "react";
import { Pencil, Trash2, Plus } from "lucide-react";
import { callGas } from "../../utils/gas";
import { getAdminPromotionsLocal, savePromotionLocal, deletePromotionLocal, getAdminProductsLocal } from "../../utils/localMock";
import { getCategoryLabel } from "../../data/categories";
import PromotionFormModal from "./PromotionFormModal";

function describeGroup(group, productNameMap) {
  const labels = (group.ids || []).map(id => group.type === "category" ? getCategoryLabel(id) : (productNameMap[id] || id));
  return labels.join(" หรือ ");
}

function describePromotion(promo, productNameMap) {
  return (promo.groups || []).map(g => describeGroup(g, productNameMap)).join(" + ");
}

export default function AdminPromotionsTab({ member }) {
  const [promotions, setPromotions] = useState([]);
  const [productNameMap, setProductNameMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      callGas("getAdminPromotions", [member.email], getAdminPromotionsLocal),
      callGas("getAdminProducts", [member.email], getAdminProductsLocal)
    ])
      .then(([promoRes, productRes]) => {
        if (promoRes.success) setPromotions(promoRes.promotions);
        if (productRes.success) {
          const map = {};
          productRes.products.forEach(p => { map[p.id] = p.name; });
          setProductNameMap(map);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [member.email]);

  const openNew = () => { setEditing(null); setShowForm(true); };
  const openEdit = (p) => { setEditing(p); setShowForm(true); };

  const handleSave = async (payload) => {
    const res = await callGas("savePromotion", [payload, member.email], savePromotionLocal);
    if (res.success) {
      setShowForm(false);
      load();
    } else {
      alert(res.message || "บันทึกไม่สำเร็จ");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("ยืนยันการลบโปรโมชั่นนี้?")) return;
    const res = await callGas("deletePromotion", [id, member.email], deletePromotionLocal);
    if (res.success) load();
    else alert(res.message || "ลบไม่สำเร็จ");
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-gray-900">โปรโมชั่น</h2>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 bg-[#FFD700] text-black px-4 py-2 rounded-md font-medium text-sm hover:bg-[#E6C200] transition-colors"
        >
          <Plus className="w-4 h-4" /> เพิ่มโปรโมชั่นใหม่
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-4">ตั้งค่าเซตโปรโมชั่น เช่น ซื้อคู่กับสินค้าอื่น หรือซื้อสินค้าเดียวกันหลายชิ้นแล้วลดราคา ระบบจะคำนวณส่วนลดให้อัตโนมัติตอนลูกค้าชำระเงิน ไม่ต้องใช้โค้ด</p>

      {loading ? (
        <div className="text-center text-gray-500 py-12">กำลังโหลด...</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="p-3 font-medium">โปรโมชั่น</th>
                <th className="p-3 font-medium">ส่วนลด</th>
                <th className="p-3 font-medium">เงื่อนไข</th>
                <th className="p-3 font-medium">สถานะ</th>
                <th className="p-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {promotions.map(p => (
                <tr key={p.id} className="border-b border-gray-50 last:border-0">
                  <td className="p-3">{p.label}</td>
                  <td className="p-3 text-gray-600">
                    {p.discountType === "percent" ? `${p.value}%` : `฿${p.value.toLocaleString("th-TH")}`}
                  </td>
                  <td className="p-3 text-xs text-gray-500">
                    ซื้อ {describePromotion(p, productNameMap)} อย่างละ ≥{p.minQtyEach} ชิ้น
                  </td>
                  <td className="p-3">
                    {p.enabled ? (
                      <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded">ใช้งานได้</span>
                    ) : (
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">ปิดใช้งาน</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(p)} className="text-gray-500 hover:text-black">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(p.id)} className="text-gray-500 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {promotions.length === 0 && (
            <div className="text-center text-gray-400 py-12">ยังไม่มีโปรโมชั่น</div>
          )}
        </div>
      )}

      {showForm && (
        <PromotionFormModal
          promotion={editing}
          member={member}
          onClose={() => setShowForm(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
