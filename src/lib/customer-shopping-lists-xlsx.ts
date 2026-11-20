import { normalizeArabicSearchText } from "@/lib/commerce-utils";

export type ShoppingListImportProduct = {
  id: string;
  name: string;
  item_code: string;
  sku?: string | null;
  barcode?: string | null;
  unit: string;
};
export type ShoppingListImportLine = {
  product_id: string;
  quantity: number;
  unit_name: string;
  base_units_per_unit: 1;
  source_row: number;
};
export type ShoppingListImportResult = {
  lines: ShoppingListImportLine[];
  imported_rows: number;
  skipped_empty_rows: number;
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ENTRY_BYTES = 1024 * 1024;
const MAX_TOTAL_UNPACKED_BYTES = 4 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 24;
const MAX_DATA_ROWS = 500;
type ZipEntry = { method: number; compressedSize: number; uncompressedSize: number; localOffset: number };

function normalizeDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .normalize("NFKC")
    .trim();
}

export function normalizeShoppingListImportQuantity(value: unknown): number {
  if (typeof value !== "string" && typeof value !== "number") throw new Error("قيمة الكمية في ملف Excel غير صالحة.");
  const raw = normalizeDigits(String(value)).replace(/\s/g, "");
  const grouped = /^(?:[0-9]{1,3})(?:[٬,][0-9]{3})+$/.test(raw);
  if (/[٬,]/.test(raw) && !grouped) throw new Error("استخدم فواصل الآلاف فقط؛ لا تُقبل الكميات الكسرية.");
  const normalized = grouped ? raw.replace(/[٬,]/g, "") : raw;
  if (!/^\d{1,5}$/.test(normalized)) throw new Error("الكميات المستوردة يجب أن تكون أعدادًا صحيحة موجبة دون كسور.");
  const quantity = Number(normalized);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000) {
    throw new Error("كمية Excel يجب أن تكون بين 1 و10000.");
  }
  return quantity;
}

export function resolveShoppingListImportProduct(
  rawCode: string,
  products: readonly ShoppingListImportProduct[],
): ShoppingListImportProduct {
  const code = normalizeDigits(rawCode).toLocaleLowerCase("ar");
  if (!code || code.length > 100) throw new Error("رمز المنتج في ملف Excel فارغ أو أطول من الحد المسموح.");
  const matches = products.filter((product) =>
    [product.item_code, product.sku ?? "", product.barcode ?? ""]
      .some((candidate) => normalizeDigits(candidate).toLocaleLowerCase("ar") === code),
  );
  if (matches.length === 0) throw new Error("لم يتم العثور على منتج مطابق للرمز «" + rawCode + "».");
  if (matches.length > 1) throw new Error("الرمز «" + rawCode + "» يطابق أكثر من منتج؛ عالج تكرار الرمز في الكتالوج أولًا.");
  return matches[0];
}

