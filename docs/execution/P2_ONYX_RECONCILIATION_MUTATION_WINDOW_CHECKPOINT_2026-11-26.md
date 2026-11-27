# P2 Checkpoint — Onyx Inventory Reconciliation Mutation Windows
Date: 2026-11-27
Repository: `Report-Engainall/Nasr1`
Role: P2 — PostgreSQL, inventory transactions, finance and data integrity
PR: #605
Branch: `p2/onyx-reconciliation-mutation-window-pg17-20261126`

## Current synchronization
- Latest `main` synchronized: `8144c30ae47977be053c06ea8bb512a2d0cbe9dc`.
- Previous candidate: `ec50b24751d7e6e8dbae903119693938c55615f8`.
- One intervening P3 commit changes only execution-state and screen-acceptance matrix docs; retained without P2 source overlap.
- PR diff remains exactly the P2 Onyx SQL test, dedicated PostgreSQL 17 workflow and this checkpoint.
- No runtime RPC, production migration, roles, RLS policy, hosted data or deployment changed.

## Scope
1. Preserve immutable source-date and stale-at-preview acceptance.
2. Preview eligible source; commit later stock movement; apply must fail `40001`.
3. Apply fresh snapshot; commit later movement; compensating rollback must fail `40001`.
4. Compare full snapshots of aggregate balance, movement ledger, command, items and audit; command state stays `previewed`/`applied`.
5. Fixture movement is tagged and isolated to test the guard boundary. End-to-end receipt→FEFO lot→reservation/sale→cancellation release is separately covered by main FEFO acceptance.

## Evidence boundary
Latest synchronized head requires fresh Onyx PG17 and P2/P1 critical-path jobs. Previous-head successes are historical only. Hosted tenant E2E SKIPPED is not PASS.

## Safety and ownership
Disposable local PostgreSQL/Supabase only. No hosted/production writes, live Onyx, deployment, secrets or paid API. P2 owns test/checkpoint; P1/P3 retain main merge authority.
