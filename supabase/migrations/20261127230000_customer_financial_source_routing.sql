BEGIN;

-- One authoritative financial source per tenant-owned customer account.
-- This migration defines the server contract only; provider transport/readers remain P4-owned.

INSERT INTO public.authorization_capabilities
  (capability_key,domain,resource,action,sensitivity,scope_kind,approval_mode,separation_of_duties,state_requirements,legacy_operation_id)
VALUES
  ('finance.customer_source.request','finance','customer_financial_source','request_source_change','financial','organization','approval_required',false,
   '{"requires_reason":true,"requires_idempotency":true,"requires_source_reconciliation":true}','customer_financial_source_request'),
  ('finance.customer_source.approve','finance','customer_financial_source','approve_source_change','financial','organization','maker_checker',true,
   '{"maker_must_differ_from_checker":true,"requires_matched_reconciliation":true,"requires_current_revision":true}','customer_financial_source_approve')
ON CONFLICT (capability_key) DO NOTHING;

-- Keep the same established finance role boundary (admin/manager/accountant) for requests.
-- Every approval is still protected by a distinct maker/checker identity in the review RPC.
INSERT INTO public.authorization_role_capabilities(role,capability_key,grant_source)
SELECT rc.role, c.capability_key, 'finance-source:finance.workspace.manage-parity'
  FROM public.authorization_role_capabilities rc
  JOIN public.authorization_capabilities c
    ON c.capability_key IN ('finance.customer_source.request','finance.customer_source.approve')
 WHERE rc.capability_key='finance.workspace.manage'
ON CONFLICT (role,capability_key) DO NOTHING;

CREATE TABLE public.customer_financial_source_bindings (
  organization_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  source_mode text NOT NULL DEFAULT 'APP_ONLY'
    CHECK (source_mode IN ('APP_ONLY','ONYX','MUTAKAMEL')),
  source_status text NOT NULL DEFAULT 'active'
    CHECK (source_status IN ('active','suspended')),
  external_account_ref text,
  company_external_ref text,
  branch_external_ref text,
  source_as_of timestamptz,
  last_synced_at timestamptz,
  source_evidence_sha256 text,
  verified_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (organization_id,customer_id),
  CONSTRAINT customer_financial_source_customer_tenant_fk
    FOREIGN KEY (customer_id,organization_id)
    REFERENCES public.customers(id,organization_id) ON DELETE RESTRICT,
  CONSTRAINT customer_financial_source_external_reference_ck CHECK (
    (source_mode='APP_ONLY' AND external_account_ref IS NULL AND company_external_ref IS NULL AND branch_external_ref IS NULL)
    OR (source_mode IN ('ONYX','MUTAKAMEL')
        AND external_account_ref IS NOT NULL AND length(btrim(external_account_ref)) BETWEEN 1 AND 160
        AND external_account_ref !~ '://' AND position('@' in external_account_ref)=0
        AND company_external_ref IS NOT NULL AND length(btrim(company_external_ref)) BETWEEN 1 AND 256
        AND company_external_ref !~ '://' AND position('@' in company_external_ref)=0
        AND branch_external_ref IS NOT NULL AND length(btrim(branch_external_ref)) BETWEEN 1 AND 256
        AND branch_external_ref !~ '://' AND position('@' in branch_external_ref)=0)
  ),
  CONSTRAINT customer_financial_source_external_evidence_ck CHECK (
    source_mode='APP_ONLY'
    OR (source_evidence_sha256 IS NOT NULL
        AND source_evidence_sha256 ~ '^[0-9a-f]{64}$'
        AND source_as_of IS NOT NULL
        AND last_synced_at IS NOT NULL
        AND verified_at IS NOT NULL)
  ),
  CONSTRAINT customer_financial_source_evidence_hash_ck CHECK (
    source_evidence_sha256 IS NULL OR source_evidence_sha256 ~ '^[0-9a-f]{64}$'
  )
);

CREATE INDEX customer_financial_source_provider_lookup
  ON public.customer_financial_source_bindings(organization_id,source_mode,source_status)
  WHERE source_mode IN ('ONYX','MUTAKAMEL');

CREATE UNIQUE INDEX customer_financial_source_external_identity_uniq
  ON public.customer_financial_source_bindings
    (organization_id,source_mode,company_external_ref,branch_external_ref,external_account_ref)
  WHERE source_mode IN ('ONYX','MUTAKAMEL');

CREATE TABLE public.customer_financial_source_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  current_source_mode text NOT NULL CHECK (current_source_mode IN ('APP_ONLY','ONYX','MUTAKAMEL')),
  target_source_mode text NOT NULL CHECK (target_source_mode IN ('APP_ONLY','ONYX','MUTAKAMEL')),
  target_external_account_ref text,
  target_company_external_ref text,
  target_branch_external_ref text,
  expected_binding_revision integer NOT NULL CHECK (expected_binding_revision>=1),
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 16 AND 128),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 5 AND 500),
  status text NOT NULL DEFAULT 'pending_reconciliation'
    CHECK (status IN ('pending_reconciliation','pending_approval','approved','rejected','cancelled')),
  latest_evidence_id uuid,
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  review_reason text,
  requested_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  reviewed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,idempotency_key),
  FOREIGN KEY (customer_id,organization_id)
    REFERENCES public.customers(id,organization_id) ON DELETE RESTRICT,
  CONSTRAINT customer_source_request_target_ref_ck CHECK (
    (target_source_mode='APP_ONLY' AND target_external_account_ref IS NULL
      AND target_company_external_ref IS NULL AND target_branch_external_ref IS NULL)
    OR (target_source_mode IN ('ONYX','MUTAKAMEL')
        AND target_external_account_ref IS NOT NULL AND length(btrim(target_external_account_ref)) BETWEEN 1 AND 160
        AND target_external_account_ref !~ '://' AND position('@' in target_external_account_ref)=0
        AND target_company_external_ref IS NOT NULL AND length(btrim(target_company_external_ref)) BETWEEN 1 AND 256
        AND target_company_external_ref !~ '://' AND position('@' in target_company_external_ref)=0
        AND target_branch_external_ref IS NOT NULL AND length(btrim(target_branch_external_ref)) BETWEEN 1 AND 256
        AND target_branch_external_ref !~ '://' AND position('@' in target_branch_external_ref)=0)
  ),
  CONSTRAINT customer_source_request_different_mode_ck CHECK (
    current_source_mode<>target_source_mode
    OR (current_source_mode IN ('ONYX','MUTAKAMEL') AND target_external_account_ref IS NOT NULL)
  )
);

CREATE UNIQUE INDEX customer_financial_source_one_pending_change
  ON public.customer_financial_source_change_requests(organization_id,customer_id)
  WHERE status IN ('pending_reconciliation','pending_approval');

CREATE TABLE public.customer_financial_source_reconciliation_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  request_id uuid NOT NULL,
  current_source_mode text NOT NULL CHECK (current_source_mode IN ('APP_ONLY','ONYX','MUTAKAMEL')),
  target_source_mode text NOT NULL CHECK (target_source_mode IN ('APP_ONLY','ONYX','MUTAKAMEL')),
  company_external_ref text,
  branch_external_ref text,
  reconciliation_result text NOT NULL CHECK (reconciliation_result IN ('matched','mismatch')),
  source_as_of timestamptz NOT NULL,
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  currency_codes text[] NOT NULL CHECK (cardinality(currency_codes) BETWEEN 1 AND 10),
  record_counts jsonb NOT NULL CHECK (jsonb_typeof(record_counts)='object'),
  balances_by_currency jsonb NOT NULL CHECK (jsonb_typeof(balances_by_currency)='object'),
  source_reference text CHECK (
    source_reference IS NULL
    OR (length(btrim(source_reference)) BETWEEN 1 AND 200
        AND source_reference !~ '://'
        AND position('@' in source_reference)=0)
  ),
  recorded_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  UNIQUE (request_id,evidence_sha256),
  UNIQUE (request_id,id),
  FOREIGN KEY (organization_id,request_id)
    REFERENCES public.customer_financial_source_change_requests(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (customer_id,organization_id)
    REFERENCES public.customers(id,organization_id) ON DELETE RESTRICT,
  CHECK (source_as_of<=recorded_at),
  CHECK (
    (target_source_mode='APP_ONLY' AND company_external_ref IS NULL AND branch_external_ref IS NULL)
    OR (target_source_mode IN ('ONYX','MUTAKAMEL')
      AND company_external_ref IS NOT NULL AND length(btrim(company_external_ref)) BETWEEN 1 AND 256
      AND company_external_ref !~ '://' AND position('@' in company_external_ref)=0
      AND branch_external_ref IS NOT NULL AND length(btrim(branch_external_ref)) BETWEEN 1 AND 256
      AND branch_external_ref !~ '://' AND position('@' in branch_external_ref)=0)
  )
);

ALTER TABLE public.customer_financial_source_change_requests
  ADD CONSTRAINT customer_source_request_latest_evidence_fk
  FOREIGN KEY (id,latest_evidence_id)
  REFERENCES public.customer_financial_source_reconciliation_evidence(request_id,id)
  ON DELETE RESTRICT;

CREATE TABLE public.customer_financial_source_sync_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  source_mode text NOT NULL CHECK (source_mode IN ('ONYX','MUTAKAMEL')),
  external_account_ref text NOT NULL CHECK (
    length(btrim(external_account_ref)) BETWEEN 1 AND 160
    AND external_account_ref !~ '://'
    AND position('@' in external_account_ref)=0
  ),
  company_external_ref text NOT NULL CHECK (length(btrim(company_external_ref)) BETWEEN 1 AND 256 AND company_external_ref !~ '://' AND position('@' in company_external_ref)=0),
  branch_external_ref text NOT NULL CHECK (length(btrim(branch_external_ref)) BETWEEN 1 AND 256 AND branch_external_ref !~ '://' AND position('@' in branch_external_ref)=0),
  source_as_of timestamptz NOT NULL,
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  record_count integer NOT NULL CHECK (record_count>=0),
  currency_codes text[] NOT NULL CHECK (cardinality(currency_codes) BETWEEN 1 AND 10),
  source_reference text CHECK (
    source_reference IS NULL
    OR (length(btrim(source_reference)) BETWEEN 1 AND 200
        AND source_reference !~ '://'
        AND position('@' in source_reference)=0)
  ),
  recorded_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  UNIQUE (organization_id,customer_id,evidence_sha256),
  FOREIGN KEY (organization_id,customer_id)
    REFERENCES public.customer_financial_source_bindings(organization_id,customer_id) ON DELETE RESTRICT,
  CHECK (source_as_of<=recorded_at)
);

ALTER TABLE public.customer_financial_source_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_financial_source_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_financial_source_reconciliation_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_financial_source_sync_evidence ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.customer_financial_source_bindings FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.customer_financial_source_change_requests FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.customer_financial_source_reconciliation_evidence FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.customer_financial_source_sync_evidence FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.customer_financial_source_bindings FROM service_role;
REVOKE ALL ON TABLE public.customer_financial_source_change_requests FROM service_role;
REVOKE ALL ON TABLE public.customer_financial_source_reconciliation_evidence FROM service_role;
REVOKE ALL ON TABLE public.customer_financial_source_sync_evidence FROM service_role;
-- The narrowly scoped SECURITY DEFINER RPCs below are the only write path; do not grant direct table DML to the ERP service role.

INSERT INTO public.customer_financial_source_bindings(
  organization_id,customer_id,source_mode,source_status,revision,created_at,updated_at
)
SELECT c.organization_id,c.id,'APP_ONLY','active',1,statement_timestamp(),statement_timestamp()
  FROM public.customers c
