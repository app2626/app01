import { useState, useEffect } from "react";
import { callGas } from "../../utils/gas";
import { getAdminDashboardStatsLocal } from "../../utils/localMock";
import { formatTHB } from "../../utils/format";

const CHART_BLUE = "#2a78d6";
const STATUS_COLOR = {
  "รอดำเนินการ": "#898781",
  "กำลังจัดส่ง": "#fab219",
  "จัดส่งสำเร็จ": "#0ca30c",
  "ยกเลิก": "#d03b3b"
};

function formatDateLabel(dateStr) {
  const [, m, d] = dateStr.split("-");
  return `${d}/${m}`;
}

export default function AdminDashboardTab({ member }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hoverIdx, setHoverIdx] = useState(null);

  useEffect(() => {
    callGas("getAdminDashboardStats", [member.token], getAdminDashboardStatsLocal)
      .then(res => { if (res.success) setStats(res); })
      .finally(() => setLoading(false));
  }, [member.token]);

  if (loading) {
    return <div className="text-center text-gray-500 py-12">กำลังโหลด...</div>;
  }
  if (!stats) {
    return <div className="text-center text-gray-400 py-12">ไม่สามารถโหลดข้อมูลได้</div>;
  }

  const avgOrder = stats.totalOrders > 0 ? stats.totalRevenue / stats.totalOrders : 0;
  const maxDaily = Math.max(1, ...stats.dailyRevenue.map(d => d.revenue));
  const peakIdx = stats.dailyRevenue.reduce((best, d, idx, arr) => (d.revenue > arr[best].revenue ? idx : best), 0);
  const maxProductQty = Math.max(1, ...stats.topProducts.map(p => p.qty));

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-gray-900">แดชบอร์ดยอดขาย</h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile label="ยอดขายรวม" value={formatTHB(stats.totalRevenue)} />
        <StatTile label="คำสั่งซื้อทั้งหมด" value={stats.totalOrders.toLocaleString("th-TH")} />
        <StatTile label="มูลค่าเฉลี่ยต่อออเดอร์" value={formatTHB(avgOrder)} />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-4">ยอดขาย 14 วันล่าสุด</h3>
        <div className="flex items-end gap-1.5 h-40">
          {stats.dailyRevenue.map((d, idx) => {
            const heightPct = Math.max(2, (d.revenue / maxDaily) * 100);
            return (
              <div
                key={d.date}
                className="flex-1 h-full flex flex-col items-center justify-end relative"
                onMouseEnter={() => setHoverIdx(idx)}
                onMouseLeave={() => setHoverIdx(null)}
              >
                {hoverIdx === idx && (
                  <div className="absolute bottom-full mb-1 whitespace-nowrap bg-gray-900 text-white text-[11px] rounded px-2 py-1 z-10 pointer-events-none">
                    {formatDateLabel(d.date)} · {formatTHB(d.revenue)} · {d.orders} ออเดอร์
                  </div>
                )}
                {idx === peakIdx && d.revenue > 0 && hoverIdx !== idx && (
                  <div className="absolute -top-5 text-[10px] font-medium text-gray-500 whitespace-nowrap">
                    {formatTHB(d.revenue)}
                  </div>
                )}
                <div
                  style={{ height: `${heightPct}%`, backgroundColor: CHART_BLUE }}
                  className="w-full rounded-t-[4px] min-h-[2px] transition-opacity hover:opacity-80"
                  role="img"
                  aria-label={`${d.date}: ${formatTHB(d.revenue)}, ${d.orders} ออเดอร์`}
                />
              </div>
            );
          })}
        </div>
        <div className="flex gap-1.5 mt-1.5">
          {stats.dailyRevenue.map((d, idx) => (
            <div key={d.date} className="flex-1 text-center text-[10px] text-gray-400">
              {idx % 2 === 0 || idx === stats.dailyRevenue.length - 1 ? formatDateLabel(d.date) : ""}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-4">สินค้าขายดี (ตามจำนวนที่ขาย)</h3>
          {stats.topProducts.length === 0 ? (
            <p className="text-sm text-gray-400">ยังไม่มีข้อมูลการขาย</p>
          ) : (
            <div className="space-y-3">
              {stats.topProducts.map(p => (
                <div key={p.name}>
                  <div className="flex justify-between text-xs mb-1 gap-2">
                    <span className="text-gray-700 line-clamp-1">{p.name}</span>
                    <span className="text-gray-500 font-medium flex-shrink-0">{p.qty} ชิ้น</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(4, (p.qty / maxProductQty) * 100)}%`, backgroundColor: CHART_BLUE }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-4">สถานะคำสั่งซื้อ</h3>
          {Object.keys(stats.statusBreakdown).length === 0 ? (
            <p className="text-sm text-gray-400">ยังไม่มีคำสั่งซื้อ</p>
          ) : (
            <div className="space-y-2.5">
              {Object.entries(stats.statusBreakdown).map(([status, count]) => (
                <div key={status} className="flex items-center gap-2.5 text-sm">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: STATUS_COLOR[status] || "#898781" }}
                  />
                  <span className="text-gray-700 flex-1">{status}</span>
                  <span className="text-gray-500 font-medium">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}
