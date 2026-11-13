import { describe, expect, it } from "vitest";
import type {
  CashAccountEvidence,
  CashOpeningBalanceProposal,
  CashReconciliationWorkspace,
  CashSettlementAccount,
} from "@/lib/finance-cash-account-reconciliation";
import { buildApprovedCashOpeningBalances } from "./cash-opening-balance";

const AS_OF = "2026-11-13T09:00:00.000Z";
const IDS = {
  mappingA: "00000000-0000-4000-8000-000000000001",
  mappingB: "00000000-0000-4000-8000-000000000002",
  mappingC: "00000000-0000-4000-8000-000000000003",
  accountA: "00000000-0000-4000-8000-000000000011",
  accountB: "00000000-0000-4000-8000-000000000012",
  accountC: "00000000-0000-4000-8000-000000000013",
  proposalA: "00000000-0000-4000-8000-000000000021",
  proposalB: "00000000-0000-4000-8000-000000000022",
  proposalC: "00000000-0000-4000-8000-000000000023",
  evidenceA: "00000000-0000-4000-8000-000000000031",
  evidenceB: "00000000-0000-4000-8000-000000000032",
  evidenceC: "00000000-0000-4000-8000-000000000033",
  submitter: "00000000-0000-4000-8000-000000000041",
  reviewer: "00000000-0000-4000-8000-000000000042",
};

function account(
  id: string,
  accountId: string,
  currency = "YER",
): CashSettlementAccount {
  return {
    id,
    accountId,
    accountCode: "1010",
    accountName: "Cash account",
    displayName: "Cash account",
    settlementKind: "cash",
    currency,
    isActive: true,
  };
}

function document(id: string, mappingId: string, evidenceKind: CashAccountEvidence["evidenceKind"] = "opening_balance"): CashAccountEvidence {
  return {
    id,
    mappingId,
    evidenceKind,
    fileName: "opening.pdf",
    mimeType: "application/pdf",
    byteSize: 1024,
    contentSha256: "a".repeat(64),
    storagePath: mappingId + "/" + id + ".pdf",
    createdAt: "2026-11-13T08:00:00.000Z",
    uploadedBy: IDS.submitter,
  };
}

function proposal(input: {
  id: string;
  mappingId: string;
  evidenceId: string;
  amount: string;
  currency?: string;
  date?: string;
  decision?: CashOpeningBalanceProposal["reviewDecision"];
  posted?: string | null;
  lineCount?: number | null;
  submittedAt?: string;
  reviewedAt?: string | null;
  submittedBy?: string;
  reviewedBy?: string | null;
}): CashOpeningBalanceProposal {
  return {
    id: input.id,
    mappingId: input.mappingId,
    evidenceId: input.evidenceId,
    asOfDate: input.date ?? "2026-11-13",
    openingBalance: input.amount,
    currency: input.currency ?? "YER",
    submittedBy: input.submittedBy ?? IDS.submitter,
    submittedAt: input.submittedAt ?? "2026-11-13T08:10:00.000Z",
    reviewDecision: input.decision === undefined ? "approved" : input.decision,
    reviewReason: input.decision === "rejected" ? "Evidence does not match" : "Matched to posted GL",
    reviewedBy: input.reviewedBy === undefined ? IDS.reviewer : input.reviewedBy,
    reviewedAt: input.reviewedAt === undefined ? "2026-11-13T08:20:00.000Z" : input.reviewedAt,
    postedGlBalance: input.posted === undefined ? input.amount : input.posted,
    postedGlLineCount: input.lineCount === undefined ? 2 : input.lineCount,
  };
}

function workspace(input: {
  accounts?: CashSettlementAccount[];
  evidence?: CashAccountEvidence[];
  openingBalances?: CashOpeningBalanceProposal[];
  asOf?: string;
} = {}): CashReconciliationWorkspace {
  return {
    asOf: input.asOf ?? AS_OF,
    role: "manager",
    accounts: input.accounts ?? [
      account(IDS.mappingA, IDS.accountA),
      account(IDS.mappingB, IDS.accountB),
    ],
    evidence: input.evidence ?? [
      document(IDS.evidenceA, IDS.mappingA),
      document(IDS.evidenceB, IDS.mappingB),
    ],
    openingBalances: input.openingBalances ?? [
      proposal({ id: IDS.proposalA, mappingId: IDS.mappingA, evidenceId: IDS.evidenceA, amount: "0.10" }),
      proposal({ id: IDS.proposalB, mappingId: IDS.mappingB, evidenceId: IDS.evidenceB, amount: "0.20" }),
    ],
    statements: [],
  };
}

