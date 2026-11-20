-- Do not allow post-receipt edits to alter the historical labels on a physical receipt.
CREATE OR REPLACE FUNCTION public.prevent_customer_return_receipt_snapshot_rewrite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.request_number_snapshot IS DISTINCT FROM OLD.request_number_snapshot
     OR NEW.order_number_snapshot IS DISTINCT FROM OLD.order_number_snapshot
     OR NEW.customer_name_snapshot IS DISTINCT FROM OLD.customer_name_snapshot
     OR NEW.warehouse_name_snapshot IS DISTINCT FROM OLD.warehouse_name_snapshot THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'receipt document label snapshots are immutable';
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.prevent_customer_return_receipt_snapshot_rewrite() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS customer_return_receipt_snapshot_labels_immutable
  ON public.customer_return_receipts;
CREATE TRIGGER customer_return_receipt_snapshot_labels_immutable
  BEFORE UPDATE OF request_number_snapshot, order_number_snapshot, customer_name_snapshot, warehouse_name_snapshot
  ON public.customer_return_receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_customer_return_receipt_snapshot_rewrite();

COMMENT ON TRIGGER customer_return_receipt_snapshot_labels_immutable ON public.customer_return_receipts IS
  'Receipt-time request/order/customer/warehouse labels are immutable historical print evidence.';
