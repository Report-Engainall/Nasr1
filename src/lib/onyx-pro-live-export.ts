import { fetchActiveInventoryWarehouses, fetchInventoryAdjustmentBalances, fetchProducts } from "./api";
import { fetchCustomerDirectoryPage, type CustomerDirectoryRow } from "./customer-directory";
import { getCurrentTenantScope } from "./supabase";
import type { CellValue } from "./onyx-export";
import type { ProductWithInventory } from "./types";

export const ONYX_PRO_LIVE_DATASET_IDS = ["products", "customers", "warehouses", "stock_balances"] as const;
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



type OnyxProWarehouseDirectorySource = {
  id: string;
  code: string | null;
  name: string;
};

/** Public business identity only; internal ID, address and warehouse-manager data never leave Aghbari. */
export function mapOnyxProWarehouseRecord(
  warehouse: OnyxProWarehouseDirectorySource,
): OnyxProLiveRecord {
  requiredText(warehouse?.id, "معرّف المخزن");
  const code = requiredText(warehouse.code, "كود المخزن");
  const name = requiredText(warehouse.name, "اسم المخزن");
  return {
    warehouse_code: code,
    warehouse_name: name,
    is_active: "نعم",
  };
}

async function fetchWarehousesForExport(): Promise<OnyxProLiveRecord[]> {
  const warehouses = await fetchActiveInventoryWarehouses();
  if (!Array.isArray(warehouses)) {
    throw new Error("تعذر تأكيد قائمة المستودعات النشطة قبل التصدير.");
  }
  if (warehouses.length > MAX_ONYX_PRO_LIVE_EXPORT_ROWS) {
    throw new Error("يتجاوز عدد المستودعات حد التصدير الآمن (" +
      MAX_ONYX_PRO_LIVE_EXPORT_ROWS.toLocaleString("en") + ").");
  }

  const ids = new Set<string>();
  const codes = new Set<string>();
  return warehouses.map((warehouse) => {
    const id = requiredText(warehouse?.id, "معرّف المخزن");
    const record = mapOnyxProWarehouseRecord(warehouse);
    const code = String(record.warehouse_code).toLocaleUpperCase("en");
    if (ids.has(id) || codes.has(code)) {
      throw new Error("تصدير المستودعات موقوف: يوجد معرّف أو كود مخزن مكرر.");
    }
    ids.add(id);
    codes.add(code);
    return record;
  });
}

type OnyxProStockBalanceSource = {
  product_id: string;
  item_code: string;
  warehouse_id: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  quantity_available: number;
  last_movement_at: string | null;
};

type OnyxProWarehouseSource = { id: string; code: string | null };

/** Resolve an all-warehouse or single active-warehouse export scope without trusting UI values. */
export function resolveOnyxProExportWarehouses(
  warehouses: readonly OnyxProWarehouseSource[],
  selectedWarehouseId?: string | null,
): Array<{ id: string; code: string }> {
  if (!Array.isArray(warehouses)) {
    throw new Error("تعذر تأكيد قائمة المستودعات قبل التصدير.");
  }
  const selectedId = optionalText(selectedWarehouseId);
  const scoped = selectedId
    ? warehouses.filter((warehouse) => warehouse?.id === selectedId)
    : [...warehouses];
  if (selectedId && scoped.length !== 1) {
    throw new Error("المستودع المحدد غير نشط أو لا يتبع المؤسسة الحالية.");
  }
  if (scoped.length === 0) {
    throw new Error("لا يوجد مستودع نشط يحتوي نطاق التصدير المحدد.");
  }

  const ids = new Set<string>();
  const codes = new Set<string>();
  return scoped.map((warehouse) => {
    const id = requiredText(warehouse?.id, "معرّف المخزن");
    const code = requiredText(warehouse?.code, "كود المخزن");
    const normalizedCode = code.toLocaleUpperCase("en");
    if (ids.has(id) || codes.has(normalizedCode)) {
      throw new Error("تصدير أرصدة المخزون موقوف: يوجد معرّف أو كود مخزن مكرر.");
    }
    ids.add(id);
    codes.add(normalizedCode);
    return { id, code };
  });
}

