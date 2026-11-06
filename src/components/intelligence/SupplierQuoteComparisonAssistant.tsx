import type { SupplierQuoteComparisonAssistantResult } from "@/lib/intelligence/supplier-quote-comparison-assistant";

const number = new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 2 });
const count = new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 0 });

function amount(value: number, currency: string): string {
  return number.format(value) + " " + currency;
}

const withheldLabels: Record<string, string> = {
  UNIT_MISSING: "وحدة القياس غير محددة",
  PRODUCT_SNAPSHOT_MISMATCH: "لقطة اسم أو رمز الصنف غير متطابقة",
  LINE_TOTAL_MISMATCH: "إجمالي السطر لا يطابق الكمية × تكلفة الوحدة",
  INSUFFICIENT_DISTINCT_SUPPLIERS: "لا يوجد عرضان من موردين مختلفين على أساس مقارنة واحد",
};

export function SupplierQuoteComparisonAssistant({
  result,
}: {
  result: SupplierQuoteComparisonAssistantResult;
}) {
  return (
    <section dir="rtl" className="space-y-3 rounded-xl border p-3" aria-label="مقارنة عروض الموردين">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">مقارنة عروض الموردين المحفوظة</h3>
        <span className="rounded-full border px-2 py-1 text-xs">
          {result.state === "EMPTY" ? "لا توجد عروض" : result.state === "PARTIAL" ? "نطاق جزئي — حد 200 عرض" : "النطاق المعاد كامل"}
        </span>
      </header>
      <p className="text-sm">{result.answer}</p>
      <p className="text-xs text-muted-foreground">
        المصدر: {result.sourceRpc} · وقت طلب القراءة: {new Date(result.queriedAt).toLocaleString("ar-YE")}
        · العروض المعادة: {count.format(result.quoteCount)}
        · المستلمة: {count.format(result.quoteCounts.received)}
        · المرسّاة: {count.format(result.quoteCounts.awarded)}
        · المنتهية: {count.format(result.quoteCounts.expired)}
      </p>

      {result.comparisons.map((item) => (
        <article key={item.key} className="space-y-2 rounded-lg border p-3">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="font-semibold">{item.productName}</h4>
              <p className="text-xs text-muted-foreground">{item.itemCode} · {count.format(item.quantity)} {item.unit}</p>
            </div>
            <span className="text-xs">{count.format(item.offerCount)} موردين · العملة {item.currency}</span>
          </header>
          <ol className="space-y-1">
            {item.offers.map((offer, index) => (
              <li key={offer.quoteNumber + ":" + offer.supplierName} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-2 py-2 text-sm">
                <span>
                  <strong>{offer.supplierName}</strong>
                  <span className="ms-2 text-xs text-muted-foreground">عرض {offer.quoteNumber}</span>
                  {index === 0 ? <span className="ms-2 text-xs">أقل تكلفة وحدة مسجلة</span> : null}
                </span>
                <strong className="tabular-nums">{amount(offer.unitCost, item.currency)}</strong>
              </li>
            ))}
          </ol>
          {item.omittedOfferCount > 0 ? (
            <p className="text-xs text-muted-foreground">عُرضت أفضل 10 أسعار وحدة فقط من أصل {count.format(item.offerCount)} عرض.</p>
          ) : null}
          {item.secondLowestUnitCost !== null ? (
            <p className="text-xs text-muted-foreground">
              الفارق بين أقل تكلفة والثانية: {amount(item.differenceToNextUnitCost ?? 0, item.currency)} لكل وحدة على هذا الأساس فقط.
            </p>
          ) : null}
        </article>
      ))}

      {result.comparisonGroupCount === 0 ? (
        <p className="rounded-lg border p-3 text-sm text-muted-foreground">لا توجد مجموعة سعرية مؤهلة للمقارنة حالياً؛ لم تُعرض عروض غير متوافقة كأنها قابلة للمقارنة.</p>
      ) : null}
      {result.withheldGroupCount > 0 ? (
        <section className="space-y-2 rounded-lg border p-3">
          <h4 className="text-sm font-semibold">مجموعات حُجبت عن المقارنة ({count.format(result.withheldGroupCount)})</h4>
          {result.withheld.map((item) => (
            <p key={item.key} className="text-xs text-muted-foreground">
              {item.productName} · {item.itemCode}: {withheldLabels[item.reason] ?? "أساس المقارنة غير مكتمل"}
            </p>
          ))}
          {result.withheldGroupCount > result.withheld.length ? (
            <p className="text-xs text-muted-foreground">توجد مجموعات أخرى محجوبة لم تُعرض هنا.</p>
          ) : null}
        </section>
      ) : null}
      {result.comparisonsTruncated ? (
        <p className="text-xs text-muted-foreground">عُرضت أول 20 مجموعة مقارنة من أصل {count.format(result.comparisonGroupCount)}.</p>
      ) : null}
      {result.warnings.map((warning) => (
        <p key={warning} className="text-xs text-muted-foreground">
          {warning.startsWith("SOURCE_LIMIT_REACHED")
            ? "تنبيه تغطية: الخدمة تعيد أحدث 200 عرض فقط ولا تعيد إجمالي السجل أو مؤشراً للصفحات السابقة."
            : warning.startsWith("NON_COMPARABLE_OFFERS_WITHHELD")
              ? "حُجبت المقارنات غير المتطابقة في الكمية أو الوحدة أو العملة أو لقطة الصنف أو إجمالي السطر."
              : "توجد مجموعات إضافية لم تظهر في هذه الصفحة."}
        </p>
      ))}
      <p className="text-xs text-muted-foreground">
        هذه مقارنة لتكلفة الوحدة المسجلة على المنتج والكمية والوحدة والعملة نفسها فقط. لا تقيم مدة التوريد أو شروط الدفع أو جودة المورد، ولا تختار عرضاً ولا تنشئ أمر شراء.
      </p>
    </section>
  );
}
