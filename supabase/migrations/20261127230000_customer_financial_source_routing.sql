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
    (source_mode='APP_ONLY' AND external_account_ref IS NULL)
    OR (source_mode IN ('ONYX','MUTAKAMEL')
        AND external_account_ref IS NOT NULL
        AND length(btrim(external_account_ref)) BETWEEN 1 AND 160
        AND external_account_ref !~ '://'
        AND position('@' in external_account_ref)=0)
  ),
  CONSTRAINT customer_financial_source_external_evidence_ck CHECK (
    source_mode='APP_ONLY'
    OR (source_evidence_sha256 IS NOT NULL
        AND source_evidence_sha256 ~ '^[0-9a-f]{64}$'
        AND source_as_of IS NOT NULL AND verified_at IS NOT NULL)
  ),
  CONSTRAINT customer_financial_source_evidence_hash_ck CHECK (
    source_evidence_sha256 IS NULL OR source_evidence_sha256 ~ '^[0-9a-f]{64}$'
  )
);

CREATE INDEX customer_financial_source_provider_lookup
  ON public.customer_financial_source_bindings(organization_id,source_mode,source_status)
  WHERE source_mode IN ('ONYX','MUTAKAMEL');

CREATE TABLE public.customer_financial_source_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  current_source_mode text NOT NULL CHECK (current_source_mode IN ('APP_ONLY','ONYX','MUTAKAMEL')),
  target_source_mode text NOT NULL CHECK (target_source_mode IN ('APP_ONLY','ONYX','MUTAKAMEL')),
  target_external_account_ref text,
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
    (target_source_mode='APP_ONLY' AND target_external_account_ref IS NULL)
    OR (target_source_mode IN ('ONYX','MUTAKAMEL')
        AND target_external_account_ref IS NOT NULL
        AND length(btrim(target_external_account_ref)) BETWEEN 1 AND 160
        AND target_external_account_ref !~ '://'
        AND position('@' in target_external_account_ref)=0)
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
  CHECK (source_as_of<=recorded_at)
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
  p_expected_binding_revision integer
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
    IF nullif(btrim(coalesce(p_target_external_account_ref,'')),'') IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='APP_ONLY source must not include an external account reference';
    END IF;
  ELSIF p_target_external_account_ref IS NULL OR length(btrim(p_target_external_account_ref)) NOT BETWEEN 1 AND 160
     OR p_target_external_account_ref ~ '://'
     OR position('@' in p_target_external_account_ref)>0 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ERP source requires a safe external account reference, not a connection secret';
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
     AND v_binding.external_account_ref IS NOT DISTINCT FROM nullif(btrim(coalesce(p_target_external_account_ref,'')),'') THEN
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
    expected_binding_revision,idempotency_key,request_fingerprint,reason,status,requested_by
  ) VALUES (
    v_org,p_customer_id,v_binding.source_mode,p_target_source_mode,
    nullif(btrim(coalesce(p_target_external_account_ref,'')),''),
    v_binding.revision,btrim(p_idempotency_key),v_fingerprint,btrim(p_reason),'pending_reconciliation',v_actor
  ) RETURNING * INTO v_request;

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'customer.financial_source.change.requested','customer_financial_source_binding',p_customer_id,
    pg_catalog.jsonb_build_object('source_mode',v_binding.source_mode,'revision',v_binding.revision),
    pg_catalog.jsonb_build_object('request_id',v_request.id,'target_source_mode',v_request.target_source_mode,
      'external_account_ref',v_request.target_external_account_ref,'status',v_request.status,'reason',v_request.reason));
  RETURN pg_catalog.jsonb_build_object(
    'request_id',v_request.id,'status',v_request.status,'replayed',false,
    'current_source_mode',v_request.current_source_mode,'target_source_mode',v_request.target_source_mode,
    'expected_binding_revision',v_request.expected_binding_revision);
