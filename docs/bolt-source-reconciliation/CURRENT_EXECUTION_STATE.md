# الحالة التنفيذية الحالية الوحيدة — Nasr1 / P2
آخر مصالحة مؤكدة: 2026-10-23T18:21:00+03:00

## خط الأساس الحي
REPOSITORY=Report-Engainall/Nasr1
MAIN_SHA=78d8492a14ef025f53c8b669e44d622d95de525a
MAIN_TREE=9d2e3728917dcd5080614244e400373b15b71647
Core main run 39976494059 = SUCCESS على الرأس الحالي.
#83 sessions merged; Core 39968857948 + P2 39968858140 passed on tested head dda512495c43f2fd84517635cd83421ef49e92c0 (tested tree equals merge tree).
#95 receivables credit-memo parity merged; Core 39969721081 + P2 39969721208 passed on tested head f856a6cf284084953cbebfd2718cbf909ce3d17e, tree 4436aa7048f06a4d295217b2a13ca2b6ebc080bd.
#96 staff-only storefront dashboard link merged.
#82 customer_manager invitations merged at f9beca0553fc7e546415b42b83274898fcf9449a; Core 39974149475 + P2 39974149285 passed exact head 4437526cebed13717bd71c084df447696b18183a; Chromium invitation/org isolation/financial masking/audit passed. Forward pgcrypto migration 20261023190000 follows 20261023180000; historic migrations kept immutable.
#94 org role-management settings acceptance merged at 78d8492a14ef025f53c8b669e44d622d95de525a; Core 39975696696 + P2 39975696915 passed exact head 5f51146c3623096548b33e2b107f8ce31cc6605a. #43 closed without merge; decision comment 6368171463.

## NEXT_TASK_ID=ORD-001-ORDER-STATUS-AUDIT-ACCEPTANCE
PR #99 branch p2/order-status-history-acceptance-20261023; BASE_SHA=78d8492a14ef025f53c8b669e44d622d95de525a; HEAD_SHA=4122ed10b6827c6e0d4b4aeb64c6578ea8cd4d08; tree 40fcbdf56ddb5a50badc3c4d42e3164bb7ecfb3e.
Core run 39976687601 and P2 run 39976687945 were IN_PROGRESS at last read on that exact head. No merge before terminal pass.
PR #99 is test-only: it proves ordered confirmed -> processing -> shipped -> delivered audit rows, changed_by equals the active staff profile, and rejected shipped -> cancelled does not write a false history record. PR #56 is closed without merge and is not proof of closure.

## Local Onyx / INV-009
INV-009=CLOSED_WITH_EVIDENCE for local reconciliation only. Core 39969721081/job 120468865117 passed test-onyx-reconciliation.mjs, test-onyx-reconciliation-concurrency.mjs, and test-onyx-source-evidence.mjs.
Those three script SHAs are unchanged through main: d3c50351077779fb524e2f726c002a341d96062d; ab1b234b8d5b194a518f692e5538b0db48e60ab7; 181daf61a4384a23db348140d0d21d3c11786aff. Local tests cover atomic preview/apply/rollback, reservations, fingerprints, request/snapshot binding, concurrency, stale-preview rejection and audit.
Real Onyx target import/live sync remains BLOCKED_EXTERNAL; local XLSX download is not target-import proof.

## OPS-DR-001
CLOSED_WITH_EVIDENCE for isolated PostgreSQL 17 CI only. Core run 39969721081/job 120468865117 step Verify isolated PostgreSQL 17 backup and restore = SUCCESS.
Backup SHA-256 59d58847641f4a66b76421477f85bd9ae06734baad419f283569d8dff27f9be1; backup 394 ms; restore 1012 ms; total 4607 ms; 23 tables/1048 rows; schema/routines/policies/triggers/row counts/critical hashes matched; temporary DB removed.
Not production restore proof; no RTO/RPO claim.

## P1-owned PR #88
Latest head 1647ef42b85abae4d2668cc76ff276268c19d436; Core 39976651566 and P2 39976652003 were IN_PROGRESS at last read. Branch is one commit behind main.
Validator e12a26d11facfd9851909f717f31c14551e6bea3 restricts API to HTTP loopback:54321 and DB to loopback:54322 or 55432. Comment 6368243449 asks P1 to merge current main non-forcibly and prove e2e/device-session-management.spec.ts actually passed rather than skipped.
DeviceManagement.tsx, e2e/device-session-management.spec.ts, scripts/seed-p1-device-session-playwright.mjs and P1 resume/report files remain locked to P1. Do not claim BROWSER_PROVEN until the dedicated spec passes on final integrated SHA.

## Required checkpoint
LAST_COMPLETED_TASK_ID=ROLE-MANAGEMENT-UI-ACCEPTANCE
MAIN_SHA=78d8492a14ef025f53c8b669e44d622d95de525a
CURRENT_BRANCH=p2/order-status-history-acceptance-20261023
BASE_SHA=78d8492a14ef025f53c8b669e44d622d95de525a
HEAD_SHA=4122ed10b6827c6e0d4b4aeb64c6578ea8cd4d08
TASK_STATUS=IMPLEMENTED; CORE_AND_P2_IN_PROGRESS_EXACT_SHA
FILES_CHANGED=scripts/test-database-migrations.mjs
TESTS_RUN=PR94 Core 39975696696/P2 39975696915 PASS; current main Core 39976494059 PASS; PR99 Core 39976687601/P2 39976687945 IN_PROGRESS
TESTS_FAILED_OR_SKIPPED=PR99 results pending; PR88 dedicated browser result pending
MERGE_STATUS=#82/#83/#94/#95/#96 merged; #43 closed without merge; #99 open; #88 open draft
EXTERNAL_BLOCKERS=Onyx live import/sync; official WhatsApp Business API; production restore proof
LOCKED_PATHS=P1 DeviceManagement UI/spec/seed/reports; P2 backend/migrations/database acceptance/central state
NEXT_TASK_ID=ORD-001-ORDER-STATUS-AUDIT-ACCEPTANCE
NEXT_ACTION=Read PR99 Core/P2 to terminal; fix only observed failures; merge only after current exact-head tests pass; keep PR88 proof separate
UPDATED_AT=2026-10-23T18:21:00+03:00
