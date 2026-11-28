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

The reconciliation mutation rechecks both the selected batch's on-hand/reserved capacity and the aggregate balance's available quantity in the actual UPDATE predicates after acquiring the row locks. A changed or inconsistent availability fails with SQLSTATE `40001`; it cannot increment the lot counter and aggregate counter independently.

## Additional acceptance hardening — missing-reservation shortage rollback

The PostgreSQL 17 script now creates a separate two-unit processing order, reduces its net reservation to one using a matching release movement, then simulates the loss of its final free unit while keeping the batch and aggregate physical counters aligned. The incomplete-reservation worklist must report a one-unit deficit and zero valid replacement quantity. The manager repair RPC must return SQLSTATE `P0001`; the original lot/aggregate counters, reserve movement count and idempotency ledger must remain unchanged. The deliberately corrupted shared-lot fixture is restored after its independent mismatch assertion so this shortage scenario starts from reconciled source ledgers.

## Additional P2 delivery — over-reservation detection and release

- Expanded `list_orders_with_incomplete_inventory_reservations(limit,offset)` into a per-product reservation-mismatch worklist. It now returns `reservation_status` (`short` / `excess`), `missing_quantity`, `excess_quantity`, plus order-level `has_shortage` and `has_excess`. It detects product-level mismatches even when an order's aggregate total happens to net to zero.
- Added manager/admin-only `release_excess_order_reservations(order_id,key,reason)`. It releases only the net reservation amount above the persisted order-line quantity, from the least-urgent lots first (no-expiry/latest-expiry first) so earlier-expiry FEFO allocations are preserved. It never reduces on-hand stock.
- The release RPC shares the server-only idempotency ledger but uses an operation-specific payload discriminator; exact retries are safe and payload reuse across actions is rejected. It validates same-tenant order status, batch lineage, active-order movement-ledger parity and aggregate balance counters, uses the shared product lock, writes append-only `release_reservation` movements, and emits an audit event.
- Mixed per-product mismatches can be fixed in separate steps: the shortage repair fills only deficits; excess release removes only overages. Each action leaves the other discrepancy visible in the queue, without offsetting one product against another.
- Acceptance now creates an over-reserved one-unit order with two units in a real lot, asserts the worklist identifies one excess unit, releases exactly one reservation, verifies audit/idempotent replay/payload-conflict behavior, proves the order exits the mismatch queue, then ships exactly one unit.
- Customer denial and function ACLs are asserted for the excess-release RPC.

## Exact P2 implementation snapshot — 2026-11-28

- Implementation + acceptance source parent: `310ff073a4a9ab7fa1e6b32fd16018d7367e7776`.
- Migration blob: `0e664fcaecf4e7ce35c18c40beb63e46b59796c4`.
- PostgreSQL 17 acceptance script blob: `2ecf726c77301e99705bfe27463dc7d45228bc78`.
- Scope remains exactly the three files listed above; no UI, dependency, workflow, production or environment configuration changes.
- Exact-parent CI at record time: P2 Playwright run `46082509814` QUEUED; PostgreSQL 17 run `46082509815` QUEUED; P1 Admin Context run `46082509843` QUEUED. Combined status set empty; no PASS claimed.
- P1 handoff updated in PR #701 with both-sided exception queue and manager-only actions, including mixed per-product repair order and reverse-FEFO excess release.

## 2026-11-28 — Aggregate availability guard follow-up

- Static review found a cross-warehouse FEFO reallocation gap: replacement lot selection checked the lot's free quantity, but the subsequent aggregate warehouse-balance UPDATE did not re-check aggregate available quantity.
- Fixed `reallocate_expired_order_reservations`: aggregate reservation increments now require `inventory_balances.quantity_available >= v_take` in the UPDATE predicate; a mismatch raises SQLSTATE `40001` and rolls back the source release, target reservation, movement rows, audit, and idempotency write.
- Extended `scripts/test-inventory-batch-fefo.mjs` with a separate-active-warehouse fixture: a valid replacement lot remains available at batch level while its aggregate balance is deliberately reduced to zero. The test expects the RPC to fail closed, verifies no reserve/release movement or reservation-counter change survives, restores the aggregate fixture, then retries with the same idempotency key and expects normal reallocation.
- Receipt helper accepts an optional target warehouse for this controlled fixture; direct fixture writes run as the local DB owner only. No production database writes, deployments, ERP calls, or financial postings.
- Implementation commit: `c3dbc177ce988aeee575d2df9a52499dfb0d9f22`. This is an additional exact-head test requirement; GitHub Actions acceptance for the resulting checkpoint head must run before any PASS claim. Local PostgreSQL 17 execution was not available from this session.
- Next: run and inspect PostgreSQL 17 acceptance plus P1/Playwright checks on the final checkpoint SHA; fix only exact-head failures. PR #701 remains Draft and requires P1 review/P3 merge.

