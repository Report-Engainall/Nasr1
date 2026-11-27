# P2 Checkpoint — Onyx Inventory Reconciliation Mutation Windows
Date: 2026-11-27
Repository: `Report-Engainall/Nasr1`
Role: P2 — inventory transactions, PostgreSQL 17 and audit integrity
PR: #605
Branch: `p2/onyx-reconciliation-mutation-window-pg17-20261126`

## Synchronization
- Current `main` synchronized as first parent: `317ebca76c4d236a1d0efe0fd5934b028598c72b`.
- Previous PR branch head preserved as second parent: `b48bf4f7d5c913026bb2ed6d81496076704b12cd`.
- No force-push, reset, history rewrite or deletion of prior commits.
- The only unique source delta from the previous PR is 242 additive lines in the existing Onyx PostgreSQL 17 acceptance SQL test. The 449-line baseline test is byte-for-byte retained.
- Existing focused workflow `.github/workflows/onyx-inventory-asof-postgres17.yml` already targets this test path, so no duplicate workflow or workflow edit is required.

## Existing production contract
- Migration: `supabase/migrations/20261126130000_onyx_stock_balance_as_of_guard.sql`.
- No production migration, RPC, trigger, role, grant, RLS policy, hosted data or inventory operation was changed.

## Additional PostgreSQL 17 mutation-window acceptance
1. Preview an eligible source-date snapshot.
2. Commit a legitimate stock movement after preview and before apply; apply must reject the stale command with SQLSTATE `40001`.
3. Apply an eligible source-date snapshot.
4. Commit a legitimate stock movement after apply and before compensating rollback; rollback must reject with SQLSTATE `40001`.
5. Compare full business-state snapshots around each denial: inventory balances, movement ledger, command state, reconciliation items and audit records.
6. Confirm the command remains in its pre-rejection state (`previewed` or `applied`) and the later legitimate movement remains intact.
7. Keep the complete existing source-date, stale-preview, replay and successful compensating-rollback acceptance in place.

## Safety
- The workflow uses a disposable PostgreSQL 17 service only.
- No live Onyx workbook, production database, hosted Supabase, production inventory, deployment, secrets, paid service or external API is accessed.
- P2 owns the test and this checkpoint; P1/P3 retain merge authority.

## Acceptance state
- `PENDING`: run the existing Onyx PostgreSQL 17 workflow on the exact synchronized PR head.
- Record PASS only after its job succeeds on the resulting SHA.
- Hosted and production acceptance are not inferred from local PostgreSQL results.

## Next action
- Verify the exact PR diff and await the exact-head Onyx PostgreSQL 17, P1 and P2 checks. Diagnose any failure before changing production SQL.
