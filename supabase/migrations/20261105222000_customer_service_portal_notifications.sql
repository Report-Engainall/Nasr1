-- AGH-CUSTOMER-SERVICE-PORTAL-NOTIFICATIONS-001
-- Customer-safe status and SLA deadline messages through the existing account inbox.
CREATE OR REPLACE FUNCTION public.notify_customer_service_portal_case_updates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_staff_reply boolean;
BEGIN
  IF NOT public.is_staff() THEN RETURN NEW; END IF;
  v_staff_reply:=EXISTS(
    SELECT 1 FROM public.customer_service_case_messages m
    WHERE m.organization_id=NEW.organization_id AND m.case_id=NEW.id
      AND m.author_side='staff' AND m.created_at>=transaction_timestamp()
  );

  IF OLD.status IS DISTINCT FROM NEW.status AND NOT v_staff_reply THEN
    INSERT INTO public.notifications(organization_id,profile_id,title,body,type,is_read,entity_type,entity_id)
    SELECT DISTINCT NEW.organization_id,p.id,
      'تحديث حالة الخدمة: '||NEW.case_code,
      'تم تحديث حالة طلب الخدمة "'||pg_catalog.left(NEW.subject,120)||'" إلى '||
      CASE NEW.status WHEN 'open' THEN 'مفتوحة' WHEN 'in_progress' THEN 'قيد المعالجة'
        WHEN 'waiting_customer' THEN 'بانتظار رد العميل' WHEN 'resolved' THEN 'تم الحل'
        WHEN 'closed' THEN 'مغلقة' ELSE 'محدثة' END||
      '. افتح مركز خدمة العملاء لعرض التفاصيل والمراسلات.',
      'info',false,'customer_service_case',NEW.id
    FROM public.profiles p
    JOIN public.user_roles r ON r.profile_id=p.id AND r.role='customer'
    JOIN public.customers c ON c.id=NEW.customer_id AND c.organization_id=NEW.organization_id
    LEFT JOIN public.customer_company_memberships m ON m.profile_id=p.id AND m.customer_id=NEW.customer_id
      AND m.organization_id=NEW.organization_id AND m.status='active'
      AND m.member_role IN ('buyer','finance','viewer')
    WHERE p.organization_id=NEW.organization_id AND p.is_active AND p.auth_user_id IS NOT NULL
      AND (p.id=c.profile_id OR m.id IS NOT NULL);
  END IF;

  IF OLD.response_due_at IS DISTINCT FROM NEW.response_due_at
     OR OLD.resolution_due_at IS DISTINCT FROM NEW.resolution_due_at THEN
    INSERT INTO public.notifications(organization_id,profile_id,title,body,type,is_read,entity_type,entity_id)
    SELECT DISTINCT NEW.organization_id,p.id,
      'تحديث موعد خدمة العملاء: '||NEW.case_code,
      'تم تعديل الموعد المستهدف للاستجابة أو الحل للحالة "'||
      pg_catalog.left(NEW.subject,120)||'". افتح مركز خدمة العملاء لمراجعة الموعد الجديد.',
      'info',false,'customer_service_case',NEW.id
    FROM public.profiles p
    JOIN public.user_roles r ON r.profile_id=p.id AND r.role='customer'
    JOIN public.customers c ON c.id=NEW.customer_id AND c.organization_id=NEW.organization_id
    LEFT JOIN public.customer_company_memberships m ON m.profile_id=p.id AND m.customer_id=NEW.customer_id
      AND m.organization_id=NEW.organization_id AND m.status='active'
      AND m.member_role IN ('buyer','finance','viewer')
    WHERE p.organization_id=NEW.organization_id AND p.is_active AND p.auth_user_id IS NOT NULL
      AND (p.id=c.profile_id OR m.id IS NOT NULL);
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.notify_customer_service_portal_case_updates() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS customer_service_portal_case_notifications ON public.customer_service_cases;
CREATE TRIGGER customer_service_portal_case_notifications
AFTER UPDATE OF status,response_due_at,resolution_due_at ON public.customer_service_cases
FOR EACH ROW WHEN (
 OLD.status IS DISTINCT FROM NEW.status OR OLD.response_due_at IS DISTINCT FROM NEW.response_due_at
 OR OLD.resolution_due_at IS DISTINCT FROM NEW.resolution_due_at
) EXECUTE FUNCTION public.notify_customer_service_portal_case_updates();

-- Link the existing staff/customer reply notifications to the public case screens.
CREATE OR REPLACE FUNCTION public.link_customer_service_case_message_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_code text; v_case_id uuid;
BEGIN
 IF NEW.entity_type IS NOT NULL OR NEW.entity_id IS NOT NULL THEN RETURN NEW; END IF;
 IF pg_catalog.left(NEW.title,pg_catalog.length('رد فريق الأغبري على الحالة: '))='رد فريق الأغبري على الحالة: ' THEN
  v_code:=pg_catalog.substr(NEW.title,pg_catalog.length('رد فريق الأغبري على الحالة: ')+1);
 ELSIF pg_catalog.left(NEW.title,pg_catalog.length('رد عميل على الحالة: '))='رد عميل على الحالة: ' THEN
  v_code:=pg_catalog.substr(NEW.title,pg_catalog.length('رد عميل على الحالة: ')+1);
 ELSE RETURN NEW; END IF;
 SELECT id INTO v_case_id FROM public.customer_service_cases
  WHERE organization_id=NEW.organization_id AND case_code=v_code LIMIT 1;
 IF v_case_id IS NOT NULL THEN
  UPDATE public.notifications SET entity_type='customer_service_case',entity_id=v_case_id WHERE id=NEW.id;
 END IF;
 RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.link_customer_service_case_message_notification() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS link_customer_service_case_message_notification ON public.notifications;
CREATE TRIGGER link_customer_service_case_message_notification
AFTER INSERT ON public.notifications FOR EACH ROW
WHEN (NEW.entity_type IS NULL AND NEW.entity_id IS NULL)
EXECUTE FUNCTION public.link_customer_service_case_message_notification();

COMMENT ON FUNCTION public.notify_customer_service_portal_case_updates() IS
 'Notifies active buyer, finance and viewer contacts about customer-safe case status and SLA deadline changes; never exposes assignment or internal escalation data.';