- Additional rollback evidence: the cross-warehouse test now snapshots and compares both source and target `inventory_balances.quantity_reserved` values before and after the rejected RPC, in addition to batch counters and movement count. It verifies that no aggregate reservation counter changes survive.
- Latest acceptance-test source commit: `55f85309754c7be8dbd9174002445526e4783832`. The subsequent checkpoint commit is the PR head used for exact-head CI.

- CI fixture correction: the P2 seed deliberately creates two active but unassigned warehouse fixtures. The FEFO cross-warehouse test now selects one of those exact fixtures and grants the manager an explicit, audited warehouse scope through `set_authorization_profile_scope` using the local admin JWT before receiving the replacement purchase lot. This avoids accidental permission denial while preserving the RLS test's unassigned warehouse fixtures until the targeted assignment step; all writes stay inside disposable PostgreSQL 17.
- Latest acceptance-test commit: `5fcd058b7626c58c94b3666a38a1aaf3a6731ecf`. A fresh checkpoint and exact-head CI run are required; no acceptance claim is made until that head completes.

## 2026-11-28 — Reservation parity preflight in both manager work queues

- The expired FEFO queue now returns `reservation_matches_balance` independently of `reservation_matches_batch`. The balance flag compares the warehouse reserved counter with the combined net reservation movements of every active order for the same tenant/product/warehouse. A missing aggregate balance row returns false.
- The incomplete-reservation work queue now returns `reservation_batch_ledger_matches` and `reservation_balance_ledger_matches` on each affected product line. It also marks a product's batch ledger false when an active reservation movement has no batch lineage, and its aggregate check is scoped to warehouses owned by the active organization.
- Added PostgreSQL 17 coverage for a shared expired batch whose batch and warehouse counters both under-report two active orders, then a separate aggregate-only under-report case where batch parity remains true. The latter proves both worklists distinguish the two failure classes and that FEFO reallocation fails with `40001` without appending a release/reserve movement or changing the aggregate counter.
- The test temporarily increases one local order line to create a visible one-unit shortage so the incomplete-reservation queue exposes its parity fields, then restores the line before subsequent scenarios. This is isolated test-fixture DML only.
- P1 UI instruction: disable both FEFO reallocation and incomplete-reservation repair whenever either relevant parity flag is false; show a ledger conflict and refresh. Do not treat a batch-parity true value as proof that the warehouse aggregate is healthy.
- Latest migration commit: `9f9ad2fd3f926a4723c2696d1aaf8c5d92414e39`; latest test update: `a3f2b249fc1d376d2f4ad9d078579e5134aa0574`. CI must run on the final checkpoint SHA; no local PostgreSQL 17 PASS is claimed.


## 2026-11-28 — Effective FEFO function override guard correction

- A post-change static audit found that the migration contains an earlier guarded reallocation definition and a later effective replacement definition. The later definition had omitted the atomic `inventory_balances.quantity_available >= v_take` predicate, so PostgreSQL would install the unguarded version despite the earlier fix.
- Corrected the **effective final definition** to apply the aggregate availability predicate in the same UPDATE that increases `quantity_reserved`; if another transaction or batch/aggregate drift leaves insufficient aggregate availability, the function raises SQLSTATE `40001` and the full transaction rolls back.
- The existing cross-warehouse acceptance fixture already exercises the exact failure: a replacement lot has batch-level free quantity while its aggregate warehouse balance has no available quantity. Its no-mutation assertions remain the regression gate.
- This is a confirmed correction to the active function body, not a production operation. Exact-head PostgreSQL 17, Playwright and P1 checks must be rerun against the resulting PR head. No PASS is claimed.


## 2026-11-28 — Migration structure repair and bidirectional reservation parity

