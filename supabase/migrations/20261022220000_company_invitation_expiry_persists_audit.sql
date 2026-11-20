-- Persist expired invitation state while returning a user-actionable response.
-- Record one tenant-scoped audit event for all pending -> expired transitions, including owner-list cleanup.
BEGIN;

-- Accept current SHA-256 token digests and legacy MD5 digests during staged rollout.
ALTER TABLE public.customer_company_invitations
  DROP CONSTRAINT IF EXISTS customer_company_invitations_token_hash_check;
ALTER TABLE public.customer_company_invitations
  ADD CONSTRAINT customer_company_invitations_token_hash_check
  CHECK (token_hash ~ '^([0-9a-f]{32}|[0-9a-f]{64})$');

CREATE OR REPLACE FUNCTION public.audit_customer_company_invitation_expiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
BEGIN
  IF OLD.status='pending' AND NEW.status='expired' THEN
    INSERT INTO public.audit_logs(
      organization_id,actor_id,action,entity_type,entity_id,new_value,created_at
    ) VALUES (
      NEW.organization_id,
      public.current_profile_id(),
      'customer_company_invitation.expired',
      'customer_company_invitation',
      NEW.id,
      pg_catalog.jsonb_build_object(
        'invited_email',NEW.invited_email,
        'member_role',NEW.member_role,
        'expires_at',NEW.expires_at,
        'status','expired'
      ),
      pg_catalog.now()
    );
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.audit_customer_company_invitation_expiry() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS customer_company_invitation_expiry_audit ON public.customer_company_invitations;
CREATE TRIGGER customer_company_invitation_expiry_audit
AFTER UPDATE OF status ON public.customer_company_invitations
FOR EACH ROW
WHEN (OLD.status='pending' AND NEW.status='expired')
EXECUTE FUNCTION public.audit_customer_company_invitation_expiry();

