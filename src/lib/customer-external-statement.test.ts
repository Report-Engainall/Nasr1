import { describe, expect, it } from "vitest";
import {
  customerExternalStatementEntryTypeLabel,
  formatCustomerExternalStatementAmount,
  parseCustomerExternalStatement,
} from "./customer-external-statement";

const sourceAsOf = "2026-11-28T00:00:00Z";
const base = {
  source_mode: "ONYX",
  source_as_of: sourceAsOf,
  details_limit_per_currency: 500,
  currencies: [{
    currency_code: "YER",
    source_as_of: "2026-11-28T00:05:00Z",
    entry_count: 2,
    total_debit: "1500.0000",
    total_credit: "500.0000",
    closing_balance: "1000.0000",
    details_partial: false,
    entries: [
      {
        entry_reference: "JV-001",
        entry_date: "2026-11-27",
        due_date: null,
        entry_type: "invoice",
        debit_amount: "1500.0000",
        credit_amount: "0",
        running_balance: "1500.0000",
        source_document_number: "INV-001",
        description: "فاتورة مبيعات",
      },
      {
        entry_reference: "RC-001",
        entry_date: "2026-11-28",
        due_date: null,
        entry_type: "payment",
        debit_amount: "0",
        credit_amount: "500.0000",
        running_balance: "1000.0000",
        source_document_number: "RC-001",
        description: "سداد جزئي",
      },
    ],
  }],
};

describe("customer external ERP statement contract", () => {
  it("parses a provider statement and retains currency-separated running balances", () => {
    const result = parseCustomerExternalStatement(base, "ONYX", sourceAsOf);
    expect(result.currencies[0].currency_code).toBe("YER");
    expect(result.currencies[0].closing_balance).toBe("1000.0000");
    expect(result.currencies[0].entries).toHaveLength(2);
    expect(result.currencies[0].entries[1].running_balance).toBe("1000.0000");
    expect(result.currencies[0].entries[0]).not.toHaveProperty("external_customer_id");
    expect(result.currencies[0].entries[0]).not.toHaveProperty("scope_key");
  });

  it("formats signed four-decimal balances without binary floating-point math", () => {
    expect(formatCustomerExternalStatementAmount("-1234567.1250", "USD")).toContain("USD");
    expect(formatCustomerExternalStatementAmount("-1234567.1250", "USD")).toContain("−");
    expect(formatCustomerExternalStatementAmount("10.25", "YER")).toContain("10.25");
  });

  it("rejects wrong source binding and stale source timestamp", () => {
    expect(() => parseCustomerExternalStatement(base, "MUTAKAMEL", sourceAsOf)).toThrow();
    expect(() => parseCustomerExternalStatement(base, "ONYX", "2026-11-27T23:00:00Z")).toThrow();
    const stale = structuredClone(base);
    stale.currencies[0].source_as_of = "2026-11-26T00:00:00Z";
    expect(() => parseCustomerExternalStatement(stale, "ONYX", sourceAsOf)).toThrow();
  });

  it("rejects mixed debit and credit, invalid calendar dates, and noncanonical amounts", () => {
    const mixed = structuredClone(base);
    mixed.currencies[0].entries[0].credit_amount = "1.00";
    expect(() => parseCustomerExternalStatement(mixed, "ONYX", sourceAsOf)).toThrow(/مدينًا ودائنًا/);
    const badDate = structuredClone(base);
    badDate.currencies[0].entries[0].entry_date = "2026-02-31";
    expect(() => parseCustomerExternalStatement(badDate, "ONYX", sourceAsOf)).toThrow();
    const badMoney = structuredClone(base);
    badMoney.currencies[0].total_debit = "1e6";
    expect(() => parseCustomerExternalStatement(badMoney, "ONYX", sourceAsOf)).toThrow();
  });

  it("requires unique currencies and consistent 500-row partiality flags", () => {
    const duplicate = structuredClone(base);
    duplicate.currencies.push(structuredClone(duplicate.currencies[0]));
    expect(() => parseCustomerExternalStatement(duplicate, "ONYX", sourceAsOf)).toThrow();
    const partial = structuredClone(base);
    partial.currencies[0].entry_count = 501;
    partial.currencies[0].details_partial = true;
    expect(() => parseCustomerExternalStatement(partial, "ONYX", sourceAsOf)).toThrow();
  });

  it("maps external statement entry types into customer-safe Arabic labels", () => {
    expect(customerExternalStatementEntryTypeLabel("opening_balance")).toBe("رصيد افتتاحي");
    expect(customerExternalStatementEntryTypeLabel("credit_note")).toBe("إشعار دائن");
  });
});
