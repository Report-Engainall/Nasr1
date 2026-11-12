-- The initial scaffold added a blanket public-read policy to customer rows.
-- Customer PII and financial columns must never be exposed through anon/authenticated
-- table scans. Customers can read only their linked row, staff only their tenant rows,
-- and customer managers use fetch_customer_manager_directory(), whose payload excludes
-- credit_limit/current_balance and whose EXECUTE grant is role-checked.
DROP POLICY IF EXISTS "public_read_customers" ON public.customers;
