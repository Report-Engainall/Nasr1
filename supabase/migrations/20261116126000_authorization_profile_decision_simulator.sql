CREATE OR REPLACE FUNCTION public.evaluate_authorization_profile_decision_v2(
  p_target_profile_id uuid,
  p_capability_key text,
  p_resource_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_profile_id uuid;
  v_organization_id uuid;
  v_target_profile_id uuid;
  v_scope_kind text;
  v_approval_mode text;
  v_separation_of_duties boolean;
  v_sensitivity text;
  v_grant_source text;
  v_resource_organization_id uuid;
  v_scope_assignment_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_actor_has_capability('identity.roles.assign') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'identity.roles.assign capability required for authorization simulation';
  END IF;

  IF p_target_profile_id IS NULL OR p_capability_key IS NULL OR btrim(p_capability_key) = '' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'target profile and capability are required';
  END IF;

  SELECT p.id, p.organization_id
    INTO v_actor_profile_id, v_organization_id
    FROM public.profiles p
    JOIN public.organizations o
      ON o.id = p.organization_id
     AND o.is_active = true
   WHERE p.auth_user_id = auth.uid()
     AND p.is_active = true
     AND p.organization_id IS NOT NULL
   ORDER BY p.created_at, p.id
   LIMIT 1;

  IF v_actor_profile_id IS NULL OR v_organization_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'active organization administrator is required';
  END IF;

  SELECT p.id
    INTO v_target_profile_id
    FROM public.profiles p
   WHERE p.id = p_target_profile_id
     AND p.organization_id = v_organization_id
     AND p.is_active = true
     AND p.auth_user_id IS NOT NULL;
  IF v_target_profile_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'simulation target must be an active member of the current organization';
  END IF;

  SELECT c.scope_kind, c.approval_mode, c.separation_of_duties, c.sensitivity
    INTO v_scope_kind, v_approval_mode, v_separation_of_duties, v_sensitivity
    FROM public.authorization_capabilities c
   WHERE c.capability_key = p_capability_key
     AND c.is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'decision', 'DENY',
      'capability_key', p_capability_key,
      'target_profile_id', v_target_profile_id,
      'reason', 'Unknown or inactive capability.',
      'source', 'capability_registry'
    );
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.authorization_profile_denials d
     WHERE d.organization_id = v_organization_id
       AND d.profile_id = v_target_profile_id
       AND d.capability_key = p_capability_key
       AND d.is_active = true
       AND (d.expires_at IS NULL OR d.expires_at > statement_timestamp())
  ) THEN
    RETURN jsonb_build_object(
      'decision', 'DENY',
      'capability_key', p_capability_key,
      'target_profile_id', v_target_profile_id,
      'scope_kind', v_scope_kind,
      'reason', 'An active explicit denial overrides all role grants.',
      'source', 'profile_explicit_deny',
      'sensitivity', v_sensitivity
    );
  END IF;

  SELECT rc.grant_source
    INTO v_grant_source
    FROM public.authorization_role_capabilities rc
    JOIN public.user_roles ur
      ON ur.role = rc.role
     AND ur.profile_id = v_target_profile_id
    JOIN public.authorization_capabilities c
      ON c.capability_key = rc.capability_key
     AND c.is_active = true
   WHERE rc.capability_key = p_capability_key
     AND rc.valid_from <= statement_timestamp()
     AND (rc.expires_at IS NULL OR rc.expires_at > statement_timestamp())
   ORDER BY rc.role
   LIMIT 1;

  IF v_grant_source IS NULL THEN
    RETURN jsonb_build_object(
      'decision', 'DENY',
      'capability_key', p_capability_key,
      'target_profile_id', v_target_profile_id,
      'scope_kind', v_scope_kind,
      'reason', 'No active role grant exists for this capability.',
      'source', 'role_capability_registry',
      'sensitivity', v_sensitivity
    );
  END IF;

  IF v_scope_kind = 'organization' THEN
    IF p_resource_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'decision', 'DENY',
        'capability_key', p_capability_key,
        'target_profile_id', v_target_profile_id,
        'scope_kind', v_scope_kind,
        'reason', 'Organization-scoped capability does not accept a resource identifier.',
        'source', v_grant_source,
        'sensitivity', v_sensitivity
      );
    END IF;
  ELSIF v_scope_kind = 'warehouse' OR v_scope_kind = 'assigned_customer' THEN
    IF p_resource_id IS NULL THEN
      RETURN jsonb_build_object(
        'decision', 'DENY',
        'capability_key', p_capability_key,
        'target_profile_id', v_target_profile_id,
        'scope_kind', v_scope_kind,
        'reason', 'A resource identifier is required for this relationship scope.',
        'source', 'scope_policy',
        'sensitivity', v_sensitivity
      );
    END IF;

    IF v_scope_kind = 'warehouse' THEN
      SELECT w.organization_id
        INTO v_resource_organization_id
        FROM public.warehouses w
       WHERE w.id = p_resource_id
         AND w.is_active = true;
    ELSE
      SELECT c.organization_id
        INTO v_resource_organization_id
        FROM public.customers c
       WHERE c.id = p_resource_id;
    END IF;

    IF v_resource_organization_id IS DISTINCT FROM v_organization_id THEN
      RETURN jsonb_build_object(
        'decision', 'DENY',
        'capability_key', p_capability_key,
        'target_profile_id', v_target_profile_id,
        'scope_kind', v_scope_kind,
        'reason', 'The requested resource is unavailable within the active organization.',
        'source', 'tenant_boundary',
        'sensitivity', v_sensitivity
      );
    END IF;

    SELECT s.id
      INTO v_scope_assignment_id
      FROM public.authorization_profile_scopes s
     WHERE s.organization_id = v_organization_id
       AND s.profile_id = v_target_profile_id
       AND s.scope_kind = v_scope_kind
       AND s.is_active = true
       AND s.valid_from <= statement_timestamp()
       AND (s.expires_at IS NULL OR s.expires_at > statement_timestamp())
       AND (
         (v_scope_kind = 'warehouse' AND s.warehouse_id = p_resource_id)
         OR
         (v_scope_kind = 'assigned_customer' AND s.customer_id = p_resource_id)
       )
     ORDER BY s.id
     LIMIT 1;

    IF v_scope_assignment_id IS NULL THEN
      RETURN jsonb_build_object(
        'decision', 'DENY',
        'capability_key', p_capability_key,
        'target_profile_id', v_target_profile_id,
        'scope_kind', v_scope_kind,
        'scope_resource_id', p_resource_id,
        'reason', 'No active assignment grants access to this resource.',
        'source', 'resource_assignment',
        'grant_source', v_grant_source,
        'sensitivity', v_sensitivity
      );
    END IF;
  ELSE
    RETURN jsonb_build_object(
      'decision', 'DENY',
      'capability_key', p_capability_key,
      'target_profile_id', v_target_profile_id,
      'scope_kind', v_scope_kind,
      'reason', 'This relationship scope is not implemented and remains denied by default.',
      'source', 'unsupported_scope',
      'sensitivity', v_sensitivity
    );
  END IF;

  IF v_approval_mode <> 'none' THEN
    RETURN jsonb_build_object(
      'decision', 'REQUIRES_APPROVAL',
      'capability_key', p_capability_key,
      'target_profile_id', v_target_profile_id,
      'scope_kind', v_scope_kind,
      'scope_resource_id', p_resource_id,
      'scope_assignment_id', v_scope_assignment_id,
      'reason', 'The capability requires its configured approval workflow.',
      'source', v_grant_source,
      'grant_source', v_grant_source,
      'approval_mode', v_approval_mode,
      'separation_of_duties', v_separation_of_duties,
      'sensitivity', v_sensitivity
    );
  END IF;

  RETURN jsonb_build_object(
    'decision', 'PERMIT',
    'capability_key', p_capability_key,
    'target_profile_id', v_target_profile_id,
    'scope_kind', v_scope_kind,
    'scope_resource_id', p_resource_id,
    'scope_assignment_id', v_scope_assignment_id,
    'reason', 'An active role grant and the requested organization/resource scope satisfy the policy.',
    'source', v_grant_source,
    'grant_source', v_grant_source,
    'approval_mode', v_approval_mode,
    'separation_of_duties', v_separation_of_duties,
    'sensitivity', v_sensitivity
  );
END
$function$;

REVOKE ALL ON FUNCTION public.evaluate_authorization_profile_decision_v2(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_authorization_profile_decision_v2(uuid, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.evaluate_authorization_profile_decision_v2(uuid, text, uuid) IS
  'Read-only administrator simulator for a same-organization member. It mirrors role grants, explicit denials, relationship scopes and approval mode without executing a business operation or changing access.';
