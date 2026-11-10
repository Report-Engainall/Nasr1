/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EvidenceSourceComparisonPanel } from "./EvidenceSourceComparisonPanel";

afterEach(cleanup);

describe("Evidence source comparison panel integration", () => {
  it("does not display a difference or percentage without an authorized source pair", () => {
    render(<EvidenceSourceComparisonPanel comparison={null} state="unavailable" />);

    expect(screen.getByRole("status").textContent).toContain(
      "مصدر المقارنة غير متاح؛ لم تُعرض قيم بديلة.",
    );
    expect(screen.queryByText("الفرق المحسوب")).toBeNull();
    expect(screen.queryByText(/نسبة التغير/)).toBeNull();
  });

  it("offers a retry action for a source-reader error", () => {
    const onRetry = vi.fn();
    render(
      <EvidenceSourceComparisonPanel
        comparison={null}
        state="error"
        errorMessage="تعذر تحميل المصدر."
        onRetry={onRetry}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("is mounted exactly once in the existing workspace and remains fail-closed", () => {
    const workspace = readFileSync(new URL("./IntelligenceWorkspace.tsx", import.meta.url), "utf8");

    expect(workspace).toContain("  EvidenceSourceComparisonPanel,");
    expect(workspace.match(/<EvidenceSourceComparisonPanel\b/g)).toHaveLength(1);
    expect(workspace).toContain("comparison={null}");
    expect(workspace).toContain(
      'state={loading ? "loading" : result && !result.ok ? "error" : "unavailable"}',
    );
    expect(workspace).toContain("لا توجد حتى الآن لقطتان مستقلتان من مصدرين مصرح بهما للمؤسسة");
  });
});
