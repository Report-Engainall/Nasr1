-- NASR1-ORIGINAL-SPEC-STOCK-COUNT-VARIANCE-TASKS-015
-- Turn source-backed physical stock-count differences into one warehouse follow-up task.
-- This does not estimate monetary impact, silently post accounting, or create tasks for zero variance.

CREATE OR REPLACE FUNCTION public.operational_tasks_from_stock_count_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_adjusted_lines integer := 0;
  v_positive numeric(20,3) := 0;
  v_negative numeric(20,3) := 0;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status OR NEW.status IS DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;

  SELECT
    count(*) FILTER (WHERE coalesce(line.variance, 0) <> 0)::integer,
    coalesce(sum(line.variance) FILTER (WHERE line.variance > 0), 0)::numeric(20,3),
    coalesce(sum(-line.variance) FILTER (WHERE line.variance < 0), 0)::numeric(20,3)
  INTO v_adjusted_lines, v_positive, v_negative
  FROM public.stock_count_lines line
  WHERE line.organization_id = NEW.organization_id
    AND line.session_id = NEW.id;

  IF v_adjusted_lines > 0 THEN
    PERFORM public.upsert_operational_task(
      NEW.organization_id,
      'مراجعة فروقات الجرد #' || pg_catalog.left(NEW.id::text, 8),
      'اكتمل الجرد مع فروقات كمية مطبقة من مصدر الجلسة. راجع حركة المخزون وسجل أسباب الفروقات والإجراء المتخذ؛ لا تُستنتج قيمة مالية أو قيد محاسبي من الكميات وحدها.',
      'warehouse', 'medium', 'stock_count_variance_review',
      'stock-count-variance:' || NEW.id::text,
      'stock_count_sessions', NEW.id, NULL,
      pg_catalog.jsonb_build_object(
        'session_id', NEW.id,
        'warehouse_id', NEW.warehouse_id,
        'adjusted_lines', v_adjusted_lines,
        'positive_adjustment_quantity', v_positive,
        'negative_adjustment_quantity', v_negative,
        'total_lines', NEW.total_lines,
        'completed_at', NEW.completed_at
      ),
      false
    );
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.operational_tasks_from_stock_count_completion() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS operational_tasks_stock_count_completed ON public.stock_count_sessions;
CREATE TRIGGER operational_tasks_stock_count_completed
AFTER UPDATE OF status ON public.stock_count_sessions
FOR EACH ROW EXECUTE FUNCTION public.operational_tasks_from_stock_count_completion();

DO $block$
BEGIN
  IF to_regprocedure('public.refresh_operational_tasks_pre_stock_count_v1()') IS NULL THEN
    ALTER FUNCTION public.refresh_operational_tasks() RENAME TO refresh_operational_tasks_pre_stock_count_v1;
  END IF;
END
$block$;

REVOKE ALL ON FUNCTION public.refresh_operational_tasks_pre_stock_count_v1() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_operational_tasks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_org uuid := public.current_organization_id();
  v_existing_result jsonb;
  v_count integer := 0;
  r record;
BEGIN
  IF auth.uid() IS NULL OR v_org IS NULL OR NOT public.operational_tasks_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='administrator or manager permission required to refresh tasks';
  END IF;

  v_existing_result := public.refresh_operational_tasks_pre_stock_count_v1();

  FOR r IN
    SELECT session.id, session.warehouse_id, session.total_lines, session.completed_at,
           count(*) FILTER (WHERE coalesce(line.variance, 0) <> 0)::integer AS adjusted_lines,
           coalesce(sum(line.variance) FILTER (WHERE line.variance > 0), 0)::numeric(20,3) AS positive_adjustment_quantity,
           coalesce(sum(-line.variance) FILTER (WHERE line.variance < 0), 0)::numeric(20,3) AS negative_adjustment_quantity
      FROM public.stock_count_sessions session
      JOIN public.stock_count_lines line
        ON line.organization_id = session.organization_id
       AND line.session_id = session.id
     WHERE session.organization_id = v_org
       AND session.status = 'completed'
     GROUP BY session.id, session.warehouse_id, session.total_lines, session.completed_at
    HAVING count(*) FILTER (WHERE coalesce(line.variance, 0) <> 0) > 0
  LOOP
    PERFORM public.upsert_operational_task(
      v_org,
      'مراجعة فروقات الجرد #' || pg_catalog.left(r.id::text, 8),
      'اكتمل الجرد مع فروقات كمية مطبقة من مصدر الجلسة. راجع حركة المخزون وسجل أسباب الفروقات والإجراء المتخذ؛ لا تُستنتج قيمة مالية أو قيد محاسبي من الكميات وحدها.',
      'warehouse', 'medium', 'stock_count_variance_review',
      'stock-count-variance:' || r.id::text,
      'stock_count_sessions', r.id, NULL,
      pg_catalog.jsonb_build_object(
        'session_id', r.id,
        'warehouse_id', r.warehouse_id,
        'adjusted_lines', r.adjusted_lines,
        'positive_adjustment_quantity', r.positive_adjustment_quantity,
        'negative_adjustment_quantity', r.negative_adjustment_quantity,
        'total_lines', r.total_lines,
        'completed_at', r.completed_at
      ),
      false
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN coalesce(v_existing_result, '{}'::jsonb)
    || pg_catalog.jsonb_build_object(
      'source_records_refreshed',
      coalesce(nullif(v_existing_result ->> 'source_records_refreshed', '')::integer, 0) + v_count,
      'stock_count_variance_tasks_refreshed', v_count,
      'refreshed_at', pg_catalog.now()
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.refresh_operational_tasks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_operational_tasks() TO authenticated;

COMMENT ON FUNCTION public.operational_tasks_from_stock_count_completion() IS
  'Creates one source-linked warehouse follow-up task when a completed stock count has non-zero quantity variance.';
COMMENT ON FUNCTION public.refresh_operational_tasks() IS
  'Rebuilds source-linked tasks from saved commerce, receiving, return-credit and completed stock-count records.';
