# SRC-011 — Order-input hardening provenance and acceptance

**Status:** IMPLEMENTED on the P2 source-compatibility branch; exact PostgreSQL 17 acceptance is pending the current branch's CI result. No production data or production database was changed.

## Source reviewed (read-only)

- Repository: `Report-Engainall/NASR-MULTI-PROJECTS-TRANSFER`
- Path: `EXTRACTED_PROJECTS/project-bolt-github-gcrrtnzl/project/supabase/migrations/0011_order_input_hardening.sql`
- Source blob: `b74d858058474d39ae088054b13fa55ab6763850`

The donor migration hardens idempotent order creation, validates quantities/product activity, scopes records to an organization, and serializes same-key retries. It is **not safe to copy verbatim**: it expects legacy identity helpers, `public.order_status`, `orders.warehouse_id`, `product_prices.price_list_id`, `price_lists`, `inventory_balances.quantity`, and legacy `audit_events`/outbox contracts that differ from Nasr1.

## Target-native contract retained

- `supabase/migrations/20261009040000_checkout_integrity.sql`, blob `848ebce31dddc8a99e4a95e5c87825640fc5cfb3`: `place_order` derives active profile and organization server-side, validates a 1–100 line payload and quantity bounds, fingerprints normalized lines and business input, serializes same-profile retries with an advisory transaction lock, uses server-side tier pricing, rejects inactive/cross-organization products, and rejects a reused key with changed payload.
- `supabase/migrations/20261015140000_checkout_delivery_address_snapshot.sql`, blob `841205185569506b5f13f0608981d65dba55c572`: `submit_customer_order` reuses canonical `place_order`, freezes delivery-address details, and rejects replay that changes the address.
- Acceptance harness: `scripts/test-customer-cart-persistence.mjs`, original blob `4677c19df6629cfe63c06e37ce8d9fcf4ca56b32`. Existing `npm run test:db` already runs it; no package or workflow changes are needed.

## Added target acceptance

- Reusing a persisted idempotency key with changed order input must fail with the explicit payload-conflict error and leave exactly one order.
- Two concurrent requests using one fresh key must yield one creation and one replay, the same persisted order ID, exactly one order row, and one complete line set.
- Existing profile/tenant isolation, cart/checkout mismatch rollback, atomic cart conversion, and direct-table-DML denial assertions remain active.

**Required closure proof:** Core CI must pass the PostgreSQL 17 acceptance on the exact final SHA. Browser and production proof are separate states; no live Onyx connection, Onyx target compatibility, or production migration is implied.
