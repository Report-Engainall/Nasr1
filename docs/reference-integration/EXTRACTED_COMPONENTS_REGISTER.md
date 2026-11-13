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
