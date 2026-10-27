-- AGH-COMPANY-MEMBER-INVITE-REVOCATION-001
-- Prevent stale pending company invitations from reactivating a member after the owner revokes access.
-- All invitation acceptance and membership revocation operations acquire the customer row before
-- locking invitation rows so their lock order is consistent and deadlock-safe.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_customer_company_invitation(
  p_email text,
  p_member_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_customer public.customers%ROWTYPE;
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
  v_role text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_member_role, '')));
  v_token text;
  v_id uuid;
  v_expires timestamptz := pg_catalog.now() + interval '7 days';
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sign in required';
  END IF;
  IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     OR pg_catalog.length(v_email) > 254 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'أدخل بريدًا إلكترونيًا صحيحًا للدعوة';
  END IF;
  IF v_role NOT IN ('buyer', 'finance', 'viewer') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'دور عضو الشركة غير مسموح';
  END IF;

  SELECT c.* INTO v_customer
    FROM public.customers AS c
    JOIN public.profiles AS p ON p.id = c.profile_id
   WHERE p.id = v_profile
     AND p.auth_user_id = auth.uid()
     AND p.is_active
     AND p.organization_id = c.organization_id
     AND c.organization_id = public.current_organization_id()
   ORDER BY c.created_at, c.id
   LIMIT 1
   FOR UPDATE OF c;

  IF NOT FOUND OR v_customer.status <> 'approved' THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'يجب أن يكون حساب مالك الشركة نشطًا ومعتمدًا لإرسال الدعوات';
  END IF;
  IF v_email = pg_catalog.lower(coalesce(auth.jwt() ->> 'email', '')) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'لا يمكن دعوة بريد حساب المالك نفسه';
  END IF;

  -- Do not create a pending invitation for someone who already has active access.
  -- The account email is authoritative for acceptance; profile email is retained as a
  -- secondary match for installations whose profile email is the synchronized source.
  IF EXISTS (
    SELECT 1
      FROM public.customer_company_memberships AS m
      JOIN public.profiles AS member_profile ON member_profile.id = m.profile_id
      LEFT JOIN auth.users AS member_auth ON member_auth.id = member_profile.auth_user_id
     WHERE m.customer_id = v_customer.id
       AND m.organization_id = v_customer.organization_id
       AND m.status = 'active'
       AND (
         pg_catalog.lower(pg_catalog.btrim(coalesce(member_auth.email, ''))) = v_email
         OR pg_catalog.lower(pg_catalog.btrim(coalesce(member_profile.email, ''))) = v_email
       )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'البريد الإلكتروني مرتبط بعضوية نشطة في الشركة بالفعل';
  END IF;

  UPDATE public.customer_company_invitations
     SET status = 'revoked', updated_at = pg_catalog.now()
   WHERE customer_id = v_customer.id
     AND invited_email = v_email
     AND status = 'pending';

  v_token := pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '')
          || pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');

  INSERT INTO public.customer_company_invitations(
    organization_id, customer_id, invited_email, member_role, token_hash,
    status, invited_by, expires_at
  ) VALUES (
    v_customer.organization_id, v_customer.id, v_email, v_role, pg_catalog.md5(v_token),
    'pending', v_profile, v_expires
  ) RETURNING id INTO v_id;

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity_type, entity_id, new_value, created_at
  ) VALUES (
    v_customer.organization_id, v_profile, 'customer_company_invitation.created',
    'customer_company_invitation', v_id,
    pg_catalog.jsonb_build_object('member_role', v_role, 'expires_at', v_expires),
    pg_catalog.now()
  );

  RETURN pg_catalog.jsonb_build_object(
    'invitation_id', v_id, 'invited_email', v_email, 'member_role', v_role,
    'invitation_token', v_token, 'expires_at', v_expires
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_customer_company_invitation(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_customer_company_invitation(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_customer_company_invitation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(auth.jwt() ->> 'email', '')));
  v_invitation public.customer_company_invitations%ROWTYPE;
  v_customer public.customers%ROWTYPE;
  v_invitation_id uuid;
  v_customer_id uuid;
  v_invitation_org uuid;
  v_org uuid;
  v_roles text[];
  v_membership uuid;
  v_company text;
  v_changed integer;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles AS p
     WHERE p.id = v_profile AND p.auth_user_id = auth.uid() AND p.is_active
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'يجب تسجيل الدخول بحساب نشط لقبول الدعوة';
  END IF;
  IF coalesce(p_token, '') !~ '^[0-9a-fA-F]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'رابط الدعوة غير صالح';
  END IF;

  -- Resolve the customer without locking the invitation. Lock order is customer first,
  -- invitation second, matching revoke_customer_company_member(). This closes the window
  -- where a pre-existing pending invitation could re-activate a member after revocation.
  SELECT i.* INTO v_invitation
    FROM public.customer_company_invitations AS i
   WHERE i.token_hash = pg_catalog.md5(pg_catalog.lower(p_token));

  IF NOT FOUND OR v_invitation.status <> 'pending' THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'الدعوة غير موجودة أو استُخدمت أو أُلغيت';
  END IF;

  v_invitation_id := v_invitation.id;
  v_customer_id := v_invitation.customer_id;
  v_invitation_org := v_invitation.organization_id;

  SELECT c.* INTO v_customer
    FROM public.customers AS c
   WHERE c.id = v_customer_id
     AND c.organization_id = v_invitation_org
   FOR SHARE;

  IF NOT FOUND OR v_customer.status <> 'approved' THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'حساب الشركة غير نشط أو غير معتمد لقبول الدعوة';
  END IF;

  -- Re-read and lock the invitation only after acquiring the customer row lock.
  -- A concurrent revocation may have changed its state while this call waited.
  SELECT i.* INTO v_invitation
    FROM public.customer_company_invitations AS i
   WHERE i.id = v_invitation_id
     AND i.token_hash = pg_catalog.md5(pg_catalog.lower(p_token))
   FOR UPDATE;

  IF NOT FOUND OR v_invitation.status <> 'pending' THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'الدعوة غير موجودة أو استُخدمت أو أُلغيت';
  END IF;

  IF v_invitation.expires_at <= pg_catalog.now() THEN
    UPDATE public.customer_company_invitations
       SET status = 'expired', updated_at = pg_catalog.now()
     WHERE id = v_invitation.id;
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'انتهت صلاحية الدعوة؛ اطلب رابطًا جديدًا';
  END IF;
  IF nullif(auth.jwt() ->> 'email_confirmed_at', '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'أكّد بريدك الإلكتروني قبل قبول الدعوة';
  END IF;
  IF v_email = '' OR v_email <> v_invitation.invited_email THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'سجّل الدخول بالبريد الإلكتروني الذي استلم الدعوة';
  END IF;

  SELECT p.organization_id INTO v_org
    FROM public.profiles AS p
   WHERE p.id = v_profile AND p.auth_user_id = auth.uid() AND p.is_active;
  IF v_org IS DISTINCT FROM v_invitation.organization_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'حسابك لا ينتمي إلى نطاق المؤسسة المدعوة';
  END IF;

  SELECT pg_catalog.array_agg(r.role ORDER BY r.role) INTO v_roles
    FROM public.user_roles AS r WHERE r.profile_id = v_profile;
  IF NOT coalesce('customer' = ANY(v_roles), false)
     OR coalesce(v_roles, ARRAY[]::text[]) && ARRAY['admin','manager','staff','accountant']::text[] THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'الدعوة مخصصة لحساب عميل وليست حساب فريق تشغيل';
  END IF;
  IF EXISTS (SELECT 1 FROM public.customers AS c WHERE c.profile_id = v_profile) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'هذا الحساب مرتبط بالفعل بسجل عميل مستقل؛ يلزم ربطه يدويًا دون نقل تاريخه';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.customer_company_memberships AS m
     WHERE m.profile_id = v_profile AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'هذا الحساب مرتبط بالفعل بشركة أخرى';
  END IF;

  INSERT INTO public.customer_company_memberships(
    organization_id, customer_id, profile_id, member_role, status,
    invited_by, accepted_at, created_at, updated_at
  ) VALUES (
    v_invitation.organization_id, v_invitation.customer_id, v_profile,
    v_invitation.member_role, 'active', v_invitation.invited_by,
    pg_catalog.now(), pg_catalog.now(), pg_catalog.now()
  )
  ON CONFLICT (customer_id, profile_id)
  DO UPDATE SET
    member_role = EXCLUDED.member_role,
    status = 'active',
    invited_by = EXCLUDED.invited_by,
    accepted_at = pg_catalog.now(),
    updated_at = pg_catalog.now()
  WHERE public.customer_company_memberships.status = 'revoked'
  RETURNING id INTO v_membership;

  IF v_membership IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'تعذر تفعيل عضوية الشركة؛ تحقق من العضويات السابقة';
  END IF;

  UPDATE public.customer_company_invitations
     SET status = 'accepted', accepted_by = v_profile,
         accepted_at = pg_catalog.now(), updated_at = pg_catalog.now()
   WHERE id = v_invitation.id AND status = 'pending'
  RETURNING id INTO v_invitation_id;
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  IF v_changed <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'الدعوة غير موجودة أو استُخدمت أو أُلغيت';
  END IF;

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity_type, entity_id, new_value, created_at
  ) VALUES (
    v_invitation.organization_id, v_profile, 'customer_company_invitation.accepted',
    'customer_company_membership', v_membership,
    pg_catalog.jsonb_build_object('member_role', v_invitation.member_role),
    pg_catalog.now()
  );

  RETURN pg_catalog.jsonb_build_object(
    'membership_id', v_membership, 'customer_id', v_invitation.customer_id,
    'company_name', v_customer.business_name, 'member_role', v_invitation.member_role,
    'status', 'active'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.accept_customer_company_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_customer_company_invitation(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_customer_company_member(p_profile_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_customer uuid;
  v_org uuid;
  v_membership uuid;
  v_member_email text;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sign in required';
  END IF;

  SELECT c.id, c.organization_id
    INTO v_customer, v_org
    FROM public.customers AS c
    JOIN public.profiles AS p ON p.id = c.profile_id
   WHERE p.id = v_profile
     AND p.auth_user_id = auth.uid()
     AND p.is_active
     AND p.organization_id = c.organization_id
     AND c.organization_id = public.current_organization_id()
   ORDER BY c.created_at, c.id
   LIMIT 1
   FOR UPDATE OF c;

  IF v_customer IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'إلغاء عضوية الشركة متاح لمالك الحساب فقط';
  END IF;
  IF p_profile_id IS NULL OR p_profile_id = v_profile THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'لا يمكن إلغاء عضوية حساب المالك الحالي';
  END IF;

  SELECT pg_catalog.lower(pg_catalog.btrim(coalesce(u.email, p.email, '')))
    INTO v_member_email
    FROM public.profiles AS p
    LEFT JOIN auth.users AS u ON u.id = p.auth_user_id
   WHERE p.id = p_profile_id;

  UPDATE public.customer_company_memberships AS m
     SET status = 'revoked', updated_at = pg_catalog.now()
   WHERE m.profile_id = p_profile_id
     AND m.customer_id = v_customer
     AND m.organization_id = v_org
     AND m.status = 'active'
  RETURNING m.id INTO v_membership;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'عضوية الشركة غير نشطة أو غير موجودة';
  END IF;

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity_type, entity_id, new_value, created_at
  ) VALUES (
    v_org, v_profile, 'customer_company_member.revoked',
    'customer_company_membership', v_membership,
    pg_catalog.jsonb_build_object('member_profile_id', p_profile_id),
    pg_catalog.now()
  );

  -- A pending invitation for this member's current login email would otherwise survive
  -- revocation and permit the user to re-activate the membership on a later retry.
  WITH revoked_invitations AS (
    UPDATE public.customer_company_invitations AS i
       SET status = 'revoked', updated_at = pg_catalog.now()
     WHERE i.customer_id = v_customer
       AND i.organization_id = v_org
       AND i.status = 'pending'
       AND i.invited_email = v_member_email
    RETURNING i.id
  )
  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value, created_at
  )
  SELECT v_org, v_profile, 'customer_company_invitation.revoked_by_member_revocation',
         'customer_company_invitation', i.id,
         pg_catalog.jsonb_build_object('status', 'pending'),
         pg_catalog.jsonb_build_object('status', 'revoked', 'member_profile_id', p_profile_id),
         pg_catalog.now()
    FROM revoked_invitations AS i;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.revoke_customer_company_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_customer_company_member(uuid) TO authenticated;

COMMIT;
