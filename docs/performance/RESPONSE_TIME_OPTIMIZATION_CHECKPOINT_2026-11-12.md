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


## P3 continuation — dashboard alert shortlist and live query-plan evidence — 2026-11-12

- Latest code SHA on `main`: `49903a4891e3418a5d33c0667cd33ee5c75e0be2`.
- Latest source blobs:
  - `src/lib/api.ts`: `3a8401961ed77729f4a9a57202884f5a1d020e1e`.
  - `src/components/AghbariApp.tsx`: `81a023a65c4629f857f4678ce2e9cf5903144160`.
  - Low-stock helper/test remain `57e3d2a4c436400863560837c38ef741164d6dff` / `260b3714a0d2625baa40b2a6ab21c5310f2df736`.
- Additional dashboard optimization:
  - Added `fetchDashboardAiAlerts()`: selects only `id,title,body,severity`, applies `organization_id` and `is_resolved=false` on the server, orders by `created_at DESC, id ASC`, and returns at most four rows.
  - `Dashboard` uses this narrow reader. The general `fetchAiAlerts()` function and the full AI-alert workflow were preserved unchanged.
  - The dashboard no longer receives twenty full alert rows merely to filter and render four unresolved entries.
- Read-only live database evidence from canonical active project `tfdwtuwkdddnzgyhcoyy`:
  - Counts: organizations=1, profiles=2, active profiles with organization=2, warehouses=0, active warehouses=0, orders=0, products=0, inventory balances=0, AI alerts=0.
  - The project therefore currently has no warehouse/catalogue/inventory/order/alert dataset on which to measure a populated dashboard. No demo rows or warehouse were inserted.
  - The planner's `reltuples` estimates for some empty tables were stale (including `inventory_balances=-1`); actual read-only COUNT results above are the relevant current row counts.
- Read-only `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON)` observations:
  - Inventory query: actual 0 rows, 2.069 ms execution, 0 shared reads / 7 shared hits. The plan selected a bitmap index scan using `inventory_balances_product_id_warehouse_id_key`, but the active-warehouse subquery returned no row; this is not a populated-warehouse performance measurement.
  - Order query: actual 0 rows, 0.772 ms execution, 0 shared reads / 7 shared hits. The outer plan used a sequential scan because the orders table is empty; the profile init-plan was not needed. This is not a populated-orders measurement.
  - AI alerts table: 0 rows; only its primary-key index appeared in the inspected index list. No additional index is justified by an empty table.
  - These `EXPLAIN ANALYZE` statements executed SELECTs only. No data, schema, index, migration, function, policy, or configuration was changed.
- Preservation check from code diff:
  - The general product catalogue function and its non-dashboard callers remain.
  - The general AI alert reader remains.
  - Existing order and inventory business semantics remain; only dashboard projections and preview reads were narrowed.
  - The earlier lazy-loading and catalogue concurrency improvements remain untouched.
- Evidence boundary:
  - **IMPLEMENTED IN SOURCE — YES** at `49903a4`.
  - **TESTED_EXACT_SHA — NOT VERIFIED.** Four low-stock helper regression tests were added, but were not executed in this session. No Vitest, strict TypeScript or production build PASS is claimed.
  - The connected GitHub status surface exposed only a Vercel build-rate-limit failure. Its workflow-run wrapper filters to pull-request-triggered runs and returned no push-run records; therefore exact-SHA GitHub Actions status remains **NOT VERIFIED**, not PASS. No Vercel build/deployment was used.
  - **BROWSER P50/P75/P95 — NOT MEASURED.** A populated warehouse and representative catalogue/orders are required for valid timings.
- Next safe step: use the repository's GitHub Actions workflow to run Vitest, strict TypeScript and the production bundle against the exact source SHA `49903a4891e3418a5d33c0667cd33ee5c75e0be2`. After it passes, benchmark a controlled non-production tenant containing real-shape catalogue, alerts and warehouse data; only then consider new aggregate RPCs/indexes.


