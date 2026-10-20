-- Staff-managed first-login activation for an existing, approved customer record.
-- Keep this separate from customer_company_invitations: that flow adds members to a
-- customer account which is already linked to a profile; this flow links one new
-- customer login to a staff-created customer row.
CREATE TABLE IF NOT EXISTS public.customer_activation_invitations (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  invited_email text NOT NULL CHECK (
    invited_email = pg_catalog.lower(pg_catalog.btrim(invited_email))
    AND pg_catalog.length(invited_email) BETWEEN 5 AND 254
    AND invited_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  ),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked')),
  invited_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  accepted_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CHECK (NOT (accepted_at IS NOT NULL AND revoked_at IS NOT NULL)),
  CHECK ((status <> 'accepted') OR accepted_at IS NOT NULL),
  CHECK ((status <> 'revoked') OR revoked_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS customer_activation_invitations_customer_created_idx
  ON public.customer_activation_invitations(organization_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customer_activation_invitations_expiry_idx
  ON public.customer_activation_invitations(expires_at) WHERE status='pending';
CREATE UNIQUE INDEX IF NOT EXISTS customer_activation_invitations_one_pending_customer_idx
  ON public.customer_activation_invitations(customer_id) WHERE status='pending';

ALTER TABLE public.customer_activation_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customer_activation_invitations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.customer_activation_invitations TO service_role;

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
  IF auth.uid() IS NULL OR v_profile_id IS NULL OR v_org_id IS NULL OR NOT public.is_staff() THEN
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

  v_token := pg_catalog.encode(public.gen_random_bytes(32), 'hex');
  v_expires_at := pg_catalog.now() + pg_catalog.make_interval(hours => p_expires_hours);
  INSERT INTO public.customer_activation_invitations(
    organization_id, customer_id, invited_email, token_hash,
    invited_by_profile_id, expires_at
  )
  VALUES(
    v_org_id, v_customer.id, v_email,
    pg_catalog.encode(public.digest(v_token, 'sha256'), 'hex'),
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
  IF auth.uid() IS NULL OR v_profile_id IS NULL OR v_org_id IS NULL OR NOT public.is_staff() THEN
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
  IF auth.uid() IS NULL OR v_profile_id IS NULL OR v_org_id IS NULL OR NOT public.is_staff() THEN
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

CREATE OR REPLACE FUNCTION public.accept_customer_activation_invitation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile_id uuid := public.current_profile_id();
  v_auth_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(auth.jwt()->>'email','')));
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
  IF pg_catalog.nullif(auth.jwt()->>'email_confirmed_at','') IS NULL THEN
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
  WHERE i.token_hash=pg_catalog.encode(public.digest(pg_catalog.lower(pg_catalog.btrim(p_token)), 'sha256'), 'hex')
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

REVOKE ALL ON FUNCTION public.create_customer_activation_invitation(uuid,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_customer_activation_invitation(uuid,text,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.list_customer_activation_invitations(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_customer_activation_invitations(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.revoke_customer_activation_invitation(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.revoke_customer_activation_invitation(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.accept_customer_activation_invitation(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accept_customer_activation_invitation(text) TO authenticated;
