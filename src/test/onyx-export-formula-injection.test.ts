import { describe, expect, it } from "vitest";
import { buildOnyxOrderWorkbook } from "@/lib/onyx-export";

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

describe("Onyx spreadsheet formula-injection resistance", () => {
  it("keeps attacker-controlled formula-like business strings as inline text cells", () => {
    const workbook = buildOnyxOrderWorkbook({
      orderId: "11111111-1111-4111-8111-111111111111",
      orderNumber: "-1+2",
      orderStatus: "+SUM(1,1)",
      orderCreatedAt: "@SUM(1,1)",
      customerCode: "-CMD|' /C calc'!A0",
      customerName: '=WEBSERVICE("https://example.invalid")',
      items: [{
        item_code: '=HYPERLINK("https://example.invalid","open")',
        product_name_snapshot: "+SUM(1,1)",
        unit_snapshot: "@SUM(1,1)",
        quantity: 1,
        unit_price_snapshot: 2,
      }],
    });

    const detailXml = storedZipEntry(workbook, "xl/worksheets/sheet1.xml");
    const headerXml = storedZipEntry(workbook, "xl/worksheets/sheet2.xml");

    expect(detailXml).toContain('t="inlineStr"');
    expect(headerXml).toContain('t="inlineStr"');
    expect(detailXml).toContain('=HYPERLINK(&quot;https://example.invalid&quot;,&quot;open&quot;)');
    expect(detailXml).toContain("+SUM(1,1)");
    expect(detailXml).toContain("@SUM(1,1)");
    expect(headerXml).toContain('=WEBSERVICE(&quot;https://example.invalid&quot;)');
    expect(headerXml).toContain("-CMD|&apos; /C calc&apos;!A0");

    // No user-controlled cell is serialized as an OOXML formula element.
    expect(detailXml).not.toMatch(/<f(?:\s|>)/i);
    expect(headerXml).not.toMatch(/<f(?:\s|>)/i);
  });
});
