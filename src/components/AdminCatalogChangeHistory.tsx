import { useEffect, useState } from 'react';
import { RefreshCw, ScrollText } from 'lucide-react';
import { Empty, ErrorBox, Loading, TableWrap } from '@/components/AdminPages';
import { useAuth } from '@/lib/auth';
import { getCurrentTenantScope, supabase } from '@/lib/supabase';

type CatalogAuditEntity = 'product' | 'category';
type CatalogAuditRow = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
};

const ACTION_LABELS: Record<string, string> = {
  'catalog.product_created': 'إنشاء المنتج',
  'catalog.product_updated': 'تحديث بيانات المنتج',
  'catalog.product_metadata_updated': 'تحديث بيانات العرض والطلب',
  'catalog.product_archived': 'أرشفة المنتج',
  'catalog.category_created': 'إنشاء التصنيف',
  'catalog.category_renamed': 'إعادة تسمية التصنيف',
  'catalog.category_archived': 'أرشفة التصنيف',
  'catalog.category_restored': 'استعادة التصنيف',
  'catalog.category_artwork_updated': 'تغيير رسم التصنيف',
  'pricing_rule.created': 'إنشاء قاعدة تسعير',
  'pricing_rule.updated': 'تعديل قاعدة تسعير',
  'pricing_rule.deleted': 'حذف قاعدة تسعير',
};

function auditDate(value: string): string {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleString('ar-YE', { dateStyle: 'medium', timeStyle: 'short' })
    : 'تاريخ غير صالح';
}

/**
 * Reads only the safe event envelope from the tenant's audit log.
 * Old/new snapshots and all price, margin, cost and secret fields remain server-side.
 */
export function AdminCatalogChangeHistory({
  entityType,
  entityId,
}: {
  entityType: CatalogAuditEntity;
  entityId: string;
}) {
  const { user } = useAuth();
  const canRead = Boolean(user?.roles.some((role) => role === 'admin' || role === 'manager'));
  const [rows, setRows] = useState<CatalogAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      setRows([]);
      if (!canRead) {
        setError('يتطلب سجل تغييرات الكتالوج صلاحية مدير أو مدير النظام.');
        setLoading(false);
        return;
      }
      try {
        const { organizationId } = await getCurrentTenantScope();
        const { data, error: queryError } = await supabase
          .from('audit_logs')
          .select('id,actor_id,action,entity_type,entity_id,created_at')
          .eq('organization_id', organizationId)
          .eq('entity_type', entityType)
          .eq('entity_id', entityId)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(50);
        if (queryError) throw queryError;
        const parsed = (data ?? []).filter((row): row is CatalogAuditRow =>
          typeof row.id === 'string' &&
          typeof row.action === 'string' &&
          row.entity_type === entityType &&
          row.entity_id === entityId &&
          typeof row.created_at === 'string' &&
          (row.actor_id === null || typeof row.actor_id === 'string')
        );
        if (active) setRows(parsed);
      } catch {
        if (active) setError('تعذر قراءة سجل التغييرات. تحقق من صلاحية المؤسسة ثم أعد المحاولة.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [canRead, entityType, entityId, reloadKey]);

  if (!canRead) return null;

  return (
    <section className="panel" aria-label="سجل تغييرات الكتالوج" style={{ marginTop: 16 }}>
      <div className="panel-head">
        <div>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
            <ScrollText size={17} /> سجل التغييرات
          </h3>
          <p className="report-note">أحدث 50 حدثًا موثقًا للكيان الحالي، مع وقت التنفيذ ومعرّف الحساب المنفذ. لا تُعرض لقطات الحقول القديمة والجديدة.</p>
        </div>
        <button type="button" className="btn outline" disabled={loading} onClick={() => {
          setReloadKey((value) => value + 1);
        }} aria-label="تحديث سجل التغييرات">
          <RefreshCw size={15} /> تحديث
        </button>
      </div>
      {loading ? <Loading /> : error ? <ErrorBox message={error} /> : rows.length === 0 ? <Empty text="لا توجد أحداث تدقيق مسجلة لهذا السجل." /> : (
        <TableWrap>
          <table>
            <thead><tr><th>التاريخ والوقت</th><th>التغيير</th><th>المنفذ (معرّف الحساب)</th></tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={row.id}>
                <td>{auditDate(row.created_at)}</td>
                <td>{ACTION_LABELS[row.action] ?? row.action}</td>
                <td><code dir="ltr">{row.actor_id ?? 'النظام'}</code></td>
              </tr>
            ))}</tbody>
          </table>
        </TableWrap>
      )}
      {rows.length === 50 && <p className="report-note">يعرض السجل أحدث 50 حدثًا فقط؛ استخدم سجل التدقيق العام للبحث الأوسع.</p>}
    </section>
  );
}