ON CONFLICT (organization_id,customer_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_customer_financial_source_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
BEGIN
  INSERT INTO public.customer_financial_source_bindings(
    organization_id,customer_id,source_mode,source_status,revision,created_by,updated_by
  ) VALUES (
    NEW.organization_id,NEW.id,'APP_ONLY','active',1,public.current_profile_id(),public.current_profile_id()
  )
  ON CONFLICT (organization_id,customer_id) DO NOTHING;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.ensure_customer_financial_source_binding() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS customers_create_financial_source_binding ON public.customers;
CREATE TRIGGER customers_create_financial_source_binding
AFTER INSERT ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.ensure_customer_financial_source_binding();

CREATE OR REPLACE FUNCTION public.request_customer_financial_source_change(
  p_customer_id uuid,
  p_target_source_mode text,
  p_target_external_account_ref text,
  p_reason text,
  p_idempotency_key text,
  p_expected_binding_revision integer,
  p_target_company_external_ref text,
  p_target_branch_external_ref text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_customer public.customers%ROWTYPE;
  v_binding public.customer_financial_source_bindings%ROWTYPE;
  v_existing public.customer_financial_source_change_requests%ROWTYPE;
  v_request public.customer_financial_source_change_requests%ROWTYPE;
  v_fingerprint text;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL
     OR NOT public.current_actor_has_capability('finance.customer_source.request') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance.customer_source.request capability required';
  END IF;
  IF p_customer_id IS NULL
     OR p_target_source_mode IS NULL OR p_target_source_mode NOT IN ('APP_ONLY','ONYX','MUTAKAMEL')
     OR p_expected_binding_revision IS NULL OR p_expected_binding_revision<1
     OR p_reason IS NULL OR length(btrim(p_reason))<5 OR length(btrim(p_reason))>500
     OR p_idempotency_key IS NULL OR length(btrim(p_idempotency_key))<16 OR length(btrim(p_idempotency_key))>128 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='valid customer, source, revision, reason and idempotency key are required';
  END IF;
  IF p_target_source_mode='APP_ONLY' THEN
    IF nullif(btrim(coalesce(p_target_external_account_ref,'')),'') IS NOT NULL
       OR nullif(btrim(coalesce(p_target_company_external_ref,'')),'') IS NOT NULL
       OR nullif(btrim(coalesce(p_target_branch_external_ref,'')),'') IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='APP_ONLY source must not include ERP company, branch or account references';
    END IF;
  ELSIF p_target_external_account_ref IS NULL OR length(btrim(p_target_external_account_ref)) NOT BETWEEN 1 AND 160
     OR p_target_external_account_ref ~ '://' OR position('@' in p_target_external_account_ref)>0
     OR p_target_company_external_ref IS NULL OR length(btrim(p_target_company_external_ref)) NOT BETWEEN 1 AND 256
     OR p_target_company_external_ref ~ '://' OR position('@' in p_target_company_external_ref)>0
     OR p_target_branch_external_ref IS NULL OR length(btrim(p_target_branch_external_ref)) NOT BETWEEN 1 AND 256
     OR p_target_branch_external_ref ~ '://' OR position('@' in p_target_branch_external_ref)>0 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ERP source requires safe company, branch and customer account references';
  END IF;

  SELECT p.organization_id INTO v_org
    FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id AND o.is_active=true
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active finance organization context required';
  END IF;

  v_fingerprint:=pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(pg_catalog.jsonb_build_object(
      'customer_id',p_customer_id,
      'target_source_mode',p_target_source_mode,
      'target_external_account_ref',nullif(btrim(coalesce(p_target_external_account_ref,'')),''),
      'target_company_external_ref',nullif(btrim(coalesce(p_target_company_external_ref,'')),''),
      'target_branch_external_ref',nullif(btrim(coalesce(p_target_branch_external_ref,'')),''),
      'reason',btrim(p_reason),
      'expected_binding_revision',p_expected_binding_revision
    )::text,'UTF8'),'sha256'),'hex');

  -- Serialize retries by tenant/idempotency key before lookup, including concurrent identical requests.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text || ':' || btrim(p_idempotency_key),0));
  SELECT r.* INTO v_existing
    FROM public.customer_financial_source_change_requests r
   WHERE r.organization_id=v_org AND r.idempotency_key=btrim(p_idempotency_key)
   FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_fingerprint<>v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='source-change idempotency key was reused with a different payload';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'request_id',v_existing.id,'status',v_existing.status,'replayed',true,
      'target_source_mode',v_existing.target_source_mode);
  END IF;

  SELECT c.* INTO v_customer
    FROM public.customers c
   WHERE c.id=p_customer_id AND c.organization_id=v_org AND c.status='approved'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='approved customer is outside the active finance organization';
  END IF;
  SELECT b.* INTO v_binding
    FROM public.customer_financial_source_bindings b
   WHERE b.organization_id=v_org AND b.customer_id=p_customer_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='customer financial source binding is missing; repair source identity before requesting a cutover';
  END IF;
  IF v_binding.source_status<>'active' THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='customer financial source is suspended; restore verified source state before cutover';
  END IF;
  IF v_binding.revision<>p_expected_binding_revision THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='financial source revision changed; reload the customer binding before retrying';
  END IF;
  IF v_binding.source_mode=p_target_source_mode
     AND v_binding.external_account_ref IS NOT DISTINCT FROM nullif(btrim(coalesce(p_target_external_account_ref,'')),'')
     AND v_binding.company_external_ref IS NOT DISTINCT FROM nullif(btrim(coalesce(p_target_company_external_ref,'')),'')
     AND v_binding.branch_external_ref IS NOT DISTINCT FROM nullif(btrim(coalesce(p_target_branch_external_ref,'')),'') THEN
    RETURN pg_catalog.jsonb_build_object('changed',false,'source_mode',v_binding.source_mode,'revision',v_binding.revision,'replayed',false);
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.customer_financial_source_change_requests r
     WHERE r.organization_id=v_org AND r.customer_id=p_customer_id
       AND r.status IN ('pending_reconciliation','pending_approval')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='another financial source change is still pending for this customer';
  END IF;

  INSERT INTO public.customer_financial_source_change_requests(
    organization_id,customer_id,current_source_mode,target_source_mode,target_external_account_ref,
    target_company_external_ref,target_branch_external_ref,
    expected_binding_revision,idempotency_key,request_fingerprint,reason,status,requested_by
  ) VALUES (
    v_org,p_customer_id,v_binding.source_mode,p_target_source_mode,
    nullif(btrim(coalesce(p_target_external_account_ref,'')),''),
    nullif(btrim(coalesce(p_target_company_external_ref,'')),''),
    nullif(btrim(coalesce(p_target_branch_external_ref,'')),''),
    v_binding.revision,btrim(p_idempotency_key),v_fingerprint,btrim(p_reason),'pending_reconciliation',v_actor
  ) RETURNING * INTO v_request;

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'customer.financial_source.change.requested','customer_financial_source_binding',p_customer_id,
    pg_catalog.jsonb_build_object('source_mode',v_binding.source_mode,'revision',v_binding.revision),
    pg_catalog.jsonb_build_object('request_id',v_request.id,'target_source_mode',v_request.target_source_mode,
      'external_account_ref',v_request.target_external_account_ref,
      'company_external_ref',v_request.target_company_external_ref,
      'branch_external_ref',v_request.target_branch_external_ref,
      'status',v_request.status,'reason',v_request.reason));
  RETURN pg_catalog.jsonb_build_object(
    'request_id',v_request.id,'status',v_request.status,'replayed',false,
    'current_source_mode',v_request.current_source_mode,'target_source_mode',v_request.target_source_mode,
    'expected_binding_revision',v_request.expected_binding_revision);
