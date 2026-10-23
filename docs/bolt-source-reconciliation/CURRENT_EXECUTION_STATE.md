# الحالة التنفيذية الحالية الوحيدة — Nasr1 / P2
LAST_RECONCILED_AT=2026-10-23T21:48:00+03:00

## حقيقة Git الحالية
REPOSITORY=Report-Engainall/Nasr1
CURRENT_BRANCH=main (مرجع قراءة فقط؛ لا كتابة مباشرة على main)
MAIN_SHA=03ac6c5f7e3dc792c252d9dd2ee1dd5ec3dfcdac
MAIN_TREE=15f30663a80ba9ff2e83c2057f15ed489eed92be
MAIN_CORE_CI=IN_PROGRESS — https://github.com/Report-Engainall/Nasr1/actions/runs/40005590004 على SHA المطابق 03ac6c5f7e3dc792c252d9dd2ee1dd5ec3dfcdac.
MAIN_P2_EXACT_SHA=NOT RUN; no P2 gate is confirmed for this exact merge SHA.
LATEST_PR_MERGE=#110 pricing preview retry merged at 03ac6c5f7e3dc792c252d9dd2ee1dd5ec3dfcdac; exact tested head b6d99a91958b43e7cd90164a104c8c0a5bc1bd09 Core 40004970539 SUCCESS and P2 40004970599 SUCCESS. Those are PR-head results, not proof for the merge SHA.
No force-push, destructive reset, direct writes to main, or production database writes.

## Last completed P2 security unit
LAST_COMPLETED_TASK_ID=AI-001-AI-BUDGET-RPC-LIVE-SESSION-GUARD
LAST_COMPLETED_PR=https://github.com/Report-Engainall/Nasr1/pull/109
LAST_COMPLETED_MERGE_SHA=46a5fbb379d908328e5e2136eec3190a32e148f7
TASK_STATUS=INTEGRATED; exact PR-head Core and P2 passed; hosted customer E2E skipped due unavailable dedicated non-production credentials.
EVIDENCE=PR #109 exact head a5bff9191481bc9c84e4fa2fecc345692a9635d4: Core run 40003198716 SUCCESS and P2 run 40003198651 SUCCESS; then merge commit 46a5fbb379d908328e5e2136eec3190a32e148f7. Its Core on exact main merge SHA later succeeded in run 40004846442. Latest main has advanced to 03ac6c5 due merged PR #110; current Core is in progress and current-main P2 is not run.

## مؤشر الاستئناف الوحيد
LAST_COMPLETED_TASK_ID=AI-001-AI-BUDGET-RPC-LIVE-SESSION-GUARD
LAST_COMPLETED_PR=https://github.com/Report-Engainall/Nasr1/pull/109
LAST_COMPLETED_MERGE_SHA=46a5fbb379d908328e5e2136eec3190a32e148f7
NEXT_TASK_ID=FIN-INVOICE-001-PAYMENT-IDEMPOTENCY-REPLAY-GUARD
CURRENT_BRANCH=p2/payment-idempotency-current-main-20261023
BASE_SHA=03ac6c5f7e3dc792c252d9dd2ee1dd5ec3dfcdac
HEAD_SHA=0b5019d4fe0919e7d2f46db62ca821e5e97cb6d5 (pre-state-update snapshot; reread the final branch head after this state commit before creating the PR)
TASK_STATUS=IMPLEMENTED; EXACT-HEAD CI NOT RUN
FILES_CHANGED=supabase/migrations/20261023240000_customer_payment_idempotency.sql; src/components/CustomerWorkflows.tsx; src/integrations/supabase/types.ts; src/components/CustomerWorkflows.finance.test.tsx; scripts/test-staff-receivables-aging-credit-memo-parity.mjs; scripts/test-database-migrations.mjs
TESTS_RUN_WITH_RESULTS=NOT RUN on current payment branch. Current main Core run 40005590004 is IN_PROGRESS on exact SHA 03ac6c5 and is unrelated to this feature branch.
FAILED_OR_SKIPPED=Hosted credential-dependent customer E2E on PR #109 was SKIPPED, not PASS. No payment branch test has been marked PASS.
MERGE_STATUS=No payment PR yet; do not merge until exact-head Core and P2 local PostgreSQL/Playwright are terminal successes and review findings are addressed.
BLOCKED_EXTERNAL=Hosted credential-dependent customer E2E is blocked by absent dedicated non-production credentials; local PG17 acceptance and local browser work are available in CI.
LOCKED_PATHS=20261023240000_customer_payment_idempotency.sql; CustomerWorkflows.tsx; Supabase types.ts; CustomerWorkflows.finance.test.tsx; test-staff-receivables-aging-credit-memo-parity.mjs; test-database-migrations.mjs
NEXT_ACTION=Finish exact diff and RPC-call-site review; create PR from p2/payment-idempotency-current-main-20261023 against the current main; inspect both final workflow results and fix any root cause; merge through PR only when Core and P2 gates pass; re-read the resulting main SHA and exact-main Core/P2 state before moving to the next acceptance gap.
UPDATED_AT=2026-10-23T21:48:00+03:00

