import { describe, expect, it } from "vitest";
import {
  AGHBARI_BRAND_NAME_AR,
  AGHBARI_BRAND_NAME_EN,
  buildAghbariDocumentTitle,
} from "./aghbari-brand";

describe("canonical Aghbari document identity", () => {
  it("uses the approved Arabic and English product names around a page descriptor", () => {
    expect(buildAghbariDocumentTitle("لوحة الإدارة ومركز التشغيل"))
      .toBe("متجر الأغبري | لوحة الإدارة ومركز التشغيل — Aghbari Commerce");
  });

  it("does not create an empty descriptor or duplicate separator", () => {
    expect(buildAghbariDocumentTitle("  "))
      .toBe("متجر الأغبري — Aghbari Commerce");
    expect(buildAghbariDocumentTitle())
      .toBe("متجر الأغبري — Aghbari Commerce");
  });

  it("trims descriptor whitespace without changing its Arabic content", () => {
    expect(buildAghbariDocumentTitle("  متجر الجملة  "))
      .toBe("متجر الأغبري | متجر الجملة — Aghbari Commerce");
  });

  it("keeps the canonical names stable", () => {
    expect(AGHBARI_BRAND_NAME_AR).toBe("متجر الأغبري");
    expect(AGHBARI_BRAND_NAME_EN).toBe("Aghbari Commerce");
  });
});
