import { useState, useEffect } from "react";
import { Pencil, Trash2, Plus } from "lucide-react";
import { callGas } from "../../utils/gas";
import { getAdminGiftsLocal, saveGiftLocal, deleteGiftLocal } from "../../utils/localMock";
import GiftFormModal from "./GiftFormModal";

export default function AdminGiftsTab({ member, type, title }) {
  const [gifts, setGifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = () => {
    setLoading(true);
    callGas("getAdminGifts", [member.email], getAdminGiftsLocal)
      .then(res => {
        if (res.success) setGifts(res.gifts.filter(g => (g.type === "store" ? "store" : "brand") === type));
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [member.email, type]);

  const openNew = () => { setEditing(null); setShowForm(true); };
  const openEdit = (g) => { setEditing(g); setShowForm(true); };

  const handleSave = async (payload) => {
    const res = await callGas("saveGift", [payload, member.email], saveGiftLocal);
    if (res.success) {
      setShowForm(false);
      load();
    } else {
      alert(res.message || "บันทึกไม่สำเร็จ");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("ยืนยันการลบของแถมนี้? (สินค้าที่แนบของแถมนี้ไว้จะไม่แสดงของแถมอีกต่อไป)")) return;
    const res = await callGas("deleteGift", [id, member.email], deleteGiftLocal);
    if (res.success) load();
    else alert(res.message || "ลบไม่สำเร็จ");
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 bg-[#FFD700] text-black px-4 py-2 rounded-md font-medium text-sm hover:bg-[#E6C200] transition-colors"
        >
          <Plus className="w-4 h-4" /> เพิ่มของแถมใหม่
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-4">สร้างของแถมไว้ที่นี่ก่อน แล้วไปเลือกแนบกับสินค้าแต่ละรุ่นได้ที่หน้าแก้ไขสินค้า (ของแถมชิ้นเดียวแนบกับสินค้าหลายรุ่นได้ สต๊อกจะนับรวมกัน)</p>

      {loading ? (
        <div className="text-center text-gray-500 py-12">กำลังโหลด...</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="p-3 font-medium">ชื่อของแถม</th>
                <th className="p-3 font-medium">SKU</th>
                <th className="p-3 font-medium">สต๊อก</th>
                <th className="p-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {gifts.map(g => (
                <tr key={g.id} className="border-b border-gray-50 last:border-0">
                  <td className="p-3">{g.name}</td>
                  <td className="p-3 font-mono text-xs text-gray-600">{g.sku || "-"}</td>
                  <td className="p-3">
                    {g.stockQty === null ? (
                      <span className="text-gray-400">-</span>
                    ) : (
                      <span className={g.stockQty > 0 ? "text-green-600 font-medium" : "text-red-500 font-medium"}>{g.stockQty}</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(g)} className="text-gray-500 hover:text-black">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(g.id)} className="text-gray-500 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {gifts.length === 0 && (
            <div className="text-center text-gray-400 py-12">ยังไม่มีของแถมในคลังนี้</div>
          )}
        </div>
      )}

      {showForm && (
        <GiftFormModal
          gift={editing}
          type={type}
          title={title}
          onClose={() => setShowForm(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
