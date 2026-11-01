import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarClock, CreditCard, Download, Printer, RefreshCw, ShoppingBag, Wallet } from 'lucide-react';
import { Button, Empty, ErrorBox, Loading, Modal, TableWrap } from '@/components/AdminPages';
import { fetchStaffCustomer360Summary } from '@/lib/api';
import { formatCurrency, formatDateShort, formatNumber } from '@/lib/format';
import type { Customer } from '@/lib/types';
import { getCurrentTenantScope, supabase } from '@/lib/supabase';
import { formatCustomer360Money } from '@/lib/customer-360';
import { downloadStaffCustomer360WorkbookXlsx } from '@/lib/customer-360-xlsx';
import { projectStaffCustomer360PrintDocument } from '@/lib/customer-360-print';
import { Customer360PrintSheet } from '@/components/Customer360PrintSheet';
import type { StaffCustomer360Summary } from '@/lib/customer-360-summary';

const CUSTOMER_SCOPE_BLOCKED_MESSAGE = 'العميل غير موجود في المؤسسة الحالية؛ تم إيقاف عرض ملفه.';
const CUSTOMER360_LOAD_ERROR_MESSAGE = 'تعذر تحميل ملف العميل. تحقق من الاتصال والصلاحية ثم أعد المحاولة.';

const invoiceStatusLabel: Record<string, string> = {
  issued: 'صادرة',
  partially_paid: 'مدفوعة جزئيًا',
  paid: 'مدفوعة',
  void: 'ملغاة',
};

type Customer360HeaderProps = {
  summary: StaffCustomer360Summary | null;
  loading: boolean;
  exportError: string;
  printError: string;
  printDisabled: boolean;
  onReload: () => void;
  onExport: () => void;
  onPrint: () => void;
};

function Customer360Header({
  summary, loading, exportError, printError, printDisabled, onReload, onExport, onPrint,
}: Customer360HeaderProps) {
  return (
    <section className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>{summary ? summary.customer.business_name : 'ملف العميل 360'}</h2>
          {summary && <>
            <p>{summary.customer.customer_code} · {summary.customer.contact_name || 'جهة الاتصال غير محددة'}</p>
            <p>{summary.customer.phone || 'لا يوجد هاتف'} · {summary.customer.email || 'لا يوجد بريد'}</p>
          </>}
        </div>
        <div className="no-print" style={{ display: 'flex', gap: 6 }}>
          <Button variant="secondary" onClick={onReload} disabled={loading}><RefreshCw size={15} /> تحديث</Button>
          <Button variant="outline" onClick={onExport} disabled={loading || !summary}><Download size={15} /> تصدير Excel</Button>
          <Button variant="outline" onClick={onPrint} disabled={loading || printDisabled}><Printer size={15} /> طباعة / PDF</Button>
        </div>
      </div>
      {exportError && <p className="form-error" role="alert">{exportError}</p>}
      {printError && <p className="form-error" role="alert">{printError}</p>}
      <p className="report-note">الرصيد والحد الائتماني أدناه هما القيم المسجلة في بطاقة العميل. إجماليات الطلبات والفوترة والتحصيل أدناه مجاميع خادمية كاملة؛ الجداول التفصيلية تعرض أحدث الحركات فقط، ولا تُنشأ فواتير أو دفعات تاريخية افتراضية.</p>
    </section>
  );
}


function Customer360InitialMetrics({ summary }: { summary: StaffCustomer360Summary }) {
  return (
    <>
      <section className="report-grid">
        <article className="report-metric"><ShoppingBag size={20} /><span>إجمالي الطلبات</span><strong>{formatNumber(summary.order_summary.order_count)}</strong></article>
        <article className="report-metric"><CalendarClock size={20} /><span>طلبات قيد المعالجة</span><strong>{formatNumber(summary.order_summary.pending_order_count)}</strong></article>
        <article className="report-metric"><Wallet size={20} /><span>الرصيد المسجل بالبطاقة</span><strong>{formatCustomer360Money(summary.customer.current_balance, 'YER')}</strong></article>
        <article className="report-metric"><CreditCard size={20} /><span>الحد الائتماني المسجل</span><strong>{formatCustomer360Money(summary.customer.credit_limit, 'YER')}</strong></article>
      </section>
      <p className="report-note" role="status">
        تفاصيل الجداول أدناه تقتصر على أحدث 20 حركة لهذا العميل؛ إجماليات الفوترة والتحصيل والمتأخرات محسوبة خادميًا من دفتر العميل الكامل.
      </p>
    </>
  );
}

