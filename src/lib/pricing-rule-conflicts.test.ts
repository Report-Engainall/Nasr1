import { describe, expect, it } from 'vitest';
import type { PricingRule } from '@/lib/types';
import { findPotentialPricingRuleConflicts, type PricingRuleConflictCandidate } from './pricing-rule-conflicts';

function rule(overrides: Partial<PricingRule> = {}): PricingRule {
  return {
    id: 'existing-rule',
    name: 'قاعدة قائمة',
    scope_type: 'product',
    scope_value: 'product-1',
    base_source: 'base_price',
    adjustment_value: 10,
    target_tier: 'wholesale',
    min_quantity: 10,
    min_price: null,
    max_price: null,
    priority: 50,
    effective_from: '2026-01-01T00:00:00.000Z',
    effective_until: '2026-12-31T23:59:59.000Z',
    is_active: true,
    ...overrides,
  };
}

const candidate: PricingRuleConflictCandidate = {
  scope_type: 'product',
  scope_value: 'product-1',
  target_tier: 'wholesale',
  min_quantity: 1,
  priority: 50,
  effective_from: '2026-06-01T00:00:00.000Z',
  effective_until: '2027-01-01T00:00:00.000Z',
};

describe('pricing rule overlap review', () => {
  it('flags an active same-scope, same-tier, same-priority date intersection', () => {
    const conflicts = findPotentialPricingRuleConflicts(candidate, [rule()]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      ruleId: 'existing-rule',
      samePriority: true,
      priority: 50,
      minQuantity: 10,
    });
  });

  it('does not flag rules with a disjoint effective period or different scope value', () => {
    expect(findPotentialPricingRuleConflicts(candidate, [
      rule({ effective_until: '2026-05-31T23:59:59.000Z' }),
      rule({ id: 'other-scope', scope_value: 'product-2' }),
    ])).toHaveLength(0);
  });

  it('respects combined tier coverage while keeping VIP separate', () => {
    expect(findPotentialPricingRuleConflicts({ ...candidate, target_tier: 'both' }, [
      rule({ target_tier: 'retail' }),
      rule({ id: 'vip-rule', target_tier: 'vip' }),
    ])).toHaveLength(1);
  });

  it('ignores inactive, awaiting-approval and self rules', () => {
    expect(findPotentialPricingRuleConflicts({ ...candidate, id: 'self' }, [
      rule({ id: 'inactive', is_active: false }),
      rule({ id: 'pending', requires_approval: true, approved_at: null }),
      rule({ id: 'self' }),
    ])).toHaveLength(0);
  });

  it('keeps quantity-break intersections visible but distinguishes deterministic priority order', () => {
    const conflicts = findPotentialPricingRuleConflicts({ ...candidate, priority: 10 }, [
      rule({ priority: 99 }),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].samePriority).toBe(false);
  });

  it('does not invent overlaps for invalid periods', () => {
    expect(findPotentialPricingRuleConflicts({ ...candidate, effective_from: 'not-a-date' }, [rule()])).toHaveLength(0);
  });
});
