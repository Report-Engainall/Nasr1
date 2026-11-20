BEGIN;

-- AGH-PRICE-PRIVACY-LEGACY-RPC-001
-- preview_order_pricing returns unit prices, line totals, customer tier and order total.
-- It is only an internal implementation detail of SECURITY DEFINER checkout validation;
-- browsers must use validate_checkout_cart, whose response strips monetary fields.
REVOKE ALL ON FUNCTION public.preview_order_pricing(jsonb) FROM PUBLIC, anon, authenticated;

-- Keep explicit access for trusted server-side automation without restoring browser access.
GRANT EXECUTE ON FUNCTION public.preview_order_pricing(jsonb) TO service_role;

COMMENT ON FUNCTION public.preview_order_pricing(jsonb) IS
  'Internal server-only pricing implementation. Browser roles cannot call it directly; customer-facing checkout validation uses validate_checkout_cart, which returns only safe item metadata.';

COMMIT;
