BEGIN;

-- A confirmed order can outlive the batch it originally reserved. Do not permit
-- shipment of expired stock; let a manager atomically move the reservation to
-- another non-expired FEFO lot while preserving the immutable movement history.
CREATE TABLE public.inventory_order_reservation_reallocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL
    CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$'),
  request_payload jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(request_payload)='object'),
  result jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(result)='object'),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.statement_timestamp(),
  UNIQUE (organization_id,idempotency_key)
);

ALTER TABLE public.inventory_order_reservation_reallocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.inventory_order_reservation_reallocations FROM PUBLIC,anon,authenticated,service_role;

COMMENT ON TABLE public.inventory_order_reservation_reallocations IS
  'Server-only idempotency ledger for moving expired order reservations to non-expired FEFO lots; movement rows remain append-only source evidence.';

CREATE TABLE public.inventory_order_reservation_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL
    CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$'),
  request_payload jsonb NOT NULL
    CHECK (pg_catalog.jsonb_typeof(request_payload)='object'),
  result jsonb NOT NULL
    CHECK (pg_catalog.jsonb_typeof(result)='object'),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.statement_timestamp(),
  UNIQUE (organization_id,idempotency_key)
);

ALTER TABLE public.inventory_order_reservation_reconciliations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.inventory_order_reservation_reconciliations
  FROM PUBLIC,anon,authenticated,service_role;

COMMENT ON TABLE public.inventory_order_reservation_reconciliations IS
  'Private idempotency ledger for repairing order reservation shortages and excesses; movement rows remain immutable source evidence.';

