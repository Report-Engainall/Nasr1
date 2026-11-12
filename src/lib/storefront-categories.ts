import type { Category } from './types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_CATEGORY_FIELDS = new Set([
  'id',
  'name',
  'code',
  'parent_id',
  'sort_order',
  'is_active',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Strictly parses the anon-only category RPC projection. Extra columns are rejected
 * so a future SQL change cannot silently expose organization, warehouse or internal data.
 */
export function parsePublicStorefrontCategories(value: unknown): Category[] {
  if (!Array.isArray(value)) {
    throw new Error('أعاد الخادم صيغة غير صالحة لقائمة تصنيفات المتجر العام.');
  }

  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`سجل التصنيف رقم ${index + 1} غير صالح؛ لم تُعرض بيانات غير موثقة.`);
    }

    if (Object.keys(entry).some((key) => !PUBLIC_CATEGORY_FIELDS.has(key))) {
      throw new Error('تحتوي استجابة التصنيفات العامة على حقول غير مسموح بعرضها؛ أُهملت النتائج.');
    }

    if (
      typeof entry.id !== 'string' ||
      !UUID_PATTERN.test(entry.id) ||
      typeof entry.name !== 'string' ||
      !entry.name.trim() ||
      (entry.code !== null && typeof entry.code !== 'string') ||
      (entry.parent_id !== null &&
        (typeof entry.parent_id !== 'string' || !UUID_PATTERN.test(entry.parent_id))) ||
      typeof entry.sort_order !== 'number' ||
      !Number.isSafeInteger(entry.sort_order) ||
      entry.is_active !== true
    ) {
      throw new Error(`بيانات التصنيف العام رقم ${index + 1} غير مكتملة أو غير صالحة.`);
    }

    return {
      id: entry.id,
      name: entry.name,
      name_en: null,
      code: entry.code,
      parent_id: entry.parent_id,
      sort_order: entry.sort_order,
      is_active: true,
      icon: null,
    };
  });
}


/**
 * Unwraps the PostgREST RPC envelope before parsing its public projection.
 * Keep this boundary injectable so the response contract is unit-tested without a live database.
 */
export async function readPublicStorefrontCategories(
  callRpc: () => Promise<{ data: unknown; error: unknown | null; status?: number }>,
): Promise<Category[]> {
  const result = await callRpc();
  if (result.error) {
    // PostgREST keeps the HTTP status on the response envelope, not always on its error object.
    // Preserve the status when rethrowing so retryRead can retry only transient 5xx responses.
    if (typeof result.status === 'number' && result.error && typeof result.error === 'object') {
      const rpcError = result.error as Error & { status?: number };
      try {
        Object.defineProperty(rpcError, 'status', {
          configurable: true,
          value: result.status,
        });
      } catch {
        const wrapped = new Error(rpcError.message || 'Public category RPC failed');
        Object.assign(wrapped, { cause: result.error, status: result.status });
        throw wrapped;
      }
    }
    throw result.error;
  }
  return parsePublicStorefrontCategories(result.data);
}
