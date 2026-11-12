-- AGH-NOTIFICATION-DESTINATION-001
-- Every operational-task notification carries a typed destination to the existing task center.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid;

CREATE INDEX IF NOT EXISTS notifications_entity_destination_idx
  ON public.notifications(organization_id,entity_type,entity_id,created_at DESC)
  WHERE entity_type IS NOT NULL AND entity_id IS NOT NULL;

GRANT SELECT (entity_type,entity_id) ON public.notifications TO authenticated;

CREATE OR REPLACE FUNCTION public.link_operational_task_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
BEGIN
  UPDATE public.notifications
  SET entity_type='ai_task',
      entity_id=NEW.id
  WHERE organization_id=NEW.organization_id
    AND dedupe_key LIKE 'operational-task:'||NEW.id::text||':%'
    AND (entity_type IS DISTINCT FROM 'ai_task' OR entity_id IS DISTINCT FROM NEW.id);
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.link_operational_task_notifications() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS zz_operational_task_notification_destination ON public.ai_tasks;
CREATE TRIGGER zz_operational_task_notification_destination
AFTER INSERT OR UPDATE OF assigned_to
ON public.ai_tasks
FOR EACH ROW
EXECUTE FUNCTION public.link_operational_task_notifications();

COMMENT ON FUNCTION public.link_operational_task_notifications() IS
  'Attaches a typed ai_task destination to notifications created by the preceding operational-task notification trigger; it performs no client-visible write and uses the same organization/task id.';
