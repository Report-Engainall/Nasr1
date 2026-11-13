import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { MessageSquareText, Send, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  fetchCustomerProductQuestions,
  fetchStorefrontProductQuestions,
  submitStorefrontProductQuestion,
  type CustomerProductQuestion,
  type StorefrontProductQuestionSummary,
} from "@/lib/storefront-product-questions";

function questionDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("ar-YE", { year: "numeric", month: "short", day: "numeric" }).format(date)
    : "تاريخ غير متاح";
}
function QuestionNotice({ children, kind = "info" }: { children: ReactNode; kind?: "info" | "error" | "success" }) {
  const color = kind === "error" ? "#a23d35" : kind === "success" ? "#176b4b" : "#526b70";
  const background = kind === "error" ? "#fff3f1" : kind === "success" ? "#effaf4" : "#f3f8f7";
  return <p role={kind === "error" ? "alert" : "status"} style={{ margin: 0, padding: "10px 12px", borderRadius: 9, background, color, fontSize: 12, lineHeight: 1.8 }}>{children}</p>;
}
function questionStatusText(item: CustomerProductQuestion): string {
  if (item.status === "pending") return "سؤالك قيد المراجعة وسيظهر بعد أن يجيب فريق المتجر.";
  if (item.status === "rejected") return "لم يُنشر السؤال. سبب المراجعة: " + (item.moderationNote || "لم يذكر سبب.");
  return "أجاب فريق المتجر عن سؤالك.";
}

