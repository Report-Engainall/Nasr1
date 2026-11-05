-- AGH-MANUAL-TASK-EDIT-001
-- Manager-only editing of manually created task text; source-generated tasks remain immutable here.
CREATE OR REPLACE FUNCTION public.update_manual_operational_task(
  p_task_id uuid,
  p_title text,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_task public.ai_tasks%ROWTYPE;
  v_title text := pg_catalog.btrim(coalesce(p_title,''));
  v_description text := nullif(pg_catalog.btrim(coalesce(p_description,'')),'');
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.operational_tasks_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='administrator or manager permission required to edit manual tasks';
  END IF;

  IF p_task_id IS NULL OR v_title='' OR pg_catalog.length(v_title)>240
     OR pg_catalog.length(coalesce(v_description,''))>2000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='manual task title or description is invalid';
  END IF;

  SELECT t.*
  INTO v_task
  FROM public.ai_tasks t
  WHERE t.id=p_task_id
    AND t.organization_id=v_org
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002',
      MESSAGE='task is unavailable for this organization';
  END IF;

  IF v_task.task_type IS DISTINCT FROM 'manual_operational_task'
     OR v_task.source_entity_type IS NOT NULL
     OR v_task.source_entity_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='source-generated tasks cannot be edited as manual tasks';
  END IF;

  IF v_task.status IN ('completed','cancelled') THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='only open manual tasks can be edited';
  END IF;

  IF v_task.title IS NOT DISTINCT FROM v_title
     AND v_task.description IS NOT DISTINCT FROM v_description THEN
    RETURN jsonb_build_object(
      'id',v_task.id,
      'title',v_task.title,
      'description',v_task.description,
      'changed',false
    );
  END IF;

  UPDATE public.ai_tasks
  SET title=v_title,
      description=v_description,
      updated_at=now()
  WHERE id=v_task.id
    AND organization_id=v_org;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value
  )
  VALUES(
    v_org,v_actor,'operational_task.manual_text_changed','ai_task',v_task.id,
    jsonb_build_object('title',v_task.title,'description',v_task.description),
    jsonb_build_object('title',v_title,'description',v_description)
  );

  RETURN jsonb_build_object(
    'id',v_task.id,
    'title',v_title,
    'description',v_description,
    'changed',true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_manual_operational_task(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_manual_operational_task(uuid,text,text) TO authenticated;
COMMENT ON FUNCTION public.update_manual_operational_task(uuid,text,text) IS
  'Manager-only, same-tenant editing of open manual task title and description; source-generated tasks are immutable, updates are row-locked and audited.';
