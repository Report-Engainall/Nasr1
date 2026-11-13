# Extracted Components Register

**Target:** `Report-Engainall/Nasr1` / `main`  
**Base HEAD:** `55da486475112466e0f456a953ba998daa11acfe`  
**Date:** 2026-11-13

## Implemented adaptations

| Reference project and source | Source commit / file blob | License | Nasr1 destination | Adaptation | Code transfer |
|---|---|---|---|---|---|
| Vercel Shop — `components/product-card/product-card.tsx` | Commit `c92f3df11e2fd3c5cf7b870518aa43e5534725eb`; blob `3cf8ff5975eafc243891911f42b388c6ce38d3ae` | MIT | `src/components/Storefront.tsx` | Keep primary product navigation separate from secondary quick actions; avoid nested interactive controls | Independent reimplementation; no source code copied |
| BigCommerce Catalyst — `core/vibes/soul/primitives/product-card/index.tsx` | Commit `4cce7bc3d05be54a449140644eb2119dd8d8c821`; blob `0f98b768f379c94e364a945c416af595fb667f4f` | MIT | `src/components/Storefront.tsx`, `src/aghbari.css` | Product image aspect ratio and explicit focus-visible treatment | Independent reimplementation; no source code copied |
| Nasr1 own test coverage | Target base `55da486475112466e0f456a953ba998daa11acfe` | Project-owned | `src/components/Storefront.product-grid.test.tsx` | Tests image details action, focusability, sibling quick actions and callback wiring | New target-owned test |
| Shopify Hydrogen — `README.md` predictive-search architecture and official predictive-search guidance | `main` commit `043094b0ab0b5b01299e75da33d3f4e2914fda6a`; README blob `950472436d8a52807ef96e40f46df999e2d65ba5`; root `LICENSE.md` blob `2f2d7cf0012189f59ffe2f1bff10aca6ab4dc478` | MIT | `src/components/StorefrontPredictiveSearch.tsx`, `src/components/Storefront.tsx`, `src/components/Storefront.product-grid.test.tsx` | Grouped query-action/category/product suggestions, keyboard navigation, and stale-response discipline adapted to the existing paginated storefront RPC and TanStack URL state | Independent reimplementation; no Hydrogen code or dependency copied |

| Shopify Hydrogen — `templates/react-router/app/routes/account.tsx` | Commit `043094b0ab0b5b01299e75da33d3f4e2914fda6a`; source blob `ec660e4a801d81dcf26e3413a5d1cb89a8a16963` | MIT; `templates/react-router/LICENSE` read (blob `bf165a7b356128f2dee05ee629364263f98c4d2e`) | `src/routes/profile.tsx` | Account workspace organizes identity and order-service entry points; Nasr1 extends its existing account hub with direct links to already implemented account modules | Independent adaptation; no source code copied |

## Existing target modules preserved

- `src/lib/storefront-catalog.ts`: server RPC catalog pagination and payload validation.
- `src/lib/customer-cart.ts`: server cart sync contract; only product IDs and quantities are synchronized.
- `src/lib/storefront-price-visibility.ts`: fail-closed server-price presentation and whitelisted order preview lines.
- `src/components/Storefront.tsx`: existing product, wishlist, compare, cart, checkout, offline draft and identity-scoped state.
- No changes were made to product pricing, server RPCs, RLS, migrations, inventory writes, checkout persistence or authentication in this UI accessibility change.

## Dependency impact

No packages were added, removed or upgraded. The change uses the application's existing React, lucide-react and CSS stack.

## Target-side immutable evidence

- Storefront implementation commit: `bc39fad922bae6802f5c0831d6189e89ec21e9d0` (parent `55da486475112466e0f456a953ba998daa11acfe`).
- `src/components/Storefront.tsx` blob: `f6a26d8ae587ba1a222cae6269c98544d06024b3`.
- `src/aghbari.css` blob: `f5e55183d1602dbd462c39a0948ad79124cf7c3a`.
- `src/components/Storefront.product-grid.test.tsx` blob: `7cae87a4998b2ace91245decdb2b80680cd621bd`.
- P1 workflow path-coverage blob: `300fd08e2a1c697b1c94487eabc745cfe249be5b`.
- Exact-SHA CI proof: P1 full Vitest, strict TypeScript and production build passed (run `43333792228`); P2 public read-only Storefront browser assertions passed (run `43333792309`). The same P2 run failed separately in the local authenticated price-grid precondition; no database acceptance pass is claimed.


## Additional target-owned correction — stock evidence state

- `src/components/Storefront.tsx`: absent, non-finite or negative stock projection is no longer coerced into a zero balance. The customer sees an unverified-stock label; adding to cart remains disabled until a verified quantity is returned.
- Verified zero quantity continues to display out of stock.
- `src/components/Storefront.product-grid.test.tsx`: regression tests cover unknown stock and authoritative zero.
- No reference code was copied, no new dependency was introduced, and no inventory write/RPC/RLS/migration was changed.


## Predictive search target files — 2026-11-13

