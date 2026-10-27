-- AGH-COMPANY-MEMBER-REORDER-REVOCATION-001
-- Revalidate member authority after the customer FK lock wait on reorder-template creation.
-- save_reorder_template checks capability before inserting; a revocation can commit while
-- its FK check is blocked, so this AFTER INSERT guard is the final mutation boundary.

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_customer_reorder_template_member_insert()
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
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'authenticated customer identity required';
  END IF;

  IF public.is_staff() THEN
    RETURN NEW;
  END IF;

  v_profile := public.current_profile_id();
  IF v_profile IS NULL
     OR NOT EXISTS (
       SELECT 1
         FROM public.user_roles r
        WHERE r.profile_id = v_profile
          AND r.role = 'customer'
     ) THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
       SELECT 1
         FROM public.profiles p
        WHERE p.id = v_profile
          AND p.auth_user_id = auth.uid()
          AND p.is_active
          AND p.organization_id = NEW.organization_id
          AND p.organization_id = public.current_organization_id()
     )
     OR public.current_customer_id() IS DISTINCT FROM NEW.customer_id
     OR NOT public.current_customer_can('reorder.manage') THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'company membership is no longer active or lacks reorder capability';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_customer_reorder_template_member_insert()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS reorder_templates_customer_member_mutation_guard
  ON public.reorder_templates;

CREATE TRIGGER reorder_templates_customer_member_mutation_guard
AFTER INSERT ON public.reorder_templates
FOR EACH ROW
EXECUTE FUNCTION public.guard_customer_reorder_template_member_insert();

COMMENT ON FUNCTION public.guard_customer_reorder_template_member_insert() IS
  'Revalidates active customer-company membership and reorder.manage after reorder-template insertion/FK lock waits so an in-flight create cannot commit after revocation.';

COMMIT;
