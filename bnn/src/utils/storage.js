const PREFIX = "supper_store_";

export function loadState(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function saveState(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // localStorage ไม่พร้อมใช้งาน (เช่น private mode) ข้ามการบันทึกไป
  }
}

export function clearState(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}

export function mergeCarts(serverCart, localCart) {
  const merged = (serverCart || []).map(item => ({ ...item }));
  (localCart || []).forEach(localItem => {
    const idx = merged.findIndex(item =>
      item.product.id === localItem.product.id &&
      item.selectedColor === localItem.selectedColor &&
      item.selectedVariant.label === localItem.selectedVariant.label
    );
    if (idx >= 0) {
      merged[idx] = { ...merged[idx], qty: merged[idx].qty + localItem.qty };
    } else {
      merged.push(localItem);
    }
  });
  return merged;
}