END
$function$;
REVOKE ALL ON FUNCTION public.request_customer_financial_source_change(uuid,text,text,text,text,integer,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_customer_financial_source_change(uuid,text,text,text,text,integer,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_customer_financial_source_reconciliation_evidence(
  p_request_id uuid,
  p_source_as_of timestamptz,
  p_evidence_sha256 text,
  p_reconciliation_result text,
  p_currency_codes text[],
  p_record_counts jsonb,
  p_balances_by_currency jsonb,
  p_source_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_request public.customer_financial_source_change_requests%ROWTYPE;
  v_binding public.customer_financial_source_bindings%ROWTYPE;
  v_evidence public.customer_financial_source_reconciliation_evidence%ROWTYPE;
  v_existing public.customer_financial_source_reconciliation_evidence%ROWTYPE;
  v_balance record;
  v_balance_currency_count integer;
  v_balance_field_count integer;
BEGIN
  IF auth.uid() IS NOT NULL OR coalesce(auth.role(),'')<>'service_role' THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='service-role ERP reconciliation evidence writer required';
  END IF;
  -- Validate scalar and collection envelopes first. Do not mix JSON traversal,
  -- conditional casts and row locking inside one compound boolean expression.
  IF p_request_id IS NULL
     OR p_source_as_of IS NULL
     OR p_source_as_of>statement_timestamp()
     OR p_evidence_sha256 IS NULL
     OR p_evidence_sha256 !~ '^[0-9a-f]{64}$'
     OR p_reconciliation_result IS NULL
     OR p_reconciliation_result NOT IN ('matched','mismatch')
     OR p_currency_codes IS NULL
     OR cardinality(p_currency_codes) IS NULL
     OR cardinality(p_currency_codes) NOT BETWEEN 1 AND 10
     OR p_record_counts IS NULL
     OR jsonb_typeof(p_record_counts) IS DISTINCT FROM 'object'
     OR p_balances_by_currency IS NULL
     OR jsonb_typeof(p_balances_by_currency) IS DISTINCT FROM 'object'
     OR (p_source_reference IS NOT NULL AND (
          length(btrim(p_source_reference)) NOT BETWEEN 1 AND 200
          OR p_source_reference ~ '://'
          OR position('@' in p_source_reference)>0
        ))
  THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='valid provider reconciliation evidence metadata is required';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM unnest(p_currency_codes) AS currency(currency_code)
     WHERE currency.currency_code IS NULL
        OR currency.currency_code !~ '^[A-Z]{3}$'
  ) OR cardinality(p_currency_codes)<>(
    SELECT count(DISTINCT currency.currency_code)
      FROM unnest(p_currency_codes) AS currency(currency_code)
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='reconciliation currency codes must be unique ISO-style codes';
  END IF;

  SELECT count(*)
    INTO v_balance_currency_count
    FROM jsonb_object_keys(p_balances_by_currency);

  IF v_balance_currency_count<>cardinality(p_currency_codes) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='reconciliation balances must cover every declared currency exactly once';
  END IF;

  FOR v_balance IN
    SELECT entry.key,entry.value
      FROM jsonb_each(p_balances_by_currency) AS entry(key,value)
  LOOP
    IF NOT (v_balance.key=ANY(p_currency_codes)) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='reconciliation balances contain an undeclared currency';
    END IF;

    IF jsonb_typeof(v_balance.value) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='each currency balance must be an object';
    END IF;

    SELECT count(*)
      INTO v_balance_field_count
      FROM jsonb_object_keys(v_balance.value);

    IF v_balance_field_count<>2 THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='each currency balance must contain exactly the source and target amounts';
    END IF;

    IF jsonb_typeof(v_balance.value->'current_source_balance') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_balance.value->'target_source_balance') IS DISTINCT FROM 'string'
       OR coalesce(v_balance.value->>'current_source_balance','') !~ '^-?(0|[1-9][0-9]{0,15})([.][0-9]{1,4})?$'
       OR coalesce(v_balance.value->>'target_source_balance','') !~ '^-?(0|[1-9][0-9]{0,15})([.][0-9]{1,4})?$'
    THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='currency balances must be canonical decimal strings';
    END IF;

    IF p_reconciliation_result='matched'
       AND (v_balance.value->>'current_source_balance')::numeric
           <> (v_balance.value->>'target_source_balance')::numeric
    THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='matched reconciliation requires equal source and target balances for every currency';
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
      FROM jsonb_each_text(p_record_counts) AS entry(key,value)
     WHERE entry.value IS NULL OR entry.value !~ '^[0-9]{1,9}$'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='reconciliation record counts must be non-negative integers';
  END IF;
  SELECT r.* INTO v_request
    FROM public.customer_financial_source_change_requests r
   WHERE r.id=p_request_id
   FOR UPDATE;
  IF NOT FOUND OR v_request.status NOT IN ('pending_reconciliation','pending_approval') THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='pending source-change request is not available for reconciliation';
  END IF;
  SELECT b.* INTO v_binding
    FROM public.customer_financial_source_bindings b
   WHERE b.organization_id=v_request.organization_id AND b.customer_id=v_request.customer_id
   FOR UPDATE;
  IF NOT FOUND OR v_binding.revision<>v_request.expected_binding_revision
     OR v_binding.source_mode<>v_request.current_source_mode THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='current source binding changed before reconciliation evidence was recorded';
  END IF;
  SELECT e.* INTO v_existing
    FROM public.customer_financial_source_reconciliation_evidence e
   WHERE e.request_id=v_request.id AND e.evidence_sha256=p_evidence_sha256;
  IF FOUND THEN
    IF v_existing.reconciliation_result<>p_reconciliation_result
       OR v_existing.source_as_of<>p_source_as_of
       OR v_existing.currency_codes<>p_currency_codes
       OR v_existing.record_counts<>p_record_counts
       OR v_existing.balances_by_currency<>p_balances_by_currency
       OR v_existing.source_reference IS DISTINCT FROM p_source_reference
       OR v_existing.company_external_ref IS DISTINCT FROM v_request.target_company_external_ref
       OR v_existing.branch_external_ref IS DISTINCT FROM v_request.target_branch_external_ref THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='reconciliation evidence hash was replayed with different metadata';
    END IF;
    RETURN pg_catalog.jsonb_build_object('evidence_id',v_existing.id,'status',v_request.status,'replayed',true);
  END IF;
  INSERT INTO public.customer_financial_source_reconciliation_evidence(
    organization_id,customer_id,request_id,current_source_mode,target_source_mode,
    company_external_ref,branch_external_ref,
    reconciliation_result,source_as_of,evidence_sha256,currency_codes,record_counts,balances_by_currency,source_reference
  ) VALUES (
    v_request.organization_id,v_request.customer_id,v_request.id,v_request.current_source_mode,v_request.target_source_mode,
    v_request.target_company_external_ref,v_request.target_branch_external_ref,
    p_reconciliation_result,p_source_as_of,p_evidence_sha256,p_currency_codes,p_record_counts,p_balances_by_currency,
    nullif(btrim(coalesce(p_source_reference,'')),'')
  ) RETURNING * INTO v_evidence;
  UPDATE public.customer_financial_source_change_requests
     SET latest_evidence_id=v_evidence.id,
         status=CASE WHEN p_reconciliation_result='matched' THEN 'pending_approval' ELSE 'pending_reconciliation' END,
         updated_at=statement_timestamp()
   WHERE id=v_request.id;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_request.organization_id,NULL,'customer.financial_source.reconciliation.recorded',
    'customer_financial_source_change_request',v_request.id,
    pg_catalog.jsonb_build_object('status',v_request.status),
    pg_catalog.jsonb_build_object('evidence_id',v_evidence.id,'result',p_reconciliation_result,
      'source_as_of',p_source_as_of,'evidence_sha256',p_evidence_sha256));
  RETURN pg_catalog.jsonb_build_object('evidence_id',v_evidence.id,
    'status',CASE WHEN p_reconciliation_result='matched' THEN 'pending_approval' ELSE 'pending_reconciliation' END,
    'replayed',false);
END
$function$;
REVOKE ALL ON FUNCTION public.record_customer_financial_source_reconciliation_evidence(uuid,timestamptz,text,text,text[],jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_customer_financial_source_reconciliation_evidence(uuid,timestamptz,text,text,text[],jsonb,jsonb,text) TO service_role;

CREATE OR REPLACE FUNCTION public.review_customer_financial_source_change(
  p_request_id uuid,
  p_decision text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_request public.customer_financial_source_change_requests%ROWTYPE;
  v_binding public.customer_financial_source_bindings%ROWTYPE;
  v_evidence public.customer_financial_source_reconciliation_evidence%ROWTYPE;
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL
     OR NOT public.current_actor_has_capability('finance.customer_source.approve') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance.customer_source.approve capability required';
  END IF;
  IF p_request_id IS NULL OR p_decision IS NULL OR p_decision NOT IN ('approve','reject')
     OR p_reason IS NULL OR length(btrim(p_reason))<5 OR length(btrim(p_reason))>500 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='request, approve/reject decision and review reason are required';
  END IF;
  SELECT p.organization_id INTO v_org
    FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id AND o.is_active=true
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active finance organization context required';
  END IF;
  SELECT r.* INTO v_request
    FROM public.customer_financial_source_change_requests r
   WHERE r.id=p_request_id AND r.organization_id=v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='source-change request is outside the active finance organization';
  END IF;
  IF v_request.requested_by=v_actor THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='maker-checker requires a reviewer different from the requester';
  END IF;
  IF v_request.status IN ('approved','rejected') THEN
    IF v_request.reviewed_by=v_actor
       AND ((p_decision='approve' AND v_request.status='approved')
         OR (p_decision='reject' AND v_request.status='rejected'))
       AND v_request.review_reason=btrim(p_reason) THEN
      RETURN pg_catalog.jsonb_build_object('request_id',v_request.id,'status',v_request.status,'replayed',true);
    END IF;
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='source-change request has already been reviewed';
  END IF;
  IF v_request.status NOT IN ('pending_reconciliation','pending_approval') THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='source-change request is not reviewable';
  END IF;
  SELECT b.* INTO v_binding
    FROM public.customer_financial_source_bindings b
   WHERE b.organization_id=v_request.organization_id AND b.customer_id=v_request.customer_id
   FOR UPDATE;
  IF NOT FOUND OR v_binding.revision<>v_request.expected_binding_revision
     OR v_binding.source_mode<>v_request.current_source_mode THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='customer financial source changed while this request was pending';
  END IF;
  IF p_decision='reject' THEN
    UPDATE public.customer_financial_source_change_requests
       SET status='rejected',reviewed_by=v_actor,review_reason=btrim(p_reason),
           reviewed_at=statement_timestamp(),updated_at=statement_timestamp()
     WHERE id=v_request.id RETURNING * INTO v_request;
    INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
    VALUES(v_org,v_actor,'customer.financial_source.change.rejected','customer_financial_source_change_request',v_request.id,
      pg_catalog.jsonb_build_object('status','pending'),
      pg_catalog.jsonb_build_object('status','rejected','reason',v_request.review_reason));
    RETURN pg_catalog.jsonb_build_object('request_id',v_request.id,'status',v_request.status,'replayed',false);
  END IF;
  IF v_request.status<>'pending_approval' OR v_request.latest_evidence_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='a matched provider reconciliation is required before source activation';
  END IF;
  SELECT e.* INTO v_evidence
    FROM public.customer_financial_source_reconciliation_evidence e
   WHERE e.id=v_request.latest_evidence_id AND e.request_id=v_request.id
     AND e.organization_id=v_org AND e.reconciliation_result='matched'
     AND e.current_source_mode=v_request.current_source_mode
     AND e.target_source_mode=v_request.target_source_mode
     AND e.company_external_ref IS NOT DISTINCT FROM v_request.target_company_external_ref
     AND e.branch_external_ref IS NOT DISTINCT FROM v_request.target_branch_external_ref
   FOR SHARE;
  IF NOT FOUND OR v_evidence.source_as_of<statement_timestamp()-interval '24 hours'
     OR v_evidence.source_as_of>statement_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='matched source reconciliation evidence is missing or older than 24 hours';
  END IF;

  v_old:=pg_catalog.to_jsonb(v_binding);
  UPDATE public.customer_financial_source_bindings
     SET source_mode=v_request.target_source_mode,
         source_status='active',
         external_account_ref=v_request.target_external_account_ref,
         company_external_ref=v_request.target_company_external_ref,
         branch_external_ref=v_request.target_branch_external_ref,
         source_as_of=CASE WHEN v_request.target_source_mode='APP_ONLY' THEN NULL ELSE v_evidence.source_as_of END,
         last_synced_at=CASE WHEN v_request.target_source_mode='APP_ONLY' THEN NULL ELSE v_evidence.recorded_at END,
         source_evidence_sha256=CASE WHEN v_request.target_source_mode='APP_ONLY' THEN NULL ELSE v_evidence.evidence_sha256 END,
         verified_at=statement_timestamp(),
         revision=revision+1,updated_by=v_actor,updated_at=statement_timestamp()
   WHERE organization_id=v_org AND customer_id=v_request.customer_id
   RETURNING * INTO v_binding;
  v_new:=pg_catalog.to_jsonb(v_binding);
  UPDATE public.customer_financial_source_change_requests
     SET status='approved',reviewed_by=v_actor,review_reason=btrim(p_reason),
         reviewed_at=statement_timestamp(),updated_at=statement_timestamp()
   WHERE id=v_request.id RETURNING * INTO v_request;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'customer.financial_source.change.approved','customer_financial_source_binding',
    v_request.customer_id,v_old,v_new);
  RETURN pg_catalog.jsonb_build_object('request_id',v_request.id,'status',v_request.status,
    'source_mode',v_binding.source_mode,'revision',v_binding.revision,'replayed',false);
END
$function$;
REVOKE ALL ON FUNCTION public.review_customer_financial_source_change(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_customer_financial_source_change(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_customer_financial_source_sync(
  p_organization_id uuid,
  p_customer_id uuid,
  p_source_mode text,
  p_external_account_ref text,
  p_source_as_of timestamptz,
  p_evidence_sha256 text,
  p_record_count integer,
  p_currency_codes text[],
  p_company_external_ref text,
  p_branch_external_ref text,
  p_source_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_binding public.customer_financial_source_bindings%ROWTYPE;
  v_existing public.customer_financial_source_sync_evidence%ROWTYPE;
  v_sync public.customer_financial_source_sync_evidence%ROWTYPE;
BEGIN
  IF auth.uid() IS NOT NULL OR coalesce(auth.role(),'')<>'service_role' THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='service-role ERP financial sync writer required';
  END IF;
  IF p_organization_id IS NULL OR p_customer_id IS NULL
     OR p_source_mode IS NULL OR p_source_mode NOT IN ('ONYX','MUTAKAMEL')
     OR p_external_account_ref IS NULL OR length(btrim(p_external_account_ref)) NOT BETWEEN 1 AND 160
     OR p_external_account_ref ~ '://' OR position('@' in p_external_account_ref)>0
     OR p_source_as_of IS NULL OR p_source_as_of>statement_timestamp()
     OR p_evidence_sha256 IS NULL OR p_evidence_sha256 !~ '^[0-9a-f]{64}$'
     OR p_record_count IS NULL OR p_record_count<0
     OR p_currency_codes IS NULL OR cardinality(p_currency_codes) NOT BETWEEN 1 AND 10
     OR p_company_external_ref IS NULL OR length(btrim(p_company_external_ref)) NOT BETWEEN 1 AND 256
     OR p_company_external_ref ~ '://' OR position('@' in p_company_external_ref)>0
     OR p_branch_external_ref IS NULL OR length(btrim(p_branch_external_ref)) NOT BETWEEN 1 AND 256
     OR p_branch_external_ref ~ '://' OR position('@' in p_branch_external_ref)>0
     OR array_position(p_currency_codes,NULL) IS NOT NULL
     OR EXISTS(SELECT 1 FROM unnest(p_currency_codes) AS u(currency_code) WHERE u.currency_code !~ '^[A-Z]{3}$')
     OR cardinality(p_currency_codes)<>(SELECT count(DISTINCT u.currency_code) FROM unnest(p_currency_codes) AS u(currency_code))
     OR (p_source_reference IS NOT NULL AND (length(btrim(p_source_reference)) NOT BETWEEN 1 AND 200
        OR p_source_reference ~ '://' OR position('@' in p_source_reference)>0)) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='valid ERP source sync evidence metadata is required';
  END IF;
  SELECT b.* INTO v_binding
    FROM public.customer_financial_source_bindings b
   WHERE b.organization_id=p_organization_id AND b.customer_id=p_customer_id
   FOR UPDATE;
  IF NOT FOUND OR v_binding.source_status<>'active'
     OR v_binding.source_mode<>p_source_mode
     OR v_binding.external_account_ref<>btrim(p_external_account_ref)
     OR v_binding.company_external_ref<>btrim(p_company_external_ref)
     OR v_binding.branch_external_ref<>btrim(p_branch_external_ref) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ERP sync does not match the active customer financial source binding';
  END IF;
  SELECT e.* INTO v_existing
    FROM public.customer_financial_source_sync_evidence e
   WHERE e.organization_id=p_organization_id AND e.customer_id=p_customer_id
     AND e.evidence_sha256=p_evidence_sha256;
  IF FOUND THEN
    IF v_existing.source_as_of<>p_source_as_of OR v_existing.source_mode<>p_source_mode
       OR v_existing.external_account_ref<>btrim(p_external_account_ref)
       OR v_existing.company_external_ref<>btrim(p_company_external_ref)
       OR v_existing.branch_external_ref<>btrim(p_branch_external_ref)
       OR v_existing.record_count<>p_record_count OR v_existing.currency_codes<>p_currency_codes
       OR v_existing.source_reference IS DISTINCT FROM p_source_reference THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ERP sync evidence hash was replayed with different metadata';
    END IF;
    RETURN pg_catalog.jsonb_build_object('sync_id',v_existing.id,'replayed',true,'source_as_of',v_existing.source_as_of);
  END IF;
  IF v_binding.source_as_of IS NOT NULL AND p_source_as_of<v_binding.source_as_of THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='stale ERP source snapshot cannot move the customer statement watermark backwards';
  END IF;
  INSERT INTO public.customer_financial_source_sync_evidence(
    organization_id,customer_id,source_mode,external_account_ref,company_external_ref,branch_external_ref,
    source_as_of,evidence_sha256,record_count,currency_codes,source_reference
  ) VALUES (
    p_organization_id,p_customer_id,p_source_mode,btrim(p_external_account_ref),
    btrim(p_company_external_ref),btrim(p_branch_external_ref),p_source_as_of,
    p_evidence_sha256,p_record_count,p_currency_codes,nullif(btrim(coalesce(p_source_reference,'')),'')
  ) RETURNING * INTO v_sync;
  UPDATE public.customer_financial_source_bindings
     SET source_as_of=p_source_as_of,last_synced_at=statement_timestamp(),
         source_evidence_sha256=p_evidence_sha256,updated_at=statement_timestamp()
   WHERE organization_id=p_organization_id AND customer_id=p_customer_id
   RETURNING * INTO v_binding;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(p_organization_id,NULL,'customer.financial_source.sync.recorded','customer_financial_source_binding',p_customer_id,
    pg_catalog.jsonb_build_object('source_as_of',v_sync.source_as_of),
    pg_catalog.jsonb_build_object('sync_id',v_sync.id,'source_mode',v_sync.source_mode,
      'source_as_of',v_sync.source_as_of,'evidence_sha256',v_sync.evidence_sha256,'record_count',v_sync.record_count));
  RETURN pg_catalog.jsonb_build_object('sync_id',v_sync.id,'replayed',false,'source_as_of',v_sync.source_as_of);
END
$function$;
REVOKE ALL ON FUNCTION public.record_customer_financial_source_sync(uuid,uuid,text,text,timestamptz,text,integer,text[],text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_customer_financial_source_sync(uuid,uuid,text,text,timestamptz,text,integer,text[],text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_customer_financial_source()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_profile uuid:=public.current_profile_id();
  v_customer uuid:=public.current_customer_id();
  v_org uuid;
  v_binding public.customer_financial_source_bindings%ROWTYPE;
  v_is_stale boolean;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL OR v_customer IS NULL
     OR NOT (public.current_customer_can('statement.read') OR public.current_customer_can('invoices.read')) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='an authenticated customer with invoice or statement read access is required';
  END IF;
  SELECT p.organization_id INTO v_org
    FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id AND o.is_active=true
   WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active customer organization context required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.customers c
     WHERE c.id=v_customer AND c.organization_id=v_org AND c.status='approved'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='customer is outside the active organization';
  END IF;
  SELECT b.* INTO v_binding
    FROM public.customer_financial_source_bindings b
   WHERE b.organization_id=v_org AND b.customer_id=v_customer;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='customer financial source binding is not configured';
  END IF;
  v_is_stale:=v_binding.source_mode<>'APP_ONLY'
    AND (v_binding.source_as_of IS NULL OR v_binding.source_as_of<statement_timestamp()-interval '24 hours');
  RETURN pg_catalog.jsonb_build_object(
    'source_mode',v_binding.source_mode,
    'source_status',v_binding.source_status,
    'source_as_of',v_binding.source_as_of,
    'last_synced_at',v_binding.last_synced_at,
    'verified_at',v_binding.verified_at,
    'revision',v_binding.revision,
    'is_stale',v_is_stale,
    'can_read_app_ledger',v_binding.source_mode='APP_ONLY' AND v_binding.source_status='active'
      AND (NOT v_is_stale)
  );
END
$function$;
REVOKE ALL ON FUNCTION public.get_my_customer_financial_source() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_customer_financial_source() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_customer_financial_source_for_staff(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_profile uuid:=public.current_profile_id();
  v_org uuid;
  v_binding public.customer_financial_source_bindings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL
     OR NOT public.current_actor_has_capability('finance.workspace.manage') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance.workspace.manage capability required';
  END IF;
  SELECT p.organization_id INTO v_org
    FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id AND o.is_active=true
   WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active finance organization context required';
  END IF;
  SELECT b.* INTO v_binding
    FROM public.customer_financial_source_bindings b
   WHERE b.organization_id=v_org AND b.customer_id=p_customer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='customer source is outside the active organization';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'customer_id',v_binding.customer_id,'source_mode',v_binding.source_mode,
    'source_status',v_binding.source_status,'external_account_ref',v_binding.external_account_ref,
    'company_external_ref',v_binding.company_external_ref,'branch_external_ref',v_binding.branch_external_ref,
    'source_as_of',v_binding.source_as_of,'last_synced_at',v_binding.last_synced_at,
    'verified_at',v_binding.verified_at,'revision',v_binding.revision,
    'is_stale',v_binding.source_mode<>'APP_ONLY'
      AND (v_binding.source_as_of IS NULL OR v_binding.source_as_of<statement_timestamp()-interval '24 hours')
  );
END
$function$;
REVOKE ALL ON FUNCTION public.get_customer_financial_source_for_staff(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_customer_financial_source_for_staff(uuid) TO authenticated;

-- The previous customer statement must never silently fall back to the app ledger
-- once the customer has an active Onyx/Mutakamel source binding.
ALTER FUNCTION public.get_customer_account_statement()
  RENAME TO get_customer_account_statement_app_only_internal;
REVOKE ALL ON FUNCTION public.get_customer_account_statement_app_only_internal() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_customer_account_statement()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_profile uuid:=public.current_profile_id();
  v_customer uuid;
  v_org uuid;
  v_locked_customer uuid;
  v_binding public.customer_financial_source_bindings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='an authenticated customer account is required';
  END IF;
  SELECT p.organization_id INTO v_org
    FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id AND o.is_active=true
   WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active customer organization context required';
  END IF;
  IF NOT public.current_customer_can('statement.read') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='company member is not allowed to read the account statement';
  END IF;
  v_customer:=public.current_customer_id();
  IF v_customer IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='customer account is not linked to the active profile';
  END IF;
  SELECT c.id INTO v_locked_customer
    FROM public.customers c
   WHERE c.id=v_customer AND c.organization_id=v_org AND c.status='approved'
   FOR SHARE;
  IF v_locked_customer IS NULL OR NOT public.current_customer_can('statement.read') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='customer statement access is outside the active customer scope';
  END IF;
  SELECT b.* INTO v_binding
    FROM public.customer_financial_source_bindings b
   WHERE b.organization_id=v_org AND b.customer_id=v_customer
   FOR SHARE;
  IF NOT FOUND OR v_binding.source_status<>'active' THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='customer financial source is not active; statement access is blocked';
  END IF;
  IF v_binding.source_mode<>'APP_ONLY' THEN
    IF v_binding.source_as_of IS NULL OR v_binding.source_as_of<statement_timestamp()-interval '24 hours' THEN
      RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='external customer statement source is stale; app ledger fallback is prohibited';
    END IF;
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='external customer statement adapter is not available for the configured provider; app ledger fallback is prohibited';
  END IF;
  RETURN public.get_customer_account_statement_app_only_internal();
END
$function$;
REVOKE ALL ON FUNCTION public.get_customer_account_statement() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_customer_account_statement() TO authenticated;
COMMENT ON FUNCTION public.get_customer_account_statement() IS
  'Routes the customer statement only to the server-selected financial source. APP_ONLY uses the existing internal ledger statement; ONYX/MUTAKAMEL fail closed until their provider reader is available and never fall back to the app ledger.';

REVOKE ALL ON FUNCTION public.get_customer_account_statement_app_only_internal() FROM PUBLIC,anon,authenticated;


-- The source-binding tables intentionally revoke direct SELECT from authenticated.
-- This narrowly scoped SECURITY DEFINER predicate exposes only a boolean decision for
-- the current customer''s own invoice rows and never returns the binding or ERP account ref.
CREATE OR REPLACE FUNCTION public.customer_app_only_invoice_read_allowed(
  p_customer_id uuid,
  p_organization_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_source_mode text;
  v_source_status text;
BEGIN
  IF auth.uid() IS NULL
     OR p_customer_id IS NULL
     OR p_organization_id IS NULL
     OR p_customer_id IS DISTINCT FROM public.current_customer_id()
     OR p_organization_id IS DISTINCT FROM public.current_organization_id()
     OR NOT public.current_customer_can('invoices.read') THEN
    RETURN false;
  END IF;

  -- Serialize a direct RLS invoice read with an approved source cutover.
  -- The shared row lock remains until the caller's statement transaction ends.
  SELECT b.source_mode,b.source_status
    INTO v_source_mode,v_source_status
    FROM public.customer_financial_source_bindings b
   WHERE b.organization_id=p_organization_id
     AND b.customer_id=p_customer_id
   FOR SHARE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  RETURN v_source_mode='APP_ONLY' AND v_source_status='active';
END
$function$;
REVOKE ALL ON FUNCTION public.customer_app_only_invoice_read_allowed(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_app_only_invoice_read_allowed(uuid,uuid) TO authenticated;
COMMENT ON FUNCTION public.customer_app_only_invoice_read_allowed(uuid,uuid) IS
  'Boolean-only source predicate for the current customer''s invoice RLS; does not disclose source mode, binding metadata or external account references.';

ALTER TABLE public.customer_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_invoice_items ENABLE ROW LEVEL SECURITY;


-- Staff direct reads of app-ledger financial rows must follow the selected customer source.
CREATE OR REPLACE FUNCTION public.staff_customer_app_only_financial_rows_read_allowed(
  p_customer_id uuid,
  p_organization_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_source_mode text;
  v_source_status text;
BEGIN
  IF auth.uid() IS NULL
     OR p_customer_id IS NULL
     OR p_organization_id IS NULL
     OR p_organization_id IS DISTINCT FROM public.current_organization_id()
     OR NOT public.is_staff() THEN
    RETURN false;
  END IF;

  -- Staff direct reads share the same source-binding lock order as source cutovers.
  SELECT b.source_mode,b.source_status
    INTO v_source_mode,v_source_status
    FROM public.customer_financial_source_bindings b
   WHERE b.organization_id=p_organization_id
     AND b.customer_id=p_customer_id
   FOR SHARE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  RETURN v_source_mode='APP_ONLY' AND v_source_status='active';
END
$function$;
REVOKE ALL ON FUNCTION public.staff_customer_app_only_financial_rows_read_allowed(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_customer_app_only_financial_rows_read_allowed(uuid,uuid) TO authenticated;
COMMENT ON FUNCTION public.staff_customer_app_only_financial_rows_read_allowed(uuid,uuid) IS
  'Boolean-only staff direct-read guard for app-ledger financial rows; preserves existing staff/current-organization scope and requires the active APP_ONLY customer source.';

DROP POLICY IF EXISTS customer_invoice_financial_source_read_guard ON public.customer_invoices;
CREATE POLICY customer_invoice_financial_source_read_guard
  ON public.customer_invoices
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    (public.is_staff()
      AND organization_id = public.current_organization_id()
      AND public.staff_customer_app_only_financial_rows_read_allowed(customer_id, organization_id))
    OR public.customer_app_only_invoice_read_allowed(customer_id, organization_id)
  );

DROP POLICY IF EXISTS customer_invoice_item_financial_source_read_guard ON public.customer_invoice_items;
CREATE POLICY customer_invoice_item_financial_source_read_guard
  ON public.customer_invoice_items
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.customer_invoices staff_invoice
       WHERE staff_invoice.id = customer_invoice_items.invoice_id
         AND staff_invoice.organization_id = customer_invoice_items.organization_id
         AND staff_invoice.organization_id = public.current_organization_id()
         AND public.is_staff()
         AND public.staff_customer_app_only_financial_rows_read_allowed(
           staff_invoice.customer_id,staff_invoice.organization_id)
    )
    OR EXISTS (
      SELECT 1
        FROM public.customer_invoices customer_invoice
       WHERE customer_invoice.id = customer_invoice_items.invoice_id
         AND customer_invoice.organization_id = customer_invoice_items.organization_id
         AND public.customer_app_only_invoice_read_allowed(
           customer_invoice.customer_id,customer_invoice.organization_id)
    )
  );

COMMENT ON POLICY customer_invoice_financial_source_read_guard ON public.customer_invoices IS
  'Restricts customer direct invoice metadata reads to the active APP_ONLY source through a boolean-only SECURITY DEFINER guard; finance staff remain subject to existing permissive tenant/role policies.';
COMMENT ON POLICY customer_invoice_item_financial_source_read_guard ON public.customer_invoice_items IS
  'Restricts customer direct invoice-line reads to the active APP_ONLY source through the invoice source guard; finance staff remain subject to existing permissive tenant/role policies.';


-- The existing customer invoice PDF is a separate financial-document entry point.
-- Reassert its member-revocation guard and lock the selected source before reading.
CREATE OR REPLACE FUNCTION public.get_customer_invoice_pdf(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_customer uuid := public.current_customer_id();
  v_org uuid := public.current_organization_id();
  v_invoice jsonb;
  v_lines jsonb;
  v_customer_document jsonb;
  v_line_count integer;
  v_locked_customer uuid;
  v_show_financial boolean := false;
  v_show_tier boolean := false;
  v_customer_tier text := 'retail';
  v_customer_status text;
  v_tier_label text;
  v_app_only_source boolean;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL OR v_customer IS NULL OR v_org IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id = v_profile AND p.auth_user_id = auth.uid()
          AND p.is_active AND p.organization_id = v_org
     )
     OR NOT public.current_customer_can('invoices.read') THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='authenticated active customer with invoice-read permission required';
  END IF;
  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invoice id required';
  END IF;

  -- Serialize sensitive invoice reads with customer-company member revocation.
  -- The second capability check must see the committed result after a lock wait.
  SELECT c.id
    INTO v_locked_customer
    FROM public.customers c
   WHERE c.id = v_customer
     AND c.organization_id = v_org
   FOR SHARE;

  IF v_locked_customer IS NULL OR NOT public.current_customer_can('invoices.read') THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='authenticated active customer with invoice-read permission required';
  END IF;

  -- Keep the source binding locked for the duration of the PDF read. A concurrent
  -- maker/checker source cutover must wait; a completed external cutover is fail-closed.
  SELECT b.source_mode = 'APP_ONLY' AND b.source_status = 'active'
    INTO v_app_only_source
    FROM public.customer_financial_source_bindings b
   WHERE b.organization_id = v_org
     AND b.customer_id = v_customer
   FOR SHARE;
  IF v_app_only_source IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='APP_ONLY invoice PDF is not available for an external customer financial source';
  END IF;

  SELECT CASE WHEN pg_catalog.jsonb_typeof(s.value) = 'boolean'
              THEN (s.value #>> '{}')::boolean ELSE false END
    INTO v_show_financial
  FROM public.admin_settings AS s
  WHERE s.organization_id = v_org AND s.key = 'show_price_in_invoice';
  v_show_financial := COALESCE(v_show_financial, false);

  SELECT CASE WHEN pg_catalog.jsonb_typeof(s.value) = 'boolean'
              THEN (s.value #>> '{}')::boolean ELSE false END
    INTO v_show_tier
  FROM public.admin_settings AS s
  WHERE s.organization_id = v_org AND s.key = 'show_customer_tier_in_customer_views';
  v_show_tier := COALESCE(v_show_tier, false);

  SELECT pg_catalog.jsonb_build_object(
    'id', i.id,
    'invoice_number', i.invoice_number,
    'customer_id', i.customer_id,
    'status', i.status,
    'issued_at', i.issued_at,
    'due_at', i.due_at,
    'currency', i.currency
  ) || CASE WHEN v_show_financial THEN pg_catalog.jsonb_build_object(
    'subtotal', i.subtotal,
    'tax_amount', i.tax_amount,
    'total_amount', i.total_amount
  ) ELSE '{}'::jsonb END
    INTO v_invoice
    FROM public.customer_invoices i
   WHERE i.id = p_invoice_id
     AND i.customer_id = v_customer
     AND i.organization_id = v_org;

  IF v_invoice IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0002',
      MESSAGE='الفاتورة غير موجودة أو غير متاحة لهذا الحساب';
  END IF;

  SELECT count(*)::integer INTO v_line_count
    FROM public.customer_invoice_items i
   WHERE i.invoice_id = p_invoice_id AND i.organization_id = v_org;
  IF v_line_count > 500 THEN
    RAISE EXCEPTION USING ERRCODE='54000', MESSAGE='invoice contains too many lines for a complete PDF';
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', i.id,
        'item_code', i.item_code,
        'description', i.description,
        'unit', i.unit,
        'quantity', i.quantity
      ) || CASE WHEN v_show_financial THEN pg_catalog.jsonb_build_object(
        'unit_price', i.unit_price,
        'line_total', i.line_total
      ) ELSE '{}'::jsonb END
      ORDER BY i.created_at, i.id
    ),
    '[]'::jsonb
  ) INTO v_lines
    FROM public.customer_invoice_items i
   WHERE i.invoice_id = p_invoice_id AND i.organization_id = v_org;

  SELECT c.tier, c.status
    INTO v_customer_tier, v_customer_status
  FROM public.customers c
  WHERE c.id = v_customer AND c.organization_id = v_org;

  IF v_customer_status IS DISTINCT FROM 'approved' THEN v_customer_tier := 'retail'; END IF;
  v_tier_label := CASE COALESCE(NULLIF(v_customer_tier, ''), 'retail')
    WHEN 'super_wholesale' THEN 'جملة الجملة'
    WHEN 'wholesale' THEN 'الجملة'
    ELSE 'التجزئة'
  END;

  SELECT pg_catalog.jsonb_build_object(
    'customer_code', c.customer_code,
    'business_name', c.business_name,
    'contact_name', c.contact_name
  ) || CASE WHEN v_show_tier THEN pg_catalog.jsonb_build_object('tier_label', v_tier_label) ELSE '{}'::jsonb END
    INTO v_customer_document
    FROM public.customers c
   WHERE c.id = v_customer AND c.organization_id = v_org;
  IF v_customer_document IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0002',
      MESSAGE='customer account is not linked to the active profile';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'invoice', v_invoice,
    'lines', v_lines,
    'customer', v_customer_document,
    'financial_details_visible', v_show_financial,
    'customer_tier_visible', v_show_tier
  );
END;
$function$;


REVOKE ALL ON FUNCTION public.get_customer_invoice_pdf(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_invoice_pdf(uuid) TO authenticated;
COMMENT ON FUNCTION public.get_customer_invoice_pdf(uuid) IS
  'Returns only the active APP_ONLY customer invoice PDF; denies APP_ONLY documents after external-source cutover and locks the selected customer source during the read.';



-- Boolean-only source predicate for existing finance receipt reads. The binding
-- table remains inaccessible directly to authenticated roles.

ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_payment_financial_source_read_guard
  ON public.customer_payments;
CREATE POLICY customer_payment_financial_source_read_guard
  ON public.customer_payments
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    public.staff_customer_app_only_financial_rows_read_allowed(customer_id,organization_id)
  );

COMMENT ON POLICY customer_payment_financial_source_read_guard
  ON public.customer_payments IS
  'Restricts direct staff reads of app-ledger payment allocations to customers whose active financial source remains APP_ONLY.';

CREATE OR REPLACE FUNCTION public.customer_app_only_receipt_read_allowed(
  p_customer_id uuid,
  p_organization_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_source_mode text;
  v_source_status text;
BEGIN
  IF auth.uid() IS NULL
     OR p_customer_id IS NULL
     OR p_organization_id IS NULL
     OR p_organization_id IS DISTINCT FROM public.current_organization_id()
     OR NOT public.can_manage_finance() THEN
    RETURN false;
  END IF;

  -- Direct finance receipt reads must serialize with the same source cutover lock.
  SELECT b.source_mode,b.source_status
    INTO v_source_mode,v_source_status
    FROM public.customer_financial_source_bindings b
   WHERE b.organization_id=p_organization_id
     AND b.customer_id=p_customer_id
   FOR SHARE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  RETURN v_source_mode='APP_ONLY' AND v_source_status='active';
END
$function$;
REVOKE ALL ON FUNCTION public.customer_app_only_receipt_read_allowed(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.customer_app_only_receipt_read_allowed(uuid,uuid) TO authenticated;
COMMENT ON FUNCTION public.customer_app_only_receipt_read_allowed(uuid,uuid) IS
  'Boolean-only current-organization finance receipt source guard; never returns source binding metadata or external account references.';

DROP POLICY IF EXISTS customer_payment_receipt_financial_source_read_guard
  ON public.customer_payment_receipts;
CREATE POLICY customer_payment_receipt_financial_source_read_guard
  ON public.customer_payment_receipts
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    public.customer_app_only_receipt_read_allowed(customer_id,organization_id)
  );

COMMENT ON POLICY customer_payment_receipt_financial_source_read_guard
  ON public.customer_payment_receipts IS
  'Restricts direct finance receipt reads to the active APP_ONLY source for the current organization.';


CREATE OR REPLACE FUNCTION public.get_customer_payment_receipt_print_options(
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_organization_name text;
  v_total bigint;
  v_receipts jsonb;
BEGIN
  SELECT p.organization_id
    INTO v_org
    FROM public.profiles p
   WHERE p.id = v_actor
     AND p.auth_user_id = auth.uid()
     AND p.is_active = true;

  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.can_manage_finance()
     OR NOT EXISTS (
       SELECT 1
         FROM public.user_roles r
        WHERE r.profile_id = v_actor
          AND r.role IN ('admin', 'manager', 'accountant')
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'finance permission required to list customer payment receipts';
  END IF;

  SELECT NULLIF(pg_catalog.btrim(o.name), '')
    INTO v_organization_name
    FROM public.organizations o
   WHERE o.id = v_org
     AND o.is_active = true;
  IF v_organization_name IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002',
      MESSAGE = 'active organization identity is unavailable for receipt printing';
  END IF;

  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200
     OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'receipt print page must use a limit of 1..200 and an offset of 0..10000000';
  END IF;

  -- This SECURITY DEFINER reader bypasses receipt-table RLS. Lock every APP_ONLY
  -- binding that can contribute a receipt before building the page, in deterministic
  -- customer order. Maker/Checker source cutover uses FOR UPDATE on the same rows.
  PERFORM b.customer_id
    FROM public.customer_financial_source_bindings b
   WHERE b.organization_id=v_org
     AND b.source_mode='APP_ONLY'
     AND b.source_status='active'
     AND EXISTS (
       SELECT 1
         FROM public.customer_payment_receipts r
        WHERE r.organization_id=b.organization_id
          AND r.customer_id=b.customer_id
     )
   ORDER BY b.customer_id
   FOR SHARE OF b;

  -- One statement snapshot keeps total, page rows and has_more consistent
  -- while receipts are recorded and customer financial sources are cut over.
  WITH scoped_receipts AS MATERIALIZED (
    SELECT
      r.id,
      r.receipt_number,
      c.customer_code,
      COALESCE(
        NULLIF(pg_catalog.btrim(c.business_name), ''),
        NULLIF(pg_catalog.btrim(c.contact_name), ''),
        'عميل غير مسمى'
      ) AS customer_name,
      r.currency,
      r.total_amount,
      r.allocation_count,
      r.paid_at,
      r.payment_method,
      r.reference
    FROM public.customer_payment_receipts r
    JOIN public.customer_financial_source_bindings b
      ON b.organization_id = r.organization_id
     AND b.customer_id = r.customer_id
     AND b.source_mode = 'APP_ONLY'
     AND b.source_status = 'active'
    JOIN public.customers c
      ON c.id = r.customer_id
     AND c.organization_id = r.organization_id
    WHERE r.organization_id = v_org
  ),
  page_receipts AS MATERIALIZED (
    SELECT *
      FROM scoped_receipts
     ORDER BY paid_at DESC,id DESC
     LIMIT p_limit
     OFFSET p_offset
  )
  SELECT
    (SELECT pg_catalog.count(*) FROM scoped_receipts),
    COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id',page.id::text,
          'receipt_number',page.receipt_number::text,
          'customer_code',page.customer_code,
          'customer_name',page.customer_name,
          'currency',page.currency,
          'total_amount',page.total_amount::text,
          'allocation_count',page.allocation_count,
          'paid_at',page.paid_at,
          'payment_method',page.payment_method,
          'reference',page.reference
        )
        ORDER BY page.paid_at DESC,page.id DESC
      )
      FROM page_receipts page
    ),'[]'::jsonb)
    INTO v_total,v_receipts;

  RETURN pg_catalog.jsonb_build_object(
    'organization_name', v_organization_name,
    'receipts', v_receipts,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', v_total > (p_offset::bigint + p_limit::bigint)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_staff_customer_payment_receipt_print_data(
  p_receipt_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_organization_name text;
  v_receipt public.customer_payment_receipts%ROWTYPE;
  v_customer jsonb;
  v_allocations jsonb;
  v_allocation_count integer;
  v_distinct_invoice_count integer;
  v_allocation_total numeric(15,2);
  v_invalid_allocation_count integer;
  v_source_mode text;
  v_source_status text;
BEGIN
  SELECT p.organization_id
    INTO v_org
    FROM public.profiles p
   WHERE p.id = v_actor
     AND p.auth_user_id = auth.uid()
     AND p.is_active = true;

  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.can_manage_finance()
     OR NOT EXISTS (
       SELECT 1
         FROM public.user_roles r
        WHERE r.profile_id = v_actor
          AND r.role IN ('admin', 'manager', 'accountant')
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'finance permission required to print a customer payment receipt';
  END IF;

  IF p_receipt_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'customer payment receipt id is required';
  END IF;

  SELECT r.*
    INTO v_receipt
    FROM public.customer_payment_receipts r
   WHERE r.id = p_receipt_id
     AND r.organization_id = v_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002',
      MESSAGE = 'customer payment receipt was not found in the active organization';
  END IF;

  -- A financial source cutover takes an exclusive binding lock. Lock and re-read
  -- the selected binding here so printing cannot race an approved APP_ONLY cutover.
  SELECT b.source_mode,b.source_status
    INTO v_source_mode,v_source_status
    FROM public.customer_financial_source_bindings b
   WHERE b.organization_id=v_receipt.organization_id
     AND b.customer_id=v_receipt.customer_id
   FOR SHARE;
  IF NOT FOUND OR v_source_mode<>'APP_ONLY' OR v_source_status<>'active' THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='APP_ONLY receipt print is not available for an external customer financial source';
  END IF;

  -- Keep the global lock order consistent with customer receipt printing:
  -- financial-source binding, receipt header, then allocation rows.
  -- Re-read the header after the source lock and block FK KEY SHARE references
  -- that could append a new allocation after validation.
  SELECT r.*
    INTO v_receipt
    FROM public.customer_payment_receipts r
   WHERE r.id=p_receipt_id
     AND r.organization_id=v_org
     AND r.customer_id=v_receipt.customer_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002',
      MESSAGE='customer payment receipt was not found in the active organization';
  END IF;

  PERFORM cp.id
    FROM public.customer_payments cp
   WHERE cp.receipt_id=v_receipt.id
   FOR SHARE;


  -- Validate the exact allocation set and build the printable representation
  -- from one materialized statement snapshot.
  WITH staff_receipt_allocations AS MATERIALIZED (
    SELECT
      cp.id,
      cp.invoice_id,
      cp.amount,
      cp.organization_id,
      cp.customer_id,
      invoice.id AS matched_invoice_id,
      invoice.currency AS invoice_currency,
      invoice.invoice_number,
      invoice.issued_at
    FROM public.customer_payments cp
    LEFT JOIN public.customer_invoices invoice
      ON invoice.id=cp.invoice_id
     AND invoice.organization_id=cp.organization_id
     AND invoice.customer_id=cp.customer_id
    WHERE cp.receipt_id=v_receipt.id
  )
  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.count(DISTINCT staff_receipt_allocations.invoice_id)::integer,
    COALESCE(pg_catalog.sum(staff_receipt_allocations.amount),0)::numeric(15,2),
    pg_catalog.count(*) FILTER (
      WHERE staff_receipt_allocations.amount IS NULL
         OR staff_receipt_allocations.amount<=0
         OR staff_receipt_allocations.organization_id IS DISTINCT FROM v_org
         OR staff_receipt_allocations.customer_id IS DISTINCT FROM v_receipt.customer_id
         OR staff_receipt_allocations.invoice_id IS NULL
         OR staff_receipt_allocations.matched_invoice_id IS NULL
         OR staff_receipt_allocations.invoice_currency IS DISTINCT FROM v_receipt.currency
    )::integer,
    COALESCE(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'invoice_number',staff_receipt_allocations.invoice_number,
          'invoice_issued_at',staff_receipt_allocations.issued_at,
          'currency',staff_receipt_allocations.invoice_currency,
          'amount',staff_receipt_allocations.amount::text
        )
        ORDER BY staff_receipt_allocations.issued_at,staff_receipt_allocations.invoice_number,staff_receipt_allocations.id
      ),
      '[]'::jsonb
    )
    INTO
      v_allocation_count,
      v_distinct_invoice_count,
      v_allocation_total,
      v_invalid_allocation_count,
      v_allocations
    FROM staff_receipt_allocations;

  IF v_receipt.receipt_number IS NULL
     OR v_allocation_count <> v_receipt.allocation_count
     OR v_allocation_count NOT BETWEEN 2 AND 50
     OR v_distinct_invoice_count <> v_allocation_count
     OR v_invalid_allocation_count <> 0
     OR v_allocation_total IS DISTINCT FROM v_receipt.total_amount
     OR pg_catalog.jsonb_array_length(v_allocations) <> v_allocation_count THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'receipt allocations do not reconcile to the saved receipt header; printing was denied';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'id', c.id::text,
    'customer_code', c.customer_code,
    'business_name', c.business_name,
    'contact_name', c.contact_name
  )
    INTO v_customer
    FROM public.customers c
   WHERE c.id = v_receipt.customer_id
     AND c.organization_id = v_org;
  IF v_customer IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002',
      MESSAGE = 'receipt customer was not found in the active organization';
  END IF;

  SELECT NULLIF(pg_catalog.btrim(o.name), '')
    INTO v_organization_name
    FROM public.organizations o
   WHERE o.id = v_org
     AND o.is_active = true;
  IF v_organization_name IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002',
      MESSAGE = 'active organization identity is unavailable for receipt printing';
  END IF;

  -- v_allocations was reconciled and assembled in the same statement snapshot.

  -- Deliberately omit private notes, idempotency keys, raw organization IDs and internal payment IDs.
  RETURN pg_catalog.jsonb_build_object(
    'organization_name', v_organization_name,
    'receipt', pg_catalog.jsonb_build_object(
      'id', v_receipt.id::text,
      'receipt_number', v_receipt.receipt_number::text,
      'currency', v_receipt.currency,
      'total_amount', v_receipt.total_amount::text,
      'allocation_count', v_receipt.allocation_count,
      'payment_method', v_receipt.payment_method,
      'reference', v_receipt.reference,
      'paid_at', v_receipt.paid_at
    ),
    'customer', v_customer,
    'allocations', v_allocations
  );
END;
$function$;


-- Customer-only receipt history and printing. This is deliberately separate
-- from the finance-staff receipt selector and printer above.
CREATE OR REPLACE FUNCTION public.get_my_customer_payment_receipt_print_options(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_customer uuid := public.current_customer_id();
  v_org uuid := public.current_organization_id();
  v_profile_org uuid;
  v_source_mode text;
  v_source_status text;
  v_organization_name text;
  v_total bigint;
  v_receipts jsonb;
BEGIN
  IF auth.uid() IS NULL
     OR v_profile IS NULL
     OR v_customer IS NULL
     OR v_org IS NULL
     OR NOT (
       public.current_customer_can('statement.read')
       OR public.current_customer_can('invoices.read')
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active customer with invoice or statement read permission required for receipt history';
  END IF;

  SELECT p.organization_id
    INTO v_profile_org
    FROM public.profiles p
    JOIN public.organizations o
      ON o.id=p.organization_id
     AND o.is_active=true
   WHERE p.id=v_profile
     AND p.auth_user_id=auth.uid()
     AND p.is_active=true
     AND p.organization_id=v_org;
  IF v_profile_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active customer organization context required for receipt history';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.customers c
     WHERE c.id=v_customer
       AND c.organization_id=v_org
       AND c.status='approved'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='customer is outside the active organization for receipt history';
  END IF;

  -- Keep the binding lock through the page read so a source cutover cannot
  -- interleave the APP_ONLY receipt snapshot.
  SELECT b.source_mode,b.source_status
    INTO v_source_mode,v_source_status
    FROM public.customer_financial_source_bindings b
   WHERE b.organization_id=v_org
     AND b.customer_id=v_customer
   FOR SHARE;
  IF NOT FOUND
     OR v_source_mode IS DISTINCT FROM 'APP_ONLY'
     OR v_source_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='APP_ONLY customer receipt history is unavailable for this financial source';
  END IF;

  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='customer receipt page must use a limit of 1..100 and offset of 0..10000000';
  END IF;

  SELECT NULLIF(pg_catalog.btrim(o.name),'')
    INTO v_organization_name
    FROM public.organizations o
   WHERE o.id=v_org
     AND o.is_active=true;
  IF v_organization_name IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0002',
      MESSAGE='active organization identity is unavailable for customer receipt printing';
  END IF;

  -- A materialized scoped set gives count and page the same statement snapshot.
  WITH scoped_receipts AS MATERIALIZED (
    SELECT
      r.id,
      r.receipt_number,
      c.customer_code,
      COALESCE(
        NULLIF(pg_catalog.btrim(c.business_name),''),
        NULLIF(pg_catalog.btrim(c.contact_name),''),
        'عميل غير مسمى'
      ) AS customer_name,
      r.currency,
      r.total_amount,
      r.allocation_count,
      r.paid_at,
      r.payment_method,
      r.reference
    FROM public.customer_payment_receipts r
    JOIN public.customers c
      ON c.id=r.customer_id
     AND c.organization_id=r.organization_id
    WHERE r.organization_id=v_org
      AND r.customer_id=v_customer
  ),
  page_receipts AS (
    SELECT *
      FROM scoped_receipts
     ORDER BY paid_at DESC,id DESC
     LIMIT p_limit
     OFFSET p_offset
  )
  SELECT
    (SELECT pg_catalog.count(*) FROM scoped_receipts),
    COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id',page.id::text,
          'receipt_number',page.receipt_number::text,
          'customer_code',page.customer_code,
          'customer_name',page.customer_name,
          'currency',page.currency,
          'total_amount',page.total_amount::text,
          'allocation_count',page.allocation_count,
          'paid_at',page.paid_at,
          'payment_method',page.payment_method,
          'reference',page.reference
        )
        ORDER BY page.paid_at DESC,page.id DESC
      )
      FROM page_receipts page
    ),'[]'::jsonb)
    INTO v_total,v_receipts;

  RETURN pg_catalog.jsonb_build_object(
    'organization_name',v_organization_name,
    'receipts',v_receipts,
    'total',v_total,
    'limit',p_limit,
    'offset',p_offset,
    'has_more',v_total>(p_offset::bigint+p_limit::bigint)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.get_my_customer_payment_receipt_print_options(integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_customer_payment_receipt_print_options(integer,integer) TO authenticated;
COMMENT ON FUNCTION public.get_my_customer_payment_receipt_print_options(integer,integer) IS
  'Customer-only paged APP_ONLY receipt selector. Derives identity from the authenticated customer and locks the source binding during the snapshot.';

CREATE OR REPLACE FUNCTION public.get_my_customer_payment_receipt_print_data(
  p_receipt_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_customer uuid := public.current_customer_id();
  v_org uuid := public.current_organization_id();
  v_profile_org uuid;
  v_source_mode text;
  v_source_status text;
  v_receipt public.customer_payment_receipts%ROWTYPE;
  v_organization_name text;
  v_customer_document jsonb;
  v_allocations jsonb;
  v_allocation_count integer;
  v_distinct_invoice_count integer;
  v_allocation_total numeric(15,2);
  v_invalid_allocation_count integer;
BEGIN
  IF auth.uid() IS NULL
     OR v_profile IS NULL
     OR v_customer IS NULL
     OR v_org IS NULL
     OR NOT (
       public.current_customer_can('statement.read')
       OR public.current_customer_can('invoices.read')
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active customer with invoice or statement read permission required for receipt printing';
  END IF;

  SELECT p.organization_id
    INTO v_profile_org
    FROM public.profiles p
    JOIN public.organizations o
      ON o.id=p.organization_id
     AND o.is_active=true
   WHERE p.id=v_profile
     AND p.auth_user_id=auth.uid()
     AND p.is_active=true
     AND p.organization_id=v_org;
  IF v_profile_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active customer organization context required for receipt printing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.customers c
     WHERE c.id=v_customer
       AND c.organization_id=v_org
       AND c.status='approved'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='customer is outside the active organization for receipt printing';
  END IF;

  IF p_receipt_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='customer payment receipt id is required';
  END IF;

  -- Lock before resolving the receipt. Maker/checker cutover uses an exclusive
  -- lock on this row, so this read and an approved source switch serialize.
  SELECT b.source_mode,b.source_status
    INTO v_source_mode,v_source_status
    FROM public.customer_financial_source_bindings b
   WHERE b.organization_id=v_org
     AND b.customer_id=v_customer
   FOR SHARE;
  IF NOT FOUND
     OR v_source_mode IS DISTINCT FROM 'APP_ONLY'
     OR v_source_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='APP_ONLY customer receipt print is unavailable for this financial source';
  END IF;

  SELECT r.*
    INTO v_receipt
    FROM public.customer_payment_receipts r
   WHERE r.id=p_receipt_id
     AND r.organization_id=v_org
     AND r.customer_id=v_customer
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002',
      MESSAGE='customer payment receipt was not found for this account';
  END IF;

  -- Freeze the existing allocation rows while the printable snapshot is assembled.
  -- Together with the header lock this prevents UPDATE/DELETE from changing the
  -- evidence between reconciliation and DTO construction.
  PERFORM cp.id
    FROM public.customer_payments cp
   WHERE cp.receipt_id=v_receipt.id
   FOR SHARE;

  -- Validate amount/count/currency and construct the exact printable detail in
  -- one statement. READ COMMITTED assigns a fresh snapshot per statement, so
  -- splitting validation and DTO construction across SELECTs can print rows
  -- different from the rows whose sum was checked.
  WITH receipt_allocations AS MATERIALIZED (
    SELECT
      cp.id,
      cp.invoice_id,
      cp.amount,
      cp.organization_id,
      cp.customer_id,
      invoice.id AS matched_invoice_id,
      invoice.currency AS invoice_currency,
      invoice.invoice_number,
      invoice.issued_at
    FROM public.customer_payments cp
    LEFT JOIN public.customer_invoices invoice
      ON invoice.id=cp.invoice_id
     AND invoice.organization_id=cp.organization_id
     AND invoice.customer_id=cp.customer_id
    WHERE cp.receipt_id=v_receipt.id
  )
  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.count(DISTINCT receipt_allocations.invoice_id)::integer,
    COALESCE(pg_catalog.sum(receipt_allocations.amount),0)::numeric(15,2),
    pg_catalog.count(*) FILTER (
      WHERE receipt_allocations.amount IS NULL
         OR receipt_allocations.amount<=0
         OR receipt_allocations.organization_id IS DISTINCT FROM v_org
         OR receipt_allocations.customer_id IS DISTINCT FROM v_customer
         OR receipt_allocations.invoice_id IS NULL
         OR receipt_allocations.matched_invoice_id IS NULL
         OR receipt_allocations.invoice_currency IS DISTINCT FROM v_receipt.currency
    )::integer,
    COALESCE(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'invoice_number',receipt_allocations.invoice_number,
          'invoice_issued_at',receipt_allocations.issued_at,
          'currency',receipt_allocations.invoice_currency,
          'amount',receipt_allocations.amount::text
        )
        ORDER BY receipt_allocations.issued_at,receipt_allocations.invoice_number,receipt_allocations.id
      ),
      '[]'::jsonb
    )
    INTO
      v_allocation_count,
      v_distinct_invoice_count,
      v_allocation_total,
      v_invalid_allocation_count,
      v_allocations
    FROM receipt_allocations;

  IF v_receipt.receipt_number IS NULL
     OR v_receipt.currency IS NULL
     OR v_receipt.total_amount<=0
     OR v_receipt.allocation_count NOT BETWEEN 2 AND 50
     OR v_allocation_count<>v_receipt.allocation_count
     OR v_distinct_invoice_count<>v_allocation_count
     OR v_invalid_allocation_count<>0
     OR v_allocation_total IS DISTINCT FROM v_receipt.total_amount
     OR pg_catalog.jsonb_array_length(v_allocations)<>v_allocation_count THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='receipt allocations do not reconcile to the saved receipt header; printing was denied';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'id',c.id::text,
    'customer_code',c.customer_code,
    'business_name',c.business_name,
    'contact_name',c.contact_name
  )
    INTO v_customer_document
    FROM public.customers c
   WHERE c.id=v_customer
     AND c.organization_id=v_org
     AND c.status='approved';
  IF v_customer_document IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0002',
      MESSAGE='customer identity is unavailable for receipt printing';
  END IF;

  SELECT NULLIF(pg_catalog.btrim(o.name),'')
    INTO v_organization_name
    FROM public.organizations o
   WHERE o.id=v_org
     AND o.is_active=true;
  IF v_organization_name IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0002',
      MESSAGE='active organization identity is unavailable for customer receipt printing';
  END IF;

  -- v_allocations was built and reconciled in the same SQL snapshot above.

  -- The DTO contains only this customer's saved receipt and its invoice allocations.
  RETURN pg_catalog.jsonb_build_object(
    'organization_name',v_organization_name,
    'receipt',pg_catalog.jsonb_build_object(
      'id',v_receipt.id::text,
      'receipt_number',v_receipt.receipt_number::text,
      'currency',v_receipt.currency,
      'total_amount',v_receipt.total_amount::text,
      'allocation_count',v_receipt.allocation_count,
      'payment_method',v_receipt.payment_method,
      'reference',v_receipt.reference,
      'paid_at',v_receipt.paid_at
    ),
    'customer',v_customer_document,
    'allocations',v_allocations
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.get_my_customer_payment_receipt_print_data(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_customer_payment_receipt_print_data(uuid) TO authenticated;
COMMENT ON FUNCTION public.get_my_customer_payment_receipt_print_data(uuid) IS
  'Customer-only APP_ONLY receipt print DTO. Derives the customer and tenant from the session, locks the financial source, validates all allocations and performs no write.';


-- Reassert the existing Customer 360 finance projection with the selected-source guard.
-- This SECURITY DEFINER RPC must not return the APP_ONLY ledger after external cutover.
CREATE OR REPLACE FUNCTION public.get_staff_customer_360(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_financial_source_mode text;
  v_financial_source_status text;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_customer jsonb;
  v_order_summary jsonb;
  v_finance_by_currency jsonb;
  v_recent_orders jsonb;
  v_recent_order_items jsonb;
  v_recent_invoices jsonb;
  v_recent_payments jsonb;
  v_top_products jsonb;
  v_recommendations jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR NOT COALESCE(public.can_manage_finance(), false) OR NOT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id = v_actor
       AND p.auth_user_id = auth.uid()
       AND p.is_active
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'صلاحية موظف مخول ماليًا مطلوبة لفتح ملف العميل 360.';
  END IF;

  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id = v_actor
     AND p.auth_user_id = auth.uid()
     AND p.is_active;

  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'المؤسسة النشطة غير متاحة لملف العميل.';
  END IF;

  -- Fail closed if a posted credit source cannot be reconciled to this customer's invoice and currency.
  IF EXISTS (
    SELECT 1
      FROM public.customer_return_credit_memos cm
      LEFT JOIN public.customer_invoices ci
        ON ci.id = cm.invoice_id
       AND ci.organization_id = cm.organization_id
       AND ci.customer_id = cm.customer_id
     WHERE cm.organization_id = v_org
       AND cm.customer_id = p_customer_id
       AND cm.status = 'posted'
       AND (
         ci.id IS NULL
         OR cm.currency IS DISTINCT FROM ci.currency
       )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'posted credit memo source or currency does not reconcile to the customer 360 invoice';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'id', c.id,
    'customer_code', c.customer_code,
    'business_name', c.business_name,
    'contact_name', c.contact_name,
    'phone', c.phone,
    'email', c.email,
    'tier', c.tier,
    'status', c.status,
    'current_balance', c.current_balance,
    'credit_limit', c.credit_limit
  )
    INTO v_customer
    FROM public.customers c
   WHERE c.id = p_customer_id
     AND c.organization_id = v_org;

  IF v_customer IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'العميل غير موجود ضمن المؤسسة الحالية.';
  END IF;

  -- This SECURITY DEFINER reader bypasses table RLS. Bind it explicitly to the
  -- selected financial source and lock that binding for the complete snapshot.
  SELECT b.source_mode,b.source_status
    INTO v_financial_source_mode,v_financial_source_status
    FROM public.customer_financial_source_bindings b
   WHERE b.organization_id=v_org
     AND b.customer_id=p_customer_id
   FOR SHARE;

  IF NOT FOUND OR v_financial_source_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='customer financial source is not active; Customer 360 finance snapshot is blocked';
  END IF;

  IF v_financial_source_mode<>'APP_ONLY' THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='APP_ONLY Customer 360 finance snapshot is unavailable for an external customer financial source';
  END IF;


  -- Full-history order metrics; if any eligible order amount is NULL, totals are unavailable,
  -- not silently reduced or reported as zero.
  SELECT pg_catalog.jsonb_build_object(
    'order_count', pg_catalog.count(*)::integer,
    'pending_order_count', pg_catalog.count(*) FILTER (
      WHERE o.status IN ('new','received','reviewing','pending','processing','confirmed','approved','preparing','prepared','dispatched')
    )::integer,
    'fulfilled_order_count', pg_catalog.count(*) FILTER (WHERE o.status IN ('delivered','completed'))::integer,
    'cancelled_order_count', pg_catalog.count(*) FILTER (WHERE o.status IN ('cancelled','canceled','rejected'))::integer,
    'non_cancelled_order_value', CASE
      WHEN pg_catalog.count(*) FILTER (
        WHERE COALESCE(o.status,'') NOT IN ('cancelled','canceled','rejected','void') AND o.total_amount IS NULL
      ) > 0 THEN NULL
      ELSE COALESCE(pg_catalog.sum(o.total_amount) FILTER (
        WHERE COALESCE(o.status,'') NOT IN ('cancelled','canceled','rejected','void')
      ), 0)::numeric
    END,
    'average_order_value', CASE
      WHEN pg_catalog.count(*) FILTER (
        WHERE COALESCE(o.status,'') NOT IN ('cancelled','canceled','rejected','void') AND o.total_amount IS NULL
      ) > 0 THEN NULL
      ELSE pg_catalog.avg(o.total_amount) FILTER (
        WHERE COALESCE(o.status,'') NOT IN ('cancelled','canceled','rejected','void')
      )::numeric
    END,
    'invalid_order_amount_count', pg_catalog.count(*) FILTER (
      WHERE COALESCE(o.status,'') NOT IN ('cancelled','canceled','rejected','void') AND o.total_amount IS NULL
    )::integer,
    'last_order_at', pg_catalog.max(o.created_at),
    'days_since_last_order', CASE
      WHEN pg_catalog.max(o.created_at) IS NULL THEN NULL
      ELSE GREATEST(pg_catalog.floor(EXTRACT(epoch FROM (v_now - pg_catalog.max(o.created_at))) / 86400)::integer, 0)
    END,
    'average_days_between_orders', (
      SELECT pg_catalog.round(pg_catalog.avg(EXTRACT(epoch FROM (ordered.created_at - ordered.previous_at)) / 86400)::numeric, 1)
        FROM (
          SELECT o2.created_at,
                 pg_catalog.lag(o2.created_at) OVER (ORDER BY o2.created_at, o2.id) AS previous_at
            FROM public.orders o2
           WHERE o2.organization_id = v_org
             AND o2.customer_id = p_customer_id
             AND COALESCE(o2.status,'') NOT IN ('cancelled','canceled','rejected','void')
        ) ordered
       WHERE ordered.previous_at IS NOT NULL
    ),
    'status_distribution', (
      SELECT COALESCE(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('status', status_rows.status, 'count', status_rows.status_count)
        ORDER BY status_rows.status_count DESC, status_rows.status
      ), '[]'::jsonb)
      FROM (
        SELECT o3.status, pg_catalog.count(*)::integer AS status_count
          FROM public.orders o3
         WHERE o3.organization_id = v_org AND o3.customer_id = p_customer_id
         GROUP BY o3.status
      ) status_rows
    )
  )
    INTO v_order_summary
    FROM public.orders o
   WHERE o.organization_id = v_org
     AND o.customer_id = p_customer_id;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', recent.id,
    'order_number', recent.order_number,
    'status', recent.status,
    'total_amount', recent.total_amount,
    'total_items', recent.total_items,
    'created_at', recent.created_at
  ) ORDER BY recent.created_at DESC, recent.id), '[]'::jsonb)
    INTO v_recent_orders
    FROM (
      SELECT o.id, o.order_number, o.status, o.total_amount, o.total_items, o.created_at
        FROM public.orders o
       WHERE o.organization_id = v_org AND o.customer_id = p_customer_id
       ORDER BY o.created_at DESC, o.id
       LIMIT 20
    ) recent;

  -- The 100 newest order lines are details only; aggregate amounts below always use the full ledger.
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'order_id', recent_lines.order_id,
    'order_number', recent_lines.order_number,
    'item_code', recent_lines.item_code,
    'product_name', recent_lines.product_name,
    'quantity', recent_lines.quantity,
    'line_total', recent_lines.line_total,
    'created_at', recent_lines.created_at
  ) ORDER BY recent_lines.created_at DESC, recent_lines.order_id, recent_lines.item_code), '[]'::jsonb)
    INTO v_recent_order_items
    FROM (
      SELECT o.id AS order_id, o.order_number, o.created_at,
             COALESCE(NULLIF(pg_catalog.btrim(oi.item_code),''),'') AS item_code,
             COALESCE(NULLIF(pg_catalog.btrim(oi.product_name_snapshot),''),NULLIF(pg_catalog.btrim(oi.item_code),''),'صنف غير محدد') AS product_name,
             oi.quantity, oi.line_total
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
       WHERE o.organization_id = v_org
         AND o.customer_id = p_customer_id
       ORDER BY o.created_at DESC, o.id, oi.id
       LIMIT 100
    ) recent_lines;

  -- Full-ledger invoice, payment and posted credit-memo balances by currency.
  -- Draft/reversed memos do not reduce receivables; unknown invoice totals remain NULL.
  WITH payments_by_invoice AS (
    SELECT cp.invoice_id, COALESCE(pg_catalog.sum(cp.amount),0)::numeric AS paid_amount
      FROM public.customer_payments cp
     WHERE cp.organization_id = v_org AND cp.customer_id = p_customer_id
     GROUP BY cp.invoice_id
  ),
  credits_by_invoice AS (
    SELECT cm.invoice_id, COALESCE(pg_catalog.sum(cm.total_amount),0)::numeric AS credited_amount
      FROM public.customer_return_credit_memos cm
      JOIN public.customer_invoices ci
        ON ci.id = cm.invoice_id
       AND ci.organization_id = cm.organization_id
       AND ci.customer_id = cm.customer_id
     WHERE cm.organization_id = v_org
       AND cm.customer_id = p_customer_id
       AND cm.status = 'posted'
       AND cm.currency = ci.currency
     GROUP BY cm.invoice_id
  ),
  balances AS (
    SELECT ci.id AS invoice_id, ci.currency, ci.status, ci.due_at, ci.total_amount,
           COALESCE(pbi.paid_amount,0)::numeric AS paid_amount,
           COALESCE(cbi.credited_amount,0)::numeric AS credited_amount,
           CASE WHEN ci.status = 'void' THEN 0::numeric
                WHEN ci.total_amount IS NULL THEN NULL
                ELSE GREATEST(
                  ci.total_amount - COALESCE(pbi.paid_amount,0) - COALESCE(cbi.credited_amount,0),
                  0
                )::numeric
           END AS outstanding_amount
      FROM public.customer_invoices ci
      LEFT JOIN payments_by_invoice pbi ON pbi.invoice_id = ci.id
      LEFT JOIN credits_by_invoice cbi ON cbi.invoice_id = ci.id
     WHERE ci.organization_id = v_org AND ci.customer_id = p_customer_id
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'currency', summary.currency,
    'invoice_count', summary.invoice_count,
    'invoiced_total', summary.invoiced_total,
    'paid_total', summary.paid_total,
    'credit_memo_total', summary.credit_memo_total,
    'outstanding_total', summary.outstanding_total,
    'overdue_invoice_count', summary.overdue_invoice_count,
    'overdue_outstanding', summary.overdue_outstanding,
    'unknown_due_date_invoice_count', summary.unknown_due_date_invoice_count,
    'unknown_due_date_outstanding', summary.unknown_due_date_outstanding,
    'invalid_total_amount_count', summary.invalid_total_amount_count
  ) ORDER BY summary.currency), '[]'::jsonb)
    INTO v_finance_by_currency
    FROM (
      SELECT b.currency,
             pg_catalog.count(*) FILTER (WHERE b.status <> 'void')::integer AS invoice_count,
             CASE WHEN pg_catalog.count(*) FILTER (WHERE b.status <> 'void' AND b.total_amount IS NULL) > 0 THEN NULL
                  ELSE COALESCE(pg_catalog.sum(b.total_amount) FILTER (WHERE b.status <> 'void'),0)::numeric END AS invoiced_total,
             COALESCE(pg_catalog.sum(b.paid_amount) FILTER (WHERE b.status <> 'void'),0)::numeric AS paid_total,
             COALESCE(pg_catalog.sum(b.credited_amount) FILTER (WHERE b.status <> 'void'),0)::numeric AS credit_memo_total,
             CASE WHEN pg_catalog.count(*) FILTER (WHERE b.status <> 'void' AND b.outstanding_amount IS NULL) > 0 THEN NULL
                  ELSE COALESCE(pg_catalog.sum(b.outstanding_amount) FILTER (WHERE b.status <> 'void'),0)::numeric END AS outstanding_total,
             pg_catalog.count(*) FILTER (
               WHERE b.status NOT IN ('paid','void') AND b.outstanding_amount > 0 AND b.due_at IS NOT NULL
                 AND (b.due_at AT TIME ZONE 'UTC')::date < (v_now AT TIME ZONE 'UTC')::date
             )::integer AS overdue_invoice_count,
             CASE WHEN pg_catalog.count(*) FILTER (
               WHERE b.status NOT IN ('paid','void') AND b.outstanding_amount IS NULL AND b.due_at IS NOT NULL
                 AND (b.due_at AT TIME ZONE 'UTC')::date < (v_now AT TIME ZONE 'UTC')::date
             ) > 0 THEN NULL ELSE COALESCE(pg_catalog.sum(b.outstanding_amount) FILTER (
               WHERE b.status NOT IN ('paid','void') AND b.outstanding_amount > 0 AND b.due_at IS NOT NULL
                 AND (b.due_at AT TIME ZONE 'UTC')::date < (v_now AT TIME ZONE 'UTC')::date
             ),0)::numeric END AS overdue_outstanding,
             pg_catalog.count(*) FILTER (WHERE b.status <> 'void' AND b.outstanding_amount > 0 AND b.due_at IS NULL)::integer AS unknown_due_date_invoice_count,
             CASE WHEN pg_catalog.count(*) FILTER (WHERE b.status <> 'void' AND b.outstanding_amount IS NULL AND b.due_at IS NULL) > 0 THEN NULL
                  ELSE COALESCE(pg_catalog.sum(b.outstanding_amount) FILTER (WHERE b.status <> 'void' AND b.due_at IS NULL),0)::numeric END AS unknown_due_date_outstanding,
             pg_catalog.count(*) FILTER (WHERE b.status <> 'void' AND b.total_amount IS NULL)::integer AS invalid_total_amount_count
        FROM balances b
       GROUP BY b.currency
    ) summary;

  WITH payments_by_invoice AS (
    SELECT cp.invoice_id, COALESCE(pg_catalog.sum(cp.amount),0)::numeric AS paid_amount
      FROM public.customer_payments cp
     WHERE cp.organization_id = v_org AND cp.customer_id = p_customer_id
     GROUP BY cp.invoice_id
  ),
  credits_by_invoice AS (
    SELECT cm.invoice_id, COALESCE(pg_catalog.sum(cm.total_amount),0)::numeric AS credited_amount
      FROM public.customer_return_credit_memos cm
      JOIN public.customer_invoices ci
        ON ci.id = cm.invoice_id
       AND ci.organization_id = cm.organization_id
       AND ci.customer_id = cm.customer_id
     WHERE cm.organization_id = v_org
       AND cm.customer_id = p_customer_id
       AND cm.status = 'posted'
       AND cm.currency = ci.currency
     GROUP BY cm.invoice_id
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', inv.id,
    'invoice_number', inv.invoice_number,
    'status', inv.status,
    'issued_at', inv.issued_at,
    'due_at', inv.due_at,
    'currency', inv.currency,
    'total_amount', inv.total_amount,
    'paid_amount', inv.paid_amount,
    'credit_memo_amount', inv.credit_memo_amount,
    'outstanding_amount', inv.outstanding_amount
  ) ORDER BY inv.issued_at DESC, inv.id), '[]'::jsonb)
    INTO v_recent_invoices
    FROM (
      SELECT ci.id, ci.invoice_number, ci.status, ci.issued_at, ci.due_at, ci.currency, ci.total_amount,
             COALESCE(pbi.paid_amount,0)::numeric AS paid_amount,
             COALESCE(cbi.credited_amount,0)::numeric AS credit_memo_amount,
             CASE WHEN ci.status = 'void' THEN 0::numeric
                  WHEN ci.total_amount IS NULL THEN NULL
                  ELSE GREATEST(
                    ci.total_amount - COALESCE(pbi.paid_amount,0) - COALESCE(cbi.credited_amount,0),
                    0
                  )::numeric
             END AS outstanding_amount
        FROM public.customer_invoices ci
        LEFT JOIN payments_by_invoice pbi ON pbi.invoice_id = ci.id
        LEFT JOIN credits_by_invoice cbi ON cbi.invoice_id = ci.id
       WHERE ci.organization_id = v_org AND ci.customer_id = p_customer_id
       ORDER BY ci.issued_at DESC, ci.id
       LIMIT 20
    ) inv;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', recent.id, 'invoice_id', recent.invoice_id, 'amount', recent.amount,
    'paid_at', recent.paid_at, 'payment_method', recent.payment_method
  ) ORDER BY recent.paid_at DESC, recent.id), '[]'::jsonb)
    INTO v_recent_payments
    FROM (
      SELECT cp.id, cp.invoice_id, cp.amount, cp.paid_at, cp.payment_method
        FROM public.customer_payments cp
       WHERE cp.organization_id = v_org AND cp.customer_id = p_customer_id
       ORDER BY cp.paid_at DESC, cp.id
       LIMIT 20
    ) recent;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'item_code', top_products.item_code,
    'product_name', top_products.product_name,
    'quantity', top_products.quantity,
    'sales', top_products.sales,
    'last_purchased_at', top_products.last_purchased_at
  ) ORDER BY top_products.sales DESC, top_products.quantity DESC, top_products.product_name), '[]'::jsonb)
    INTO v_top_products
    FROM (
      SELECT COALESCE(NULLIF(pg_catalog.btrim(oi.item_code),''),'') AS item_code,
             COALESCE(NULLIF(pg_catalog.btrim(oi.product_name_snapshot),''),NULLIF(pg_catalog.btrim(oi.item_code),''),'صنف غير محدد') AS product_name,
             COALESCE(pg_catalog.sum(oi.quantity),0)::numeric AS quantity,
             CASE WHEN pg_catalog.count(*) FILTER (WHERE oi.line_total IS NULL) > 0 THEN NULL
                  ELSE COALESCE(pg_catalog.sum(oi.line_total),0)::numeric END AS sales,
             pg_catalog.max(o.created_at) AS last_purchased_at
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
       WHERE o.organization_id = v_org
         AND o.customer_id = p_customer_id
         AND COALESCE(o.status,'') NOT IN ('cancelled','canceled','rejected','void')
       GROUP BY COALESCE(NULLIF(pg_catalog.btrim(oi.item_code),''),''),
                COALESCE(NULLIF(pg_catalog.btrim(oi.product_name_snapshot),''),NULLIF(pg_catalog.btrim(oi.item_code),''),'صنف غير محدد')
       ORDER BY COALESCE(pg_catalog.sum(oi.line_total),0) DESC, COALESCE(pg_catalog.sum(oi.quantity),0) DESC
       LIMIT 5
    ) top_products;

  -- These are deterministic prompts driven by ledger facts, not AI-generated claims.
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'type', 'overdue_follow_up',
    'priority', 'high',
    'title', 'متابعة تحصيل فواتير متأخرة',
    'description', 'توجد فواتير متأخرة بحسب تاريخ الاستحقاق والسجل المالي الكامل.',
    'action', 'مراجعة كشف حساب العميل',
    'currency', s.currency,
    'overdue_invoice_count', s.overdue_invoice_count,
    'overdue_outstanding', s.overdue_outstanding
  ) ORDER BY s.overdue_outstanding DESC NULLS LAST), '[]'::jsonb)
    INTO v_recommendations
    FROM pg_catalog.jsonb_to_recordset(v_finance_by_currency) AS s(
      currency text, overdue_invoice_count integer, overdue_outstanding numeric
    )
   WHERE s.overdue_invoice_count > 0
     AND s.overdue_outstanding IS NOT NULL
     AND s.overdue_outstanding > 0;

  IF COALESCE((v_order_summary->>'pending_order_count')::integer, 0) > 0 THEN
    v_recommendations := v_recommendations || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'type', 'pending_orders',
      'priority', 'medium',
      'title', 'مراجعة طلبات العميل المعلقة',
      'description', 'توجد طلبات ضمن حالات المعالجة المسجلة في النظام.',
      'action', 'فتح سجل الطلبات',
      'pending_order_count', (v_order_summary->>'pending_order_count')::integer
    ));
  END IF;

  IF COALESCE((v_order_summary->>'order_count')::integer, 0) > 0
     AND COALESCE((v_order_summary->>'days_since_last_order')::integer, 0) >= 30 THEN
    v_recommendations := v_recommendations || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'type', 'customer_follow_up',
      'priority', 'low',
      'title', 'مراجعة نشاط العميل',
      'description', 'مضت 30 يومًا على الأقل منذ آخر طلب مسجل للعميل.',
      'action', 'التواصل مع العميل ومراجعة احتياجه',
      'days_since_last_order', (v_order_summary->>'days_since_last_order')::integer,
      'last_order_at', v_order_summary->'last_order_at'
    ));
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'generated_at', v_now,
    'customer', v_customer,
    'order_summary', v_order_summary,
    'finance_by_currency', v_finance_by_currency,
    'recent_orders', v_recent_orders,
    'recent_order_items', v_recent_order_items,
    'recent_invoices', v_recent_invoices,
    'recent_payments', v_recent_payments,
    'top_products', v_top_products,
    'recommendations', v_recommendations
  );
