import ProductCard from "../components/ProductCard";

export default function PromotionsPage({ products, onProductClick }) {
  const promoProducts = products.filter(p => p.promotions?.length > 0 || p.freeGiftItems?.length > 0);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900 mb-1">โปรโมชั่นทั้งหมด</h1>
      <p className="text-sm text-gray-500 mb-6">รวมสินค้าที่มีโปรโมชั่นพิเศษและของแถมวันนี้</p>

      {promoProducts.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-500">
          ยังไม่มีโปรโมชั่นในขณะนี้
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {promoProducts.map(product => (
            <ProductCard key={product.id} product={product} onClick={onProductClick} listMode={false} />
          ))}
        </div>
      )}
    </div>
  );
}
