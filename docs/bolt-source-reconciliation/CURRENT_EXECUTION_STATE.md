# الحالة التنفيذية الحالية الوحيدة — Nasr1 / P2
LAST_RECONCILED_AT=2026-10-23T23:09:00+03:00

## حقيقة Git الحالية
REPOSITORY=Report-Engainall/Nasr1
CURRENT_BRANCH=main (مرجع قراءة فقط؛ لا كتابة مباشرة إلى main)
MAIN_SHA=391e25847c7cc7fb2ba5f77164600455db04abfd
MAIN_TREE=NOT RETRIEVED — لا تُستنتج بصمة الشجرة من SHA أو من سجل سابق
MAIN_CURRENT_CI=NOT CONFIRMED ON MERGE SHA. PR #112 exact-head Core https://github.com/Report-Engainall/Nasr1/actions/runs/40010842943 SUCCESS and P2 https://github.com/Report-Engainall/Nasr1/actions/runs/40010842853 SUCCESS on 1aa7c7906851e1a5ddb088a173d868a16809f9ef; these checks are not relabelled as tests of merge SHA 391e25847c7cc7fb2ba5f77164600455db04abfd.
LAST_MERGED_PR=#112 — tenant-scoped customer-payment idempotency; merge SHA 391e25847c7cc7fb2ba5f77164600455db04abfd; exact PR head 1aa7c7906851e1a5ddb088a173d868a16809f9ef; Core 40010842943 SUCCESS and P2 40010842853 SUCCESS on that PR head.
PR112_HOSTED_CUSTOMER_E2E=SKIPPED / BLOCKED_EXTERNAL (dedicated non-production credentials unavailable; not PASS).
No direct main writes, force-push, destructive reset, production migration/write, or live provider operation.

## Recent merged work — do not recreate
- PR #100 central-state reconciliation merged at 1c21fa6d81009dc8924d26b6f7addd5c976c0cb7.
- PR #101 manual general-journal reversal merged at 15a3c10fa5f5aa29dc59f2cf732950cddaa0efcb.
- PR #103 ledger pagination/summary acceptance merged at 2908079abd76e1a84cc4449d65b6b01cdfc63482; exact tested PR head 3a95de8991c3609349a56f4a102f147e0f9587e8 had Core 39993605159 and P2 39993605124 SUCCESS.
- PR #104 payment/credit balance guard merged at 5dbb01f7cf2ac054212abc6f3ec34af1b1fe99df; exact tested PR head 7f1110d95d26ece5d516b7267904a4f3f397f6ef had Core 40000512625 and P2 40000512706 SUCCESS; Core 40001179290 SUCCESS on exact merge SHA.
- PR #110 bounded transient retry for read-only pricing preview merged at 03ac6c5f7e3dc792c252d9dd2ee1dd5ec3dfcdac; tested PR head b6d99a91958b43e7cd90164a104c8c0a5bc1bd09 had Core 40004970539 and P2 40004970599 SUCCESS.
- PR #111 archive reconciliation documentation merged at cd303b7fe0f263c9f62ed97f10202e9895465273.
- PR #112 added tenant-scoped idempotency keys/fingerprints and PostgreSQL 17 coverage. The current follow-up fixes a verified client-side key-retention gap; do not recreate the payment schema/RPC work.
- PRs #52/#54/#83/#84/#88/#90/#99 remain merged. PR #89 (P3) and #97 (P1) remain outside P2 ownership.

