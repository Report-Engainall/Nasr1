import { useEffect, useState } from "react";
import { Check, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  fetchPendingStorefrontProductQuestions,
  moderateStorefrontProductQuestion,
  type PendingProductQuestion,
} from "@/lib/storefront-product-questions";

function questionDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("ar-YE", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date)
    : "تاريخ غير متاح";
}

export function StorefrontProductQuestionModeration({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const allowed = Boolean(user?.roles?.some((role) => role === "admin" || role === "manager"));
  const [items, setItems] = useState<PendingProductQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function refresh() {
    if (!allowed) return;
    setLoading(true);
    setError("");
    try {
      setItems(await fetchPendingStorefrontProductQuestions());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل أسئلة العملاء.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void refresh(); }, [allowed]);

  async function decide(item: PendingProductQuestion, decision: "answer" | "reject") {
    if (busyId) return;
    const answer = answers[item.id]?.trim() ?? "";
    const note = notes[item.id]?.trim() ?? "";
    if (decision === "answer" && (answer.length < 5 || answer.length > 1500)) {
      setNotice({ kind: "error", text: "اكتب إجابة واضحة من 5 إلى 1500 حرف." });
      return;
    }
    if (decision === "reject" && (note.length < 5 || note.length > 500)) {
      setNotice({ kind: "error", text: "اكتب سبب الرفض من 5 إلى 500 حرف." });
      return;
    }
    setBusyId(item.id);
    setNotice(null);
    try {
      const result = await moderateStorefrontProductQuestion({
        questionId: item.id, decision, answer, note,
      });
      setItems((current) => current.filter((row) => row.id !== result.id));
      setNotice({
        kind: "success",
        text: result.status === "answered" ? "نُشرت إجابة المتجر وأصبحت ظاهرة للزوار." : "رُفض السؤال وحُفظ سبب القرار في سجل التدقيق.",
      });
    } catch (cause) {
      setNotice({ kind: "error", text: cause instanceof Error ? cause.message : "تعذر حفظ قرار السؤال." });
    } finally {
      setBusyId(null);
    }
  }

  if (!allowed) {
    return (
      <section dir="rtl" style={{ padding: 22, border: "1px solid #f0d8d4", borderRadius: 13, background: "#fff8f6", color: "#923c35" }}>
        أسئلة العملاء متاحة للمسؤول والمدير فقط.
      </section>
    );
  }

  return (
    <section dir="rtl" style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div><strong style={{ color: "#1e453c" }}>قائمة الأسئلة التي تنتظر إجابة المتجر</strong><p style={{ margin: "4px 0 0", color: "#72827b", fontSize: 11 }}>الإجابة المنشورة تظهر لكل زوار المنتج؛ سبب الرفض يبقى خاصاً بالعميل وسجل التدقيق.</p></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="sf-btn-secondary" onClick={onBack}>العودة للمنتجات</button>
          <button type="button" className="sf-btn-secondary" disabled={loading} onClick={() => void refresh()}><RefreshCw size={14} /> تحديث</button>
        </div>
      </div>
      {error && <p role="alert" style={{ margin: 0, padding: 10, background: "#fff3f1", color: "#9b4238", borderRadius: 9, fontSize: 12 }}>{error}</p>}
      {notice && <p role={notice.kind === "error" ? "alert" : "status"} style={{ margin: 0, padding: 10, background: notice.kind === "error" ? "#fff3f1" : "#effaf4", color: notice.kind === "error" ? "#9b4238" : "#176b4b", borderRadius: 9, fontSize: 12 }}>{notice.text}</p>}
      {loading ? <p role="status" style={{ color: "#687b72", fontSize: 12 }}>جار تحميل الأسئلة المعلّقة...</p> : null}
      {!loading && !error && items.length === 0 ? <div style={{ padding: 24, background: "#f7faf8", borderRadius: 10, color: "#6a7d74", textAlign: "center" }}>لا توجد أسئلة تنتظر الإجابة.</div> : null}
      <div style={{ display: "grid", gap: 12 }}>
        {items.map((item) => (
          <article key={item.id} style={{ padding: 15, border: "1px solid #e0eae3", borderRadius: 12, background: "#fff", display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div><strong style={{ color: "#1e453c", fontSize: 14 }}>{item.productName}</strong><small style={{ display: "block", color: "#7a8983", marginTop: 4, fontSize: 10 }}>رمز الصنف: <bdi dir="ltr">{item.itemCode}</bdi></small></div>
              <time dateTime={item.createdAt} style={{ color: "#84918d", fontSize: 10 }}>{questionDate(item.createdAt)}</time>
            </div>
            <p style={{ margin: 0, color: "#314e45", fontSize: 13, lineHeight: 1.9, whiteSpace: "pre-wrap" }}>{item.questionText}</p>
            {item.verifiedPurchase && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#18704f", fontSize: 10, fontWeight: 800 }}><ShieldCheck size={13} /> شراء مسلّم موثّق</span>}
            <label style={{ display: "grid", gap: 5, color: "#536a60", fontSize: 11, fontWeight: 700 }}>
              إجابة المتجر (5–1500 حرف)
              <textarea rows={3} maxLength={1500} value={answers[item.id] ?? ""} onChange={(event) => { const value = event.currentTarget.value; setAnswers((current) => ({ ...current, [item.id]: value })); }} placeholder="اكتب إجابة دقيقة حول المنتج..." style={{ width: "100%", boxSizing: "border-box", minHeight: 76, padding: 9, border: "1px solid #d8e3dc", borderRadius: 8, resize: "vertical" }} />
            </label>
            <label style={{ display: "grid", gap: 5, color: "#536a60", fontSize: 11, fontWeight: 700 }}>
              سبب الرفض (5–500 حرف، عند الرفض فقط)
              <textarea rows={2} maxLength={500} value={notes[item.id] ?? ""} onChange={(event) => { const value = event.currentTarget.value; setNotes((current) => ({ ...current, [item.id]: value })); }} placeholder="اشرح سبب عدم ملاءمة السؤال للنشر..." style={{ width: "100%", boxSizing: "border-box", minHeight: 56, padding: 9, border: "1px solid #d8e3dc", borderRadius: 8, resize: "vertical" }} />
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button type="button" disabled={Boolean(busyId) || (answers[item.id]?.trim().length ?? 0) < 5} onClick={() => void decide(item, "answer")} className="sf-btn-primary"><Check size={14} /> {busyId === item.id ? "جار الحفظ..." : "إجابة ونشر"}</button>
              <button type="button" disabled={Boolean(busyId) || (notes[item.id]?.trim().length ?? 0) < 5} onClick={() => void decide(item, "reject")} className="sf-btn-secondary" style={{ color: "#9c3e34" }}><X size={14} /> رفض مع السبب</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
