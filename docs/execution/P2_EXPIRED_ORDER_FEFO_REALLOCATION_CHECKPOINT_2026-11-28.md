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
- Added manager/admin-only paginated RPC `list_orders_with_expired_fefo_reservations(integer,integer)` for the warehouse work queue. It returns only confirmed/processing orders with positive net expired reservations, safe order/product/warehouse/batch fields, whether batch reserved quantity reconciles, and current non-expired replacement availability. Total, page rows and `has_more` come from one materialized statement snapshot.
- The RPC derives tenant and actor from the authenticated active profile; it never accepts a caller-supplied organization ID.
- It validates the order remains `confirmed` / `processing` and has no sale movement, takes the order row lock, shares the same product reservation advisory lock as `reserve_order_inventory()`, and locks same-tenant balances and lot rows in deterministic order.
- It calculates outstanding reservation per batch from immutable movement evidence: `reserve - release_reservation`. Only expired batches with a positive outstanding reservation are moved.
- It appends a release movement against the expired batch, then FEFO reserve movements against non-expired available lots in active same-tenant warehouses. Aggregate balances and batch subledger change in the same transaction. If replacement stock is insufficient, the entire operation rolls back, including the release movement.
- A server-only idempotency ledger prevents repeated execution. Exact retries return the persisted result; payload reuse with a different order/reason is rejected. A no-op response explicitly reports `no_expired_reservations` and zero quantity.
- Before releasing an expired batch, reallocation validates that both its reserved counter and its warehouse aggregate reserved counter cover the combined net `reserve - release_reservation` movements of every active order. A shortfall fails closed with SQLSTATE `40001` before any movement or stock counter changes.
- The worklist's `reservation_matches_batch` compares against the combined active-order reservation ledger for the lot, not only the individual order being displayed; multiple orders sharing one batch cannot each receive a misleading per-order `true`.
- Before a shipment/delivery transition, the trigger compares net `reserve - release_reservation` quantity per product against the sum of `order_items.quantity`. A mismatch, under-reservation, or unexplained extra reservation fails closed with SQLSTATE `55000`; a full commercial order cannot be marked shipped after only a partial stock sale.
- Shipment now fails closed with SQLSTATE `55000` while any net outstanding reservation still references an expired lot. Both shipment and cancellation settle only the net outstanding reservation after prior releases; previously released batches are not sold or released twice.
- Reallocation records an audit event and does not write payments, invoices, receivables, cost postings or journals.
- Strict execution boundary: `anon` and `service_role` are explicitly denied `EXECUTE`; only `authenticated` can reach the RPC, whose body then enforces manager/admin capability. The idempotency table grants no direct `SELECT` to authenticated or service_role. PG17 acceptance asserts both function and table privileges.

## Acceptance added

The existing CI-wired `scripts/test-inventory-batch-fefo.mjs` now covers:
- A confirmed/processing order reserved on a previously valid lot whose expiry later passes.
- The manager work queue returns the order and exact expired lot before reallocation, exposes in-date replacement availability, validates pagination and removes the order from the queue after successful reallocation. Customer-role access to the work queue is denied.
- Shipment denial and unchanged order status while the reservation is expired.
- Manager reallocation into a new, earlier-valid FEFO lot.
- Exact retry replay, conflicting idempotency payload rejection, and explicit zero-work response when no expired reservation remains.
- Release/reserve movement lineage for the same order, shipment sale from the replacement batch (never the expired original), customer-role denial, and aggregate balance ↔ batch subledger parity.
- Post-reallocation cancellation: after moving a reservation from an expired source lot to a valid replacement lot, cancellation releases only the replacement reservation; the source lot is not released twice, both lot reserved counters return to zero, and the order ends cancelled.
- Shipment completeness: a two-unit order begins with two units reserved across real FEFO lots; a controlled test-database release reduces the net reservation to one, then shipment is rejected before any sale movement or additional stock mutation. The order remains `processing`.
- Insufficient replacement stock: the test expires every remaining positive lot, forces reallocation to fail with SQLSTATE `P0001`, then proves the original batch reservation and aggregate reserve total are unchanged and no release movement survived the rolled-back transaction.
- Shared-lot ledger drift: two active orders reserve the same lot; the disposable fixture under-reports the batch and aggregate reserved counters while keeping their physical subledger totals equal. The worklist flags both orders as mismatched, and reallocation rejects with SQLSTATE `40001` without changing either counter or appending a release movement.

