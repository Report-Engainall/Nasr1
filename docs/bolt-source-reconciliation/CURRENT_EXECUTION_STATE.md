# الحالة التنفيذية الحالية الوحيدة — Nasr1 / P2
LAST_RECONCILED_AT=2026-10-23T23:34:00+03:00

## حقيقة Git الحية
REPOSITORY=Report-Engainall/Nasr1
MAIN_SHA=6815b00781412bd98cbdd9fb660e475e4540b543
MAIN_TREE=28a1b4dd0084c88a2a7f22fd6dc38b3a21fb82a8
CURRENT_BRANCH=p2/customer-address-uuid-contract-20261023
BASE_SHA=6815b00781412bd98cbdd9fb660e475e4540b543
HEAD_SHA=TO BE RECORDED AFTER ATOMIC COMMIT
MAIN_CI=IN_PROGRESS at checkpoint — main push Core run 40019333142 was triggered for exact SHA 6815b00781412bd98cbdd9fb660e475e4540b543; re-read before claiming terminal status.
LATEST_CENTRAL_DOCS_PR=#126 merged; merge SHA 6815b00781412bd98cbdd9fb660e475e4540b543.
PR126_EXACT_HEAD=2d1fddde5c8c9b3185dc19880ef5426129d28005; Core 40018779157 SUCCESS and P2 40018779193 SUCCESS on that exact PR head.
PR126_HOSTED_CUSTOMER_E2E=SKIPPED / BLOCKED_EXTERNAL due missing dedicated non-production credentials. Not PASS.
No direct main writes, force-push, destructive reset, production database writes, or live external integration calls.

## Closed work — do not recreate
- PR #123 payment retry-key preservation merged at 271de9ac23d6fd092db5a77c15bcf191249fd40d. Its exact PR head f7f0071a4a5437877e7da13dd1e83471ded3a610 passed Core 40017279766 and P2 40017279809; the main Core run 40017988386 passed on that exact merge SHA.
- PR #126 reconciled the central P2 state and was merged at 6815b00781412bd98cbdd9fb660e475e4540b543. Its exact PR head 2d1fddde5c8c9b3185dc19880ef5426129d28005 passed Core 40018779157 and P2 40018779193. Its hosted customer E2E job was SKIPPED / BLOCKED_EXTERNAL.
- PRs #100, #101, #103, #104, #110, #111, #112, #123 and #126 are merged. PRs #52/#54/#83/#84/#88/#90/#99 remain merged. Do not recreate without a verified regression.
- Preserve P1 PR #97 and P3 route/catalog ownership. Open P3 address-route acceptance tests are test-only and do not lock P2 service paths.

## Task underway
TASK_ID=COMPANY-001-CUSTOMER-ADDRESS-UUID-CONTRACT
TASK_STATUS=IMPLEMENTED; REGRESSION_TESTS_ADDED; EXACT_FINAL_HEAD_CI_PENDING
FILES_CHANGED=src/lib/customer-addresses.ts; src/test/customer-addresses.test.ts; docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md; docs/bolt-source-reconciliation/REMAINING_SCREEN_ACCEPTANCE_MATRIX_2026-10-22.csv; docs/bolt-source-reconciliation/PROGRAMMER_2_CURRENT_REPORT.md; docs/bolt-source-reconciliation/WORK_COORDINATION.md; docs/bolt-source-reconciliation/EXECUTION_LOG.md
CHANGE_SUMMARY=The save_customer_address RPC contract returns UUID and delete_customer_address accepts UUID; the service accepted any non-empty string as a save acknowledgement and sent malformed edit/delete IDs to the database. The service now validates UUID format for save acknowledgement, optional edit ID and deletion ID before any RPC. Regression tests prove malformed acknowledgements do not count as success and malformed IDs trigger no RPC.
TESTS_RUN_WITH_RESULTS=NOT RUN locally in this tool session. Exact-head Core/P2 Actions will be required after final commit.
FAILED_OR_SKIPPED=No company-code test result is claimed yet. Hosted cross-tenant customer E2E remains BLOCKED_EXTERNAL unless dedicated non-production credentials are provided; external skips are not PASS.
MERGE_STATUS=NO PR MERGE YET; create PR after atomic commit and inspect exact-head workflows.
BLOCKED_EXTERNAL=Hosted cross-tenant customer E2E credentials are unavailable; local Core/PostgreSQL 17 and P2 acceptance remain required.
LOCKED_PATHS=Exclusive P2 lock: src/lib/customer-addresses.ts; src/test/customer-addresses.test.ts. Central P2 state/matrix/report/coordination/log paths are being updated in this same atomic commit. No routes, generated route tree, or migrations are modified.
NEXT_TASK_ID=COMPANY-001-CUSTOMER-ADDRESS-UUID-CONTRACT
NEXT_ACTION=Open the PR after the atomic implementation/checkpoint commit; inspect every changed file; run exact-head Core and P2/PostgreSQL 17 to terminal success on a single SHA; fix only evidenced failures; merge through PR only after required gates succeed, then verify main merge SHA and matching Core CI. Do not expand the task into invitation/session or RLS redesign.
UPDATED_AT=2026-10-23T23:34:00+03:00

## Evidence rules
Allowed statuses: IMPLEMENTED, INTEGRATED, TESTED_EXACT_SHA, BROWSER_PROVEN, PRODUCTION_PROVEN, CLOSED_WITH_EVIDENCE, BLOCKED_EXTERNAL, NOT RUN. No skipped job is PASS; never transfer a test pass across SHAs.
