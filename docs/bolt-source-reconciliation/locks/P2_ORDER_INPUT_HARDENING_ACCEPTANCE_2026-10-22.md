# P2 path ownership lock — order-input hardening acceptance wiring

- Date: 2026-10-22
- Repository: `Report-Engainall/Nasr1`
- Task: `SRC-011 / ORDER-INPUT-0011`
- Branch: `fix/p2-order-input-hardening-acceptance-20261022`
- Base SHA: `bf06c73226033da8e4f81e24981eb64e6e7fca99`
- Owner: P2
- Status: active — wire an existing unused PostgreSQL acceptance helper into the current database test harness; do not redesign order RPCs unless a test proves a defect.

## Exact owned scope

- `scripts/test-database-migrations.mjs`: import the existing `runOrderInputHardeningAcceptance` helper and invoke it only after its fixed order/profile/product/address fixtures have been persisted. Changes are limited to a new top-level import and a call using separate PostgreSQL connections. Preserve any concurrent PR-specific fixtures and checks when reconciling.
- `scripts/test-order-input-hardening.mjs`: read/use the existing helper; alter only if an integration defect is demonstrated.
- The root connection, staff connection and customer connection must remain separate so authenticated `SET ROLE` state cannot leak between actors and root cleanup is not attempted under the authenticated role.

## Exclusions and collision avoidance

- Do not modify `package.json`, `.github/workflows/commerce-checks.yml`, `docs/bolt-source-reconciliation/WORK_COORDINATION.md`, the dynamic resume index, the acceptance matrix, or P1-owned reports/ledgers.
- PR #54 and PR #57 both have work on `scripts/test-database-migrations.mjs`. Their existing Auth/company-membership fixture cases must be preserved; this lock owns only the new order-input-helper import/invocation hunks. Before merging, reconcile both current branch versions rather than copying this file wholesale.
- Do not introduce a new schema, RPC, app, dependency or duplicate order workflow.

## Acceptance required

- Demonstrate from current source that the helper was previously absent from the active test chain.
- Run the invalid-payload acceptance against isolated PostgreSQL 17 using the existing customer/staff order RPCs.
- Prove all 24 invalid payload cases are rejected and none persists an order or idempotency key.
- Re-run the full exact-SHA Core CI. Authenticated browser and production proof remain separate claims.
