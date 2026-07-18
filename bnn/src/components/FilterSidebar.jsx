import { useState, useMemo } from "react";
import { X, ChevronDown, ChevronUp } from "lucide-react";
import { parseRamGB, parseBackCameraMP, parseBatteryBucket } from "../utils/specs";

function Accordion({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-200 py-4">
      <div
        className="flex justify-between items-center cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        <h3 className="font-bold text-sm">{title}</h3>
        {open ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
      </div>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

export default function FilterSidebar({ products, filters, onFiltersChange, onReset, isMobile, onClose }) {
  const toggleSet = (set, value) => {
    const newSet = new Set(set);
    if (newSet.has(value)) newSet.delete(value);
    else newSet.add(value);
    return newSet;
  };

  const handlePriceChange = (e, type) => {
    onFiltersChange({ ...filters, [type]: Number(e.target.value) });
  };

  const brandOptions = useMemo(
    () => [...new Set(products.map(p => p.brand))].sort(),
    [products]
  );
  const ramOptions = useMemo(
    () => [...new Set(products.map(parseRamGB).filter(Boolean))].sort((a, b) => Number(a) - Number(b)),
    [products]
  );
  const cameraOptions = useMemo(
    () => [...new Set(products.map(parseBackCameraMP).filter(Boolean))],
    [products]
  );
  const batteryOptions = ["<4000mAh", "4000-5000mAh", "5000mAh+"];

  const content = (
    <div className="p-4 h-full overflow-y-auto bg-white">
      {isMobile && (
        <div className="flex justify-between items-center mb-4 pb-4 border-b">
          <h2 className="font-bold text-lg">ตัวกรองสินค้า</h2>
          <button onClick={onClose}><X className="w-6 h-6" /></button>
        </div>
      )}

      <div className="mb-4">
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            className="rounded text-[#FFD700] focus:ring-[#FFD700] w-4 h-4"
            checked={filters.inStock}
            onChange={(e) => onFiltersChange({ ...filters, inStock: e.target.checked })}
          />
          <span className="text-sm font-medium">แสดงสินค้าพร้อมขาย</span>
        </label>
      </div>

      <Accordion title="ช่วงราคา">
        <div className="flex items-center space-x-2 mb-2">
          <input
            type="number"
            value={filters.priceMin}
            onChange={(e) => handlePriceChange(e, 'priceMin')}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-center"
            min="0"
          />
          <span className="text-gray-500">-</span>
          <input
            type="number"
            value={filters.priceMax}
            onChange={(e) => handlePriceChange(e, 'priceMax')}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-center"
            min="0"
          />
        </div>
        <input
          type="range"
          min="0"
          max="96300"
          value={filters.priceMax}
          onChange={(e) => handlePriceChange(e, 'priceMax')}
          className="w-full accent-[#FFD700]"
        />
      </Accordion>

      {brandOptions.length > 0 && (
        <Accordion title="BRAND">
          <div className="space-y-2">
            {brandOptions.map(brand => (
              <label key={brand} className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded text-[#FFD700] focus:ring-[#FFD700] w-4 h-4"
                  checked={filters.brands.has(brand)}
                  onChange={() => onFiltersChange({ ...filters, brands: toggleSet(filters.brands, brand) })}
                />
                <span className="text-sm">{brand}</span>
              </label>
            ))}
          </div>
        </Accordion>
      )}

      {ramOptions.length > 0 && (
        <Accordion title="RAM">
          <div className="space-y-2">
            {ramOptions.map(ram => (
              <label key={ram} className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded text-[#FFD700] focus:ring-[#FFD700] w-4 h-4"
                  checked={filters.ram.has(ram)}
                  onChange={() => onFiltersChange({ ...filters, ram: toggleSet(filters.ram, ram) })}
                />
                <span className="text-sm">{ram}</span>
              </label>
            ))}
          </div>
        </Accordion>
      )}

      {cameraOptions.length > 0 && (
        <Accordion title="BACK CAMERA">
          <div className="space-y-2">
            {cameraOptions.map(cam => (
              <label key={cam} className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded text-[#FFD700] focus:ring-[#FFD700] w-4 h-4"
                  checked={filters.backCamera.has(cam)}
                  onChange={() => onFiltersChange({ ...filters, backCamera: toggleSet(filters.backCamera, cam) })}
                />
                <span className="text-sm">{cam}</span>
              </label>
            ))}
          </div>
        </Accordion>
      )}

      {products.some(p => parseBatteryBucket(p)) && (
        <Accordion title="BATTERY">
          <div className="space-y-2">
            {batteryOptions.map(bat => (
              <label key={bat} className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded text-[#FFD700] focus:ring-[#FFD700] w-4 h-4"
                  checked={filters.battery.has(bat)}
                  onChange={() => onFiltersChange({ ...filters, battery: toggleSet(filters.battery, bat) })}
                />
                <span className="text-sm">{bat}</span>
              </label>
            ))}
          </div>
        </Accordion>
      )}

      <div className="mt-6">
        <button
          onClick={onReset}
          className="w-full bg-gray-200 text-gray-700 py-2 rounded-md font-medium hover:bg-gray-300 transition-colors"
        >
          ล้างตัวกรอง
        </button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 flex">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        <div className="relative w-4/5 max-w-sm h-full bg-white shadow-xl" onClick={e => e.stopPropagation()}>
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="w-[280px] flex-shrink-0 bg-white border-r border-gray-200 hidden md:block">
      {content}
    </div>
  );
}
