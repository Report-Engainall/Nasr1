import { getCurrentTenantScope, supabase } from '@/lib/supabase';

export interface AdminCategoryProductRow {
  id: string;
  name: string;
  item_code: string;
  unit: string;
  status: string | null;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function fetchAdminCategoryProducts(categoryId: string): Promise<AdminCategoryProductRow[]> {
  if (!UUID.test(categoryId)) throw new Error('معرّف التصنيف غير صالح.');
  const { organizationId } = await getCurrentTenantScope();
  const { data, error } = await supabase.from('products')
    .select('id,name,item_code,unit,status')
    .eq('organization_id', organizationId)
    .eq('category_id', categoryId)
    .order('name', { ascending: true })
    .limit(100);
  if (error) throw new Error('تعذر تحميل المنتجات المرتبطة بالتصنيف: ' + error.message);
  return (data ?? []).map((row) => {
    if (typeof row.id !== 'string' || typeof row.name !== 'string' || typeof row.item_code !== 'string'
      || typeof row.unit !== 'string' || (row.status !== null && row.status !== undefined && typeof row.status !== 'string')) {
      throw new Error('أعاد مصدر المنتجات المرتبطة سجلاً غير مكتمل؛ تم إيقاف العرض.');
    }
    return { id: row.id, name: row.name, item_code: row.item_code, unit: row.unit, status: typeof row.status === 'string' ? row.status : null };
  });
}
