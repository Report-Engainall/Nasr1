# P2 Checkpoint — Onyx Inventory Reconciliation Mutation Windows
Date: 2026-11-27
Repository: `Report-Engainall/Nasr1`
Role: P2 — PostgreSQL, inventory transactions, finance and data integrity
PR: #605
Branch: `p2/onyx-reconciliation-mutation-window-pg17-20261126`

## Current synchronization
- Latest main synchronized: `90597e5ba0071bc82cdde14174035b49f3399b51`.
- Previous candidate: `a2ffec3d6c5871aa9603d71e27c62542baf1270d` (main 6da + Onyx P2 candidate).
- Eight intervening main commits affect only P1 supplier-performance/task-review panels and P1 workflow; they are retained without changing Onyx acceptance.
- PR diff remains exactly three P2 paths: the Onyx SQL test, dedicated PostgreSQL 17 workflow and this checkpoint.
- No runtime RPC, migration, role, RLS policy, hosted data or deployment is modified.

## Scope
1. Preserve immutable source-date and stale-at-preview acceptance.
2. Preview an eligible source snapshot, commit a later inventory movement, require apply to fail SQLSTATE `40001`.
3. Apply a fresh eligible snapshot, commit a later movement, require compensating rollback to fail SQLSTATE `40001`.
4. For both denials compare full JSON snapshots of aggregate balance, movement ledger, command, reconciliation items and audit; command state remains `previewed` / `applied`.
5. Mutation-window fixtures commit explicitly tagged acceptance movements in isolated PostgreSQL to isolate the guard boundary; receipt→FEFO lot→reservation/sale→cancellation release is covered by the existing main FEFO suite.

## Historical evidence boundary
On previous head `f95d7c2...`, Onyx PG17 run [45911956934](https://github.com/Report-Engainall/Nasr1/actions/runs/45911956934) and P2 local acceptance [45911956978](https://github.com/Report-Engainall/Nasr1/actions/runs/45911956978) succeeded. On intermediate head `6e2300...`, Onyx PG17 [45913309878](https://github.com/Report-Engainall/Nasr1/actions/runs/45913309878) succeeded. None of these certify the latest candidate. Fresh Onyx PG17, P2 and P1 runs must complete on the final synchronized SHA. Hosted customer/order/tenant job SKIPPED is not PASS.

## Safety and ownership
Disposable PostgreSQL 17/local Supabase only; no hosted writes, production mutation, live Onyx, deployment, secrets or paid API. P2 owns this checkpoint/test; P1/P3 retain merge authority.
