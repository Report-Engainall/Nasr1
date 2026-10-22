# P2 path ownership lock — order-input hardening acceptance wiring

- Date: 2026-10-22
- Repository: `Report-Engainall/Nasr1`
- Task: `SRC-011 / ORDER-INPUT-0011`
- Branch: `fix/p2-order-input-hardening-acceptance-20261022`
- Base SHA: `bf06c73226033da8e4f81e24981eb64e6e7fca99`
- Owner: P2
- Status: `TESTED_EXACT_SHA` — helper is now wired into the isolated PostgreSQL acceptance chain; no order RPC redesign was needed.

## Exact owned scope

- `scripts/test-database-migrations.mjs`: import the existing `runOrderInputHardeningAcceptance` helper and invoke it only after its fixed order/profile/product/address fixtures have been persisted. Changes are limited to a new top-level import and a call using separate PostgreSQL connections. Preserve any concurrent PR-specific fixtures and checks when reconciling.
- `scripts/test-order-input-hardening.mjs`: read/use the existing helper; alter only if an integration defect is demonstrated.
- The root connection, staff connection and customer connection must remain separate so authenticated `SET ROLE` state cannot leak between actors and root cleanup is not attempted under the authenticated role.

## Exclusions and collision avoidance

- Do not modify `package.json`, `.github/workflows/commerce-checks.yml`, `docs/bolt-source-reconciliation/WORK_COORDINATION.md`, the dynamic resume index, the acceptance matrix, or P1-owned reports/ledgers.
- PR #54 and PR #57 both have work on `scripts/test-database-migrations.mjs`. Their existing Auth/company-membership fixture cases must be preserved; this lock owns only the new order-input-helper import/invocation hunks. Before merging, reconcile both current branch versions rather than copying this file wholesale.
- Do not introduce a new schema, RPC, app, dependency or duplicate order workflow.

## Exact-SHA evidence

- Code SHA: `90d4b770f1f73b8eaf69521dafb6213cca682c44`
- PR: https://github.com/Report-Engainall/Nasr1/pull/58
- Core CI: **SUCCESS** — https://github.com/Report-Engainall/Nasr1/actions/runs/39852384604
- The action log contains the exact assertion output:
  `PASS order input hardening: customer+staff reject 24 invalid payloads (shape, row count, IDs, missing/fractional/out-of-range quantities, aggregate cap, inactive/cross-tenant products, and payment terms) with no persisted orders`.
- The same run's PostgreSQL migration/core workflow acceptance, unit tests, lint, build, preview smoke, dev-server smoke and browser price-visibility acceptance completed successfully.
- P2 Playwright public UI smoke and authenticated local-Supabase lifecycle are separate checks. The latter previously blocked on GHCR rate limiting; no authenticated order browser proof is claimed from the Core run.
- Requested independent P1 review is still required before merge. Do not merge this test-harness change while PR #54/#57 fixture edits remain unintegrated; preserve each scoped hunk when reconciling.

## Acceptance required

- Demonstrate from current source that the helper was previously absent from the active test chain.
- Run the invalid-payload acceptance against isolated PostgreSQL 17 using the existing customer/staff order RPCs.
- Prove all 24 invalid payload cases are rejected and none persists an order or idempotency key.
- Re-run the full exact-SHA Core CI. Authenticated browser and production proof remain separate claims.
