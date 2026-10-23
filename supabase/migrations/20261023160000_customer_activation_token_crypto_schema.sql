-- Resolve activation-token hashing through the installed pgcrypto schema.
-- Keep this override separate from the customer-manager role-grant migration.
CREATE OR REPLACE FUNCTION public.accept_customer_activation_invitation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile_id uuid := public.current_profile_id();
  v_auth_email text;
  v_profile public.profiles%ROWTYPE;
  v_org_id uuid;
  v_invitation public.customer_activation_invitations%ROWTYPE;
  v_customer public.customers%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_profile_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='سجّل الدخول إلى الحساب الذي استلم الدعوة أولاً.';
  END IF;
  IF coalesce(p_token,'') !~ '^[0-9a-fA-F]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='رابط تفعيل الحساب غير صالح.';
  END IF;
  -- Derive email and confirmation from auth.users, never from the JWT email/confirmation claims.
  SELECT pg_catalog.lower(pg_catalog.btrim(coalesce(u.email,'')))
    INTO v_auth_email
  FROM auth.users AS u
  WHERE u.id=auth.uid()
    AND u.email_confirmed_at IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='أكّد البريد الإلكتروني قبل قبول دعوة التفعيل.';
  END IF;
  IF v_auth_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='لم يثبت الخادم بريدًا إلكترونيًا صالحًا للجلسة.';
  END IF;

  -- Lock the identity row to serialize attempts to link one profile to multiple customer records.
  SELECT p.* INTO v_profile
  FROM public.profiles AS p
  WHERE p.id=v_profile_id AND p.auth_user_id=auth.uid() AND p.is_active
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='ملف المستخدم غير نشط أو غير مرتبط بجلسة الدخول.';
  END IF;
  IF pg_catalog.lower(pg_catalog.btrim(coalesce(v_profile.email,''))) <> v_auth_email THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='بريد الجلسة لا يطابق البريد المثبت في ملف المستخدم.';
  END IF;
  v_org_id := v_profile.organization_id;

  SELECT i.* INTO v_invitation
  FROM public.customer_activation_invitations AS i
  WHERE i.token_hash=public.customer_company_invitation_sha256(pg_catalog.lower(pg_catalog.btrim(p_token)))
  FOR UPDATE;
  IF NOT FOUND OR v_invitation.status <> 'pending' OR v_invitation.expires_at <= pg_catalog.now() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='رابط التفعيل غير موجود أو منتهي أو مستخدم أو ملغى.';
  END IF;
  IF v_auth_email <> v_invitation.invited_email THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='سجّل الدخول بالبريد الإلكتروني المسجل في الدعوة.';
  END IF;
  IF v_org_id IS DISTINCT FROM v_invitation.organization_id
     OR v_org_id IS DISTINCT FROM public.current_organization_id() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='الدعوة لا تخص مؤسسة حساب الدخول الحالي.';
  END IF;
  IF NOT EXISTS (
       SELECT 1 FROM public.user_roles AS r
       WHERE r.profile_id=v_profile_id AND r.role='customer'
     )
     OR public.is_staff()
     OR EXISTS (
       SELECT 1 FROM public.user_roles AS r
       WHERE r.profile_id=v_profile_id
         AND r.role IN ('admin','manager','staff','accountant')
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='دعوة تفعيل العميل لا تمنح حسابات فريق التشغيل صلاحيات عميل.';
  END IF;

  SELECT c.* INTO v_customer
  FROM public.customers AS c
  WHERE c.id=v_invitation.customer_id AND c.organization_id=v_invitation.organization_id
  FOR UPDATE;
  IF NOT FOUND OR v_customer.status <> 'approved' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='سجل العميل غير موجود أو لم يعد معتمدًا.';
  END IF;
  IF v_customer.profile_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='سجل العميل مرتبط بحساب آخر بالفعل.';
  END IF;
  IF v_customer.email IS NOT NULL
     AND pg_catalog.lower(pg_catalog.btrim(v_customer.email)) <> v_auth_email THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='بريد الدعوة لا يطابق البريد الحالي في ملف العميل.';
  END IF;
  IF EXISTS (
       SELECT 1 FROM public.customers AS c
       WHERE c.profile_id=v_profile_id
     ) OR EXISTS (
       SELECT 1 FROM public.customer_company_memberships AS m
       WHERE m.profile_id=v_profile_id AND m.status='active'
     ) THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='هذا الحساب مرتبط بسجل عميل أو بشركة بالفعل؛ لا يمكن ربطه مرة أخرى.';
  END IF;

  UPDATE public.customers
  SET profile_id=v_profile_id,
      email=coalesce(email, v_auth_email),
      updated_at=pg_catalog.now()
  WHERE id=v_customer.id
    AND organization_id=v_invitation.organization_id
    AND profile_id IS NULL
    AND status='approved'
  RETURNING * INTO v_customer;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='تغير ارتباط سجل العميل أثناء التفعيل؛ أعد تحميل الصفحة.';
  END IF;

  UPDATE public.customer_activation_invitations
  SET status='accepted', accepted_by_profile_id=v_profile_id,
      accepted_at=pg_catalog.now(), updated_at=pg_catalog.now()
  WHERE id=v_invitation.id AND status='pending';

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value, created_at
  ) VALUES (
    v_invitation.organization_id, v_profile_id, 'customer_activation_invitation.accepted',
    'customer_activation_invitation', v_invitation.id,
    pg_catalog.jsonb_build_object('status','pending','customer_id',v_customer.id),
    pg_catalog.jsonb_build_object('status','accepted','customer_id',v_customer.id,'profile_id',v_profile_id,'email',v_auth_email),
    pg_catalog.now()
  );

  RETURN pg_catalog.jsonb_build_object(
    'invitation_id', v_invitation.id,
    'customer_id', v_customer.id,
    'business_name', v_customer.business_name,
    'email', v_auth_email,
    'status', 'active'
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.accept_customer_activation_invitation(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accept_customer_activation_invitation(text) TO authenticated;
