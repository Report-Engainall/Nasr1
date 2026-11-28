// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DailyDecisionActionQueue } from "./DailyDecisionActionQueue";
import type { DailyDecisionActionEnvelope } from "@/lib/intelligence/daily-decisions";
import type { DecisionCandidate, DecisionPriority } from "@/lib/intelligence/types";

vi.mock("./ActionCard", () => ({
  ActionCard: ({ decision, state, ctaLabel, onContinue }: {
    decision?: DecisionCandidate | null;
    state?: string;
    ctaLabel?: string;
    onContinue?: (decision: DecisionCandidate) => void;
  }) => decision ? (
    <article>
      <h4>{decision.what}</h4>
      <span>{decision.priority}</span>
      <button type="button" onClick={() => onContinue?.(decision)}>{ctaLabel}</button>
    </article>
  ) : <div role="status">{state}</div>,
}));

function makeAction(id: string, priority: DecisionPriority = "P1", domain = "inventory.dead-stock", what = id): DailyDecisionActionEnvelope<{ candidateId: string }> {
  const priorityScore = priority === "P0" ? 400 : priority === "P1" ? 300 : priority === "P2" ? 200 : 100;
  const decision: DecisionCandidate = {
    id, ruleId: domain, ruleVersion: "1.0.0", priority, priorityScore,
    what, why: "سبب", soWhat: "أهمية", impact: null, impactStatus: "WITHHELD", impactReason: "NOT_VERIFIED",
    whatNext: "مراجعة", proof: { evidenceIds: ["evidence:" + id], metricKeys: ["inventory.available"], asOf: "2026-11-28T00:00:00.000Z", formulaVersions: ["rule@1"] },
    owner: "مسؤول", expectedOutcome: "نتيجة", createdAt: "2026-11-28T00:00:00.000Z", expiresAt: null,
  };
  return { decision, payload: { candidateId: id } };
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("DailyDecisionActionQueue", () => {
  it("paginates beyond the first ten actions and preserves the complete loaded population", () => {
    const actions = Array.from({ length: 12 }, (_, index) => makeAction("action-" + (index + 1), "P1", "inventory.dead-stock", "إجراء رقم " + (index + 1)));
    render(<DailyDecisionActionQueue actions={actions} onPersist={vi.fn()} />);
    expect(screen.getByText("إجراء رقم 1")).toBeInTheDocument();
    expect(screen.queryByText("إجراء رقم 11")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    expect(screen.getByText("إجراء رقم 11")).toBeInTheDocument();
    expect(screen.getByText("إجراء رقم 12")).toBeInTheDocument();
    expect(screen.getByText("صفحة 2 من 2")).toBeInTheDocument();
  });

  it("searches Arabic narratives and reveals only matching candidates", () => {
    const actions = [
      makeAction("customer-1", "P1", "customer.retention", "متابعة العميل المتراجع"),
      makeAction("stock-1", "P2", "inventory.dead-stock", "مراجعة الصنف الراكد"),
    ];
    render(<DailyDecisionActionQueue actions={actions} onPersist={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("بحث في الإجراءات"), { target: { value: "العَمِيل" } });
    expect(screen.getByText("متابعة العميل المتراجع")).toBeInTheDocument();
    expect(screen.queryByText("مراجعة الصنف الراكد")).not.toBeInTheDocument();
  });

  it("filters by priority and business domain, and reports source omissions separately", () => {
    const actions = [
      makeAction("customer-1", "P1", "customer.retention", "متابعة العميل"),
      makeAction("stock-1", "P2", "inventory.dead-stock", "مراجعة المخزون"),
      makeAction("cash-1", "P1", "cashflow.receivable", "متابعة التحصيل"),
    ];
    render(<DailyDecisionActionQueue actions={actions} sourceOmittedCount={4} onPersist={vi.fn()} />);
    expect(screen.getByText(/لم تُحمّل 4 إجراءات إضافية/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("مجال الإجراء"), { target: { value: "CUSTOMER" } });
    fireEvent.change(screen.getByLabelText("الأولوية"), { target: { value: "P1" } });
    expect(screen.getByText("متابعة العميل")).toBeInTheDocument();
    expect(screen.queryByText("مراجعة المخزون")).not.toBeInTheDocument();
    expect(screen.queryByText("متابعة التحصيل")).not.toBeInTheDocument();
  });

  it("passes the exact selected candidate identity to the durable persistence callback", () => {
    const onPersist = vi.fn();
    const selected = makeAction("inventory-decision-1", "P1", "inventory.replenishment", "توصية توريد موثقة");
    render(<DailyDecisionActionQueue actions={[selected]} onPersist={onPersist} />);
    fireEvent.click(screen.getByRole("button", { name: "حفظ الإجراء في دورة القرارات" }));
    expect(onPersist).toHaveBeenCalledWith(selected.decision, "inventory-decision-1");
  });
});
