-- AGH-TASK-NOTIFICATION-QUEUE-002
-- Complete task notifications for explicit role-queue creation/return and first self-claim.
-- Source-event upserts must not broadcast queue notifications during reconciliation.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_org_dedupe_key_uidx
  ON public.notifications(organization_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.notify_operational_task_assignee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_role_label text;
  v_title text;
  v_body text;
  v_event text;
  v_dedupe_prefix text;
BEGIN
  IF NEW.status IN ('completed','cancelled') THEN
    RETURN NEW;
  END IF;

  IF TG_OP='INSERT' THEN
    IF NEW.assigned_to IS NULL THEN
      -- System/source tasks are reconciled in batches. Do not broadcast them to every
      -- staff member; a later explicit assignment or queue return remains notifiable.
      IF NEW.source_event_key IS NOT NULL THEN
        RETURN NEW;
      END IF;
      v_event:='queue_created';
    ELSE
      v_event:='assigned';
    END IF;
  ELSE
    IF NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN
      RETURN NEW;
    END IF;

    IF NEW.assigned_to IS NULL THEN
      v_event:='queue_returned';
    ELSIF OLD.assigned_to IS NULL AND NEW.status='in_progress' THEN
      v_event:='claimed';
    ELSIF OLD.assigned_to IS NULL THEN
      v_event:='assigned';
    ELSE
      v_event:='reassigned';
    END IF;
  END IF;

  v_role_label:=CASE NEW.task_role
    WHEN 'sales' THEN 'المبيعات'
    WHEN 'accountant' THEN 'المحاسبة والتحصيل'
    WHEN 'warehouse' THEN 'المخزن'
    WHEN 'purchasing' THEN 'المشتريات'
    WHEN 'management' THEN 'الإدارة'
    ELSE 'العمليات'
  END;

  v_title:=CASE v_event
    WHEN 'queue_created' THEN 'مهمة جديدة في طابور '||v_role_label||': '
    WHEN 'queue_returned' THEN 'أُعيدت مهمة إلى طابور '||v_role_label||': '
    WHEN 'claimed' THEN 'استلم موظف مهمة من طابور '||v_role_label||': '
    WHEN 'assigned' THEN 'مهمة تشغيلية أُسندت إليك: '
    ELSE 'أُعيد إسناد مهمة تشغيلية إليك: '
  END||pg_catalog.left(NEW.title,120);

  v_body:=CASE v_event
    WHEN 'queue_created' THEN 'أُنشئت مهمة جديدة ضمن طابور دورك. افتح مركز المهام لاستلامها أو مراجعة تفاصيلها.'
    WHEN 'queue_returned' THEN 'أعاد المدير المهمة إلى طابور الدور بعد إزالة الإسناد الفردي. افتح مركز المهام لاستلامها.'
    WHEN 'claimed' THEN 'استلم أحد أعضاء الدور هذه المهمة وبدأ تنفيذها. افتح مركز المهام لمتابعة حالتها.'
    WHEN 'assigned' THEN 'أُسندت إليك مهمة ضمن دور '||v_role_label||'. افتح مركز المهام للاطلاع على التفاصيل وتسجيل نتيجة التنفيذ.'
    ELSE 'أُعيد إسناد المهمة إليك ضمن دور '||v_role_label||'. افتح مركز المهام للاطلاع على التفاصيل.'
  END;

  v_dedupe_prefix:='operational-task:'||NEW.id::text||':'||v_event||':';

  IF NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.notifications(
      organization_id,profile_id,title,body,type,is_read,dedupe_key
    )
    VALUES(
      NEW.organization_id,NEW.assigned_to,v_title,v_body,'info',false,
      v_dedupe_prefix||NEW.assigned_to::text
    )
    ON CONFLICT (organization_id,dedupe_key)
      WHERE dedupe_key IS NOT NULL
    DO NOTHING;
  ELSE
    -- Role-to-profile routing mirrors the server's operational-task visibility:
    -- accountant lane -> accountant + manager/admin; management -> manager/admin;
    -- other operational lanes -> active staff + manager/admin.
    INSERT INTO public.notifications(
      organization_id,profile_id,title,body,type,is_read,dedupe_key
    )
    SELECT
      NEW.organization_id,p.id,v_title,v_body,'info',false,
      v_dedupe_prefix||p.id::text
    FROM public.profiles p
    JOIN public.user_roles r ON r.profile_id=p.id
    WHERE p.organization_id=NEW.organization_id
      AND p.is_active
      AND p.auth_user_id IS NOT NULL
      AND CASE NEW.task_role
        WHEN 'accountant' THEN r.role IN ('accountant','manager','admin')
        WHEN 'management' THEN r.role IN ('manager','admin')
        ELSE r.role IN ('staff','manager','admin')
      END
    GROUP BY p.id
    ON CONFLICT (organization_id,dedupe_key)
      WHERE dedupe_key IS NOT NULL
    DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_operational_task_assignee() FROM PUBLIC,anon,authenticated;

COMMENT ON FUNCTION public.notify_operational_task_assignee() IS
  'Tenant-scoped, recipient-specific operational task notifications for assigned, reassigned, first self-claimed, manually queued and explicitly returned tasks. Deduplicated per task/event/profile; source-event queue creation is suppressed to prevent reconciliation spam.';
