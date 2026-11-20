-- AGH-COMPANY-MEMBER-ORDER-REVOCATION-001
-- Re-check customer-created orders after INSERT has completed its foreign-key lock waits.
-- place_order checks capability before taking the customer row lock; an owner may revoke
-- membership while the order command is blocked on that same customer. This AFTER INSERT
-- guard is the final mutation boundary and aborts the whole order transaction if access is gone.

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_customer_order_member_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid;
BEGIN
  IF coalesce(auth.jwt()->>'role', '') = 'service_role'
     OR (auth.uid() IS NULL AND session_user = 'postgres') THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authenticated customer identity required';
  END IF;

  IF public.is_staff() THEN
    RETURN NEW;
  END IF;

  v_profile := public.current_profile_id();
  IF v_profile IS NULL OR NEW.created_by IS DISTINCT FROM v_profile
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles r
        WHERE r.profile_id = v_profile AND r.role = 'customer'
     ) THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id = v_profile
          AND p.auth_user_id = auth.uid()
          AND p.is_active
          AND p.organization_id = NEW.organization_id
          AND p.organization_id = public.current_organization_id()
     )
     OR public.current_customer_id() IS DISTINCT FROM NEW.customer_id
     OR NOT public.current_customer_can('orders.create') THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'company membership is no longer active or lacks order capability';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_customer_order_member_mutation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_customer_member_mutation_guard ON public.orders;
CREATE TRIGGER orders_customer_member_mutation_guard
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.guard_customer_order_member_mutation();

COMMENT ON FUNCTION public.guard_customer_order_member_mutation() IS
  'Revalidates authenticated customer order capability after order insertion/FK lock waits, so a company-member revocation committed while checkout is blocked aborts the entire order transaction.';

COMMIT;
