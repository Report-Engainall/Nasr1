# Merchant and Intelligence Roadmap

**Date:** 2026-11-13  
**Target:** `Report-Engainall/Nasr1` / `main`  
**Base HEAD:** `55da486475112466e0f456a953ba998daa11acfe`

## Existing capability families preserved

The current administration navigation is defined through `ADMIN_NAV_GROUPS` in `src/lib/admin-access-matrix.ts` and contains six groups: executive, sales, catalog, supply, operations and administration. Dashboard group cards are generated from these definitions and filtered by the current role.

Existing modules include the unified import engine and batch history, Onyx snapshots and inventory reconciliation, product/category/pricing/promotion management, customer 360 and service desk, purchase orders, stock count, inventory transfers, finance workspaces, intelligence workspace, liquidity command center, daily decision board and replenishment recommendations.

## Delivery state

| Area | Current evidence | Decision |
|---|---|---|
| Dashboard group navigation | `ADMIN_NAV_GROUPS` + `getVisibleAdminNavigationGroups` + tests | Preserve; no parallel navigation registry |
| Category hierarchy | `AdminCategoryTree`, `parent_id`, category route and unit tests | Implemented on main; do not rebuild |
| Import and batch history | `DataCenter` routes to `UnifiedImportEngine` with upload/history sections | Implemented as one engine; improve discoverability only when needed |
| Onyx snapshot / analysis / reconciliation | Existing Onyx components and DataCenter entry points | Keep distinct operation semantics; don't label dry-run as live sync |
| AI prompt persistence / AI audit / health / architecture / developer patches | Owned by isolated Path B under Issue #422 | Do not duplicate or edit Path B directories from this Path A delivery |
| Storefront product-card accessibility | `Storefront.tsx` update and component test in this change | Implemented as a focused customer-facing improvement |

## Remaining execution rule

For every proposed merchant or intelligence capability, compare the navigation item, screen, service, RPC/table, tenant policy and action before adding anything. If a durable source or permission contract is absent, record the blocker rather than synthesizing data. The present change introduces no schema, RPC, RLS or provider dependency.


## Execution checkpoint — 2026-11-13

| Capability | Current code evidence | Current proof / blocker | State |
|---|---|---|---|
| Customer storefront product card | `src/components/Storefront.tsx`; `Storefront.product-grid.test.tsx` | Product actions are keyboard/touch accessible; inventory unknown/zero distinction has regression coverage in this commit. | Implemented in code; current commit CI pending |
| Unified finance/liquidity | `ExecutiveLiquidityCommandCenter`, `executive-liquidity-client`, migrations for opening cash/bank reconciliation and aging snapshots | Latest isolated P2 pipeline failed before price-grid assertions because the seeded manager profile was not resolvable through the authenticated context. Do not weaken RLS. | Existing implementation; local acceptance blocked |
| Daily decisions | `DailyDecisionBoard`, decision outcome client and decision memory migration | Code modules exist; end-to-end ownership/action/outcome validation not proven by the current P2 run. | Existing implementation; acceptance incomplete |
| Replenishment | Replenishment client/card and `20261105230000_intelligence_replenishment_open_purchase_orders.sql` plus later shipment/sales reconciliation migration | Deterministic recommendation engine exists; purchase execution remains separately authorized. | Existing implementation; full workflow acceptance pending |
| Returned-order amendment history | Customer amendment components and migrations `20261106260000`–`20261106300000` | Versioned history and idempotency guards exist in SQL; full customer/admin browser acceptance is not proven by the current run. | Existing implementation; acceptance incomplete |

The latest P2 local PostgreSQL job applied migrations and seeded users, then failed in `scripts/test-price-grid-atomicity.mjs` while resolving the manager's profile/organization context: `current_profile_id()` and `current_organization_id()` returned null under the authenticated test role. The same diagnostic showed the direct profile SELECT saw zero rows under current RLS policies. This is an authorization/context blocker, not a reason to relax tenant isolation. Dependent finance/order/browser steps were skipped.

No statement above claims that a UI module alone completes its backend workflow.


## Verified CI proof boundary — 2026-11-13 (supersedes pending note above)

The exact source commit `7ca17dd3e26bf39d65baf0d021f3e80a89e20973` contains the storefront stock-evidence correction and product-card accessibility updates.

- P1 Admin Context Verification: **PASS** — 71 Vitest files / 543 tests passed; strict TypeScript and production builds passed. Run: https://github.com/Report-Engainall/Nasr1/actions/runs/43337456908
- P2 public read-only storefront browser smoke: **PASS**. P2 Authenticated E2E infrastructure gate: **PASS**.
- P2 full authenticated customer-order/tenant-isolation job: **SKIPPED** because external E2E credentials were not configured.
- P2 isolated PostgreSQL price-grid transaction test: **FAIL** at the test identity precondition. Migrations, isolated local services and fixture seeding passed; the manager session returned null from the current profile/organization resolvers and direct profile visibility was zero under the current authenticated RLS context. Price write, cash expense, purchase receipt and dependent browser tests were skipped. Run: https://github.com/Report-Engainall/Nasr1/actions/runs/43337456921
- A follow-up diagnostic commit `f2ee05cea0d1bd5dc8c651e880af241ed421e9f9` compares tenant helper behavior across session roles. Its P2 run `43338497902` was still executing migrations at the last observation. This is not an acceptance result.

The earlier row label “current commit CI pending” should be read with this exact-SHA proof: P1 and read-only UI smoke passed; authenticated database/order acceptance did not.


## Corrected P2 session-context diagnosis — 2026-11-13

The diagnostic rerun on `f2ee05cea0d1bd5dc8c651e880af241ed421e9f9` completed and reproduced the failure. The manager profile and organization were present and visible to the privileged connection. The fixture had manually set only `sub/email/role`, without a real Supabase `session_id` claim and matching `auth.sessions` row. Since `current_profile_id()` intentionally requires that live session row, the helper returned null. This is a test-fixture defect; no RLS relaxation or production database change is justified.

- Commit `4ba82b8796334bf84f47e911183b0581d01ee326` changed the test to obtain password-authenticated JWT claims from the isolated local Supabase Auth endpoint, and to verify the matching active `auth.sessions` row.
- Commit `482d1774318a1e19cc22a414e189640cb7c3bc41` added explicit profile/organization/session assertions before and after `SET ROLE authenticated`.
- P2 run `43339928481` targets `482d177...`. At the last check, its read-only public storefront smoke was in progress; the dedicated external customer-order E2E remained skipped because credentials were not supplied. No result is claimed for the local PostgreSQL acceptance until that job completes.

Run links:
- Diagnostic fixture failure: https://github.com/Report-Engainall/Nasr1/actions/runs/43338497902
- Session-bound fixture run: https://github.com/Report-Engainall/Nasr1/actions/runs/43339928481
