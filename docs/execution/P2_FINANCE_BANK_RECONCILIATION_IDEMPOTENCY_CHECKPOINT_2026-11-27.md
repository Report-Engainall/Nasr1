# P2 Checkpoint — Bank Reconciliation Idempotency Acceptance
Date: 2026-11-27
Repository: `Report-Engainall/Nasr1`
Role: P2 — finance transactions, PostgreSQL, idempotency, audit and local Storage integration
PR: #507
Branch: `fix/finance-cash-reconciliation-retry-safety-20261117`

## Synchronization and scope
- Current `main` synchronized as first parent: `317ebca76c4d236a1d0efe0fd5934b028598c72b`.
- Previous PR head preserved as second parent: `a528bae9f1a8e547f79f244ce9a5408ba4eb3257`.
- The old PR contained mixed and deeply diverged P1/P2 changes. This synchronization deliberately retains only the unique P2 acceptance script and its registration in the current P2 workflow.
- No force push or history rewrite was used.
- The migration `20261117250000_finance_bank_match_exact_retry.sql` already exists on current `main` and is not duplicated.
- The old branch's `20261120124500_finance_bank_statement_line_exact_retry.sql` is intentionally excluded: current `main` already contains the later `20261120151000_finance_statement_line_exact_retry_closed_statement.sql`, which includes a tenant-scoped advisory idempotency lock and explicit two-decimal precision validation. Copying the older version would be redundant and would risk downgrading the deployed function contract.

## Acceptance implemented
- Added `scripts/test-finance-bank-match-idempotency.mjs`, executed only inside the existing disposable local Supabase/PostgreSQL 17 P2 job.
- Registers the test in `.github/workflows/p2-playwright-critical-paths.yml` and its push path filter.
- The script uses the existing local P2 seeded manager/admin identities, loopback-only endpoint guard, actual local Auth sign-in, real local Storage API PDF evidence uploads and the current finance RPCs.
- Verifies source-backed opening-balance evidence, maker/checker approval and a balanced posted journal.
- Verifies two concurrent exact bank-match requests share one persisted match ID; one inserts and the other replays.
- Verifies a lost-response retry after statement finalization (`VERIFIED`) returns the same match and same recorded statement-line IDs without duplicate audit rows.
- Verifies a changed payload or a different target GL line reusing the key is rejected and does not mutate the verified statement snapshot.
- Races two statement lines against one posted GL line; exactly one wins, the other receives SQLSTATE `23505`, and each line can later match only its own remaining ledger target.
- Verifies final reconciliation is `VERIFIED`, unmatched counts are zero, signed bank and ledger movements reconcile to the same `-200.00`, and each match/finalization is audited once.
- Verifies consumed ledger rows disappear from future candidate lookup.

## Safety
- The script calls `validateCashExpenseEndpoints` and fails closed unless the database and Supabase URLs are explicit loopback-only local endpoints.
- Uses disposable PostgreSQL 17, transient local users and synthetic fixture rows only.
- No hosted Supabase, production financial records, bank integration, remote Storage, service secrets, migration, RPC or accounting policy is changed.
- The duplicated/older branch migration is excluded; the tested RPC is the current migration already on `main`.

## Exact-head acceptance — 2026-11-27
- Tested code SHA: `3f9edbd14cf0339a1563d961ec4f4d61ef336339`.
- P1 Admin Context Verification: `PASS` — run [45923052862](https://github.com/Report-Engainall/Nasr1/actions/runs/45923052862).
- Dedicated bank reconciliation script: `PASS` — run [45923052865](https://github.com/Report-Engainall/Nasr1/actions/runs/45923052865), local Supabase/PG17 job `140258835524`, step 44. Exact output: `PASS PostgreSQL 17 bank reconciliation`; proves concurrent same-key replay, lost-response retry after VERIFIED, changed-target no-write rejection, single-GL-line exclusivity, balanced final reconciliation, immutable audit counts and local Storage evidence.
- Overall P2 workflow: `FAIL` after the bank test passed. Existing Chromium UI test `e2e/finance-task-print.spec.ts:339` failed twice at the viewport assertion `clientWidth <= viewportWidth` in `assertRouteViewportAtWidth` (`e2e/finance-task-print.spec.ts:243`). The other four finance/print cases passed. This is a P1-owned UI responsiveness defect, not a bank reconciliation or SQL failure. Do not weaken the viewport assertion.
- Hosted customer/order/tenant E2E: `SKIPPED`, not accepted.
- No production migration, RPC, financial data or deployed environment changed.
- P2-owned bank reconciliation acceptance is `PASS` on the code SHA above; the overall PR P2 pipeline remains blocked by the separate P1 UI viewport failure until P1 fixes it and reruns the integrated workflow.
- P2 owns this checkpoint and evidence; P1/P3 retain merge authority to `main`.

## Next action
- P1 to fix actual viewport overflow on the affected mounted finance/task route, retaining viewport assertions. After P1 fixes it, rerun the integrated P2 workflow on the new exact SHA. No further change to bank reconciliation SQL or test is warranted from this run.
