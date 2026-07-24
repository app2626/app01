import { useState } from "react";
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

function CompareCheckbox({ product, isComparing, onToggleCompare }) {
  if (!onToggleCompare) return null;
  return (
    <label
      className="flex items-center gap-1.5 text-xs text-gray-500 mt-2 cursor-pointer w-fit"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={!!isComparing}
        onChange={() => onToggleCompare(product.id)}
        className="rounded"
      />
      เปรียบเทียบ
    </label>
  );
}

function variantsForColor(product, color) {
  const matches = product.variants.filter(v => v.color === color);
  return matches.length ? matches : product.variants;
}

function StockBadge({ variant }) {
  if (!variant || typeof variant.stockQty !== "number") return null;
  if (variant.stockQty <= 0 || variant.inStock === false) {
    return (
      <span className="absolute top-2 right-2 bg-gray-400 text-white text-[10px] font-bold px-2 py-1 rounded-sm">
        สินค้าหมด
      </span>
    );
  }
  if (variant.stockQty <= 10) {
    return (
      <span className="absolute top-2 right-2 bg-amber-500 text-white text-[10px] font-bold px-2 py-1 rounded-sm">
        เหลือ {variant.stockQty} ชิ้น
      </span>
    );
  }
  return (
    <span className="absolute top-2 right-2 bg-green-600 text-white text-[10px] font-bold px-2 py-1 rounded-sm">
      มีสินค้า
    </span>
  );
}

function VariantPicker({ product, selectedColor, selectedVariant, onPickColor, onPickVariant }) {
  const memoryOptions = variantsForColor(product, selectedColor);
  return (
    <div onClick={(e) => e.stopPropagation()}>
      {product.colors.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {product.colors.map(color => (
            <button
              key={color}
              type="button"
              title={color}
              onClick={() => onPickColor(color)}
              className={`w-5 h-5 rounded-full border-2 flex-shrink-0 ${
                selectedColor === color ? "border-[#FFD700] ring-1 ring-[#FFD700]" : "border-gray-200"
              }`}
              style={{ backgroundColor: product.colorHex[color] || "#CCCCCC" }}
            />
          ))}
        </div>
      )}
      {memoryOptions.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {memoryOptions.map((v, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onPickVariant(v)}
              className={`px-1.5 py-0.5 border rounded text-[10px] font-medium ${
                selectedVariant.sku === v.sku ? "border-[#FFD700] bg-[#FFFBE6] text-black" : "border-gray-300 text-gray-600"
              } ${v.inStock === false ? "opacity-40" : ""}`}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProductCard({ product, onClick, listMode, isComparing, onToggleCompare }) {
  const brandStyle = BRAND_COLORS[product.brand] || { bg: "#000", text: "white" };
  const [selectedColor, setSelectedColor] = useState(product.variants[0]?.color || product.colors[0]);
  const [selectedVariant, setSelectedVariant] = useState(product.variants[0]);

  const pickColor = (color) => {
    setSelectedColor(color);
    const options = variantsForColor(product, color);
    const match = options.find(v => v.label === selectedVariant.label) || options[0];
    setSelectedVariant(match);
  };
  const pickVariant = (v) => setSelectedVariant(v);

  const displayImage = product.imagesByColor?.[selectedColor]?.[0] || product.images[0];

  if (listMode) {
    return (
      <div
        className="bg-white rounded-lg border border-gray-200 hover:shadow-md transition cursor-pointer overflow-hidden flex flex-col sm:flex-row"
        onClick={() => onClick(product)}
      >
        <div className="w-full sm:w-1/3 aspect-square sm:aspect-auto sm:h-48 relative bg-gray-50 flex items-center justify-center p-4 overflow-hidden">
          {product.preOrder && <PreOrderRibbon />}
          <img src={product.images[0]} alt={product.name} className="w-full h-full object-contain" />
          <StockBadge variant={product.variants[0]} />

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
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 line-through">{formatTHB(product.originalPrice)}</span>
                <span className="text-[11px] font-medium text-green-600">
                  ประหยัด {formatTHB(product.originalPrice - product.priceMin)}
                </span>
              </div>
            )}
            <CompareCheckbox product={product} isComparing={isComparing} onToggleCompare={onToggleCompare} />
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
        <img src={displayImage} alt={product.name} className="w-full h-full object-contain mix-blend-multiply" />
        <StockBadge variant={selectedVariant} />

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

        <VariantPicker
          product={product}
          selectedColor={selectedColor}
          selectedVariant={selectedVariant}
          onPickColor={pickColor}
          onPickVariant={pickVariant}
        />

        <div className="mt-auto pt-2">
          <div className="text-[15px] font-bold text-[#FF6B00]">
            {formatTHB(selectedVariant.price)}
          </div>
          {product.originalPrice && selectedVariant.price < product.originalPrice && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 line-through">{formatTHB(product.originalPrice)}</span>
              <span className="text-[11px] font-medium text-green-600">
                ประหยัด {formatTHB(product.originalPrice - selectedVariant.price)}
              </span>
            </div>
          )}
          <CompareCheckbox product={product} isComparing={isComparing} onToggleCompare={onToggleCompare} />
        </div>
      </div>
    </div>
  );
}
