import { supabase } from "@/lib/supabase";
import { decimalToMinorUnits, minorUnitsToNumber } from "./financial-precision";

export type ExecutiveEvidenceStatus = "VERIFIED" | "NEEDS_REVIEW" | "UNVERIFIED" | "UNAVAILABLE";
export type ExecutiveCompleteness = "COMPLETE" | "PARTIAL" | "UNKNOWN";

export interface ExecutiveCashCount {
  id: string;
  shiftId: string;
  shiftLabel: string;
  businessDate: string;
  organizationTimeZone: string;
  phase: "OPENING" | "CLOSING";
  currency: string;
  countedAmount: number;
  version: number;
  sourceTimestamp: string;
  evidenceId: string;
}
export interface ExecutiveCashAccount {
  accountId: string;
  accountCode: string;
  accountName: string;
  displayName: string;
  settlementKind: "cash" | "bank" | "unclassified";
  currency: string;
  balance: null;
  balanceStatus: "UNAVAILABLE";
  sourceName: string;
}
export interface ExecutiveCashMovement {
  accountId: string;
  accountCode: string;
  accountName: string;
  displayName: string;
  settlementKind: "cash" | "bank" | "unclassified";
  currency: string;
  period: { from: string; to: string };
  asOf: string;
  inflows: number;
  outflows: number;
  netMovement: number;
  movementCount: number;
  lastMovementAt: string;
  sourceKinds: string[];
  evidenceIds: string[];
  status: ExecutiveEvidenceStatus;
  formulaId: string;
  formulaVersion: string;
  calculatedAt: string;
  warnings: string[];
}
export interface ExecutiveSupplierPayable {
  supplierId: string;
  supplierName: string;
  currency: string;
  receiptCount: number;
  postedPayable: number | null;
  reservedPaymentAmount: number;
  lastReceiptDate: string;
  asOf: string;
  status: ExecutiveEvidenceStatus;
  formulaId: string;
  formulaVersion: string;
  calculatedAt: string;
  evidenceIds: string[];
  dueDateStatus: "UNAVAILABLE";
  warnings: string[];
}
export interface ExecutiveReceivableAgingBucket {
  bucket: "NOT_DUE" | "OVERDUE_1_30" | "OVERDUE_31_60" | "OVERDUE_61_90" | "OVERDUE_90_PLUS" | "UNKNOWN_DUE_DATE";
  amount: number;
  invoiceCount: number;
  partiallyPaidCount: number;
  evidenceIds: string[];
}
export interface ExecutiveReceivableCurrency {
  currency: string;
  totalOutstanding: number;
  notDueAmount: number;
  overdueAmount: number;
  invoiceCount: number;
  partiallyPaidCount: number;
  agingBuckets: ExecutiveReceivableAgingBucket[];
  asOf: string;
  status: ExecutiveEvidenceStatus;
  formulaId: string;
  formulaVersion: string;
  calculatedAt: string;
  warnings: string[];
}
export interface ExecutiveCashMovementCoverage {
  status: ExecutiveEvidenceStatus;
  completeness: ExecutiveCompleteness;
  unclassifiedPostedCashJournalLines: number;
  unlinkedCashExpenses: number;
  unlinkedCustomerPayments: number;
  formulaId: string;
  formulaVersion: string;
  calculatedAt: string;
  warnings: string[];
}
export interface ExecutiveLiquiditySnapshot {
  status: "OK" | "PARTIAL";
  effectiveRole: string;
  asOf: string;
  period: { from: string; to: string };
  cashCounts: ExecutiveCashCount[];
  cashAccounts: ExecutiveCashAccount[];
  cashMovements: ExecutiveCashMovement[];
  supplierPayables: ExecutiveSupplierPayable[];
  receivables: ExecutiveReceivableCurrency[];
  cashMovementCoverage: ExecutiveCashMovementCoverage;
  warnings: string[];
}
export type ExecutiveLiquidityFetchResult =
  | { ok: true; data: ExecutiveLiquiditySnapshot }
  | { ok: false; status: "DENIED" | "UNAVAILABLE" | "ERROR"; message: string };

