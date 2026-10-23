# الحالة التنفيذية الحالية الوحيدة — Nasr1 / P2
LAST_RECONCILED_AT=2026-10-23T23:29:00+03:00

## حقيقة Git الحية
REPOSITORY=Report-Engainall/Nasr1
CURRENT_BRANCH=main (مرجع فقط؛ لا كتابة مباشرة إلى main)
MAIN_SHA=271de9ac23d6fd092db5a77c15bcf191249fd40d
MAIN_TREE=4bde3ed3147037170bb6a27c5fcb9e1d62cea37e
MAIN_CURRENT_CI=SUCCESS — Core push run 40017988386 completed SUCCESS on this exact main merge SHA 271de9ac23d6fd092db5a77c15bcf191249fd40d.
LAST_MERGED_PR=#123 — https://github.com/Report-Engainall/Nasr1/pull/123; merge SHA 271de9ac23d6fd092db5a77c15bcf191249fd40d; tested PR head f7f0071a4a5437877e7da13dd1e83471ded3a610.
PR123_CORE_TESTED_HEAD=SUCCESS — run 40017279766 on exact PR head f7f0071a4a5437877e7da13dd1e83471ded3a610.
PR123_P2_TESTED_HEAD=SUCCESS — run 40017279809 on exact PR head f7f0071a4a5437877e7da13dd1e83471ded3a610.
PR123_MAIN_CORE=SUCCESS — run 40017988386 on exact merge/main SHA 271de9ac23d6fd092db5a77c15bcf191249fd40d.
PR123_HOSTED_CUSTOMER_E2E=SKIPPED / BLOCKED_EXTERNAL because dedicated non-production Supabase credentials and authorized cross-tenant test accounts are unavailable. This is not PASS.
No production database writes, live payment operation, live Onyx import, or live WhatsApp API call was performed.

## Closed work — do not recreate
- PR #123 fixed the verified pending-payment idempotency bug: each unresolved normalized payload keeps its own request key; malformed/null/empty RPC acknowledgements fail closed and retain the key. The default finance test mock matches the UUID-returning RPC contract.
- PR #123 Core and P2 workflows completed SUCCESS on the same exact PR head f7f0071a4a5437877e7da13dd1e83471ded3a610; push-to-main Core completed SUCCESS on merge SHA 271de9ac23d6fd092db5a77c15bcf191249fd40d. The external customer E2E job was SKIPPED due missing dedicated non-production credentials; P2 local PostgreSQL 17/Supabase and Chromium acceptance passed.
- PRs #100, #101, #103, #104, #110, #111, #112, and #123 are merged. PRs #52/#54/#83/#84/#88/#90/#99 are also merged. Do not reimplement them without a proven current regression.
- P1 PR #97 and current P1/P3 branches remain outside P2 ownership unless an explicit handoff transfers a path.

