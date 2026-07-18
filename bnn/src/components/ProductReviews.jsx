import { useState, useEffect, useCallback } from "react";
import { BadgeCheck } from "lucide-react";
import { StarDisplay, StarInput } from "./StarRating";
import { callGas } from "../utils/gas";
import { submitReviewLocal, getProductReviewsLocal } from "../utils/localMock";

export default function ProductReviews({ productId, member, onLoginRequired }) {
  const [reviews, setReviews] = useState([]);
  const [avg, setAvg] = useState(0);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [myRating, setMyRating] = useState(0);
  const [myComment, setMyComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    callGas("getProductReviews", [productId], getProductReviewsLocal)
      .then(res => {
        setReviews(res.reviews || []);
        setAvg(res.avg || 0);
        setCount(res.count || 0);
      })
      .finally(() => setLoading(false));
  }, [productId]);

  useEffect(() => {
    setMyRating(0);
    setMyComment("");
    setSubmitted(false);
    load();
  }, [load]);

  const handleSubmit = () => {
    if (!member) {
      onLoginRequired();
      return;
    }
    if (myRating < 1) return;

    setSubmitting(true);
    callGas("submitReview", [{
      productId,
      memberEmail: member.email,
      memberName: member.name,
      rating: myRating,
      comment: myComment
    }], submitReviewLocal)
      .then(res => {
        if (res.success) {
          setSubmitted(true);
          load();
        }
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <div id="reviews">
      <h3 className="font-bold text-lg text-gray-900 mb-4">รีวิวจากลูกค้า</h3>

      <div className="flex items-center gap-4 mb-6">
        <div className="text-3xl font-bold text-gray-900">{avg.toFixed(1)}</div>
        <div>
          <StarDisplay rating={avg} size="w-5 h-5" />
          <p className="text-xs text-gray-500 mt-1">{count.toLocaleString("th-TH")} รีวิว</p>
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        {submitted ? (
          <p className="text-sm text-green-700 font-medium">ขอบคุณสำหรับรีวิวของคุณ!</p>
        ) : (
          <>
            <h4 className="text-sm font-bold text-gray-900 mb-2">ให้คะแนนสินค้านี้</h4>
            <StarInput value={myRating} onChange={setMyRating} />
            <textarea
              value={myComment}
              onChange={e => setMyComment(e.target.value)}
              placeholder="เขียนความคิดเห็นของคุณ (ไม่บังคับ)"
              className="w-full mt-3 border border-gray-300 rounded-md p-2.5 text-sm resize-none h-20"
            />
            <button
              onClick={handleSubmit}
              disabled={member ? (myRating < 1 || submitting) : submitting}
              className="mt-2 bg-[#1a1a1a] text-white text-sm font-bold px-5 py-2 rounded-md hover:bg-black transition-colors disabled:opacity-40"
            >
              {submitting ? "กำลังส่ง..." : member ? "ส่งรีวิว" : "เข้าสู่ระบบเพื่อรีวิว"}
            </button>
          </>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">กำลังโหลดรีวิว...</p>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-gray-400">ยังไม่มีรีวิวสำหรับสินค้านี้ เป็นคนแรกที่รีวิวเลย!</p>
      ) : (
        <div className="space-y-4">
          {reviews.map(r => (
            <div key={r.reviewId} className="border-b border-gray-100 pb-4 last:border-b-0">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-900">{r.memberName || "ลูกค้า"}</span>
                  {r.verifiedPurchase && (
                    <span className="flex items-center gap-1 text-[11px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
                      <BadgeCheck className="w-3 h-3" /> ซื้อสินค้าแล้ว
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleDateString("th-TH")}</span>
              </div>
              <StarDisplay rating={r.rating} />
              {r.comment && <p className="text-sm text-gray-700 mt-2 leading-relaxed">{r.comment}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