## Evidence rules
Allowed statuses: IMPLEMENTED, INTEGRATED, TESTED_EXACT_SHA, BROWSER_PROVEN, PRODUCTION_PROVEN, CLOSED_WITH_EVIDENCE, BLOCKED_EXTERNAL, NOT RUN. A skipped job is not PASS. Never transfer PASS between SHAs. Local DB/browser evidence is not production proof.

## Recent merged work — do not recreate
- PR #100 central-state reconciliation merged at 1c21fa6d81009dc8924d26b6f7addd5c976c0cb7.
- PR #101 manual general-journal reversal merged at 15a3c10fa5f5aa29dc59f2cf732950cddaa0efcb.
- PR #103 ledger pagination/summary acceptance merged at 2908079abd76e1a84cc4449d65b6b01cdfc63482. Core 39993605159 and P2 39993605124 SUCCESS on exact PR head 3a95de8991c3609349a56f4a102f147e0f9587e8.
- PR #104 payment/credit balance guard merged at 5dbb01f7cf2ac054212abc6f3ec34af1b1fe99df from tested PR head 7f1110d95d26ece5d516b7267904a4f3f397f6ef. Exact-head Core 40000512625 and P2 40000512706 SUCCESS; Core 40001179290 SUCCESS on exact merge SHA.
- PR #104 proves posted-credit-adjusted payment bounds, source/currency validation, finance RPC role boundary, authoritative paid/credit/outstanding aggregates, and two-session invoice-lock race denial. Local Chromium return/review/receipt/credit memo succeeded.
- Hosted customer E2E job 120575459434 was SKIPPED due missing dedicated non-production credentials; never report it as PASS.
- PR #62 customer-statement/credit-memo parity merged at 024c279a2d1c0226c662e5d916871f45534c7242; release its old path lock. PR #40 is CLOSED and NOT MERGED.
- PR #52/#54/#83/#84/#88/#90/#99 merged. Do not redo their functionality absent proven regression. PR #89 (P3) and #97 (P1) remain outside P2 ownership.

## Completed task status
FIN-LEDGER-001-MANUAL-JOURNAL-REVERSAL-ACCEPTANCE=INTEGRATED (PR #101)
FIN-INVOICE-001-SUMMARY-PAGINATION-NO-DOUBLE-COUNT=INTEGRATED (PR #103; PG17 accepted)
FIN-INVOICE-001-CREDIT-ADJUSTED-PAYMENT-BALANCE=INTEGRATED (PR #104; tested exact PR head and exact merge Core)
FIN-EXPENSE-001-CASH-EXPENSE-SOURCE-POSTING=INTEGRATED (source/idempotency/concurrency suite green on PR #104 tested head)
FIN-CREDIT-001-RETURN-CREDIT-MEMO=INTEGRATED (source-linked workflow and local Chromium acceptance)

## مؤشر الاستئناف الوحيد
LAST_COMPLETED_TASK_ID=FIN-INVOICE-001-CREDIT-ADJUSTED-PAYMENT-BALANCE
LAST_COMPLETED_PR=https://github.com/Report-Engainall/Nasr1/pull/104
LAST_COMPLETED_PR_HEAD=7f1110d95d26ece5d516b7267904a4f3f397f6ef
LAST_COMPLETED_MERGE_SHA=5dbb01f7cf2ac054212abc6f3ec34af1b1fe99df
NEXT_TASK_ID=FIN-INVOICE-001-PAYMENT-IDEMPOTENCY-REPLAY-GUARD
CURRENT_BRANCH=main (read-only reference; new work requires a branch and PR)
BASE_SHA=d81c9b34f819a53df7610937264c6fcb923c3f95
HEAD_SHA=d81c9b34f819a53df7610937264c6fcb923c3f95
TASK_STATUS=NEXT_ACTION
NEXT_ACTION=Close the duplicate-payment gap. customer_payments currently has no persisted idempotency key, and the UI calls record_customer_payment without a request key. Add a tenant-scoped unique idempotency key plus canonical request fingerprint. Same key and same payload must replay the original saved payment; same key with changed payload must fail; concurrent same-key requests must not duplicate. Preserve request key across ambiguous client retries. Keep same invoice advisory lock shared with posted-credit posting; inspect RPC grants, signatures, all call sites and prevent an unintended old overload. Add PostgreSQL 17 tests for replay, changed-payload conflict, concurrent same-key calls and cross-tenant isolation, plus React retry regression. Do not create a second ledger/payment engine.
NEXT_ACTION_EVIDENCE=PR #104 exact head Core 40000512625 SUCCESS, P2 40000512706 SUCCESS; exact merge SHA Core 40001179290 SUCCESS. Current main SHA d81c9b34f819a53df7610937264c6fcb923c3f95 Core run 40001438040 IN_PROGRESS at 2026-10-23T21:17:51+03:00; P2 on exact current main SHA NOT RUN.
UPDATED_AT=2026-10-23T21:17:51+03:00

## Evidence rules
Allowed statuses: IMPLEMENTED, INTEGRATED, TESTED_EXACT_SHA, BROWSER_PROVEN, PRODUCTION_PROVEN, CLOSED_WITH_EVIDENCE, BLOCKED_EXTERNAL, NOT RUN. A skipped job is not PASS. Never transfer PASS between SHAs. Local DB/browser evidence is not production proof.
