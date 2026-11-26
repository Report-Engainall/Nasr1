const STOCK_QUANTITY_PATTERN = /^(0|[1-9][0-9]{0,11})([.][0-9]{1,3})?$/;
const STOCK_CODE_MAX_LENGTH = 200;

function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Validate only the whole-product, warehouse-scoped StockBalances contract.
 * The SQL reconciliation RPC applies the same quantity grammar and re-validates
 * source ownership, product identity, reservations, and movement freshness.
 */
export function validateOnyxStockBalanceRow(data: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const itemCode = String(data.item_code ?? "").trim();
  const warehouseCode = String(data.warehouse_code ?? "").trim();
  const quantity = String(data.quantity ?? "").trim();
  const asOfDate = String(data.as_of_date ?? "").trim();

  if (!itemCode || itemCode.length > STOCK_CODE_MAX_LENGTH) {
    errors.push("رقم الصنف item_code مطلوب وبحد أقصى 200 حرف.");
  }
  if (!warehouseCode || warehouseCode.length > STOCK_CODE_MAX_LENGTH) {
    errors.push("كود المخزن warehouse_code مطلوب وبحد أقصى 200 حرف.");
  }
  if (!STOCK_QUANTITY_PATTERN.test(quantity)) {
    errors.push("كمية الرصيد يجب أن تكون رقمًا غير سالب وبحد أقصى 3 منازل عشرية، دون فواصل أو صيغة أسية.");
  }
  if (!isRealIsoDate(asOfDate)) {
    errors.push("تاريخ الرصيد as_of_date يجب أن يكون تاريخًا تقويميًا صحيحًا بصيغة YYYY-MM-DD.");
  }

  const unsupportedGranularity = ["unit_code", "base_unit_code", "batch_number", "lot_number", "serial_number"]
    .filter((field) => String(data[field] ?? "").trim() !== "");
  if (unsupportedGranularity.length > 0) {
    errors.push("المصالحة الحالية لا تعتمد أرصدة الوحدات أو الدفعات أو التشغيلات أو الأرقام التسلسلية: " +
      unsupportedGranularity.join("، "));
  }

  return errors;
}

/** Stable composite key: the same item may occur once in each warehouse. */
export function buildOnyxWarehouseItemKey(itemCode: string, warehouseCode: string): string {
  return warehouseCode.trim().toLocaleUpperCase("en") + "::" + itemCode.trim().toLocaleUpperCase("en");
}