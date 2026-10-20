-- NASR1-ORIGINAL-SPEC-AI-GATEWAY-USAGE-AUDIT-009
-- Distinguish provider-observed usage from conservative quota estimates. Never persist prompt/response bodies or secrets.
ALTER TABLE public.ai_usage_ledger
 ADD COLUMN IF NOT EXISTS actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 ADD COLUMN IF NOT EXISTS usage_measurement_status text NOT NULL DEFAULT 'legacy_unknown',
 ADD COLUMN IF NOT EXISTS observed_input_tokens bigint,
 ADD COLUMN IF NOT EXISTS observed_output_tokens bigint,
 ADD COLUMN IF NOT EXISTS provider_attempt_count smallint NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS provider_attempts jsonb NOT NULL DEFAULT '[]'::jsonb,
 ADD COLUMN IF NOT EXISTS outcome_reason text;
DO $constraints$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.ai_usage_ledger'::regclass AND conname='ai_usage_ledger_measurement_status_check') THEN
  ALTER TABLE public.ai_usage_ledger ADD CONSTRAINT ai_usage_ledger_measurement_status_check CHECK(usage_measurement_status IN('measured','partial','unknown','not_attempted','legacy_unknown'));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.ai_usage_ledger'::regclass AND conname='ai_usage_ledger_observed_input_check') THEN
  ALTER TABLE public.ai_usage_ledger ADD CONSTRAINT ai_usage_ledger_observed_input_check CHECK(observed_input_tokens IS NULL OR observed_input_tokens BETWEEN 0 AND 2000000);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.ai_usage_ledger'::regclass AND conname='ai_usage_ledger_observed_output_check') THEN
  ALTER TABLE public.ai_usage_ledger ADD CONSTRAINT ai_usage_ledger_observed_output_check CHECK(observed_output_tokens IS NULL OR observed_output_tokens BETWEEN 0 AND 100000);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.ai_usage_ledger'::regclass AND conname='ai_usage_ledger_attempt_count_check') THEN
  ALTER TABLE public.ai_usage_ledger ADD CONSTRAINT ai_usage_ledger_attempt_count_check CHECK(provider_attempt_count BETWEEN 0 AND 2);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.ai_usage_ledger'::regclass AND conname='ai_usage_ledger_attempts_array_check') THEN
  ALTER TABLE public.ai_usage_ledger ADD CONSTRAINT ai_usage_ledger_attempts_array_check CHECK(jsonb_typeof(provider_attempts)='array' AND jsonb_array_length(provider_attempts)<=2);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.ai_usage_ledger'::regclass AND conname='ai_usage_ledger_attempt_count_matches_check') THEN
  ALTER TABLE public.ai_usage_ledger ADD CONSTRAINT ai_usage_ledger_attempt_count_matches_check CHECK(provider_attempt_count=jsonb_array_length(provider_attempts));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.ai_usage_ledger'::regclass AND conname='ai_usage_ledger_outcome_reason_check') THEN
  ALTER TABLE public.ai_usage_ledger ADD CONSTRAINT ai_usage_ledger_outcome_reason_check CHECK(outcome_reason IS NULL OR outcome_reason IN('ai_disabled','provider_not_configured','gateway_configuration_failed','quota_reservation_disabled','quota_exceeded'));
 END IF;
END $constraints$;
UPDATE public.ai_usage_ledger l SET actor_profile_id=r.actor_profile_id
 FROM public.ai_usage_reservations r WHERE r.organization_id=l.organization_id AND r.request_id=l.request_id AND l.actor_profile_id IS NULL;

