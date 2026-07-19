import { useState, useEffect } from "react";
import { callGas } from "../../utils/gas";
import { getAdminOrdersLocal, updateOrderStatusLocal, updateOrderTrackingLocal } from "../../utils/localMock";
import { formatTHB } from "../../utils/format";
import { ORDER_STATUSES } from "../../data/orderStatuses";

export default function AdminOrdersTab({ member }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    callGas("getAdminOrders", [member.token], getAdminOrdersLocal)
      .then(res => {
        if (res.success) setOrders(res.orders);
      })
      .finally(() => setLoading(false));
  }, [member.token]);

  const handleStatusChange = async (orderId, status) => {
    setOrders(prev => prev.map(o => o.orderId === orderId ? { ...o, status } : o));
    const res = await callGas("updateOrderStatus", [orderId, status, member.token], updateOrderStatusLocal);
    if (!res.success) alert(res.message || "อัปเดตสถานะไม่สำเร็จ");
  };

  const handleTrackingSave = async (orderId, trackingNumber) => {
    const res = await callGas(
      "updateOrderTracking",
      [orderId, trackingNumber, member.token],
      () => updateOrderTrackingLocal(orderId, trackingNumber, member.token)
    );
    if (res.success) {
      setOrders(prev => prev.map(o => o.orderId === orderId ? { ...o, trackingNumber } : o));
    } else {
      alert(res.message || "บันทึกเลขพัสดุไม่สำเร็จ");
    }
  };

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-4">คำสั่งซื้อทั้งหมด</h2>

      {loading ? (
        <div className="text-center text-gray-500 py-12">กำลังโหลด...</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="p-3 font-medium">เลขที่ออเดอร์</th>
                <th className="p-3 font-medium">ลูกค้า</th>
                <th className="p-3 font-medium">ยอดรวม</th>
                <th className="p-3 font-medium">วันที่</th>
                <th className="p-3 font-medium">สถานะ</th>
                <th className="p-3 font-medium">เลขพัสดุ</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.orderId} className="border-b border-gray-50 last:border-0">
                  <td className="p-3 font-mono text-xs">{o.orderId}</td>
                  <td className="p-3">
                    <div>{o.customerName}</div>
                    <div className="text-xs text-gray-400">{o.phone}</div>
                    {(o.memberEmail || o.guestEmail) && (
                      <div className="text-xs text-gray-400">
                        {o.memberEmail || o.guestEmail}
                        {!o.memberEmail && o.guestEmail && <span className="text-gray-300"> (guest)</span>}
                      </div>
                    )}
                    {o.needTaxInvoice && (
                      <div className="text-xs text-blue-600 mt-1">
                        📄 ใบกำกับภาษี: {o.taxInvoiceName} ({o.taxId})
                      </div>
                    )}
                    {o.status === "ยกเลิก" && o.cancelReason && (
                      <div className="text-xs text-red-500 mt-1">
                        เหตุผลยกเลิก: {o.cancelReason}
                      </div>
                    )}
                  </td>
                  <td className="p-3 font-medium">{formatTHB(o.total)}</td>
                  <td className="p-3 text-xs text-gray-500">{new Date(o.createdAt).toLocaleString("th-TH")}</td>
                  <td className="p-3">
                    <select
                      value={o.status}
                      onChange={(e) => handleStatusChange(o.orderId, e.target.value)}
                      className="border border-gray-300 rounded-md px-2 py-1 text-xs outline-none focus:border-[#FFD700]"
                    >
                      {ORDER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="p-3">
                    <input
                      type="text"
                      defaultValue={o.trackingNumber}
                      placeholder="ระบุเลขพัสดุ"
                      onBlur={(e) => handleTrackingSave(o.orderId, e.target.value.trim())}
                      className="border border-gray-300 rounded-md px-2 py-1 text-xs outline-none focus:border-[#FFD700] w-32"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && (
            <div className="text-center text-gray-400 py-12">ยังไม่มีคำสั่งซื้อ</div>
          )}
        </div>
      )}
    </div>
  );
}
