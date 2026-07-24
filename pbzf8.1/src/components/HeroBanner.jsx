import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const DEFAULT_SLIDES = [
  { title: "SPayLater ปลดล็อค ทุกขีดจำกัด", subtitle: "กับมือถือเรือธง ผ่อนสบาย 0% นานสูงสุด 36 เดือน", bgColor: "#FFD700", textColor: "black" },
  { title: "สมัครสมาชิก i7 Store วันนี้", subtitle: "รับคะแนนสะสมทันที และส่วนลดพิเศษเฉพาะสมาชิก", bgColor: "#FF6B00", textColor: "white" },
  { title: "ส่งฟรีทั่วไทย ไม่มีขั้นต่ำ", subtitle: "ช้อปสินค้าไอทีครบวงจร รับของถึงบ้านไว", bgColor: "#1a1a1a", textColor: "white" }
];

export default function HeroBanner({ slides, onNavigate }) {
  const activeSlides = slides?.length ? slides : DEFAULT_SLIDES;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [activeSlides.length]);

  useEffect(() => {
    const timer = setInterval(() => setIndex(i => (i + 1) % activeSlides.length), 5000);
    return () => clearInterval(timer);
  }, [activeSlides.length]);

  const prev = () => setIndex(i => (i - 1 + activeSlides.length) % activeSlides.length);
  const next = () => setIndex(i => (i + 1) % activeSlides.length);
  const slide = activeSlides[index];
  const clickable = slide.linkType && slide.linkType !== "none" && onNavigate;

  return (
    <div
      onClick={clickable ? () => onNavigate(slide.linkType, slide.linkValue) : undefined}
      className={`w-full rounded-lg h-40 md:h-56 mb-6 flex items-center justify-between px-6 md:px-12 relative overflow-hidden transition-colors duration-500 bg-cover bg-center ${clickable ? "cursor-pointer" : ""}`}
      style={{
        backgroundColor: slide.bgColor,
        backgroundImage: slide.imageUrl ? `linear-gradient(rgba(0,0,0,0.35),rgba(0,0,0,0.35)), url(${slide.imageUrl})` : undefined
      }}
    >
      <div className="relative z-10 max-w-xl">
        <h2 className="text-2xl md:text-3xl font-bold mb-2" style={{ color: slide.imageUrl ? "white" : slide.textColor }}>{slide.title}</h2>
        <p className="font-medium text-sm md:text-base opacity-80" style={{ color: slide.imageUrl ? "white" : slide.textColor }}>{slide.subtitle}</p>
      </div>

      {activeSlides.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); prev(); }}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/80 rounded-full flex items-center justify-center text-gray-700 hover:bg-white transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); next(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/80 rounded-full flex items-center justify-center text-gray-700 hover:bg-white transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {activeSlides.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setIndex(i); }}
                className={`w-2 h-2 rounded-full transition-colors ${i === index ? "bg-white" : "bg-white/40"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
