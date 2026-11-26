# P2 Checkpoint — Onyx Inventory Reconciliation Mutation Windows
Date: 2026-11-27
Repository: `Report-Engainall/Nasr1`
Role: P2 — PostgreSQL, inventory transactions, finance and data integrity
PR: #605 — https://github.com/Report-Engainall/Nasr1/pull/605
Branch: `p2/onyx-reconciliation-mutation-window-pg17-20261126`

## Resume point and synchronization
- Current `main` observed before synchronization: `fa7118367f8f28dada88ad9d7c91c2382f07717c` (P3 verified-replenishment decision integration).
- Preserved prior P2 candidate: `3e9928fe375d91446c635882113daffe05e1fb00`.
- This candidate is a normal two-parent synchronization of current main and the existing P2 work; no force-push and no source rewrite.
- Only these three P2-owned paths differ from current main: this checkpoint, `supabase/tests/onyx_inventory_reconciliation_as_of_guard.sql`, and `.github/workflows/onyx-inventory-asof-postgres17.yml`.
- No production migration, RPC, RLS, role, application runtime, or hosted data is modified by this acceptance expansion.

## Scope already implemented
1. Preserve the pre-existing immutable source-date and stale-at-preview Onyx acceptance.
2. Preview an eligible source snapshot, commit a later inventory movement, and require apply to fail with SQLSTATE `40001`.
3. Apply a fresh eligible snapshot, commit a later inventory movement, and require compensating rollback to fail with SQLSTATE `40001`.
4. For both denials, compare complete JSON snapshots of aggregate balance, movement ledger, command, reconciliation items and audit; assert command state remains `previewed` / `applied` respectively.
5. These mutation-window fixtures directly commit an explicitly tagged `acceptance_fixture` movement to isolate the Onyx guard boundary. They are not a separate end-to-end purchase-receipt RPC test. Receipt→FEFO lot→reservation/sale→cancellation-release coverage is in the independent local P2 acceptance step for the FEFO batch manifest.

## Historical exact-head evidence — prior P2 head only
On `3e9928fe375d91446c635882113daffe05e1fb00`:
- Onyx PostgreSQL 17 run [45909773751](https://github.com/Report-Engainall/Nasr1/actions/runs/45909773751): SUCCESS; all setup, test and teardown steps passed.
- P2 run [45909773742](https://github.com/Report-Engainall/Nasr1/actions/runs/45909773742): SUCCESS.
  - Public read-only Chromium smoke: SUCCESS.
  - Authenticated infrastructure gate: SUCCESS.
  - Local Supabase/PostgreSQL 17 migration replay and authenticated suite: SUCCESS; tenant, AuthV2 six-role parity, finance, procurement, FEFO, Onyx exact-lot restoration, order lifecycle, returns, privacy, audit and local Chromium proofs passed.
  - Hosted customer/order/tenant job: SKIPPED, not PASS.
- These results are historical for that exact SHA and are not carried forward to the newly synchronized head.

## Exact-head acceptance required now
The synchronization commit itself is the new candidate. The dedicated Onyx PostgreSQL 17 workflow and P2 critical-path workflow must complete against that exact head. Review each job conclusion and SHA; no prior result is substituted.

## Safety and ownership
- Disposable PostgreSQL 17 / local Supabase only; no hosted Supabase write, production mutation, live Onyx call, or deployment.
- No paid API, Vercel, Bolt or Lovable.
- P2 owns this focused acceptance and this checkpoint. P1 retains sole authority to approve and merge into `main`.
