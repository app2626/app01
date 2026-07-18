import { X } from "lucide-react";

export default function PromoPopupModal({ popup, onClose, onNavigate }) {
  const handleAction = () => {
    if (popup.linkType === "promotions") onNavigate("promotions");
    else if (popup.linkType === "coupons") onNavigate("coupons");
    else if (popup.linkType === "category") onNavigate("category", popup.linkValue);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center text-gray-600 hover:bg-white"
        >
          <X className="w-5 h-5" />
        </button>

        {popup.imageUrl && (
          <img src={popup.imageUrl} alt={popup.title} className="w-full aspect-video object-cover" />
        )}

        <div className="p-6 text-center">
          {popup.title && <h2 className="text-xl font-bold text-gray-900 mb-2">{popup.title}</h2>}
          {popup.description && <p className="text-sm text-gray-600 leading-relaxed mb-5">{popup.description}</p>}

          {popup.buttonText && popup.linkType !== "none" ? (
            <button
              onClick={handleAction}
              className="bg-[#FFD700] text-black font-bold px-6 py-2.5 rounded-md hover:bg-[#E6C200] transition-colors"
            >
              {popup.buttonText}
            </button>
          ) : (
            <button
              onClick={onClose}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              ปิดหน้าต่างนี้
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
