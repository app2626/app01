import { useState, useEffect } from "react";
import { Package } from "lucide-react";
import { formatTHB } from "../utils/format";
import { callGas } from "../utils/gas";
import { getMyOrdersLocal } from "../utils/localMock";

export default function OrdersPage({ member, onGoHome }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!member) {
      setLoading(false);
      return;
    }
    callGas("getMyOrders", [member.email], getMyOrdersLocal)
      .then(setOrders)
      .finally(() => setLoading(false));
  }, [member]);

  if (!member) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center text-gray-500">
        กรุณาเข้าสู่ระบบเพื่อดูคำสั่งซื้อของคุณ
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900 mb-6">คำสั่งซื้อของฉัน</h1>

      {loading ? (
        <div className="text-center text-gray-500 py-12">กำลังโหลด...</div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 flex flex-col items-center text-center">
          <Package className="w-12 h-12 text-gray-300 mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">ยังไม่มีคำสั่งซื้อ</h3>
          <button
            onClick={onGoHome}
            className="bg-[#FFD700] text-black px-6 py-2 rounded-md font-medium hover:bg-[#E6C200] transition-colors mt-2"
          >
            เริ่มช้อปปิ้ง
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map(order => (
            <div key={order.orderId} className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-100">
                <div>
                  <p className="font-mono text-sm font-bold text-gray-900">{order.orderId}</p>
                  <p className="text-xs text-gray-400">{new Date(order.createdAt).toLocaleString("th-TH")}</p>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#FFFBE6] text-[#B8860B]">
                  {order.status}
                </span>
              </div>

              <div className="space-y-1 mb-3">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm text-gray-600">
                    <span className="line-clamp-1 flex-1">{item.name} x{item.qty}</span>
                    <span className="flex-shrink-0 ml-2">{formatTHB(item.price * item.qty)}</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                <span className="text-sm text-gray-500">ยอดรวม</span>
                <span className="font-bold text-[#FF6B00]">{formatTHB(order.total)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
