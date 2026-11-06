-- AGH-CUSTOMER-ORDER-NOTIFICATION-001
-- Notify only active profiles currently linked to the order's customer company.
-- Payload contains no prices, totals, private notes or other customer data.
CREATE OR REPLACE FUNCTION public.notify_customer_order_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_event_key text;
  v_order_label text;
  v_status_label text;
  v_title text;
  v_body text;
  v_notification_type text;
BEGIN
  IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF TG_OP='INSERT' THEN
    -- Drafts are not customer-facing orders. Notify when they enter the real order workflow.
    IF NEW.status NOT IN ('new','pending','received','reviewing') THEN
      RETURN NEW;
    END IF;
    v_event_key:='created';
  ELSE
    v_event_key:='status:'||coalesce(OLD.status,'none')||'->'||coalesce(NEW.status,'none');
  END IF;

  v_order_label:=coalesce(
    nullif(pg_catalog.btrim(to_jsonb(NEW)->>'order_code'),''),
    nullif(pg_catalog.btrim(to_jsonb(NEW)->>'order_number'),''),
    NEW.id::text
  );

  v_status_label:=CASE NEW.status
    WHEN 'new' THEN 'جديد'
    WHEN 'pending' THEN 'بانتظار المراجعة'
    WHEN 'received' THEN 'تم الاستلام'
    WHEN 'reviewing' THEN 'قيد المراجعة'
    WHEN 'approved' THEN 'معتمد'
    WHEN 'confirmed' THEN 'معتمد'
    WHEN 'preparing' THEN 'قيد التجهيز'
    WHEN 'processing' THEN 'قيد التجهيز'
    WHEN 'prepared' THEN 'تم التجهيز'
    WHEN 'dispatched' THEN 'تم الشحن'
    WHEN 'shipped' THEN 'تم الشحن'
    WHEN 'delivered' THEN 'تم التسليم'
    WHEN 'invoiced' THEN 'صدرت الفاتورة'
    WHEN 'returned' THEN 'أُعيد للمراجعة'
    WHEN 'cancelled' THEN 'ملغي'
    WHEN 'rejected' THEN 'مرفوض'
    ELSE NEW.status
  END;

  v_title:=CASE WHEN v_event_key='created'
    THEN 'تم استلام طلبك: '||v_order_label
    ELSE 'تحديث طلبك: '||v_order_label
  END;
  v_body:='الحالة الحالية للطلب: '||v_status_label||'. افتح تفاصيل الطلب لمراجعة التحديث.';
  v_notification_type:=CASE
    WHEN NEW.status IN ('delivered','invoiced') THEN 'success'
    WHEN NEW.status IN ('cancelled','rejected','returned') THEN 'warning'
    ELSE 'info'
  END;

  WITH customer_record AS (
    SELECT c.id,c.organization_id,c.profile_id
    FROM public.customers c
    WHERE c.id=NEW.customer_id
      AND c.organization_id=NEW.organization_id
      AND c.status='approved'
  ),
  recipients AS (
    -- All active company members, including buyer, finance and viewer roles.
    SELECT m.profile_id
    FROM public.customer_company_memberships m
    JOIN customer_record c
      ON c.id=m.customer_id AND c.organization_id=m.organization_id
    JOIN public.profiles p
      ON p.id=m.profile_id
     AND p.organization_id=m.organization_id
     AND p.is_active
     AND p.auth_user_id IS NOT NULL
    WHERE m.status='active'

    UNION

    -- Legacy one-profile customer accounts remain supported.
    SELECT p.id
    FROM customer_record c
    JOIN public.profiles p
      ON p.id=c.profile_id
     AND p.organization_id=c.organization_id
     AND p.is_active
     AND p.auth_user_id IS NOT NULL
    WHERE c.profile_id IS NOT NULL
  )
  INSERT INTO public.notifications(
    organization_id,profile_id,title,body,type,is_read,dedupe_key,entity_type,entity_id
  )
  SELECT
    NEW.organization_id,
    recipients.profile_id,
    v_title,
    v_body,
    v_notification_type,
    false,
    'customer-order:'||NEW.id::text||':'||v_event_key||':'||recipients.profile_id::text,
    'order',
    NEW.id
  FROM recipients
  ON CONFLICT (organization_id,dedupe_key)
    WHERE dedupe_key IS NOT NULL
  DO NOTHING;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_customer_order_lifecycle() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS customer_order_lifecycle_notification ON public.orders;
CREATE TRIGGER customer_order_lifecycle_notification
AFTER INSERT OR UPDATE OF status
ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_customer_order_lifecycle();

COMMENT ON FUNCTION public.notify_customer_order_lifecycle() IS
  'Delivers deduplicated customer order lifecycle notifications to active same-organization customer company members or the legacy linked customer profile. Only order identity and status are exposed; every notification points to its order detail route.';
