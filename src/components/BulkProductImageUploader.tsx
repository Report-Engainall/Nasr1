import { useEffect, useMemo, useRef, useState } from "react";
import { uploadProductGalleryImage, uploadProductImage } from "@/lib/api";
import { toWebp, validateProductImageFile } from "@/lib/product-image";
import { matchProductImagesByCode, type ProductImageBatchEntry } from "@/lib/product-image-batch-match";
import type { ProductWithInventory } from "@/lib/types";

type UploadResult = {
  fileName: string;
  productName: string;
  placement: "primary" | "gallery";
  ok: boolean;
  message: string;
};

function csvCell(value: string): string {
  const safeText = value.replace(/[\u0000-\u001f\u007f]/gu, " ");
  const formulaSafe = /^[\s]*[=+@-]/u.test(safeText) ? "'" + safeText : safeText;
  return '"' + formulaSafe.replace(/"/g, '""') + '"';
}

/** Human-readable, locale-stable size display for the selected local file. */
export function formatProductImageFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "غير معروف";
  if (bytes < 1024) return bytes + " بايت";
  const units = ["ك.بايت", "م.بايت", "ج.بايت", "ت.بايت"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = value >= 10 ? Math.round(value) : Number(value.toFixed(1));
  return rounded + " " + units[unitIndex];
}

/**
 * Creates a local-only CSV record for the current batch result list.
 * Values are quoted and formula-leading text is neutralized before spreadsheet use.
 */
export function buildProductImageBatchReportCsv(results: readonly UploadResult[]): string {
  const headers = ["اسم الملف", "الصنف", "موضع الصورة", "الحالة", "النتيجة"];
  const rows = results.map((result) => [
    result.fileName,
    result.productName,
    imagePlacementLabel(result.placement),
    result.ok ? "نجاح" : "تعذر",
    result.message,
  ]);
  return "\uFEFF" + [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

const MAX_BATCH_FILES = 200;

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "تعذّر رفع الصورة.";
}

function imagePlacementLabel(value: "primary" | "gallery"): string {
  return value === "primary" ? "الصورة الرئيسية" : "صورة إضافية";
}

function matchStatusLabel(entry: ProductImageBatchEntry<File>): string {
  if (entry.status === "ambiguous") return "كود مكرر — مرفوض";
  if (entry.status === "gallery_limit") return "تجاوز حد المعرض";
  if (entry.status === "unmatched") return "لا يوجد صنف مطابق";
  return entry.placement === "primary" ? "الصورة الرئيسية" : "صورة إضافية";
}

export function BulkProductImageUploader({
  loadProducts,
  catalogRevision,
  canManage,
  onUploaded,
}: {
  loadProducts: () => Promise<ProductWithInventory[]>;
  catalogRevision: number;
  canManage: boolean;
  onUploaded: (message: string) => void | Promise<void>;
}) {
  const [products, setProducts] = useState<readonly ProductWithInventory[] | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const catalogRequestInFlight = useRef(false);
  const reloadAfterCurrentRequest = useRef(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [selectionError, setSelectionError] = useState("");
  const [busy, setBusy] = useState(false);
  const uploadInFlight = useRef(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<UploadResult[]>([]);

  const fileChecks = useMemo(
    () => files.map((file) => ({ file, issue: validateProductImageFile(file) })),
    [files],
  );
  const invalidFiles = fileChecks.filter((item) => item.issue);
  const validFiles = fileChecks.filter((item) => !item.issue).map((item) => item.file);
  const previewUrls = useMemo(() => {
    const urls = new Map<File, string>();
    if (typeof URL.createObjectURL !== "function") return urls;
    for (const { file, issue } of fileChecks) {
      if (!issue) urls.set(file, URL.createObjectURL(file));
    }
    return urls;
  }, [fileChecks]);
  useEffect(() => () => {
    for (const url of previewUrls.values()) URL.revokeObjectURL(url);
  }, [previewUrls]);
  const catalogReady = products !== null;
  const entries = useMemo(
    () => matchProductImagesByCode(products ?? [], validFiles),
    [products, validFiles],
  );
  const readyEntries = useMemo(
    () => entries
      .filter((entry) => entry.status === "ready")
      .sort((left, right) => {
        const productOrder = (left.product?.id ?? "").localeCompare(right.product?.id ?? "");
        if (productOrder !== 0) return productOrder;
        const placementOrder = (left.placement === "primary" ? 0 : 1) - (right.placement === "primary" ? 0 : 1);
        if (placementOrder !== 0) return placementOrder;
        return left.file.name.localeCompare(right.file.name, "en", { numeric: true, sensitivity: "base" });
      }),
    [entries],
  );
  const blockedEntries = entries.filter((entry) => entry.status !== "ready");

  async function ensureCatalog(force = false): Promise<void> {
    if (!force && products !== null) return;
    if (catalogRequestInFlight.current) {
      if (force) reloadAfterCurrentRequest.current = true;
      return;
    }

    catalogRequestInFlight.current = true;
    setCatalogLoading(true);
    setCatalogError("");
    try {
      const loaded = await loadProducts();
      if (!Array.isArray(loaded)) throw new Error("لم يؤكد الخادم اكتمال كتالوج مطابقة الصور.");
      setProducts(loaded);
    } catch (cause) {
      setCatalogError(errorMessage(cause));
    } finally {
      catalogRequestInFlight.current = false;
      setCatalogLoading(false);
      if (reloadAfterCurrentRequest.current) {
        reloadAfterCurrentRequest.current = false;
        void ensureCatalog(true);
      }
    }
  }

  useEffect(() => {
    if (catalogRevision <= 0) return;
    setProducts(null);
    setCatalogError("");
    if (detailsRef.current?.open) void ensureCatalog(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogRevision]);

  if (!canManage) return null;

  function selectFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    setResults([]);
    setProgress(0);
    if (selected.length > MAX_BATCH_FILES) {
      setFiles([]);
      setSelectionError("يسمح برفع " + MAX_BATCH_FILES + " صورة في الدفعة الواحدة كحد أقصى.");
      return;
    }
    setSelectionError("");
    setFiles(selected);
  }

  function downloadBatchReport() {
    if (results.length === 0) return;
    const blob = new Blob([buildProductImageBatchReportCsv(results)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "aghbari-product-image-batch-" + new Date().toISOString().replace(/[:.]/g, "-") + ".csv";
    link.hidden = true;
    document.body.appendChild(link);
    try {
      link.click();
    } finally {
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }

  async function uploadMatchedImages() {
    // A React state update is not synchronous between two click events. Keep a
    // ref lock as the authoritative guard so one selected batch can never start
    // two concurrent storage uploads before the next render commits.
    if (uploadInFlight.current || busy || !catalogReady || readyEntries.length === 0) return;
    uploadInFlight.current = true;
    setBusy(true);
    setProgress(0);
    setResults([]);

    const nextResults: UploadResult[] = [];
    const primaryLinked = new Map<string, boolean>();
    let uploadedCount = 0;

    try {
      for (let index = 0; index < readyEntries.length; index += 1) {
        const entry = readyEntries[index];
        const product = entry.product;
        if (!product) continue;

        const hasPrimary = primaryLinked.has(product.id)
          ? primaryLinked.get(product.id) === true
          : Boolean(product.image_url?.trim());
        const placement: "primary" | "gallery" = hasPrimary ? "gallery" : "primary";

        try {
          const webp = await toWebp(entry.file);
          if (placement === "primary") {
            await uploadProductImage(product.id, webp, product.image_url ?? null);
          } else {
            await uploadProductGalleryImage(product.id, webp);
          }
          primaryLinked.set(product.id, true);
          uploadedCount += 1;
          nextResults.push({
            fileName: entry.file.name,
            productName: product.name,
            placement,
            ok: true,
            message: "تم تحويل الصورة وربطها بالصنف.",
          });
        } catch (cause) {
          // A failed first image does not prevent the next image for this product
          // from becoming its primary image. Existing primaries are never replaced.
          if (hasPrimary) primaryLinked.set(product.id, true);
          nextResults.push({
            fileName: entry.file.name,
            productName: product.name,
            placement,
            ok: false,
            message: errorMessage(cause),
          });
        }

        setProgress(index + 1);
        setResults([...nextResults]);
      }

      setResults(nextResults);

      if (uploadedCount > 0) {
        const failedCount = nextResults.length - uploadedCount;
        await onUploaded(
          "تم ربط " + uploadedCount + " صورة بنجاح." +
          (failedCount ? " تعذّر ربط " + failedCount + " صورة؛ راجع تفاصيل الدفعة." : ""),
        );
      }
    } finally {
      uploadInFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <details ref={detailsRef} onToggle={(event) => {
      if (event.currentTarget.open) void ensureCatalog();
    }} className="panel" style={{ marginBottom: 16 }}>
      <summary style={{ cursor: "pointer", fontWeight: 800, padding: "2px 0" }}>
        محرك الصور — مطابقة ورفع صور الأصناف دفعة واحدة
      </summary>
      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        <p style={{ margin: 0, color: "var(--muted-foreground, #64748b)", lineHeight: 1.8 }}>
          سمِّ الصورة برقم الصنف نفسه مثل 000125.jpg. وللصور الإضافية استخدم 000125__2.jpg أو 000125 (3).png.
          يطابق المحرك الكود الدقيق أولًا ويحافظ على الأصفار في بداية الكود. لا يستبدل صورة رئيسية موجودة؛
          يضيف الصور الجديدة إلى المعرض، ويحوّلها إلى WebP بمقاس لا يتجاوز 1600 بكسل.
        </p>

        <label className="form-field">
          <span>اختر عدة صور (JPG / PNG / WebP)</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={selectFiles}
            disabled={busy || !catalogReady || catalogLoading || Boolean(catalogError)}
          />
        </label>
        {catalogLoading && <div className="privacy-note" role="status">جارٍ تحميل قائمة الأصناف للمطابقة الدقيقة...</div>}
        {catalogError && <div className="form-error" role="alert">{catalogError} <button type="button" className="btn outline" onClick={() => void ensureCatalog(true)}>إعادة المحاولة</button></div>}
        {!catalogReady && !catalogLoading && !catalogError && <div className="privacy-note" role="status">يُحمّل الكتالوج الكامل عند فتح هذه الأداة فقط؛ لن تُختار الصور قبل اكتمال المطابقة.</div>}

        {selectionError && <div className="form-error" role="alert">{selectionError}</div>}

        {files.length > 0 && (
          <>
            <div className="privacy-note" role="status">
              <span>
                الملفات: {files.length} — صالحة: {validFiles.length} — مطابقة جاهزة: {readyEntries.length} —
                تحتاج معالجة: {blockedEntries.length + invalidFiles.length}
              </span>
            </div>
            {invalidFiles.map(({ file, issue }) => (
              <div className="form-error" role="alert" key={file.name + file.lastModified}>
                {file.name}: {issue}
              </div>
            ))}
            <div style={{ maxHeight: 320, overflow: "auto", border: "1px solid var(--border, #dbe3e8)", borderRadius: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={{ textAlign: "right", padding: 8 }}>معاينة الملف</th><th style={{ textAlign: "right", padding: 8 }}>الصنف</th><th style={{ textAlign: "right", padding: 8 }}>النتيجة المتوقعة</th></tr></thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.file.name + entry.file.lastModified + "-" + (entry.product?.id ?? "unmatched")}>
                      <td style={{ padding: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 220 }}>
                          {previewUrls.has(entry.file)
                            ? <img src={previewUrls.get(entry.file)} alt={"معاينة " + entry.file.name} loading="lazy"
                                width={56} height={56} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }} />
                            : <span aria-hidden="true" style={{ width: 56, height: 56, display: "grid", placeItems: "center", borderRadius: 8, background: "var(--muted)" }}>صورة</span>}
                          <span style={{ display: "grid", gap: 4 }}>
                            <code dir="auto">{entry.file.name}</code>
                            <small>{formatProductImageFileSize(entry.file.size)} · {entry.file.type || "صيغة غير محددة"}</small>
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: 8 }}>{entry.product?.name ?? "—"}</td>
                      <td style={{ padding: 8 }}>
                        {entry.status === "ready" ? matchStatusLabel(entry) : entry.message ?? matchStatusLabel(entry)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button type="button" className="btn primary" onClick={() => void uploadMatchedImages()} disabled={busy || !catalogReady || catalogLoading || Boolean(catalogError) || readyEntries.length === 0}>
                {busy ? "جارٍ رفع الصور " + progress + " / " + readyEntries.length : "رفع الصور المطابقة"}
              </button>
              <button type="button" className="btn outline" onClick={() => { setFiles([]); setResults([]); setProgress(0); }} disabled={busy}>
                مسح الدفعة
              </button>
            </div>
            {busy && (
              <div
                className="progress-track"
                role="progressbar"
                aria-label="تقدم معالجة ورفع الصور"
                aria-valuemin={0}
                aria-valuemax={readyEntries.length}
                aria-valuenow={progress}
                aria-valuetext={"تمت معالجة " + progress + " من " + readyEntries.length + " صورة"}
              >
                <i aria-hidden="true" style={{ width: Math.round((progress / Math.max(1, readyEntries.length)) * 100) + "%" }} />
              </div>
            )}
          </>
        )}

        {results.length > 0 && (
          <section aria-label="نتائج رفع الصور" className="panel" style={{ padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <strong>نتائج تنفيذ الدفعة</strong>
              <span role="status" aria-live="polite">
                نجح {results.filter((result) => result.ok).length} · تعذر {results.filter((result) => !result.ok).length} · الإجمالي {results.length}
              </span>
              <button type="button" className="btn outline" onClick={downloadBatchReport}>
                تصدير نتائج الدفعة الحالية (CSV)
              </button>
            </div>
            <p className="privacy-note" style={{ margin: "8px 0 0" }}>
              هذا تقرير محلي للدفعة المعروضة فقط؛ لا ينشئ سجلاً دائماً ولا يغيّر بيانات الصور عند التصدير.
            </p>
            {results.map((result) => (
              <p key={result.fileName + "-" + result.productName} role={result.ok ? "status" : "alert"} style={{ margin: "8px 0 0", color: result.ok ? "var(--success, #16734b)" : "var(--danger, #b42318)" }}>
                {result.fileName} — {result.productName} — {imagePlacementLabel(result.placement)}: {result.message}
              </p>
            ))}
          </section>
        )}
      </div>
    </details>
  );
}
