import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function ImageGallery({ images }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => setActiveIndex(0), [images]);

  const prev = () => setActiveIndex((curr) => (curr - 1 + images.length) % images.length);
  const next = () => setActiveIndex((curr) => (curr + 1) % images.length);

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="w-full aspect-square bg-gray-50 rounded-lg border border-gray-200 relative flex items-center justify-center group overflow-hidden">
        <img
          src={images[activeIndex]}
          alt="Product view"
          className="w-full h-full object-contain mix-blend-multiply p-4"
        />

        <button
          onClick={prev}
          className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={next}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {images.map((img, idx) => (
          <div
            key={idx}
            onClick={() => setActiveIndex(idx)}
            className={`w-20 h-20 flex-shrink-0 rounded-md border-2 overflow-hidden cursor-pointer bg-gray-50 p-1 flex items-center justify-center ${
              activeIndex === idx ? 'border-[#FFD700]' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <img src={img} alt={`Thumb ${idx}`} className="w-full h-full object-contain mix-blend-multiply" />
          </div>
        ))}
      </div>
    </div>
  );
}