type UnknownRecord = Record<string, unknown>;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_CURRENCY = /^[A-Z]{3}$/;
const STATUSES = new Set<ExecutiveEvidenceStatus>(["VERIFIED", "NEEDS_REVIEW", "UNVERIFIED", "UNAVAILABLE"]);
const BUCKETS = new Set<ExecutiveReceivableAgingBucket["bucket"]>([
  "NOT_DUE", "OVERDUE_1_30", "OVERDUE_31_60", "OVERDUE_61_90", "OVERDUE_90_PLUS", "UNKNOWN_DUE_DATE",
]);

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}
function nonEmpty(value: unknown, max = 500): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
function isoDay(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DAY.test(value)) return false;
  const day = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value;
}
function isoTime(value: unknown): value is string {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/.test(value)) {
    return false;
  }
  const day = value.slice(0, 10);
  const dayMillis = Date.parse(day + "T00:00:00.000Z");
  return Number.isFinite(Date.parse(value)) &&
    Number.isFinite(dayMillis) &&
    new Date(dayMillis).toISOString().slice(0, 10) === day;
}
function amountMinor(value: unknown, allowNegative = false): bigint | null {
  return decimalToMinorUnits(value, 2, allowNegative);
}
function amount(value: unknown, allowNegative = false): number | null {
  const minor = amountMinor(value, allowNegative);
  return minor === null ? null : minorUnitsToNumber(minor, 2);
}
function integer(value: unknown, min = 0, max = 10_000_000): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}
function strings(value: unknown, maxItems = 200): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems || value.some((item) => !nonEmpty(item, 500))) return null;
  return value as string[];
}
function status(value: unknown): value is ExecutiveEvidenceStatus {
  return typeof value === "string" && STATUSES.has(value as ExecutiveEvidenceStatus);
}
function completeness(value: unknown): value is ExecutiveCompleteness {
  return value === "COMPLETE" || value === "PARTIAL" || value === "UNKNOWN";
}
function fail(message: string): ExecutiveLiquidityFetchResult {
  return { ok: false, status: "ERROR", message };
}

