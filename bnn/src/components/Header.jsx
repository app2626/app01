import { useState } from "react";
import { Search, ShoppingCart, User, Heart } from "lucide-react";
import CategoryMenu from "./CategoryMenu";
import logo from "../assets/logo.png";

export default function Header({ cart, onCartClick, onLogoClick, searchQuery, onSearch, onSelectCategory, member, onLoginClick, onLogout, onNavigate, wishlistCount }) {
  const [localSearch, setLocalSearch] = useState(searchQuery);

  const handleSearch = () => {
    onSearch(localSearch);
  };

  const totalQty = cart.reduce((sum, item) => sum + item.qty, 0);

  return (
    <header className="sticky top-0 z-50 bg-white shadow-sm w-full">
      <div className="bg-[#1a1a1a] text-white text-xs">
        <div className="max-w-7xl mx-auto px-4 py-1.5 flex items-center justify-between">
          <span className="text-gray-300">ENGLISH | ภาษาไทย</span>
          {member ? (
            <span className="text-gray-300">
              สวัสดี, {member.name}{" "}
              <button className="underline hover:text-white" onClick={() => onNavigate("orders")}>คำสั่งซื้อของฉัน</button>
              {member.isAdmin && (
                <>
                  {" "}·{" "}
                  <button className="underline hover:text-white" onClick={() => onNavigate("admin")}>แผงควบคุมแอดมิน</button>
                </>
              )}
              {" "}·{" "}
              <button className="underline hover:text-white" onClick={onLogout}>ออกจากระบบ</button>
            </span>
          ) : (
            <button className="text-gray-300 hover:text-white" onClick={onLoginClick}>
              เข้าสู่ระบบ / ลงทะเบียน
            </button>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <div
          className="flex items-center cursor-pointer select-none"
          onClick={onLogoClick}
        >
          <img src={logo} alt="i7 Store" className="h-11 w-11 rounded-md object-cover" />
        </div>

        <div className="flex-1 max-w-2xl hidden md:flex items-center border-2 border-[#FFD700] rounded-md overflow-hidden bg-white">
          <input
            type="text"
            placeholder="ค้นหาสินค้าที่ต้องการที่นี่..."
            className="flex-1 px-4 py-2 outline-none text-sm"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button
            className="bg-[#FFD700] px-4 py-2 flex items-center justify-center hover:bg-[#E6C200] transition-colors"
            onClick={handleSearch}
          >
            <Search className="w-5 h-5 text-black" />
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div
            className="hidden sm:flex flex-col items-center justify-center cursor-pointer text-gray-700 hover:text-black"
            onClick={member ? () => onNavigate("orders") : onLoginClick}
          >
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center mb-1">
              <User className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-medium max-w-[64px] truncate">{member ? member.name : "เข้าสู่ระบบ"}</span>
          </div>

          <div
            className="hidden sm:flex flex-col items-center justify-center cursor-pointer text-gray-700 hover:text-black relative"
            onClick={() => onNavigate("wishlist")}
          >
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center mb-1">
              <Heart className="w-5 h-5" />
              {wishlistCount > 0 && (
                <span className="absolute top-0 right-0 -mt-1 -mr-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {wishlistCount}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium">ถูกใจ</span>
          </div>

          <div
            className="flex flex-col items-center justify-center cursor-pointer text-gray-700 hover:text-black relative"
            onClick={onCartClick}
          >
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center mb-1">
              <ShoppingCart className="w-5 h-5" />
              {totalQty > 0 && (
                <span className="absolute top-0 right-0 -mt-1 -mr-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {totalQty}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium">ตะกร้าสินค้า</span>
          </div>
        </div>
      </div>

      <div className="md:hidden px-4 pb-3">
        <div className="flex items-center border-2 border-[#FFD700] rounded-md overflow-hidden bg-white">
          <input
            type="text"
            placeholder="ค้นหาสินค้าที่ต้องการที่นี่..."
            className="flex-1 px-4 py-2 outline-none text-sm"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button
            className="bg-[#FFD700] px-4 py-2 flex items-center justify-center"
            onClick={handleSearch}
          >
            <Search className="w-5 h-5 text-black" />
          </button>
        </div>
      </div>

      <div className="border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-6">
          <CategoryMenu onSelectCategory={onSelectCategory} />
          <button
            className="hidden sm:inline text-sm font-medium text-gray-600 hover:text-[#FF6B00]"
            onClick={() => onNavigate("promotions")}
          >
            โปรโมชั่น
          </button>
          <button
            className="hidden sm:inline text-sm font-medium text-gray-600 hover:text-[#FF6B00]"
            onClick={() => onNavigate("coupons")}
          >
            คูปองส่วนลด
          </button>
        </div>
      </div>
    </header>
  );
}
