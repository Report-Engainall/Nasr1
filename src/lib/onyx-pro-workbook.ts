import { ONYX_PRO_DATASETS, getOnyxProHeaders } from "./onyx-pro-schema";
import { xmlEscape, worksheetXml, zipStore, type CellValue } from "./onyx-export";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_WORKBOOK_DATA_ROWS = 10_000;

// A live export allowlist is intentionally narrower than the Onyx import/template schema.
// Those schemas describe fields that may exist in source workbooks, not fields that may leave
// Aghbari. Never export internal costs, tier prices, balances, credit limits or account IDs.
const ONYX_PRO_LIVE_EXPORT_FIELDS: Readonly<Record<string, readonly string[]>> = {
  products: [
    "product_id", "product_code", "sku", "barcode", "product_name", "product_name_en",
    "short_description", "description", "category_code", "category_name", "base_unit_name",
    "min_stock", "reorder_point", "is_active", "product_status", "image_url", "created_at", "updated_at",
  ],
  customers: [
    "customer_id", "customer_code", "customer_name", "business_name", "phone", "email",
    "price_level_code", "customer_status", "created_at",
  ],
};

function getOnyxLiveExportFields(datasetId: string): Set<string> {
  const fields = ONYX_PRO_LIVE_EXPORT_FIELDS[datasetId];
  if (!fields) {
    throw new Error("لا يتوفر تصدير سجلات حية آمن لمجموعة " + datasetId + "؛ يبقى قالبها متاحاً.");
  }
  return new Set(fields);
}

function getOnyxLiveExportFieldDefinitions(datasetId: string) {
  const dataset = ONYX_PRO_DATASETS.find((item) => item.id === datasetId);
  if (!dataset) throw new Error("نوع بيانات أونكس غير معروف: " + datasetId);
  const allowed = getOnyxLiveExportFields(datasetId);
  return dataset.fields.filter((field) => allowed.has(field.field));
}

/** Safe column headings for live exports; never reuse the broader import-template headings. */
export function getOnyxProLiveHeaders(datasetId: string): string[] {
  return getOnyxLiveExportFieldDefinitions(datasetId).map((field) => field.header);
}

export type OnyxProWorkbookRows = Readonly<{
  [datasetId: string]: readonly Readonly<Record<string, CellValue>>[] | undefined;
}>;

