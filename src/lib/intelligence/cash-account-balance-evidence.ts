import type {
  CashReconciliationWorkspace,
  CashSettlementAccount,
} from "@/lib/finance-cash-account-reconciliation";
import { decimalToMinorUnits, minorUnitsToNumber } from "./financial-precision";

export type AccountEvidenceStatus = "VERIFIED" | "NEEDS_REVIEW" | "UNAVAILABLE";

export interface VerifiedAccountOpeningEvidence {
  status: AccountEvidenceStatus;
  amount: number | null;
  asOfDate: string | null;
  proposalId: string | null;
  evidenceId: string | null;
}

export interface VerifiedAccountBankEvidence {
  status: AccountEvidenceStatus;
  closingBalance: number | null;
  periodTo: string | null;
  statementReference: string | null;
  statementId: string | null;
  matchedLineCount: number | null;
}

export interface VerifiedCashAccountPosition {
  opening: VerifiedAccountOpeningEvidence;
  bankClosing: VerifiedAccountBankEvidence | null;
}

const unavailableOpening = (): VerifiedAccountOpeningEvidence => ({
  status: "UNAVAILABLE",
  amount: null,
  asOfDate: null,
  proposalId: null,
  evidenceId: null,
});

const unavailableBank = (): VerifiedAccountBankEvidence => ({
  status: "UNAVAILABLE",
  closingBalance: null,
  periodTo: null,
  statementReference: null,
  statementId: null,
  matchedLineCount: null,
});

function validDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parsedTime(value: string | null): number | null {
  if (!value) return null;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

function minorUnits(value: string | number | null): bigint | null {
  if (value === null) return null;
  try {
    return decimalToMinorUnits(value, 2, true);
  } catch {
    return null;
  }
}

function safeAmount(value: string | number | null): number | null {
  const minor = minorUnits(value);
  return minor === null ? null : minorUnitsToNumber(minor, 2);
}

function zeroAmount(value: string): boolean {
  return minorUnits(value) === 0n;
}

function resolveOpening(
  workspace: CashReconciliationWorkspace,
  account: CashSettlementAccount,
): VerifiedAccountOpeningEvidence {
  const snapshotTime = parsedTime(workspace.asOf);
  if (snapshotTime === null || !validDay(workspace.asOf.slice(0, 10))) {
    return { ...unavailableOpening(), status: "NEEDS_REVIEW" };
  }
  const snapshotDay = workspace.asOf.slice(0, 10);
  const proposals = workspace.openingBalances
    .filter((item) => item.mappingId === account.id && validDay(item.asOfDate) && item.asOfDate <= snapshotDay)
    .sort((left, right) => right.asOfDate.localeCompare(left.asOfDate) || right.submittedAt.localeCompare(left.submittedAt));

  const dates = [...new Set(proposals.map((item) => item.asOfDate))];
  for (const asOfDate of dates) {
    const sameDay = proposals.filter((item) => item.asOfDate === asOfDate);
    if (sameDay.length !== 1) {
      return { ...unavailableOpening(), status: "NEEDS_REVIEW", asOfDate };
    }

    const proposal = sameDay[0];
    // A rejected proposal does not replace the previous approved opening snapshot.
    if (proposal.reviewDecision === "rejected") continue;
    if (proposal.reviewDecision !== "approved") {
      return { ...unavailableOpening(), status: "NEEDS_REVIEW", asOfDate };
    }

    const evidence = workspace.evidence.find((item) => item.id === proposal.evidenceId);
    const amountMinor = minorUnits(proposal.openingBalance);
    const ledgerMinor = minorUnits(proposal.postedGlBalance);
    const documentTime = parsedTime(evidence?.createdAt ?? null);
    const submittedTime = parsedTime(proposal.submittedAt);
    const reviewedTime = parsedTime(proposal.reviewedAt);
    const valid = Boolean(
      account.isActive &&
      proposal.currency === account.currency &&
      proposal.asOfDate === asOfDate &&
      proposal.reviewReason?.trim() &&
      proposal.reviewedBy &&
      proposal.reviewedBy !== proposal.submittedBy &&
      proposal.postedGlLineCount !== null &&
      proposal.postedGlLineCount > 0 &&
      amountMinor !== null &&
      ledgerMinor !== null &&
      amountMinor === ledgerMinor &&
      evidence &&
      evidence.mappingId === account.id &&
      evidence.evidenceKind === "opening_balance" &&
      documentTime !== null &&
      submittedTime !== null &&
      reviewedTime !== null &&
      documentTime <= submittedTime &&
      submittedTime <= reviewedTime &&
      reviewedTime <= snapshotTime
    );
    const amount = valid ? safeAmount(proposal.openingBalance) : null;
    if (!valid || amount === null || !evidence) {
      return { ...unavailableOpening(), status: "NEEDS_REVIEW", asOfDate };
    }
    return {
      status: "VERIFIED",
      amount,
      asOfDate,
      proposalId: proposal.id,
      evidenceId: evidence.id,
    };
  }

  return unavailableOpening();
}

function resolveBankClosing(
  workspace: CashReconciliationWorkspace,
  account: CashSettlementAccount,
): VerifiedAccountBankEvidence | null {
  if (account.settlementKind !== "bank") return null;
  const snapshotTime = parsedTime(workspace.asOf);
  if (snapshotTime === null || !validDay(workspace.asOf.slice(0, 10))) {
    return { ...unavailableBank(), status: "NEEDS_REVIEW" };
  }
  const statements = workspace.statements
    .filter((item) => item.mappingId === account.id && !item.isVoided && validDay(item.periodTo) &&
      item.periodTo <= workspace.asOf.slice(0, 10) && (parsedTime(item.createdAt) ?? Infinity) <= snapshotTime)
    .sort((left, right) => right.periodTo.localeCompare(left.periodTo) ||
      right.createdAt.localeCompare(left.createdAt));
  const statement = statements[0];
  if (!statement) return unavailableBank();

  const evidence = workspace.evidence.find((item) => item.id === statement.evidenceId);
  const run = statement.latestRun;
  const statementTime = parsedTime(statement.createdAt);
  const evidenceTime = parsedTime(evidence?.createdAt ?? null);
  const reviewedTime = parsedTime(run?.reviewedAt ?? null);
  const closingBalance = safeAmount(statement.closingBalance);
  const valid = Boolean(
    evidence &&
    evidence.mappingId === account.id &&
    evidence.evidenceKind === "bank_statement" &&
    evidenceTime !== null &&
    statementTime !== null &&
    evidenceTime <= statementTime &&
    statement.currency === account.currency &&
    statement.periodFrom <= statement.periodTo &&
    run &&
    run.outcome === "VERIFIED" &&
    run.unmatchedStatementLines === 0 &&
    run.unmatchedLedgerLines === 0 &&
    statement.matchedCount === statement.lineCount &&
    zeroAmount(run.statementDifference) &&
    zeroAmount(run.ledgerDifference) &&
    reviewedTime !== null &&
    reviewedTime <= snapshotTime &&
    closingBalance !== null
  );
  if (!valid || closingBalance === null) {
    return {
      ...unavailableBank(),
      status: "NEEDS_REVIEW",
      periodTo: statement.periodTo,
      statementReference: statement.statementReference,
      statementId: statement.id,
    };
  }
  return {
    status: "VERIFIED",
    closingBalance,
    periodTo: statement.periodTo,
    statementReference: statement.statementReference,
    statementId: statement.id,
    matchedLineCount: statement.matchedCount,
  };
}

/**
 * Resolves displayable opening and bank-closing evidence for one settlement account.
 * It never labels an opening balance or an old statement close as the current balance.
 */
export function getVerifiedCashAccountPosition(
  workspace: CashReconciliationWorkspace,
  mappingId: string,
): VerifiedCashAccountPosition {
  const account = workspace.accounts.find((item) => item.id === mappingId);
  if (!account || !account.isActive) {
    return { opening: unavailableOpening(), bankClosing: null };
  }
  return {
    opening: resolveOpening(workspace, account),
    bankClosing: resolveBankClosing(workspace, account),
  };
}
