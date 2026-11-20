-- AGH-TASK-NOTIFICATION-001
-- Deliver in-app notifications when an operational task is assigned to a profile.
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  type text NOT NULL DEFAULT 'info',
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS profile_id uuid,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS type text DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

UPDATE public.notifications
SET id=gen_random_uuid()
WHERE id IS NULL;
ALTER TABLE public.notifications
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_id_uidx
  ON public.notifications(id);

CREATE INDEX IF NOT EXISTS notifications_profile_unread_created_idx
  ON public.notifications(organization_id,profile_id,is_read,created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_read_current_profile ON public.notifications;
CREATE POLICY notifications_read_current_profile
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (
    organization_id=public.current_organization_id()
    AND (profile_id IS NULL OR profile_id=public.current_profile_id())
  );

DROP POLICY IF EXISTS notifications_update_current_profile ON public.notifications;
CREATE POLICY notifications_update_current_profile
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (
    organization_id=public.current_organization_id()
    AND (profile_id IS NULL OR profile_id=public.current_profile_id())
  )
  WITH CHECK (
    organization_id=public.current_organization_id()
    AND (profile_id IS NULL OR profile_id=public.current_profile_id())
  );

REVOKE SELECT,INSERT,UPDATE,DELETE ON public.notifications FROM PUBLIC,anon,authenticated;
GRANT SELECT (id,organization_id,profile_id,title,body,type,is_read,created_at)
  ON public.notifications TO authenticated;
GRANT UPDATE (is_read) ON public.notifications TO authenticated;

-- A restrictive guard intersects any older permissive policy on this legacy table.
DROP POLICY IF EXISTS notifications_tenant_scope_guard ON public.notifications;
CREATE POLICY notifications_tenant_scope_guard
  ON public.notifications
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    organization_id=public.current_organization_id()
    AND (profile_id IS NULL OR profile_id=public.current_profile_id())
  )
  WITH CHECK (
    organization_id=public.current_organization_id()
    AND (profile_id IS NULL OR profile_id=public.current_profile_id())
  );

CREATE OR REPLACE FUNCTION public.notify_operational_task_assignee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_role_label text;
  v_title text;
BEGIN
  IF NEW.assigned_to IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP='UPDATE' AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN
    RETURN NEW;
  END IF;

  v_role_label:=CASE NEW.task_role
    WHEN 'sales' THEN 'المبيعات'
    WHEN 'accountant' THEN 'المحاسبة والتحصيل'
    WHEN 'warehouse' THEN 'المخزن'
    WHEN 'purchasing' THEN 'المشتريات'
    WHEN 'management' THEN 'الإدارة'
    ELSE 'العمليات'
  END;

  v_title:='مهمة تشغيلية جديدة: '||pg_catalog.left(NEW.title,140);

  INSERT INTO public.notifications(
    organization_id,profile_id,title,body,type,is_read
  )
  VALUES(
    NEW.organization_id,
    NEW.assigned_to,
    v_title,
    'أُسندت إليك مهمة ضمن دور '||v_role_label||'. افتح مركز المهام للاطلاع على التفاصيل وتسجيل نتيجة التنفيذ.',
    'info',
    false
  );

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_operational_task_assignee() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS operational_task_assignee_notification ON public.ai_tasks;
CREATE TRIGGER operational_task_assignee_notification
AFTER INSERT OR UPDATE OF assigned_to
ON public.ai_tasks
FOR EACH ROW
EXECUTE FUNCTION public.notify_operational_task_assignee();

COMMENT ON FUNCTION public.notify_operational_task_assignee() IS
  'Creates one tenant-scoped in-app notification only when an operational task is newly assigned or its assignee changes; identical assignment replay creates no notification.';