function Customer360OrderOverview({
  summary,
  overdueInvoiceCount,
}: {
  summary: StaffCustomer360Summary;
  overdueInvoiceCount: number;
}) {
  const amount = summary.order_summary.non_cancelled_order_value;
  return (
    <section className="panel">
      <h3>ملخص الحركات المعروضة</h3>
      <p>
        قيمة الطلبات غير الملغاة من سجل العميل الكامل:{" "}
        <strong>{amount === null ? 'غير متاحة بسبب مبلغ غير صالح أو تجاوز دقة الحساب' : formatCurrency(amount)}</strong>
      </p>
      <p>
        طلبات منفذة: {formatNumber(summary.order_summary.fulfilled_order_count)} ·
        ملغاة: {formatNumber(summary.order_summary.cancelled_order_count)} ·
        فواتير متأخرة من الدفتر الكامل: {formatNumber(overdueInvoiceCount)}
      </p>
      {summary.order_summary.invalid_order_amount_count > 0 ? (
        <p className="form-error">
          بعض مبالغ الطلبات غير صالحة؛ تم تعطيل جمع إجمالي قيمة الطلبات بدل اعتبار القيم غير المعروفة أصفارًا.
        </p>
      ) : null}
    </section>
  );
}

function Customer360FullOrderMetrics({ summary }: { summary: StaffCustomer360Summary }) {
  const order = summary.order_summary;
  return (
    <div className="report-grid">
      <article className="report-metric"><ShoppingBag size={20} /><span>إجمالي الطلبات</span><strong>{formatNumber(order.order_count)}</strong><small>من سجل العميل الكامل</small></article>
      <article className="report-metric"><Wallet size={20} /><span>قيمة الطلبات غير الملغاة</span><strong>{order.non_cancelled_order_value === null ? 'غير متاح' : formatCurrency(order.non_cancelled_order_value)}</strong><small>المبالغ غير الصالحة: {formatNumber(order.invalid_order_amount_count)}</small></article>
      <article className="report-metric"><CalendarClock size={20} /><span>متوسط قيمة الطلب</span><strong>{order.average_order_value === null ? 'غير متاح' : formatCurrency(order.average_order_value)}</strong><small>بحسب الطلبات غير الملغاة</small></article>
      <article className="report-metric"><ShoppingBag size={20} /><span>آخر طلب</span><strong>{order.last_order_at ? formatDateShort(order.last_order_at) : 'لا يوجد'}</strong><small>{order.days_since_last_order === null ? 'الفترة غير متاحة' : 'منذ ' + formatNumber(order.days_since_last_order) + ' يومًا'}</small></article>
      <article className="report-metric"><CalendarClock size={20} /><span>متوسط المدة بين الطلبات</span><strong>{order.average_days_between_orders === null ? 'غير متاح' : formatNumber(order.average_days_between_orders) + ' يوم'}</strong><small>يحسب من تواريخ الطلبات المسجلة</small></article>
      <article className="report-metric"><CreditCard size={20} /><span>طلبات معلقة / منفذة</span><strong>{formatNumber(order.pending_order_count)} / {formatNumber(order.fulfilled_order_count)}</strong><small>الملغاة أو المرفوضة: {formatNumber(order.cancelled_order_count)}</small></article>
    </div>
  );
}