CREATE OR REPLACE FUNCTION public.list_orders_with_expired_fefo_reservations(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_today date:=(pg_catalog.now() AT TIME ZONE 'UTC')::date;
  v_total bigint;
  v_orders jsonb;
BEGIN
  SELECT p.organization_id
    INTO v_org
    FROM public.profiles p
    JOIN public.organizations o ON o.id=p.organization_id AND o.is_active=true
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;

  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.is_staff()
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles r
        WHERE r.profile_id=v_actor AND r.role IN ('admin','manager')
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active admin or manager inventory authority is required for expired FEFO order worklist';
  END IF;

  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 1000000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='expired FEFO worklist page must use limit 1..100 and offset 0..1000000';
  END IF;

  -- The page and total are derived from one materialized snapshot. No internal
  -- batch costs, tenant ids, customer contact details, or other private fields
  -- are returned to the operator worklist.
  WITH outstanding_expired_lots AS MATERIALIZED (
    SELECT
      o.id AS order_id,
      b.id AS batch_id,
      b.product_id,
      b.warehouse_id,
      b.batch_number,
      b.expiry_date,
      pg_catalog.sum(
        CASE WHEN im.movement_type='reserve' THEN im.quantity
             WHEN im.movement_type='release_reservation' THEN -im.quantity
             ELSE 0 END
      )::numeric(15,3) AS reserved_quantity,
      b.quantity_reserved AS batch_reserved_quantity
    FROM public.inventory_movements im
    JOIN public.orders o
      ON o.id=im.reference_id
     AND o.organization_id=v_org
    JOIN public.inventory_batches b
      ON b.id=im.inventory_batch_id
     AND b.organization_id=v_org
     AND b.product_id=im.product_id
     AND b.warehouse_id=im.warehouse_id
    WHERE im.reference_type='order'
      AND im.movement_type IN ('reserve','release_reservation')
      AND o.status IN ('confirmed','processing')
      AND b.expiry_date IS NOT NULL
      AND b.expiry_date<v_today
      AND NOT EXISTS (
        SELECT 1 FROM public.inventory_movements sale
         WHERE sale.reference_type='order'
           AND sale.reference_id=o.id
           AND sale.movement_type='sale'
      )
    GROUP BY o.id,b.id,b.product_id,b.warehouse_id,b.batch_number,b.expiry_date,b.quantity_reserved
    HAVING pg_catalog.sum(
      CASE WHEN im.movement_type='reserve' THEN im.quantity
           WHEN im.movement_type='release_reservation' THEN -im.quantity
           ELSE 0 END
    )>0
  ),
  eligible_orders AS MATERIALIZED (
    SELECT
      o.id,
      o.order_number,
      o.status,
      o.created_at,
      pg_catalog.sum(l.reserved_quantity)::numeric(15,3) AS expired_reserved_quantity,
      pg_catalog.count(*)::integer AS expired_lot_count,
      count(DISTINCT l.product_id)::integer AS affected_product_count,
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'batch_id',l.batch_id,
          'batch_number',l.batch_number,
          'expiry_date',l.expiry_date,
          'reserved_quantity',l.reserved_quantity::text,
          'batch_reserved_quantity',l.batch_reserved_quantity::text,
          'reservation_matches_batch',l.batch_reserved_quantity IS NOT DISTINCT FROM (
            SELECT coalesce(pg_catalog.sum(active_batch_reservations.reserved_quantity),0)::numeric(15,3)
              FROM (
                SELECT pg_catalog.sum(
                  CASE WHEN reservation_movement.movement_type='reserve' THEN reservation_movement.quantity
                       WHEN reservation_movement.movement_type='release_reservation' THEN -reservation_movement.quantity
                       ELSE 0 END
                )::numeric(15,3) AS reserved_quantity
                  FROM public.inventory_movements reservation_movement
                  JOIN public.orders active_order
                    ON active_order.id=reservation_movement.reference_id
                   AND active_order.organization_id=v_org
                 WHERE reservation_movement.reference_type='order'
                   AND reservation_movement.inventory_batch_id=l.batch_id
                   AND reservation_movement.movement_type IN ('reserve','release_reservation')
                   AND active_order.status IN ('confirmed','processing')
                   AND NOT EXISTS (
                     SELECT 1 FROM public.inventory_movements sale
                      WHERE sale.reference_type='order'
                        AND sale.reference_id=active_order.id
                        AND sale.movement_type='sale'
                   )
                 GROUP BY reservation_movement.reference_id
                HAVING pg_catalog.sum(
                  CASE WHEN reservation_movement.movement_type='reserve' THEN reservation_movement.quantity
                       WHEN reservation_movement.movement_type='release_reservation' THEN -reservation_movement.quantity
                       ELSE 0 END
                )>0
              ) active_batch_reservations
          ),
          'reservation_matches_balance',coalesce((
            SELECT balance.quantity_reserved IS NOT DISTINCT FROM (
              SELECT coalesce(pg_catalog.sum(active_balance_reservations.reserved_quantity),0)::numeric(15,3)
                FROM (
                  SELECT pg_catalog.sum(
                    CASE WHEN reservation_movement.movement_type='reserve' THEN reservation_movement.quantity
                         WHEN reservation_movement.movement_type='release_reservation' THEN -reservation_movement.quantity
                         ELSE 0 END
                  )::numeric(15,3) AS reserved_quantity
                    FROM public.inventory_movements reservation_movement
                    JOIN public.orders active_order
                      ON active_order.id=reservation_movement.reference_id
                     AND active_order.organization_id=v_org
                   WHERE reservation_movement.reference_type='order'
                     AND reservation_movement.product_id=l.product_id
                     AND reservation_movement.warehouse_id=l.warehouse_id
                     AND reservation_movement.movement_type IN ('reserve','release_reservation')
                     AND active_order.status IN ('confirmed','processing')
                     AND NOT EXISTS (
                       SELECT 1 FROM public.inventory_movements sale
                        WHERE sale.reference_type='order'
                          AND sale.reference_id=active_order.id
                          AND sale.movement_type='sale'
                     )
                   GROUP BY reservation_movement.reference_id
                  HAVING pg_catalog.sum(
                    CASE WHEN reservation_movement.movement_type='reserve' THEN reservation_movement.quantity
                         WHEN reservation_movement.movement_type='release_reservation' THEN -reservation_movement.quantity
                         ELSE 0 END
                  )>0
                ) active_balance_reservations
            )
              FROM public.inventory_balances balance
             WHERE balance.product_id=l.product_id AND balance.warehouse_id=l.warehouse_id
          ),false),
          'product_id',p.id,
          'item_code',p.item_code,
          'product_name',p.name,
          'warehouse_id',w.id,
          'warehouse_name',w.name,
          'replacement_available_quantity',(
            SELECT coalesce(pg_catalog.sum(replacement.quantity_on_hand-replacement.quantity_reserved),0)::numeric(15,3)::text
              FROM public.inventory_batches replacement
              JOIN public.warehouses replacement_warehouse
                ON replacement_warehouse.id=replacement.warehouse_id
               AND replacement_warehouse.organization_id=replacement.organization_id
               AND replacement_warehouse.is_active=true
             WHERE replacement.organization_id=v_org
               AND replacement.product_id=l.product_id
               AND replacement.quantity_on_hand>replacement.quantity_reserved
               AND (replacement.expiry_date IS NULL OR replacement.expiry_date>=v_today)
          )
        )
        ORDER BY l.expiry_date,l.product_id,l.warehouse_id,l.batch_id
      ) AS expired_lots
    FROM public.orders o
    JOIN outstanding_expired_lots l ON l.order_id=o.id
    JOIN public.products p
      ON p.id=l.product_id AND p.organization_id=v_org
    JOIN public.warehouses w
      ON w.id=l.warehouse_id AND w.organization_id=v_org
    GROUP BY o.id,o.order_number,o.status,o.created_at
  ),
  page_orders AS MATERIALIZED (
    SELECT *
      FROM eligible_orders
     ORDER BY created_at,o.id
     LIMIT p_limit
     OFFSET p_offset
  )
  SELECT
    (SELECT pg_catalog.count(*) FROM eligible_orders),
    coalesce((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'order_id',page.id,
          'order_number',page.order_number,
          'status',page.status,
          'created_at',page.created_at,
          'expired_reserved_quantity',page.expired_reserved_quantity::text,
          'expired_lot_count',page.expired_lot_count,
          'affected_product_count',page.affected_product_count,
          'expired_lots',page.expired_lots
        )
        ORDER BY page.created_at,page.id
      )
      FROM page_orders page
    ),'[]'::jsonb)
    INTO v_total,v_orders;

  RETURN pg_catalog.jsonb_build_object(
    'orders',v_orders,
    'total',v_total,
    'limit',p_limit,
    'offset',p_offset,
    'has_more',v_total>(p_offset::bigint+p_limit::bigint),
    'as_of',pg_catalog.statement_timestamp()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_orders_with_expired_fefo_reservations(integer,integer)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.list_orders_with_expired_fefo_reservations(integer,integer)
  TO authenticated;

COMMENT ON FUNCTION public.list_orders_with_expired_fefo_reservations(integer,integer) IS
  'Manager/admin work queue for confirmed/processing orders with positive net reservations in expired FEFO batches; returns only scoped safe batch facts and in-date replacement availability from one statement snapshot.';

CREATE OR REPLACE FUNCTION public.list_orders_with_incomplete_inventory_reservations(
  p_limit integer DEFAULT 50,p_offset integer DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_actor uuid:=public.current_profile_id(); v_org uuid; v_today date:=(pg_catalog.now() AT TIME ZONE 'UTC')::date;
 v_total bigint; v_orders jsonb;
BEGIN
 SELECT p.organization_id INTO v_org FROM public.profiles p JOIN public.organizations o
   ON o.id=p.organization_id AND o.is_active=true
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
 IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.is_staff()
    OR NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.profile_id=v_actor AND r.role IN ('admin','manager')) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active admin or manager inventory authority is required';
 END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 1000000 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='incomplete reservation page must use limit 1..100 and offset 0..1000000';
 END IF;
 WITH ordered AS MATERIALIZED (
  SELECT o.id order_id,o.order_number,o.status,o.created_at,oi.product_id,pg_catalog.sum(oi.quantity)::numeric(15,3) ordered_qty
   FROM public.orders o JOIN public.order_items oi ON oi.order_id=o.id
  WHERE o.organization_id=v_org AND o.status IN ('confirmed','processing')
    AND NOT EXISTS(SELECT 1 FROM public.inventory_movements s WHERE s.reference_type='order' AND s.reference_id=o.id AND s.movement_type='sale')
  GROUP BY o.id,o.order_number,o.status,o.created_at,oi.product_id
 ),
 net AS MATERIALIZED (
  SELECT im.reference_id order_id,im.product_id,
    pg_catalog.sum(CASE WHEN im.movement_type='reserve' THEN im.quantity WHEN im.movement_type='release_reservation' THEN -im.quantity ELSE 0 END)::numeric(15,3) reserved_qty
   FROM public.inventory_movements im JOIN public.orders o ON o.id=im.reference_id AND o.organization_id=v_org
  WHERE im.reference_type='order' AND im.movement_type IN ('reserve','release_reservation')
    AND o.status IN ('confirmed','processing')
    AND NOT EXISTS(SELECT 1 FROM public.inventory_movements s WHERE s.reference_type='order' AND s.reference_id=o.id AND s.movement_type='sale')
  GROUP BY im.reference_id,im.product_id
 ),
 gaps AS MATERIALIZED (
  SELECT x.*,coalesce(n.reserved_qty,0)::numeric(15,3) reserved_qty,
    greatest(x.ordered_qty-coalesce(n.reserved_qty,0),0)::numeric(15,3) missing_qty,
    greatest(coalesce(n.reserved_qty,0)-x.ordered_qty,0)::numeric(15,3) excess_qty
   FROM ordered x LEFT JOIN net n ON n.order_id=x.order_id AND n.product_id=x.product_id
  WHERE x.ordered_qty IS DISTINCT FROM coalesce(n.reserved_qty,0)
 ),
 expired AS MATERIALIZED (
  SELECT DISTINCT im.reference_id order_id
   FROM public.inventory_movements im JOIN public.orders o ON o.id=im.reference_id AND o.organization_id=v_org
   JOIN public.inventory_batches b ON b.id=im.inventory_batch_id AND b.organization_id=v_org
  WHERE im.reference_type='order' AND im.movement_type IN ('reserve','release_reservation')
    AND o.status IN ('confirmed','processing') AND b.expiry_date IS NOT NULL AND b.expiry_date<v_today
  GROUP BY im.reference_id,b.id,b.expiry_date
  HAVING pg_catalog.sum(CASE WHEN im.movement_type='reserve' THEN im.quantity WHEN im.movement_type='release_reservation' THEN -im.quantity ELSE 0 END)>0
 ),
 grouped AS MATERIALIZED (
  SELECT g.order_id,g.order_number,g.status,g.created_at,
   pg_catalog.sum(g.ordered_qty)::numeric(15,3) ordered_quantity,
   pg_catalog.sum(g.reserved_qty)::numeric(15,3) reserved_quantity,
   pg_catalog.sum(g.missing_qty)::numeric(15,3) missing_quantity,
   pg_catalog.sum(g.excess_qty)::numeric(15,3) excess_quantity,
   pg_catalog.bool_or(g.missing_qty>0) has_shortage,
   pg_catalog.bool_or(g.excess_qty>0) has_excess,
   pg_catalog.count(*)::integer affected_product_count,
   (e.order_id IS NOT NULL) requires_expired_reallocation,
   pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'product_id',g.product_id,'item_code',p.item_code,'product_name',p.name,
    'ordered_quantity',g.ordered_qty::text,'reserved_quantity',g.reserved_qty::text,
    'missing_quantity',g.missing_qty::text,'excess_quantity',g.excess_qty::text,
    'reservation_status',CASE WHEN g.missing_qty>0 THEN 'short' WHEN g.excess_qty>0 THEN 'excess' ELSE 'matched' END,
    'reservation_batch_ledger_matches',
    NOT EXISTS(
      SELECT 1 FROM public.inventory_movements unbatched
       JOIN public.orders active_order
         ON active_order.id=unbatched.reference_id AND active_order.organization_id=v_org
       WHERE unbatched.reference_type='order' AND unbatched.product_id=g.product_id
         AND unbatched.movement_type='reserve' AND unbatched.inventory_batch_id IS NULL
         AND active_order.status IN ('confirmed','processing')
         AND NOT EXISTS(SELECT 1 FROM public.inventory_movements sale
           WHERE sale.reference_type='order' AND sale.reference_id=active_order.id AND sale.movement_type='sale')
    )
    AND NOT EXISTS(
      SELECT 1 FROM public.inventory_batches batch
       WHERE batch.organization_id=v_org AND batch.product_id=g.product_id
         AND batch.quantity_reserved IS DISTINCT FROM coalesce((
           SELECT pg_catalog.sum(active_batch_reservations.reserved_quantity)
             FROM (
               SELECT pg_catalog.sum(CASE WHEN im.movement_type='reserve' THEN im.quantity
                 WHEN im.movement_type='release_reservation' THEN -im.quantity ELSE 0 END)::numeric(15,3) reserved_quantity
                 FROM public.inventory_movements im JOIN public.orders ao
                   ON ao.id=im.reference_id AND ao.organization_id=v_org
                WHERE im.reference_type='order' AND im.inventory_batch_id=batch.id
                  AND im.movement_type IN ('reserve','release_reservation')
                  AND ao.status IN ('confirmed','processing')
                  AND NOT EXISTS(SELECT 1 FROM public.inventory_movements sale
                    WHERE sale.reference_type='order' AND sale.reference_id=ao.id AND sale.movement_type='sale')
                GROUP BY im.reference_id
               HAVING pg_catalog.sum(CASE WHEN im.movement_type='reserve' THEN im.quantity
                 WHEN im.movement_type='release_reservation' THEN -im.quantity ELSE 0 END)>0
             ) active_batch_reservations
         ),0)
    ),
    'reservation_balance_ledger_matches',
    NOT EXISTS(
      SELECT 1
        FROM (
          SELECT active_by_order.warehouse_id
            FROM (
              SELECT unbatched_ledger.warehouse_id,unbatched_ledger.reference_id,
                     pg_catalog.sum(CASE WHEN unbatched_ledger.movement_type='reserve' THEN unbatched_ledger.quantity
                       WHEN unbatched_ledger.movement_type='release_reservation' THEN -unbatched_ledger.quantity
                       ELSE 0 END)::numeric(15,3) AS reserved_quantity
                FROM public.inventory_movements unbatched_ledger
                JOIN public.orders active_order
                  ON active_order.id=unbatched_ledger.reference_id AND active_order.organization_id=v_org
                JOIN public.warehouses active_warehouse
                  ON active_warehouse.id=unbatched_ledger.warehouse_id AND active_warehouse.organization_id=v_org
               WHERE unbatched_ledger.reference_type='order'
                 AND unbatched_ledger.product_id=g.product_id
                 AND unbatched_ledger.movement_type IN ('reserve','release_reservation')
                 AND active_order.status IN ('confirmed','processing')
                 AND NOT EXISTS(SELECT 1 FROM public.inventory_movements sale
                   WHERE sale.reference_type='order' AND sale.reference_id=active_order.id AND sale.movement_type='sale')
               GROUP BY unbatched_ledger.warehouse_id,unbatched_ledger.reference_id
              HAVING pg_catalog.sum(CASE WHEN unbatched_ledger.movement_type='reserve' THEN unbatched_ledger.quantity
                WHEN unbatched_ledger.movement_type='release_reservation' THEN -unbatched_ledger.quantity
                ELSE 0 END)>0
            ) active_by_order
           GROUP BY active_by_order.warehouse_id
        ) active_warehouses
       WHERE NOT EXISTS(
         SELECT 1 FROM public.inventory_balances present
          JOIN public.warehouses present_warehouse
            ON present_warehouse.id=present.warehouse_id AND present_warehouse.organization_id=v_org
          WHERE present.product_id=g.product_id
            AND present.warehouse_id=active_warehouses.warehouse_id
       )
    )
    AND NOT EXISTS(
      SELECT 1 FROM public.inventory_balances balance
       JOIN public.warehouses balance_warehouse
         ON balance_warehouse.id=balance.warehouse_id AND balance_warehouse.organization_id=v_org
       WHERE balance.product_id=g.product_id
         AND balance.quantity_reserved IS DISTINCT FROM coalesce((
           SELECT pg_catalog.sum(active_balance_reservations.reserved_quantity)
             FROM (
               SELECT pg_catalog.sum(CASE WHEN im.movement_type='reserve' THEN im.quantity
                 WHEN im.movement_type='release_reservation' THEN -im.quantity ELSE 0 END)::numeric(15,3) reserved_quantity
                 FROM public.inventory_movements im JOIN public.orders ao
                   ON ao.id=im.reference_id AND ao.organization_id=v_org
                WHERE im.reference_type='order' AND im.product_id=balance.product_id
                  AND im.warehouse_id=balance.warehouse_id
                  AND im.movement_type IN ('reserve','release_reservation')
                  AND ao.status IN ('confirmed','processing')
                  AND NOT EXISTS(SELECT 1 FROM public.inventory_movements sale
                    WHERE sale.reference_type='order' AND sale.reference_id=ao.id AND sale.movement_type='sale')
                GROUP BY im.reference_id
               HAVING pg_catalog.sum(CASE WHEN im.movement_type='reserve' THEN im.quantity
                 WHEN im.movement_type='release_reservation' THEN -im.quantity ELSE 0 END)>0
             ) active_balance_reservations
         ),0)
    ),
    'replacement_available_quantity',(
      SELECT coalesce(pg_catalog.sum(b.quantity_on_hand-b.quantity_reserved),0)::numeric(15,3)::text
       FROM public.inventory_batches b JOIN public.warehouses w ON w.id=b.warehouse_id AND w.organization_id=v_org AND w.is_active=true
      WHERE b.organization_id=v_org AND b.product_id=g.product_id AND b.quantity_on_hand>b.quantity_reserved
        AND (b.expiry_date IS NULL OR b.expiry_date>=v_today)
    )
   ) ORDER BY p.item_code,p.id) lines
  FROM gaps g JOIN public.products p ON p.id=g.product_id AND p.organization_id=v_org
  LEFT JOIN expired e ON e.order_id=g.order_id
  GROUP BY g.order_id,g.order_number,g.status,g.created_at,e.order_id
 ),
 page AS MATERIALIZED (SELECT * FROM grouped ORDER BY created_at,order_id LIMIT p_limit OFFSET p_offset)
 SELECT (SELECT pg_catalog.count(*) FROM grouped),
  coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'order_id',x.order_id,'order_number',x.order_number,'status',x.status,'created_at',x.created_at,
   'ordered_quantity',x.ordered_quantity::text,'reserved_quantity',x.reserved_quantity::text,
   'missing_quantity',x.missing_quantity::text,'excess_quantity',x.excess_quantity::text,
   'has_shortage',x.has_shortage,'has_excess',x.has_excess,
   'affected_product_count',x.affected_product_count,
   'requires_expired_reallocation',x.requires_expired_reallocation,'lines',x.lines
  ) ORDER BY x.created_at,x.order_id) FROM page x),'[]'::jsonb)
 INTO v_total,v_orders;
 RETURN pg_catalog.jsonb_build_object('orders',v_orders,'total',v_total,'limit',p_limit,'offset',p_offset,
  'has_more',v_total>(p_offset::bigint+p_limit),'as_of',pg_catalog.statement_timestamp());
