import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DecisionCandidate } from "@/lib/intelligence/types";
import { ActionCard } from "./ActionCard";

const decision: DecisionCandidate = {
 id: "decision-1",
 ruleId: "reorder-low-stock",
 ruleVersion: "1.0.0",
 priority: "P1",
 priorityScore: 80,
 what: "مراجعة الصنف منخفض المخزون",
 why: "المخزون المتاح أقل من حد إعادة الطلب.",
 soWhat: "قد يتأثر توافر الصنف للطلبات الجديدة.",
 impact: { value: 12, unit: "EA", currency: "YER", formulaId: "inventory.replenishment", formulaVersion: "1.0.0", sourceMetricIds: ["metric-1"] },
 impactStatus: "CALCULATED",
 impactReason: null,
 whatNext: "راجع حركة الصنف قبل اتخاذ قرار الشراء.",
 proof: { evidenceIds: ["evidence-1"], metricKeys: ["stock.available"], asOf: "2026-11-01T00:00:00Z", formulaVersions: ["1.0.0"] },
 owner: "مدير المخزون",
 expectedOutcome: "تأكيد التغطية دون إنشاء شراء تلقائي.",
 createdAt: "2026-11-01T00:00:00Z",
 expiresAt: null,
};

describe("ActionCard", () => {
 it.each([
  ["loading", "جارٍ تحميل القرار والأدلة…"],
  ["empty", "لا توجد قرارات مستحقة وفق المؤشرات المثبتة."],
  ["unavailable", "مصادر القرار غير متاحة. لم يتم إنشاء بيانات بديلة."],
 ] as const)("shows the %s state without a decision", (state, message) => {
  render(<ActionCard state={state} />);
  expect(screen.getByText(message)).toBeInTheDocument();
 });

 it("exposes retry only for an explicit error state", () => {
  const onRetry = vi.fn();
  render(<ActionCard state="error" errorMessage="فشل تحميل المصدر" onRetry={onRetry} />);
  fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
  expect(screen.getByRole("alert")).toHaveTextContent("فشل تحميل المصدر");
  expect(onRetry).toHaveBeenCalledTimes(1);
 });

 it("renders the evidence-backed decision and forwards the selected decision to both actions", () => {
  const onContinue = vi.fn();
  const onOpenEvidence = vi.fn();
  render(
   <ActionCard
    decision={decision}
    ctaLabel="مراجعة التوصية"
    onContinue={onContinue}
    onOpenEvidence={onOpenEvidence}
   />,
  );

  const article = screen.getByRole("article");
  expect(within(article).getByText("مراجعة الصنف منخفض المخزون")).toBeInTheDocument();
  expect(within(article).getByText("المالك: مدير المخزون")).toBeInTheDocument();
  expect(within(article).getByText(/12 EA YER/)).toBeInTheDocument();
  expect(within(article).getByText("Evidence IDs: evidence-1")).toBeInTheDocument();
  expect(within(article).getByText("Formula versions: 1.0.0")).toBeInTheDocument();

  fireEvent.click(within(article).getByRole("button", { name: "عرض الإثبات" }));
  fireEvent.click(within(article).getByRole("button", { name: "مراجعة التوصية" }));
  expect(onOpenEvidence).toHaveBeenCalledWith(decision);
  expect(onContinue).toHaveBeenCalledWith(decision);
 });

 it("keeps an unapproved impact formula distinct from a missing decision", () => {
  const withoutImpact: DecisionCandidate = {
   ...decision,
   impact: null,
   impactStatus: "NOT_CONFIGURED",
   impactReason: "NO_APPROVED_IMPACT_FORMULA",
   proof: { ...decision.proof, evidenceIds: [], formulaVersions: [], metricKeys: [] },
  };
  render(<ActionCard decision={withoutImpact} />);
  expect(screen.getByText(/لم تُهيأ معادلة أثر معتمدة/)).toBeInTheDocument();
  expect(screen.getByText("Evidence IDs: لا توجد مراجع إثبات")).toBeInTheDocument();
 });
});
