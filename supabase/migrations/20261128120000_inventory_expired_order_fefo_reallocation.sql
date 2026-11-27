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
