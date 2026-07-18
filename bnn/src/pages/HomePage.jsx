import HeroBanner from "../components/HeroBanner";
import BrandStrip from "../components/BrandStrip";
import ProductCarousel from "../components/ProductCarousel";

export default function HomePage({ products, onProductClick, heroBanners, onNavigate }) {
  const newProducts = products.filter(p => p.tags?.includes("new"));
  const bestSellers = products.filter(p => p.tags?.includes("bestseller"));

  return (
    <div className="max-w-7xl mx-auto px-4 py-4">
      <HeroBanner slides={heroBanners} onNavigate={onNavigate} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-[#FFF4ED] border border-[#FFDCC3] rounded-lg p-5 h-28 flex flex-col justify-center">
          <h3 className="font-bold text-[#DD6B20] mb-1">ผ่อน 0% นานสูงสุด 10 เดือน</h3>
          <p className="text-xs text-gray-600">เฉพาะสินค้าที่ร่วมรายการ</p>
        </div>
        <div className="bg-[#EEF2FF] border border-[#C7D2FE] rounded-lg p-5 h-28 flex flex-col justify-center">
          <h3 className="font-bold text-[#4338CA] mb-1">ลงทะเบียนรับสิทธิ์</h3>
          <p className="text-xs text-gray-600">ดูแลเครื่อง ประกันเครื่อง 2 ปี</p>
        </div>
        <div className="bg-[#ECFDF5] border border-[#A7F3D0] rounded-lg p-5 h-28 flex flex-col justify-center">
          <h3 className="font-bold text-[#047857] mb-1">ส่งฟรี ทั่วไทย</h3>
          <p className="text-xs text-gray-600">ไม่มีขั้นต่ำในการสั่งซื้อ</p>
        </div>
      </div>

      <BrandStrip />

      <ProductCarousel title="สินค้าใหม่" products={newProducts} onProductClick={onProductClick} />
      <ProductCarousel title="สินค้าขายดี" products={bestSellers} onProductClick={onProductClick} />
    </div>
  );
}
