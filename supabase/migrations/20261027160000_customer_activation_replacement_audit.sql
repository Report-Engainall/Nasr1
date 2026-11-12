-- Preserve the complete audit trail when a new customer activation invitation supersedes a pending link.
-- Keep the current pgcrypto-schema-aware token generation/hash helpers and tenant authorization contract.
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

  -- Supersede prior pending links atomically and record each revocation.
  -- The bearer token is never stored in the invitation row or its audit record.
  WITH superseded AS (
    UPDATE public.customer_activation_invitations
    SET status='revoked', revoked_at=pg_catalog.now(), updated_at=pg_catalog.now()
    WHERE customer_id=v_customer.id AND organization_id=v_org_id AND status='pending'
    RETURNING id, customer_id, invited_email, expires_at
  )
  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value, created_at
  )
  SELECT
    v_org_id, v_profile_id, 'customer_activation_invitation.revoked',
    'customer_activation_invitation', s.id,
    pg_catalog.jsonb_build_object(
      'status','pending','customer_id',s.customer_id,
      'invited_email',s.invited_email,'expires_at',s.expires_at
    ),
    pg_catalog.jsonb_build_object(
      'status','revoked','customer_id',s.customer_id,
      'reason','superseded_by_replacement_invitation'
    ),
    pg_catalog.now()
  FROM superseded AS s;

  -- Use schema-aware pgcrypto helpers; only the one-time token is returned to the authorized creator.
  v_token := public.customer_activation_invitation_random_token();
  v_expires_at := pg_catalog.now() + pg_catalog.make_interval(hours => p_expires_hours);
  INSERT INTO public.customer_activation_invitations(
    organization_id, customer_id, invited_email, token_hash,
    invited_by_profile_id, expires_at
  )
  VALUES(
    v_org_id, v_customer.id, v_email,
    public.customer_activation_invitation_sha256(v_token),
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
