# API / RPC / Edge contract register — Nasr1 current baseline

**Observation date:** 2026-11-08  
**Repository:** `Report-Engainall/Nasr1`, branch `main`  
**Supabase:** `aghbari-commerce-nasr1`, ref `tfdwtuwkdddnzgyhcoyy`  
**Overall status:** **PARTIAL** — selected high-risk contracts/grants reviewed; full callable-surface semantic authorization coverage is not proven.

## Evidence boundary and live inventory

Latest direct inspection:
- 145 public relations, all RLS-enabled.
- 273 migration ledger records; latest version `20261108194404`.
- 437 PostgreSQL routines in schema `public`; this includes internal/trigger/helper routines and is not the PostgREST callable count.
- PostgREST schema-cache log at `2026-11-08T19:44:05.657869Z` reports **349 RPCs**. This is an observed cache count, not a semantic authorization pass.
- Six Edge Function entrypoint sources in `main`; Supabase reports **zero deployed Edge Functions**. Source files do not prove deployment.
- Live initialization data: one active organization; zero Auth users/profiles/roles; zero branches/warehouses/categories/products.
- Historic archive counts (316/316, 330/330, 179 candidates, 174/154 migrations, etc.) are stale; do not reuse them as today's inventory.

## Identity and storefront contracts

| Contract | Allowed caller | Required behavior |
|---|---|---|
| `get_current_tenant_context()` | `authenticated`, `service_role` | Zero args; server resolves active profile/organization/warehouse. Never expose to anon, duplicate it or add dummy parameters. |
| `ensure_profile(_full_name text)` | `authenticated`, `service_role` | Uses signed-in Auth identity; new self-service profiles are customers. Client metadata cannot self-assign admin. |
| `get_public_storefront_categories()` | `anon` only | SECURITY DEFINER/empty search_path; returns only id/name/code/parent_id/sort_order/is_active. No organization/warehouse IDs. |
| `get_storefront_catalog_page(...)` | `anon`, `authenticated` | Bounded public-safe paging; guest tenant resolved inside definer context; authenticated scope comes from current user. |
| `get_storefront_product_prices(uuid[],numeric)` | `anon`, `authenticated` | Server-selected pricing context; client supplies neither customer ID, organization nor tier. Hidden price remains NULL/omitted, never zero. |
| `get_public_storefront_settings()`, `get_storefront_announcements()`, `get_storefront_promotions()`, `get_product_unit_conversions(uuid)` | `anon`, `authenticated` | Public allowlist only; tenant selection/field filtering remain inside server-side definer functions. |
| `get_public_storefront_context()`, `public_storefront_organization_id()`, `public_storefront_warehouse_id()` | Internal definer/service context | Browser/anon cannot execute these tenant/warehouse resolver helpers. Never restore browser grants to repair public storefront reads. |
| `bootstrap_first_admin_profile(uuid,text,text)` | `service_role` only | SECURITY DEFINER/empty search_path; exact invited/verified Auth UUID/email, one active organization, no prior admin/profile, advisory lock and atomic profile+admin-role insertion. No browser/self-promotion access. |

The public-category migration is version `20261108193554`; first-admin RPC migration is `20261108194404`. Live grants were rechecked after both. An anon role probe invoked the category RPC and returned zero rows because no real categories exist.

## Edge Function source and deployment boundary

Source entrypoints in main:
- `ai-gateway`
- `async-export-download`
- `async-export-worker`
- `bootstrap-first-admin`
- `outbox-worker`
- `product-image-upload`

Live deployed count: **zero**. Before using a worker/provider/upload/bootstrap capability, deploy only after required secrets/config exist and verify its exact deployed version, safe invocation, audit and retry behavior. The first-admin endpoint has `verify_jwt=false` only because no Auth user exists; the handler must validate server-only `NASR1_BOOTSTRAP_SECRET` before privileged actions. Do not deploy/invoke until owner-approved email/name, verified Auth invitation delivery and a strong secret stored directly in Supabase Function secrets. Remove the one-time endpoint/secret after provisioning.

## Mandatory contract fields for every callable mutation

Every RPC/Edge/worker command needs evidence for:
1. Authentication, active profile, role/capability and organization scope.
2. Input/UUID/enum/state validation, body bounds, precision/currency/UOM constraints.
3. Server-derived customer/tenant/warehouse and authoritative price/stock/balance.
4. Transaction/locking, deterministic lock order, concurrency and race behavior.
5. Idempotency key bound to the canonical full payload; same-payload replay and changed-payload conflict.
6. Immutable actor/time/reason/source audit and transactional outbox/event.
7. Failure/denial response plus before/after snapshots proving no unauthorized side effect.
8. Explicit response allowlist; no cross-tenant data, internal IDs, cost/margin, other tier or secrets.
9. Online-only mutation and retry safety; no duplicate orders/payments/journals/transfers/exports/tasks.

## Protected areas — preserve, do not rebuild

