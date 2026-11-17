import { describe, expect, it } from "vitest";
import { ONYX_ORDER_COLUMNS } from "./onyx-export";
import {
  ONYX_PRO_DATASETS,
  ONYX_PRO_DATASET_BY_ID,
  ONYX_PRO_HEADER_SYNONYMS,
  buildOnyxProHeaderCsv,
  getOnyxProHeaders,
} from "./onyx-pro-schema";

describe("Onyx Pro complete exchange field contract", () => {
  it("defines all requested business entities as independent worksheets", () => {
    expect(ONYX_PRO_DATASETS.map((dataset) => dataset.id)).toEqual([
      "orders", "order_lines", "products", "product_units", "customers", "warehouses",
      "stock_balances", "stock_movements", "price_lists", "price_list_lines", "promotions", "integration_mapping",
    ]);
  });

  it("keeps field keys, headers and dataset keys deterministic and unique", () => {
    for (const dataset of ONYX_PRO_DATASETS) {
      const fields = dataset.fields.map((field) => field.field);
      const headers = dataset.fields.map((field) => field.header);
      expect(dataset.sheetName.length).toBeGreaterThan(0);
      expect(dataset.fields.length).toBeGreaterThan(0);
      expect(new Set(fields).size).toBe(fields.length);
      expect(new Set(headers).size).toBe(headers.length);
      expect(fields.every((field) => /^[a-z][a-z0-9_]*$/.test(field))).toBe(true);
      expect(dataset.keyFields.length).toBeGreaterThan(0);
      for (const key of dataset.keyFields) expect(fields).toContain(key);
      for (const field of dataset.fields) expect(field.header.trim().length).toBeGreaterThan(0);
    }
  });

  it("preserves the existing exact 27-column Onyx order detail layout", () => {
    expect(getOnyxProHeaders("order_lines").slice(0, 27)).toEqual([...ONYX_ORDER_COLUMNS]);
    expect(ONYX_PRO_DATASET_BY_ID.order_lines.fields.slice(0, 27).map((field) => field.field)).toEqual([
      "item_code","product_name","unit","warehouse_name","quantity","free_quantity","unit_price","batch_number",
      "expiry_date","beneficiary_id","cost_center","project","activity","quotation_number","numeric_unit",
      "discount_1","discount_2","discount_3","discount_type","reserve_quantities","reservation_until",
      "reserved_quantity","order_number","length","width","height","count",
    ]);
  });

  it("maps each canonical field and Arabic heading in its own dataset context", () => {
    for (const dataset of ONYX_PRO_DATASETS) {
      const synonyms = getOnyxProHeaderSynonyms(dataset.id);
      for (const field of dataset.fields) {
        expect(synonyms[field.field]).toBe(field.field);
        expect(synonyms[field.header]).toBe(field.field);
      }
    }
  });

  it("omits ambiguous global aliases instead of choosing a wrong entity field", () => {
    expect(ONYX_PRO_HEADER_SYNONYMS["رقم الصنف"]).toBeUndefined();
    expect(ONYX_PRO_HEADER_SYNONYMS["البيان"]).toBeUndefined();
  });

  it("creates a UTF-8 BOM CSV header template for each dataset", () => {
    for (const dataset of ONYX_PRO_DATASETS) {
      const csv = buildOnyxProHeaderCsv(dataset.id);
      expect(csv.charCodeAt(0)).toBe(0xfeff);
      expect(csv.split("\r\n")[0]).toContain(dataset.fields[0].header);
      expect(csv.endsWith("\r\n")).toBe(true);
    }
  });

  it("rejects an unknown template type", () => {
    expect(() => getOnyxProHeaders("unknown")).toThrow("نوع بيانات أونكس غير معروف");
  });
});
