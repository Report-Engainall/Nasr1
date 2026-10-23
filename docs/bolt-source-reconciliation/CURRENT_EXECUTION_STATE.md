# الحالة التنفيذية الحالية الوحيدة — Nasr1 / P2
LAST_RECONCILED_AT=2026-10-23T18:54:23+03:00

## خط الأساس الحي
REPOSITORY=Report-Engainall/Nasr1
MAIN_SHA=8e48c592d06ee8bc35b73cfe89f5f0fd51c33ec2
MAIN_TREE=40fcbdf56ddb5a50badc3c4d42e3164bb7ecfb3e
MAIN_CORE_CI=PASS — https://github.com/Report-Engainall/Nasr1/actions/runs/39980802016
No direct writes to main. All follow-up changes use isolated branches and PRs.

## إغلاق مثبت بالأدلة
- ORD-001 order lifecycle audit acceptance: PR #99 merged as 8e48c592d06ee8bc35b73cfe89f5f0fd51c33ec2; tested head 4122ed10b6827c6e0d4b4aeb64c6578ea8cd4d08 and tested tree 40fcbdf56ddb5a50badc3c4d42e3164bb7ecfb3e match the current main tree. Core 39976687601 PASS; P2 Playwright 39976687945 PASS; local authenticated order persistence/tenant isolation job 120493443382 PASS. External credential-gated customer job 120493047623 SKIPPED, not PASS.
- Session backend PR #83 merged; exact tested head dda512495c43f2fd84517635cd83421ef49e92c0 with Core 39968857948/P2 39968858140 PASS. External customer-account job was skipped.
- Customer-manager invitation/auth acceptance PR #82 merged at 4437526cebed13717bd71c084df447696b18183a; Core 39974149475/P2 39974149285 PASS on exact head, with local Chromium tenant/finance masking/audit evidence. PR #98 is CLOSED_WITH_EVIDENCE as superseded without merge; its stale 20261023125000 migration must not be reintroduced. Main uses the forward repair 20261023190000_customer_activation_pgcrypto_schema.sql.
- Backup/restore OPS-DR-001: CLOSED_WITH_EVIDENCE for isolated PostgreSQL 17 CI only, run 39969721081/job 120468865117. Backup SHA-256 59d58847641f4a66b76421477f85bd9ae06734baad419f283569d8dff27f9be1; backup 394 ms, restore 1012 ms, total 4607 ms, 23 tables/1048 rows; schema/functions/policies/triggers/counts/critical fingerprints matched and temporary DB removed. No production restore, RTO or RPO claim.
- INV-009: CLOSED_WITH_EVIDENCE for local Onyx reconciliation only; atomic preview/apply/rollback, reservations, stale snapshot/request fingerprint binding, concurrency and audit tests passed (Core run 39969721081/job 120468865117; scripts unchanged on main). Onyx target import/live sync is BLOCKED_EXTERNAL.
- PR #52 and #54 are merged; #56 and #43 are closed without merge; #90/#84/#94/#95/#96 are merged. #43 was superseded by the merged #94 settings acceptance (decision comment 6368171463).
- PR #88 is P1-owned, open draft at head 5114ea8227f570662533219af1dc3a013cd49f75. Core run 39981579136 and P2 run 39981579236 are IN_PROGRESS on this exact head; local authenticated job had not reached terminal result at last read. Older head 0d51e2090951e1dab80d4fbdf8e92bcfbb256de8 had Core/P2 SUCCESS and local session Chromium acceptance, but does not prove current-head integration. External customer E2E was SKIPPED.
- PR #89 is P3-owned, open; PR #97 is P1-owned, open draft. P2 does not modify their locked UI paths.

## Sole resumption pointer
NEXT_TASK_ID=FIN-LEDGER-001-MANUAL-JOURNAL-REVERSAL
CURRENT_BRANCH=p2/general-ledger-reversal-20261023
BASE_SHA=8e48c592d06ee8bc35b73cfe89f5f0fd51c33ec2
HEAD_SHA=8e48c592d06ee8bc35b73cfe89f5f0fd51c33ec2
TASK_STATUS=NOT RUN
FILES_CHANGED=none on code branch yet
TESTS_RUN=PR99 Core 39976687601 PASS; PR99 P2 39976687945 PASS on tested tree; current-main Core 39980802016 PASS
TESTS_FAILED_OR_SKIPPED=external customer E2E skipped because dedicated non-production credentials are unavailable; no current production tests
MERGE_STATUS=#99 merged at 8e48c592d06ee8bc35b73cfe89f5f0fd51c33ec2; #92/#98 closed without merge as superseded; #88 open draft; #89 open; #97 open draft
EXTERNAL_BLOCKERS=Onyx live sync/target XLSX import; official WhatsApp Business API request/response; hosted customer-account E2E credentials; production restore proof
LOCKED_PATHS=P1: DeviceManagement.tsx, e2e/device-session-management.spec.ts, scripts/seed-p1-device-session-playwright.mjs and P1 reports; P3: catalog UI paths. P2 owns DB migrations/RPC, database acceptance, types and this central-state file.
NEXT_ACTION=Implement one tenant-scoped reversal RPC for posted manual/adjustment journals only; lock and deduplicate the original, create a balanced mirror draft, require explicit post, add PG17 denial/race/replay tests, wire the existing general-ledger workspace and generated RPC/table types. Never bypass source-specific reversal paths for invoices, payments, cash expenses or purchases.
UPDATED_AT=2026-10-23T18:54:23+03:00

## Evidence boundaries
Allowed statuses remain IMPLEMENTED, INTEGRATED, TESTED_EXACT_SHA, BROWSER_PROVEN, PRODUCTION_PROVEN, CLOSED_WITH_EVIDENCE, BLOCKED_EXTERNAL, NOT RUN. Do not infer current-head pass from previous SHA. Local browser evidence is not hosted-account or production proof.
