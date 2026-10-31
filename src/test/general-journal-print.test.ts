import { describe, expect, it } from "vitest";
import { buildFinancialStatements } from "@/lib/financial-statements";
import {
  projectFinancialStatementsPrintDocument,
  projectGeneralJournalPrintDocument,
} from "@/lib/general-journal-print";

const journalEntry = {
  id: "internal-journal-uuid-001",
  tenant_id: "internal-tenant-uuid-001",
  entry_number: "JV-2026-0042",
  entry_date: "2026-10-30",
  description: "تسوية مصروفات التشغيل",
  source_type: "manual",
  source_reference: "private-source-row-uuid",
  status: "posted" as const,
  created_by: "internal-user-uuid",
  created_at: "2026-10-30T10:00:00.000Z",
  posted_at: "2026-10-30T10:01:00.000Z",
  debit_total: "125.50",
  credit_total: "125.50",
  lines: [
    {
      line_number: 1,
      account_id: "internal-expense-account-uuid",
      account_code: "5000",
      account_name: "مصروفات تشغيل",
      debit: "125.50",
      credit: "0.00",
      memo: "فاتورة تشغيل معتمدة",
    },
    {
      line_number: 2,
      account_id: "internal-cash-account-uuid",
      account_code: "1000",
      account_name: "النقدية",
      debit: "0.00",
      credit: "125.50",
      memo: null,
    },
  ],
  isReversal: false,
  hasReversal: false,
};

function financialStatements() {
  return buildFinancialStatements(
    [
      { id: "income-id", code: "4000", name: "الإيرادات", account_type: "revenue", debit_total: "0.00", credit_total: "500.00" },
      { id: "expense-id", code: "5000", name: "المصروفات", account_type: "expense", debit_total: "100.00", credit_total: "0.00" },
    ],
    [
      { id: "asset-id", code: "1000", name: "النقدية", account_type: "asset", debit_total: "1000.00", credit_total: "100.00" },
      { id: "liability-id", code: "2000", name: "الالتزامات", account_type: "liability", debit_total: "0.00", credit_total: "0.00" },
      { id: "equity-id", code: "3000", name: "رأس المال", account_type: "equity", debit_total: "0.00", credit_total: "500.00" },
      { id: "cumulative-revenue-id", code: "4000", name: "الإيرادات", account_type: "revenue", debit_total: "0.00", credit_total: "500.00" },
      { id: "cumulative-expense-id", code: "5000", name: "المصروفات", account_type: "expense", debit_total: "100.00", credit_total: "0.00" },
    ],
    "2026-10-01",
    "2026-10-31",
    2,
  );
}

describe("general journal and financial statement print projections", () => {
  it("projects a balanced journal voucher without internal or source identifiers", () => {
    const projected = projectGeneralJournalPrintDocument(journalEntry);
    expect(projected).not.toBeNull();
    expect(projected).toMatchObject({
      kind: "journal",
      entryNumber: "JV-2026-0042",
      statusLabel: "مرحّل ومعتمد",
      sourceLabel: "قيد يدوي",
      debitTotal: "125.50",
      creditTotal: "125.50",
      lines: [{ lineNumber: 1, accountCode: "5000", debit: "125.50", credit: "0.00" }],
    });
    const serialized = JSON.stringify(projected);
    for (const secret of [
      "internal-journal-uuid-001",
      "internal-tenant-uuid-001",
      "private-source-row-uuid",
      "internal-user-uuid",
      "internal-expense-account-uuid",
      "internal-cash-account-uuid",
      "tenant_id",
      "account_id",
      "created_by",
      "source_reference",
    ]) expect(serialized).not.toContain(secret);
  });

  it("rejects unbalanced headers, unbalanced lines, duplicate line order and oversized entries", () => {
    expect(projectGeneralJournalPrintDocument({ ...journalEntry, credit_total: "125.49" })).toBeNull();
    expect(projectGeneralJournalPrintDocument({
      ...journalEntry,
      lines: [{ ...journalEntry.lines[0], debit: "125.49" }, journalEntry.lines[1]],
    })).toBeNull();
    expect(projectGeneralJournalPrintDocument({
      ...journalEntry,
      lines: [journalEntry.lines[0], { ...journalEntry.lines[1], line_number: 1 }],
    })).toBeNull();
    expect(projectGeneralJournalPrintDocument({
      ...journalEntry,
      lines: Array.from({ length: 101 }, (_, index) => ({ ...journalEntry.lines[index % 2], line_number: index + 1 })),
    })).toBeNull();
  });

  it("projects full income and balance-sheet account lines without account UUIDs", () => {
    const report = financialStatements();
    const projected = projectFinancialStatementsPrintDocument(report);
    expect(projected).not.toBeNull();
    expect(projected).toMatchObject({
      kind: "statements",
      periodFrom: "2026-10-01",
      periodTo: "2026-10-31",
      postedEntryCount: 2,
      revenueCents: 50000n,
      expenseCents: 10000n,
      netIncomeCents: 40000n,
      assetsCents: 90000n,
      liabilitiesEquityAndEarningsCents: 90000n,
      balanceDifferenceCents: 0n,
    });
    const serialized = JSON.stringify(projected, (_key, value) => typeof value === "bigint" ? value.toString() : value);
    for (const secret of ["income-id", "expense-id", "asset-id", "equity-id", "cumulative-revenue-id"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("refuses a statement when account detail no longer reconciles to summary totals", () => {
    const report = financialStatements();
    expect(projectFinancialStatementsPrintDocument({ ...report, revenueCents: 50100n })).toBeNull();
    expect(projectFinancialStatementsPrintDocument({ ...report, balanceDifferenceCents: 100n })).toBeNull();
    expect(projectFinancialStatementsPrintDocument({ ...report, periodFrom: "2026-13-40" })).toBeNull();
  });
});
