import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ProductCard from "./ProductCard";

export default function ProductCarousel({ title, products, onProductClick }) {
  const scrollRef = useRef(null);

  if (products.length === 0) return null;

  const scroll = (dir) => {
    scrollRef.current?.scrollBy({ left: dir * 280, behavior: "smooth" });
  };

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
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
        {products.map(product => (
          <div key={product.id} className="flex-shrink-0 w-44 sm:w-52">
            <ProductCard product={product} onClick={onProductClick} listMode={false} />
          </div>
        ))}
      </div>
    </div>
  );
}