- Raw-file verification found the migration had been structurally truncated in two places: the reservation-reconciliation table CHECK clause stopped mid-expression before an orphaned function parameter list, and the finalizer body stopped in its cancellation loop before stray table-DDL fragments and `COMMIT`. A second trailing finalizer override was also incomplete.
- Removed the obsolete orphaned early reallocation body, restored the complete `inventory_order_reservation_reconciliations` table definition, its JSON object checks, tenant-scoped idempotency uniqueness, RLS enablement, and revocation of direct browser/service-role table access.
- Rebuilt one complete `finalize_order_inventory()` trigger function and removed the truncated duplicate. Shipment now validates net reservation quantity per product, rejects outstanding expired lots, and settles only positive net reserve-minus-release quantities per batch. Cancellation releases only positive outstanding net reservations and fails closed on a negative movement ledger; a reallocated source lot is not released twice.
- Replaced one-sided counter checks with exact equality: expired FEFO and incomplete-reservation queues detect both over- and under-reporting; shortage/excess repairs and source FEFO reallocation require exact batch and warehouse parity. Warehouse-level parity includes all active order reservation movements, not only batch-linked movements.
- FEFO reallocation now independently checks the destination batch reserved counter and destination warehouse reserved counter against all active orders before each replacement reservation. The aggregate availability predicate remains atomic in the destination UPDATE.
- Extended `scripts/test-inventory-batch-fefo.mjs` with separate batch-only and warehouse-only over-report scenarios. Both manager worklists must expose the relevant false flag; the RPC must reject with SQLSTATE `40001` and append no movement or counter mutation. Existing under-report tests remain.
- Corruption fixtures disable only the local disposable database's aggregate-to-batch sync trigger during deliberate counter tampering, and restore it in a `finally` block before any authenticated RPC; no production database, trigger, or stock data is touched.
- Structural static check on the migration source: 7 `CREATE OR REPLACE FUNCTION` declarations, 7 closing `$function$;` delimiters, exactly one final `COMMIT;`, no truncated table signature fragment, and one finalizer definition. This is not a PostgreSQL parse or execution result.
- The exact-head PostgreSQL 17, P1 TypeScript/Vitest and Playwright acceptance gates must run against the final branch head. No PASS is claimed and PR #701 remains Draft pending P1 review.


## 2026-11-28 — Negative peer ledger rejection and shipment settlement preflight

- Removed positive-only `HAVING net > 0` filters from the grouped active-order ledgers used by both FEFO worklists, both repair commands, and reallocation parity totals. Signed movement nets now contribute as recorded; an individual negative net is no longer silently omitted from a coincidentally matching aggregate.
- Added negative per-order/per-batch and per-order/per-warehouse blockers to both worklists. The incomplete queue exposes both parity flags as false when a negative peer ledger exists; the expired queue also marks both batch and aggregate flags false.
- Added fail-closed negative-ledger preflights to shortage repair, excess release and expired FEFO reallocation before any stock mutation.
- Extended the PostgreSQL 17 acceptance fixture with two active orders sharing one batch. It deliberately creates a negative net on one order while setting the physical counter to the amount that a positive-only query would have accepted. The test expects both worklists to flag the mismatch and reallocation to reject with `40001` without movement or counter changes, then restores the counters and appends a balancing reserve movement before subsequent scenarios.
- Rebuilt the finalizer with the same per-product advisory lock used by reservation commands. Before shipment or cancellation it locks affected balances then batches, rejects any active peer's negative net, and requires exact batch and warehouse reservation parity against all active order movements (including the order being finalized, whose status has already changed in this AFTER trigger).
- Shipment additionally retains the per-product order-line/net-reservation equality check and expired-lot guard. Cancellation settles only the positive remaining net reserve-minus-release quantity. The new regression asserts that shipment of one order is refused while a peer order has a negative shared-lot net, the order stays in `processing`, and no sale movement is posted.
- Test fixture sets the shared lot expiry to yesterday in the negative-peer case so it exercises the expired FEFO queue, and restores batch/warehouse counters plus the peer order's reservation net before the existing under-report/over-report cases.
- Exact-head PostgreSQL 17 / Playwright / P1 checks must be inspected on the resulting branch head. No local PostgreSQL execution or CI PASS is claimed. No production writes, live ERP calls or merge to `main`.
