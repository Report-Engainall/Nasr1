-- Pending self-service customers must not submit orders before staff approval.
-- Keep account creation, catalog access and read capabilities independent from order permission.

CREATE OR REPLACE FUNCTION public.current_customer_can(p_capability text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_customer uuid := public.current_customer_id();
  v_role text;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL OR v_customer IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_profile
      AND p.auth_user_id = auth.uid()
      AND p.is_active
      AND p.organization_id = public.current_organization_id()
  ) THEN
    RETURN false;
  END IF;

  -- A pending, frozen, rejected or blocked direct customer may authenticate and
  -- view permitted account data, but may not create commercial orders.
  IF p_capability = 'orders.create'
     AND NOT EXISTS (
       SELECT 1
       FROM public.customers c
       WHERE c.id = v_customer
         AND c.organization_id = public.current_organization_id()
         AND c.status = 'approved'
     ) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = v_customer
      AND c.profile_id = v_profile
      AND c.organization_id = public.current_organization_id()
  ) THEN
    RETURN true;
  END IF;

  SELECT m.member_role
  INTO v_role
  FROM public.customer_company_memberships m
  WHERE m.profile_id = v_profile
    AND m.customer_id = v_customer
    AND m.organization_id = public.current_organization_id()
    AND m.status = 'active';

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  RETURN CASE v_role
    WHEN 'buyer' THEN p_capability IN (
      'catalog.read','orders.read','orders.create','quotes.read','quotes.manage',
      'reorder.manage','addresses.read','addresses.manage','contacts.read','contacts.manage',
      'service.cases.read','service.cases.reply'
    )
    WHEN 'finance' THEN p_capability IN (
      'orders.read','invoices.read','statement.read','payments.read','contacts.read',
      'service.cases.read'
    )
    WHEN 'viewer' THEN p_capability IN (
      'catalog.read','orders.read','contacts.read','service.cases.read'
    )
    ELSE false
  END;
END;
$function$;
