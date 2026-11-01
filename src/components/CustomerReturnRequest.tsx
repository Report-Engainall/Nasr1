import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AlertCircle, ClipboardCheck, RefreshCw, RotateCcw, Send } from "lucide-react";
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

    const attempt = attemptRef.current;
    if (!attempt) {
      setError("تعذر تأمين مفتاح طلب الإرجاع؛ حاول مرة أخرى.");
      return;
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
        p_idempotency_key: attempt.key,
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


type ReturnableItem = CustomerReturnSummary["returnable_items"][number];

function CustomerReturnItemRow({
  item,
  value,
  disabled,
  onChange,
}: {
  item: ReturnableItem;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div
      style={{
        border: "1px solid #e3ebec",
        borderRadius: 10,
        padding: 12,
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) minmax(125px,180px)",
        gap: 12,
        alignItems: "center",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <strong>{item.product_name}</strong>
        <p style={{ ...muted, marginTop: 3 }}>
          الرمز: {item.item_code || "غير مسجل"} · الوحدة: {item.unit || "غير محددة"}
        </p>
        <p style={{ ...muted, marginTop: 3 }}>
          الكمية في الطلب: {item.ordered_quantity.toLocaleString("ar-YE")} · سبق طلب إرجاعها:{" "}
          {item.already_requested_quantity.toLocaleString("ar-YE")} · المتاح:{" "}
          <strong>{item.remaining_quantity.toLocaleString("ar-YE")}</strong>
        </p>
      </div>
      <label style={{ display: "grid", gap: 5, fontSize: 13, fontWeight: 750 }}>
        كمية الإرجاع
        <input
          aria-label={"كمية الإرجاع: " + item.product_name}
          type="number"
          inputMode="decimal"
          min="0"
          max={item.remaining_quantity}
          step="0.001"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          style={field}
          disabled={disabled}
        />
      </label>
    </div>
  );
}

function CustomerReturnReasonField({
  value,
  disabled,
  onChange,
}: {
  value: CustomerReturnReason | "";
  disabled: boolean;
  onChange: (value: CustomerReturnReason | "") => void;
}) {
  return (
    <label style={{ display: "grid", gap: 6, fontWeight: 750, fontSize: 13 }}>
      سبب الإرجاع <span aria-hidden="true">*</span>
      <select
        required
        value={value}
        onChange={(event) => onChange(event.target.value as CustomerReturnReason | "")}
        style={field}
        disabled={disabled}
      >
        <option value="">اختر السبب</option>
        {Object.entries(reasonLabels).map(([reason, label]) => (
          <option key={reason} value={reason}>{label}</option>
        ))}
      </select>
    </label>
  );
}

function CustomerReturnNotesField({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: "grid", gap: 6, fontWeight: 750, fontSize: 13 }}>
      تفاصيل إضافية (اختياري)
      <textarea
        value={value}
        maxLength={1000}
        rows={3}
        onChange={(event) => onChange(event.target.value)}
        style={{ ...field, resize: "vertical" }}
        disabled={disabled}
      />
      <span style={{ ...muted, textAlign: "left" }}>{value.length}/1000</span>
    </label>
  );
}

function CustomerReturnForm({
  available,
  drafts,
  reason,
  notes,
  busy,
  onDraftChange,
  onReasonChange,
  onNotesChange,
  onSubmit,
  onClear,
}: {
  available: ReturnableItem[];
  drafts: Record<string, string>;
  reason: CustomerReturnReason | "";
  notes: string;
  busy: boolean;
  onDraftChange: (itemId: string, value: string) => void;
  onReasonChange: (value: CustomerReturnReason | "") => void;
  onNotesChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClear: () => void;
}) {
  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gap: 10 }}>
        {available.map((item) => (
          <CustomerReturnItemRow
            key={item.order_item_id}
            item={item}
            value={drafts[item.order_item_id] ?? ""}
            disabled={busy}
            onChange={(value) => onDraftChange(item.order_item_id, value)}
          />
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: 12,
        }}
      >
        <CustomerReturnReasonField
          value={reason}
          onChange={onReasonChange}
          disabled={busy}
        />
        <CustomerReturnNotesField
          value={notes}
          onChange={onNotesChange}
          disabled={busy}
        />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-start" }}>
        <button type="submit" style={primary} disabled={busy}>
          {busy ? <RefreshCw size={16} /> : <Send size={16} />}
          {busy ? "جارٍ إرسال الطلب..." : "إرسال طلب الإرجاع"}
        </button>
        <button type="button" style={button} disabled={busy} onClick={onClear}>
          إفراغ النموذج
        </button>
      </div>
    </form>
  );
}

