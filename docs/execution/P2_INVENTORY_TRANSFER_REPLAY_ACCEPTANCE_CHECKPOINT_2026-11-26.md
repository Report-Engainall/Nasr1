# P2 Checkpoint — Inventory Transfer Endpoint Replay and FEFO Lot Lineage
Date: 2026-11-27
Repository: \`Report-Engainall/Nasr1\`
Role: P2 — PostgreSQL/RPC/migrations/transactions/inventory/finance
PR: #602 — https://github.com/Report-Engainall/Nasr1/pull/602
Branch: \`p2/inventory-transfer-replay-endpoint-pg17-20261126\`

## Current synchronization
- Current \`main\`: \`fa7118367f8f28dada88ad9d7c91c2382f07717c\`.
- Previous synchronized P2 candidate: \`6a6facac4bd4c2a43e63601109936b6e5367f7e6\`.
- This P2-owned test-only increment adds explicit successful single-product and multi-product transfer lot-lineage assertions. No production migration, RPC body, role, RLS policy, runtime service, or hosted data is modified.
- The branch remains based on a normal two-parent sync of current main and the pre-existing P2 work; no force-push.

## Acceptance in the current test
1. Applies the actual current production migration \`20261126110000_inventory_transfer_replay_endpoint_guard.sql\` in isolated PostgreSQL 17.
2. Verifies both transfer RPCs validate and lock two active same-tenant endpoints before an idempotency replay lookup.
3. Single-product transfer: source contains two dated lots; the command must consume the earlier-expiring unreserved lot first, retain the later lot's reservation, and create a destination child lot with the exact parent batch ID, batch number, expiry, received-at timestamp and unit cost.
4. Multi-product transfer: proves the product-line transfer also creates the exact child-lot lineage and paired movement references.
5. For both commands, checks source/destination aggregate quantities and reservations and the exact transfer-out/source-lot and transfer-in/destination-lot movement pair.
6. Exact replay remains idempotent. Deactivating or reassigning either endpoint must raise SQLSTATE \`42501\` and leave balances, all source/destination lots and lineage, transfer rows/envelopes, transfer items, movements and audit unchanged.
7. No live/production Supabase mutation or deployment is part of this workflow.

## Exact-head evidence before the new assertions
- Synchronized head \`6a6facac4bd4c2a43e63601109936b6e5367f7e6\`: dedicated Inventory PostgreSQL 17 run [45912042491](https://github.com/Report-Engainall/Nasr1/actions/runs/45912042491) SUCCESS.
- Its P2 run [45912042452](https://github.com/Report-Engainall/Nasr1/actions/runs/45912042452) had public UI and infrastructure gates SUCCESS, hosted customer/order/tenant job SKIPPED, and local PostgreSQL/Chromium job still IN_PROGRESS at last observation. These results do not certify the new test SHA.
- Current P1 strict TypeScript baseline failure is in unrelated Onyx workbook callbacks and is present on \`main\` as well; PR #624 is P3-owned.

## Required evidence for this candidate
Require fresh Inventory PostgreSQL 17 and P2 critical-path runs on the exact new commit SHA. P1 checks on that SHA remain required for full integration; any pre-existing-main failures must be diagnosed separately, not misattributed or skipped.

## Safety and ownership
- Disposable PostgreSQL 17 / local Supabase only.
- No production or hosted database writes, no live Onyx, no deployment, no secrets, no paid APIs, no Vercel, Bolt or Lovable.
- P2 owns this focused SQL acceptance and this checkpoint. P1/P3 retain merge authority into \`main\`.
