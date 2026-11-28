import type { CustomerFinancialSource } from "@/lib/customer-financial-source";
type Props = { source: CustomerFinancialSource | null; loading: boolean; error?: string };
function dateLabel(value: string | null): string {
  if (!value) return "غير متاح";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "غير متاح";
  return new Intl.DateTimeFormat("ar-YE", { dateStyle:"medium", timeStyle:"short", timeZone:"UTC" }).format(date);
}
export function CustomerFinancialSourceNotice({ source, loading, error = "" }: Props) {
  const baseStyle = { border:"1px solid var(--border, #d6dfe4)", borderRadius:10, padding:"12px 14px", marginBottom:14, background:"var(--card, #fff)", fontSize:13, lineHeight:1.8 } as const;
  if (loading) return <p role="status" style={{...baseStyle,color:"var(--muted-foreground, #66757b)"}}>جارٍ التحقق من مصدر الحساب المالي قبل عرض المستندات...</p>;
  if (error || !source) return <p role="alert" style={{...baseStyle,color:"#8a3c20"}}>{error || "تعذر التحقق من مصدر الحساب المالي. أوقفنا عرض المستندات حتى يؤكد الخادم مصدرها."}</p>;
  if (source.source_status !== "active") return <p role="alert" style={{...baseStyle,color:"#8a3c20"}}>مصدر الحساب المالي موقوف حاليًا. لن نعرض فواتير أو دفعات حتى تعيد الإدارة تفعيل المصدر والتحقق منه.</p>;
  if (source.source_mode === "APP_ONLY" && source.can_read_app_ledger && !source.is_stale) {
    return <p role="status" style={{...baseStyle,color:"#17684d"}}><strong>مصدر الحساب المالي: دفتر متجر الأغبري.</strong>{" "}تُعرض هنا الفواتير والدفعات المعتمدة المسجلة في التطبيق فقط.</p>;
  }
  const providerLabel = source.source_mode === "ONYX" ? "Onyx Pro" : "المتكامل";
  return (
    <section role="note" style={{...baseStyle,color:source.is_stale?"#8a3c20":"var(--foreground, #17242a)"}}>
      <strong>مصدر الحساب المحدد: {providerLabel}.</strong>
      <p style={{margin:"4px 0 0"}}>آخر لقطة من المصدر: {dateLabel(source.source_as_of)} · آخر مزامنة مسجلة: {dateLabel(source.last_synced_at)}.</p>
      {source.is_stale ? <p style={{margin:"4px 0 0"}}>بيانات المصدر قديمة؛ لن نعرضها على أنها رصيد حالي.</p> :
        <p style={{margin:"4px 0 0"}}>لن نخلط هذا الحساب مع دفتر متجر الأغبري. لا تظهر بيانات مالية إلا من قراءة مصرح بها للمصدر المحدد.</p>}
    </section>
  );
}
