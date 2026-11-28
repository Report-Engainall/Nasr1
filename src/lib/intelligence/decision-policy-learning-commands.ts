import type { DecisionPolicyLearningEventType } from "./decision-policy-learning-client";

export const DECISION_POLICY_LEARNING_PAGE_SIZE = 50;
export const DECISION_POLICY_LEARNING_MAX_OFFSET = 5000;

export function decisionPolicyLearningPageCount(total: number): number {
  if (!Number.isSafeInteger(total) || total < 0) return 1;
  const supportedPages = Math.floor(DECISION_POLICY_LEARNING_MAX_OFFSET / DECISION_POLICY_LEARNING_PAGE_SIZE) + 1;
  return Math.max(1, Math.min(Math.ceil(total / DECISION_POLICY_LEARNING_PAGE_SIZE), supportedPages));
}

export function clampDecisionPolicyLearningPage(page: number, total: number): number {
  if (!Number.isSafeInteger(page) || page < 0) return 0;
  return Math.min(page, decisionPolicyLearningPageCount(total) - 1);
}

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
