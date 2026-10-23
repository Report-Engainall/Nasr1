# P3 route acceptance register — Nasr1

Repository: Report-Engainall/Nasr1  
Source baseline: main 16a3d23e558696700bccbb3dbf9ea75b0fccf745  
Generated route tree: src/routeTree.gen.ts  
Inventory size: 61 source modules under src/routes, including the root shell; 60 non-root page/API modules below.  
Purpose: P3-owned traceability artifact supporting ROUTES-001. This does not replace P2's canonical acceptance matrix and does not close ROUTES-001 by itself.

## Status semantics

- PROVEN_TARGETED — targeted route/component acceptance is tied to listed PR/SHA and Core/P2 CI; this does not mean every operation or production journey is proven.
- PARTIAL — source mapping and/or component/Core tests exist, but some route-level authorization, retry, browser navigation, contract, or full-journey gates remain.
- NOT_PROVEN — only source/route-tree registration was found, without dedicated rendered-route acceptance evidence.
- SKIPPED hosted checks are not PASS. A route can have local targeted evidence while hosted/external proof remains unproven.

## Live route inventory

Routes and mounted UI below were derived from live route source wrappers. Contract names are stated only where directly observed; “pending” is an evidence gap, not an assumption that the backend is absent.

| URL | Source module | Mounted UI / handler | Identified service or DB contract | P3 status | Evidence / next gate |
|---|---|---|---|---|---|
| / | src/routes/index.tsx | Storefront | Storefront catalog/product/price services; exact endpoint trace pending | PROVEN_TARGETED | PR #89 public storefront smoke; not full shopping UAT |
| /addresses | src/routes/addresses.tsx | CustomerAddressesPage | CustomerWorkflows-owned service; DB/RPC mapping pending | PROVEN_TARGETED | PR #105 guest/staff, retry, rejected-save draft |
| /admin | src/routes/admin.tsx | AdminApp default | AdminApp view/service mapping pending | NOT_PROVEN | Source/route-tree only |
| /admin/ai | src/routes/admin_.ai.tsx | AdminApp initialView=ai | AI view service mapping pending | NOT_PROVEN | No direct route acceptance |
| /admin/audit | src/routes/admin_.audit.tsx | AdminApp initialView=audit | Audit query mapping pending | NOT_PROVEN | No direct route acceptance |
| /admin/customers | src/routes/admin_.customers.tsx | AdminApp initialView=customers | Customer admin service mapping pending | NOT_PROVEN | No direct route acceptance |
| /admin/data | src/routes/admin_.data.tsx | AdminApp data + OnyxInventoryReconciliationWorkspace | Onyx reconciliation; target-system credentials for external proof | PARTIAL | Wiring present; external Onyx round-trip not proven |
| /admin/devices | src/routes/admin_.devices.tsx | AdminApp initialView=devices | Device/session contract mapping pending | NOT_PROVEN | No direct route acceptance |
| /admin/exports | src/routes/admin_.exports.tsx | AsyncExportCenter | Async export service/result download | NOT_PROVEN | Tree registers route; rendered deep-link/download proof missing |
| /admin/finance | src/routes/admin_.finance.tsx | AdminApp finance + CustomerReturnOperationsDrawer | Finance/returns backend contracts are P2-owned | PARTIAL | Local finance workflows pass; route-specific UI flow pending |
| /admin/inventory-transfers | src/routes/admin_.inventory-transfers.tsx | AdminApp initialView=inventory-transfers | Inventory transfer contract pending | NOT_PROVEN | Route registration only |
| /admin/notifications | src/routes/admin_.notifications.tsx | AdminApp initialView=notifications | Notification service mapping pending | NOT_PROVEN | Route registration only |
| /admin/offers | src/routes/admin_.offers.tsx | AdminApp initialView=offers | Admin offers read/write contract pending | NOT_PROVEN | Public offers tests do not prove admin route |
| /admin/operations | src/routes/admin_.operations.tsx | AdminApp initialView=operations | Operations view contracts pending | NOT_PROVEN | Route registration only |
| /admin/orders | src/routes/admin_.orders.tsx | AdminApp orders + CustomerReturnOperationsDrawer | Admin orders/returns contracts P2-owned | PARTIAL | Local order/return tests exist; route-specific UI proof pending |
| /admin/pricing | src/routes/admin_.pricing.tsx | AdminApp initialView=pricing | Server price authority contract P2-owned | NOT_PROVEN | No direct route acceptance |
| /admin/products | src/routes/admin_.products.tsx | AdminApp initialView=products | Product admin contract pending | NOT_PROVEN | Storefront tests do not prove admin route |
| /admin/purchase-orders | src/routes/admin_.purchase-orders.tsx | AdminApp initialView=purchase-orders | Purchase workflow contracts P2-owned | PARTIAL | Core/PostgreSQL checks; direct route proof pending |
| /admin/quotes | src/routes/admin_.quotes.tsx | AdminApp initialView=quotes | Quote admin contract pending | NOT_PROVEN | Route registration only |
| /admin/reports | src/routes/admin_.reports.tsx | AdminApp reports + ExecutiveStoreAnalytics | Report/forecast component data calls | PROVEN_TARGETED | PR #89 route wiring/runtime-mount/forecast tests; Core/P2 pass |
| /admin/settings | src/routes/admin_.settings.tsx | AdminApp initialView=settings | Settings read/write contract pending | NOT_PROVEN | Route registration only |
| /admin/stock-count | src/routes/admin_.stock-count.tsx | AdminApp initialView=stock-count | Stock-count/inventory contracts P2-owned | PARTIAL | Core audit tests; rendered route acceptance pending |
| /admin/suppliers | src/routes/admin_.suppliers.tsx | AdminApp initialView=suppliers | Supplier service mapping pending | NOT_PROVEN | Route registration only |
| /admin/tasks | src/routes/admin_.tasks.tsx | AdminApp initialView=tasks | Task/queue contract mapping pending | NOT_PROVEN | Route registration only |
| /api/invoice-pdf/$invoiceId | src/routes/api.invoice-pdf.$invoiceId.ts | Server PDF GET handler | get_customer_invoice_pdf; auth helper; UUID validation | PARTIAL | Source guards exist; HTTP-level status/header tests not proven here |
| /api/statement-pdf | src/routes/api.statement-pdf.ts | Server PDF GET handler | get_customer_account_statement; auth helper | PARTIAL | Source error/auth handling; direct PDF response acceptance pending |
| /assistant | src/routes/assistant.tsx | CommerceAssistantPage | Assistant service/API mapping pending | NOT_PROVEN | No direct route acceptance |
| /barcode | src/routes/barcode.tsx | BarcodeWorkspacePage | Barcode data/service mapping pending | NOT_PROVEN | No direct route acceptance |
| /cart | src/routes/cart.tsx | Storefront | Cart and authoritative pricing flow | PARTIAL | Price/checkout Core tests; standalone cart flow pending |
| /catalog | src/routes/catalog.tsx | Storefront | Catalog, search and pricing flow | PARTIAL | Component/Core tests; full catalog UAT pending |
| /categories | src/routes/categories.tsx | StorefrontCollectionsPage | Category/collection content service mapping pending | PARTIAL | PR #89 component tests; end-to-end navigation incomplete |
| /category/$slug | src/routes/category.$slug.tsx | StorefrontCategoryLandingPage | Category query contract pending | PARTIAL | PR #89 targeted category tests; full browser path pending |
| /category/$slug/subcategory/$subcategorySlug | src/routes/category.$slug.subcategory.$subcategorySlug.tsx | StorefrontCategoryLandingPage | Subcategory query contract pending | PARTIAL | Route registered; subcategory journey not proven |
| /checkout | src/routes/checkout.tsx | Storefront | Server-authoritative checkout/order workflow | PARTIAL | Local order tests pass; hosted authenticated flow skipped |
| /collections | src/routes/collections.tsx | StorefrontCollectionsPage | Collection content service mapping pending | PARTIAL | PR #89 component tests; route UAT pending |
| /company/accept-invitation | src/routes/company.accept-invitation.tsx | CompanyInvitationAcceptancePage | CustomerCompanyMembers invitation service/RPC | PROVEN_TARGETED | PR #115 token strip, failure/retry, server-confirmed success |
| /company/contacts | src/routes/company.contacts.tsx | CustomerCompanyContactsPage | customer-company-contacts.ts fetch/save/delete | PROVEN_TARGETED | PR #105 guest/staff, retry and rejected-save draft |
| /company/members | src/routes/company.members.tsx | CustomerCompanyMembersPage | customer-company-members workspace/invitation/member ops | PROVEN_TARGETED | PR #114 guest/staff, retry and rejected invite |
| /compare | src/routes/compare.tsx | Storefront | Compare state/data via Storefront; persistence contract mapping pending | PROVEN_TARGETED | PR #125 renders the real route; restores guest comparison, removes product, asserts empty state, and tests catalog failure/retry/recovery. Hosted credential-gated job is SKIPPED |
| /customer/activate/$token | src/routes/customer.activate.$token.tsx | CustomerActivationInvitationPage | Activation token service contract mapping pending | PROVEN_TARGETED | PR #116 tests real route token forwarding, token removal from visible URL, server rejection/retry, malformed-token rejection, and guest/staff denial before RPC. Hosted credential-gated job is SKIPPED |
| /forgot-password | src/routes/forgot-password.tsx | Login recovery mode | Supabase Auth recovery through Login | PARTIAL | Route/loading tests; hosted email flow not proven |
| /invite/$token | src/routes/invite.$token.tsx | CompanyInvitationAcceptancePage | Invitation acceptance service; token held in memory after URL removal | PROVEN_TARGETED | PR #115 exact-head route tests |
| /invoices | src/routes/invoices.tsx | CustomerInvoicesPage | customer_invoices list + get_customer_invoice_pdf RPC | PROVEN_TARGETED | PR #137 HEAD `2eb853033bb99162118f034e55b332b82a73de00`; Core [40038126564 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40038126564), P2 [40038126587 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40038126587); 5 targeted route tests. Hosted customer/tenant job SKIPPED; not full production UAT |
| /login | src/routes/login.tsx | Login | Supabase Auth sign-in | PARTIAL | Core route/loading checks; hosted session lifecycle pending |
| /offers | src/routes/offers.tsx | StorefrontOffersPage | Public offers/catalog service mapping pending | PARTIAL | PR #89 offer component tests; full route flow pending |
| /offline | src/routes/offline.tsx | OfflineWorkspacePage | Offline persistence/sync contract mapping pending | PROVEN_TARGETED | PR #130 tests the real route, public-cache sanitization, profile-mismatch rejection with draft preservation/no RPC, and local-sync failure/retry recovery. Hosted credential-gated job is SKIPPED |
| /orders | src/routes/orders.tsx | Outlet parent layout | Parent wrapper for listing/detail routes | PARTIAL | Layout registration; child flows tracked separately |
| /orders/ | src/routes/orders.index.tsx | MyOrders | CustomerOrders order-list reads | PROVEN_TARGETED | PR #136 HEAD `d0aeb127311ee435c4ec21aea1654798f2ab8897`; Core [40038213565 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40038213565), P2 [40038213559 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40038213559); 4 targeted tests for guest gate, query error/retry, unknown/empty count and pagination/privacy. Hosted customer/tenant job SKIPPED; not full production UAT |
| /orders/$id | src/routes/orders.$id.tsx | OrderInvoice | orders, order_items, order_status_history, customers | PROVEN_TARGETED | PR #120 guest gate, visible error/retry, unauthorized/not-found state |
| /product/$id | src/routes/product.$id.tsx | Storefront | Product detail and server-authoritative pricing | PARTIAL | Product/price component tests; full detail journey pending |
| /products | src/routes/products.tsx | Storefront | Product listing/search and authoritative pricing | PARTIAL | Price visibility tests; list route UAT pending |
| /quotes | src/routes/quotes.tsx | QuoteWorkspacePage | `get_storefront_product_prices` + `request_sales_quote` | PARTIAL | PR #139 current candidate HEAD `314f957a5802e0aa15381e5e901e0713a3b3ba2e`; initial Core caught a test assertion mismatch (not an app failure); corrected assertion is in CI rerun [Core 40038762495](https://github.com/Report-Engainall/Nasr1/actions/runs/40038762495) / [P2 40038762639](https://github.com/Report-Engainall/Nasr1/actions/runs/40038762639). Keep PARTIAL until both runs finish SUCCESS on this exact SHA; hosted job SKIPPED |
| /register | src/routes/register.tsx | Login registration mode | Supabase Auth registration | PARTIAL | Route checks; email verification lifecycle pending |
| /reorder | src/routes/reorder.tsx | ReorderWorkspacePage | Reorder service mapping pending | PARTIAL | No dedicated end-to-end reorder proof |
| /reset-password | src/routes/reset-password.tsx | Inline reset form | Supabase Auth password update/session recovery | PROVEN_TARGETED | PR #89 reset-password regression tests |
| /search | src/routes/search.tsx | Storefront | Search/catalog and authoritative pricing | PARTIAL | Search component tests; filters/pagination journey pending |
| /search/advanced | src/routes/search.advanced.tsx | AdvancedStorefrontSearchPage | Advanced search query mapping pending | PARTIAL | PR #89 targeted tests; full route UAT pending |
| /statement | src/routes/statement.tsx | CustomerStatementPage | get_customer_account_statement | PROVEN_TARGETED | PR #117 guest gate, RPC failure/retry, malformed data fails closed |
| /store | src/routes/store.tsx | Storefront | Store catalog/product/pricing services | PARTIAL | Public smoke passes; complete shopping journey pending |
| /wishlist | src/routes/wishlist.tsx | Storefront | Wishlist state/persistence mapping pending | PROVEN_TARGETED | PR #122 renders the real route, removes a cached guest favourite, confirms local-state update/no guest server sync, and verifies catalog failure/retry/recovery. Hosted credential-gated job is SKIPPED |

