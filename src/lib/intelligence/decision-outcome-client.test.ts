import { beforeEach, describe, expect, it, vi } from "vitest";
import { commandDecisionOutcome, createDecisionOutcomeProposal, deferDecisionOutcome, fetchDecisionOutcomes, resumeDeferredDecisionOutcome } from "./decision-outcome-client";

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

const fullMeasurement = {
  ...proof,
  measuredAt: "2026-10-31T10:06:00.000Z",
};
const historyEvent = (id: string, type: string, version: number, at: string, reason: string | null = null) => ({
  id,
  type,
  version,
  actor: { id: "22222222-2222-4222-8222-222222222222", role: "manager" },
  at,
  reason,
  owner: null,
  idempotencyKey: id + "-key",
});
const measuredOutcome = {
  ...outcome,
  state: "MEASURED",
  version: 7,
  updatedAt: "2026-10-31T10:06:00.000Z",
  approvedAt: "2026-10-31T10:02:00.000Z",
  approvedBy: "22222222-2222-4222-8222-222222222222",
  assignedAt: "2026-10-31T10:03:00.000Z",
  executedAt: "2026-10-31T10:05:00.000Z",
  measuredOutcome: fullMeasurement,
  eventCount: 7,
  history: [
    historyEvent("create-event", "CREATE", 1, "2026-10-31T10:00:00.000Z", "مطلوب متابعة"),
    historyEvent("submit-event", "SUBMIT_FOR_REVIEW", 2, "2026-10-31T10:01:00.000Z"),
    historyEvent("approve-event", "APPROVE", 3, "2026-10-31T10:02:00.000Z", "تمت مراجعة الدليل"),
    historyEvent("assign-event", "ASSIGN", 4, "2026-10-31T10:03:00.000Z"),
    historyEvent("start-event", "START_EXECUTION", 5, "2026-10-31T10:04:00.000Z"),
    historyEvent("complete-event", "COMPLETE_EXECUTION", 6, "2026-10-31T10:05:00.000Z"),
    historyEvent("measure-event", "MEASURE", 7, "2026-10-31T10:06:00.000Z", "تم اعتماد القياس"),
  ],
};