END
$function$;
REVOKE ALL ON FUNCTION public.request_customer_financial_source_change(uuid,text,text,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_customer_financial_source_change(uuid,text,text,text,text,integer) TO authenticated;

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
BEGIN
  IF auth.uid() IS NOT NULL OR coalesce(auth.role(),'')<>'service_role' THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='service-role ERP reconciliation evidence writer required';
  END IF;
  IF p_request_id IS NULL OR p_source_as_of IS NULL OR p_source_as_of>statement_timestamp()
     OR p_evidence_sha256 IS NULL OR p_evidence_sha256 !~ '^[0-9a-f]{64}$'
     OR p_reconciliation_result IS NULL OR p_reconciliation_result NOT IN ('matched','mismatch')
     OR p_currency_codes IS NULL OR cardinality(p_currency_codes) NOT BETWEEN 1 AND 10
     OR array_position(p_currency_codes,NULL) IS NOT NULL
     OR EXISTS(SELECT 1 FROM unnest(p_currency_codes) AS u(currency_code) WHERE u.currency_code !~ '^[A-Z]{3}$')
     OR cardinality(p_currency_codes)<>(SELECT count(DISTINCT u.currency_code) FROM unnest(p_currency_codes) AS u(currency_code))
     OR p_record_counts IS NULL OR jsonb_typeof(p_record_counts)<>'object'
     OR p_balances_by_currency IS NULL
     OR jsonb_typeof(p_balances_by_currency) IS DISTINCT FROM 'object'
     OR CASE WHEN jsonb_typeof(p_balances_by_currency)='object'
             THEN (SELECT count(*) FROM jsonb_object_keys(p_balances_by_currency))<>cardinality(p_currency_codes)
             ELSE true END
     OR EXISTS (
       SELECT 1
         FROM jsonb_each(
           CASE WHEN jsonb_typeof(p_balances_by_currency)='object'
                THEN p_balances_by_currency ELSE '{}'::jsonb END
         ) AS balance(currency_code,totals)
        WHERE NOT (balance.currency_code=ANY(p_currency_codes))
           OR jsonb_typeof(balance.totals) IS DISTINCT FROM 'object'
           OR CASE WHEN jsonb_typeof(balance.totals)='object'
                   THEN (SELECT count(*) FROM jsonb_object_keys(balance.totals))<>2
                   ELSE true END
           OR CASE
                WHEN jsonb_typeof(balance.totals->'current_source_balance')='string'
                 AND jsonb_typeof(balance.totals->'target_source_balance')='string'
                 AND balance.totals->>'current_source_balance' ~ '^-?(0|[1-9][0-9]{0,15})([.][0-9]{1,4})?$'
                 AND balance.totals->>'target_source_balance' ~ '^-?(0|[1-9][0-9]{0,15})([.][0-9]{1,4})?$'
                THEN p_reconciliation_result='matched'
                 AND (balance.totals->>'current_source_balance')::numeric
                     <> (balance.totals->>'target_source_balance')::numeric
                ELSE true
              END
     )
     OR (p_source_reference IS NOT NULL AND
         (length(btrim(p_source_reference)) NOT BETWEEN 1 AND 200
          OR p_source_reference ~ '://' OR position('@' in p_source_reference)>0))
     OR EXISTS(
       SELECT 1
         FROM jsonb_each_text(
           CASE WHEN jsonb_typeof(p_record_counts)='object' THEN p_record_counts ELSE '{}'::jsonb END
         ) e
        WHERE e.value !~ '^[0-9]{1,9}$'
     ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='valid provider reconciliation evidence metadata is required';
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
       OR v_existing.source_reference IS DISTINCT FROM p_source_reference THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='reconciliation evidence hash was replayed with different metadata';
    END IF;
    RETURN pg_catalog.jsonb_build_object('evidence_id',v_existing.id,'status',v_request.status,'replayed',true);
  END IF;
  INSERT INTO public.customer_financial_source_reconciliation_evidence(
    organization_id,customer_id,request_id,current_source_mode,target_source_mode,
    reconciliation_result,source_as_of,evidence_sha256,currency_codes,record_counts,balances_by_currency,source_reference
  ) VALUES (
    v_request.organization_id,v_request.customer_id,v_request.id,v_request.current_source_mode,v_request.target_source_mode,
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
     OR v_binding.external_account_ref<>btrim(p_external_account_ref) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ERP sync does not match the active customer financial source binding';
  END IF;
  SELECT e.* INTO v_existing
    FROM public.customer_financial_source_sync_evidence e
   WHERE e.organization_id=p_organization_id AND e.customer_id=p_customer_id
     AND e.evidence_sha256=p_evidence_sha256;
  IF FOUND THEN
    IF v_existing.source_as_of<>p_source_as_of OR v_existing.source_mode<>p_source_mode
       OR v_existing.external_account_ref<>btrim(p_external_account_ref)
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
    organization_id,customer_id,source_mode,external_account_ref,source_as_of,evidence_sha256,
    record_count,currency_codes,source_reference
  ) VALUES (
    p_organization_id,p_customer_id,p_source_mode,btrim(p_external_account_ref),p_source_as_of,
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
REVOKE ALL ON FUNCTION public.record_customer_financial_source_sync(uuid,uuid,text,text,timestamptz,text,integer,text[],text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_customer_financial_source_sync(uuid,uuid,text,text,timestamptz,text,integer,text[],text) TO service_role;

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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND p_customer_id IS NOT NULL
     AND p_organization_id IS NOT NULL
     AND p_customer_id = public.current_customer_id()
     AND p_organization_id = public.current_organization_id()
     AND public.current_customer_can('invoices.read')
     AND EXISTS (
       SELECT 1
         FROM public.customer_financial_source_bindings b
        WHERE b.organization_id = p_organization_id
          AND b.customer_id = p_customer_id
          AND b.source_mode = 'APP_ONLY'
          AND b.source_status = 'active'
     )
$function$;
REVOKE ALL ON FUNCTION public.customer_app_only_invoice_read_allowed(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_app_only_invoice_read_allowed(uuid,uuid) TO authenticated;
COMMENT ON FUNCTION public.customer_app_only_invoice_read_allowed(uuid,uuid) IS
  'Boolean-only source predicate for the current customer''s invoice RLS; does not disclose source mode, binding metadata or external account references.';

ALTER TABLE public.customer_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_invoice_financial_source_read_guard ON public.customer_invoices;
CREATE POLICY customer_invoice_financial_source_read_guard
  ON public.customer_invoices
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    (public.is_staff() AND organization_id = public.current_organization_id())
    OR public.customer_app_only_invoice_read_allowed(customer_id, organization_id)
  );

DROP POLICY IF EXISTS customer_invoice_item_financial_source_read_guard ON public.customer_invoice_items;
CREATE POLICY customer_invoice_item_financial_source_read_guard
  ON public.customer_invoice_items
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    (public.is_staff() AND customer_invoice_items.organization_id = public.current_organization_id())
    OR EXISTS (
      SELECT 1
        FROM public.customer_invoices i
       WHERE i.id = customer_invoice_items.invoice_id
         AND i.organization_id = customer_invoice_items.organization_id
         AND public.customer_app_only_invoice_read_allowed(i.customer_id, i.organization_id)
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


COMMIT;