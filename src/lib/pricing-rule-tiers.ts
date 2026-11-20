import type { PricingTargetTier } from '@/lib/types';

export const PRICING_RULE_TARGET_OPTIONS: ReadonlyArray<{
  value: PricingTargetTier;
  label: string;
}> = [
  { value: 'vip', label: 'جملة الجملة' },
  { value: 'wholesale', label: 'الجملة' },
  { value: 'retail', label: 'التجزئة' },
  { value: 'both', label: 'الجملة والتجزئة معًا' },
] as const;

const SUPPORTED_TARGET_TIERS = new Set<PricingTargetTier>(
  PRICING_RULE_TARGET_OPTIONS.map((option) => option.value),
);

/** Preserve supported targets when editing old rules; fall back safely for unknown historic values. */
export function normalizePricingRuleTargetTier(value: unknown): PricingTargetTier {
  return typeof value === 'string' && SUPPORTED_TARGET_TIERS.has(value as PricingTargetTier)
    ? value as PricingTargetTier
    : 'both';
}
