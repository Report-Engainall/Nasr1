import { describe, expect, it } from "vitest";
import { rankDailyDecisionActions } from "./daily-decisions";
import { filterAndPaginateDailyDecisionActions, normalizeDailyDecisionActionSearch } from "./daily-decision-action-queue";
import type { DailyDecisionActionEnvelope } from "./daily-decisions";
import type { DecisionCandidate, DecisionPriority } from "./types";

function action(id: string, priority: DecisionPriority = "P2", ruleId = "inventory.dead-stock.remediation", what = id): DailyDecisionActionEnvelope<{ candidateId: string }> {
  const score = priority === "P0" ? 400 : priority === "P1" ? 300 : priority === "P2" ? 200 : 100;
  const decision: DecisionCandidate = {
    id,
    ruleId,
    ruleVersion: "1.0.0",
    priority,
    priorityScore: score,
    what,
    why: "سبب موثق",
    soWhat: "الأهمية",
    impact: null,
    impactStatus: "WITHHELD",
    impactReason: "SOURCE_NOT_AVAILABLE",
    whatNext: "راجع المصدر ثم اعتمد الإجراء",
    proof: { evidenceIds: ["evidence:" + id], metricKeys: ["inventory.available"], asOf: "2026-11-28T00:00:00.000Z", formulaVersions: ["inventory.rule@1.0.0"] },
    owner: "مسؤول المتجر",
    expectedOutcome: "نتيجة قابلة للقياس",
    createdAt: "2026-11-28T00:00:00.000Z",
    expiresAt: null,
  };
  return { decision, payload: { candidateId: id } };
}

describe("daily decision action queue", () => {
  it("ranks all actions, not only the ten-card shortlist, and deduplicates stable identities", () => {
    const input = Array.from({ length: 14 }, (_, index) => action("action-" + String(index + 1).padStart(2, "0"), index < 4 ? "P1" : "P2"));
    const ranked = rankDailyDecisionActions([...input, { ...input[0], payload: { candidateId: "duplicate" } }]);
    expect(ranked).toHaveLength(14);
    expect(ranked.slice(0, 4).map(item => item.decision.priority)).toEqual(["P1", "P1", "P1", "P1"]);
    expect(ranked[13].decision.id).toBe("action-14");
  });

  it("normalizes Arabic diacritics, alef variants, ta marbuta and Arabic digits", () => {
    expect(normalizeDailyDecisionActionSearch("إِجْراء ١٢، العميلة")).toBe("اجراء 12، العميله");
  });

  it("searches the full proof and narrative and reports priority counts before the priority filter", () => {
    const actions = [
      action("customer-1", "P1", "customer.retention", "متابعة العَمِيل المتأخر"),
      action("stock-1", "P2", "inventory.dead-stock", "مراجعة الصنف الراكد"),
      action("cash-1", "P2", "cashflow.receivable", "تحصيل مستحق"),
    ];
    const result = filterAndPaginateDailyDecisionActions(actions, {
      searchText: "العميل",
      priority: "P2",
      domain: "CUSTOMER",
      requestedPage: 0,
    });
    expect(result.totalCount).toBe(0);
    expect(result.searchCount).toBe(1);
    expect(result.countsByPriority.P1).toBe(1);
  });

  it("filters by domain and priority, then clamps the requested page after a source shrink", () => {
    const actions = [
      ...Array.from({ length: 12 }, (_, index) => action("stock-" + index, "P1", "inventory.replenishment", "صنف " + index)),
      action("customer-1", "P2", "customer.retention", "متابعة العميل"),
    ];
    const first = filterAndPaginateDailyDecisionActions(actions, {
      searchText: "", priority: "P1", domain: "INVENTORY", requestedPage: 0, pageSize: 5,
    });
    expect(first.totalCount).toBe(12);
    expect(first.pageCount).toBe(3);
    expect(first.countsByPriority.P1).toBe(12);
    const last = filterAndPaginateDailyDecisionActions(actions, {
      searchText: "", priority: "P1", domain: "INVENTORY", requestedPage: 99, pageSize: 5,
    });
    expect(last.page).toBe(2);
    expect(last.items).toHaveLength(2);
    const shrunk = filterAndPaginateDailyDecisionActions(actions.slice(0, 2), {
      searchText: "", priority: "P1", domain: "INVENTORY", requestedPage: 99, pageSize: 5,
    });
    expect(shrunk.page).toBe(0);
    expect(shrunk.items).toHaveLength(2);
  });
});
