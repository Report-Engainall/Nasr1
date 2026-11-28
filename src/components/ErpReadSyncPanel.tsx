import { useRef, useState } from "react";
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

type ErpReadSyncTaskStatus = "queued" | "running" | "complete" | "continuation_required" | "failed" | "stopped";
type ErpReadSyncTaskState = {
  objectType: ErpReadSyncObject;
  label: string;
  request: ErpReadSyncRequest;
  status: ErpReadSyncTaskStatus;
  result: ErpReadSyncResult | null;
  error: string | null;
};

const TASK_STATUS_LABELS: Record<ErpReadSyncTaskStatus, string> = {
  queued: "بانتظار التنفيذ",
  running: "قيد التنفيذ",
  complete: "مكتملة",
  continuation_required: "تحتاج استئنافًا",
  failed: "فشلت",
  stopped: "أُوقفت قبل البدء",
};

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
  const [selectedObjectTypes, setSelectedObjectTypes] = useState<ErpReadSyncObject[]>(["products"]);
  const [companyExternalId, setCompanyExternalId] = useState("");
  const [branchExternalId, setBranchExternalId] = useState("");
  const [warehouseExternalId, setWarehouseExternalId] = useState("");
  const [currencyCode, setCurrencyCode] = useState("YER");
  const [busy, setBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [activeRequest, setActiveRequest] = useState<ErpReadSyncRequest | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ErpReadSyncResult | null>(null);
  const [taskRuns, setTaskRuns] = useState<ErpReadSyncTaskState[]>([]);
  const stopRequestedRef = useRef(false);

  function clearPreviousScope() {
    setActiveRequest(null);
    setResult(null);
    setTaskRuns([]);
    setError("");
  }

  function updateTaskRun(objectType: ErpReadSyncObject, update: Partial<ErpReadSyncTaskState>) {
    setTaskRuns((previous) => previous.map((task) =>
      task.objectType === objectType ? { ...task, ...update } : task,
    ));
  }

  function toggleObjectType(objectType: ErpReadSyncObject, checked: boolean) {
    setSelectedObjectTypes((previous) => checked
      ? OBJECT_TYPES.map((item) => item.value).filter((value) => previous.includes(value) || value === objectType)
      : previous.filter((value) => value !== objectType),
    );
  }

  function buildRequest(objectType: ErpReadSyncObject): ErpReadSyncRequest {
    return {
      provider,
      object_type: objectType,
      company_external_id: companyExternalId.trim(),
      branch_external_id: branchExternalId.trim(),
      warehouse_external_id: warehouseExternalId.trim() || null,
      currency_code: currencyCode.trim().toUpperCase() || null,
      max_pages: 2,
      max_records: 500,
    };
  }

  function selectTaskResult(task: ErpReadSyncTaskState) {
    if (!task.result) return;
    setActiveRequest(task.request);
    setResult(task.result);
    setError("");
  }

  async function executeTask(task: ErpReadSyncTaskState) {
    updateTaskRun(task.objectType, { status: "running", error: null });
    try {
      const response = await runErpReadSync(task.request);
      const status: ErpReadSyncTaskStatus = response.status === "complete" ? "complete" : "continuation_required";
      updateTaskRun(task.objectType, { status, result: response, error: null });
      setActiveRequest(task.request);
      setResult(response);
      return response;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "تعذر تشغيل تدفق بيانات ERP المحدد.";
      updateTaskRun(task.objectType, { status: "failed", error: message });
      return null;
    }
  }

  async function runSync() {
    if (!canManage || busy || previewBusy) return;
    if (!companyExternalId.trim() || !branchExternalId.trim()) {
      setError("أدخل معرّف الشركة والفرع كما هما معتمدان في إعداد اتصال ERP على الخادم.");
      return;
    }
    if (selectedObjectTypes.length === 0) {
      setError("اختر نوع بيانات واحدًا على الأقل لتشغيل المزامنة.");
      return;
    }

    const requests = selectedObjectTypes.map((objectType) => ({
      objectType,
      label: OBJECT_TYPES.find((item) => item.value === objectType)?.label ?? objectType,
      request: buildRequest(objectType),
      status: "queued" as const,
      result: null,
      error: null,
    }));
    stopRequestedRef.current = false;
    setBusy(true);
    clearPreviousScope();
    setError("");
    setResult(null);
    setTaskRuns(requests);

    try {
      for (const task of requests) {
        if (stopRequestedRef.current) break;
        await executeTask(task);
      }
      if (stopRequestedRef.current) {
        setTaskRuns((previous) => previous.map((task) =>
          task.status === "queued" ? { ...task, status: "stopped" } : task,
        ));
      }
    } finally {
      setBusy(false);
    }
  }

  async function retryOrResumeTask(task: ErpReadSyncTaskState) {
    if (!canManage || busy || previewBusy ||
        (task.status !== "failed" && task.status !== "continuation_required" && task.status !== "stopped")) return;
    stopRequestedRef.current = false;
    setBusy(true);
    setError("");
    try {
      await executeTask(task);
    } finally {
      setBusy(false);
    }
  }

  function stopAfterCurrentTask() {
    if (!busy) return;
    stopRequestedRef.current = true;
    setError("سيتوقف التسلسل بعد انتهاء طلب الخادم الحالي؛ لن نبدأ أنواع البيانات المتبقية.");
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
        receipts_offset: result.receipts?.offset ?? 0,
        receipts_limit: result.receipts?.limit ?? 10,
      });
      if (!page.preview) throw new Error("لم تُرجع خدمة المعاينة صفحة مرحلية صالحة.");
      setResult((previous) => previous ? {
        ...previous,
        preview: page.preview,
        preview_error: page.preview_error,
        receipts: page.receipts,
        receipts_error: page.receipts_error,
        checkpoint: page.checkpoint,
      } : previous);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل صفحة المعاينة.");
    } finally {
      setPreviewBusy(false);
    }
  }

  async function loadReceiptHistory(nextOffset: number) {
    if (!canManage || busy || previewBusy || !activeRequest || !result) return;
    setPreviewBusy(true);
    setError("");
    try {
      const page = await runErpReadSync({
        ...activeRequest,
        preview_only: true,
        preview_offset: result.preview?.offset ?? 0,
        preview_limit: result.preview?.limit ?? 20,
        receipts_offset: nextOffset,
        receipts_limit: result.receipts?.limit ?? 10,
      });
      setResult((previous) => previous ? {
        ...previous,
        receipts: page.receipts,
        receipts_error: page.receipts_error,
      } : previous);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل سجل إيصالات الصفحات.");
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
          <select value={provider} onChange={(event) => { setProvider(event.target.value as ErpReadSyncProvider); clearPreviousScope(); }} disabled={busy || previewBusy}>
            <option value="onyx_pro">Onyx Pro</option>
            <option value="al_mutakamel">المتكامل</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: 5, fontSize: 13, fontWeight: 700 }}>
          معرّف الشركة في ERP
          <input value={companyExternalId} onChange={(event) => { setCompanyExternalId(event.target.value); clearPreviousScope(); }} disabled={busy || previewBusy} maxLength={256} autoComplete="off" />
        </label>
        <label style={{ display: "grid", gap: 5, fontSize: 13, fontWeight: 700 }}>
          معرّف الفرع في ERP
          <input value={branchExternalId} onChange={(event) => { setBranchExternalId(event.target.value); clearPreviousScope(); }} disabled={busy || previewBusy} maxLength={256} autoComplete="off" />
        </label>
        <label style={{ display: "grid", gap: 5, fontSize: 13, fontWeight: 700 }}>
          معرّف المستودع (اختياري)
          <input value={warehouseExternalId} onChange={(event) => { setWarehouseExternalId(event.target.value); clearPreviousScope(); }} disabled={busy || previewBusy} maxLength={256} autoComplete="off" />
        </label>
        <label style={{ display: "grid", gap: 5, fontSize: 13, fontWeight: 700 }}>
          العملة (اختياري)
          <input value={currencyCode} onChange={(event) => { setCurrencyCode(event.target.value); clearPreviousScope(); }} disabled={busy || previewBusy} maxLength={3} autoComplete="off" />
        </label>
      </div>

      <fieldset disabled={!canManage || busy || previewBusy}
        aria-label="أنواع البيانات المحددة للمزامنة"
        style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, display: "grid", gap: 9 }}>
        <legend style={{ fontWeight: 800, padding: "0 6px" }}>أنواع البيانات للمزامنة</legend>
        <p className="report-note" style={{ margin: 0 }}>
          اختر تدفقًا واحدًا أو أكثر. ينفّذ الخادم كل نطاق بصورة مستقلة، ويحتفظ لكل نوع بمؤشر استئناف منفصل.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))", gap: 9 }}>
          {OBJECT_TYPES.map((item) => (
            <label key={item.value} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 650 }}>
              <input
                type="checkbox"
                checked={selectedObjectTypes.includes(item.value)}
                onChange={(event) => toggleObjectType(item.value, event.target.checked)}
              />
              {item.label}
            </label>
          ))}
        </div>
        <span className="report-note">المحدد: {selectedObjectTypes.length} من {OBJECT_TYPES.length}</span>
      </fieldset>

      <div className="privacy-note" role="note">
        <ShieldCheck size={17} />
        <span>تُرسل المعرفات فقط إلى الوظيفة الخادمية. الخادم يثبت هوية المستخدم والمؤسسة والصلاحية، ثم يطابق الشركة والفرع والمستودع مع القائمة المعتمدة. لا تُدخل كلمة مرور أو مفتاح API هنا.</span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="btn primary" onClick={() => void runSync()} disabled={!canManage || busy || previewBusy || selectedObjectTypes.length === 0 || !companyExternalId.trim() || !branchExternalId.trim()}>
          <RefreshCw size={16} />
          {busy ? "جار تنفيذ تدفقات المزامنة…" : selectedObjectTypes.length > 1 ? "تنفيذ المزامنة متعددة الأنواع" : "تنفيذ مزامنة القراءة"}
        </button>
        {busy && (
          <button type="button" className="btn secondary" onClick={stopAfterCurrentTask}>
            إيقاف بعد المهمة الحالية
          </button>
        )}
        <span className="report-note">كل نوع يحتفظ بمؤشره المستقل. حد المهمة: صفحتان و500 سجل؛ التكرار يستأنف من المؤشر المحمي ويُعاد بأمان وفق مفتاح الصفحة.</span>
      </div>

      {!canManage && <p className="report-note" role="note">تشغيل المزامنة متاح للمدير ومدير النظام فقط.</p>}
      {error && <p className="report-note" role="alert" aria-live="assertive">{error}</p>}
      {taskRuns.length > 0 && (
        <section aria-label="نتائج تدفقات مزامنة ERP" style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <strong>نتائج تدفقات البيانات المحددة</strong>
            <span className="report-note">
              مكتملة {taskRuns.filter((task) => task.status === "complete").length} · متابعة {taskRuns.filter((task) => task.status === "continuation_required").length} · فاشلة {taskRuns.filter((task) => task.status === "failed").length} · متوقفة {taskRuns.filter((task) => task.status === "stopped").length}
            </span>
          </div>
          {taskRuns.map((task) => (
            <article key={task.objectType} style={{ border: "1px solid var(--border)", borderRadius: 9, padding: 10, display: "grid", gap: 7 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <strong>{task.label}</strong>
                <span className="report-note">{TASK_STATUS_LABELS[task.status]}</span>
              </div>
              {task.result && (
                <div className="report-note">
                  صفحات {task.result.pages_committed} · سجلات {task.result.records_read} · جديد {task.result.counts.created} · محدّث {task.result.counts.updated} · مرفوض {task.result.counts.rejected} · متعارض {task.result.counts.conflicted}
                  <span style={{ display: "block" }}>
                    آخر إكمال: {formatDate(task.result.checkpoint.completed_watermark)} · إصدار {task.result.checkpoint.version}
                  </span>
                </div>
              )}
              {task.error && <p className="report-note" role="alert" style={{ margin: 0 }}>{task.error}</p>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {task.result && (
                  <button type="button" className="btn secondary" onClick={() => selectTaskResult(task)} disabled={busy || previewBusy}>
                    عرض المعاينة والإيصالات
                  </button>
                )}
                {(task.status === "failed" || task.status === "continuation_required" || task.status === "stopped") && (
                  <button type="button" className="btn secondary" onClick={() => void retryOrResumeTask(task)} disabled={busy || previewBusy}>
                    {task.status === "continuation_required" ? "استئناف هذا النوع فقط" : task.status === "stopped" ? "متابعة هذا النوع فقط" : "إعادة محاولة هذا النوع فقط"}
                  </button>
                )}
              </div>
            </article>
          ))}
        </section>
      )}
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
          {result.receipts_error && <p className="report-note" role="status">تعذر تحميل سجل إيصالات صفحات ERP ({result.receipts_error})؛ بقيت نتيجة المزامنة محفوظة.</p>}
          {result.receipts && (
            <section aria-label="سجل إيصالات صفحات ERP" style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <strong>سجل إيصالات صفحات ERP</strong>
                <span className="report-note">المعروض {result.receipts.records.length} من {result.receipts.total} · إصدار {result.receipts.checkpointVersion}</span>
              </div>
              <div role="group" aria-label="صفحات سجل إيصالات ERP" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className="report-note">
                  الإيصالات {result.receipts.total === 0 ? "0–0" : (result.receipts.offset + 1) + "–" + (result.receipts.offset + result.receipts.records.length)} من {result.receipts.total}
                </span>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => void loadReceiptHistory(Math.max(0, result.receipts!.offset - result.receipts!.limit))}
                  disabled={!activeRequest || busy || previewBusy || result.receipts.offset <= 0}
                >السابق</button>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => void loadReceiptHistory(result.receipts!.offset + result.receipts!.limit)}
                  disabled={!activeRequest || busy || previewBusy || result.receipts.offset + result.receipts.limit >= result.receipts.total}
                >التالي</button>
                {previewBusy && <span className="report-note" role="status">جار تحميل سجل الإيصالات دون إعادة المزامنة…</span>}
              </div>
              {result.receipts.records.length === 0
                ? <p className="report-note">لم تُسجل صفحات مصدر لهذا النطاق حتى الآن.</p>
                : result.receipts.records.map((receipt) => (
                  <article key={receipt.committedVersion} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, display: "grid", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <strong>صفحة {receipt.pageNumber} · {receipt.completed ? "اكتملت" : "تحتاج متابعة"}</strong>
                      <span className="report-note">HTTP {receipt.httpStatus} · الإصدار {receipt.committedVersion}</span>
                    </div>
                    <div className="report-note">
                      السجلات الواردة: {receipt.recordsReceived} · جديدة: {receipt.counts.created} · محدثة: {receipt.counts.updated} · مطابقة: {receipt.counts.unchanged} · مرفوضة: {receipt.counts.rejected} · متعارضة: {receipt.counts.conflicted}
                    </div>
                    <div className="report-note">
                      {formatDate(receipt.recordedAt)} · {receipt.hasNextCursor ? "يوجد مؤشر متابعة محمي" : "لا يوجد مؤشر صفحة تالٍ"} · علامة الإكمال: {formatDate(receipt.completedWatermark)}
                    </div>
                  </article>
                ))}
            </section>
          )}
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