END;
$function$;
REVOKE ALL ON FUNCTION public.list_orders_with_incomplete_inventory_reservations(integer,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.list_orders_with_incomplete_inventory_reservations(integer,integer) TO authenticated;
COMMENT ON FUNCTION public.list_orders_with_incomplete_inventory_reservations(integer,integer) IS
 'Manager/admin work queue for confirmed/processing orders with under- or over-reserved products; includes exact variance, safe FEFO availability and expiry prerequisite.';

CREATE OR REPLACE FUNCTION public.reconcile_incomplete_order_reservations(
 p_order_id uuid,p_idempotency_key text,p_reason text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
 v_actor uuid:=public.current_profile_id(); v_org uuid; v_order public.orders%ROWTYPE;
 v_existing public.inventory_order_reservation_reconciliations%ROWTYPE;
 v_key text:=pg_catalog.btrim(coalesce(p_idempotency_key,'')); v_reason text:=nullif(pg_catalog.btrim(coalesce(p_reason,'')),'');
 v_payload jsonb; v_products uuid[]:=ARRAY[]::uuid[]; v_product uuid;
 v_ordered numeric(15,3); v_reserved numeric(15,3); v_missing numeric(15,3); v_left numeric(15,3);
 v_take numeric(15,3); v_after numeric(15,3); v_lot record; v_today date:=(pg_catalog.now() AT TIME ZONE 'UTC')::date;
 v_allocations jsonb:='[]'::jsonb; v_total numeric(15,3):=0; v_lot_count integer:=0;
 v_has_excess boolean:=false;
 v_result jsonb; v_id uuid;
BEGIN
 SELECT p.organization_id INTO v_org FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id AND o.is_active=true
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
 IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.is_staff()
    OR NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.profile_id=v_actor AND r.role IN ('admin','manager')) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active admin or manager inventory authority is required';
 END IF;
 IF p_order_id IS NULL OR v_key !~ '^[A-Za-z0-9_-]{16,128}$' OR v_reason IS NULL OR pg_catalog.char_length(v_reason)>500 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='order id, valid idempotency key and reason of 1..500 characters are required';
 END IF;
 v_payload:=pg_catalog.jsonb_build_object('order_id',p_order_id,'reason',v_reason);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||':order-reservation-reconcile:'||v_key,0));
 SELECT x.* INTO v_existing FROM public.inventory_order_reservation_reconciliations x
  WHERE x.organization_id=v_org AND x.idempotency_key=v_key FOR UPDATE;
 IF FOUND THEN
  IF v_existing.request_payload IS DISTINCT FROM v_payload THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='reservation reconciliation idempotency payload conflict';
  END IF;
  RETURN v_existing.result||pg_catalog.jsonb_build_object('idempotent_replay',true);
 END IF;

 SELECT o.* INTO v_order FROM public.orders o WHERE o.id=p_order_id AND o.organization_id=v_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='order was not found in the active organization'; END IF;
 IF v_order.status NOT IN ('confirmed','processing') THEN
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='only confirmed or processing orders can reconcile reservations';
 END IF;
 IF EXISTS(SELECT 1 FROM public.inventory_movements im WHERE im.reference_type='order' AND im.reference_id=v_order.id AND im.movement_type='sale') THEN
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='orders with a sale movement cannot reconcile reservations';
 END IF;
 IF EXISTS(SELECT 1 FROM public.inventory_movements im WHERE im.reference_type='order' AND im.reference_id=v_order.id AND im.movement_type='reserve' AND im.inventory_batch_id IS NULL) THEN
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='order reservations have no batch lineage and cannot be reconciled safely';
 END IF;
 IF EXISTS(
  SELECT 1 FROM (
   SELECT im.inventory_batch_id,pg_catalog.sum(CASE WHEN im.movement_type='reserve' THEN im.quantity WHEN im.movement_type='release_reservation' THEN -im.quantity ELSE 0 END) qty
    FROM public.inventory_movements im WHERE im.reference_type='order' AND im.reference_id=v_order.id
      AND im.movement_type IN ('reserve','release_reservation') AND im.inventory_batch_id IS NOT NULL
   GROUP BY im.inventory_batch_id
   HAVING pg_catalog.sum(CASE WHEN im.movement_type='reserve' THEN im.quantity WHEN im.movement_type='release_reservation' THEN -im.quantity ELSE 0 END)>0
  ) x JOIN public.inventory_batches b ON b.id=x.inventory_batch_id
  WHERE b.expiry_date IS NOT NULL AND b.expiry_date<v_today
 ) THEN
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='expired reservations require FEFO reallocation before missing stock reconciliation';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.order_items oi WHERE oi.order_id=v_order.id)
    OR EXISTS(SELECT 1 FROM public.order_items oi WHERE oi.order_id=v_order.id AND oi.product_id IS NULL) THEN
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='order must contain linked product lines to reconcile reservations';
 END IF;
 IF EXISTS(
  WITH ordered AS(SELECT oi.product_id,pg_catalog.sum(oi.quantity)::numeric(15,3) qty FROM public.order_items oi WHERE oi.order_id=v_order.id GROUP BY oi.product_id),
  net AS(SELECT im.product_id,pg_catalog.sum(CASE WHEN im.movement_type='reserve' THEN im.quantity WHEN im.movement_type='release_reservation' THEN -im.quantity ELSE 0 END)::numeric(15,3) qty
   FROM public.inventory_movements im WHERE im.reference_type='order' AND im.reference_id=v_order.id AND im.movement_type IN ('reserve','release_reservation') GROUP BY im.product_id)
  SELECT 1 FROM net n LEFT JOIN ordered o ON o.product_id=n.product_id WHERE o.product_id IS NULL OR n.qty<0
 ) THEN
  RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='reservation movement ledger is negative or references an unlinked ordered product';
 END IF;
 SELECT coalesce(pg_catalog.array_agg(DISTINCT oi.product_id ORDER BY oi.product_id),ARRAY[]::uuid[])
  INTO v_products FROM public.order_items oi WHERE oi.order_id=v_order.id;

 FOREACH v_product IN ARRAY v_products LOOP
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||':inventory-batch-reservation:'||v_product::text,0));
  PERFORM ib.id FROM public.inventory_balances ib JOIN public.warehouses w ON w.id=ib.warehouse_id AND w.organization_id=v_org AND w.is_active=true
   WHERE ib.product_id=v_product ORDER BY ib.warehouse_id FOR UPDATE OF ib;
  PERFORM b.id FROM public.inventory_batches b WHERE b.organization_id=v_org AND b.product_id=v_product
   ORDER BY b.expiry_date ASC NULLS LAST,b.received_at,b.warehouse_id,b.id FOR UPDATE OF b;

  IF EXISTS(
   SELECT 1 FROM public.inventory_batches b WHERE b.organization_id=v_org AND b.product_id=v_product
    AND b.quantity_reserved IS DISTINCT FROM coalesce((
     SELECT pg_catalog.sum(x.qty) FROM (
      SELECT pg_catalog.sum(CASE WHEN im.movement_type='reserve' THEN im.quantity WHEN im.movement_type='release_reservation' THEN -im.quantity ELSE 0 END)::numeric(15,3) qty
       FROM public.inventory_movements im JOIN public.orders ao ON ao.id=im.reference_id AND ao.organization_id=v_org
      WHERE im.reference_type='order' AND im.inventory_batch_id=b.id AND im.movement_type IN ('reserve','release_reservation')
       AND ao.status IN ('confirmed','processing')
       AND NOT EXISTS(SELECT 1 FROM public.inventory_movements s WHERE s.reference_type='order' AND s.reference_id=ao.id AND s.movement_type='sale')
      GROUP BY im.reference_id HAVING pg_catalog.sum(CASE WHEN im.movement_type='reserve' THEN im.quantity WHEN im.movement_type='release_reservation' THEN -im.quantity ELSE 0 END)>0
     ) x
    ),0)
  ) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='batch reserved quantity is below active order movement ledger'; END IF;

  IF EXISTS(
   SELECT 1 FROM public.inventory_balances ib JOIN public.warehouses w ON w.id=ib.warehouse_id AND w.organization_id=v_org
   WHERE ib.product_id=v_product AND ib.quantity_reserved IS DISTINCT FROM coalesce((
    SELECT pg_catalog.sum(x.qty) FROM (
     SELECT pg_catalog.sum(CASE WHEN im.movement_type='reserve' THEN im.quantity WHEN im.movement_type='release_reservation' THEN -im.quantity ELSE 0 END)::numeric(15,3) qty
      FROM public.inventory_movements im JOIN public.orders ao ON ao.id=im.reference_id AND ao.organization_id=v_org
     WHERE im.reference_type='order' AND im.product_id=ib.product_id AND im.warehouse_id=ib.warehouse_id
       AND im.movement_type IN ('reserve','release_reservation')
       AND ao.status IN ('confirmed','processing')
       AND NOT EXISTS(SELECT 1 FROM public.inventory_movements s WHERE s.reference_type='order' AND s.reference_id=ao.id AND s.movement_type='sale')
     GROUP BY im.reference_id HAVING pg_catalog.sum(CASE WHEN im.movement_type='reserve' THEN im.quantity WHEN im.movement_type='release_reservation' THEN -im.quantity ELSE 0 END)>0
    ) x
   ),0)
  ) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='aggregate reserved quantity is below active order movement ledger'; END IF;

  SELECT coalesce(pg_catalog.sum(oi.quantity),0)::numeric(15,3) INTO v_ordered FROM public.order_items oi WHERE oi.order_id=v_order.id AND oi.product_id=v_product;
  SELECT coalesce(pg_catalog.sum(CASE WHEN im.movement_type='reserve' THEN im.quantity WHEN im.movement_type='release_reservation' THEN -im.quantity ELSE 0 END),0)::numeric(15,3)
   INTO v_reserved FROM public.inventory_movements im
  WHERE im.reference_type='order' AND im.reference_id=v_order.id AND im.product_id=v_product AND im.movement_type IN ('reserve','release_reservation');
  IF v_reserved>v_ordered THEN v_has_excess:=true; END IF;
  v_missing:=greatest(v_ordered-v_reserved,0);
  v_left:=v_missing;
  FOR v_lot IN
   SELECT b.id batch_id,b.product_id,b.warehouse_id,b.quantity_on_hand,b.quantity_reserved,ib.id balance_id
    FROM public.inventory_batches b JOIN public.inventory_balances ib ON ib.product_id=b.product_id AND ib.warehouse_id=b.warehouse_id
    JOIN public.warehouses w ON w.id=b.warehouse_id AND w.organization_id=v_org AND w.is_active=true
   WHERE b.organization_id=v_org AND b.product_id=v_product AND b.quantity_on_hand>b.quantity_reserved
     AND (b.expiry_date IS NULL OR b.expiry_date>=v_today)
   ORDER BY b.expiry_date ASC NULLS LAST,b.received_at,b.warehouse_id,b.id
   FOR UPDATE OF b,ib
  LOOP
   EXIT WHEN v_left<=0;
   v_take:=LEAST(v_left,v_lot.quantity_on_hand-v_lot.quantity_reserved);
   IF v_take<=0 THEN CONTINUE; END IF;
   UPDATE public.inventory_batches
      SET quantity_reserved=quantity_reserved+v_take
    WHERE id=v_lot.batch_id
      AND quantity_on_hand>=quantity_reserved+v_take
      AND quantity_reserved>=0;
   IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='replacement batch availability changed during reservation reconciliation';
   END IF;
   UPDATE public.inventory_balances
      SET quantity_reserved=quantity_reserved+v_take,
          last_movement_at=pg_catalog.statement_timestamp(),
          updated_at=pg_catalog.statement_timestamp()
    WHERE id=v_lot.balance_id
      AND quantity_available>=v_take
    RETURNING quantity_available INTO v_after;
   IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='aggregate stock availability changed during reservation reconciliation';
   END IF;
   INSERT INTO public.inventory_movements(product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by,inventory_batch_id)
    VALUES(v_lot.product_id,v_lot.warehouse_id,'reserve',v_take,v_after,'order',v_order.id,'استكمال الحجز الناقص للطلب حسب FEFO: '||v_reason,v_actor,v_lot.batch_id);
   v_allocations:=v_allocations||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('batch_id',v_lot.batch_id,'product_id',v_lot.product_id,'warehouse_id',v_lot.warehouse_id,'quantity',v_take));
   v_lot_count:=v_lot_count+1; v_left:=v_left-v_take;
  END LOOP;
  IF v_left>0 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='insufficient non-expired FEFO stock to complete order reservation; no changes were committed'; END IF;
  v_total:=v_total+v_missing;
 END LOOP;

 v_result:=pg_catalog.jsonb_build_object('order_id',v_order.id,
  'reconciliation_status',CASE WHEN v_total>0 THEN 'reconciled'
    WHEN v_has_excess THEN 'no_shortage_to_fill' ELSE 'already_complete' END,
  'reconciled_quantity',v_total,'allocation_lot_count',v_lot_count,'allocations',v_allocations,'idempotent_replay',false);
 INSERT INTO public.inventory_order_reservation_reconciliations(organization_id,order_id,idempotency_key,request_payload,result,created_by)
  VALUES(v_org,v_order.id,v_key,v_payload,v_result,v_actor) RETURNING id INTO v_id;
 v_result:=v_result||pg_catalog.jsonb_build_object('reconciliation_id',v_id);
 UPDATE public.inventory_order_reservation_reconciliations SET result=v_result WHERE id=v_id;
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'inventory.order_reservation.reconciled','order_reservation_reconciliation',v_id,
   pg_catalog.jsonb_build_object('order_id',v_order.id),v_result||pg_catalog.jsonb_build_object('reason',v_reason,'idempotency_key',v_key));
 RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.reconcile_incomplete_order_reservations(uuid,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_incomplete_order_reservations(uuid,text,text) TO authenticated;
COMMENT ON FUNCTION public.reconcile_incomplete_order_reservations(uuid,text,text) IS
 'Manager/admin-only atomic FEFO repair that reserves only the missing order quantity; refuses expiry, ledger drift and insufficient stock.';

CREATE OR REPLACE FUNCTION public.release_excess_order_reservations(
 p_order_id uuid,p_idempotency_key text,p_reason text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
 v_actor uuid:=public.current_profile_id(); v_org uuid; v_order public.orders%ROWTYPE;
 v_existing public.inventory_order_reservation_reconciliations%ROWTYPE;
 v_key text:=pg_catalog.btrim(coalesce(p_idempotency_key,'')); v_reason text:=nullif(pg_catalog.btrim(coalesce(p_reason,'')),'');
 v_payload jsonb; v_products uuid[]:=ARRAY[]::uuid[]; v_product uuid;
 v_ordered numeric(15,3); v_reserved numeric(15,3); v_excess numeric(15,3); v_left numeric(15,3);
 v_take numeric(15,3); v_after numeric(15,3); v_lot record;
 v_released numeric(15,3):=0; v_lot_count integer:=0; v_allocations jsonb:='[]'::jsonb;
 v_has_shortage boolean:=false;
 v_result jsonb; v_id uuid;
BEGIN
 SELECT p.organization_id INTO v_org FROM public.profiles p
  JOIN public.organizations o ON o.id=p.organization_id AND o.is_active=true
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
 IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.is_staff()
    OR NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.profile_id=v_actor AND r.role IN ('admin','manager')) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active admin or manager inventory authority is required';
 END IF;
 IF p_order_id IS NULL OR v_key !~ '^[A-Za-z0-9_-]{16,128}$'
    OR v_reason IS NULL OR pg_catalog.char_length(v_reason)>500 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='order id, valid idempotency key and reason of 1..500 characters are required';
 END IF;
 v_payload:=pg_catalog.jsonb_build_object('operation','release_excess','order_id',p_order_id,'reason',v_reason);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||':order-reservation-reconcile:'||v_key,0));
 SELECT x.* INTO v_existing FROM public.inventory_order_reservation_reconciliations x
  WHERE x.organization_id=v_org AND x.idempotency_key=v_key FOR UPDATE;
 IF FOUND THEN
  IF v_existing.request_payload IS DISTINCT FROM v_payload THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='excess reservation release idempotency payload conflict';
  END IF;
  RETURN v_existing.result||pg_catalog.jsonb_build_object('idempotent_replay',true);
 END IF;

 SELECT o.* INTO v_order FROM public.orders o WHERE o.id=p_order_id AND o.organization_id=v_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='order was not found in the active organization'; END IF;
 IF v_order.status NOT IN ('confirmed','processing') THEN
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='only confirmed or processing orders can release excess reservations';
 END IF;
 IF EXISTS(SELECT 1 FROM public.inventory_movements im WHERE im.reference_type='order' AND im.reference_id=v_order.id AND im.movement_type='sale') THEN
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='orders with a sale movement cannot release reservations';
 END IF;
 IF EXISTS(SELECT 1 FROM public.inventory_movements im WHERE im.reference_type='order' AND im.reference_id=v_order.id
   AND im.movement_type='reserve' AND im.inventory_batch_id IS NULL) THEN
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='order reservations have no batch lineage and cannot be safely reconciled';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.order_items oi WHERE oi.order_id=v_order.id)
    OR EXISTS(SELECT 1 FROM public.order_items oi WHERE oi.order_id=v_order.id AND oi.product_id IS NULL) THEN
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='order must contain linked product lines to release excess reservations';
 END IF;
 IF EXISTS(
  WITH ordered AS(SELECT oi.product_id,pg_catalog.sum(oi.quantity)::numeric(15,3) qty
   FROM public.order_items oi WHERE oi.order_id=v_order.id GROUP BY oi.product_id),
  net AS(SELECT im.product_id,pg_catalog.sum(CASE WHEN im.movement_type='reserve' THEN im.quantity
   WHEN im.movement_type='release_reservation' THEN -im.quantity ELSE 0 END)::numeric(15,3) qty
   FROM public.inventory_movements im WHERE im.reference_type='order' AND im.reference_id=v_order.id
   AND im.movement_type IN ('reserve','release_reservation') GROUP BY im.product_id)
  SELECT 1 FROM net n LEFT JOIN ordered o ON o.product_id=n.product_id WHERE o.product_id IS NULL OR n.qty<0
 ) THEN
  RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='reservation movement ledger is negative or references an unlinked ordered product';
 END IF;

 SELECT coalesce(pg_catalog.array_agg(DISTINCT oi.product_id ORDER BY oi.product_id),ARRAY[]::uuid[])
  INTO v_products FROM public.order_items oi WHERE oi.order_id=v_order.id;
 FOREACH v_product IN ARRAY v_products LOOP
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||':inventory-batch-reservation:'||v_product::text,0));
  PERFORM ib.id FROM public.inventory_balances ib JOIN public.warehouses w
   ON w.id=ib.warehouse_id AND w.organization_id=v_org
   WHERE ib.product_id=v_product ORDER BY ib.warehouse_id FOR UPDATE OF ib;
  PERFORM b.id FROM public.inventory_batches b WHERE b.organization_id=v_org AND b.product_id=v_product
   ORDER BY b.id FOR UPDATE OF b;

  IF EXISTS(
   SELECT 1 FROM public.inventory_batches b WHERE b.organization_id=v_org AND b.product_id=v_product
    AND b.quantity_reserved IS DISTINCT FROM coalesce((
     SELECT pg_catalog.sum(x.qty) FROM (
      SELECT pg_catalog.sum(CASE WHEN im.movement_type='reserve' THEN im.quantity
       WHEN im.movement_type='release_reservation' THEN -im.quantity ELSE 0 END)::numeric(15,3) qty
      FROM public.inventory_movements im JOIN public.orders ao ON ao.id=im.reference_id AND ao.organization_id=v_org
      WHERE im.reference_type='order' AND im.inventory_batch_id=b.id AND im.movement_type IN ('reserve','release_reservation')
       AND ao.status IN ('confirmed','processing')
       AND NOT EXISTS(SELECT 1 FROM public.inventory_movements s WHERE s.reference_type='order' AND s.reference_id=ao.id AND s.movement_type='sale')
      GROUP BY im.reference_id HAVING pg_catalog.sum(CASE WHEN im.movement_type='reserve' THEN im.quantity
       WHEN im.movement_type='release_reservation' THEN -im.quantity ELSE 0 END)>0
     ) x
    ),0)
  ) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='batch reserved quantity is below active order movement ledger'; END IF;
  IF EXISTS(
   SELECT 1 FROM public.inventory_balances ib JOIN public.warehouses w ON w.id=ib.warehouse_id AND w.organization_id=v_org
    WHERE ib.product_id=v_product AND ib.quantity_reserved IS DISTINCT FROM coalesce((
     SELECT pg_catalog.sum(x.qty) FROM (
      SELECT pg_catalog.sum(CASE WHEN im.movement_type='reserve' THEN im.quantity
       WHEN im.movement_type='release_reservation' THEN -im.quantity ELSE 0 END)::numeric(15,3) qty
      FROM public.inventory_movements im JOIN public.orders ao ON ao.id=im.reference_id AND ao.organization_id=v_org
      WHERE im.reference_type='order' AND im.product_id=ib.product_id AND im.warehouse_id=ib.warehouse_id
       AND im.movement_type IN ('reserve','release_reservation')
       AND ao.status IN ('confirmed','processing')
       AND NOT EXISTS(SELECT 1 FROM public.inventory_movements s WHERE s.reference_type='order' AND s.reference_id=ao.id AND s.movement_type='sale')
      GROUP BY im.reference_id HAVING pg_catalog.sum(CASE WHEN im.movement_type='reserve' THEN im.quantity
       WHEN im.movement_type='release_reservation' THEN -im.quantity ELSE 0 END)>0
     ) x
    ),0)
  ) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='aggregate reserved quantity is below active order movement ledger'; END IF;

  SELECT coalesce(pg_catalog.sum(oi.quantity),0)::numeric(15,3) INTO v_ordered
   FROM public.order_items oi WHERE oi.order_id=v_order.id AND oi.product_id=v_product;
  SELECT coalesce(pg_catalog.sum(CASE WHEN im.movement_type='reserve' THEN im.quantity
    WHEN im.movement_type='release_reservation' THEN -im.quantity ELSE 0 END),0)::numeric(15,3) INTO v_reserved
   FROM public.inventory_movements im WHERE im.reference_type='order' AND im.reference_id=v_order.id
    AND im.product_id=v_product AND im.movement_type IN ('reserve','release_reservation');
  IF v_reserved<v_ordered THEN v_has_shortage:=true; END IF;
  v_excess:=greatest(v_reserved-v_ordered,0);
  v_left:=v_excess;

  -- Release least-urgent lots first (no-expiry and latest expiry first),
  -- preserving earlier-expiry allocations for the commercial order.
  FOR v_lot IN
   SELECT b.id batch_id,b.product_id,b.warehouse_id,b.quantity_reserved,ib.id balance_id,
    pg_catalog.sum(CASE WHEN im.movement_type='reserve' THEN im.quantity
      WHEN im.movement_type='release_reservation' THEN -im.quantity ELSE 0 END)::numeric(15,3) order_reserved
   FROM public.inventory_movements im JOIN public.inventory_batches b
    ON b.id=im.inventory_batch_id AND b.organization_id=v_org
   JOIN public.inventory_balances ib ON ib.product_id=b.product_id AND ib.warehouse_id=b.warehouse_id
   JOIN public.warehouses w ON w.id=b.warehouse_id AND w.organization_id=v_org
   WHERE im.reference_type='order' AND im.reference_id=v_order.id AND im.product_id=v_product
    AND im.movement_type IN ('reserve','release_reservation') AND im.inventory_batch_id IS NOT NULL
   GROUP BY b.id,b.product_id,b.warehouse_id,b.quantity_reserved,ib.id,b.expiry_date,b.received_at
   HAVING pg_catalog.sum(CASE WHEN im.movement_type='reserve' THEN im.quantity
     WHEN im.movement_type='release_reservation' THEN -im.quantity ELSE 0 END)>0
   ORDER BY b.expiry_date DESC NULLS FIRST,b.received_at DESC,b.id DESC
  LOOP
   EXIT WHEN v_left<=0;
   IF v_lot.quantity_reserved<v_lot.order_reserved THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='batch reserved counter is below this order movement ledger; excess release refused';
   END IF;
   v_take:=LEAST(v_left,v_lot.order_reserved);
   UPDATE public.inventory_batches SET quantity_reserved=quantity_reserved-v_take
    WHERE id=v_lot.batch_id AND quantity_reserved>=v_take;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='batch reserved counter changed during excess release'; END IF;
   UPDATE public.inventory_balances SET quantity_reserved=quantity_reserved-v_take,
    last_movement_at=pg_catalog.statement_timestamp(),updated_at=pg_catalog.statement_timestamp()
    WHERE id=v_lot.balance_id AND quantity_reserved>=v_take
    RETURNING quantity_available INTO v_after;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='aggregate reserved counter changed during excess release'; END IF;
   INSERT INTO public.inventory_movements(product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by,inventory_batch_id)
    VALUES(v_lot.product_id,v_lot.warehouse_id,'release_reservation',v_take,v_after,'order',v_order.id,
     'تحرير الحجز الزائد للطلب: '||v_reason,v_actor,v_lot.batch_id);
   v_allocations:=v_allocations||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'batch_id',v_lot.batch_id,'product_id',v_product,'warehouse_id',v_lot.warehouse_id,'quantity',v_take));
   v_released:=v_released+v_take; v_lot_count:=v_lot_count+1; v_left:=v_left-v_take;
  END LOOP;
  IF v_left>0 THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='excess reservation movement history has no matching batch quantity; release refused'; END IF;
 END LOOP;

 v_result:=pg_catalog.jsonb_build_object('order_id',v_order.id,'release_status',
   CASE WHEN v_released>0 THEN 'excess_released'
     WHEN v_has_shortage THEN 'no_excess_to_release' ELSE 'already_matched' END,
   'released_quantity',v_released,'released_lot_count',v_lot_count,'allocations',v_allocations,'idempotent_replay',false);
 INSERT INTO public.inventory_order_reservation_reconciliations(organization_id,order_id,idempotency_key,request_payload,result,created_by)
  VALUES(v_org,v_order.id,v_key,v_payload,v_result,v_actor) RETURNING id INTO v_id;
 v_result:=v_result||pg_catalog.jsonb_build_object('reconciliation_id',v_id);
 UPDATE public.inventory_order_reservation_reconciliations SET result=v_result WHERE id=v_id;
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'inventory.order_reservation.excess_released','order_reservation_reconciliation',v_id,
   pg_catalog.jsonb_build_object('order_id',v_order.id),
   v_result||pg_catalog.jsonb_build_object('reason',v_reason,'idempotency_key',v_key));
 RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.release_excess_order_reservations(uuid,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.release_excess_order_reservations(uuid,text,text) TO authenticated;
COMMENT ON FUNCTION public.release_excess_order_reservations(uuid,text,text) IS
 'Manager/admin-only idempotent correction that releases only net order reservation excess, from least-urgent batches first; preserves actual order quantity and stock on hand.';

CREATE OR REPLACE FUNCTION public.finalize_order_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_move record;
  v_after numeric(15,3);
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('shipped','delivered')
     AND OLD.status IN ('confirmed','processing','shipped')
     AND NOT EXISTS (
       SELECT 1 FROM public.inventory_movements
        WHERE reference_type='order' AND reference_id=NEW.id AND movement_type='sale'
     ) THEN
    IF EXISTS (
      SELECT 1 FROM public.inventory_movements
       WHERE reference_type='order' AND reference_id=NEW.id
         AND movement_type='reserve' AND inventory_batch_id IS NULL
    ) THEN
      RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='order reservation has no batch allocation';
    END IF;

    -- The full commercial quantity must be reserved by product before any
    -- batch can be settled; shortage/excess on one product cannot net against another.
    IF EXISTS (
      WITH ordered_quantities AS MATERIALIZED (
        SELECT oi.product_id,pg_catalog.sum(oi.quantity)::numeric(15,3) AS quantity
          FROM public.order_items oi
         WHERE oi.order_id=NEW.id
         GROUP BY oi.product_id
      ),
      net_reservations AS MATERIALIZED (
        SELECT im.product_id,
               pg_catalog.sum(
                 CASE WHEN im.movement_type='reserve' THEN im.quantity
                      WHEN im.movement_type='release_reservation' THEN -im.quantity
                      ELSE 0 END
               )::numeric(15,3) AS quantity
          FROM public.inventory_movements im
         WHERE im.reference_type='order'
           AND im.reference_id=NEW.id
           AND im.movement_type IN ('reserve','release_reservation')
         GROUP BY im.product_id
      )
      SELECT 1
        FROM ordered_quantities oq
        FULL JOIN net_reservations nr
          ON nr.product_id IS NOT DISTINCT FROM oq.product_id
       WHERE coalesce(oq.quantity,0) IS DISTINCT FROM coalesce(nr.quantity,0)
    ) THEN
      RAISE EXCEPTION USING ERRCODE='55000',
        MESSAGE='order net reservation quantity does not match ordered quantity; shipment refused';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM (
          SELECT im.inventory_batch_id,
                 pg_catalog.sum(
                   CASE WHEN im.movement_type='reserve' THEN im.quantity
                        WHEN im.movement_type='release_reservation' THEN -im.quantity
                        ELSE 0 END
                 ) AS reserved_quantity
            FROM public.inventory_movements im
           WHERE im.reference_type='order'
             AND im.reference_id=NEW.id
             AND im.movement_type IN ('reserve','release_reservation')
             AND im.inventory_batch_id IS NOT NULL
           GROUP BY im.inventory_batch_id
          HAVING pg_catalog.sum(
            CASE WHEN im.movement_type='reserve' THEN im.quantity
                 WHEN im.movement_type='release_reservation' THEN -im.quantity
                 ELSE 0 END
          )>0
        ) outstanding
        JOIN public.inventory_batches b ON b.id=outstanding.inventory_batch_id
       WHERE b.expiry_date IS NOT NULL
         AND b.expiry_date<(pg_catalog.now() AT TIME ZONE 'UTC')::date
    ) THEN
      RAISE EXCEPTION USING ERRCODE='55000',
        MESSAGE='order has an expired reserved batch; reallocate its reservation before shipment';
    END IF;

    PERFORM 1
      FROM public.inventory_balances ib
      JOIN (
        SELECT DISTINCT product_id,warehouse_id
          FROM public.inventory_movements
         WHERE reference_type='order' AND reference_id=NEW.id AND movement_type='reserve'
      ) r ON r.product_id=ib.product_id AND r.warehouse_id=ib.warehouse_id
     ORDER BY ib.product_id,ib.warehouse_id
     FOR UPDATE OF ib;

    FOR v_move IN
      SELECT product_id,warehouse_id,inventory_batch_id,
             pg_catalog.sum(
               CASE WHEN movement_type='reserve' THEN quantity
                    WHEN movement_type='release_reservation' THEN -quantity
                    ELSE 0 END
             )::numeric(15,3) AS quantity
        FROM public.inventory_movements
       WHERE reference_type='order' AND reference_id=NEW.id
         AND movement_type IN ('reserve','release_reservation')
         AND inventory_batch_id IS NOT NULL
       GROUP BY product_id,warehouse_id,inventory_batch_id
      HAVING pg_catalog.sum(
        CASE WHEN movement_type='reserve' THEN quantity
             WHEN movement_type='release_reservation' THEN -quantity
             ELSE 0 END
      )>0
       ORDER BY product_id,warehouse_id,inventory_batch_id
    LOOP
      UPDATE public.inventory_batches
         SET quantity_on_hand=quantity_on_hand-v_move.quantity,
             quantity_reserved=quantity_reserved-v_move.quantity
       WHERE id=v_move.inventory_batch_id
         AND product_id=v_move.product_id
         AND warehouse_id=v_move.warehouse_id
         AND quantity_on_hand>=v_move.quantity
         AND quantity_reserved>=v_move.quantity;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='reserved batch settlement failed; shipment rolled back';
      END IF;

      UPDATE public.inventory_balances
         SET quantity_on_hand=quantity_on_hand-v_move.quantity,
             quantity_reserved=quantity_reserved-v_move.quantity,
             last_movement_at=pg_catalog.statement_timestamp(),
             updated_at=pg_catalog.statement_timestamp()
       WHERE product_id=v_move.product_id
         AND warehouse_id=v_move.warehouse_id
         AND quantity_on_hand>=v_move.quantity
         AND quantity_reserved>=v_move.quantity
       RETURNING quantity_available INTO v_after;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='aggregate stock settlement failed; shipment rolled back';
      END IF;

      INSERT INTO public.inventory_movements(
        product_id,warehouse_id,movement_type,quantity,balance_after,
        reference_type,reference_id,reason,created_by,inventory_batch_id
      ) VALUES(
        v_move.product_id,v_move.warehouse_id,'sale',-v_move.quantity,v_after,
        'order',NEW.id,'خصم المخزون عند الشحن من الدفعة المحجوزة',
        v_actor,v_move.inventory_batch_id
      );
    END LOOP;

  ELSIF NEW.status='cancelled' AND OLD.status IN ('confirmed','processing') THEN
    IF EXISTS (
      SELECT 1 FROM public.inventory_movements
       WHERE reference_type='order' AND reference_id=NEW.id
         AND movement_type='reserve' AND inventory_batch_id IS NULL
    ) THEN
      RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='order reservation has no batch allocation';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.inventory_movements im
       WHERE im.reference_type='order' AND im.reference_id=NEW.id
         AND im.movement_type IN ('reserve','release_reservation')
       GROUP BY im.product_id,im.warehouse_id,im.inventory_batch_id
      HAVING pg_catalog.sum(
        CASE WHEN im.movement_type='reserve' THEN im.quantity
             WHEN im.movement_type='release_reservation' THEN -im.quantity
             ELSE 0 END
      )<0
    ) THEN
      RAISE EXCEPTION USING ERRCODE='40001',
        MESSAGE='negative reservation movement ledger; cancellation refused';
    END IF;

    PERFORM 1
      FROM public.inventory_balances ib
      JOIN (
        SELECT DISTINCT product_id,warehouse_id
          FROM public.inventory_movements
         WHERE reference_type='order' AND reference_id=NEW.id AND movement_type='reserve'
      ) r ON r.product_id=ib.product_id AND r.warehouse_id=ib.warehouse_id
     ORDER BY ib.product_id,ib.warehouse_id
     FOR UPDATE OF ib;

    -- Release only the remaining net reservation. Previously released source
    -- lots (for example during FEFO reallocation) are never released twice.
    FOR v_move IN
      SELECT product_id,warehouse_id,inventory_batch_id,
             pg_catalog.sum(
               CASE WHEN movement_type='reserve' THEN quantity
                    WHEN movement_type='release_reservation' THEN -quantity
                    ELSE 0 END
             )::numeric(15,3) AS quantity
        FROM public.inventory_movements
       WHERE reference_type='order' AND reference_id=NEW.id
         AND movement_type IN ('reserve','release_reservation')
         AND inventory_batch_id IS NOT NULL
       GROUP BY product_id,warehouse_id,inventory_batch_id
      HAVING pg_catalog.sum(
        CASE WHEN movement_type='reserve' THEN quantity
             WHEN movement_type='release_reservation' THEN -quantity
             ELSE 0 END
      )>0
       ORDER BY product_id,warehouse_id,inventory_batch_id
    LOOP
      UPDATE public.inventory_batches
         SET quantity_reserved=quantity_reserved-v_move.quantity
       WHERE id=v_move.inventory_batch_id
         AND product_id=v_move.product_id
         AND warehouse_id=v_move.warehouse_id
         AND quantity_reserved>=v_move.quantity;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='reserved batch cancellation release failed; transaction rolled back';
      END IF;

      UPDATE public.inventory_balances
         SET quantity_reserved=quantity_reserved-v_move.quantity,
             last_movement_at=pg_catalog.statement_timestamp(),
             updated_at=pg_catalog.statement_timestamp()
       WHERE product_id=v_move.product_id
         AND warehouse_id=v_move.warehouse_id
         AND quantity_reserved>=v_move.quantity
       RETURNING quantity_available INTO v_after;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='aggregate cancellation release failed; transaction rolled back';
      END IF;

      INSERT INTO public.inventory_movements(
        product_id,warehouse_id,movement_type,quantity,balance_after,
        reference_type,reference_id,reason,created_by,inventory_batch_id
      ) VALUES(
        v_move.product_id,v_move.warehouse_id,'release_reservation',v_move.quantity,v_after,
        'order',NEW.id,'تحرير حجز المخزون عند إلغاء الطلب',v_actor,v_move.inventory_batch_id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.finalize_order_inventory()
  FROM PUBLIC,anon,authenticated,service_role;

COMMENT ON FUNCTION public.finalize_order_inventory() IS
  'Settles only exact net order batch reservations, blocks expired or incomplete shipment quantities, and releases only outstanding reservations on cancellation.';

CREATE OR REPLACE FUNCTION public.reallocate_expired_order_reservations(
  p_order_id uuid,
  p_idempotency_key text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_order public.orders%ROWTYPE;
  v_existing public.inventory_order_reservation_reallocations%ROWTYPE;
  v_key text:=pg_catalog.btrim(coalesce(p_idempotency_key,''));
  v_reason text:=nullif(pg_catalog.btrim(coalesce(p_reason,'')),'');
  v_payload jsonb;
  v_product_ids uuid[]:=ARRAY[]::uuid[];
  v_product_id uuid;
  v_expired record;
  v_lot record;
  v_take numeric(15,3);
  v_remaining numeric(15,3);
  v_after numeric(15,3);
  v_batch_reserved numeric(15,3);
  v_active_batch_reserved numeric(15,3);
  v_balance_reserved numeric(15,3);
  v_active_balance_reserved numeric(15,3);
  v_today date:=(pg_catalog.now() AT TIME ZONE 'UTC')::date;
  v_reallocation_id uuid;
  v_reallocated_quantity numeric(15,3):=0;
  v_released_lot_count integer:=0;
  v_replacement_lot_count integer:=0;
  v_replacements jsonb:='[]'::jsonb;
  v_result jsonb;
BEGIN
  SELECT p.organization_id
    INTO v_org
    FROM public.profiles p
    JOIN public.organizations o ON o.id=p.organization_id AND o.is_active=true
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;

  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.is_staff()
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles r
        WHERE r.profile_id=v_actor AND r.role IN ('admin','manager')
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active admin or manager inventory authority is required to reallocate expired order stock';
  END IF;

  IF p_order_id IS NULL
     OR v_key !~ '^[A-Za-z0-9_-]{16,128}$'
     OR v_reason IS NULL OR pg_catalog.char_length(v_reason)>500 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='order id, a valid idempotency key, and a reason of 1..500 characters are required';
  END IF;

  v_payload:=pg_catalog.jsonb_build_object('order_id',p_order_id,'reason',v_reason);
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':expired-order-reservation-reallocation:'||v_key,0)
  );

  SELECT r.* INTO v_existing
    FROM public.inventory_order_reservation_reallocations r
   WHERE r.organization_id=v_org AND r.idempotency_key=v_key
   FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='expired reservation reallocation idempotency key payload conflict';
    END IF;
    RETURN v_existing.result||pg_catalog.jsonb_build_object('idempotent_replay',true);
  END IF;

  SELECT o.* INTO v_order
    FROM public.orders o
   WHERE o.id=p_order_id AND o.organization_id=v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='order was not found in the active organization';
  END IF;
  IF v_order.status NOT IN ('confirmed','processing') THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='only confirmed or processing orders can have expired reservations reallocated';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.inventory_movements im
     WHERE im.reference_type='order' AND im.reference_id=v_order.id AND im.movement_type='sale'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='an order with a recorded sale cannot have its reservation reallocated';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.inventory_movements im
     WHERE im.reference_type='order' AND im.reference_id=v_order.id
       AND im.movement_type='reserve' AND im.inventory_batch_id IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='order reservation has no batch lineage and cannot be safely reallocated';
  END IF;

  SELECT coalesce(pg_catalog.array_agg(DISTINCT expired.product_id ORDER BY expired.product_id),ARRAY[]::uuid[])
    INTO v_product_ids
    FROM (
      SELECT b.product_id
        FROM public.inventory_movements im
        JOIN public.inventory_batches b
          ON b.id=im.inventory_batch_id AND b.organization_id=v_org
       WHERE im.reference_type='order' AND im.reference_id=v_order.id
         AND im.movement_type IN ('reserve','release_reservation')
       GROUP BY b.id,b.product_id,b.expiry_date
      HAVING pg_catalog.sum(
        CASE WHEN im.movement_type='reserve' THEN im.quantity
             WHEN im.movement_type='release_reservation' THEN -im.quantity
             ELSE 0 END
      )>0
         AND b.expiry_date IS NOT NULL
         AND b.expiry_date<v_today
    ) expired_products;

  -- Share the same product reservation mutex as reserve_order_inventory().
  -- Then lock every same-tenant balance and lot row in deterministic order.
  FOREACH v_product_id IN ARRAY v_product_ids LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_org::text||':inventory-batch-reservation:'||v_product_id::text,0)
    );
  END LOOP;

  IF pg_catalog.cardinality(v_product_ids)>0 THEN
    PERFORM ib.id
      FROM public.inventory_balances ib
      JOIN public.warehouses w ON w.id=ib.warehouse_id AND w.organization_id=v_org
     WHERE ib.product_id=ANY(v_product_ids)
     ORDER BY ib.product_id,ib.warehouse_id
     FOR UPDATE OF ib;

    PERFORM b.id
      FROM public.inventory_batches b
     WHERE b.organization_id=v_org AND b.product_id=ANY(v_product_ids)
     ORDER BY b.id
     FOR UPDATE OF b;
  END IF;

  FOR v_expired IN
    SELECT
      b.id AS inventory_batch_id,
      b.product_id,
      b.warehouse_id,
      pg_catalog.sum(
        CASE WHEN im.movement_type='reserve' THEN im.quantity
             WHEN im.movement_type='release_reservation' THEN -im.quantity
             ELSE 0 END
      )::numeric(15,3) AS reserved_quantity
    FROM public.inventory_movements im
    JOIN public.inventory_batches b
      ON b.id=im.inventory_batch_id AND b.organization_id=v_org
   WHERE im.reference_type='order' AND im.reference_id=v_order.id
     AND im.movement_type IN ('reserve','release_reservation')
   GROUP BY b.id,b.product_id,b.warehouse_id,b.expiry_date
  HAVING pg_catalog.sum(
      CASE WHEN im.movement_type='reserve' THEN im.quantity
           WHEN im.movement_type='release_reservation' THEN -im.quantity
           ELSE 0 END
    )>0
     AND b.expiry_date IS NOT NULL
     AND b.expiry_date<v_today
   ORDER BY b.product_id,b.warehouse_id,b.id
  LOOP
    -- Fail closed if the lot or aggregate reservation ledger is already below
    -- the sum of every still-active order's immutable reserve/release movements.
    -- A per-order comparison is insufficient when several orders share one lot.
    SELECT b.quantity_reserved INTO v_batch_reserved
      FROM public.inventory_batches b
     WHERE b.id=v_expired.inventory_batch_id
       AND b.organization_id=v_org;

    SELECT coalesce(pg_catalog.sum(active_batch_reservations.reserved_quantity),0)::numeric(15,3)
      INTO v_active_batch_reserved
      FROM (
        SELECT pg_catalog.sum(
          CASE WHEN im.movement_type='reserve' THEN im.quantity
               WHEN im.movement_type='release_reservation' THEN -im.quantity
               ELSE 0 END
        )::numeric(15,3) AS reserved_quantity
        FROM public.inventory_movements im
        JOIN public.orders active_order
          ON active_order.id=im.reference_id
         AND active_order.organization_id=v_org
        WHERE im.reference_type='order'
          AND im.inventory_batch_id=v_expired.inventory_batch_id
          AND im.movement_type IN ('reserve','release_reservation')
          AND active_order.status IN ('confirmed','processing')
          AND NOT EXISTS (
            SELECT 1 FROM public.inventory_movements sale
             WHERE sale.reference_type='order'
               AND sale.reference_id=active_order.id
               AND sale.movement_type='sale'
          )
        GROUP BY im.reference_id
        HAVING pg_catalog.sum(
          CASE WHEN im.movement_type='reserve' THEN im.quantity
               WHEN im.movement_type='release_reservation' THEN -im.quantity
               ELSE 0 END
        )>0
      ) active_batch_reservations;

    IF v_batch_reserved IS NULL OR v_batch_reserved IS DISTINCT FROM v_active_batch_reserved THEN
      RAISE EXCEPTION USING ERRCODE='40001',
        MESSAGE='batch reserved quantity differs from its active order reservation movement ledger; reallocation refused';
    END IF;

    SELECT ib.quantity_reserved INTO v_balance_reserved
      FROM public.inventory_balances ib
     WHERE ib.product_id=v_expired.product_id
       AND ib.warehouse_id=v_expired.warehouse_id;

    SELECT coalesce(pg_catalog.sum(active_balance_reservations.reserved_quantity),0)::numeric(15,3)
      INTO v_active_balance_reserved
      FROM (
        SELECT pg_catalog.sum(
          CASE WHEN im.movement_type='reserve' THEN im.quantity
               WHEN im.movement_type='release_reservation' THEN -im.quantity
               ELSE 0 END
        )::numeric(15,3) AS reserved_quantity
        FROM public.inventory_movements im
        JOIN public.orders active_order
          ON active_order.id=im.reference_id
         AND active_order.organization_id=v_org
        WHERE im.reference_type='order'
          AND im.product_id=v_expired.product_id
          AND im.warehouse_id=v_expired.warehouse_id
          
          AND im.movement_type IN ('reserve','release_reservation')
          AND active_order.status IN ('confirmed','processing')
          AND NOT EXISTS (
            SELECT 1 FROM public.inventory_movements sale
             WHERE sale.reference_type='order'
               AND sale.reference_id=active_order.id
               AND sale.movement_type='sale'
          )
        GROUP BY im.reference_id
        HAVING pg_catalog.sum(
          CASE WHEN im.movement_type='reserve' THEN im.quantity
               WHEN im.movement_type='release_reservation' THEN -im.quantity
               ELSE 0 END
        )>0
      ) active_balance_reservations;

    IF v_balance_reserved IS NULL OR v_balance_reserved IS DISTINCT FROM v_active_balance_reserved THEN
      RAISE EXCEPTION USING ERRCODE='40001',
        MESSAGE='aggregate reserved quantity differs from its active order reservation movement ledger; reallocation refused';
    END IF;

    UPDATE public.inventory_batches b
       SET quantity_reserved=b.quantity_reserved-v_expired.reserved_quantity
     WHERE b.id=v_expired.inventory_batch_id
       AND b.organization_id=v_org
       AND b.quantity_reserved>=v_expired.reserved_quantity;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='40001',
        MESSAGE='expired batch reservation no longer matches the order movement ledger';
    END IF;

    UPDATE public.inventory_balances ib
       SET quantity_reserved=ib.quantity_reserved-v_expired.reserved_quantity,
           last_movement_at=pg_catalog.statement_timestamp(),
           updated_at=pg_catalog.statement_timestamp()
     WHERE ib.product_id=v_expired.product_id
       AND ib.warehouse_id=v_expired.warehouse_id
       AND ib.quantity_reserved>=v_expired.reserved_quantity
     RETURNING ib.quantity_available INTO v_after;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='40001',
        MESSAGE='aggregate reserved quantity does not match the expired batch reservation';
    END IF;

    INSERT INTO public.inventory_movements(
      product_id,warehouse_id,movement_type,quantity,balance_after,
      reference_type,reference_id,reason,created_by,inventory_batch_id
    ) VALUES(
      v_expired.product_id,v_expired.warehouse_id,'release_reservation',
      v_expired.reserved_quantity,v_after,'order',v_order.id,
      'تحرير حجز دفعة منتهية قبل إعادة التخصيص: '||v_reason,
      v_actor,v_expired.inventory_batch_id
    );

    v_remaining:=v_expired.reserved_quantity;
    v_released_lot_count:=v_released_lot_count+1;

    FOR v_lot IN
      SELECT
        b.id AS inventory_batch_id,
        b.product_id,
        b.warehouse_id,
        b.quantity_on_hand,
        b.quantity_reserved,
        ib.id AS balance_id
      FROM public.inventory_batches b
      JOIN public.inventory_balances ib
        ON ib.product_id=b.product_id AND ib.warehouse_id=b.warehouse_id
      JOIN public.warehouses w
        ON w.id=b.warehouse_id AND w.organization_id=v_org AND w.is_active=true
      WHERE b.organization_id=v_org
        AND b.product_id=v_expired.product_id
        AND b.quantity_on_hand>b.quantity_reserved
        AND (b.expiry_date IS NULL OR b.expiry_date>=v_today)
      ORDER BY b.expiry_date ASC NULLS LAST,b.received_at,b.warehouse_id,b.id
      FOR UPDATE OF b,ib
    LOOP
      EXIT WHEN v_remaining<=0;
      v_take:=LEAST(v_remaining,v_lot.quantity_on_hand-v_lot.quantity_reserved);
      IF v_take<=0 THEN CONTINUE; END IF;

      -- Verify the replacement lot and warehouse counters against every active order
      -- before reserving stock; positive batch free quantity alone is not sufficient.
      v_batch_reserved:=v_lot.quantity_reserved;
      SELECT coalesce(pg_catalog.sum(active_batch_reservations.reserved_quantity),0)::numeric(15,3)
        INTO v_active_batch_reserved
        FROM (
          SELECT pg_catalog.sum(
            CASE WHEN im.movement_type='reserve' THEN im.quantity
                 WHEN im.movement_type='release_reservation' THEN -im.quantity
                 ELSE 0 END
          )::numeric(15,3) AS reserved_quantity
          FROM public.inventory_movements im
          JOIN public.orders active_order
            ON active_order.id=im.reference_id
           AND active_order.organization_id=v_org
          WHERE im.reference_type='order'
            AND im.inventory_batch_id=v_lot.inventory_batch_id
            AND im.movement_type IN ('reserve','release_reservation')
            AND active_order.status IN ('confirmed','processing')
            AND NOT EXISTS (
              SELECT 1 FROM public.inventory_movements sale
               WHERE sale.reference_type='order'
                 AND sale.reference_id=active_order.id
                 AND sale.movement_type='sale'
            )
          GROUP BY im.reference_id
          HAVING pg_catalog.sum(
            CASE WHEN im.movement_type='reserve' THEN im.quantity
                 WHEN im.movement_type='release_reservation' THEN -im.quantity
                 ELSE 0 END
          )>0
        ) active_batch_reservations;
      IF v_batch_reserved IS DISTINCT FROM v_active_batch_reserved THEN
        RAISE EXCEPTION USING ERRCODE='40001',
          MESSAGE='replacement batch reserved quantity differs from its active order movement ledger; reallocation refused';
      END IF;

      SELECT ib.quantity_reserved INTO v_balance_reserved
        FROM public.inventory_balances ib
       WHERE ib.id=v_lot.balance_id;
      SELECT coalesce(pg_catalog.sum(active_balance_reservations.reserved_quantity),0)::numeric(15,3)
        INTO v_active_balance_reserved
        FROM (
          SELECT pg_catalog.sum(
            CASE WHEN im.movement_type='reserve' THEN im.quantity
                 WHEN im.movement_type='release_reservation' THEN -im.quantity
                 ELSE 0 END
          )::numeric(15,3) AS reserved_quantity
          FROM public.inventory_movements im
          JOIN public.orders active_order
            ON active_order.id=im.reference_id
           AND active_order.organization_id=v_org
          WHERE im.reference_type='order'
            AND im.product_id=v_lot.product_id
            AND im.warehouse_id=v_lot.warehouse_id
            AND im.movement_type IN ('reserve','release_reservation')
            AND active_order.status IN ('confirmed','processing')
            AND NOT EXISTS (
              SELECT 1 FROM public.inventory_movements sale
               WHERE sale.reference_type='order'
                 AND sale.reference_id=active_order.id
                 AND sale.movement_type='sale'
            )
          GROUP BY im.reference_id
          HAVING pg_catalog.sum(
            CASE WHEN im.movement_type='reserve' THEN im.quantity
                 WHEN im.movement_type='release_reservation' THEN -im.quantity
                 ELSE 0 END
          )>0
        ) active_balance_reservations;
      IF v_balance_reserved IS NULL OR v_balance_reserved IS DISTINCT FROM v_active_balance_reserved THEN
        RAISE EXCEPTION USING ERRCODE='40001',
          MESSAGE='replacement warehouse reserved quantity differs from its active order movement ledger; reallocation refused';
      END IF;

      UPDATE public.inventory_batches
         SET quantity_reserved=quantity_reserved+v_take
       WHERE id=v_lot.inventory_batch_id;

      UPDATE public.inventory_balances
         SET quantity_reserved=quantity_reserved+v_take,
             last_movement_at=pg_catalog.statement_timestamp(),
             updated_at=pg_catalog.statement_timestamp()
       WHERE id=v_lot.balance_id
         AND quantity_available>=v_take
       RETURNING quantity_available INTO v_after;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='40001',
          MESSAGE='aggregate available balance is below the replacement batch quantity; reservation reallocation refused';
      END IF;

      INSERT INTO public.inventory_movements(
        product_id,warehouse_id,movement_type,quantity,balance_after,
        reference_type,reference_id,reason,created_by,inventory_batch_id
      ) VALUES(
        v_lot.product_id,v_lot.warehouse_id,'reserve',v_take,v_after,'order',v_order.id,
        'إعادة حجز من دفعة صالحة حسب FEFO: '||v_reason,
        v_actor,v_lot.inventory_batch_id
      );

      v_replacements:=v_replacements||pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'from_batch_id',v_expired.inventory_batch_id,
          'to_batch_id',v_lot.inventory_batch_id,
          'product_id',v_lot.product_id,
          'warehouse_id',v_lot.warehouse_id,
          'quantity',v_take
        )
      );
      v_replacement_lot_count:=v_replacement_lot_count+1;
      v_remaining:=v_remaining-v_take;
    END LOOP;

    IF v_remaining>0 THEN
      RAISE EXCEPTION USING ERRCODE='P0001',
        MESSAGE='insufficient non-expired FEFO stock to replace the expired order reservation; no changes were committed';
    END IF;
    v_reallocated_quantity:=v_reallocated_quantity+v_expired.reserved_quantity;
  END LOOP;

  v_result:=pg_catalog.jsonb_build_object(
    'order_id',v_order.id,
    'reallocation_status',CASE WHEN v_reallocated_quantity>0 THEN 'reallocated' ELSE 'no_expired_reservations' END,
    'reallocated_quantity',v_reallocated_quantity,
    'released_lot_count',v_released_lot_count,
    'replacement_lot_count',v_replacement_lot_count,
    'replacement_allocations',v_replacements,
    'idempotent_replay',false
  );

  INSERT INTO public.inventory_order_reservation_reallocations(
    organization_id,order_id,idempotency_key,request_payload,result,created_by
  ) VALUES(v_org,v_order.id,v_key,v_payload,v_result,v_actor)
  RETURNING id INTO v_reallocation_id;

  v_result:=v_result||pg_catalog.jsonb_build_object('reallocation_id',v_reallocation_id);

  UPDATE public.inventory_order_reservation_reallocations
     SET result=v_result
   WHERE id=v_reallocation_id;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value
  ) VALUES(
    v_org,v_actor,'inventory.order_reservation.reallocated',
    'order_reservation_reallocation',v_reallocation_id,
    pg_catalog.jsonb_build_object('order_id',v_order.id,'released_lot_count',v_released_lot_count),
    v_result||pg_catalog.jsonb_build_object('reason',v_reason,'idempotency_key',v_key)
  );

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.reallocate_expired_order_reservations(uuid,text,text)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.reallocate_expired_order_reservations(uuid,text,text)
  TO authenticated;

