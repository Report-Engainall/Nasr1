BEGIN;

ALTER TABLE public.onyx_inventory_reconciliation_items
  ADD COLUMN baseline_batch_manifest jsonb,
  ADD COLUMN applied_batch_manifest jsonb;

CREATE OR REPLACE FUNCTION public.get_onyx_inventory_batch_manifest(
  p_organization_id uuid,
  p_product_id uuid,
  p_warehouse_id uuid
)
RETURNS jsonb
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path=''
AS $function$
  SELECT coalesce(pg_catalog.jsonb_agg(l.row_value ORDER BY l.id),'[]'::jsonb)
    FROM (
      SELECT b.id,pg_catalog.to_jsonb(b) AS row_value
        FROM public.inventory_batches b
        JOIN public.products p
          ON p.id=b.product_id AND p.organization_id=b.organization_id
        JOIN public.warehouses w
          ON w.id=b.warehouse_id AND w.organization_id=b.organization_id
       WHERE b.organization_id=p_organization_id
         AND b.product_id=p_product_id
         AND b.warehouse_id=p_warehouse_id
       ORDER BY b.id
       FOR UPDATE OF b
    ) AS l
$function$;

REVOKE ALL ON FUNCTION public.get_onyx_inventory_batch_manifest(uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.capture_onyx_inventory_batch_manifests()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_warehouse_id uuid;
  v_manifest jsonb;
  v_validated_item_id text;
BEGIN
  IF TG_OP='INSERT' THEN
    SELECT c.warehouse_id INTO v_warehouse_id
      FROM public.onyx_inventory_reconciliation_commands c
     WHERE c.id=NEW.command_id
       AND c.organization_id=NEW.organization_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='42501',
        MESSAGE='Onyx batch manifest requires a current tenant reconciliation command';
    END IF;
    NEW.baseline_batch_manifest:=public.get_onyx_inventory_batch_manifest(
      NEW.organization_id,NEW.product_id,v_warehouse_id
    );
    NEW.applied_batch_manifest:=NULL;
    RETURN NEW;
  END IF;

  IF NEW.applied_delta IS DISTINCT FROM OLD.applied_delta
     OR NEW.applied_quantity_on_hand IS DISTINCT FROM OLD.applied_quantity_on_hand THEN
    IF OLD.baseline_batch_manifest IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='55000',
        MESSAGE='Onyx preview predates FEFO batch manifests; create a fresh preview before applying';
    END IF;

    IF coalesce(NEW.applied_delta,0)<>0 THEN
      v_validated_item_id:=NULLIF(
        pg_catalog.current_setting('nasr.onyx_reconciliation.validated_item_id',true),''
      );
      IF v_validated_item_id IS DISTINCT FROM NEW.id::text THEN
        RAISE EXCEPTION USING ERRCODE='55000',
          MESSAGE='Onyx stock application did not validate the original FEFO batch manifest';
      END IF;
    ELSE
      SELECT c.warehouse_id INTO v_warehouse_id
        FROM public.onyx_inventory_reconciliation_commands c
       WHERE c.id=NEW.command_id
         AND c.organization_id=NEW.organization_id;
      v_manifest:=public.get_onyx_inventory_batch_manifest(
        NEW.organization_id,NEW.product_id,v_warehouse_id
      );
      IF v_manifest IS DISTINCT FROM OLD.baseline_batch_manifest THEN
        RAISE EXCEPTION USING ERRCODE='40001',
          MESSAGE='FEFO batch distribution changed after Onyx preview; create a new preview';
      END IF;
    END IF;

    SELECT c.warehouse_id INTO v_warehouse_id
      FROM public.onyx_inventory_reconciliation_commands c
     WHERE c.id=NEW.command_id
       AND c.organization_id=NEW.organization_id;
    NEW.applied_batch_manifest:=public.get_onyx_inventory_batch_manifest(
      NEW.organization_id,NEW.product_id,v_warehouse_id
    );
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.capture_onyx_inventory_batch_manifests()
  FROM PUBLIC,anon,authenticated;

CREATE TRIGGER onyx_inventory_item_batch_manifest_capture
  BEFORE INSERT OR UPDATE OF applied_delta,applied_quantity_on_hand
  ON public.onyx_inventory_reconciliation_items
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_onyx_inventory_batch_manifests();

CREATE OR REPLACE FUNCTION public.guard_onyx_inventory_batch_manifest_balance_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_apply_command_text text;
  v_rollback_command_text text;
  v_command_id uuid;
  v_item public.onyx_inventory_reconciliation_items%ROWTYPE;
  v_warehouse_id uuid;
  v_manifest jsonb;
BEGIN
  v_apply_command_text:=NULLIF(
    pg_catalog.current_setting('nasr.onyx_reconciliation.apply_command_id',true),''
  );
  v_rollback_command_text:=NULLIF(
    pg_catalog.current_setting('nasr.onyx_reconciliation.rollback_command_id',true),''
  );

  IF v_apply_command_text IS NOT NULL THEN
    v_command_id:=v_apply_command_text::uuid;
    SELECT i.*
      INTO v_item
      FROM public.onyx_inventory_reconciliation_items i
      JOIN public.onyx_inventory_reconciliation_commands c
        ON c.id=i.command_id AND c.organization_id=i.organization_id
     WHERE c.id=v_command_id
       AND c.status='previewed'
       AND i.product_id=NEW.product_id
       AND c.warehouse_id=NEW.warehouse_id
     FOR UPDATE OF i;
    IF FOUND THEN
      v_warehouse_id:=NEW.warehouse_id;
      IF OLD.quantity_on_hand IS DISTINCT FROM v_item.baseline_quantity_on_hand
         OR OLD.quantity_reserved IS DISTINCT FROM v_item.baseline_quantity_reserved
         OR NEW.quantity_on_hand IS DISTINCT FROM v_item.source_quantity
         OR NEW.quantity_reserved IS DISTINCT FROM v_item.baseline_quantity_reserved THEN
        RAISE EXCEPTION USING ERRCODE='40001',
          MESSAGE='aggregate stock changed outside the Onyx preview baseline';
      END IF;
      IF v_item.baseline_batch_manifest IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='55000',
          MESSAGE='Onyx preview predates FEFO batch manifests; create a fresh preview before applying';
      END IF;
      v_manifest:=public.get_onyx_inventory_batch_manifest(
        v_item.organization_id,v_item.product_id,v_warehouse_id
      );
      IF v_manifest IS DISTINCT FROM v_item.baseline_batch_manifest THEN
        RAISE EXCEPTION USING ERRCODE='40001',
          MESSAGE='FEFO batch quantities or expiry lineage changed after Onyx preview';
      END IF;
      PERFORM pg_catalog.set_config(
        'nasr.onyx_reconciliation.validated_item_id',v_item.id::text,true
      );
    END IF;
    RETURN NEW;
  END IF;

  IF v_rollback_command_text IS NOT NULL THEN
    v_command_id:=v_rollback_command_text::uuid;
    SELECT i.*
      INTO v_item
      FROM public.onyx_inventory_reconciliation_items i
      JOIN public.onyx_inventory_reconciliation_commands c
        ON c.id=i.command_id AND c.organization_id=i.organization_id
     WHERE c.id=v_command_id
       AND c.status='applied'
       AND i.product_id=NEW.product_id
       AND c.warehouse_id=NEW.warehouse_id
     FOR UPDATE OF i;
    IF FOUND THEN
      v_warehouse_id:=NEW.warehouse_id;
      IF OLD.quantity_on_hand IS DISTINCT FROM v_item.applied_quantity_on_hand
         OR OLD.quantity_reserved IS DISTINCT FROM v_item.applied_quantity_reserved
         OR NEW.quantity_on_hand IS DISTINCT FROM v_item.baseline_quantity_on_hand
         OR NEW.quantity_reserved IS DISTINCT FROM v_item.baseline_quantity_reserved THEN
        RAISE EXCEPTION USING ERRCODE='40001',
          MESSAGE='Onyx rollback balance transition does not match the immutable applied manifest';
      END IF;
      IF v_item.baseline_batch_manifest IS NULL OR v_item.applied_batch_manifest IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='55000',
          MESSAGE='Applied Onyx command has no FEFO batch manifests; rollback requires manual review';
      END IF;
      v_manifest:=public.get_onyx_inventory_batch_manifest(
        v_item.organization_id,v_item.product_id,v_warehouse_id
      );
      IF v_manifest IS DISTINCT FROM v_item.applied_batch_manifest THEN
        RAISE EXCEPTION USING ERRCODE='40001',
          MESSAGE='FEFO batches changed after Onyx apply; compensating rollback was denied';
      END IF;
      PERFORM pg_catalog.set_config(
        'nasr.onyx_reconciliation.validated_item_id',v_item.id::text,true
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.guard_onyx_inventory_batch_manifest_balance_write()
  FROM PUBLIC,anon,authenticated;

CREATE TRIGGER onyx_inventory_batch_manifest_balance_guard
  BEFORE UPDATE OF quantity_on_hand,quantity_reserved
  ON public.inventory_balances
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_onyx_inventory_batch_manifest_balance_write();

CREATE OR REPLACE FUNCTION public.guard_onyx_inventory_batch_manifest_rollback_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_warehouse_id uuid;
  v_manifest jsonb;
  v_validated_item_id text;
BEGIN
  IF OLD.rolled_back_at IS NOT NULL OR NEW.rolled_back_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.baseline_batch_manifest IS NULL OR OLD.applied_batch_manifest IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='Applied Onyx command has no FEFO batch manifests; rollback requires manual review';
  END IF;

  IF coalesce(OLD.applied_delta,0)<>0 THEN
    v_validated_item_id:=NULLIF(
      pg_catalog.current_setting('nasr.onyx_reconciliation.validated_item_id',true),''
    );
    IF v_validated_item_id IS DISTINCT FROM OLD.id::text THEN
      RAISE EXCEPTION USING ERRCODE='55000',
        MESSAGE='Onyx rollback did not validate the applied FEFO batch manifest';
    END IF;
  ELSE
    SELECT c.warehouse_id INTO v_warehouse_id
      FROM public.onyx_inventory_reconciliation_commands c
     WHERE c.id=OLD.command_id AND c.organization_id=OLD.organization_id;
    v_manifest:=public.get_onyx_inventory_batch_manifest(
      OLD.organization_id,OLD.product_id,v_warehouse_id
    );
    IF v_manifest IS DISTINCT FROM OLD.applied_batch_manifest THEN
      RAISE EXCEPTION USING ERRCODE='40001',
        MESSAGE='FEFO batch quantities changed after zero-delta Onyx apply';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.guard_onyx_inventory_batch_manifest_rollback_item()
  FROM PUBLIC,anon,authenticated;

CREATE TRIGGER onyx_inventory_batch_manifest_rollback_guard
  BEFORE UPDATE OF rolled_back_at
  ON public.onyx_inventory_reconciliation_items
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_onyx_inventory_batch_manifest_rollback_item();

CREATE OR REPLACE FUNCTION public.restore_onyx_inventory_batch_manifest()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_warehouse_id uuid;
  v_batch record;
  v_on_hand numeric(15,3);
  v_reserved numeric(15,3);
BEGIN
  IF OLD.rolled_back_at IS NOT NULL OR NEW.rolled_back_at IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT c.warehouse_id INTO v_warehouse_id
    FROM public.onyx_inventory_reconciliation_commands c
   WHERE c.id=NEW.command_id AND c.organization_id=NEW.organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='Onyx rollback warehouse is unavailable for batch restoration';
  END IF;

  FOR v_batch IN
    SELECT x.id,x.quantity_on_hand,x.quantity_reserved
      FROM pg_catalog.jsonb_to_recordset(NEW.baseline_batch_manifest)
        AS x(id uuid,quantity_on_hand numeric(15,3),quantity_reserved numeric(15,3))
     ORDER BY x.id
  LOOP
    UPDATE public.inventory_batches b
       SET quantity_on_hand=v_batch.quantity_on_hand,
           quantity_reserved=v_batch.quantity_reserved
     WHERE b.id=v_batch.id
       AND b.organization_id=NEW.organization_id
       AND b.product_id=NEW.product_id
       AND b.warehouse_id=v_warehouse_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='55000',
        MESSAGE='An original Onyx FEFO batch disappeared; exact restoration was refused';
    END IF;
  END LOOP;

  -- Keep zero-quantity rows for lineage; never delete a lot that may be referenced by
  -- an immutable movement. Remove only the Onyx-created quantity from non-baseline lots.
  UPDATE public.inventory_batches b
     SET quantity_on_hand=0,quantity_reserved=0
   WHERE b.organization_id=NEW.organization_id
     AND b.product_id=NEW.product_id
     AND b.warehouse_id=v_warehouse_id
     AND NOT EXISTS (
       SELECT 1
         FROM pg_catalog.jsonb_array_elements(NEW.baseline_batch_manifest) AS original(value)
        WHERE original.value->>'id'=b.id::text
     );

  SELECT coalesce(pg_catalog.sum(b.quantity_on_hand),0)::numeric(15,3),
         coalesce(pg_catalog.sum(b.quantity_reserved),0)::numeric(15,3)
    INTO v_on_hand,v_reserved
    FROM public.inventory_batches b
   WHERE b.organization_id=NEW.organization_id
     AND b.product_id=NEW.product_id
     AND b.warehouse_id=v_warehouse_id;
  IF v_on_hand IS DISTINCT FROM NEW.baseline_quantity_on_hand
     OR v_reserved IS DISTINCT FROM NEW.baseline_quantity_reserved THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='Restored FEFO batch totals do not match the original Onyx stock baseline';
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.restore_onyx_inventory_batch_manifest()
  FROM PUBLIC,anon,authenticated;

CREATE TRIGGER onyx_inventory_batch_manifest_restore
  AFTER UPDATE OF rolled_back_at
  ON public.onyx_inventory_reconciliation_items
  FOR EACH ROW
  EXECUTE FUNCTION public.restore_onyx_inventory_batch_manifest();

-- Hide the unwrapped production commands so callers cannot bypass the manifest guards.
ALTER FUNCTION public.apply_onyx_inventory_reconciliation(uuid,text)
  RENAME TO apply_onyx_inventory_reconciliation_unwrapped;
REVOKE ALL ON FUNCTION public.apply_onyx_inventory_reconciliation_unwrapped(uuid,text)
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.apply_onyx_inventory_reconciliation(
  p_command_id uuid,p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
BEGIN
  PERFORM pg_catalog.set_config(
    'nasr.onyx_reconciliation.apply_command_id',coalesce(p_command_id::text,''),true
  );
  PERFORM pg_catalog.set_config(
    'nasr.onyx_reconciliation.rollback_command_id','',true
  );
  PERFORM pg_catalog.set_config(
    'nasr.onyx_reconciliation.validated_item_id','',true
  );
  RETURN public.apply_onyx_inventory_reconciliation_unwrapped(
    p_command_id,p_idempotency_key
  );
END
$function$;

REVOKE ALL ON FUNCTION public.apply_onyx_inventory_reconciliation(uuid,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_onyx_inventory_reconciliation(uuid,text)
  TO authenticated;

ALTER FUNCTION public.rollback_onyx_inventory_reconciliation(uuid,text,text)
  RENAME TO rollback_onyx_inventory_reconciliation_unwrapped;
REVOKE ALL ON FUNCTION public.rollback_onyx_inventory_reconciliation_unwrapped(uuid,text,text)
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.rollback_onyx_inventory_reconciliation(
  p_command_id uuid,p_idempotency_key text,p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
BEGIN
  PERFORM pg_catalog.set_config(
    'nasr.onyx_reconciliation.rollback_command_id',coalesce(p_command_id::text,''),true
  );
  PERFORM pg_catalog.set_config(
    'nasr.onyx_reconciliation.apply_command_id','',true
  );
  PERFORM pg_catalog.set_config(
    'nasr.onyx_reconciliation.validated_item_id','',true
  );
  RETURN public.rollback_onyx_inventory_reconciliation_unwrapped(
    p_command_id,p_idempotency_key,p_reason
  );
END
$function$;

REVOKE ALL ON FUNCTION public.rollback_onyx_inventory_reconciliation(uuid,text,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rollback_onyx_inventory_reconciliation(uuid,text,text)
  TO authenticated;

COMMENT ON COLUMN public.onyx_inventory_reconciliation_items.baseline_batch_manifest IS
  'Immutable FEFO lot subledger at preview time; preserves exact lot IDs, expiry and source metadata for compensating rollback.';
COMMENT ON COLUMN public.onyx_inventory_reconciliation_items.applied_batch_manifest IS
  'Immutable FEFO lot subledger after the Onyx aggregate update and batch synchronization triggers completed.';
COMMENT ON FUNCTION public.get_onyx_inventory_batch_manifest(uuid,uuid,uuid) IS
  'Private, deterministic row-locked snapshot of every tenant/product/warehouse FEFO batch row.';
COMMENT ON FUNCTION public.apply_onyx_inventory_reconciliation(uuid,text) IS
  'Manager/admin Onyx apply with an exact pre-apply FEFO manifest check and post-trigger applied manifest capture.';
COMMENT ON FUNCTION public.rollback_onyx_inventory_reconciliation(uuid,text,text) IS
  'Manager/admin compensating rollback restores the exact pre-apply FEFO lot quantities and expiry lineage; later or unrecorded lot changes fail closed.';

COMMIT;
