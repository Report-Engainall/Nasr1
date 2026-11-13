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
