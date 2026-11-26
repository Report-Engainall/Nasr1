import type { ProductGrossMarginFetchResult, ProductGrossMarginRow } from "@/lib/intelligence/product-gross-margin-client";

export interface ProductGrossMarginCardProps {
  result: ProductGrossMarginFetchResult | null;
  state: "loading" | "ready" | "unavailable" | "error";
  onRetry?: () => void;
}

const money = (value: number | null, currency: string | null) =>
  value === null || !currency
    ? "محجوب"
    : new Intl.NumberFormat("ar-YE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + " " + currency;

const quantity = (value: number, unit: string | null) =>
  new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 3 }).format(value) + (unit ? " " + unit : "");

const rowStatus: Record<ProductGrossMarginRow["status"], string> = {
  VERIFIED: "ربحية مثبتة",
  PARTIAL: "أدلة جزئية",
  NEEDS_REVIEW: "الربحية محجوبة",
};

export function ProductGrossMarginCard({ result, state, onRetry }: ProductGrossMarginCardProps) {
  if (state !== "ready" || !result || !result.ok) {
    const message = state === "loading"
      ? "جارٍ مطابقة الفواتير مع حركات الشحن وتكلفة دفعات الاستلام..."
      : result && !result.ok
        ? result.message
        : state === "error"
          ? "تعذر تحميل ربحية المنتجات من مصادر المؤسسة."
          : "مصدر ربحية المنتجات غير متاح؛ لم تُنشأ تكلفة أو أرباح بديلة.";
    return (
      <section dir="rtl" className="panel space-y-2" aria-label="الربحية الإجمالية حسب المنتج">
        <h2 className="font-semibold">الربحية الإجمالية حسب المنتج</h2>
        <p role={state === "error" || result && !result.ok && result.status === "DENIED" ? "alert" : "status"} className="text-sm text-muted-foreground">{message}</p>
        {onRetry ? <button type="button" className="btn secondary" onClick={onRetry}>إعادة المحاولة</button> : null}
      </section>
    );
  }

  const snapshot = result.snapshot;
  return (
    <section dir="rtl" className="panel space-y-3" aria-label="الربحية الإجمالية حسب المنتج">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">الربحية الإجمالية حسب المنتج</h2>
          <p className="report-note">إيراد سطور الفواتير الصادرة بعد الإشعارات الدائنة المرحلة، ناقص تكلفة دفعات المخزون المستهلكة في الشحنات المثبتة.</p>
        </div>
        <span className="rounded-full border px-3 py-1 text-xs">
          {snapshot.status === "VERIFIED" ? "مجتمع مكتمل" : snapshot.status === "EMPTY" ? "لا توجد فواتير" : "تغطية جزئية"}
        </span>
      </header>

      <div className="grid gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-md border p-2"><p className="text-muted-foreground">الفواتير</p><strong className="text-base">{snapshot.invoiceCount}</strong></div>
        <div className="rounded-md border p-2"><p className="text-muted-foreground">سطور الفواتير</p><strong className="text-base">{snapshot.invoiceLineCount}</strong></div>
        <div className="rounded-md border p-2"><p className="text-muted-foreground">المنتجات</p><strong className="text-base">{snapshot.productCount}</strong></div>
        <div className="rounded-md border p-2"><p className="text-muted-foreground">منتجات بربحية مثبتة</p><strong className="text-base">{snapshot.verifiedProductCount}</strong></div>
      </div>

      <p className="text-xs text-muted-foreground">
        الفترة: {snapshot.period.from} — {snapshot.period.to} · اللقطة: {snapshot.asOf} · العملة التشغيلية: {snapshot.currency}
      </p>

      {snapshot.products.length === 0 ? (
        <p role="status" className="rounded-lg border p-3 text-sm">لا توجد فواتير صادرة ضمن هذه الفترة؛ لم يتم إنشاء أرباح أو تكاليف تقديرية.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b text-right">
                <th className="p-2">المنتج</th>
                <th className="p-2">صافي الإيراد</th>
                <th className="p-2">تكلفة البضاعة</th>
                <th className="p-2">الربح الإجمالي</th>
                <th className="p-2">الهامش</th>
                <th className="p-2">الشحن</th>
                <th className="p-2">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.products.map((product) => (
                <tr key={product.productRef} className="border-b last:border-0 align-top">
                  <td className="p-2">
                    <strong>{product.productLabel}</strong>
                    <p className="text-xs text-muted-foreground">{product.productRef}</p>
                    <p className="text-xs text-muted-foreground">{product.invoiceCount} فاتورة · {product.invoiceLineCount} سطر</p>
                  </td>
                  <td className="p-2 font-medium">{money(product.netRevenue, product.currency)}</td>
                  <td className="p-2">{product.status === "VERIFIED" ? money(product.costOfGoodsSold, product.currency) : "محجوب"}</td>
                  <td className="p-2 font-semibold">{product.status === "VERIFIED" ? money(product.grossProfit, product.currency) : "محجوب"}</td>
                  <td className="p-2">{product.status === "VERIFIED" && product.grossMarginPercent !== null ? product.grossMarginPercent.toFixed(2) + "%" : "محجوب"}</td>
                  <td className="p-2">
                    <p>{quantity(product.actualShippedQuantity, product.unitOfMeasure)}</p>
                    <p className="text-xs text-muted-foreground">{product.saleMovementCount} حركة · {product.uncostedMovementCount} بلا تكلفة</p>
                  </td>
                  <td className="p-2">
                    <span className="text-xs">{rowStatus[product.status]}</span>
                    {product.hasReturns ? <p className="text-xs text-muted-foreground">يوجد مرتجع</p> : null}
                    {product.warnings.length ? (
                      <details className="mt-1 max-w-[220px] text-xs">
                        <summary className="cursor-pointer text-muted-foreground">حدود المصدر ({product.warnings.length})</summary>
                        <ul className="mt-1 list-disc space-y-1 ps-4">
                          {product.warnings.map(warning => <li key={warning}>{warning}</li>)}
                        </ul>
                      </details>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-lg border p-3 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground">حدود هذا المؤشر</p>
        <p>الربح الإجمالي = صافي قيمة الفاتورة دون الضريبة − تكلفة دفعات المخزون التي خرجت فعلياً بالشحن. لا يمثل صافي ربح الشركة.</p>
        <p className="mt-1">تُحجب ربحية المنتج عند وجود مرتجع مادي أو إشعار دائن، أو تكلفة دفعة غير منسوبة لاستلام شراء موثق، أو اختلاف وحدة/كمية أو عملة. لا تشمل المعادلة الشحن الخارجي أو المصاريف أو التكاليف التشغيلية.</p>
        <p className="mt-1">صيغة المصدر: {snapshot.formulaId}@{snapshot.formulaVersion} · {snapshot.formulaDescription}</p>
      </div>
      {onRetry ? <button type="button" className="btn secondary" onClick={onRetry}>تحديث الربحية</button> : null}
    </section>
  );
}
