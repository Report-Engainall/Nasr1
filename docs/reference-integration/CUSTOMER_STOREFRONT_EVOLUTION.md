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
