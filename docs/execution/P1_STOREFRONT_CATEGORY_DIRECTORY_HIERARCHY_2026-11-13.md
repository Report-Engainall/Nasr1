# Storefront Category Directory Hierarchy — 13 November 2026

- Repository: `Report-Engainall/Nasr1`
- Base main SHA: `0b15e5a64ab3de9616cb8a9593bbeac25e11b048`
- Work branch: `feat/storefront-category-directory-hierarchy-20261113`
- Scope: customer-facing `/categories` directory presentation.

## Implemented

- Replaced the flat directory list with parent category groups and direct-child branch links.
- Each parent group shows a count based on the existing product list: active products directly assigned to the parent plus active products directly assigned to its immediate children.
- Each child link shows its direct active product count and navigates through the existing parent/subcategory slug routes.
- Categories whose parent is not present in the active public category projection are retained as independent, clearly marked groups instead of being dropped.
- Deeper descendants and cyclic/unresolved relationships remain visible in a separate additional-level section, with their immediate known parent route where possible.
- Inactive categories, inactive products, products with inactive status and uncategorized products are excluded from the displayed active-category counts.
- Existing `fetchCategories`, `fetchProducts`, `useFetch`, `storefrontCategorySlug` and `/category` routes remain the only category/product sources and navigation contract.

## New helper and coverage

- `src/lib/storefront-category-groups.ts`: pure hierarchy projection; no database writes or category mutations.
- `src/lib/storefront-category-groups.test.ts`: direct parent grouping, orphan preservation, deeper levels and cycle/no-drop guarantees.
- `src/components/StorefrontCollectionsPage.test.tsx`: parent/child rendering, real-count filtering, hidden/inactive category exclusion, deeper-level route and refetch behavior.
- `e2e/public-storefront-smoke.spec.ts`: extends the isolated public subcategory fixture to navigate to `/categories` and assert parent grouping, child links, absence of flat child headings and zero-count output without external writes.
- `.github/workflows/p1-admin-context-verification.yml`: adds the page, page test, helper and helper test to both P1 push and pull-request path filters.

## Data and count semantics

Counts are computed from the existing product result already loaded by the directory. Parent cards aggregate only the parent plus its **direct** children. Deeper descendants are shown separately with their own direct counts rather than being recursively folded into a misleading parent total. The page continues to show an error/retry state if either existing source fails; it does not synthesize a count or a category.

## Protected boundaries

No SQL/migration, RPC, RLS, Auth, tenant contract, pricing, stock mutation, cart, checkout, customer identity, admin routes, P3 engine or external service was changed. No package or dependency was added. No deployment, Vercel usage, paid service, production database write or generated category/product data was used.

## Acceptance evidence

The new pure helper and component tests are included in the P1 workflow filters. PR acceptance must be read from exact-head GitHub Actions runs. P2 browser checks remain separate from hosted authenticated order/tenant acceptance; skipped external credentials are not a pass.

## Final merge and exact-head evidence — 13 November 2026

- PR [#438](https://github.com/Report-Engainall/Nasr1/pull/438) merged to `main` at `4451e4625c1cfe0974693ea49d0737a8959fc943`; tested PR head: `f312147c87f2c518ccab85af0175b5ae4892e85d`.
- P1 PR run [#43366286275](https://github.com/Report-Engainall/Nasr1/actions/runs/43366286275): **SUCCESS** — 91/91 test files, 640/640 tests, strict TypeScript and production build.
- P2 PR run [#43366286295](https://github.com/Report-Engainall/Nasr1/actions/runs/43366286295): public, read-only Chromium Storefront smoke **SUCCESS**, 19/19 tests, including category deep-link and `/categories` hierarchy assertions.
- On merged `main` SHA `4451e4625c1cfe0974693ea49d0737a8959fc943`, P1 run [#43366791056](https://github.com/Report-Engainall/Nasr1/actions/runs/43366791056): **SUCCESS** — 91/91 test files, 644/644 tests, strict TypeScript and production build.
- Main P2 run [#43366791042](https://github.com/Report-Engainall/Nasr1/actions/runs/43366791042): public Chromium smoke **SUCCESS**, 19/19 tests. At the last poll the exact-main local PostgreSQL 17 job was still running finance-document/task-print acceptance (step 32), followed by customer-manager privacy/audit and device-session revocation; the hosted customer-order/tenant job was **SKIPPED**. Do not transfer the PR-head local P2 PASS to the different merge SHA.
- PR P2 local PostgreSQL 17 job `131692385292` completed **SUCCESS** on exact PR head `f312147c87f2c518ccab85af0175b5ae4892e85d`: fresh local stack, repository migrations, tenant fixtures, endpoint allow/deny, atomic price-grid rollback/audit/concurrency, cash-expense posting/idempotency/concurrency, purchase-receipt accounting restrictions, build/launch, authenticated order persistence and cross-tenant denial, stock/PO XLSX, checkout replay, return/credit memo, Onyx export, finance/task print, customer-manager privacy/audit and device-session revocation all completed successfully. The separate hosted/external customer-order/tenant job remained **SKIPPED**.
- Merge verified against the live `main` branch at the merge SHA above. No Vercel, deployment, hosted database writes or paid services.
