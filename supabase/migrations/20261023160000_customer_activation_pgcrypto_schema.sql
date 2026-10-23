-- Repair customer activation token generation when pgcrypto lives outside public.
-- Existing invitation records and tokens are preserved; only newly issued tokens use
-- the dynamically discovered pgcrypto extension schema for secure random bytes and SHA-256.
CREATE OR REPLACE FUNCTION public.customer_activation_invitation_random_token()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_crypto_schema text;
  v_token text;
BEGIN
  SELECT n.nspname INTO v_crypto_schema
  FROM pg_catalog.pg_extension e
  JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace
  WHERE e.extname='pgcrypto';

  IF v_crypto_schema IS NULL
     OR pg_catalog.to_regprocedure(pg_catalog.format('%I.gen_random_bytes(integer)',v_crypto_schema)) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='pgcrypto secure random token function is unavailable';
  END IF;

  EXECUTE pg_catalog.format(
    'SELECT pg_catalog.encode(%I.gen_random_bytes(32), ''hex'')',
    v_crypto_schema
  ) INTO v_token;
  RETURN v_token;
END;
$function$;
REVOKE ALL ON FUNCTION public.customer_activation_invitation_random_token() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.customer_activation_invitation_sha256(p_token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_crypto_schema text;
  v_hash text;
BEGIN
  IF p_token IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invitation token is required';
  END IF;

  SELECT n.nspname INTO v_crypto_schema
  FROM pg_catalog.pg_extension e
  JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace
  WHERE e.extname='pgcrypto';

  IF v_crypto_schema IS NULL
     OR pg_catalog.to_regprocedure(pg_catalog.format('%I.digest(text,text)',v_crypto_schema)) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='pgcrypto SHA-256 digest function is unavailable';
  END IF;

  EXECUTE pg_catalog.format(
    'SELECT pg_catalog.encode(%I.digest($1::text, ''sha256''), ''hex'')',
    v_crypto_schema
  ) INTO v_hash USING p_token;
  RETURN v_hash;
END;
$function$;
REVOKE ALL ON FUNCTION public.customer_activation_invitation_sha256(text) FROM PUBLIC,anon,authenticated;

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

  UPDATE public.customer_activation_invitations
  SET status='revoked', revoked_at=pg_catalog.now(), updated_at=pg_catalog.now()
  WHERE customer_id=v_customer.id AND organization_id=v_org_id AND status='pending';

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