- Order submit/amend/version/cancel; customer returns/credit memo; invoice PDF/member revocation.
- Server-selected tier pricing, member revocation races, hidden-price projections and PDF/XLSX/print allowlists.
- Inventory transfer/batch races, stock-count snapshots, reservations, replenishment/PO draft, Onyx preview/apply/rollback.
- Supplier invoice evidence/matching/due dates, payment allocation/settlement, credit notes and source-linked journal drafts.
- GL posting/void/reversal; opening cash evidence and bank-statement reconciliation.
- Import identity/resume/chunks/DQS/rollback; async export ownership/leases/retry/signed download.
- Company membership/invitations, customer service/Customer 360, operational tasks and device-session revocation.
- AI quota/privacy telemetry and deterministic intelligence engines; paid AI spend remains zero.

## Customer financial-source routing contract — P2

The source contract is implemented by migration
`20261127230000_customer_financial_source_routing.sql` and is accepted only by the
isolated PostgreSQL 17 test `scripts/test-customer-financial-source-routing.mjs`.
It is not a claim that ERP transport, an external statement reader, an Edge Function or
a production migration is deployed.

| RPC | Allowed caller | Required contract |
|---|---|---|
| `get_my_customer_financial_source()` | `authenticated` | Own linked customer only; returns server-selected mode/status/freshness; never returns external account reference. |
| `get_customer_financial_source_for_staff(uuid)` | `authenticated` with finance capability | Same-organization customer only; staff-only response may include the approved external account reference. |
| `get_customer_financial_source_change_history(uuid,integer)` | `authenticated` with `finance.customer_source.request` or `finance.customer_source.approve` | Active-organization approved customer only; bounded 1–20 record page; exposes request/review state and reconciliation metadata without ERP account/company/branch references, raw evidence hashes or currency balances. |
| `get_customer_financial_source_change_history_page(uuid,integer,timestamptz,uuid)` | `authenticated` with `finance.customer_source.request` or `finance.customer_source.approve` | Same tenant/capability guard; keyset pagination by `(requested_at DESC,id DESC)`, bounded 1–20 records; cursor timestamp and request UUID must be supplied together; returns `has_more`/`next_cursor` and a server-derived `can_review` affordance (not an approval authorization); legacy two-argument RPC remains a first-page wrapper. |
| `request_customer_financial_source_change(uuid,text,text,text,text,integer)` | `authenticated` with `finance.customer_source.request` | Server-derived tenant/customer; canonical idempotency key + expected binding revision; immutable tenant/customer/source target/revision/reason/requester identity after creation; DELETE is rejected by PostgreSQL. |
| `record_customer_financial_source_reconciliation_evidence(uuid,timestamptz,text,text,text[],jsonb,jsonb,text)` | `service_role` only | Hash-bound source evidence includes exact current/target decimal balance strings for every declared currency; `matched` is rejected unless every currency balance compares exactly as PostgreSQL `numeric`; changed balance metadata cannot replay under the same hash; evidence rows are append-only (UPDATE/DELETE rejected by PostgreSQL). |
| `review_customer_financial_source_change(uuid,text,text)` | `authenticated` with finance capability | Different maker/checker; requires current binding revision and matched reconciliation evidence; atomically changes mode and revision, with audit. |
| `record_customer_financial_source_sync(uuid,uuid,text,text,timestamptz,text,integer,text[],text)` | `service_role` only | Exact evidence replay, active source/account binding, same-tenant scope and monotonic `source_as_of` watermark; sync evidence rows are append-only (UPDATE/DELETE rejected by PostgreSQL). |
| `get_customer_account_statement()` | `authenticated` | Server selects source. APP_ONLY uses the pre-existing app ledger; ONYX/MUTAKAMEL fail closed until their authorized reader exists. No source blending or app-ledger fallback. |
| `get_customer_invoice_pdf(uuid)` | `authenticated` | Own-customer invoice only; source is locked during read and external-mode customers cannot read APP_ONLY invoices. |
| `get_my_customer_payment_receipt_print_options(integer,integer)` | `authenticated` customer | Customer-derived profile/org/customer; APP_ONLY + active binding held `FOR SHARE`; bounded 1..100 page of that customer's saved receipt headers only. |
| `get_my_customer_payment_receipt_print_data(uuid)` | `authenticated` customer | Own receipt only; source binding held `FOR SHARE`; validates 2..50 distinct same-currency invoice allocations, positive amounts and exact header sum before returning the print DTO. No payment write. |

The reconciliation payload uses one object per currency, with canonical decimal strings
(not JavaScript floating-point values), for example:
`{"YER":{"current_source_balance":"100.00","target_source_balance":"100.00"},"USD":{"current_source_balance":"25.50","target_source_balance":"25.50"}}`.
P4 must compute these values from actual source and target ledgers and provide its source
receipt; tests use disposable fixtures only. The RPC validates object coverage, exact
numeric precision and equality before a maker can approve the source transition.

## Open API-OPS acceptance