- `src/components/StorefrontPredictiveSearch.tsx`: accessible grouped autocomplete panel; no data-fetching dependency of its own.
- `src/components/Storefront.tsx`: supplies only the current paginated RPC result after matching query/category/availability/session scope, and routes selected results to existing product/catalog pages.
- `src/components/Storefront.product-grid.test.tsx`: adds keyboard selection, category selection, query submission, Escape dismissal and stale-result suppression coverage.
- Existing `src/lib/storefront-catalog.ts` and `get_storefront_catalog_page` remain the only product-search source. No SQL/RPC/RLS/auth files or dependencies were changed.


## Customer account history adaptation — 2026-11-13

| Reference | Inspected source / pin | License | NASR1 counterpart | Transfer decision |
|---|---|---|---|---|
| Shopify Hydrogen account workspace pattern | templates/react-router/app/routes/account.tsx; branch main; commit 043094b0ab0b5b01299e75da33d3f4e2914fda6a; blob ec660e4a801d81dcf26e3413a5d1cb89a8a16963 | MIT; React Router template license blob bf165a7b356128f2dee05ee629364263f98c4d2e verified in the previous account-hub checkpoint | src/lib/recently-viewed-products.ts; src/lib/recently-viewed-products.test.ts; src/components/Storefront.tsx; src/routes/profile.tsx; src/routes/profile.navigation.test.tsx | Independent account-scoped recently viewed history; no Hydrogen source, dependency or assets copied |

### NASR1 implementation boundary

- The visit event is raised from the existing Storefront product-detail flow after the current identity-bound product is resolved.
- Storage is keyed by the authenticated customer profile ID and bounded to 12 unique entries. Only the public card snapshot and view timestamp are retained.
- Customer-only visibility is enforced by the existing profile access mode; the account hub does not expose this module to staff or restricted sessions.
- Reopening a history item goes through the existing product route, so current price and availability are loaded again rather than read from historical browser data.
- There is no schema, RPC, migration, server synchronization, cross-device sync, new dependency or change to authorization/RLS in this implementation.

## Customer category navigation and hierarchy — 2026-11-13

| Reference | Inspected source / pin | License | NASR1 counterpart | Transfer decision |
|---|---|---|---|---|
| BigCommerce Catalyst category page and breadcrumb composition | `core/app/[locale]/(default)/(faceted)/category/[slug]/page.tsx` blob `53ac0e71431b45d8854fecddf61551f5d58849c8`; `core/components/breadcrumbs/fragment.ts` blob `dd8cdbe070f40f4a58f3810ba6c181df02b48baf`; `canary` HEAD `4cce7bc3d05be54a449140644eb2119dd8d8c821` | Root LICENSE read; MIT | `src/components/StorefrontCategoryLandingPage.tsx`; `src/components/StorefrontCategoryLandingPage.test.tsx`; `e2e/public-storefront-smoke.spec.ts` | Independent RTL breadcrumb, active child state and sibling links; no source code or dependency copied |
| NASR1 category hierarchy data projection | Native NASR1 `Category.parent_id`, `fetchCategories`, `fetchProducts`, and `storefrontCategorySlug` | First-party project code | `src/lib/storefront-category-groups.ts`; `src/lib/storefront-category-groups.test.ts`; `src/components/StorefrontCollectionsPage.tsx`; `src/components/StorefrontCollectionsPage.test.tsx` | Target-native hierarchy grouping and data-derived counts; retains orphan/deeper categories; no external component transferred |

- PR #436 merged at `0b15e5a64ab3de9616cb8a9593bbeac25e11b048`; PR #438 merged at `4451e4625c1cfe0974693ea49d0737a8959fc943`.
- Category counts reuse the complete public paginated catalogue reader already used by the directory; the presentation adds no product or category read contract, database table or RPC.
## Growth Opportunity Radar source integration — 2026-11-13

| Reference project and source | Pin / source blob | License | NASR1 destination | Adaptation decision |
|---|---|---|---|---|
| Apache Superset — `superset-frontend/src/dashboard/components/DashboardGrid.tsx` | `master` / commit `4ac8bfe29f0399752197f489979d41f6b46c2f9b`; blob `1e7f816e6a257bad557ff18db28da8e0c03b9ee2` | Apache-2.0; root `LICENSE.txt` read at the same commit | `src/components/intelligence/GrowthOpportunityRadar.tsx` and `src/components/intelligence/IntelligenceWorkspace.tsx` | Use dashboard composition and clear empty/occupied-region patterns as design reference; NASR1 retains its current cards and RTL layout. No Superset grid or drag/drop code copied |
| Apache Superset — `superset-frontend/src/dashboard/components/FiltersBadge/DetailsPanel/index.tsx` | same pin; blob `1df3cbf4bbbecaccc5bfc1bf209f9cebc0ab2b74` | Apache-2.0 file header; root license read | `GrowthOpportunityRadar.tsx` | Apply the principle that source/coverage status is explicit and separately inspectable. No Redux/popover/filter implementation copied |
| Apache Superset — `superset-frontend/src/components/Chart/ChartContainer.tsx` | same pin; blob `70a7c6e7c04974425d74dc1112b2848278997e0c` | Apache-2.0 file header; root license read | `customer-retention-client.ts`, `IntelligenceWorkspace.tsx`, `natural-language-assistant-client.ts` | Preserve a clear data-access / presentation boundary; NASR1 uses existing Supabase clients and its own React components. No Superset Redux or chart dependency imported |
| NASR1-owned implementation | feature branch and PR #437 | Project-owned | `growth-opportunities.ts`, `customer-retention-client.ts`, `GrowthOpportunityRadar.tsx`, `IntelligenceWorkspace.tsx`, `natural-language-assistant-client.ts` | Multi-source deterministic aggregation, source coverage and shared assistant calculation implemented inside existing contracts; no reference source code copied |