function Customer360FinanceByCurrency({ summary }: { summary: StaffCustomer360Summary }) {
  if (summary.finance_by_currency.length === 0) {
    return <Empty text="لا توجد فواتير مسجلة لهذا العميل." />;
  }
  return (
    <TableWrap>
      <table>
        <thead>
          <tr>
            <th>العملة</th><th>الفواتير</th><th>إجمالي الفواتير</th><th>المسدّد</th>
            <th>الإشعارات الدائنة المرحلة</th><th>المتبقي</th><th>فواتير متأخرة</th><th>متأخرات</th>
          </tr>
        </thead>
        <tbody>
          {summary.finance_by_currency.map((row) => (
            <tr key={row.currency}>
              <td>{row.currency}</td><td>{formatNumber(row.invoice_count)}</td>
              <td>{formatCustomer360Money(row.invoiced_total, row.currency)}</td>
              <td>{formatCustomer360Money(row.paid_total, row.currency)}</td>
              <td>{formatCustomer360Money(row.credit_memo_total, row.currency)}</td>
              <td>{formatCustomer360Money(row.outstanding_total, row.currency)}</td>
              <td>{formatNumber(row.overdue_invoice_count)}</td>
              <td>{formatCustomer360Money(row.overdue_outstanding, row.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

function Customer360TopProducts({ summary }: { summary: StaffCustomer360Summary }) {
  if (summary.top_products.length === 0) {
    return <Empty text="لا توجد بنود طلبات قابلة للترتيب لهذا العميل." />;
  }
  return (
    <TableWrap>
      <table>
        <thead><tr><th>الصنف</th><th>الكمية</th><th>قيمة البنود</th><th>آخر شراء</th></tr></thead>
        <tbody>
          {summary.top_products.map((product) => (
            <tr key={product.item_code + ':' + product.product_name}>
              <td><strong>{product.product_name}</strong><small style={{ display: 'block' }}>{product.item_code || 'دون رمز صنف'}</small></td>
              <td>{formatNumber(product.quantity)}</td>
              <td>{formatCustomer360Money(product.sales, 'YER')}</td>
              <td>{product.last_purchased_at ? formatDateShort(product.last_purchased_at) : 'غير متاح'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

function Customer360RecommendationCard({
  recommendation,
}: {
  recommendation: StaffCustomer360Summary["recommendations"][number];
}) {
  const priority = recommendation.priority === 'high'
    ? 'أولوية عالية'
    : recommendation.priority === 'medium' ? 'أولوية متوسطة' : 'أولوية منخفضة';

  return (
    <article style={{ border: '1px solid var(--border, #d7e1e0)', borderRadius: 10, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <strong>{recommendation.title}</strong>
        <span className="badge">{priority}</span>
      </div>
      <p>{recommendation.description}</p>
      {recommendation.currency && recommendation.overdue_outstanding !== undefined ? (
        <p>
          <strong>المبلغ المتأخر: {formatCustomer360Money(recommendation.overdue_outstanding, recommendation.currency)}</strong>
          {" · "}فواتير: {recommendation.overdue_invoice_count === undefined ? 'غير متاح' : formatNumber(recommendation.overdue_invoice_count)}
        </p>
      ) : null}
      {recommendation.pending_order_count !== undefined ? <p>الطلبات المعلقة: {formatNumber(recommendation.pending_order_count)}</p> : null}
      {recommendation.days_since_last_order !== undefined ? <p>الأيام منذ آخر طلب: {formatNumber(recommendation.days_since_last_order)}</p> : null}
      <small>{recommendation.action}</small>
    </article>
  );
}

function Customer360Recommendations({ summary }: { summary: StaffCustomer360Summary }) {
  if (summary.recommendations.length === 0) {
    return (
      <p className="report-note">
        لا توجد توصية ضمن قواعد التنبيه الحالية (متأخرات مسجلة، طلبات معلقة، أو انقطاع طلبات 30 يومًا). لا يعني ذلك غياب جميع المخاطر.
      </p>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {summary.recommendations.map((recommendation, index) => (
        <Customer360RecommendationCard key={recommendation.type + ':' + index} recommendation={recommendation} />
      ))}
    </div>
  );
}

function Customer360FullAnalysis({ summary }: { summary: StaffCustomer360Summary }) {
  return (
    <section className="panel">
      <h3>التحليل الكامل لملف العميل</h3>
      <p className="report-note">
        المؤشرات أدناه محسوبة في قاعدة البيانات من سجل المؤسسة كاملًا. تفاصيل الجداول الأخرى محدودة بآخر 20 حركة؛ القيم غير الصالحة تبقى «غير متاحة».
      </p>
      <Customer360FullOrderMetrics summary={summary} />
      <h3 style={{ marginTop: 18 }}>ملخص الفواتير والتحصيل الكامل حسب العملة</h3>
      <Customer360FinanceByCurrency summary={summary} />
      <h3 style={{ marginTop: 18 }}>المنتجات الأكثر شراءً من العميل</h3>
      <Customer360TopProducts summary={summary} />
      <h3 style={{ marginTop: 18 }}>إشارات المتابعة المبنية على السجل</h3>
      <Customer360Recommendations summary={summary} />
      <p className="report-note" style={{ marginTop: 12 }}>
        آخر احتساب: {formatDateShort(summary.generated_at)}. هذه إشارات تشغيلية حتمية وليست توصيات مولدة بالذكاء الاصطناعي.
      </p>
    </section>
  );
}

function Customer360RecentOrders({ summary }: { summary: StaffCustomer360Summary }) {
  if (summary.recent_orders.length === 0) return <Empty text="لا توجد طلبات لهذا العميل." />;
  return (
    <TableWrap>
      <table>
        <thead><tr><th>رقم الطلب</th><th>التاريخ</th><th>الحالة</th><th>الأصناف</th><th>الإجمالي</th></tr></thead>
        <tbody>
          {summary.recent_orders.map((order) => (
            <tr key={order.id}>
              <td>{order.order_number}</td><td>{formatDateShort(order.created_at)}</td><td>{order.status}</td>
              <td>{order.total_items === null ? '—' : formatNumber(order.total_items)}</td>
              <td>{order.total_amount === null ? 'غير متاح' : formatCurrency(order.total_amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

function Customer360RecentInvoices({ summary }: { summary: StaffCustomer360Summary }) {
  if (summary.recent_invoices.length === 0) return <Empty text="لا توجد فواتير مسجلة لهذا العميل." />;
  return (
    <TableWrap>
      <table>
        <thead><tr><th>الفاتورة</th><th>الإصدار</th><th>الاستحقاق</th><th>الحالة</th><th>الإجمالي</th><th>المسدّد</th><th>الإشعار الدائن المرحّل</th><th>المتبقي</th></tr></thead>
        <tbody>
          {summary.recent_invoices.map((invoice) => (
            <tr key={invoice.id}>
              <td>{invoice.invoice_number}</td>
              <td>{invoice.issued_at ? formatDateShort(invoice.issued_at) : 'غير محدد'}</td>
              <td>{invoice.due_at ? formatDateShort(invoice.due_at) : 'غير محدد'}</td>
              <td>{invoiceStatusLabel[invoice.status] ?? invoice.status}</td>
              <td>{formatCustomer360Money(invoice.total_amount, invoice.currency)}</td>
              <td>{formatCustomer360Money(invoice.paid_amount, invoice.currency)}</td>
              <td>{formatCustomer360Money(invoice.credit_memo_amount, invoice.currency)}</td>
              <td>{formatCustomer360Money(invoice.outstanding_amount, invoice.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

function Customer360RecentPayments({ summary }: { summary: StaffCustomer360Summary }) {
  if (summary.recent_payments.length === 0) return <Empty text="لا توجد دفعات مسجلة لهذا العميل." />;
  return (
    <TableWrap>
      <table>
        <thead><tr><th>التاريخ</th><th>الفاتورة</th><th>طريقة الدفع</th><th>المبلغ</th></tr></thead>
        <tbody>
          {summary.recent_payments.map((payment) => {
            const relatedInvoice = summary.recent_invoices.find((invoice) => invoice.id === payment.invoice_id);
            return (
              <tr key={payment.id}>
                <td>{formatDateShort(payment.paid_at)}</td>
                <td>{relatedInvoice?.invoice_number ?? 'خارج أحدث 20 فاتورة'}</td>
                <td>{payment.payment_method ?? 'غير محددة'}</td>
                <td>{relatedInvoice ? formatCustomer360Money(payment.amount, relatedInvoice.currency) : 'غير متاح — عملة الفاتورة خارج أحدث 20 فاتورة'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableWrap>
  );
}

function Customer360RecentActivity({ summary }: { summary: StaffCustomer360Summary }) {
  return (
    <>
      <section className="panel">
        <h3>آخر الطلبات ({formatNumber(summary.recent_orders.length)} معروضة من {formatNumber(summary.order_summary.order_count)} طلب)</h3>
        <Customer360RecentOrders summary={summary} />
      </section>
      <section className="panel">
        <h3>آخر الفواتير ({formatNumber(summary.recent_invoices.length)} معروضة)</h3>
        <Customer360RecentInvoices summary={summary} />
      </section>
      <section className="panel">
        <h3>آخر الدفعات ({formatNumber(summary.recent_payments.length)} معروضة)</h3>
        <Customer360RecentPayments summary={summary} />
      </section>
    </>
  );
}

function Customer360LoadedView({
  summary,
  overdueInvoiceCount,
}: {
  summary: StaffCustomer360Summary;
  overdueInvoiceCount: number;
}) {
  return (
    <>
      <Customer360InitialMetrics summary={summary} />
      <Customer360OrderOverview summary={summary} overdueInvoiceCount={overdueInvoiceCount} />
      <Customer360FullAnalysis summary={summary} />
      <Customer360RecentActivity summary={summary} />
    </>
  );
}

export function AdminCustomer360({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [summary, setSummary] = useState<StaffCustomer360Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportError, setExportError] = useState('');
  const [printError, setPrintError] = useState('');

  const loadCustomer360 = useCallback(async () => {
    setSummary(null);
    setLoading(true);
    setError('');
    setExportError('');
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
        throw new Error(CUSTOMER_SCOPE_BLOCKED_MESSAGE);
      }
      const customerSummary = await fetchStaffCustomer360Summary(customer.id);
      setSummary(customerSummary);
    } catch (cause) {
      setSummary(null);
      setError(cause instanceof Error && cause.message === CUSTOMER_SCOPE_BLOCKED_MESSAGE ? CUSTOMER_SCOPE_BLOCKED_MESSAGE : CUSTOMER360_LOAD_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  }, [customer.id]);

  useEffect(() => { void loadCustomer360(); }, [loadCustomer360]);

  async function reload() {
    await loadCustomer360();
  }

  const overdueInvoiceCount = summary?.finance_by_currency.reduce((total, row) => total + row.overdue_invoice_count, 0) ?? 0;
  const printDocument = useMemo(() => {
    if (!summary) return null;
    try {
      return projectStaffCustomer360PrintDocument(summary);
    } catch {
      return null;
    }
  }, [summary]);

  function exportCustomer360() {
    if (!summary) return;
    setExportError('');
    try {
      downloadStaffCustomer360WorkbookXlsx(summary);
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : 'تعذر إنشاء ملف العميل 360.');
    }
  }

  function printCustomer360() {
    if (!printDocument || typeof window === 'undefined' || typeof window.print !== 'function') {
      setPrintError('تعذر تجهيز نسخة الطباعة من بيانات العميل الحالية.');
      return;
    }
    setPrintError('');
    window.print();
  }
  return <Modal title={summary ? 'ملف العميل 360 — ' + summary.customer.business_name : 'ملف العميل 360'} onClose={onClose}>
    <div style={{ display: 'grid', gap: 14, maxHeight: '75vh', overflowY: 'auto', padding: 2 }}>
      <Customer360Header
        summary={summary}
        loading={loading}
        exportError={exportError}
        printError={printError}
        printDisabled={!printDocument}
        onReload={() => { void reload(); }}
        onExport={exportCustomer360}
        onPrint={printCustomer360}
      />
      {loading ? <Loading /> : error ? <ErrorBox message={error} /> : summary ? (
        <Customer360LoadedView
          summary={summary}
          overdueInvoiceCount={overdueInvoiceCount}
        />
      ) : null}   </div>
    {printDocument && typeof document !== 'undefined' ? createPortal(<Customer360PrintSheet document={printDocument} />, document.body) : null}
  </Modal>;
}
