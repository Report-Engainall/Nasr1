import { supabase } from '@/lib/supabase';
import { parseStorefrontCatalogProduct } from '@/lib/storefront-catalog';
import type { ProductWithInventory } from '@/lib/types';

const PRODUCT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Strictly accepts only requested, unique products from the tenant-bound cart lookup RPC. */
export function parseStorefrontCartProductDetails(
  value: unknown,
  requestedProductIds: string[],
): ProductWithInventory[] {
  const requested = new Set(requestedProductIds.map((id) => id.toLowerCase()));
  const envelope = asRecord(value);
  if (!envelope || !Array.isArray(envelope.items)) {
    throw new Error('استجابة تفاصيل أصناف السلة غير صالحة.');
  }

  const seen = new Set<string>();
  return envelope.items.map((entry) => {
    const row = asRecord(entry);
    if (!row || typeof row.id !== 'string') {
      throw new Error('أعاد الخادم صنفًا غير صالح ضمن السلة.');
    }
    const id = row.id.toLowerCase();
    if (!requested.has(id)) {
      throw new Error('أعاد الخادم صنفًا خارج السلة الحالية؛ أُهملت الاستجابة.');
    }
    if (seen.has(id)) {
      throw new Error('أعاد الخادم صنفًا مكررًا ضمن تفاصيل السلة.');
    }
    seen.add(id);
    return parseStorefrontCatalogProduct(row);
  });
}

/**
 * Fetch only the product rows referenced by this cart. Prices are deliberately omitted;
 * the existing authorized cart pricing-preview RPC remains the only price source.
 */
export async function fetchStorefrontCartProductDetails(
  productIds: string[],
): Promise<ProductWithInventory[]> {
  if (!Array.isArray(productIds) || productIds.length > 100 ||
      productIds.some((id) => typeof id !== 'string' || !PRODUCT_ID_PATTERN.test(id))) {
    throw new Error('تحتوي السلة على معرّفات أصناف غير صالحة.');
  }

  const uniqueIds = [...new Set(productIds.map((id) => id.toLowerCase()))];
  if (uniqueIds.length !== productIds.length) {
    throw new Error('تحتوي السلة على صنف مكرر؛ حدّث السلة قبل المتابعة.');
  }
  if (uniqueIds.length === 0) return [];

  const { data, error } = await supabase.rpc('get_storefront_cart_product_details', {
    p_product_ids: uniqueIds,
  });
  if (error) {
    throw new Error('تعذر تحميل بيانات أصناف السلة من الكتالوج. أعد المحاولة دون إعادة تحميل الكتالوج بالكامل.');
  }
  return parseStorefrontCartProductDetails(data, uniqueIds);
}
