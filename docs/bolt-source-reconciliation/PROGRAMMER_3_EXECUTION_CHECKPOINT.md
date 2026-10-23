# P3 execution checkpoint — Nasr1

UPDATED_AT: 2026-10-23T17:31:40.611+03:00
LAST_COMPLETED_TASK_ID: P3-P2-HANDOFF-LOCAL-PORT-GUARD-021 (diagnosed exact-SHA P2 fixture failure and posted owner handoff; not a P3-owned code fix)
CURRENT_BRANCH: p3/catalog-screen-error-states-20261023
BASE_SHA: 59547c7d683cefd65cab445b97219aa701021676
HEAD_SHA: 7d5fb61857ca27c84c1ae9fdba6a3e957fe8e658 (live branch SHA at checkpoint start; app/test SHA 418e25d1e9fc75145f27cf0668fb41a7e471c692; this documentation update creates a successor that needs its own exact-head CI readback)
ROUTES_COVERED: /company/contacts; /company/members; /company/accept-invitation; /invite/$token; /customer/activate/$token; /categories; /category/$slug; /category/$slug/subcategory/$subcategorySlug; /collections; /admin/reports; /orders/$id; /orders/; /invoices; /statement; /assistant; /barcode; /offline; /login; /forgot-password; /register; /reset-password; /quotes; /reorder; /; /addresses; /cart; /catalog; /checkout; /compare; /product/$id; /products; /search; /store; /wishlist; /offers; /search/advanced — route/component loading and direct-link regressions only; full all-route browser UAT remains open
FILES_CHANGED: src/routes/index.tsx; src/test/customer-route-loading.test.tsx; src/components/StorefrontOffersPage.tsx; src/test/storefront-offers.test.tsx; src/components/AdvancedStorefrontSearchPage.tsx; src/test/advanced-storefront-search.test.tsx; src/components/Storefront.tsx; src/test/storefront-price-visibility-ui.test.tsx; src/test/storefront-category-landing.test.tsx; src/test/reset-password-route.test.tsx; docs/bolt-source-reconciliation/PROGRAMMER_3_EXECUTION_CHECKPOINT.md; docs/bolt-source-reconciliation/PROGRAMMER_3_CURRENT_REPORT.md
- src/components/StorefrontCollectionsPage.tsx
- src/routes/admin_.reports.tsx
- src/test/admin-reports-route-forecast.test.tsx
- src/test/admin-reports-route-wiring.test.ts
- src/test/admin-reports-runtime-mount.test.tsx
- src/test/storefront-collections.test.tsx
- src/routes/orders.$id.tsx
- src/routes/orders.index.tsx
- src/routes/invoices.tsx
- src/routes/statement.tsx
- src/test/customer-route-loading.test.tsx
- src/routes/assistant.tsx
- src/routes/barcode.tsx
- src/routes/offline.tsx
- src/routes/login.tsx
- src/routes/forgot-password.tsx
- src/routes/register.tsx
- src/routes/quotes.tsx
- src/routes/reorder.tsx
- src/routes/index.tsx
- src/components/StorefrontOffersPage.tsx
- src/test/storefront-offers.test.tsx
- src/components/AdvancedStorefrontSearchPage.tsx
- src/test/advanced-storefront-search.test.tsx
- src/components/Storefront.tsx
- src/test/storefront-price-visibility-ui.test.tsx
- src/test/reset-password-route.test.tsx
- docs/bolt-source-reconciliation/PROGRAMMER_3_EXECUTION_CHECKPOINT.md
- docs/bolt-source-reconciliation/PROGRAMMER_3_CURRENT_REPORT.md
TESTS_RUN_WITH_RESULTS:
- Exact source/test SHA `259aabc6078d868e35087aa33924d4b044af8e5`: Core [39966679379](https://github.com/Report-Engainall/Nasr1/actions/runs/39966679379) SUCCESS; 143 Vitest files / 895 tests passed; isolated PostgreSQL migrations/workflows and backup/restore, lint, build, production-preview/dev smoke and Chromium price-visibility acceptance passed.
- Exact source/test SHA `259aabc6078d868e35087aa33924d4b044af8e5`: P2 [39966679223](https://github.com/Report-Engainall/Nasr1/actions/runs/39966679223) SUCCESS for public UI smoke and local-Supabase browser acceptance: order persistence/cross-tenant denial, customer return and credit memo, audited Onyx XLSX export, and finance-document/operational-task print.
- Latest docs-only head `6bba167ed6358ef4f90f7559d6d4548e7b4d411d`: Core [39967683475](https://github.com/Report-Engainall/Nasr1/actions/runs/39967683475) SUCCESS. P2 [39967683902](https://github.com/Report-Engainall/Nasr1/actions/runs/39967683902) remains IN_PROGRESS at cached Chromium OS dependency installation; external credential-gated customer-order/tenant job is SKIPPED.
- P3-ROUTE-DEEPLINK-019: six real-router direct route/query-state tests committed at c4d53b9; current code/test head is 4653641; exact-head Core is IN_PROGRESS and P2 PENDING; local tests NOT RUN.
- `P3-COMPANY-INVITATION-HYDRATION-020`: commit `418e25d1e9fc75145f27cf0668fb41a7e471c692` extends `src/test/customer-route-loading.test.tsx` with five parameterized route-loading assertions: `/company/contacts`, `/company/members`, `/company/accept-invitation`, `/invite/$token`, `/customer/activate/$token`. The source route files were not edited; only component mocks for the ClientOnly boundary were added. Core `39969440685` was QUEUED and P2 `39969439898` PENDING/IN_PROGRESS at readback on this code/test SHA; local tests are NOT RUN due GitHub DNS failure. The documentation sync below will require fresh exact-head CI.
- Prior route acceptance increment `P3-ROUTE-DEEPLINK-019` adds six direct-link/query-state cases to `src/test/storefront-price-visibility-ui.test.tsx`; subcategory loading, valid-parent, and mismatch cases were added by the following code commit `4653641bac43bcde9e1a43f8010c355fe3fb3a57`. Core `39968751206` succeeded on that head; P2 `39968751364` public smoke succeeded but local-Supabase acceptance was CANCELLED, so do not claim full P2 acceptance for that older head.
- Exact tested docs SHA `7d5fb61857ca27c84c1ae9fdba6a3e957fe8e658`: Core [39969630673](https://github.com/Report-Engainall/Nasr1/actions/runs/39969630673) **SUCCESS**, including Unit tests, PostgreSQL 17 migrations/acceptance, backup/restore, lint/build, preview/dev smoke, and Chromium price privacy. P2 [39969630660](https://github.com/Report-Engainall/Nasr1/actions/runs/39969630660): public UI smoke SUCCESS; local-Supabase job FAILED at `Create ephemeral local users and tenant fixtures` before browser flows. `supabase status -o env` emitted local DB URL port `55432`, while `scripts/seed-p2-local-playwright.mjs:15-22` requires `54322`. Exact evidence and P2 handoff: [comment 6367290450](https://github.com/Report-Engainall/Nasr1/pull/89#issuecomment-6367290450). Credential-gated external customer E2E remains SKIPPED. The docs update below creates a new head and will trigger fresh CI.
- External credential-gated customer-order/tenant E2E is SKIPPED because dedicated external credentials are unavailable; this is not PASS.
- Full all-route browser UAT and production acceptance remain NOT RUN.
- Historical route-test harness failure (7 assertions on SHA 39638915...) was corrected and later full Core succeeded; historical HTTP 429 dependency-cache errors are documented in the P2 handoff.
DEFECTS_FOUND:
- P3-CAT-ERR-001: source-specific category/catalog errors and retry implemented; earlier exact-SHA Core pass.
- P3-CAT-COUNT-002: inactive products excluded and empty-category links suppressed; strengthened count/link test passed on parent SHA.
- P3-REPORT-DUP-003: duplicate mount removed; runtime Reports mount test passed on parent SHA.
- P3-REPORT-LOAD-004: Arabic RTL reports loading status implemented; earlier Core pass.
- P3-CUST-ROUTE-LOAD-005/006: seven customer route loading fallbacks fixed and covered; parent Core pass.
- P3-CUST-ROUTE-LOAD-008: login, forgot password, registration, quotes and reorder loading fallbacks fixed; latest exact-head result pending.
- P3-STORE-HYDRATION-009: `/` now renders Arabic RTL `<main role="status">جار تحميل المتجر...</main>` instead of a blank hydration fallback; its regression assertion remains in `customer-route-loading.test.tsx`.
- P3-ROUTE-HYDRATION-COVERAGE-010: parameterized acceptance expanded to 23 route wrappers; exact-SHA result pending.
- P3-OFFERS-ACTIVE-SCOPE-011: /offers filters products by is_active/status before displaying campaign targets; both new regression tests passed in Core 39961737329 before the route-loading test file failed.
- P3-ROUTE-TEST-REGRESSION-012: corrected route loading test harness: addresses route has a component mock; only root `/` is required to use a MAIN landmark; other routes are asserted by role=status, RTL direction and expected content. Core Unit tests on SHA d0b0b08... then passed.
- P3-OFFERS-ERROR-UX-013: `/offers` distinguishes promotion-query failure, catalog-query failure, and both causes; retry triggers both source reads. Added two regression tests; unit suite/Core passed on SHA 8663... .
- P3-ADVANCED-SEARCH-STATE-014: `/search/advanced` now announces category loading, exposes a retry button when the category read fails, and keeps text search available on that error path. Added four regressions: loading announcement/disabled selector, error and retry plus text search, empty-submit validation and active top-level categories, and navigation with category/known-stock filters. Exact-SHA CI is pending.
- P3-ROUTE-INVENTORY-001: 61 route sources; 50 UI/root sources not explicit in the existing matrix files. P2 handoff: https://github.com/Report-Engainall/Nasr1/pull/89#issuecomment-6365043277.
- P3-ROUTE-INVENTORY-002 / P1-ROUTE-TREE-EXPORT-001: generated tree omits admin_.exports; P1 handoff: https://github.com/Report-Engainall/Nasr1/pull/89#issuecomment-6365137817.
- `P3-CATALOG-CATEGORY-RETRY-015`: `src/components/Storefront.tsx` now announces category loading and exposes the source error with `role=alert`, plus a labeled retry button; name/SKU search stays available. Regression coverage asserts the message, retry callback, and search availability.
- `P3-CATEGORY-LOADING-REGRESSION-016`: added an independent loading-state case with category data absent and `loading=true`. It asserts the Arabic `role=status` copy is present, the alert/retry button do not appear before a failure occurs, and text search remains enabled. Renamed the previous test to explicitly describe the error/retry path. Code/test SHA `4cd6860c8ad06ba03f84d4a7dbe923ab76ea7c36`; exact-head CI pending.
- `P3-RESET-PASSWORD-FLOW-017`: added `src/test/reset-password-route.test.tsx` against the real route component (mocking only Supabase and the router boundary). It covers short input rejected before RPC, expired recovery session with no navigation, transport rejection and form unlock, navigation only after successful server acknowledgment, and prevention of duplicate submit while the request is pending. This suite passed within Core unit tests on tested documentation SHA `259aabc6078d868e35087aa33924d4b044af8e5b`; route-specific live browser UAT is still NOT RUN. No auth route or server contract was changed.
- `P3-COMPANY-INVITATION-HYDRATION-020`: loading-state regression only; `src/routes/company.contacts.tsx`, `company.members.tsx`, `company.accept-invitation.tsx`, `invite.$token.tsx`, and `customer.activate.$token.tsx` remain untouched. Their service/business state acceptance is not implied by loading placeholders.
- `P2-LOCAL-SUPABASE-PORT-GUARD-021` → P2. Local Playwright job `39969630660`, job `120469135169`, exact failure: exported `TEST_DATABASE_URL` uses loopback port `55432` while `scripts/seed-p2-local-playwright.mjs` rejects anything but `54322`; PR handoff [comment 6367290450](https://github.com/Report-Engainall/Nasr1/pull/89#issuecomment-6367290450). No P2-owned file was changed by P3.
- P1: generator-backed route tree repair and direct /admin/exports proof; remaining 19 locked admin null fallbacks; no changes to P1 AghbariApp/auth/invitation/order-history paths.
- P2: route-to-source mapping in existing matrix, backend/RPC/migration ownership and package-cache HTTP 429 in P2 Playwright.
PR_URL: https://github.com/Report-Engainall/Nasr1/pull/89
MERGE_STATUS: OPEN; UNMERGED; no formal independent approval recorded.
BLOCKERS:
- P2 local-Supabase acceptance FAILED at fixture creation due the exact loopback database-port mismatch documented in handoff comment 6367290450; P2 must fix and rerun.
- External-credential customer-order E2E remains SKIPPED; full route/browser UAT NOT RUN.
- No independent formal human review is recorded for PR #89; do not merge.
- main has one documentation-only commit beyond the current PR base; integrate conflict-aware before merge.
- Independent formal review for PR #89 has not been submitted; do not merge until an authorized reviewer records it.
- `main` advanced by one documentation commit since PR #89's merge base: live comparison `main=f7565aefd7af6033d169167d1bebb3dc5cd248ce`; PR branch is 1 commit behind and diverged, though GitHub reports mergeable=true. No branch sync/merge performed in this step; reassess and integrate conflict-aware before merge.
- External credential-gated customer E2E remains SKIPPED. Local browser proof for reset-password and category-error retry is NOT RUN.
- The report/checkpoint updates below create a new documentation-only SHA; read its own Actions before labelling that successor TESTED_EXACT_SHA.
- Current exact-head Core #39968751206 is IN_PROGRESS and P2 #39968751364 is PENDING; earlier P2 runs were CANCELLED on superseded heads, not successful.
- P2 dependency cache HTTP 429 on previous SHA, even after retry.
- Local checkout DNS failure; all-route browser UAT/production proof NOT RUN.
NEXT_ACTION: read exact-head CI for the checkpoint/report successor after this update. Continue an independent P3 route-acceptance task; track P2 handoff 6367290450 until the local Supabase fixture/Playwright run is rerun successfully. Do not edit P2 workflow/seed script, do not mark P2 acceptance PASS, and do not merge PR #89 without green current-head checks plus independent formal review.
