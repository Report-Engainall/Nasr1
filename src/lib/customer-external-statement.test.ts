import { describe, expect, it } from "vitest";
import {
  customerExternalStatementEntryTypeLabel,
  formatCustomerExternalStatementAmount,
  isSameCustomerExternalStatementSourceAsOf,
  parseCustomerExternalStatement,
} from "./customer-external-statement";
import { buildCustomerExternalStatementWorkbookXlsx } from "./customer-account-statement-xlsx";

const sourceAsOf = new Date(Date.now() - 10 * 60_000).toISOString();
const currencyAsOf = new Date(Date.now() - 5 * 60_000).toISOString();
const base = {
  source_mode: "ONYX",
  source_as_of: sourceAsOf,
  details_limit_per_currency: 500,
  currencies: [{
    currency_code: "YER",
    source_as_of: currencyAsOf,
    entry_count: 2,
    total_debit: "1500.0000",
    total_credit: "500.0000",
    closing_balance: "1000.0000",
    details_partial: false,
    entries: [
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
    ],
  }],
};

describe("customer external ERP statement contract", () => {
  it("parses a provider statement and retains currency-separated running balances", () => {
    const result = parseCustomerExternalStatement(base, "ONYX", sourceAsOf);
    expect(result.currencies[0].currency_code).toBe("YER");
    expect(result.currencies[0].closing_balance).toBe("1000.0000");
    expect(result.currencies[0].entries).toHaveLength(2);
    expect(result.currencies[0].entries[0].running_balance).toBe("1000.0000");
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

  it("builds an external XLSX with independent currency sheets and no cross-currency conversion", () => {
    const parsed = parseCustomerExternalStatement(base, "ONYX", sourceAsOf);
    const bytes = buildCustomerExternalStatementWorkbookXlsx({
      statement: parsed,
      generatedAt: new Date().toISOString(),
    });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(1200);
    const archiveText = new TextDecoder().decode(bytes);
    expect(archiveText).toContain("كشف الحساب الخارجي");
    expect(archiveText).toContain("حركات YER");
    expect(archiveText).toContain("الأرصدة حسب العملة");
    expect(archiveText).toContain("لا تجمع العملات");
    expect(archiveText).not.toContain("external_customer_id");
    expect(archiveText).not.toContain("scope_key");
  });

  it("rejects a one-microsecond source watermark mismatch that Date.parse would collapse", () => {
    const root = structuredClone(base);
    root.source_as_of = sourceAsOf.replace(/Z$/, "001Z");
    const expected = root.source_as_of.replace(/001Z$/, "002Z");
    expect(Date.parse(root.source_as_of)).toBe(Date.parse(expected));
    expect(() => parseCustomerExternalStatement(root, "ONYX", expected)).toThrow(/توقيت مصدر ERP/);
  });

  it("accepts equivalent source instants expressed with different valid offsets", () => {
    const expected = new Date(Date.parse(sourceAsOf) + 3 * 60 * 60 * 1000)
      .toISOString().replace(/Z$/, "+03:00");
    expect(() => parseCustomerExternalStatement(base, "ONYX", expected)).not.toThrow();
  });

  it("compares external statement source watermarks at exact microsecond precision", () => {
    const actual = sourceAsOf.replace(/Z$/, "001Z");
    expect(isSameCustomerExternalStatementSourceAsOf(actual, actual.replace(/Z$/, "+00:00"))).toBe(true);
    expect(isSameCustomerExternalStatementSourceAsOf(actual, actual.replace(/001Z$/, "002Z"))).toBe(false);
    expect(isSameCustomerExternalStatementSourceAsOf("invalid", actual)).toBe(false);
  });

  it("rejects sub-microsecond timestamps and offsets beyond ISO 8601 bounds", () => {
    const tooPrecise = structuredClone(base);
    tooPrecise.source_as_of = sourceAsOf.replace(/Z$/, "1234567Z");
    expect(() => parseCustomerExternalStatement(tooPrecise, "ONYX", tooPrecise.source_as_of)).toThrow(/غير معياري/);
    const invalidOffset = structuredClone(base);
    invalidOffset.source_as_of = sourceAsOf.replace(/Z$/, "+14:01");
    expect(() => parseCustomerExternalStatement(invalidOffset, "ONYX", invalidOffset.source_as_of)).toThrow(/خارج النطاق/);
  });

  it("rejects a running-balance transition inconsistent with exact debit/credit movement", () => {
    const broken = structuredClone(base);
    broken.currencies[0].entries[0].running_balance = "1001.0000";
    expect(() => parseCustomerExternalStatement(broken, "ONYX", sourceAsOf)).toThrow(/الرصيد الجاري لا يطابق حركة/);
  });

  it("rejects complete totals that do not reconcile to entries and closing balance", () => {
    const brokenTotal = structuredClone(base);
    brokenTotal.currencies[0].total_credit = "499.0000";
    expect(() => parseCustomerExternalStatement(brokenTotal, "ONYX", sourceAsOf)).toThrow(/إجماليات كشف ERP/);
    const brokenClosing = structuredClone(base);
    brokenClosing.currencies[0].closing_balance = "999.0000";
    expect(() => parseCustomerExternalStatement(brokenClosing, "ONYX", sourceAsOf)).toThrow(/الرصيد الجاري لأحدث حركة/);
  });

  it("validates visible running-balance continuity without equating a capped page to full totals", () => {
    const partial = structuredClone(base);
    partial.currencies[0].entry_count = 501;
    partial.currencies[0].details_partial = true;
    partial.currencies[0].entries = [
      ...base.currencies[0].entries,
      ...Array.from({ length: 498 }, (_, index) => ({
        ...base.currencies[0].entries[1],
        entry_reference: "OLD-" + String(index + 1).padStart(4, "0"),
        entry_date: "2026-11-26",
        debit_amount: "0",
        credit_amount: "0",
        running_balance: "1500.0000",
      })),
    ];
    partial.currencies[0].total_debit = "9000.0000";
    partial.currencies[0].total_credit = "8000.0000";
    const result = parseCustomerExternalStatement(partial, "ONYX", sourceAsOf);
    expect(result.currencies[0].details_partial).toBe(true);
    expect(result.currencies[0].entry_count).toBe(501);
    expect(result.currencies[0].total_debit).toBe("9000.0000");
    const brokenPartialTotals = structuredClone(partial);
    brokenPartialTotals.currencies[0].total_credit = "7999.0000";
    expect(() => parseCustomerExternalStatement(brokenPartialTotals, "ONYX", sourceAsOf))
      .toThrow(/إجمالي المدين والدائن لا يطابق الرصيد الختامي/);
  });

  it("maps external statement entry types into customer-safe Arabic labels", () => {
    expect(customerExternalStatementEntryTypeLabel("opening_balance")).toBe("رصيد افتتاحي");
    expect(customerExternalStatementEntryTypeLabel("credit_note")).toBe("إشعار دائن");
  });
});
