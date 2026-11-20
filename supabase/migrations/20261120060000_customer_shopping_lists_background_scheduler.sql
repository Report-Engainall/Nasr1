-- Materialize recurring customer shopping-list reviews independently of browser visits.
-- Each run is a review snapshot only; checkout and stock reservation remain separate.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT EXECUTE ON FUNCTION cron.schedule(text,text,text) TO postgres;
GRANT EXECUTE ON FUNCTION cron.unschedule(bigint) TO postgres;

CREATE TABLE IF NOT EXISTS public.customer_shopping_list_scheduler_state (
  singleton_id boolean PRIMARY KEY DEFAULT true CHECK (singleton_id = true),
  last_organization_id uuid,
  last_customer_id uuid,
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CHECK ((last_organization_id IS NULL) = (last_customer_id IS NULL))
);
ALTER TABLE public.customer_shopping_list_scheduler_state OWNER TO postgres;
REVOKE ALL ON TABLE public.customer_shopping_list_scheduler_state FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.customer_shopping_list_scheduler_state TO postgres;
INSERT INTO public.customer_shopping_list_scheduler_state(singleton_id)
VALUES(true) ON CONFLICT(singleton_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.run_due_customer_shopping_list_scheduler()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_customer record;
  v_result jsonb;
  v_processed integer := 0;
  v_created integer := 0;
  v_today date := (pg_catalog.now() AT TIME ZONE 'Asia/Aden')::date;
  v_start_organization uuid;
  v_start_customer uuid;
  v_last_organization uuid;
  v_last_customer uuid;
  v_previous_profile text := pg_catalog.current_setting('app.profile_id',true);
  v_previous_organization text := pg_catalog.current_setting('app.organization_id',true);
  v_previous_subject text := pg_catalog.current_setting('request.jwt.claim.sub',true);
BEGIN
  IF session_user <> 'postgres' THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='recurring shopping-list scheduler is restricted to the postgres cron session';
  END IF;

  -- Serialize cron invocations and rotate the starting tenant after each bounded batch.
  INSERT INTO public.customer_shopping_list_scheduler_state(singleton_id)
  VALUES(true) ON CONFLICT(singleton_id) DO NOTHING;
  SELECT last_organization_id,last_customer_id
    INTO v_start_organization,v_start_customer
    FROM public.customer_shopping_list_scheduler_state
   WHERE singleton_id=true
   FOR UPDATE;
  v_last_organization:=v_start_organization;
  v_last_customer:=v_start_customer;

  FOR v_customer IN
    WITH due_customers AS (
      SELECT DISTINCT l.organization_id,l.customer_id,c.profile_id,p.auth_user_id
        FROM public.customer_shopping_lists AS l
        JOIN public.customers AS c
          ON c.id=l.customer_id
         AND c.organization_id=l.organization_id
         AND c.status='approved'
        JOIN public.profiles AS p
          ON p.id=c.profile_id
         AND p.organization_id=l.organization_id
         AND p.is_active=true
         AND p.auth_user_id IS NOT NULL
       WHERE l.status='active'
         AND l.is_draft=false
         AND l.recurrence IN ('weekly','monthly')
         AND l.next_run_on<=v_today
    )
    SELECT *
      FROM due_customers
     ORDER BY
       CASE
         WHEN v_start_organization IS NULL
           OR (organization_id,customer_id) > (v_start_organization,v_start_customer)
         THEN 0 ELSE 1
       END,
       organization_id,customer_id
     LIMIT 100
  LOOP
    -- Advance the cursor even when a former owner no longer has reorder.manage;
    -- a blocked tenant must not starve other companies in later batches.
    v_last_organization:=v_customer.organization_id;
    v_last_customer:=v_customer.customer_id;

    -- Reuse the verified company-owner identity; the delegated materializer rechecks
    -- active membership, organization, customer and reorder.manage capability.
    PERFORM pg_catalog.set_config('app.profile_id',v_customer.profile_id::text,true);
    PERFORM pg_catalog.set_config('app.organization_id',v_customer.organization_id::text,true);
    PERFORM pg_catalog.set_config('request.jwt.claim.sub',v_customer.auth_user_id::text,true);

    IF public.current_customer_id() IS DISTINCT FROM v_customer.customer_id
       OR NOT public.current_customer_can('reorder.manage') THEN
      CONTINUE;
    END IF;

    v_result := public.materialize_due_customer_shopping_list_runs();
    v_created := v_created + COALESCE((v_result->>'created_runs')::integer,0);
    v_processed := v_processed + 1;
  END LOOP;

  UPDATE public.customer_shopping_list_scheduler_state
     SET last_organization_id=v_last_organization,
         last_customer_id=v_last_customer,
         updated_at=pg_catalog.now()
   WHERE singleton_id=true;

  PERFORM pg_catalog.set_config('app.profile_id',COALESCE(v_previous_profile,''),true);
  PERFORM pg_catalog.set_config('app.organization_id',COALESCE(v_previous_organization,''),true);
  PERFORM pg_catalog.set_config('request.jwt.claim.sub',COALESCE(v_previous_subject,''),true);

  RETURN pg_catalog.jsonb_build_object(
    'processed_customers',v_processed,
    'created_runs',v_created,
    'local_date',v_today,
    'batch_limit',100
  );
END
$function$;

ALTER FUNCTION public.run_due_customer_shopping_list_scheduler() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_due_customer_shopping_list_scheduler() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.run_due_customer_shopping_list_scheduler() TO postgres;

DO $schedule$
DECLARE
  v_job_id bigint;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='the customer shopping-list cron job must be installed by postgres';
  END IF;

  FOR v_job_id IN
    SELECT jobid FROM cron.job
     WHERE jobname='aghbari_customer_shopping_lists_due_v1'
       AND username='postgres'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'aghbari_customer_shopping_lists_due_v1',
    '*/5 * * * *',
    'SELECT public.run_due_customer_shopping_list_scheduler();'
  );
END
$schedule$;

COMMENT ON FUNCTION public.run_due_customer_shopping_list_scheduler() IS
  'Postgres-only pg_cron worker every five minutes. Materializes due weekly/monthly review snapshots across active approved companies using each company owner identity and the existing authorization-checked materializer. A locked persistent cursor rotates 100-customer batches to prevent tenant starvation, including when an earlier tenant remains blocked or has more than 100 due lists. Never submits an order, loads a cart, reserves stock or stores prices.';

COMMIT;
