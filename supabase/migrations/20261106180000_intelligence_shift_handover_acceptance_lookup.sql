-- P3 Section 53 — expose only the pending handover command reference to its incoming owner.
-- The existing accept RPC remains authoritative and rechecks actor, tenant and one-time acceptance.
BEGIN;

CREATE OR REPLACE FUNCTION public.fetch_operational_shift_handover_acceptance(
  p_current_shift_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_shift public.operational_shifts%ROWTYPE;
  v_handover public.operational_shift_handover_events%ROWTYPE;
  v_accepted_at timestamptz;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR p_current_shift_id IS NULL
     OR NOT (public.is_staff() OR public.can_manage_finance()) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active same-organization staff profile is required to inspect handover acceptance';
  END IF;

  SELECT s.* INTO v_shift
    FROM public.operational_shifts s
   WHERE s.id=p_current_shift_id
     AND s.organization_id=v_org;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='shift is unavailable in the current organization';
  END IF;

  IF v_shift.previous_shift_id IS NULL OR v_shift.owner_profile_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='only the incoming owner may read the handover acceptance reference';
  END IF;

  SELECT e.* INTO v_handover
    FROM public.operational_shift_handover_events e
   WHERE e.organization_id=v_org
     AND e.current_shift_id=v_shift.id
     AND e.incoming_owner_profile_id=v_actor
     AND e.action='RECORDED'
   ORDER BY e.created_at DESC,e.id DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'current_shift_id',v_shift.id,
      'required',true,
      'handover_id',NULL,
      'accepted_at',NULL
    );
  END IF;

  SELECT a.created_at INTO v_accepted_at
    FROM public.operational_shift_handover_events a
   WHERE a.organization_id=v_org
     AND a.handover_id=v_handover.id
     AND a.action='ACCEPTED'
   ORDER BY a.created_at DESC,a.id DESC
   LIMIT 1;

  RETURN pg_catalog.jsonb_build_object(
    'current_shift_id',v_shift.id,
    'required',true,
    'handover_id',v_handover.id,
    'accepted_at',v_accepted_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fetch_operational_shift_handover_acceptance(uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_operational_shift_handover_acceptance(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.fetch_operational_shift_handover_acceptance(uuid) IS
  'Returns only the tenant-scoped handover event ID and acceptance timestamp to the authenticated incoming shift owner. Acceptance itself remains a separate idempotent, append-only command that revalidates the owner.';

COMMIT;
