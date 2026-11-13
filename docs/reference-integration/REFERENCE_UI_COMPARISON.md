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

## Customer account hub navigation — 2026-11-13

| Concern | Nasr1 before | Reference pattern studied | Nasr1 after |
|---|---|---|---|
| Customer account entry points | Core account links existed, but invoices, quotes, wishlist, comparison and support cases were not direct links from My Aghbari | Shopify Hydrogen's account route presents the account as a dedicated workspace for customer identity and order activity | Existing Nasr1 modules are now directly reachable from the customer-only profile link grid |
| Feature ownership | Several capabilities already existed behind independent routes | Keep account navigation separate from the underlying feature implementation | Each card reuses its existing route; no duplicate module, database table or RPC was introduced |
| Role exposure | Customer-specific links were already gated by profile access mode | Account-specific content remains bound to authenticated customer identity | Added links are inside the customer-only branch; staff and restricted profiles do not receive the new customer links |

This is a route-composition change, not a screenshot-parity claim. The Hydrogen account route was inspected at `043094b0ab0b5b01299e75da33d3f4e2914fda6a` (`templates/react-router/app/routes/account.tsx`, blob `ec660e4a801d81dcf26e3413a5d1cb89a8a16963`); only its account-workspace organization was adapted.


## My Aghbari — recently viewed products — 2026-11-13

| Concern | Before | Reference principle | NASR1 result |
|---|---|---|---|
| Browsing continuity | Product detail views were not surfaced inside the account hub | Treat the customer account as a workspace for commerce activities | A new customer-only section appears within the existing profile page and links to existing product-detail routes |
| Data minimization | No recently viewed list existed | Reuse the verified account boundary and avoid a second identity model | Retain only public product ID, name, item code, safe image URL and timestamp in a profile-scoped browser key |
| Data freshness | No history entry point | Let the product route remain authoritative for current commerce data | Reopening a viewed item fetches the current product and server-authoritative price/availability; local history is not used as a pricing or stock source |
| Customer control | No view-history controls | Keep the small account feature actionable and reversible | Remove one entry or clear this profile's local history |

The interaction takes inspiration from Shopify Hydrogen's account workspace pattern; this is an independent implementation, not copied code or screenshot-parity evidence. The history is browser-local and is not synchronized across devices.

## Storefront category navigation and directory hierarchy — 2026-11-13

| Concern | Before | Reference principle | NASR1 result |
|---|---|---|---|
| Subcategory context | Parent name was plain text; no explicit path or sibling route collection | BigCommerce Catalyst category page and breadcrumb fragment expose the active category within its navigation context | Accessible RTL path: all categories → parent → active child; active state is announced and direct sibling links remain within the same parent |
| Category directory | Parent and child categories appeared as unrelated cards in one flat grid | Organize the category landing area around parent context, keeping the route into a child category explicit | `/categories` groups active direct children below their parent; child links navigate through existing parent/subcategory routes |
| Product counts | Counts were shown independently on every flat card | Present count in the context of the category level being browsed | Parent totals include the parent and immediate children only; children show their direct count; deeper levels remain separately reachable |
| Incomplete hierarchy | A public projection with an absent parent or deeper relation could be flattened or obscured | Preserve navigation context and avoid inventing a missing hierarchy | Detached roots and additional levels remain visible with the immediate known relation; no category or product count is fabricated |

Reference inspection: BigCommerce Catalyst `canary` HEAD `4cce7bc3d05be54a449140644eb2119dd8d8c821`, category page blob `53ac0e71431b45d8854fecddf61551f5d58849c8`, breadcrumb fragment blob `dd8cdbe070f40f4a58f3810ba6c181df02b48baf`, root MIT LICENSE read. This is an architectural comparison, not a screenshot-parity claim; no Catalyst source, asset or dependency was copied.

Delivery: PR #436 merged at `0b15e5a64ab3de9616cb8a9593bbeac25e11b048`; PR #438 merged at `4451e4625c1cfe0974693ea49d0737a8959fc943`. Exact-main P1: 91 test files / 644 tests, strict TypeScript and build SUCCESS. Public Chromium smoke: 19/19 SUCCESS. Hosted authenticated order/tenant E2E remains SKIPPED.
## Merchant intelligence — multi-source growth radar — 2026-11-13

| Concern | Apache Superset source pattern studied | NASR1 adaptation |
|---|---|---|
| Dashboard composition | `DashboardGrid.tsx` composes dashboard content into distinct layout regions with explicit empty-state behavior | The radar groups opportunity cards and a separate three-source coverage region within the current intelligence workspace; it does not import Superset's drag/drop dashboard |
| Source/filters visibility | `FiltersBadge/DetailsPanel/index.tsx` keeps applied and incompatible filter states visible and inspectable | Each growth source shows its own completeness status, evidence/signal counts, warnings and failure message so a healthy source does not mask a failed source |
| Data/presentation boundary | `ChartContainer.tsx` keeps connected data/action wiring at a boundary around the presentation component | NASR1 reads evidence through tenant-authorized Supabase clients, builds one shared deterministic radar, and presents it in a target-owned React component and the assistant |

The inspected Superset revision is commit `4ac8bfe29f0399752197f489979d41f6b46c2f9b` on `master`; exact source-file blobs are recorded in `EXTRACTED_COMPONENTS_REGISTER.md`. The root `LICENSE.txt` and file-level Apache-2.0 headers were read. This is an architectural/UI reference comparison, not a pixel-parity claim and not a code transfer.

The NASR1 interface remains Arabic-first RTL and follows existing design tokens/components. No Superset dependency, Redux store, chart runtime, dashboard schema or code was added.