COMMENT ON FUNCTION public.reallocate_expired_order_reservations(uuid,text,text) IS
  'Manager-only, idempotent FEFO reallocation of expired order reservations. Appends release/reserve movements, locks order/product/balances/lots atomically, and never posts financial entries.';

CREATE OR REPLACE FUNCTION public.list_orders_with_expired_fefo_reservations(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_today date:=(pg_catalog.now() AT TIME ZONE 'UTC')::date;
  v_total bigint;
  v_orders jsonb;
BEGIN
  SELECT p.organization_id
    INTO v_org
    FROM public.profiles p
    JOIN public.organizations o ON o.id=p.organization_id AND o.is_active=true
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;

  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.is_staff()
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles r
        WHERE r.profile_id=v_actor AND r.role IN ('admin','manager')
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active admin or manager inventory authority is required for expired FEFO order worklist';
  END IF;

  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 1000000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='expired FEFO worklist page must use limit 1..100 and offset 0..1000000';
  END IF;

  -- The page and total are derived from one materialized snapshot. No internal
  -- batch costs, tenant ids, customer contact details, or other private fields
  -- are returned to the operator worklist.
  WITH outstanding_expired_lots AS MATERIALIZED (
    SELECT
      o.id AS order_id,
      b.id AS batch_id,
      b.product_id,
      b.warehouse_id,
      b.batch_number,
      b.expiry_date,
      pg_catalog.sum(
        CASE WHEN im.movement_type='reserve' THEN im.quantity
             WHEN im.movement_type='release_reservation' THEN -im.quantity
             ELSE 0 END
      )::numeric(15,3) AS reserved_quantity,
      b.quantity_reserved AS batch_reserved_quantity
    FROM public.inventory_movements im
    JOIN public.orders o
      ON o.id=im.reference_id
     AND o.organization_id=v_org
    JOIN public.inventory_batches b
      ON b.id=im.inventory_batch_id
     AND b.organization_id=v_org
     AND b.product_id=im.product_id
     AND b.warehouse_id=im.warehouse_id
    WHERE im.reference_type='order'
      AND im.movement_type IN ('reserve','release_reservation')
      AND o.status IN ('confirmed','processing')
      AND b.expiry_date IS NOT NULL
      AND b.expiry_date<v_today
      AND NOT EXISTS (
        SELECT 1 FROM public.inventory_movements sale
         WHERE sale.reference_type='order'
           AND sale.reference_id=o.id
           AND sale.movement_type='sale'
      )
    GROUP BY o.id,b.id,b.product_id,b.warehouse_id,b.batch_number,b.expiry_date,b.quantity_reserved
    HAVING pg_catalog.sum(
      CASE WHEN im.movement_type='reserve' THEN im.quantity
           WHEN im.movement_type='release_reservation' THEN -im.quantity
           ELSE 0 END
    )>0
  ),
  eligible_orders AS MATERIALIZED (
    SELECT
      o.id,
      o.order_number,
      o.status,
      o.created_at,
      pg_catalog.sum(l.reserved_quantity)::numeric(15,3) AS expired_reserved_quantity,
      pg_catalog.count(*)::integer AS expired_lot_count,
      count(DISTINCT l.product_id)::integer AS affected_product_count,
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'batch_id',l.batch_id,
          'batch_number',l.batch_number,
          'expiry_date',l.expiry_date,
          'reserved_quantity',l.reserved_quantity::text,
          'batch_reserved_quantity',l.batch_reserved_quantity::text,
          'reservation_matches_batch',l.batch_reserved_quantity IS NOT DISTINCT FROM (
            SELECT coalesce(pg_catalog.sum(active_batch_reservations.reserved_quantity),0)::numeric(15,3)
              FROM (
                SELECT pg_catalog.sum(
                  CASE WHEN reservation_movement.movement_type='reserve' THEN reservation_movement.quantity
                       WHEN reservation_movement.movement_type='release_reservation' THEN -reservation_movement.quantity
                       ELSE 0 END
                )::numeric(15,3) AS reserved_quantity
                  FROM public.inventory_movements reservation_movement
                  JOIN public.orders active_order
                    ON active_order.id=reservation_movement.reference_id
                   AND active_order.organization_id=v_org
                 WHERE reservation_movement.reference_type='order'
                   AND reservation_movement.inventory_batch_id=l.batch_id
                   AND reservation_movement.movement_type IN ('reserve','release_reservation')
                   AND active_order.status IN ('confirmed','processing')
                   AND NOT EXISTS (
                     SELECT 1 FROM public.inventory_movements sale
                      WHERE sale.reference_type='order'
                        AND sale.reference_id=active_order.id
                        AND sale.movement_type='sale'
                   )
                 GROUP BY reservation_movement.reference_id
                HAVING pg_catalog.sum(
                  CASE WHEN reservation_movement.movement_type='reserve' THEN reservation_movement.quantity
                       WHEN reservation_movement.movement_type='release_reservation' THEN -reservation_movement.quantity
                       ELSE 0 END
                )>0
              ) active_batch_reservations
          ),
          'reservation_matches_balance',coalesce((
            SELECT balance.quantity_reserved IS NOT DISTINCT FROM (
              SELECT coalesce(pg_catalog.sum(active_balance_reservations.reserved_quantity),0)::numeric(15,3)
                FROM (
                  SELECT pg_catalog.sum(
                    CASE WHEN reservation_movement.movement_type='reserve' THEN reservation_movement.quantity
                         WHEN reservation_movement.movement_type='release_reservation' THEN -reservation_movement.quantity
                         ELSE 0 END
                  )::numeric(15,3) AS reserved_quantity
                    FROM public.inventory_movements reservation_movement
                    JOIN public.orders active_order
                      ON active_order.id=reservation_movement.reference_id
                     AND active_order.organization_id=v_org
                   WHERE reservation_movement.reference_type='order'
                     AND reservation_movement.product_id=l.product_id
                     AND reservation_movement.warehouse_id=l.warehouse_id
                     AND reservation_movement.movement_type IN ('reserve','release_reservation')
                     AND active_order.status IN ('confirmed','processing')
                     AND NOT EXISTS (
                       SELECT 1 FROM public.inventory_movements sale
                        WHERE sale.reference_type='order'
                          AND sale.reference_id=active_order.id
                          AND sale.movement_type='sale'
                     )
                   GROUP BY reservation_movement.reference_id
                  HAVING pg_catalog.sum(
                    CASE WHEN reservation_movement.movement_type='reserve' THEN reservation_movement.quantity
                         WHEN reservation_movement.movement_type='release_reservation' THEN -reservation_movement.quantity
                         ELSE 0 END
                  )>0
                ) active_balance_reservations
            )
              FROM public.inventory_balances balance
             WHERE balance.product_id=l.product_id AND balance.warehouse_id=l.warehouse_id
          ),false),
          'product_id',p.id,
          'item_code',p.item_code,
          'product_name',p.name,
          'warehouse_id',w.id,
          'warehouse_name',w.name,
          'replacement_available_quantity',(
            SELECT coalesce(pg_catalog.sum(replacement.quantity_on_hand-replacement.quantity_reserved),0)::numeric(15,3)::text
              FROM public.inventory_batches replacement
              JOIN public.warehouses replacement_warehouse
                ON replacement_warehouse.id=replacement.warehouse_id
               AND replacement_warehouse.organization_id=replacement.organization_id
               AND replacement_warehouse.is_active=true
             WHERE replacement.organization_id=v_org
               AND replacement.product_id=l.product_id
               AND replacement.quantity_on_hand>replacement.quantity_reserved
               AND (replacement.expiry_date IS NULL OR replacement.expiry_date>=v_today)
          )
        )
        ORDER BY l.expiry_date,l.product_id,l.warehouse_id,l.batch_id
      ) AS expired_lots
    FROM public.orders o
    JOIN outstanding_expired_lots l ON l.order_id=o.id
    JOIN public.products p
      ON p.id=l.product_id AND p.organization_id=v_org
    JOIN public.warehouses w
      ON w.id=l.warehouse_id AND w.organization_id=v_org
    GROUP BY o.id,o.order_number,o.status,o.created_at
  ),
  page_orders AS MATERIALIZED (
    SELECT *
      FROM eligible_orders
     ORDER BY created_at,o.id
     LIMIT p_limit
     OFFSET p_offset
  )
  SELECT
    (SELECT pg_catalog.count(*) FROM eligible_orders),
    coalesce((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'order_id',page.id,
          'order_number',page.order_number,
          'status',page.status,
          'created_at',page.created_at,
          'expired_reserved_quantity',page.expired_reserved_quantity::text,
          'expired_lot_count',page.expired_lot_count,
          'affected_product_count',page.affected_product_count,
          'expired_lots',page.expired_lots
        )
        ORDER BY page.created_at,page.id
      )
      FROM page_orders page
    ),'[]'::jsonb)
    INTO v_total,v_orders;

  RETURN pg_catalog.jsonb_build_object(
    'orders',v_orders,
    'total',v_total,
    'limit',p_limit,
    'offset',p_offset,
    'has_more',v_total>(p_offset::bigint+p_limit::bigint),
    'as_of',pg_catalog.statement_timestamp()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_orders_with_expired_fefo_reservations(integer,integer)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.list_orders_with_expired_fefo_reservations(integer,integer)
  TO authenticated;

COMMENT ON FUNCTION public.list_orders_with_expired_fefo_reservations(integer,integer) IS
  'Manager/admin work queue for confirmed/processing orders with positive net reservations in expired FEFO batches; returns only scoped safe batch facts and in-date replacement availability from one statement snapshot.';

COMMIT;
