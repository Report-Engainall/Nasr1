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

- ERPNext, Dolibarr, IDURAR, Medusa, Vendure, Saleor, InvenTree, ModernWMS, Frappe Ecommerce Integrations, Superset, Metabase, shadcn/ui and HeroUI: exact source files, commit pins, nested notices and dependency licenses remain to be inspected before any code transfer. Shopify Hydrogen's root and React Router template MIT licenses were both read for the specific predictive-search and account-route design references; no source code was copied.
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
| Shopify Hydrogen | `main` / `043094b0ab0b5b01299e75da33d3f4e2914fda6a` | Root `LICENSE.md` and `templates/react-router/LICENSE` both read; MIT (blobs `2f2d7cf0012189f59ffe2f1bff10aca6ab4dc478`, `bf165a7b356128f2dee05ee629364263f98c4d2e`) | Predictive-search and account-route design references only; no source code or dependency copied |
| Saleor Storefront | `main` / `651f8cb1f404fa7e72f0290407abd2d3a8eaf28c` | Root LICENSE read; FSL-1.1-ALv2 with Competing Use restrictions | Visual/technical reference only; no code transfer |
| GraphCommerce | `canary` / `5f39fff4b5b25533fc101f7eb7add0643836a545` | API returned `NOASSERTION`; supplied ELv2 claim awaits exact pinned file review | Reference only; no code transfer |
| Medusa Next.js Starter | `main` / `9818886f06e493cb2249733d114d339aa216ef00` | MIT metadata; archived | Historical reference only |
| shadcn/ui | `main` / `dd41d19e2f80ff6891951f7ced74c2c9a650b065` | MIT metadata | Existing primitives preferred; no dependency added |
| HeroUI | `v3` / `8037a0198427faf1c1d09c6eb9e7bd09290ea3e2` | Apache-2.0 metadata | No dependency added |
| Radix UI Primitives | `main` / `eb3a2b7091293e27df8f9ba906632d8daa3d81a3` | Root LICENSE read; MIT | Existing target primitives retained |

A GitHub `NOASSERTION` response is a blocker, not permission to copy. SPDX metadata is not a substitute for checking exact file headers, nested notices and transitive dependencies.


### Recently viewed customer history — license and transfer note — 2026-11-13

- Shopify Hydrogen remains a design reference only for the account-workspace organization. The pinned React Router template license was verified as MIT in the earlier account-hub checkpoint.
- NASR1's recently viewed storage, event handling, panel and tests are independently authored. No third-party source, package, asset or dependency was transferred, so no new third-party notice was introduced.
- This decision is narrow to the account-workspace design pattern and does not grant blanket approval for copying other Hydrogen files or dependencies.

### BigCommerce Catalyst category navigation use — scope clarification — 2026-11-13

- The existing Catalyst row's MIT status is confirmed at pinned `canary` HEAD `4cce7bc3d05be54a449140644eb2119dd8d8c821`; root `LICENSE` was read.
- Category-specific inspected blobs: category page `53ac0e71431b45d8854fecddf61551f5d58849c8` and breadcrumb fragment `dd8cdbe070f40f4a58f3810ba6c181df02b48baf`.
- Transfer decision remains **No**: NASR1 independently recreated the parent breadcrumb, current-child state, sibling links and hierarchy grouping. No Catalyst source file, UI asset, package, Storefront Kit or Next.js component was copied.
- MIT applies to the inspected Catalyst project subject to its notices and does not establish the license of every dependency or nested file; no blanket license approval for other reference components is implied.

### Apache Superset — Growth Opportunity Radar reference review — 2026-11-13

- Repository pin: `apache/superset`, `master`, commit `4ac8bfe29f0399752197f489979d41f6b46c2f9b`.
- Root license: `LICENSE.txt`, blob `56313ab5a54a163e7d46224cb5470a814c3a2436`, read and confirmed Apache License 2.0.
- Inspected source files and blobs: `DashboardGrid.tsx` / `1e7f816e6a257bad557ff18db28da8e0c03b9ee2`; `FiltersBadge/DetailsPanel/index.tsx` / `1df3cbf4bbbecaccc5bfc1bf209f9cebc0ab2b74`; `ChartContainer.tsx` / `70a7c6e7c04974425d74dc1112b2848278997e0c`. Each source contains the Apache-2.0 header.
- Decision: use these files as architecture and UI design references only. No code, assets, chart packages, Redux integration or transitive dependencies were copied into NASR1. This decision is limited to the inspected files and does not approve unrelated Superset code for reuse.

### Verified product review feature — license and transfer note — 2026-11-13

- No third-party source code, UI asset, package or dependency was copied or added for the verified product review workflow.
- The implementation uses NASR1's existing React, TypeScript, Supabase client, authentication, tenant helpers and audit model. No third-party license or notice obligation is introduced by PR #439.
- External project references remain inspiration-only for the general storefront experience. This feature does not grant blanket approval to reuse files from Medusa, Vendure, Saleor, BigCommerce Catalyst, Shopify Hydrogen, GraphCommerce, or any other reference project.
- The feature is still awaiting P1 and local PostgreSQL P2 acceptance on PR #439; no production migration or deployment has occurred.

### Storefront product questions and answers — 2026-11-13

- Implementation is original NASR1 code using existing React, TypeScript, Supabase RPC, identity, tenant and audit contracts.
- No source code, package, asset, or dependency was copied from any external reference repository. No external license obligations were introduced.
- The migration creates no second authentication, database, tenant, or role system; it uses the repository's existing authorization and audit helpers.
