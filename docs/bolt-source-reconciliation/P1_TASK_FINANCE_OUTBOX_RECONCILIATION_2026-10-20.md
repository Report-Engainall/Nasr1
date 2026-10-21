# P1 Task Evidence — Finance Workflow Parity, Outbox Decision, and Donor-Head Drift Check
**Date:** 2026-10-20  
**Target:** `Report-Engainall/Nasr1` only  
**Role branch:** `integration/inventory-transfer-batches-20261019-rebased` (persistent P1 branch; advanced by a forward-only two-parent merge)  
**Main baseline:** `b54c87525d3b8c25c1d6ebf0c525636f82444ac1` — [exact-main Actions 39367124167](https://github.com/Report-Engainall/Nasr1/actions/runs/39367124167) SUCCESS  
**Tasks reconciled:** `NASR1-SOURCE-FINANCE-WORKFLOW-PARITY-001`; `NASR1-SOURCE-OUTBOX-WEBHOOK-COMPATIBILITY-001`; metadata-only `NASR1-SOURCE-THREE-DONOR-HEAD-DRIFT-CHECK-001`

## 1. Finance workflow parity — reconciled without copying incompatible service
- The donor `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1` remains at the same recorded main SHA. Its already-fingerprinted `src/services/finance.ts` blob is `d9c2131b2d582b5b5baa20e3b497cd272c3b31e9`; the blob was **not re-fetched/reopened**.
- Reconciliation of the existing decision against the current target finds the useful input behavior represented in target-native `src/lib/finance-input.ts` (blob `4868bb9b510b8e92ee42b930518a42cc4b012f36`) and `src/lib/cash-expense-input.ts` (blob `e0c8519e7b03c07c559142909b32acb581cd2e88`), with tests `src/test/finance-input.test.ts` (blob `bd11fd7ce2a0fe8f42d327a0de1159c064931317`) and `src/test/cash-expense-input.test.ts` (blob `18cb7b23b4ca3d519aafd09b24e81c9c7ccef048`).
- The target contract validates runtime types before string operations, exact decimal/cents boundaries, supported methods and field limits. The authoritative server RPC still controls tenant/profile scope, invoice state, outstanding balance and posting.
- P2's customer source-posting PR #6 is already merged at `9c2251780fda8f3f1a7011ce65bc66f8a51d8c01`; its exact PR-head Action [39336528786](https://github.com/Report-Engainall/Nasr1/actions/runs/39336528786) passed. It adds explicit source-linked invoice/payment journal drafts and posting/reversal controls. P1's finance runtime-type guard PR #22 is merged at `25bc0c969cfe8740860b19518caf21135caf67ad`; exact code CI [39366199248](https://github.com/Report-Engainall/Nasr1/actions/runs/39366199248) passed.
- Decision: **do not import the legacy finance service or its branch/cash-account schema** and do not create a second ledger. The P1 ledger and reuse audit now record this as target-native parity, not an unresolved partial code-copy task.
- Evidence: current main exact SHA `b54c87525d3b8c25c1d6ebf0c525636f82444ac1` passed [Actions 39367124167](https://github.com/Report-Engainall/Nasr1/actions/runs/39367124167); the code-bearing ancestor `25bc0c969cfe8740860b19518caf21135caf67ad` passed [Actions 39366594237](https://github.com/Report-Engainall/Nasr1/actions/runs/39366594237): 54/54 test files and 395/395 tests, frozen Bun lock, PostgreSQL 17/RLS/core-workflow acceptance, lint, build and preview/dev smoke.

## 2. Outbox compatibility — explicit security deferral
- The already fingerprinted donor worker blob is `441e93c159dec5b1571ec4906a232ee705d8686d`; related legacy claim/recovery migration blob is `2f45c5e45ad06de61b76d60335fada7cf93cf314`. Neither source file was re-fetched.
- The target uses a leased, worker-bound outbox lifecycle and a target-native internal notification consumer. Donor global webhook environment variables and legacy ack/failure RPC contract are incompatible. PR #15 already fixed a concrete failure-path defect by routing the error through the sanitizing `outboxFailureMessage` helper; its exact code/test SHA `772e45ca2e1a16b918189b2b1ba744254570a3ab` passed [Actions 39360907560](https://github.com/Report-Engainall/Nasr1/actions/runs/39360907560): 53 test files/386 tests plus PostgreSQL 17, lint/build and preview/dev smoke.
- Decision: **keep the target worker; do not implement external webhook delivery without an approved tenant-scoped feature/security contract**. Required gates include destination ownership, URL/egress allow-listing against SSRF, signing and secret lifecycle, payload minimization, delivery receipts/idempotency, retry/dead-letter behavior and isolated tests. No RLS, grant, RPC signature or schema was weakened or changed. External webhook delivery/live Edge runtime/browser/production proof remains NOT RUN.

## 3. Metadata-only drift check of all authorized donors
Checked the current `main` refs against already-recorded source baselines; no donor contents or ZIPs were opened:
- `Aghbari-Technologies/aghbari-commerce-evolved`: current `main` = `d24695209b45f2352e0ba994e1f5109d7e2afc9d` — unchanged.
- `Report-Engainall/aghbari-commerce`: current `main` = `00d7446bba9652ea40178a08b00c9da9a2bba8a1` — unchanged.
- `Report-Engainall/aghbari-store`: current `main` = `df3d7dd13276910d90a7273c8ace13e9a74ee277` — unchanged.
Since all three source heads match the pinned/reviewed baselines and their tracked feature rows have documented integrate/keep/reject/defer decisions, no new donor file should be opened merely to repeat the previous audit.

## 4. Current result and next pointer
- P1-owned records updated: `SOURCE_INTEGRATION_LEDGER.csv` and `READY_TO_REUSE_FILE_AUDIT.csv`.
- This supplementary report was added because `PROGRAMMER_1_CURRENT_REPORT.md` remains in open P2 PR #5's changed-file set; the canonical report was not overwritten.
- Not modified: `CURRENT_EXECUTION_STATE.md`, `EXECUTION_LOG.md`, archive manifest/member CSVs, `WORK_COORDINATION.md`, donor repositories or any P2-owned application path.
- No new runtime code is claimed in this evidence PR. This is a source-decision/evidence update and requires CI on the exact final PR head before merge.
- `next_source_task_id = NONE_PENDING_AS_OF_2026-10-20`. Resume P1 integration only if an authorized donor `main` SHA changes, a new source candidate is registered, or the tenant-scoped webhook contract is approved. The webhook remains explicitly deferred; it is not implemented.
- Browser-authenticated manual proof and production database migration/deployment: **NOT RUN**.
