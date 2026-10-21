import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Printer, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  readFinancePrintOptions,
  readPrintableCreditMemo,
  readStaffInvoicePrintPayload,
  readStaffStatementPrintPayload,
  renderCreditMemoDocument,
  renderStaffInvoiceDocument,
  renderStaffStatementDocument,
  type FinancePrintOptions,
} from "@/lib/finance-document-print";

type DocumentKind = "invoice" | "statement" | "credit_memo";
const emptyOptions: FinancePrintOptions = {
  organization_name: "",
  customers: [], customers_has_more: false, invoices: [], invoices_has_more: false,
  credit_memos: [], credit_memos_has_more: false, limit: 500,
};
const card: React.CSSProperties = { border: "1px solid var(--border, #d6dfe4)", borderRadius: 12, padding: 16, background: "var(--card, #fff)", display: "grid", gap: 12 };
const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "9px 10px", border: "1px solid var(--border, #d6dfe4)", borderRadius: 8, background: "var(--card, #fff)", color: "var(--foreground, #17242a)", font: "inherit" };
const button: React.CSSProperties = { border: "1px solid var(--border, #d6dfe4)", borderRadius: 8, padding: "9px 12px", cursor: "pointer", font: "inherit", background: "var(--card, #fff)", color: "var(--foreground, #17242a)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 };
const primary: React.CSSProperties = { ...button, background: "var(--primary, #155e4a)", color: "#fff", borderColor: "transparent", fontWeight: 750 };
const muted: React.CSSProperties = { color: "var(--muted-foreground, #66757b)", margin: 0, lineHeight: 1.7, fontSize: 12 };

function displayName(name: string | null, fallback: string | null): string {
  return name?.trim() || fallback?.trim() || "عميل بلا اسم مسجل";
}

export function FinanceDocumentPrintActions() {
  const [options, setOptions] = useState<FinancePrintOptions>(emptyOptions);
  const [kind, setKind] = useState<DocumentKind>("invoice");
  const [pageOffset, setPageOffset] = useState(0);
  const [sourceId, setSourceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const sources = useMemo(() => {
    if (kind === "invoice") return options.invoices.map((row) => ({
      id: row.id, label: row.invoice_number + " — " + row.customer_name + " — " + row.currency + " — " + row.status,
    }));
    if (kind === "statement") return options.customers.map((row) => ({
      id: row.id,
      label: displayName(row.business_name, row.contact_name) + (row.customer_code ? " — " + row.customer_code : ""),
    }));
    return options.credit_memos.map((row) => ({
      id: row.id, label: row.memo_number + " — " + row.customer_name + " — " + row.invoice_number + " — " + row.currency + " — " + row.status,
    }));
  }, [kind, options]);

  // Derive a valid selection synchronously so a just-loaded or newly switched list never
  // exposes an enabled-looking print path with a stale/empty controlled value.
  const effectiveSourceId = sources.some((row) => row.id === sourceId) ? sourceId : (sources[0]?.id ?? "");

  const hasMore = kind === "invoice" ? options.invoices_has_more :
    kind === "statement" ? options.customers_has_more : options.credit_memos_has_more;

  const loadOptions = useCallback(async (targetOffset = pageOffset) => {
    setLoading(true);
    setError("");
    try {
      const result = await supabase.rpc("get_finance_document_print_options", { p_limit: 500, p_offset: targetOffset });
      if (result.error) throw new Error(result.error.message || "تعذر تحميل مصادر المستندات المالية.");
      setOptions(readFinancePrintOptions(result.data));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل مصادر المستندات المالية.");
      setOptions(emptyOptions);
    } finally {
      setLoading(false);
    }
  }, [pageOffset]);

  useEffect(() => { void loadOptions(); }, [loadOptions]);
  async function printDocument() {
    const selectedId = effectiveSourceId;
    if (!selectedId || busy) return;
    setError("");
    setNotice("");
    const requestedKind = kind;
    let printWindow: Window | null = null;
    try {
      // Open synchronously in the user click to avoid popup blockers after the authorized RPC awaits.
      printWindow = window.open("", "_blank", "width=1000,height=800");
      if (!printWindow) throw new Error("حُظر فتح نافذة الطباعة؛ اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة.");
      printWindow.opener = null;
      printWindow.document.documentElement.lang = "ar";
      printWindow.document.documentElement.dir = "rtl";
      printWindow.document.body.replaceChildren();
      const waiting = printWindow.document.createElement("p");
      waiting.dir = "rtl";
      waiting.textContent = "جارٍ التحقق من صلاحية المحاسبة وتحميل المصدر المالي المعتمد…";
      printWindow.document.body.appendChild(waiting);
      setBusy(true);
      const optionsResult = await supabase.rpc("get_finance_document_print_options", { p_limit: 500, p_offset: pageOffset });
      if (optionsResult.error) throw new Error(optionsResult.error.message || "تعذر التحقق من المؤسسة النشطة قبل الطباعة.");
      const currentOptions = readFinancePrintOptions(optionsResult.data);
      const sourceStillAuthorized = requestedKind === "invoice"
        ? currentOptions.invoices.some((row) => row.id === selectedId)
        : requestedKind === "statement"
          ? currentOptions.customers.some((row) => row.id === selectedId)
          : currentOptions.credit_memos.some((row) => row.id === selectedId);
      setOptions(currentOptions);
      if (!sourceStillAuthorized) {
        setSourceId("");
        throw new Error("تغيرت المؤسسة النشطة أو لم يعد المصدر ضمن صلاحيتها. حدّث القائمة واختر مصدرًا من المؤسسة الحالية.");
      }

      if (requestedKind === "invoice") {
        const result = await supabase.rpc("get_staff_customer_invoice_print_data", { p_invoice_id: selectedId });
        if (result.error) throw new Error(result.error.message || "تعذر تحميل مصدر الفاتورة ضمن المؤسسة الحالية.");
        renderStaffInvoiceDocument(printWindow.document, readStaffInvoicePrintPayload(result.data), currentOptions.organization_name);
      } else if (requestedKind === "statement") {
        const result = await supabase.rpc("get_staff_customer_account_statement", { p_customer_id: selectedId });
        if (result.error) throw new Error(result.error.message || "تعذر تحميل كشف حساب العميل ضمن المؤسسة الحالية.");
        renderStaffStatementDocument(printWindow.document, readStaffStatementPrintPayload(result.data), currentOptions.organization_name);
      } else {
        const result = await supabase.rpc("get_customer_return_credit_memo_pdf", { p_credit_memo_id: selectedId });
        if (result.error) throw new Error(result.error.message || "تعذر تحميل الإشعار الدائن؛ يلزم دور المحاسبة.");
        renderCreditMemoDocument(printWindow.document, readPrintableCreditMemo(result.data), currentOptions.organization_name);
      }

      printWindow.focus();
      printWindow.onafterprint = () => { if (printWindow && !printWindow.closed) printWindow.close(); };
      window.setTimeout(() => { if (printWindow && !printWindow.closed) printWindow.print(); }, 180);
      setNotice("تم تجهيز المستند من بيانات خادمية مفحوصة ضمن المؤسسة الحالية. لم تتغير أي حركة مالية.");
    } catch (cause) {
      if (printWindow && !printWindow.closed) printWindow.close();
      setError(cause instanceof Error ? cause.message : "تعذر تجهيز المستند المالي للطباعة.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={card} dir="rtl" aria-labelledby="finance-document-print-heading">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 id="finance-document-print-heading" style={{ margin: 0, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
            <Printer size={18} /> طباعة المستندات المالية حسب الصلاحية
          </h3>
          <p style={muted}>الفواتير وكشوف حساب العملاء والإشعارات الدائنة. يحدد الخادم المؤسسة النشطة ويتحقق من صلاحية الإدارة أو المدير أو المحاسب قبل كشف البيانات.</p>
          <p style={muted}>المؤسسة المصدرة: <strong>{options.organization_name || "غير متاحة حتى يتحقق الخادم"}</strong></p>
        </div>
        <button type="button" style={button} onClick={() => void loadOptions()} disabled={loading || busy}>
          <RefreshCw size={15} /> تحديث المصادر
        </button>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
        <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 750 }}>
          نوع المستند
          <select aria-label="نوع المستند المالي" style={field} value={kind} onChange={(event) => { setKind(event.target.value as DocumentKind); setSourceId(""); setPageOffset(0); }} disabled={loading || busy}>
            <option value="invoice">فاتورة عميل</option>
            <option value="statement">كشف حساب عميل</option>
            <option value="credit_memo">إشعار دائن للمرتجعات</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 750 }}>
          المصدر
          <select aria-label="مصدر المستند المالي" style={field} value={effectiveSourceId} onChange={(event) => setSourceId(event.target.value)} disabled={loading || busy || sources.length === 0}>
            <option value="">{loading ? "جارٍ تحميل المصادر…" : "اختر المصدر…"}</option>
            {sources.map((source) => <option key={source.id} value={source.id}>{source.label}</option>)}
          </select>
        </label>
      </div>

      {(pageOffset > 0 || hasMore) && (
        <nav aria-label="ترقيم صفحات المستندات المالية" style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <span role="status" style={muted}>
            {sources.length
              ? "السجلات " + (pageOffset + 1).toLocaleString("ar-YE") + "–" + (pageOffset + sources.length).toLocaleString("ar-YE") + " · الصفحة " + (Math.floor(pageOffset / options.limit) + 1).toLocaleString("ar-YE")
              : "لا توجد سجلات في هذه الصفحة"}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={button} onClick={() => { setSourceId(""); setPageOffset(Math.max(0, pageOffset - options.limit)); }} disabled={loading || busy || pageOffset === 0}>
              السجلات السابقة
            </button>
            <button type="button" style={button} onClick={() => { setSourceId(""); setPageOffset(pageOffset + options.limit); }} disabled={loading || busy || !hasMore}>
              السجلات التالية
            </button>
          </div>
        </nav>
      )}
      {loading && <p role="status" style={muted}>جارٍ تحميل قائمة المصادر المالية المسموحة…</p>}
      {error && <p role="alert" style={{ ...muted, color: "#a32929", background: "#fff1f1", padding: 10, borderRadius: 8 }}>{error}</p>}
      {notice && <p role="status" style={{ ...muted, color: "#17684d", display: "flex", alignItems: "center", gap: 6 }}><ShieldCheck size={15} />{notice}</p>}
      {!loading && !error && sources.length === 0 && <p style={muted}>لا توجد مصادر من هذا النوع ضمن قائمة المؤسسة المتاحة أو لا توجد سجلات قابلة للطباعة.</p>}
      <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={primary} onClick={() => void printDocument()} disabled={loading || busy || !effectiveSourceId}>
          <FileText size={16} /> {busy ? "جارٍ تجهيز المستند…" : "فتح نافذة الطباعة / حفظ PDF"}
        </button>
      </div>
    </section>
  );
}
