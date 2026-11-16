import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ClipboardCheck, FileSpreadsheet, RefreshCw, XCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { downloadCustomerReturnReviewWorkbookXlsx } from "@/lib/customer-return-review-xlsx";
import {
  CUSTOMER_RETURN_REVIEW_PAGE_SIZE,
  fetchAllCustomerReturnReviewRows,
  fetchCustomerReturnReviewPage,
  type CustomerReturnReviewCursor,
  type CustomerReturnReviewPage,
  type CustomerReturnReviewReason,
  type CustomerReturnReviewRow,
  type CustomerReturnReviewStatus,
} from "@/lib/customer-return-review-queue";
import { supabase } from "@/lib/supabase";

type ReviewDecision = "approved" | "rejected";

const reasonLabels: Record<CustomerReturnReviewReason, string> = {
  damaged: "الصنف تالف",
  wrong_item: "صنف غير صحيح",
  missing_item: "كمية ناقصة",
  quality: "مشكلة جودة",
  other: "سبب آخر",
};
const panel: React.CSSProperties = {
  marginTop: 22, border: "1px solid #dce7e8", borderRadius: 14, padding: 16,
  background: "var(--card, #fff)", display: "grid", gap: 13,
};
const field: React.CSSProperties = {
  width: "100%", minWidth: 0, boxSizing: "border-box", padding: "9px 11px",
  border: "1px solid #ccdadd", borderRadius: 8, color: "#21383d",
  background: "#fff", font: "inherit",
};
const button: React.CSSProperties = {
  border: "1px solid #ccdadd", borderRadius: 8, padding: "8px 11px",
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
  background: "#fff", color: "#24464a", font: "inherit", fontWeight: 750, cursor: "pointer",
};
const good: React.CSSProperties = { ...button, borderColor: "#18825c", background: "#18825c", color: "#fff" };
const bad: React.CSSProperties = { ...button, borderColor: "#b42318", background: "#b42318", color: "#fff" };
const muted: React.CSSProperties = { margin: 0, color: "#64787c", fontSize: 13, lineHeight: 1.7 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ReturnReviewCard({
  row,
  note,
  busy,
  onNoteChange,
  onDecide,
}: {
  row: CustomerReturnReviewRow;
  note: string;
  busy: boolean;
  onNoteChange: (id: string, value: string) => void;
  onDecide: (row: CustomerReturnReviewRow, decision: ReviewDecision) => void;
}) {
  const reasonIsValid = note.trim().length >= 5;
  return (
    <article key={row.id} style={{ display: "grid", gap: 10, padding: 14, border: "1px solid #e1e9ea", borderRadius: 11 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16 }}>{row.request_number}</h3>
          <p style={muted}>الطلب {row.order_number} · العميل {row.customer_name} ({row.customer_code})</p>
        </div>
        <span style={{ background: "#fff4df", color: "#805413", borderRadius: 20, padding: "4px 9px", fontSize: 12, fontWeight: 800 }}>
          {row.status === "submitted" ? "مرسل للمراجعة" : "قيد المراجعة"}
        </span>
      </div>
      <p style={{ ...muted, marginTop: -3 }}>السبب: {reasonLabels[row.reason]} · {new Date(row.created_at).toLocaleString("ar-YE")}</p>
      <ul style={{ margin: 0, paddingInlineStart: 24 }}>
        {row.items.map((item, index) => (
          <li key={(item.item_code ?? item.product_name) + "-" + index} style={{ fontSize: 13 }}>
            {item.product_name} — الرمز {item.item_code ?? "غير مسجل"} — {item.requested_quantity.toLocaleString("ar-YE")} {item.unit ?? ""}
          </li>
        ))}
      </ul>
      {row.notes && <p style={{ ...muted, borderInlineStart: "3px solid #cbdadd", paddingInlineStart: 10 }}>ملاحظة العميل: {row.notes}</p>}
      <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 750 }}>
        مبرر القرار (مطلوب)
        <textarea
          rows={2}
          maxLength={1000}
          minLength={5}
          aria-label={"مبرر قرار " + row.request_number}
          value={note}
          onChange={(event) => onNoteChange(row.id, event.target.value)}
          style={{ ...field, resize: "vertical" }}
          disabled={busy}
        />
      </label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={good} disabled={busy || !reasonIsValid} onClick={() => onDecide(row, "approved")}>
          <CheckCircle2 size={16} /> قبول وتحويل للفحص
        </button>
        <button type="button" style={bad} disabled={busy || !reasonIsValid} onClick={() => onDecide(row, "rejected")}>
          <XCircle size={16} /> رفض مع السبب
        </button>
      </div>
    </article>
  );
}

