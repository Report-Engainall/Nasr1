import {
  customerExternalStatementEntryTypeLabel,
  formatCustomerExternalStatementAmount,
  type CustomerExternalStatement,
} from "@/lib/customer-external-statement";

type Props = { statement: CustomerExternalStatement };

const providerLabels = { ONYX: "Onyx Pro", MUTAKAMEL: "المتكامل" } as const;

function documentReviewHref(
  entry: CustomerExternalStatement["currencies"][number]["entries"][number],
  currencyCode: string,
  sourceMode: CustomerExternalStatement["source_mode"],
  sourceAsOf: string,
): string {
  const params = new URLSearchParams({
    request: "document_review",
    document: entry.source_document_number?.trim() || entry.entry_reference,
    reference: entry.entry_reference,
    currency: currencyCode,
    type: entry.entry_type,
    source_mode: sourceMode,
    source_as_of: sourceAsOf,
  });
  return "/service-cases?" + params.toString();
}

export function CustomerExternalAccountStatement({ statement }: Props) {
  const totalEntries = statement.currencies.reduce((sum, currency) => sum + currency.entry_count, 0);
  return (
    <section className="customer-external-account-statement" dir="rtl" aria-labelledby="external-account-statement-heading" style={{ display: "grid", gap: 14 }}>
      <header className="panel">
<h2 id="external-account-statement-heading" style={{ margin: 0 }}>
          كشف الحساب الخارجي — {providerLabels[statement.source_mode]}
        </h2>
        <p role="note" style={{ marginBottom: 0 }}>
          هذا كشف مستقل من المصدر المعتمد. العملات منفصلة ولا تُجمع مع دفتر متجر الأغبري أو مع بعضها.
          تاريخ لقطة المصدر: {new Date(statement.source_as_of).toLocaleString("ar-YE", { timeZone: "UTC" })}.
          {" "}عدد الحركات في جميع العملات: {totalEntries.toLocaleString("ar-YE")}.
        </p>
      </header>

      {statement.currencies.map((currency) => (
        <section key={currency.currency_code} className="panel" aria-labelledby={"external-statement-" + currency.currency_code}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h3 id={"external-statement-" + currency.currency_code} style={{ margin: 0 }}>
              كشف {currency.currency_code}
            </h3>
            <small>اكتملت المزامنة: {new Date(currency.source_as_of).toLocaleString("ar-YE", { timeZone: "UTC" })}</small>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))", gap: 10, marginTop: 12 }}>
            <article className="report-metric">
              <span>إجمالي المدين</span>
              <strong>{formatCustomerExternalStatementAmount(currency.total_debit, currency.currency_code)}</strong>
            </article>
            <article className="report-metric">
              <span>إجمالي الدائن</span>
              <strong>{formatCustomerExternalStatementAmount(currency.total_credit, currency.currency_code)}</strong>
            </article>
            <article className="report-metric">
              <span>الرصيد الختامي</span>
              <strong>{formatCustomerExternalStatementAmount(currency.closing_balance, currency.currency_code)}</strong>
            </article>
            <article className="report-metric">
              <span>عدد الحركات</span>
              <strong>{currency.entry_count.toLocaleString("ar-YE")}</strong>
            </article>
          </div>
          {currency.details_partial && (
            <p role="status" style={{ color: "#9b4e22", margin: "12px 0" }}>
              يعرض الجدول أحدث 500 حركة فقط؛ الإجماليات والرصيد الختامي أعلاه من كامل نطاق العملة.
            </p>
          )}
          <div className="customer-external-statement-table-wrap" style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 850 }}>
              <thead>
                <tr style={{ textAlign: "right", background: "#f4f8f9" }}>
                  <th style={{ padding: 10 }}>التاريخ</th>
                  <th>مرجع الحركة</th>
                  <th>المستند</th>
                  <th>النوع</th>
                  <th>الاستحقاق</th>
                  <th>مدين</th>
                  <th>دائن</th>
                  <th>الرصيد الجاري</th>
                  <th>البيان</th>
                </tr>
              </thead>
              <tbody>
                {currency.entries.map((entry, index) => (
                  <tr key={entry.entry_reference + ":" + index} style={{ borderTop: "1px solid #edf2f3" }}>
                    <td style={{ padding: 10, whiteSpace: "nowrap" }}>{entry.entry_date}</td>
                    <td><strong>{entry.entry_reference}</strong></td>
                    <td>
                      <div style={{ display: "grid", justifyItems: "start", gap: 5 }}>
                        <span>{entry.source_document_number ?? "—"}</span>
                        <a
                          className="btn secondary customer-external-statement-document-action no-print"
                          href={documentReviewHref(entry, currency.currency_code, statement.source_mode, statement.source_as_of)}
                          aria-label={"طلب مراجعة الحركة " + (entry.source_document_number ?? entry.entry_reference)}
                          style={{ textDecoration: "none", fontSize: 12, padding: "4px 8px" }}
                        >
                          طلب مراجعة الحركة
                        </a>
                      </div>
                    </td>
                    <td>{customerExternalStatementEntryTypeLabel(entry.entry_type)}</td>
                    <td>{entry.due_date ?? "—"}</td>
                    <td>{formatCustomerExternalStatementAmount(entry.debit_amount, currency.currency_code)}</td>
                    <td>{formatCustomerExternalStatementAmount(entry.credit_amount, currency.currency_code)}</td>
                    <td><strong>{formatCustomerExternalStatementAmount(entry.running_balance, currency.currency_code)}</strong></td>
                    <td style={{ minWidth: 180 }}>{entry.description || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {currency.entries.length === 0 && <p role="status">لا توجد حركات معتمدة لهذه العملة في اللقطة الحالية.</p>}
          </div>
        </section>
      ))}
    </section>
  );
}
