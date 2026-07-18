import { useState, useMemo } from "react";
import { Search, Filter, LayoutGrid, List } from "lucide-react";
import FilterSidebar from "../components/FilterSidebar";
import ProductCard from "../components/ProductCard";
import { getCategoryLabel } from "../data/categories";
import { applyFilters, defaultFilters } from "../utils/filters";

function productsInCategory(allProducts, categorySlug) {
  if (!categorySlug) return allProducts;
  if (categorySlug === "mobile-tablet") {
    return allProducts.filter(p => ["smartphone", "foldable", "accessory"].includes(p.category));
  }
  return allProducts.filter(p => p.category === categorySlug);
}

export default function CategoryPage({ categorySlug, allProducts, filters, onFiltersChange, onProductClick, onGoHome }) {
  const [showMobileFilter, setShowMobileFilter] = useState(false);
  const [listMode, setListMode] = useState(false);

  const categoryProducts = useMemo(
    () => productsInCategory(allProducts, categorySlug),
    [allProducts, categorySlug]
  );
  const filteredProducts = useMemo(
    () => applyFilters(categoryProducts, filters),
    [categoryProducts, filters]
  );

  const resetFilters = () => {
    onFiltersChange({ ...defaultFilters(), searchQuery: filters.searchQuery });
  };

  const title = categorySlug ? getCategoryLabel(categorySlug) : `ผลการค้นหา "${filters.searchQuery}"`;

  return (
    <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start pb-10 pt-4 px-4 gap-6">

      {showMobileFilter && (
        <FilterSidebar
          products={categoryProducts}
          filters={filters}
          onFiltersChange={onFiltersChange}
          onReset={resetFilters}
          isMobile={true}
          onClose={() => setShowMobileFilter(false)}
        />
      )}

      <FilterSidebar
        products={categoryProducts}
        filters={filters}
        onFiltersChange={onFiltersChange}
        onReset={resetFilters}
        isMobile={false}
      />

      <div className="flex-1 w-full">
        <div className="text-xs text-gray-500 mb-4">
          <span className="cursor-pointer hover:text-gray-900" onClick={onGoHome}>หน้าหลัก</span> &gt;{" "}
          <span className="text-gray-900 font-medium">{title}</span>
        </div>

        <h1 className="text-xl font-bold text-gray-900 mb-4">{title}</h1>

        <div className="bg-white p-3 rounded-lg border border-gray-200 mb-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm font-medium text-gray-700">
            พบสินค้า {filteredProducts.length} รายการ
          </div>

          <div className="flex items-center gap-4 w-full sm:w-auto">
            <div className="flex items-center gap-2 flex-1 sm:flex-none">
              <span className="text-sm text-gray-500 hidden sm:inline">เรียงตาม:</span>
              <select
                className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white outline-none focus:border-[#FFD700] w-full sm:w-auto"
                value={filters.sortBy}
                onChange={(e) => onFiltersChange({ ...filters, sortBy: e.target.value })}
              >
                <option value="relevant">เกี่ยวข้อง</option>
                <option value="price-asc">ราคา: ต่ำ - สูง</option>
                <option value="price-desc">ราคา: สูง - ต่ำ</option>
                <option value="newest">สินค้าใหม่</option>
              </select>
            </div>

            <div className="flex bg-gray-100 rounded-md p-1">
              <button
                className={`p-1.5 rounded ${!listMode ? 'bg-white shadow-sm' : 'text-gray-500'}`}
                onClick={() => setListMode(false)}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                className={`p-1.5 rounded ${listMode ? 'bg-white shadow-sm' : 'text-gray-500'}`}
                onClick={() => setListMode(true)}
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            <button
              className="md:hidden flex items-center gap-1 border border-gray-300 rounded px-3 py-1.5 text-sm"
              onClick={() => setShowMobileFilter(true)}
            >
              <Filter className="w-4 h-4" /> ตัวกรอง
            </button>
          </div>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 flex flex-col items-center justify-center text-center">
            <Search className="w-12 h-12 text-gray-300 mb-4" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">ไม่พบสินค้าที่ตรงกับตัวกรอง</h3>
            <p className="text-gray-500 text-sm mb-4">ลองปรับเปลี่ยนตัวกรอง หรือค้นหาด้วยคำอื่น</p>
            <button
              onClick={resetFilters}
              className="bg-[#FFD700] text-black px-6 py-2 rounded-md font-medium hover:bg-[#E6C200] transition-colors"
            >
              ล้างตัวกรองทั้งหมด
            </button>
          </div>
        ) : (
          <div className={listMode ? "space-y-4" : "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"}>
            {filteredProducts.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                onClick={onProductClick}
                listMode={listMode}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
