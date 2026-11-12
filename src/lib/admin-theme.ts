export type AdminThemePresetId = "aghbari" | "turquoise" | "ocean" | "custom";

export type AdminThemePalette = {
  id: AdminThemePresetId;
  primary: string;
  accent: string;
};

export type AdminThemePreset = AdminThemePalette & {
  label: string;
  description: string;
};

export const ADMIN_THEME_UPDATE_EVENT = "aghbari:admin-theme-updated";

export const ADMIN_THEME_PRESETS: readonly AdminThemePreset[] = [
  {
    id: "aghbari",
    label: "هوية الأغبري",
    description: "أخضر مؤسسي وذهبي هادئ",
    primary: "#1f563d",
    accent: "#c5a45c",
  },
  {
    id: "turquoise",
    label: "أخضر بحري",
    description: "تركوازي متوازن ولمسة خضراء",
    primary: "#087f8d",
    accent: "#0eaa97",
  },
  {
    id: "ocean",
    label: "أزرق المحيط",
    description: "أزرق واضح مع تركوازي",
    primary: "#1e4f78",
    accent: "#3a9fbf",
  },
] as const;

export const DEFAULT_ADMIN_THEME_PALETTE: AdminThemePalette = {
  id: "aghbari",
  primary: "#1f563d",
  accent: "#c5a45c",
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isAdminThemeColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR.test(value);
}

function matchingPreset(primary: string, accent: string): AdminThemePreset | undefined {
  return ADMIN_THEME_PRESETS.find(
    (preset) => preset.primary.toLowerCase() === primary.toLowerCase() &&
      preset.accent.toLowerCase() === accent.toLowerCase(),
  );
}

/**
 * Resolve the current organization palette. Older installations may still only
 * have theme_primary/theme_accent rows, so retain them as a read-only fallback.
 */
export function resolveAdminThemePalette(
  storedPalette: unknown,
  legacyPrimary?: unknown,
  legacyAccent?: unknown,
): AdminThemePalette {
  const stored = isRecord(storedPalette) ? storedPalette : {};
  const primary = isAdminThemeColor(stored.primary)
    ? stored.primary
    : isAdminThemeColor(legacyPrimary)
      ? legacyPrimary
      : DEFAULT_ADMIN_THEME_PALETTE.primary;
  const accent = isAdminThemeColor(stored.accent)
    ? stored.accent
    : isAdminThemeColor(legacyAccent)
      ? legacyAccent
      : DEFAULT_ADMIN_THEME_PALETTE.accent;
  const preset = matchingPreset(primary, accent);

  return {
    id: preset?.id ?? "custom",
    primary,
    accent,
  };
}

function relativeLuminance(hex: string): number {
  const rgb = hex.slice(1).match(/.{2}/g);
  if (!rgb || rgb.length !== 3) return 0;

  const linear = rgb.map((part) => {
    const channel = Number.parseInt(part, 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/** Choose the higher-contrast foreground for a validated six-digit hex color. */
export function getAdminThemeTextColor(background: string): "#ffffff" | "#10231b" {
  if (!isAdminThemeColor(background)) return "#10231b";
  const luminance = relativeLuminance(background);
  const whiteContrast = 1.05 / (luminance + 0.05);
  const darkContrast = (luminance + 0.05) / 0.05;
  return whiteContrast >= darkContrast ? "#ffffff" : "#10231b";
}

export function getAdminThemeCssVariables(palette: AdminThemePalette): Record<string, string> {
  const primaryForeground = getAdminThemeTextColor(palette.primary);
  const accentForeground = getAdminThemeTextColor(palette.accent);

  return {
    "--primary": palette.primary,
    "--primary-foreground": primaryForeground,
    "--accent": palette.accent,
    "--accent-foreground": accentForeground,
    "--ring": palette.primary,
    "--sidebar-primary": palette.primary,
    "--sidebar-primary-foreground": primaryForeground,
    "--sidebar-accent": palette.accent,
    "--sidebar-accent-foreground": accentForeground,
    "--sidebar-ring": palette.primary,
  };
}
