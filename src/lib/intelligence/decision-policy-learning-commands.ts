import type { DecisionPolicyLearningEventType } from "./decision-policy-learning-client";

export interface PendingDecisionPolicyLearningTransition {
  candidateId: string;
  expectedVersion: number;
  eventType: Exclude<DecisionPolicyLearningEventType, "CREATE">;
  reason: string;
  eventId: string;
  idempotencyKey: string;
}

export interface PendingDecisionPolicyLearningCreation {
  suggestionId: string;
  decisionIds: string[];
  idempotencyKey: string;
}

export function resolveDecisionPolicyLearningTransition(
  input: Omit<PendingDecisionPolicyLearningTransition, "eventId" | "idempotencyKey">,
  pending: PendingDecisionPolicyLearningTransition | undefined,
  createId: () => string = () => crypto.randomUUID(),
): { command: PendingDecisionPolicyLearningTransition; reused: boolean } {
  if (pending && pending.candidateId === input.candidateId && pending.eventType === input.eventType) {
    return { command: pending, reused: true };
  }
  return {
    command: {
      ...input,
      reason: input.reason.trim(),
      eventId: createId(),
      idempotencyKey: createId(),
    },
    reused: false,
  };
}

export function resolveDecisionPolicyLearningCreation(
  suggestionId: string,
  decisionIds: string[],
  pending: PendingDecisionPolicyLearningCreation | undefined,
  createId: () => string = () => crypto.randomUUID(),
): { command: PendingDecisionPolicyLearningCreation; reused: boolean } {
  if (pending && pending.suggestionId === suggestionId) {
    return { command: pending, reused: true };
  }
  return {
    command: {
      suggestionId,
      decisionIds: [...decisionIds],
      idempotencyKey: createId(),
    },
    reused: false,
  };
}

export function decisionPolicyLearningTransitionKey(
  candidateId: string,
  eventType: Exclude<DecisionPolicyLearningEventType, "CREATE">,
): string {
  return candidateId + ":" + eventType;
}