## Completed task status
FIN-LEDGER-001-MANUAL-JOURNAL-REVERSAL-ACCEPTANCE=INTEGRATED (PR #101)
FIN-INVOICE-001-SUMMARY-PAGINATION-NO-DOUBLE-COUNT=INTEGRATED (PR #103; PostgreSQL 17 accepted)
FIN-INVOICE-001-CREDIT-ADJUSTED-PAYMENT-BALANCE=INTEGRATED (PR #104)
FIN-INVOICE-001-PAYMENT-IDEMPOTENCY-REPLAY-GUARD=INTEGRATED (PR #112; exact tested PR-head evidence above; hosted credentials E2E skipped)

## مؤشر الاستئناف الوحيد
LAST_COMPLETED_TASK_ID=FIN-INVOICE-001-PAYMENT-IDEMPOTENCY-REPLAY-GUARD
LAST_COMPLETED_PR=https://github.com/Report-Engainall/Nasr1/pull/112
LAST_COMPLETED_PR_HEAD=1aa7c7906851e1a5ddb088a173d868a16809f9ef
LAST_COMPLETED_MERGE_SHA=391e25847c7cc7fb2ba5f77164600455db04abfd
NEXT_TASK_ID=FIN-INVOICE-001-PAYMENT-IDEMPOTENCY-PENDING-REQUEST-MAP
CURRENT_BRANCH=p2/payment-idempotency-pending-map-20261023
BASE_SHA=391e25847c7cc7fb2ba5f77164600455db04abfd
INITIAL_IMPLEMENTATION_TEST_HEAD=cbcbf3db6261b1018c3e83766c575dd854314654
LATEST_CODE_AND_TEST_HEAD_BEFORE_CHECKPOINT_REFRESH=3e91a41de8022408beebe669efbc7611a3792b72
PAYMENT_ACKNOWLEDGEMENT_CONTRACT=RPC result must be a well-formed UUID; null, empty, or malformed identifiers fail closed and retain the request key
CURRENT_PR=https://github.com/Report-Engainall/Nasr1/pull/123
TASK_STATUS=IMPLEMENTED; REGRESSION_TESTS_ADDED; EXACT_FINAL_HEAD_CI_PENDING
FILES_CHANGED=src/components/CustomerWorkflows.tsx; src/components/CustomerWorkflows.finance.test.tsx; docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md; docs/bolt-source-reconciliation/REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv; docs/bolt-source-reconciliation/PROGRAMMER_2_CURRENT_REPORT.md; docs/bolt-source-reconciliation/WORK_COORDINATION.md; docs/bolt-source-reconciliation/EXECUTION_LOG.md
TESTS_RUN_WITH_RESULTS=PR #112 Core 40010842943 SUCCESS and P2 40010842853 SUCCESS on exact PR head 1aa7c7906851e1a5ddb088a173d868a16809f9ef; these do not test follow-up #123.
CURRENT_FOLLOWUP_TESTS=NOT RUN on final PR #123 head until the sequential checkpoint updates finish and fresh workflows reach terminal state. The finance component default success fixture now returns a UUID per the RPC contract.
FAILED_OR_SKIPPED=PR #112 hosted customer E2E job SKIPPED because dedicated non-production credentials are unavailable; no production financial writes. Current PR #123 final-head workflows pending; last source/test change is the UUID-acknowledgement validator.
MERGE_STATUS=PR #123 OPEN; do not merge before Core and P2 terminal success on one exact final head and review disposition.
BLOCKERS=Dedicated hosted customer E2E credentials are BLOCKED_EXTERNAL; this is not a substitute for the required local PostgreSQL 17/Playwright checks.
LOCKED_PATHS=src/components/CustomerWorkflows.tsx; src/components/CustomerWorkflows.finance.test.tsx; P2-owned CURRENT_EXECUTION_STATE.md; REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv; PROGRAMMER_2_CURRENT_REPORT.md; WORK_COORDINATION.md; EXECUTION_LOG.md
NEXT_ACTION=After all checkpoint commits, re-read PR #123 and its exact head; inspect all Core and P2 jobs until terminal; verify the new A-ambiguous → B-success → A-retry test and missing-acknowledgement test ran; address valid review findings; merge only through PR #123 after all required gates pass, then verify the new main SHA and its own CI before advancing.
UPDATED_AT=2026-10-23T23:09:00+03:00

## Evidence rules
Allowed statuses: IMPLEMENTED, INTEGRATED, TESTED_EXACT_SHA, BROWSER_PROVEN, PRODUCTION_PROVEN, CLOSED_WITH_EVIDENCE, BLOCKED_EXTERNAL, NOT RUN. A skipped job is not a pass. Never transfer PASS between SHAs. Local DB/browser evidence is not production proof.