## Completed task status
FIN-LEDGER-001-MANUAL-JOURNAL-REVERSAL-ACCEPTANCE=INTEGRATED (PR #101)
FIN-INVOICE-001-SUMMARY-PAGINATION-NO-DOUBLE-COUNT=INTEGRATED; PostgreSQL 17 accepted (PR #103)
FIN-INVOICE-001-CREDIT-ADJUSTED-PAYMENT-BALANCE=INTEGRATED; source/currency/role/race tests accepted (PR #104)
FIN-EXPENSE-001-CASH-EXPENSE-SOURCE-POSTING=INTEGRATED; PostgreSQL 17 source/idempotency/concurrency acceptance (PR #104)
FIN-CREDIT-001-RETURN-CREDIT-MEMO=INTEGRATED; local Chromium flow tested (PR #62/#104)
FIN-INVOICE-001-PAYMENT-IDEMPOTENCY-REPLAY-GUARD=INTEGRATED (PR #112; exact PR-head checks successful; hosted E2E skipped)
FIN-INVOICE-001-PAYMENT-IDEMPOTENCY-PENDING-REQUEST-MAP=CLOSED_WITH_EVIDENCE (PR #123; exact PR-head Core/P2 and merge-SHA Core successful)

## مؤشر الاستئناف الوحيد
LAST_COMPLETED_TASK_ID=FIN-INVOICE-001-PAYMENT-IDEMPOTENCY-PENDING-REQUEST-MAP
LAST_COMPLETED_PR=https://github.com/Report-Engainall/Nasr1/pull/123
LAST_COMPLETED_PR_HEAD=f7f0071a4a5437877e7da13dd1e83471ded3a610
LAST_COMPLETED_MERGE_SHA=271de9ac23d6fd092db5a77c15bcf191249fd40d
CURRENT_BRANCH=main (baseline is read-only; create a new branch before coding)
BASE_SHA=271de9ac23d6fd092db5a77c15bcf191249fd40d
HEAD_SHA=271de9ac23d6fd092db5a77c15bcf191249fd40d (verified main baseline at this reconciliation point)
TASK_ID=FIN-INVOICE-001-PAYMENT-IDEMPOTENCY-PENDING-REQUEST-MAP
TASK_STATUS=CLOSED_WITH_EVIDENCE; INTEGRATED; TESTED_EXACT_SHA on f7f0071a4a5437877e7da13dd1e83471ded3a610; main Core tested on 271de9ac23d6fd092db5a77c15bcf191249fd40d
FILES_CHANGED=src/components/CustomerWorkflows.tsx; src/components/CustomerWorkflows.finance.test.tsx; docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md; docs/bolt-source-reconciliation/REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv; docs/bolt-source-reconciliation/PROGRAMMER_2_CURRENT_REPORT.md; docs/bolt-source-reconciliation/WORK_COORDINATION.md; docs/bolt-source-reconciliation/EXECUTION_LOG.md
TESTS_RUN_WITH_RESULTS=Core run 40017279766 SUCCESS and P2 run 40017279809 SUCCESS on the same exact PR head f7f0071a4a5437877e7da13dd1e83471ded3a610; Core push run 40017988386 SUCCESS on exact merge/main SHA 271de9ac23d6fd092db5a77c15bcf191249fd40d; PostgreSQL 17 migration/core checks and local Supabase/Chromium P2 flows SUCCESS.
FAILED_OR_SKIPPED=Hosted customer order/tenant isolation job SKIPPED / BLOCKED_EXTERNAL; no external test credentials. CodeRabbit invocation was rate-limited, so no independent completed CodeRabbit report is claimed. Manual P2 review performed; no unresolved review threads existed at merge.
MERGE_STATUS=PR #123 CLOSED / MERGED via PR; merge SHA 271de9ac23d6fd092db5a77c15bcf191249fd40d; main Core PASS verified on the same merge SHA.
BLOCKED_EXTERNAL=Hosted customer/tenant E2E until dedicated non-production Supabase project, cross-organization test accounts, and authorization for test writes are available; local DB/browser tests do not prove hosted production behavior.
LOCKED_PATHS=No active P2 lock remains on src/components/CustomerWorkflows.tsx or src/components/CustomerWorkflows.finance.test.tsx for payment task; P2 exclusively owns CURRENT_EXECUTION_STATE.md, REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv, PROGRAMMER_2_CURRENT_REPORT.md, WORK_COORDINATION.md, EXECUTION_LOG.md. P1/P3-owned route/catalog changes remain reserved.
NEXT_TASK_ID=COMPANY-001-CURRENT-MAIN-ACCEPTANCE
NEXT_ACTION=Create an isolated P2 branch from the latest verified main; inspect existing routed company workspace, membership/invitation/address services and RLS/RPC on that exact tree. Implement only the first evidenced missing end-to-end slice. Do not repeat customer_manager role mapping (#84), invitation-expiry validation (#90), or session management (#83/#88); test those only if affected. Record actual locked paths after finding the existing route and service. Require UI + RPC/DB + role/tenant PostgreSQL 17 acceptance and exact-head Core/P2 CI.
UPDATED_AT=2026-10-23T23:29:00+03:00

## Evidence rules
Allowed statuses: IMPLEMENTED, INTEGRATED, TESTED_EXACT_SHA, BROWSER_PROVEN, PRODUCTION_PROVEN, CLOSED_WITH_EVIDENCE, BLOCKED_EXTERNAL, NOT RUN. A skipped job is not PASS. Never transfer PASS between SHAs. Local DB/browser evidence is not production proof.
