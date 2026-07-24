import { useState, useEffect } from "react";
import { callGas } from "../../utils/gas";
import { getAdminOrdersLocal, updateOrderStatusLocal, updateOrderTrackingLocal, markRemainingPaidLocal } from "../../utils/localMock";
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

  const handleMarkRemainingPaid = async (orderId) => {
    const res = await callGas("markRemainingPaid", [orderId, member.token], () => markRemainingPaidLocal(orderId, member.token));
    if (res.success) {
      setOrders(prev => prev.map(o => o.orderId === orderId ? { ...o, remainingPaid: true, remainingPaidAt: new Date().toISOString() } : o));
    } else {
      alert(res.message || "บันทึกไม่สำเร็จ");
    }
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
      <h2 className="text-lg font-bold text-gray-900 mb-4">รายการจองทั้งหมด</h2>

      {loading ? (
        <div className="text-center text-gray-500 py-12">กำลังโหลด...</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="p-3 font-medium">เลขที่การจอง</th>
                <th className="p-3 font-medium">ลูกค้า</th>
                <th className="p-3 font-medium">ประเภท / พนักงาน</th>
                <th className="p-3 font-medium">ยอดรวม</th>
                <th className="p-3 font-medium">มัดจำ / คงเหลือ</th>
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
                    {(o.memberEmail || o.email) && (
                      <div className="text-xs text-gray-400">{o.memberEmail || o.email}</div>
                    )}
                    {o.nationalId && <div className="text-xs text-gray-400">บัตรประชาชน: {o.nationalId}</div>}
                    {o.customerInterests?.length > 0 && (
                      <div className="text-xs text-gray-400">ความสนใจ: {o.customerInterests.join(", ")}</div>
                    )}
                    {o.notes && <div className="text-xs text-gray-400">หมายเหตุ: {o.notes}</div>}
                    {o.status === "ยกเลิก" && o.cancelReason && (
                      <div className="text-xs text-red-500 mt-1">
                        เหตุผลยกเลิก: {o.cancelReason}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${o.reservationType === "F" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                      {o.reservationType === "F" ? "F (สวมสิทธิ์แคมเปญ)" : "T (มัดจำจองจริง)"}
                    </span>
                    {o.channel && <div className="text-xs text-gray-600 mt-1">ช่องทาง: {o.channel}</div>}
                    <div className="text-xs text-gray-600 mt-1">{o.staffName}</div>
                    <div className="text-xs text-gray-400">{o.staffPhone}</div>
                    {o.registrationCode && <div className="text-xs text-gray-400">รหัส: {o.registrationCode}</div>}
                  </td>
                  <td className="p-3 font-medium">{formatTHB(o.total)}</td>
                  <td className="p-3">
                    <div className="text-xs text-gray-600">มัดจำ: <span className="font-medium text-gray-900">{formatTHB(o.depositAmount)}</span> <span className={o.depositStatus === "paid" ? "text-green-600" : "text-amber-600"}>({o.depositStatus === "paid" ? "มัดจำแล้ว" : "ยังไม่มัดจำ"})</span></div>
                    <div className="text-xs text-gray-600 mt-0.5">คงเหลือ: <span className="font-medium text-gray-900">{formatTHB(o.remainingAmount)}</span></div>
                    {o.receiptNumber && <div className="text-xs text-gray-400 mt-0.5">ใบเสร็จ: {o.receiptNumber}</div>}
                    {o.remainingAmount > 0 && (
                      o.remainingPaid ? (
                        <div className="text-xs text-green-600 mt-1">ชำระส่วนที่เหลือแล้ว</div>
                      ) : (
                        <button
                          onClick={() => handleMarkRemainingPaid(o.orderId)}
                          className="text-xs text-[#B8860B] hover:underline mt-1"
                        >
                          ทำเครื่องหมายว่าชำระส่วนที่เหลือแล้ว
                        </button>
                      )
                    )}
                  </td>
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
            <div className="text-center text-gray-400 py-12">ยังไม่มีรายการจอง</div>
          )}
        </div>
      )}
    </div>
  );
}
