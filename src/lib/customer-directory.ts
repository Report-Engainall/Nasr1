import type { Customer } from './types';
import { getCurrentTenantScope, supabase } from './supabase';

export type CustomerDirectoryRequest = {
  search?: string;
  page?: number;
  pageSize?: number;
};

export type CustomerDirectoryPage = {
  rows: Customer[];
  totalCount: number;
  page: number;
  pageSize: number;
};

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const CUSTOMER_DIRECTORY_COLUMNS = 'id,business_name,contact_name,phone,email,customer_code,tier,current_balance,credit_limit,status,created_at';

/** Remove PostgREST filter grammar and wildcard characters from user-provided search text. */
export function normalizeCustomerDirectorySearch(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s+-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/** Tenant-scoped server-side customer directory with exact count and bounded result pages. */
export async function fetchCustomerDirectoryPage(input: CustomerDirectoryRequest = {}): Promise<CustomerDirectoryPage> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('إعدادات دليل العملاء غير صالحة.');
  }
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;
  if (!Number.isSafeInteger(page) || page < 1) throw new Error('رقم صفحة العملاء غير صالح.');
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new Error('حجم صفحة العملاء خارج النطاق المسموح.');
  }
  if (input.search !== undefined && typeof input.search !== 'string') {
    throw new Error('عبارة البحث عن العملاء غير صالحة.');
  }

  const rawSearch = input.search ?? '';
  // Allow a complete, validated email address to be searched without removing its separators.
  // The allowlist excludes commas, parentheses, wildcards, and PostgREST filter operators.
  const emailSearch = rawSearch.normalize('NFKC').trim().toLowerCase();
  const isEmailSearch = emailSearch.length <= 254 &&
    /^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,63}$/i.test(emailSearch);
  const search = isEmailSearch ? emailSearch : normalizeCustomerDirectorySearch(rawSearch);
  const scope = await getCurrentTenantScope();
  if (!scope.isStaff || !scope.organizationId) {
    throw new Error('صلاحية موظف المؤسسة مطلوبة لفتح دليل العملاء.');
  }

  async function readPage(pageToRead: number): Promise<CustomerDirectoryPage> {
    let request = supabase
      .from('customers')
      .select(CUSTOMER_DIRECTORY_COLUMNS, { count: 'exact' })
      .eq('organization_id', scope.organizationId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

    if (search) {
      const pattern = `%${search}%`;
      request = request.or([
        `business_name.ilike.${pattern}`,
        `contact_name.ilike.${pattern}`,
        `phone.ilike.${pattern}`,
        `email.ilike.${pattern}`,
        `customer_code.ilike.${pattern}`,
      ].join(','));
    }

    const { data, error, count } = await request.range(
      (pageToRead - 1) * pageSize,
      pageToRead * pageSize - 1,
    );
    if (error) {
      throw new Error('تعذر تحميل دليل العملاء: ' + error.message);
    }
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
      throw new Error('تعذر تأكيد إجمالي العملاء. أعد المحاولة قبل الاعتماد على القائمة.');
    }

    return {
      rows: (data ?? []) as Customer[],
      totalCount: count,
      page: pageToRead,
      pageSize,
    };
  }

  let requestedPage = page;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await readPage(requestedPage);
    const lastPage = Math.max(1, Math.ceil(result.totalCount / pageSize));
    if (requestedPage <= lastPage) return result;
    requestedPage = lastPage;
  }

  throw new Error('تغيّر عدد العملاء أثناء التصفح. اضغط تحديث لإعادة المحاولة.');
}
