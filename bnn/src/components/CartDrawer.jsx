import { ShoppingCart, X, Minus, Plus } from "lucide-react";
import { formatTHB } from "../utils/format";

export default function CartDrawer({ show, cart, onClose, onUpdateQty, onRemove, onCheckout }) {
  const subtotal = cart.reduce((sum, item) => sum + (item.selectedVariant.price * item.qty), 0);

  return (
    <div className={`fixed inset-0 z-[60] flex transition-opacity duration-300 ${show ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
      <div
        className={`fixed inset-0 bg-black/40 transition-opacity duration-300 ${show ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        className={`fixed right-0 top-0 h-full w-full max-w-sm bg-white shadow-2xl flex flex-col transition-transform duration-300 transform ${show ? 'translate-x-0' : 'translate-x-full'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" /> ตะกร้าสินค้า
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <ShoppingCart className="w-16 h-16 mb-4 opacity-50" />
              <p className="font-medium">ตะกร้าของคุณว่างเปล่า</p>
            </div>
          ) : (
            <div className="space-y-4">
              {cart.map((item, idx) => (
                <div key={`${item.product.id}-${item.selectedColor}-${item.selectedVariant.label}-${idx}`} className="bg-white p-3 rounded-lg border border-gray-200 flex gap-3 relative shadow-sm">
                  <div className="w-20 h-20 bg-gray-50 rounded p-1 flex-shrink-0">
                    <img src={item.product.images[0]} alt={item.product.name} className="w-full h-full object-contain mix-blend-multiply" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-gray-900 line-clamp-2 leading-tight mb-1">{item.product.name}</h4>
                    <p className="text-xs text-gray-500 mb-2">สี: {item.selectedColor}, {item.selectedVariant.label}</p>
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-bold text-[#FF6B00]">
                        {formatTHB(item.selectedVariant.price)}
                      </div>
                      <div className="flex items-center border border-gray-300 rounded h-7">
                        <button
                          onClick={() => onUpdateQty(item.id, Math.max(1, item.qty - 1))}
                          className="w-7 h-full flex items-center justify-center text-gray-600 hover:bg-gray-100"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <div className="w-7 text-center text-xs font-medium border-x border-gray-300 h-full flex items-center justify-center">
                          {item.qty}
                        </div>
                        <button
                          onClick={() => onUpdateQty(item.id, item.qty + 1)}
                          className="w-7 h-full flex items-center justify-center text-gray-600 hover:bg-gray-100"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => onRemove(item.id)}
                    className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-500 rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <div className="p-4 border-t border-gray-200 bg-white">
            <div className="flex justify-between items-center mb-4">
              <span className="text-gray-600 font-medium">ยอดรวมสุทธิ</span>
              <span className="text-xl font-bold text-[#FF6B00]">{formatTHB(subtotal)}</span>
            </div>
            <button onClick={onCheckout} className="w-full bg-[#FF6B00] text-white font-bold py-3.5 rounded-md hover:bg-[#E65A00] transition-colors">
              ดำเนินการสั่งซื้อ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
