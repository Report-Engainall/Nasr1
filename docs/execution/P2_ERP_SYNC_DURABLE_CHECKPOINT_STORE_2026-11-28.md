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

## 2026-11-28 — P2 acceptance harness root-cause repair

- The PostgreSQL 17 acceptance script previously constructed `baseScope` at module initialization from `organizationA`, while `organizationA` was assigned only after querying the disposable database. The scope therefore retained `undefined` and `scopeKey()` failed before exercising the persistence RPCs.
- Moved `baseScope` construction directly after the two distinct active tenant IDs are resolved, added an explicit pre-fingerprint guard and asserted that the two fixtures are distinct.
- Fixed `stagedRecord()` to honor its existing fourth `externalId` argument and include that identity in its deterministic idempotency digest. The old helper silently discarded supplied external IDs, weakening duplicate-identity assertions.
- Added an empty-page regression: an identical page fingerprint/response digest commits independently in two warehouse/currency scopes, creating one zero-record receipt per scope and no synthetic staged records.
- No production SQL rule, P2 RPC contract, ERP transport, inventory/financial posting or external connection was changed. Re-run the full isolated PostgreSQL 17 acceptance on the resulting exact SHA; no earlier run transfers.

## 2026-11-28 — Reject future-dated ERP source records and watermarks

- Closed a durable-cursor integrity gap at both layers. The P4 TypeScript projector rejects a provider record whose `source_updated_at` is later than the injected server clock. The PostgreSQL `persist_erp_sync_page_atomically` RPC repeats this validation for every canonical record and also rejects future pending/completed watermarks before it locks or mutates a checkpoint.
- This prevents an ahead-of-time provider timestamp from becoming the staged "latest" record and suppressing subsequent valid updates under source-timestamp conflict ordering. SQLSTATE `22023` is raised before checkpoint, staged-record, receipt, outcome or cursor writes.
- Acceptance additions in `scripts/test-erp-sync-checkpoint-store.mjs` verify both future-record and future-completed-watermark rejection with checkpoint version, staged-row count and page-receipt count unchanged. `readonly-sync.test.ts` injects a deterministic clock and verifies the adapter rejects a future record.
- Code-bearing pre-change head: `5fd4fef5066817d380be85b4b396d4013ec005b6`. Exact new-head Vitest/strict-TypeScript and P2 PostgreSQL 17 / critical-path acceptance must complete; previous queued results are not transferable. No ERP endpoint, production database, secret, financial ledger or inventory row was accessed or changed.
