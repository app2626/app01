import { Star } from "lucide-react";

export function StarDisplay({ rating = 0, size = "w-4 h-4" }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={`${size} ${i <= Math.round(rating) ? "fill-[#FFB800] text-[#FFB800]" : "fill-gray-200 text-gray-200"}`}
        />
      ))}
    </div>
  );
}

export function StarInput({ value, onChange }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <button
          type="button"
          key={i}
          onClick={() => onChange(i)}
          className="p-0.5"
          aria-label={`${i} ดาว`}
        >
          <Star className={`w-7 h-7 ${i <= value ? "fill-[#FFB800] text-[#FFB800]" : "fill-gray-200 text-gray-200"}`} />
        </button>
      ))}
    </div>
  );
}
