# الحالة التنفيذية الحالية الوحيدة — Nasr1 / P2
LAST_RECONCILED_AT=2026-10-23T21:57:00+03:00

## حقيقة Git الحالية
REPOSITORY=Report-Engainall/Nasr1
CURRENT_BRANCH=main (مرجع قراءة فقط؛ لا كتابة مباشرة على main)
MAIN_SHA=cd303b7fe0f263c9f62ed97f10202e9895465273
MAIN_TREE=51aa49eb36bbf6227c42612e35b1bf03e6b3360a
MAIN_CURRENT_CI=SUCCESS — https://github.com/Report-Engainall/Nasr1/actions/runs/40006315985 (exact main SHA cd303b7fe0f263c9f62ed97f10202e9895465273); exact-main P2 = NOT RUN. P2 run 40006269156 is IN_PROGRESS on PR #111 head 64632871573b0d655051df9ac795c4cc76b68069, not the merge SHA.
LAST_MERGED_PR=#111 — uploaded Bolt archive reconciliation documentation; merge SHA cd303b7fe0f263c9f62ed97f10202e9895465273 (docs-only). Previous PR #110 pricing retry remains integrated; exact PR head b6d99a91958b43e7cd90164a104c8c0a5bc1bd09 Core 40004970539 SUCCESS and P2 40004970599 SUCCESS; exact merge SHA 03ac6c5 Core 40005590004 SUCCESS.
PR110_CORE_CI=SUCCESS — https://github.com/Report-Engainall/Nasr1/actions/runs/40004970539 (exact tested PR head b6d99a91958b43e7cd90164a104c8c0a5bc1bd09)
PR110_P2_CI=SUCCESS — https://github.com/Report-Engainall/Nasr1/actions/runs/40004970599 (exact tested PR head b6d99a91958b43e7cd90164a104c8c0a5bc1bd09)
PR110_HOSTED_CUSTOMER_E2E=SKIPPED (dedicated non-production credentials unavailable; not PASS)
DOCS_UPDATE_BRANCH=docs/p2-uploaded-archive-reconciliation-20261023
DOCS_UPDATE_BASE=03ac6c5f7e3dc792c252d9dd2ee1dd5ec3dfcdac
No force-push, destructive reset, direct main writes or production database writes.
## Recent merged work — do not recreate
- PR #100 central-state reconciliation merged at 1c21fa6d81009dc8924d26b6f7addd5c976c0cb7.
- PR #101 manual general-journal reversal merged at 15a3c10fa5f5aa29dc59f2cf732950cddaa0efcb.
- PR #103 ledger pagination/summary acceptance merged at 2908079abd76e1a84cc4449d65b6b01cdfc63482. Core 39993605159 and P2 39993605124 SUCCESS on exact PR head 3a95de8991c3609349a56f4a102f147e0f9587e8.
- PR #104 payment/credit balance guard merged at 5dbb01f7cf2ac054212abc6f3ec34af1b1fe99df from tested PR head 7f1110d95d26ece5d516b7267904a4f3f397f6ef. Exact-head Core 40000512625 and P2 40000512706 SUCCESS; Core 40001179290 SUCCESS on exact merge SHA.
- PR #104 proves posted-credit-adjusted payment bounds, source/currency validation, finance RPC role boundary, authoritative paid/credit/outstanding aggregates, and two-session invoice-lock race denial. Local Chromium return/review/receipt/credit memo succeeded.
- PR #110 archive-derived retry for read-only customer pricing preview merged at `03ac6c5f7e3dc792c252d9dd2ee1dd5ec3dfcdac` from exact tested head `b6d99a91958b43e7cd90164a104c8c0a5bc1bd09`; Core run `40004970539` and P2 run `40004970599` SUCCESS on that exact head. Hosted customer E2E `120590754389` was SKIPPED, not PASS. The merge tree is identical to the tested head tree.
- Uploaded archive `project-bolt-github-7sl6ykzz (5)(2).zip` structurally validated (871 ZIP entries; 790 files; CRC test PASS; no duplicate member names or traversal paths). High-value candidate paths were compared to current code; stale app manifests/source and donor policy/analytics files were not copied wholesale. Detailed decisions: `P2_UPLOADED_ARCHIVE_RECONCILIATION_2026-10-23.md`.
- Hosted customer E2E job 120575459434 was SKIPPED due missing dedicated non-production credentials; never report it as PASS.
- PR #62 customer-statement/credit-memo parity merged at 024c279a2d1c0226c662e5d916871f45534c7242; release its old path lock. PR #40 is CLOSED and NOT MERGED.
- PR #52/#54/#83/#84/#88/#90/#99 merged. Do not redo their functionality absent proven regression. PR #89 (P3) and #97 (P1) remain outside P2 ownership.

