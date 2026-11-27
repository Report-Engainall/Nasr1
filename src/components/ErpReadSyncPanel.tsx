import { useState } from "react";
import { Activity, RefreshCw, ShieldCheck } from "lucide-react";
import {
  runErpReadSync,
  type ErpReadSyncObject,
  type ErpReadSyncProvider,
  type ErpReadSyncResult,
} from "@/lib/erp-read-sync";

const OBJECT_TYPES: Array<{ value: ErpReadSyncObject; label: string }> = [
  { value: "products", label: "الأصناف" },
  { value: "customers", label: "العملاء" },
  { value: "warehouses", label: "المستودعات" },
  { value: "stock_balances", label: "كميات المخزون" },
  { value: "product_units", label: "الوحدات والتحويلات" },
  { value: "product_prices", label: "قوائم الأسعار" },
  { value: "customer_financial_documents", label: "فواتير وإشعارات العملاء" },
  { value: "customer_payment_receipts", label: "سندات قبض العملاء" },
  { value: "customer_statement_entries", label: "حركات كشوف الحساب" },
];

function formatDate(value: string | null): string {
  if (!value) return "غير متوفر";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("ar") : "غير متوفر";
}

export function ErpReadSyncPanel({ canManage }: { canManage: boolean }) {
  const [provider, setProvider] = useState<ErpReadSyncProvider>("onyx_pro");
  const [objectType, setObjectType] = useState<ErpReadSyncObject>("products");
  const [companyExternalId, setCompanyExternalId] = useState("");
  const [branchExternalId, setBranchExternalId] = useState("");
  const [warehouseExternalId, setWarehouseExternalId] = useState("");
  const [currencyCode, setCurrencyCode] = useState("YER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ErpReadSyncResult | null>(null);

  async function runSync() {
    if (!canManage || busy) return;
    if (!companyExternalId.trim() || !branchExternalId.trim()) {
      setError("أدخل معرّف الشركة والفرع كما هما معتمدان في إعداد اتصال ERP على الخادم.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await runErpReadSync({
        provider,
        object_type: objectType,
        company_external_id: companyExternalId.trim(),
        branch_external_id: branchExternalId.trim(),
        warehouse_external_id: warehouseExternalId.trim() || null,
        currency_code: currencyCode.trim().toUpperCase() || null,
        max_pages: 2,
        max_records: 500,
      });
      setResult(response);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تشغيل مزامنة ERP.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" style={{ display: "grid", gap: 12 }} aria-label="تشغيل مزامنة قراءة ERP">
      <div className="panel-head">
        <div>
          <h2>مزامنة قراءة خادمية من ERP</h2>
          <p>سحب تفاضلي محدود إلى منطقة تجهيز مع سجل استئناف ومطابقة. البيانات المالية تُحفظ معزولة ولا تُرحّل إلى دفتر الحساب أو المخزون تلقائيًا.</p>
        </div>
        <Activity size={23} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
        <label style={{ display: "grid", gap: 5, fontSize: 13, fontWeight: 700 }}>
          النظام المحاسبي
          <select value={provider} onChange={(event) => setProvider(event.target.value as ErpReadSyncProvider)} disabled={busy}>
            <option value="onyx_pro">Onyx Pro</option>
            <option value="al_mutakamel">المتكامل</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: 5, fontSize: 13, fontWeight: 700 }}>
          نوع البيانات
          <select value={objectType} onChange={(event) => setObjectType(event.target.value as ErpReadSyncObject)} disabled={busy}>
            {OBJECT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label style={{ display: "grid", gap: 5, fontSize: 13, fontWeight: 700 }}>
          معرّف الشركة في ERP
          <input value={companyExternalId} onChange={(event) => setCompanyExternalId(event.target.value)} disabled={busy} maxLength={256} autoComplete="off" />
        </label>
        <label style={{ display: "grid", gap: 5, fontSize: 13, fontWeight: 700 }}>
          معرّف الفرع في ERP
          <input value={branchExternalId} onChange={(event) => setBranchExternalId(event.target.value)} disabled={busy} maxLength={256} autoComplete="off" />
        </label>
        <label style={{ display: "grid", gap: 5, fontSize: 13, fontWeight: 700 }}>
          معرّف المستودع (اختياري)
          <input value={warehouseExternalId} onChange={(event) => setWarehouseExternalId(event.target.value)} disabled={busy} maxLength={256} autoComplete="off" />
        </label>
        <label style={{ display: "grid", gap: 5, fontSize: 13, fontWeight: 700 }}>
          العملة (اختياري)
          <input value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value)} disabled={busy} maxLength={3} autoComplete="off" />
        </label>
      </div>

      <div className="privacy-note" role="note">
        <ShieldCheck size={17} />
        <span>تُرسل المعرفات فقط إلى الوظيفة الخادمية. الخادم يثبت هوية المستخدم والمؤسسة والصلاحية، ثم يطابق الشركة والفرع والمستودع مع القائمة المعتمدة. لا تُدخل كلمة مرور أو مفتاح API هنا.</span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="btn primary" onClick={() => void runSync()} disabled={!canManage || busy || !companyExternalId.trim() || !branchExternalId.trim()}>
          <RefreshCw size={16} />
          {busy ? "جار تنفيذ المزامنة الخادمية…" : "تنفيذ مزامنة القراءة"}
        </button>
        <span className="report-note">حد التشغيل: صفحتان و500 سجل كحد أقصى. يمكن استئناف التشغيل التالي من المؤشر المحمي على الخادم.</span>
      </div>

      {!canManage && <p className="report-note" role="note">تشغيل المزامنة متاح للمدير ومدير النظام فقط.</p>}
      {error && <p className="report-note" role="alert" aria-live="assertive">{error}</p>}
      {result && (
        <div role="status" aria-live="polite" style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, display: "grid", gap: 9 }}>
          <strong>{result.status === "complete" ? "اكتملت مزامنة القراءة" : "توجد متابعة مطلوبة لاستكمال المزامنة"}</strong>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(115px, 1fr))", gap: 8 }}>
            <span>الصفحات: <strong>{result.pages_committed}</strong></span>
            <span>السجلات: <strong>{result.records_read}</strong></span>
            <span>جديدة: <strong>{result.counts.created}</strong></span>
            <span>محدّثة: <strong>{result.counts.updated}</strong></span>
            <span>متطابقة: <strong>{result.counts.unchanged}</strong></span>
            <span>مرفوضة: <strong>{result.counts.rejected}</strong></span>
            <span>متعارضة: <strong>{result.counts.conflicted}</strong></span>
          </div>
          <p className="report-note" style={{ margin: 0 }}>
            إصدار نقطة الاستئناف: {result.checkpoint.version} · {result.checkpoint.has_cursor ? "يوجد مؤشر متابعة محمي" : "لا يوجد مؤشر متابعة"}
          </p>
          <p className="report-note" style={{ margin: 0 }}>
            آخر علامة إكمال: {formatDate(result.checkpoint.completed_watermark)} · علامة التشغيل الجاري: {formatDate(result.checkpoint.pending_watermark)}
          </p>
        </div>
      )}
    </section>
  );
}
