# P3 execution checkpoint — Nasr1

UPDATED_AT: 2026-10-23T17:01:39.588+03:00
LAST_COMPLETED_TASK_ID: P3-CATEGORY-LOADING-REGRESSION-016 (added a distinct loading-state regression and corrected the failure-test name; exact-head CI pending)
CURRENT_BRANCH: p3/catalog-screen-error-states-20261023
BASE_SHA: 59547c7d683cefd65cab445b97219aa701021676
HEAD_SHA: 4cd6860c8ad06ba03f84d4a7dbe923ab76ea7c36 (latest application-code/test commit; this checkpoint/report synchronization will add documentation-only commits, whose resulting branch head must be validated separately)
ROUTES_COVERED: /categories; /collections; /admin/reports; /orders/$id; /orders/; /invoices; /statement; /assistant; /barcode; /offline; /login; /forgot-password; /register; /quotes; /reorder; /; /addresses; /cart; /catalog; /checkout; /compare; /product/$id; /products; /search; /store; /wishlist; /offers; /search/advanced — targeted route wiring/component tests only; full route acceptance remains open
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
- docs/bolt-source-reconciliation/PROGRAMMER_3_EXECUTION_CHECKPOINT.md
- docs/bolt-source-reconciliation/PROGRAMMER_3_CURRENT_REPORT.md
TESTS_RUN_WITH_RESULTS:
- Core run 39958335414 on 22718ee03fc8bb9074d0f8444b701d04c8623669: SUCCESS, parent SHA only.
- P2 run 39958335519 on that parent: FAILED twice at external dependency install due HTTP 429; dependent browser jobs were skipped. Rerun was requested; no Playwright proof.
- Earlier Core/P2 runs 39954864338/39954864343 on c034c7a884deadd31458dc25ac73e1f95edebb53 passed their executed scopes; hosted authenticated E2E was SKIPPED.
- Local tests NOT RUN because clone was blocked by DNS.
- SHA `5881e04d93e4138494cbad68cb1aefe1971aa43e`: Core `39960689234` FAILED before tests at dependency install (HTTP 429); P2 `39960689260` FAILED at the same external dependency-install gate, skipping dependent browser steps.
- Exact SHA `39638915e900d898601b6b59e8f6801d2b45bc31` ran Core workflow [39961737329](https://github.com/Report-Engainall/Nasr1/actions/runs/39961737329): 874/881 tests passed; 7 route-loading tests failed because the harness over-required MAIN and omitted `CustomerAddressesPage` from its mock. The same log confirms the offer active-scope test passed 2/2.
- P2 [39961737301](https://github.com/Report-Engainall/Nasr1/actions/runs/39961737301) failed dependency installation on HTTP 429.
- Test-harness fix in `d076794e3f245cc9766807a4c5beafe6bf4dd520` was validated by Core Unit tests on descendant SHA `d0b0b08dd44af04089477a45cef4896b7de54d77`: Unit tests SUCCESS, PostgreSQL core migrations/workflow tests SUCCESS, Lint SUCCESS, Build SUCCESS, preview smoke SUCCESS and dev smoke SUCCESS. Core workflow [39962440526](https://github.com/Report-Engainall/Nasr1/actions/runs/39962440526) was still in Chromium price-visibility acceptance at last readback.
- P2 workflow [39962440529](https://github.com/Report-Engainall/Nasr1/actions/runs/39962440529): public UI smoke SUCCESS; local-Supabase order persistence/tenant isolation still in progress installing Chromium OS dependencies; credential-gated customer-order/tenant job skipped.
- Code/test SHA `8663bd9b399da5fd986a36b152f23fbd44620bc5`: Core [39962755869](https://github.com/Report-Engainall/Nasr1/actions/runs/39962755869) completed SUCCESS, proving the complete unit suite/build/acceptance scope configured by that workflow. P2 [39962755831](https://github.com/Report-Engainall/Nasr1/actions/runs/39962755831) was CANCELLED; public UI smoke had succeeded but the local-Supabase order/tenant browser job did not finish.
- Docs SHA `ef2944351fe887c0c12e896ab52c67fe9965f2e4`: Core [39963003111](https://github.com/Report-Engainall/Nasr1/actions/runs/39963003111) completed SUCCESS. P2 [39963003108](https://github.com/Report-Engainall/Nasr1/actions/runs/39963003108) had public UI smoke SUCCESS; local-Supabase order/tenant isolation was still in progress at its browser dependency setup at latest readback.
- Latest code/test SHA `a4be9ff155d70dc971b19a45b0859e655e446bf4` adds advanced-search loading/retry behavior and four tests. Core [39963467338](https://github.com/Report-Engainall/Nasr1/actions/runs/39963467338) was IN_PROGRESS at container initialization; P2 [39963467553](https://github.com/Report-Engainall/Nasr1/actions/runs/39963467553) was PENDING. Docs synchronization adds another SHA and its own current-head checks.
- Latest P3 code/test SHA `add4f49413ccc450d61fd0533615a472679443e2`: Core [39964711803](https://github.com/Report-Engainall/Nasr1/actions/runs/39964711803) was IN_PROGRESS and P2 Playwright [39964711930](https://github.com/Report-Engainall/Nasr1/actions/runs/39964711930) PENDING at 16:52 +03. These runs precede the documentation-only commits below; inspect exact docs-head jobs separately. Local `git ls-remote` failed with `Could not resolve host: github.com`, so local unit tests are NOT RUN.
- Exact application/test SHA `4cd6860c8ad06ba03f84d4a7dbe923ab76ea7c36` adds a distinct loading-state regression in `src/test/storefront-price-visibility-ui.test.tsx` (and renames the prior error-path test accurately). `fetch_commit_workflow_runs` had not surfaced a workflow run for this SHA at readback; only the CodeRabbit status was present. Local tests remain NOT RUN because GitHub DNS resolution fails in this runtime. Re-read the resulting documentation-head Core/P2 workflows after saving this checkpoint.
TESTS_FAILED_OR_SKIPPED:
- Core 39961737329 on SHA 39638915... failed 7 harness assertions; fixed in d076794e...; subsequent Core run 39962755869 on code SHA 8663... completed SUCCESS.
- P2 39961737301 failed on HTTP 429; P2 39962755831 was cancelled before local-Supabase browser completion; later P2 39963003108 had public smoke success and local-Supabase still in progress at last readback.
- Credential-gated customer order/tenant job skipped, not PASS. New advanced-search tests on code SHA a4be... require exact-SHA run. Full route browser UAT and production proof NOT RUN.
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
HANDOFF_TO_P1_OR_P2:
- P1: generator-backed route tree repair and direct /admin/exports proof; remaining 19 locked admin null fallbacks; no changes to P1 AghbariApp/auth/invitation/order-history paths.
- P2: route-to-source mapping in existing matrix, backend/RPC/migration ownership and package-cache HTTP 429 in P2 Playwright.
PR_URL: https://github.com/Report-Engainall/Nasr1/pull/89
MERGE_STATUS: OPEN; UNMERGED; no formal independent approval recorded.
BLOCKERS:
- Exact-head Core/P2 for this batch pending.
- P2 dependency cache HTTP 429 on previous SHA, even after retry.
- Local checkout DNS failure; all-route browser UAT/production proof NOT RUN.
NEXT_ACTION: poll Core and P2 Playwright for application/test SHA 4cd6860c8ad06ba03f84d4a7dbe923ab76ea7c36 and the documentation successor; inspect every job conclusion, repair any real failure, then continue the next independent P3 acceptance gap. Never merge #89 without green required checks at the final head and independent formal review.
