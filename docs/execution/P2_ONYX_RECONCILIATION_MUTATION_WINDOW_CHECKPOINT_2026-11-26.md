# P2 Checkpoint — Onyx Inventory Reconciliation Mutation Windows
Date: 2026-11-27
Repository: `Report-Engainall/Nasr1`
Role: P2 — inventory transactions, PostgreSQL 17 and audit integrity
PR: #605 — https://github.com/Report-Engainall/Nasr1/pull/605
Branch: `p2/onyx-reconciliation-mutation-window-pg17-20261126`

## Latest synchronization to moving main — 2026-11-27
- `main` advanced to `f0c911923b785cdaaf6e823b271f538c56fd7cd3` through merge #683 (`feat(onyx): expose verified ERP connector readiness in existing workspace`) and the P1 PostgREST offset/limit fixture updates.
- P2 branch synchronized by non-force, two-parent merge commit `66b4f7fd37efb7a02546046cf08561fb8c412ce2`, with expected ref protection. Current compare: **30 ahead / 0 behind**, exactly three P2-owned changed paths: this checkpoint, `.github/workflows/onyx-inventory-asof-postgres17.yml`, and `supabase/tests/onyx_inventory_reconciliation_as_of_guard.sql`. No E2E fixture path remains in this PR diff; main's helper blob is the accepted P1 blob `b8505a706773062c49ce0cceef76d76e19166117`.
- Exact-current-head Onyx PG17 [run 46065135482](https://github.com/Report-Engainall/Nasr1/actions/runs/46065135482) and P2 critical paths [run 46065135503](https://github.com/Report-Engainall/Nasr1/actions/runs/46065135503) were **QUEUED** after synchronization. Earlier Onyx dedicated PG17 PASS on `00d444...` is historical to that pre-sync head and is not carried to `66b4...`.
- At sync, PR #605 was **mergeable=true**, **draft=false**. P1 owns final review and merge; P2 does not merge.
- Next: wait for exact-head PG17 Onyx mutation-window acceptance, then inspect P2 local authenticated/browser result. No live ERP, production database or inventory mutation was executed.

## Historical head after the P1 PostgREST fixture repair
- P1 added the pagination fixture correction in commit `9aeed0785d90f34b39a98f961ddf5746cf701912` (the branch's only P1-owned file is `e2e/helpers/customer-orders-keyboard-test.ts`); the test mock now observes PostgREST `offset`/`limit` rather than assuming a `Range` header.
- Current PR #605 code-bearing test head: `9aeed0785d90f34b39a98f961ddf5746cf701912`; comparison with `main` `348da8e756201fc103089cf4a5a690a4132528b7` is **27 ahead / 0 behind** with four changed paths (three P2-owned and that one P1 fixture file). At the previous read GitHub reported the PR mergeable; P1 retains review/merge authority.
- Dedicated Onyx PG17 workflow [run 46063832177](https://github.com/Report-Engainall/Nasr1/actions/runs/46063832177): **SUCCESS** on exact head `9aeed...`.
- P2 critical-path [run 46063832165](https://github.com/Report-Engainall/Nasr1/actions/runs/46063832165): public Chromium smoke **SUCCESS** on exact head. Local Supabase/PostgreSQL 17 authenticated job [140725496834](https://github.com/Report-Engainall/Nasr1/actions/runs/46063832165/job/140725496834) was **IN_PROGRESS** at 46/70 steps, currently running purchase-order XLSX acceptance; no failed steps reported. The wrapper customer/order/tenant job was **SKIPPED**, not PASS; do not count it as an accepted hosted E2E path.
- No production migration/RPC or live inventory was changed. P2 owns the dedicated Onyx acceptance and checkpoint; P1 owns its fixture change and merge decision.

## Latest reconciliation and exact-head acceptance — 2026-11-27

### Latest head after the P1 PostgREST fixture repair
- Current code-bearing PR head: `9aeed0785d90f34b39a98f961ddf5746cf701912`, compare against `main` `348da8e756201fc103089cf4a5a690a4132528b7`: **27 commits ahead / 0 behind**, four changed paths. Three are this P2 batch's workflow/checkpoint/PG17 acceptance SQL; the fourth is the P1-owned `e2e/helpers/customer-orders-keyboard-test.ts` pagination-fixture repair. No production migration/RPC changed.
- P1's fixture repair changes the mocked PostgREST pagination contract to `offset`/`limit` query parameters, normalizes `%...%` search patterns, and asserts the actual query parameters instead of assuming a `Range` request header.
- Dedicated Onyx PostgreSQL 17 [run 46063832177](https://github.com/Report-Engainall/Nasr1/actions/runs/46063832177): **SUCCESS** on exact head `9aeed0785d90f34b39a98f961ddf5746cf701912`.
- P2 critical-path [run 46063832165](https://github.com/Report-Engainall/Nasr1/actions/runs/46063832165): **IN_PROGRESS** on that same head. Public Chromium smoke: **SUCCESS**. Its local Supabase/PostgreSQL 17 job [140725496834](https://github.com/Report-Engainall/Nasr1/actions/runs/46063832165/job/140725496834) had 44/70 steps complete and was running authenticated order persistence/cross-tenant Chromium, with no failed steps reported. The dependent customer/order/tenant wrapper job remained **SKIPPED** by workflow dependency; the separate local job is running independently.
- GitHub reported `mergeable=false` at last PR read despite compare being 0 commits behind; P1 must re-check GitHub mergeability after checks and review. P2 does not merge.
- Hosted customer/order/tenant E2E remains **SKIPPED**, not PASS. No hosted/production Supabase or live ERP action was performed.

## Historical synchronization result — 2026-11-27
- Current `main` at synchronization: `348da8e756201fc103089cf4a5a690a4132528b7`.
- The stale branch was refreshed without force-push by a two-parent merge commit; current tested code head: `bd48763c09315d5d45e1e1f4d53cdc1f8e0ffe4c`.
- Compare against that `main`: **24 commits ahead / 0 behind**, exactly three changed paths: this checkpoint, `.github/workflows/onyx-inventory-asof-postgres17.yml`, and `supabase/tests/onyx_inventory_reconciliation_as_of_guard.sql`. The production migration remains identical to `main` (blob `9430c09815704ee77e88f06b16ec346bd5c82381`).
- Dedicated Onyx PostgreSQL 17 workflow [run 46063175377](https://github.com/Report-Engainall/Nasr1/actions/runs/46063175377): **SUCCESS** on exact head `bd48763c09315d5d45e1e1f4d53cdc1f8e0ffe4c`; job [140722087182](https://github.com/Report-Engainall/Nasr1/actions/runs/46063175377/job/140722087182) checked out that exact SHA and emitted both PASS notices for source `as_of_date` and mutation-window protection.
- P2 critical-path run [46063175360](https://github.com/Report-Engainall/Nasr1/actions/runs/46063175360): **FAILURE**, isolated to the P1-owned public Chromium pagination acceptance. The exact failure in `e2e/helpers/customer-orders-keyboard-test.ts:272` is raw PostgREST `range` expected `0-24`, received `null`, reproduced on retry; the other 27 Chromium checks passed. This is the same wire-level pagination blocker documented in the shared order-history acceptance and is not an Onyx/database failure.
- In that run, the authenticated customer/order/tenant job was **SKIPPED** because it depends on the failing public smoke; the dedicated Onyx PG17 workflow above remains **SUCCESS** on the exact source head. P1 owns the pagination repair and the dependent rerun. Do not call the full P2 critical-path suite PASS.
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

## Latest exact-head confirmation — 2026-11-28

- PR #605 code head `393baeb850cb22b1d814374997104a8789b31feb` has terminal exact-head PostgreSQL 17 Onyx run `46067912879` **SUCCESS**. Job `140737605714` ran PostgreSQL `17.12` and logged both required notices: (1) immutable shared source `as_of_date`, stale movement/balance rejection, invalid/future date rejection, legacy-preview apply denial, fresh apply/replay and compensating rollback; (2) mutation windows: a post-preview stock movement rejects apply without side effects, and a post-apply stock movement rejects compensating rollback without side effects.
- Exact-head P2 critical-path run `46067912868` **SUCCESS**. Public read-only Chromium smoke **SUCCESS**; authenticated local Supabase/PostgreSQL 17 job `140739001886` **SUCCESS**, with full migration replay, isolated tenant fixtures, transaction/authorization/inventory/FEFO/Onyx checks, authenticated order persistence and tenant denial in Chromium, stock-count and purchase-order XLSX, checkout replay, returns/credit memo, finance/task print, device revocation, price editor, product-image storage and admin access/category browser proofs. The verifier emitted `EXACT_SHA_P2_PROOFS_PASS 393baeb850cb22b1d814374997104a8789b31feb`.
- The separate hosted customer/order/tenant wrapper job was **SKIPPED** by workflow dependency; do not count it as a hosted-E2E PASS. All writes were confined to disposable local PostgreSQL 17/Supabase test fixtures; no live ERP or production inventory operation occurred.
- Live main at this checkpoint update: `12b0db37a97128a19073f907ba12fb700251802b`. PR #605 compare is 32 commits ahead / 15 behind with exactly three P2-owned paths (workflow, checkpoint, Onyx PostgreSQL acceptance SQL); synchronize and rerun required exact-head gates before merge. P1 owns sync/review/merge; P2 does not merge.