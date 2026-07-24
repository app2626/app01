import { Truck, ShieldCheck, RefreshCw, MessageCircle, Gift, CreditCard } from "lucide-react";
import { CATEGORIES } from "../data/categories";

const SERVICES = [
  { icon: Truck, label: "ส่งฟรี ไม่มีขั้นต่ำ" },
  { icon: ShieldCheck, label: "รับประกันสินค้า" },
  { icon: RefreshCw, label: "เปลี่ยน และคืนสินค้า" },
  { icon: MessageCircle, label: "ทักแชท ช้อปเลย" },
  { icon: Gift, label: "สมัครสมาชิกและสะสมคะแนน" },
  { icon: CreditCard, label: "รูดผ่านบัตรหรือผ่อนชำระ" }
];

export default function Footer({ onSelectCategory }) {
  return (
    <footer className="bg-white border-t border-gray-200 mt-10">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h3 className="text-center font-bold text-lg mb-6">บริการที่คุณวางใจได้ที่ i7 Store</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-6 mb-10">
          {SERVICES.map(({ icon: Icon, label }) => (
            <div key={label} className="flex flex-col items-center text-center gap-2">
              <div className="w-12 h-12 rounded-full bg-[#FFFBE6] flex items-center justify-center">
                <Icon className="w-6 h-6 text-[#B8860B]" />
              </div>
              <span className="text-xs text-gray-600">{label}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 border-t border-gray-100 pt-8">
          <div className="col-span-2 md:col-span-2">
            <h4 className="font-bold text-sm mb-3">หมวดหมู่สินค้า</h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.slug}
                  onClick={() => onSelectCategory(cat.slug)}
                  className="text-left text-xs text-gray-500 hover:text-[#FF6B00] transition-colors"
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-bold text-sm mb-3">รู้จักเรา</h4>
            <ul className="space-y-1.5 text-xs text-gray-500">
              <li>นโยบายความเป็นส่วนตัว</li>
              <li>ร่วมงานกับเรา</li>
              <li>ติดต่อเรา</li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-sm mb-3">ติดต่อเรา</h4>
            <p className="text-xs text-gray-500 mb-1">สอบถามข้อมูลเพิ่มเติม ข้อมูลโปรโมชั่น</p>
            <p className="text-xs text-gray-500">customerservice@i7store.store</p>
          </div>
        </div>

        <div className="text-center text-xs text-gray-400 border-t border-gray-100 mt-8 pt-6">
          {new Date().getFullYear() + 543} © i7 Store Company Limited.
        </div>
      </div>
    </footer>
  );
}
