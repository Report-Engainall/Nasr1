# Reference UI Comparison

**Date:** 2026-11-13  
**Target:** `Report-Engainall/Nasr1`  
**Compared target base:** `55da486475112466e0f456a953ba998daa11acfe`

## Product card interaction

| Concern | Nasr1 before | Reference pattern studied | Nasr1 after |
|---|---|---|---|
| Primary product action | Image wrapper was a clickable `div`; details text was a button | Vercel Shop separates the product link from quick-shop controls rather than nesting buttons | Image is a named native button; details text remains an explicit action |
| Secondary actions | Favorite/compare buttons were descendants of the clickable image wrapper | Vercel Shop uses sibling image/card content and distinct quick-shop control | Favorite/compare are siblings of the image button, with no nested interactive DOM |
| Keyboard behavior | Image-only entry point could not receive keyboard focus | Catalyst uses a visible focus ring on the product-card link | Image action can receive focus and has a focus-visible outline |
| Touch behavior | Action strip appeared only on card hover | Responsive product-card patterns avoid relying on hover as the only reveal | Quick actions remain visible on coarse pointers |
| Product image proportions | Fixed 120px image height | Catalyst exposes controlled aspect ratios; Vercel uses an image container | Nasr1 uses a responsive 4:3 image area while retaining contain-fit product imagery |

## Brand and stack boundaries

- The target keeps the Aghbari green/gold store identity and Arabic-first RTL shell.
- No Next.js, Storefront Kit, Shopify, BigCommerce or Vercel-specific runtime was introduced.
- Existing server-backed catalog, cart, tier pricing privacy and tenant/session behavior remain the source of truth.

## Evidence boundary

This comparison describes the implemented code change; it is not a claim of browser screenshot parity or a production UI acceptance pass. The component test and GitHub Actions result for the implementation commit are the acceptance evidence to consult.


## Inventory evidence semantics — 2026-11-13

| Concern | Previous customer display | Current customer display |
|---|---|---|
| Inventory projection missing | Coerced to zero and shown out of stock | `لم يتم التحقق من المخزون`; add-to-cart disabled |
| Invalid/non-finite/negative quantity | Could be confused with zero | Treated as unknown; add-to-cart disabled |
| Verified zero | Out of stock | Still out of stock |
| Verified positive quantity | Quantity and minimum-order rule | Preserved |


## Predictive search interaction — 2026-11-13

| Concern | Existing behavior | Hydrogen pattern studied | Nasr1 implementation |
|---|---|---|---|
| Search while typing | Debounced URL-aware catalog filter; no suggestion panel | Predictive results are loaded asynchronously and grouped by result type | Header combobox shows a search-phrase action, active category matches and live product matches from the existing paginated RPC |
| Keyboard use | Search input only | Search suggestions support active result navigation | Arrow Up/Down selects an option; Enter opens it; Escape closes the list; ARIA combobox/listbox state is exposed |
| Request freshness | Catalog data may remain cached while a new query is loading | Predictive store keeps the current search state | Product options are withheld until the query/category/availability/session snapshot matches the current input |
| Privacy and runtime | Existing server-backed catalogue remains authoritative | Hydrogen uses its own server handler/store | No Hydrogen runtime is imported; no price, stock-on-hand, tenant or customer-private fields are added to suggestion rows |

The visible query row submits the customer's exact phrase; it is not generated from search-history analytics. Personalized query completion remains outside this implementation. This comparison is implementation documentation, not browser screenshot parity evidence.
