import { describe, expect, it } from 'vitest';
import {
  normalizePricingRuleTargetTier,
  PRICING_RULE_TARGET_OPTIONS,
} from '@/lib/pricing-rule-tiers';

describe('pricing rule tier targets', () => {
  it('exposes the three independent customer tiers and the wholesale-retail combined target', () => {
    expect(PRICING_RULE_TARGET_OPTIONS).toEqual([
      { value: 'vip', label: 'جملة الجملة' },
      { value: 'wholesale', label: 'الجملة' },
      { value: 'retail', label: 'التجزئة' },
      { value: 'both', label: 'الجملة والتجزئة معًا' },
    ]);
  });

  it.each(['vip', 'wholesale', 'retail', 'both'] as const)(
    'preserves the %s target when editing a rule',
    (tier) => {
      expect(normalizePricingRuleTargetTier(tier)).toBe(tier);
    },
  );

  it.each([null, undefined, '', 'super_wholesale', 'unknown', 3])(
    'uses the safe legacy default for unsupported target %s',
    (tier) => {
      expect(normalizePricingRuleTargetTier(tier)).toBe('both');
    },
  );
});
