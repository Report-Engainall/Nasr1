# Third-party License Register

**Date:** 2026-11-13  
**Target:** `Report-Engainall/Nasr1`

## Sources whose licenses were read at pinned commits

| Repository | Pinned commit | License file | Result | Copied code in this change |
|---|---|---|---|---|
| Vercel Shop | `c92f3df11e2fd3c5cf7b870518aa43e5534725eb` | `LICENSE` | MIT | No |
| BigCommerce Catalyst | `4cce7bc3d05be54a449140644eb2119dd8d8c821` | `LICENSE` | MIT | No |
| Radix UI Primitives | `eb3a2b7091293e27df8f9ba906632d8daa3d81a3` | `LICENSE` | MIT | No |

The storefront changes are independent implementations of interaction and layout patterns. No source file, dependency or vendored asset was copied from these repositories.

## Sources not cleared for code reuse by this integration

- ERPNext, Dolibarr, IDURAR, Medusa, Vendure, Saleor, InvenTree, ModernWMS, Frappe Ecommerce Integrations, Superset, Metabase, Shopify Hydrogen, shadcn/ui and HeroUI: exact source files, commit pins, nested notices and dependency licenses remain to be inspected before any code transfer.
- Saleor Storefront and GraphCommerce remain excluded from code transfer pending the competitive-hosting restrictions/license analysis identified in the project brief.
- Medusa Next.js Starter is treated as an archived design/reference candidate, not as a base application.

## Dependency and notice impact

No dependency was added or upgraded. Because this change does not copy source code or assets, it adds no third-party copyright notice requirement. This register does not grant blanket approval for future extraction from any listed repository.


## Pinned license decision snapshot — 2026-11-13

| Repository | Branch / commit | License evidence observed | Decision |
|---|---|---|---|
| ERPNext | `develop` / `2db122fbd545b3754d117efd489a4ff705090db8` | GPL-3.0 metadata | Reimplement concepts; no code copied |
| Dolibarr | `develop` / `35c2e5c48e2f9abea5fd219e49b956f278abbef7` | GPL-3.0 metadata | Reimplement concepts; no code copied |
| IDURAR | `master` / `e935dec13cf8b6082a7e7fc4736669e5151a80a3` | AGPL-3.0 metadata | Reimplement concepts; no code copied |
| Medusa | `develop` / `5fd67e5e7ba092ed4d027d883572f279986312ec` | Root LICENSE: MIT except Enterprise Edition files under `ENTERPRISE-LICENSE.md` | Only non-enterprise files may be considered after file/dependency review |
| Vendure | `master` / `d00adf9b546c9156725e548c3e1467c7f252e122` | API returned `NOASSERTION`; applicable exact license file not cleared | No code transfer |
| Saleor core | `main` / `6f714faf25f3dbdd6ee2cbc2427b40cc890990c5` | BSD-3-Clause metadata | No code copied; file-level notices needed for future use |
| InvenTree | `master` / `cdfa7f19218e22567433b145b1ed73c1d87e2d3e` | MIT metadata | No code copied |
| ModernWMS | `master` / `1837e17e6017f3cb6aea93437d2370659ee9392b` | Apache-2.0 metadata | No code copied |
| Frappe Ecommerce Integrations | `develop` / `cc8aba55ff490668687096e7d824119f3f1fb2f3` | GPL-3.0 metadata | Reimplement concepts; no code copied |
| Apache Superset | `master` / `4ac8bfe29f0399752197f489979d41f6b46c2f9b` | Apache-2.0 metadata | No code copied |
| Metabase | `master` / `22d436e064c2e2e10eb7af88bcd9fc505c488877` | API returned `NOASSERTION`; edition/scope unresolved | No code transfer |
| BigCommerce Catalyst | `canary` / `4cce7bc3d05be54a449140644eb2119dd8d8c821` | Root LICENSE read; MIT | Pattern independently reimplemented; no file copied |
| Vercel Shop | `main` / `c92f3df11e2fd3c5cf7b870518aa43e5534725eb` | Root LICENSE read; MIT | Pattern independently reimplemented; no file copied |
| Shopify Hydrogen | `main` / `043094b0ab0b5b01299e75da33d3f4e2914fda6a` | MIT metadata | No code copied |
| Saleor Storefront | `main` / `651f8cb1f404fa7e72f0290407abd2d3a8eaf28c` | Root LICENSE read; FSL-1.1-ALv2 with Competing Use restrictions | Visual/technical reference only; no code transfer |
| GraphCommerce | `canary` / `5f39fff4b5b25533fc101f7eb7add0643836a545` | API returned `NOASSERTION`; supplied ELv2 claim awaits exact pinned file review | Reference only; no code transfer |
| Medusa Next.js Starter | `main` / `9818886f06e493cb2249733d114d339aa216ef00` | MIT metadata; archived | Historical reference only |
| shadcn/ui | `main` / `dd41d19e2f80ff6891951f7ced74c2c9a650b065` | MIT metadata | Existing primitives preferred; no dependency added |
| HeroUI | `v3` / `8037a0198427faf1c1d09c6eb9e7bd09290ea3e2` | Apache-2.0 metadata | No dependency added |
| Radix UI Primitives | `main` / `eb3a2b7091293e27df8f9ba906632d8daa3d81a3` | Root LICENSE read; MIT | Existing target primitives retained |

A GitHub `NOASSERTION` response is a blocker, not permission to copy. SPDX metadata is not a substitute for checking exact file headers, nested notices and transitive dependencies.
