import { describe, expect, it } from "vitest";
import type {
  CashAccountEvidence,
  CashOpeningBalanceProposal,
  CashReconciliationWorkspace,
  CashSettlementAccount,
  FinanceBankStatement,
} from "@/lib/finance-cash-account-reconciliation";
import { getVerifiedCashAccountPosition } from "./cash-account-balance-evidence";

const asOf = "2026-11-17T01:00:00.000Z";
const ids = {
  mapping: "00000000-0000-4000-8000-000000000001",
  account: "00000000-0000-4000-8000-000000000002",
  proposal: "00000000-0000-4000-8000-000000000003",
  document: "00000000-0000-4000-8000-000000000004",
  submitter: "00000000-0000-4000-8000-000000000005",
  reviewer: "00000000-0000-4000-8000-000000000006",
  statement: "00000000-0000-4000-8000-000000000007",
  bankDocument: "00000000-0000-4000-8000-000000000008",
  run: "00000000-0000-4000-8000-000000000009",
};

function account(kind: CashSettlementAccount["settlementKind"] = "cash"): CashSettlementAccount {
  return {
    id: ids.mapping,
    accountId: ids.account,
    accountCode: "1010",
    accountName: "Cash and bank",
    displayName: "Main account",
    settlementKind: kind,
    currency: "YER",
    isActive: true,
  };
}

function evidence(input: Partial<CashAccountEvidence> = {}): CashAccountEvidence {
  return {
    id: ids.document,
    mappingId: ids.mapping,
    evidenceKind: "opening_balance",
    fileName: "opening.pdf",
    mimeType: "application/pdf",
    byteSize: 1024,
    contentSha256: "a".repeat(64),
    storagePath: ids.mapping + "/" + ids.document + ".pdf",
    createdAt: "2026-11-17T00:10:00.000Z",
    uploadedBy: ids.submitter,
    ...input,
  };
}

function proposal(input: Partial<CashOpeningBalanceProposal> = {}): CashOpeningBalanceProposal {
  return {
    id: ids.proposal,
    mappingId: ids.mapping,
    evidenceId: ids.document,
    asOfDate: "2026-11-16",
    openingBalance: "125000.00",
    currency: "YER",
    submittedBy: ids.submitter,
    submittedAt: "2026-11-17T00:20:00.000Z",
    reviewDecision: "approved",
    reviewReason: "مطابق للمستند ودفتر الأستاذ",
    reviewedBy: ids.reviewer,
    reviewedAt: "2026-11-17T00:30:00.000Z",
    postedGlBalance: "125000.00",
    postedGlLineCount: 2,
    ...input,
  };
}

function bankStatement(input: Partial<FinanceBankStatement> = {}): FinanceBankStatement {
  return {
    id: ids.statement,
    mappingId: ids.mapping,
    evidenceId: ids.bankDocument,
    statementReference: "BANK-2026-1116",
    periodFrom: "2026-11-01",
    periodTo: "2026-11-16",
    openingBalance: "120000.00",
    closingBalance: "128500.00",
    currency: "YER",
    createdBy: ids.submitter,
    createdAt: "2026-11-17T00:35:00.000Z",
    lines: [],
    lineCount: 0,
    matchedCount: 0,
    latestRun: {
      id: ids.run,
      runNumber: 1,
      outcome: "VERIFIED",
      statementDifference: "0.00",
      ledgerDifference: "0.00",
      unmatchedStatementLines: 0,
      unmatchedLedgerLines: 0,
      statementNetMovement: "8500.00",
      ledgerNetMovement: "8500.00",
      reviewedBy: ids.reviewer,
      reviewedAt: "2026-11-17T00:40:00.000Z",
      reason: "تمت مطابقة كامل الكشف",
    },
    isVoided: false,
    voidReason: null,
    voidedBy: null,
    voidedAt: null,
    ...input,
  };
}

function workspace(input: {
  accounts?: CashSettlementAccount[];
  evidence?: CashAccountEvidence[];
  openingBalances?: CashOpeningBalanceProposal[];
  statements?: FinanceBankStatement[];
} = {}): CashReconciliationWorkspace {
  return {
    asOf,
    role: "manager",
    accounts: input.accounts ?? [account()],
    evidence: input.evidence ?? [evidence()],
    openingBalances: input.openingBalances ?? [proposal()],
    statements: input.statements ?? [],
  };
}

