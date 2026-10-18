import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, CreditCard, Printer, RefreshCw, ShoppingBag, Wallet } from 'lucide-react';
import { Button, Empty, ErrorBox, Loading, Modal, TableWrap } from '@/components/AdminPages';
import { fetchOrders } from '@/lib/api';
import { formatCurrency, formatDateShort, formatNumber } from '@/lib/format';
import type { Customer } from '@/lib/types';
import { getCurrentTenantScope, supabase } from '@/lib/supabase';
import { projectCustomer360, type Customer360Projection } from '@/lib/customer-360';

function customer360Money(value: number | null, currency = 'YER'): string {
  if (value === null || !Number.isFinite(value)) return 'غير متاح';
  return new Intl.NumberFormat('ar-YE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + ' ' + currency;
}

const invoiceStatusLabel: Record<string, string> = {
  issued: 'صادرة',
  partially_paid: 'مدفوعة جزئيًا',
  paid: 'مدفوعة',
  void: 'ملغاة',
};

export function AdminCustomer360({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [projection, setProjection] = useState<Customer360Projection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function reload() {
    setLoading(true);
    setError('');
    try {
      const scope = await getCurrentTenantScope();
      const { data: scopedCustomer, error: scopedCustomerError } = await supabase
        .from('customers')
        .select('id')
        .eq('organization_id', scope.organizationId)
        .eq('id', customer.id)
        .maybeSingle();
      if (scopedCustomerError) throw scopedCustomerError;
      if (!scopedCustomer || scopedCustomer.id !== customer.id) {
        throw new Error('العميل غير موجود في المؤسسة الحالية؛ تم إيقاف عرض ملفه.');
      }
      const [orders, financeResult] = await Promise.all([
        fetchOrders(),
        supabase.rpc('fetch_staff_finance_data'),
      ]);
      if (financeResult.error) throw financeResult.error;
      setProjection(projectCustomer360(orders, financeResult.data, customer.id));
    } catch (cause) {
      setProjection(null);
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل ملف العميل.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const scope = await getCurrentTenantScope();
        const { data: scopedCustomer, error: scopeError } = await supabase
          .from('customers').select('id').eq('organization_id', scope.organizationId).eq('id', customer.id).maybeSingle();
        if (scopeError) throw scopeError;
        if (!scopedCustomer || scopedCustomer.id !== customer.id) throw new Error('العميل غير موجود ضمن المؤسسة الحالية.');
        const [orders, financeResult] = await Promise.all([fetchOrders(), supabase.rpc('fetch_staff_finance_data')]);
        if (financeResult.error) throw financeResult.error;
        if (active) setProjection(projectCustomer360(orders, financeResult.data, customer.id));
      } catch (cause) {
        if (active) { setProjection(null); setError(cause instanceof Error ? cause.message : 'تعذر تحميل ملف العميل.'); }
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [customer.id]);

  const m = projection?.metrics;
  return <Modal title={'ملف العميل 360 — ' + customer.business_name} onClose={onClose}>
    <div style={{ display: 'grid', gap: 14, maxHeight: '75vh', overflowY: 'auto', padding: 2 }}>
      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div><h2 style={{ margin: 0 }}>{customer.business_name}</h2><p>{customer.customer_code} · {customer.contact_name || 'جهة الاتصال غير محددة'}</p><p>{customer.phone || 'لا يوجد هاتف'} · {customer.email || 'لا يوجد بريد'}</p></div>
          <div className="no-print" style={{ display: 'flex', gap: 6 }}><Button variant="secondary" onClick={() => void reload()} disabled={loading}><RefreshCw size={15} /> تحديث</Button><Button variant="outline" onClick={() => window.print()}><Printer size={15} /> طباعة</Button></div>
        </div>
        <p className="report-note">الرصيد والحد الائتماني أدناه هما القيم المسجلة في بطاقة العميل. الحركات المحاسبية المعروضة تأتي من RPC المالي الحالي، ولا تُنشأ فواتير أو دفعات تاريخية افتراضية.</p>
      </section>
      {loading ? <Loading /> : error ? <ErrorBox message={error} /> : projection && <>
        <section className="report-grid">
          <article className="report-metric"><ShoppingBag size={20} /><span>الطلبات المحمّلة</span><strong>{formatNumber(m?.order_count ?? 0)}</strong></article>
          <article className="report-metric"><CalendarClock size={20} /><span>طلبات قيد المعالجة</span><strong>{formatNumber(m?.pending_order_count ?? 0)}</strong></article>
          <article className="report-metric"><Wallet size={20} /><span>الرصيد المسجل بالبطاقة</span><strong>{formatCurrency(Number(customer.current_balance ?? 0))}</strong></article>
          <article className="report-metric"><CreditCard size={20} /><span>الحد الائتماني المسجل</span><strong>{formatCurrency(Number(customer.credit_limit ?? 0))}</strong></article>
        </section>
        {(projection.potentially_partial.invoices || projection.potentially_partial.payments) && <div className="form-error" role="status"><AlertTriangle size={16} /> البيانات المالية محكومة بحدود RPC الحالية: 500 فاتورة و1000 دفعة للمؤسسة. تظهر القوائم الحديثة فقط عند بلوغ هذه الحدود؛ لا يُعرض هذا الملف ككشف حساب تاريخي كامل.</div>}
        <section className="panel">
          <h3>ملخص الحركات المعروضة</h3>
          <p>قيمة الطلبات غير الملغاة ضمن النتائج: <strong>{m?.non_cancelled_order_value === null ? 'غير متاحة بسبب مبلغ غير صالح أو تجاوز دقة الحساب' : formatCurrency(m?.non_cancelled_order_value ?? 0)}</strong></p>
          <p>طلبات منفذة: {formatNumber(m?.fulfilled_order_count ?? 0)} · ملغاة: {formatNumber(m?.cancelled_order_count ?? 0)} · فواتير متأخرة ضمن القائمة المحمّلة: {formatNumber(m?.overdue_invoice_count_loaded ?? 0)}</p>
          {(m?.invalid_order_amount_count ?? 0) > 0 && <p className="form-error">بعض مبالغ الطلبات غير صالحة؛ تم تعطيل جمع إجمالي قيمة الطلبات بدل اعتبار القيم غير المعروفة أصفارًا.</p>}
        </section>
        <section className="panel">
          <h3>آخر الطلبات ({formatNumber(m?.order_count ?? 0)} ضمن النتائج المحمّلة)</h3>
          {!projection.orders.length ? <Empty text="لا توجد طلبات لهذا العميل." /> : <TableWrap><table><thead><tr><th>رقم الطلب</th><th>التاريخ</th><th>الحالة</th><th>الأصناف</th><th>الإجمالي</th></tr></thead><tbody>{projection.orders.map((order) => <tr key={order.id}><td>{order.order_number}</td><td>{formatDateShort(order.created_at)}</td><td>{order.status}</td><td>{order.total_items === null ? '—' : formatNumber(order.total_items)}</td><td>{order.total_amount === null ? 'غير متاح' : formatCurrency(order.total_amount)}</td></tr>)}</tbody></table></TableWrap>}
        </section>
        <section className="panel">
          <h3>آخر الفواتير ({formatNumber(m?.invoice_count_loaded ?? 0)} فاتورة محمّلة)</h3>
          {!projection.invoices.length ? <Empty text="لا توجد فواتير مسجلة لهذا العميل في نتيجة RPC الحالية." /> : <TableWrap><table><thead><tr><th>الفاتورة</th><th>الإصدار</th><th>الاستحقاق</th><th>الحالة</th><th>الإجمالي</th><th>المسدّد من الدفعات المحمّلة</th><th>المتبقي المحسوب</th></tr></thead><tbody>{projection.invoices.map((invoice) => <tr key={invoice.id}><td>{invoice.invoice_number}</td><td>{formatDateShort(invoice.issued_at)}</td><td>{invoice.due_at ? formatDateShort(invoice.due_at) : 'غير محدد'}</td><td>{invoiceStatusLabel[invoice.status] ?? invoice.status}</td><td>{customer360Money(invoice.total_amount, invoice.currency)}</td><td>{customer360Money(invoice.paid_amount, invoice.currency)}</td><td>{customer360Money(invoice.outstanding_amount, invoice.currency)}</td></tr>)}</tbody></table></TableWrap>}
        </section>
        <section className="panel">
          <h3>آخر الدفعات ({formatNumber(m?.payment_count_loaded ?? 0)} دفعة محمّلة)</h3>
          {!projection.payments.length ? <Empty text="لا توجد دفعات مسجلة لهذا العميل في نتيجة RPC الحالية." /> : <TableWrap><table><thead><tr><th>التاريخ</th><th>الفاتورة</th><th>طريقة الدفع</th><th>المبلغ</th></tr></thead><tbody>{projection.payments.map((payment) => <tr key={payment.id}><td>{formatDateShort(payment.paid_at)}</td><td>{projection.invoices.find((invoice) => invoice.id === payment.invoice_id)?.invoice_number ?? payment.invoice_id.slice(0, 8)}</td><td>{payment.payment_method}</td><td>{customer360Money(payment.amount, projection.invoices.find((invoice) => invoice.id === payment.invoice_id)?.currency ?? 'YER')}</td></tr>)}</tbody></table></TableWrap>}
        </section>
      </>}
    </div>
  </Modal>;
}
