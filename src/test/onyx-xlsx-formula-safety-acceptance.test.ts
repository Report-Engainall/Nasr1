import { describe, expect, it } from "vitest";
import { buildOnyxOrderWorkbook } from "@/lib/onyx-export";

type ExportInput = Parameters<typeof buildOnyxOrderWorkbook>[0];

function storedZipEntry(bytes: Uint8Array, targetPath: string): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  let offset = 0;

  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    const dataStart = nameStart + nameLength + extraLength;

    if (name === targetPath) return decoder.decode(bytes.slice(dataStart, dataStart + compressedSize));
    offset = dataStart + compressedSize;
  }

  throw new Error("Missing XLSX ZIP entry: " + targetPath);
}

function findCell(worksheetXml: string, reference: string): string {
  const escapedReference = reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = worksheetXml.match(new RegExp('<c r="' + escapedReference + '"[^>]*>[\\s\\S]*?<\\/c>'));
  if (!match) throw new Error("Missing XLSX cell: " + reference);
  return match[0];
}

const formulaLikeStrings = [
  '=HYPERLINK("https://example.invalid","open")',
  "+SUM(1,1)",
  "-1+1",
  "@SUM(1,1)",
  "\t=1+1",
  '=HYPERLINK("https://example.invalid","<click & open>")',
] as const;

function makeOrder(): ExportInput {
  return {
    orderId: "11111111-1111-4111-8111-111111111111",
    orderNumber: "ORD-000125",
    orderStatus: "confirmed",
    orderCreatedAt: "2026-10-15T09:30:00.000Z",
    customerCode: "000042",
    customerName: '=HYPERLINK("https://example.invalid","customer")',
    items: formulaLikeStrings.map((product_name_snapshot) => ({
      item_code: "000007",
      product_name_snapshot,
      unit_snapshot: "كرتون",
      quantity: 1,
      unit_price_snapshot: 10,
    })),
  };
}

describe("Onyx XLSX formula-injection acceptance", () => {
  it("keeps formula-like business strings as inline text cells and never emits formula nodes", () => {
    const workbook = buildOnyxOrderWorkbook(makeOrder());
    expect([...workbook.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);

    const details = storedZipEntry(workbook, "xl/worksheets/sheet1.xml");
    const header = storedZipEntry(workbook, "xl/worksheets/sheet2.xml");

    // A leading =, +, -, @, or tab is still untrusted text; it must not become an OOXML formula.
    expect(details).not.toMatch(/<f(?:\s|\/|>)/i);
    expect(header).not.toMatch(/<f(?:\s|\/|>)/i);

    expect(findCell(details, "A2")).toContain('t="inlineStr"');
    expect(findCell(details, "A2")).toContain("000007");

    formulaLikeStrings.forEach((value, index) => {
      const cell = findCell(details, "B" + (index + 2));
      expect(cell, "cell B" + (index + 2)).toContain('t="inlineStr"');
      expect(cell).toContain("<is><t xml:space=\"preserve\">");
      expect(cell).not.toMatch(/<f(?:\s|\/|>)/i);

      if (index === 5) {
        expect(cell).toContain("&lt;click &amp; open&gt;");
      } else {
        // Quotes are XML-escaped in cell text; verify the serialized source, not raw input.
        expect(cell).toContain(value.replace(/"/g, "&quot;"));
      }
    });

    // Header metadata must use the same safe text-cell encoding, not a formula cell.
    expect(findCell(header, "B11")).toContain('t="inlineStr"');
    expect(findCell(header, "B11")).toContain("=HYPERLINK(");
  });

  it("does not serialize unexpected internal cost, margin, or foreign-tier fields into either Onyx worksheet", () => {
    const base = makeOrder();
    const unsafeInput = {
      ...base,
      items: base.items.map((item) => ({
        ...item,
        internal_cost_sentinel: "INTERNAL-COST-SENTINEL",
        internal_margin_sentinel: "INTERNAL-MARGIN-SENTINEL",
        foreign_tier_sentinel: "FOREIGN-TIER-SENTINEL",
        internal_cost_amount: 987654.32,
        foreign_tier_price: 876543.21,
      })),
    } as unknown as ExportInput;

    const workbook = buildOnyxOrderWorkbook(unsafeInput);
    const details = storedZipEntry(workbook, "xl/worksheets/sheet1.xml");
    const header = storedZipEntry(workbook, "xl/worksheets/sheet2.xml");
    for (const secret of [
      "INTERNAL-COST-SENTINEL",
      "INTERNAL-MARGIN-SENTINEL",
      "FOREIGN-TIER-SENTINEL",
      "987654.32",
      "876543.21",
    ]) {
      expect(details).not.toContain(secret);
      expect(header).not.toContain(secret);
    }

    // Authorized order quantity and approved/customer price columns remain present.
    expect(details).toContain("000007");
    expect(details).toContain("10");
  });
});
