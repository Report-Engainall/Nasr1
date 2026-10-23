# P3 route acceptance register — Nasr1

Repository: Report-Engainall/Nasr1  
Source baseline: main 391e25847c7cc7fb2ba5f77164600455db04abfd  
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
| /compare | src/routes/compare.tsx | Storefront | Compare state/data via Storefront; persistence pending | PARTIAL | General storefront tests; standalone flow pending |
| /customer/activate/$token | src/routes/customer.activate.$token.tsx | CustomerActivationInvitationPage | Activation token service contract pending | PARTIAL | Route exists; activation success/rejection browser proof pending |
| /forgot-password | src/routes/forgot-password.tsx | Login recovery mode | Supabase Auth recovery through Login | PARTIAL | Route/loading tests; hosted email flow not proven |
| /invite/$token | src/routes/invite.$token.tsx | CompanyInvitationAcceptancePage | Invitation acceptance service; token held in memory after URL removal | PROVEN_TARGETED | PR #115 exact-head route tests |
| /invoices | src/routes/invoices.tsx | CustomerInvoicesPage | Invoice list/detail service mapping pending | PARTIAL | Finance/component checks; direct invoice-route auth/retry pending |
| /login | src/routes/login.tsx | Login | Supabase Auth sign-in | PARTIAL | Core route/loading checks; hosted session lifecycle pending |
| /offers | src/routes/offers.tsx | StorefrontOffersPage | Public offers/catalog service mapping pending | PARTIAL | PR #89 offer component tests; full route flow pending |
| /offline | src/routes/offline.tsx | OfflineWorkspacePage | Offline persistence/sync contract pending | NOT_PROVEN | No route-specific acceptance |
| /orders | src/routes/orders.tsx | Outlet parent layout | Parent wrapper for listing/detail routes | PARTIAL | Layout registration; child flows tracked separately |
| /orders/ | src/routes/orders.index.tsx | MyOrders | CustomerOrders order-list reads | PARTIAL | General order persistence checks; listing auth/error/retry pending |
| /orders/$id | src/routes/orders.$id.tsx | OrderInvoice | orders, order_items, order_status_history, customers | PROVEN_TARGETED | PR #120 guest gate, visible error/retry, unauthorized/not-found state |
| /product/$id | src/routes/product.$id.tsx | Storefront | Product detail and server-authoritative pricing | PARTIAL | Product/price component tests; full detail journey pending |
| /products | src/routes/products.tsx | Storefront | Product listing/search and authoritative pricing | PARTIAL | Price visibility tests; list route UAT pending |
| /quotes | src/routes/quotes.tsx | QuoteWorkspacePage | Quote/RFQ service mapping pending | PARTIAL | Source/Core checks; dedicated rendered route acceptance missing |
| /register | src/routes/register.tsx | Login registration mode | Supabase Auth registration | PARTIAL | Route checks; email verification lifecycle pending |
| /reorder | src/routes/reorder.tsx | ReorderWorkspacePage | Reorder service mapping pending | PARTIAL | No dedicated end-to-end reorder proof |
| /reset-password | src/routes/reset-password.tsx | Inline reset form | Supabase Auth password update/session recovery | PROVEN_TARGETED | PR #89 reset-password regression tests |
| /search | src/routes/search.tsx | Storefront | Search/catalog and authoritative pricing | PARTIAL | Search component tests; filters/pagination journey pending |
| /search/advanced | src/routes/search.advanced.tsx | AdvancedStorefrontSearchPage | Advanced search query mapping pending | PARTIAL | PR #89 targeted tests; full route UAT pending |
| /statement | src/routes/statement.tsx | CustomerStatementPage | get_customer_account_statement | PROVEN_TARGETED | PR #117 guest gate, RPC failure/retry, malformed data fails closed |
| /store | src/routes/store.tsx | Storefront | Store catalog/product/pricing services | PARTIAL | Public smoke passes; complete shopping journey pending |
| /wishlist | src/routes/wishlist.tsx | Storefront | Wishlist state/persistence mapping pending | PARTIAL | General storefront checks; add/remove/session journey pending |