CREATE OR REPLACE FUNCTION public.reserve_ai_gateway_usage(p_user_id uuid,p_request_id text,p_estimated_input_tokens bigint,p_estimated_output_tokens bigint,p_estimated_cost numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_profile uuid; v_org uuid; v_budget public.ai_usage_budgets%ROWTYPE;
 v_daily_cost numeric(15,6):=0; v_month_cost numeric(15,6):=0; v_daily_tokens bigint:=0; v_month_tokens bigint:=0;
 v_res_cost numeric(15,6):=0; v_res_daily_tokens bigint:=0; v_res_month_tokens bigint:=0; v_reservation public.ai_usage_reservations%ROWTYPE;
BEGIN
 IF coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' AND session_user NOT IN('postgres','supabase_admin') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='trusted AI gateway required'; END IF;
 IF p_user_id IS NULL OR coalesce(length(btrim(p_request_id)),0)<1 OR length(p_request_id)>120
  OR p_estimated_input_tokens IS NULL OR p_estimated_input_tokens NOT BETWEEN 0 AND 2000000
  OR p_estimated_output_tokens IS NULL OR p_estimated_output_tokens NOT BETWEEN 0 AND 100000
  OR p_estimated_cost IS NULL OR p_estimated_cost NOT BETWEEN 0 AND 10000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='AI quota reservation input is invalid'; END IF;
 SELECT p.id,p.organization_id INTO v_profile,v_org FROM public.profiles p WHERE p.auth_user_id=p_user_id AND p.is_active=true ORDER BY p.created_at,p.id LIMIT 1;
 IF v_profile IS NULL OR v_org IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
 SELECT b.* INTO v_budget FROM public.ai_usage_budgets b WHERE b.organization_id=v_org FOR UPDATE;
 IF NOT FOUND OR NOT v_budget.ai_enabled THEN RETURN jsonb_build_object('status','disabled'); END IF;
 IF EXISTS(SELECT 1 FROM public.ai_usage_reservations r WHERE r.organization_id=v_org AND r.request_id=p_request_id)
  OR EXISTS(SELECT 1 FROM public.ai_usage_ledger l WHERE l.organization_id=v_org AND l.request_id=p_request_id) THEN RETURN jsonb_build_object('status','duplicate_request'); END IF;
 UPDATE public.ai_usage_reservations SET status='expired' WHERE organization_id=v_org AND status='reserved' AND expires_at<=now();
 SELECT coalesce(sum(l.estimated_cost),0),coalesce(sum(l.input_tokens+l.output_tokens),0) INTO v_daily_cost,v_daily_tokens
 FROM public.ai_usage_ledger l WHERE l.organization_id=v_org AND l.created_at>=date_trunc('day',now()) AND l.result_status<>'rejected_quota';
 SELECT coalesce(sum(l.estimated_cost),0),coalesce(sum(l.input_tokens+l.output_tokens),0) INTO v_month_cost,v_month_tokens
 FROM public.ai_usage_ledger l WHERE l.organization_id=v_org AND l.created_at>=date_trunc('month',now()) AND l.result_status<>'rejected_quota';
 SELECT coalesce(sum(r.reserved_cost),0),coalesce(sum(r.reserved_input_tokens+r.reserved_output_tokens) FILTER(WHERE r.created_at>=date_trunc('day',now())),0),coalesce(sum(r.reserved_input_tokens+r.reserved_output_tokens),0)
 INTO v_res_cost,v_res_daily_tokens,v_res_month_tokens FROM public.ai_usage_reservations r WHERE r.organization_id=v_org AND r.status='reserved' AND r.expires_at>now();
 IF p_estimated_cost>v_budget.per_request_cost_limit OR v_daily_cost+v_res_cost+p_estimated_cost>v_budget.daily_cost_limit
  OR v_month_cost+v_res_cost+p_estimated_cost>v_budget.monthly_cost_limit
  OR v_daily_tokens+v_res_daily_tokens+p_estimated_input_tokens+p_estimated_output_tokens>v_budget.daily_token_limit
  OR v_month_tokens+v_res_month_tokens+p_estimated_input_tokens+p_estimated_output_tokens>v_budget.monthly_token_limit THEN
  INSERT INTO public.ai_usage_ledger(organization_id,actor_profile_id,request_id,model_name,input_tokens,output_tokens,estimated_cost,execution_time_ms,fallback_used,result_status,usage_measurement_status,provider_attempt_count,provider_attempts,outcome_reason)
  VALUES(v_org,v_profile,p_request_id,'quota_gate',0,0,0,0,false,'rejected_quota','not_attempted',0,'[]'::jsonb,'quota_exceeded')
  ON CONFLICT(organization_id,request_id) DO NOTHING;
  RETURN jsonb_build_object('status','quota_exceeded');
 END IF;
 INSERT INTO public.ai_usage_reservations(organization_id,actor_profile_id,request_id,provider,model_name,reserved_input_tokens,reserved_output_tokens,reserved_cost,status)
 VALUES(v_org,v_profile,p_request_id,v_budget.primary_provider,v_budget.primary_model,p_estimated_input_tokens,p_estimated_output_tokens,p_estimated_cost,'reserved')
 RETURNING * INTO v_reservation;
 RETURN jsonb_build_object('status','reserved','reservation_id',v_reservation.id,'request_id',v_reservation.request_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.reserve_ai_gateway_usage(uuid,text,bigint,bigint,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_gateway_usage(uuid,text,bigint,bigint,numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_ai_gateway_usage_v2(
 p_reservation_id uuid,p_input_tokens bigint,p_output_tokens bigint,p_estimated_cost numeric,p_execution_time_ms bigint,p_provider text,p_model_name text,p_result_status text,p_fallback_used boolean,
 p_observed_input_tokens bigint,p_observed_output_tokens bigint,p_usage_measurement_status text,p_provider_attempts jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_res public.ai_usage_reservations%ROWTYPE; v_attempt jsonb; v_completion jsonb; v_rows integer:=0; v_success integer:=0; v_failed integer:=0; v_in bigint:=0; v_out bigint:=0;
BEGIN
 IF coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' AND session_user NOT IN('postgres','supabase_admin') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='trusted AI gateway required'; END IF;
 IF p_reservation_id IS NULL OR p_input_tokens IS NULL OR p_input_tokens NOT BETWEEN 0 AND 2000000 OR p_output_tokens IS NULL OR p_output_tokens NOT BETWEEN 0 AND 100000
  OR p_estimated_cost IS NULL OR p_estimated_cost NOT BETWEEN 0 AND 10000 OR p_execution_time_ms IS NULL OR p_execution_time_ms NOT BETWEEN 0 AND 600000
  OR coalesce(p_provider,'') NOT IN('openai_compatible','gemini','quota_gate') OR length(coalesce(p_model_name,''))>180
  OR coalesce(p_result_status,'') NOT IN('completed','failed','fallback') OR coalesce(p_usage_measurement_status,'') NOT IN('measured','partial','unknown')
  OR jsonb_typeof(p_provider_attempts) IS DISTINCT FROM 'array' OR jsonb_array_length(p_provider_attempts) NOT BETWEEN 1 AND 2 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='AI usage telemetry input is invalid'; END IF;
 FOR v_attempt IN SELECT value FROM jsonb_array_elements(p_provider_attempts) AS attempts(value) LOOP
  IF jsonb_typeof(v_attempt)<>'object' OR coalesce(v_attempt->>'provider','') NOT IN('openai_compatible','gemini') OR length(coalesce(v_attempt->>'model','')) NOT BETWEEN 1 AND 160
   OR jsonb_typeof(v_attempt->'fallback') IS DISTINCT FROM 'boolean' OR coalesce(v_attempt->>'status','') NOT IN('succeeded','failed')
   OR coalesce(v_attempt->>'elapsed_ms','') !~ '^(0|[1-9][0-9]{0,5})$' OR (v_attempt->>'elapsed_ms')::integer>600000 THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='AI provider attempt metadata is invalid'; END IF;
  IF v_attempt->>'status'='succeeded' THEN
   IF coalesce(v_attempt->>'observed_input_tokens','') !~ '^(0|[1-9][0-9]{0,6})$' OR (v_attempt->>'observed_input_tokens')::bigint>2000000
    OR coalesce(v_attempt->>'observed_output_tokens','') !~ '^(0|[1-9][0-9]{0,5})$' OR (v_attempt->>'observed_output_tokens')::bigint>100000
    OR coalesce(v_attempt->>'estimated_cost','') !~ '^(0|[1-9][0-9]{0,4})([.][0-9]{1,6})?$'
    OR (v_attempt->>'estimated_cost')::numeric NOT BETWEEN 0 AND 10000 OR coalesce(v_attempt->>'error_code','')<>'' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='successful provider telemetry invalid'; END IF;
   v_success:=v_success+1;v_in:=v_in+(v_attempt->>'observed_input_tokens')::bigint;v_out:=v_out+(v_attempt->>'observed_output_tokens')::bigint;
  ELSE
   IF v_attempt->>'observed_input_tokens' IS NOT NULL OR v_attempt->>'observed_output_tokens' IS NOT NULL OR v_attempt->>'estimated_cost' IS NOT NULL
    OR coalesce(v_attempt->>'error_code','') !~ '^[a-z0-9_]{1,80}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='failed provider use must remain unknown'; END IF;
   v_failed:=v_failed+1;
  END IF;
 END LOOP;
 IF p_usage_measurement_status='measured' THEN
  IF v_success<>1 OR v_failed<>0 OR p_observed_input_tokens IS DISTINCT FROM v_in OR p_observed_output_tokens IS DISTINCT FROM v_out
   OR p_observed_input_tokens IS NULL OR p_observed_output_tokens IS NULL OR p_fallback_used IS DISTINCT FROM
   (SELECT (value->>'fallback')::boolean FROM jsonb_array_elements(p_provider_attempts) attempts(value) WHERE value->>'status'='succeeded' LIMIT 1) THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='measured usage mismatch'; END IF;
 ELSIF p_usage_measurement_status='partial' THEN
  IF v_success<>1 OR v_failed<1 OR jsonb_array_length(p_provider_attempts)<>2 OR p_fallback_used IS DISTINCT FROM true
   OR p_observed_input_tokens IS DISTINCT FROM v_in OR p_observed_output_tokens IS DISTINCT FROM v_out THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='partial usage mismatch'; END IF;
 ELSE
  IF v_success<>0 OR v_failed<1 OR p_observed_input_tokens IS NOT NULL OR p_observed_output_tokens IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='unknown usage cannot claim measured tokens'; END IF;
 END IF;
 SELECT r.* INTO v_res FROM public.ai_usage_reservations r WHERE r.id=p_reservation_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='AI reservation not found'; END IF;
 IF v_res.status='completed' THEN RETURN jsonb_build_object('status','already_completed','request_id',v_res.request_id); END IF;
 IF v_res.status<>'reserved' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='AI reservation inactive'; END IF;
 v_completion:=public.complete_ai_gateway_usage(p_reservation_id,p_input_tokens,p_output_tokens,p_estimated_cost,p_execution_time_ms,p_provider,p_model_name,p_result_status,p_fallback_used);
 IF v_completion->>'status' IS DISTINCT FROM 'completed' THEN RETURN v_completion; END IF;
 UPDATE public.ai_usage_ledger SET actor_profile_id=v_res.actor_profile_id,usage_measurement_status=p_usage_measurement_status,
  observed_input_tokens=p_observed_input_tokens,observed_output_tokens=p_observed_output_tokens,provider_attempt_count=jsonb_array_length(p_provider_attempts),provider_attempts=p_provider_attempts,outcome_reason=NULL
 WHERE organization_id=v_res.organization_id AND request_id=v_res.request_id;
 GET DIAGNOSTICS v_rows=ROW_COUNT;IF v_rows<>1 THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='AI ledger row not finalized';END IF;
 RETURN v_completion;
END;
$function$;
REVOKE ALL ON FUNCTION public.complete_ai_gateway_usage_v2(uuid,bigint,bigint,numeric,bigint,text,text,text,boolean,bigint,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_ai_gateway_usage_v2(uuid,bigint,bigint,numeric,bigint,text,text,text,boolean,bigint,bigint,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.record_ai_gateway_no_provider_attempt(p_user_id uuid,p_request_id text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_profile uuid;v_org uuid;v_rows integer:=0;v_actor uuid;v_reason text;
BEGIN
 IF coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' AND session_user NOT IN('postgres','supabase_admin') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='trusted AI gateway required';END IF;
 IF p_user_id IS NULL OR coalesce(length(btrim(p_request_id)),0)<1 OR length(p_request_id)>120
  OR coalesce(p_reason,'') NOT IN('ai_disabled','provider_not_configured','gateway_configuration_failed','quota_reservation_disabled') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='AI no-provider outcome invalid';END IF;
 SELECT p.id,p.organization_id INTO v_profile,v_org FROM public.profiles p WHERE p.auth_user_id=p_user_id AND p.is_active=true ORDER BY p.created_at,p.id LIMIT 1;
 IF v_profile IS NULL OR v_org IS NULL THEN RETURN jsonb_build_object('status','unauthorized');END IF;
 INSERT INTO public.ai_usage_ledger(organization_id,actor_profile_id,request_id,model_name,input_tokens,output_tokens,estimated_cost,execution_time_ms,fallback_used,result_status,usage_measurement_status,provider_attempt_count,provider_attempts,outcome_reason)
 VALUES(v_org,v_profile,p_request_id,'gateway_unavailable',0,0,0,0,false,'fallback','not_attempted',0,'[]'::jsonb,p_reason) ON CONFLICT(organization_id,request_id) DO NOTHING;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 IF v_rows=0 THEN
  SELECT actor_profile_id,outcome_reason INTO v_actor,v_reason FROM public.ai_usage_ledger WHERE organization_id=v_org AND request_id=p_request_id;
  IF v_actor IS DISTINCT FROM v_profile OR v_reason IS DISTINCT FROM p_reason THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='AI idempotency key reused with different payload';END IF;
  RETURN jsonb_build_object('status','already_recorded','request_id',p_request_id);
 END IF;
 RETURN jsonb_build_object('status','recorded','request_id',p_request_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.record_ai_gateway_no_provider_attempt(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_ai_gateway_no_provider_attempt(uuid,text,text) TO service_role;
COMMENT ON FUNCTION public.complete_ai_gateway_usage_v2(uuid,bigint,bigint,numeric,bigint,text,text,text,boolean,bigint,bigint,text,jsonb) IS 'Stores observed provider tokens separately from conservative quota estimates; no prompts or credentials.';
COMMENT ON FUNCTION public.record_ai_gateway_no_provider_attempt(uuid,text,text) IS 'Records a tenant-scoped AI outcome when no provider was called.';
