import { parseCustomerDocumentReviewReference, formatSourceTimestampUtc } from "@/lib/customer-service-document-review-reference";

export function CustomerServiceCaseDescription({ description }: { description: string }) {
  const reference = parseCustomerDocumentReviewReference(description);

  return (
    <>
      <p className="customer-service-desk-description">
        {reference?.customerMessage ?? description}
      </p>
      {reference && (
        <section
          role="region"
          aria-label="مرجع مراجعة مستند ERP"
          dir="rtl"
          style={{
            display: "grid",
            gap: 10,
            minWidth: 0,
            padding: 12,
            border: "1px solid var(--border)",
            borderRadius: 10,
            background: "var(--background)",
          }}
        >
          <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 12 }}>طلب مراجعة مستند من ERP</strong>
            <span style={{
              padding: "4px 8px",
              border: "1px solid var(--border)",
              borderRadius: 999,
              color: "var(--muted-foreground)",
              fontSize: 10,
              fontWeight: 700,
            }}>
              مرجع أرسله العميل — يحتاج تحقق
            </span>
          </header>

          <dl style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 8,
            margin: 0,
          }}>
            <div style={{ minWidth: 0, padding: 9, border: "1px solid var(--border)", borderRadius: 8 }}>
              <dt style={{ color: "var(--muted-foreground)", fontSize: 10 }}>رقم المستند</dt>
              <dd style={{ margin: "4px 0 0", fontSize: 12, fontWeight: 800, overflowWrap: "anywhere" }}>
                <bdi dir="auto">{reference.documentNumber}</bdi>
              </dd>
            </div>
            <div style={{ minWidth: 0, padding: 9, border: "1px solid var(--border)", borderRadius: 8 }}>
              <dt style={{ color: "var(--muted-foreground)", fontSize: 10 }}>مرجع الحركة</dt>
              <dd style={{ margin: "4px 0 0", fontSize: 12, fontWeight: 700, overflowWrap: "anywhere" }}>
                <bdi dir="auto">{reference.entryReference}</bdi>
              </dd>
            </div>
            <div style={{ minWidth: 0, padding: 9, border: "1px solid var(--border)", borderRadius: 8 }}>
              <dt style={{ color: "var(--muted-foreground)", fontSize: 10 }}>العملة</dt>
              <dd style={{ margin: "4px 0 0", fontSize: 12, fontWeight: 700 }}>{reference.currencyCode}</dd>
            </div>
            <div style={{ minWidth: 0, padding: 9, border: "1px solid var(--border)", borderRadius: 8 }}>
              <dt style={{ color: "var(--muted-foreground)", fontSize: 10 }}>مصدر الحساب الذي أشار إليه العميل</dt>
              <dd style={{ margin: "4px 0 0", fontSize: 12, fontWeight: 700 }}>{reference.sourceLabel}</dd>
            </div>
            <div style={{ minWidth: 0, padding: 9, border: "1px solid var(--border)", borderRadius: 8 }}>
              <dt style={{ color: "var(--muted-foreground)", fontSize: 10 }}>وقت لقطة الكشف المشار إليها</dt>
              <dd style={{ margin: "4px 0 0", fontSize: 11, fontWeight: 700 }}>
                <time dateTime={reference.sourceAsOf}>
                  {formatSourceTimestampUtc(reference.sourceAsOf)} UTC
                </time>
              </dd>
            </div>
            <div style={{ minWidth: 0, padding: 9, border: "1px solid var(--border)", borderRadius: 8 }}>
              <dt style={{ color: "var(--muted-foreground)", fontSize: 10 }}>نوع الحركة</dt>
              <dd style={{ margin: "4px 0 0", fontSize: 12, fontWeight: 700 }}>{reference.entryTypeLabel}</dd>
            </div>
          </dl>

          <p role="note" style={{ margin: 0, color: "var(--muted-foreground)", fontSize: 11, lineHeight: 1.7 }}>
            هذه بيانات مرجعية ضمن وصف العميل وليست إثباتًا مستقلًا أو ملفًا أصليًا. لا يتضمن الطلب صلاحية قراءة مستند ERP أو تنزيله أو إعادة طباعته؛ تحقّق من المصدر عبر القارئ المخوّل قبل الرد.
          </p>
        </section>
      )}
    </>
  );
}
