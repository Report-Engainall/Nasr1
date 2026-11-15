# P3 Checkpoint — Aghbari Customer Order Trial Readiness

**Date:** 2026-11-16 (Asia/Aden)  
**Repository:** `Report-Engainall/Nasr1`  
**Branch:** `main`  
**Main HEAD before this checkpoint:** `e0f9cc6073642b954405a71f7aeb8d5321e62fbe`  
**Latest accepted application-source SHA:** `5dde9dde14a84dc43580a87aec23885023c261fc`  
**Supabase project:** `aghbari-commerce-nasr1` (`tfdwtuwkdddnzgyhcoyy`, PostgreSQL 17.11, ACTIVE_HEALTHY)

## Exact-SHA test evidence

- P2 workflow [#43639908541](https://github.com/Report-Engainall/Nasr1/actions/runs/43639908541) completed **SUCCESS** on exact `e0f9cc6073642b954405a71f7aeb8d5321e62fbe`.
- Public UI smoke: SUCCESS. The exact source built with isolated, non-routable placeholder configuration and read-only browser assertions passed.
- Local Supabase/PostgreSQL 17 authenticated E2E: SUCCESS. The job applied repository migrations to an isolated local database and ran authenticated Chromium acceptance.
- Explicitly successful steps include authenticated order persistence and cross-tenant denial, checkout replay after a committed response is lost, and exact-SHA browser/storage proof verification.
- External hosted customer/order/tenant E2E: **SKIPPED**, not PASS. The separate authenticated infrastructure gate succeeded, but the hosted test itself was not executed.
- P1 Admin Context Verification [#43638932461](https://github.com/Report-Engainall/Nasr1/actions/runs/43638932461) completed SUCCESS on `ba866ba1e7693ae567efcdde30b268c6a1be7e88`. The four commits from the accepted application SHA `5dde9dde...` to `e0f9cc6...` touched workflow/documentation/test files only; no application component or migration was changed in that interval.

## Read-only live database verification — 2026-11-16

The active Supabase project was queried using SELECT statements only. No rows were inserted, updated, deleted, or migrated.

| Check | Live result |
|---|---:|
| Public storefront publication | Enabled; main warehouse linked |
| Price visibility on cards / cart / orders | Enabled / enabled / enabled |
| Active categories | 19 |
| Active products | 114 |
| Products per active category | 6 |
| Active price rows | 342 |
| VIP / wholesale / retail price rows | 114 / 114 / 114 |
| Active products missing an active price | 0 |
| Inventory balances | 114 |
| Available opening units | 3,235 |
| Inventory movement rows | 114 |
| Opening movement reference | 114 `owner_authorized_opening` |
| Page 1 / page 2 via catalog RPC | 100 / 14 |
| Customer records | 0 |
| Supplier records | 0 |
| Customer orders | 0 |
| Purchase orders | 0 |
| Primary product images / gallery links | 0 / 0 |

The 3,235 units are still the owner-authorized editable opening estimate marked pending physical count; they are not independently verified physical stock. Product prices are market-reference selling prices, not supplier acquisition costs or invoice-backed landed cost.

The public catalog RPC returned all 114 products in two pages and the 19-category RPC returned all active categories. All 100 products in the first read page had a positive server display price and positive available quantity. Page 2 contains the remaining 14 products. The live public settings RPC also returns `show_price_on_cards=true`, `show_price_in_cart=true`, and `show_price_in_orders=true`; the user-facing card, cart and order pricing policies therefore permit display. The storefront therefore has real published catalog, server-derived price and availability data; it is not a local mock catalog.

A repository asset-tree check found no product image files suitable for linking. The current storefront uses its existing package-icon fallback when `image_url` is null. Do not assign generated/stock imagery as if it were the actual manufacturer pack, and do not insert hotlinks or guessed Storage URLs. Complete image linking only with genuine product images through the existing authenticated same-tenant uploader.

## Customer registration and order contract

- `/register` mounts the current `Login` component, not the legacy React Router registration page.
- After verified phone OTP or verified email activation, the Auth profile loader calls `ensure_my_customer_account()`. That RPC derives tenant, profile, customer role, contact identifiers and default tier from the verified session; it creates a pending retail customer with zero credit/balance and an audit event. It is idempotent and does not grant staff access.
- The profile page exposes customer approval state. Newly self-registered customer accounts are `pending`; this is intentional.
- The database `current_customer_can('orders.create')` gate denies pending, frozen, rejected and blocked direct customers. Do not remove or bypass this guard to make a test order pass.
- The modern storefront checkout calls `validate_checkout_cart`, verifies server-side cart persistence through `sync_customer_cart`, then submits only product IDs/quantities and non-financial request fields to `submit_customer_order`. Server pricing, stock policy, authorization and idempotency remain authoritative. The persistent cart converts atomically with a matching committed order.
- Read-only privilege checks confirmed `anon` cannot execute `ensure_my_customer_account()`, `submit_customer_order(...)`, or `set_admin_customer_status(...)`; authenticated users can execute them subject to the functions' internal tenant, role, approval and request guards.
- The active `set_admin_customer_status(uuid,text,text,text)` definition permits `admin`, `manager`, and `customer_manager`; it enforces a tenant-scoped row lock, expected-current-status check, a 3–500-character reason, and a before/after audit event. The active `/admin/customers` UI exposes `إدارة دورة الحياة` and the pending-to-approved command `اعتماد العميل`.
- The older `src/pages/store/CartPage.tsx` is not the active TanStack `/cart` route. Do not send buyers through that legacy page; active `src/routes/cart.tsx` and `src/routes/checkout.tsx` mount `Storefront`.

## What is and is not ready for the owner's trial

**Ready and verified in source/local acceptance:** published catalog RPC; 19 categories and 114 product rows; all tier prices; available inventory projection; modern customer cart and checkout flow; server-side pricing/authorization; idempotent order submission and atomic cart conversion in isolated authenticated E2E.

**Not yet demonstrated in the hosted shop:** a real verified customer session, managerial approval of that customer, a real hosted customer order, product photos in Storage, and an authenticated live browser session. There are currently no customer records or customer orders in the live database. Therefore no real hosted purchase has been performed or claimed.

## Safe next steps for the owner

1. In the existing deployed Aghbari app, open `/register` and create a customer account using the owner's or buyer's real verified phone/email. If phone OTP is not enabled by the Auth provider, use the email-confirmation option; no SMS/payment provider should be enabled or purchased as part of this task.
2. Sign in separately with the existing authorized admin/manager account, open customer management, and approve the newly registered customer. Do not create a fictitious customer, manually set credit, or approve an unidentified account. The new self-service account defaults to retail tier and zero credit.
3. Sign in as that approved customer, open the product catalog, select an available product/quantity, add it to the cart, open `/cart`, then `/checkout` and submit. The server will calculate prices and enforce available stock; inspect the resulting row under `/orders`.
4. Upload genuine pack/product photos separately through the authenticated image uploader. Reconcile the opening inventory with a physical count before treating the balances as final operating stock.

## Safety boundary

No hosted database write, customer/account creation, order, invoice, supplier, purchase order, inventory adjustment, migration, RLS/role change, Edge deployment, app deployment, Vercel action, paid service, or secret/configuration change was performed. This checkpoint records evidence and the exact next action; it does not convert local E2E success into hosted production proof.

**Current result:** storefront and order implementation have successful local PostgreSQL 17/Chromium acceptance and live read-only catalog verification. The first live purchase is gated on a real verified customer and explicit managerial approval. Product image linking and physical stock reconciliation remain open. Product release remains **NO-GO** for production claims.


## Follow-up execution — 2026-11-16, after the checkpoint

**Current main code/test SHA:** `0b06422120435d6bfb0b6f2b71e7133e4bbf0760`.

- A subsequent P2 run on `d501303ee23a77c46c1af005fea206f94b316dfa` passed the public UI smoke but failed its newly added category-tree browser test because the test selected the generic accessible label `فتح الفروع` while five tree nodes exposed that same label. The failure was a Playwright strict-locator ambiguity, not an application/database error.
- Corrected only `e2e/admin-category-tree.spec.ts`: the test now scopes the expand action to the list item containing its own generated `rootName`. No product, category, stock, price, authorization or runtime application code was changed by this fix.
- New exact-SHA P2 run: [#43769300232](https://github.com/Report-Engainall/Nasr1/actions/runs/43769300232), source SHA `0b06422120435d6bfb0b6f2b71e7133e4bbf0760`.
- On that exact SHA, the public UI smoke job completed **SUCCESS**: isolated production build, Vite preview, public storefront browser smoke, price-visibility harness and proof-boundary recording.
- The isolated authenticated PostgreSQL 17/Chromium job `132981966020` is **IN_PROGRESS** at the point this checkpoint was updated. It has passed runner setup, exact-SHA checkout, TypeScript/E2E preparation, local-only Docker check, isolated Supabase startup and Storage preparation; migration application/local acceptance is running. Do not label its order, Storage or category-tree phases PASS until the complete job and exact-SHA proof verifier finish.
- Hosted external customer/order/tenant browser E2E remains **SKIPPED**, not PASS, because the dedicated hosted non-production E2E credentials/permission are not configured. The hosted Aghbari database was not written by this follow-up.

### Additional live catalog quality read

The live database remains unchanged. A read-only quality query of all 114 active products found:

| Field / check | Result |
|---|---:|
| Active products | 114 |
| Missing primary image | 114 |
| Missing barcode | 114 |
| Missing English name | 114 |
| Missing Arabic description | 0 |
| Missing active price | 0 |
| Missing/duplicate SKU | 0 / 0 |
| Products with no available stock | 0 |
| Invalid minimum/multiple order policy | 0 |

Barcodes must come from supplier/manufacturer packaging; do not synthesize EANs or scannable identifiers. English names may be curated translations but should not be presented as brand/model truth without product-label evidence. Images must be genuine pack/product images supplied or verified by the owner/supplier and uploaded by an authenticated admin/manager/staff user through the existing `product-image-upload` flow. The current admin product editor already supports primary and up-to-eight gallery uploads, conversion to WebP, preview, server linking and cleanup.

**No live customer/account, order, supplier, purchase order, invoice, receipt, inventory adjustment, image object, migration, role/RLS change or deployment was created by this follow-up.**


## Additional production-boundary review — Supabase advisors and storefront configuration

Read-only Supabase advisor snapshot observed 2026-11-15:

| Advisor | Count | Level |
|---|---:|---|
| RLS enabled with no direct policies | 56 | INFO |
| Anonymous SECURITY DEFINER functions | 7 | WARN |
| Authenticated SECURITY DEFINER functions | 299 | WARN |
| Leaked-password protection disabled | 1 | WARN |

The seven anonymous functions observed were the six intended public storefront read contracts plus `get_product_unit_conversions(p_product_id)`. That function derives the public storefront organization, verifies the product belongs to that organization and is active for non-staff callers, and returns only the product's unit conversion rows; it is tenant-scoped, but its public exposure should remain explicitly documented. The 56 RLS-without-policy findings are not automatically public-table leaks: direct PostgREST access is denied in the absence of policies and some tables are accessed only through role-checked SECURITY DEFINER RPCs. The 299 authenticated SECURITY DEFINER functions must be audited by contract/role/tenant before broad changes; do not remove grants wholesale.

**Outstanding security fix:** Supabase Auth leaked-password protection is disabled. Remediate it through the supported Auth project configuration after documenting its user-facing password rejection behavior and validating signup/reset flows. It was not changed in this task.

**Storefront text mismatch found:** the public settings RPC currently returns `hero_title = "الأغبري لتجارة الحبحب"`, while the active catalogue contains wheat, rice, flour, oils, sugar, legumes, dairy, tuna, biscuits and other groceries. This is a visible configuration mismatch, not a missing product or data-query issue. Change it through the authenticated admin Settings interface after confirming the intended neutral business name; do not update `admin_settings` directly through a privileged database connection without the expected actor/audit path.


### Performance advisor snapshot

The read-only performance advisor on the same hosted project reported 520 findings: 361 unindexed foreign keys (INFO), 43 RLS auth-function initplan warnings (WARN), 85 unused indexes (INFO), 27 multiple permissive policy warnings (WARN), 3 duplicate-index warnings (WARN), and 1 table without a primary key (INFO). Health advisor returned zero lints. These are project-wide findings, not all proven storefront blockers; do not drop indexes or merge permissive policies blindly. Prioritize the customer/order/inventory/price FK paths and validate each index/policy change with representative query plans, role-denial tests and exact-SHA PostgreSQL 17 acceptance.

Official remediation references:
- Unindexed foreign keys: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys
- RLS auth initplan: https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan
- Multiple permissive policies: https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies
- Duplicate indexes: https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index


## Final exact-SHA acceptance — 2026-11-16

<badge>Would be DIL here</badge>

**Application/test source SHA:** `0b06422120435d6bfb0b6f2b71e7133e4bbf0760`  
**P2 workflow:** [#43769300232 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/43769300232)

All jobs and results:
- Public Storefront read-only Chromium smoke: **SUCCESS** on the exact SHA (build, preview, public route assertions, price-visibility harness).
- Authenticated E2E infrastructure gate: **SUCCESS**.
- Local Supabase/PostgreSQL 17 authenticated Chromium suite: **SUCCESS** (53 successful steps; no failed steps; cached Chromium install and failure-only diagnostics were correctly skipped).
- Hosted external customer/order/tenant E2E: **SKIPPED**, not PASS. It is not counted as an acceptance pass.

The local authenticated job proved on the exact source SHA:
- Real local product-image upload handler integration against the Supabase Storage API (WebP/object size, direct-write denial, service-role upload and product linking, public read, cleanup).
- Endpoint allow/deny; customer receivable identity separation and tenant boundary; atomic tier price edits with rollback/audit/stale-writer protection.
- Tenant-safe category subtree archive/create/product races; cash-journal source posting/idempotency/concurrency; purchase receipt accounting draft restrictions; product review and question moderation with tenant isolation.
- Authenticated order persistence and cross-tenant denial; warehouse stock-count XLSX; purchase-order XLSX; checkout replay after lost commit response; customer returns, receipts and credit memo; audited Onyx order export; finance document and task printing.
- Customer-manager privacy/authorization/audit; immediate device-session revocation; manager edits and reloads all four price tiers; responsive admin access matrix; mounted category tree parent/child persistence and deep-link/reload/360px+1280px acceptance; AI prompt lifecycle, maker/checker, tenant isolation and append-only audit.
- The exact-SHA proof verifier completed successfully for the generated Chromium, Storage, product-price and category-tree evidence.

**Artifacts (unexpired at verification):**
- Authenticated local Supabase/PostgreSQL 17 + Chromium evidence: [artifact 14184116943](https://api.github.com/repos/Report-Engainall/Nasr1/actions/artifacts/14184116943) — `p2-local-authenticated-e2e-43769300232-0b06422120435d6bfb0b6f2b71e7133e4bbf0760`, SHA-256 `c3e9ba8be9e3c9a2d9bdd8ac711f46c5163a66af0dcb84413f7febbbd3ecee28`.
- Public UI browser smoke: [artifact 14183556830](https://api.github.com/repos/Report-Engainall/Nasr1/actions/artifacts/14183556830) — `p2-public-ui-smoke-43769300232-0b06422120435d6bfb0b6f2b71e7133e4bbf0760`, SHA-256 `4f309174f480ea5fef6d3c1c08e125a7259927c1db369a9fbf43db7e5892ac93`.

The current `main` after this acceptance is `038d9bd7d9419604e2d9d5fa59ae0e2a3e1c4ada`. The three commits after tested code SHA `0b064221...` modify only this P3 checkpoint document; the GitHub compare confirms no application source, migration, RLS, policy, or database code changed after the tested SHA.

**Hosted/production boundary remains unchanged:** live database customer/supplier/order/purchase-order counts remain zero; no hosted customer, order, invoice, payment, image, inventory change, migration, Auth setting change, deployment, or paid service was created. The exact-SHA local acceptance is strong proof of the implemented workflow but does not substitute for a real hosted customer session and hosted order.
