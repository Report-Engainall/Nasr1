# Aghbari Commerce — Response-Time Optimization Checkpoint

- Repository: `Report-Engainall/Nasr1`
- Branch: `main`
- Code-bearing SHA verified by GitHub Actions: `9193f88b04b0681c539db735d649e4103949277b`
- Workflow: [P1 Admin Context Verification — run 43109175708](https://github.com/Report-Engainall/Nasr1/actions/runs/43109175708) — **SUCCESS** on that exact SHA.
- Scope: client-side code loading, selected reference-data reads, and catalogue read fan-out. No deployment, paid service, production database mutation, or Vercel operation was performed.

## Implemented

### 1. Administration code is split by route and view

- Added `src/components/LazyAdminApp.tsx`. Admin routes now import the workspace through a dynamic boundary instead of a static `AghbariApp` import.
- Updated 22 admin route entry points to use the lazy boundary.
- Converted 22 specialist modules inside `AghbariApp.tsx` to `React.lazy`, including finance workflows, intelligence, import, audit, operations, customer 360, purchase orders, task center, stock count, transfers and device management.
- The view-level `Suspense` boundary is inside the existing role-checked workspace rendering path. No role matrix, auth provider, RPC policy, RLS policy or navigation entitlement was relaxed.
- Build output now contains separate chunks for specialist screens instead of placing all specialist code in the base admin workspace chunk.

### 2. Catalogue reads overlap after the authoritative product/scope read

- `fetchProducts` now runs media batches, authenticated customer price resolution, the selected warehouse balance read and category read concurrently once products and current tenant scope are known.
- Media reads are bounded to four batches concurrently (up to 200 product IDs each).
- `fetchResolvedProductPrices` now processes price RPC chunks of 500 IDs with at most four chunks concurrently. Each chunk is validated before its rows are merged.
- Existing fail-closed checks remain: tenant-derived price tier, exact requested product coverage, duplicate/unexpected IDs, invalid or negative prices, and no fallback prices. Staff-only product reads still use the existing tenant/role-checked RPC. Customer-facing projections remain explicit and narrow.
- No financial, stock, pricing, or order write path was changed.

### 3. Opt-in session-scoped read cache

- Extended `src/lib/useFetch.ts` with opt-in, in-memory stale-while-revalidate caching and same-key in-flight request deduplication.
- Caching is disabled unless a caller supplies an explicit key and positive retention. The key for selected admin category reads contains the user ID, profile ID, staff/customer class, sorted roles and auth session revision.
- Applied only to category reference reads in the product editor, pricing-rule editor and data center: 15-second freshness, 120-second maximum age.
- Cached reference data is shown immediately while stale reads refresh. Failed refreshes preserve previously verified display data and expose a separate `refreshError` state.
- Prices, inventory balances, receivables, invoices, payments, customer balances, orders and other volatile financial/stock data were deliberately not added to this cache. No `localStorage` or persistent browser cache was introduced.

### 4. Regression coverage

- Added `src/lib/useFetch.test.tsx` with two focused tests:
  - stale-but-usable reference data stays visible while the network read refreshes;
  - concurrent reads with the same explicit scoped key share one in-flight request.
- Registered the new test path in `.github/workflows/p1-admin-context-verification.yml`.
- The test uses the repository's existing React/ReactDOM + jsdom environment. No missing testing-library dependency was added. React's act environment is explicitly configured; final logs contain zero act-configuration warnings.

## Exact-SHA evidence

GitHub Actions run [43109175708](https://github.com/Report-Engainall/Nasr1/actions/runs/43109175708), exact SHA `9193f88b04b0681c539db735d649e4103949277b`:

- Vitest: **16/16 test files passed**; the two new cache tests passed.
- P1 strict TypeScript: **SUCCESS** (`bunx tsc --noEmit -p tsconfig.p1-typecheck.json`).
- Production build: **SUCCESS** for client, SSR and Nitro outputs.
- No act-environment warnings in the final run.

### Build-size comparison

The earlier static-admin build at exact SHA `92940d4ba71aabfb7e71293e2208f92d088d6459` reported the `AghbariApp` client chunk at 1,891.64 KB (459.49 KB gzip). After view-level splitting, the same base admin chunk is 225.74 KB (64.24 KB gzip) at `9193f88b04b0681c539db735d649e4103949277b` — approximately 88.1% smaller uncompressed and 86.0% smaller gzip.

The final build keeps specialist modules separate, for example:

| Module | Raw size | Gzip |
|---|---:|---:|
| AghbariApp base | 225.74 KB | 64.24 KB |
| CustomerWorkflows | 215.20 KB | 49.44 KB |
| PurchaseOrdersPage | 136.63 KB | 33.07 KB |
| AdminCustomer360 | 111.06 KB | 26.88 KB |
| IntelligenceWorkspace | 70.74 KB | 18.59 KB |
| TaskCenter | 44.98 KB | 11.53 KB |
| UnifiedImportEngine | 42.21 KB | 13.71 KB |
| OperationsCenter | 34.77 KB | 9.84 KB |
| AdminAuditLog | 7.98 KB | 3.22 KB |

**Important measurement boundary:** this proves the admin workspace's static dependency graph was split and the base admin chunk shrank. It does not prove the complete first-load storefront entry shrank: the final `index` chunk remains 385.32 KB (120.10 KB gzip), and CSS remains 222.79 KB (34.10 KB gzip). It also does not prove real browser navigation latency or backend query latency.

## Not yet proven / next execution

Status is **PARTIAL IMPLEMENTATION — NOT A PERFORMANCE ACCEPTANCE PASS**.

1. Capture real browser cold/warm network waterfalls and navigation timings for storefront, product details, search, cart, checkout, customer account, admin dashboard, products, orders, finance, intelligence and data center. Include desktop and a representative mobile profile.
2. Establish and document workload, cache state, viewport, network/CPU profile and sample count; report per-route P50/P75/P95 for first content, interactive readiness, data-ready time and route navigation. Compare against approved thresholds.
3. Profile the expensive dashboard path before changing it: `fetchDashboardStats` currently reads `fetch_staff_orders` to calculate order metrics and inventory balances for low-stock counts; the dashboard also calls the full `fetchProducts` path for its low-stock examples. Verify returned row counts and payload sizes, then replace only with an existing or purpose-built server aggregate that preserves all current financial, tenant and warehouse semantics.
4. Capture PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` for the actual slow tenant-scoped queries in a controlled non-production database. Add indexes or RPC pagination only when plans and data volume justify them; test RLS, tenant isolation, result parity and migration reversibility.
5. Verify that account/session changes cannot reuse another user's cache, and verify refresh failure, retry, offline, logout and session expiry behavior in a real browser.

No database indexes/migrations, live Supabase state, production config, deployment, or user financial/stock data were changed in this workstream. Do not mark P75/P95, browser, database or production acceptance complete until corresponding exact-SHA evidence exists.

## P3 continuation — dashboard data-volume investigation — 2026-11-12

- Inspection base: current `main` HEAD `b413fdab30b319bed556f00fdf0bda26b1539070`; the performance code-bearing SHA remains `9193f88b04b0681c539db735d649e4103949277b`.
- Current source blobs inspected:
  - `src/lib/api.ts`: `b95f8571b8264bbdcf3e9de5bae9fb1c2c6f95c1`.
  - `src/components/AghbariApp.tsx`: `087c07244f9c27f2b313106ebf9944a556f7a4b2`.
  - `src/lib/executive-analytics.ts`: `0959644475b8ddf33977880c83e283f750da34a4`.
  - `src/lib/dashboard-metrics.ts`: `b0ddc92d1a6bc77cc02307be62f4ccd74b41ecdb`.
- Confirmed dashboard hot path:
  1. `fetchDashboardStats()` calls tenant scope resolution, then concurrently reads exact product/customer/alert counts, the complete result of `fetch_staff_orders`, and every inventory balance row for the active warehouse.
  2. `Dashboard` separately calls the full `fetchProducts()` catalogue read solely to filter and display at most four low-stock products.
  3. The dashboard refresh button repeats the full catalogue read. This is avoidable data transfer and client-side filtering on a high-frequency landing route.
- Important contract finding: existing `get_store_executive_analytics` is not a drop-in replacement for `fetch_staff_orders`. Its validated DTO exposes `total_orders`, `eligible_sales`, `pending_orders`, and 30-day metrics; the dashboard currently sums the `total_amount` of the full returned order population and counts both `processing` and `pending`. Replacing it without proving status and monetary parity could silently change financial dashboard semantics.
- No source mutation was made in this investigation. A guessed RPC name, unverified join, browser-side limit, or reuse of the executive analytics totals would be unsafe. The current inventory read also cannot be safely limited to four rows before applying the low-stock predicate: doing so could omit qualifying products or mis-rank the examples.
- Required implementation shape for the next code-bearing P3 change:
  - Add a narrowly scoped, server-side dashboard read contract that derives the authenticated user's organization and active warehouse from the trusted session/profile; accepts no caller-supplied tenant or warehouse identifier.
  - Return exact dashboard aggregates plus only the top four verified low-stock product projections, ordered deterministically by availability/reorder pressure and stable product ID. Filter on the authoritative sellable `quantity_available <= reorder_point` predicate before applying LIMIT.
  - Preserve existing role checks, RLS/tenant isolation, currency semantics, order status semantics, incomplete/invalid amount handling, and explicit unknown state when no warehouse exists.
  - Avoid returning full order rows, full inventory balances, prices, customer balances, or unrelated product columns to the dashboard.
  - Add migration-level contract tests and pure parser tests for unauthorized calls, tenant isolation, warehouse switching, empty/unknown warehouse, malformed rows, duplicate products, deterministic top-four ordering, and financial aggregate parity against `summarizeDashboardOrders`. Run the exact-SHA GitHub Actions suite before recording acceptance.
- Acceptance status for this continuation: **INVESTIGATED — IMPLEMENTATION NOT YET MADE; NO TEST OR PERFORMANCE PASS CLAIMED**. Browser P50/P75/P95, payload bytes, DB query plans, and first-content/data-ready timings remain unmeasured.


## P3 continuation — dashboard payload and low-stock preview reduction — 2026-11-12

- Code-bearing SHA: `d920f5fa344d231352b4ad4f81c3adcbb026f7c4`.
- Source blobs at that SHA:
  - `src/lib/api.ts`: `dfa2646f60d7d6bdcaf5e1b2ac581dc1becb597b`.
  - `src/components/AghbariApp.tsx`: `7d779c5b2c515b6511d0dfe5b7f8c1beaf5bb031`.
  - `src/lib/dashboard-low-stock.ts`: `57e3d2a4c436400863560837c38ef741164d6dff`.
  - `src/lib/dashboard-low-stock.test.ts`: `260b3714a0d2625baa40b2a6ab21c5310f2df736`.
- Preserved existing code and behavior:
  - No existing screens, APIs, catalogue functions, routes, database objects, or prior performance improvements were deleted.
  - The existing staff-only `fetch_staff_orders()` authorization, tenant derivation, full result population, order count, status classification (`processing` and `pending`), and `summarizeDashboardOrders` financial validation remain in use. The dashboard now requests only `status,total_amount` from its table-returning RPC, rather than transporting unrelated order columns.
  - The exact low-stock KPI continues to count the complete selected-warehouse balance set through the existing `quantity_available <= reorder_point` helper. No early LIMIT was introduced before the predicate.
- New low-stock preview path:
  - Added a pure deterministic shortlist builder. It validates every selected-warehouse balance row and rejects malformed or duplicate product identities; it applies the existing sellable-stock predicate, ranks by stock pressure with stable product-ID tie-breaking, then caps the display shortlist at four.
  - The dashboard no longer calls the full `fetchProducts()` catalogue path just to render four low-stock examples. It calls the existing role-checked `fetch_staff_products(p_product_id)` contract for no more than four selected IDs and asks PostgREST for only `id,name,item_code,unit`.
  - The existing general catalogue reader and all its other callers remain intact. No prices, product media, category data, customer balances, or full product records are loaded for the dashboard preview.
  - The UI differentiates no active warehouse from incomplete/unavailable stock evidence instead of displaying a false zero.
- Database and security inspection:
  - Confirmed the canonical project `tfdwtuwkdddnzgyhcoyy` is ACTIVE_HEALTHY; the retired `mrcyqezbhpncuvaehwgf` project is INACTIVE.
  - Read-only inspection confirmed `fetch_staff_products(uuid)` derives the active organization from the authenticated profile, checks the staff role, and scopes the requested product to that organization. `get_current_tenant_context()` derives the active warehouse from the signed-in profile. `fetch_staff_orders()` remains staff-only and organization-scoped.
  - Read-only schema/index inspection found the existing unique `(product_id,warehouse_id)` index and `idx_inventory_product(product_id)`; no warehouse-leading inventory index was found in the inspected index list.
  - No migration, index, function, ACL, RLS policy, production row, or Supabase setting was modified. No SQL write/DDL was run.
- Regression coverage added (not yet executed in this delivery): four tests cover predicate-before-cap ranking, deterministic tie-breaking, zero reorder-point behavior, and malformed/duplicate fail-closed handling.
- Evidence boundary:
  - **IMPLEMENTED IN SOURCE — YES.**
  - **TESTED_EXACT_SHA — NOT YET VERIFIED.** No Vitest, TypeScript, production build, browser waterfall, or route timing PASS is claimed for `d920f5f`.
  - **BROWSER_P50/P75/P95 — NOT MEASURED.**
  - **DATABASE EXPLAIN ANALYZE — NOT RUN.** The current dashboard still reads all selected-warehouse balance rows to preserve the exact total low-stock count; a server-side aggregate and a measured warehouse-leading index decision remain separate follow-up work.
  - The commit status surface returned a Vercel build-rate-limit failure; no Vercel build/deployment was requested or run. This is not GitHub Actions test evidence.
- Next execution: obtain exact-SHA GitHub Actions results for `d920f5f`; then measure the selected-warehouse inventory query plan in a controlled non-production database. Only after measuring the real plan and proving RLS/tenant/warehouse parity should a migration-backed server aggregate or index be proposed. Keep the live database unchanged.
