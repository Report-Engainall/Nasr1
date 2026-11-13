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


## Explicit remaining customer-facing gap

The header/catalog search is URL-aware and debounced against the existing server-backed catalog, but a Hydrogen-style predictive suggestion panel (live grouped product/query suggestions with keyboard navigation) has not been implemented in this tranche. Do not mark predictive search complete merely because debounced search exists.


## My Aghbari customer account hub — 2026-11-13

The customer profile now exposes direct navigation to existing account workflows that previously required a detour through other pages. Added routes are invoices (`/invoices`), quotations (`/quotes`), wishlist (`/wishlist`), product comparison (`/compare`), and customer-service cases (`/service-cases`). Existing order history, payments, statement, addresses, returns, warranty/assets, notifications, help and company contacts remain in place.

This is navigation completion only: each card routes to the existing target component and service contract. It does not create a second invoice/quote/wishlist/support implementation, broaden RLS, or infer that missing back-end capabilities are enabled. Customer-only links remain inside the existing `profileAccessMode === "customer"` branch; staff and restricted users retain their prior link sets.

The account hub composition follows the account-as-workspace pattern studied in Shopify Hydrogen's account route, but is independently implemented with Nasr1's TanStack Router routes and existing service components. No Shopify source code or dependency was copied. Recently viewed products remain a separate unimplemented account capability and are not claimed by this change.
