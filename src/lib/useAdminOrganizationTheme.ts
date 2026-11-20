import { useEffect } from "react";
import { fetchSettings } from "@/lib/api";
import {
  ADMIN_THEME_UPDATE_EVENT,
  getAdminThemeCssVariables,
  resolveAdminThemePalette,
} from "@/lib/admin-theme";

/**
 * Applies the authenticated organization's saved palette to the shared design
 * tokens. It intentionally reads the existing tenant-scoped admin_settings
 * source and never persists browser-local copies of private organization data.
 */
export function useAdminOrganizationTheme(enabled: boolean, scopeKey: string): void {
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;

    const root = document.documentElement;
    const previousValues = new Map<string, { value: string; priority: string }>();
    let active = true;
    let requestRevision = 0;

    const apply = async () => {
      const request = ++requestRevision;
      try {
        const settings = await fetchSettings();
        if (!active || request !== requestRevision) return;

        const values: Record<string, unknown> = {};
        for (const setting of settings) values[setting.key] = setting.value;
        const palette = resolveAdminThemePalette(
          values.theme_palette,
          values.theme_primary,
          values.theme_accent,
        );

        for (const [name, value] of Object.entries(getAdminThemeCssVariables(palette))) {
          if (!previousValues.has(name)) {
            previousValues.set(name, {
              value: root.style.getPropertyValue(name),
              priority: root.style.getPropertyPriority(name),
            });
          }
          root.style.setProperty(name, value);
        }
      } catch {
        // A theme preference is optional: preserve the canonical CSS defaults
        // when the tenant settings source is unavailable.
      }
    };

    const onThemeUpdated = () => {
      void apply();
    };

    window.addEventListener(ADMIN_THEME_UPDATE_EVENT, onThemeUpdated);
    void apply();

    return () => {
      active = false;
      requestRevision += 1;
      window.removeEventListener(ADMIN_THEME_UPDATE_EVENT, onThemeUpdated);
      for (const [name, previous] of previousValues) {
        if (previous.value) root.style.setProperty(name, previous.value, previous.priority);
        else root.style.removeProperty(name);
      }
    };
  }, [enabled, scopeKey]);
}
