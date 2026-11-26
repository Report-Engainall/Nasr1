import { fetchProducts } from "./api";
import { fetchCustomerDirectoryPage, type CustomerDirectoryRow } from "./customer-directory";
import { getCurrentTenantScope } from "./supabase";
import type { CellValue } from "./onyx-export";
import type { ProductWithInventory } from "./types";

export const ONYX_PRO_LIVE_DATASET_IDS = ["products", "customers"] as const;
export type OnyxProLiveDatasetId = (typeof ONYX_PRO_LIVE_DATASET_IDS)[number];
export type OnyxProLiveRecord = Record<string, CellValue>;
export type OnyxProLiveRows = { [datasetId: string]: OnyxProLiveRecord[] | undefined };

export const MAX_ONYX_PRO_LIVE_EXPORT_ROWS = 10_000;
const CUSTOMER_PAGE_SIZE = 100;
const CUSTOMER_PAGE_CONCURRENCY = 4;

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("لا يمكن تصدير أونكس: حقل " + label + " مفقود أو غير صالح.");
  }
  return value.trim();
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Deliberate allowlist for the Onyx Products sheet. Internal prices, purchase costs,
 * margins, organization identifiers and stock-record identifiers never enter the export.
 */
export function mapOnyxProProductRecord(product: ProductWithInventory): OnyxProLiveRecord {
  const productId = requiredText(product?.id, "معرّف الصنف");
  const productCode = requiredText(product?.item_code, "رقم الصنف");
  const productName = requiredText(product?.name, "اسم الصنف");
  const unit = requiredText(product?.unit, "وحدة الصنف");
  if (typeof product.is_active !== "boolean") {
    throw new Error("لا يمكن تصدير أونكس: حالة الصنف غير مؤكدة.");
  }

  const status = optionalText(product.status) ?? (product.is_active ? "active" : "inactive");
  const category = product.category;

  return {
    product_id: productId,
    product_code: productCode,
    sku: optionalText(product.sku),
    barcode: optionalText(product.barcode),
    product_name: productName,
    product_name_en: optionalText(product.name_en),
    short_description: optionalText(product.description),
    description: optionalText(product.description),
    category_code: optionalText(category?.code),
    category_name: optionalText(category?.name),
    base_unit_name: unit,
    min_stock: optionalFiniteNumber(product.min_stock_level),
    reorder_point: optionalFiniteNumber(product.inventory?.reorder_point),
    is_active: product.is_active ? "نعم" : "لا",
    product_status: status,
    image_url: optionalText(product.image_url),
    created_at: optionalText(product.created_at),
    updated_at: optionalText(product.updated_at),
  };
}

/**
 * Customer export is intentionally non-financial. The manager directory may contain
 * balances and credit limits for its own screens, but these are not copied into Onyx.
 */
export function mapOnyxProCustomerRecord(customer: CustomerDirectoryRow): OnyxProLiveRecord {
  const customerId = requiredText(customer?.id, "معرّف العميل");
  const businessName = requiredText(customer?.business_name, "اسم العميل");
  const status = requiredText(customer?.status, "حالة العميل");
  const createdAt = requiredText(customer?.created_at, "تاريخ إنشاء العميل");
  if (!Number.isFinite(Date.parse(createdAt))) {
    throw new Error("لا يمكن تصدير أونكس: تاريخ إنشاء العميل غير صالح.");
  }

  return {
    customer_id: customerId,
    customer_code: optionalText(customer.customer_code),
    customer_name: businessName,
    business_name: businessName,
    phone: optionalText(customer.phone),
    email: optionalText(customer.email),
    price_level_code: optionalText(customer.tier),
    customer_status: status,
    created_at: createdAt,
  };
}

function assertUniqueKeys(
  rows: readonly OnyxProLiveRecord[],
  idField: string,
  codeField: string,
  label: string,
): void {
  const ids = new Set<string>();
  const codes = new Set<string>();
  for (const row of rows) {
    const id = row[idField];
    const code = row[codeField];
    if (typeof id !== "string" || !id || ids.has(id)) {
      throw new Error("تصدير " + label + " موقوف: معرّف مفقود أو مكرر.");
    }
    ids.add(id);
    if (typeof code === "string" && code.trim()) {
      const normalized = code.trim().toLocaleUpperCase("en");
      if (codes.has(normalized)) {
        throw new Error("تصدير " + label + " موقوف: يوجد كود أعمال مكرر (" + code + ").");
      }
      codes.add(normalized);
    }
  }
}

