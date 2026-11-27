# P2 Checkpoint — Inventory Transfer Endpoint Replay Guard
Date: 2026-11-27
Repository: `Report-Engainall/Nasr1`
Role: P2 — inventory transaction integrity, PostgreSQL 17 acceptance, idempotency and tenant isolation
PR: #602 — https://github.com/Report-Engainall/Nasr1/pull/602
Branch: `p2/inventory-transfer-replay-endpoint-pg17-20261126`

## Existing production contract under test
- Migration: `supabase/migrations/20261126110000_inventory_transfer_replay_endpoint_guard.sql` (already present on `main`; this PR does not modify the migration).
- Both `transfer_inventory` and `transfer_inventory_batch` lock and validate exactly two active warehouses in the actor's organization before acquiring the idempotency lock and looking up a previous result.
- `FOR SHARE` locks keep both active endpoints stable until the transfer/replay transaction ends.
- This PR adds exact runtime acceptance only: no production migration, RPC implementation, RLS, grants, business rows or inventory balances are changed.

## Exact-head acceptance — 2026-11-27
- Tested PR head: `7dba1abd7b2ed2a4ee136e570c6c350b2fe09ac5`.
- P1 [run 45925626875](https://github.com/Report-Engainall/Nasr1/actions/runs/45925626875): **SUCCESS** — Vitest and strict TypeScript.
- Dedicated Inventory PostgreSQL 17 [run 45925626762](https://github.com/Report-Engainall/Nasr1/actions/runs/45925626762): **SUCCESS**; job [140266153289](https://github.com/Report-Engainall/Nasr1/actions/runs/45925626762/job/140266153289) completed all 10 steps.
  - Existing inventory-balance adjustment acceptance: PASS.
  - Existing transfer scope-before-replay acceptance: PASS.
  - New endpoint replay/single+batch/FEFO lineage acceptance: PASS. The exact log prints `inventory transfer endpoint replay guard PostgreSQL 17 acceptance: PASS`.
- P2 [run 45925626852](https://github.com/Report-Engainall/Nasr1/actions/runs/45925626852): **SUCCESS**.
- Local authenticated Supabase/PostgreSQL 17 job [140267186123](https://github.com/Report-Engainall/Nasr1/actions/runs/45925626852/job/140267186123): **SUCCESS**, 65 successful completed steps, zero failures; full migration replay and connected commerce/finance/inventory/FEFO/Onyx/browser acceptance completed.
- Public Chromium read-only smoke: **SUCCESS**. Hosted customer/order/tenant E2E: **SKIPPED**, not PASS.

## Verified behaviors
- The actual production migration is applied to disposable PostgreSQL 17.
- Source-order assertions verify scope, active same-tenant warehouse lookup, both endpoint locks, endpoint count, replay lock, then replay lookup for both RPCs.
- Single transfer and batch transfer create one transfer on first execution and return exact replay while both endpoints remain valid.
- Retry is denied after destination deactivation and after source reassignment to another tenant.
- Before/after snapshots prove denials do not change balances, lots, transfer rows, batch items, movements or audit count.
- FEFO lineage, expiry/receipt/cost metadata, destination-child lot ancestry, paired movements and reserved-stock preservation are asserted.

## Current integration boundary
- Latest observed `main`: `85331656b51825e0e1316f31faff644a09c58602`; merge base is `e2486a04d1ce4094f94fce8b5a8a19e1c35bf361`.
- PR #602 remains open and GitHub reports it mergeable. The latest compare is **19 commits ahead / 1 behind**, with exactly three changed paths relative to current `main`: the existing inventory PG17 workflow, this checkpoint, and the endpoint-replay SQL test.
- P1 owns synchronization with latest `main`, scoped diff review, exact-head reruns on the synchronized head, and the merge. P2 does not merge to `main`.
- Do not carry the above test results to a post-sync SHA without rerunning the dedicated Inventory PG17 workflow on that exact SHA.

## Safety and open-source reference
- All test writes run in disposable PostgreSQL 17 CI only.
- No hosted/production Supabase access, production data writes, deployment, secrets, external APIs, paid services or new dependencies.
- Existing shared open-source catalog/licence decisions were read; no external code, package, asset or parallel inventory service was added.
- Next session should read this checkpoint first and not repeat the broad OSS candidate search unless a concrete unmet gap is found.
