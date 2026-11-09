BEGIN;
ALTER TABLE public.customer_asset_events ADD CONSTRAINT customer_asset_status_change_guard
 CHECK(event_type<>'status_changed' OR(new_status IS NOT NULL AND new_status IS DISTINCT FROM old_status));
DROP POLICY customer_asset_events_scoped_read ON public.customer_asset_events;
CREATE POLICY customer_asset_events_scoped_read ON public.customer_asset_events FOR SELECT TO authenticated
 USING(organization_id=public.current_organization_id() AND (
  public.current_customer_asset_can_manage()
  OR new_customer_id=public.current_customer_id()
  OR previous_customer_id=public.current_customer_id()
  OR EXISTS(SELECT 1 FROM public.customer_assets a WHERE a.id=customer_asset_events.asset_id
    AND a.organization_id=customer_asset_events.organization_id AND a.customer_id=public.current_customer_id())
 ));
COMMIT;
