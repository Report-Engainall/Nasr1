import { describe, expect, it } from "vitest";
import { parseExecutiveLiquidityResponse } from "./executive-liquidity-client";

const asOf = "2026-11-06T06:00:00Z";
const period = { from: "2026-08-08", to: "2026-11-06" };

function response(overrides: Record<string, unknown> = {}) {
  return {
    status: "PARTIAL",
    authorization: {
      tenantScope: "SERVER_RESOLVED_AUTHENTICATED_TENANT",
      effectiveRole: "manager",
    },
    asOf,
    period,
    sideEffects: "NONE",
    cashCounts: [{
      id: "count-1", shift_id: "shift-1", shift_label: "صباحية",
      business_date: "2026-11-06", organization_time_zone: "Asia/Aden",
      phase: "CLOSING", currency: "YER", counted_amount: "25000.00",
      version: 2, source_timestamp: asOf, status: "VERIFIED",
      source_name: "operational_shift_cash_counts", evidence_id: "cash-count:count-1",
    }],
    cashAccounts: [{
      account_id: "account-1", account_code: "101", account_name: "حساب الصندوق",
      display_name: "الصندوق الرئيسي", settlement_kind: "cash", currency: "YER",
      balance: null, balance_status: "UNAVAILABLE",
      source_name: "purchase_supplier_payment_settlement_accounts",
    }],
    cashMovements: [{
      account_id: "account-1", account_code: "101", account_name: "حساب الصندوق",
      display_name: "الصندوق الرئيسي", settlement_kind: "cash", currency: "YER",
      period_from: period.from, period_to: period.to, as_of: asOf,
      inflows: "100", outflows: "40", net_movement: "60",
      movement_count: 2, last_movement_at: asOf,
      source_kinds: ["customer_payment", "cash_expense"],
      evidence_ids: ["customer-payment:1", "cash-expense:1"],
      status: "NEEDS_REVIEW", formula_id: "cash.account-source-movements",
      formula_version: "1.0.0", calculated_at: asOf,
      warnings: ["الحركة ليست رصيد الحساب."],
    }],
    supplierPayables: [{
      supplier_id: "supplier-1", supplier_name: "المورد الأول", currency: "YER",
      receipt_count: 2, posted_payable: "75", reserved_payment_amount: "10",
      last_receipt_date: "2026-11-05", as_of: asOf, status: "VERIFIED",
      formula_id: "supplier.posted-receipts-minus-posted-settlements",
      formula_version: "1.0.0", calculated_at: asOf,
      evidence_ids: ["supplier-receipt-journal:1"], due_date_status: "UNAVAILABLE",
      warnings: ["تاريخ الاستحقاق غير متاح."],
    }],
    receivables: [{
      currency: "YER", total_outstanding: "100", not_due_amount: "60",
      overdue_amount: "40", invoice_count: 2, partially_paid_count: 1,
      aging_buckets: [
        { bucket: "NOT_DUE", amount: "60", invoice_count: 1, partially_paid_count: 1, evidence_ids: ["customer-invoice:1", "customer-payment:1"] },
        { bucket: "OVERDUE_1_30", amount: "40", invoice_count: 1, partially_paid_count: 0, evidence_ids: ["customer-invoice:2"] },
      ],
      as_of: asOf, status: "VERIFIED",
      formula_id: "receivables.invoice-balance-and-due-aging",
      formula_version: "1.0.0", calculated_at: asOf, warnings: [],
    }],
    cashMovementCoverage: {
      status: "NEEDS_REVIEW", completeness: "PARTIAL",
      unclassifiedPostedCashJournalLines: 1, unlinkedCashExpenses: 0,
      unlinkedCustomerPayments: 0, formulaId: "cash.source-linked-movements",
      formulaVersion: "1.0.0", calculatedAt: asOf,
      warnings: ["توجد قيود نقدية غير مصنفة."],
    },
    warnings: ["الرصيد البنكي غير متاح دون رصيد افتتاحي موثق."],
    ...overrides,
  };
}

describe("executive liquidity workspace response", () => {
  it("preserves currency isolation and does not synthesize an account balance", () => {
    const result = parseExecutiveLiquidityResponse(response());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.cashAccounts[0].balance).toBeNull();
    expect(result.data.cashAccounts[0].balanceStatus).toBe("UNAVAILABLE");
    expect(result.data.cashMovements[0]).toMatchObject({
      currency: "YER", inflows: 100, outflows: 40, netMovement: 60,
      status: "NEEDS_REVIEW",
    });
    expect(result.data.supplierPayables[0]).toMatchObject({
      currency: "YER", postedPayable: 75, reservedPaymentAmount: 10,
      dueDateStatus: "UNAVAILABLE",
    });
    expect(result.data.receivables[0]).toMatchObject({
      currency: "YER", totalOutstanding: 100, notDueAmount: 60,
      overdueAmount: 40, partiallyPaidCount: 1,
    });
  });

  it("withholds a supplier amount when source reconciliation is not verified", () => {
    const source = response().supplierPayables[0] as unknown as Record<string, unknown>;
    const value = response({
      supplierPayables: [{
        ...source,
        posted_payable: null, status: "NEEDS_REVIEW",
      }],
    });
    const result = parseExecutiveLiquidityResponse(value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.supplierPayables[0].postedPayable).toBeNull();
    expect(result.data.supplierPayables[0].status).toBe("NEEDS_REVIEW");
  });

  it("keeps source-linked movements visible but marks unmapped settlement accounts as unclassified", () => {
    const source = (response().cashMovements as Array<Record<string, unknown>>)[0];
    const value = response({
      cashMovements: [{ ...source, settlement_kind: "unclassified" }],
    });
    const result = parseExecutiveLiquidityResponse(value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.cashMovements[0].settlementKind).toBe("unclassified");
  });

  it("rejects an unbalanced currency movement instead of rendering a false net", () => {
    const value = response({
      cashMovements: [{
        ...((response().cashMovements as unknown[])[0] as Record<string, unknown>),
        net_movement: "61",
      }],
    });
    expect(parseExecutiveLiquidityResponse(value)).toMatchObject({
      ok: false, status: "ERROR",
    });
  });

  it("rejects cross-tenant or mutation-capable responses", () => {
    expect(parseExecutiveLiquidityResponse(response({ sideEffects: "WRITES" }))).toMatchObject({
      ok: false, status: "ERROR",
    });
    expect(parseExecutiveLiquidityResponse(response({
      authorization: { tenantScope: "CLIENT_SELECTED_TENANT", effectiveRole: "manager" },
    }))).toMatchObject({ ok: false, status: "ERROR" });
  });

  it("rejects invalid currency rather than combining it with another currency", () => {
    const value = response({
      receivables: [{
        ...((response().receivables as unknown[])[0] as Record<string, unknown>),
        currency: "YER+USD",
      }],
    });
    expect(parseExecutiveLiquidityResponse(value)).toMatchObject({
      ok: false, status: "ERROR",
    });
  });
});
