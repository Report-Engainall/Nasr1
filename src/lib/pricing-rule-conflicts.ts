import type { PricingRule, PricingTargetTier } from '@/lib/types';

export type PricingRuleConflictCandidate = {
  id?: string | null;
  scope_type: string;
  scope_value: string | null;
  target_tier: PricingTargetTier | string;
  min_quantity: number;
  priority: number;
  effective_from: string | null;
  effective_until: string | null;
};

export type PricingRuleConflict = {
  ruleId: string;
  ruleName: string;
  priority: number;
  minQuantity: number;
  samePriority: boolean;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
};

function tierSet(value: string): ReadonlySet<string> {
  if (value === 'both') return new Set(['wholesale', 'retail']);
  if (value === 'vip' || value === 'wholesale' || value === 'retail') return new Set([value]);
  return new Set();
}

function asStart(value: string | null): number {
  if (value === null) return Number.NEGATIVE_INFINITY;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

function asEnd(value: string | null): number {
  if (value === null) return Number.POSITIVE_INFINITY;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

function periodsOverlap(left: PricingRuleConflictCandidate, right: PricingRuleConflictCandidate): boolean {
  const leftStart = asStart(left.effective_from);
  const leftEnd = asEnd(left.effective_until);
  const rightStart = asStart(right.effective_from);
  const rightEnd = asEnd(right.effective_until);
  if ([leftStart, leftEnd, rightStart, rightEnd].some(Number.isNaN)) return false;
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

/**
 * Detects obvious rule intersections in the same exact scope. This is a UI review warning,
 * not a replacement for server-side conflict enforcement or the authoritative price engine.
 * Rules in different scopes (for example, a product inside a category) need server evaluation.
 */
export function findPotentialPricingRuleConflicts(
  candidate: PricingRuleConflictCandidate,
  existingRules: readonly PricingRule[],
): PricingRuleConflict[] {
  const candidateTiers = tierSet(candidate.target_tier);
  if (!candidateTiers.size || !Number.isFinite(candidate.min_quantity) || candidate.min_quantity <= 0) return [];

  return existingRules.flatMap((rule) => {
    if (
      rule.id === candidate.id ||
      !rule.is_active ||
      (rule.requires_approval && !rule.approved_at) ||
      rule.scope_type !== candidate.scope_type ||
      (rule.scope_value ?? null) !== (candidate.scope_value ?? null) ||
      ![...candidateTiers].some((tier) => tierSet(rule.target_tier).has(tier)) ||
      !Number.isFinite(Number(rule.min_quantity)) ||
      Number(rule.min_quantity) <= 0 ||
      !periodsOverlap(candidate, rule)
    ) return [];

    return [{
      ruleId: rule.id,
      ruleName: rule.name,
      priority: rule.priority,
      minQuantity: rule.min_quantity,
      samePriority: rule.priority === candidate.priority,
      effectiveFrom: rule.effective_from,
      effectiveUntil: rule.effective_until,
    }];
  }).sort((left, right) => Number(right.samePriority) - Number(left.samePriority) || left.priority - right.priority || left.ruleName.localeCompare(right.ruleName, 'ar'));
}