export function StorefrontProductQuestions({ productId }: { productId: string }) {
  const { user } = useAuth();
  const isCustomer = Boolean(user && !user.isStaff && user.roles?.includes("customer"));
  const [summary, setSummary] = useState<StorefrontProductQuestionSummary | null>(null);
  const [mine, setMine] = useState<CustomerProductQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [mineLoading, setMineLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [mineError, setMineError] = useState("");
  const [questionText, setQuestionText] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; kind: "success" | "error" } | null>(null);

  async function loadPublic(isActive: () => boolean = () => true) {
    setLoading(true);
    setError("");
    try {
      const result = await fetchStorefrontProductQuestions(productId);
      if (isActive()) setSummary(result);
    } catch (cause) {
      if (isActive()) setError(cause instanceof Error ? cause.message : "تعذر تحميل أسئلة المنتج.");
    } finally {
      if (isActive()) setLoading(false);
    }
  }
  async function loadMine(isActive: () => boolean = () => true) {
    if (!isCustomer) {
      setMine([]);
      setMineError("");
      setMineLoading(false);
      return;
    }
    setMineLoading(true);
    setMineError("");
    try {
      const result = await fetchCustomerProductQuestions(productId);
      if (isActive()) setMine(result);
    } catch (cause) {
      if (isActive()) setMineError(cause instanceof Error ? cause.message : "تعذر تحميل أسئلتك الخاصة.");
    } finally {
      if (isActive()) setMineLoading(false);
    }
  }
  async function loadMore() {
    if (!summary || !summary.hasMore || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const next = await fetchStorefrontProductQuestions(productId, 8, summary.items.length);
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
      setError(cause instanceof Error ? cause.message : "تعذر تحميل بقية الأسئلة.");
    } finally {
      setLoadingMore(false);
    }
  }
  useEffect(() => {
    let active = true;
    setSummary(null);
    setMine([]);
    setNotice(null);
    void loadPublic(() => active);
    void loadMine(() => active);
    return () => { active = false; };
  }, [productId, user?.id, user?.profileId, isCustomer]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isCustomer || saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const result = await submitStorefrontProductQuestion({ productId, questionText });
      setQuestionText("");
      setNotice({ text: result.message, kind: "success" });
      await loadMine();
    } catch (cause) {
      setNotice({ text: cause instanceof Error ? cause.message : "تعذر إرسال السؤال.", kind: "error" });
    } finally {
      setSaving(false);
    }
  }

  const statusStyle = (status: CustomerProductQuestion["status"]) => ({
    pending: { color: "#805b1e", background: "#fff8e8", label: "بانتظار الإجابة" },
    answered: { color: "#176b4b", background: "#effaf4", label: "تمت الإجابة" },
    rejected: { color: "#9b4238", background: "#fff3f1", label: "لم يُنشر" },
  }[status]);

  return (
    <section aria-labelledby="sf-product-questions-title" dir="rtl" style={{ marginTop: 24, padding: "20px 0 4px", borderTop: "1px solid #e4ecea", display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 id="sf-product-questions-title" style={{ display: "flex", alignItems: "center", gap: 8, margin: 0, color: "#173b39", fontSize: 18 }}>
            <MessageSquareText size={19} /> أسئلة وأجوبة المنتج
          </h3>
          <p style={{ margin: "5px 0 0", color: "#6b7f7d", fontSize: 12 }}>اسأل عن المنتج؛ ينشر المتجر الإجابة بعد مراجعتها. لا تظهر بيانات حسابك للزوار.</p>
        </div>
        {summary && <span style={{ padding: "7px 10px", border: "1px solid #e5ece5", borderRadius: 10, background: "#fbfdfb", color: "#617471", fontSize: 11 }}>{summary.questionCount} سؤال مجاب عنه</span>}
      </div>

      {loading ? <QuestionNotice>جار تحميل الأسئلة المجابة...</QuestionNotice> : null}
      {error ? <QuestionNotice kind="error">{error} <button type="button" onClick={() => void loadPublic()} style={{ marginInlineStart: 8, border: 0, background: "transparent", color: "inherit", fontWeight: 800, textDecoration: "underline" }}>إعادة المحاولة</button></QuestionNotice> : null}
      {!loading && !error && summary?.questionCount === 0 ? <div style={{ padding: 14, borderRadius: 10, background: "#f7faf8", color: "#617471", fontSize: 12 }}>لا توجد أسئلة مجابة عن هذا المنتج حتى الآن. كن أول من يسأل.</div> : null}

      {summary?.items.map((item) => (
        <article key={item.id} style={{ padding: "14px 15px", border: "1px solid #e7eeeb", borderRadius: 11, background: "#fff", display: "grid", gap: 9 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <strong style={{ color: "#24413d", fontSize: 13 }}>س: {item.questionText}</strong>
            <time dateTime={item.answeredAt} style={{ color: "#80908d", fontSize: 10 }}>{questionDate(item.answeredAt)}</time>
          </div>
          {item.verifiedPurchase && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#18704f", fontSize: 10, fontWeight: 800 }}><ShieldCheck size={13} /> صاحب السؤال اشترى المنتج فعلياً</span>}
          <div style={{ padding: "10px 12px", borderRadius: 9, background: "#f5faf7", borderInlineStart: "3px solid #26775b" }}>
            <strong style={{ display: "block", color: "#176b4b", fontSize: 11, marginBottom: 4 }}>إجابة المتجر</strong>
            <p style={{ margin: 0, color: "#536864", fontSize: 12, lineHeight: 1.9, whiteSpace: "pre-wrap" }}>{item.answerText}</p>
          </div>
        </article>
      ))}
      {summary?.hasMore && <button type="button" className="sf-btn-secondary" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "جار التحميل..." : "عرض أسئلة أخرى"}</button>}

      {isCustomer ? (
        <div style={{ marginTop: 4, padding: 15, border: "1px solid #dfeae3", borderRadius: 12, background: "#fbfdfb", display: "grid", gap: 12 }}>
          <div>
            <strong style={{ color: "#1e4640", fontSize: 13 }}>اطرح سؤالك عن المنتج</strong>
            <p style={{ margin: "4px 0 0", color: "#71817d", fontSize: 11 }}>يمكنك السؤال قبل الشراء أو بعده. إذا كان لديك شراء مسلّم فسيظهر ذلك كعلامة موثّقة، ولن يظهر اسمك أو رقم طلبك.</p>
          </div>
          {mineLoading ? <QuestionNotice>جار تحميل حالة أسئلتك...</QuestionNotice> : null}
          {mineError ? <QuestionNotice kind="error">{mineError}</QuestionNotice> : null}
          {mine.map((item) => {
            const style = statusStyle(item.status);
            return (
              <article key={item.id} aria-label="سؤال خاص بك" style={{ padding: 11, border: "1px solid #e3ebe6", borderRadius: 9, background: "#fff", display: "grid", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <strong style={{ fontSize: 11, color: "#405950" }}>{item.questionText}</strong>
                  <span style={{ padding: "4px 7px", borderRadius: 20, background: style.background, color: style.color, fontSize: 10, whiteSpace: "nowrap" }}>{style.label}</span>
                </div>
                <small style={{ color: "#75857f", fontSize: 10 }}>{questionStatusText(item)}</small>
                {item.answerText && <p style={{ margin: 0, color: "#52685f", fontSize: 11 }}>{item.answerText}</p>}
              </article>
            );
          })}
          <form onSubmit={submit} style={{ display: "grid", gap: 9 }}>
            <label style={{ display: "grid", gap: 5, color: "#425d56", fontSize: 11, fontWeight: 700 }}>
              سؤالك عن المنتج
              <textarea value={questionText} onChange={(event) => setQuestionText(event.currentTarget.value)} minLength={10} maxLength={800} required rows={3} placeholder="اكتب سؤالك حول المواصفات أو الاستخدام أو التوفر..." style={{ width: "100%", boxSizing: "border-box", minHeight: 82, padding: "9px 10px", border: "1px solid #d6e2da", borderRadius: 8, background: "#fff", resize: "vertical" }} />
            </label>
            <button type="submit" className="sf-btn-primary" disabled={saving || questionText.trim().length < 10}>
              <Send size={15} /> {saving ? "جار إرسال السؤال..." : "إرسال السؤال للمراجعة"}
            </button>
          </form>
          {notice && <QuestionNotice kind={notice.kind}>{notice.text}</QuestionNotice>}
        </div>
      ) : <QuestionNotice>طرح الأسئلة متاح لحساب العميل المسجّل فقط.</QuestionNotice>}
    </section>
  );
}
