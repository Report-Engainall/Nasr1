# P2 Execution Checkpoint — ERP Durable Checkpoint Store
Date: 2026-11-28
Repository: `Report-Engainall/Nasr1`
Owner: P2 — PostgreSQL 17, security, tenant isolation and transaction atomicity
Related delivery: PR #686 — existing P4 read-only connector branch
Base head before this P2 contribution: `6a5bd847f9c43eb5bae865c5d0690c9a3972e594`

## Delivered contract
- Three PostgreSQL RPCs remain the single persistence boundary consumed by P4: `load_erp_sync_checkpoint`, `persist_erp_sync_page_atomically`, and `reset_erp_sync_expired_cursor`.
- Only `service_role` receives EXECUTE. Anonymous/authenticated callers receive no EXECUTE; direct table privileges remain revoked. The Edge Function derives organization identity from the verified active profile before constructing the scope.
- Each checkpoint scope is keyed by provider + organization + ERP company + branch + warehouse + currency + object type. The SQL row binds the hash to each scope field to reject collisions or a mis-keyed caller.
- The page transaction checks exact page replay before version CAS, then stages allowlisted source projections, advances cursor/watermarks and writes the source receipt atomically. A failed receipt insert must roll back staged rows and checkpoint advancement.
- No operational stock, sales, invoice, receipt, payment or journal posting is permitted in the staging store.

## New exact-head acceptance additions
- Two PostgreSQL connections race the same page: one commit and one duplicate replay only.
- Two different pages race the same expected version: exactly one commit; the losing writer receives SQLSTATE 40001 without an extra receipt or staged row.
- Same external record identity is persisted independently across company, branch, warehouse and currency scopes; object type and provider create independent checkpoints.
- A test-only receipt trigger fails source-receipt insertion after the RPC has staged rows and advanced its checkpoint; the test asserts both effects roll back and removes the trigger/function in `finally`.
- Exact execution ACL assertions prove `anon` / `authenticated` cannot execute any store RPC and `service_role` can.
- Removed deprecated `auth.role()` checks from the three RPC bodies; their function EXECUTE grants enforce the service boundary directly.

## Files changed
- `supabase/migrations/20261128010000_erp_sync_durable_checkpoint_staging.sql` — server-only RPC execution boundary.
- `scripts/test-erp-sync-checkpoint-store.mjs` — isolated PostgreSQL 17 acceptance.
- `docs/bolt-source-reconciliation/API_OPS_CONTRACT_REGISTER_2026-10-24.md` — canonical RPC contract.
- `docs/execution/P2_ERP_SYNC_DURABLE_CHECKPOINT_STORE_2026-11-28.md` — P2-owned execution checkpoint.

## Acceptance boundary
The P2 PostgreSQL 17 suite is required on the exact resulting commit SHA. Queued, in-progress, skipped or previous-SHA results are not PASS. No hosted Supabase target was touched: the runtime database identity remains disputed. No ERP endpoint, live credential, financial write, inventory write, deployment or paid service was used.
