import { describe, expect, it } from "vitest";
import { buildCashExpenseWorkbookXlsx, type CashExpenseXlsxInput, type CashExpenseXlsxItem } from "@/lib/cash-expense-xlsx";

function item(overrides: Partial<CashExpenseXlsxItem> = {}): CashExpenseXlsxItem {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    expense_number: "00000017",
    category: '=HYPERLINK("https://evil.invalid","open")',
    description: "نقل شحنة فعلية",
    amount: "25.00",
    currency: "YER",
    payment_method: "cash",
    reference: "RCPT-17",
    expense_date: "2026-11-02",
    status: "posted",
    created_by_profile_id: "PRIVATE-ACTOR-ID",
    voided_at: null,
    void_reason: null,
    created_at: "2026-11-02T10:00:00.000Z",
    ...overrides,
  };
}
function input(overrides: Partial<CashExpenseXlsxInput> = {}): CashExpenseXlsxInput {
  return {
    roles: ["accountant"],
    exportedAt: "2026-11-03T08:05:00.000Z",
    filters: { search: "", from: "", to: "", status: "all" },
    payload: {
      items: [
        item(),
        item({
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", expense_number: "00000018",
          category: "صيانة", description: "صيانة مركبة", amount: "5.00", status: "void",
          payment_method: "transfer", voided_at: "2026-11-02T11:00:00.000Z",
          void_reason: "مستند مكرر جرى إلغاؤه",
        }),
      ],
      total_count: 3,
      summary_by_currency: [
        { currency: "YER", posted_count: 1, posted_amount: "25.00", void_count: 1 },
        { currency: "USD", posted_count: 1, posted_amount: "10.50", void_count: 0 },
      ],
      as_of_utc: "2026-11-03T08:00:00.000Z",
      limit: 2,
      offset: 0,
      has_more: true,
    },
    ...overrides,
  };
}
function unzipStoredWorkbook(bytes: Uint8Array): Map<string, string> {
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
    files.set(decoder.decode(bytes.slice(nameStart, nameStart + nameLength)),
      decoder.decode(bytes.slice(dataStart, dataStart + size)));
    offset = dataStart + size;
  }
  return files;
}
describe("cash expense XLSX report", () => {
  it("separates the full filtered currency summary from current-page details", () => {
    const files = unzipStoredWorkbook(buildCashExpenseWorkbookXlsx(input()));
    const workbook = files.get("xl/workbook.xml") ?? "";
    const summary = files.get("xl/worksheets/sheet1.xml") ?? "";
    const details = files.get("xl/worksheets/sheet2.xml") ?? "";
    expect(workbook).toContain("ملخص المصروفات");
    expect(workbook).toContain("تفاصيل الصفحة");
    expect(summary).toContain("عدد النتائج المطابقة لكل الفلاتر");
    expect(summary).toContain("<v>3</v>");
    expect(summary).toContain("USD");
    expect(summary).toContain("<v>10.5</v>");
    expect(summary).toContain("الصفحة الحالية فقط");
    expect(details).toContain("00000017");
    expect(details).toContain("00000018");
    expect(details.match(/<row r=/g)).toHaveLength(3);
  });
  it("keeps text inline, escapes formula-like content, and excludes actor and database identifiers", () => {
    const files = unzipStoredWorkbook(buildCashExpenseWorkbookXlsx(input()));
    const combined = (files.get("xl/worksheets/sheet1.xml") ?? "") +
      (files.get("xl/worksheets/sheet2.xml") ?? "");
    expect(combined).toContain('t="inlineStr"');
    expect(combined).toContain('=HYPERLINK(&quot;https://evil.invalid&quot;,&quot;open&quot;)');
    expect(combined).not.toContain("<f");
    for (const privateValue of [
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "PRIVATE-ACTOR-ID", "created_by_profile_id", "created_at", "voided_at",
    ]) expect(combined).not.toContain(privateValue);
  });
  it("preserves currency boundaries and exact decimal cents in numeric cells", () => {
    const files = unzipStoredWorkbook(buildCashExpenseWorkbookXlsx(input()));
    const summary = files.get("xl/worksheets/sheet1.xml") ?? "";
    const details = files.get("xl/worksheets/sheet2.xml") ?? "";
    expect(summary).toContain("YER");
    expect(summary).toContain("USD");
    expect(summary).toContain("<v>25</v>");
    expect(details).toContain("<v>25</v>");
    expect(details).toContain("<v>5</v>");
  });
  it("allows only finance roles to export", () => {
    expect(() => buildCashExpenseWorkbookXlsx(input({ roles: ["staff"] }))).toThrow("تصدير سجل المصروفات متاح");
    expect(() => buildCashExpenseWorkbookXlsx(input({ roles: ["customer"] }))).toThrow("تصدير سجل المصروفات متاح");
    for (const role of ["accountant", "manager", "admin"]) {
      expect(() => buildCashExpenseWorkbookXlsx(input({ roles: [role] }))).not.toThrow();
    }
  });
  it("rejects incomplete page metadata and summary totals rather than exporting misleading data", () => {
    expect(() => buildCashExpenseWorkbookXlsx(input({
      payload: { ...input().payload, has_more: false },
    }))).toThrow(/تفاصيل الصفحة لا تطابق/);
    expect(() => buildCashExpenseWorkbookXlsx(input({
      payload: { ...input().payload, items: input().payload.items.slice(0, 1) },
    }))).toThrow(/تفاصيل الصفحة لا تطابق/);
    expect(() => buildCashExpenseWorkbookXlsx(input({
      payload: {
        ...input().payload,
        summary_by_currency: [{ currency: "YER", posted_count: 1, posted_amount: "25.00", void_count: 0 }],
      },
    }))).toThrow(/ملخص العملات لا يطابق/);
  });
  it("rejects unsafe decimal precision and invalid void data", () => {
    expect(() => buildCashExpenseWorkbookXlsx(input({
      payload: {
        ...input().payload,
        items: [item({ amount: "99999999999999.99" }), input().payload.items[1]],
      },
    }))).toThrow(/حدود الدقة الآمنة/);
    expect(() => buildCashExpenseWorkbookXlsx(input({
      payload: {
        ...input().payload,
        items: [item({ status: "void", voided_at: null, void_reason: null }), input().payload.items[1]],
      },
    }))).toThrow(/وقت إلغاء المصروف/);
  });
  it("exports only the current page while keeping all-filter totals in summary", () => {
    const nextPage = input({
      payload: {
        ...input().payload,
        items: [item({ expense_number: "00000019", id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" })],
        offset: 2,
        has_more: false,
      },
    });
    const files = unzipStoredWorkbook(buildCashExpenseWorkbookXlsx(nextPage));
    const summary = files.get("xl/worksheets/sheet1.xml") ?? "";
    const details = files.get("xl/worksheets/sheet2.xml") ?? "";
    expect(summary).toContain("رقم الصفحة");
    expect(summary).toContain("<v>2</v>");
    expect(details).toContain("00000019");
    expect(details).not.toContain("00000017");
  });
});
