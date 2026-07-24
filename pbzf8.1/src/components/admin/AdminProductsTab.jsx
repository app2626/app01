import { useState, useEffect } from "react";
import { Pencil, Trash2, Plus } from "lucide-react";
import { callGas } from "../../utils/gas";
import { getAdminProductsLocal, saveProductLocal, deleteProductLocal } from "../../utils/localMock";
import { getCategoryLabel } from "../../data/categories";
import { formatTHB } from "../../utils/format";
import ProductFormModal from "./ProductFormModal";

export default function AdminProductsTab({ member }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = () => {
    setLoading(true);
    callGas("getAdminProducts", [member.token], getAdminProductsLocal)
      .then(res => {
        if (res.success) setProducts(res.products);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [member.token]);

  const openNew = () => { setEditing(null); setShowForm(true); };
  const openEdit = (p) => { setEditing(p); setShowForm(true); };

  const handleSave = async (payload) => {
    const res = await callGas("saveProduct", [payload, member.token], saveProductLocal);
    if (res.success) {
      setShowForm(false);
      load();
    } else {
      alert(res.message || "บันทึกไม่สำเร็จ");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("ยืนยันการลบสินค้านี้?")) return;
    const res = await callGas("deleteProduct", [id, member.token], deleteProductLocal);
    if (res.success) load();
    else alert(res.message || "ลบไม่สำเร็จ");
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-gray-900">รายการสินค้า</h2>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 bg-[#FFD700] text-black px-4 py-2 rounded-md font-medium text-sm hover:bg-[#E6C200] transition-colors"
        >
          <Plus className="w-4 h-4" /> เพิ่มสินค้าใหม่
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-12">กำลังโหลด...</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="p-3 font-medium">สินค้า</th>
                <th className="p-3 font-medium">แบรนด์</th>
                <th className="p-3 font-medium">หมวดหมู่</th>
                <th className="p-3 font-medium">ราคา</th>
                <th className="p-3 font-medium">สต๊อก</th>
                <th className="p-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} className="border-b border-gray-50 last:border-0">
                  <td className="p-3 flex items-center gap-3">
                    <img src={p.images?.[0]} alt="" className="w-10 h-10 rounded object-cover bg-gray-100 flex-shrink-0" />
                    <span className="line-clamp-1 max-w-[220px]">{p.name}</span>
                  </td>
                  <td className="p-3 text-gray-600">{p.brand}</td>
                  <td className="p-3 text-gray-600">{getCategoryLabel(p.category)}</td>
                  <td className="p-3 font-medium">{formatTHB(p.priceDisplay)}</td>
                  <td className="p-3">
                    {!p.variants?.length || p.variants.every(v => v.stockQty === null) ? (
                      <span className="text-gray-400">-</span>
                    ) : p.variants.length === 1 ? (
                      <span className={p.variants[0].stockQty > 0 ? "text-green-600" : "text-red-500"}>{p.variants[0].stockQty ?? "-"}</span>
                    ) : (
                      <div className="space-y-0.5">
                        {p.variants.map((v, idx) => (
                          <div key={idx} className="text-xs whitespace-nowrap">
                            <span className="text-gray-500">{v.color ? `${v.color} - ${v.label}` : v.label}: </span>
                            <span className={v.stockQty > 0 ? "text-green-600 font-medium" : "text-red-500 font-medium"}>{v.stockQty ?? "-"}</span>
                          </div>
                        ))}
                      </div>
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
          {products.length === 0 && (
            <div className="text-center text-gray-400 py-12">ยังไม่มีสินค้า</div>
          )}
        </div>
      )}

      {showForm && (
        <ProductFormModal
          product={editing}
          member={member}
          onClose={() => setShowForm(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
