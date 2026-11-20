import { describe, expect, it } from "vitest";
import type { EvidenceRecord } from "./types";
import { parseClaimEvidenceDrilldownResponse, supportsClaimEvidenceDrilldown } from "./claim-evidence-drilldown-client";

const record = (name: string): EvidenceRecord => ({
  id: "source:11111111-1111-4111-8111-111111111111",
  source: { kind: "TABLE", name, recordId: "11111111-1111-4111-8111-111111111111", version: "v1" },
  sourceTimestamp: "2026-11-17T00:00:00.000Z",
  asOf: "2026-11-17T00:10:00.000Z",
  period: { from: "2026-11-01", to: "2026-11-30" },
  currency: "YER",
  status: "VERIFIED",
  completeness: "COMPLETE",
  quality: "ACCEPTABLE",
  warnings: [],
});

const auth = {
  tenantScope: "SERVER_RESOLVED_AUTHENTICATED_TENANT",
  effectiveRole: "manager",
};

describe("claim evidence drill-down source contract", () => {
  it("supports only explicit financial and operational sources", () => {
    expect(supportsClaimEvidenceDrilldown("customer_invoices")).toBe(true);
    expect(supportsClaimEvidenceDrilldown("inventory.current_balances")).toBe(true);
    expect(supportsClaimEvidenceDrilldown("purchase_supplier_invoices")).toBe(true);
    expect(supportsClaimEvidenceDrilldown("public.profiles")).toBe(false);
    expect(supportsClaimEvidenceDrilldown("general_ledger")).toBe(false);
  });

  it("validates the supplier invoice field projection without cost-line leakage", () => {
    const source = record("purchase_supplier_invoices");
    const parsed = parseClaimEvidenceDrilldownResponse({
      status: "OK",
      sourceName: source.source.name,
      asOf: source.asOf,
      period: source.period,
      rows: [{
        supplierInvoiceNumber: "SUP-INV-001",
        invoiceDate: "2026-11-10",
        currency: "YER",
        invoiceTotalAmount: "1000.00",
        matchStatus: "matched",
        createdAt: "2026-11-10T12:00:00.000Z",
      }],
      hasMore: false,
      nextOffset: null,
      authorization: auth,
      sideEffects: "NONE",
    }, source, 0);
    expect(parsed?.status).toBe("READY");
    expect(parsed?.rows[0]).not.toHaveProperty("unitCost");
    expect(parsed?.rows[0]).not.toHaveProperty("supplierId");
  });

  it("rejects an invoice response that adds unapproved private or costing fields", () => {
    const source = record("purchase_supplier_invoices");
    const invalid = parseClaimEvidenceDrilldownResponse({
      status: "OK",
      sourceName: source.source.name,
      asOf: source.asOf,
      period: source.period,
      rows: [{
        supplierInvoiceNumber: "SUP-INV-001",
        invoiceDate: "2026-11-10",
        currency: "YER",
        invoiceTotalAmount: "1000.00",
        matchStatus: "matched",
        createdAt: "2026-11-10T12:00:00.000Z",
        unitCost: "20.00",
      }],
      hasMore: false,
      nextOffset: null,
      authorization: auth,
      sideEffects: "NONE",
    }, source, 0);
    expect(invalid).toBeNull();
  });
  it("matches the same PostgreSQL timestamp instant when UTC serialization differs", () => {
    const source = record("purchase_supplier_invoices");
    const parsed = parseClaimEvidenceDrilldownResponse({
      status: "OK",
      sourceName: source.source.name,
      asOf: "2026-11-17T00:10:00+00:00",
      period: source.period,
      rows: [{
        supplierInvoiceNumber: "SUP-INV-002",
        invoiceDate: "2026-11-10",
        currency: "YER",
        invoiceTotalAmount: "2000.00",
        matchStatus: "matched",
        createdAt: "2026-11-10T12:00:00.000Z",
      }],
      hasMore: false,
      nextOffset: null,
      authorization: auth,
      sideEffects: "NONE",
    }, source, 0);
    expect(parsed?.status).toBe("READY");
  });

});