function parseXml(source: string, label: string): Document {
  const doc = new DOMParser().parseFromString(source, "application/xml");
  if (doc.getElementsByTagName("parsererror").length || !doc.documentElement) {
    throw new Error("ملف Excel غير صالح في جزء " + label + ".");
  }
  return doc;
}
function columnIndex(reference: string): number {
  const letters = reference.toUpperCase().match(/^[A-Z]+/)?.[0];
  if (!letters) throw new Error("مرجع خلية Excel غير صالح.");
  let column = 0;
  for (const letter of letters) column = column * 26 + letter.charCodeAt(0) - 64;
  return column - 1;
}
function firstText(element: Element, localName: string): string {
  return element.getElementsByTagNameNS("*", localName)[0]?.textContent ?? "";
}
function xmlText(element: Element): string {
  return Array.from(element.getElementsByTagNameNS("*", "t"))
    .map((node) => node.textContent ?? "")
    .join("");
}
function normalizeHeader(value: string): string {
  return normalizeArabicSearchText(value).replace(/\s+/g, " ").trim();
}
function readZipDirectory(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const min = Math.max(0, bytes.length - 65557);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= min; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error("الملف ليس حزمة XLSX سليمة أو أنه يستخدم صيغة ZIP64 غير المدعومة.");
  if (view.getUint16(eocd + 4, true) !== 0 || view.getUint16(eocd + 6, true) !== 0) {
    throw new Error("ملفات Excel المقسمة إلى أجزاء متعددة غير مدعومة.");
  }
  const entryCount = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  if (entryCount < 1 || entryCount > MAX_ZIP_ENTRIES || directoryOffset + directorySize > eocd) {
    throw new Error("عدد مكونات ملف Excel أو حجم فهرسه يتجاوز الحد الآمن.");
  }
  const entries = new Map<string, ZipEntry>();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let offset = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("فهرس ملف Excel تالف.");
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    // The central directory carries authoritative sizes, so data-descriptor ZIP entries (bit 3) are supported.
    if ((flags & 1) !== 0 || compressedSize > MAX_FILE_BYTES ||
        uncompressedSize > MAX_ENTRY_BYTES || ![0, 8].includes(method) ||
        offset + 46 + nameLength + extraLength + commentLength > bytes.length) {
      throw new Error("يحتوي ملف Excel على تشفير أو ضغط أو حجم غير مدعوم.");
    }
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    if (!name || name.startsWith("/") || name.includes("..") || name.includes("\\") || name.includes("\0")) {
      throw new Error("مسار ملف داخلي غير آمن داخل حزمة Excel.");
    }
    if (entries.has(name)) throw new Error("ملف Excel يحتوي على مكون داخلي مكرر.");
    entries.set(name, { method, compressedSize, uncompressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
async function readZipEntry(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = entry.localOffset;
  if (offset + 30 > bytes.length || view.getUint32(offset, true) !== 0x04034b50) throw new Error("ترويسة مكون Excel الداخلية تالفة.");
  const nameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const start = offset + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > bytes.length) throw new Error("بيانات أحد مكونات Excel مبتورة.");
  const compressed = bytes.slice(start, end);
  if (entry.method === 0) {
    if (compressed.length !== entry.uncompressedSize) throw new Error("حجم مكون Excel غير متطابق.");
    return compressed;
  }
  if (typeof DecompressionStream === "undefined") {
    throw new Error("المتصفح لا يدعم فك ضغط XLSX محليًا؛ حدّث المتصفح ثم أعد المحاولة.");
  }
  try {
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw" as CompressionFormat));
    const result = new Uint8Array(await new Response(stream).arrayBuffer());
    if (result.length !== entry.uncompressedSize || result.length > MAX_ENTRY_BYTES) {
      throw new Error("الحجم المفكوك لأحد مكونات Excel لا يطابق فهرس الملف.");
    }
    return result;
  } catch (cause) {
    throw new Error(cause instanceof Error && cause.message.includes("الحجم المفكوك")
      ? cause.message
      : "تعذر فك ضغط مكون XLSX؛ تأكد أن الملف غير تالف.");
  }
}
function sheetRows(doc: Document, sharedStrings: string[]): Array<Map<number, string>> {
  const rows = Array.from(doc.getElementsByTagNameNS("*", "row"));
  return rows.map((row) => {
    const cells = new Map<number, string>();
    for (const cell of Array.from(row.getElementsByTagNameNS("*", "c"))) {
      if (cell.getElementsByTagNameNS("*", "f").length) {
        throw new Error("لا تُقبل خلايا Excel التي تحتوي على معادلات؛ استخدم قيمًا ثابتة.");
      }
      const reference = cell.getAttribute("r") ?? "";
      const index = columnIndex(reference);
      const type = cell.getAttribute("t");
      let value = "";
      if (type === "s") {
        const rawIndex = firstText(cell, "v");
        const sharedIndex = Number(rawIndex);
        if (!Number.isSafeInteger(sharedIndex) || sharedIndex < 0 || sharedIndex >= sharedStrings.length) {
          throw new Error("مرجع نص مشترك غير صالح في ملف Excel.");
        }
        value = sharedStrings[sharedIndex];
      } else if (type === "inlineStr") {
        const inline = cell.getElementsByTagNameNS("*", "is")[0];
        value = inline ? xmlText(inline) : "";
      } else if (type === "str" || type === undefined || type === "n") {
        value = firstText(cell, "v");
      } else if (type === "b") {
        value = firstText(cell, "v");
      } else {
        throw new Error("نوع خلية Excel غير مدعوم في صف البيانات.");
      }
      cells.set(index, value);
    }
    return cells;
  });
}

export async function parseCustomerShoppingListXlsx(
  file: File,
  products: readonly ShoppingListImportProduct[],
): Promise<ShoppingListImportResult> {
  if (!/\.xlsx$/i.test(file.name)) throw new Error("استيراد قوائم المشتريات يقبل ملفات Excel الحديثة بامتداد .xlsx فقط.");
  if (file.size < 1 || file.size > MAX_FILE_BYTES) throw new Error("حجم ملف Excel يجب ألا يتجاوز 5 ميجابايت.");
  if (products.length > 10000) throw new Error("الكتالوج المحمّل أكبر من حد مطابقة ملف Excel الآمن.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = readZipDirectory(bytes);
  const allowed = new Set([
    "xl/workbook.xml",
    "xl/_rels/workbook.xml.rels",
    "xl/sharedStrings.xml",
    "xl/styles.xml",
    "xl/theme/theme1.xml",
    "xl/calcChain.xml",
  ]);
  for (const name of entries.keys()) {
    if (name.startsWith("xl/worksheets/") && /^xl\/worksheets\/sheet\d+\.xml$/.test(name)) allowed.add(name);
    if (name.startsWith("xl/externalLinks/") || /vbaProject|\.bin$/i.test(name)) {
      throw new Error("ملفات Excel التي تتضمن روابط خارجية أو وحدات ماكرو غير مقبولة.");
    }
  }
  const unsupportedEntry = [...entries.keys()].some((name) => {
    const relationshipPrefix = "xl/worksheets/_rels/sheet";
    const relationshipSuffix = ".xml.rels";
    const relationshipNumber = name.startsWith(relationshipPrefix) && name.endsWith(relationshipSuffix)
      ? name.slice(relationshipPrefix.length, -relationshipSuffix.length)
      : "";
    const isWorksheetRelationship = /^[0-9]+$/.test(relationshipNumber);
    const isDocumentMetadata = [
      "[Content_Types].xml", "_rels/.rels", "docProps/app.xml", "docProps/core.xml", "docProps/custom.xml",
    ].includes(name);
    return !name.endsWith("/") && !allowed.has(name) && !isDocumentMetadata && !isWorksheetRelationship;
  });
  if (unsupportedEntry) {
    throw new Error("يتضمن الملف مكونات Excel إضافية غير مطلوبة؛ أعد حفظ جدول المنتجات فقط بصيغة XLSX.");
  }
  let totalUnpacked = 0;
  const read = async (name: string): Promise<string> => {
    const entry = entries.get(name);
    if (!entry) throw new Error("يفتقد ملف Excel المكون المطلوب: " + name);
    totalUnpacked += entry.uncompressedSize;
    if (totalUnpacked > MAX_TOTAL_UNPACKED_BYTES) throw new Error("الحجم الداخلي المفكوك لملف Excel يتجاوز 4 ميجابايت.");
    return new TextDecoder("utf-8", { fatal: true }).decode(await readZipEntry(bytes, entry));
  };
  const workbook = parseXml(await read("xl/workbook.xml"), "فهرس المصنف");
  const relationships = parseXml(await read("xl/_rels/workbook.xml.rels"), "روابط المصنف");
  const firstSheet = workbook.getElementsByTagNameNS("*", "sheet")[0];
  const relationshipId = firstSheet?.getAttribute("r:id") ?? firstSheet?.getAttributeNS(
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id",
  );
  if (!relationshipId) throw new Error("لا يحتوي ملف Excel على ورقة عمل قابلة للاستيراد.");
  const relation = Array.from(relationships.getElementsByTagNameNS("*", "Relationship"))
    .find((item) => item.getAttribute("Id") === relationshipId);
  const target = relation?.getAttribute("Target") ?? "";
  if (!target || relation?.getAttribute("TargetMode") === "External") throw new Error("رابط ورقة Excel غير صالح أو خارجي.");
  const normalizedTarget = target.replace(/^\//, "").startsWith("xl/")
    ? target.replace(/^\//, "")
    : "xl/" + target.replace(/^\//, "");
  if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(normalizedTarget)) throw new Error("ورقة Excel الأولى ليست ضمن مسار المصنف الآمن.");

  let sharedStrings: string[] = [];
  if (entries.has("xl/sharedStrings.xml")) {
    const strings = parseXml(await read("xl/sharedStrings.xml"), "النصوص المشتركة");
    sharedStrings = Array.from(strings.getElementsByTagNameNS("*", "si")).map(xmlText);
  }
  const worksheet = parseXml(await read(normalizedTarget), "ورقة المنتجات");
  const rows = sheetRows(worksheet, sharedStrings);
  const headerCandidates = rows.slice(0, 10);
  const codeLabels = new Set(["رمز الصنف","كود الصنف","رمز المنتج","sku","item code","itemcode","barcode","باركود"]);
  const quantityLabels = new Set(["الكمية","كمية","quantity","qty","order quantity"]);
  const unitLabels = new Set(["الوحدة","unit","وحدة البيع"]);
  let headerIndex = -1;
  let codeColumn = -1;
  let quantityColumn = -1;
  let unitColumn = -1;
  for (let index = 0; index < headerCandidates.length; index += 1) {
    const row = headerCandidates[index];
    const labels = [...row.entries()].map(([column, value]) => [column, normalizeHeader(value)] as const);
    const code = labels.find(([, value]) => codeLabels.has(value) || value.replace(/ /g,"") === "itemcode");
    const qty = labels.find(([, value]) => quantityLabels.has(value));
    if (code && qty) {
      headerIndex = index;
      codeColumn = code[0];
      quantityColumn = qty[0];
      unitColumn = labels.find(([, value]) => unitLabels.has(value))?.[0] ?? -1;
      break;
    }
  }
  if (headerIndex < 0) throw new Error("لم أجد صف العناوين المطلوب. استخدم عمود «رمز الصنف» أو SKU وعمود «الكمية».");
  const imported: ShoppingListImportLine[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    const rawCode = (row.get(codeColumn) ?? "").trim();
    const rawQuantity = (row.get(quantityColumn) ?? "").trim();
    const rawUnit = unitColumn >= 0 ? (row.get(unitColumn) ?? "").trim() : "";
    if (!rawCode && !rawQuantity && !rawUnit) { skipped += 1; continue; }
    const sourceRow = index + 1;
    if (!rawCode || !rawQuantity) throw new Error("الصف " + sourceRow + " يفتقد رمز الصنف أو الكمية.");
    if (imported.length >= MAX_DATA_ROWS) throw new Error("لا يمكن استيراد أكثر من 500 صف بيانات في ملف واحد.");
    const product = resolveShoppingListImportProduct(rawCode, products);
    const id = product.id.toLowerCase();
    if (seen.has(id)) throw new Error("الصنف «" + product.name + "» مكرر في ملف Excel؛ اجمع كمياته في صف واحد أولًا.");
    seen.add(id);
    if (rawUnit && normalizeArabicSearchText(rawUnit) !== normalizeArabicSearchText(product.unit)) {
      throw new Error("الوحدة في صف " + sourceRow + " يجب أن تكون الوحدة الأساسية «" + product.unit +
        "». يمكن تغييرها بعد الاستيراد إلى عبوة بديلة موثقة من كتالوج الصنف.");
    }
    imported.push({
      product_id: product.id,
      quantity: normalizeShoppingListImportQuantity(rawQuantity),
      unit_name: product.unit,
      base_units_per_unit: 1,
      source_row: sourceRow,
    });
  }
  if (imported.length === 0) throw new Error("لم يتضمن ملف Excel أي أصناف ذات كميات صالحة.");
  return { lines: imported, imported_rows: imported.length, skipped_empty_rows: skipped };
}
