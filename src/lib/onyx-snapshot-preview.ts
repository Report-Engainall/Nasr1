import type { OnyxSnapshotRow } from "./api";

export type OnyxSnapshotPreviewKind = "products" | "customers";
export type OnyxSnapshotPreviewStatus = "valid" | "warning" | "rejected" | "unknown";
export type OnyxSnapshotPreviewFact = { label: string; value: string };
export type OnyxSnapshotPreviewRow = {
  rowNumber: number;
  matchingCode: string;
  title: string;
  subtitle: string;
  status: OnyxSnapshotPreviewStatus;
  facts: OnyxSnapshotPreviewFact[];
  errors: string[];
};

function displayValue(value: unknown): string | null {
  if (typeof value === "string") {
    const clean = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
    return clean ? clean.slice(0, 120) : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function firstValue(data: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = displayValue(data[key]);
    if (value !== null) return value;
  }
  return null;
}

function collectErrors(value: unknown): string[] {
  const candidates = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return candidates.flatMap((item) => {
    if (typeof item === "string") {
      const clean = item.trim();
      return clean ? [clean.slice(0, 240)] : [];
    }
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const record = item as Record<string, unknown>;
      const message = displayValue(record.reason) ?? displayValue(record.message);
      return message ? [message] : [];
    }
    return [];
  }).slice(0, 5);
}

/**
 * Projects only review-safe, dataset-specific fields from a snapshot row.
 * Customer source tier/credit and product cost/internal fields are deliberately omitted.
 */
export function projectOnyxSnapshotPreviewRow(
  row: OnyxSnapshotRow,
  kind: OnyxSnapshotPreviewKind,
): OnyxSnapshotPreviewRow {
  const data = row.data;
  const matchingCode = displayValue(row.canonical_key) ??
    (kind === "products" ? firstValue(data, "item_code") : firstValue(data, "customer_code")) ??
    "غير متاح";
  const title = kind === "products"
    ? firstValue(data, "product_name", "name") ?? "اسم الصنف غير متاح"
    : firstValue(data, "business_name", "customer_name") ?? "اسم العميل غير متاح";
  const subtitle = kind === "products"
    ? firstValue(data, "category_name", "category", "barcode")
    : firstValue(data, "contact_name", "phone");

  const fields: Array<[string, string | null]> = kind === "products"
    ? [
        ["الوحدة", firstValue(data, "unit")],
        ["الباركود", firstValue(data, "barcode")],
        ["التصنيف", firstValue(data, "category_name", "category")],
        ["جملة الجملة", firstValue(data, "price_wholesale_of_wholesale")],
        ["الجملة", firstValue(data, "price_wholesale")],
        ["التجزئة", firstValue(data, "price_retail")],
        ["المخزن المصدر", firstValue(data, "warehouse_name", "warehouse_code")],
        ["رصيد المصدر — غير معتمد", firstValue(data, "quantity", "available_quantity")],
      ]
    : [
        ["المسؤول", firstValue(data, "contact_name")],
        ["الهاتف", firstValue(data, "phone")],
        ["البريد الإلكتروني", firstValue(data, "email")],
        ["العنوان", firstValue(data, "address")],
      ];

  const status: OnyxSnapshotPreviewStatus =
    row.status === "valid" || row.status === "warning" || row.status === "rejected"
      ? row.status
      : "unknown";

  return {
    rowNumber: row.row_number,
    matchingCode,
    title,
    subtitle: subtitle ?? "",
    status,
    facts: fields.flatMap(([label, value]) => value === null ? [] : [{ label, value }]),
    errors: collectErrors(row.errors),
  };
}
