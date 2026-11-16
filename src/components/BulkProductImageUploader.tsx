import { useEffect, useMemo, useRef, useState } from "react";
import { uploadProductGalleryImage, uploadProductImage } from "@/lib/api";
import { toWebp, validateProductImageFile } from "@/lib/product-image";
import { matchProductImagesByCode, type ProductImageBatchEntry } from "@/lib/product-image-batch-match";
import type { ProductWithInventory } from "@/lib/types";

type UploadResult = {
  file: File;
  productId: string;
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

function hasPrimaryProductImage(product: ProductWithInventory): boolean {
  return typeof product.image_url === "string" && /^https:\/\//i.test(product.image_url.trim());
}

export function getProductsMissingPrimaryImage(
  products: readonly ProductWithInventory[],
): ProductWithInventory[] {
  return products
    .filter((product) => !hasPrimaryProductImage(product))
    .slice()
    .sort((left, right) =>
      left.item_code.localeCompare(right.item_code, "en", { numeric: true, sensitivity: "base" }),
    );
}

export function getProductImageCoverage(products: readonly ProductWithInventory[]) {
  const primaryImageCount = products.filter(hasPrimaryProductImage).length;
  const galleryImageCount = products.reduce((total, product) => {
    const urls = Array.isArray(product.image_gallery_urls)
      ? new Set(product.image_gallery_urls.filter((url) => typeof url === "string" && /^https:\/\//i.test(url.trim())))
      : new Set<string>();
    return total + urls.size;
  }, 0);
  return {
    totalProducts: products.length,
    primaryImageCount,
    missingPrimaryCount: products.length - primaryImageCount,
    galleryImageCount,
    completionPercentage: products.length === 0
      ? null
      : Math.round((primaryImageCount / products.length) * 100),
  };
}

export function buildMissingProductImagesCsv(
  products: readonly ProductWithInventory[],
): string {
  const headers = ["رمز الصنف", "اسم الصنف", "التصنيف", "عدد الصور الإضافية"];
  const rows = getProductsMissingPrimaryImage(products).map((product) => [
    product.item_code,
    product.name,
    product.category?.name ?? "",
    String(Array.isArray(product.image_gallery_urls) ? product.image_gallery_urls.length : 0),
  ]);
  return "\uFEFF" + [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
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
  onOpenProduct,
}: {
  loadProducts: () => Promise<ProductWithInventory[]>;
  catalogRevision: number;
  canManage: boolean;
  onUploaded: (message: string) => void | Promise<void>;
  onOpenProduct?: (product: ProductWithInventory) => void;
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
  const [progressTotal, setProgressTotal] = useState(0);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [missingQuery, setMissingQuery] = useState("");
  const [directImageFiles, setDirectImageFiles] = useState<Record<string, File>>({});
  const [directImageErrors, setDirectImageErrors] = useState<Record<string, string>>({});
  const [directUploadBusyId, setDirectUploadBusyId] = useState<string | null>(null);
  const directUploadInFlight = useRef(false);

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
  const retryableEntryCount = readyEntries.filter((entry) =>
    results.some((result) => result.file === entry.file && !result.ok),
  ).length;
  const imageCoverage = useMemo(
    () => getProductImageCoverage(products ?? []),
    [products],
  );
  const missingPrimaryProducts = useMemo(
    () => getProductsMissingPrimaryImage(products ?? []),
    [products],
  );
  const filteredMissingProducts = useMemo(() => {
    const query = missingQuery.trim().toLocaleLowerCase("ar-YE");
    if (!query) return missingPrimaryProducts;
    return missingPrimaryProducts.filter((product) =>
      [product.name, product.item_code, product.sku ?? "", product.barcode ?? "", product.category?.name ?? ""]
        .some((value) => value.toLocaleLowerCase("ar-YE").includes(query)),
    );
  }, [missingPrimaryProducts, missingQuery]);

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

  function downloadMissingProductsReport() {
    if (!products || missingPrimaryProducts.length === 0) return;
    const blob = new Blob([buildMissingProductImagesCsv(products)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "aghbari-products-missing-primary-images-" + new Date().toISOString().replace(/[:.]/g, "-") + ".csv";
    link.hidden = true;
    document.body.appendChild(link);
    try {
      link.click();
    } finally {
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }

  function chooseMissingPrimaryImage(productId: string, file: File | null) {
    setDirectImageErrors((current) => ({ ...current, [productId]: "" }));
    if (!file) {
      setDirectImageFiles((current) => {
        const next = { ...current };
        delete next[productId];
        return next;
      });
      return;
    }
    const issue = validateProductImageFile(file);
    if (issue) {
      setDirectImageFiles((current) => {
        const next = { ...current };
        delete next[productId];
        return next;
      });
      setDirectImageErrors((current) => ({ ...current, [productId]: issue }));
      return;
    }
    setDirectImageFiles((current) => ({ ...current, [productId]: file }));
  }

  async function uploadMissingPrimaryImage(product: ProductWithInventory) {
    const file = directImageFiles[product.id];
    if (!file || busy || directUploadBusyId || directUploadInFlight.current || hasPrimaryProductImage(product)) return;
    directUploadInFlight.current = true;
    setDirectUploadBusyId(product.id);
    setDirectImageErrors((current) => ({ ...current, [product.id]: "" }));
    try {
      const publicUrl = await uploadProductImage(product.id, await toWebp(file), null);
      if (typeof publicUrl !== "string" || !/^https:\/\//i.test(publicUrl)) {
        throw new Error("لم يرجع الخادم رابط صورة رئيسية آمناً.");
      }
      setProducts((current) => current?.map((item) =>
        item.id === product.id ? { ...item, image_url: publicUrl } : item,
      ) ?? current);
      setDirectImageFiles((current) => {
        const next = { ...current };
        delete next[product.id];
        return next;
      });
      try {
        await onUploaded("تم ربط الصورة الرئيسية بالصنف " + product.name + " بنجاح.");
      } catch (cause) {
        setDirectImageErrors((current) => ({
          ...current,
          [product.id]: "تم ربط الصورة بنجاح، لكن تعذر تحديث قائمة الكتالوج: " + errorMessage(cause),
        }));
      }
    } catch (cause) {
      setDirectImageErrors((current) => ({
        ...current,
        [product.id]: errorMessage(cause),
      }));
    } finally {
      directUploadInFlight.current = false;
      setDirectUploadBusyId(null);
    }
  }

  function selectFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    setResults([]);
    setProgress(0);
    setProgressTotal(0);
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
    if (uploadInFlight.current || busy || directUploadBusyId || !catalogReady || readyEntries.length === 0) return;

    // Successful files are immutable batch results. A retry must never upload them
    // again, even when a product has several gallery images.
    const nextResults: UploadResult[] = [...results];
    const previouslyUploaded = new Set(
      nextResults.filter((result) => result.ok).map((result) => result.file),
    );
    const entriesToUpload = readyEntries.filter((entry) => !previouslyUploaded.has(entry.file));
    if (entriesToUpload.length === 0) return;

    uploadInFlight.current = true;
    setBusy(true);
    setProgress(0);
    setProgressTotal(entriesToUpload.length);

    const primaryLinked = new Map<string, boolean>();
    for (const result of nextResults) {
      if (result.ok && result.placement === "primary") {
        primaryLinked.set(result.productId, true);
      }
    }
    let uploadedCount = 0;

    const saveResult = (result: UploadResult) => {
      const existingIndex = nextResults.findIndex((item) => item.file === result.file);
      if (existingIndex >= 0) nextResults[existingIndex] = result;
      else nextResults.push(result);
      setResults([...nextResults]);
    };

    try {
      for (let index = 0; index < entriesToUpload.length; index += 1) {
        const entry = entriesToUpload[index];
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
          saveResult({
            file: entry.file,
            productId: product.id,
            fileName: entry.file.name,
            productName: product.name,
            placement,
            ok: true,
            message: "تم تحويل الصورة وربطها بالصنف.",
          });
        } catch (cause) {
          // If an earlier file for this product succeeded as primary, only a
          // failed later file is retried as gallery; never replace that primary.
          if (hasPrimary) primaryLinked.set(product.id, true);
          saveResult({
            file: entry.file,
            productId: product.id,
            fileName: entry.file.name,
            productName: product.name,
            placement,
            ok: false,
            message: errorMessage(cause),
          });
        }

        setProgress(index + 1);
      }

      const totalUploaded = nextResults.filter((result) => result.ok).length;
      const failedCount = nextResults.filter((result) => !result.ok).length;
      if (uploadedCount > 0) {
        await onUploaded(
          "تم ربط " + totalUploaded + " صورة بنجاح." +
          (failedCount ? " تعذّر ربط " + failedCount + " صورة؛ أعد محاولة الملفات المتعثرة فقط." : ""),
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

        {catalogReady && (
          <section aria-label="اكتمال صور الكتالوج" className="panel" style={{ display: "grid", gap: 12, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <strong>تغطية الصور الرئيسية</strong>
              <span className="badge badge-info">
                {imageCoverage.completionPercentage === null ? "غير متاح" : imageCoverage.completionPercentage + "% مكتمل"}
              </span>
            </div>
            <div role="group" aria-label="مؤشرات صور الكتالوج" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8 }}>
              <div className="privacy-note"><span>إجمالي الأصناف</span><strong aria-label="إجمالي الأصناف">{imageCoverage.totalProducts.toLocaleString("ar-YE")}</strong></div>
              <div className="privacy-note"><span>بصورة رئيسية</span><strong aria-label="الأصناف ذات صورة رئيسية">{imageCoverage.primaryImageCount.toLocaleString("ar-YE")}</strong></div>
              <div className="privacy-note"><span>بلا صورة رئيسية</span><strong aria-label="عدد الأصناف بلا صورة رئيسية">{imageCoverage.missingPrimaryCount.toLocaleString("ar-YE")}</strong></div>
              <div className="privacy-note"><span>صور إضافية في المعارض</span><strong aria-label="إجمالي الصور الإضافية">{imageCoverage.galleryImageCount.toLocaleString("ar-YE")}</strong></div>
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6, fontSize: 12 }}>
                <span>اكتمال الصور الرئيسية</span>
                <span>{imageCoverage.completionPercentage === null ? "غير متاح" : imageCoverage.completionPercentage + "%"}</span>
              </div>
              <div className="progress-track" role="progressbar" aria-label="نسبة اكتمال الصور الرئيسية" aria-valuemin={0} aria-valuemax={100} aria-valuenow={imageCoverage.completionPercentage ?? 0}>
                <i aria-hidden="true" style={{ width: (imageCoverage.completionPercentage ?? 0) + "%" }} />
              </div>
            </div>
            {missingPrimaryProducts.length > 0 ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <strong>أصناف تحتاج صورة رئيسية ({missingPrimaryProducts.length.toLocaleString("ar-YE")})</strong>
                  <button type="button" className="btn outline" onClick={downloadMissingProductsReport}>تصدير قائمة الأصناف بلا صورة (CSV)</button>
                </div>
                <label className="form-field">
                  <span>ابحث في الأصناف التي بلا صورة</span>
                  <input type="search" aria-label="البحث في الأصناف بلا صورة" value={missingQuery} onChange={(event) => setMissingQuery(event.currentTarget.value)} placeholder="اسم الصنف أو الكود أو التصنيف..." />
                </label>
                <div style={{ display: "grid", gap: 8, maxHeight: 420, overflow: "auto" }}>
                  {filteredMissingProducts.length === 0 ? (
                    <div className="privacy-note" role="status">لا توجد أصناف تطابق البحث الحالي.</div>
                  ) : filteredMissingProducts.map((product) => (
                    <article key={product.id} className="panel" style={{ padding: 10, display: "grid", gap: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                        <div style={{ display: "grid", gap: 3 }}>
                          <strong>{product.name}</strong>
                          <small>رمز الصنف: <code dir="auto">{product.item_code}</code> · {product.category?.name ?? "غير مصنف"}</small>
                        </div>
                        <span className="badge badge-warning">بلا صورة رئيسية</span>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
                        <label className="form-field" style={{ flex: "1 1 220px", margin: 0 }}>
                          <span>اختيار صورة رئيسية</span>
                          <input type="file" accept="image/jpeg,image/png,image/webp"
                            aria-label={"اختيار صورة رئيسية للصنف " + product.name}
                            disabled={busy || Boolean(directUploadBusyId)}
                            onChange={(event) => { chooseMissingPrimaryImage(product.id, event.currentTarget.files?.[0] ?? null); event.currentTarget.value = ""; }} />
                        </label>
                        <button type="button" className="btn primary"
                          aria-label={"رفع كصورة رئيسية للصنف " + product.name}
                          disabled={busy || Boolean(directUploadBusyId) || !directImageFiles[product.id]}
                          onClick={() => void uploadMissingPrimaryImage(product)}>
                          {directUploadBusyId === product.id ? "جارٍ رفع الصورة..." : "ربط الصورة الرئيسية"}
                        </button>
                        {onOpenProduct && (
                          <button type="button" className="btn outline"
                            aria-label={"فتح تحرير الصنف " + product.name}
                            onClick={() => onOpenProduct(product)}>
                            فتح تحرير الصنف
                          </button>
                        )}
                      </div>
                      {directImageErrors[product.id] && <div className="form-error" role="alert">{directImageErrors[product.id]}</div>}
                    </article>
                  ))}
                </div>
              </>
            ) : imageCoverage.totalProducts > 0 ? (
              <div className="privacy-note" role="status">كل الأصناف المحمّلة لديها صورة رئيسية صالحة.</div>
            ) : (
              <div className="privacy-note" role="status">لا توجد أصناف في الكتالوج المحمّل حاليًا.</div>
            )}
          </section>
        )}

        <label className="form-field">
          <span>اختر عدة صور (JPG / PNG / WebP)</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={selectFiles}
            disabled={busy || Boolean(directUploadBusyId) || !catalogReady || catalogLoading || Boolean(catalogError)}
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
              <button type="button" className="btn primary" onClick={() => void uploadMatchedImages()} disabled={busy || !catalogReady || catalogLoading || Boolean(catalogError) || readyEntries.length === 0 || (results.length > 0 && retryableEntryCount === 0)}>
                {busy
                  ? "جارٍ رفع الصور " + progress + " / " + progressTotal
                  : retryableEntryCount > 0
                    ? "إعادة محاولة الصور الفاشلة (" + retryableEntryCount + ")"
                    : results.length > 0
                      ? "اكتمل رفع الصور"
                      : "رفع الصور المطابقة"}
              </button>
              <button type="button" className="btn outline" onClick={() => { setFiles([]); setResults([]); setProgress(0); setProgressTotal(0); }} disabled={busy}>
                مسح الدفعة
              </button>
            </div>
            {busy && (
              <div
                className="progress-track"
                role="progressbar"
                aria-label="تقدم معالجة ورفع الصور"
                aria-valuemin={0}
                aria-valuemax={progressTotal || readyEntries.length}
                aria-valuenow={progress}
                aria-valuetext={"تمت معالجة " + progress + " من " + (progressTotal || readyEntries.length) + " صورة"}
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
