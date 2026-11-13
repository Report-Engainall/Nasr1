# GitHub Reference Catalog

**Repository under implementation:** `Report-Engainall/Nasr1`  
**Branch:** `main`  
**Reconciliation date:** 2026-11-13  
**Base HEAD inspected before this integration:** `55da486475112466e0f456a953ba998daa11acfe`

## Sources inspected at pinned commits

| Source | Branch | Inspected commit | Relevant source path | License verification | Use in this integration |
|---|---|---|---|---|---|
| [Vercel Shop](https://github.com/vercel/shop) | `main` | `c92f3df11e2fd3c5cf7b870518aa43e5534725eb` | `components/product-card/product-card.tsx` (blob `3cf8ff5975eafc243891911f42b388c6ce38d3ae`) | MIT; root `LICENSE` read at pinned commit | Product-card interaction architecture studied; no framework-bound code copied |
| [BigCommerce Catalyst](https://github.com/bigcommerce/catalyst) | `canary` | `4cce7bc3d05be54a449140644eb2119dd8d8c821` | `core/vibes/soul/primitives/product-card/index.tsx` (blob `0f98b768f379c94e364a945c416af595fb667f4f`) and `core/vibes/soul/sections/products-list-section/filters-panel.tsx` | MIT; root `LICENSE` read at pinned commit | Product-card aspect-ratio and focus treatment studied; no Next.js/Storefront Kit code copied |
| [Radix UI Primitives](https://github.com/radix-ui/primitives) | `main` | `eb3a2b7091293e27df8f9ba906632d8daa3d81a3` | Repository primitives | MIT; root `LICENSE` read at pinned commit | Compatibility/reference check only; no dependency or code added |

## Reference sources queued for dedicated file/license inspection

The following repositories were named in the implementation brief. They remain reference candidates; this integration did **not** claim code extraction, commit-level review, or license approval for them.

| Repository | Official URL | Status |
|---|---|---|
| ERPNext | https://github.com/frappe/erpnext | NOT_REVIEWED — no code used |
| Dolibarr | https://github.com/Dolibarr/dolibarr | NOT_REVIEWED — no code used |
| IDURAR ERP CRM | https://github.com/idurar/idurar-erp-crm | NOT_REVIEWED — no code used |
| Medusa | https://github.com/medusajs/medusa | NOT_REVIEWED — no code used |
| Vendure | https://github.com/vendurehq/vendure | NOT_REVIEWED — no code used |
| Saleor | https://github.com/saleor/saleor | NOT_REVIEWED — no code used |
| InvenTree | https://github.com/inventree/InvenTree | NOT_REVIEWED — no code used |
| ModernWMS | https://github.com/fjykTec/ModernWMS | NOT_REVIEWED — no code used |
| Frappe Ecommerce Integrations | https://github.com/frappe/ecommerce_integrations | NOT_REVIEWED — no code used |
| Apache Superset | https://github.com/apache/superset | NOT_REVIEWED — no code used |
| Metabase | https://github.com/metabase/metabase | NOT_REVIEWED — no code used |
| Shopify Hydrogen | https://github.com/Shopify/hydrogen | FILE_REVIEWED — account route and MIT template license checked; no code copied |
| Saleor Storefront | https://github.com/saleor/storefront | LICENSE_REVIEW_REQUIRED — no code used |
| GraphCommerce | https://github.com/graphcommerce-org/graphcommerce | LICENSE_REVIEW_REQUIRED — no code used |
| Medusa Next.js Starter | https://github.com/medusajs/nextjs-starter-medusa | ARCHIVED_REFERENCE_ONLY — no code used |
| shadcn/ui | https://github.com/shadcn-ui/ui | NOT_REVIEWED — no code used |
| HeroUI | https://github.com/heroui-inc/heroui | NOT_REVIEWED — no code used |

## Extraction policy

- A repository being public on GitHub is not permission to copy its code.
- Framework-specific files are not transplanted into the TanStack Start application merely because their UI looks suitable.
- Reusable ideas are reimplemented against Nasr1's existing React, TypeScript, TanStack Router and Supabase contracts.
- A component may be copied only after its exact file-level license, notices, and dependency licenses are checked.
- No dependency was added in this integration.


## GitHub snapshot pinned 2026-11-13

The default branches and branch-tip commits below were retrieved from the official GitHub repositories. This is repository-level verification; it does not imply that every source file, nested license, or transitive dependency was reviewed.

| Project | Repository | Branch | Pinned HEAD | License observation |
|---|---|---|---|---|
| ERPNext | [frappe/erpnext](https://github.com/frappe/erpnext) | `develop` | `2db122fbd545b3754d117efd489a4ff705090db8` | GPL-3.0 metadata |
| Dolibarr | [Dolibarr/dolibarr](https://github.com/Dolibarr/dolibarr) | `develop` | `35c2e5c48e2f9abea5fd219e49b956f278abbef7` | GPL-3.0 metadata |
| IDURAR ERP CRM | [idurar/idurar-erp-crm](https://github.com/idurar/idurar-erp-crm) | `master` | `e935dec13cf8b6082a7e7fc4736669e5151a80a3` | AGPL-3.0 metadata |
| Medusa | [medusajs/medusa](https://github.com/medusajs/medusa) | `develop` | `5fd67e5e7ba092ed4d027d883572f279986312ec` | MIT except Enterprise Edition files |
| Vendure | [vendurehq/vendure](https://github.com/vendurehq/vendure) | `master` | `d00adf9b546c9156725e548c3e1467c7f252e122` | NOASSERTION from GitHub API; scope unresolved |
| Saleor core | [saleor/saleor](https://github.com/saleor/saleor) | `main` | `6f714faf25f3dbdd6ee2cbc2427b40cc890990c5` | BSD-3-Clause metadata |
| InvenTree | [inventree/InvenTree](https://github.com/inventree/InvenTree) | `master` | `cdfa7f19218e22567433b145b1ed73c1d87e2d3e` | MIT metadata |
| ModernWMS | [fjykTec/ModernWMS](https://github.com/fjykTec/ModernWMS) | `master` | `1837e17e6017f3cb6aea93437d2370659ee9392b` | Apache-2.0 metadata |
| Frappe Ecommerce Integrations | [frappe/ecommerce_integrations](https://github.com/frappe/ecommerce_integrations) | `develop` | `cc8aba55ff490668687096e7d824119f3f1fb2f3` | GPL-3.0 metadata |
| Apache Superset | [apache/superset](https://github.com/apache/superset) | `master` | `4ac8bfe29f0399752197f489979d41f6b46c2f9b` | Apache-2.0 metadata |
| Metabase | [metabase/metabase](https://github.com/metabase/metabase) | `master` | `22d436e064c2e2e10eb7af88bcd9fc505c488877` | NOASSERTION from GitHub API; edition/scope unresolved |
| BigCommerce Catalyst | [bigcommerce/catalyst](https://github.com/bigcommerce/catalyst) | `canary` | `4cce7bc3d05be54a449140644eb2119dd8d8c821` | MIT root LICENSE read |
| Vercel Shop | [vercel/shop](https://github.com/vercel/shop) | `main` | `c92f3df11e2fd3c5cf7b870518aa43e5534725eb` | MIT root LICENSE read |
| Shopify Hydrogen | [Shopify/hydrogen](https://github.com/Shopify/hydrogen) | `main` | `043094b0ab0b5b01299e75da33d3f4e2914fda6a` | MIT metadata |
| Saleor Storefront | [saleor/storefront](https://github.com/saleor/storefront) | `main` | `651f8cb1f404fa7e72f0290407abd2d3a8eaf28c` | FSL-1.1-ALv2 root LICENSE; Competing Use restriction |
| GraphCommerce | [graphcommerce-org/graphcommerce](https://github.com/graphcommerce-org/graphcommerce) | `canary` | `5f39fff4b5b25533fc101f7eb7add0643836a545` | NOASSERTION; ELv2 claim awaits pinned license file verification |
| Medusa Next.js Starter | [medusajs/nextjs-starter-medusa](https://github.com/medusajs/nextjs-starter-medusa) | `main (archived)` | `9818886f06e493cb2249733d114d339aa216ef00` | MIT metadata; archived |
| shadcn/ui | [shadcn-ui/ui](https://github.com/shadcn-ui/ui) | `main` | `dd41d19e2f80ff6891951f7ced74c2c9a650b065` | MIT metadata |
| HeroUI | [heroui-inc/heroui](https://github.com/heroui-inc/heroui) | `v3` | `8037a0198427faf1c1d09c6eb9e7bd09290ea3e2` | Apache-2.0 metadata |
| Radix UI Primitives | [radix-ui/primitives](https://github.com/radix-ui/primitives) | `main` | `eb3a2b7091293e27df8f9ba906632d8daa3d81a3` | MIT root LICENSE read |

### Source files inspected for this storefront adaptation

- Vercel Shop — `components/product-card/product-card.tsx`; commit `c92f3df11e2fd3c5cf7b870518aa43e5534725eb`; blob `3cf8ff5975eafc243891911f42b388c6ce38d3ae`.
- BigCommerce Catalyst — `core/vibes/soul/primitives/product-card/index.tsx`; commit `4cce7bc3d05be54a449140644eb2119dd8d8c821`; blob `0f98b768f379c94e364a945a416af595fb667f4f`.
- Radix UI Primitives — root `LICENSE` and primitive model checked for compatibility; no dependency added.

Source and license inspection for this pass:

- Vercel Shop and BigCommerce Catalyst: the exact product-card source files above were reviewed for the product-card adaptation.
- Shopify Hydrogen: `README.md` blob `950472436d8a52807ef96e40f46df999e2d65ba5` at `main` commit `043094b0ab0b5b01299e75da33d3f4e2914fda6a` identifies predictive search as a server-handler/search-store capability; its root `LICENSE.md` blob `2f2d7cf0012189f59ffe2f1bff10aca6ab4dc478` was read and is MIT. The [official Hydrogen collections/search guide](https://shopify.dev/docs/storefronts/hydrogen/collections-search) and [predictive-search store API guide](https://shopify.dev/docs/api/hydrogen/latest/predictive-search/create-predictive-search-store) were used as design references.
- No Hydrogen code, UI assets or package was copied into Nasr1. The implementation reuses the existing Nasr1 paginated catalogue RPC and independent target-owned React component.

`NOASSERTION` means GitHub did not return an SPDX identifier, not that code is free to copy. Repository-level or README inspection is not equivalent to a full file/dependency audit.

### Shopify Hydrogen account-route inspection — 2026-11-13

- Repository: [Shopify/hydrogen](https://github.com/Shopify/hydrogen), branch `main`, inspected HEAD `043094b0ab0b5b01299e75da33d3f4e2914fda6a`.
- Source: `templates/react-router/app/routes/account.tsx`, blob `ec660e4a801d81dcf26e3413a5d1cb89a8a16963`.
- License: template `templates/react-router/LICENSE`, blob `bf165a7b356128f2dee05ee629364263f98c4d2e`, read and confirmed MIT.
- Adapted principle: make the customer account a navigable workspace for identity and commerce tasks, rather than an isolated profile form.
- Nasr1 implementation: expand the existing customer-only link registry in `src/routes/profile.tsx` to expose existing invoice, quote, wishlist, comparison and support routes.
- Transfer decision: independent reimplementation; no Hydrogen code, package or assets copied. Hydrogen's API/OAuth/session implementation is not transplanted because Nasr1 uses its own Supabase/auth contracts.


### Recently viewed account history implementation — 2026-11-13

- Reference pattern: Shopify Hydrogen account workspace route (`templates/react-router/app/routes/account.tsx`), pinned to main commit `043094b0ab0b5b01299e75da33d3f4e2914fda6a`; the template MIT license was read at blob `bf165a7b356128f2dee05ee629364263f98c4d2e`.
- NASR1 implementation: `src/lib/recently-viewed-products.ts`, `src/components/Storefront.tsx`, `src/routes/profile.tsx`; target-owned tests under `src/lib` and `src/routes`.
- Decision: design reference only. The profile-scoped local history and UI were independently authored; no Hydrogen implementation, package, asset or auth/session code was copied.

### BigCommerce Catalyst category navigation review — 2026-11-13

- Repository: [bigcommerce/catalyst](https://github.com/bigcommerce/catalyst), branch `canary`, inspected HEAD `4cce7bc3d05be54a449140644eb2119dd8d8c821`.
- License: root `LICENSE` at the pinned repository revision was read and confirmed MIT. This is a repository-level license check for the inspected reference, not approval to copy arbitrary packages or files with separate notices.
- Actual inspected category sources:
  - `core/app/[locale]/(default)/(faceted)/category/[slug]/page.tsx`, blob `53ac0e71431b45d8854fecddf61551f5d58849c8`.
  - `core/components/breadcrumbs/fragment.ts`, blob `dd8cdbe070f40f4a58f3810ba6c181df02b48baf`.
- Adapted principles: contextual parent breadcrumb, clear current category state and stable category-page navigation. NASR1 independently implements these with its own TanStack routes and `parent_id` data contract.
- NASR1 results: `StorefrontCategoryLandingPage.tsx` and its unit/Playwright tests (PR #436); hierarchical `/categories` directory and `storefront-category-groups.ts` with tests (PR #438).
- Transfer decision: reference-only design/architecture adaptation. No Catalyst source file, asset, Storefront Kit, Next.js runtime or dependency was copied or installed.

### Apache Superset — source-file review for the Growth Opportunity Radar — 2026-11-13

- Repository: [apache/superset](https://github.com/apache/superset), branch `master`, pinned commit `4ac8bfe29f0399752197f489979d41f6b46c2f9b`.
- Exact files reviewed:
  - `superset-frontend/src/dashboard/components/DashboardGrid.tsx`, blob `1e7f816e6a257bad557ff18db28da8e0c03b9ee2`.
  - `superset-frontend/src/dashboard/components/FiltersBadge/DetailsPanel/index.tsx`, blob `1df3cbf4bbbecaccc5bfc1bf209f9cebc0ab2b74`.
  - `superset-frontend/src/components/Chart/ChartContainer.tsx`, blob `70a7c6e7c04974425d74dc1112b2848278997e0c`.
- License file: root `LICENSE.txt`, read at the same commit; blob `56313ab5a54a163e7d46224cb5470a814c3a2436`; Apache License 2.0. Each inspected source file also carries the Apache-2.0 license header.
- Applied patterns: separate dashboard regions and explicit empty states; independently inspectable source/filter status; isolate data/action wiring from presentation.
- Transfer decision: architectural/UI reference only. NASR1's implementation is independently authored on its existing React, Supabase, and RTL design stack. No Superset source code, Redux store, dashboard schema, chart runtime, package, or asset was transferred.
- Source review does not clear Superset transitive dependencies or unrelated files for reuse.
