import { useState, useRef, useEffect } from "react";
import { Menu, ChevronDown, ChevronRight } from "lucide-react";
import { CATEGORIES } from "../data/categories";

export default function CategoryMenu({ onSelectCategory }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        className="flex items-center gap-2 text-sm font-medium text-gray-800 hover:text-black py-1"
        onClick={() => setOpen(o => !o)}
      >
        <Menu className="w-5 h-5" />
        เลือกสินค้าตามหมวดหมู่
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-72 bg-white rounded-md shadow-xl border border-gray-100 py-2 z-50 max-h-[70vh] overflow-y-auto">
          {CATEGORIES.map(cat => {
            const Icon = cat.icon;
            return (
              <button
                key={cat.slug}
                onClick={() => {
                  onSelectCategory(cat.slug);
                  setOpen(false);
                }}
                className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm text-gray-800 hover:bg-gray-50 hover:text-red-600 transition-colors"
              >
                <span className="flex items-center gap-3">
                  <Icon className="w-4 h-4 text-red-600" />
                  {cat.label}
                </span>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
