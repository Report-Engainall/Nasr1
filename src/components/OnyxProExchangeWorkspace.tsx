import { useMemo, useState } from "react";
import { ArrowRight, Download, FileSpreadsheet, FileText, PackageCheck, RefreshCw, ShieldCheck } from "lucide-react";
import { ONYX_PRO_DATASETS, buildOnyxProHeaderCsv, type OnyxProDataset } from "@/lib/onyx-pro-schema";
import {
  buildOnyxProWorkbook,
  onyxProDatasetCsvFilename,
  onyxProWorkbookFilename,
  ONYX_PRO_WORKBOOK_MIME,
} from "@/lib/onyx-pro-workbook";

type Props = {
  onBack: () => void;
  onOpenImport: () => void;
  canManageImports: boolean;
  onOpenSnapshots: () => void;
};

function downloadFile(filename: string, content: BlobPart, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DatasetCard({ dataset, onDownload }: {
  dataset: OnyxProDataset;
  onDownload: (datasetId: string) => void;
}) {
  const required = dataset.fields.filter((field) => field.required);
  return (
    <article className="panel" style={{ display: "grid", gap: 10, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16 }}>{dataset.label}</h3>
          <p style={{ margin: "5px 0 0", color: "var(--muted-foreground)", fontSize: 12 }}>{dataset.sheetName} · {dataset.fields.length} حقل</p>
        </div>
        <FileText size={19} aria-hidden="true" />
      </div>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>{dataset.description}</p>
      <div style={{ fontSize: 12, lineHeight: 1.8 }}>
        <strong>مفاتيح المطابقة:</strong> <code>{dataset.keyFields.join(" + ")}</code>
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.8 }}>
        <strong>الحقول الإلزامية:</strong> {required.length ? required.map((field) => field.header).join("، ") : "لا يوجد حقل إلزامي عام؛ تعتمد المتطلبات على نوع الحركة"}
      </div>
      <details>
        <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 700 }}>عرض جميع رؤوس الحقول ({dataset.fields.length})</summary>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 6, marginTop: 10 }}>
          {dataset.fields.map((field, index) => (
            <div key={field.field} style={{ display: "flex", gap: 7, alignItems: "baseline", borderBottom: "1px solid var(--border)", padding: "5px 0", fontSize: 12 }}>
              <span style={{ color: "var(--muted-foreground)", minWidth: 20 }}>{index + 1}.</span>
              <span style={{ minWidth: 0 }}>{field.header}{field.required ? <strong style={{ color: "var(--destructive, #b42318)" }}> *</strong> : null}</span>
              <code style={{ marginInlineStart: "auto", fontSize: 10, color: "var(--muted-foreground)" }}>{field.field}</code>
            </div>
          ))}
        </div>
      </details>
      <button type="button" className="btn secondary" onClick={() => onDownload(dataset.id)}>
        <Download size={15} /> تنزيل رؤوس CSV لهذه المجموعة
      </button>
    </article>
  );
}