export function parseExecutiveLiquidityResponse(value: unknown): ExecutiveLiquidityFetchResult {
  const raw = record(value);
  const authorization = record(raw?.authorization);
  const period = record(raw?.period);
  const coverage = record(raw?.cashMovementCoverage);
  const warnings = strings(raw?.warnings, 100);
  if (
    !raw || (raw.status !== "OK" && raw.status !== "PARTIAL") ||
    raw.sideEffects !== "NONE" ||
    authorization?.tenantScope !== "SERVER_RESOLVED_AUTHENTICATED_TENANT" ||
    !nonEmpty(authorization.effectiveRole, 50) ||
    !["admin", "manager"].includes(authorization.effectiveRole) ||
    !isoTime(raw.asOf) ||
    !period || !isoDay(period.from) || !isoDay(period.to) || period.from > period.to ||
    !warnings ||
    !coverage || !status(coverage.status) || !completeness(coverage.completeness) ||
    !integer(coverage.unclassifiedPostedCashJournalLines) ||
    !integer(coverage.unlinkedCashExpenses) || !integer(coverage.unlinkedCustomerPayments) ||
    !nonEmpty(coverage.formulaId, 150) || !nonEmpty(coverage.formulaVersion, 80) ||
    !isoTime(coverage.calculatedAt)
  ) return fail("لم يرجع الخادم عقد مركز مالي مكتمل النطاق وآمن؛ أُوقف العرض.");

  const coverageWarnings = strings(coverage.warnings, 100);
  if (!coverageWarnings || !Array.isArray(raw.cashCounts) || !Array.isArray(raw.cashAccounts) ||
      !Array.isArray(raw.cashMovements) || !Array.isArray(raw.supplierPayables) ||
      !Array.isArray(raw.receivables) || raw.cashCounts.length > 200 ||
      raw.cashAccounts.length > 200 || raw.cashMovements.length > 500 ||
      raw.supplierPayables.length > 2000 || raw.receivables.length > 50) {
    return fail("بيانات المركز المالي غير مكتملة أو تجاوزت الحدود المسموحة.");
  }

  const cashCounts: ExecutiveCashCount[] = [];
  const countIds = new Set<string>();
  for (const item of raw.cashCounts) {
    const row = record(item);
    const countedAmount = amount(row?.counted_amount);
    if (
      !row || !nonEmpty(row.id, 100) || countIds.has(row.id) ||
      !nonEmpty(row.shift_id, 100) || !nonEmpty(row.shift_label, 100) ||
      !isoDay(row.business_date) || !nonEmpty(row.organization_time_zone, 100) ||
      (row.phase !== "OPENING" && row.phase !== "CLOSING") ||
      !nonEmpty(row.currency, 3) || !ISO_CURRENCY.test(row.currency) ||
      countedAmount === null || countedAmount < 0 ||
      !integer(row.version, 1, 100000) || !isoTime(row.source_timestamp) ||
      !nonEmpty(row.evidence_id, 200) || row.status !== "VERIFIED"
    ) return fail("يوجد عد نقدي غير صالح أو مكرر؛ أُوقف عرضه.");
    countIds.add(row.id);
    cashCounts.push({
      id: row.id, shiftId: row.shift_id, shiftLabel: row.shift_label,
      businessDate: row.business_date, organizationTimeZone: row.organization_time_zone,
      phase: row.phase, currency: row.currency, countedAmount, version: row.version,
      sourceTimestamp: row.source_timestamp, evidenceId: row.evidence_id,
    });
  }

  const cashAccounts: ExecutiveCashAccount[] = [];
  const accountKeys = new Set<string>();
  for (const item of raw.cashAccounts) {
    const row = record(item);
    if (
      !row || !nonEmpty(row.account_id, 100) || !nonEmpty(row.account_code, 80) ||
      !nonEmpty(row.account_name, 150) || !nonEmpty(row.display_name, 150) ||
      (row.settlement_kind !== "cash" && row.settlement_kind !== "bank" && row.settlement_kind !== "unclassified") ||
      !nonEmpty(row.currency, 3) || !ISO_CURRENCY.test(row.currency) ||
      row.balance !== null || row.balance_status !== "UNAVAILABLE" ||
      !nonEmpty(row.source_name, 150)
    ) return fail("تعذر التحقق من ربط حساب نقدي أو مصرفي بعملته.");
    const key = row.account_id + ":" + row.currency;
    if (accountKeys.has(key)) return fail("ظهر حساب مكرر بالعملة نفسها؛ أُوقف العرض.");
    accountKeys.add(key);
    cashAccounts.push({
      accountId: row.account_id, accountCode: row.account_code, accountName: row.account_name,
      displayName: row.display_name, settlementKind: row.settlement_kind, currency: row.currency,
      balance: null, balanceStatus: "UNAVAILABLE", sourceName: row.source_name,
    });
  }

  const cashMovements: ExecutiveCashMovement[] = [];
  const movementKeys = new Set<string>();
  for (const item of raw.cashMovements) {
    const row = record(item);
    const inflowsMinor = amountMinor(row?.inflows);
    const outflowsMinor = amountMinor(row?.outflows);
    const netMovementMinor = amountMinor(row?.net_movement, true);
    const inflows = inflowsMinor === null ? null : minorUnitsToNumber(inflowsMinor, 2);
    const outflows = outflowsMinor === null ? null : minorUnitsToNumber(outflowsMinor, 2);
    const netMovement = netMovementMinor === null ? null : minorUnitsToNumber(netMovementMinor, 2);
    const sourceKinds = strings(row?.source_kinds, 10);
    const evidenceIds = strings(row?.evidence_ids, 25);
    const rowWarnings = strings(row?.warnings, 50);
    if (
      !row || !nonEmpty(row.account_id, 100) || !nonEmpty(row.account_code, 80) ||
      !nonEmpty(row.account_name, 150) || !nonEmpty(row.display_name, 150) ||
      (row.settlement_kind !== "cash" && row.settlement_kind !== "bank" && row.settlement_kind !== "unclassified") ||
      !nonEmpty(row.currency, 3) || !ISO_CURRENCY.test(row.currency) ||
      inflowsMinor === null || inflows === null || inflows < 0 ||
      outflowsMinor === null || outflows === null || outflows < 0 ||
      netMovementMinor === null || netMovement === null ||
      inflowsMinor - outflowsMinor !== netMovementMinor ||
      !integer(row.movement_count, 0, 1_000_000) || !isoTime(row.last_movement_at) ||
      !sourceKinds || !evidenceIds || !rowWarnings ||
      row.status !== "NEEDS_REVIEW" ||
      !nonEmpty(row.formula_id, 150) || !nonEmpty(row.formula_version, 80) ||
      !isoTime(row.calculated_at) || row.as_of !== raw.asOf ||
      !isoDay(row.period_from) || !isoDay(row.period_to) ||
      row.period_from !== period.from || row.period_to !== period.to
    ) return fail("حركة نقدية غير متصالحة أو غير موثقة؛ أُوقف الإجمالي.");
    const key = row.account_id + ":" + row.currency;
    if (movementKeys.has(key)) return fail("تكرر حساب/عملة في حركة النقد؛ أُوقف العرض.");
    movementKeys.add(key);
    cashMovements.push({
      accountId: row.account_id, accountCode: row.account_code, accountName: row.account_name,
      displayName: row.display_name, settlementKind: row.settlement_kind, currency: row.currency,
      period: { from: row.period_from, to: row.period_to }, asOf: row.as_of,
      inflows, outflows, netMovement, movementCount: row.movement_count,
      lastMovementAt: row.last_movement_at, sourceKinds, evidenceIds, status: row.status,
      formulaId: row.formula_id, formulaVersion: row.formula_version,
      calculatedAt: row.calculated_at, warnings: rowWarnings,
    });
  }

  const supplierPayables: ExecutiveSupplierPayable[] = [];
  const supplierKeys = new Set<string>();
  for (const item of raw.supplierPayables) {
    const row = record(item);
    const payable = row?.posted_payable === null ? null : amount(row?.posted_payable);
    const reserved = amount(row?.reserved_payment_amount);
    const evidenceIds = strings(row?.evidence_ids, 25);
    const rowWarnings = strings(row?.warnings, 50);
    if (
      !row || !nonEmpty(row.supplier_id, 100) || !nonEmpty(row.supplier_name, 150) ||
      !nonEmpty(row.currency, 3) || !ISO_CURRENCY.test(row.currency) ||
      !integer(row.receipt_count, 1, 1000000) ||
      (payable === null && row.status !== "NEEDS_REVIEW") || (payable !== null && payable < 0) ||
      reserved === null || reserved < 0 || !isoDay(row.last_receipt_date) ||
      !isoTime(row.as_of) || row.as_of !== raw.asOf || !status(row.status) ||
      !nonEmpty(row.formula_id, 150) || !nonEmpty(row.formula_version, 80) ||
      !isoTime(row.calculated_at) || !evidenceIds || !evidenceIds.length ||
      row.due_date_status !== "UNAVAILABLE" || !rowWarnings
    ) return fail("التزام مورد غير متحقق من إيصال وتغطية مالية صالحة؛ أُوقف العرض.");
    const key = row.supplier_id + ":" + row.currency;
    if (supplierKeys.has(key)) return fail("تكرر التزام المورد للعملة نفسها؛ أُوقف العرض.");
    supplierKeys.add(key);
    supplierPayables.push({
      supplierId: row.supplier_id, supplierName: row.supplier_name, currency: row.currency,
      receiptCount: row.receipt_count, postedPayable: payable, reservedPaymentAmount: reserved,
      lastReceiptDate: row.last_receipt_date, asOf: row.as_of, status: row.status,
      formulaId: row.formula_id, formulaVersion: row.formula_version,
      calculatedAt: row.calculated_at, evidenceIds, dueDateStatus: row.due_date_status,
      warnings: rowWarnings,
    });
  }

  const receivables: ExecutiveReceivableCurrency[] = [];
  const currencies = new Set<string>();
  for (const item of raw.receivables) {
    const row = record(item);
    const totalMinor = amountMinor(row?.total_outstanding);
    const notDueMinor = amountMinor(row?.not_due_amount);
    const overdueMinor = amountMinor(row?.overdue_amount);
    const total = totalMinor === null ? null : minorUnitsToNumber(totalMinor, 2);
    const notDue = notDueMinor === null ? null : minorUnitsToNumber(notDueMinor, 2);
    const overdue = overdueMinor === null ? null : minorUnitsToNumber(overdueMinor, 2);
    const rowWarnings = strings(row?.warnings, 50);
    if (
      !row || !nonEmpty(row.currency, 3) || !ISO_CURRENCY.test(row.currency) ||
      total === null || total < 0 || notDue === null || notDue < 0 ||
      overdue === null || overdue < 0 || !integer(row.invoice_count, 0, 10000000) ||
      !integer(row.partially_paid_count, 0, row.invoice_count) ||
      !Array.isArray(row.aging_buckets) || row.aging_buckets.length > 6 ||
      !isoTime(row.as_of) || row.as_of !== raw.asOf || !status(row.status) ||
      !nonEmpty(row.formula_id, 150) || !nonEmpty(row.formula_version, 80) ||
      !isoTime(row.calculated_at) || !rowWarnings
    ) return fail("ملخص الذمم أو أعمارها غير صالح؛ أُوقف العرض.");
    if (currencies.has(row.currency)) return fail("عملة ذمم مكررة؛ أُوقف العرض.");
    currencies.add(row.currency);
    const buckets: ExecutiveReceivableAgingBucket[] = [];
    const bucketNames = new Set<string>();
    let bucketTotalMinor = 0n;
    let bucketNotDueMinor = 0n;
    let bucketOverdueMinor = 0n;
    for (const bucketItem of row.aging_buckets) {
      const bucket = record(bucketItem);
      const bucketAmountMinor = amountMinor(bucket?.amount);
      const bucketAmount = bucketAmountMinor === null ? null : minorUnitsToNumber(bucketAmountMinor, 2);
      const evidence = strings(bucket?.evidence_ids, 50);
      if (
        !bucket || typeof bucket.bucket !== "string" ||
        !BUCKETS.has(bucket.bucket as ExecutiveReceivableAgingBucket["bucket"]) ||
        bucketNames.has(bucket.bucket) || bucketAmountMinor === null || bucketAmount === null || bucketAmount < 0 ||
        !integer(bucket.invoice_count, 0, 10000000) ||
        !integer(bucket.partially_paid_count, 0, bucket.invoice_count) || !evidence
      ) return fail("فئة أعمار الذمم غير صالحة أو مكررة.");
      bucketNames.add(bucket.bucket);
      bucketTotalMinor += bucketAmountMinor;
      if (bucket.bucket === "NOT_DUE") bucketNotDueMinor += bucketAmountMinor;
      if (bucket.bucket.startsWith("OVERDUE_")) bucketOverdueMinor += bucketAmountMinor;
      buckets.push({
        bucket: bucket.bucket as ExecutiveReceivableAgingBucket["bucket"],
        amount: bucketAmount, invoiceCount: bucket.invoice_count,
        partiallyPaidCount: bucket.partially_paid_count, evidenceIds: evidence,
      });
    }
    if (totalMinor === null || notDueMinor === null || overdueMinor === null ||
        bucketTotalMinor !== totalMinor ||
        bucketNotDueMinor !== notDueMinor ||
        bucketOverdueMinor !== overdueMinor) {
      return fail("مجاميع أعمار الذمم لا تطابق إجمالي ومستحق وغير مستحق العملة بدقة السنت.");
    }
    receivables.push({
      currency: row.currency, totalOutstanding: total, notDueAmount: notDue, overdueAmount: overdue,
      invoiceCount: row.invoice_count, partiallyPaidCount: row.partially_paid_count,
      agingBuckets: buckets, asOf: row.as_of, status: row.status,
      formulaId: row.formula_id, formulaVersion: row.formula_version,
      calculatedAt: row.calculated_at, warnings: rowWarnings,
    });
  }

  return {
    ok: true,
    data: {
      status: raw.status,
      effectiveRole: authorization.effectiveRole,
      asOf: raw.asOf,
      period: { from: period.from, to: period.to },
      cashCounts, cashAccounts, cashMovements, supplierPayables, receivables,
      cashMovementCoverage: {
        status: coverage.status, completeness: coverage.completeness,
        unclassifiedPostedCashJournalLines: coverage.unclassifiedPostedCashJournalLines,
        unlinkedCashExpenses: coverage.unlinkedCashExpenses,
        unlinkedCustomerPayments: coverage.unlinkedCustomerPayments,
        formulaId: coverage.formulaId, formulaVersion: coverage.formulaVersion,
        calculatedAt: coverage.calculatedAt, warnings: coverageWarnings,
      },
      warnings,
    },
  };
}

export async function fetchExecutiveLiquidityWorkspace(): Promise<ExecutiveLiquidityFetchResult> {
  try {
    // The database owns the as-of clock and the default 90-day historical period.
    const { data, error } = await supabase.rpc("fetch_executive_liquidity_workspace", {
      p_from: null,
      p_to: null,
    });
    if (error) {
      const code = record(error)?.code;
      if (code === "42501") {
        return { ok: false, status: "DENIED", message: "تتطلب قراءة مركز السيولة صلاحية الإدارة المالية للمؤسسة." };
      }
      return { ok: false, status: "UNAVAILABLE", message: "مصدر مركز السيولة غير متاح؛ لم تُعرض أرصدة بديلة." };
    }
    return parseExecutiveLiquidityResponse(data);
  } catch {
    return { ok: false, status: "UNAVAILABLE", message: "تعذر الاتصال بمصدر مركز السيولة؛ لم تُعرض بيانات تقديرية." };
  }
}
