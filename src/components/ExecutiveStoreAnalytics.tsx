import { BarChart3, Package, RefreshCw, ShoppingCart, TrendingUp, Users } from 'lucide-react';
import { Empty, ErrorBox, Loading } from '@/components/AdminPages';
import { fetchStoreExecutiveAnalytics } from '@/lib/api';
import { buildSalesForecast } from '@/lib/sales-forecast';
import { formatCurrency, formatDateShort, formatNumber } from '@/lib/format';
import { useFetch } from '@/lib/useFetch';

function SalesForecastPanel({ points }: { points: ReadonlyArray<{ day: string; orders: number; sales: number }> }) {
  const forecast = buildSalesForecast(points);

  if (!forecast.ready) {
    const reason = forecast.reason === 'insufficient_history'
      ? 'يلزم 21 يومًا متتاليًا على الأقل قبل إظهار تقدير قابل للاختبار.'
      : forecast.reason === 'missing_days'
        ? 'توجد فجوات في تواريخ المصدر. لم تُحوّل الأيام المفقودة إلى مبيعات صفرية.'
        : 'توجد تواريخ أو قيم مبيعات غير صالحة؛ أُوقف التقدير بدل تخمين القيم.';
    return (
      <section className="panel" style={{ marginTop: 16 }} aria-live="polite">
        <div className="panel-head">
          <div>
            <h3>التقدير التنبؤي للمبيعات</h3>
            <p>لا يُعرض التقدير إلا بعد فحص اكتمال السلسلة التاريخية وصلاحية مبالغها.</p>
          </div>
          <TrendingUp size={20} />
        </div>
        <p className="report-note">{reason} الأيام الصالحة المتاحة: {forecast.availableDays}.</p>
      </section>
    );
  }

  return (
    <section className="panel" style={{ marginTop: 16 }}>
      <div className="panel-head">
        <div>
          <h3>التقدير التنبؤي للمبيعات — 7 أيام</h3>
          <p>خط أساس حتمي من متوسط آخر 7 أيام، بعد اختباره على 7 أيام تاريخية سابقة.</p>
        </div>
        <TrendingUp size={20} />
      </div>
      <div className="report-grid">
        <article className="report-metric">
          <span>التقدير الأساسي للفترة</span>
          <strong>{formatCurrency(forecast.expectedTotal)}</strong>
          <small>متوسط يومي: {formatCurrency(forecast.dailyBaseline)}</small>
        </article>
        <article className="report-metric">
          <span>سيناريو تخطيطي أقل</span>
          <strong>{formatCurrency(forecast.lowerScenario)}</strong>
          <small>الأساس مطروحًا منه خطأ الاختبار للفترة</small>
        </article>
        <article className="report-metric">
          <span>سيناريو تخطيطي أعلى</span>
          <strong>{formatCurrency(forecast.upperScenario)}</strong>
          <small>الأساس مضافًا إليه خطأ الاختبار للفترة</small>
        </article>
        <article className="report-metric">
          <span>متوسط الخطأ المطلق في الاختبار</span>
          <strong>{formatCurrency(forecast.meanAbsoluteError)}</strong>
          <small>لكل يوم من الأيام السبعة المختبرة</small>
        </article>
      </div>
      <div style={{ overflowX: 'auto', marginTop: 12 }}>
        <table>
          <thead><tr><th>اليوم المتوقع</th><th>تقدير المبيعات</th></tr></thead>
          <tbody>{forecast.days.map((day) => (
            <tr key={day.day}><td>{formatDateShort(day.day)}</td><td>{formatCurrency(day.expectedSales)}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <p className="report-note" style={{ marginTop: 12 }}>
        يغطي هذا التقدير الأيام السبعة التالية لآخر يوم متاح في المصدر ({formatDateShort(forecast.lastHistoricalDay)}).
        حُسب متوسط الخطأ بمقارنة كل يوم من آخر 7 أيام فعلية بمتوسط الأيام السبعة السابقة له.
        نطاق التخطيط هو الأساس ± (متوسط الخطأ × 7)، وليس نطاق ثقة إحصائيًا أو وعدًا بالإيراد.
        لا يغيّر التقدير الطلبات أو المخزون أو القيود المالية ولا يثبت سببًا تجاريًا.
      </p>
    </section>
  );
}

export function ExecutiveStoreAnalytics() {
  const { data, loading, error, refetch } = useFetch(fetchStoreExecutiveAnalytics);
  const maxDaySales = Math.max(1, ...(data?.sales_trend.map((day) => day.sales) ?? [0]));

  return (
    <section className="panel" style={{ marginTop: 16 }}>
      <div className="panel-head">
        <div>
          <h2>تحليل المبيعات الفعلية</h2>
          <p>مجاميع خادمية كاملة للمؤسسة الحالية، منفصلة عن تحليلات ملفات Onyx.</p>
        </div>
        <button className="btn secondary" type="button" onClick={() => void refetch()}>
          <RefreshCw size={16} /> تحديث التحليل
        </button>
      </div>

      {loading ? <Loading /> : error ? <ErrorBox message={error} /> : !data ? <Empty text="لا توجد بيانات تحليل موثوقة لعرضها." /> : (
        <>
          <div className="report-grid">
            <article className="report-metric">
              <TrendingUp size={20} /><span>المبيعات غير الملغاة</span>
              <strong>{formatCurrency(data.kpis.eligible_sales)}</strong>
              <small>بعد استبعاد الملغاة والمرفوضة</small>
            </article>
            <article className="report-metric">
              <BarChart3 size={20} /><span>مبيعات آخر 30 يومًا</span>
              <strong>{formatCurrency(data.kpis.sales_last_30_days)}</strong>
              <small>{formatNumber(data.kpis.orders_last_30_days)} طلبًا غير ملغى</small>
            </article>
            <article className="report-metric">
              <Users size={20} /><span>العملاء ذوو الطلبات الحديثة</span>
              <strong>{formatNumber(data.kpis.customers_last_30_days)}</strong>
              <small>آخر 30 يومًا</small>
            </article>
            <article className="report-metric">
              <Package size={20} /><span>الأصناف النشطة</span>
              <strong>{formatNumber(data.kpis.active_products)}</strong>
              <small>من سجل المؤسسة الحالية</small>
            </article>
            <article className="report-metric">
              <TrendingUp size={20} /><span>طلبات قيد المعالجة</span>
              <strong>{formatNumber(data.kpis.pending_orders)}</strong>
              <small>بحسب حالات سير العمل الحالية</small>
            </article>
            <article className="report-metric">
              <ShoppingCart size={20} />
              <span>إجمالي الطلبات</span>
              <strong>{formatNumber(data.kpis.total_orders)}</strong>
              <small>يتضمن جميع الحالات</small>
            </article>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 16, marginTop: 16 }}>
            <section>
              <h3>اتجاه المبيعات — 30 يومًا</h3>
              <p className="report-note">المبالغ لا تشمل الطلبات الملغاة أو المرفوضة.</p>
              <div style={{ maxHeight: 320, overflowY: 'auto', paddingInlineEnd: 4 }}>
                {data.sales_trend.map((day) => (
                  <div key={day.day} style={{ display: 'grid', gridTemplateColumns: '78px minmax(40px, 1fr) auto', alignItems: 'center', gap: 8, paddingBlock: 5 }}>
                    <small>{formatDateShort(day.day)}</small>
                    <div aria-label={`مبيعات ${day.day}`} role="img" style={{ height: 8, background: 'var(--muted, #e2e8f0)', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, (day.sales / maxDaySales) * 100)}%`, background: 'var(--primary, #0f766e)', borderRadius: 999 }} />
                    </div>
                    <span style={{ minWidth: 78, textAlign: 'end', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(day.sales)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3>أعلى الأصناف مبيعًا</h3>
              {data.top_products.length === 0 ? <Empty text="لا توجد بنود طلبات قابلة للترتيب." /> : (
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead><tr><th>الصنف</th><th>الكمية</th><th>المبيعات</th></tr></thead>
                    <tbody>{data.top_products.map((product) => (
                      <tr key={product.item_code + ':' + product.product_name}>
                        <td><strong>{product.product_name}</strong><small style={{ display: 'block' }}>{product.item_code || 'دون رمز صنف'}</small></td>
                        <td>{formatNumber(product.quantity)}</td>
                        <td>{formatCurrency(product.sales)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}

              <h3 style={{ marginTop: 18 }}>أعلى العملاء قيمةً</h3>
              {data.top_customers.length === 0 ? <Empty text="لا توجد طلبات مرتبطة بعملاء داخل المؤسسة." /> : (
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead><tr><th>العميل</th><th>الطلبات</th><th>المبيعات</th></tr></thead>
                    <tbody>{data.top_customers.map((customer) => (
                      <tr key={customer.customer_id}>
                        <td>{customer.customer_name}</td>
                        <td>{formatNumber(customer.order_count)}</td>
                        <td>{formatCurrency(customer.sales)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
          <SalesForecastPanel points={data.sales_trend} />
          <p className="report-note" style={{ marginTop: 12 }}>
            آخر تحديث: {formatDateShort(data.generated_at)}. مصدر الأرقام هو سجل الطلبات وبنوده في المؤسسة الحالية؛ اتجاه المبيعات يستبعد الحالات الملغاة والمرفوضة ولا يقدّر البيانات المفقودة.
          </p>
        </>
      )}
    </section>
  );
}

