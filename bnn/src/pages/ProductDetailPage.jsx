import { useState } from "react";
import { ShoppingCart, Plus, Minus, Gift, Shield, CreditCard, Truck, Heart, Wallet } from "lucide-react";
import ImageGallery from "../components/ImageGallery";
import ProductReviews from "../components/ProductReviews";
import { StarDisplay } from "../components/StarRating";
import { BRAND_COLORS } from "../data/products";
import { getCategoryLabel } from "../data/categories";
import { formatTHB, calcPoints, calcInstallments } from "../utils/format";

function variantsForColor(product, color) {
  const matches = product.variants.filter(v => v.color === color);
  return matches.length ? matches : product.variants;
}

export default function ProductDetailPage({ product, onAddToCart, onBuyNow, onBack, onSelectCategory, isWishlisted, onToggleWishlist, member, onLoginRequired, installmentSettings }) {
  const [selectedColor, setSelectedColor] = useState(product.variants[0]?.color || product.colors[0]);
  const [selectedVariant, setSelectedVariant] = useState(product.variants[0]);
  const [qty, setQty] = useState(1);

  const brandStyle = BRAND_COLORS[product.brand] || { bg: "#000", text: "white" };
  const variantInStock = selectedVariant.inStock !== false;
  const memoryOptions = variantsForColor(product, selectedColor);

  const pickColor = (color) => {
    setSelectedColor(color);
    const options = variantsForColor(product, color);
    const match = options.find(v => v.label === selectedVariant.label) || options[0];
    setSelectedVariant(match);
    if (typeof match.stockQty === "number") setQty(q => Math.max(1, Math.min(match.stockQty, q)));
  };

  const pickVariant = (v) => {
    setSelectedVariant(v);
    if (typeof v.stockQty === "number") setQty(q => Math.max(1, Math.min(v.stockQty, q)));
  };
  const points = calcPoints(selectedVariant.price, product.pointsRate ?? 0.01);
  const installmentsEnabled = installmentSettings?.enabled !== false;
  const installments = installmentsEnabled
    ? calcInstallments(selectedVariant.price, installmentSettings?.banks)
    : [];
  const galleryImages = product.imagesByColor?.[selectedColor]?.length
    ? product.imagesByColor[selectedColor]
    : product.images;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-24">
      <div className="text-xs text-gray-500 mb-6 flex items-center gap-2 overflow-x-auto whitespace-nowrap">
        <span className="cursor-pointer hover:text-gray-900" onClick={onBack}>หน้าหลัก</span> &gt;
        <span className="cursor-pointer hover:text-gray-900" onClick={() => onSelectCategory(product.category)}>
          {getCategoryLabel(product.category)}
        </span> &gt;
        <span className="cursor-pointer hover:text-gray-900" onClick={() => onSelectCategory(product.category)}>{product.brand}</span> &gt;
        <span className="text-gray-900 font-medium">{product.name}</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col md:flex-row gap-8 lg:gap-12">
        <div className="w-full md:w-[45%]">
          <ImageGallery images={galleryImages} />
        </div>

        <div className="w-full md:w-[55%] flex flex-col">
          <div className="mb-4">
            <span
              className="inline-block px-2.5 py-1 text-[11px] font-bold rounded-sm mb-3"
              style={{ backgroundColor: brandStyle.bg, color: brandStyle.text }}
            >
              {product.brand.toUpperCase()}
            </span>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2 leading-tight">
              {product.name}
            </h1>
            <div className="text-xs text-gray-400 font-mono mb-2">
              SKU: {selectedVariant.sku || product.sku}
            </div>
            {product.ratingCount > 0 && (
              <a href="#reviews" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
                <StarDisplay rating={product.ratingAvg} />
                <span className="font-medium text-gray-900">{product.ratingAvg.toFixed(1)}</span>
                <span>({product.ratingCount.toLocaleString("th-TH")} รีวิว)</span>
              </a>
            )}
          </div>

          <div className="mb-6 pb-6 border-b border-gray-100">
            <div className="flex items-end gap-3 mb-1">
              <span className="text-3xl md:text-4xl font-bold text-[#FF6B00]">
                {formatTHB(selectedVariant.price)}
              </span>
              {product.originalPrice && selectedVariant.price < product.originalPrice && (
                <span className="text-lg text-gray-400 line-through mb-1">
                  {formatTHB(product.originalPrice)}
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500 mb-3">รับคะแนนสะสม: {points.toLocaleString("th-TH")} คะแนน</div>

            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-1 bg-[#F5F5F5] px-2 py-1 rounded text-xs font-medium text-gray-700">
                <span className="text-blue-600 font-bold">SPayLater</span>
              </div>
              <div className="flex items-center gap-1 bg-[#F5F5F5] px-2 py-1 rounded text-xs font-medium text-gray-700">
                <Shield className="w-3 h-3 text-green-600" /> รับประกันศูนย์
              </div>
              <div className="flex items-center gap-1 bg-[#F5F5F5] px-2 py-1 rounded text-xs font-medium text-gray-700">
                <CreditCard className="w-3 h-3 text-purple-600" /> ผ่อน 0%
              </div>
              <div className="flex items-center gap-1 bg-[#F5F5F5] px-2 py-1 rounded text-xs font-medium text-gray-700">
                <Truck className="w-3 h-3 text-[#FF6B00]" /> ส่งฟรี
              </div>
            </div>
          </div>

          {product.colors.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-bold text-gray-900 mb-3">สี: {selectedColor}</h3>
              <div className="flex flex-wrap gap-3">
                {product.colors.map(color => (
                  <div
                    key={color}
                    onClick={() => pickColor(color)}
                    className={`w-9 h-9 rounded-full cursor-pointer border-2 shadow-sm ${
                      selectedColor === color ? 'border-[#FFD700] ring-2 ring-[#FFD700] ring-offset-1' : 'border-gray-200'
                    }`}
                    style={{ backgroundColor: product.colorHex[color] || '#CCCCCC' }}
                    title={color}
                  />
                ))}
              </div>
            </div>
          )}

          {memoryOptions.length > 1 && (
            <div className="mb-6">
              <h3 className="text-sm font-bold text-gray-900 mb-3">ตัวเลือกสินค้า</h3>
              <div className="flex flex-wrap gap-3">
                {memoryOptions.map((v, idx) => (
                  <button
                    key={idx}
                    onClick={() => pickVariant(v)}
                    className={`px-4 py-2 border rounded-md text-sm font-medium transition-colors ${
                      selectedVariant.sku === v.sku
                        ? 'border-[#FFD700] bg-[#FFFBE6] text-black'
                        : 'border-gray-300 text-gray-700 hover:border-gray-400'
                    } ${v.inStock === false ? 'opacity-50' : ''}`}
                  >
                    {v.label}{v.inStock === false ? ' (สินค้าหมด)' : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {variantInStock && typeof selectedVariant.stockQty === "number" && selectedVariant.stockQty > 0 && selectedVariant.stockQty <= 5 && (
            <p className="text-xs text-red-500 font-medium mb-4">เหลือเพียง {selectedVariant.stockQty} ชิ้นเท่านั้น</p>
          )}

          {product.freeGiftItems?.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-bold text-gray-900 mb-3">สินค้าพรีเมียมในโปรโมชั่น</h3>
              <div className="flex flex-wrap gap-3">
                {product.freeGiftItems.map((g, idx) => (
                  <div key={idx} className="w-24 flex flex-col items-center text-center">
                    <div className={`relative w-full aspect-square bg-gray-50 border border-gray-200 rounded-md flex items-center justify-center mb-1 ${g.inStock === false ? "opacity-50" : ""}`}>
                      <Gift className="w-6 h-6 text-gray-300" />
                    </div>
                    <span className="text-[11px] text-gray-600 leading-tight">{g.name}</span>
                    <span className="text-[10px] text-gray-400">{g.type === "store" ? "ของแถมทางร้าน" : "ของแถมแบรนด์"}</span>
                    {g.inStock === false && <span className="text-[10px] text-red-500 font-medium">ของแถมหมด</span>}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">* ของแถมคละแบบ ไม่สามารถเลือกได้</p>
            </div>
          )}

          {product.promotions.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-bold text-gray-900 mb-3">โปรโมชันพิเศษ</h3>
              <ul className="space-y-2">
                {product.promotions.map((promo, idx) => (
                  <li key={idx} className="flex gap-2 text-sm text-gray-700 items-start">
                    <span className="text-[#FF6B00] mt-0.5">✓</span>
                    {promo}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {installments.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-bold text-gray-900 mb-3">ผ่อนชำระผ่านบัตรเครดิต</h3>
            <div className="border border-gray-100 rounded-lg overflow-hidden text-xs">
              <div className="grid grid-cols-3 bg-gray-50 font-medium text-gray-500 p-2">
                <span>ธนาคาร</span>
                <span>ระยะเวลา</span>
                <span className="text-right">ยอดผ่อน/เดือน</span>
              </div>
              {installments.map((row, idx) => (
                <div key={idx} className={`grid grid-cols-3 p-2 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                  <span className="font-medium text-gray-800">{row.bank}</span>
                  <span className="text-gray-600">0% x {row.months} เดือน</span>
                  <span className="text-right font-medium text-gray-900">{formatTHB(row.monthly)}</span>
                </div>
              ))}
            </div>
          </div>
          )}

          <div className="mb-6">
            <h3 className="text-sm font-bold text-gray-900 mb-3">จำนวน</h3>
            <div className="flex items-center border border-gray-300 rounded-md w-32 h-10">
              <button
                onClick={() => setQty(q => Math.max(1, q - 1))}
                className="w-10 h-full flex items-center justify-center text-gray-600 hover:bg-gray-50"
              >
                <Minus className="w-4 h-4" />
              </button>
              <div className="flex-1 h-full flex items-center justify-center font-medium border-x border-gray-300">
                {qty}
              </div>
              <button
                onClick={() => setQty(q => typeof selectedVariant.stockQty === "number" ? Math.min(selectedVariant.stockQty, q + 1) : q + 1)}
                className="w-10 h-full flex items-center justify-center text-gray-600 hover:bg-gray-50"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mb-8">
            <button
              onClick={() => onBuyNow(product, qty, selectedColor, selectedVariant)}
              disabled={!variantInStock}
              className="flex-1 bg-[#1a1a1a] text-white font-bold py-3.5 px-6 rounded-md hover:bg-black transition-colors flex justify-center items-center gap-2 disabled:opacity-40"
            >
              <Wallet className="w-5 h-5" /> ผ่อนสินค้า
            </button>
            <button
              onClick={() => onAddToCart(product, qty, selectedColor, selectedVariant)}
              className="flex-1 bg-[#FFD700] text-black font-bold py-3.5 px-6 rounded-md hover:bg-[#E6C200] transition-colors flex justify-center items-center gap-2"
              disabled={!variantInStock}
            >
              <ShoppingCart className="w-5 h-5" /> {variantInStock ? "เพิ่มลงตะกร้า" : "สินค้าหมด"}
            </button>
            <button
              onClick={() => onToggleWishlist(product.id)}
              className={`sm:flex-none flex items-center justify-center gap-2 border rounded-md py-3.5 px-5 font-medium transition-colors ${
                isWishlisted ? 'border-red-400 bg-red-50 text-red-500' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Heart className={`w-5 h-5 ${isWishlisted ? 'fill-red-500' : ''}`} /> ถูกใจ
            </button>
          </div>

          <div className="border-t border-gray-200 pt-6">
            <h3 className="font-bold text-lg text-gray-900 mb-4">ข้อมูลจำเพาะ</h3>
            <div className="grid grid-cols-1 divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden text-sm">
              {product.specList.map((spec, idx) => (
                <div key={spec.label} className={`grid grid-cols-3 p-3 ${idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}>
                  <span className="text-gray-500 font-medium">{spec.label}</span>
                  <span className="col-span-2 font-medium text-gray-900">{spec.value}</span>
                </div>
              ))}
            </div>

            <h3 className="font-bold text-lg text-gray-900 mb-3 mt-6">รายละเอียดสินค้า</h3>
            <p className="text-gray-700 text-sm leading-relaxed">
              {product.description}
            </p>
          </div>

        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mt-6">
        <ProductReviews productId={product.id} member={member} onLoginRequired={onLoginRequired} />
      </div>
    </div>
  );
}
