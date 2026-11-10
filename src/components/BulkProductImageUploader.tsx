import { useMemo, useState } from "react";
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
  products,
  canManage,
  catalogReady,
  onUploaded,
}: {
  products: readonly ProductWithInventory[];
  canManage: boolean;
  catalogReady: boolean;
  onUploaded: (message: string) => void | Promise<void>;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [selectionError, setSelectionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<UploadResult[]>([]);

  const fileChecks = useMemo(
    () => files.map((file) => ({ file, issue: validateProductImageFile(file) })),
    [files],
  );
  const invalidFiles = fileChecks.filter((item) => item.issue);
  const validFiles = fileChecks.filter((item) => !item.issue).map((item) => item.file);
  const entries = useMemo(
    () => matchProductImagesByCode(products, validFiles),
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

  async function uploadMatchedImages() {
    if (busy || !catalogReady || readyEntries.length === 0) return;
    setBusy(true);
    setProgress(0);
    setResults([]);

    const nextResults: UploadResult[] = [];
    const primaryLinked = new Map<string, boolean>();
    let uploadedCount = 0;

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

    setBusy(false);
    setResults(nextResults);

    if (uploadedCount > 0) {
      const failedCount = nextResults.length - uploadedCount;
      await onUploaded(
        "تم ربط " + uploadedCount + " صورة بنجاح." +
        (failedCount ? " تعذّر ربط " + failedCount + " صورة؛ راجع تفاصيل الدفعة." : ""),
      );
    }
  }

  return (
    <details className="panel" style={{ marginBottom: 16 }}>
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
            disabled={busy || !catalogReady}
          />
        </label>
        {!catalogReady && <div className="privacy-note" role="status">يُتاح اختيار الصور بعد اكتمال تحميل كتالوج الأصناف بنجاح.</div>}

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
            <div style={{ maxHeight: 260, overflow: "auto", border: "1px solid var(--border, #dbe3e8)", borderRadius: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={{ textAlign: "right", padding: 8 }}>الملف</th><th style={{ textAlign: "right", padding: 8 }}>الصنف</th><th style={{ textAlign: "right", padding: 8 }}>النتيجة</th></tr></thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.file.name + entry.file.lastModified + "-" + (entry.product?.id ?? "unmatched")}>
                      <td style={{ padding: 8 }}><code>{entry.file.name}</code></td>
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
              <button type="button" className="btn primary" onClick={() => void uploadMatchedImages()} disabled={busy || !catalogReady || readyEntries.length === 0}>
                {busy ? "جارٍ رفع الصور " + progress + " / " + readyEntries.length : "رفع الصور المطابقة"}
              </button>
              <button type="button" className="btn outline" onClick={() => { setFiles([]); setResults([]); setProgress(0); }} disabled={busy}>
                مسح الدفعة
              </button>
            </div>
            {busy && (
              <div className="progress-track" aria-label="تقدم رفع الصور">
                <i style={{ width: Math.round((progress / Math.max(1, readyEntries.length)) * 100) + "%" }} />
              </div>
            )}
          </>
        )}

        {results.length > 0 && (
          <section aria-label="نتائج رفع الصور" className="panel" style={{ padding: 12 }}>
            <strong>نتائج التنفيذ</strong>
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
