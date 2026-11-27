# P2 Checkpoint — Inventory Transfer Endpoint Replay Guard
Date: 2026-11-27
Repository: `Report-Engainall/Nasr1`
Role: P2 — inventory transaction integrity, PostgreSQL 17 acceptance, idempotency and tenant isolation

## Reconciliation
- Current `main` at branch synchronization: `317ebca76c4d236a1d0efe0fd5934b028598c72b`.
- Existing PR retained: #602 — `https://github.com/Report-Engainall/Nasr1/pull/602`.
- Original PR head preserved as the second parent of the synchronization commit: `6a75370d2b98ab4a9cdb021f3486184d55b6d5ad`.
- The current `main` tree is the first parent; no force-push or history rewrite is used.
- Only the unique acceptance assets from the old branch are retained: the endpoint-replay SQL test, the existing focused inventory PG17 workflow update, and this P2 checkpoint.

## Existing production contract under test
- Migration: `supabase/migrations/20261126110000_inventory_transfer_replay_endpoint_guard.sql`.
- Both `transfer_inventory` and `transfer_inventory_batch` lock and validate exactly two active warehouses in the actor's organization before acquiring the idempotency lock and looking up a previous result.
- This change does not modify the production migration, RPC implementation, RLS, grants, user data or inventory balances.

## PostgreSQL 17 acceptance added
- Execute the actual production migration against disposable PostgreSQL 17 relations.
- Verify source-code ordering of the tenant scope guard, active same-organization endpoint locks, endpoint-count check, replay lock and replay lookup for both RPCs.
- For single-product and multi-product transfers, prove initial posting and exact retry while endpoints remain valid.
- Prove a replay is denied after endpoint deactivation or reassignment to another organization.
- Compare before/after snapshots to prove denied retries do not change balances, lots, transfer rows, batch items, movements or audit counts.
- Verify FEFO lot ancestry, expiry/receipt/cost lineage, paired source/destination movements and reserved-stock preservation.
- Run the test through the existing `.github/workflows/inventory-balance-adjustment-pg17.yml` workflow in a separate disposable database.

## Scope and safety
- No production database or hosted Supabase access.
- No production writes, deployed migrations, secrets, external APIs, paid services or new dependencies.
- No new workflow: the existing focused PostgreSQL 17 workflow is extended.
- No source transaction logic changed; this is missing exact-runtime acceptance for an already-present production guard.

## Acceptance state
- Status at this checkpoint creation: `PENDING` exact-head PostgreSQL 17 workflow run.
- PASS will be recorded only after the workflow completes on the exact resulting branch SHA.
- Hosted/production behavior is not inferred from disposable PostgreSQL acceptance.
- P2 owns this checkpoint and evidence; P1 remains the only merger to `main`.

## Next action
- Inspect the synchronized PR diff, then evaluate the exact-head GitHub Actions result. On failure, diagnose and update this checkpoint before changing any production SQL.
