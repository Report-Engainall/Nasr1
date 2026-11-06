import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  fetchExecutiveLiquidityWorkspace,
  type ExecutiveLiquidityFetchResult,
  type ExecutiveLiquiditySnapshot,
} from "@/lib/intelligence/executive-liquidity-client";
import { EvidenceReferences, EvidenceStatusLabel, EvidenceWarnings } from "./shared";

export interface ExecutiveLiquidityCommandCenterProps {
  refreshKey?: number;
}

const amount = (value: number | null, currency: string) =>
  value === null ? "غير متاح" : new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 2 }).format(value) + " " + currency;

const phaseLabel = (phase: "OPENING" | "CLOSING") =>
  phase === "OPENING" ? "افتتاح الوردية" : "إقفال الوردية";

const bucketLabel: Record<string, string> = {
  NOT_DUE: "غير مستحقة بعد",
  OVERDUE_1_30: "متأخرة 1–30 يوماً",
  OVERDUE_31_60: "متأخرة 31–60 يوماً",
  OVERDUE_61_90: "متأخرة 61–90 يوماً",
  OVERDUE_90_PLUS: "متأخرة أكثر من 90 يوماً",
  UNKNOWN_DUE_DATE: "تاريخ الاستحقاق غير محدد",
};

function CashCountSection({ snapshot }: { snapshot: ExecutiveLiquiditySnapshot }) {
  return (
    <section className="rounded-xl border p-3 space-y-2">
      <div>
        <h3 className="font-semibold">النقد المعدود في الورديات</h3>
        <p className="text-xs text-muted-foreground">يعرض آخر عدّ محفوظ لكل وردية ومرحلة وعملة. لا تُجمع أعداد الورديات لأنها ليست أرصدة خزائن مستقلة مثبتة.</p>
      </div>
      {snapshot.cashCounts.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead><tr className="border-b text-right text-xs text-muted-foreground">
              <th className="p-2">الوردية</th><th className="p-2">التاريخ</th><th className="p-2">المرحلة</th><th className="p-2">المبلغ المعدود</th><th className="p-2">وقت التسجيل</th><th className="p-2">مرجع الإثبات</th>
            </tr></thead>
            <tbody>
              {snapshot.cashCounts.map((count) => (
                <tr key={count.id} className="border-b last:border-0">
                  <td className="p-2">{count.shiftLabel}</td>
                  <td className="p-2">{count.businessDate}</td>
                  <td className="p-2">{phaseLabel(count.phase)}</td>
                  <td className="p-2 font-semibold">{amount(count.countedAmount, count.currency)}</td>
                  <td className="p-2 text-xs">{count.sourceTimestamp}</td>
                  <td className="p-2 text-xs">{count.evidenceId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-sm text-muted-foreground">لا توجد عدود نقدية مسجلة للورديات.</p>}
    </section>
  );
}

function CashAccountsSection({ snapshot }: { snapshot: ExecutiveLiquiditySnapshot }) {
  return (
    <section className="rounded-xl border p-3 space-y-2">
      <div>
        <h3 className="font-semibold">حسابات الصندوق والبنوك حسب العملة</h3>
        <p className="text-xs text-muted-foreground">الحسابات المسجلة في إعدادات تسوية الموردين. لا يظهر رصيد متاح دون رصيد افتتاحي وكشف/مطابقة مصرفية مثبتة.</p>
      </div>
      {snapshot.cashAccounts.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead><tr className="border-b text-right text-xs text-muted-foreground">
              <th className="p-2">الحساب</th><th className="p-2">النوع</th><th className="p-2">العملة</th><th className="p-2">الرصيد الحالي</th><th className="p-2">المصدر</th>
            </tr></thead>
            <tbody>
              {snapshot.cashAccounts.map((account) => (
                <tr key={account.accountId + ":" + account.currency} className="border-b last:border-0">
                  <td className="p-2">{account.displayName} · {account.accountCode}</td>
                  <td className="p-2">{account.settlementKind === "cash" ? "صندوق" : "بنك"}</td>
                  <td className="p-2">{account.currency}</td>
                  <td className="p-2">غير متاح · <EvidenceStatusLabel status={account.balanceStatus} /></td>
                  <td className="p-2 text-xs">{account.sourceName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-sm text-muted-foreground">لا توجد حسابات تسوية نقدية/مصرفية مفعّلة في إعدادات حسابات الموردين.</p>}
    </section>
  );
}

function CashMovementsSection({ snapshot }: { snapshot: ExecutiveLiquiditySnapshot }) {
  return (
    <section className="rounded-xl border p-3 space-y-2">
      <div>
        <h3 className="font-semibold">التدفق النقدي الفعلي المسجل</h3>
        <p className="text-xs text-muted-foreground">حركات التحصيلات والمدفوعات والمصروفات المرتبطة بقيود مصدرية مرحلة ومتوازنة خلال {snapshot.period.from} — {snapshot.period.to}. هذه حركة الفترة وليست رصيد الحساب.</p>
      </div>
      {snapshot.cashMovements.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-sm">
            <thead><tr className="border-b text-right text-xs text-muted-foreground">
              <th className="p-2">الحساب</th><th className="p-2">العملة</th><th className="p-2">الداخل</th><th className="p-2">الخارج</th><th className="p-2">صافي الحركة</th><th className="p-2">عدد الحركات</th><th className="p-2">الحالة والإثبات</th>
            </tr></thead>
            <tbody>
              {snapshot.cashMovements.map((movement) => (
                <tr key={movement.accountId + ":" + movement.currency} className="border-b last:border-0">
                  <td className="p-2">{movement.displayName} · {movement.accountCode} · {movement.settlementKind === "cash" ? "صندوق" : movement.settlementKind === "bank" ? "بنك" : "غير مصنف"}</td>
                  <td className="p-2">{movement.currency}</td>
                  <td className="p-2">{amount(movement.inflows, movement.currency)}</td>
                  <td className="p-2">{amount(movement.outflows, movement.currency)}</td>
                  <td className="p-2 font-semibold">{amount(movement.netMovement, movement.currency)}</td>
                  <td className="p-2">{movement.movementCount}</td>
                  <td className="p-2">
                    <EvidenceStatusLabel status={movement.status} />
                    <details className="mt-1 text-xs">
                      <summary className="cursor-pointer">تفاصيل المصدر والاحتساب</summary>
                      <p>آخر حركة: {movement.lastMovementAt}</p>
                      <p>المعادلة: {movement.formulaId}@{movement.formulaVersion}</p>
                      <p>أنواع المصدر: {movement.sourceKinds.join("، ") || "غير متاحة"}</p>
                      <p>مراجع الإثبات: <EvidenceReferences ids={movement.evidenceIds} /></p>
                      <EvidenceWarnings warnings={movement.warnings} />
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-sm text-muted-foreground">لا توجد حركات مصدرية مرحلة ضمن الفترة المحددة.</p>}
      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">اكتمال تغطية الحركات النقدية</h4>
          <span className="text-xs"><EvidenceStatusLabel status={snapshot.cashMovementCoverage.status} /> · {snapshot.cashMovementCoverage.completeness}</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 text-xs">
          <p>قيود نقدية مرحلة غير مصنفة: <strong className="tabular-nums">{snapshot.cashMovementCoverage.unclassifiedPostedCashJournalLines.toLocaleString("ar-YE")}</strong></p>
          <p>مصروفات نقدية غير مرتبطة: <strong className="tabular-nums">{snapshot.cashMovementCoverage.unlinkedCashExpenses.toLocaleString("ar-YE")}</strong></p>
          <p>دفعات عملاء غير مرتبطة: <strong className="tabular-nums">{snapshot.cashMovementCoverage.unlinkedCustomerPayments.toLocaleString("ar-YE")}</strong></p>
        </div>
        <p className="text-xs text-muted-foreground">المصدر: {snapshot.cashMovementCoverage.formulaId}@{snapshot.cashMovementCoverage.formulaVersion} · وقت الاحتساب: {snapshot.cashMovementCoverage.calculatedAt}</p>
        <EvidenceWarnings warnings={snapshot.cashMovementCoverage.warnings} />
      </div>
    </section>
  );
}

function SupplierPayablesSection({ snapshot }: { snapshot: ExecutiveLiquiditySnapshot }) {
  const rows = snapshot.supplierPayables.filter((item) => item.postedPayable !== 0 || item.reservedPaymentAmount !== 0);
  return (
    <section className="rounded-xl border p-3 space-y-2">
      <div>
        <h3 className="font-semibold">التزامات الموردين المثبتة</h3>
        <p className="text-xs text-muted-foreground">من إيصالات الاستلام ذات القيود المرحلة، بعد طرح إشعارات الخصم والتسويات المرحلة. مسودات الدفع المحجوزة تظهر منفصلة ولا تخصم من الالتزام إلا بعد ترحيلها.</p>
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b text-right text-xs text-muted-foreground">
              <th className="p-2">المورد</th><th className="p-2">العملة</th><th className="p-2">الإيصالات</th><th className="p-2">المستحق المثبت</th><th className="p-2">دفعات محجوزة غير مرحلة</th><th className="p-2">آخر استلام</th>
            </tr></thead>
            <tbody>
              {rows.map((supplier) => (
                <tr key={supplier.supplierId + ":" + supplier.currency} className="border-b last:border-0">
                  <td className="p-2">{supplier.supplierName}</td>
                  <td className="p-2">{supplier.currency}</td>
                  <td className="p-2">{supplier.receiptCount}</td>
                  <td className="p-2 font-semibold">{amount(supplier.postedPayable, supplier.currency)} · <EvidenceStatusLabel status={supplier.status} /></td>
                  <td className="p-2">{amount(supplier.reservedPaymentAmount, supplier.currency)}</td>
                  <td className="p-2">{supplier.lastReceiptDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-sm text-muted-foreground">لا توجد التزامات موردين ناتجة عن إيصالات مرحّلة غير مسددة.</p>}
      {snapshot.supplierPayables.map((supplier) => (
        <details key={supplier.supplierId + ":" + supplier.currency + ":evidence"} className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">{supplier.supplierName} · {supplier.currency} · مصدر الاحتساب</summary>
          <p>المعادلة: {supplier.formulaId}@{supplier.formulaVersion} · احتُسب في {supplier.calculatedAt}</p>
          <p>مراجع الإثبات: <EvidenceReferences ids={supplier.evidenceIds} /></p>
          <EvidenceWarnings warnings={supplier.warnings} />
        </details>
      ))}
    </section>
  );
}

function ReceivablesSection({ snapshot }: { snapshot: ExecutiveLiquiditySnapshot }) {
  return (
    <section className="rounded-xl border p-3 space-y-3">
      <div>
        <h3 className="font-semibold">الذمم المدينة والمتأخرات والدفعات الجزئية</h3>
        <p className="text-xs text-muted-foreground">الرصيد المفتوح لكل فاتورة بعد الدفعات المسجلة عليها. أعمار الذمم حسب تاريخ الاستحقاق المحفوظ، وتظل العملة مستقلة.</p>
      </div>
      {snapshot.receivables.length ? snapshot.receivables.map((position) => (
        <article key={position.currency} className="rounded-lg border p-3 space-y-2">
          <div className="flex flex-wrap justify-between gap-2">
            <h4 className="font-semibold">{position.currency}</h4>
            <span className="text-xs"><EvidenceStatusLabel status={position.status} /> · {position.invoiceCount} فاتورة · {position.partiallyPaidCount} دفعة جزئية</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 text-sm">
            <p>إجمالي الذمم المفتوحة: <strong>{amount(position.totalOutstanding, position.currency)}</strong></p>
            <p>غير مستحقة: {amount(position.notDueAmount, position.currency)}</p>
            <p>متأخرة: {amount(position.overdueAmount, position.currency)}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr className="border-b text-right text-xs text-muted-foreground"><th className="p-2">فئة العمر</th><th className="p-2">المبلغ</th><th className="p-2">الفواتير</th><th className="p-2">مدفوعة جزئياً</th><th className="p-2">مراجع الإثبات</th></tr></thead>
              <tbody>
                {position.agingBuckets.map((bucket) => (
                  <tr key={bucket.bucket} className="border-b last:border-0">
                    <td className="p-2">{bucketLabel[bucket.bucket]}</td>
                    <td className="p-2">{amount(bucket.amount, position.currency)}</td>
                    <td className="p-2">{bucket.invoiceCount}</td>
                    <td className="p-2">{bucket.partiallyPaidCount}</td>
                    <td className="p-2 text-xs"><EvidenceReferences ids={bucket.evidenceIds} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">المعادلة: {position.formulaId}@{position.formulaVersion} · وقت الاحتساب: {position.calculatedAt} · حتى: {position.asOf}</p>
          <EvidenceWarnings warnings={position.warnings} />
        </article>
      )) : <p className="text-sm text-muted-foreground">لا توجد ذمم مفتوحة لها فواتير قائمة ضمن مصدر الحسابات.</p>}
    </section>
  );
}

export function ExecutiveLiquidityCommandCenter({ refreshKey = 0 }: ExecutiveLiquidityCommandCenterProps) {
  const [result, setResult] = useState<ExecutiveLiquidityFetchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [manualRefreshKey, setManualRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void fetchExecutiveLiquidityWorkspace()
      .then((response) => { if (active) setResult(response); })
      .catch(() => {
        if (active) setResult({ ok: false, status: "UNAVAILABLE", message: "تعذر تحميل مركز القيادة المالية." });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshKey, manualRefreshKey]);

  const snapshot = result?.ok ? result.data : null;

  return (
    <section dir="rtl" className="space-y-3" aria-label="مركز القيادة المالية والسيولة">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">مركز القيادة المالية والسيولة</h2>
          <p className="text-xs text-muted-foreground">
            {snapshot ? "حتى " + snapshot.asOf + " · حركة الفترة " + snapshot.period.from + " — " + snapshot.period.to : "قراءة موحدة للصندوق والحسابات والذمم والتزامات الموردين"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {snapshot ? <span className="text-xs">الصلاحية: {snapshot.effectiveRole === "admin" ? "مدير المؤسسة" : "مدير"}</span> : null}
          <button
            type="button"
            className="btn secondary"
            onClick={() => setManualRefreshKey((value) => value + 1)}
            disabled={loading}
            aria-label="تحديث مركز القيادة المالية"
          >
            <RefreshCw size={15} aria-hidden="true" />
            {loading ? "جارٍ التحديث…" : "تحديث المركز"}
          </button>
        </div>
      </header>
      {loading ? <p role="status" className="rounded-lg border p-3 text-sm">جارٍ تحميل المؤشرات المالية من مصادر المؤسسة...</p> : null}
      {!loading && result && !result.ok ? (
        <div role="alert" className="rounded-lg border p-3 text-sm">{result.message}</div>
      ) : null}
      {snapshot ? (
        <>
          <div className="grid gap-3 xl:grid-cols-2">
            <CashCountSection snapshot={snapshot} />
            <CashAccountsSection snapshot={snapshot} />
          </div>
          <CashMovementsSection snapshot={snapshot} />
          <div className="grid gap-3 xl:grid-cols-2">
            <ReceivablesSection snapshot={snapshot} />
            <SupplierPayablesSection snapshot={snapshot} />
          </div>
          <EvidenceWarnings warnings={snapshot.warnings} />
        </>
      ) : null}
    </section>
  );
}
