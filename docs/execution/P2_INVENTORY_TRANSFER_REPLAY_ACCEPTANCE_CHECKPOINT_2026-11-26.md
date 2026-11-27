# P2 Checkpoint — Inventory Transfer Endpoint Replay and FEFO Lot Lineage
Date: 2026-11-27
Repository: \`Report-Engainall/Nasr1\`
Role: P2 — PostgreSQL/RPC/migrations/transactions/inventory/finance
PR: #602 — https://github.com/Report-Engainall/Nasr1/pull/602
Branch: \`p2/inventory-transfer-replay-endpoint-pg17-20261126\`

## Current synchronization
- Current \`main\`: \`68148f4ded83ed16bdf7a42dda5fad619c7e76b5\`.
- Previous P2 test candidate: \`292d8f6ddc5df946bf368eef12d676879ae7ffe1\`.
- The branch was synchronized with a normal two-parent merge commit \`9e272786727b69513ea7cc12f573bb7a25083e29\`, retaining both the current main P1 TypeScript fix and the existing P2 acceptance work. No force-push.
- Current PR diff against main is limited to this test, this checkpoint and the dedicated PostgreSQL 17 workflow.
- No production migration, RPC body, role, RLS policy, runtime service, or hosted data is modified by this P2 test expansion.

## Acceptance in the current test
1. Applies the actual current production migration \`20261126110000_inventory_transfer_replay_endpoint_guard.sql\` in isolated PostgreSQL 17.
2. Verifies both transfer RPCs validate and lock two active same-tenant endpoints before an idempotency replay lookup.
3. Single-product transfer uses two source lots with different expiry dates; it must select the earliest-expiry unreserved lot first while retaining the later lot's reservation.
4. Validates the destination child lot retains exact parent batch ID, batch number, expiry date, received-at timestamp and unit cost, and carries transfer source lineage.
5. Multi-product transfer independently verifies its transfer item, child lot lineage, exact quantity/expiry/cost and paired source/destination movement references.
6. Both paths assert aggregate source/destination quantity and reserved balances, plus one exact transfer-out and one exact transfer-in movement attached to the corresponding lot IDs.
7. Exact replay remains idempotent. Deactivating or reassigning either endpoint must raise SQLSTATE \`42501\` and leave balances, lots, transfer rows/envelopes, transfer items, movements and audit unchanged.
8. Workflow step label explicitly identifies the FEFO lineage coverage. No hosted/production Supabase write or deployment is part of the workflow.

## Evidence boundaries
- Previous synchronized head \`6a6facac4bd4c2a43e63601109936b6e5367f7e6\`: dedicated Inventory PostgreSQL 17 run [45912042491](https://github.com/Report-Engainall/Nasr1/actions/runs/45912042491) SUCCESS; this is historical evidence only.
- P2 run [45912042452](https://github.com/Report-Engainall/Nasr1/actions/runs/45912042452) was public UI/infrastructure SUCCESS, hosted customer/order/tenant SKIPPED, and local authenticated run still IN_PROGRESS at last poll; it does not prove this new SHA.
- New exact-head verification must use the latest PR head SHA and its own PostgreSQL 17 + P2 runs. Never carry prior-head results forward.
- P1 TypeScript fixes from current main are included in the synchronization parent. The prior unrelated main error must be rechecked on this exact candidate, not assumed fixed.

## Safety and ownership
- Disposable PostgreSQL 17 / local Supabase only.
- No production or hosted database writes, no live Onyx, no deployment, no secrets, no paid APIs, no Vercel, Bolt or Lovable.
- P2 owns this focused SQL acceptance and this checkpoint. P1/P3 retain merge authority into \`main\`.
