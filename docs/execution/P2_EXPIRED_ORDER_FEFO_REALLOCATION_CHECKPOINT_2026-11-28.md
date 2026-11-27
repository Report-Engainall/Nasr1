# P2 Execution Checkpoint — Expired Order Reservation FEFO Reallocation

Date: 2026-11-28
Repository: `Report-Engainall/Nasr1`
Owner: P2 — inventory transactions, lot lineage, PostgreSQL 17 and authorization
Base main: `12b0db37a97128a19073f907ba12fb700251802b`
Branch: `p2/expired-order-fefo-reallocation-20261128`

## Operational gap closed in code

The existing receipt → FEFO reserve → sale pipeline excluded already-expired lots at reservation time, but a lot could expire while an order remained `confirmed` or `processing`. The shipment trigger previously settled the old reservation without rechecking its expiry. That left a real path for an expired lot to be sold after its reservation aged.

## Delivered function and transaction changes

- Added manager/admin-only RPC `reallocate_expired_order_reservations(uuid,text,text)`.
- The RPC derives tenant and actor from the authenticated active profile; it never accepts a caller-supplied organization ID.
- It validates the order remains `confirmed` / `processing` and has no sale movement, takes the order row lock, shares the same product reservation advisory lock as `reserve_order_inventory()`, and locks same-tenant balances and lot rows in deterministic order.
- It calculates outstanding reservation per batch from immutable movement evidence: `reserve - release_reservation`. Only expired batches with a positive outstanding reservation are moved.
- It appends a release movement against the expired batch, then FEFO reserve movements against non-expired available lots in active same-tenant warehouses. Aggregate balances and batch subledger change in the same transaction. If replacement stock is insufficient, the entire operation rolls back, including the release movement.
- A server-only idempotency ledger prevents repeated execution. Exact retries return the persisted result; payload reuse with a different order/reason is rejected. A no-op response explicitly reports `no_expired_reservations` and zero quantity.
- Shipment now fails closed with SQLSTATE `55000` while any net outstanding reservation still references an expired lot. Both shipment and cancellation settle only the net outstanding reservation after prior releases; previously released batches are not sold or released twice.
- Reallocation records an audit event and does not write payments, invoices, receivables, cost postings or journals.

## Acceptance added

The existing CI-wired `scripts/test-inventory-batch-fefo.mjs` now covers:
- A confirmed/processing order reserved on a previously valid lot whose expiry later passes.
- Shipment denial and unchanged order status while the reservation is expired.
- Manager reallocation into a new, earlier-valid FEFO lot.
- Exact retry replay, conflicting idempotency payload rejection, and explicit zero-work response when no expired reservation remains.
- Release/reserve movement lineage for the same order, shipment sale from the replacement batch (never the expired original), customer-role denial, and aggregate balance ↔ batch subledger parity.
- Insufficient replacement stock: the test expires every remaining positive lot, forces reallocation to fail with SQLSTATE `P0001`, then proves the original batch reservation and aggregate reserve total are unchanged and no release movement survived the rolled-back transaction.

The existing P2 workflow already invokes this FEFO acceptance script on its disposable local Supabase/PostgreSQL 17 stack; no parallel workflow or dependency was added.

## Safety and acceptance boundary

- No hosted/production database, production stock, live customer order, supplier, ERP endpoint, deployment, paid service or secret was used.
- All stock mutations in acceptance are confined to the disposable local PostgreSQL 17 test database.
- The exact new PR-head CI runs must finish successfully before this code is accepted. Queued, skipped or previous-SHA results do not count as PASS.
- P1 retains final merge authority; P2 does not merge to `main`.
