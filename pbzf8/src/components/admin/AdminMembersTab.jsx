import { useState, useEffect } from "react";
import { callGas } from "../../utils/gas";
import { getAdminMembersLocal, setMemberAdminStatusLocal, setMemberBlockedLocal } from "../../utils/localMock";

function adminStatusLabel(m) {
  if (m.isSuperAdmin) return { text: "ผู้ดูแลหลัก", className: "bg-purple-100 text-purple-700" };
  if (m.adminStatus === "approved") return { text: "แอดมิน (อนุมัติแล้ว)", className: "bg-green-100 text-green-700" };
  if (m.adminStatus === "pending") return { text: "รออนุมัติ", className: "bg-yellow-100 text-yellow-700" };
  if (m.adminStatus === "rejected") return { text: "ปฏิเสธแล้ว", className: "bg-gray-100 text-gray-500" };
  return null;
}

export default function AdminMembersTab({ member }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    callGas("getAdminMembers", [member.token], () => getAdminMembersLocal(member.token))
      .then(res => { if (res.success) setMembers(res.members); })
      .finally(() => setLoading(false));
  };

  useEffect(load, [member.token]);

  const handleAdminStatus = async (id, status) => {
    setBusyId(id);
    const res = await callGas("setMemberAdminStatus", [id, status, member.token], () => setMemberAdminStatusLocal(id, status, member.token));
    setBusyId(null);
    if (res.success) load();
    else alert(res.message || "ดำเนินการไม่สำเร็จ");
  };

  const handleToggleBlock = async (m) => {
    setBusyId(m.id);
    const res = await callGas("setMemberBlocked", [m.id, !m.isBlocked, member.token], () => setMemberBlockedLocal(m.id, !m.isBlocked, member.token));
    setBusyId(null);
    if (res.success) load();
    else alert(res.message || "ดำเนินการไม่สำเร็จ");
  };

  if (loading) return <div className="text-center text-gray-500 py-12">กำลังโหลด...</div>;

  const pending = members.filter(m => m.adminStatus === "pending");

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-4">สมาชิก</h2>

      {pending.length > 0 && (
        <div className="mb-6">
          <h3 className="font-bold text-sm text-gray-700 mb-2">คำขอสิทธิ์แอดมินที่รออนุมัติ</h3>
          <div className="bg-white rounded-lg border border-yellow-200 divide-y divide-gray-100">
            {pending.map(m => (
              <div key={m.id} className="p-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-gray-900 text-sm">{m.name}</div>
                  <div className="text-xs text-gray-400">{m.email}</div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleAdminStatus(m.id, "approved")}
                    disabled={busyId === m.id}
                    className="bg-green-600 text-white text-xs font-medium px-3 py-1.5 rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    อนุมัติ
                  </button>
                  <button
                    onClick={() => handleAdminStatus(m.id, "rejected")}
                    disabled={busyId === m.id}
                    className="bg-gray-200 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-md hover:bg-gray-300 disabled:opacity-50"
                  >
                    ปฏิเสธ
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-gray-500">
              <th className="p-3 font-medium">ชื่อ</th>
              <th className="p-3 font-medium">อีเมล</th>
              <th className="p-3 font-medium">แต้มสะสม</th>
              <th className="p-3 font-medium">สิทธิ์แอดมิน</th>
              <th className="p-3 font-medium">สถานะบัญชี</th>
            </tr>
          </thead>
          <tbody>
            {members.map(m => {
              const status = adminStatusLabel(m);
              const isSelf = m.email === member.email;
              const blockDisabled = m.isSuperAdmin || isSelf || busyId === m.id;
              return (
                <tr key={m.id} className="border-b border-gray-50 last:border-0">
                  <td className="p-3">{m.name}</td>
                  <td className="p-3 text-gray-500">{m.email}</td>
                  <td className="p-3">{Number(m.points || 0).toLocaleString("th-TH")}</td>
                  <td className="p-3">
                    {status && <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status.className}`}>{status.text}</span>}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${m.isBlocked ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-500"}`}>
                        {m.isBlocked ? "ถูกบล็อก" : "ปกติ"}
                      </span>
                      <button
                        onClick={() => handleToggleBlock(m)}
                        disabled={blockDisabled}
                        title={m.isSuperAdmin ? "ไม่สามารถบล็อกผู้ดูแลหลักได้" : isSelf ? "ไม่สามารถบล็อกตัวเองได้" : ""}
                        className="text-xs font-medium text-[#B8860B] hover:underline disabled:opacity-30 disabled:no-underline disabled:cursor-not-allowed"
                      >
                        {m.isBlocked ? "ปลดบล็อก" : "บล็อก"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {members.length === 0 && (
          <div className="text-center text-gray-400 py-12">ยังไม่มีสมาชิก</div>
        )}
      </div>
    </div>
  );
}
