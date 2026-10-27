import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
const manifest = JSON.parse(readFileSync(resolve(process.cwd(), "public/manifest.webmanifest"), "utf8")) as {
  theme_color?: unknown;
  background_color?: unknown;
};

describe("Aghbari semantic design tokens", () => {
  it("uses forest green for primary actions and warm ivory for light surfaces", () => {
    expect(stylesheet).toContain("--background: oklch(0.99 0.012 96);");
    expect(stylesheet).toContain("--foreground: oklch(0.23 0.035 155);");
    expect(stylesheet).toContain("--primary: oklch(0.34 0.075 155);");
    expect(stylesheet).toContain("--primary-foreground: oklch(0.99 0.008 96);");
    expect(stylesheet).toContain("--secondary: oklch(0.94 0.035 150);");
    expect(stylesheet).toContain("--accent: oklch(0.92 0.07 88);");
    expect(stylesheet).toContain("--accent-foreground: oklch(0.27 0.05 80);");
  });

  it("defines a matching readable dark theme and PWA shell palette", () => {
    expect(stylesheet).toContain("--background: oklch(0.18 0.025 155);");
    expect(stylesheet).toContain("--foreground: oklch(0.96 0.012 96);");
    expect(stylesheet).toContain("--primary: oklch(0.68 0.12 150);");
    expect(manifest.theme_color).toBe("#14532d");
    expect(manifest.background_color).toBe("#fffdf5");
  });
});