## Exact-head evidence index

The SHAs below were read live on 2026-10-24. Core and P2 links correspond to runs associated with the stated exact heads. The external customer-order/tenant job was SKIPPED on each P2 run; that is not PASS. This index omits PR #121 itself to avoid treating the registry's pre-edit head as evidence for its new document revision; read #121's own live head and CI after this update.

| PR | Exact tested HEAD SHA | Scope | Core | P2 Playwright | Qualification |
|---|---|---|---|---|---|
| [#89](https://github.com/Report-Engainall/Nasr1/pull/89) | a36cc74085935a4e48965d19c3defb282dbb6a10 | Category/catalog error states and counts, storefront/search, reports wiring/loading, route loading/hydration, reset-password and browser privacy regressions | [40026027445 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40026027445) | [40026027463 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40026027463) | Public UI smoke, infra gate, local PostgreSQL 17 acceptance SUCCESS; hosted customer/tenant job SKIPPED |
| [#105](https://github.com/Report-Engainall/Nasr1/pull/105) | 599dbbe8fa1b7a799909d22ae6cff33ebb51cc9d | /addresses and /company/contacts | [40025650590 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40025650590) | [40025650684 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40025650684) | Public UI smoke, infra gate, local PostgreSQL 17 acceptance SUCCESS; hosted customer/tenant job SKIPPED |
| [#114](https://github.com/Report-Engainall/Nasr1/pull/114) | 167e8f22a74eb4cc6350896affd20db28b57052c | /company/members | [40025727440 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40025727440) | [40025727413 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40025727413) | Public UI smoke, infra gate, local PostgreSQL 17 acceptance SUCCESS; hosted customer/tenant job SKIPPED |
| [#115](https://github.com/Report-Engainall/Nasr1/pull/115) | 855cd203145dcf3020e0bbac57b5188dfcedbb13 | /invite/$token and /company/accept-invitation | [40025580420 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40025580420) | [40025580423 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40025580423) | Public UI smoke, infra gate, local PostgreSQL 17 acceptance SUCCESS; hosted customer/tenant job SKIPPED |
| [#116](https://github.com/Report-Engainall/Nasr1/pull/116) | e553157246b91199e3a8c83c88585654b1d194c6 | /customer/activate/$token | [40025757483 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40025757483) | [40025757514 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40025757514) | Public UI smoke, infra gate, local PostgreSQL 17 acceptance SUCCESS; hosted customer/tenant job SKIPPED |
| [#117](https://github.com/Report-Engainall/Nasr1/pull/117) | cb0a4b9509001d1db4d6560849ae1f051a0d7a0b | /statement | [40025787855 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40025787855) | [40025787857 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40025787857) | Public UI smoke, infra gate, local PostgreSQL 17 acceptance SUCCESS; hosted customer/tenant job SKIPPED |
| [#120](https://github.com/Report-Engainall/Nasr1/pull/120) | f58b3830b443477e940d21b3a4ed166ef38404e3 | /orders/$id | [40025816601 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40025816601) | [40025816610 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40025816610) | Public UI smoke, infra gate, local PostgreSQL 17 acceptance SUCCESS; hosted customer/tenant job SKIPPED |
| [#122](https://github.com/Report-Engainall/Nasr1/pull/122) | 9f64a1342dcf97248e4570f447f358a08711819b | /wishlist | [40025883623 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40025883623) | [40025883529 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40025883529) | Public UI smoke, infra gate, local PostgreSQL 17 acceptance SUCCESS; hosted customer/tenant job SKIPPED |
| [#125](https://github.com/Report-Engainall/Nasr1/pull/125) | 04a0403a49ef6a10d110299ed95a8e44c6bc4dd8 | /compare | [40025913367 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40025913367) | [40025913384 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40025913384) | Public UI smoke, infra gate, local PostgreSQL 17 acceptance SUCCESS; hosted customer/tenant job SKIPPED |
| [#130](https://github.com/Report-Engainall/Nasr1/pull/130) | dd5158414f61cd88a687c24346215c421b9ee62c | /offline | [40025941925 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40025941925) | [40025941941 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40025941941) | Public UI smoke, infra gate, local PostgreSQL 17 acceptance SUCCESS; hosted customer/tenant job SKIPPED |

No PR is claimed merged. The ten implementation PRs remain open/unmerged pending independent maintainer review. PR #121 is a documentation-only source register and needs its own exact-current-head CI readback after this register revision. Hosted credential-gated tests marked SKIPPED are not PASS. Full all-route browser UAT and production acceptance remain NOT RUN. PR #113 remains closed/unmerged as duplicate only if its unique contact-route test is preserved by #105.


## Current P3 route test additions — exact-head evidence (2026-10-24)

| PR | HEAD SHA | Scope | Core | P2 Playwright | Qualification |
|---|---|---|---|---|---|
| [#136](https://github.com/Report-Engainall/Nasr1/pull/136) | `d0aeb127311ee435c4ec21aea1654798f2ab8897` | `/orders/` guest gate, failed read/retry, count semantics, pagination and financial-data non-rendering | [40038213565 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40038213565) | [40038213559 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40038213559) | Targeted route tests pass; hosted customer/tenant E2E SKIPPED, not PASS |
| [#137](https://github.com/Report-Engainall/Nasr1/pull/137) | `2eb853033bb99162118f034e55b332b82a73de00` | `/invoices` guest gate, list failure/retry, empty state, redacted detail and fail-closed malformed protected payload | [40038126564 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40038126564) | [40038126587 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40038126587) | 5 targeted tests pass; hosted customer/tenant E2E SKIPPED, not PASS |
| [#139](https://github.com/Report-Engainall/Nasr1/pull/139) | `314f957a5802e0aa15381e5e901e0713a3b3ba2e` | `/quotes` tenant gate, product-read retry, price fail-closed and RPC failure/success | [40038762495](https://github.com/Report-Engainall/Nasr1/actions/runs/40038762495) | [40038762639](https://github.com/Report-Engainall/Nasr1/actions/runs/40038762639) | **Pending terminal results at register edit time**; do not elevate route status or claim PASS until exact SHA results are both SUCCESS; hosted customer/tenant E2E is SKIPPED |

## Highest-priority open gaps

1. P1: /admin/exports runtime acceptance. The route tree registers it and the source wrapper mounts AsyncExportCenter, but this is registration only. Deep-link load, role denial, export failure/retry and completed download remain NOT_PROVEN.
2. P1/P2: admin route-family contracts. Most admin routes mount AdminApp(initialView=...). The wrapper does not prove each view's service/RPC, role/tenant guard, error/retry behavior or rendered screen.
3. P2: invoice PDF API route. Source declares get_customer_invoice_pdf(p_invoice_id), auth helper and UUID validation; direct HTTP tests for 400/403/404/500 and PDF headers are not proven here.
4. P2: statement PDF API route. Source declares get_customer_account_statement and auth helper; direct HTTP success/error acceptance is still unproven.
5. P3: remaining customer listing/workflow routes. `/orders/` and `/invoices` now have targeted rendered-route tests; broader end-to-end and production journeys remain unproven. `/quotes` is awaiting exact-head CI on PR #139; `/reorder`, `/product/$id` and `/products` still need dedicated route journeys for auth, empty/error/retry and browser navigation. `/wishlist`, `/compare`, `/offline` and `/customer/activate/$token` have targeted route evidence, not full production acceptance.
6. External boundary: hosted customer-order/tenant E2E jobs are SKIPPED because authorized credentials are unavailable. Do not close production integration requirements using local database evidence.

## Ownership and handoff

- This is a P3 evidence artifact only. P2 decides whether/how to transfer it to the official matrix and central state; P3 does not edit those locked files.
- P1 owns shared route/UI wiring and /admin/exports route investigation. Never hand-edit src/routeTree.gen.ts.
- P2 owns RPCs, migrations, RLS, finance/inventory backend contracts, external connectors, and centralized execution files.
- These synthetic route tests did not use production credentials or write production data.
- Status is exact-SHA-specific; never transfer PASS from a parent SHA to a new head.
