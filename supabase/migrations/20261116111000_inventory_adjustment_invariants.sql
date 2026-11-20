BEGIN;

-- Enforce the balance invariants on the immutable adjustment record itself.
ALTER TABLE public.inventory_adjustments
  ADD CONSTRAINT inventory_adjustments_target_covers_reserved_check
  CHECK (new_quantity_on_hand >= reserved_quantity);

ALTER TABLE public.inventory_adjustments
  ADD CONSTRAINT inventory_adjustments_available_matches_target_check
  CHECK (quantity_available_after = new_quantity_on_hand - reserved_quantity);

COMMIT;
