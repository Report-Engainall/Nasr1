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

    IF v_batch_reserved IS NULL OR v_batch_reserved<v_active_batch_reserved THEN
      RAISE EXCEPTION USING ERRCODE='40001',
        MESSAGE='batch reserved quantity is below its active order reservation movement ledger; reallocation refused';
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
          AND im.inventory_batch_id IS NOT NULL
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

    IF v_balance_reserved IS NULL OR v_balance_reserved<v_active_balance_reserved THEN
      RAISE EXCEPTION USING ERRCODE='40001',
        MESSAGE='aggregate reserved quantity is below its active order reservation movement ledger; reallocation refused';
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

      UPDATE public.inventory_batches
         SET quantity_reserved=quantity_reserved+v_take
       WHERE id=v_lot.inventory_batch_id;

      UPDATE public.inventory_balances
         SET quantity_reserved=quantity_reserved+v_take,
             last_movement_at=pg_catalog.statement_timestamp(),
             updated_at=pg_catalog.statement_timestamp()
       WHERE id=v_lot.balance_id
       RETURNING quantity_available INTO v_after;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='40001',
          MESSAGE='replacement batch aggregate balance disappeared during reservation reallocation';
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
          'reservation_matches_batch',l.batch_reserved_quantity>=(
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

CREATE OR REPLACE FUNCTION public.finalize_order_inventory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_actor uuid:=public.current_profile_id(); v_move record; v_after numeric(15,3);
BEGIN
 IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
 IF NEW.status IN ('shipped','delivered') AND OLD.status IN ('confirmed','processing','shipped')
 AND NOT EXISTS(SELECT 1 FROM public.inventory_movements WHERE reference_type='order' AND reference_id=NEW.id AND movement_type='sale') THEN
  IF EXISTS(SELECT 1 FROM public.inventory_movements WHERE reference_type='order' AND reference_id=NEW.id AND movement_type='reserve' AND inventory_batch_id IS NULL) THEN
   RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='order reservation has no batch allocation'; END IF;
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
  PERFORM 1 FROM public.inventory_balances ib JOIN
   (SELECT DISTINCT product_id,warehouse_id FROM public.inventory_movements WHERE reference_type='order' AND reference_id=NEW.id AND movement_type='reserve') r
   ON r.product_id=ib.product_id AND r.warehouse_id=ib.warehouse_id ORDER BY ib.product_id,ib.warehouse_id FOR UPDATE OF ib;
  FOR v_move IN
   SELECT product_id,warehouse_id,inventory_batch_id,
          pg_catalog.sum(CASE WHEN movement_type='reserve' THEN quantity
                              WHEN movement_type='release_reservation' THEN -quantity
                              ELSE 0 END)::numeric(15,3) quantity
     FROM public.inventory_movements
    WHERE reference_type='order' AND reference_id=NEW.id
      AND movement_type IN ('reserve','release_reservation')
      AND inventory_batch_id IS NOT NULL
    GROUP BY product_id,warehouse_id,inventory_batch_id
   HAVING pg_catalog.sum(CASE WHEN movement_type='reserve' THEN quantity
                              WHEN movement_type='release_reservation' THEN -quantity
                              ELSE 0 END)>0
    ORDER BY product_id,warehouse_id,inventory_batch_id LOOP
   UPDATE public.inventory_batches SET quantity_on_hand=quantity_on_hand-v_move.quantity,quantity_reserved=quantity_reserved-v_move.quantity
    WHERE id=v_move.inventory_batch_id AND product_id=v_move.product_id AND warehouse_id=v_move.warehouse_id
    AND quantity_on_hand>=v_move.quantity AND quantity_reserved>=v_move.quantity;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='reserved batch settlement failed; shipment rolled back'; END IF;
   UPDATE public.inventory_balances SET quantity_on_hand=quantity_on_hand-v_move.quantity,quantity_reserved=quantity_reserved-v_move.quantity,last_movement_at=pg_catalog.now(),updated_at=pg_catalog.now()
    WHERE product_id=v_move.product_id AND warehouse_id=v_move.warehouse_id AND quantity_on_hand>=v_move.quantity AND quantity_reserved>=v_move.quantity
    RETURNING quantity_available INTO v_after;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='aggregate stock settlement failed; shipment rolled back'; END IF;
   INSERT INTO public.inventory_movements(product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by,inventory_batch_id)
   VALUES(v_move.product_id,v_move.warehouse_id,'sale',-v_move.quantity,v_after,'order',NEW.id,'خصم المخزون عند الشحن من الدفعة المحجوزة',v_actor,v_move.inventory_batch_id);
  END LOOP;
 ELSIF NEW.status='cancelled' AND OLD.status IN ('confirmed','processing') THEN
  IF EXISTS(SELECT 1 FROM public.inventory_movements WHERE reference_type='order' AND reference_id=NEW.id AND movement_type='reserve' AND inventory_batch_id IS NULL) THEN
   RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='order reservation has no batch allocation'; END IF;
  PERFORM 1 FROM public.inventory_balances ib JOIN
   (SELECT DISTINCT product_id,warehouse_id FROM public.inventory_movements WHERE reference_type='order' AND reference_id=NEW.id AND movement_type='reserve') r
   ON r.product_id=ib.product_id AND r.warehouse_id=ib.warehouse_id ORDER BY ib.product_id,ib.warehouse_id FOR UPDATE OF ib;
  FOR v_move IN
   SELECT product_id,warehouse_id,inventory_batch_id,
          pg_catalog.sum(

COMMIT;
