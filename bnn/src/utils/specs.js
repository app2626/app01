export function getSpecValue(product, label) {
  return product.specList?.find(s => s.label === label)?.value || "";
}

export function parseRamGB(product) {
  const match = getSpecValue(product, "หน่วยความจำ").match(/RAM\s*(\d+)\s*GB/i);
  return match ? `${match[1]}GB` : null;
}

export function parseBackCameraMP(product) {
  const value = getSpecValue(product, "กล้องหลัง");
  return value || null;
}

export function parseBatteryBucket(product) {
  const value = getSpecValue(product, "แบตเตอรี่");
  const match = value.replace(/,/g, "").match(/(\d+)/);
  if (!match) return null;
  const mah = Number(match[1]);
  if (mah < 4000) return "<4000mAh";
  if (mah <= 5000) return "4000-5000mAh";
  return "5000mAh+";
}
