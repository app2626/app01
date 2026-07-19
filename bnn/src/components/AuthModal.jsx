import { useState } from "react";
import { X, User } from "lucide-react";
import { callGas } from "../utils/gas";
import {
  registerMemberLocal,
  loginMemberLocal,
  requestPasswordResetLocal,
  resetPasswordLocal
} from "../utils/localMock";

const inputClass = "w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-[#FFD700]";

export default function AuthModal({ show, onClose, onLoggedIn }) {
  const [mode, setMode] = useState("login"); // "login" | "register" | "forgotRequest" | "forgotCode"
  const [form, setForm] = useState({ name: "", email: "", password: "", requestAdmin: false });
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  if (!show) return null;

  const update = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const switchTab = (tab) => {
    setMode(tab);
    setError("");
    setInfo("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = mode === "login"
        ? await callGas("loginMember", [{ email: form.email, password: form.password }], loginMemberLocal)
        : await callGas("registerMember", [form], registerMemberLocal);

      if (!result.success) {
        setError(result.message || "เกิดข้อผิดพลาด");
      } else {
        onLoggedIn(result.member);
        setForm({ name: "", email: "", password: "", requestAdmin: false });
      }
    } catch {
      setError("เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  };

  const handleRequestReset = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const result = await callGas("requestPasswordReset", [form.email], requestPasswordResetLocal);
      if (!result.success) {
        setError(result.message || "เกิดข้อผิดพลาด");
      } else {
        setInfo(result.message);
        setMode("forgotCode");
      }
    } catch {
      setError("เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const result = await callGas("resetPassword", [form.email, resetCode, newPassword], resetPasswordLocal);
      if (!result.success) {
        setError(result.message || "เกิดข้อผิดพลาด");
      } else {
        setResetCode("");
        setNewPassword("");
        setForm(prev => ({ ...prev, password: "" }));
        setInfo("ตั้งรหัสผ่านใหม่สำเร็จ กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่");
        setMode("login");
      }
    } catch {
      setError("เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  };

  const titles = {
    login: "เข้าสู่ระบบ",
    register: "ลงทะเบียนสมาชิก",
    forgotRequest: "ลืมรหัสผ่าน",
    forgotCode: "ตั้งรหัสผ่านใหม่"
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-full bg-[#FFFBE6] flex items-center justify-center">
            <User className="w-5 h-5 text-[#B8860B]" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">{titles[mode]}</h2>
        </div>

        {(mode === "login" || mode === "register") && (
          <div className="flex bg-gray-100 rounded-md p-1 mb-6">
            <button
              className={`flex-1 py-1.5 rounded text-sm font-medium ${mode === "login" ? "bg-white shadow-sm" : "text-gray-500"}`}
              onClick={() => switchTab("login")}
            >
              เข้าสู่ระบบ
            </button>
            <button
              className={`flex-1 py-1.5 rounded text-sm font-medium ${mode === "register" ? "bg-white shadow-sm" : "text-gray-500"}`}
              onClick={() => switchTab("register")}
            >
              ลงทะเบียน
            </button>
          </div>
        )}

        {(mode === "login" || mode === "register") && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">ชื่อ-นามสกุล</label>
                <input required type="text" value={form.name} onChange={update("name")} className={inputClass} />
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">อีเมล</label>
              <input required type="email" value={form.email} onChange={update("email")} className={inputClass} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-600 block">รหัสผ่าน</label>
                {mode === "login" && (
                  <button type="button" onClick={() => switchTab("forgotRequest")} className="text-xs text-[#B8860B] hover:underline">
                    ลืมรหัสผ่าน?
                  </button>
                )}
              </div>
              <input required type="password" minLength={4} value={form.password} onChange={update("password")} className={inputClass} />
            </div>

            {mode === "register" && (
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.requestAdmin}
                  onChange={(e) => setForm(prev => ({ ...prev, requestAdmin: e.target.checked }))}
                  className="mt-0.5"
                />
                <span className="text-xs text-gray-600">สมัครเป็นผู้ดูแลระบบ (ต้องรอการอนุมัติจากผู้ดูแลระบบก่อนจึงจะใช้งานได้)</span>
              </label>
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}
            {info && <p className="text-xs text-green-600">{info}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#FFD700] text-black font-bold py-2.5 rounded-md hover:bg-[#E6C200] transition-colors disabled:opacity-50"
            >
              {loading ? "กำลังดำเนินการ..." : mode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
            </button>
          </form>
        )}

        {mode === "forgotRequest" && (
          <form onSubmit={handleRequestReset} className="space-y-4">
            <p className="text-xs text-gray-500">กรอกอีเมลที่ใช้สมัครสมาชิก เราจะส่งรหัสยืนยัน 6 หลักไปให้ทางอีเมล</p>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">อีเมล</label>
              <input required type="email" value={form.email} onChange={update("email")} className={inputClass} />
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#FFD700] text-black font-bold py-2.5 rounded-md hover:bg-[#E6C200] transition-colors disabled:opacity-50"
            >
              {loading ? "กำลังส่ง..." : "ส่งรหัสยืนยัน"}
            </button>

            <button type="button" onClick={() => switchTab("login")} className="w-full text-xs text-gray-500 hover:underline">
              กลับไปเข้าสู่ระบบ
            </button>
          </form>
        )}

        {mode === "forgotCode" && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            {info && <p className="text-xs text-green-600">{info}</p>}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">รหัสยืนยัน 6 หลัก</label>
              <input required value={resetCode} onChange={(e) => setResetCode(e.target.value)} maxLength={6} className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">รหัสผ่านใหม่</label>
              <input required type="password" minLength={4} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputClass} />
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#FFD700] text-black font-bold py-2.5 rounded-md hover:bg-[#E6C200] transition-colors disabled:opacity-50"
            >
              {loading ? "กำลังบันทึก..." : "ตั้งรหัสผ่านใหม่"}
            </button>

            <button type="button" onClick={() => switchTab("login")} className="w-full text-xs text-gray-500 hover:underline">
              กลับไปเข้าสู่ระบบ
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