function resolveDatasets(datasetIds: readonly string[]) {
  if (!Array.isArray(datasetIds) || datasetIds.length === 0 || datasetIds.length > ONYX_PRO_DATASETS.length) {
    throw new Error("اختر نوع بيانات واحداً على الأقل لإنشاء ملف أونكس.");
  }
  const uniqueIds = [...new Set(datasetIds)];
  if (uniqueIds.length !== datasetIds.length) throw new Error("لا يمكن تكرار ورقة البيانات داخل الملف.");

  const datasets = uniqueIds.map((id) => {
    const dataset = ONYX_PRO_DATASETS.find((item) => item.id === id);
    if (!dataset) throw new Error("نوع بيانات أونكس غير معروف: " + id);
    if (dataset.sheetName.length > 31 || /[\\/*?:\[\]]/.test(dataset.sheetName)) {
      throw new Error("اسم ورقة Excel غير صالح: " + dataset.sheetName);
    }
    return dataset;
  });
  if (new Set(datasets.map((item) => item.sheetName.toLocaleLowerCase("en"))).size !== datasets.length) {
    throw new Error("أسماء أوراق Excel يجب أن تكون فريدة.");
  }
  return datasets;
}

function safeCell(value: unknown): CellValue {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    if (value.length > 32_767) throw new Error("تجاوز أحد الحقول حد Excel الأقصى البالغ 32,767 حرفاً.");
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error("تحتوي بيانات التصدير على قيمة غير صالحة؛ لم يُنشأ ملف ناقص.");
}

function rowsForDataset(
  datasetId: string,
  records: readonly Readonly<Record<string, CellValue>>[],
): CellValue[][] {
  if (!Array.isArray(records) || records.length > MAX_WORKBOOK_DATA_ROWS) {
    throw new Error("يتجاوز عدد صفوف " + datasetId + " حد ملف Excel الآمن.");
  }
  const fields = getOnyxLiveExportFieldDefinitions(datasetId);

  return [
    fields.map((field) => field.header),
    ...records.map((record) => {
      if (!record || typeof record !== "object" || Array.isArray(record)) {
        throw new Error("يوجد صف غير صالح داخل مجموعة " + datasetId + ".");
      }
      const allowed = new Set(fields.map((field) => field.field));
      const unexpected = Object.keys(record).find((key) => !allowed.has(key));
      if (unexpected) {
        throw new Error("حقل غير معتمد في تصدير " + datasetId + ": " + unexpected);
      }
      return fields.map((field) => safeCell(record[field.field]));
    }),
  ];
}

function createWorkbook(
  datasetIds: readonly string[],
  recordsByDataset?: OnyxProWorkbookRows,
): Uint8Array {
  const datasets = resolveDatasets(datasetIds);
  if (recordsByDataset) {
    for (const key of Object.keys(recordsByDataset)) {
      if (!datasets.some((dataset) => dataset.id === key)) {
        throw new Error("تم تمرير بيانات لمجموعة غير محددة في ملف أونكس: " + key);
      }
    }
  }

  const contentOverrides = [
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    ...datasets.map((_, index) =>
      '<Override PartName="/xl/worksheets/sheet' + (index + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
    ),
  ];
  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' + contentOverrides.join("") + '</Types>';
  const rootRelationships = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';
  const sheetsXml = datasets.map((dataset, index) =>
    '<sheet name="' + xmlEscape(dataset.sheetName) + '" sheetId="' + (index + 1) + '" r:id="rId' + (index + 1) + '"/>',
  ).join("");
  const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets>' + sheetsXml + '</sheets></workbook>';
  const workbookRelationships = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    datasets.map((_, index) =>
      '<Relationship Id="rId' + (index + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (index + 1) + '.xml"/>',
    ).join("") + '</Relationships>';

  const files: Array<{ name: string; content: string }> = [
    { name: "[Content_Types].xml", content: contentTypes },
    { name: "_rels/.rels", content: rootRelationships },
    { name: "xl/workbook.xml", content: workbook },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRelationships },
  ];
  datasets.forEach((dataset, index) => {
    const rows = recordsByDataset
      ? rowsForDataset(dataset.id, recordsByDataset[dataset.id] ?? [])
      : [getOnyxProHeaders(dataset.id)];
    files.push({
      name: "xl/worksheets/sheet" + (index + 1) + ".xml",
      content: worksheetXml(rows, true),
    });
  });
  return zipStore(files);
}

/** Creates a real multi-sheet XLSX header template, with no invented business rows. */
export function buildOnyxProWorkbook(
  datasetIds: readonly string[] = ONYX_PRO_DATASETS.map((item) => item.id),
): Uint8Array {
  return createWorkbook(datasetIds);
}

/** Creates a real multi-sheet XLSX from allowlisted live records matching the canonical Onyx schema. */
export function buildOnyxProDataWorkbook(
  datasetIds: readonly string[],
  recordsByDataset: OnyxProWorkbookRows,
): Uint8Array {
  if (!recordsByDataset || typeof recordsByDataset !== "object" || Array.isArray(recordsByDataset)) {
    throw new Error("بيانات أونكس الحية غير صالحة.");
  }
  // Validate every selected live worksheet even when the current result set is empty.
  for (const datasetId of datasetIds) getOnyxLiveExportFields(datasetId);
  return createWorkbook(datasetIds, recordsByDataset);
}

function csvValue(value: CellValue): string {
  if (value === null || value === undefined) return '""';
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("تحتوي بيانات CSV على رقم غير صالح.");
    return '"' + String(value) + '"';
  }
  if (typeof value !== "string") throw new Error("تحتوي بيانات CSV على قيمة غير صالحة.");
  if (value.length > 32_767) throw new Error("تجاوز أحد الحقول حد Excel الأقصى البالغ 32,767 حرفاً.");
  const safe = /^[\u0000-\u0020]*[=+\-@]/.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}

/** Creates a live-data CSV; text cells are quoted and formula-leading values are neutralized. */
export function buildOnyxProDataCsv(
  datasetId: string,
  records: readonly Readonly<Record<string, CellValue>>[],
): string {
  if (!Array.isArray(records) || records.length > MAX_WORKBOOK_DATA_ROWS) {
    throw new Error("يتجاوز عدد صفوف CSV حد التصدير الآمن.");
  }
  const dataset = ONYX_PRO_DATASETS.find((item) => item.id === datasetId);
  if (!dataset) throw new Error("نوع بيانات أونكس غير معروف.");
  const fields = getOnyxLiveExportFieldDefinitions(datasetId);
  const allowedFields = new Set(fields.map((field) => field.field));
  const header = fields.map((field) => csvValue(field.header)).join(",");
  const dataRows = records.map((record) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new Error("يوجد صف غير صالح داخل ملف CSV.");
    }
    const unexpected = Object.keys(record).find((key) => !allowedFields.has(key));
    if (unexpected) throw new Error("حقل غير معتمد في تصدير " + datasetId + ": " + unexpected);
    return fields.map((field) => csvValue(safeCell(record[field.field]))).join(",");
  });
  return "\uFEFF" + [header, ...dataRows].join("\r\n") + "\r\n";
}

export function onyxProWorkbookFilename(): string {
  return "Aghbari-Onyx-Pro-Exchange-Template.xlsx";
}

export function onyxProDatasetCsvFilename(datasetId: string): string {
  const dataset = ONYX_PRO_DATASETS.find((item) => item.id === datasetId);
  if (!dataset) throw new Error("نوع بيانات أونكس غير معروف.");
  return "Aghbari-Onyx-" + dataset.sheetName + "-Headers.csv";
}

export function onyxProLiveWorkbookFilename(date = new Date()): string {
  return "Aghbari-Onyx-Pro-Live-Export-" + date.toISOString().slice(0, 10) + ".xlsx";
}

export function onyxProLiveDatasetCsvFilename(datasetId: string): string {
  const dataset = ONYX_PRO_DATASETS.find((item) => item.id === datasetId);
  if (!dataset) throw new Error("نوع بيانات أونكس غير معروف.");
  return "Aghbari-Onyx-" + dataset.sheetName + "-Data.csv";
}

export const ONYX_PRO_WORKBOOK_MIME = XLSX_MIME;
