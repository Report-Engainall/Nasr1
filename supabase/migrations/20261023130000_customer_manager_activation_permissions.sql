-- Grant customer_manager the existing, tenant-scoped activation-link management RPCs.
-- Do not widen public.is_staff(): this capability does not confer general staff access.

CREATE OR REPLACE FUNCTION public.create_customer_activation_invitation(
  p_customer_id uuid,
  p_email text,
  p_expires_hours integer DEFAULT 72
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile_id uuid := public.current_profile_id();
  v_org_id uuid := public.current_organization_id();
  v_customer public.customers%ROWTYPE;
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
  v_token text;
  v_invitation_id uuid;
  v_expires_at timestamptz;
BEGIN
  IF auth.uid() IS NULL OR v_profile_id IS NULL OR v_org_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id=v_profile_id AND p.auth_user_id=auth.uid()
         AND p.organization_id=v_org_id AND p.is_active=true
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles r
       WHERE r.profile_id=v_profile_id
         AND r.role IN ('admin','manager','staff','customer_manager')
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='صلاحية إدارة العملاء مطلوبة لإنشاء دعوة تفعيل.';
  END IF;
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='سجل العميل مطلوب.';
  END IF;
  IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     OR pg_catalog.length(v_email) > 254 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='البريد الإلكتروني للدعوة غير صالح.';
  END IF;
  IF p_expires_hours IS NULL OR p_expires_hours < 1 OR p_expires_hours > 168 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='مدة الدعوة يجب أن تكون من ساعة إلى 168 ساعة.';
  END IF;

  SELECT c.* INTO v_customer
  FROM public.customers AS c
  WHERE c.id=p_customer_id AND c.organization_id=v_org_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='سجل العميل غير موجود ضمن المؤسسة الحالية.';
  END IF;
  IF v_customer.status <> 'approved' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='يجب اعتماد العميل قبل إنشاء رابط تفعيل الحساب.';
  END IF;
  IF v_customer.profile_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='سجل العميل مرتبط بحساب بالفعل.';
  END IF;
  IF v_customer.email IS NOT NULL AND pg_catalog.lower(pg_catalog.btrim(v_customer.email)) <> v_email THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='يجب أن يطابق البريد المدعو البريد المسجل في ملف العميل.';
  END IF;

  -- Supersede prior pending links; their raw tokens are never stored.
  UPDATE public.customer_activation_invitations
  SET status='revoked', revoked_at=pg_catalog.now(), updated_at=pg_catalog.now()
  WHERE customer_id=v_customer.id AND organization_id=v_org_id AND status='pending';

  -- pg_catalog.gen_random_uuid is built into PostgreSQL; do not assume pgcrypto lives in public.
  -- Two UUIDv4 values preserve a 64-hex-character token with ample cryptographic entropy.
  v_token := pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-','') || pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-','');
  v_expires_at := pg_catalog.now() + pg_catalog.make_interval(hours => p_expires_hours);
  INSERT INTO public.customer_activation_invitations(
    organization_id, customer_id, invited_email, token_hash,
    invited_by_profile_id, expires_at
  )
  VALUES(
    v_org_id, v_customer.id, v_email,
    public.customer_company_invitation_sha256(v_token),
    v_profile_id, v_expires_at
  )
  RETURNING id INTO v_invitation_id;

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity_type, entity_id, new_value, created_at
  ) VALUES (
    v_org_id, v_profile_id, 'customer_activation_invitation.created',
    'customer_activation_invitation', v_invitation_id,
    pg_catalog.jsonb_build_object(
      'customer_id', v_customer.id, 'email', v_email, 'expires_at', v_expires_at
    ),
    pg_catalog.now()
  );

  RETURN pg_catalog.jsonb_build_object(
    'invitation_id', v_invitation_id,
    'customer_id', v_customer.id,
    'invited_email', v_email,
    'token', v_token,
    'expires_at', v_expires_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_customer_activation_invitation(uuid,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_customer_activation_invitation(uuid,text,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_customer_activation_invitations(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile_id uuid := public.current_profile_id();
  v_org_id uuid := public.current_organization_id();
  v_customer public.customers%ROWTYPE;
  v_invitations jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_profile_id IS NULL OR v_org_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id=v_profile_id AND p.auth_user_id=auth.uid()
         AND p.organization_id=v_org_id AND p.is_active=true
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles r
       WHERE r.profile_id=v_profile_id
         AND r.role IN ('admin','manager','staff','customer_manager')
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='صلاحية إدارة العملاء مطلوبة لعرض سجل الدعوات.';
  END IF;
  SELECT c.* INTO v_customer
  FROM public.customers AS c
  WHERE c.id=p_customer_id AND c.organization_id=v_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='سجل العميل غير موجود ضمن المؤسسة الحالية.';
  END IF;

  SELECT coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'invitation_id', i.id,
        'invited_email', i.invited_email,
        'status', CASE WHEN i.status='pending' AND i.expires_at<=pg_catalog.now()
                       THEN 'expired' ELSE i.status END,
        'expires_at', i.expires_at,
        'created_at', i.created_at
      ) ORDER BY i.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_invitations
  FROM (
    SELECT * FROM public.customer_activation_invitations
    WHERE customer_id=v_customer.id AND organization_id=v_org_id
    ORDER BY created_at DESC
    LIMIT 20
  ) AS i;

  RETURN pg_catalog.jsonb_build_object(
    'customer_id', v_customer.id,
    'customer_email', v_customer.email,
    'customer_status', v_customer.status,
    'is_linked', v_customer.profile_id IS NOT NULL,
    'invitations', v_invitations
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_customer_activation_invitations(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_customer_activation_invitations(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_customer_activation_invitation(p_invitation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile_id uuid := public.current_profile_id();
  v_org_id uuid := public.current_organization_id();
  v_invitation public.customer_activation_invitations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_profile_id IS NULL OR v_org_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id=v_profile_id AND p.auth_user_id=auth.uid()
         AND p.organization_id=v_org_id AND p.is_active=true
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles r
       WHERE r.profile_id=v_profile_id
         AND r.role IN ('admin','manager','staff','customer_manager')
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='صلاحية إدارة العملاء مطلوبة لإلغاء الدعوة.';
  END IF;
  SELECT i.* INTO v_invitation
  FROM public.customer_activation_invitations AS i
  WHERE i.id=p_invitation_id AND i.organization_id=v_org_id
  FOR UPDATE;
  IF NOT FOUND OR v_invitation.status <> 'pending' OR v_invitation.expires_at <= pg_catalog.now() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='الدعوة غير معلقة أو منتهية أو لا تتبع المؤسسة الحالية.';
  END IF;

  UPDATE public.customer_activation_invitations
  SET status='revoked', revoked_at=pg_catalog.now(), updated_at=pg_catalog.now()
  WHERE id=v_invitation.id AND organization_id=v_org_id AND status='pending';

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value, created_at
  ) VALUES (
    v_org_id, v_profile_id, 'customer_activation_invitation.revoked',
    'customer_activation_invitation', v_invitation.id,
    pg_catalog.jsonb_build_object('status','pending'),
    pg_catalog.jsonb_build_object('status','revoked','customer_id',v_invitation.customer_id),
    pg_catalog.now()
  );
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.revoke_customer_activation_invitation(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.revoke_customer_activation_invitation(uuid) TO authenticated;

COMMENT ON FUNCTION public.create_customer_activation_invitation(uuid,text,integer) IS
  'Creates a single-use customer activation link for admin, manager, staff, or customer_manager within the active tenant; only the SHA-256 token hash is stored.';
COMMENT ON FUNCTION public.list_customer_activation_invitations(uuid) IS
  'Lists activation invitation metadata for authorized customer-management roles within the active tenant.';
COMMENT ON FUNCTION public.revoke_customer_activation_invitation(uuid) IS
  'Revokes a pending activation link for authorized customer-management roles within the active tenant.';