- A current-main source-generated semantic inventory for the 349 cached RPCs is not yet checked into main.
- 437 public-schema routines and 349 PostgREST RPCs are different counts; neither proves semantic authorization completeness.
- Six Edge Function sources are not deployed; no worker/provider/browser receipt is proven.
- The anon categories RPC and service-only bootstrap RPC have focused live grant checks; nonempty fixture/browser acceptance and admin invitation lifecycle remain open.
- DLV-015 remains PARTIAL until every callable high-risk routine is mapped to a matrix acceptance leaf and tested for its applicable identity/role/tenant/input/idempotency/concurrency/audit/denial contract.

## Next action

Regenerate a current callable RPC/Edge inventory from active main and the approved Supabase project. Compare signature, grant, SECURITY DEFINER/search_path, source migration, caller and named tests. Start with uncovered high-risk finance/inventory/auth mutations. Do not replay historical migrations, restore the archive test tree wholesale, or declare semantic closure from source matching alone.


### P2 customer receipt print snapshot guarantee (2026-11-28)

`get_my_customer_payment_receipt_print_data(uuid)` returns an APP_ONLY customer-only DTO after a single materialized allocation snapshot passes amount/count/currency reconciliation. It takes an exclusive row lock on the receipt header (blocking concurrent foreign-key KEY SHARE references that could append phantom allocations) and shared locks on existing allocation rows until the caller transaction ends. It performs no write.


### P2 staff receipt print snapshot guarantee (2026-11-28)

`get_staff_customer_payment_receipt_print_data(uuid)` now follows the same lock order as customer printing: source binding `FOR SHARE`, receipt header `FOR UPDATE`, existing allocation rows `FOR SHARE`. It reconciles and returns allocations from one materialized SQL snapshot and rejects tenant/customer/currency mismatches. No financial write occurs.

- `get_customer_payment_receipt_print_options(integer,integer)` derives its staff-facing total, ordered receipt page and `has_more` from one materialized SQL snapshot, avoiding inconsistent pagination metadata during concurrent receipt activity.

### P2 return-credit journal source boundary (2026-11-28)

Source-linked `accounting_journal_entries` and `accounting_journal_lines` are now guarded at the database write boundary, not only through the credit-memo and posting-link tables. The guard resolves original `customer_return_credit_memo` journal references and the `adjustment` reference prefix used by credit-memo reversals, locks the parent memo and active customer source binding, and denies header/line insert, update or delete unless the customer source is active `APP_ONLY`. It also prevents detaching a source-bound journal header or moving its existing lines to another parent. Journal-line parent lookups take `FOR SHARE` so concurrent line writes serialize with journal-header changes and source cutover. The exact acceptance test creates a local-only return-credit memo/journal/line fixture, proves no-change denial under ONYX and MUTAKAMEL, proves binding-lock exclusion with `FOR UPDATE NOWAIT`, and proves authorized mutations resume only after maker/checker returns the customer to APP_ONLY. The same source test runs inside the isolated local PostgreSQL 17 P2 workflow after its fixture seeder.

### P2 customer invoice/payment journal and posting evidence boundary (2026-11-28)

The same customer-source binding now protects general-ledger entries and lines whose journal source is `invoice` or `payment`, as well as the original `customer_return_credit_memo` and the `adjustment` reversal reference `customer-return-credit-memo-reversal:<credit_memo_id>`. The guard resolves invoice/payment ownership through the local customer invoice/payment rows and locks those source rows plus the APP_ONLY binding before any journal-header or line insert/update/delete. Source identity cannot be detached or moved to another parent. `accounting_customer_source_postings` is separately protected: invoice/payment posting evidence is source-checked on insert and is append-only; updates and deletes are rejected even while APP_ONLY. This closes the privileged journal surface that table RLS alone cannot protect. Acceptance creates real disposable invoice/payment source rows and journal/posting fixtures, checks ONYX/MUTAKAMEL denial and before/after equality, and proves APP_ONLY writes return only where the contract allows them. No external ERP reader/transport or production operation is implied.

### P2 customer-source financial read isolation — restrictive RLS (2026-11-28)

The customer-source boundary now applies to finance-staff direct reads as well as writes. Seven `AS RESTRICTIVE` policies narrow `accounting_journal_entries`, `accounting_journal_lines`, `accounting_customer_source_postings`, `customer_return_credit_memos`, `customer_return_credit_memo_items`, `accounting_return_credit_memo_postings`, and `accounting_return_credit_memo_reversals`. Their boolean-only SECURITY DEFINER guards derive the customer from the persisted source document, verify the current staff organization, and take `FOR SHARE` on the customer source binding. Invoice/payment/credit-memo customer journals and posting evidence are visible only while the binding is active `APP_ONLY`; unrelated manual/non-customer journals retain the existing tenant/role policy. The line policy resolves its parent journal under a shared row lock before checking the source. This serializes direct staff reads against maker/checker cutover and prevents stale internal balances/credit documents from appearing after ONYX/MUTAKAMEL selection. Acceptance uses real disposable invoice, payment, memo and journal fixtures: manager reads succeed while APP_ONLY, return no rows for the same IDs under ONYX and MUTAKAMEL, and become visible only after approved APP_ONLY return. It also verifies the seven policies are RESTRICTIVE. This proves local policy behavior only; it does not imply a hosted migration or an external ERP reader.
