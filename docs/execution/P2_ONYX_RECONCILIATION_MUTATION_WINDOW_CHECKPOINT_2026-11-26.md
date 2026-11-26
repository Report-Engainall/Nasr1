# P2 Checkpoint — Onyx Inventory Reconciliation Mutation Windows
Date: 2026-11-26
Repository: `Report-Engainall/Nasr1`
Role: P2 — database, inventory, transaction integrity and finance
Branch: `p2/onyx-reconciliation-mutation-window-pg17-20261126`
Base observed: `d2150d3d1595ccfaf3c16cca9faaff406d006c8b`
PR: pending creation; the PR head and exact-sha Actions evidence will be authoritative.

## Context already present on main
- `supabase/migrations/20261021100000_onyx_inventory_reconciliation_apply_rollback.sql` provides tenant-scoped preview/apply/compensating rollback, stable idempotency, immutable source manifest/hash, aggregate stock and reserved quantity snapshots, movement-count/freshness checks, append-only movements and audit.
- `supabase/migrations/20261126130000_onyx_stock_balance_as_of_guard.sql` binds the command and every source row to one immutable canonical UTC `as_of_date`; rejects stale movement/balance snapshots, malformed/future/mixed dates and legacy undated preview application.
- `supabase/tests/onyx_inventory_reconciliation_as_of_guard.sql` already tests fresh preview/apply/replay/rollback, stale-at-preview movement and balance rejection, mixed-date rejection, malformed/future date rejection, immutable source date and legacy undated preview refusal.
- Onyx ProductUnits, StockBalances and source-date PG17 workflows previously passed on main `69390c34f821ed137bd4426ddf097ef13d3fb14e`; those historical results are not transferable to this PR head.

## New acceptance expansion
Extend the existing isolated PostgreSQL 17 source-date acceptance to prove both mutation windows:
1. A warehouse stock receipt committed after preview but before apply must cause SQLSTATE `40001`; the Onyx apply must not overwrite the intervening stock movement.
2. A stock receipt committed after a successful Onyx apply must cause compensating rollback to fail with SQLSTATE `40001`; rollback must not overwrite that later movement.
3. For both denials, compare full before/after snapshots of balance rows, movement ledger, reconciliation command, reconciliation items and audit rows. The denied command must remain in its previous state (previewed / applied), with no extra movement or audit.

## Changed files
- `supabase/tests/onyx_inventory_reconciliation_as_of_guard.sql`
- `.github/workflows/onyx-inventory-asof-postgres17.yml` (checkpoint path included in push and pull_request triggers)
- `docs/execution/P2_ONYX_RECONCILIATION_MUTATION_WINDOW_CHECKPOINT_2026-11-26.md`

## Exact-SHA evidence
Pending execution of the dedicated `Onyx inventory source-date guard — PostgreSQL 17` workflow and the P2 local Supabase / Chromium workflow on the exact PR head. No PASS is claimed until the logs match the final SHA.
No hosted Supabase, production DB, live Onyx or WhatsApp request, deployment or paid service is used.

## Handoff
P2 owns this acceptance. P1 retains sole merge authority; P2 will not merge, close another role's PR, or edit the shared execution state / acceptance matrix.


## Current-main synchronization — 2026-11-27

- The first PR synchronization commit `c8816d51d0cebff5006bd43afec13a54575bd24d` incorporated main `f7473bfdf2972bc327ccaac1e41b713513797f0a`. PostgreSQL 17 Onyx acceptance passed on that exact PR head (run [45908084649](https://github.com/Report-Engainall/Nasr1/actions/runs/45908084649)); the public Chromium job in [45908084646](https://github.com/Report-Engainall/Nasr1/actions/runs/45908084646) was still running at last inspection.
- Main subsequently advanced to `2981c0d1facab554fac56293a19798eca642ff79`. The P2 branch was synchronized again with a normal two-parent commit `9ded806ab3657b2683aaa3dda7ad8f13b04734e1`, preserving the prior PR head as its second parent. The tree continues to contain only the three owned P2 files listed above; no production RPC/migration/RLS changes were introduced.
- The earlier `c8816d5` PASS is historical for that exact SHA and is **not** evidence for the new main-synchronized candidate. Exact-head PostgreSQL 17 and P2 browser reruns are required after this checkpoint refresh.
- Current main/P1 source is preserved. P2 has not merged this PR and has not modified the shared execution pointer or acceptance matrix.
