import { supabase } from '@/lib/supabase';
import type { ProductWithInventory } from '@/lib/types';
import { normalizeCatalogSearchQuery, MAX_CATALOG_SEARCH_LENGTH } from '@/lib/commerce-utils';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type CatalogRpcInvoker = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;

function invokeCatalogRpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { code?: string; message: string } | null }> {
  // Resolve the lazy client only when a catalogue request is actually made.
  return (supabase as unknown as { rpc: CatalogRpcInvoker }).rpc(name, args);
}

export interface StorefrontCatalogBrandOption {
  id: string;
  name: string;
  name_en: string | null;
}

export interface StorefrontCatalogFilters {
  brands: StorefrontCatalogBrandOption[];
  units: string[];
}

export interface StorefrontCatalogPage {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  items: ProductWithInventory[];
  filters: StorefrontCatalogFilters;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(value: unknown, fallback = 0): number {
  const result = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(result) ? result : fallback;
}

export function parseStorefrontCatalogFilters(value: unknown): StorefrontCatalogFilters {
  const filters = asRecord(value);
  if (!filters || !Array.isArray(filters.brands) || !Array.isArray(filters.units)
      || filters.brands.length > 2000 || filters.units.length > 2000) {
    throw new Error('قوائم فلاتر الكتالوج غير مكتملة أو غير صالحة.');
  }

  const brands = filters.brands.map((item) => {
    const brand = asRecord(item);
    if (!brand || typeof brand.id !== 'string' || !UUID.test(brand.id)
        || typeof brand.name !== 'string' || !brand.name.trim() || brand.name.trim().length > 120
        || (brand.name_en !== null && brand.name_en !== undefined
          && (typeof brand.name_en !== 'string' || brand.name_en.trim().length > 120))) {
      throw new Error('أعاد الخادم خيار علامة تجارية غير صالح؛ لم يُعرض.');
    }
    return {
      id: brand.id,
      name: brand.name.trim(),
      name_en: typeof brand.name_en === 'string' && brand.name_en.trim()
        ? brand.name_en.trim()
        : null,
    };
  });
  if (new Set(brands.map((brand) => brand.id)).size !== brands.length) {
    throw new Error('أعاد الخادم علامات تجارية مكررة؛ لم تُعرض.');
  }

  const units = filters.units.map((value) => {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 40) {
      throw new Error('أعاد الخادم وحدة بيع غير صالحة؛ لم تُعرض.');
    }
    return value.trim();
  });
  if (new Set(units.map((unit) => unit.toLocaleLowerCase('ar'))).size !== units.length) {
    throw new Error('أعاد الخادم وحدات بيع مكررة؛ لم تُعرض.');
  }

  return { brands, units };
}

export function parseStorefrontCartProductDetailsRow(value: unknown): ProductWithInventory {
  const row = asRecord(value);
  if (!row || typeof row.id !== 'string' || !row.id
      || typeof row.name !== 'string' || typeof row.item_code !== 'string'
      || typeof row.unit !== 'string') {
    throw new Error('وصل سجل كتالوج غير صالح من الخادم؛ لم يُعرض.');
  }

  // NULL is the explicit server decision to hide catalog pricing; a missing property is malformed.
  if (row.display_price === undefined) {
    throw new Error('استجابة السعر من الخادم غير مكتملة؛ لم يُعرض سعر بديل.');
  }
  const displayPrice = row.display_price === null
    ? undefined
    : finiteNumber(row.display_price, Number.NaN);
  if (displayPrice !== undefined && (!Number.isFinite(displayPrice) || displayPrice < 0)) {
    throw new Error('تعذر التحقق من السعر المعتمد لهذا الصنف؛ لم يُعرض سعر بديل.');
  }

  const minimumOrderQuantity = row.min_order_quantity === undefined ? 1 : finiteNumber(row.min_order_quantity, Number.NaN);
  const orderQuantityMultiple = row.order_quantity_multiple === undefined ? 1 : finiteNumber(row.order_quantity_multiple, Number.NaN);
  if (!Number.isSafeInteger(minimumOrderQuantity) || minimumOrderQuantity < 1 || minimumOrderQuantity > 10000 ||
      !Number.isSafeInteger(orderQuantityMultiple) || orderQuantityMultiple < 1 || orderQuantityMultiple > 10000) {
    throw new Error('سياسة الحد الأدنى ومضاعف الطلب للصنف غير صالحة؛ لم تُعرض بيانات كمية غير مؤكدة.');
  }

  const rawInventory = asRecord(row.inventory);
  const inventory = rawInventory && rawInventory.product_id === row.id
      && Number.isFinite(Number(rawInventory.quantity_available))
      && Number(rawInventory.quantity_available) >= 0
    ? {
        // Public catalog payloads carry availability, not internal inventory identifiers.
        id: '',
        product_id: row.id,
        warehouse_id: '',
        quantity_on_hand: 0,
        quantity_reserved: 0,
        quantity_available: Number(rawInventory.quantity_available),
      }
    : undefined;

  return {
    id: row.id,
    name: row.name,
    name_en: typeof row.name_en === 'string' ? row.name_en : null,
    item_code: row.item_code,
    sku: typeof row.sku === 'string' ? row.sku : null,
    barcode: typeof row.barcode === 'string' ? row.barcode : null,
    category_id: typeof row.category_id === 'string' ? row.category_id : null,
    brand_id: typeof row.brand_id === 'string' ? row.brand_id : null,
    unit: row.unit,
    description: typeof row.description === 'string' ? row.description : null,
    image_url: typeof row.image_url === 'string' ? row.image_url : null,
    is_active: row.is_active === true,
    is_featured: row.is_featured === true,
    sort_order: finiteNumber(row.sort_order),
    // Public stock quantity is availability, never internal on-hand count.
    // Never trust a legacy/raw stock_quantity field: public UI may expose availability only.
    stock_quantity: inventory?.quantity_available ?? 0,
    reserved_quantity: 0,
    min_stock_level: 0,
    min_order_quantity: minimumOrderQuantity,
    order_quantity_multiple: orderQuantityMultiple,
    status: typeof row.status === 'string' ? row.status : 'active',
    created_at: typeof row.created_at === 'string' ? row.created_at : '',
    ...(typeof row.updated_at === 'string' && Number.isFinite(Date.parse(row.updated_at))
      ? { updated_at: row.updated_at }
      : {}),
    ...(displayPrice === undefined ? {} : { display_price: displayPrice }),
    inventory,
  };
}

