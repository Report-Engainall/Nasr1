# الحالة التنفيذية الحالية الوحيدة — Nasr1 / P2
LAST_RECONCILED_AT=2026-10-23T21:17:51+03:00

## حقيقة Git الحالية
REPOSITORY=Report-Engainall/Nasr1
CURRENT_BRANCH=main (مرجع قراءة فقط؛ لا كتابة مباشرة على main)
MAIN_SHA=d81c9b34f819a53df7610937264c6fcb923c3f95
MAIN_TREE=8107f52d4d6c61845b95ed7226c5c7f03038a484
MAIN_DELTA_FROM_PR104_MERGE=docs/project-bolt-github-7sl6ykzz (5).zip only; application source unchanged in this commit
MAIN_CORE_CI=IN_PROGRESS — https://github.com/Report-Engainall/Nasr1/actions/runs/40001438040 (exact SHA d81c9b34f819a53df7610937264c6fcb923c3f95; latest observed step: PostgreSQL 17 migration acceptance)
PREVIOUS_MERGE_CORE=SUCCESS — https://github.com/Report-Engainall/Nasr1/actions/runs/40001179290 on exact merge SHA 5dbb01f7cf2ac054212abc6f3ec34af1b1fe99df
DOCS_UPDATE_BRANCH=docs/p2-live-reconciliation-post104-20261023
DOCS_UPDATE_BASE=d81c9b34f819a53df7610937264c6fcb923c3f95
No force-push, destructive reset, direct main writes or production database writes.

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
