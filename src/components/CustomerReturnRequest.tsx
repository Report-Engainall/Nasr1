import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AlertCircle, ClipboardCheck, Printer, RefreshCw, RotateCcw, Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  buildCustomerReturnLines,
  createReturnIdempotencyKey,
  readCustomerReturnSummary,
  readReturnMutationResult,
  type CustomerReturnReason,
  type CustomerReturnSummary,
} from "@/lib/customer-returns";

const panel: React.CSSProperties = {
  marginTop: 18, padding: 18, border: "1px solid #d9e5e7", borderRadius: 14,
  background: "var(--card, #fff)", display: "grid", gap: 14,
};
const field: React.CSSProperties = {
  width: "100%", minWidth: 0, boxSizing: "border-box", padding: "9px 11px",
  border: "1px solid #ccdadd", borderRadius: 8, color: "#21383d",
  background: "#fff", font: "inherit",
};
const button: React.CSSProperties = {
  border: "1px solid #cbdadd", borderRadius: 8, padding: "9px 12px",
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  gap: 7, background: "#fff", color: "#185f61", font: "inherit",
  fontWeight: 750, cursor: "pointer",
};
const primary: React.CSSProperties = {
  ...button, borderColor: "#087f8d", background: "#087f8d", color: "#fff",
};
const muted: React.CSSProperties = { margin: 0, color: "#64787c", lineHeight: 1.7, fontSize: 13 };

const reasonLabels: Record<CustomerReturnReason, string> = {
  damaged: "الصنف تالف",
  wrong_item: "صنف أو مقاس غير صحيح",
  missing_item: "كمية ناقصة",
  quality: "مشكلة جودة",
  other: "سبب آخر",
};
const statusLabels: Record<string, string> = {
  submitted: "مرسل للمراجعة",
  under_review: "قيد المراجعة",
  approved: "مقبول — بانتظار الاستلام والفحص",
  rejected: "مرفوض",
  received: "تم استلام المرتجع",
  closed: "مغلق",
  cancelled: "ملغى",
};

type IdempotentAttempt = { fingerprint: string; key: string };

