import type { CashReconciliationWorkspace } from "@/lib/finance-cash-account-reconciliation";
import { decimalToMinorUnits, minorUnitsToNumber } from "./financial-precision";
import type { EvidenceRecord, MetricSnapshot } from "./types";

export interface ApprovedCashOpeningBalanceResult {
  metrics: MetricSnapshot[];
  evidenceRecords: EvidenceRecord[];
  warnings: string[];
}

const FORMULA_ID = "nasr1.finance-approved-opening-balance-by-currency";
const FORMULA_VERSION = "1.0.0";

function verifiedRecord(input: {
  id: string;
  name: string;
  recordId: string;
  sourceTimestamp: string;
  asOf: string;
  currency: string;
}): EvidenceRecord {
  return {
    id: input.id,
    source: {
      kind: "TABLE",
      name: input.name,
      recordId: input.recordId,
      version: "20261106320000",
    },
    sourceTimestamp: input.sourceTimestamp,
    asOf: input.asOf,
    period: null,
    currency: input.currency,
    status: "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    warnings: [],
  };
}

/**
 * Produces one opening metric per currency only when every active cash/bank
 * settlement mapping in that currency has a same-day, independently reviewed
 * opening balance backed by an attached opening-balance document and an exact
 * same-account posted-GL match. Partial currency totals are never emitted.
 */
