import { useEffect, useState } from "react";
import { Check, RefreshCw, ShieldCheck, Star, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  fetchPendingStorefrontProductReviews,
  moderateStorefrontProductReview,
  type PendingProductReview,
} from "@/lib/storefront-product-reviews";

function reviewDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("ar-YE", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date)
    : "تاريخ غير متاح";
}

export function StorefrontProductReviewModeration({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const allowed = Boolean(user?.roles?.some((role) => role === "admin" || role === "manager"));
  const [items, setItems] = useState<PendingProductReview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function refresh() {
    if (!allowed) return;
    setLoading(true);
    setError("");
    try {
      setItems(await fetchPendingStorefrontProductReviews());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل قائمة التقييمات.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [allowed]);

  async function decide(item: PendingProductReview, decision: "approve" | "reject") {
    if (busyId) return;
    const note = notes[item.id]?.trim() ?? "";
    if (decision === "reject" && !note) {
      setNotice({ kind: "error", text: "اكتب سبب الرفض قبل إغلاق التقييم." });
      return;
    }
    setBusyId(item.id);
    setNotice(null);
    try {
      const result = await moderateStorefrontProductReview({ reviewId: item.id, decision, note });
      setItems((current) => current.filter((row) => row.id !== result.id));
      setNotes((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      setNotice({
        kind: "success",
        text: result.status === "approved"
          ? "اعتمد التقييم وأصبح مؤهلاً للظهور في واجهة المنتج."
          : "رُفض التقييم وحُفظ سبب القرار في سجل التدقيق.",
      });
    } catch (cause) {
      setNotice({ kind: "error", text: cause instanceof Error ? cause.message : "تعذر حفظ قرار المراجعة." });
    } finally {
      setBusyId(null);
    }
  }

  if (!allowed) {
    return (
      <section dir="rtl" style={{ padding: 22, border: "1px solid #f0d8d4", borderRadius: 13, background: "#fff8f6", color: "#923c35" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 17 }}>صلاحية غير كافية</h2>
        <p style={{ margin: "0 0 14px", fontSize: 12 }}>مراجعة تقييمات العملاء متاحة للمسؤول والمدير فقط.</p>
        <button type="button" className="sf-btn-secondary" onClick={onBack}>العودة إلى المنتجات</button>
      </section>
    );
  }

  return (
    <section dir="rtl" aria-labelledby="product-review-moderation-title" style={{ display: "grid", gap: 15 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <span style={{ color: "#668078", fontSize: 10, fontWeight: 800 }}>كتالوج المتجر · ضبط الجودة</span>
          <h2 id="product-review-moderation-title" style={{ margin: "4px 0", display: "flex", alignItems: "center", gap: 8, color: "#173d37", fontSize: 20 }}>
            <ShieldCheck size={21} /> مراجعة تقييمات العملاء
          </h2>
          <p style={{ margin: 0, color: "#71827d", fontSize: 11 }}>لا يظهر أي تقييم في واجهة العميل إلا بعد اعتماده. بيانات العملاء الشخصية لا تُعرض في قائمة المراجعة.</p>
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          <button type="button" className="sf-btn-secondary" onClick={() => void refresh()} disabled={loading}><RefreshCw size={14} /> تحديث القائمة</button>
          <button type="button" className="sf-btn-secondary" onClick={onBack}>العودة إلى المنتجات</button>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#49685e", fontSize: 11 }}>
        <span style={{ padding: "5px 9px", borderRadius: 999, background: "#edf7f1", fontWeight: 800 }}>{items.length} تقييمات معلّقة في الصفحة</span>
        <span>الحد الأقصى للقراءة في الطلب الواحد 100 تقييم.</span>
      </div>
      {notice ? <p role={notice.kind === "error" ? "alert" : "status"} style={{ margin: 0, padding: 10, borderRadius: 9, background: notice.kind === "error" ? "#fff2ef" : "#eff9f2", color: notice.kind === "error" ? "#9d3c32" : "#176847", fontSize: 12 }}>{notice.text}</p> : null}
      {error ? <p role="alert" style={{ margin: 0, padding: 12, borderRadius: 9, background: "#fff2ef", color: "#9d3c32", fontSize: 12 }}>{error}</p> : null}
      {loading ? <p role="status" style={{ margin: 0, color: "#6e817b", fontSize: 12 }}>جار تحميل التقييمات التي تنتظر قراراً إدارياً...</p> : null}
      {!loading && !error && items.length === 0 ? (
        <div style={{ padding: 22, textAlign: "center", border: "1px dashed #cbded4", borderRadius: 12, color: "#687c74", background: "#fbfdfb" }}>
          <ShieldCheck size={27} style={{ margin: "0 auto 7px" }} />
          <strong style={{ display: "block", color: "#31594b", fontSize: 13 }}>لا توجد تقييمات تنتظر المراجعة</strong>
          <span style={{ fontSize: 11 }}>ستظهر التقييمات الجديدة هنا بعد إرسالها من عملاء لديهم طلبات مسلّمة.</span>
        </div>
      ) : null}
      <div style={{ display: "grid", gap: 12 }}>
        {items.map((item) => (
          <article key={item.id} style={{ minWidth: 0, padding: 15, border: "1px solid #e0eae3", borderRadius: 12, background: "#fff", display: "grid", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: "block", color: "#1e453c", fontSize: 14 }}>{item.productName}</strong>
                <small style={{ display: "block", color: "#7a8983", marginTop: 4, fontSize: 10 }}>رمز الصنف: <bdi dir="ltr">{item.itemCode}</bdi> · الطلب: <bdi dir="ltr">{item.orderNumber}</bdi></small>
              </div>
              <time dateTime={item.createdAt} style={{ color: "#84918d", fontSize: 10 }}>{reviewDate(item.createdAt)}</time>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 2, color: "#c08a31" }} aria-label={item.rating + " من 5 نجوم"}>
              {Array.from({ length: 5 }, (_, index) => <Star key={index} size={15} fill={index < item.rating ? "currentColor" : "none"} />)}
              <strong style={{ marginInlineStart: 6, color: "#52665f", fontSize: 11 }}>{item.rating}/5</strong>
            </div>
            {item.title ? <strong style={{ color: "#35544b", fontSize: 12 }}>{item.title}</strong> : null}
            <p style={{ margin: 0, color: "#4c6259", fontSize: 12, lineHeight: 1.9, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.body}</p>
            <label style={{ display: "grid", gap: 5, color: "#536a60", fontSize: 11, fontWeight: 700 }}>
              سبب الرفض (إلزامي عند الرفض)
              <textarea value={notes[item.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.currentTarget.value }))} maxLength={500} rows={2} placeholder="اكتب سبباً واضحاً ومختصراً عند رفض التقييم..." style={{ width: "100%", boxSizing: "border-box", minHeight: 60, border: "1px solid #d8e3dc", borderRadius: 8, padding: 9, resize: "vertical" }} />
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button type="button" disabled={Boolean(busyId)} onClick={() => void decide(item, "approve")} className="sf-btn-primary"><Check size={14} /> {busyId === item.id ? "جار الحفظ..." : "اعتماد ونشر"}</button>
              <button type="button" disabled={Boolean(busyId) || !(notes[item.id]?.trim())} onClick={() => void decide(item, "reject")} className="sf-btn-secondary" style={{ color: "#9c3e34" }}><X size={14} /> رفض مع السبب</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