/**
 * A narrow Onyx stock-balance projection. Source IDs, warehouse IDs, prices,
 * costs, inventory values and account identifiers are deliberately omitted.
 */
export function mapOnyxProStockBalanceRecord(
  balance: OnyxProStockBalanceSource,
  warehouse: OnyxProWarehouseSource,
  asOfDate: string,
): OnyxProLiveRecord {
  requiredText(balance.product_id, "معرّف الصنف");
  const productCode = requiredText(balance.item_code, "رقم الصنف");
  const warehouseId = requiredText(warehouse.id, "معرّف المخزن");
  if (requiredText(balance.warehouse_id, "مخزن رصيد الصنف") !== warehouseId) {
    throw new Error("لا يمكن تصدير أونكس: رصيد الصنف تابع لمخزن مختلف.");
  }
  const warehouseCode = requiredText(warehouse.code, "كود المخزن");
  const quantityOnHand = optionalFiniteNumber(balance.quantity_on_hand);
  const quantityReserved = optionalFiniteNumber(balance.quantity_reserved);
  const quantityAvailable = optionalFiniteNumber(balance.quantity_available);
  if (quantityOnHand === null || quantityReserved === null || quantityAvailable === null) {
    throw new Error("لا يمكن تصدير أونكس: إحدى كميات رصيد المخزون غير صالحة.");
  }
  const hasThreeDecimals = (value: number) =>
    Math.abs(Math.round(value * 1000) / 1000 - value) < 1e-8;
  if (![quantityOnHand, quantityReserved, quantityAvailable].every(hasThreeDecimals)) {
    throw new Error("لا يمكن تصدير أونكس: كميات المخزون تتجاوز دقة ثلاث منازل عشرية.");
  }
  if (Math.abs(quantityOnHand - quantityReserved - quantityAvailable) > 0.001) {
    throw new Error("لا يمكن تصدير أونكس: لا يتطابق الموجود ناقص المحجوز مع المتاح.");
  }
  const snapshotAt = requiredText(asOfDate, "وقت قراءة رصيد المخزون");
  if (!Number.isFinite(Date.parse(snapshotAt))) {
    throw new Error("لا يمكن تصدير أونكس: وقت قراءة رصيد المخزون غير صالح.");
  }
  const lastMovementAt = optionalText(balance.last_movement_at);
  if (lastMovementAt && !Number.isFinite(Date.parse(lastMovementAt))) {
    throw new Error("لا يمكن تصدير أونكس: تاريخ آخر حركة مخزون غير صالح.");
  }

  return {
    product_code: productCode,
    warehouse_code: warehouseCode,
    quantity_on_hand: quantityOnHand,
    quantity_reserved: quantityReserved,
    quantity_available: quantityAvailable,
    last_movement_date: lastMovementAt,
    as_of_date: snapshotAt,
  };
}

