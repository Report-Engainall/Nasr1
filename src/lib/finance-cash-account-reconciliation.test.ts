import { describe, expect, it, vi } from "vitest";
import { parseCashReconciliationWorkspace } from "./finance-cash-account-reconciliation";

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: vi.fn() } }));

const accountId = "11111111-1111-4111-8111-111111111111";
const mappedAccountId = "22222222-2222-4222-8222-222222222222";
const evidenceId = "33333333-3333-4333-8333-333333333333";
const proposalId = "44444444-4444-4444-8444-444444444444";
const statementId = "55555555-5555-4555-8555-555555555555";
const actorId = "66666666-6666-4666-8666-666666666666";
const asOf = "2026-11-06T18:00:00.000Z";

function workspace(overrides: Record<string, unknown> = {}) {
  return {
    status: "OK",
    effectiveRole: "accountant",
    sideEffects: "NONE",
    authorization: {
      tenantScope: "SERVER_RESOLVED_AUTHENTICATED_TENANT",
      effectiveRole: "accountant",
    },
    accounts: [{
      id: accountId,
      account_id: mappedAccountId,
      account_code: "101.01",
      account_name: "البنك الرئيسي",
      display_name: "الحساب البنكي الرئيسي",
      settlement_kind: "bank",
      currency: "YER",
      is_active: true,
    }],
    evidence: [{
      id: evidenceId,
      mapping_id: accountId,
      evidence_kind: "bank_statement",
      file_name: "statement.pdf",
      mime_type: "application/pdf",
      byte_size: 1024,
      content_sha256: "a".repeat(64),
      storage_path: accountId + "/77777777-7777-4777-8777-777777777777.pdf",
      created_at: asOf,
      uploaded_by: actorId,
    }],
    openingBalances: [],
    statements: [],
    ...overrides,
  };
}

describe("cash opening and bank reconciliation workspace parser", () => {
  it("accepts a same-currency bank account and its private statement evidence", () => {
    const parsed = parseCashReconciliationWorkspace(workspace());
    expect(parsed.role).toBe("accountant");
    expect(parsed.accounts).toHaveLength(1);
    expect(parsed.evidence[0].mappingId).toBe(accountId);
    expect(parsed.evidence[0].evidenceKind).toBe("bank_statement");
  });

  it("rejects a source response that claims a write side effect", () => {
    expect(() => parseCashReconciliationWorkspace(workspace({ sideEffects: "JOURNAL_POSTED" })))
      .toThrow("لم يثبت الخادم صلاحية الحساب ونطاق المؤسسة");
  });

  it("rejects cash-count evidence attached to a bank account", () => {
    const source = workspace();
    const evidence = (source.evidence as Array<Record<string, unknown>>)[0];
    evidence.evidence_kind = "cash_count";
    expect(() => parseCashReconciliationWorkspace(source))
      .toThrow("نوع حساب المؤسسة أو عملته");
  });

  it("rejects an opening proposal whose currency differs from the mapped account", () => {
    const source = workspace({
      openingBalances: [{
        id: proposalId,
        mapping_id: accountId,
        evidence_id: evidenceId,
        as_of_date: "2026-11-05",
        opening_balance: "1000.00",
        currency: "USD",
        submitted_by: actorId,
        submitted_at: asOf,
        review_decision: null,
        review_reason: null,
        reviewed_by: null,
        reviewed_at: null,
        posted_gl_balance: null,
        posted_gl_line_count: null,
      }],
    });
    expect(() => parseCashReconciliationWorkspace(source))
      .toThrow("نوع حساب المؤسسة أو عملته");
  });

  it("rejects a statement whose currency does not match its bank account", () => {
    const source = workspace({
      statements: [{
        id: statementId,
        mapping_id: accountId,
        evidence_id: evidenceId,
        statement_reference: "BANK-2026-11",
        period_from: "2026-11-01",
        period_to: "2026-11-05",
        opening_balance: "1000.00",
        closing_balance: "1250.00",
        currency: "USD",
        created_by: actorId,
        created_at: asOf,
        lines: [],
        line_count: 0,
        matched_count: 0,
        latest_run: null,
      }],
    });
    expect(() => parseCashReconciliationWorkspace(source))
      .toThrow("نوع حساب المؤسسة أو عملته");
  });

  it("rejects duplicate statement line numbers and rows dated outside the statement period", () => {
    const source = workspace({
      statements: [{
        id: statementId,
        mapping_id: accountId,
        evidence_id: evidenceId,
        statement_reference: "BANK-2026-11",
        period_from: "2026-11-01",
        period_to: "2026-11-05",
        opening_balance: "1000.00",
        closing_balance: "1250.00",
        currency: "YER",
        created_by: actorId,
        created_at: asOf,
        lines: [{
          id: "88888888-8888-4888-8888-888888888888",
          line_number: 1,
          transaction_date: "2026-11-06",
          external_reference: "TX-1",
          description: "تحويل وارد",
          signed_amount: "250.00",
          match_id: null,
          journal_entry_id: null,
          journal_line_number: null,
        }],
        line_count: 1,
        matched_count: 0,
        latest_run: null,
      }],
    });
    expect(() => parseCashReconciliationWorkspace(source)).toThrow("تغطية حركات كشف البنك");
  });
});
