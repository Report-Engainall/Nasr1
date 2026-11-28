import type { DemandForecastResult } from "./demand-forecast";
import type { DeadStockReport } from "./dead-stock";
import type { ReplenishmentRecommendation } from "./replenishment";

export type IntelligenceCsvCell = string | number | boolean | null | undefined;

function csvCell(value: IntelligenceCsvCell): string {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  const text = String(value ?? "").replace(/\r\n?/g, "\n");
  const protectedText = /^[\s\u0000-\u001f]*[=+\-@]/.test(text) ? "'" + text : text;
  return '"' + protectedText.replace(/"/g, '""') + '"';
}

/** UTF-8 BOM and CRLF make the exported Arabic sheet open predictably in spreadsheet tools. */
export function serializeIntelligenceCsv(rows: readonly (readonly IntelligenceCsvCell[])[]): string {
  return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function buildDemandForecastCsv(result: DemandForecastResult): string {
  const headers = [
    "نوع السجل", "معرف الإشارة", "مرجع المنتج", "اسم المنتج", "حالة المصدر", "اتجاه الطلب", "وحدة القياس",
    "الفترة الحالية من", "الفترة الحالية إلى", "فترة الأساس من", "فترة الأساس إلى", "وقت اللقطة",
    "معدل الطلب الحالي يومياً", "معدل الطلب الأساسي يومياً", "التغير بالمئة",
    "طلبات العينة الحالية", "طلبات عينة الأساس",
    "7 أيام منخفض", "7 أيام أساسي", "7 أيام مرتفع",
    "30 يوماً منخفض", "30 يوماً أساسي", "30 يوماً مرتفع",
    "90 يوماً منخفض", "90 يوماً أساسي", "90 يوماً مرتفع",
    "معرفات الأدلة", "مفاتيح المؤشرات", "إصدارات المعادلات", "التحذيرات أو سبب الحجب",
  ];
  const forecasts = result.forecasts.map(item => {
    const horizon = (days: 7 | 30 | 90) => item.horizons.find(value => value.days === days);
    const seven = horizon(7);
    const thirty = horizon(30);
    const ninety = horizon(90);
    return [
      "FORECAST", "", item.productRef, item.productLabel, result.status, item.trend, item.unitOfMeasure,
      item.period.from, item.period.to, item.baselinePeriod.from, item.baselinePeriod.to, item.asOf,
      item.currentDailyDemand, item.baselineDailyDemand,
      item.changePercentHundredths === null ? null : item.changePercentHundredths / 100,
      item.currentOrders, item.baselineOrders,
      seven?.lowQuantity ?? null, seven?.expectedQuantity ?? null, seven?.highQuantity ?? null,
      thirty?.lowQuantity ?? null, thirty?.expectedQuantity ?? null, thirty?.highQuantity ?? null,
      ninety?.lowQuantity ?? null, ninety?.expectedQuantity ?? null, ninety?.highQuantity ?? null,
      item.evidenceIds.join(" | "), item.metricKeys.join(" | "), item.formulaVersions.join(" | "),
      item.warnings.join(" | "),
    ] satisfies IntelligenceCsvCell[];
  });
  const withheld = result.withheld.map(item => [
    "WITHHELD", item.signalId, item.productRef, "", "WITHHELD", "", "",
    result.period.from, result.period.to, result.baselinePeriod.from, result.baselinePeriod.to, result.asOf,
    null, null, null, null, null, null, null, null, null, null, null, null, null, null,
    "", "", "", item.reason,
  ] satisfies IntelligenceCsvCell[]);
  return serializeIntelligenceCsv([
    ["تقرير", "توقع الطلب حسب المنتج"],
    ["حالة المصدر", result.status],
    ["اكتمال مجتمع المنتجات", result.completePopulation ? "نعم" : "لا"],
    ["وقت اللقطة", result.asOf],
    ["الفترة الحالية", result.period.from, result.period.to],
    ["فترة الأساس", result.baselinePeriod.from, result.baselinePeriod.to],
    ["توقعات محسوبة", result.forecasts.length],
    ["سجلات محجوبة", result.withheld.length],
    ["حدود التوقع", "متوسط يومي حتمي من فترتين متجاورتين؛ السيناريوهات نطاقات مرصودة وليست فواصل ثقة."],
    [],
    headers,
    ...forecasts,
    ...withheld,
  ]);
}

export function buildReplenishmentCsv(
  recommendations: readonly ReplenishmentRecommendation[],
  productNames: Readonly<Record<string, string>> = {},
  loadedCount = recommendations.length,
): string {
  const safeLoadedCount = Number.isSafeInteger(loadedCount) && loadedCount >= recommendations.length
    ? loadedCount
    : recommendations.length;
  const rows = recommendations.map(item => [
    item.productRef,
    productNames[item.productRef] ?? "",
    item.status,
    item.action,
    item.demandSource,
    item.demandTrend ?? "",
    item.quantityUnit ?? "",
    item.availableToPromise,
    item.reorderPoint,
    item.incomingPurchaseQuantity,
    item.coveredAfterIncoming,
    item.dailyDemand,
    item.leadTimeDemand,
    item.targetStock,
    item.recommendedQuantity,
    item.forecastLeadTimeDemand?.horizonDays ?? null,
    item.forecastLeadTimeDemand?.lowQuantity ?? null,
    item.forecastLeadTimeDemand?.expectedQuantity ?? null,
    item.forecastLeadTimeDemand?.highQuantity ?? null,
    item.formulaId,
    item.formulaVersion,
    item.evidenceIds.join(" | "),
    item.forecastEvidenceIds.join(" | "),
    item.forecastMetricKeys.join(" | "),
    item.forecastFormulaVersions.join(" | "),
    item.automaticPurchase,
    item.warnings.join(" | "),
  ] satisfies IntelligenceCsvCell[]);
  return serializeIntelligenceCsv([
    ["تقرير", "توصيات إعادة التوريد"],
    ["عدد التوصيات المحملة", safeLoadedCount],
    ["عدد النتائج المصدرة بعد المرشحات", recommendations.length],
    ["تغطية المصدر", "يضم الملف كل النتائج المحملة المطابقة للمرشحات؛ لا يقدم عقد المصدر إجمالي السجلات التي لم تُحمّل."],
    ["ضابط التنفيذ", "التوصية لا تنشئ أمر شراء تلقائياً؛ المسودة تحتاج مراجعة واعتماداً منفصلين."],
    [],
    [
      "مرجع المنتج", "اسم المنتج", "حالة الدليل", "الإجراء", "أساس الطلب", "اتجاه الطلب", "الوحدة",
      "المتاح للبيع", "نقطة إعادة الطلب", "الوارد المؤكد", "التغطية بعد الوارد", "الطلب اليومي",
      "طلب مهلة المورد", "المخزون المستهدف", "الكمية الموصى بها", "أفق التوقع المستخدم بالأيام",
      "التوقع المنخفض لمهلة المورد", "التوقع الأساسي لمهلة المورد", "التوقع المرتفع لمهلة المورد",
      "المعادلة", "إصدار المعادلة", "أدلة التوصية", "أدلة التوقع", "مفاتيح مؤشرات التوقع",
      "إصدارات معادلات التوقع", "الشراء التلقائي", "التحذيرات",
    ],
    ...rows,
  ]);
}

export function downloadIntelligenceCsv(contents: string, filename: string): void {
  const blob = new Blob([contents], { type: "text/csv;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  }
}

/** Export stock-movement observations and financial exposure without cross-currency conversion. */
export function buildDeadStockCsv(report: DeadStockReport): string {
  const itemRows = report.items.map(item => [
    "PRODUCT",
    item.productRef,
    item.classification,
    item.daysSinceMovement,
    item.lowTurnover,
    item.turnoverRatio,
    item.availableQuantity,
    item.unitCost,
    item.currency,
    item.financialExposure,
    item.exposureStatus,
    item.movementStatus,
    item.formulaId,
    item.formulaVersion,
    item.evidenceIds.join(" | "),
    item.warnings.join(" | "),
  ] satisfies IntelligenceCsvCell[]);
  const currencyRows = report.totalsByCurrency.map(total => [
    "CURRENCY_TOTAL",
    "",
    "",
    null,
    null,
    null,
    null,
    null,
    total.currency,
    total.exposure,
    "VERIFIED_ITEMS:" + total.verifiedItems,
    "WITHHELD_ITEMS:" + total.withheldItems,
    "",
    "",
    "",
    "",
  ] satisfies IntelligenceCsvCell[]);
  return serializeIntelligenceCsv([
    ["تقرير", "حركة المخزون والأصناف الراكدة"],
    ["حالة التقرير", report.status],
    ["وقت اللقطة", report.asOf],
    ["الفترة", report.period.from, report.period.to],
    ["قاعدة التصنيف", report.ruleId + "@" + report.ruleVersion],
    ["عدد الأصناف", report.items.length],
    ["ضابط التعرض المالي", "لا يصدر تعرض مالي إلا إذا كانت التكلفة والعملة مثبتتين؛ القيم غير المتاحة تبقى فارغة."],
    ["ضابط العملات", "إجماليات العملات أسطر مستقلة؛ لا يتم تحويل أو جمع عملات مختلفة."],
    [],
    [
      "نوع السطر", "مرجع المنتج", "التصنيف", "الأيام منذ آخر حركة", "دوران منخفض",
      "معدل الدوران", "الكمية المتاحة", "تكلفة الوحدة", "العملة", "التعرض المالي المثبت",
      "حالة التكلفة", "حالة الحركة", "المعادلة", "إصدار المعادلة", "مراجع الإثبات", "التحذيرات",
    ],
    ...itemRows,
    ...currencyRows,
    ...(report.warnings.length ? [["REPORT_WARNINGS", "", "", null, null, null, null, null, "", null, "", "", "", "", "", report.warnings.join(" | ")] as IntelligenceCsvCell[]] : []),
  ]);
}