async function fetchStockBalancesForExport(selectedWarehouseId?: string | null): Promise<OnyxProLiveRecord[]> {
  const warehouses = await fetchActiveInventoryWarehouses();
  if (!Array.isArray(warehouses)) {
    throw new Error("تعذر تأكيد قائمة المستودعات قبل تصدير أرصدة المخزون.");
  }

  const preparedWarehouses = resolveOnyxProExportWarehouses(warehouses, selectedWarehouseId);

  const records: OnyxProLiveRecord[] = [];
  const seenProductIds = new Set<string>();
  const seenBusinessKeys = new Set<string>();

  // Keep source reads bounded while avoiding a sequential round-trip per warehouse.
  for (let start = 0; start < preparedWarehouses.length; start += 4) {
    const batch = await Promise.all(preparedWarehouses.slice(start, start + 4).map(async (warehouse) => {
      const rows = await fetchInventoryAdjustmentBalances(warehouse.id);
      if (!Array.isArray(rows)) {
        throw new Error("تعذر تأكيد أرصدة المخزن " + warehouse.code + ".");
      }
      return { warehouse, rows, asOfDate: new Date().toISOString() };
    }));

    for (const group of batch) {
      if (records.length + group.rows.length > MAX_ONYX_PRO_LIVE_EXPORT_ROWS) {
        throw new Error("يتجاوز عدد أرصدة المخزون حد التصدير الآمن (" +
          MAX_ONYX_PRO_LIVE_EXPORT_ROWS.toLocaleString("en") + ").");
      }
      for (const balance of group.rows) {
        const productId = requiredText(balance?.product_id, "معرّف الصنف");
        const productCode = requiredText(balance?.item_code, "رقم الصنف");
        const productKey = group.warehouse.id + "::" + productId;
        const businessKey = group.warehouse.code.toLocaleUpperCase("en") + "::" +
          productCode.toLocaleUpperCase("en");
        if (seenProductIds.has(productKey) || seenBusinessKeys.has(businessKey)) {
          throw new Error("تصدير أرصدة المخزون موقوف: يوجد صنف مكرر داخل المستودع.");
        }
        seenProductIds.add(productKey);
        seenBusinessKeys.add(businessKey);
        records.push(mapOnyxProStockBalanceRecord(balance, group.warehouse, group.asOfDate));
      }
    }
  }

  return records;
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

/** Tenant- and role-scoped live export for supported Onyx datasets with complete source readers. */
export type OnyxProLiveExportOptions = {
  /** Empty means all active warehouses; a supplied ID is revalidated against the active tenant list. */
  stockWarehouseId?: string | null;
};

export async function fetchOnyxProLiveExportRecords(
  datasetIds: readonly OnyxProLiveDatasetId[],
  options: OnyxProLiveExportOptions = {},
): Promise<OnyxProLiveRows> {
  if (!Array.isArray(datasetIds) || datasetIds.length === 0) {
    throw new Error("اختر مجموعة واحدة على الأقل لتصدير السجلات الحية.");
  }
  if (new Set(datasetIds).size !== datasetIds.length ||
      datasetIds.some((id) => !ONYX_PRO_LIVE_DATASET_IDS.includes(id))) {
    throw new Error("مجموعة تصدير أونكس غير معروفة أو مكررة.");
  }

  const scope = await getCurrentTenantScope();
  const needsProductDirectoryAccess = datasetIds.some((id) => id === "products" || id === "customers");
  if (!scope.isStaff || !scope.organizationId ||
      (needsProductDirectoryAccess && !scope.canViewInternalProductPrices)) {
    throw new Error("تصدير سجلات Onyx الحية متاح للمدير ومدير النظام فقط.");
  }

  if (options.stockWarehouseId && !datasetIds.includes("stock_balances")) {
    throw new Error("لا يمكن تحديد مستودع دون اختيار تصدير أرصدة المخزون.");
  }

  const tasks: Array<Promise<void>> = [];
  const result: OnyxProLiveRows = {};

  if (datasetIds.includes("products")) {
    tasks.push(fetchProductsForExport().then((rows) => { result.products = rows; }));
  }
  if (datasetIds.includes("customers")) {
    tasks.push(fetchCustomersForExport().then((rows) => { result.customers = rows; }));
  }
  if (datasetIds.includes("warehouses")) {
    tasks.push(fetchWarehousesForExport().then((rows) => { result.warehouses = rows; }));
  }
  if (datasetIds.includes("stock_balances")) {
    tasks.push(fetchStockBalancesForExport(options.stockWarehouseId).then((rows) => { result.stock_balances = rows; }));
  }

  await Promise.all(tasks);
  return result;
}
