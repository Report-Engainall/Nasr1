import { describe, expect, it } from "vitest";
import { buildTrialBalanceWorkbookXlsx } from "@/lib/trial-balance-xlsx";
import type { TrialBalanceAccount, TrialBalancePeriod, TrialBalanceSummary } from "@/lib/trial-balance-xlsx";

const period: TrialBalancePeriod = { from: "2026-01-01", to: "2026-12-31" };
const summary: TrialBalanceSummary = {
  posted_entry_count: 8,
  debit_total: "1,100.00",
  credit_total: "1,100.00",
};
const accounts: TrialBalanceAccount[] = [
  { code: "1000", name: "الصندوق", account_type: "asset", is_active: true, debit_total: "900.00", credit_total: "0.00" },
  { code: "2000", name: "رأس المال", account_type: "equity", is_active: true, debit_total: "0.00", credit_total: "500.00" },
  { code: "4000", name: "الإيرادات", account_type: "revenue", is_active: true, debit_total: "0.00", credit_total: "600.00" },
  { code: "5000", name: "مصروفات تشغيل", account_type: "expense", is_active: false, debit_total: "200.00", credit_total: "0.00" },
];

function unzipStore(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const files = new Map<string, string>();
  let offset = 0;
  while (offset + 30 < bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    if (view.getUint16(offset + 8, true) !== 0) throw new Error("Expected stored ZIP entry.");
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    files.set(decoder.decode(bytes.slice(nameStart, nameStart + nameLength)), decoder.decode(bytes.slice(dataStart, dataStart + size)));
    offset = dataStart + size;
  }
  return files;
}

describe("general ledger trial balance XLSX export", () => {
  it("exports every account with exact totals independent of the journal-entry page", () => {
    const files = unzipStore(buildTrialBalanceWorkbookXlsx(accounts, summary, period, "2026-11-02T19:00:00.000Z"));
    const workbook = files.get("xl/workbook.xml") ?? "";
    const overview = files.get("xl/worksheets/sheet1.xml") ?? "";
    const details = files.get("xl/worksheets/sheet2.xml") ?? "";
    const method = files.get("xl/worksheets/sheet3.xml") ?? "";

    expect(workbook).toContain('sheet name="ميزان المراجعة"');
    expect(overview).toContain("2026-01-01");
    expect(overview).toContain("<v>8</v>");
    expect(overview).toContain("<v>110000</v>");
    expect(overview).toContain("متوازن");
    expect(details).toContain("1000");
    expect(details).toContain("5000");
    expect(details).toContain("غير نشط");
    expect(details).toContain("<v>90000</v>");
    expect(details).toContain("<v>-50000</v>");
    expect(method).toContain("لا يعتمد على ترقيم صفحة القيود");
    expect(files.size).toBe(9);
  });

  it("escapes formula-looking account names and omits account and tenant identifiers", () => {
    const unsafeAccounts = [{
      ...accounts[0],
      name: '=HYPERLINK("https://invalid.test","open")',
      id: "PRIVATE-ACCOUNT-ID-SENTINEL",
      organization_id: "PRIVATE-TENANT-ID-SENTINEL",
      internal_cost: "PRIVATE-COST-SENTINEL",
    }] as TrialBalanceAccount[];
    const oneAccountSummary = { posted_entry_count: 1, debit_total: "900.00", credit_total: "0.00" };
    const files = unzipStore(buildTrialBalanceWorkbookXlsx(unsafeAccounts, oneAccountSummary, period));
    const combined = [...files.entries()].filter(([path]) => path.endsWith(".xml")).map(([, body]) => body).join("\n");
    expect(combined).toContain("&quot;https://invalid.test&quot;");
    expect(combined).not.toMatch(/<f(?:\s|>)/);
    for (const secret of ["PRIVATE-ACCOUNT-ID-SENTINEL", "PRIVATE-TENANT-ID-SENTINEL", "PRIVATE-COST-SENTINEL"]) {
      expect(combined).not.toContain(secret);
    }
  });

  it("rejects a mismatch between complete account details and the posted-ledger summary", () => {
    expect(() => buildTrialBalanceWorkbookXlsx(accounts, {
      ...summary,
      debit_total: "1,099.99",
    }, period)).toThrow(/مجموع تفاصيل الحسابات/);
  });

  it("preserves a real imbalance and rejects unsafe Excel cent precision", () => {
    const imbalancedAccounts: TrialBalanceAccount[] = [
      { code: "1000", name: "الصندوق", account_type: "asset", is_active: true, debit_total: "900.00", credit_total: "0.00" },
      { code: "2000", name: "رأس المال", account_type: "equity", is_active: true, debit_total: "0.00", credit_total: "800.00" },
    ];
    const imbalanced = unzipStore(buildTrialBalanceWorkbookXlsx(
      imbalancedAccounts,
      { posted_entry_count: 2, debit_total: "900.00", credit_total: "800.00" },
      period,
    ));
    const summarySheet = imbalanced.get("xl/worksheets/sheet1.xml") ?? "";
    expect(summarySheet).toContain("غير متوازن");
    expect(summarySheet).toContain("<v>10000</v>");

    const oversized: TrialBalanceAccount[] = [
      { code: "9999", name: "رصيد كبير", account_type: "asset", is_active: true, debit_total: "90071992547409.92", credit_total: "0.00" },
    ];
    expect(() => buildTrialBalanceWorkbookXlsx(oversized, {
      posted_entry_count: 1,
      debit_total: "90071992547409.92",
      credit_total: "0.00",
    }, period)).toThrow(/الدقة الرقمية الآمنة/);
  });

  it("rejects invalid period, duplicate codes, and non-ISO dates", () => {
    expect(() => buildTrialBalanceWorkbookXlsx(accounts, summary, { from: "2026-13-01", to: null })).toThrow(/الفترة غير صالحة/);
    expect(() => buildTrialBalanceWorkbookXlsx([accounts[0], accounts[0]], {
      posted_entry_count: 1,
      debit_total: "1,800.00",
      credit_total: "0.00",
    }, period)).toThrow(/رمز الحساب .* مكرر/);
  });
});
