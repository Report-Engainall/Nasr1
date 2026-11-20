// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DecisionMemoryBook } from "./DecisionMemoryBook";
import type { DecisionMemoryBookResult } from "@/lib/intelligence/decision-memory";
import type {
  DecisionPolicyLearningCandidate,
  DecisionPolicyLearningEvent,
} from "@/lib/intelligence/decision-policy-learning-client";

const { suggestions, fetchCandidates, createCandidate, commandCandidate } = vi.hoisted(() => ({
  suggestions: vi.fn(),
  fetchCandidates: vi.fn(),
  createCandidate: vi.fn(),
  commandCandidate: vi.fn(),
}));

vi.mock("@/lib/intelligence/decision-memory", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/intelligence/decision-memory")>();
  return { ...actual, buildDecisionPolicyReviewSuggestions: suggestions };
});
vi.mock("@/lib/intelligence/decision-policy-learning-client", () => ({
  fetchDecisionPolicyLearningCandidates: fetchCandidates,
  createDecisionPolicyLearningCandidate: createCandidate,
  commandDecisionPolicyLearningCandidate: commandCandidate,
}));

const actorId = "22222222-2222-4222-8222-222222222222";
const candidateId = "33333333-3333-4333-8333-333333333333";
const decisionId = "44444444-4444-4444-8444-444444444444";
const eventId = "55555555-5555-4555-8555-555555555555";
const at = "2026-11-17T01:00:00.000Z";
const period = { from: "2026-11-17", to: "2026-12-17" };

