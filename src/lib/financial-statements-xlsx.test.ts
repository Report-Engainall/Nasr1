import { describe, expect, it } from "vitest";
import type { FinancialStatementsPrintDocument } from "@/lib/general-journal-print";
import { buildFinancialStatementsWorkbookXlsx } from "@/lib/financial-statements-xlsx";

function sample(): FinancialStatementsPrintDocument {
  return {
    kind: "statements",
    periodFrom: "2026-01-01",
    periodTo: "2026-12-31",
    postedEntryCount: 12,
    revenueCents: 50000n,
    expenseCents: 10000n,
    netIncomeCents: 40000n,
    assetsCents: 90000n,
    liabilitiesCents: 0n,
    equityCents: 50000n,
    cumulativeEarningsCents: 40000n,
    liabilitiesEquityAndEarningsCents: 90000n,
    balanceDifferenceCents: 0n,
    incomeLines: [
      { code: "4000", name: '=HYPERLINK("https://invalid.test","open")', accountType: "revenue", amountCents: 50000n },
      { code: "5000", name: "مصروفات تشغيل", accountType: "expense", amountCents: 10000n },
    ],
    balanceLines: [
      { code: "1000", name: "النقدية", accountType: "asset", amountCents: 90000n },
      { code: "3000", name: "رأس المال", accountType: "equity", amountCents: 50000n },
    ],
  };
}

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
    files.set(
      decoder.decode(bytes.slice(nameStart, nameStart + nameLength)),
      decoder.decode(bytes.slice(dataStart, dataStart + size)),
    );
    offset = dataStart + size;
  }
  return files;
}

describe("general ledger financial statements XLSX export", () => {
  it("exports complete summary, income details, balance details and reconciliation notes", () => {
    const files = unzipStore(buildFinancialStatementsWorkbookXlsx(sample(), "2026-11-02T18:00:00.000Z"));
    const workbook = files.get("xl/workbook.xml") ?? "";
    const summary = files.get("xl/worksheets/sheet1.xml") ?? "";
    const income = files.get("xl/worksheets/sheet2.xml") ?? "";
    const balance = files.get("xl/worksheets/sheet3.xml") ?? "";
    const notes = files.get("xl/worksheets/sheet4.xml") ?? "";

    expect(workbook).toContain('sheet name="ملخص القوائم"');
    expect(workbook).toContain('sheet name="قائمة الدخل"');
    expect(workbook).toContain('sheet name="المركز المالي"');
    expect(summary).toContain("2026-01-01");
    expect(summary).toContain("500");
    expect(summary).toContain("<v>50000</v>");
    expect(summary).toContain("متوازنة ضمن القيود المرحلة");
    expect(income).toContain("4000");
    expect(income).toContain("500");
    expect(income).toContain("<v>50000</v>");
    expect(balance).toContain("1000");
    expect(balance).toContain("<v>90000</v>");
    expect(notes).toContain("لم تُنشأ أرصدة افتتاحية");
    expect(files.size).toBe(10);
  });

  it("keeps formula-looking text as an escaped inline string and excludes internal identifiers", () => {
    const files = unzipStore(buildFinancialStatementsWorkbookXlsx(sample()));
    const combined = [...files.entries()].filter(([path]) => path.endsWith(".xml")).map(([, body]) => body).join("\n");
    expect(combined).toContain("&quot;https://invalid.test&quot;");
    expect(combined).not.toMatch(/<f(?:\\s|>)/);
    for (const value of ["private-account-id", "organization-private-id", "profile-private-id", "source-reference-private"]) {
      expect(combined).not.toContain(value);
    }
  });

  it("exports an imbalance explicitly and refuses inconsistent or unsafe financial totals", () => {
    const broken = sample();
    broken.balanceDifferenceCents = 100n;
    expect(() => buildFinancialStatementsWorkbookXlsx(broken)).toThrow(/لا تتطابق/);

    const oversized = sample();
    oversized.assetsCents = 9007199254740992n;
    oversized.balanceLines[0].amountCents = 9007199254740992n;
    oversized.liabilitiesEquityAndEarningsCents = 90000n;
    oversized.balanceDifferenceCents = 9007199254650992n;
    expect(() => buildFinancialStatementsWorkbookXlsx(oversized)).toThrow(/الدقة الرقمية الآمنة/);
  });

  it("preserves a genuine source imbalance without silently making it zero", () => {
    const broken = sample();
    broken.assetsCents = 90100n;
    broken.balanceLines[0].amountCents = 90100n;
    broken.balanceDifferenceCents = 100n;
    const files = unzipStore(buildFinancialStatementsWorkbookXlsx(broken));
    const summary = files.get("xl/worksheets/sheet1.xml") ?? "";
    expect(summary).toContain("غير متوازنة");
    expect(summary).toContain("<v>100</v>");
  });
});
