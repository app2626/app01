import { useState } from "react";
import AdminDashboardTab from "../components/admin/AdminDashboardTab";
import AdminProductsTab from "../components/admin/AdminProductsTab";
import AdminOrdersTab from "../components/admin/AdminOrdersTab";
import AdminReviewsTab from "../components/admin/AdminReviewsTab";
import AdminPromoPopupTab from "../components/admin/AdminPromoPopupTab";
import AdminHeroBannersTab from "../components/admin/AdminHeroBannersTab";
import AdminCouponsTab from "../components/admin/AdminCouponsTab";
import AdminGiftsTab from "../components/admin/AdminGiftsTab";
import AdminPromotionsTab from "../components/admin/AdminPromotionsTab";
import AdminInstallmentsTab from "../components/admin/AdminInstallmentsTab";
import AdminMembersTab from "../components/admin/AdminMembersTab";
import AdminReservationSettingsTab from "../components/admin/AdminReservationSettingsTab";

export default function AdminPage({ member }) {
  const [tab, setTab] = useState("dashboard");

  if (!member?.isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center text-gray-500">
        คุณไม่มีสิทธิ์เข้าถึงหน้านี้
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900 mb-6">แผงควบคุมแอดมิน</h1>

      <div className="flex flex-wrap bg-gray-100 rounded-md p-1 mb-6 gap-y-1 w-fit">
        <button
          className={`px-5 py-1.5 rounded text-sm font-medium ${tab === "dashboard" ? "bg-white shadow-sm" : "text-gray-500"}`}
          onClick={() => setTab("dashboard")}
        >
          แดชบอร์ด
        </button>
        <button
          className={`px-5 py-1.5 rounded text-sm font-medium ${tab === "orders" ? "bg-white shadow-sm" : "text-gray-500"}`}
          onClick={() => setTab("orders")}
        >
          รายการจอง
        </button>
        <button
          className={`px-5 py-1.5 rounded text-sm font-medium ${tab === "reviews" ? "bg-white shadow-sm" : "text-gray-500"}`}
          onClick={() => setTab("reviews")}
        >
          รีวิว
        </button>
        <button
          className={`px-5 py-1.5 rounded text-sm font-medium ${tab === "products" ? "bg-white shadow-sm" : "text-gray-500"}`}
          onClick={() => setTab("products")}
        >
          สินค้า
        </button>
        <button
          className={`px-5 py-1.5 rounded text-sm font-medium ${tab === "giftsBrand" ? "bg-white shadow-sm" : "text-gray-500"}`}
          onClick={() => setTab("giftsBrand")}
        >
          ของแถมแบรนด์
        </button>
        <button
          className={`px-5 py-1.5 rounded text-sm font-medium ${tab === "giftsStore" ? "bg-white shadow-sm" : "text-gray-500"}`}
          onClick={() => setTab("giftsStore")}
        >
          ของแถมทางร้าน
        </button>
        <button
          className={`px-5 py-1.5 rounded text-sm font-medium ${tab === "promotions" ? "bg-white shadow-sm" : "text-gray-500"}`}
          onClick={() => setTab("promotions")}
        >
          โปรโมชั่น
        </button>
        <button
          className={`px-5 py-1.5 rounded text-sm font-medium ${tab === "coupons" ? "bg-white shadow-sm" : "text-gray-500"}`}
          onClick={() => setTab("coupons")}
        >
          คูปอง
        </button>
        <button
          className={`px-5 py-1.5 rounded text-sm font-medium ${tab === "installments" ? "bg-white shadow-sm" : "text-gray-500"}`}
          onClick={() => setTab("installments")}
        >
          ผ่อนชำระ
        </button>
        <button
          className={`px-5 py-1.5 rounded text-sm font-medium ${tab === "promoPopup" ? "bg-white shadow-sm" : "text-gray-500"}`}
          onClick={() => setTab("promoPopup")}
        >
          ป๊อปอัพ
        </button>
        <button
          className={`px-5 py-1.5 rounded text-sm font-medium ${tab === "heroBanners" ? "bg-white shadow-sm" : "text-gray-500"}`}
          onClick={() => setTab("heroBanners")}
        >
          แบนเนอร์
        </button>
        <button
          className={`px-5 py-1.5 rounded text-sm font-medium ${tab === "members" ? "bg-white shadow-sm" : "text-gray-500"}`}
          onClick={() => setTab("members")}
        >
          สมาชิก
        </button>
        <button
          className={`px-5 py-1.5 rounded text-sm font-medium ${tab === "reservationSettings" ? "bg-white shadow-sm" : "text-gray-500"}`}
          onClick={() => setTab("reservationSettings")}
        >
          มัดจำ
        </button>
      </div>

      {tab === "dashboard" && <AdminDashboardTab member={member} />}
      {tab === "orders" && <AdminOrdersTab member={member} />}
      {tab === "reviews" && <AdminReviewsTab member={member} />}
      {tab === "products" && <AdminProductsTab member={member} />}
      {tab === "giftsBrand" && <AdminGiftsTab member={member} type="brand" title="ของแถมแบรนด์" />}
      {tab === "giftsStore" && <AdminGiftsTab member={member} type="store" title="ของแถมทางร้าน" />}
      {tab === "promotions" && <AdminPromotionsTab member={member} />}
      {tab === "coupons" && <AdminCouponsTab member={member} />}
      {tab === "installments" && <AdminInstallmentsTab member={member} />}
      {tab === "promoPopup" && <AdminPromoPopupTab member={member} />}
      {tab === "heroBanners" && <AdminHeroBannersTab member={member} />}
      {tab === "members" && <AdminMembersTab member={member} />}
      {tab === "reservationSettings" && <AdminReservationSettingsTab member={member} />}
    </div>
  );
}