END;
$function$;

-- Payment and receipt writes belong to the APP_ONLY ledger only. This source lock
-- serializes every row mutation with the Maker/Checker source cutover.
CREATE OR REPLACE FUNCTION public.assert_customer_app_only_financial_write(
  p_organization_id uuid,
  p_customer_id uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_source_mode text;
  v_source_status text;
BEGIN
  IF p_organization_id IS NULL OR p_customer_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active customer financial source binding is required for payment writes';
  END IF;

  SELECT b.source_mode,b.source_status
    INTO v_source_mode,v_source_status
    FROM public.customer_financial_source_bindings b
   WHERE b.organization_id=p_organization_id
     AND b.customer_id=p_customer_id
   FOR SHARE;

  IF NOT FOUND OR v_source_mode IS DISTINCT FROM 'APP_ONLY'
     OR v_source_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='customer payment ledger writes require an active APP_ONLY financial source';
  END IF;
END
$function$;
REVOKE ALL ON FUNCTION public.assert_customer_app_only_financial_write(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.enforce_customer_app_only_payment_source()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_organization_id uuid;
  v_customer_id uuid;
BEGIN
  IF TG_OP='DELETE' THEN
    v_organization_id:=OLD.organization_id;
    v_customer_id:=OLD.customer_id;
  ELSE
    v_organization_id:=NEW.organization_id;
    v_customer_id:=NEW.customer_id;
  END IF;

  PERFORM public.assert_customer_app_only_financial_write(v_organization_id,v_customer_id);

  IF TG_OP='DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.enforce_customer_app_only_payment_source()
  FROM PUBLIC,anon,authenticated,service_role;

DROP TRIGGER IF EXISTS customer_payments_app_only_financial_source_guard
  ON public.customer_payments;
CREATE TRIGGER customer_payments_app_only_financial_source_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.customer_payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_customer_app_only_payment_source();

DROP TRIGGER IF EXISTS customer_payment_receipts_app_only_financial_source_guard
  ON public.customer_payment_receipts;
CREATE TRIGGER customer_payment_receipts_app_only_financial_source_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.customer_payment_receipts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_customer_app_only_payment_source();

-- The database trigger above rejects all physical writes. Wrap the idempotent writers
-- too: otherwise an old APP_ONLY idempotency key could replay a prior result after
-- the source changes without attempting an INSERT and therefore without firing a trigger.
ALTER FUNCTION public.record_customer_payment(uuid,numeric,text,uuid,text,text)
  RENAME TO record_customer_payment_app_only_internal;
REVOKE ALL ON FUNCTION public.record_customer_payment_app_only_internal(uuid,numeric,text,uuid,text,text)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.record_customer_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_idempotency_key uuid,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid:=public.current_profile_id();
  v_org uuid;
  v_customer uuid;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL OR NOT public.can_manage_finance() THEN
    RETURN public.record_customer_payment_app_only_internal(
      p_invoice_id,p_amount,p_payment_method,p_idempotency_key,p_reference,p_notes
    );
  END IF;

  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF v_org IS NULL THEN
    RETURN public.record_customer_payment_app_only_internal(
      p_invoice_id,p_amount,p_payment_method,p_idempotency_key,p_reference,p_notes
    );
  END IF;

  SELECT i.customer_id INTO v_customer
    FROM public.customer_invoices i
   WHERE i.id=p_invoice_id AND i.organization_id=v_org;
  IF NOT FOUND THEN
    RETURN public.record_customer_payment_app_only_internal(
      p_invoice_id,p_amount,p_payment_method,p_idempotency_key,p_reference,p_notes
    );
  END IF;

  PERFORM public.assert_customer_app_only_financial_write(v_org,v_customer);
  RETURN public.record_customer_payment_app_only_internal(
    p_invoice_id,p_amount,p_payment_method,p_idempotency_key,p_reference,p_notes
  );
END
$function$;
REVOKE ALL ON FUNCTION public.record_customer_payment(uuid,numeric,text,uuid,text,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_customer_payment(uuid,numeric,text,uuid,text,text)
  TO authenticated;
COMMENT ON FUNCTION public.record_customer_payment(uuid,numeric,text,uuid,text,text) IS
  'APP_ONLY-only wrapper for the existing idempotent payment writer; locks the server-selected source before new writes or replay.';

ALTER FUNCTION public.record_customer_payment_allocation(jsonb,text,uuid,text,text)
  RENAME TO record_customer_payment_allocation_app_only_internal;
REVOKE ALL ON FUNCTION public.record_customer_payment_allocation_app_only_internal(jsonb,text,uuid,text,text)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.record_customer_payment_allocation(
  p_allocations jsonb,
  p_payment_method text,
  p_idempotency_key uuid,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid:=public.current_profile_id();
  v_org uuid;
  v_invoice_id uuid;
  v_customer uuid;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL OR NOT public.can_manage_finance() THEN
    RETURN public.record_customer_payment_allocation_app_only_internal(
      p_allocations,p_payment_method,p_idempotency_key,p_reference,p_notes
    );
  END IF;

  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF v_org IS NULL THEN
    RETURN public.record_customer_payment_allocation_app_only_internal(
      p_allocations,p_payment_method,p_idempotency_key,p_reference,p_notes
    );
  END IF;

  -- Split shape and cardinality validation so jsonb_array_length is never called
  -- on a non-array value; delegate malformed input to the canonical writer.
  IF p_allocations IS NULL OR pg_catalog.jsonb_typeof(p_allocations) IS DISTINCT FROM 'array' THEN
    RETURN public.record_customer_payment_allocation_app_only_internal(
      p_allocations,p_payment_method,p_idempotency_key,p_reference,p_notes
    );
  END IF;
  IF pg_catalog.jsonb_array_length(p_allocations) NOT BETWEEN 2 AND 50 THEN
    RETURN public.record_customer_payment_allocation_app_only_internal(
      p_allocations,p_payment_method,p_idempotency_key,p_reference,p_notes
    );
  END IF;

  BEGIN
    v_invoice_id:=nullif(p_allocations->0->>'invoice_id','')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN public.record_customer_payment_allocation_app_only_internal(
      p_allocations,p_payment_method,p_idempotency_key,p_reference,p_notes
    );
  END;
  IF v_invoice_id IS NULL THEN
    RETURN public.record_customer_payment_allocation_app_only_internal(
      p_allocations,p_payment_method,p_idempotency_key,p_reference,p_notes
    );
  END IF;

  SELECT i.customer_id INTO v_customer
    FROM public.customer_invoices i
   WHERE i.id=v_invoice_id AND i.organization_id=v_org;
  IF NOT FOUND THEN
    RETURN public.record_customer_payment_allocation_app_only_internal(
      p_allocations,p_payment_method,p_idempotency_key,p_reference,p_notes
    );
  END IF;

  PERFORM public.assert_customer_app_only_financial_write(v_org,v_customer);
  RETURN public.record_customer_payment_allocation_app_only_internal(
    p_allocations,p_payment_method,p_idempotency_key,p_reference,p_notes
  );
END
$function$;
REVOKE ALL ON FUNCTION public.record_customer_payment_allocation(jsonb,text,uuid,text,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_customer_payment_allocation(jsonb,text,uuid,text,text)
  TO authenticated;
COMMENT ON FUNCTION public.record_customer_payment_allocation(jsonb,text,uuid,text,text) IS
  'APP_ONLY-only wrapper for the existing atomic receipt writer; locks the source before new writes or idempotent replay.';

NOTIFY pgrst,'reload schema';

COMMIT;