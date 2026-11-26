import { describe, expect, it } from "vitest";
import {
  createDecisionOutcome,
  transitionDecisionOutcome,
  type DecisionOutcomeEvent,
  type DecisionOutcomeEventType,
} from "./decision-outcome";
import type { DecisionMeasuredOutcome, DecisionOutcome } from "./types";

const actor = { id: "profile-manager", role: "manager" };
const createdAt = "2026-11-26T00:00:00.000Z";

function outcome(): DecisionOutcome {
  return createDecisionOutcome({
    id: "outcome-1",
    candidateId: "decision-1",
    proposedBy: actor,
    owner: "operations",
    expectedOutcome: "معالجة الخطر التشغيلي المثبت",
    createdAt,
  });
}

function event(type: DecisionOutcomeEventType, overrides: Partial<DecisionOutcomeEvent> = {}): DecisionOutcomeEvent {
  const defaults: DecisionOutcomeEvent = {
    id: "event-" + type.toLowerCase(),
    idempotencyKey: "idem-" + type.toLowerCase(),
    type,
    actor,
    at: "2026-11-26T00:10:00.000Z",
  };
  return { ...defaults, ...overrides };
}

function apply(current: DecisionOutcome, nextEvent: DecisionOutcomeEvent): DecisionOutcome {
  const result = transitionDecisionOutcome(current, nextEvent);
  if (!result.ok) throw new Error("unexpected decision transition: " + result.reason);
  return result.outcome;
}

function executedOutcome(): DecisionOutcome {
  let current = outcome();
  current = apply(current, event("SUBMIT_FOR_REVIEW"));
  current = apply(current, event("APPROVE", { reason: "تمت مراجعة الدليل" }));
  current = apply(current, event("ASSIGN", { owner: "warehouse_manager" }));
  current = apply(current, event("START_EXECUTION"));
  current = apply(current, event("COMPLETE_EXECUTION"));
  return current;
}

function measurement(overrides: Partial<DecisionMeasuredOutcome> = {}): DecisionMeasuredOutcome {
  return {
    metricKey: "sales.net",
    value: 125.5,
    unit: "CURRENCY",
    currency: "YER",
    status: "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    period: { from: "2026-11-01", to: "2026-11-25" },
    asOf: "2026-11-25T23:00:00.000Z",
    formulaId: "sales.net",
    formulaVersion: "1.0.0",
    measuredAt: "2026-11-26T00:05:00.000Z",
    evidenceIds: ["evidence:sales-net"],
    ...overrides,
  };
}