describe("verified cash account balance evidence", () => {
  it("shows only the independently reviewed opening balance that exactly matches posted GL", () => {
    const result = getVerifiedCashAccountPosition(workspace(), ids.mapping);
    expect(result.opening).toMatchObject({
      status: "VERIFIED",
      amount: 125000,
      asOfDate: "2026-11-16",
      proposalId: ids.proposal,
      evidenceId: ids.document,
    });
    expect(result.bankClosing).toBeNull();
  });

  it("withholds an opening proposal when the posted ledger amount differs", () => {
    const result = getVerifiedCashAccountPosition(workspace({
      openingBalances: [proposal({ postedGlBalance: "124999.99" })],
    }), ids.mapping);
    expect(result.opening.status).toBe("NEEDS_REVIEW");
    expect(result.opening.amount).toBeNull();
  });

  it("withholds an opening proposal when the reviewer is the submitter", () => {
    const result = getVerifiedCashAccountPosition(workspace({
      openingBalances: [proposal({ reviewedBy: ids.submitter })],
    }), ids.mapping);
    expect(result.opening.status).toBe("NEEDS_REVIEW");
  });

  it("requires an opening-balance document for the same account", () => {
    const result = getVerifiedCashAccountPosition(workspace({
      evidence: [evidence({ evidenceKind: "cash_count" })],
    }), ids.mapping);
    expect(result.opening.status).toBe("NEEDS_REVIEW");
  });

  it("does not silently choose between multiple proposals for the latest date", () => {
    const result = getVerifiedCashAccountPosition(workspace({
      openingBalances: [
        proposal(),
        proposal({ id: "00000000-0000-4000-8000-000000000010", openingBalance: "125000.00" }),
      ],
    }), ids.mapping);
    expect(result.opening.status).toBe("NEEDS_REVIEW");
    expect(result.opening.amount).toBeNull();
  });

  it("does not accept a review recorded after the snapshot", () => {
    const result = getVerifiedCashAccountPosition(workspace({
      openingBalances: [proposal({ reviewedAt: "2026-11-17T01:00:01.000Z" })],
    }), ids.mapping);
    expect(result.opening.status).toBe("NEEDS_REVIEW");
  });

  it("shows a bank closing balance only after every statement line and ledger line reconcile", () => {
    const result = getVerifiedCashAccountPosition(workspace({
      accounts: [account("bank")],
      evidence: [evidence({ id: ids.bankDocument, evidenceKind: "bank_statement" })],
      openingBalances: [],
      statements: [bankStatement()],
    }), ids.mapping);
    expect(result.bankClosing).toMatchObject({
      status: "VERIFIED",
      closingBalance: 128500,
      periodTo: "2026-11-16",
      statementReference: "BANK-2026-1116",
      statementId: ids.statement,
      matchedLineCount: 0,
    });
  });

  it("withholds a bank closing balance when a statement contains unmatched lines", () => {
    const result = getVerifiedCashAccountPosition(workspace({
      accounts: [account("bank")],
      evidence: [evidence({ id: ids.bankDocument, evidenceKind: "bank_statement" })],
      openingBalances: [],
      statements: [bankStatement({
        lineCount: 1,
        matchedCount: 0,
        latestRun: {
          ...bankStatement().latestRun!,
          outcome: "NEEDS_REVIEW",
          unmatchedStatementLines: 1,
        },
      })],
    }), ids.mapping);
    expect(result.bankClosing?.status).toBe("NEEDS_REVIEW");
    expect(result.bankClosing?.closingBalance).toBeNull();
  });

  it("does not present an old bank closing as current when the latest statement needs review", () => {
    const old = bankStatement({ id: "00000000-0000-4000-8000-000000000011", periodTo: "2026-11-10" });
    const latest = bankStatement({
      id: "00000000-0000-4000-8000-000000000012",
      periodTo: "2026-11-16",
      latestRun: { ...bankStatement().latestRun!, outcome: "NEEDS_REVIEW", statementDifference: "1.00" },
    });
    const result = getVerifiedCashAccountPosition(workspace({
      accounts: [account("bank")],
      evidence: [evidence({ id: ids.bankDocument, evidenceKind: "bank_statement" })],
      openingBalances: [],
      statements: [old, latest],
    }), ids.mapping);
    expect(result.bankClosing?.status).toBe("NEEDS_REVIEW");
    expect(result.bankClosing?.statementId).toBe(latest.id);
    expect(result.bankClosing?.closingBalance).toBeNull();
  });
});