export function CustomerReturnRequest({ orderId, orderStatus }: { orderId: string; orderStatus: string }) {
  const [summary, setSummary] = useState<CustomerReturnSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<CustomerReturnReason | "">("");
  const [notes, setNotes] = useState("");
  const attemptRef = useRef<IdempotentAttempt | null>(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc("list_my_customer_return_requests", {
        p_order_id: orderId,
      });
      if (rpcError) throw new Error(rpcError.message || "تعذر تحميل طلبات الإرجاع.");
      setSummary(readCustomerReturnSummary(data));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل طلبات الإرجاع.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { void loadSummary(); }, [loadSummary]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!summary || summary.order_status !== "delivered" || orderStatus !== "delivered") {
      setError("لا يمكن طلب إرجاع قبل تأكيد تسليم الطلب.");
      return;
    }
    if (!reason) {
      setError("اختر سبب الإرجاع.");
      return;
    }
    let lines;
    try {
      lines = buildCustomerReturnLines(drafts, summary.returnable_items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "راجع كميات الإرجاع.");
      return;
    }
    const trimmedNotes = notes.trim();
    const fingerprint = JSON.stringify({ orderId, reason, notes: trimmedNotes, lines });
    if (!attemptRef.current || attemptRef.current.fingerprint !== fingerprint) {
      attemptRef.current = { fingerprint, key: createReturnIdempotencyKey() };
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data, error: rpcError } = await supabase.rpc("request_customer_return", {
        p_order_id: orderId,
        p_lines: lines,
        p_reason: reason,
        p_notes: trimmedNotes || null,
        p_idempotency_key: attemptRef.current.key,
      });
      if (rpcError) throw new Error(rpcError.message || "تعذر إرسال طلب الإرجاع.");
      const result = readReturnMutationResult(data);
      setNotice(
        (result.idempotent_replay ? "تم التحقق من الطلب السابق: " : "تم تسجيل طلب الإرجاع: ") +
        result.request_number + ". سيظهر القرار بعد المراجعة.",
      );
      attemptRef.current = null;
      setDrafts({});
      setReason("");
      setNotes("");
      await loadSummary();
    } catch (cause) {
      // Keep this attempt's key so a retry with the same payload cannot create a duplicate.
      setError(cause instanceof Error ? cause.message : "تعذر إرسال طلب الإرجاع.");
    } finally {
      setBusy(false);
    }
  }

  const canRequest = orderStatus === "delivered" && summary?.order_status === "delivered";
  const available = (summary?.returnable_items ?? []).filter((item) => item.remaining_quantity > 0);

  return (
    <section style={panel} aria-labelledby="customer-return-heading" dir="rtl">
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 id="customer-return-heading" style={{ margin: 0, fontSize: 19, display: "flex", alignItems: "center", gap: 8 }}>
            <RotateCcw size={19} /> طلب إرجاع / مرتجع
          </h2>
          <p style={{ ...muted, marginTop: 5 }}>
            يُرسل الطلب إلى الإدارة للمراجعة. الموافقة لا تعني استلام البضاعة أو إصدار إشعار دائن أو رد مالي.
          </p>
        </div>
        <button type="button" style={button} onClick={() => void loadSummary()} disabled={loading || busy}>
          <RefreshCw size={15} /> تحديث الحالة
        </button>
      </header>

      {loading && <p role="status" style={muted}>جارٍ تحميل أهلية الإرجاع وسجل الطلبات...</p>}
      {error && <p role="alert" style={{ ...muted, color: "#a32929", background: "#fff1f1", padding: 10, borderRadius: 8 }}>{error}</p>}
      {notice && <p role="status" style={{ color: "#17684d", background: "#edf9f2", padding: 10, borderRadius: 8, margin: 0 }}>{notice}</p>}

      {!loading && !canRequest && (
        <p style={muted}>يمكن فتح طلب إرجاع بعد أن تصبح حالة الطلب «تم التسليم» فقط. الحالة الحالية: {statusLabels[summary?.order_status ?? orderStatus] ?? (summary?.order_status ?? orderStatus)}.</p>
      )}

      {!loading && canRequest && available.length === 0 && (
        <p style={muted}>لا توجد كميات إضافية متاحة لطلب إرجاعها. يتم احتساب الطلبات المرسلة والمقبولة لمنع تكرار الكمية.</p>
      )}

      {!loading && canRequest && available.length > 0 && (
        <form onSubmit={(event) => void submit(event)} style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gap: 10 }}>
            {available.map((item) => (
              <div key={item.order_item_id} style={{ border: "1px solid #e3ebec", borderRadius: 10, padding: 12, display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(125px,180px)", gap: 12, alignItems: "center" }}>
                <div style={{ minWidth: 0 }}>
                  <strong>{item.product_name}</strong>
                  <p style={{ ...muted, marginTop: 3 }}>
                    الرمز: {item.item_code || "غير مسجل"} · الوحدة: {item.unit || "غير محددة"}
                  </p>
                  <p style={{ ...muted, marginTop: 3 }}>
                    الكمية في الطلب: {item.ordered_quantity.toLocaleString("ar-YE")} · سبق طلب إرجاعها: {item.already_requested_quantity.toLocaleString("ar-YE")} · المتاح: <strong>{item.remaining_quantity.toLocaleString("ar-YE")}</strong>
                  </p>
                </div>
                <label style={{ display: "grid", gap: 5, fontSize: 13, fontWeight: 750 }}>
                  كمية الإرجاع
                  <input
                    aria-label={"كمية الإرجاع: " + item.product_name}
                    type="number" inputMode="decimal" min="0" max={item.remaining_quantity} step="0.001"
                    value={drafts[item.order_item_id] ?? ""}
                    onChange={(event) => setDrafts((current) => ({ ...current, [item.order_item_id]: event.target.value }))}
                    style={field} disabled={busy}
                  />
                </label>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            <label style={{ display: "grid", gap: 6, fontWeight: 750, fontSize: 13 }}>
              سبب الإرجاع <span aria-hidden="true">*</span>
              <select required value={reason} onChange={(event) => setReason(event.target.value as CustomerReturnReason | "")} style={field} disabled={busy}>
                <option value="">اختر السبب</option>
                {Object.entries(reasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 6, fontWeight: 750, fontSize: 13 }}>
              تفاصيل إضافية (اختياري)
              <textarea value={notes} maxLength={1000} rows={3} onChange={(event) => setNotes(event.target.value)} style={{ ...field, resize: "vertical" }} disabled={busy} />
              <span style={{ ...muted, textAlign: "left" }}>{notes.length}/1000</span>
            </label>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-start" }}>
            <button type="submit" style={primary} disabled={busy || loading}>
              {busy ? <RefreshCw size={16} /> : <Send size={16} />}
              {busy ? "جارٍ إرسال الطلب..." : "إرسال طلب الإرجاع"}
            </button>
            <button type="button" style={button} disabled={busy} onClick={() => { setDrafts({}); setReason(""); setNotes(""); setError(""); attemptRef.current = null; }}>
              إفراغ النموذج
            </button>
          </div>
        </form>
      )}

      {summary && summary.requests.length > 0 && (
        <section aria-label="سجل طلبات الإرجاع" style={{ display: "grid", gap: 10, borderTop: "1px solid #e3ebec", paddingTop: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 7 }}>
            <ClipboardCheck size={17} /> سجل طلبات الإرجاع
          </h3>
          {summary.requests.map((request) => (
            <article key={request.id} style={{ border: "1px solid #e3ebec", borderRadius: 10, padding: 12, display: "grid", gap: 7 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                <strong>{request.request_number}</strong>
                <span style={{ padding: "3px 8px", borderRadius: 20, background: request.status === "rejected" ? "#fff1f1" : "#eef7f5", color: request.status === "rejected" ? "#a32929" : "#17684d", fontSize: 12, fontWeight: 800 }}>
                  {statusLabels[request.status]}
                </span>
              </div>
              <p style={muted}>السبب: {reasonLabels[request.reason]} · التاريخ: {new Date(request.created_at).toLocaleString("ar-YE")}</p>
              <ul style={{ margin: 0, paddingInlineStart: 22 }}>
                {request.items.map((line) => <li key={line.order_item_id} style={{ fontSize: 13 }}>{line.product_name}: {line.requested_quantity.toLocaleString("ar-YE")} {line.unit ?? ""}</li>)}
              </ul>
              {request.notes && <p style={muted}>تفاصيل العميل: {request.notes}</p>}
              {request.review_note && <p style={{ ...muted, color: "#3e5e61" }}>ملاحظة القرار: {request.review_note}</p>}
            </article>
          ))}
        </section>
      )}
      <p style={{ ...muted, display: "flex", gap: 7, alignItems: "flex-start" }}>
        <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 3 }} />
        لا تُغيّر هذه الشاشة المخزون أو الفاتورة أو رصيد العميل تلقائيًا. بعد الاستلام والفحص الفعلي تُسجل حركة المخزون والإشعار الدائن عبر مساراتها المخوّلة.
      </p>
    </section>
  );
}
