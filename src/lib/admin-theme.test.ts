import { describe, expect, it } from "vitest";
import {
  ADMIN_THEME_PRESETS,
  DEFAULT_ADMIN_THEME_PALETTE,
  getAdminThemeCssVariables,
  getAdminThemeTextColor,
  isAdminThemeColor,
  resolveAdminThemePalette,
} from "./admin-theme";

describe("organization admin theme palette", () => {
  it("ships with the Aghbari forest-green and gold identity", () => {
    expect(DEFAULT_ADMIN_THEME_PALETTE).toEqual({
      id: "aghbari",
      primary: "#1f563d",
      accent: "#c5a45c",
    });
  });

  it("offers distinct, valid reference-aligned presets", () => {
    expect(ADMIN_THEME_PRESETS).toHaveLength(3);
    for (const preset of ADMIN_THEME_PRESETS) {
      expect(isAdminThemeColor(preset.primary)).toBe(true);
      expect(isAdminThemeColor(preset.accent)).toBe(true);
    }
  });

  it("restores a selected stored preset", () => {
    expect(resolveAdminThemePalette(ADMIN_THEME_PRESETS[1])).toEqual({
      id: "turquoise",
      primary: "#087f8d",
      accent: "#0eaa97",
    });
  });

  it("supports legacy organization color rows without losing existing settings", () => {
    expect(resolveAdminThemePalette(null, "#123456", "#abcdef")).toEqual({
      id: "custom",
      primary: "#123456",
      accent: "#abcdef",
    });
  });

  it("rejects malformed stored colors and safely falls back", () => {
    expect(resolveAdminThemePalette(
      { id: "custom", primary: "url(javascript:alert(1))", accent: "#abc" },
      "rgb(0,0,0)",
      "#badbad",
    )).toEqual({
      id: "custom",
      primary: DEFAULT_ADMIN_THEME_PALETTE.primary,
      accent: "#badbad",
    });
    expect(isAdminThemeColor("#123456")).toBe(true);
    expect(isAdminThemeColor("#123")).toBe(false);
    expect(isAdminThemeColor("red")).toBe(false);
  });

  it("selects readable foreground colors for both light and dark surfaces", () => {
    expect(getAdminThemeTextColor("#000000")).toBe("#ffffff");
    expect(getAdminThemeTextColor("#ffffff")).toBe("#10231b");
    expect(getAdminThemeTextColor("#c5a45c")).toBe("#10231b");
  });

  it("maps the palette to the live design-system variables", () => {
    const variables = getAdminThemeCssVariables(DEFAULT_ADMIN_THEME_PALETTE);
    expect(variables["--primary"]).toBe("#1f563d");
    expect(variables["--accent"]).toBe("#c5a45c");
    expect(variables["--ring"]).toBe("#1f563d");
    expect(variables["--sidebar-accent"]).toBe("#c5a45c");
  });
});
