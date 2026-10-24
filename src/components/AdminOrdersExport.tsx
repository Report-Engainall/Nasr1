import { useEffect, useState } from 'react';
import { Download, RefreshCw, ShieldAlert } from 'lucide-react';
import { fetchOrders } from '@/lib/api';
import { AdminPage, Button, Empty, ErrorBox, Loading, TableWrap } from '@/components/AdminPages';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { buildOrdersCsv } from '@/lib/orders-csv-export';
import type { OrderWithCustomer } from '@/lib/types';

const ORDER_EXPORT_ROLES = ['admin', 'manager', 'staff', 'accountant'] as const;
const FINANCE_EXPORT_ROLES = ['admin', 'manager', 'accountant'] as const;
const PREVIEW_LIMIT = 25;

function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function orderCountLabel(count: number): string {
  return count.toLocaleString('ar-YE') + ' طلب';
}

export function AdminOrdersExport() {
  const { user, ready } = useAuth();
  const roles = user?.roles ?? [];
  const canRead = roles.some((role) => (ORDER_EXPORT_ROLES as readonly string[]).includes(role));
  const canExportAmounts = roles.some((role) => (FINANCE_EXPORT_ROLES as readonly string[]).includes(role));
  const [orders, setOrders] = useState<OrderWithCustomer[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [exportNotice, setExportNotice] = useState('');

  useEffect(() => {
    let active = true;
    setExportNotice('');
    if (!ready) {
      setLoading(true);
      return () => { active = false; };
    }
    if (!canRead) {
      setOrders(null);
      setError('تصدير الطلبات متاح لفريق الإدارة والتشغيل المخول فقط.');
      setLoading(false);
      return () => { active = false; };
    }

    setOrders(null);
    setError('');
    setLoading(true);
    void fetchOrders()
      .then((rows) => { if (active) setOrders(rows); })
      .catch((cause: unknown) => {
        if (active) {
          setOrders(null);
          setError(cause instanceof Error ? cause.message : 'تعذر تحميل الطلبات من الخادم.');
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [canRead, ready, reloadKey]);

  function exportOrders() {
    if (!canRead || !orders?.length) return;
    try {
      const csv = buildOrdersCsv(orders, canExportAmounts);
      const date = new Date().toISOString().slice(0, 10);
      downloadCsv(csv, 'aghbari-orders-' + date + '.csv');
      setExportNotice('تم بدء تنزيل ملف CSV لعدد ' + orderCountLabel(orders.length) +
        (canExportAmounts ? ' مع الإجماليات المالية المصرح بها.' : ' دون أعمدة مالية.'));
    } catch (cause) {
      setExportNotice(cause instanceof Error ? 'تعذر تجهيز الملف: ' + cause.message : 'تعذر تجهيز ملف التصدير.');
    }
  }

  return <div dir="rtl">
    <AdminPage
      eyebrow="التقارير والتسليم"
      title="تصدير الطلبات"
      description="ملف CSV مبني على سجلات الطلبات التي أعادها الخادم ضمن المؤسسة الحالية، دون بيانات اصطناعية."
      icon={Download}
      note={!ready ? 'جارٍ التحقق من الحساب...' : !canRead ? 'الصلاحية غير متاحة' : loading ? 'جارٍ تحميل الطلبات...' : error ? 'تعذر تأكيد البيانات' : 'السجلات المتاحة للتصدير: ' + orderCountLabel(orders?.length ?? 0)}
      toolbar={<>
        <Button variant="secondary" onClick={() => setReloadKey((value) => value + 1)} disabled={!ready || loading || !canRead}><RefreshCw size={16} /> تحديث</Button>
        <Button onClick={exportOrders} disabled={!canRead || loading || Boolean(error) || !orders?.length}><Download size={16} /> تنزيل CSV</Button>
      </>}
    >
      {!ready ? <Loading /> : !canRead ? (
        <section className="panel" role="alert"><ShieldAlert size={24} /><h2>الصلاحية غير متاحة</h2><p>لا يجرى استعلام الطلبات لهذا الحساب. استخدم حسابًا مخولًا ضمن المؤسسة.</p></section>
      ) : loading ? <Loading /> : error ? <div><ErrorBox message={error} /><Button variant="secondary" onClick={() => setReloadKey((value) => value + 1)}><RefreshCw size={16} /> إعادة المحاولة</Button></div> : !orders?.length ? (
        <Empty text="لم يرجع الخادم أي طلبات قابلة للتصدير؛ لم يتم إنشاء ملف فارغ." />
      ) : <>
        <section className="panel" style={{ marginBottom: 16 }}>
          <h2>حدود التصدير</h2>
          <p>يضم الملف كل الطلبات التي أعادتها خدمة الخادم المقيّدة بالمؤسسة الحالية. معاينة الشاشة محدودة بأحدث {Math.min(PREVIEW_LIMIT, orders.length).toLocaleString('ar-YE')} سجل؛ لا يحد ذلك من عدد السجلات في الملف.</p>
          <p>{canExportAmounts ? 'يتضمن الملف الإجمالي المالي لأن الدور الحالي مخول بذلك.' : 'لا يتضمن الملف أي عمود مالي؛ حساب التشغيل لا يحصل على إجماليات مالية في ملف التصدير.'}</p>
        </section>
        {exportNotice && <p role="status" aria-live="polite" className="panel" style={{ marginBottom: 16 }}>{exportNotice}</p>}
        <TableWrap>
          <table>
            <thead><tr>
              <th>رقم الطلب</th><th>التاريخ</th><th>العميل</th><th>الحالة</th><th>الأصناف</th>
              {canExportAmounts && <th>الإجمالي</th>}
            </tr></thead>
            <tbody>
              {orders.slice(0, PREVIEW_LIMIT).map((order) => (
                <tr key={order.id}>
                  <td>{order.order_code || 'غير متاح'}</td>
                  <td>{order.created_at ? formatDateShort(order.created_at) : 'غير متاح'}</td>
                  <td>{order.customer?.full_name || 'غير متاح'}</td>
                  <td>{order.status || 'غير متاح'}</td>
                  <td>{typeof order.total_items === 'number' && Number.isSafeInteger(order.total_items) ? order.total_items.toLocaleString('ar-YE') : 'غير متاح'}</td>
                  {canExportAmounts && <td>{typeof order.total_amount === 'number' && Number.isFinite(order.total_amount) ? formatCurrency(order.total_amount) : 'غير متاح'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        {orders.length > PREVIEW_LIMIT && <p role="status" style={{ marginTop: 12 }}>تعرض المعاينة {PREVIEW_LIMIT} سجلًا من أصل {orderCountLabel(orders.length)}، بينما يضم ملف التصدير جميع السجلات المتاحة.</p>}
      </>}
    </AdminPage>
  </div>;
}
