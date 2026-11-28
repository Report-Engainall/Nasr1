import { describe, expect, it, vi } from "vitest";
import {
  decisionPolicyLearningTransitionKey,
  resolveDecisionPolicyLearningCreation,
  resolveDecisionPolicyLearningTransition,
} from "./decision-policy-learning-commands";

describe("decision policy learning command retries", () => {
  it("reuses the complete transition payload after the source version and typed reason change", () => {
    const createId = vi.fn()
      .mockReturnValueOnce("event-id-1")
      .mockReturnValueOnce("idempotency-key-1");
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
      eventId: "event-id-1",
      idempotencyKey: "idempotency-key-1",
    });
    expect(createId).toHaveBeenCalledTimes(2);
  });

  it("creates a new identity when the event changes rather than reusing another event key", () => {
    const first = resolveDecisionPolicyLearningTransition({
      candidateId: "candidate-a",
      expectedVersion: 2,
      eventType: "APPROVE",
      reason: "اعتماد القياس.",
    }, undefined, () => "first-id");
    const next = resolveDecisionPolicyLearningTransition({
      candidateId: "candidate-a",
      expectedVersion: 2,
      eventType: "REJECT",
      reason: "رفض موثق.",
    }, first.command, (() => {
      let index = 0;
      return () => "new-id-" + (++index);
    })());

    expect(next.reused).toBe(false);
    expect(next.command.eventType).toBe("REJECT");
    expect(next.command.eventId).toBe("new-id-1");
    expect(next.command.idempotencyKey).toBe("new-id-2");
    expect(decisionPolicyLearningTransitionKey("candidate-a", "REJECT"))
      .toBe("candidate-a:REJECT");
  });

  it("reuses the exact source decision set when candidate creation is retried after a refreshed suggestion", () => {
    const createId = vi.fn().mockReturnValue("create-key-1");
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
      () => "key",
    );
    decisionIds.push("decision-b");

    expect(result.command.decisionIds).toEqual(["decision-a"]);
  });
});
