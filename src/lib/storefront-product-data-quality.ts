export type AlternateUnitQualityState = "loading" | "error" | "ready";

export type ProductDataQualityInput = {
  imageCount: number;
  description: string | null | undefined;
  salesUnit: string | null | undefined;
  alternateUnitCount: number;
  alternateUnitState: AlternateUnitQualityState;
};

export function assessProductDataQuality(input: ProductDataQualityInput) {
  const checks = [
    {
      key: "image",
      label: "صور المنتج",
      complete: Number.isSafeInteger(input.imageCount) && input.imageCount > 0,
    },
    {
      key: "description",
      label: "وصف المنتج",
      complete: typeof input.description === "string" && input.description.trim().length > 0,
    },
    {
      key: "sales-unit",
      label: "وحدة البيع الأساسية",
      complete: typeof input.salesUnit === "string" && input.salesUnit.trim().length > 0,
    },
  ] as const;

  const completeCount = checks.filter((check) => check.complete).length;
  const score = Math.round((completeCount / checks.length) * 100);
  const alternateUnits = input.alternateUnitState === "loading"
    ? { tone: "pending" as const, label: "جار التحقق من الوحدات البديلة..." }
    : input.alternateUnitState === "error"
      ? { tone: "unknown" as const, label: "تعذر التحقق من تعريفات الوحدات البديلة" }
      : input.alternateUnitCount > 0
        ? { tone: "complete" as const, label: "تم تسجيل " + input.alternateUnitCount + " وحدة بيع بديلة" }
        : { tone: "optional" as const, label: "الوحدة الأساسية فقط؛ لا توجد تحويلات إضافية مسجلة" };

  return {
    checks,
    completeCount,
    totalCount: checks.length,
    score,
    alternateUnits,
  };
}

export function formatProductUpdatedAt(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;

  return new Intl.DateTimeFormat("ar", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}