export function CustomerReturnReviewQueue({ onNotice }: { onNotice: (message: string) => void }) {
  const [page, setPage] = useState<CustomerReturnReviewPage | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [queryDraft, setQueryDraft] = useState("");
  const [statusDraft, setStatusDraft] = useState<CustomerReturnReviewStatus | "">("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedStatus, setAppliedStatus] = useState<CustomerReturnReviewStatus | "">("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const cursorStack = useRef<Array<CustomerReturnReviewCursor | null>>([null]);
  const requestGeneration = useRef(0);
  const { user } = useAuth();
  const canExport = Boolean(user?.roles.some((role) => role === "admin" || role === "manager"));
  const rows = page?.items ?? [];
  const totalCount = page?.totalCount ?? 0;
  const load = useCallback(async () => {
    const generation = ++requestGeneration.current;
    const cursor = cursorStack.current[pageIndex] ?? null;
    setLoading(true);
    setError("");
    try {
      const result = await fetchCustomerReturnReviewPage({ search: appliedQuery, status: appliedStatus }, cursor);
      if (generation !== requestGeneration.current) return;
      if (pageIndex > 0 && result.items.length === 0 && result.totalCount > 0) {
        cursorStack.current = cursorStack.current.slice(0, pageIndex);
        setPageIndex((current) => Math.max(0, current - 1));
        return;
      }
      setPage(result);
    } catch (cause) {
      if (generation !== requestGeneration.current) return;
      setPage(null);
      setError(cause instanceof Error ? cause.message : "تعذر تحميل قائمة مراجعة المرتجعات.");
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [appliedQuery, appliedStatus, pageIndex, reloadVersion]);

  useEffect(() => {
    void load();
    return () => { requestGeneration.current += 1; };
  }, [load]);

  function applyFilters(nextSearch = queryDraft, nextStatus = statusDraft) {
    cursorStack.current = [null];
    setPage(null);
    setPageIndex(0);
    setQueryDraft(nextSearch);
    setStatusDraft(nextStatus);
    setAppliedQuery(nextSearch.trim());
    setAppliedStatus(nextStatus);
    setReloadVersion((version) => version + 1);
  }

  async function exportCurrentQueue() {
    if (!canExport || exporting || busyId !== null || totalCount === 0) return;
    setExporting(true);
    setError("");
    try {
      const allRows = await fetchAllCustomerReturnReviewRows({ search: appliedQuery, status: appliedStatus });
      const downloaded = downloadCustomerReturnReviewWorkbookXlsx({
        rows: allRows,
        roles: user?.roles ?? [],
        search: appliedQuery,
        status: appliedStatus,
      });
      if (!downloaded) throw new Error("هذا المتصفح لا يدعم تنزيل ملفات Excel.");
      onNotice(
        "تم تصدير كامل قائمة مراجعة المرتجعات المطابقة: " + allRows.length.toLocaleString("ar-YE") +
        " طلب و" + allRows.reduce((sum, row) => sum + row.items.length, 0).toLocaleString("ar-YE") +
        " سطر صنف. شمل الملف جميع الصفحات المطابقة، لا الصفحة الظاهرة فقط.",
      );
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "تعذر إنشاء ملف مراجعة المرتجعات.";
      setError(message);
      onNotice(message);
    } finally {
      setExporting(false);
    }
  }

  async function decide(row: CustomerReturnReviewRow, decision: ReviewDecision) {
    const note = (notes[row.id] ?? "").trim();
    if (note.length < 5 || note.length > 1000) {
      setError("اكتب مبررًا واضحًا للقبول أو الرفض من 5 إلى 1000 حرف.");
      return;
    }
    setBusyId(row.id);
    setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc("review_customer_return_request", {
        p_return_request_id: row.id,
        p_decision: decision,
        p_review_note: note,
      });
      if (rpcError) throw new Error(rpcError.message || "تعذر حفظ قرار المرتجع.");
      if (!isRecord(data) || data.status !== decision || typeof data.request_number !== "string") {
        throw new Error("لم يؤكد الخادم قرار المرتجع كما طُلب.");
      }
      onNotice(
        decision === "approved"
          ? "تمت الموافقة على " + data.request_number + " وإنشاء مهمة استلام وفحص للمخزن. لم يتغير المخزون أو الحساب تلقائيًا."
          : "تم رفض " + data.request_number + " مع حفظ مبرر القرار.",
      );
      setNotes((current) => { const next = { ...current }; delete next[row.id]; return next; });
      await load();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "تعذر حفظ قرار المرتجع.";
      setError(message);
      onNotice(message);
    } finally {
      setBusyId(null);
    }
  }

  const pageCount = Math.max(1, Math.ceil(totalCount / CUSTOMER_RETURN_REVIEW_PAGE_SIZE));

  return (
    <section style={panel} dir="rtl" aria-labelledby="return-review-heading">
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 id="return-review-heading" style={{ margin: 0, fontSize: 19, display: "flex", alignItems: "center", gap: 8 }}>
            <ClipboardCheck size={19} /> مراجعة طلبات المرتجعات
          </h2>
          <p style={{ ...muted, marginTop: 5 }}>
            مراجعة كل الطلبات المفتوحة مع البحث في رقم المرتجع والطلب والعميل والصنف، وتصفية الحالة على مستوى الخادم.
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {canExport && (
            <button type="button" style={button} onClick={() => void exportCurrentQueue()} disabled={loading || exporting || busyId !== null || totalCount === 0}>
              <FileSpreadsheet size={15} /> {exporting ? "جارٍ جمع كل الصفحات..." : "تصدير كل النتائج المطابقة"}
            </button>
          )}
          <button type="button" style={button} onClick={() => void load()} disabled={loading || exporting || busyId !== null}>
            <RefreshCw size={15} /> تحديث
          </button>
        </div>
      </header>

      <form
        onSubmit={(event) => { event.preventDefault(); applyFilters(); }}
        style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) minmax(150px,220px) auto", gap: 8, alignItems: "end" }}
        aria-label="البحث وتصفية طلبات المرتجعات"
      >
        <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 750 }}>
          البحث في المرتجعات
          <input
            value={queryDraft}
            onChange={(event) => setQueryDraft(event.target.value)}
            placeholder="رقم المرتجع أو الطلب أو اسم العميل أو رمز/اسم الصنف"
            maxLength={120}
            style={field}
            disabled={loading || exporting || busyId !== null}
            aria-label="ابحث في طلبات المرتجعات"
          />
        </label>
        <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 750 }}>
          حالة الطلب
          <select
            value={statusDraft}
            onChange={(event) => setStatusDraft(event.target.value as CustomerReturnReviewStatus | "")}
            style={field}
            disabled={loading || exporting || busyId !== null}
            aria-label="تصفية مرتجعات العملاء حسب الحالة"
          >
            <option value="">كل الحالات المفتوحة</option>
            <option value="submitted">مرسل للمراجعة</option>
            <option value="under_review">قيد المراجعة</option>
          </select>
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="submit" style={good} disabled={loading || exporting || busyId !== null}>تطبيق</button>
          {(queryDraft || appliedQuery || statusDraft || appliedStatus) && (
            <button type="button" style={button} disabled={loading || exporting || busyId !== null} onClick={() => applyFilters("", "")}>مسح</button>
          )}
        </div>
      </form>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(135px,1fr))", gap: 8 }}>
        <article style={{ borderRadius: 9, background: "#f0f7f7", padding: 11 }}>
          <p style={muted}>كل النتائج المطابقة</p>
          <strong style={{ display: "block", marginTop: 3, fontSize: 20, fontVariantNumeric: "tabular-nums" }}>{totalCount.toLocaleString("ar-YE")}</strong>
        </article>
        <article style={{ borderRadius: 9, background: "#f0f7f7", padding: 11 }}>
          <p style={muted}>في الصفحة الحالية</p>
          <strong style={{ display: "block", marginTop: 3, fontSize: 20, fontVariantNumeric: "tabular-nums" }}>{rows.length.toLocaleString("ar-YE")}</strong>
        </article>
        <article style={{ borderRadius: 9, background: "#f0f7f7", padding: 11 }}>
          <p style={muted}>حجم الصفحة</p>
          <strong style={{ display: "block", marginTop: 3, fontSize: 20, fontVariantNumeric: "tabular-nums" }}>{CUSTOMER_RETURN_REVIEW_PAGE_SIZE.toLocaleString("ar-YE")}</strong>
        </article>
      </div>

      {loading && <p role="status" style={muted}>جارٍ تحميل صفحة المرتجعات من الخادم...</p>}
      {error && <p role="alert" style={{ ...muted, color: "#a32929", padding: 10, borderRadius: 8, background: "#fff1f1" }}>{error}</p>}
      {!loading && !error && rows.length === 0 && (
        <p style={muted}>{appliedQuery || appliedStatus ? "لا توجد طلبات مفتوحة تطابق البحث والحالة المحددين." : "لا توجد طلبات مرتجع بانتظار القرار."}</p>
      )}

      {!loading && rows.map((row) => (
        <ReturnReviewCard
          key={row.id}
          row={row}
          note={notes[row.id] ?? ""}
          busy={busyId === row.id || exporting}
          onNoteChange={(id, value) => setNotes((current) => ({ ...current, [id]: value }))}
          onDecide={decide}
        />
      ))}

      {(pageIndex > 0 || page?.hasMore || totalCount > CUSTOMER_RETURN_REVIEW_PAGE_SIZE) && (
        <footer style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", borderTop: "1px solid #e1e9ea", paddingTop: 12 }}>
          <span style={muted}>
            الصفحة { (pageIndex + 1).toLocaleString("ar-YE") } من {pageCount.toLocaleString("ar-YE")} · ترتيب ثابت بتاريخ الإنشاء ومعرّف الطلب
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              style={button}
              disabled={loading || exporting || busyId !== null || pageIndex === 0}
              onClick={() => { setPage(null); setPageIndex((current) => Math.max(0, current - 1)); }}
            >
              السابق
            </button>
            <button
              type="button"
              style={button}
              disabled={loading || exporting || busyId !== null || !page?.hasMore || !page.nextCursor}
              onClick={() => {
                if (!page?.nextCursor) return;
                cursorStack.current[pageIndex + 1] = page.nextCursor;
                setPage(null);
                setPageIndex((current) => current + 1);
              }}
            >
              التالي
            </button>
          </div>
        </footer>
      )}
      <p style={muted}>
        البحث والتصفية يشملان كامل طابور المراجعة على الخادم. التصدير يجمع كل الصفحات المطابقة ويتوقف دون إنشاء ملف جزئي عند تجاوز 1000 طلب أو 25000 سطر صنف أو تغيّر عدد النتائج أثناء القراءة.
      </p>
    </section>
  );
}
