# P3 execution checkpoint — Nasr1

UPDATED_AT: 2026-10-23T17:22:01+03:00
LAST_COMPLETED_TASK_ID: P3-ROUTE-DEEPLINK-019 (six direct generated-route entry/query-state assertions committed at c4d53b9; current branch-head CI pending).
CURRENT_BRANCH: p3/catalog-screen-error-states-20261023
BASE_SHA: 59547c7d683cefd65cab445b97219aa701021676
HEAD_SHA: 4653641bac43bcde9e1a43f8010c355fe3fb3a57 (live code/test head includes P3-ROUTE-DEEPLINK-019; Core #39968751206 is IN_PROGRESS at Unit tests and P2 #39968751364 is PENDING. This docs update creates a successor which must receive its own exact-head CI readback.)
ROUTES_COVERED: /categories; /collections; /admin/reports; /orders/$id; /orders/; /invoices; /statement; /assistant; /barcode; /offline; /login; /forgot-password; /register; /reset-password; /quotes; /reorder; /; /addresses; /cart; /catalog; /checkout; /compare; /product/$id; /products; /search; /store; /wishlist; /offers; /search/advanced — targeted route/component tests only, full all-route browser UAT remains open; direct routeTree entry assertions added for /categories, /collections, /offers, /search/advanced, /catalog?q=Rice, /search?q=Rice (CI pending)
FILES_CHANGED:
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
TESTS_FAILED_OR_SKIPPED:
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
HANDOFF_TO_P1_OR_P2:
- P1: generator-backed route tree repair and direct /admin/exports proof; remaining 19 locked admin null fallbacks; no changes to P1 AghbariApp/auth/invitation/order-history paths.
- P2: route-to-source mapping in existing matrix, backend/RPC/migration ownership and package-cache HTTP 429 in P2 Playwright.
PR_URL: https://github.com/Report-Engainall/Nasr1/pull/89
MERGE_STATUS: OPEN; UNMERGED; no formal independent approval recorded.
BLOCKERS:
- Independent formal review for PR #89 has not been submitted; do not merge until an authorized reviewer records it.
- `main` advanced by one documentation commit since PR #89's merge base: live comparison `main=f7565aefd7af6033d169167d1bebb3dc5cd248ce`; PR branch is 1 commit behind and diverged, though GitHub reports mergeable=true. No branch sync/merge performed in this step; reassess and integrate conflict-aware before merge.
- External credential-gated customer E2E remains SKIPPED. Local browser proof for reset-password and category-error retry is NOT RUN.
- The report/checkpoint updates below create a new documentation-only SHA; read its own Actions before labelling that successor TESTED_EXACT_SHA.
- Current exact-head Core #39968751206 is IN_PROGRESS and P2 #39968751364 is PENDING; earlier P2 runs were CANCELLED on superseded heads, not successful.
- P2 dependency cache HTTP 429 on previous SHA, even after retry.
- Local checkout DNS failure; all-route browser UAT/production proof NOT RUN.
NEXT_ACTION: fetch the live PR head after this checkpoint/report tree commit and inspect exact-head Core/P2 job conclusions. If a new commit cancels P2, don't label it PASS; re-run at the final stable branch head after concurrent writes settle. Continue only with independent uncovered P3 acceptance. Keep PR #89 open until final-head required checks succeed and independent formal review is recorded; integrate main's one-commit drift conflict-aware.
