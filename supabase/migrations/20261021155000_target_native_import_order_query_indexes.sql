-- Target-native adaptation of aghbari-commerce 0023_import_and_order_query_indexes.
-- Donor import_rows is absent in Nasr1; normalized import data lives in import_job_rows.data.
-- Order history/queue indexes preserve tenant scope and sort newest-first.
BEGIN;

CREATE INDEX IF NOT EXISTS import_job_rows_job_item_code_idx
  ON public.import_job_rows (import_job_id, ((data ->> 'item_code')));

CREATE INDEX IF NOT EXISTS orders_customer_history_idx
  ON public.orders (organization_id, customer_id, created_at DESC, id DESC)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_staff_queue_idx
  ON public.orders (organization_id, status, created_at DESC, id DESC);

COMMENT ON INDEX public.import_job_rows_job_item_code_idx IS
  'Supports job-scoped canonical item_code scans used by import quality/duplicate analysis.';
COMMENT ON INDEX public.orders_customer_history_idx IS
  'Supports tenant-scoped customer order history newest-first.';
COMMENT ON INDEX public.orders_staff_queue_idx IS
  'Supports tenant-scoped staff order queues filtered by status newest-first.';

COMMIT;
