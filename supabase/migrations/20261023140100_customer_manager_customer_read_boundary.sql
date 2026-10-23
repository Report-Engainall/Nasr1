-- Enforce the customer base-table read boundary independently of permissive legacy policies.
-- customer_manager must use fetch_customer_manager_directory() for its non-financial projection;
-- no permissive policy may grant this role direct access to balances, credit limits, or other columns.

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_base_read_boundary ON public.customers;
CREATE POLICY customer_base_read_boundary
  ON public.customers
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    public.is_staff()
    OR (
      NOT EXISTS (
        SELECT 1
        FROM public.user_roles AS customer_manager_role
        WHERE customer_manager_role.profile_id = public.current_profile_id()
          AND customer_manager_role.role = 'customer_manager'
      )
      AND (
        profile_id = public.current_profile_id()
        OR id = public.current_customer_id()
      )
    )
  );

COMMENT ON POLICY customer_base_read_boundary ON public.customers IS
  'Restricts base-table reads to authorized staff and a linked customer reading their own record; customer_manager reads the non-financial directory only through fetch_customer_manager_directory().';
