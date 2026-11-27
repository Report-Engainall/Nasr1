# P2 Checkpoint — Inventory Transfer Endpoint Replay and FEFO Lot Lineage
Date: 2026-11-27
Repository: `Report-Engainall/Nasr1`
Role: P2 — PostgreSQL/RPC/migrations/transactions/inventory/finance
PR: #602
Branch: `p2/inventory-transfer-replay-endpoint-pg17-20261126`

## Current synchronization
- Latest `main` synchronized: `8144c30ae47977be053c06ea8bb512a2d0cbe9dc`.
- Previous candidate: `cf1d28108c4be27988ea0a08e67f6f2874cf5514`.
- One intervening P3 commit updates only project execution-state and screen-acceptance matrix docs; these are retained. No P2 path overlaps.
- PR diff remains limited to the P2-owned transfer SQL acceptance, dedicated PG17 workflow and this checkpoint.
- No production migration, RPC, role, RLS policy, runtime service or hosted data changed.

## Acceptance coverage
1. Apply actual `20261126110000_inventory_transfer_replay_endpoint_guard.sql` in disposable PostgreSQL 17.
2. Both `transfer_inventory` and `transfer_inventory_batch` validate/lock active same-tenant endpoints before replay lookup.
3. Single-product transfer selects the earliest-expiry unreserved source lot across distinct expiry dates and preserves later lot reservation.
4. Destination child lot retains parent ID, batch number, expiry, received-at and exact unit cost with transfer source lineage.
5. Multi-product transfer independently verifies child-lot lineage and exact paired source/destination movement rows.
6. Assert aggregate on-hand/reserved balances and one exact transfer-out plus one exact transfer-in bound to source/destination lot IDs.
7. Exact replay is idempotent. Deactivated or re-scoped endpoint fails `42501` with full balance/lot/transfer/movement/audit state unchanged.

## Evidence boundary
Latest synchronized head has fresh PG17, P1 and P2 runs in progress/queued. Historical run results on prior heads are not evidence for this head. Hosted E2E SKIPPED is not PASS. Exact-head acceptance is required.

## Safety and ownership
Local disposable PostgreSQL/Supabase only; no hosted writes, production mutations, deployments, secrets, paid APIs, Vercel, Bolt or Lovable. P2 owns this test/checkpoint; P1/P3 own review and main merge.
