import { useState, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { callGas } from "../../utils/gas";
import { getAdminReviewsLocal, deleteReviewLocal } from "../../utils/localMock";
import { StarDisplay } from "../StarRating";

export default function AdminReviewsTab({ member }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    callGas("getAdminReviews", [member.email], getAdminReviewsLocal)
      .then(res => {
        if (res.success) setReviews(res.reviews);
      })
      .finally(() => setLoading(false));
  }, [member.email]);

  const handleDelete = async (reviewId) => {
    if (!confirm("ลบรีวิวนี้ใช่หรือไม่?")) return;
    const prev = reviews;
    setReviews(r => r.filter(rv => rv.reviewId !== reviewId));
    const res = await callGas("deleteReview", [reviewId, member.email], deleteReviewLocal);
    if (!res.success) {
      setReviews(prev);
      alert(res.message || "ลบรีวิวไม่สำเร็จ");
    }
  };

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-4">รีวิวทั้งหมด</h2>

      {loading ? (
        <div className="text-center text-gray-500 py-12">กำลังโหลด...</div>
      ) : reviews.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 text-center text-gray-400 py-12">
          ยังไม่มีรีวิวในระบบ
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map(r => (
            <div key={r.reviewId} className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-bold text-gray-900">{r.memberName || "ลูกค้า"}</span>
                    <span className="text-xs text-gray-400">({r.memberEmail})</span>
                    {r.verifiedPurchase && (
                      <span className="text-[11px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded">ซื้อสินค้าแล้ว</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mb-2">สินค้า: {r.productName}</p>
                  <StarDisplay rating={r.rating} />
                  {r.comment && <p className="text-sm text-gray-700 mt-2 leading-relaxed">{r.comment}</p>}
                  <p className="text-xs text-gray-400 mt-2">{new Date(r.createdAt).toLocaleString("th-TH")}</p>
                </div>
                <button
                  onClick={() => handleDelete(r.reviewId)}
                  className="flex-shrink-0 flex items-center gap-1 text-xs text-red-600 hover:bg-red-50 px-2.5 py-1.5 rounded-md transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> ลบ
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