describe("approved cash opening balance forecast source", () => {
  it("aggregates every approved account by currency with exact minor-unit arithmetic", () => {
    const result = buildApprovedCashOpeningBalances(workspace(), AS_OF);
    expect(result.metrics).toHaveLength(1);
    expect(result.metrics[0]).toMatchObject({
      key: "cash.opening_balance",
      value: 0.3,
      currency: "YER",
      status: "VERIFIED",
      completeness: "COMPLETE",
      quality: "ACCEPTABLE",
      asOf: AS_OF,
    });
    expect(result.evidenceRecords).toHaveLength(4);
    expect(result.metrics[0].lineage.evidenceIds).toHaveLength(4);
    expect(result.warnings).toEqual([]);
  });

  it("keeps currencies separate rather than combining them", () => {
    const result = buildApprovedCashOpeningBalances(workspace({
      accounts: [
        account(IDS.mappingA, IDS.accountA, "YER"),
        account(IDS.mappingB, IDS.accountB, "USD"),
      ],
      evidence: [
        document(IDS.evidenceA, IDS.mappingA),
        document(IDS.evidenceB, IDS.mappingB),
      ],
      openingBalances: [
        proposal({ id: IDS.proposalA, mappingId: IDS.mappingA, evidenceId: IDS.evidenceA, amount: "100.00", currency: "YER" }),
        proposal({ id: IDS.proposalB, mappingId: IDS.mappingB, evidenceId: IDS.evidenceB, amount: "25.00", currency: "USD" }),
      ],
    }), AS_OF);
    expect(result.metrics.map((item) => [item.currency, item.value])).toEqual([["USD", 25], ["YER", 100]]);
  });

  it("withholds the whole currency when any active account lacks an approved opening", () => {
    const result = buildApprovedCashOpeningBalances(workspace({
      openingBalances: [
        proposal({ id: IDS.proposalA, mappingId: IDS.mappingA, evidenceId: IDS.evidenceA, amount: "0.10" }),
      ],
    }), AS_OF);
    expect(result.metrics).toEqual([]);
    expect(result.evidenceRecords).toEqual([]);
    expect(result.warnings.join(" ")).toContain("لم يُستخدم أي مجموع جزئي");
  });

  it("rejects a cash-count document as proof of an approved opening balance", () => {
    const result = buildApprovedCashOpeningBalances(workspace({
      evidence: [
        document(IDS.evidenceA, IDS.mappingA, "cash_count"),
        document(IDS.evidenceB, IDS.mappingB),
      ],
    }), AS_OF);
    expect(result.metrics).toEqual([]);
  });

  it("rejects approval when the reviewed amount differs from the posted ledger balance", () => {
    const result = buildApprovedCashOpeningBalances(workspace({
      openingBalances: [
        proposal({ id: IDS.proposalA, mappingId: IDS.mappingA, evidenceId: IDS.evidenceA, amount: "10.00", posted: "9.99" }),
        proposal({ id: IDS.proposalB, mappingId: IDS.mappingB, evidenceId: IDS.evidenceB, amount: "20.00" }),
      ],
    }), AS_OF);
    expect(result.metrics).toEqual([]);
  });

  it("treats UUID casing as the same actor in the four-eyes review guard", () => {
    const sameActorDifferentCase = workspace({
      accounts: [account(IDS.mappingA, IDS.accountA)],
      evidence: [document(IDS.evidenceA, IDS.mappingA)],
      openingBalances: [
        proposal({
          id: IDS.proposalA,
          mappingId: IDS.mappingA,
          evidenceId: IDS.evidenceA,
          amount: "10.00",
          submittedBy: "abcdefab-cdef-4abc-8def-abcdefabcdef",
          reviewedBy: "ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF",
        }),
      ],
    });

    expect(buildApprovedCashOpeningBalances(sameActorDifferentCase, AS_OF).metrics).toEqual([]);
  });

  it("rejects a review by the submitter and a review timestamp after the as-of snapshot", () => {
    const sameActor = workspace({
      openingBalances: [
        proposal({ id: IDS.proposalA, mappingId: IDS.mappingA, evidenceId: IDS.evidenceA, amount: "10.00", reviewedBy: IDS.submitter }),
        proposal({ id: IDS.proposalB, mappingId: IDS.mappingB, evidenceId: IDS.evidenceB, amount: "20.00" }),
      ],
    });
    const futureReview = workspace({
      openingBalances: [
        proposal({ id: IDS.proposalA, mappingId: IDS.mappingA, evidenceId: IDS.evidenceA, amount: "10.00", reviewedAt: "2026-11-13T09:00:01.000Z" }),
        proposal({ id: IDS.proposalB, mappingId: IDS.mappingB, evidenceId: IDS.evidenceB, amount: "20.00" }),
      ],
    });
    expect(buildApprovedCashOpeningBalances(sameActor, AS_OF).metrics).toEqual([]);
    expect(buildApprovedCashOpeningBalances(futureReview, AS_OF).metrics).toEqual([]);
  });

  it("rejects duplicate active mappings to the same ledger account", () => {
    const result = buildApprovedCashOpeningBalances(workspace({
      accounts: [
        account(IDS.mappingA, IDS.accountA),
        account(IDS.mappingB, IDS.accountA),
      ],
    }), AS_OF);
    expect(result.metrics).toEqual([]);
  });

  it("rejects opening evidence from another as-of timestamp", () => {
    const result = buildApprovedCashOpeningBalances(workspace({ asOf: "2026-11-13T08:59:59.000Z" }), AS_OF);
    expect(result.metrics).toEqual([]);
    expect(result.warnings[0]).toContain("لا يطابق تاريخ التدفق النقدي");
  });
});
