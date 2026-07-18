import { Gift, Star } from "lucide-react";
import { BRAND_COLORS } from "../data/products";
import { formatTHB } from "../utils/format";

function RatingBadge({ product }) {
  if (!product.ratingCount) return null;
  return (
    <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
      <Star className="w-3.5 h-3.5 fill-[#FFB800] text-[#FFB800]" />
      <span className="font-medium text-gray-700">{product.ratingAvg.toFixed(1)}</span>
      <span>({product.ratingCount})</span>
    </div>
  );
}

function specLine(product) {
  return product.specList.slice(0, 3).map(s => s.value).join(" | ");
}

function PreOrderRibbon() {
  return (
    <div className="absolute -left-9 top-3 w-32 -rotate-45 bg-red-600 text-white text-[10px] font-bold text-center py-1 shadow-sm select-none">
      PRE-ORDER
    </div>
  );
}

export default function ProductCard({ product, onClick, listMode }) {
  const brandStyle = BRAND_COLORS[product.brand] || { bg: "#000", text: "white" };

  if (listMode) {
    return (
      <div
        className="bg-white rounded-lg border border-gray-200 hover:shadow-md transition cursor-pointer overflow-hidden flex flex-col sm:flex-row"
        onClick={() => onClick(product)}
      >
        <div className="w-full sm:w-1/3 aspect-square sm:aspect-auto sm:h-48 relative bg-gray-50 flex items-center justify-center p-4 overflow-hidden">
          {product.preOrder && <PreOrderRibbon />}
          <img src={product.images[0]} alt={product.name} className="w-full h-full object-contain" />

          {product.badge && (
            <div className={`absolute top-2 left-2 px-2 py-1 text-[10px] font-bold text-white rounded-sm ${product.badge === 'สินค้าใหม่' ? 'bg-[#FF4444]' : product.badge === 'ของแถม' ? 'bg-[#00AA44]' : 'bg-[#FF6B00]'}`}>
              {product.badge}
            </div>
          )}
        </div>

        <div className="p-4 flex-1 flex flex-col justify-between">
          <div>
            <span
              className="inline-block px-2 py-0.5 text-[10px] font-bold rounded-sm mb-2"
              style={{ backgroundColor: brandStyle.bg, color: brandStyle.text }}
            >
              {product.brand.toUpperCase()}
            </span>
            <h3 className="font-medium text-sm text-gray-900 line-clamp-2 mb-2 leading-tight h-10">
              {product.name}
            </h3>
            <p className="text-xs text-gray-500 mb-2">{specLine(product)}</p>
            <RatingBadge product={product} />
            {product.freeGiftItems?.length > 0 && (
              <p className="flex items-center gap-1 text-xs font-medium text-red-600 mb-1">
                <Gift className="w-3.5 h-3.5" /> รับฟรี ของแถม
              </p>
            )}
          </div>

          <div>
            <div className="text-lg font-bold text-[#FF6B00]">
              {product.priceMin === product.priceMax
                ? formatTHB(product.priceMin)
                : `${formatTHB(product.priceMin)} - ${formatTHB(product.priceMax)}`}
            </div>
            {product.originalPrice && product.priceMin === product.priceMax && (
              <div className="text-xs text-gray-400 line-through">{formatTHB(product.originalPrice)}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-white rounded-lg border border-gray-200 hover:shadow-md transition cursor-pointer overflow-hidden flex flex-col h-full"
      onClick={() => onClick(product)}
    >
      <div className="relative aspect-square bg-gray-50 flex items-center justify-center p-4 overflow-hidden">
        {product.preOrder && <PreOrderRibbon />}
        <img src={product.images[0]} alt={product.name} className="w-full h-full object-contain mix-blend-multiply" />

        {product.badge && (
          <div className={`absolute top-2 left-2 px-2 py-1 text-[10px] font-bold text-white rounded-sm ${product.badge === 'สินค้าใหม่' ? 'bg-[#FF4444]' : product.badge === 'ของแถม' ? 'bg-[#00AA44]' : 'bg-[#FF6B00]'}`}>
            {product.badge}
          </div>
        )}
      </div>

      <div className="p-3 flex-1 flex flex-col">
        <span
          className="inline-block px-2 py-0.5 text-[10px] font-bold rounded-sm mb-2 w-fit"
          style={{ backgroundColor: brandStyle.bg, color: brandStyle.text }}
        >
          {product.brand.toUpperCase()}
        </span>
        <h3 className="font-medium text-sm text-gray-900 line-clamp-2 mb-2 leading-tight flex-1">
          {product.name}
        </h3>
        <p className="text-xs text-gray-500 mb-1 truncate">{specLine(product)}</p>
        <RatingBadge product={product} />
        {product.freeGiftItems?.length > 0 && (
          <p className="flex items-center gap-1 text-xs font-medium text-red-600 mb-2">
            <Gift className="w-3.5 h-3.5" /> รับฟรี ของแถม
          </p>
        )}
        <div className="mt-auto">
          <div className="text-[15px] font-bold text-[#FF6B00]">
            {product.priceMin === product.priceMax
              ? formatTHB(product.priceMin)
              : `${formatTHB(product.priceMin)} - ${formatTHB(product.priceMax)}`}
          </div>
        </div>
      </div>
    </div>
  );
}
