import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Printer, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  readCustomerPaymentReceiptPrintOptions,
  readCustomerPaymentReceiptPrintPayload,
  renderCustomerPaymentReceiptDocument,
  type FinancePrintReceiptOptions,
} from "@/lib/finance-document-print";
import { canReadCustomerAppLedger, type CustomerFinancialSource } from "@/lib/customer-financial-source";

type Props = { source: CustomerFinancialSource | null };
const PAGE_SIZE = 100;
const emptyOptions: FinancePrintReceiptOptions = {
  organization_name: "",
  receipts: [],
  total: 0,
  limit: PAGE_SIZE,
  offset: 0,
  has_more: false,
};

function closePrintWindow(target: Window | null): void {
  if (target && !target.closed) target.close();
}

/**
 * Customer-only receipt retrieval. It intentionally calls the customer RPCs,
 * never the staff-only receipt list/print functions used by the admin workspace.
 */
export function CustomerPaymentReceiptSelfServiceActions({ source }: Props) {
  const [options, setOptions] = useState<FinancePrintReceiptOptions>(emptyOptions);
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const optionsRequestSequenceRef = useRef(0);

  const loadOptions = useCallback(async (targetOffset = 0, preferredId?: string | null) => {
    const requestId = ++optionsRequestSequenceRef.current;
    if (!canReadCustomerAppLedger(sourceRef.current)) {
      setOptions(emptyOptions);
      setSelectedId("");
      setLoading(false);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await supabase.rpc("get_my_customer_payment_receipt_print_options", {
        p_limit: PAGE_SIZE,
        p_offset: targetOffset,
      });
      if (result.error) throw new Error("تعذر تحميل سندات القبض الخاصة بحسابك.");
      if (requestId !== optionsRequestSequenceRef.current) return;
      if (!canReadCustomerAppLedger(sourceRef.current)) {
        setOptions(emptyOptions);
        setSelectedId("");
        return;
      }
      const parsed = readCustomerPaymentReceiptPrintOptions(result.data);
      if (parsed.limit !== PAGE_SIZE || parsed.offset !== targetOffset) {
        throw new Error("أعاد الخادم صفحة سندات قبض بحدود ترقيم غير مطابقة.");
      }
      setOptions(parsed);
      setOffset(targetOffset);
      const preferred = preferredId && parsed.receipts.some((row) => row.id === preferredId)
        ? preferredId
        : "";
      setSelectedId(preferred || parsed.receipts[0]?.id || "");
    } catch (cause) {
      if (requestId !== optionsRequestSequenceRef.current) return;
      setOptions(emptyOptions);
      setSelectedId("");
      setError(cause instanceof Error ? cause.message : "تعذر تحميل سندات القبض الخاصة بحسابك.");
    } finally {
      if (requestId === optionsRequestSequenceRef.current) setLoading(false);
    }
  }, [source]);

  useEffect(() => {
    void loadOptions(0);
    return () => { optionsRequestSequenceRef.current += 1; };
  }, [loadOptions]);

  const selected = options.receipts.find((row) => row.id === selectedId) ?? null;

  async function printReceipt() {
    if (!selected || busy || !canReadCustomerAppLedger(sourceRef.current)) return;
    setError("");
    setNotice("");
    let printWindow: Window | null = null;
    try {
      // Open synchronously in the click handler to avoid popup-blocker races.
      printWindow = window.open("", "_blank", "width=1000,height=800");
      if (!printWindow) throw new Error("حُظر فتح نافذة الطباعة؛ اسمح بالنوافذ المنبثقة ثم أعد المحاولة.");
      printWindow.opener = null;
      printWindow.document.documentElement.lang = "ar";
      printWindow.document.documentElement.dir = "rtl";
      printWindow.document.body.replaceChildren();
      const waiting = printWindow.document.createElement("p");
      waiting.dir = "rtl";
      waiting.textContent = "جارٍ التحقق من سند القبض وصلاحية الحساب…";
      printWindow.document.body.appendChild(waiting);
      setBusy(true);
      const result = await supabase.rpc("get_my_customer_payment_receipt_print_data", {
        p_receipt_id: selected.id,
      });
      if (result.error) throw new Error("تعذر استرجاع سند القبض من مصدر الحساب المعتمد.");
      const payload = readCustomerPaymentReceiptPrintPayload(result.data);
      if (!canReadCustomerAppLedger(sourceRef.current)) {
        throw new Error("تغير مصدر الحساب أثناء تجهيز السند؛ أوقفنا الطباعة وأغلقنا النافذة.");
      }
      if (payload.receipt.id !== selected.id) {
        throw new Error("لم يطابق السند الذي أعاده الخادم السند المحدد؛ أوقفنا الطباعة.");
      }
      renderCustomerPaymentReceiptDocument(printWindow.document, payload, options.organization_name);
      printWindow.focus();
      printWindow.onafterprint = () => closePrintWindow(printWindow);
      window.setTimeout(() => {
        if (printWindow && !printWindow.closed) printWindow.print();
      }, 180);
      setNotice("تم تجهيز سند القبض المحفوظ من رأس السند وتخصيصات الفواتير الفعلية.");
    } catch (cause) {
      closePrintWindow(printWindow);
      setError(cause instanceof Error ? cause.message : "تعذر تجهيز سند القبض للطباعة.");
    } finally {
      setBusy(false);
    }
  }

  const receiptLabel = (receipt: FinancePrintReceiptOptions["receipts"][number]) =>
    "سند-" + receipt.receipt_number.padStart(6, "0") + " — " +
    receipt.paid_at.slice(0, 10) + " — " + receipt.total_amount + " " + receipt.currency +
    " — " + receipt.allocation_count.toLocaleString("ar-YE") + " فواتير";

  return (
    <section
      dir="rtl"
      aria-labelledby="customer-self-receipt-heading"
      style={{ border: "1px solid var(--border, #d6dfe4)", borderRadius: 12, padding: 16, marginBottom: 14, background: "var(--card, #fff)", display: "grid", gap: 12 }}
    >
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 id="customer-self-receipt-heading" style={{ margin: 0, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
            <Printer size={18} /> سندات القبض الخاصة بحسابك
          </h3>
          <p style={{ color: "var(--muted-foreground, #66757b)", margin: "6px 0 0", lineHeight: 1.7, fontSize: 12 }}>
            عرض وإعادة طباعة السندات المحفوظة فقط. لا تنشئ الطباعة دفعة جديدة ولا تغيّر الأرصدة.
          </p>
        </div>
        <button type="button" onClick={() => void loadOptions(0, selectedId)} disabled={loading || busy}
          style={{ border: "1px solid var(--border, #d6dfe4)", borderRadius: 8, padding: "9px 12px", cursor: "pointer", font: "inherit", background: "var(--card, #fff)", color: "var(--foreground, #17242a)", display: "inline-flex", alignItems: "center", gap: 7 }}>
          <RefreshCw size={15} /> تحديث السجل
        </button>
      </header>
      <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 750 }}>
        سند القبض
        <select aria-label="سندات القبض الخاصة بحساب العميل" value={selected?.id ?? ""}
          onChange={(event) => setSelectedId(event.target.value)} disabled={loading || busy || options.receipts.length === 0}
          style={{ width: "100%", boxSizing: "border-box", padding: "9px 10px", border: "1px solid var(--border, #d6dfe4)", borderRadius: 8, background: "var(--card, #fff)", color: "var(--foreground, #17242a)", font: "inherit" }}>
          <option value="">{loading ? "جارٍ تحميل سندات القبض…" : "اختر سندًا محفوظًا…"}</option>
          {options.receipts.map((receipt) => <option key={receipt.id} value={receipt.id}>{receiptLabel(receipt)}</option>)}
        </select>
      </label>
      {(offset > 0 || options.has_more) && (
        <nav aria-label="ترقيم سندات قبض العميل" style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ color: "var(--muted-foreground, #66757b)", fontSize: 12 }}>
            {options.total.toLocaleString("ar-YE")} سند محفوظ
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => void loadOptions(Math.max(0, offset - PAGE_SIZE))}
              disabled={loading || busy || offset === 0}>السجلات الأحدث</button>
            <button type="button" onClick={() => void loadOptions(offset + PAGE_SIZE)}
              disabled={loading || busy || !options.has_more}>السجلات الأقدم</button>
          </div>
        </nav>
      )}
      {loading && <p role="status" style={{ color: "var(--muted-foreground, #66757b)", fontSize: 12 }}>جارٍ تحميل سندات القبض المسموح بها…</p>}
      {error && <p role="alert" style={{ color: "#a32929", background: "#fff1f1", borderRadius: 8, padding: 10, fontSize: 12 }}>{error}</p>}
      {!loading && !error && options.receipts.length === 0 && <p role="status" style={{ color: "var(--muted-foreground, #66757b)", fontSize: 12 }}>لا توجد سندات قبض محفوظة ضمن حسابك في دفتر الأغبري.</p>}
      <div className="no-print">
        <button type="button" onClick={() => void printReceipt()} disabled={loading || busy || !selected}
          style={{ border: "1px solid transparent", borderRadius: 8, padding: "10px 14px", cursor: "pointer", font: "inherit", background: "var(--primary, #155e4a)", color: "#fff", display: "inline-flex", alignItems: "center", gap: 7, fontWeight: 750 }}>
          <FileText size={16} /> {busy ? "جارٍ تجهيز سند القبض…" : "طباعة سند القبض / إعادة الطباعة"}
        </button>
      </div>
    </section>
  );
}