describe("decision outcome transition policy", () => {
  it("creates a version-one proposed outcome with an empty immutable history", () => {
    const result = outcome();
    expect(result).toMatchObject({
      state: "PROPOSED",
      version: 1,
      candidateId: "decision-1",
      approvedAt: null,
      assignedAt: null,
      executedAt: null,
      measuredOutcome: null,
      eventKeys: [],
      history: [],
    });
  });

  it("rejects impossible creation timestamps", () => {
    expect(() => createDecisionOutcome({
      id: "outcome-bad-date",
      candidateId: "decision-1",
      proposedBy: actor,
      owner: "operations",
      expectedOutcome: "نتيجة متوقعة",
      createdAt: "2026-02-31T12:00:00.000Z",
    })).toThrow("invalid_decision_outcome");
  });

  it("rejects an event dated before the outcome was created", () => {
    const current = outcome();
    const result = transitionDecisionOutcome(current, event("SUBMIT_FOR_REVIEW", {
      at: "2026-11-25T23:59:59.000Z",
    }));
    expect(result).toMatchObject({ ok: false, reason: "INVALID_EVENT" });
    expect(current).toMatchObject({ state: "PROPOSED", version: 1, history: [] });
  });

  it("rejects out-of-order events after an earlier transition has been recorded", () => {
    const submitted = apply(outcome(), event("SUBMIT_FOR_REVIEW", {
      at: "2026-11-26T00:20:00.000Z",
    }));
    const result = transitionDecisionOutcome(submitted, event("APPROVE", {
      id: "event-approve-early",
      at: "2026-11-26T00:15:00.000Z",
      reason: "موافقة",
    }));
    expect(result).toMatchObject({ ok: false, reason: "INVALID_EVENT" });
    expect(submitted).toMatchObject({ state: "IN_REVIEW", version: 2, history: [{ type: "SUBMIT_FOR_REVIEW" }] });
  });

  it("does not accept an event id reused with another idempotency key", () => {
    const submitted = apply(outcome(), event("SUBMIT_FOR_REVIEW", { id: "shared-event-id" }));
    const result = transitionDecisionOutcome(submitted, event("APPROVE", {
      id: "shared-event-id",
      idempotencyKey: "different-key",
      reason: "موافقة",
      at: "2026-11-26T00:11:00.000Z",
    }));
    expect(result).toMatchObject({ ok: false, reason: "INVALID_EVENT" });
  });

  it("returns the original outcome for an exact idempotent retry", () => {
    const current = outcome();
    const submittedEvent = event("SUBMIT_FOR_REVIEW");
    const first = transitionDecisionOutcome(current, submittedEvent);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const retry = transitionDecisionOutcome(first.outcome, submittedEvent);
    expect(retry).toEqual({ ok: true, outcome: first.outcome, duplicate: true });
  });

  it("rejects reuse of an idempotency key when the event content changes", () => {
    const first = transitionDecisionOutcome(outcome(), event("SUBMIT_FOR_REVIEW"));
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const conflict = transitionDecisionOutcome(first.outcome, event("SUBMIT_FOR_REVIEW", {
      id: "another-event-id",
      reason: "تم تغيير المحتوى",
    }));
    expect(conflict).toMatchObject({ ok: false, reason: "IDEMPOTENCY_CONFLICT" });
  });

  it("rejects an idempotent retry that reuses the actor id with a different role", () => {
    const current = outcome();
    const submittedEvent = event("SUBMIT_FOR_REVIEW");
    const first = transitionDecisionOutcome(current, submittedEvent);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const retry = transitionDecisionOutcome(first.outcome, event("SUBMIT_FOR_REVIEW", {
      actor: { id: submittedEvent.actor.id, role: "staff" },
    }));
    expect(retry).toMatchObject({ ok: false, reason: "IDEMPOTENCY_CONFLICT" });
  });

  it("requires a reason for approval and an owner for assignment", () => {
    const submitted = apply(outcome(), event("SUBMIT_FOR_REVIEW"));
    expect(transitionDecisionOutcome(submitted, event("APPROVE"))).toMatchObject({
      ok: false,
      reason: "MISSING_REASON",
    });

    const approved = apply(submitted, event("APPROVE", { reason: "قرار مراجع" }));
    expect(transitionDecisionOutcome(approved, event("ASSIGN"))).toMatchObject({
      ok: false,
      reason: "MISSING_OWNER",
    });
  });

  it("completes the reviewed, approved, assigned and measured lifecycle", () => {
    const current = executedOutcome();
    const measured = transitionDecisionOutcome(current, event("MEASURE", {
      at: "2026-11-26T00:10:00.000Z",
      measuredOutcome: measurement(),
    }));

    expect(measured).toMatchObject({
      ok: true,
      duplicate: false,
      outcome: {
        state: "MEASURED",
        version: 7,
        measuredOutcome: { metricKey: "sales.net", value: 125.5, currency: "YER" },
      },
    });
  });

  it("withholds an impossible measurement period", () => {
    const result = transitionDecisionOutcome(executedOutcome(), event("MEASURE", {
      measuredOutcome: measurement({ period: { from: "2026-02-31", to: "2026-03-10" } }),
    }));
    expect(result).toMatchObject({ ok: false, reason: "INVALID_MEASUREMENT" });
  });

  it("withholds measurement values outside the safe numeric range", () => {
    const result = transitionDecisionOutcome(executedOutcome(), event("MEASURE", {
      measuredOutcome: measurement({ value: Number.MAX_SAFE_INTEGER + 1 }),
    }));
    expect(result).toMatchObject({ ok: false, reason: "INVALID_MEASUREMENT" });
  });

  it("requires non-negative whole numbers for count measurements", () => {
    const fractional = transitionDecisionOutcome(executedOutcome(), event("MEASURE", {
      measuredOutcome: measurement({ unit: "COUNT", currency: undefined, value: 1.5 }),
    }));
    const negative = transitionDecisionOutcome(executedOutcome(), event("MEASURE", {
      measuredOutcome: measurement({ unit: "COUNT", currency: undefined, value: -1 }),
    }));
    expect(fractional).toMatchObject({ ok: false, reason: "INVALID_MEASUREMENT" });
    expect(negative).toMatchObject({ ok: false, reason: "INVALID_MEASUREMENT" });
  });

  it("does not accept a measurement recorded after its transition event", () => {
    const result = transitionDecisionOutcome(executedOutcome(), event("MEASURE", {
      at: "2026-11-26T00:10:00.000Z",
      measuredOutcome: measurement({ measuredAt: "2026-11-26T00:11:00.000Z" }),
    }));
    expect(result).toMatchObject({ ok: false, reason: "INVALID_MEASUREMENT" });
  });
});
