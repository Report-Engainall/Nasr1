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

## Open API-OPS acceptance

- A current-main source-generated semantic inventory for the 349 cached RPCs is not yet checked into main.
- 437 public-schema routines and 349 PostgREST RPCs are different counts; neither proves semantic authorization completeness.
- Six Edge Function sources are not deployed; no worker/provider/browser receipt is proven.
- The anon categories RPC and service-only bootstrap RPC have focused live grant checks; nonempty fixture/browser acceptance and admin invitation lifecycle remain open.
- DLV-015 remains PARTIAL until every callable high-risk routine is mapped to a matrix acceptance leaf and tested for its applicable identity/role/tenant/input/idempotency/concurrency/audit/denial contract.

## Next action

Regenerate a current callable RPC/Edge inventory from active main and the approved Supabase project. Compare signature, grant, SECURITY DEFINER/search_path, source migration, caller and named tests. Start with uncovered high-risk finance/inventory/auth mutations. Do not replay historical migrations, restore the archive test tree wholesale, or declare semantic closure from source matching alone.
