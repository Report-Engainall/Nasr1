-- Allow pricing rules to target the VIP (جملة الجملة) customer tier independently.
-- The resolver already matches target_tier against the server-derived customer tier.
-- This migration only extends the check constraint; it does not rewrite existing prices or rules.
BEGIN;

DO $migration$
DECLARE
  v_invalid_count bigint;
BEGIN
  IF to_regclass('public.pricing_rules') IS NULL THEN
    RAISE EXCEPTION 'Required table public.pricing_rules is missing; restore the canonical schema before enabling VIP pricing rules';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'pricing_rules'
       AND column_name = 'target_tier'
  ) THEN
    RAISE EXCEPTION 'Required column public.pricing_rules.target_tier is missing; refusing a partial pricing migration';
  END IF;

  SELECT count(*)
    INTO v_invalid_count
    FROM public.pricing_rules
   WHERE target_tier IS NULL
      OR target_tier NOT IN ('both', 'vip', 'wholesale', 'retail');

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Found % pricing rules with an unsupported target_tier; resolve them explicitly before applying this migration', v_invalid_count;
  END IF;

  ALTER TABLE public.pricing_rules
    DROP CONSTRAINT IF EXISTS pricing_rules_target_tier_check;

  ALTER TABLE public.pricing_rules
    ADD CONSTRAINT pricing_rules_target_tier_check
    CHECK (target_tier IN ('both', 'vip', 'wholesale', 'retail'));
END
$migration$;

COMMIT;
