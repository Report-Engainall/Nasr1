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