function CustomerReturnStatusMessages({
  loading,
  error,
  notice,
  canRequest,
  hasAvailableItems,
  currentStatus,
}: {
  loading: boolean;
  error: string;
  notice: string;
  canRequest: boolean;
  hasAvailableItems: boolean;
  currentStatus: string;
}) {
  return (
    <>
      {loading ? <p role="status" style={muted}>جارٍ تحميل أهلية الإرجاع وسجل الطلبات...</p> : null}
      {error ? (
        <p role="alert" style={{ ...muted, color: "#a32929", background: "#fff1f1", padding: 10, borderRadius: 8 }}>
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" style={{ color: "#17684d", background: "#edf9f2", padding: 10, borderRadius: 8, margin: 0 }}>
          {notice}
        </p>
      ) : null}
      {!loading && !canRequest ? (
        <p style={muted}>
          يمكن فتح طلب إرجاع بعد أن تصبح حالة الطلب «تم التسليم» فقط. الحالة الحالية: {currentStatus}.
        </p>
      ) : null}
      {!loading && canRequest && !hasAvailableItems ? (
        <p style={muted}>
          لا توجد كميات إضافية متاحة لطلب إرجاعها. يتم احتساب الطلبات المرسلة والمقبولة لمنع تكرار الكمية.
        </p>
      ) : null}
    </>
  );
}

function CustomerReturnHistoryLine({
  item,
}: {
  item: CustomerReturnSummary["requests"][number]["items"][number];
}) {
  return (
    <li style={{ fontSize: 13 }}>
      {item.product_name}: {item.requested_quantity.toLocaleString("ar-YE")} {item.unit ?? ""}
    </li>
  );
}

function CustomerReturnHistoryCard({
  request,
}: {
  request: CustomerReturnSummary["requests"][number];
}) {
  const rejected = request.status === "rejected";

  return (
    <article style={{ border: "1px solid #e3ebec", borderRadius: 10, padding: 12, display: "grid", gap: 7 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <strong>{request.request_number}</strong>
        <span
          style={{
            padding: "3px 8px",
            borderRadius: 20,
            background: rejected ? "#fff1f1" : "#eef7f5",
            color: rejected ? "#a32929" : "#17684d",
            fontSize: 12,
            fontWeight: 800,
          }}
        >
          {statusLabels[request.status]}
        </span>
      </div>
      <p style={muted}>
        السبب: {reasonLabels[request.reason]} · التاريخ: {new Date(request.created_at).toLocaleString("ar-YE")}
      </p>
      <ul style={{ margin: 0, paddingInlineStart: 22 }}>
        {request.items.map((item) => (
          <CustomerReturnHistoryLine key={item.order_item_id} item={item} />
        ))}
      </ul>
      {request.notes ? <p style={muted}>تفاصيل العميل: {request.notes}</p> : null}
      {request.review_note ? (
        <p style={{ ...muted, color: "#3e5e61" }}>ملاحظة القرار: {request.review_note}</p>
      ) : null}
    </article>
  );
}

function CustomerReturnHistory({
  requests,
}: {
  requests: CustomerReturnSummary["requests"];
}) {
  if (requests.length === 0) return null;

  return (
    <section
      aria-label="سجل طلبات الإرجاع"
      style={{ display: "grid", gap: 10, borderTop: "1px solid #e3ebec", paddingTop: 14 }}
    >
      <h3 style={{ margin: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 7 }}>
        <ClipboardCheck size={17} /> سجل طلبات الإرجاع
      </h3>
      {requests.map((request) => (
        <CustomerReturnHistoryCard key={request.id} request={request} />
      ))}
    </section>
  );
}

function CustomerReturnPolicyNote() {
  return (
    <p style={{ ...muted, display: "flex", gap: 7, alignItems: "flex-start" }}>
      <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 3 }} />
      لا تُغيّر هذه الشاشة المخزون أو الفاتورة أو رصيد العميل تلقائيًا. بعد الاستلام والفحص الفعلي تُسجل حركة المخزون والإشعار الدائن عبر مساراتها المخوّلة.
    </p>
  );
}

  const canRequest = orderStatus === "delivered" && summary?.order_status === "delivered";
  const available = (summary?.returnable_items ?? []).filter((item) => item.remaining_quantity > 0);

  return (
    <section style={panel} aria-labelledby="customer-return-heading" dir="rtl">
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2
            id="customer-return-heading"
            style={{ margin: 0, fontSize: 19, display: "flex", alignItems: "center", gap: 8 }}
          >
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

      <CustomerReturnStatusMessages
        loading={loading}
        error={error}
        notice={notice}
        canRequest={canRequest}
        hasAvailableItems={available.length > 0}
        currentStatus={statusLabels[summary?.order_status ?? orderStatus] ?? (summary?.order_status ?? orderStatus)}
      />

      {!loading && canRequest && available.length > 0 ? (
        <CustomerReturnForm
          available={available}
          drafts={drafts}
          reason={reason}
          notes={notes}
          busy={busy}
          onDraftChange={(itemId, value) => setDrafts((current) => ({ ...current, [itemId]: value }))}
          onReasonChange={setReason}
          onNotesChange={setNotes}
          onSubmit={(event) => void submit(event)}
          onClear={() => {
            setDrafts({});
            setReason("");
            setNotes("");
            setError("");
            attemptRef.current = null;
          }}
        />
      ) : null}

      <CustomerReturnHistory requests={summary?.requests ?? []} />
      <CustomerReturnPolicyNote />
    </section>
  );
}
