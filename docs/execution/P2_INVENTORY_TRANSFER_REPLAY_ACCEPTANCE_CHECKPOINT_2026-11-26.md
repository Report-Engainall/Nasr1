# P2 Checkpoint — Inventory Transfer Endpoint Replay and FEFO Lot Lineage
Date: 2026-11-27
Repository: `Report-Engainall/Nasr1`
Role: P2 — PostgreSQL/RPC/migrations/transactions/inventory/finance
PR: #602
Branch: `p2/inventory-transfer-replay-endpoint-pg17-20261126`

## Current synchronization
- Latest main synchronized: `90597e5ba0071bc82cdde14174035b49f3399b51`.
- Previous synchronized candidate: `f63c3b7bb1faf259de64ff6bc10d82d48bd49c94` (main 6da + P2 test candidate).
- Eight intervening main commits affect only P1 supplier-performance/task-review panels and P1 workflow; these are retained. The P2 test and dedicated workflow remain unchanged.
- PR diff is limited to the P2-owned transfer test, its dedicated PostgreSQL 17 workflow and this checkpoint.
- No production migration, RPC body, role, RLS policy, runtime service or hosted data changed.

## Acceptance coverage
1. Applies actual current production migration `20261126110000_inventory_transfer_replay_endpoint_guard.sql` on disposable PostgreSQL 17.
2. Both `transfer_inventory` and `transfer_inventory_batch` validate and lock two active same-tenant endpoints before replay lookup.
3. Single-product transfer selects earliest-expiry unreserved source lot from distinct-expiry lots while preserving a later lot reservation.
4. Destination child lot retains parent batch ID, batch number, expiry, received-at timestamp and exact unit cost with transfer source lineage.
5. Multi-product path independently verifies child lot lineage and exact paired source/destination movements.
6. Checks aggregate source/destination balances, reserved balances, and single exact transfer-out/in rows bound to source/destination lot IDs.
7. Exact replay remains idempotent. Inactive or re-scoped endpoint returns SQLSTATE `42501` with full unchanged balances, lots, transfer envelope/items, movements and audit.
8. Workflow step name explicitly includes FEFO lot-lineage coverage.

## Evidence boundary
Historical candidates `7396ebe...` and `6a6fac...` had PostgreSQL 17 transfer acceptance SUCCESS; that is not evidence for this latest head. The new exact-head Inventory PG17, P1 and P2 jobs must finish on the final synchronized SHA. Hosted tenant workflow SKIPPED is never called PASS.

## Safety and ownership
Disposable local Supabase/PostgreSQL 17 only; no hosted writes, production mutation, deployment, secrets, paid API, Vercel, Bolt or Lovable. P2 owns this focused test/checkpoint; P1/P3 own review and merge authority.
