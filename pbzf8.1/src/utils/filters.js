import { parseRamGB, parseBackCameraMP, parseBatteryBucket } from "./specs";

export function defaultFilters() {
  return {
    brands: new Set(),
    priceMin: 0,
    priceMax: 96300,
    ram: new Set(),
    backCamera: new Set(),
    battery: new Set(),
    inStock: false,
    searchQuery: "",
    sortBy: "relevant"
  };
}

export function applyFilters(products, filters) {
  let result = products.filter(p => {
    if (filters.brands.size > 0 && !filters.brands.has(p.brand)) return false;
    if (p.priceMin < filters.priceMin || p.priceMin > filters.priceMax) return false;
    if (filters.ram.size > 0 && !filters.ram.has(parseRamGB(p))) return false;
    if (filters.backCamera.size > 0 && !filters.backCamera.has(parseBackCameraMP(p))) return false;

    if (filters.battery.size > 0 && !filters.battery.has(parseBatteryBucket(p))) return false;

    if (filters.inStock && !p.inStock) return false;

    if (filters.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !p.brand.toLowerCase().includes(q)) return false;
    }

    return true;
  });

  if (filters.sortBy === "price-asc") result.sort((a, b) => a.priceMin - b.priceMin);
  else if (filters.sortBy === "price-desc") result.sort((a, b) => b.priceMin - a.priceMin);
  else if (filters.sortBy === "newest") result.sort((a, b) => {
    const aNew = a.tags?.includes("new") ? 1 : 0;
    const bNew = b.tags?.includes("new") ? 1 : 0;
    return bNew - aNew;
  });

  return result;
}
