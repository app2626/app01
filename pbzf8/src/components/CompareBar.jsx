import { X } from "lucide-react";

const MAX_COMPARE = 4;

export default function CompareBar({ products, onRemove, onClear, onCompare }) {
  if (products.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.08)]">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4 overflow-x-auto">
        <div className="flex items-center gap-3 flex-shrink-0">
          {products.map(product => (
            <div key={product.id} className="relative flex-shrink-0">
              <img
                src={product.images[0]}
                alt={product.name}
                className="w-12 h-12 object-contain bg-gray-50 rounded border border-gray-200 p-1"
              />
              <button
                onClick={() => onRemove(product.id)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-gray-700 text-white rounded-full flex items-center justify-center"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>

        <span className="text-xs text-gray-500 flex-shrink-0">
          เลือกแล้ว {products.length}/{MAX_COMPARE}
        </span>

        <div className="flex items-center gap-3 ml-auto flex-shrink-0">
          <button onClick={onClear} className="text-sm text-gray-500 hover:text-gray-700">
            ล้างทั้งหมด
          </button>
          <button
            onClick={onCompare}
            disabled={products.length < 2}
            className="bg-[#FF6B00] text-white text-sm font-bold px-5 py-2 rounded-md hover:bg-[#E65A00] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            เปรียบเทียบ ({products.length})
          </button>
        </div>
      </div>
    </div>
  );
}