## P3 continuation — critical stock state and explicit GitHub Actions path — 2026-11-12

- Exact test-target SHA on `main`: `39b73d8eb8fb0a603b5c061859d2a7755d7e2332`.
- Source blobs at the test target:
  - `src/lib/api.ts`: `3a8401961ed77729f4a9a57202884f5a1d020e1e`.
  - `src/components/AghbariApp.tsx`: `fc4318f7fe744fbaec65164b5b7218c4e871d41a`.
  - `src/lib/dashboard-low-stock.ts`: `57e3d2a4c436400863560837c38ef741164d6dff`.
  - `src/lib/dashboard-low-stock.test.ts`: `cf3db0f436694783680a19916a891ac0649bf9e6`.
  - `.github/workflows/p1-admin-context-verification.yml`: `899fad1fc5f04c7c4123f1a0b46a08bb4ed0ce9c`.
- Added a fifth regression case: negative available stock must be prioritized before non-negative low-stock candidates. The dashboard marks both zero and negative available quantities as `critical`; no inventory value is changed.
- Explicitly added `src/lib/dashboard-low-stock.ts` and `src/lib/dashboard-low-stock.test.ts` to the P1 GitHub Actions push-path filter. This ensures a future helper/test-only edit also invokes the full test/typecheck/build workflow.
- The general product catalogue reader, full AI alert reader, all other alert/product screens and routes remain in place.
- Verification status is unchanged: five focused tests authored but NOT RUN; exact-SHA GitHub Actions status NOT VERIFIED; no exact-SHA PASS is claimed. The connected status tool only surfaced the Vercel build-rate-limit status, and its workflow-run wrapper cannot surface push-triggered runs. Vercel was not run by this task.


## P3 continuation — narrow paged workspace reads — 2026-11-12

- **Current code SHA on main:** `4336007ac619b7a67a65cbf96f954f430718bfab`.
- **Exact source blobs at this SHA:**
  - `src/lib/api.ts`: `326372d8ebc1397454bc357a1735ef685b1bc283`.
  - `src/components/AghbariApp.tsx`: `e9b0a890ef0598a3486ed45b6392c8e331b7a50b`.
  - `src/components/AdminPages.tsx`: `abee3000429bc9815b0a826fe3c9e3c2786cab21`.
  - `src/lib/customer-directory.ts`: `f62e3f784e02bdd97c8e6fbf1a61b8fb308e9e3e`.
  - `src/lib/customer-directory.test.ts`: `835a4d712b556a55bd85cfc69e1e10c8663dc55c`.
  - `src/lib/product-admin-pagination.ts`: `b07c2599b257d089925298dccbbf466d785f1670`.
  - `src/lib/product-admin-pagination.test.ts`: `ad4f104b9a94acc1cbd8602aa1c2045c67933409`.
  - `src/lib/business-inventory-valuation.ts`: `ac5ecc1a18e83e486ad24c963ea9dc3395844140`.
  - `src/lib/business-inventory-valuation.test.ts`: `950e8a2c4ae8ce00ca6f31289fe9f64cab12c58c`.
  - `src/components/BulkProductImageUploader.tsx`: `1a4c0e0c71ecde3067eecbc48aee95d9851dfc5d`.
  - `src/components/BulkProductImageUploader.test.tsx`: `c874b93814f08b42f6a7df651cf73ec0bb7e85d0`.
  - Low-stock helper/test remain `57e3d2a4c436400863560837c38ef741164d6dff` / `cf3db0f436694783680a19916a891ac0649bf9e6`.
  - `.github/workflows/p1-admin-context-verification.yml`: `b1a76f6d9315d2b7474d8ce5ea773523a99cad16`.

### Additional body changes — no prior feature removed