export function buildApprovedCashOpeningBalances(
  workspace: CashReconciliationWorkspace,
  requestedAsOf: string,
): ApprovedCashOpeningBalanceResult {
  const warnings: string[] = [];
  const requestedTime = Date.parse(requestedAsOf);
  const workspaceTime = Date.parse(workspace.asOf);

  if (!Number.isFinite(requestedTime) || !Number.isFinite(workspaceTime) ||
      new Date(requestedTime).toISOString() !== new Date(workspaceTime).toISOString()) {
    return {
      metrics: [],
      evidenceRecords: [],
      warnings: ["تاريخ لقطة الأرصدة الافتتاحية لا يطابق تاريخ التدفق النقدي؛ حُجب ربط الأرصدة."],
    };
  }

  const asOf = new Date(requestedTime).toISOString();
  const asOfDate = asOf.slice(0, 10);
  const accounts = workspace.accounts.filter((account) => account.isActive);
  if (!accounts.length) {
    return {
      metrics: [],
      evidenceRecords: [],
      warnings: ["لا توجد حسابات تسوية نقدية أو مصرفية نشطة يمكن بناء رصيد افتتاحي موثوق منها."],
    };
  }

  const evidenceById = new Map(workspace.evidence.map((item) => [item.id, item]));
  const accountGroups = new Map<string, typeof accounts>();
  for (const account of accounts) {
    const group = accountGroups.get(account.currency) ?? [];
    group.push(account);
    accountGroups.set(account.currency, group);
  }

  const metrics: MetricSnapshot[] = [];
  const evidenceRecords: EvidenceRecord[] = [];

  for (const [currency, groupAccounts] of [...accountGroups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const mappingIds = new Set(groupAccounts.map((account) => account.id));
    const accountingIds = new Set(groupAccounts.map((account) => account.accountId));
    if (mappingIds.size !== groupAccounts.length || accountingIds.size !== groupAccounts.length) {
      warnings.push("عملة " + currency + ": توجد روابط مكررة لحساب أستاذ واحد؛ حُجب مجموع العملة لمنع احتساب الحساب مرتين.");
      continue;
    }

    let complete = true;
    let totalMinor = 0n;
    const groupEvidence: EvidenceRecord[] = [];
    const lineageIds: string[] = [];
    const proposalIds = new Set<string>();
    const sourceEvidenceIds = new Set<string>();

    for (const account of groupAccounts) {
      const sameDay = workspace.openingBalances.filter((proposal) =>
        proposal.mappingId === account.id && proposal.asOfDate === asOfDate
      );
      const approved = sameDay.filter((proposal) => proposal.reviewDecision === "approved");
      if (approved.length !== 1) {
        complete = false;
        break;
      }

      const proposal = approved[0];
      const document = evidenceById.get(proposal.evidenceId);
      const amountMinor = decimalToMinorUnits(proposal.openingBalance, 2, true);
      const ledgerMinor = proposal.postedGlBalance === null
        ? null
        : decimalToMinorUnits(proposal.postedGlBalance, 2, true);
      const submittedAt = Date.parse(proposal.submittedAt);
      const documentAt = document ? Date.parse(document.createdAt) : Number.NaN;
      const reviewedAt = proposal.reviewedAt ? Date.parse(proposal.reviewedAt) : Number.NaN;

      const valid = Boolean(
        proposal.currency === currency &&
        proposal.asOfDate === asOfDate &&
        proposal.reviewDecision === "approved" &&
        proposal.reviewReason?.trim() &&
        proposal.reviewedBy &&
        proposal.reviewedBy?.toLowerCase() !== proposal.submittedBy.toLowerCase() &&
        proposal.postedGlLineCount !== null &&
        proposal.postedGlLineCount > 0 &&
        amountMinor !== null &&
        ledgerMinor !== null &&
        amountMinor === ledgerMinor &&
        document &&
        document.mappingId === account.id &&
        document.evidenceKind === "opening_balance" &&
        !proposalIds.has(proposal.id) &&
        !sourceEvidenceIds.has(document.id) &&
        Number.isFinite(submittedAt) &&
        Number.isFinite(documentAt) &&
        Number.isFinite(reviewedAt) &&
        documentAt <= submittedAt &&
        submittedAt <= reviewedAt &&
        reviewedAt <= requestedTime
      );

      if (!valid || amountMinor === null || !document || !proposal.reviewedAt) {
        complete = false;
        break;
      }

      proposalIds.add(proposal.id);
      sourceEvidenceIds.add(document.id);
      totalMinor += amountMinor;

      const documentEvidenceId = "cash-opening-document:" + document.id;
      const reviewEvidenceId = "cash-opening-review:" + proposal.id;
      lineageIds.push(documentEvidenceId, reviewEvidenceId);
      groupEvidence.push(
        verifiedRecord({
          id: documentEvidenceId,
          name: "finance_cash_account_evidence",
          recordId: document.id,
          sourceTimestamp: document.createdAt,
          asOf,
          currency,
        }),
        verifiedRecord({
          id: reviewEvidenceId,
          name: "finance_cash_opening_balance_reviews",
          recordId: proposal.id,
          sourceTimestamp: proposal.reviewedAt,
          asOf,
          currency,
        }),
      );
    }

    if (!complete || groupEvidence.length !== groupAccounts.length * 2) {
      warnings.push("عملة " + currency + ": لم يُعتمد رصيد افتتاحي موثق لكل حساب نشط في تاريخ الاحتساب؛ لم يُستخدم أي مجموع جزئي.");
      continue;
    }

    const value = minorUnitsToNumber(totalMinor, 2);
    if (value === null) {
      warnings.push("عملة " + currency + ": تجاوز مجموع الأرصدة الافتتاحية حد الدقة الآمنة؛ حُجب الإجمالي.");
      continue;
    }

    metrics.push({
      id: "finance.cash.opening-balance:" + currency + ":" + asOfDate,
      key: "cash.opening_balance",
      value,
      unit: "CURRENCY",
      currency,
      status: "VERIFIED",
      completeness: "COMPLETE",
      quality: "ACCEPTABLE",
      period: null,
      asOf,
      lineage: {
        evidenceIds: lineageIds,
        calculatedAt: asOf,
        formulaId: FORMULA_ID,
        formulaVersion: FORMULA_VERSION,
        transformations: [
          "تغطية جميع حسابات التسوية النشطة داخل العملة",
          "مستند افتتاحي مرفق لكل حساب",
          "مراجعة مستقلة عن مقدم الطلب",
          "مطابقة مبلغ الافتتاح مع حركة الأستاذ العام المرحلة للحساب والتاريخ نفسيهما",
          "جمع المبالغ بوحدات نقدية صغرى دقيقة دون دمج العملات",
        ],
      },
      warnings: [],
    });
    evidenceRecords.push(...groupEvidence);
  }

  return { metrics, evidenceRecords, warnings };
}
