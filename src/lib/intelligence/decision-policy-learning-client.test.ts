import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  commandDecisionPolicyLearningCandidate,
  createDecisionPolicyLearningCandidate,
  fetchDecisionPolicyLearningCandidates,
} from "./decision-policy-learning-client";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

const actorId = "22222222-2222-4222-8222-222222222222";
const candidateId = "33333333-3333-4333-8333-333333333333";
const decisionId = "44444444-4444-4444-8444-444444444444";
const timestamp = "2026-11-17T01:00:00.000Z";

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    id: candidateId,
    ruleId: "cashflow.collection.followup",
    baseProfileVersion: "1.0.0",
    candidateVersion: 2,
    state: "DRAFT",
    version: 1,
    createdByProfileId: actorId,
    createdByRole: "manager",
    submittedByProfileId: null,
    submittedAt: null,
    reviewedByProfileId: null,
    reviewedAt: null,
    reviewReason: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    candidateSnapshot: {
      schemaVersion: "1.0.0",
      purpose: "CALIBRATION_REVIEW_ONLY_NOT_ACTIVE",
      ruleId: "cashflow.collection.followup",
      baseProfileVersion: "1.0.0",
      candidateVersion: 2,
      metricContext: {
        metricKey: "receivables.outstanding",
        unit: "CURRENCY",
        currency: "YER",
        unitOfMeasure: null,
        period: { from: "2026-11-17", to: "2026-12-17" },
        formulaId: "nasr1.receivables-outstanding",
        formulaVersion: "1",
      },
      sourceDecisionIds: [decisionId],
      sourceMemorySnapshots: [{
        decisionId,
        snapshotId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        version: 1,
        capturedAt: timestamp,
      }],
      observations: [{
        decisionId,
        createdAt: timestamp,
        expected: {
          metricKey: "cashflow.expected_collections", value: 200, unit: "CURRENCY",
          status: "VERIFIED", completeness: "COMPLETE", quality: "ACCEPTABLE",
          currency: "YER", unitOfMeasure: null, period: { from: "2026-11-17", to: "2026-12-17" },
          asOf: timestamp, formulaId: "nasr1.receivables-outstanding", formulaVersion: "1",
          evidenceIds: ["dmexpected:snapshot:invoice:1"],
        },
        actual: {
          metricKey: "cashflow.expected_collections", value: 180, unit: "CURRENCY",
          status: "VERIFIED", completeness: "COMPLETE", quality: "ACCEPTABLE",
          currency: "YER", unitOfMeasure: null, period: { from: "2026-11-17", to: "2026-12-17" },
          asOf: timestamp, formulaId: "nasr1.receivables-outstanding", formulaVersion: "1",
          evidenceIds: ["dmactual:snapshot:invoice:1"],
        },
        difference: -20,
        differencePercent: -10,
        lessons: ["تحسين توقيت المتابعة"],
        evidenceIds: ["dmexpected:snapshot:invoice:1", "dmactual:snapshot:invoice:1"],
      }],
      calibration: {
        sampleCount: 1, meanExpectedValue: 200, meanActualValue: 180,
        meanSignedDifference: -20, medianSignedDifference: -20, meanAbsoluteDifference: 20,
        meanAbsoluteDifferencePercent: 10, percentageSampleCount: 1, zeroBaselineCount: 0,
        aboveExpectedCount: 0, belowExpectedCount: 1, equalExpectedCount: 0,
      },
      lessons: ["تحسين توقيت المتابعة"],
      evidenceIds: ["dmexpected:snapshot:invoice:1", "dmactual:snapshot:invoice:1"],
      sourceCoverage: "SELECTED_VERIFIED_MEASUREMENTS",
      activeProfileChanged: false,
      activationInstruction: "NOT_ACTIVE_UNTIL_A_SEPARATE_EXPLICIT_PROFILE_RELEASE",
    },
    eventCount: 1,
    history: [{
      id: "55555555-5555-4555-8555-555555555555",
      type: "CREATE",
      version: 1,
      at: timestamp,
      actorProfileId: actorId,
      actorRole: "manager",
      reason: null,
    }],
    ...overrides,
  };
}

