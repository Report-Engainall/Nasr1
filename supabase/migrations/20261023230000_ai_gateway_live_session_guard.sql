-- Keep AI budget administration behind the same live-session boundary as other privileged operations.
-- A still-valid JWT whose Auth session row was revoked must not read or mutate organization AI settings.
CREATE OR REPLACE FUNCTION public.get_ai_gateway_budget()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid;
  v_org uuid;
  v_budget public.ai_usage_budgets%ROWTYPE;
  v_today_cost numeric(15,6) := 0;
  v_month_cost numeric(15,6) := 0;
  v_today_tokens bigint := 0;
  v_month_tokens bigint := 0;
  v_reserved_cost numeric(15,6) := 0;
  v_reserved_today_tokens bigint := 0;
  v_reserved_month_tokens bigint := 0;
  v_has_budget boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='authenticated administrator required';
  END IF;
  v_actor := public.current_profile_id();
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id = v_actor AND p.auth_user_id = auth.uid() AND p.is_active = true;
  IF v_actor IS NULL OR v_org IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles r WHERE r.profile_id=v_actor AND r.role IN ('admin','manager')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AI gateway settings require administrator or manager';
  END IF;

  SELECT b.* INTO v_budget FROM public.ai_usage_budgets b WHERE b.organization_id=v_org;
  v_has_budget := FOUND;
  SELECT coalesce(sum(l.estimated_cost),0),coalesce(sum(l.input_tokens+l.output_tokens),0)
    INTO v_today_cost,v_today_tokens FROM public.ai_usage_ledger l
   WHERE l.organization_id=v_org AND l.created_at>=date_trunc('day',now()) AND l.result_status<>'rejected_quota';
  SELECT coalesce(sum(l.estimated_cost),0),coalesce(sum(l.input_tokens+l.output_tokens),0)
    INTO v_month_cost,v_month_tokens FROM public.ai_usage_ledger l
   WHERE l.organization_id=v_org AND l.created_at>=date_trunc('month',now()) AND l.result_status<>'rejected_quota';
  SELECT coalesce(sum(r.reserved_cost),0),
         coalesce(sum(r.reserved_input_tokens+r.reserved_output_tokens) FILTER (WHERE r.created_at>=date_trunc('day',now())),0),
         coalesce(sum(r.reserved_input_tokens+r.reserved_output_tokens),0)
    INTO v_reserved_cost,v_reserved_today_tokens,v_reserved_month_tokens
    FROM public.ai_usage_reservations r
   WHERE r.organization_id=v_org AND r.status='reserved' AND r.expires_at>now();
  RETURN pg_catalog.jsonb_build_object(
    'organization_id',v_org,'ai_enabled',coalesce(v_budget.ai_enabled,false),
    'fallback_enabled',coalesce(v_budget.fallback_enabled,true),
    'primary_provider',coalesce(v_budget.primary_provider,'openai_compatible'),
    'primary_model',coalesce(v_budget.primary_model,'gpt-4o-mini'),
    'primary_base_url',coalesce(v_budget.primary_base_url,'https://api.openai.com/v1'),
    'fallback_provider',coalesce(v_budget.fallback_provider,'gemini'),
    'fallback_model',coalesce(v_budget.fallback_model,'gemini-2.0-flash'),
    'fallback_base_url',coalesce(v_budget.fallback_base_url,'https://generativelanguage.googleapis.com/v1beta'),
    'daily_cost_limit',coalesce(v_budget.daily_cost_limit,0),
    'monthly_cost_limit',coalesce(v_budget.monthly_cost_limit,0),
    'daily_token_limit',coalesce(v_budget.daily_token_limit,0),
    'monthly_token_limit',coalesce(v_budget.monthly_token_limit,0),
    'per_request_cost_limit',coalesce(v_budget.per_request_cost_limit,0),
    'today_cost',v_today_cost,'month_cost',v_month_cost,'today_tokens',v_today_tokens,'month_tokens',v_month_tokens,
    'reserved_cost',v_reserved_cost,'reserved_today_tokens',v_reserved_today_tokens,
    'reserved_month_tokens',v_reserved_month_tokens,'configured',v_has_budget,'keys_stored_in_database',false
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.get_ai_gateway_budget() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_ai_gateway_budget() TO authenticated;

CREATE OR REPLACE FUNCTION public.configure_ai_usage_budget(p_settings jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid;
  v_org uuid;
  v_primary_provider text;
  v_primary_model text;
  v_primary_url text;
  v_fallback_provider text;
  v_fallback_model text;
  v_fallback_url text;
  v_ai_enabled boolean;
  v_fallback_enabled boolean;
  v_daily_cost numeric(15,6);
  v_monthly_cost numeric(15,6);
  v_per_request numeric(15,6);
  v_daily_tokens bigint;
  v_monthly_tokens bigint;
BEGIN
  IF auth.uid() IS NULL OR p_settings IS NULL OR jsonb_typeof(p_settings)<>'object' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='authenticated settings object required';
  END IF;
  v_actor := public.current_profile_id();
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id = v_actor AND p.auth_user_id = auth.uid() AND p.is_active = true;
  IF v_actor IS NULL OR v_org IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles r WHERE r.profile_id=v_actor AND r.role IN ('admin','manager')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AI gateway settings require administrator or manager';
  END IF;

  v_primary_provider := coalesce(p_settings->>'primary_provider','openai_compatible');
  v_primary_model := btrim(coalesce(p_settings->>'primary_model',''));
  v_primary_url := btrim(coalesce(p_settings->>'primary_base_url',''));
  v_fallback_provider := coalesce(p_settings->>'fallback_provider','gemini');
  v_fallback_model := btrim(coalesce(p_settings->>'fallback_model',''));
  v_fallback_url := btrim(coalesce(p_settings->>'fallback_base_url',''));
  v_ai_enabled := coalesce((p_settings->>'ai_enabled')::boolean,false);
  v_fallback_enabled := coalesce((p_settings->>'fallback_enabled')::boolean,true);
  v_daily_cost := coalesce((p_settings->>'daily_cost_limit')::numeric,0);
  v_monthly_cost := coalesce((p_settings->>'monthly_cost_limit')::numeric,0);
  v_daily_tokens := coalesce((p_settings->>'daily_token_limit')::bigint,0);
  v_monthly_tokens := coalesce((p_settings->>'monthly_token_limit')::bigint,0);
  v_per_request := coalesce((p_settings->>'per_request_cost_limit')::numeric,0);
  IF v_primary_provider NOT IN ('openai_compatible','gemini')
     OR v_fallback_provider NOT IN ('openai_compatible','gemini')
     OR length(v_primary_model)<1 OR length(v_primary_model)>160
     OR (v_fallback_enabled AND (length(v_fallback_model)<1 OR length(v_fallback_model)>160))
     OR length(v_primary_url)<8 OR length(v_primary_url)>500
     OR (v_fallback_enabled AND (length(v_fallback_url)<8 OR length(v_fallback_url)>500))
     OR v_primary_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~!$&()*+,;=:@%/-]*)?$'
     OR (v_fallback_enabled AND v_fallback_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~!$&()*+,;=:@%/-]*)?$')
     OR position('@' in split_part(split_part(v_primary_url,'/',3),'?',1))>0
     OR (v_fallback_enabled AND position('@' in split_part(split_part(v_fallback_url,'/',3),'?',1))>0) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='AI provider or HTTPS endpoint configuration is invalid';
  END IF;
  IF v_daily_cost<0 OR v_daily_cost>100000 OR v_monthly_cost<0 OR v_monthly_cost>1000000
     OR v_per_request<0 OR v_per_request>10000 OR v_daily_tokens<0 OR v_daily_tokens>100000000
     OR v_monthly_tokens<0 OR v_monthly_tokens>1000000000 OR v_daily_tokens>v_monthly_tokens
     OR v_daily_cost>v_monthly_cost OR v_per_request>v_daily_cost OR v_per_request>v_monthly_cost THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='AI budget limits are outside their allowed range';
  END IF;
  IF v_ai_enabled AND (v_daily_cost<=0 OR v_monthly_cost<=0 OR v_per_request<=0 OR v_daily_tokens<=0 OR v_monthly_tokens<=0) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='positive cost and token caps are required before enabling AI';
  END IF;
  INSERT INTO public.ai_usage_budgets(
    organization_id,primary_provider,primary_model,primary_base_url,fallback_provider,fallback_model,fallback_base_url,
    daily_cost_limit,monthly_cost_limit,daily_token_limit,monthly_token_limit,per_request_cost_limit,
    ai_enabled,fallback_enabled,updated_by,updated_at
  ) VALUES (
    v_org,v_primary_provider,v_primary_model,v_primary_url,v_fallback_provider,
    CASE WHEN v_fallback_enabled THEN v_fallback_model ELSE coalesce(nullif(v_fallback_model,''),'gemini-2.0-flash') END,
    CASE WHEN v_fallback_enabled THEN v_fallback_url ELSE coalesce(nullif(v_fallback_url,''),'https://generativelanguage.googleapis.com/v1beta') END,
    v_daily_cost,v_monthly_cost,v_daily_tokens,v_monthly_tokens,v_per_request,v_ai_enabled,v_fallback_enabled,v_actor,now()
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    primary_provider=excluded.primary_provider,primary_model=excluded.primary_model,primary_base_url=excluded.primary_base_url,
    fallback_provider=excluded.fallback_provider,fallback_model=excluded.fallback_model,fallback_base_url=excluded.fallback_base_url,
    daily_cost_limit=excluded.daily_cost_limit,monthly_cost_limit=excluded.monthly_cost_limit,
    daily_token_limit=excluded.daily_token_limit,monthly_token_limit=excluded.monthly_token_limit,
    per_request_cost_limit=excluded.per_request_cost_limit,ai_enabled=excluded.ai_enabled,
    fallback_enabled=excluded.fallback_enabled,updated_by=excluded.updated_by,updated_at=now();
  RETURN public.get_ai_gateway_budget();
END;
$function$;
REVOKE ALL ON FUNCTION public.configure_ai_usage_budget(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.configure_ai_usage_budget(jsonb) TO authenticated;
