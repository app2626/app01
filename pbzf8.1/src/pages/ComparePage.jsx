import { X, Layers } from "lucide-react";
import { formatTHB } from "../utils/format";
import { getCategoryLabel } from "../data/categories";

export default function ComparePage({ products, onRemove, onGoHome }) {
  if (products.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <Layers className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h1 className="text-lg font-bold text-gray-900 mb-2">ยังไม่มีสินค้าที่เลือกเปรียบเทียบ</h1>
        <p className="text-gray-500 text-sm mb-6">เลือกสินค้าจากหน้ารายการสินค้าโดยติ๊ก "เปรียบเทียบ" ใต้การ์ดสินค้า</p>
        <button
          onClick={onGoHome}
          className="bg-[#FFD700] text-black px-6 py-2 rounded-md font-medium hover:bg-[#E6C200] transition-colors"
        >
          กลับสู่หน้าแรก
        </button>
      </div>
    );
  }

  const specLabels = [...new Set(products.flatMap(p => p.specList.map(s => s.label)))];
  const specValueOf = (product, label) => product.specList.find(s => s.label === label)?.value || "-";

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900 mb-6">เปรียบเทียบสินค้า</h1>

      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="p-4 text-left align-bottom w-40 flex-shrink-0"></th>
              {products.map(product => (
                <th key={product.id} className="p-4 text-left align-bottom min-w-[220px] border-l border-gray-100">
                  <div className="flex justify-end mb-2">
                    <button onClick={() => onRemove(product.id)} className="text-gray-400 hover:text-gray-700">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <img
                    src={product.images[0]}
                    alt={product.name}
                    className="w-24 h-24 object-contain bg-gray-50 rounded mb-3 mix-blend-multiply"
                  />
                  <div className="font-medium text-gray-900 leading-tight mb-2">{product.name}</div>
                  <div className="text-base font-bold text-[#FF6B00]">
                    {product.priceMin === product.priceMax
                      ? formatTHB(product.priceMin)
                      : `${formatTHB(product.priceMin)} - ${formatTHB(product.priceMax)}`}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-gray-100 bg-gray-50">
              <td className="p-4 font-medium text-gray-500">แบรนด์</td>
              {products.map(product => (
                <td key={product.id} className="p-4 border-l border-gray-100">{product.brand}</td>
              ))}
            </tr>
            <tr className="border-t border-gray-100">
              <td className="p-4 font-medium text-gray-500">หมวดหมู่</td>
              {products.map(product => (
                <td key={product.id} className="p-4 border-l border-gray-100">{getCategoryLabel(product.category)}</td>
              ))}
            </tr>
            <tr className="border-t border-gray-100 bg-gray-50">
              <td className="p-4 font-medium text-gray-500">คะแนนรีวิว</td>
              {products.map(product => (
                <td key={product.id} className="p-4 border-l border-gray-100">
                  {product.ratingCount ? `${product.ratingAvg.toFixed(1)} (${product.ratingCount} รีวิว)` : "ยังไม่มีรีวิว"}
                </td>
              ))}
            </tr>
            {specLabels.map((label, idx) => (
              <tr key={label} className={`border-t border-gray-100 ${idx % 2 === 1 ? "bg-gray-50" : ""}`}>
                <td className="p-4 font-medium text-gray-500">{label}</td>
                {products.map(product => (
                  <td key={product.id} className="p-4 border-l border-gray-100">{specValueOf(product, label)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
