import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUSINESS_BRAND_NAME, BUSINESS_BRAND_NAME_AR } from "@/lib/brand";

const manifest = JSON.parse(
  readFileSync(new URL("../../public/manifest.webmanifest", import.meta.url), "utf8"),
) as { name?: unknown; short_name?: unknown; description?: unknown; lang?: unknown; dir?: unknown };

describe("Aghbari PWA business identity", () => {
  it("uses the canonical brand in install metadata and the concise Arabic short name", () => {
    expect(manifest.name).toBe(BUSINESS_BRAND_NAME);
    expect(manifest.short_name).toBe(BUSINESS_BRAND_NAME_AR);
    expect(manifest.description).toContain(BUSINESS_BRAND_NAME_AR);
    expect(manifest.lang).toBe("ar");
    expect(manifest.dir).toBe("rtl");
  });
});
