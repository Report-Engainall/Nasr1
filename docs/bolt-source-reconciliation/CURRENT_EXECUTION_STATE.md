# الحالة التنفيذية الحالية الوحيدة — Nasr1 / P2
LAST_RECONCILED_AT=2026-10-23T19:12:00+03:00

## خط الأساس الحي
REPOSITORY=Report-Engainall/Nasr1
MAIN_SHA=c22ba48b2f44f4b752e3f5c5df78f0cc792b0a99
MAIN_TREE=ce3773a9c69ca2ee9acc2daa3fc759753bd4cdd9
MAIN_CORE_CI=PASS — https://github.com/Report-Engainall/Nasr1/actions/runs/39983210712
No direct writes to main. All follow-up changes use isolated branches and pull requests.

## الإغلاق المثبت بالأدلة وحدود الإثبات
- ORD-001: PR #99 merged at 8e48c592d06ee8bc35b73cfe89f5f0fd51c33ec2. Tested head 4122ed10b6827c6e0d4b4aeb64c6578ea8cd4d08 and tree 40fcbdf56ddb5a50badc3c4d42e3164bb7ecfb3e matched main at the #99 merge; Core 39976687601/P2 39976687945 PASS, local order+tenant Chromium job 120493443382 PASS. Main later advanced with #88; current-main Core 39983210712 PASS. Hosted customer-account job 120493047623 was SKIPPED.
- Session backend PR #83 merged. Exact tested head dda512495c43f2fd84517635cd83421ef49e92c0; Core 39968857948/P2 39968858140 PASS.
- Customer-manager invitation/auth PR #82 merged at 4437526cebed13717bd71c084df447696b18183a; Core 39974149475/P2 39974149285 PASS and local Chromium tenant/finance masking/audit evidence. #98 closed without merge as superseded; do not reintroduce the older 20261023125000 migration. Current main retains the forward repair 20261023190000_customer_activation_pgcrypto_schema.sql.
- OPS-DR-001: CLOSED_WITH_EVIDENCE for isolated PostgreSQL 17 restore only (run 39969721081/job 120468865117; backup SHA-256 59d58847641f4a66b76421477f85bd9ae06734baad419f283569d8dff27f9be1; backup 394 ms, restore 1012 ms, total 4607 ms; 23 tables/1048 rows; temporary DB removed). No production restore/RTO/RPO claim.
- INV-009: CLOSED_WITH_EVIDENCE for local Onyx preview/apply/rollback, reservation preservation, stale fingerprint binding, concurrency and audit only. Onyx-target import/live sync remains BLOCKED_EXTERNAL.
- #52/#54/#71/#82/#83/#84/#90/#94/#95/#96/#99 are merged. #43/#56 closed without merge; #43 superseded by #94 (comment 6368171463). #98 and old docs checkpoint #92 closed without merge as superseded/stale.
- Central device-session UI/backend integration PR #88 merged at c22ba48b2f44f4b752e3f5c5df78f0cc792b0a99. Head 5114ea8227f570662533219af1dc3a013cd49f75 Core 39981579136 PASS and P2 39981579236 PASS. Local Supabase/Chromium job 120510279957 PASS, including central session authorization and immediate revocation. Hosted customer-auth job 120510010437 SKIPPED; that is not production/external-account proof.
- P1 PR #97 remains open draft at head adba30a07007f0e9d0a923562096a986d96f96d1. P3 PR #89 remains open at head 3c0647339c14ffac685a07272d9bf41cc1d3f59a. Do not edit P1/P3-owned files.
- PR #100 is the serialized docs reconciliation, currently being refreshed on its docs branch after main advanced to c22ba48b2f44f4b752e3f5c5df78f0cc792b0a99.

## Sole resumption pointer
LAST_COMPLETED_TASK_ID=ORD-001
MAIN_SHA=c22ba48b2f44f4b752e3f5c5df78f0cc792b0a99
CURRENT_BRANCH=p2/general-ledger-reversal-20261023
BASE_SHA=8e48c592d06ee8bc35b73cfe89f5f0fd51c33ec2
HEAD_SHA=3087df8f2ca8132dfd08ab102dfbbc219db927a9
PR_BASE_SHA=c22ba48b2f44f4b752e3f5c5df78f0cc792b0a99
TASK_STATUS=IMPLEMENTED
FILES_CHANGED=supabase/migrations/20261023200000_accounting_general_journal_reversal.sql; scripts/test-general-ledger-reversal.mjs; scripts/test-database-migrations.mjs; src/integrations/supabase/types.ts; src/components/GeneralJournalReversalAction.tsx; src/components/GeneralLedgerWorkspace.tsx; src/test/general-ledger-statements-ui.test.tsx
TESTS_RUN=PR101 Core 39984747428 IN_PROGRESS; PR101 P2 39984747357 IN_PROGRESS at checkpoint; exact-head public UI smoke PASS (job 120520903989). Earlier PR88 Core/P2/local Supabase evidence is listed above and does not count as PR101 tests.
TESTS_FAILED_OR_SKIPPED=PR101 hosted customer E2E skipped (job 120520954758) for missing dedicated credentials; database/Core/P2 local Supabase acceptance not yet terminal at this checkpoint.
MERGE_STATUS=PR #101 OPEN at head 3087df8f2ca8132dfd08ab102dfbbc219db927a9; no merge until required Core and PostgreSQL 17/local acceptance finish successfully on final exact head. PR #100 docs-only, checks will rerun after state update.
EXTERNAL_BLOCKERS=Onyx live/target import; official WhatsApp Business API request/response; hosted customer-account E2E credentials; production restore proof.
LOCKED_PATHS=P1 device-session UI/spec/seed and product singleflight PR #97 paths; P3 catalog PR #89 paths. P2 owns migrations/RPCs, DB acceptance, generated types, GeneralLedgerWorkspace finance wiring, and central state/log/matrix/report/coordination.
NEXT_TASK_ID=FIN-LEDGER-001-MANUAL-JOURNAL-REVERSAL-ACCEPTANCE
NEXT_ACTION=Inspect PR101 Core and P2/local PostgreSQL 17 jobs on exact head 3087df8f2ca8132dfd08ab102dfbbc219db927a9; fix only evidence-backed failures, rerun on the final head, then merge only after all mandatory checks pass. Do not record NOT RUN or prior-SHA success as a pass.
UPDATED_AT=2026-10-23T19:12:00+03:00

## Evidence-boundary rules
Allowed task evidence values are IMPLEMENTED, INTEGRATED, TESTED_EXACT_SHA, BROWSER_PROVEN, PRODUCTION_PROVEN, CLOSED_WITH_EVIDENCE, BLOCKED_EXTERNAL, NOT RUN. External credential gates that are skipped are not passes; local browser/database tests do not establish hosted production behavior.
