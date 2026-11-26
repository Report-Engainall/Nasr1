-- Upgrade compatibility for databases where the inventory-scope migration
-- ran before the canonical authorization migration seeded inventory.count.enter.
--
-- On a clean chronological replay, 20261116130000 already derives
-- inventory.count.start grants from inventory.count.enter. On an existing main
-- database, that migration is already recorded as applied and cannot perform
-- the backfill after the later canonical grant seed. Copy only the currently
-- persisted source-role grants; never recreate a missing source grant, change
-- either capability's active/scope state, or overwrite an existing target row.
BEGIN;

INSERT INTO public.authorization_role_capabilities (
  role,
  capability_key,
  grant_source,
  valid_from,
  expires_at
)
SELECT
  source_grant.role,
  'inventory.count.start',
  'legacy-role-parity:' || source_grant.grant_source,
  source_grant.valid_from,
  source_grant.expires_at
FROM public.authorization_role_capabilities source_grant
JOIN public.authorization_capabilities source_capability
  ON source_capability.capability_key = source_grant.capability_key
 AND source_capability.is_active = true
 AND source_capability.scope_kind = 'warehouse'
JOIN public.authorization_capabilities target_capability
  ON target_capability.capability_key = 'inventory.count.start'
 AND target_capability.is_active = true
 AND target_capability.scope_kind = 'warehouse'
WHERE source_grant.capability_key = 'inventory.count.enter'
  -- Backfill only a wholly absent target matrix. If even one start grant is
  -- already present, it is policy state: a missing role may have been
  -- deliberately revoked and must not be silently restored.
  AND NOT EXISTS (
    SELECT 1
    FROM public.authorization_role_capabilities existing_target
    WHERE existing_target.capability_key = 'inventory.count.start'
  )
ON CONFLICT (role, capability_key) DO NOTHING;

-- Verify that every persisted source role with no prior target row received
-- its matching warehouse-scoped start grant. Existing target rows (including
-- expired or deliberately disabled grants) are preserved as policy state.
DO $assert_count_start_role_parity$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.authorization_role_capabilities source_grant
    JOIN public.authorization_capabilities source_capability
      ON source_capability.capability_key = source_grant.capability_key
     AND source_capability.is_active = true
     AND source_capability.scope_kind = 'warehouse'
    JOIN public.authorization_capabilities target_capability
      ON target_capability.capability_key = 'inventory.count.start'
     AND target_capability.is_active = true
     AND target_capability.scope_kind = 'warehouse'
    WHERE source_grant.capability_key = 'inventory.count.enter'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.authorization_role_capabilities existing_target
    WHERE existing_target.capability_key = 'inventory.count.start'
  ) THEN
    RAISE EXCEPTION 'inventory.count.start role parity backfill did not create the missing target matrix';
  END IF;
END
$assert_count_start_role_parity$;

COMMIT;