The existing P2 workflow already invokes this FEFO acceptance script on its disposable local Supabase/PostgreSQL 17 stack; no parallel workflow or dependency was added.

## Safety and acceptance boundary

- No hosted/production database, production stock, live customer order, supplier, ERP endpoint, deployment, paid service or secret was used.
- All stock mutations in acceptance are confined to the disposable local PostgreSQL 17 test database.
- The exact new PR-head CI runs must finish successfully before this code is accepted. Queued, skipped or previous-SHA results do not count as PASS.
- P1 retains final merge authority; P2 does not merge to `main`.

## Additional P2 hardening on PR #701

Shipment settlement now validates exact net reserved quantity against the complete order lines per product before creating any sale movement. This protects against false full-shipment status and partial stock deduction after reservation release or ledger drift. The PostgreSQL 17 acceptance uses a real two-unit order and real batch movements, then proves a one-unit shortfall cannot ship or mutate stock.

## Additional P2 hardening on PR #701

The warehouse worklist now checks the combined active-order reservation movement ledger per batch. The reallocation transaction independently guards both batch and aggregate reserved counters before changing stock. The exact-head PostgreSQL 17 test now includes two live orders sharing one lot and a controlled disposable-database ledger shortfall; the expected result is a false worklist parity indicator plus a no-write SQLSTATE `40001` rejection. This fixture is not production data.

## Additional P2 delivery — incomplete order reservation recovery

- Added manager/admin-only paginated RPC `list_orders_with_incomplete_inventory_reservations(limit,offset)`. It finds confirmed/processing orders whose net lot-backed reservation quantity is below the persisted order-line quantity, and returns safe per-product ordered/reserved/missing amounts, valid FEFO availability, and whether expired-lot reallocation is a prerequisite.
- Added manager/admin-only `reconcile_incomplete_order_reservations(order_id,idempotency_key,reason)`. It fills only the true missing quantity, by FEFO across active same-tenant warehouses; it does not accept an organization ID from the caller.
- The reconciliation action rejects orders with an outstanding expired-batch reservation until the expired FEFO workflow runs. It also fails closed on batch or warehouse active-order ledger under-reporting, over-reservation, batchless history, insufficient replacement stock, and orders with an existing sale movement.
- The action locks the order, the shared product reservation mutex, balances and batches; it appends real `reserve` movements, updates both lot and aggregate balances atomically, records an audit event, and uses a separate server-only idempotency ledger. Exact replay is safe; changed-payload reuse is rejected.
- The reconciliation ledger is inaccessible through direct table reads to authenticated and service_role. Only authenticated may execute the RPC entrypoint; its body restricts execution to same-tenant admin/manager operators.

### New acceptance coverage
- Two-unit order deliberately reduced to one net reserved unit: manager worklist reports the exact one-unit shortage and valid replacement availability.
- Expired outstanding reservation blocks the repair RPC until the FEFO reallocation path is completed.
- Manager repairs the shortfall with one appended reserve movement, exact replay does not duplicate it, changed reason with the same key is denied, and a second invocation returns a truthful `already_complete` zero-work result.
- The repaired order leaves the incomplete-reservation worklist and then ships with a complete `-2` sale movement total.
- Customer is denied both worklist and reconciliation; function ACL and direct reconciliation-ledger read restrictions are asserted.
