import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ChevronDown, MessageSquareText, Send, ShieldCheck, Star } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  fetchCustomerProductReviewContext,
  fetchStorefrontProductReviews,
  submitStorefrontProductReview,
  type CustomerProductReviewContext,
  type StorefrontProductReviewSummary,
} from "@/lib/storefront-product-reviews";

function formatReviewDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("ar-YE", { year: "numeric", month: "short", day: "numeric" }).format(date)
    : "تاريخ غير متاح";
}

function StatusMessage({ children, kind = "info" }: { children: ReactNode; kind?: "info" | "error" | "success" }) {
  const color = kind === "error" ? "#a23d35" : kind === "success" ? "#176b4b" : "#526b70";
  const background = kind === "error" ? "#fff3f1" : kind === "success" ? "#effaf4" : "#f3f8f7";
  return <p role={kind === "error" ? "alert" : "status"} style={{ margin: 0, padding: "10px 12px", borderRadius: 9, background, color, fontSize: 12, lineHeight: 1.8 }}>{children}</p>;
}

export function StorefrontProductReviews({ productId }: { productId: string }) {
  const { user } = useAuth();
  const isCustomer = Boolean(user && !user.isStaff && user.roles?.includes("customer"));
  const [summary, setSummary] = useState<StorefrontProductReviewSummary | null>(null);
  const [context, setContext] = useState<CustomerProductReviewContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [contextLoading, setContextLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [contextError, setContextError] = useState("");
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: "success" | "error" } | null>(null);

  async function loadSummary(isActive: () => boolean = () => true) {
    setLoading(true);
    setError("");
    try {
      const result = await fetchStorefrontProductReviews(productId);
      if (isActive()) setSummary(result);
    } catch (cause) {
      if (isActive()) setError(cause instanceof Error ? cause.message : "تعذر تحميل تقييمات المنتج.");
    } finally {
      if (isActive()) setLoading(false);
    }
  }

  async function loadMoreReviews() {
    if (!summary || !summary.hasMore || loadingMore || summary.items.length > 10000) return;
    setLoadingMore(true);
    setError("");
    try {
      const next = await fetchStorefrontProductReviews(productId, 8, summary.items.length);
      setSummary((current) => {
        if (!current) return next;
        const seen = new Set(current.items.map((item) => item.id));
        return {
          ...current,
          items: [...current.items, ...next.items.filter((item) => !seen.has(item.id))],
          hasMore: next.hasMore,
        };
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل بقية التقييمات.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function loadCustomerContext(isActive: () => boolean = () => true) {
    if (!isCustomer) {
      setContext(null);
      setContextError("");
      setContextLoading(false);
      return;
    }
    setContextLoading(true);
    setContextError("");
    try {
      const result = await fetchCustomerProductReviewContext(productId);
      if (isActive()) {
        setContext(result);
        if (result.review) {
          setRating(result.review.rating);
          setTitle(result.review.title);
          setBody(result.review.body);
        } else {
          setRating(5);
          setTitle("");
          setBody("");
        }
      }
    } catch (cause) {
      if (isActive()) setContextError(cause instanceof Error ? cause.message : "تعذر التحقق من أهلية التقييم.");
    } finally {
      if (isActive()) setContextLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    setSummary(null);
    setContext(null);
    setMessage(null);
    void loadSummary(() => active);
    void loadCustomerContext(() => active);
    return () => { active = false; };
  }, [productId, user?.id, user?.profileId, isCustomer]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isCustomer || !context?.eligible || !context.orderItemId || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const result = await submitStorefrontProductReview({
        productId,
        orderItemId: context.orderItemId,
        rating,
        title,
        body,
      });
      setMessage({ text: result.message, kind: "success" });
      await Promise.all([loadSummary(), loadCustomerContext()]);
    } catch (cause) {
      setMessage({ text: cause instanceof Error ? cause.message : "تعذر حفظ التقييم.", kind: "error" });
    } finally {
      setSaving(false);
    }
  }

  const ownReview = context?.review ?? null;
  const ownStatusText = ownReview?.status === "pending"
    ? "تقييمك قيد مراجعة المتجر ولن يظهر للزوار قبل اعتماده."
    : ownReview?.status === "rejected"
      ? "لم يُعتمد تقييمك السابق. راجع السبب ثم أعد الإرسال."
      : ownReview?.status === "approved"
        ? "تقييمك السابق منشور. أي تعديل جديد سيعود للمراجعة قبل النشر."
        : "";

  return (
    <section aria-labelledby="sf-product-reviews-title" dir="rtl" style={{ marginTop: 24, padding: "20px 0 4px", borderTop: "1px solid #e4ecea", display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 id="sf-product-reviews-title" style={{ display: "flex", alignItems: "center", gap: 8, margin: 0, color: "#173b39", fontSize: 18 }}>
            <MessageSquareText size={19} /> تقييمات المشترين
          </h3>
          <p style={{ margin: "5px 0 0", color: "#6b7f7d", fontSize: 12 }}>تظهر هنا آراء العملاء الذين اشتروا المنتج فعلياً واعتمد المتجر تقييماتهم.</p>
        </div>
        {summary && (
          <div aria-label="ملخص تقييم المنتج" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 11px", border: "1px solid #e5ece5", borderRadius: 10, background: "#fbfdfb" }}>
            <Star size={19} fill="#c18a2d" color="#c18a2d" />
            <strong style={{ color: "#173b39", fontSize: 17, direction: "ltr" }}>{summary.averageRating.toFixed(1)}</strong>
            <span style={{ color: "#6b7f7d", fontSize: 11 }}>({summary.reviewCount} تقييم معتمد)</span>
          </div>
        )}
      </div>

      {loading ? <StatusMessage>جار تحميل التقييمات المعتمدة...</StatusMessage> : null}
      {error ? (
        <StatusMessage kind="error">
          {error} <button type="button" onClick={() => void loadSummary()} style={{ marginInlineStart: 8, border: 0, background: "transparent", color: "inherit", fontWeight: 800, textDecoration: "underline" }}>إعادة المحاولة</button>
        </StatusMessage>
      ) : null}
      {!loading && !error && summary?.reviewCount === 0 ? (
        <div style={{ padding: 14, borderRadius: 10, background: "#f7faf8", color: "#617471", fontSize: 12 }}>لا توجد تقييمات موثّقة معتمدة لهذا المنتج حتى الآن.</div>
      ) : null}
      {summary?.items.map((review) => (
        <article key={review.id} style={{ padding: "14px 15px", border: "1px solid #e7eeeb", borderRadius: 11, background: "#fff", display: "grid", gap: 7 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span aria-label={review.rating + " من 5 نجوم"} style={{ display: "inline-flex", gap: 2, color: "#c18a2d" }}>
                {Array.from({ length: 5 }, (_, index) => <Star key={index} size={14} fill={index < review.rating ? "currentColor" : "none"} />)}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#18704f", fontSize: 10, fontWeight: 800 }}><ShieldCheck size={13} /> شراء موثّق</span>
            </div>
            <time dateTime={review.createdAt} style={{ color: "#80908d", fontSize: 10 }}>{formatReviewDate(review.createdAt)}</time>
          </div>
          {review.title ? <strong style={{ color: "#24413d", fontSize: 13 }}>{review.title}</strong> : null}
          <p style={{ margin: 0, color: "#536864", fontSize: 12, lineHeight: 1.9, whiteSpace: "pre-wrap" }}>{review.body}</p>
        </article>
      ))}

      {isCustomer ? (
        <div style={{ marginTop: 4, padding: 15, border: "1px solid #dfeae3", borderRadius: 12, background: "#fbfdfb", display: "grid", gap: 12 }}>
          <div>
            <strong style={{ color: "#1e4640", fontSize: 13 }}>شارك تجربتك بعد استلام الطلب</strong>
            <p style={{ margin: "4px 0 0", color: "#71817d", fontSize: 11 }}>التقييم مرتبط ببند طلب مسلّم، ويُراجع قبل نشره. لا نعرض اسمك أو رقم طلبك للزوار.</p>
          </div>
          {contextLoading ? <StatusMessage>جار التحقق من سجل الشراء...</StatusMessage> : null}
          {contextError ? <StatusMessage kind="error">{contextError}</StatusMessage> : null}
          {!contextLoading && !contextError && context && !context.eligible ? (
            <StatusMessage>يتاح التقييم بعد تسليم طلب يحتوي على هذا المنتج وربطه بحساب العميل.</StatusMessage>
          ) : null}
          {ownStatusText ? (
            <StatusMessage kind={ownReview?.status === "rejected" ? "error" : "info"}>
              {ownStatusText}{ownReview?.moderationNote ? " سبب المراجعة: " + ownReview.moderationNote : ""}
            </StatusMessage>
          ) : null}
          {context?.eligible && context.orderNumber ? (
            <p style={{ margin: 0, color: "#71817d", fontSize: 10 }}>الشراء المؤهل: <bdi dir="ltr">{context.orderNumber}</bdi> — استلمته المتجر بوصفه طلباً مسلّماً.</p>
          ) : null}
          {context?.eligible && context.orderItemId ? (
            <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
              <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0 }}>
                <legend style={{ marginBottom: 7, color: "#314d47", fontSize: 11, fontWeight: 800 }}>تقييمك للمنتج</legend>
                <div role="group" aria-label="اختر عدد النجوم" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  {Array.from({ length: 5 }, (_, index) => {
                    const value = index + 1;
                    return <button key={value} type="button" aria-label={value + " نجوم"} aria-pressed={rating === value} onClick={() => setRating(value)} style={{ width: 36, height: 36, display: "grid", placeItems: "center", border: rating === value ? "1px solid #bb8c3a" : "1px solid #e0e8e2", borderRadius: 8, background: rating === value ? "#fff7e8" : "#fff", color: "#bd872d" }}><Star size={18} fill={value <= rating ? "currentColor" : "none"} /></button>;
                  })}
                </div>
              </fieldset>
              <label style={{ display: "grid", gap: 5, color: "#425d56", fontSize: 11, fontWeight: 700 }}>
                عنوان مختصر (اختياري)
                <input value={title} onChange={(event) => setTitle(event.currentTarget.value)} maxLength={100} placeholder="مثلاً: جودة ممتازة" style={{ width: "100%", boxSizing: "border-box", minHeight: 40, padding: "8px 10px", border: "1px solid #d6e2da", borderRadius: 8, background: "#fff" }} />
              </label>
              <label style={{ display: "grid", gap: 5, color: "#425d56", fontSize: 11, fontWeight: 700 }}>
                تجربتك مع المنتج
                <textarea value={body} onChange={(event) => setBody(event.currentTarget.value)} minLength={10} maxLength={1500} required rows={4} placeholder="اكتب تجربتك الفعلية بعد الاستلام (10 أحرف على الأقل)..." style={{ width: "100%", boxSizing: "border-box", minHeight: 90, padding: 10, border: "1px solid #d6e2da", borderRadius: 8, background: "#fff", resize: "vertical", lineHeight: 1.8 }} />
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <button type="submit" disabled={saving || body.trim().length < 10} className="sf-btn-primary"><Send size={15} /> {saving ? "جار إرسال التقييم..." : ownReview ? "إعادة إرسال للمراجعة" : "إرسال التقييم"}</button>
                <span style={{ color: "#83918d", fontSize: 10 }}>{body.trim().length}/1500 حرفاً</span>
              </div>
            </form>
          ) : null}
          {message ? <StatusMessage kind={message.kind}>{message.text}</StatusMessage> : null}
        </div>
      ) : (
        <div style={{ marginTop: 4, padding: 12, borderRadius: 10, background: "#f7faf8", color: "#71817d", fontSize: 11, lineHeight: 1.8 }}>
          لإضافة تقييم موثّق، سجّل الدخول بحساب عميل بعد استلام طلب يحتوي على هذا المنتج.
        </div>
      )}
      {summary?.hasMore && summary.items.length <= 10000 ? <button type="button" className="sf-btn-secondary" onClick={() => void loadMoreReviews()} disabled={loadingMore}><ChevronDown size={14} /> {loadingMore ? "جار تحميل المزيد..." : "عرض المزيد من التقييمات"}</button> : null}
    </section>
  );
}
