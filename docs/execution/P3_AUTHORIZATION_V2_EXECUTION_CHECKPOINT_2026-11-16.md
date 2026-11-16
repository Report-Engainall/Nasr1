# P3 Authorization V2 Execution Checkpoint — 2026-11-16

## Ownership and exact baseline
- Owner: P3 — authorization architecture integration, global execution state and evidence.
- Repository: `Report-Engainall/Nasr1`; branch: `main`.
- Exact main HEAD at checkpoint: `1727b5b0a8f5dac1487a76617f447480ff2c2c9f`.
- No role assignments, policies, application code, SQL migrations, Auth, Storage, production resources, live integrations, deployments, paid services or secrets were changed by this P3 recheck.
- Architecture decision source: `docs/execution/AGHBARI_AUTHORIZATION_ARCHITECTURE_V2_2026-11-16.md` (blob `a63ed20ac2e7356ddebdf0d778ec53f4ae903e27`). It explicitly marks the target architecture as documented, not implemented.

## Active precedence: DLV-002
- The live execution state still requires `DLV-002-ADMIN-ROLE-ACCESS-COMPARISON-001` public Chromium and authenticated local admin/denied-role acceptance before starting `AUTHZ-CAPABILITY-CATALOG-AND-LEGACY-PARITY-001`.
- P2 workflow run: `https://github.com/Report-Engainall/Nasr1/actions/runs/43779939064`.
- Workflow head: `1727b5b0a8f5dac1487a76617f447480ff2c2c9f`.
- Public UI smoke job completed successfully on that exact SHA.
- Local disposable Supabase/PostgreSQL 17 job has successfully started services, applied repository migrations, created ephemeral tenant/user fixtures, and passed its DB/RPC/storage preconditions and the early local Chromium acceptance steps.
- Last observed local job state: `IN_PROGRESS`, 36/54 steps completed, no failed steps; current step `Run finance document and operational-task print acceptance in Chromium`.
- `Test admin access matrix responsive coverage and admin-only visibility` remains `NOT RUN / PENDING` in this checkpoint. The authenticated hosted E2E job is independently skipped because hosted external credentials are not configured; this is not substituted for the local-admin proof.
- No DLV-002 closure and no `TESTED_EXACT_SHA` or `BROWSER_PROVEN` claim is made until the public UI and authenticated local admin/denied-role steps both finish successfully on the same source SHA.

## Confirmed server-side product field exposure — queued for remediation after DLV-002
This is a source-level proof of a data exposure path, not yet a browser network-response test:
1. Migration `supabase/migrations/20261015210000_product_price_column_boundary.sql` (blob `bbfb51654f12f663cf90a5cdfdd96754696a868e`, lines 12–52) defines `fetch_staff_products(uuid)` as `RETURNS SETOF public.products`. Its authorization predicate explicitly allows `admin`, `manager`, and `staff`; the body returns `SELECT p.*`; the function is executable by `authenticated`.
2. Migration `supabase/migrations/20261024110000_storefront_price_rpc_live_session_and_membership_guard.sql` (blob `4cf7a4bb83802653009200ed55f9149b8072a938`, lines 184–280) separately defines a storefront price RPC whose staff predicate includes `admin`, `manager`, and `staff`, and whose staff branch returns `round(p.base_price,2)`.
3. `src/lib/api.ts` (blob `b165dc88926a7dcd90368d94422765dd0c7d46c0`, lines 223–228 and 322–340) calls `fetch_staff_products` for all `isStaff` identities, casts the full result to `Product[]`, reads `p.base_price`, and spreads the returned product into the model.
4. The existing staff category browser acceptance asserts the DOM hides the base-price column; it does not inspect the raw RPC/network JSON key set. UI hiding is therefore not evidence of data redaction.

Required remediation after DLV-002:
- preserve manager/admin product workflows and exact current role access;
- provide a server-side staff projection that physically omits base price, cost, margin and unauthorized tier fields;
- separately guard the price resolver against staff-only callers;
- verify manager, accountant, staff and customer projections independently;
- assert the actual authenticated RPC/network JSON response, including forbidden key absence, against disposable PostgreSQL 17 fixtures;
- prove denial does not mutate any row or audit/financial/inventory state.
No fix is claimed yet; this work remains open and must not be hidden with a front-end-only change.

