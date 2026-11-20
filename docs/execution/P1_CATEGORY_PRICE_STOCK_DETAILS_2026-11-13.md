# Category Price and Stock Details — 13 November 2026

Repository: Report-Engainall/Nasr1
Code SHA: 49e1684d5b5d64de60ad34c09fe18afacbf88f26
Branch: main
Scope: Path A — existing category details; no Issue #422 Path B files changed.

## Implementation

The existing category detail screen now has a read-only «الأسعار والمخزون» tab. It reuses fetchAdminProductsPage, which already calls the staff product RPC, resolves tenant scope from the authenticated session, selects balances for the active warehouse, validates returned records and paginates in bounded pages of 40. The reader now accepts an optional category UUID, validates its syntax before query construction, and filters the existing result by category_id. No new RPC or table was introduced.

The view shows directly assigned products only, with product status, on-hand/available quantities, reorder threshold and inventory status. A price column is displayed for admin/manager UI roles only. The display projection rejects negative and non-finite values, and missing warehouse balances remain «غير متاح» rather than being converted into zero. Unknown stock evidence is not labelled adequate or low. Opening a product returns to the existing product workspace.

The minimal admin-category-products preview query remains unchanged and non-financial. Existing category create, rename, archive, restore, hierarchy and deep-link flows were not rebuilt.

## Changed files

1. src/components/AdminCategoryTree.tsx
2. src/lib/api.ts
3. src/lib/product-admin-pagination.ts and src/lib/product-admin-pagination.test.ts
4. src/lib/admin-category-catalog.ts and src/lib/admin-category-catalog.test.ts
5. src/test/admin-category-ui-command-wiring.test.ts
6. src/aghbari.css
7. .github/workflows/p1-admin-context-verification.yml

## Verification

- P1 run #43356766216 (https://github.com/Report-Engainall/Nasr1/actions/runs/43356766216): SUCCESS on exact code SHA 49e1684d5b5d64de60ad34c09fe18afacbf88f26 — Vitest, strict TypeScript and production build.
- P2 run #43356766280 (https://github.com/Report-Engainall/Nasr1/actions/runs/43356766280): IN_PROGRESS at checkpoint. Public read-only Playwright smoke had reached browser assertions after building the exact source with isolated placeholder configuration.
- Separate authenticated external customer/order/tenant job: SKIPPED due unavailable external test infrastructure. This is not tenant-isolation acceptance. The dependent local tenant job was not yet terminal at checkpoint time.

## Security and evidence boundaries

This is a UI/read-model addition over an existing admin product RPC. The UI role gate is not claimed as a replacement for server-side authorization or RLS. The change makes no database, auth, RLS, migration, hosted-data, production, Vercel or live integration changes. No production or browser acceptance is claimed until P2 reaches terminal results.

Release status remains NO-GO until all relevant P2 and release acceptance gates have passed on their exact tested source SHA.
