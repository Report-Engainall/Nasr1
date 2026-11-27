import { describe, expect, it } from "vitest";
import { parseExecutiveLiquidityResponse } from "./executive-liquidity-client";

const asOf = "2026-11-27T12:30:00.000Z";
const period = { from: "2026-11-01", to: "2026-11-27" };

function response(overrides: Record<string, unknown> = {}) {
  return {
    status: "OK",
    authorization: {
      tenantScope: "SERVER_RESOLVED_AUTHENTICATED_TENANT",
      effectiveRole: "admin",
    },
    asOf,
    period,
    sideEffects: "NONE",
    cashCounts: [],
    cashAccounts: [],
    cashMovements: [],
    supplierPayables: [],
    receivables: [],
    cashMovementCoverage: {
      status: "VERIFIED",
      completeness: "COMPLETE",
      unclassifiedPostedCashJournalLines: 0,
      unlinkedCashExpenses: 0,
      unlinkedCustomerPayments: 0,
      formulaId: "cash.source-linked-movements",
      formulaVersion: "1.0.0",
      calculatedAt: asOf,
      warnings: [],
    },
    warnings: [],
    ...overrides,
  };
}

function movement(overrides: Record<string, unknown> = {}) {
  return {
    account_id: "bank-account-1",
    account_code: "BANK-1",
    account_name: "Bank",
    display_name: "Primary bank",
    settlement_kind: "bank",
    currency: "YER",
    period_from: period.from,
    period_to: period.to,
    as_of: asOf,
    inflows: "100.00",
    outflows: "10.00",
    net_movement: "90.00",
    movement_count: 2,
    last_movement_at: asOf,
    source_kinds: ["customer_payment", "supplier_payment"],
    evidence_ids: ["payment-1", "supplier-payment-1"],
    status: "NEEDS_REVIEW",
    formula_id: "cash.account-source-movements",
    formula_version: "1.0.0",
    calculated_at: asOf,
    warnings: [],
    ...overrides,
  };
}

function receivable(overrides: Record<string, unknown> = {}) {
  return {
    currency: "YER",
    total_outstanding: "100.00",
    not_due_amount: "30.00",
    overdue_amount: "70.00",
    invoice_count: 2,
    partially_paid_count: 0,
    aging_buckets: [
      { bucket: "NOT_DUE", amount: "30.00", invoice_count: 1, partially_paid_count: 0, evidence_ids: ["invoice-1"] },
      { bucket: "OVERDUE_1_30", amount: "70.00", invoice_count: 1, partially_paid_count: 0, evidence_ids: ["invoice-2"] },
    ],
    as_of: asOf,
    status: "VERIFIED",
    formula_id: "receivables.invoice-balance-and-due-aging",
    formula_version: "1.0.0",
    calculated_at: asOf,
    warnings: [],
    ...overrides,
  };
}

describe("executive liquidity response evidence contract", () => {
  it("accepts exact UTC evidence and fully reconciled minor-unit totals", () => {
    const parsed = parseExecutiveLiquidityResponse(response({
      cashMovements: [movement()],
      receivables: [receivable()],
    }));
    expect(parsed).toMatchObject({
      ok: true,
      data: {
        asOf,
        cashMovements: [{ currency: "YER", inflows: 100, outflows: 10, netMovement: 90 }],
        receivables: [{ currency: "YER", totalOutstanding: 100, notDueAmount: 30, overdueAmount: 70 }],
      },
    });
  });

  it.each([
    ["timezone-less timestamp", "2026-11-27T12:30:00"],
    ["impossible calendar day", "2026-02-30T12:30:00Z"],
    ["offset beyond fourteen hours", "2026-11-27T12:30:00+14:01"],
    ["date-only value", "2026-11-27"],
  ])("rejects %s in the server as-of clock", (_label, invalidAsOf) => {
    expect(parseExecutiveLiquidityResponse(response({ asOf: invalidAsOf }))).toMatchObject({
      ok: false,
      status: "ERROR",
    });
  });

  it("rejects a movement net that differs from inflows less outflows by one cent", () => {
    expect(parseExecutiveLiquidityResponse(response({
      cashMovements: [movement({ net_movement: "89.99" })],
    }))).toMatchObject({ ok: false, status: "ERROR" });
  });

  it("rejects sub-cent source movement values", () => {
    expect(parseExecutiveLiquidityResponse(response({
      cashMovements: [movement({ inflows: "100.001", net_movement: "90.001" })],
    }))).toMatchObject({ ok: false, status: "ERROR" });
  });

  it("requires aging buckets and their headlines to reconcile exactly by currency", () => {
    expect(parseExecutiveLiquidityResponse(response({
      receivables: [receivable({ not_due_amount: "29.99" })],
    }))).toMatchObject({ ok: false, status: "ERROR" });
  });

  it("rejects an aging bucket total that differs from the receivable total by one cent", () => {
    expect(parseExecutiveLiquidityResponse(response({
      receivables: [receivable({
        aging_buckets: [
          { bucket: "NOT_DUE", amount: "29.99", invoice_count: 1, partially_paid_count: 0, evidence_ids: ["invoice-1"] },
          { bucket: "OVERDUE_1_30", amount: "70.00", invoice_count: 1, partially_paid_count: 0, evidence_ids: ["invoice-2"] },
        ],
      })],
    }))).toMatchObject({ ok: false, status: "ERROR" });
  });

  it("rejects supplier payables outside currency minor-unit precision", () => {
    expect(parseExecutiveLiquidityResponse(response({
      supplierPayables: [{
        supplier_id: "supplier-1",
        supplier_name: "Supplier",
        currency: "YER",
        receipt_count: 1,
        posted_payable: "20.001",
        reserved_payment_amount: "0.00",
        last_receipt_date: "2026-11-20",
        as_of: asOf,
        status: "VERIFIED",
        formula_id: "supplier.posted-receipts-minus-posted-settlements",
        formula_version: "1.0.0",
        calculated_at: asOf,
        evidence_ids: ["receipt-1"],
        due_date_status: "UNAVAILABLE",
        warnings: [],
      }],
    }))).toMatchObject({ ok: false, status: "ERROR" });
  });
});