export function OnyxProExchangeWorkspace({ onBack, onOpenImport, canManageImports, onOpenSnapshots }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() => ONYX_PRO_DATASETS.map((dataset) => dataset.id));
  const [notice, setNotice] = useState("");
  const selectedCount = selectedIds.length;
  const selectionLabel = useMemo(() =>
    ONYX_PRO_DATASETS.filter((dataset) => selectedIds.includes(dataset.id)).map((dataset) => dataset.label).join("، "),
  [selectedIds]);

  function toggleDataset(datasetId: string, checked: boolean) {
    setSelectedIds((current) => checked
      ? [...current, datasetId].filter((id, index, all) => all.indexOf(id) === index)
      : current.filter((id) => id !== datasetId));
  }

  function downloadWorkbook() {
    try {
      const bytes = buildOnyxProWorkbook(selectedIds);
      const binary = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      downloadFile(onyxProWorkbookFilename(), binary, ONYX_PRO_WORKBOOK_MIME);
      setNotice("تم تجهيز قالب Excel المحدد برؤوس الحقول فقط؛ لا يحتوي على بيانات أعمال أو سجلات تجريبية.");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "تعذر إنشاء قالب أونكس.");
    }
  }

  function downloadCsv(datasetId: string) {
    try {
      const dataset = ONYX_PRO_DATASETS.find((item) => item.id === datasetId);
      if (!dataset) throw new Error("مجموعة البيانات غير معروفة.");
      const csv = buildOnyxProHeaderCsv(datasetId);
      downloadFile(onyxProDatasetCsvFilename(datasetId), csv, "text/csv;charset=utf-8");
      setNotice("تم تنزيل رؤوس " + dataset.label + " بصيغة CSV.");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "تعذر تنزيل ملف الرؤوس.");
    }
  }

  return (
    <main dir="rtl" style={{ display: "grid", gap: 18 }}>
      <div className="toolbar">
        <div>
          <span className="toolbar-note">تكامل تبادل البيانات — Onyx Pro</span>
          <h1 style={{ margin: "6px 0 0", fontSize: 24 }}>قواميس الحقول وقوالب أونكس برو</h1>
          <p style={{ margin: "6px 0 0", color: "var(--muted-foreground)", fontSize: 13, lineHeight: 1.7 }}>
            عقد موحد لـ12 ورقة بيانات، ومفاتيح ربط ثابتة، ورؤوس عربية مع أسماء تقنية قابلة للمطابقة.
          </p>
        </div>
        <button type="button" className="btn secondary" onClick={onBack}><ArrowRight size={16} /> العودة لمركز البيانات</button>
      </div>

      {notice && <div role="status" aria-live="polite" className="privacy-note"><ShieldCheck size={17} /><span>{notice}</span></div>}

      <section className="panel" style={{ display: "grid", gap: 12 }}>
        <div className="panel-head">
          <div><h2>إنشاء قالب تبادل شامل</h2><p>ملف واحد بأوراق مستقلة، أو CSV منفصل لكل مجموعة.</p></div>
          <FileSpreadsheet size={23} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" className="btn secondary" onClick={() => setSelectedIds(ONYX_PRO_DATASETS.map((dataset) => dataset.id))}>تحديد الكل</button>
          <button type="button" className="btn secondary" onClick={() => setSelectedIds([])}>إلغاء التحديد</button>
          <strong style={{ alignSelf: "center", fontSize: 13 }}>{selectedCount} / {ONYX_PRO_DATASETS.length} أوراق محددة</strong>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 8 }}>
          {ONYX_PRO_DATASETS.map((dataset) => (
            <label key={dataset.id} style={{ display: "flex", gap: 8, alignItems: "center", border: "1px solid var(--border)", borderRadius: 9, padding: 10, fontSize: 13 }}>
              <input type="checkbox" checked={selectedIds.includes(dataset.id)} onChange={(event) => toggleDataset(dataset.id, event.target.checked)} />
              <span>{dataset.label}</span>
              <small style={{ marginInlineStart: "auto", color: "var(--muted-foreground)" }}>{dataset.fields.length}</small>
            </label>
          ))}
        </div>
        {selectedCount > 0 && <div style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.7 }}>الأوراق المختارة: {selectionLabel}</div>}
        <button type="button" className="btn primary" onClick={downloadWorkbook} disabled={selectedCount === 0}>
          <Download size={16} /> تنزيل قالب Excel متعدد الأوراق
        </button>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 12 }}>
        {ONYX_PRO_DATASETS.map((dataset) => <DatasetCard key={dataset.id} dataset={dataset} onDownload={downloadCsv} />)}
      </section>

      <section className="panel" style={{ display: "grid", gap: 10 }}>
        <div className="panel-head"><div><h2>المسارات التشغيلية الموجودة</h2><p>تُستخدم المحركات الموجودة ولا تنشأ مسارات بيانات موازية.</p></div><PackageCheck size={22} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 10 }}>
          <div><strong>الأصناف والعملاء</strong><p style={{ fontSize: 12, lineHeight: 1.7 }}>تُقرأ ورقتا Products وCustomers من المصنف نفسه كدفعتين مستقلتين، مع فحص التكرار والمراجعة قبل اعتماد السجلات.</p></div>
          <div><strong>الوحدات والمخزون</strong><p style={{ fontSize: 12, lineHeight: 1.7 }}>تُرحّل ProductUnits إلى أمر تحويل وحدات ذري بعد اعتماد الأصناف، وتُرحّل StockBalances إلى لقطة مستقلة ثم مصالحة محددة لكل مخزن. الرفع وحده لا يغيّر الأرصدة.</p></div>
          <div><strong>الطلبات وقوائم الأسعار</strong><p style={{ fontSize: 12, lineHeight: 1.7 }}>قوالب Orders وOrderLines وPriceLists وPriceListLines مُعرّفة، لكن استيرادها التشغيلي وتصدير السجلات الحية لهذه المجموعات ما زال غير موصول؛ لا تُمرّر إلى جداول غير مطابقة.</p></div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {canManageImports && <button type="button" className="btn primary" onClick={onOpenImport}><RefreshCw size={15} /> استيراد مصنف أونكس متعدد الأوراق</button>}
          <button type="button" className="btn secondary" onClick={onOpenSnapshots}><PackageCheck size={15} /> فتح لقطات أونكس ومصالحة المخزون</button>
          <a className="btn secondary" href="/admin/exports"><Download size={15} /> تصدير الطلبات الحالي</a>
        </div>
        <p className="report-note" style={{ margin: 0 }}>
          أسماء الحقول في القالب هي الأسماء المرجعية للتكامل. مطابقة أسماء الأعمدة الأصلية في نسخة Onyx Pro الفعلية تُحفظ عبر ملف المطابقة بعد استلام تصدير نموذجي من تلك النسخة؛ لم نفترض أن كل منشأة تستخدم العناوين نفسها.
        </p>
      </section>
    </main>
  );
}
