import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const legacyCss = readFileSync(new URL("../aghbari.css", import.meta.url), "utf8");
const themeCss = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

describe("Aghbari legacy dashboard/storefront theme integration", () => {
  it("loads legacy surfaces through the canonical design system", () => {
    expect(themeCss).toContain('@import "./aghbari.css";');
    expect(themeCss).toContain("--aghbari-brand: var(--primary);");
    expect(themeCss).toContain("--aghbari-surface: var(--card);");
    expect(themeCss).toContain("--aghbari-text-muted: var(--muted-foreground);");
    expect(themeCss).toContain("--aghbari-border: var(--border);");
  });

  it("provides mode-aware brand surfaces and foregrounds for interactive controls", () => {
    expect(themeCss).toContain("--aghbari-brand-surface: var(--primary);");
    expect(themeCss).toContain("--aghbari-brand-surface: var(--primary-foreground);");
    expect(legacyCss).toContain("background: var(--aghbari-brand-surface)");
    expect(legacyCss).toContain("color: var(--primary-foreground)");
  });

  it("uses semantic values for recurring brand, neutral surface, text and border tokens", () => {
    expect(legacyCss).toContain("var(--aghbari-brand)");
    expect(legacyCss).toContain("var(--aghbari-surface)");
    expect(legacyCss).toContain("var(--aghbari-text)");
    expect(legacyCss).toContain("var(--aghbari-border)");
    expect(legacyCss).not.toMatch(/(?:^|[;{]\s*)background(?:-color)?\s*:\s*#(?:fff|f4f8f9|f3f8f9|087f8d|087f8e|0b97a5|0eaa97|0d9d89)\b/i);
    expect(legacyCss).not.toMatch(/(?:^|[;{]\s*)color\s*:\s*#(?:087f8d|087f8e|0b97a5|0eaa97|0d9d89|153640|163f49|193f49)\b/i);
  });
});
