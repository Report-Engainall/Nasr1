# الحالة التنفيذية الحالية الوحيدة — Nasr1 / P2
LAST_RECONCILED_AT=2026-10-23T21:42:00+03:00

## حقيقة Git الحالية
REPOSITORY=Report-Engainall/Nasr1
CURRENT_BRANCH=main (مرجع قراءة فقط؛ لا كتابة مباشرة على main)
MAIN_SHA=46a5fbb379d908328e5e2136eec3190a32e148f7
MAIN_TREE=36339f658d84eb370320bf1f45f301eabc8c7add
MAIN_CORE_CI=SUCCESS — https://github.com/Report-Engainall/Nasr1/actions/runs/40004846442 على SHA main المطابق 46a5fbb379d908328e5e2136eec3190a32e148f7
MAIN_P2_EXACT_SHA=NOT RUN — لا تنقل نجاح P2 على رأس PR إلى رأس الدمج.
PR109_MERGED_SHA=46a5fbb379d908328e5e2136eec3190a32e148f7
PR109_TESTED_HEAD=a5bff9191481bc9c84e4fa2fecc345692a9635d4; Core 40003198716 SUCCESS; P2 40003198651 SUCCESS. الوظيفة المستضافة المعتمدة على بيانات دخول خارجية SKIPPED وليست PASS.
No force-push, destructive reset, direct writes to main, or production database writes.

## آخر وحدة أمنية مكتملة
LAST_COMPLETED_TASK_ID=AI-001-AI-BUDGET-RPC-LIVE-SESSION-GUARD
LAST_COMPLETED_PR=https://github.com/Report-Engainall/Nasr1/pull/109
TASK_STATUS=INTEGRATED; tested on exact PR head, merged to main at 46a5fbb379d908328e5e2136eec3190a32e148f7
EVIDENCE=Migration makes AI budget read/config RPCs require a live Auth session via current_profile_id(); Core 40003198716 and P2 40003198651 SUCCESS on a5bff9191481bc9c84e4fa2fecc345692a9635d4. Hosted customer E2E SKIPPED due missing non-production credentials. Main exact-SHA Core is SUCCESS run 40004846442; main P2 exact-SHA is NOT RUN.

## مؤشر الاستئناف الوحيد
LAST_COMPLETED_TASK_ID=AI-001-AI-BUDGET-RPC-LIVE-SESSION-GUARD
LAST_COMPLETED_PR=https://github.com/Report-Engainall/Nasr1/pull/109
LAST_COMPLETED_MERGE_SHA=46a5fbb379d908328e5e2136eec3190a32e148f7
NEXT_TASK_ID=FIN-INVOICE-001-PAYMENT-IDEMPOTENCY-REPLAY-GUARD
CURRENT_BRANCH=p2/customer-payment-idempotency-mainhead-20261023
BASE_SHA=46a5fbb379d908328e5e2136eec3190a32e148f7
HEAD_SHA=80955574f36b30ab578b99a4232be32a85d7bc11 (updated at next sequential file write; reread branch before testing)
TASK_STATUS=IMPLEMENTED; EXACT-HEAD CI NOT RUN
FILES_CHANGED=supabase/migrations/20261023240000_customer_payment_idempotency.sql; src/components/CustomerWorkflows.tsx; src/integrations/supabase/types.ts; src/components/CustomerWorkflows.finance.test.tsx; scripts/test-staff-receivables-aging-credit-memo-parity.mjs; scripts/test-database-migrations.mjs; docs/bolt-source-reconciliation/WORK_COORDINATION.md
TESTS_RUN_WITH_RESULTS=NOT RUN on current payment branch head. Exact main Core run 40004846442 passed before these branch changes; not evidence for this implementation.
FAILED_OR_SKIPPED=Hosted credential-dependent customer E2E on PR #109 was SKIPPED, not PASS.
MERGE_STATUS=PR not created yet; do not merge until required exact-head Core and P2 Playwright are terminal successes and review findings are resolved.
BLOCKED_EXTERNAL=Hosted customer E2E credentials unavailable; independent local PostgreSQL 17 and local browser checks remain executable in CI.
LOCKED_PATHS=Migration 20261023240000_customer_payment_idempotency.sql; CustomerWorkflows.tsx; Supabase types.ts; CustomerWorkflows.finance.test.tsx; test-staff-receivables-aging-credit-memo-parity.mjs; test-database-migrations.mjs
NEXT_ACTION=Finish review of the idempotency SQL/tests and all RPC call sites; open a PR from p2/customer-payment-idempotency-mainhead-20261023; read exact-head Core and P2 Playwright results; fix root cause of any failures; merge through PR only after both gates pass; then reread resulting main SHA and exact-main Core/P2 state before advancing to the next acceptance-matrix gap.
UPDATED_AT=2026-10-23T21:42:00+03:00

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
