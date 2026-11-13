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
