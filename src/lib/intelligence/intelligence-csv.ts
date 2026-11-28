import type { DemandForecastResult } from "./demand-forecast";
import type { DeadStockReport } from "./dead-stock";
import type { ReplenishmentRecommendation } from "./replenishment";
import type { SupplierPerformanceResult } from "./supplier-performance";
import type { ProcessBottleneckResult } from "./process-bottlenecks";

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

export function buildSupplierPerformanceCsv(result: SupplierPerformanceResult, suppliers = result.suppliers): string {
  const supplierRows = suppliers.map(supplier => [
    "SUPPLIER", supplier.supplierId, supplier.supplierName, supplier.supplierCode,
    supplier.purchaseOrderCount, supplier.completedOrderCount, supplier.openOrderCount,
    supplier.inconsistentReceivedCount, supplier.backlogLineCount, supplier.leadTimeSampleCount,
    supplier.averageLeadDays, supplier.medianLeadDays, supplier.p90LeadDays,
    supplier.promisedDeliverySampleCount, supplier.onTimeCount, supplier.onTimePercent,
    supplier.completedWithoutPromiseCount, "", "", "", "", null, null, null, null, null, null,
  ] satisfies IntelligenceCsvCell[]);
  const orderRows = suppliers.flatMap(supplier => supplier.recentOrders.map(order => [
    "PURCHASE_ORDER", supplier.supplierId, supplier.supplierName, supplier.supplierCode,
    "", "", order.status, "", order.pendingLineCount, "", null, null, null,
    order.promisedDeliveryDays === null ? 0 : 1, order.onTime === true ? 1 : 0, null, "",
    order.purchaseOrderId, order.purchaseOrderNumber, order.submittedAt, order.lastReceivedAt,
    order.lineCount, order.pendingLineCount, order.receiptCount, order.actualLeadDays,
    order.promisedDeliveryDays, order.onTime,
  ] satisfies IntelligenceCsvCell[]));
  return serializeIntelligenceCsv([
    ["تقرير", "أداء الموردين والتزام التوريد"],
    ["الفترة", result.period.from, result.period.to, "UTC"],
    ["وقت اللقطة", result.asOf],
    ["حالة التغطية", result.state],
    ["الموردون المحملون", suppliers.length],
    ["الموردون المعادون من المصدر", result.returnedSupplierCount],
    ["إجمالي الموردين المعروف للمصدر", result.totalSupplierCount],
    ["اكتمال المجتمع", result.completePopulation ? "نعم" : "لا"],
    ["ملاحظة التغطية", result.completePopulation ? "القائمة كاملة حسب عقد المصدر." : "الملف يضم الموردين المحملين فقط؛ توجد سجلات موردين خارج حد المصدر."],
    ["حدود القياس", "زمن التوريد والالتزام بالموعد يعتمدان على العينات المؤهلة؛ قلة العينة لا تُحوّل إلى تقييم."],
    ["حدود البيانات", "لا يتضمن الملف أسعار الشراء أو أرصدة الموردين أو المدفوعات أو تصنيف جودة غير موجود في المصدر."],
    [],
    ["نوع السطر","معرف المورد","اسم المورد","رمز المورد","أوامر الشراء","مكتمل الاستلام","مفتوح","استلام غير متسق",
      "سطور معلقة","عينة زمن التوريد","متوسط التوريد بالأيام","وسيط التوريد بالأيام","P90 التوريد بالأيام",
      "عينة الموعد الموعود","عدد الالتزام بالموعد","نسبة الالتزام بالمئة","مكتمل بلا موعد موعود",
      "معرف أمر الشراء","رقم أمر الشراء","تاريخ الإرسال","آخر استلام","عدد السطور","سطور متبقية",
      "عدد سندات الاستلام","زمن التوريد الفعلي بالأيام","المدة الموعودة بالأيام","ضمن الموعد"],
    ...supplierRows, ...orderRows,
    ...(result.withheldReasons.length ? [["SOURCE_CAVEAT","","","",null,null,null,null,null,null,null,null,null,null,null,null,"","","","","",null,null,null,null,null,result.withheldReasons.join(" | ")] as IntelligenceCsvCell[]] : []),
  ]);
}

export function buildProcessBottlenecksCsv(result: ProcessBottleneckResult): string {
  const queueRows = result.queues.map(item => [
    "OPEN_QUEUE", item.processKey, "", "", null, item.openCount, item.oldestOpenedAt,
    item.oldestAgeMinutes, result.asOf, "", "", "", "", "",
  ] satisfies IntelligenceCsvCell[]);
  const findingRows = result.findings.map(item => [
    "BOTTLENECK", item.processKey, item.stageKey, item.waitClass, item.sampleCount, null,
    "", null, result.asOf, item.averageMinutes, item.medianMinutes, item.p90Minutes,
    item.recommendation, "",
  ] satisfies IntelligenceCsvCell[]);
  const comparisonRows = result.comparisons.map(item => [
    "PERIOD_COMPARISON", item.processKey, item.stageKey, "", null, null, "", null, result.asOf,
    item.currentMedianMinutes, item.baselineMedianMinutes, item.changeMinutes, item.note, item.changePercent,
  ] satisfies IntelligenceCsvCell[]);
  const coverageRows = result.sourceCoverage.map(item => [
    "SOURCE_COVERAGE", item.key, "", item.status, item.sampleCount, null, item.period?.from ?? "",
    null, item.asOf ?? "", null, null, null, item.message, item.completePopulation,
  ] satisfies IntelligenceCsvCell[]);
  return serializeIntelligenceCsv([
    ["تقرير", "اختناقات العمليات وزمن دورة العمل"],
    ["حالة التقرير", result.state], ["وقت اللقطة", result.asOf],
    ["الفترة الحالية", result.period.from, result.period.to, result.period.timeZone],
    ["فترة الأساس", result.baselinePeriod?.from ?? "", result.baselinePeriod?.to ?? ""],
    ["عدد الطوابير", result.queues.length], ["عدد الاختناقات المرصودة", result.findings.length],
    ["عدد المقارنات", result.comparisons.length], ["إعادة فتح المهام", result.reopenedTasks],
    ["حدود التفسير", "الزمن المرصود لا يحدد وحده الطرف المتسبب أو وقت العمل الفعلي، ولا ينسب التحسن إلى إجراء بعينه."],
    [],
    ["نوع السطر","العملية","المرحلة","تصنيف الانتظار/حالة المصدر","حجم العينة","عدد المفتوح","أقدم بداية",
      "عمر الأقدم بالدقائق","وقت المصدر","متوسط الدقائق / الحالي","وسيط الدقائق / الأساس","P90 أو فرق الوسيط",
      "التوصية أو الملاحظة","نسبة التغير المئوية أو اكتمال المجتمع"],
    ...queueRows, ...findingRows, ...comparisonRows, ...coverageRows,
    ...(result.withheldReasons.length ? [["WITHHELD","","","",null,null,"",null,result.asOf,null,null,null,result.withheldReasons.join(" | "),""] as IntelligenceCsvCell[]] : []),
  ]);
}
