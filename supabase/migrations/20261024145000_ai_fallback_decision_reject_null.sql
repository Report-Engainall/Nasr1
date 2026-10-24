-- AGH-AI-USAGE-FALLBACK-DECISION-001
-- A fallback flag is a measured outcome; never infer false from NULL.
BEGIN;
CREATE OR REPLACE FUNCTION public.complete_ai_gateway_usage(
  p_reservation_id uuid,p_input_tokens bigint,p_output_tokens bigint,p_actual_cost numeric,p_execution_time_ms bigint,
  p_provider text,p_model_name text,p_result_status text,p_fallback_used boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_res public.ai_usage_reservations%ROWTYPE;
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' AND session_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='trusted AI gateway required';
  END IF;
  IF p_fallback_used IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='AI fallback decision must be explicit';
  END IF;
  IF p_reservation_id IS NULL OR p_input_tokens IS NULL OR p_input_tokens<0 OR p_input_tokens>2000000
     OR p_output_tokens IS NULL OR p_output_tokens<0 OR p_output_tokens>100000
     OR p_actual_cost IS NULL OR p_actual_cost<0 OR p_actual_cost>10000
     OR p_execution_time_ms IS NULL OR p_execution_time_ms<0 OR p_execution_time_ms>600000
     OR p_provider IS NULL OR p_provider NOT IN ('openai_compatible','gemini','quota_gate')
     OR length(coalesce(p_model_name,''))>180 OR p_result_status IS NULL OR p_result_status NOT IN ('completed','failed','fallback') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='AI usage completion input is invalid';
  END IF;
  SELECT r.* INTO v_res FROM public.ai_usage_reservations r WHERE r.id=p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='AI reservation not found'; END IF;
  IF v_res.status='completed' THEN RETURN jsonb_build_object('status','already_completed','request_id',v_res.request_id); END IF;
  IF v_res.status<>'reserved' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='AI reservation is not active'; END IF;
  UPDATE public.ai_usage_reservations SET status='completed',completed_at=now() WHERE id=v_res.id;
  INSERT INTO public.ai_usage_ledger(organization_id,request_id,model_name,input_tokens,output_tokens,estimated_cost,execution_time_ms,fallback_used,result_status)
  VALUES(v_res.organization_id,v_res.request_id,left(p_provider||'/'||coalesce(nullif(p_model_name,''),v_res.model_name),180),
    p_input_tokens,p_output_tokens,p_actual_cost,p_execution_time_ms,p_fallback_used,p_result_status)
  ON CONFLICT (organization_id,request_id) DO NOTHING;
  RETURN jsonb_build_object('status','completed','request_id',v_res.request_id,'result_status',p_result_status);
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_ai_gateway_usage_v2(
 p_reservation_id uuid,p_input_tokens bigint,p_output_tokens bigint,p_estimated_cost numeric,p_execution_time_ms bigint,p_provider text,p_model_name text,p_result_status text,p_fallback_used boolean,
 p_observed_input_tokens bigint,p_observed_output_tokens bigint,p_usage_measurement_status text,p_provider_attempts jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_res public.ai_usage_reservations%ROWTYPE; v_attempt jsonb; v_completion jsonb; v_rows integer:=0; v_success integer:=0; v_failed integer:=0; v_in bigint:=0; v_out bigint:=0;
BEGIN
 IF coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' AND session_user NOT IN('postgres','supabase_admin') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='trusted AI gateway required'; END IF;
 IF p_fallback_used IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='AI fallback decision must be explicit';
 END IF;
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
COMMIT;
