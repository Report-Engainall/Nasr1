// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseCustomerShoppingListXlsx } from "@/lib/customer-shopping-lists-xlsx";

const products = [
  { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "أرز", item_code: "RICE-1", sku: "SKU-1", barcode: "6280001", unit: "كيس" },
  { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "سكر", item_code: "SUGAR-2", sku: null, barcode: null, unit: "كيس" },
];

function joinBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

function makeXlsxWithDataDescriptors(rowCount = 1): Uint8Array {
  const encoder = new TextEncoder();
  const entries = [
    ["[Content_Types].xml", "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"></Types>"],
    ["_rels/.rels", "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"></Relationships>"],
    ["xl/workbook.xml", "<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"Products\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>"],
    ["xl/_rels/workbook.xml.rels", "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/></Relationships>"],
    ["xl/worksheets/sheet1.xml",
      "<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData><row r=\"1\"><c r=\"A1\" t=\"inlineStr\"><is><t>رمز الصنف</t></is></c><c r=\"B1\" t=\"inlineStr\"><is><t>الكمية</t></is></c><c r=\"C1\" t=\"inlineStr\"><is><t>الوحدة</t></is></c></row>" +
      Array.from({ length: rowCount }, (_, index) => {
        const row = index + 2;
        const code = rowCount === 1 ? "RICE-1" : "ITEM-" + (index + 1);
        return "<row r=\"" + row + "\"><c r=\"A" + row + "\" t=\"inlineStr\"><is><t>" + code + "</t></is></c>" +
          "<c r=\"B" + row + "\"><v>" + (rowCount === 1 ? "2" : "1") + "</v></c><c r=\"C" + row + "\" t=\"inlineStr\"><is><t>كيس</t></is></c></row>";
      }).join("") +
      "</sheetData></worksheet>"],
  ] as const;
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  for (const [path, xml] of entries) {
    const name = encoder.encode(path);
    const data = encoder.encode(xml);
    const localHeader = new Uint8Array(30);
    const local = new DataView(localHeader.buffer);
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 8, true);
    local.setUint16(8, 0, true);
    local.setUint16(26, name.length, true);
    const descriptor = new Uint8Array(16);
    const descriptorView = new DataView(descriptor.buffer);
    descriptorView.setUint32(0, 0x08074b50, true);
    descriptorView.setUint32(8, data.length, true);
    descriptorView.setUint32(12, data.length, true);
    localParts.push(localHeader, name, data, descriptor);

    const centralHeader = new Uint8Array(46);
    const central = new DataView(centralHeader.buffer);
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 8, true);
    central.setUint16(10, 0, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, data.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, localOffset, true);
    centralParts.push(centralHeader, name);
    localOffset += localHeader.length + name.length + data.length + descriptor.length;
  }
  const centralDirectory = joinBytes(centralParts);
  const localFiles = joinBytes(localParts);
  const end = new Uint8Array(22);
  const eocd = new DataView(end.buffer);
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, entries.length, true);
  eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, centralDirectory.length, true);
  eocd.setUint32(16, localFiles.length, true);
  return joinBytes([localFiles, centralDirectory, end]);
}



describe("customer shopping-list XLSX archive parser", () => {
  it("imports an XLSX sheet with ZIP data descriptors and inline Arabic headers", async () => {
    const bytes = makeXlsxWithDataDescriptors();
    // The parser needs only the standard File name/size/arrayBuffer contract.
    // Vitest's jsdom File lacks arrayBuffer(), so use a deterministic standards-shaped fixture.
    const file = {
      name: "products.xlsx",
      size: bytes.byteLength,
      arrayBuffer: async (): Promise<ArrayBuffer> => {
        const buffer = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(buffer).set(bytes);
        return buffer;
      },
    } as File;
    const result = await parseCustomerShoppingListXlsx(file, products);
    expect(result.imported_rows).toBe(1); // The quantity cell intentionally omits the optional OOXML type attribute.
    expect(result.lines).toEqual([{
      product_id: products[0].id,
      quantity: 2,
      unit_name: "كيس",
      base_units_per_unit: 1,
      source_row: 2,
    }]);
  });


  it("accepts exactly 100 rows and rejects the 101st before the saved-list contract can fail", async () => {
    const makeProducts = (count: number) => Array.from({ length: count }, (_, index) => ({
      id: "00000000-0000-4000-8000-" + String(index + 1).padStart(12, "0"),
      name: "صنف " + (index + 1),
      item_code: "ITEM-" + (index + 1),
      sku: null,
      barcode: null,
      unit: "كيس",
    }));
    const toFile = (bytes: Uint8Array): File => ({
      name: "bulk-products.xlsx",
      size: bytes.byteLength,
      arrayBuffer: async (): Promise<ArrayBuffer> => {
        const buffer = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(buffer).set(bytes);
        return buffer;
      },
    } as File);

    const accepted = await parseCustomerShoppingListXlsx(
      toFile(makeXlsxWithDataDescriptors(100)),
      makeProducts(100),
    );
    expect(accepted.imported_rows).toBe(100);
    expect(accepted.lines).toHaveLength(100);

    await expect(parseCustomerShoppingListXlsx(
      toFile(makeXlsxWithDataDescriptors(101)),
      makeProducts(101),
    )).rejects.toThrow("100 صنف");
  });

});
