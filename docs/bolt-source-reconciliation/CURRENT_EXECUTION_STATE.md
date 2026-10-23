# الحالة التنفيذية الحالية الوحيدة — Nasr1 / P2
LAST_RECONCILED_AT=2026-10-23T23:37:00+03:00

## حقيقة Git الحية
REPOSITORY=Report-Engainall/Nasr1
MAIN_SHA=6815b00781412bd98cbdd9fb660e475e4540b543
MAIN_TREE=28a1b4dd0084c88a2a7f22fd6dc38b3a21fb82a8
MAIN_CORE_CI=SUCCESS — push run 40019333142 completed SUCCESS on exact main SHA 6815b00781412bd98cbdd9fb660e475e4540b543.
LAST_MERGED_PR=#126 — central state reconciled at 6815b00781412bd98cbdd9fb660e475e4540b543; PR #126 exact head 2d1fddde5c8c9b3185dc19880ef5426129d28005 passed Core 40018779157 and P2 40018779193.
PR126_HOSTED_CUSTOMER_E2E=SKIPPED / BLOCKED_EXTERNAL, dedicated authorized non-production test credentials unavailable. Not PASS.
CURRENT_BRANCH=p2/customer-address-uuid-contract-20261023
BASE_SHA=6815b00781412bd98cbdd9fb660e475e4540b543
CODE_AND_TEST_SHA=65d2d2b5223565fd40f36c9d6e95104da21488ce (implementation/tests committed; the following docs checkpoint changes the PR head)
CURRENT_PR=https://github.com/Report-Engainall/Nasr1/pull/129
CURRENT_PR_HEAD=Re-read from live PR after the docs checkpoint commit; no exact-head PASS claim until then.
No direct main writes, force-push, destructive reset, or production DB writes.

## Closed work — do not recreate
- PR #123 payment retry-key preservation merged at 271de9ac23d6fd092db5a77c15bcf191249fd40d. Exact PR head f7f0071a4a5437877e7da13dd1e83471ded3a610 passed Core 40017279766 and P2 40017279809; main Core 40017988386 passed on that exact merge SHA.
- PR #126 central-state reconciliation merged at 6815b00781412bd98cbdd9fb660e475e4540b543. Exact PR head 2d1fddde5c8c9b3185dc19880ef5426129d28005 passed Core 40018779157 and P2 40018779193; current main Core run 40019333142 also passed exact SHA 6815b00781412bd98cbdd9fb660e475e4540b543.
- PR #100, #101, #103, #104, #110, #111, #112, #123 and #126 merged. PRs #52/#54/#83/#84/#88/#90/#99 also merged. Do not recreate them absent a proven regression.
- P1/P3 existing PRs have different file scopes; no open PR was found owning the P2 service/test pair recorded below.

## Active task — COMPANY-001-CUSTOMER-ADDRESS-UUID-CONTRACT
TASK_ID=COMPANY-001-CUSTOMER-ADDRESS-UUID-CONTRACT
TASK_STATUS=IMPLEMENTED; REGRESSION_TESTS_ADDED; FINAL-HEAD CORE/P2 CI PENDING
CURRENT_PR=https://github.com/Report-Engainall/Nasr1/pull/129
CURRENT_BRANCH=p2/customer-address-uuid-contract-20261023
BASE_SHA=6815b00781412bd98cbdd9fb660e475e4540b543
CODE_AND_TEST_SHA=65d2d2b5223565fd40f36c9d6e95104da21488ce
FILES_CHANGED=src/lib/customer-addresses.ts; src/test/customer-addresses.test.ts; docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md; docs/bolt-source-reconciliation/REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv; docs/bolt-source-reconciliation/PROGRAMMER_2_CURRENT_REPORT.md; docs/bolt-source-reconciliation/WORK_COORDINATION.md; docs/bolt-source-reconciliation/EXECUTION_LOG.md
CHANGE_SUMMARY=SQL save_customer_address returns UUID; client previously treated any non-empty string as confirmed save and passed malformed edit/delete IDs to RPC. Client now validates UUID acknowledgement and IDs before RPC. Tests added for malformed response and invalid IDs producing no RPC. No UI/migration/RLS/grant was changed.
TESTS_RUN_WITH_RESULTS=No final-head test result claimed yet. PR #129 is open and its HEAD will advance via this docs checkpoint; rerun/check Core and P2 on the live final HEAD.
FAILED_OR_SKIPPED=No company-code job failure reported yet. Hosted customer/tenant E2E remains BLOCKED_EXTERNAL if dedicated non-production credentials are unavailable.
MERGE_STATUS=OPEN; PR #129 not merged.
BLOCKED_EXTERNAL=Hosted cross-tenant customer E2E requires an authorized non-production Supabase project and test users; this does not waive local Core/P2 acceptance.
LOCKED_PATHS=Exclusive P2 code lock: src/lib/customer-addresses.ts; src/test/customer-addresses.test.ts. Central P2 files in this one atomic docs refresh: CURRENT_EXECUTION_STATE.md; REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv; PROGRAMMER_2_CURRENT_REPORT.md; WORK_COORDINATION.md; EXECUTION_LOG.md. Do not edit routes, generated route tree, migrations or P1/P3 UI.
NEXT_TASK_ID=COMPANY-001-CUSTOMER-ADDRESS-UUID-CONTRACT
NEXT_ACTION=Re-read PR #129 after this atomic docs commit and capture latest HEAD SHA; inspect Core and P2 workflow jobs to terminal; verify the address contract test ran on that same SHA, fix evidenced failures only, then merge via PR if all required gates succeed; verify new main SHA and its current Core run before advancing.
UPDATED_AT=2026-10-23T23:37:00+03:00

## Evidence rules
Allowed statuses: IMPLEMENTED, INTEGRATED, TESTED_EXACT_SHA, BROWSER_PROVEN, PRODUCTION_PROVEN, CLOSED_WITH_EVIDENCE, BLOCKED_EXTERNAL, NOT RUN. A skipped job is not PASS; never transfer PASS between SHAs. Local DB/browser evidence is not production proof.