describe("persisted decision outcome client", () => {
  const rankedCandidateSnapshot = {
    schemaVersion: "1.0.0" as const,
    candidateId: outcome.candidateId,
    ruleId: outcome.ruleId,
    ruleVersion: outcome.ruleVersion,
    priority: "P0" as const,
    priorityScore: 400,
    what: "تحصيل مستحقات العميل",
    why: "يوجد رصيد مثبت متأخر",
    risk: "تأخر التحصيل يؤخر السيولة",
    soWhat: "تتطلب الحالة متابعة موثقة",
    whatNext: "راجع الفواتير وسجل نتيجة التواصل",
    owner: "مسؤول التحصيل",
    expectedOutcome: outcome.expectedOutcome,
    impact: null,
    impactStatus: "WITHHELD" as const,
    impactReason: "لم يثبت الأثر",
    proof: {
      evidenceIds: ["customer-invoice:11111111-1111-4111-8111-111111111111"],
      metricKeys: ["receivables.customer_overdue"],
      asOf: "2026-10-31T10:00:00.000Z",
      formulaVersions: ["receivables.customer-invoice-aging@1.0.0"],
    },
    createdAt: outcome.createdAt,
    expiresAt: null,
  };
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
    rpc.mockResolvedValue({ data: { ok: true, duplicate: false, outcome: measuredOutcome }, error: null });
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

  it("rejects an event count that does not reconcile to the full append-only history", async () => {
    rpc.mockResolvedValue({
      data: { items: [{ ...outcome, eventCount: 2 }], total: 1 },
      error: null,
    });
    expect(await fetchDecisionOutcomes()).toMatchObject({ ok: false, status: "ERROR" });
  });

  it("rejects gaps, duplicate event IDs and a terminal event inconsistent with state", async () => {
    const withGap = {
      ...outcome,
      version: 2,
      eventCount: 2,
      history: [
        outcome.history[0],
        historyEvent("submit-event", "SUBMIT_FOR_REVIEW", 3, "2026-10-31T10:01:00.000Z"),
      ],
    };
    rpc.mockResolvedValueOnce({ data: { items: [withGap], total: 1 }, error: null });
    expect(await fetchDecisionOutcomes()).toMatchObject({ ok: false, status: "ERROR" });

    const duplicateId = {
      ...outcome,
      version: 2,
      eventCount: 2,
      history: [
        outcome.history[0],
        historyEvent("create-event", "SUBMIT_FOR_REVIEW", 2, "2026-10-31T10:01:00.000Z"),
      ],
    };
    rpc.mockResolvedValueOnce({ data: { items: [duplicateId], total: 1 }, error: null });
    expect(await fetchDecisionOutcomes()).toMatchObject({ ok: false, status: "ERROR" });

    const wrongTerminalState = { ...outcome, state: "IN_REVIEW" };
    rpc.mockResolvedValueOnce({ data: { items: [wrongTerminalState], total: 1 }, error: null });
    expect(await fetchDecisionOutcomes()).toMatchObject({ ok: false, status: "ERROR" });
  });

  it("rejects a measured state with missing, malformed or unverified measurement evidence", async () => {
    const withoutMeasurement = {
      ...measuredOutcome,
      measuredOutcome: null,
    };
    rpc.mockResolvedValueOnce({ data: { items: [withoutMeasurement], total: 1 }, error: null });
    expect(await fetchDecisionOutcomes()).toMatchObject({ ok: false, status: "ERROR" });

    const malformedMeasurement = {
      ...measuredOutcome,
      measuredOutcome: { ...fullMeasurement, evidenceIds: ["invoice:one", "invoice:one"] },
    };
    rpc.mockResolvedValueOnce({ data: { items: [malformedMeasurement], total: 1 }, error: null });
    expect(await fetchDecisionOutcomes()).toMatchObject({ ok: false, status: "ERROR" });

    const unverifiedMeasurement = {
      ...measuredOutcome,
      measuredOutcome: { ...fullMeasurement, status: "UNVERIFIED" },
    };
    rpc.mockResolvedValueOnce({ data: { items: [unverifiedMeasurement], total: 1 }, error: null });
    expect(await fetchDecisionOutcomes()).toMatchObject({ ok: false, status: "ERROR" });
  });

  it("maps stale versions and role denial to safe UI results", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "40001", message: "internal detail" } });
    expect(await commandDecisionOutcome({ outcomeId: outcome.id, expectedVersion: 1, eventType: "SUBMIT_FOR_REVIEW" }))
      .toMatchObject({ ok: false, status: "STALE" });
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "internal detail" } });
    expect(await fetchDecisionOutcomes()).toMatchObject({ ok: false, status: "DENIED" });
  });
  it("defers a decision through the manager-only versioned RPC with a mandatory reason", async () => {
    const reason = "المستندات الداعمة لم تكتمل";
    const deferred = {
      ...outcome,
      state: "DEFERRED",
      updatedAt: "2026-10-31T11:00:00.000Z",
      version: 2,
      reason,
      eventCount: 2,
      history: [...outcome.history, {
        id: "defer-event",
        type: "DEFER",
        version: 2,
        actor: { id: "22222222-2222-4222-8222-222222222222", role: "admin" },
        at: "2026-10-31T11:00:00.000Z",
        reason,
        owner: null,
        idempotencyKey: "defer-key",
      }],
    };
    rpc.mockResolvedValue({ data: { ok: true, duplicate: false, outcome: deferred }, error: null });
    const result = await deferDecisionOutcome({
      outcomeId: outcome.id,
      expectedVersion: 1,
      reason,
    });
    expect(rpc).toHaveBeenCalledWith("defer_decision_outcome", expect.objectContaining({
      p_outcome_id: outcome.id,
      p_expected_version: 1,
      p_reason: reason,
    }));
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("p_organization_id");
    expect(result).toMatchObject({ ok: true, outcome: { state: "DEFERRED", version: 2, reason } });
  });

  it("parses only valid immutable candidate-priority snapshots", async () => {
    rpc.mockResolvedValueOnce({
      data: { items: [{ ...outcome, candidateSnapshot: rankedCandidateSnapshot }], total: 1 },
      error: null,
    });
    const valid = await fetchDecisionOutcomes();
    expect(valid).toMatchObject({
      ok: true,
      items: [{ candidateSnapshot: { priority: "P0", priorityScore: 400, impact: null } }],
    });

    rpc.mockResolvedValueOnce({
      data: { items: [{ ...outcome, candidateSnapshot: { ...rankedCandidateSnapshot, priority: "P4" } }], total: 1 },
      error: null,
    });
    expect(await fetchDecisionOutcomes()).toMatchObject({ ok: false, status: "ERROR" });
  });

  it("sends ranked snapshots through the atomic snapshot RPC", async () => {
    rpc.mockResolvedValueOnce({
      data: { ok: true, duplicate: false, outcome: { ...outcome, candidateSnapshot: rankedCandidateSnapshot } },
      error: null,
    });
    const result = await createDecisionOutcomeProposal({
      candidateId: outcome.candidateId,
      ruleId: outcome.ruleId,
      ruleVersion: outcome.ruleVersion,
      ownerProfileId: "22222222-2222-4222-8222-222222222222",
      expectedOutcome: outcome.expectedOutcome,
      reason: "مطلوب متابعة",
      candidateSnapshot: rankedCandidateSnapshot,
    });
    expect(rpc).toHaveBeenCalledWith("create_decision_outcome_proposal_with_snapshot", expect.objectContaining({
      p_candidate_id: outcome.candidateId,
      p_candidate_snapshot: rankedCandidateSnapshot,
    }));
    expect(result).toMatchObject({ ok: true, outcome: { candidateSnapshot: { priority: "P0" } } });
  });

  it("does not send a deferral without a meaningful reason", async () => {
    const result = await deferDecisionOutcome({
      outcomeId: outcome.id,
      expectedVersion: 1,
      reason: "  ",
    });
    expect(result).toMatchObject({ ok: false, status: "ERROR" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("resubmits a deferred decision with a new reason and expected version", async () => {
    const reason = "تم استكمال المستندات ويمكن إعادة المراجعة";
    const deferred = {
      ...outcome,
      state: "DEFERRED",
      updatedAt: "2026-10-31T11:00:00.000Z",
      version: 2,
      eventCount: 2,
      history: [...outcome.history, {
        id: "defer-event",
        type: "DEFER",
        version: 2,
        actor: { id: "22222222-2222-4222-8222-222222222222", role: "admin" },
        at: "2026-10-31T11:00:00.000Z",
        reason: "بانتظار المستندات",
        owner: null,
        idempotencyKey: "defer-key",
      }],
    };
    const resumed = {
      ...deferred,
      state: "IN_REVIEW",
      updatedAt: "2026-10-31T12:00:00.000Z",
      version: 3,
      reason,
      eventCount: 3,
      history: [...deferred.history, {
        id: "resume-event",
        type: "RESUBMIT_FOR_REVIEW",
        version: 3,
        actor: { id: "22222222-2222-4222-8222-222222222222", role: "admin" },
        at: "2026-10-31T12:00:00.000Z",
        reason,
        owner: null,
        idempotencyKey: "resume-key",
      }],
    };
    rpc.mockResolvedValue({ data: { ok: true, duplicate: false, outcome: resumed }, error: null });
    const result = await resumeDeferredDecisionOutcome({
      outcomeId: outcome.id,
      expectedVersion: 2,
      reason,
    });
    expect(rpc).toHaveBeenCalledWith("resume_deferred_decision_outcome", expect.objectContaining({
      p_outcome_id: outcome.id,
      p_expected_version: 2,
      p_reason: reason,
    }));
    expect(result).toMatchObject({ ok: true, outcome: { state: "IN_REVIEW", version: 3, reason } });
  });
});
