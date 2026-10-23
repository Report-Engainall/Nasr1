# الحالة التنفيذية الحالية الوحيدة — Nasr1 / P2
LAST_RECONCILED_AT=2026-10-23T23:41:00+03:00

## حقيقة Git الحية
REPOSITORY=Report-Engainall/Nasr1
MAIN_SHA=6815b00781412bd98cbdd9fb660e475e4540b543
MAIN_TREE=28a1b4dd0084c88a2a7f22fd6dc38b3a21fb82a8
MAIN_CORE_CI=SUCCESS — run 40019333142 on exact main SHA 6815b00781412bd98cbdd9fb660e475e4540b543.
LAST_CENTRAL_RECONCILIATION_PR=#126 merged at 6815b00781412bd98cbdd9fb660e475e4540b543; exact PR head 2d1fddde5c8c9b3185dc19880ef5426129d28005 passed Core 40018779157 and P2 40018779193.
PR126_HOSTED_CUSTOMER_E2E=SKIPPED / BLOCKED_EXTERNAL; not PASS.
CURRENT_BRANCH=feat/p2-company-workspace-acceptance-20261023
BASE_SHA=6815b00781412bd98cbdd9fb660e475e4540b543
CURRENT_PR=https://github.com/Report-Engainall/Nasr1/pull/127
CURRENT_PR_HEAD=Re-read from live PR after atomic checkpoint commit; final-head PASS not yet established.
No direct main writes, force-push, destructive reset or production DB writes.

## Closed work — do not recreate
- PR #123 payment retry-key fix merged at 271de9ac23d6fd092db5a77c15bcf191249fd40d; exact PR head f7f0071a4a5437877e7da13dd1e83471ded3a610 passed Core 40017279766 and P2 40017279809; main Core passed on that exact merge SHA.
- PR #126 central-state reconciliation merged at 6815b00781412bd98cbdd9fb660e475e4540b543; its exact PR head 2d1fddde5c8c9b3185dc19880ef5426129d28005 passed Core 40018779157 and P2 40018779193; main Core 40019333142 passed on 6815b00781412bd98cbdd9fb660e475e4540b543.
- PR #100, #101, #103, #104, #110, #111, #112, #123 and #126 merged; #52/#54/#83/#84/#88/#90/#99 also merged. Do not recreate absent a verified regression.
- PR #127 is the single authoritative Company/address P2 PR. PR #129 was opened on the same two service/test paths; its independent code is being transferred here and #129 will be closed without merge.

## Active task — COMPANY-001-CUSTOMER-ADDRESS-VALIDATION
TASK_ID=COMPANY-001-CUSTOMER-ADDRESS-VALIDATION
TASK_STATUS=IMPLEMENTED; REGRESSION_TESTS_ADDED; FINAL-HEAD CORE/P2 CI PENDING
CURRENT_PR=https://github.com/Report-Engainall/Nasr1/pull/127
CURRENT_BRANCH=feat/p2-company-workspace-acceptance-20261023
BASE_SHA=6815b00781412bd98cbdd9fb660e475e4540b543
CODE_AND_TEST_PARENT_HEAD=61b21688e2ae0ef65e72d718340699e6a85cc574
FILES_CHANGED=src/lib/customer-addresses.ts; src/test/customer-addresses.test.ts; docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md; docs/bolt-source-reconciliation/REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv; docs/bolt-source-reconciliation/PROGRAMMER_2_CURRENT_REPORT.md; docs/bolt-source-reconciliation/WORK_COORDINATION.md; docs/bolt-source-reconciliation/EXECUTION_LOG.md
CHANGE_SUMMARY=PR #127 already parsed fetched address records for schema/UUID/country/timestamp validity. This patch retains that behavior and requires UUID save acknowledgements and UUID edit/delete IDs before RPC. No UI/migration/RLS/grant changes.
TESTS_RUN_WITH_RESULTS=No final-head PASS claimed; PR #127 HEAD changes via the atomic code+central checkpoint commit. Main Core 40019333142 passed exact main SHA 6815b00781412bd98cbdd9fb660e475e4540b543; current PR #127 Core/P2 must be re-read at latest SHA.
FAILED_OR_SKIPPED=No Company fix test failure reported yet. Hosted customer/tenant E2E remains BLOCKED_EXTERNAL without dedicated non-production credentials.
MERGE_STATUS=PR #127 OPEN; not merged.
BLOCKED_EXTERNAL=Hosted cross-tenant customer E2E needs dedicated non-production Supabase and authorized synthetic accounts; no production writes.
LOCKED_PATHS=Exclusive P2 path lock via PR #127: src/lib/customer-addresses.ts; src/test/customer-addresses.test.ts. Central P2 files updated atomically on this branch. P1/P3 route/UI ownership remains reserved.
NEXT_TASK_ID=COMPANY-001-CUSTOMER-ADDRESS-VALIDATION
NEXT_ACTION=Close duplicate PR #129 without merge after confirming transfer into #127; read current PR #127 HEAD; inspect all required Core/P2 jobs to terminal; verify address regression ran on that SHA; fix evidenced failure only; merge #127 by PR only after all required gates pass; verify post-merge main SHA and Core.
UPDATED_AT=2026-10-23T23:41:00+03:00

## Evidence rules
Allowed statuses: IMPLEMENTED, INTEGRATED, TESTED_EXACT_SHA, BROWSER_PROVEN, PRODUCTION_PROVEN, CLOSED_WITH_EVIDENCE, BLOCKED_EXTERNAL, NOT RUN. Skipped is not PASS; never transfer statuses between SHAs.
