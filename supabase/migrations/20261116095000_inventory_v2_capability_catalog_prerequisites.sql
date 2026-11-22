-- Seed inventory V2 capability keys before the 20261116130000 scope migration.
-- The full Authorization V2 registry later upserts these records with canonical
-- metadata and role parity. This chronological seed prevents clean replay from
-- reaching the inventory backfill with an incomplete catalog.

BEGIN;

INSERT INTO public.authorization_capabilities (
  capability_key, domain, resource, action, sensitivity, scope_kind,
  approval_mode, separation_of_duties, state_requirements, legacy_operation_id
)
VALUES
  ('inventory.read_balance','inventory','stock_balance','read','inventory','warehouse','none',false,
   '{"requires_warehouse_assignment":true}',NULL),
  ('inventory.count.start','inventory','stock_count','start','inventory','warehouse','none',false,
   '{"requires_warehouse_assignment":true}',NULL),
  ('inventory.count.enter','inventory','stock_count','enter_count','inventory','warehouse','approval_required',false,
   '{"writes_draft_only":true}',NULL),
  ('inventory.count.finalize','inventory','stock_count','finalize','inventory','warehouse','maker_checker',true,
   '{"requires_review":true}',NULL),
  ('inventory.count.cancel','inventory','stock_count','cancel','inventory','warehouse','none',false,
   '{"requires_reason":true}',NULL),
  ('inventory.transfer.execute','inventory','inventory_transfer','execute','inventory','warehouse','approval_required',false,
   '{"requires_available_quantity":true}',NULL)
ON CONFLICT (capability_key) DO NOTHING;

COMMIT;
