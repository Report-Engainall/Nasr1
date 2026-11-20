import { ONYX_PRO_DATASETS, getOnyxProHeaders } from "./onyx-pro-schema";
import { xmlEscape, worksheetXml, zipStore, type CellValue } from "./onyx-export";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Creates a real multi-sheet XLSX header template, with no invented business rows. */
export function buildOnyxProWorkbook(datasetIds: readonly string[] = ONYX_PRO_DATASETS.map((item) => item.id)): Uint8Array {
  if (!Array.isArray(datasetIds) || datasetIds.length === 0 || datasetIds.length > ONYX_PRO_DATASETS.length) {
    throw new Error("اختر نوع بيانات واحداً على الأقل لإنشاء قالب أونكس.");
  }
  const uniqueIds = [...new Set(datasetIds)];
  if (uniqueIds.length !== datasetIds.length) throw new Error("لا يمكن تكرار ورقة البيانات داخل القالب.");
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
    const rows: CellValue[][] = [[...getOnyxProHeaders(dataset.id)]];
    files.push({
      name: "xl/worksheets/sheet" + (index + 1) + ".xml",
      content: worksheetXml(rows, true),
    });
  });
  return zipStore(files);
}

export function onyxProWorkbookFilename(): string {
  return "Aghbari-Onyx-Pro-Exchange-Template.xlsx";
}

export function onyxProDatasetCsvFilename(datasetId: string): string {
  const dataset = ONYX_PRO_DATASETS.find((item) => item.id === datasetId);
  if (!dataset) throw new Error("نوع بيانات أونكس غير معروف.");
  return "Aghbari-Onyx-" + dataset.sheetName + "-Headers.csv";
}

export const ONYX_PRO_WORKBOOK_MIME = XLSX_MIME;
