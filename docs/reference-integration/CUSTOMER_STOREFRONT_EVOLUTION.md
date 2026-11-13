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

## My Aghbari customer account hub — 2026-11-13

The customer profile now exposes direct navigation to existing account workflows that previously required a detour through other pages. Added routes are invoices (`/invoices`), quotations (`/quotes`), wishlist (`/wishlist`), product comparison (`/compare`), and customer-service cases (`/service-cases`). Existing order history, payments, statement, addresses, returns, warranty/assets, notifications, help and company contacts remain in place.

This is navigation completion only: each card routes to the existing target component and service contract. It does not create a second invoice/quote/wishlist/support implementation, broaden RLS, or infer that missing back-end capabilities are enabled. Customer-only links remain inside the existing `profileAccessMode === "customer"` branch; staff and restricted users retain their prior link sets.

The account hub composition follows the account-as-workspace pattern studied in Shopify Hydrogen's account route, but is independently implemented with Nasr1's TanStack Router routes and existing service components. No Shopify source code or dependency was copied. The separate recently viewed capability is now implemented independently and is documented below.


## Recently viewed products in My Aghbari — 2026-11-13

- Added a customer-only recently viewed panel inside the existing /profile account hub; no separate route or duplicate wishlist was introduced.
- Visits are recorded only after an actual product detail has resolved inside a verified customer-role session. Anonymous, staff and restricted profiles are not recorded.
- The browser stores only the public product ID, display name, item code, safe image URL and viewed timestamp. It does not retain price, cost, margin, stock, availability, customer fields or tenant identifiers.
- The panel supports opening the existing /product/$id route, removing one item and clearing the current profile's list. Product details, including server-authoritative price and availability, are fetched again on open.
- Storage is bounded to the latest 12 unique products and scoped to the authenticated profile in the current browser. This is local-device history only, not cloud synchronization, cross-device history or personalized server analytics.
- Shopify Hydrogen's account workspace pattern remains the design reference (templates/react-router/app/routes/account.tsx; main commit 043094b0ab0b5b01299e75da33d3f4e2914fda6a; MIT template license already verified). Nasr1's history and storage behavior are independently implemented; no Hydrogen source, package or asset was copied.
