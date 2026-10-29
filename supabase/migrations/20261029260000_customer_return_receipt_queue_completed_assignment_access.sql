-- A warehouse worker who completed an assigned receipt task may still reload the queue
-- and see that their pending queue is empty; row selection remains pending-only below.
CREATE OR REPLACE FUNCTION public.can_view_assigned_customer_return_receipt_queue()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND public.current_profile_id() IS NOT NULL
     AND public.current_organization_id() IS NOT NULL
     AND (
       public.operational_tasks_can_manage()
       OR (
         public.is_staff()
         AND EXISTS (
           SELECT 1
             FROM public.ai_tasks t
            WHERE t.organization_id = public.current_organization_id()
              AND t.assigned_to = public.current_profile_id()
              AND t.task_role = 'warehouse'
              AND t.status IN ('pending','in_progress','completed')
              AND t.source_entity_type = 'customer_return_requests'
              AND t.source_event_key LIKE 'customer-return-receipt:%'
         )
       )
     )
$function$;

COMMENT ON FUNCTION public.can_view_assigned_customer_return_receipt_queue() IS
  'Managers can load the organization receipt queue. Staff can load it when they have an assigned warehouse receipt task, including completed tasks; list_customer_return_receipt_queue itself continues to disclose only pending requests assigned to them.';