## Next action and evidence boundary
- Continue observing run 43779939064 at exact SHA `1727b5b0a8f5dac1487a76617f447480ff2c2c9f`.
- Require both public smoke and local authenticated access-matrix step to complete successfully before advancing the precedence marker.
- Then start `AUTHZ-CAPABILITY-CATALOG-AND-LEGACY-PARITY-001` without reassigning existing users or widening any permission.
- Status labels: existing test sources `IMPLEMENTED` / `INTEGRATED`; public UI `TESTED_EXACT_SHA` / `BROWSER_PROVEN`; local admin matrix `NOT RUN`; field-level redaction `NOT IMPLEMENTED`; hosted E2E `BLOCKED_EXTERNAL`.


## Updated execution outcome — P2 matrix browser leaf completed — 2026-11-16

- P2 run `43779939064` tested app SHA `1727b5b0a8f5dac1487a76617f447480ff2c2c9f`.
- Public UI smoke: `SUCCESS`.
- Authenticated local Supabase/PostgreSQL 17 access matrix: step #42 `SUCCESS`, 2026-11-16 00:33:11–00:33:28 UTC. Source test blob `7da849196d7b2310ce1f033287c0dc2e5bb1dd20`. It proves admin access, manager denial of the role tab/matrix, six canonical legacy roles and full matrix cells, keyboard navigation, 360px/1280px layout and no settings/permission/production writes. Status: `TESTED_EXACT_SHA` / `BROWSER_PROVEN`.
- Same run's local job ultimately failed at step #43, not step #42: `e2e/admin-category-tree.spec.ts:222` expected fixture stock `100` but actual local on-hand quantity was `105`. The log explicitly shows expected `100`, received `105`. Therefore the matrix leaf is browser-accepted, but the overall P2 run and category-tree/overall proof-verifier are `FAILURE / NOT RUN`; AI prompt gate and final proof verifier were skipped.
- Before step #43, local PostgreSQL 17 migrations, DB/RPC/storage/security checks, order tenant-isolation Chromium, stock-count and purchase XLSX, checkout replay, returns/credit memo, Onyx export, finance/task print, customer-manager authorization/privacy/audit, device-session revocation and four-tier manager price editor were all successful on the same source SHA.
- P2 must repair the deterministic test fixture/baseline for stock quantity and rerun the affected acceptance. Do not modify stock data or loosen authorization to make the assertion pass. P3 did not alter P2-owned tests.
- Precedence marker is now unlocked for the capability catalog because the required public and authenticated admin/denied-role matrix checks passed. Next action: `AUTHZ-CAPABILITY-CATALOG-AND-LEGACY-PARITY-001`. The wider route-based DLV-002 acceptance stays open.


## Staff product field-level projection — implementation committed, exact-SHA acceptance running — 2026-11-16

- Code/migration/test commit: `9711fa6a5a35be73813a0ef12f13a6dd7f36f982` (parent `51269d96546ccaf18d4509589f94119a1a0521f6`).
- Added migration `supabase/migrations/20261116090000_staff_product_field_projection.sql`. The authenticated tenant-context RPC now supplies a server-derived `can_view_internal_product_prices` capability; the full `fetch_staff_products(uuid)` row projection is restricted to admin/manager identities without accountant scope; new `fetch_staff_catalog_products(uuid)` returns an explicit allowlist of operational columns without base price, cost, tier prices, margin or other financial product fields. The staff branch of `get_storefront_product_prices` no longer returns internal base price.
- Updated `src/lib/supabase.ts` and `src/lib/api.ts` to route each staff product read through the server-authorized projection. Admin/manager workflows keep the full RPC; staff catalog, product options/detail, inventory transfer selection and dashboard low-stock reads use the safe projection. Inventory valuation is denied unless the server-derived internal-pricing capability is present.
- Updated `e2e/admin-category-tree.spec.ts` with direct authenticated calls against local Supabase: manager full projection remains available; staff safe projection is checked for absence of sensitive keys; staff attempts to call the full projection and base-price resolver must receive SQLSTATE `42501`. No fixture or business data writes were added for these checks.
- Corrected the category stock test to read `quantity_on_hand` from the isolated PostgreSQL 17 tenant/storefront warehouse and compare the exact “on hand” column after Arabic/Persian digit normalization. This replaces the invalid fixed `100` expectation; it does not modify stock rows.
- P1 run `43782740178` and P2 run `43782740161` were created for this exact SHA. At checkpoint time both were in progress; no test/build/browser acceptance is claimed yet. Prior P2 run `43781738663` failed on older SHA `8d45dc7ae3b58445a2064540679d53d176e25929` at the former fixed-value stock assertion and is not evidence for this implementation.
- Status: code/migration/test source `IMPLEMENTED`; exact-SHA Vitest/TypeScript/build and PostgreSQL 17/Chromium `IN_PROGRESS`; no `TESTED_EXACT_SHA` or `BROWSER_PROVEN` claim until the current runs finish successfully.
