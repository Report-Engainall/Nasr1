# P2 Checkpoint — Onyx Reconciliation / FEFO Batch Ledger Restoration
Date: 2026-11-26
Repository: `Report-Engainall/Nasr1`
Role: P2 — database, inventory, transaction integrity and finance
Base `main`: `d2150d3d1595ccfaf3c16cca9faaff406d006c8b`
Branch: `p2/onyx-fefo-batch-manifest-rollback-20261126`
PR: pending creation; PR head and exact-head Actions logs are authoritative.

## Problem
The existing Onyx apply/rollback RPCs modify `inventory_balances.quantity_on_hand`. The production FEFO trigger in `20261117190000_inventory_batch_allocation_fefo.sql` then changes `inventory_batches`: positive deltas create an unattributed lot and negative deltas consume existing lots in expiry order. Reversing only the aggregate balance does not necessarily restore the original lot IDs, quantities, expiry dates or source lineage.

## Change
- Add immutable per-item `baseline_batch_manifest` at Onyx preview and `applied_batch_manifest` after the FEFO balance trigger completes.
- Wrap the existing apply and rollback RPCs without changing their business contract. Hidden unwrapped RPCs have execute revoked from client roles.
- Before apply, compare the live complete lot manifest to the preview manifest; a changed lot state fails with SQLSTATE `40001`.
- Before compensating rollback, compare live lot state to the exact applied manifest; later/altered lots fail closed.
- On valid rollback, allow the original aggregate update/FEFO trigger to complete, then restore the exact baseline lot quantities by original batch ID and zero only Onyx-created lot quantities while retaining rows for lineage. Recheck aggregate/subledger parity.
- Legacy preview/applied commands with no captured manifests fail closed and require a fresh preview/manual review rather than an unsafe aggregate-only rollback.

## Acceptance
New local-only PostgreSQL 17 script `scripts/test-onyx-inventory-reconciliation-batch-manifest.mjs` clones an existing local test product, creates two dated FEFO lots, and exercises both positive and negative Onyx delta → apply → idempotent replay → compensating rollback → idempotent replay. It compares all non-zero lot IDs, quantities, reservations, expiry dates, receipt-source metadata and the aggregate baseline.
The script is wired immediately after the existing FEFO receipt/reservation/sale/cancellation acceptance in `.github/workflows/p2-playwright-critical-paths.yml`.

## Safety
- P2 test runs only against the disposable local Supabase/PostgreSQL 17 URL enforced by `validateCashExpenseEndpoints`.
- No hosted Supabase/production writes, deployment, live Onyx call, paid provider, secrets, Vercel, Bolt or Lovable.
- Current PR head has not yet passed Actions; no PASS is claimed until exact-head PostgreSQL 17/P2/P1 runs complete.
- No global state/matrix is modified. P1 retains merge authority.