### Proof and data boundary

- The customer, unavailable-product-demand and product-performance readers are existing NASR1 services. They are invoked concurrently with one period and one `asOf`, and each retains its own authorization and completeness result.
- The combined result is not labelled VERIFIED unless all three source populations are verified and no evidence or metric identifiers collide.
- No direct quote-to-order conversion is claimed without a verified relation; no purchase order is created automatically.
- No third-party source, asset, runtime, package or database component was copied from Superset.

## Verified customer product review workflow — 2026-11-13

| Origin / reference | Inspected source and pin | License / transfer | NASR1 implementation | Decision |
|---|---|---|---|---|
| NASR1 existing tenant/auth/audit/RPC patterns | Existing `profiles`, `customers`, `orders`, `order_items`, `audit_logs`, `current_profile_id()`, `is_staff()`, and `public_storefront_organization_id()` | First-party code | `supabase/migrations/20261113110000_storefront_product_reviews.sql` | Reuse the existing identity, tenant boundary and audit model; no second auth or permissions layer |
| Existing product detail and catalog workspaces | `src/components/Storefront.tsx`; `src/components/AghbariApp.tsx` | First-party code | `src/components/StorefrontProductReviews.tsx`; `src/components/StorefrontProductReviewModeration.tsx` | Extend existing product and catalog surfaces, not new routes or duplicate product modules |
| Existing Supabase RPC client | `src/lib/supabase.ts` and current `@/lib/supabase` client | First-party code | `src/lib/storefront-product-reviews.ts` | Narrow RPC service; browser table grants remain revoked |
| Target-native automated acceptance | Existing P1 Vitest/TypeScript workflow and P2 local PostgreSQL 17 workflow | First-party code | `src/lib/storefront-product-reviews.test.ts`; `src/components/StorefrontProductReviews.test.tsx`; `src/components/StorefrontProductReviewModeration.test.tsx`; `scripts/test-storefront-product-reviews.mjs` | Tests response allow-listing, real delivered-order gating, tenant denial, moderation, re-review and audit |

### Transfer and safety record

- No source file, UI asset, package, dependency or code block was copied from ERPNext, Dolibarr, Medusa, Vendure, Saleor, BigCommerce Catalyst, Vercel Shop, Hydrogen, GraphCommerce, or other listed projects for this feature.
- The review lifecycle was written directly against NASR1's current customer/order/product and audit schema. It does not create a second order, identity, role, or tenant model.
- Direct `anon` / `authenticated` table privileges are revoked. Public list RPC returns approved-only allow-listed data; customer context and submission derive identity from `auth.uid()`; moderation is restricted to the same-tenant admin/manager roles.
- PR #439 is awaiting exact-head CI acceptance. The local PostgreSQL test is wired into the existing P2 workflow but has not yet been claimed as passed.

## Moderated product questions and answers — 2026-11-13

| Origin / reference | Inspected source and pin | License / transfer | NASR1 implementation | Decision |
|---|---|---|---|---|
| Existing NASR1 customer/order/product/RPC/audit model | \`profiles\`, \`customers\`, \`products\`, \`orders\`, \`audit_logs\`, \`auth.uid()\`, \`public_storefront_organization_id()\`, and \`is_staff()\` | First-party code | \`supabase/migrations/20261113130000_storefront_product_questions.sql\` | Use the existing tenant, identity, and audit model; no parallel auth or tenant layer |
| Existing product detail and Products workspace | \`src/components/Storefront.tsx\`, \`src/components/AghbariApp.tsx\` | First-party code | \`StorefrontProductQuestions.tsx\`, \`StorefrontProductQuestionModeration.tsx\` | Add Q&A to the existing product page and Products workspace |
| Existing Supabase client | \`src/lib/supabase.ts\` | First-party code | \`src/lib/storefront-product-questions.ts\` | Narrow RPC-only access; browser table privileges remain revoked |
| Existing P1/P2 acceptance | Vitest, TypeScript, local PostgreSQL 17 and Playwright workflows | First-party code | \`*.test.ts\`, \`*.test.tsx\`, \`scripts/test-storefront-product-questions.mjs\` | Verify public allow-list, customer-private history, manager moderation, tenant isolation and audit |

- No implementation source, package or UI asset was copied from the listed external repositories. The workflow is independently implemented within NASR1.
- Public RPC returns answered Q&A only. Customer context returns only that customer's own questions. Manager queue and answer/reject RPCs require an active same-tenant admin/manager. Direct browser table access is revoked.