function makeEvent(type: DecisionPolicyLearningEvent["type"], version: number): DecisionPolicyLearningEvent {
  return {
    id: eventId,
    type,
    version,
    at,
    actorProfileId: actorId,
    actorRole: "manager",
    reason: type === "CREATE" ? null : "مراجعة مرشح التعلم",
  };
}
function makeCandidate(
  state: DecisionPolicyLearningCandidate["state"] = "DRAFT",
  version = 1,
): DecisionPolicyLearningCandidate {
  const history: DecisionPolicyLearningEvent[] = [makeEvent("CREATE", 1)];
  if (version >= 2) history.push(makeEvent("SUBMIT_FOR_REVIEW", 2));
  return {
    id: candidateId,
    ruleId: "cashflow.collection.followup",
    baseProfileVersion: "1.0.0",
    candidateVersion: 2,
    state,
    version,
    createdByProfileId: actorId,
    createdByRole: "manager",
    submittedByProfileId: version >= 2 ? actorId : null,
    submittedAt: version >= 2 ? at : null,
    reviewedByProfileId: state === "APPROVED" || state === "REJECTED" ? "66666666-6666-4666-8666-666666666666" : null,
    reviewedAt: state === "APPROVED" || state === "REJECTED" ? at : null,
    reviewReason: state === "APPROVED" || state === "REJECTED" ? "اعتماد للمراجعة فقط" : null,
    createdAt: at,
    updatedAt: at,
    candidateSnapshot: {
      schemaVersion: "1.0.0",
      purpose: "CALIBRATION_REVIEW_ONLY_NOT_ACTIVE",
      ruleId: "cashflow.collection.followup",
      baseProfileVersion: "1.0.0",
      candidateVersion: 2,
      metricContext: {
        metricKey: "cashflow.expected_collections",
        unit: "CURRENCY",
        currency: "YER",
        unitOfMeasure: null,
        period,
        formulaId: "nasr1.receivables-outstanding",
        formulaVersion: "1",
      },
      sourceDecisionIds: [decisionId],
      sourceMemorySnapshots: [{
        decisionId,
        snapshotId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        version: 1,
        capturedAt: at,
      }],
      observations: [{
        decisionId,
        createdAt: at,
        expected: {
          metricKey: "cashflow.expected_collections", value: 200, unit: "CURRENCY",
          status: "VERIFIED", completeness: "COMPLETE", quality: "ACCEPTABLE",
          currency: "YER", unitOfMeasure: null, period, asOf: at,
          formulaId: "nasr1.receivables-outstanding", formulaVersion: "1",
          evidenceIds: ["dmexpected:snapshot:invoice:1"],
        },
        actual: {
          metricKey: "cashflow.expected_collections", value: 180, unit: "CURRENCY",
          status: "VERIFIED", completeness: "COMPLETE", quality: "ACCEPTABLE",
          currency: "YER", unitOfMeasure: null, period, asOf: at,
          formulaId: "nasr1.receivables-outstanding", formulaVersion: "1",
          evidenceIds: ["dmactual:snapshot:invoice:1"],
        },
        difference: -20, differencePercent: -10, lessons: ["تحسين توقيت المتابعة"],
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
      activeProfileChanged: false,
      activationInstruction: "NOT_ACTIVE_UNTIL_A_SEPARATE_EXPLICIT_PROFILE_RELEASE",
      sourceCoverage: "SELECTED_VERIFIED_MEASUREMENTS",
    },
    eventCount: history.length,
    history,
  };
}
const suggestion = {
  id: "review-suggestion",
  ruleId: "cashflow.collection.followup",
  ruleVersion: "1.0.0",
  metricKey: "cashflow.expected_collections",
  unit: "CURRENCY" as const,
  currency: "YER",
  unitOfMeasure: null,
  period,
  formulaId: "nasr1.receivables-outstanding",
  formulaVersion: "1",
  status: "DRAFT_REQUIRES_HUMAN_REVIEW" as const,
  observations: [{
    decisionId,
    createdAt: at,
    expected: {
      metricKey: "cashflow.expected_collections", value: 200, unit: "CURRENCY" as const,
      currency: "YER", unitOfMeasure: null, period, asOf: at,
      formulaId: "nasr1.receivables-outstanding", formulaVersion: "1", evidenceIds: ["expected:evidence"],
    },
    actual: {
      metricKey: "cashflow.expected_collections", value: 180, unit: "CURRENCY" as const,
      currency: "YER", unitOfMeasure: null, period, asOf: at,
      formulaId: "nasr1.receivables-outstanding", formulaVersion: "1", evidenceIds: ["actual:evidence"],
    },
    difference: -20,
    differencePercent: -10,
    lessons: ["تحسين توقيت المتابعة"],
    evidenceIds: ["expected:evidence", "actual:evidence"],
  }],
  calibration: {
    sampleCount: 1, meanExpectedValue: 200, meanActualValue: 180,
    meanSignedDifference: -20, medianSignedDifference: -20,
    meanAbsoluteDifference: 20, meanAbsoluteDifferencePercent: 10,
    percentageSampleCount: 1, zeroBaselineCount: 0,
    aboveExpectedCount: 0, belowExpectedCount: 1, equalExpectedCount: 0,
  },
  lessons: ["تحسين توقيت المتابعة"],
  evidenceIds: ["expected:evidence", "actual:evidence"],
  reviewInstruction: "راجع القاعدة دون تفعيل التغيير.",
};
const emptyCompleteResult: DecisionMemoryBookResult = {
  generatedAt: at,
  policyVersion: "1.0.0",
  status: "VERIFIED",
  loadedCount: 0,
  totalCount: 0,
  completeCount: 0,
  partialCount: 0,
  measuredCount: 0,
  verifiedMeasurementCount: 0,
  correctionCount: 0,
  records: [],
  warnings: [],
};

describe("DecisionMemoryBook outcome learning controls", () => {
  beforeEach(() => {
    suggestions.mockReset().mockReturnValue([suggestion]);
    fetchCandidates.mockReset().mockResolvedValue({ ok: true, items: [], total: 0 });
    createCandidate.mockReset();
    commandCandidate.mockReset();
  });

  it("creates a server-owned Candidate v2 from the complete suggestion source IDs", async () => {
    createCandidate.mockResolvedValue({ ok: true, duplicate: false, candidate: makeCandidate() });
    render(<DecisionMemoryBook result={emptyCompleteResult} />);

    const button = await screen.findByRole("button", { name: "إنشاء مرشح تعلم من الأدلة" });
    fireEvent.click(button);

    await screen.findByText(/حُفظ مرشح جديد من الأدلة المصدرية/);
    expect(createCandidate).toHaveBeenCalledWith({ decisionIds: [decisionId] });
    expect(await screen.findByText("Candidate v2 · cashflow.collection.followup")).toBeInTheDocument();
    expect(screen.getByText(/Profile الأساسي: 1.0.0/)).toBeInTheDocument();
    const evidenceToggle=screen.getByText(/عرض القياسات المتوقعة والفعلية والأدلة/);
    fireEvent.click(evidenceToggle);
    expect(screen.getByText("القرار "+decisionId+" · "+at)).toBeInTheDocument();
  });

  it("reuses the same idempotency key when a candidate creation response is unavailable", async () => {
    createCandidate
      .mockResolvedValueOnce({ ok: false, status: "UNAVAILABLE", message: "تعذر الاتصال" })
      .mockResolvedValueOnce({ ok: true, duplicate: false, candidate: makeCandidate() });
    render(<DecisionMemoryBook result={emptyCompleteResult} />);

    const button = await screen.findByRole("button", { name: "إنشاء مرشح تعلم من الأدلة" });
    fireEvent.click(button);
    await screen.findByText("تعذر الاتصال");
    fireEvent.click(button);
    await screen.findByText(/حُفظ مرشح جديد من الأدلة المصدرية/);

    expect(createCandidate).toHaveBeenCalledTimes(2);
    expect(createCandidate.mock.calls[0][0].idempotencyKey).toBe(
      createCandidate.mock.calls[1][0].idempotencyKey,
    );
  });

  it("disables candidate generation for a partial archive instead of learning from a truncated page", async () => {
    const partial = { ...emptyCompleteResult, status: "PARTIAL" as const, loadedCount: 1, totalCount: 2 };
    render(<DecisionMemoryBook result={partial} />);
    const button = await screen.findByRole("button", { name: "إنشاء مرشح تعلم من الأدلة" });
    expect(button).toBeDisabled();
    expect(screen.getByText(/يُحجب الإنشاء حتى اكتمال قراءة كامل سجل القرارات/)).toBeInTheDocument();
    expect(createCandidate).not.toHaveBeenCalled();
  });

  it("reuses the same lifecycle idempotency key after an ambiguous network failure", async () => {
    fetchCandidates.mockResolvedValue({ ok: true, items: [makeCandidate("IN_REVIEW", 2)], total: 1 });
    commandCandidate
      .mockResolvedValueOnce({ ok: false, status: "UNAVAILABLE", message: "نتيجة الاتصال غير مؤكدة" })
      .mockResolvedValueOnce({ ok: true, duplicate: false, candidate: makeCandidate("APPROVED", 3) });
    render(<DecisionMemoryBook result={emptyCompleteResult} />);

    const reason = await screen.findByLabelText("سبب الإجراء (إلزامي)");
    fireEvent.change(reason, { target: { value: "اعتماد المرشح بعد مراجعة القياس." } });
    const button = await screen.findByRole("button", { name: "اعتماد Candidate" });
    fireEvent.click(button);
    await screen.findByText("نتيجة الاتصال غير مؤكدة");
    fireEvent.click(button);
    await screen.findByText(/اعتمد المرشح للمراجعة فقط/);

    expect(commandCandidate).toHaveBeenCalledTimes(2);
    expect(commandCandidate.mock.calls[0][0].idempotencyKey).toBe(
      commandCandidate.mock.calls[1][0].idempotencyKey,
    );
  });

  it("submits a saved candidate to review with a reason and refreshes its server state", async () => {
    fetchCandidates.mockResolvedValue({ ok: true, items: [makeCandidate()], total: 1 });
    commandCandidate.mockResolvedValue({
      ok: true,
      duplicate: false,
      candidate: makeCandidate("IN_REVIEW", 2),
    });
    render(<DecisionMemoryBook result={{ ...emptyCompleteResult, records: [] }} />);

    const reason = await screen.findByLabelText("سبب الإجراء (إلزامي)");
    fireEvent.change(reason, { target: { value: "مراجعة الأدلة وإرسال المرشح للجنة." } });
    fireEvent.click(screen.getByRole("button", { name: "إرسال للمراجعة" }));

    await screen.findByText("قيد المراجعة المستقلة");
    expect(commandCandidate).toHaveBeenCalledWith(expect.objectContaining({
      candidateId,
      expectedVersion: 1,
      eventType: "SUBMIT_FOR_REVIEW",
      reason: "مراجعة الأدلة وإرسال المرشح للجنة.",
    }));
    await waitFor(() => expect(screen.getByText("أُرسل المرشح للمراجعة المستقلة.")).toBeInTheDocument());
  });
});