## Exact-head evidence index

| PR | Head SHA | Scope | Core | P2 Playwright | Qualification |
|---|---|---|---|---|---|
| [#89](https://github.com/Report-Engainall/Nasr1/pull/89) | 68bcfec844cfced8e732843f08a91200f68faa51 | Existing storefront/category/search/reset-password/report changes and P3 checkpoint/report | [40013665679 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40013665679) | [40013665700 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40013665700) | Docs child has exact-head checks; hosted job 120620186335 SKIPPED |
| [#105](https://github.com/Report-Engainall/Nasr1/pull/105) | ff2f5992773e694c6949288b3e0b542c8ca97221 | /addresses, /company/contacts | [40012090629 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40012090629) | [40012090617 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40012090617) | Hosted job 120614813670 SKIPPED |
| [#114](https://github.com/Report-Engainall/Nasr1/pull/114) | 03e31e9b6f8635c1e91be3ee2d3ed161c0b8c33b | /company/members | [40012168979 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40012168979) | [40012168992 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40012168992) | Hosted job 120615072085 SKIPPED |
| [#115](https://github.com/Report-Engainall/Nasr1/pull/115) | 8002ca545d56a390fccc2dcbb7a44e9db12f2bee | /invite/$token, /company/accept-invitation | [40012202450 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40012202450) | [40012202448 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40012202448) | Hosted job 120615203852 SKIPPED |
| [#117](https://github.com/Report-Engainall/Nasr1/pull/117) | 19ebe54a0d728eed6be52a4c7c3497eebed69467 | /statement | [40011824143 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40011824143) | [40011824127 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40011824127) | Hosted job 120614052674 SKIPPED |
| [#120](https://github.com/Report-Engainall/Nasr1/pull/120) | 6cc18ce5fdc20841bb862aec771de307dc3ff037 | /orders/$id | [40012824104 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40012824104) | [40012823910 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/40012823910) | Hosted job 120617293033 SKIPPED |

No PR is claimed merged. The above PRs remain open/unmerged and require independent human maintainer review. Hosted credential-gated tests marked SKIPPED are not PASS. Full all-route browser UAT and production acceptance remain NOT RUN. PR #113 is closed unmerged as duplicate because its contacts route test already exists in #105.

## Highest-priority open gaps

1. P1: /admin/exports runtime acceptance. The route tree registers it and the source wrapper mounts AsyncExportCenter, but this is registration only. Deep-link load, role denial, export failure/retry and completed download remain NOT_PROVEN.
2. P1/P2: admin route-family contracts. Most admin routes mount AdminApp(initialView=...). The wrapper does not prove each view's service/RPC, role/tenant guard, error/retry behavior or rendered screen.
3. P2: invoice PDF API route. Source declares get_customer_invoice_pdf(p_invoice_id), auth helper and UUID validation; direct HTTP tests for 400/403/404/500 and PDF headers are not proven here.
4. P2: statement PDF API route. Source declares get_customer_account_statement and auth helper; direct HTTP success/error acceptance is still unproven.
5. P3: customer listing/workflow routes. /orders/ listing, /invoices, /quotes, /reorder, /wishlist, /compare, /product/$id and /products still need direct route journeys for auth, empty/error/retry, and browser navigation.
6. External boundary: hosted customer-order/tenant E2E jobs are SKIPPED because authorized credentials are unavailable. Do not close production integration requirements using local database evidence.

## Ownership and handoff

- This is a P3 evidence artifact only. P2 decides whether/how to transfer it to the official matrix and central state; P3 does not edit those locked files.
- P1 owns shared route/UI wiring and /admin/exports route investigation. Never hand-edit src/routeTree.gen.ts.
- P2 owns RPCs, migrations, RLS, finance/inventory backend contracts, external connectors, and centralized execution files.
- These synthetic route tests did not use production credentials or write production data.
- Status is exact-SHA-specific; never transfer PASS from a parent SHA to a new head.
