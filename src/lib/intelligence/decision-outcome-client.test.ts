import { beforeEach, describe, expect, it, vi } from "vitest";
import { commandDecisionOutcome, createDecisionOutcomeProposal, fetchDecisionOutcomes } from "./decision-outcome-client";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

const outcome = {
  id: "11111111-1111-4111-8111-111111111111",
  candidateId: "cashflow.expected_collections:YER:2026-10-31:2026-11-30",
  ruleId: "cashflow.collection.followup",
  ruleVersion: "1.0.0",
  state: "PROPOSED",
  version: 1,
  proposedBy: { id: "22222222-2222-4222-8222-222222222222" },
  owner: { id: "22222222-2222-4222-8222-222222222222", label: "مدير المالية" },
  expectedOutcome: "إتمام متابعة التحصيل",
  reason: "مطلوب متابعة",
  createdAt: "2026-10-31T10:00:00.000Z",
  updatedAt: "2026-10-31T10:00:00.000Z",
  approvedAt: null,
  approvedBy: null,
  assignedAt: null,
  executedAt: null,
  measuredOutcome: null,
  eventCount: 1,
  history: [{
    id: "create-event",
    type: "CREATE",
    version: 1,
    actor: { id: "22222222-2222-4222-8222-222222222222", role: "admin" },
    at: "2026-10-31T10:00:00.000Z",
    reason: "مطلوب متابعة",
    owner: "22222222-2222-4222-8222-222222222222",
    idempotencyKey: "create-key",
  }],
};
const proof = {
  metricKey: "cashflow.expected_collections" as const,
  value: 375, unit: "CURRENCY" as const, currency: "YER",
  status: "VERIFIED" as const, completeness: "COMPLETE" as const, quality: "ACCEPTABLE" as const,
  period: { from: "2026-10-31", to: "2026-11-30" }, asOf: "2026-10-31T09:00:00.000Z",
  formulaId: "nasr1.receivables-outstanding", formulaVersion: "1", evidenceIds: ["invoice:one"],
};

describe("persisted decision outcome client", () => {
  beforeEach(() => rpc.mockReset());

  it("fetches only the server-authorized outcome list and strictly projects records", async () => {
    rpc.mockResolvedValue({ data: { items: [outcome], total: 1 }, error: null });
    const result = await fetchDecisionOutcomes();
    expect(rpc).toHaveBeenCalledWith("fetch_decision_outcomes", { p_limit: 50, p_offset: 0 });
    expect(result).toMatchObject({ ok: true, total: 1, items: [{ id: outcome.id, state: "PROPOSED", ownerLabel: "مدير المالية" }] });
  });

  it("creates a proposal with a server-generated idempotency key and no tenant selector", async () => {
    rpc.mockResolvedValue({ data: { ok: true, duplicate: false, outcome }, error: null });
    const result = await createDecisionOutcomeProposal({
      candidateId: outcome.candidateId, ruleId: outcome.ruleId, ruleVersion: outcome.ruleVersion,
      ownerProfileId: "22222222-2222-4222-8222-222222222222",
      expectedOutcome: outcome.expectedOutcome, reason: "مطلوب متابعة",
    });
    expect(rpc).toHaveBeenCalledWith("create_decision_outcome_proposal", expect.objectContaining({
      p_candidate_id: outcome.candidateId,
      p_owner_profile_id: "22222222-2222-4222-8222-222222222222",
      p_expected_outcome: outcome.expectedOutcome,
    }));
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("p_organization_id");
    expect(rpc.mock.calls[0][1].p_idempotency_key).toEqual(expect.any(String));
    expect(result).toMatchObject({ ok: true, duplicate: false });
  });

  it("uses optimistic version and sends only the server-derived metric proof", async () => {
    rpc.mockResolvedValue({ data: { ok: true, duplicate: false, outcome: { ...outcome, state: "MEASURED", version: 7 } }, error: null });
    const result = await commandDecisionOutcome({
      outcomeId: outcome.id, expectedVersion: 6, eventType: "MEASURE",
      measuredOutcome: { ...proof, measuredAt: "2026-10-31T10:00:00.000Z" },
    });
    expect(rpc).toHaveBeenCalledWith("command_decision_outcome", expect.objectContaining({
      p_outcome_id: outcome.id, p_expected_version: 6, p_event_type: "MEASURE",
      p_measured_outcome: expect.objectContaining({ value: 375, currency: "YER", evidenceIds: ["invoice:one"] }),
    }));
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("p_organization_id");
    expect(result).toMatchObject({ ok: true, outcome: { state: "MEASURED", version: 7 } });
  });

  it("maps stale versions and role denial to safe UI results", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "40001", message: "internal detail" } });
    expect(await commandDecisionOutcome({ outcomeId: outcome.id, expectedVersion: 1, eventType: "SUBMIT_FOR_REVIEW" }))
      .toMatchObject({ ok: false, status: "STALE" });
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "internal detail" } });
    expect(await fetchDecisionOutcomes()).toMatchObject({ ok: false, status: "DENIED" });
  });
});
