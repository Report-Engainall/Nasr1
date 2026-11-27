import { useState } from "react";
import { Activity, RefreshCw, ShieldCheck } from "lucide-react";
import {
  runErpReadSync,
  type ErpReadSyncObject,
  type ErpReadSyncProvider,
  type ErpReadSyncRequest,
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

function formatDisposition(value: "created" | "updated" | "unchanged" | "rejected" | "conflicted" | null): string {
  switch (value) {
    case "created": return "جديد";
    case "updated": return "محدّث";
    case "unchanged": return "مطابق دون تغيير";
    case "rejected": return "مرفوض";
    case "conflicted": return "متعارض";
    default: return "لم يُسجل بعد";
  }
}

const PREVIEW_FIELD_LABELS: Record<string, string> = {
  item_code: "رقم الصنف",
  sku: "SKU",
  barcode: "الباركود",
  name: "اسم الصنف",
  name_en: "الاسم الإنجليزي",
  category_code: "رمز التصنيف",
  category_name: "التصنيف",
  brand_name: "العلامة التجارية",
  unit_code: "رمز الوحدة",
  unit_name: "الوحدة",
  customer_code: "رقم العميل",
  business_name: "اسم العميل",
  phone: "الهاتف",
  email: "البريد الإلكتروني",
  warehouse_code: "رمز المستودع",
  warehouse_name: "المستودع",
  quantity_on_hand: "الرصيد الفعلي",
  quantity_reserved: "المحجوز",
  quantity_available: "المتاح",
  conversion_factor: "معامل التحويل",
  price_list_code: "قائمة الأسعار",
  customer_tier: "شريحة العميل",
  currency_code: "العملة",
  unit_price: "سعر الوحدة",
  external_customer_id: "معرف حساب العميل في ERP",
  document_number: "رقم المستند",
  document_type: "نوع المستند",
  document_status: "حالة المستند",
  issue_date: "تاريخ الإصدار",
  due_date: "تاريخ الاستحقاق",
  total_amount: "الإجمالي",
  paid_amount: "المدفوع",
  outstanding_amount: "المتبقي",
  receipt_number: "رقم سند القبض",
  receipt_date: "تاريخ القبض",
  amount: "المبلغ",
  payment_status: "حالة القبض",
  payment_method: "طريقة القبض",
  applied_document_number: "المستند المرتبط",
  entry_reference: "مرجع الحركة",
  entry_date: "تاريخ الحركة",
  entry_type: "نوع الحركة",
  debit_amount: "مدين",
  credit_amount: "دائن",
  source_document_number: "مرجع المستند",
  reference: "مرجع إضافي",
  description: "الوصف",
};


export function ErpReadSyncPanel({ canManage }: { canManage: boolean }) {
  const [provider, setProvider] = useState<ErpReadSyncProvider>("onyx_pro");
  const [objectType, setObjectType] = useState<ErpReadSyncObject>("products");
  const [companyExternalId, setCompanyExternalId] = useState("");
  const [branchExternalId, setBranchExternalId] = useState("");
  const [warehouseExternalId, setWarehouseExternalId] = useState("");
  const [currencyCode, setCurrencyCode] = useState("YER");
  const [busy, setBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [activeRequest, setActiveRequest] = useState<ErpReadSyncRequest | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ErpReadSyncResult | null>(null);

  async function runSync() {
    if (!canManage || busy || previewBusy) return;
    if (!companyExternalId.trim() || !branchExternalId.trim()) {
      setError("أدخل معرّف الشركة والفرع كما هما معتمدان في إعداد اتصال ERP على الخادم.");
      return;
    }
    const request: ErpReadSyncRequest = {
      provider,
      object_type: objectType,
      company_external_id: companyExternalId.trim(),
      branch_external_id: branchExternalId.trim(),
      warehouse_external_id: warehouseExternalId.trim() || null,
      currency_code: currencyCode.trim().toUpperCase() || null,
      max_pages: 2,
      max_records: 500,
    };
    setBusy(true);
    setActiveRequest(null);
    setError("");
    setResult(null);
    try {
      const response = await runErpReadSync(request);
      setActiveRequest(request);
      setResult(response);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تشغيل مزامنة ERP.");
    } finally {
      setBusy(false);
    }
  }

  async function loadPreview(nextOffset: number) {
    if (!canManage || busy || previewBusy || !activeRequest || !result?.preview) return;
    setPreviewBusy(true);
    setError("");
    try {
      const page = await runErpReadSync({
        ...activeRequest,
        preview_only: true,
        preview_offset: nextOffset,
        preview_limit: result.preview.limit,
      });
      if (!page.preview) throw new Error("لم تُرجع خدمة المعاينة صفحة مرحلية صالحة.");
      setResult((previous) => previous ? {
        ...previous,
        preview: page.preview,
        preview_error: page.preview_error,
        checkpoint: page.checkpoint,
      } : previous);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل صفحة المعاينة.");
    } finally {
      setPreviewBusy(false);
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
          <select value={provider} onChange={(event) => { setProvider(event.target.value as ErpReadSyncProvider); setActiveRequest(null); }} disabled={busy || previewBusy}>
            <option value="onyx_pro">Onyx Pro</option>
            <option value="al_mutakamel">المتكامل</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: 5, fontSize: 13, fontWeight: 700 }}>
          نوع البيانات
          <select value={objectType} onChange={(event) => { setObjectType(event.target.value as ErpReadSyncObject); setActiveRequest(null); }} disabled={busy || previewBusy}>
            {OBJECT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label style={{ display: "grid", gap: 5, fontSize: 13, fontWeight: 700 }}>
          معرّف الشركة في ERP
          <input value={companyExternalId} onChange={(event) => { setCompanyExternalId(event.target.value); setActiveRequest(null); }} disabled={busy || previewBusy} maxLength={256} autoComplete="off" />
        </label>
        <label style={{ display: "grid", gap: 5, fontSize: 13, fontWeight: 700 }}>
          معرّف الفرع في ERP
          <input value={branchExternalId} onChange={(event) => { setBranchExternalId(event.target.value); setActiveRequest(null); }} disabled={busy || previewBusy} maxLength={256} autoComplete="off" />
        </label>
        <label style={{ display: "grid", gap: 5, fontSize: 13, fontWeight: 700 }}>
          معرّف المستودع (اختياري)
          <input value={warehouseExternalId} onChange={(event) => { setWarehouseExternalId(event.target.value); setActiveRequest(null); }} disabled={busy || previewBusy} maxLength={256} autoComplete="off" />
        </label>
        <label style={{ display: "grid", gap: 5, fontSize: 13, fontWeight: 700 }}>
          العملة (اختياري)
          <input value={currencyCode} onChange={(event) => { setCurrencyCode(event.target.value); setActiveRequest(null); }} disabled={busy || previewBusy} maxLength={3} autoComplete="off" />
        </label>
      </div>

      <div className="privacy-note" role="note">
        <ShieldCheck size={17} />
        <span>تُرسل المعرفات فقط إلى الوظيفة الخادمية. الخادم يثبت هوية المستخدم والمؤسسة والصلاحية، ثم يطابق الشركة والفرع والمستودع مع القائمة المعتمدة. لا تُدخل كلمة مرور أو مفتاح API هنا.</span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="btn primary" onClick={() => void runSync()} disabled={!canManage || busy || previewBusy || !companyExternalId.trim() || !branchExternalId.trim()}>
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
          {result.preview_error && <p className="report-note" role="status">تعذر تحميل معاينة السجلات المرحلية ({result.preview_error})؛ بقيت نتيجة المزامنة محفوظة.</p>}
          {result.preview && (
            <section style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <strong>معاينة البيانات المرحلية</strong>
                <span className="report-note">المعروض {result.preview.records.length} من {result.preview.total} · إصدار {result.preview.checkpointVersion}</span>
              </div>
              <div role="group" aria-label="صفحات معاينة بيانات ERP" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className="report-note">
                  السجلات {result.preview.total === 0 ? "0–0" : (result.preview.offset + 1) + "–" + (result.preview.offset + result.preview.records.length)} من {result.preview.total}
                </span>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => void loadPreview(Math.max(0, result.preview!.offset - result.preview!.limit))}
                  disabled={!activeRequest || busy || previewBusy || result.preview.offset <= 0}
                >السابق</button>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => void loadPreview(result.preview!.offset + result.preview!.limit)}
                  disabled={!activeRequest || busy || previewBusy || result.preview.offset + result.preview.limit >= result.preview.total}
                >التالي</button>
                {previewBusy && <span className="report-note" role="status">جار تحميل الصفحة دون إعادة المزامنة…</span>}
                {!activeRequest && <span className="report-note">غيّر نطاق الإدخال؛ أعد المزامنة لتفعيل التنقل لهذا النطاق.</span>}
              </div>
              {result.preview.records.length === 0
                ? <p className="report-note">لا توجد سجلات مرحلية لهذا النطاق حتى الآن.</p>
                : result.preview.records.map((record) => (
                  <article key={record.externalId} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, display: "grid", gap: 7 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <strong>{record.externalId}</strong>
                        <span className="report-note" style={{ border: "1px solid var(--border)", borderRadius: 999, padding: "2px 8px" }}>
                          {formatDisposition(record.lastDisposition)}
                        </span>
                      </div>
                      <span className="report-note">{formatDate(record.sourceUpdatedAt)}</span>
                    </div>
                    <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 7 }}>
                      {Object.entries(record.fields).map(([key, value]) => (
                        <div key={key} style={{ minWidth: 0 }}>
                          <dt className="report-note">{PREVIEW_FIELD_LABELS[key] ?? key}</dt>
                          <dd style={{ margin: 0, overflowWrap: "anywhere", fontWeight: 600 }}>
                            {value === null ? "—" : String(value)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </article>
                ))}
            </section>
          )}
        </div>
      )}
    </section>
  );
}
