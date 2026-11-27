# P2 Checkpoint — Bank Reconciliation Idempotency Acceptance
Date: 2026-11-27
Repository: `Report-Engainall/Nasr1`
Role: P2 — finance transactions, PostgreSQL 17, idempotency, audit and local Storage integration
PR: #507 — https://github.com/Report-Engainall/Nasr1/pull/507
Branch: `fix/finance-cash-reconciliation-retry-safety-20261117`

## Existing implementation reused
- The current `main` already contains the retry-safe client identity and current bank-line/opening-balance RPC contracts. This PR does not add or replace a migration, RPC or UI.
- Current migrations retained from `main`: `20261120151000_finance_statement_line_exact_retry_closed_statement.sql` and `20261120152000_finance_opening_balance_exact_retry.sql`. The older branch migration is intentionally excluded.
- The P2 test uses existing local Auth, finance RPCs, journal posting, idempotency constraints and the actual local Supabase Storage API. It adds runtime evidence for the current implementation only.

## Exact-head acceptance — 2026-11-27
- Tested code head: `3f9edbd14cf0339a1563d961ec4f4d61ef336339`.
- P1 on the PR's latest source tip `04d377a8b44d21003dcb21e9bffe4794b16dc1df`: [run 45924317998](https://github.com/Report-Engainall/Nasr1/actions/runs/45924317998) — **SUCCESS** (Vitest and strict TypeScript).
- P2 on the same PR source tip: [run 45924318009](https://github.com/Report-Engainall/Nasr1/actions/runs/45924318009) — **FAIL**, but the bank reconciliation step itself completed **PASS** in exact local PostgreSQL 17 job [140263003029](https://github.com/Report-Engainall/Nasr1/actions/runs/45924318009/job/140263003029). Exact output:
  `PASS PostgreSQL 17 bank reconciliation: same-key concurrent match replay; lost-response retry after VERIFIED; changed-target rejection with no writes; one GL line cannot be consumed by two statement lines; balanced two-line reconciliation; immutable match/audit counts; actual local Storage evidence and approved opening-balance chain.`
- The same local P2 run fails only at step 50, existing P1-owned `e2e/finance-task-print.spec.ts` mounted finance/task route viewport assertion. The assertion checks `scrollMetrics.clientWidth <= scrollMetrics.viewportWidth`; the earlier trace measured the affected 360px viewport content at 826px. The same assertion failed on retry; the other finance/print routes passed. Do not weaken the viewport assertion. Fix the overflowing ancestor/layout in the P1-owned route and rerun the integrated suite.
- Public Chromium read-only smoke: **SUCCESS**. Authenticated infrastructure gate: **SUCCESS**. Hosted customer/order/tenant E2E: **SKIPPED**, not PASS.
- Dedicated P2 bank transaction assertion is **PASS**; the aggregate P2 workflow remains **FAIL** due to the separate P1 UI overflow. No release readiness is claimed.

## What the PostgreSQL 17 test proves
- Two independent manager sessions concurrently submit the same bank statement line match: both receive the same persisted match ID, with one insert and one exact replay.
- A retry after the statement has transitioned to `VERIFIED` returns the original match and original statement-line identity; no duplicate match/audit is created.
- Reusing a key with a changed target/payload is rejected without modifying the verified statement snapshot.
- Two statement lines racing for one posted GL journal line cannot both consume it; one wins and the other receives the expected uniqueness rejection.
- Final reconciliation is `VERIFIED`, unmatched counts are zero, the signed bank and ledger movement totals reconcile to `-200.00`, and each match/finalization is audited exactly once.
- Local Storage evidence is uploaded through the real disposable Supabase Storage API and bound to the opening-balance/statement workflow. No hosted object or financial source is used.

## Current branch boundary
- Current branch head at checkpoint review: `04d377a8b44d21003dcb21e9bffe4794b16dc1df`. It is one commit after tested code head `3f9edbd...`; compare confirms the intervening commit changes only this P2 checkpoint (no app, SQL, runner or workflow source change).
- Latest observed `main`: `586db787dd3b17c18ad7a2e2a1e3ea65d93a7f8e`.
- Current compare against `586db78...`: **37 commits ahead / 6 behind**, merge base `317ebca76c4d236a1d0efe0fd5934b028598c72b`, with exactly three changed paths: `.github/workflows/p2-playwright-critical-paths.yml`, this checkpoint and `scripts/test-finance-bank-match-idempotency.mjs`.
- P1 owns fixing the actual viewport overflow, synchronizing this narrow P2 branch with latest `main`, reviewing the three-file scoped diff and rerunning exact-head P1/P2. P2 does not merge to `main`.

## Safety and handoff
- The test calls `validateCashExpenseEndpoints` and fails closed unless both URLs are loopback-only.
- All fixtures, financial journals, bank statements, Auth and PDF evidence objects exist only in disposable local PostgreSQL 17/Supabase.
- No hosted/production Supabase, production financial record, external bank service, live Storage, secret, deployment, paid service or production migration was touched.
- Existing OSS/license catalog was read; no new package, copied code, external service or parallel finance engine was introduced.
- Next session: read this checkpoint first. Do not repeat the broad OSS search or rebuild the bank retry functionality; continue with the current P1 viewport blocker and exact-head integration.
