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

## Category page context and direct branch navigation — 2026-11-13

- Subcategory pages now show an accessible path from all categories to the parent category and current child, with the child marked as the active page.
- Direct sibling branches are shown only from the current parent's existing `parent_id` relationship. A child slug associated with another parent remains invalid; no unrelated category is mixed into the branch list.
- The page continues to use the existing category slug helper and `Storefront` product listing; price, availability and order services were not changed.
- Reference pattern: BigCommerce Catalyst `core/app/[locale]/(default)/(faceted)/category/[slug]/page.tsx` (blob `53ac0e71431b45d8854fecddf61551f5d58849c8`) and `core/components/breadcrumbs/fragment.ts` (blob `dd8cdbe070f40f4a58f3810ba6c181df02b48baf`), pinned to `canary` HEAD `4cce7bc3d05be54a449140644eb2119dd8d8c821`; root LICENSE verified MIT. Only information architecture was adapted; no Catalyst source, assets or packages were copied.
- Delivered in PR #436 at merge SHA `0b15e5a64ab3de9616cb8a9593bbeac25e11b048`; P1 and the read-only public Storefront browser smoke passed on exact feature SHA, with P1 passing again after merge.

## Hierarchical category directory — 2026-11-13

- `/categories` now groups each active parent with direct child links, rather than showing the parent and every child as unrelated cards.
- Parent totals equal the existing product count for the parent plus its immediate active children. Each child displays its own direct count. Deeper descendants are kept separately with their immediate-parent route and are not silently dropped or incorrectly rolled into the one-level total.
- Categories whose parent is not in the active public category result remain visible as detached groups. Cyclic or deeper nodes are surfaced separately rather than disappearing.
- Counts come from the existing fully paginated public catalogue read. Inactive categories, inactive products, inactive status and uncategorized products do not inflate counts. No count or category is fabricated.
- Delivered in PR #438 at merge SHA `4451e4625c1cfe0974693ea49d0737a8959fc943`. Exact main P1 passed with 91 test files / 644 tests, strict TypeScript and production build; public Chromium smoke passed 19/19. Hosted authenticated order/tenant acceptance remains distinct and was skipped for unavailable external credentials.

## Verified customer product reviews — 2026-11-13

- Product details now have a real review section backed by tenant-scoped Supabase RPCs. The public summary, rating average, count, and pages are calculated from database rows in the `approved` state only; an empty catalogue starts at zero and never manufactures scores or review text.
- A review can be created or revised only by an active approved customer profile that owns a matching order line for the same active product and organization, where the order state is exactly `delivered`. The browser cannot submit a customer, profile, tenant, order, or moderator identity.
- One review row is maintained per customer/product. Any revision clears prior moderation and returns the row to `pending`; it disappears from public averages until a manager or administrator approves it again.
- The existing Products workspace contains the moderation queue for managers and administrators. Rejection requires a reason; all submit, resubmit, approve and reject actions create actor-attributed audit entries.
- The public response is allow-listed to review id, stars, title, body, date and the verified-purchase marker. Customer name, phone, email, profile/customer/order ids, organization ids, price, cost and stock are not returned.
- Implementation counterpart: `supabase/migrations/20261113110000_storefront_product_reviews.sql`, `src/lib/storefront-product-reviews.ts`, `src/components/StorefrontProductReviews.tsx`, `src/components/StorefrontProductReviewModeration.tsx`, `src/components/Storefront.tsx`, and the existing Products workspace in `src/components/AghbariApp.tsx`.
- This is an independent NASR1 implementation using the current React/TypeScript/Supabase stack. No external storefront source, package, asset or paid provider was added.
- Scope boundary: product Q&A, review photos, ratings/review synchronization to an external channel, and external hosted-account acceptance are not included in this change.
- PR #439: https://github.com/Report-Engainall/Nasr1/pull/439. Acceptance remains pending until P1 and local PostgreSQL P2 both pass on the final PR head. No hosted migration or production deployment has been run.

## Moderated storefront product questions and answers — 2026-11-13

