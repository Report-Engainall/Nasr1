import type { Customer360PrintDocument } from "@/lib/customer-360-print";
import { formatCurrency, formatDateShort, formatNumber } from "@/lib/format";
import { formatCustomer360Money } from "@/lib/customer-360";

const invoiceStatusLabel: Record<string, string> = {
  issued: "صادرة",
  partially_paid: "مدفوعة جزئيًا",
  paid: "مدفوعة",
  void: "ملغاة",
};

const priorityLabel: Record<string, string> = {
  high: "أولوية عالية",
  medium: "أولوية متوسطة",
  low: "أولوية منخفضة",
};

function money(value: number | null, currency: string): string {
  return value === null ? "غير متاح" : formatCustomer360Money(value, currency);
}

export function Customer360PrintSheet({ document }: { document: Customer360PrintDocument }) {
  const generatedAt = new Intl.DateTimeFormat("ar-YE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(document.generatedAt));

  return (
    <article
      className="customer-360-print-sheet"
      data-testid="customer-360-print-document"
      dir="rtl"
      lang="ar"
    >
      <header className="customer-360-print-header">
        <div>
          <h1>متجر الأغبري | Aghbari Commerce</h1>
          <p>ملف العميل 360 — ملخص تشغيلي ومالي</p>
          <h2>{document.customer.businessName}</h2>
          <p>
            رمز العميل: {document.customer.customerCode}
            {document.customer.contactName ? " · جهة الاتصال: " + document.customer.contactName : ""}
          </p>
          {document.customer.phone || document.customer.email ? (
            <p>{[document.customer.phone, document.customer.email].filter(Boolean).join(" · ")}</p>
          ) : null}
        </div>
        <div className="customer-360-print-date">
          <strong>وقت استخراج التقرير</strong>
          <span>{generatedAt}</span>
        </div>
      </header>

      <section className="customer-360-print-section">
        <h2>مؤشرات الطلبات</h2>
        <table>
          <thead><tr><th>المؤشر</th><th>القيمة</th></tr></thead>
          <tbody>
            <tr><th scope="row">إجمالي الطلبات</th><td>{formatNumber(document.orders.orderCount)}</td></tr>
            <tr><th scope="row">طلبات قيد المعالجة</th><td>{formatNumber(document.orders.pendingOrderCount)}</td></tr>
            <tr><th scope="row">الطلبات المنفذة</th><td>{formatNumber(document.orders.fulfilledOrderCount)}</td></tr>
            <tr><th scope="row">الطلبات الملغاة</th><td>{formatNumber(document.orders.cancelledOrderCount)}</td></tr>
            <tr><th scope="row">قيمة الطلبات غير الملغاة</th><td>{money(document.orders.nonCancelledOrderValue, "YER")}</td></tr>
            <tr><th scope="row">متوسط قيمة الطلب</th><td>{money(document.orders.averageOrderValue, "YER")}</td></tr>
            <tr><th scope="row">آخر طلب</th><td>{document.orders.lastOrderAt ? formatDateShort(document.orders.lastOrderAt) : "لا يوجد"}</td></tr>
            <tr><th scope="row">الأيام منذ آخر طلب</th><td>{document.orders.daysSinceLastOrder === null ? "غير متاح" : formatNumber(document.orders.daysSinceLastOrder)}</td></tr>
            <tr><th scope="row">متوسط الأيام بين الطلبات</th><td>{document.orders.averageDaysBetweenOrders === null ? "غير متاح" : formatNumber(document.orders.averageDaysBetweenOrders)}</td></tr>
            <tr><th scope="row">الفواتير المتأخرة من الدفتر الكامل</th><td>{formatNumber(document.orders.overdueInvoiceCount)}</td></tr>
            {document.orders.invalidOrderAmountCount > 0 ? (
              <tr><th scope="row">مبالغ طلبات غير صالحة</th><td>{formatNumber(document.orders.invalidOrderAmountCount)}</td></tr>
            ) : null}
          </tbody>
        </table>
        <p className="customer-360-print-note">
          الرصيد والحد الائتماني المسجلان في بطاقة العميل:
          {" "}{money(document.customer.currentBalance, "YER")} / {money(document.customer.creditLimit, "YER")}.
        </p>
      </section>

      <section className="customer-360-print-section">
        <h2>دفتر الفواتير والتحصيل الكامل حسب العملة</h2>
        <table>
          <thead><tr><th>العملة</th><th>عدد الفواتير</th><th>إجمالي الفواتير</th><th>المسدّد</th><th>الإشعارات الدائنة</th><th>المتبقي</th><th>المتأخرة</th><th>قيمة المتأخرات</th></tr></thead>
          <tbody>
            {document.financeByCurrency.map((row, index) => (
              <tr key={row.currency + "-" + index}>
                <td>{row.currency}</td>
                <td>{formatNumber(row.invoiceCount)}</td>
                <td>{money(row.invoicedTotal, row.currency)}</td>
                <td>{money(row.paidTotal, row.currency)}</td>
                <td>{formatCustomer360Money(row.creditMemoTotal, row.currency)}</td>
                <td>{money(row.outstandingTotal, row.currency)}</td>
                <td>{formatNumber(row.overdueInvoiceCount)}</td>
                <td>{money(row.overdueOutstanding, row.currency)}</td>
              </tr>
            ))}
            {document.financeByCurrency.length === 0 ? <tr><td colSpan={8}>لا توجد فواتير مسجلة.</td></tr> : null}
          </tbody>
        </table>
        {document.financeByCurrency.some((row) => row.unknownDueDateInvoiceCount > 0 || row.invalidTotalAmountCount > 0) ? (
          <p className="customer-360-print-note">
            توجد بيانات استحقاق أو مبالغ غير مكتملة؛ راجع الأعداد أدناه ولا تُعامل القيم غير المتاحة على أنها صفر.
            {document.financeByCurrency.map((row) => row.unknownDueDateInvoiceCount > 0 || row.invalidTotalAmountCount > 0 ? (
              <span key={row.currency}> {row.currency}: تواريخ استحقاق غير معروفة {formatNumber(row.unknownDueDateInvoiceCount)}، مبالغ غير صالحة {formatNumber(row.invalidTotalAmountCount)}.</span>
            ) : null)}
          </p>
        ) : null}
      </section>

      <section className="customer-360-print-section">
        <h2>المنتجات الأكثر شراءً</h2>
        <table>
          <thead><tr><th>رمز الصنف</th><th>الصنف</th><th>الكمية</th><th>قيمة البنود</th><th>آخر شراء</th></tr></thead>
          <tbody>
            {document.topProducts.map((row, index) => (
              <tr key={row.itemCode + "-" + row.productName + "-" + index}>
                <td>{row.itemCode || "—"}</td><td>{row.productName}</td><td>{formatNumber(row.quantity)}</td>
                <td>{money(row.sales, "YER")}</td><td>{row.lastPurchasedAt ? formatDateShort(row.lastPurchasedAt) : "غير متاح"}</td>
              </tr>
            ))}
            {document.topProducts.length === 0 ? <tr><td colSpan={5}>لا توجد بنود طلبات قابلة للترتيب.</td></tr> : null}
          </tbody>
        </table>
      </section>

      <section className="customer-360-print-section">
        <h2>توزيع حالات الطلبات</h2>
        <table>
          <thead><tr><th>الحالة</th><th>العدد</th></tr></thead>
          <tbody>
            {document.statusDistribution.map((row, index) => <tr key={row.status + "-" + index}><td>{row.status}</td><td>{formatNumber(row.count)}</td></tr>)}
            {document.statusDistribution.length === 0 ? <tr><td colSpan={2}>لا توجد حالات مسجلة.</td></tr> : null}
          </tbody>
        </table>
      </section>

      <section className="customer-360-print-section">
        <h2>آخر الطلبات ({formatNumber(document.recentOrders.length)} معروضة من {formatNumber(document.orders.orderCount)})</h2>
        <table>
          <thead><tr><th>رقم الطلب</th><th>التاريخ</th><th>الحالة</th><th>الأصناف</th><th>الإجمالي</th></tr></thead>
          <tbody>
            {document.recentOrders.map((row, index) => (
              <tr key={row.orderNumber + "-" + index}>
                <td>{row.orderNumber}</td><td>{formatDateShort(row.createdAt)}</td><td>{row.status}</td>
                <td>{row.totalItems === null ? "—" : formatNumber(row.totalItems)}</td><td>{money(row.totalAmount, "YER")}</td>
              </tr>
            ))}
            {document.recentOrders.length === 0 ? <tr><td colSpan={5}>لا توجد طلبات لهذا العميل.</td></tr> : null}
          </tbody>
        </table>
      </section>

      <section className="customer-360-print-section">
        <h2>آخر الفواتير ({formatNumber(document.recentInvoices.length)} معروضة)</h2>
        <table>
          <thead><tr><th>الفاتورة</th><th>الإصدار</th><th>الاستحقاق</th><th>الحالة</th><th>الإجمالي</th><th>المسدّد</th><th>الإشعار الدائن</th><th>المتبقي</th></tr></thead>
          <tbody>
            {document.recentInvoices.map((row, index) => (
              <tr key={row.invoiceNumber + "-" + index}>
                <td>{row.invoiceNumber}</td><td>{row.issuedAt ? formatDateShort(row.issuedAt) : "غير محدد"}</td>
                <td>{row.dueAt ? formatDateShort(row.dueAt) : "غير محدد"}</td><td>{invoiceStatusLabel[row.status] ?? row.status}</td>
                <td>{money(row.totalAmount, row.currency)}</td><td>{formatCustomer360Money(row.paidAmount, row.currency)}</td>
                <td>{formatCustomer360Money(row.creditMemoAmount, row.currency)}</td><td>{money(row.outstandingAmount, row.currency)}</td>
              </tr>
            ))}
            {document.recentInvoices.length === 0 ? <tr><td colSpan={8}>لا توجد فواتير مسجلة.</td></tr> : null}
          </tbody>
        </table>
      </section>

      <section className="customer-360-print-section">
        <h2>آخر الدفعات ({formatNumber(document.recentPayments.length)} معروضة)</h2>
        <table>
          <thead><tr><th>التاريخ</th><th>الفاتورة</th><th>طريقة الدفع</th><th>المبلغ</th></tr></thead>
          <tbody>
            {document.recentPayments.map((row, index) => (
              <tr key={row.invoiceNumber + "-" + row.paidAt + "-" + index}>
                <td>{formatDateShort(row.paidAt)}</td><td>{row.invoiceNumber}</td><td>{row.paymentMethod ?? "غير محددة"}</td>
                <td>{row.currency && row.amount !== null ? formatCustomer360Money(row.amount, row.currency) : "غير متاح — عملة الفاتورة خارج أحدث 20 فاتورة"}</td>
              </tr>
            ))}
            {document.recentPayments.length === 0 ? <tr><td colSpan={4}>لا توجد دفعات مسجلة.</td></tr> : null}
          </tbody>
        </table>
      </section>

      <section className="customer-360-print-section">
        <h2>إشارات المتابعة المبنية على السجل</h2>
        {document.recommendations.length === 0 ? <p>لا توجد توصية ضمن قواعد التنبيه الحالية.</p> : document.recommendations.map((row, index) => (
          <article className="customer-360-print-recommendation" key={row.title + "-" + index}>
            <strong>{row.title}</strong><span>{priorityLabel[row.priority]}</span>
            <p>{row.description}</p><p>{row.action}</p>
            {row.currency && row.overdueOutstanding !== null ? <p>المبلغ المتأخر: {formatCustomer360Money(row.overdueOutstanding, row.currency)}</p> : null}
            {row.overdueInvoiceCount !== null ? <p>عدد الفواتير المتأخرة: {formatNumber(row.overdueInvoiceCount)}</p> : null}
            {row.pendingOrderCount !== null ? <p>الطلبات المعلقة: {formatNumber(row.pendingOrderCount)}</p> : null}
            {row.daysSinceLastOrder !== null ? <p>الأيام منذ آخر طلب: {formatNumber(row.daysSinceLastOrder)}</p> : null}
          </article>
        ))}
      </section>

      <footer className="customer-360-print-footer">
        أُعد هذا التقرير من ملخص Customer 360 الخادمي للمؤسسة الحالية. إجماليات الطلبات والدفتر المالي كاملة؛ أما جداول التفاصيل فمحدودة بأحدث 20 حركة. لا يتضمن التقرير معرّفات قاعدة البيانات أو بيانات مؤسسة أخرى أو التكلفة أو هامش الربح.
      </footer>
    </article>
  );
}
