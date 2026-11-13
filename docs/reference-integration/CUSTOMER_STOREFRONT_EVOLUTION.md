# Customer Storefront Evolution

**Target:** Nasr1 customer storefront  
**Date:** 2026-11-13  
**Base HEAD:** `55da486475112466e0f456a953ba998daa11acfe`

## Existing live route/component structure

The current application uses TanStack Router routes and the shared `Storefront` component, not the older React Router `src/pages/store/*` implementation.

| Customer experience | Current route / component |
|---|---|
| Store home | `src/routes/index.tsx` |
| Catalog and URL-backed category/search filters | `src/routes/catalog.tsx` |
| Product listing | `src/routes/products.tsx` |
| Product detail | `src/routes/product.$id.tsx` |
| Cart | `src/routes/cart.tsx` |
| Checkout | `src/routes/checkout.tsx` |
| Saved products and comparison | `src/components/Storefront.tsx` state/views plus existing routes |
| Advanced search | `src/components/AdvancedStorefrontSearchPage.tsx` |

## Existing capabilities retained

- Server-backed paginated public catalog through `get_storefront_catalog_page`.
- Search, category selection and known-availability filtering.
- Product detail, image gallery/zoom and alternate sale units.
- Wishlist and compare actions.
- Cart quantity validation, offline draft handling and authenticated cart sync.
- Server-computed order/cart pricing presentation with fail-closed visibility.
- Customer identity/session boundary checks and tenant-aware server reads.

## Implemented in this integration

- The product image is now an explicit, named `button` instead of a click-only `div`.
- The image details action is keyboard-focusable and reports the product name.
- Favorite and comparison buttons are separate sibling controls, not nested inside the image trigger.
- Favorite/compare accessible names now identify the product and reflect pressed state.
- Card quick actions appear on hover, keyboard focus-within, and touch/coarse-pointer devices.
- Product media has a responsive 4:3 aspect ratio; images lazy-load and decode asynchronously.

## Not claimed complete by this change

This is a targeted product-card accessibility and visual improvement. It does not claim completion of every customer account, support, warranty, payment, delivery, rating, subscription or marketing feature in the master brief. Any missing server-backed function must be implemented against a verified contract before it is shown as available.


## Follow-up storefront data-truth correction — 2026-11-13

Product cards now distinguish an unavailable inventory projection from a verified zero balance. Unknown, non-finite or negative stock is explicitly unverified and cannot be added to the cart; an authoritative zero remains out of stock. The change is covered by target-owned component regression tests and does not change server inventory or checkout contracts.


## Predictive catalogue search — implemented on Path A (2026-11-13)

- Added `src/components/StorefrontPredictiveSearch.tsx` and connected it to the existing header in `src/components/Storefront.tsx`.
- The popup groups an explicit **search this phrase** action, matching active categories, and product results from the existing `get_storefront_catalog_page` RPC. It does not fabricate prior-customer query suggestions or run a second catalogue search.
- Arabic category matching uses the existing `normalizeArabicSearchText` utility. Inactive categories are excluded.
- Product suggestions are rendered only when the response snapshot matches the current normalized query, category, availability filter, and authenticated identity. During debounce/fetch or offline states, stale product rows are withheld.
- Arrow Up/Down, Enter and Escape are supported; the input exposes combobox/listbox semantics and active-option announcements. Selecting a product opens its existing product route; selecting the phrase or category navigates to `/catalog` with URL-backed search state.
- The suggestion cards show only product name, item code and public image. They do not surface price, cost, margin, stock-on-hand, tenant IDs or private customer data.
- No new package, API endpoint, RPC, SQL migration, RLS policy, auth change or CSS-global change was introduced.
- Reference pattern: Shopify Hydrogen predictive search (MIT) uses a server-backed predictive search handler/store; Nasr1 independently adapts the interaction to its existing paginated RPC and TanStack routes. No Hydrogen source code was copied.

## Remaining predictive-search boundaries

- Personalized or learned query completions from customer search history are **not implemented**; no approved privacy-safe search-history contract was available in this change.
- This is a target-owned UI/component-test implementation. It is not a claim of hosted SMS, production, authenticated order/tenant, or full Playwright acceptance; exact-SHA P1 CI is the acceptance gate for this PR.