- Product details now include a customer question-and-answer section beside verified reviews. Visitors see answered questions only; pending and rejected questions remain private to their submitting customer and the same-tenant moderation team.
- A signed-in approved customer can ask about an active product before or after purchase. The server marks whether the customer has a delivered matching purchase; this marker is factual and does not expose customer, order, or tenant identifiers.
- Managers and administrators can publish a bounded answer or reject a question with a required reason. Submission, answer, and rejection are attributed to the acting profile in the existing audit log.
- The feature reuses NASR1's current customer identity, organization, Supabase RPC, product detail, and Products workspace. It adds no duplicate account, route, order or permission system.
- Implementation: \`supabase/migrations/20261113130000_storefront_product_questions.sql\`, \`src/lib/storefront-product-questions.ts\`, \`src/components/StorefrontProductQuestions.tsx\`, \`src/components/StorefrontProductQuestionModeration.tsx\`, and the existing \`Storefront.tsx\` / Products workspace.
- Independent NASR1 implementation; no external project source, UI asset, package or paid provider was copied or added. P1 and isolated PostgreSQL 17 acceptance are required before merge.

## Side-by-side product comparison workspace — 2026-11-14

- The existing compare selection, three-product limit, local browser persistence, product-card action and storefront view were retained; the compare route now renders a true specification comparison table instead of repeating the product grid.
- Each selected product is compared using the current tenant-scoped catalog projection: category, item code, SKU, unit, published description, server-returned display price, available quantity, minimum order quantity, order multiple and featured status.
- Price display continues through the existing fail-closed `resolveStorefrontPricePresentation` / `StorefrontPricePresentation` contract. Hidden, missing, malformed or zero-sentinel prices are not reconstructed from product-tier or client-side price fields.
- Stock is shown as unavailable for checking when the inventory projection is missing or malformed; it is not incorrectly labeled as out of stock. Add-to-cart is disabled unless the available quantity is authoritative and meets the product's minimum order quantity.
- The comparison table is keyboard-focusable and horizontally scrollable on small screens. Product detail, remove-from-comparison and add-to-cart actions call the existing storefront handlers; no second comparison store, catalog query or cart path was introduced.
- Implementation: `src/components/store/ProductComparison.tsx`, `src/components/store/ProductComparison.test.tsx`, and the existing compare-view integration in `src/components/Storefront.tsx`.
- Independently implemented on NASR1's React/TypeScript stack. No external project source, assets, packages, or paid service was copied or added. Component tests cover actual row values, price suppression, unknown stock, disabled ordering, actions, and retry state. CI and full browser acceptance remain separate from source implementation.

## Customer-profile isolation for compare preferences — 2026-11-14

- The existing three-product compare list is retained, but authenticated customer selections are now stored under a profile-specific key instead of the shared guest key. Guest sessions keep the legacy guest key for backwards compatibility.
- Customer A's selections are therefore not loaded into Customer B's session on the same browser, and guest comparison selections are not inherited by an authenticated customer.
- The persisted value remains only a bounded set of product IDs (maximum three). Product names, prices, availability and tenant data are never copied into this preference cache; each comparison row still resolves from the current identity-bound catalog.
- Storage read/write failures fail closed to an empty local selection and do not alter server catalog state or authorization. This is a local convenience isolation improvement, not cloud sync or a security boundary replacing RLS.
- Implementation: `src/lib/storefront-compare.ts`, `src/lib/storefront-compare.test.ts`, and `src/components/Storefront.tsx`.
- Tests cover guest-key compatibility, distinct-profile isolation, bounded/normalized selection, corrupt JSON and unavailable browser storage. No migration, RPC, policy, package or paid provider is added.


## Accessible product media carousel and lightbox — 2026-11-14

- Extracted the existing product-image display into src/components/ProductMediaGallery.tsx; the active product route still loads the gallery through src/components/Storefront.tsx and the existing product_media projection.
- One selected index drives the main image, thumbnail rail, stage controls and lightbox. Previous/next controls wrap within the real image list; the RTL gallery also supports ArrowLeft/ArrowRight, Home and End.
- The lightbox now traps keyboard focus, closes with Escape or backdrop click, restores focus to the image trigger, and locks background scrolling while open. The image counter is announced for assistive technology.
- Touch users can swipe the enlarged image; the same selection updates the thumbnail pressed state. Non-HTTPS URLs are filtered before display; the current product image projection and upload/storage services are unchanged.
- Added src/components/ProductMediaGallery.test.tsx for synchronized selection, wrapping navigation, RTL keyboard behavior, focus trapping/restoration, single-image behavior and unsafe URL filtering.
- Design reference: BigCommerce Catalyst core/vibes/soul/sections/product-detail/product-gallery.tsx, branch canary, commit 22de59ae265ab754d7105c67a769e6015bcf6ce1, blob b11c42cea3ae1fb2f46590b077f2a427c2b55ec3; root LICENSE read at the same commit and confirmed MIT. NASR1 independently implements the synchronized gallery behavior; no Catalyst source, asset, package or dependency was copied.
- Source commit: 4e6b6114e262eff4387c9cc421f8ac06a3bfbf7d. P1/P2 exact-SHA checks are recorded separately; real Storage upload and authenticated tenant acceptance remain open. No migration, RPC, RLS, role, finance or deployment change was made.


### Exact-SHA verification update — 2026-11-14

- Source code SHA: 4e6b6114e262eff4387c9cc421f8ac06a3bfbf7d (retained in current main ancestry).
- P1 workflow 43528039098: SUCCESS on that exact code SHA. Vitest 114/114 files and 805/805 tests passed, including ProductMediaGallery.test.tsx (5/5); strict TypeScript and production build passed.
- P2 workflow 43528039111: public Chromium UI smoke SUCCESS, 19/19 assertions. It covers the existing public/customer route, RTL, viewport and price-privacy smoke paths; it is not claimed as a dedicated visual test of every gallery interaction.
- Isolated local Supabase/PostgreSQL 17 order/tenant acceptance job 132239609646 was still IN_PROGRESS at this documentation update. Hosted authenticated customer/order/tenant E2E remains SKIPPED. Storage-backed gallery upload and live authenticated media UAT remain open.
