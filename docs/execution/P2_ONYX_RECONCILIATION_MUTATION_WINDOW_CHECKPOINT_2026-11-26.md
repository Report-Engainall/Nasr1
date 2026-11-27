# P2 Checkpoint — Onyx Inventory Reconciliation Mutation Windows
Date: 2026-11-27
Repository: `Report-Engainall/Nasr1`
Role: P2 — inventory transactions, PostgreSQL 17 and audit integrity
PR: #605 — https://github.com/Report-Engainall/Nasr1/pull/605
Branch: `p2/onyx-reconciliation-mutation-window-pg17-20261126`

## Latest reconciliation and exact-head acceptance — 2026-11-27
- Current `main` at synchronization: `348da8e756201fc103089cf4a5a690a4132528b7`.
- The stale branch was refreshed without force-push by a two-parent merge commit; current tested code head: `bd48763c09315d5d45e1e1f4d53cdc1f8e0ffe4c`.
- Compare against that `main`: **24 commits ahead / 0 behind**, exactly three changed paths: this checkpoint, `.github/workflows/onyx-inventory-asof-postgres17.yml`, and `supabase/tests/onyx_inventory_reconciliation_as_of_guard.sql`. The production migration remains identical to `main` (blob `9430c09815704ee77e88f06b16ec346bd5c82381`).
- Dedicated Onyx PostgreSQL 17 workflow [run 46063175377](https://github.com/Report-Engainall/Nasr1/actions/runs/46063175377): **SUCCESS** on exact head `bd48763c09315d5d45e1e1f4d53cdc1f8e0ffe4c`; job [140722087182](https://github.com/Report-Engainall/Nasr1/actions/runs/46063175377/job/140722087182) checked out that exact SHA and emitted both PASS notices for source `as_of_date` and mutation-window protection.
- P2 critical-path run [46063175360](https://github.com/Report-Engainall/Nasr1/actions/runs/46063175360) was still **IN_PROGRESS** at checkpoint update. Its public Chromium smoke was running; authenticated customer/order/tenant Chromium was **SKIPPED** because the job depends on that P1-owned smoke. This does not negate the dedicated Onyx PG17 PASS and is not a full P2 critical-path PASS.
- Hosted customer/order/tenant E2E remains **SKIPPED**, not PASS. No live ERP/production/Supabase access, migration, deployment, or production inventory write was performed.
- P1 owns any Chromium repair, exact-head integration decision and merge. P2 owns the dedicated SQL acceptance and this checkpoint; do not merge from P2.


## Existing production contract
- Migration: `supabase/migrations/20261126130000_onyx_stock_balance_as_of_guard.sql`.
- Existing preview/apply/rollback and source-date behavior are reused. This PR adds 242 lines of acceptance to the existing Onyx PostgreSQL test; no production migration, RPC, trigger, RLS, grant or UI is changed.
- The test keeps the existing 449-line baseline coverage and adds only two dangerous inter-transaction windows.

## Exact-head PostgreSQL 17 acceptance — 2026-11-27
- Tested PR head: `5e0bcce9aea4c3496a4ce874467a8ca4160944c5`.
- Dedicated Onyx PostgreSQL 17 workflow [run 45925642272](https://github.com/Report-Engainall/Nasr1/actions/runs/45925642272): **SUCCESS**.
- Exact job [140266202205](https://github.com/Report-Engainall/Nasr1/actions/runs/45925642272/job/140266202205): all 8 steps SUCCESS. The PostgreSQL log explicitly prints:
  - `PASS Onyx source as_of_date: immutable row binding, shared warehouse date, stale movement/balance rejection, invalid/future rejection, legacy preview apply denial, fresh apply/replay, and compensating rollback`.
  - `PASS Onyx mutation windows: post-preview stock changes block apply without side effects; post-apply stock changes block compensating rollback without side effects`.
- P2 [run 45925642218](https://github.com/Report-Engainall/Nasr1/actions/runs/45925642218): **SUCCESS**.
- Local authenticated Supabase/PostgreSQL 17 job [140267253250](https://github.com/Report-Engainall/Nasr1/actions/runs/45925642218/job/140267253250): **SUCCESS**, 65 successful completed steps, zero failures; broader local integration/browser acceptance passed.
- Public Chromium read-only smoke: **SUCCESS**. Hosted customer/order/tenant E2E: **SKIPPED**, not PASS.

## Proved mutation windows
1. Preview an eligible source-date snapshot, then commit a legitimate stock movement before apply; apply rejects with SQLSTATE `40001`.
2. Apply an eligible source-date snapshot, then commit a legitimate stock movement before compensating rollback; rollback rejects with SQLSTATE `40001`.
3. Around both denials, full JSON snapshots compare inventory balance, movement ledger, command status, reconciliation items and audit records.
4. The command remains `previewed` or `applied` as appropriate; the later legitimate movement is retained and never overwritten by the rejected action.
5. Existing valid apply/replay/rollback remains accepted when no later movement exists.

## Current integration boundary
- Latest observed `main`: `586db787dd3b17c18ad7a2e2a1e3ea65d93a7f8e`; merge base is `e2486a04d1ce4094f94fce8b5a8a19e1c35bf361`.
- PR #605 remains open. The latest compare is **17 commits ahead / 4 behind**, with exactly three changed paths relative to current `main`: the existing Onyx PG17 workflow, this checkpoint, and the Onyx source-date acceptance SQL. GitHub currently reports `mergeable=false`; P1 must synchronize before exact-head reruns.
- P1 owns synchronization with latest `main`, scoped diff review, exact-head reruns of the dedicated Onyx PG17/P2 workflows after synchronization, and merge. P2 does not merge to `main`.
- Do not transfer the results above to a post-sync SHA without rerunning the dedicated Onyx PostgreSQL 17 workflow on that exact SHA.

## Safety and open-source reference
- Tests use a disposable PostgreSQL 17 CI service only.
- No live Onyx workbook, hosted/production Supabase, production inventory write, deployment, secret, external API, paid service or new dependency was used.
- Existing open-source reference/licence catalog was consulted; no external implementation or parallel stock/finance service was introduced.
- Next session should read this checkpoint first and not repeat the broad OSS search unless a concrete missing capability requires it.
