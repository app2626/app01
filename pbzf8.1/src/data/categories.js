import {
  Smartphone,
  FoldHorizontal,
  Cpu,
  Cable,
  Watch,
  Headphones,
  Volume2,
  Laptop,
  Home,
  Wifi,
  Sparkles,
  MoreHorizontal
} from "lucide-react";

export const CATEGORIES = [
  { slug: "mobile-tablet", label: "มือถือและแท็บเล็ต", icon: Smartphone },
  { slug: "foldable", label: "สมาร์ทโฟนจอพับได้", icon: FoldHorizontal },
  { slug: "smartphone", label: "สมาร์ทโฟนอัจฉริยะ", icon: Cpu },
  { slug: "accessory", label: "อุปกรณ์เสริมมือถือและแท็บเล็ต", icon: Cable },
  { slug: "smartwatch", label: "สมาร์ทวอทช์", icon: Watch },
  { slug: "headphone", label: "หูฟัง", icon: Headphones },
  { slug: "speaker", label: "ลำโพง", icon: Volume2 },
  { slug: "notebook", label: "โน้ตบุ๊ค & สมาร์ทเวิร์ค", icon: Laptop },
  { slug: "appliance", label: "เครื่องใช้ไฟฟ้าภายในบ้าน", icon: Home },
  { slug: "smarthome", label: "สมาร์ทโฮม", icon: Wifi },
  { slug: "lifestyle", label: "ไลฟ์สไตล์", icon: Sparkles },
  { slug: "other", label: "อื่นๆ", icon: MoreHorizontal }
];

export function getCategoryLabel(slug) {
  return CATEGORIES.find(c => c.slug === slug)?.label || slug;
}
