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
