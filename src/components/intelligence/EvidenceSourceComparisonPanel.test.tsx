import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { EvidenceSourceComparisonPanel } from "./EvidenceSourceComparisonPanel";

describe("Evidence source comparison panel integration", () => {
  it("does not display a difference or percentage without an authorized source pair", () => {
    const markup = renderToStaticMarkup(
      createElement(EvidenceSourceComparisonPanel, { comparison: null, state: "unavailable" }),
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain("مصدر المقارنة غير متاح؛ لم تُعرض قيم بديلة.");
    expect(markup).not.toContain("الفرق المحسوب");
    expect(markup).not.toContain("نسبة التغير");
  });

  it("exposes an explicit retry control for a source-reader error", () => {
    const onRetry = vi.fn();
    const markup = renderToStaticMarkup(
      createElement(EvidenceSourceComparisonPanel, {
        comparison: null,
        state: "error",
        errorMessage: "تعذر تحميل المصدر.",
        onRetry,
      }),
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("تعذر تحميل المصدر.");
    expect(markup).toContain('type="button"');
    expect(markup).toContain("إعادة المحاولة");
  });

  it("is mounted exactly once in the existing workspace and remains fail-closed", () => {
    const workspace = readFileSync(new URL("./IntelligenceWorkspace.tsx", import.meta.url), "utf8");

    expect(workspace).toContain("  EvidenceSourceComparisonPanel,");
    expect(workspace.split("<EvidenceSourceComparisonPanel")).toHaveLength(2);
    expect(workspace).toContain("comparison={null}");
    expect(workspace).toContain(
      'state={loading ? "loading" : result && !result.ok ? "error" : "unavailable"}',
    );
    expect(workspace).toContain("لا توجد حتى الآن لقطتان مستقلتان من مصدرين مصرح بهما للمؤسسة");
  });
});
