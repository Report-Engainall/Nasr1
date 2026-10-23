# تقرير P2 — الحالة الحية 2026-10-23T19:40:00+03:00

REPOSITORY=Report-Engainall/Nasr1
MAIN_SHA=c22ba48b2f44f4b752e3f5c5df78f0cc792b0a99; MAIN_TREE=ce3773a9c69ca2ee9acc2daa3fc759753bd4cdd9; Core run 39983210712=SUCCESS على رأس main الحالي.
PR #54 مدمج عند afa4840c137d9da853c8486b005adb1ffd5fdd0a؛ PR #52 مدمج عند c11ea018b81c6e47a9bbbc36d4d7b8f432892f8d. INV-009 مغلق بالأدلة المحلية فقط؛ مزامنة Onyx الحية BLOCKED_EXTERNAL.
PR #99 / ORD-001 مدمج؛ الأدلة تخص الشجرة المختبرة عند الدمج، وE2E العميل المستضاف كان SKIPPED.
PR #88 مدمج عند main الحالي c22ba48b2f44f4b752e3f5c5df78f0cc792b0a99; رأس الميزة 5021734e2beadef83fe9209aa2611b4399eafd4e اجتاز Core/P2؛ E2E العميل المستضاف SKIPPED.
OPS-DR-001=CLOSED_WITH_EVIDENCE لتجربة PostgreSQL 17 المعزولة فقط (run 39969721081/job 120468865117؛ backup SHA-256 59d58847641f4a66b76421477f85bd9ae06734baad419f283569d8dff27f9be1؛ 394 ms نسخ، 1012 ms استعادة، 4607 ms إجمالي؛ 23 جدولًا/1048 صفًا؛ قاعدة الاستعادة المؤقتة حُذفت). لا إثبات إنتاج أو RTO/RPO.
Open PRs: #101 P2 finance reversal, #100 P2 central docs, #97 P1 draft, #89 P3. مسارات P1/P3 مقفلة.
FIN-LEDGER-001 PR #101 branch p2/general-ledger-reversal-20261023, exact head 695328d97c8078c43bea5859f858b7f99ff43a5b, base c22ba48b2f44f4b752e3f5c5df78f0cc792b0a99. Seven paths changed: supabase/migrations/20261023200000_accounting_general_journal_reversal.sql; scripts/test-general-ledger-reversal.mjs; scripts/test-database-migrations.mjs; src/integrations/supabase/types.ts; src/components/GeneralJournalReversalAction.tsx; src/components/GeneralLedgerWorkspace.tsx; src/test/general-ledger-statements-ui.test.tsx.
TASK_STATUS=TESTED_EXACT_SHA for Core and P2; reviewer pending
TESTS_RUN=Core 39987599300 SUCCESS on exact 695328d97c8078c43bea5859f858b7f99ff43a5b, including PostgreSQL 17 database acceptance. P2 39987599442 SUCCESS on exact 695328d97c8078c43bea5859f858b7f99ff43a5b; public UI smoke and local Supabase/Chromium order/tenant acceptance PASS.
TESTS_FAILED_OR_SKIPPED=Previous exact heads failed in fixture JSONB binding / private-table inspection; fixed and verified on 695328d97c8078c43bea5859f858b7f99ff43a5b. Hosted customer E2E job 120531129147 SKIPPED due missing dedicated credentials; not PASS.
NEXT_TASK_ID=FIN-LEDGER-001-REVIEW-AND-MERGE
NEXT_ACTION=Resolve CodeRabbit review on exact 695328d97c8078c43bea5859f858b7f99ff43a5b; fix only substantiated blockers, rerun on any changed SHA, then merge PR #101 and update post-merge main SHA.
UPDATED_AT=2026-10-23T19:40:00+03:00

## سجل P2 التاريخي (لا يحدد حالة التنفيذ الحالية)