describe("decision policy learning candidate client", () => {
  beforeEach(() => rpc.mockReset());

  it("sends only the measured source decision IDs and idempotency key; the server owns tenant and calibration", async () => {
    rpc.mockResolvedValue({ data: { ok: true, duplicate: false, candidate: candidate() }, error: null });

    const result = await createDecisionPolicyLearningCandidate({
      decisionIds: [decisionId],
      idempotencyKey: "66666666-6666-4666-8666-666666666666",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.candidate.candidateVersion).toBe(2);
      expect(result.candidate.candidateSnapshot.activeProfileChanged).toBe(false);
    }
    expect(rpc).toHaveBeenCalledWith("create_decision_policy_learning_candidate", {
      p_decision_ids: [decisionId],
      p_idempotency_key: "66666666-6666-4666-8666-666666666666",
    });
  });

  it("rejects empty, oversized, malformed or duplicate source IDs before calling RPC", async () => {
    expect((await createDecisionPolicyLearningCandidate({ decisionIds: [] })).ok).toBe(false);
    expect((await createDecisionPolicyLearningCandidate({ decisionIds: ["not-a-uuid"] })).ok).toBe(false);
    expect((await createDecisionPolicyLearningCandidate({ decisionIds: [decisionId, decisionId] })).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails closed when the server omits the immutable candidate snapshot", async () => {
    rpc.mockResolvedValue({
      data: { ok: true, duplicate: false, candidate: { ...candidate(), candidateSnapshot: null } },
      error: null,
    });
    const result = await createDecisionPolicyLearningCandidate({ decisionIds: [decisionId] });
    expect(result).toMatchObject({ ok: false, status: "ERROR" });
  });

  it("submits a versioned review command and preserves the server's maker-checker denial", async () => {
    rpc.mockResolvedValueOnce({
      data: { ok: true, duplicate: false, candidate: candidate({
        state: "IN_REVIEW", version: 2, submittedByProfileId: actorId, submittedAt: timestamp,
        updatedAt: timestamp,
        eventCount: 2,
        history: [
          candidate().history[0],
          { id: "77777777-7777-4777-8777-777777777777", type: "SUBMIT_FOR_REVIEW",
            version: 2, at: timestamp, actorProfileId: actorId, actorRole: "manager", reason: "جاهز للمراجعة" },
        ],
      }) },
      error: null,
    });
    const submitted = await commandDecisionPolicyLearningCandidate({
      candidateId, expectedVersion: 1, eventType: "SUBMIT_FOR_REVIEW",
      reason: "جاهز للمراجعة", eventId: "88888888-8888-4888-8888-888888888888",
      idempotencyKey: "99999999-9999-4999-8999-999999999999",
    });
    expect(submitted.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("command_decision_policy_learning_candidate", expect.objectContaining({
      p_candidate_id: candidateId, p_expected_version: 1, p_event_type: "SUBMIT_FOR_REVIEW",
    }));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    const approval = await commandDecisionPolicyLearningCandidate({
      candidateId, expectedVersion: 2, eventType: "APPROVE", reason: "اعتماد",
    });
    expect(approval).toMatchObject({ ok: false, status: "DENIED" });
  });

  it("loads only a valid versioned tenant DTO and rejects malformed collection rows", async () => {
    rpc.mockResolvedValueOnce({ data: { items: [candidate()], total: 1 }, error: null });
    const result = await fetchDecisionPolicyLearningCandidates(25, 0);
    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("fetch_decision_policy_learning_candidates", {
      p_limit: 25, p_offset: 0,
    });

    rpc.mockResolvedValueOnce({ data: { items: [{ ...candidate(), candidateVersion: 1 }], total: 1 }, error: null });
    expect(await fetchDecisionPolicyLearningCandidates()).toMatchObject({ ok: false, status: "ERROR" });
  });
});