1. **Product administration**
   - Replaced the product table's full-catalogue read with a tenant/staff RPC-backed page of 40 rows plus one look-ahead row, server-side search across name/item code/SKU/barcode, deterministic ordering, and page-scoped media/category/current-warehouse inventory reads.
   - The original `fetchProducts()` catalogue reader remains intact. It is now loaded by `BulkProductImageUploader` only when that full-match tool is expanded; complete catalogue matching is still required to prevent ambiguous image-to-product assignments.
   - Uploader loading, retry, fail-closed selection, refresh synchronization, and batch results are preserved.

2. **Order list and detail**
   - The staff order list now reads a maximum of 40 rows plus one look-ahead row; it fetches only the displayed order fields and names of customers referenced by that page.
   - The order detail workspace now loads the selected order by ID and only the matching customer's code/name; it no longer downloads the entire order/customer directory to locate one order.
   - Existing full `fetchOrders()` remains available for other screens and workflows. No order status, amounts, approval, review, print, export, or mutation behavior was intentionally changed.

3. **Pricing selectors**
   - Customer pricing preview uses a separate 25-row, minimal customer identity projection (id/name/code), server-side search, and one-row look-ahead. It does not read customer balances or credit limits and does not execute an exact count on each query.
   - Product pricing preview and pricing-rule editing use minimal product option projections (id/name/code), server-side search and bounded page reads; neither loads images, inventory balances, categories, or price fields for the dropdown.
   - A targeted product-by-ID lookup keeps an existing product-scoped pricing rule selectable even when it is outside the first page. Pricing remains server-authoritative through the existing preview/price engine; no browser-side price formula was introduced.

4. **Business analytics**
   - Business signal and status breakdown calculations now receive only `id,customer_id,status,total_amount` for each existing order, rather than full order/customer records.
   - Inventory valuation uses only product id/base price and the selected warehouse's product id/available quantity. The previous formula (base price × selected-warehouse available quantity) remains unchanged. Missing/NULL/duplicate/malformed stock evidence fails closed as unavailable; it is never treated as zero. The pure valuation helper has six regression cases.

5. **Regression and workflow wiring**
   - Focused tests authored: 5 customer search cases, 5 product search cases, 6 inventory valuation cases, 3 uploader lazy-load cases, and 5 low-stock ranking cases (**24 test cases authored**).
   - The GitHub Actions push path includes the new helpers/components and their regression files. The existing workflow still runs `bun install --frozen-lockfile`, Vitest, strict P1 TypeScript, and build on a matching push.

### Important performance/security boundary

- The code above narrows **HTTP payloads and browser-side processing**, and the customer table query uses PostgREST filters/range. However, the existing `fetch_staff_products(uuid)` and `fetch_staff_orders()` are `SETOF` RPCs. PostgREST applies outer projections/range to the RPC result; a `LIMIT` on the client request is not proof that the PL/pgSQL function itself avoids materializing the tenant's full set.
- True database-side keyset pagination, filtering, and aggregate-only inventory/order metrics require new purpose-built SQL RPC contracts and migrations, plus RLS/tenant/warehouse parity tests and exact-SHA CI. No migration was generated or deployed in this round because the migration CLI workflow was not available here, and the live database is not authorized for DDL.
- The live project is still empty of warehouses/products/inventory/orders/alerts. Browser P50/P75/P95 and populated-data performance therefore remain unmeasured. Empty-table EXPLAIN timings are not representative.

### Verification status for SHA `4336007`

- **SOURCE IMPLEMENTED — YES.**
- **TESTS AUTHORED — 24 focused cases; NOT RUN in this session.**
- **EXACT-SHA GitHub Actions Vitest / strict TypeScript / build — NOT VERIFIED.** The available GitHub workflow-run wrapper only returns PR-triggered runs and returned no push-run record. The combined commit status surface only returned a Vercel build-rate-limit failure. No Vercel build/deployment was launched or used.
- **BROWSER P50/P75/P95 — NOT MEASURED.**
- Do not transfer the earlier `9193f88` PASS to this SHA.