async function fetchProductsForExport(): Promise<OnyxProLiveRecord[]> {
  const products = await fetchProducts();
  if (!Array.isArray(products)) {
    throw new Error("تعذر تأكيد قائمة الأصناف من قاعدة البيانات.");
  }
  if (products.length > MAX_ONYX_PRO_LIVE_EXPORT_ROWS) {
    throw new Error("يتجاوز عدد الأصناف حد التصدير الآمن (" + MAX_ONYX_PRO_LIVE_EXPORT_ROWS.toLocaleString("en") + "). استخدم تصفية الكتالوج قبل تصدير هذه المجموعة.");
  }
  const rows = products.map((product) => mapOnyxProProductRecord(product));
  assertUniqueKeys(rows, "product_id", "product_code", "الأصناف");
  return rows;
}

async function fetchCustomersForExport(): Promise<OnyxProLiveRecord[]> {
  const first = await fetchCustomerDirectoryPage({ page: 1, pageSize: CUSTOMER_PAGE_SIZE });
  const totalCount = first.totalCount;
  if (!Number.isSafeInteger(totalCount) || totalCount < 0) {
    throw new Error("تعذر تأكيد إجمالي العملاء قبل التصدير.");
  }
  if (totalCount > MAX_ONYX_PRO_LIVE_EXPORT_ROWS) {
    throw new Error("يتجاوز عدد العملاء حد التصدير الآمن (" + MAX_ONYX_PRO_LIVE_EXPORT_ROWS.toLocaleString("en") + "). استخدم تصفية دليل العملاء قبل تصدير هذه المجموعة.");
  }
  if (first.page !== 1 || first.pageSize !== CUSTOMER_PAGE_SIZE || first.rows.length > CUSTOMER_PAGE_SIZE) {
    throw new Error("أعاد دليل العملاء صفحة أولى غير مكتملة؛ أوقف التصدير.");
  }

  const pages = Math.ceil(totalCount / CUSTOMER_PAGE_SIZE);
  const allRows: CustomerDirectoryRow[] = [...first.rows];

  for (let start = 2; start <= pages; start += CUSTOMER_PAGE_CONCURRENCY) {
    const pageNumbers = Array.from(
      { length: Math.min(CUSTOMER_PAGE_CONCURRENCY, pages - start + 1) },
      (_, index) => start + index,
    );
    const batch = await Promise.all(
      pageNumbers.map((page) => fetchCustomerDirectoryPage({
        page,
        pageSize: CUSTOMER_PAGE_SIZE,
      })),
    );

    for (let index = 0; index < batch.length; index += 1) {
      const result = batch[index];
      if (
        result.page !== pageNumbers[index] ||
        result.pageSize !== CUSTOMER_PAGE_SIZE ||
        result.totalCount !== totalCount ||
        result.rows.length > CUSTOMER_PAGE_SIZE
      ) {
        throw new Error("تغيّر دليل العملاء أثناء التصدير أو أعاد صفحة غير متطابقة؛ لم يُنشأ ملف جزئي.");
      }
      allRows.push(...result.rows);
    }
  }

  if (allRows.length !== totalCount) {
    throw new Error("لم تتطابق أعداد العملاء المقروءة مع الإجمالي المؤكد؛ أُوقف التصدير.");
  }

  const rows = allRows.map((customer) => mapOnyxProCustomerRecord(customer));
  assertUniqueKeys(rows, "customer_id", "customer_code", "العملاء");
  return rows;
}

/** Tenant- and role-scoped live export for the two Onyx datasets with complete source readers. */
export async function fetchOnyxProLiveExportRecords(
  datasetIds: readonly OnyxProLiveDatasetId[],
): Promise<OnyxProLiveRows> {
  if (!Array.isArray(datasetIds) || datasetIds.length === 0) {
    throw new Error("اختر مجموعة واحدة على الأقل لتصدير السجلات الحية.");
  }
  if (new Set(datasetIds).size !== datasetIds.length ||
      datasetIds.some((id) => !ONYX_PRO_LIVE_DATASET_IDS.includes(id))) {
    throw new Error("مجموعة تصدير أونكس غير معروفة أو مكررة.");
  }

  const scope = await getCurrentTenantScope();
  if (!scope.isStaff || !scope.organizationId || !scope.canViewInternalProductPrices) {
    throw new Error("تصدير سجلات Onyx الحية متاح للمدير ومدير النظام فقط.");
  }

  const tasks: Array<Promise<void>> = [];
  const result: OnyxProLiveRows = {};

  if (datasetIds.includes("products")) {
    tasks.push(fetchProductsForExport().then((rows) => { result.products = rows; }));
  }
  if (datasetIds.includes("customers")) {
    tasks.push(fetchCustomersForExport().then((rows) => { result.customers = rows; }));
  }

  await Promise.all(tasks);
  return result;
}
