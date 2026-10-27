import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BUSINESS_BRAND_NAME, BUSINESS_BRAND_NAME_AR, BUSINESS_META_DESCRIPTION, BUSINESS_PWA_BACKGROUND_COLOR, BUSINESS_PWA_THEME_COLOR } from "@/lib/brand";

const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), "public/manifest.webmanifest"), "utf8"),
) as { name?: unknown; short_name?: unknown; description?: unknown; lang?: unknown; dir?: unknown; theme_color?: unknown; background_color?: unknown };
const rootRoute = readFileSync(resolve(process.cwd(), "src/routes/__root.tsx"), "utf8");

describe("Aghbari PWA business identity", () => {
  it("uses the canonical brand in install metadata and the concise Arabic short name", () => {
    expect(manifest.name).toBe(BUSINESS_BRAND_NAME);
    expect(manifest.short_name).toBe(BUSINESS_BRAND_NAME_AR);
    expect(manifest.description).toBe(BUSINESS_META_DESCRIPTION);
    expect(manifest.lang).toBe("ar");
    expect(manifest.dir).toBe("rtl");
    expect(manifest.theme_color).toBe(BUSINESS_PWA_THEME_COLOR);
    expect(manifest.background_color).toBe(BUSINESS_PWA_BACKGROUND_COLOR);
  });

  it("publishes the canonical brand in page, search and social metadata", () => {
    expect(rootRoute).toContain("title: BUSINESS_BRAND_NAME");
    expect(rootRoute).toContain('{ name: "description", content: BUSINESS_META_DESCRIPTION }');
    expect(rootRoute).toContain('{ name: "theme-color", content: BUSINESS_PWA_THEME_COLOR }');
    expect(rootRoute).toContain('{ property: "og:site_name", content: BUSINESS_BRAND_NAME }');
    expect(rootRoute).toContain('{ property: "og:title", content: BUSINESS_BRAND_NAME }');
    expect(rootRoute).toContain('{ name: "twitter:title", content: BUSINESS_BRAND_NAME }');
  });
});
