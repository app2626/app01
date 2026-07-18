import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BRAND_COLORS } from "../data/products";

export default function BrandStrip() {
  const scrollRef = useRef(null);
  const brands = Object.keys(BRAND_COLORS);

  const scroll = (dir) => {
    scrollRef.current?.scrollBy({ left: dir * 240, behavior: "smooth" });
  };

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-gray-900">แบรนด์ใน i7 Store</h2>
        <div className="flex gap-2">
          <button onClick={() => scroll(-1)} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => scroll(1)} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="flex gap-4 overflow-x-auto scrollbar-hide pb-1">
        {brands.map(brand => {
          const style = BRAND_COLORS[brand];
          return (
            <div
              key={brand}
              className="flex-shrink-0 w-32 h-16 rounded-lg border border-gray-200 flex items-center justify-center font-bold text-sm"
              style={{ backgroundColor: style.bg, color: style.text }}
            >
              {brand}
            </div>
          );
        })}
      </div>
    </div>
  );
}