export async function fetchStorefrontCatalogPage(input: {
  search: string;
  categoryId: string | null;
  page: number;
  pageSize?: number;
  availableOnly: boolean;
  brandId?: string | null;
  unit?: string | null;
  priceDisplayableOnly?: boolean;
  productId?: string | null;
}): Promise<StorefrontCatalogPage> {
  // Keep the client-side bounds aligned with the SECURITY DEFINER RPC contract, even for malformed runtime values.
  const requestedPage = Number.isFinite(input.page) ? Math.floor(input.page) : 1;
  const page = Math.min(100_000, Math.max(1, requestedPage));
  const requestedPageSize = input.pageSize !== undefined && Number.isFinite(input.pageSize)
    ? Math.floor(input.pageSize)
    : 24;
  const pageSize = Math.min(100, Math.max(1, requestedPageSize));
  const search = normalizeCatalogSearchQuery(input.search).slice(0, MAX_CATALOG_SEARCH_LENGTH);
  const brandId = input.brandId ?? null;
  const unit = input.unit?.trim() || null;
  const productId = input.productId ?? null;
  const priceDisplayableOnly = input.priceDisplayableOnly ?? false;
  if ((brandId !== null && !UUID.test(brandId)) || (productId !== null && !UUID.test(productId))) {
    throw new Error('معرّف العلامة أو المنتج المستخدم في تصفية الكتالوج غير صالح.');
  }
  if (unit !== null && unit.length > 40) {
    throw new Error('وحدة تصفية الكتالوج لا تتجاوز 40 حرفاً.');
  }
  if (typeof priceDisplayableOnly !== 'boolean') {
    throw new Error('خيار تصفية المنتجات ذات الأسعار الظاهرة غير صالح.');
  }
  const { data, error } = await invokeCatalogRpc('get_storefront_catalog_page', {
    p_search: search,
    p_category_id: input.categoryId,
    p_page: page,
    p_page_size: pageSize,
    p_available_only: input.availableOnly,
    p_brand_id: brandId,
    p_unit: unit,
    p_price_displayable_only: priceDisplayableOnly,
    p_product_id: productId,
  });
  if (error) {
    if (
      error.code === 'P0002' &&
      error.message.includes('Public storefront tenant is not configured')
    ) {
      throw new Error('الكتالوج العام غير منشور بعد؛ سيظهر للزوار بعد اعتماد بيانات المتجر وتفعيل النشر العام.');
    }
    throw new Error('تعذر تحميل صفحة الكتالوج من الخادم.');
  }
  const payload = asRecord(data);
  if (!payload || !Array.isArray(payload.items)) {
    throw new Error('استجابة صفحة الكتالوج غير صالحة؛ لم تُعرض نتائج غير مؤكدة.');
  }

  const items = payload.items.map(parseStorefrontCartProductDetailsRow);
  const filters = parseStorefrontCatalogFilters(payload.filters);
  const totalCount = finiteNumber(payload.total_count, Number.NaN);
  const totalPages = finiteNumber(payload.total_pages, Number.NaN);
  const resolvedPage = finiteNumber(payload.page, Number.NaN);
  const resolvedPageSize = finiteNumber(payload.page_size, Number.NaN);
  if (![totalCount, totalPages, resolvedPage, resolvedPageSize].every(Number.isSafeInteger)
      || totalCount < 0 || totalPages < 0 || resolvedPage < 1 || resolvedPage > 100_000
      || resolvedPageSize < 1 || resolvedPageSize > 100
      || items.length > resolvedPageSize || items.length > totalCount) {
    throw new Error('بيانات ترقيم صفحات الكتالوج غير صالحة؛ لم تُعرض نتائج غير مؤكدة.');
  }
  const expectedTotalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / resolvedPageSize);
  if (totalPages !== expectedTotalPages || (totalCount === 0 && items.length !== 0)) {
    throw new Error('بيانات ترقيم صفحات الكتالوج غير متسقة؛ لم تُعرض نتائج غير مؤكدة.');
  }
  return {
    page: resolvedPage,
    pageSize: resolvedPageSize,
    totalCount,
    totalPages,
    items,
    filters,
  };
}
