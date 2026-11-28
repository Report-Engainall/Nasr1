import { describe, expect, it, vi } from "vitest";
import {
  DECISION_POLICY_LEARNING_MAX_OFFSET,
  DECISION_POLICY_LEARNING_PAGE_SIZE,
  clampDecisionPolicyLearningPage,
  decisionPolicyLearningPageCount,
  decisionPolicyLearningTransitionKey,
  resolveDecisionPolicyLearningCreation,
  resolveDecisionPolicyLearningTransition,
} from "./decision-policy-learning-commands";

describe("decision policy learning command retries", () => {
  it("clamps saved learning candidate pages to the supported server offset", () => {
    expect(decisionPolicyLearningPageCount(0)).toBe(1);
    expect(decisionPolicyLearningPageCount(51)).toBe(2);
    expect(decisionPolicyLearningPageCount(5050)).toBe(101);
    expect(decisionPolicyLearningPageCount(9000)).toBe(101);
    expect(clampDecisionPolicyLearningPage(4, 51)).toBe(1);
    expect(clampDecisionPolicyLearningPage(200, 9000)).toBe(100);
    expect(clampDecisionPolicyLearningPage(-1, 51)).toBe(0);
    expect(clampDecisionPolicyLearningPage(Number.NaN, 51)).toBe(0);
    expect(DECISION_POLICY_LEARNING_MAX_OFFSET + DECISION_POLICY_LEARNING_PAGE_SIZE).toBe(5050);
  });

  it("reuses the complete transition payload after the source version and typed reason change", () => {
    const createId = vi.fn()
      .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
      .mockReturnValueOnce("22222222-2222-4222-8222-222222222222");
    const first = resolveDecisionPolicyLearningTransition({
      candidateId: "candidate-a",
      expectedVersion: 4,
      eventType: "APPROVE",
      reason: "مراجعة الأدلة والنتيجة.",
    }, undefined, createId);

    const retry = resolveDecisionPolicyLearningTransition({
      candidateId: "candidate-a",
      expectedVersion: 5,
      eventType: "APPROVE",
      reason: "سبب مختلف بعد تحديث الشاشة.",
    }, first.command, createId);

    expect(first.reused).toBe(false);
    expect(retry.reused).toBe(true);
    expect(retry.command).toEqual(first.command);
    expect(retry.command).toMatchObject({
      candidateId: "candidate-a",
      expectedVersion: 4,
      eventType: "APPROVE",
      reason: "مراجعة الأدلة والنتيجة.",
      eventId: "11111111-1111-4111-8111-111111111111",
      idempotencyKey: "22222222-2222-4222-8222-222222222222",
    });
    expect(createId).toHaveBeenCalledTimes(2);
  });

  it("creates a new identity when the event changes rather than reusing another event key", () => {
    const first = resolveDecisionPolicyLearningTransition({
      candidateId: "candidate-a",
      expectedVersion: 2,
      eventType: "APPROVE",
      reason: "اعتماد القياس.",
    }, undefined, () => "33333333-3333-4333-8333-333333333333");
    const next = resolveDecisionPolicyLearningTransition({
      candidateId: "candidate-a",
      expectedVersion: 2,
      eventType: "REJECT",
      reason: "رفض موثق.",
    }, first.command, (() => {
      let index = 0;
      return () => index++ === 0
        ? "44444444-4444-4444-8444-444444444444"
        : "55555555-5555-4555-8555-555555555555";
    })());

    expect(next.reused).toBe(false);
    expect(next.command.eventType).toBe("REJECT");
    expect(next.command.eventId).toBe("44444444-4444-4444-8444-444444444444");
    expect(next.command.idempotencyKey).toBe("55555555-5555-4555-8555-555555555555");
    expect(decisionPolicyLearningTransitionKey("candidate-a", "REJECT"))
      .toBe("candidate-a:REJECT");
  });

  it("reuses the exact source decision set when candidate creation is retried after a refreshed suggestion", () => {
    const createId = vi.fn().mockReturnValue("66666666-6666-4666-8666-666666666666");
    const first = resolveDecisionPolicyLearningCreation(
      "rule|metric|period",
      ["decision-a", "decision-b"],
      undefined,
      createId,
    );
    const refreshed = resolveDecisionPolicyLearningCreation(
      "rule|metric|period",
      ["decision-a", "decision-b", "decision-c"],
      first.command,
      createId,
    );

    expect(first.reused).toBe(false);
    expect(refreshed.reused).toBe(true);
    expect(refreshed.command).toEqual(first.command);
    expect(refreshed.command.decisionIds).toEqual(["decision-a", "decision-b"]);
    expect(createId).toHaveBeenCalledTimes(1);
  });

  it("copies initial source decision IDs so later caller mutation cannot change a retry payload", () => {
    const decisionIds = ["decision-a"];
    const result = resolveDecisionPolicyLearningCreation(
      "suggestion-a",
      decisionIds,
      undefined,
      () => "77777777-7777-4777-8777-777777777777",
    );
    decisionIds.push("decision-b");

    expect(result.command.decisionIds).toEqual(["decision-a"]);
  });
});
