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
| Shopify Hydrogen | https://github.com/Shopify/hydrogen | NOT_REVIEWED — no code used |
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
