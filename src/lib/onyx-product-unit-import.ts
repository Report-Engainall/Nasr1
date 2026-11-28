const MAX_UNIT_CODE_LENGTH = 80;
const MAX_UNIT_NAME_LENGTH = 40;
const MAX_ITEM_CODE_LENGTH = 100;
const MAX_CONVERSION_FACTOR = 1_000_000;
const INTEGER_FACTOR_PATTERN = /^[0-9]{1,7}(?:[.]0+)?$/;

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "نعم", "نعم، وحدة أساسية"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "لا"]);

/** Validate the Onyx ProductUnits fields before they enter a staged snapshot. */
export function validateOnyxProductUnitRow(data: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const itemCode = String(data.item_code ?? "").trim();
  const unitCode = String(data.unit_code ?? "").trim();
  const unitName = String(data.unit_name ?? "").trim();
  const factorText = String(data.conversion_factor ?? "").trim();
  const baseFlag = String(data.is_base_unit ?? "").trim().toLocaleLowerCase("en");

  if (!itemCode || itemCode.length > MAX_ITEM_CODE_LENGTH) {
    errors.push("رقم الصنف item_code مطلوب وبحد أقصى 100 حرف.");
  }
  if (!unitCode || unitCode.length > MAX_UNIT_CODE_LENGTH) {
    errors.push("كود الوحدة unit_code مطلوب وبحد أقصى 80 حرفًا.");
  }
  if (!unitName || unitName.length > MAX_UNIT_NAME_LENGTH) {
    errors.push("اسم الوحدة unit_name مطلوب وبحد أقصى 40 حرفًا.");
  }

  const factorIsInteger = INTEGER_FACTOR_PATTERN.test(factorText);
  const factor = factorIsInteger ? Number(factorText) : Number.NaN;
  if (!factorIsInteger || !Number.isSafeInteger(factor) || factor < 1 || factor > MAX_CONVERSION_FACTOR) {
    errors.push("معامل التحويل يجب أن يكون عددًا صحيحًا من 1 إلى 1,000,000؛ لا تُقبل الكسور.");
  }

  if (baseFlag && !TRUE_VALUES.has(baseFlag) && !FALSE_VALUES.has(baseFlag)) {
    errors.push("قيمة is_base_unit غير مفهومة؛ استخدم نعم/لا أو true/false.");
  } else if (TRUE_VALUES.has(baseFlag) && factor !== 1) {
    errors.push("صف الوحدة الأساسية يجب أن يكون معامل تحويله 1.");
  }

  return errors;
}

/** Stable identity for one alternate unit within one source product. */
export function buildOnyxProductUnitKey(itemCode: string, unitCode: string): string {
  return itemCode.trim().toLocaleUpperCase("en") + "::" + unitCode.trim().toLocaleUpperCase("en");
}