CREATE OR REPLACE FUNCTION public.accept_customer_company_invitation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_profile uuid:=public.current_profile_id();
  v_email text:=pg_catalog.lower(pg_catalog.btrim(coalesce(auth.jwt()->>'email','')));
  v_confirmed_email text;
  v_crypto_schema text;
  v_token_sha256 text;
  v_invitation public.customer_company_invitations%ROWTYPE;
  v_org uuid;
  v_roles text[];
  v_membership uuid;
  v_company text;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.profiles p
     WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='يجب تسجيل الدخول بحساب نشط لقبول الدعوة';
  END IF;
  IF coalesce(p_token,'') !~ '^[0-9a-fA-F]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='رابط الدعوة غير صالح';
  END IF;
  -- Supabase installs pgcrypto outside public in some projects; resolve the actual extension schema.
  SELECT n.nspname INTO v_crypto_schema
    FROM pg_catalog.pg_extension e
    JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace
   WHERE e.extname='pgcrypto';
  IF v_crypto_schema IS NULL
     OR pg_catalog.to_regprocedure(pg_catalog.format('%I.digest(text,text)',v_crypto_schema)) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='pgcrypto SHA-256 digest function is unavailable';
  END IF;
  EXECUTE pg_catalog.format(
    'SELECT pg_catalog.encode(%I.digest($1::text, ''sha256''), ''hex'')',
    v_crypto_schema
  ) INTO v_token_sha256 USING pg_catalog.lower(p_token);

  SELECT i.* INTO v_invitation
    FROM public.customer_company_invitations i
   WHERE i.token_hash IN (
     v_token_sha256,
     pg_catalog.md5(pg_catalog.lower(p_token))
   )
   FOR UPDATE;
  IF NOT FOUND OR v_invitation.status<>'pending' THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='الدعوة غير موجودة أو استُخدمت أو أُلغيت';
  END IF;
  IF v_invitation.expires_at<=pg_catalog.now() THEN
    UPDATE public.customer_company_invitations
       SET status='expired',updated_at=pg_catalog.now()
     WHERE id=v_invitation.id AND status='pending';
    -- Returning (rather than raising) commits the status and audit trigger.
    -- The client converts this explicit result into a localized actionable error.
    RETURN pg_catalog.jsonb_build_object(
      'status','expired',
      'error','انتهت صلاحية الدعوة؛ اطلب رابطًا جديدًا'
    );
  END IF;
  -- Reject a mismatched claimed identity first for a clear denial; this claim never proves confirmation.
  IF v_email='' OR v_email<>v_invitation.invited_email THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='سجّل الدخول بالبريد الإلكتروني الذي استلم الدعوة';
  END IF;
  -- Read confirmation and the authoritative address from Auth; a JWT confirmation claim is not proof.
  SELECT pg_catalog.lower(pg_catalog.btrim(coalesce(u.email,'')))
    INTO v_confirmed_email
  FROM auth.users u
  WHERE u.id=auth.uid() AND u.email_confirmed_at IS NOT NULL;
  IF NOT FOUND OR v_confirmed_email='' THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='أكّد بريدك الإلكتروني قبل قبول الدعوة';
  END IF;
  IF v_confirmed_email<>v_invitation.invited_email THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='سجّل الدخول بالبريد الإلكتروني الذي استلم الدعوة';
  END IF;
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS DISTINCT FROM v_invitation.organization_id THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='حسابك لا ينتمي إلى نطاق المؤسسة المدعوة';
  END IF;
  SELECT pg_catalog.array_agg(r.role ORDER BY r.role) INTO v_roles
    FROM public.user_roles r WHERE r.profile_id=v_profile;
  IF NOT coalesce('customer'=ANY(v_roles),false)
     OR coalesce(v_roles,ARRAY[]::text[]) && ARRAY['admin','manager','staff','accountant']::text[] THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='الدعوة مخصصة لحساب عميل وليست حساب فريق تشغيل';
  END IF;
  IF EXISTS(SELECT 1 FROM public.customers c WHERE c.profile_id=v_profile) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='هذا الحساب مرتبط بالفعل بسجل عميل مستقل؛ يلزم ربطه يدويًا دون نقل تاريخه';
  END IF;
  IF EXISTS(SELECT 1 FROM public.customer_company_memberships m WHERE m.profile_id=v_profile AND m.status='active') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='هذا الحساب مرتبط بالفعل بشركة أخرى';
  END IF;
  INSERT INTO public.customer_company_memberships(
    organization_id,customer_id,profile_id,member_role,status,invited_by,accepted_at,created_at,updated_at
  )
  VALUES(
    v_invitation.organization_id,v_invitation.customer_id,v_profile,v_invitation.member_role,
    'active',v_invitation.invited_by,pg_catalog.now(),pg_catalog.now(),pg_catalog.now()
  )
  ON CONFLICT(customer_id,profile_id) DO UPDATE
     SET member_role=EXCLUDED.member_role,status='active',invited_by=EXCLUDED.invited_by,
         accepted_at=pg_catalog.now(),updated_at=pg_catalog.now()
   WHERE public.customer_company_memberships.status='revoked'
  RETURNING id INTO v_membership;
  IF v_membership IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='تعذر تفعيل عضوية الشركة؛ تحقق من العضويات السابقة';
  END IF;
  UPDATE public.customer_company_invitations
     SET status='accepted',accepted_by=v_profile,accepted_at=pg_catalog.now(),updated_at=pg_catalog.now()
   WHERE id=v_invitation.id AND status='pending';
  SELECT c.business_name INTO v_company
    FROM public.customers c
   WHERE c.id=v_invitation.customer_id AND c.organization_id=v_invitation.organization_id;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value,created_at)
  VALUES(
    v_invitation.organization_id,v_profile,'customer_company_invitation.accepted',
    'customer_company_membership',v_membership,
    pg_catalog.jsonb_build_object('member_role',v_invitation.member_role),pg_catalog.now()
  );
  RETURN pg_catalog.jsonb_build_object(
    'membership_id',v_membership,'customer_id',v_invitation.customer_id,
    'company_name',v_company,'member_role',v_invitation.member_role,'status','active'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.accept_customer_company_invitation(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accept_customer_company_invitation(text) TO authenticated;

COMMIT;
