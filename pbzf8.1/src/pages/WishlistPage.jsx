import { Heart } from "lucide-react";
import ProductCard from "../components/ProductCard";

export default function WishlistPage({ products, wishlist, onProductClick }) {
  const wishedProducts = products.filter(p => wishlist.includes(p.id));

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900 mb-6">รายการที่ถูกใจ</h1>

      {wishedProducts.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 flex flex-col items-center text-center">
          <Heart className="w-12 h-12 text-gray-300 mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">ยังไม่มีสินค้าที่ถูกใจ</h3>
          <p className="text-gray-500 text-sm">กดปุ่มรูปหัวใจในหน้าสินค้าเพื่อบันทึกไว้ที่นี่</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {wishedProducts.map(product => (
            <ProductCard key={product.id} product={product} onClick={onProductClick} listMode={false} />
          ))}
        </div>
      )}
    </div>
  );
}