## Completed task status
FIN-LEDGER-001-MANUAL-JOURNAL-REVERSAL-ACCEPTANCE=INTEGRATED (PR #101)
FIN-INVOICE-001-SUMMARY-PAGINATION-NO-DOUBLE-COUNT=INTEGRATED (PR #103; PG17 accepted)
FIN-INVOICE-001-CREDIT-ADJUSTED-PAYMENT-BALANCE=INTEGRATED (PR #104; tested exact PR head and exact merge Core)
FIN-EXPENSE-001-CASH-EXPENSE-SOURCE-POSTING=INTEGRATED (source/idempotency/concurrency suite green on PR #104 tested head)
FIN-CREDIT-001-RETURN-CREDIT-MEMO=INTEGRATED (source-linked workflow and local Chromium acceptance)
NASR1-ARCHIVE-RECONCILIATION-2026-10-23=RECONCILED (single uploaded archive; selected safe improvement integrated through PR #110)
PRICE-PREVIEW-TRANSIENT-READ-RECOVERY=INTEGRATED (bounded retries only for transient read-only RPC failures; fail-closed customer visibility retained)

## مؤشر الاستئناف الوحيد
LAST_COMPLETED_TASK_ID=NASR1-ARCHIVE-RECONCILIATION-2026-10-23
LAST_COMPLETED_PR=https://github.com/Report-Engainall/Nasr1/pull/110
LAST_COMPLETED_PR_HEAD=b6d99a91958b43e7cd90164a104c8c0a5bc1bd09
LAST_COMPLETED_MERGE_SHA=03ac6c5f7e3dc792c252d9dd2ee1dd5ec3dfcdac
NEXT_TASK_ID=FIN-INVOICE-001-PAYMENT-IDEMPOTENCY-REPLAY-GUARD
CURRENT_BRANCH=p2/payment-idempotency-current-main-20261023b (feature branch; main is read-only)
BASE_SHA=cd303b7fe0f263c9f62ed97f10202e9895465273
HEAD_SHA=834e093e4dd68e232f8d2eee00c12ccfa789e647 (pre-state-refresh feature snapshot; reread final branch head after this state commit before opening PR)
TASK_STATUS=IMPLEMENTED; EXACT-HEAD CI NOT RUN
NEXT_ACTION=Review final PR diff; open PR from p2/payment-idempotency-current-main-20261023b to main; run Core and P2 Critical Paths on one exact PR head; inspect terminal jobs for PostgreSQL 17 migration acceptance, unit/component tests and local browser flows; fix root causes before merge; merge via PR only after review and required jobs pass; then verify exact merge SHA and current-main CI/P2. Do not create a second ledger/payment engine.
NEXT_ACTION_EVIDENCE=PR #110 tested head b6d99a91958b43e7cd90164a104c8c0a5bc1bd09 Core 40004970539/P2 40004970599 SUCCESS; its merge SHA 03ac6c5f7e3dc792c252d9dd2ee1dd5ec3dfcdac Core 40005590004 SUCCESS. PR #111 docs-only merge SHA cd303b7fe0f263c9f62ed97f10202e9895465273 Core 40006315985 is IN_PROGRESS; exact-main P2 NOT RUN. Payment branch has not run CI yet. Hosted customer E2E for previous release was SKIPPED, not PASS.
FILES_CHANGED=20261023235900_customer_payment_idempotency.sql; src/components/CustomerWorkflows.tsx; src/integrations/supabase/types.ts; src/components/CustomerWorkflows.finance.test.tsx; scripts/test-staff-receivables-aging-credit-memo-parity.mjs; scripts/test-database-migrations.mjs; docs/bolt-source-reconciliation/WORK_COORDINATION.md; CURRENT_EXECUTION_STATE.md; REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv; PROGRAMMER_2_CURRENT_REPORT.md; EXECUTION_LOG.md
TESTS_RUN_WITH_RESULTS=NOT RUN on current implementation branch
FAILED_OR_SKIPPED=No implementation-branch test result yet; hosted credential-gated E2E remains BLOCKED_EXTERNAL
MERGE_STATUS=PR not created; no merge claimed
BLOCKERS=Await exact-head CI after PR creation; hosted customer E2E credentials are unavailable but do not block local PG17/browser tests
LOCKED_PATHS=20261023235900_customer_payment_idempotency.sql; CustomerWorkflows.tsx; types.ts; CustomerWorkflows.finance.test.tsx; test-staff-receivables-aging-credit-memo-parity.mjs; test-database-migrations.mjs
UPDATED_AT=2026-10-23T21:57:00+03:00

## Evidence rules
Allowed statuses: IMPLEMENTED, INTEGRATED, TESTED_EXACT_SHA, BROWSER_PROVEN, PRODUCTION_PROVEN, CLOSED_WITH_EVIDENCE, BLOCKED_EXTERNAL, NOT RUN. A skipped job is not PASS. Never transfer PASS between SHAs. Local DB/browser evidence is not production proof.
