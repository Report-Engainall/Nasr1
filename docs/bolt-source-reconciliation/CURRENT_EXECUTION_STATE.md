# الحالة التنفيذية الحالية الوحيدة — Nasr1 / P2
LAST_RECONCILED_AT=2026-10-23T19:26:00+03:00

## خط الأساس الحي
REPOSITORY=Report-Engainall/Nasr1
MAIN_SHA=c22ba48b2f44f4b752e3f5c5df78f0cc792b0a99
MAIN_TREE=ce3773a9c69ca2ee9acc2daa3fc759753bd4cdd9
MAIN_CORE_CI=PASS — https://github.com/Report-Engainall/Nasr1/actions/runs/39983210712
لا كتابة مباشرة إلى main. جميع تغييرات المتابعة عبر فروع وطلبات سحب.

## حالات مثبتة وحدود الأدلة
- PR #54 مدمج على main؛ merge SHA = afa4840c137d9da853c8486b005adb1ffd5fdd0a. رأس الوظائف المختبر 52ae68f1f14d61d1fb13925a840c330cb70956e1، Core 39905763702 وP2 39905763717 PASS. إثبات التصدير المحلي لا يثبت استيراد Onyx أو المزامنة الحية.
- PR #52 مدمج (c11ea018b81c6e47a9bbbc36d4d7b8f432892f8d). INV-009 CLOSED_WITH_EVIDENCE لعمليات المعاينة/التطبيق/التراجع والتزامن المحلية وحماية البصمة والحجوزات والتدقيق؛ استيراد/مزامنة هدف Onyx BLOCKED_EXTERNAL.
- PR #99 / ORD-001 مدمج عند 8e48c592d06ee8bc35b73cfe89f5f0fd51c33ec2 مع Core 39976687601/P2 39976687945 PASS ومتصفح محلي 120493443382 PASS على شجرة الاختبار عند الدمج. لا تُسقط الدليل التاريخي على SHA مختلف.
- PR #88، واجهة إدارة الجلسات المركزية، مدمج على main الحالي c22ba48b2f44f4b752e3f5c5df78f0cc792b0a99. رأس ميزة P1 المختبر 5021734e2beadef83fe9209aa2611b4399eafd4e؛ Core 39982277415 وP2 39982277637 PASS. اختبار العميل الخارجي/المستضاف كان SKIPPED، وليس PASS.
- OPS-DR-001 CLOSED_WITH_EVIDENCE لتجربة استعادة PostgreSQL 17 المعزولة فقط: run 39969721081/job 120468865117، بصمة النسخة 59d58847641f4a66b76421477f85bd9ae06734baad419f283569d8dff27f9be1، النسخ 394 ms، الاستعادة 1012 ms، الإجمالي 4607 ms، 23 جدولًا/1048 صفًا مع تطابق بصمات القيم الحرجة وحذف قاعدة الاستعادة المؤقتة. لا إثبات إنتاج أو RTO/RPO.
- الطلبات المفتوحة عند المصالحة: #101 (P2، عكس القيود)، #100 (توثيق P2)، #97 (P1 مسودة)، #89 (P3). PR #54 ليس مفتوحًا. يحظر تعديل مسارات P1/P3 المقفلة.

## مؤشر الاستئناف الوحيد
LAST_COMPLETED_TASK_ID=ORD-001
NEXT_TASK_ID=FIN-LEDGER-001-MANUAL-JOURNAL-REVERSAL-ACCEPTANCE
CURRENT_BRANCH=p2/general-ledger-reversal-20261023
BASE_SHA=c22ba48b2f44f4b752e3f5c5df78f0cc792b0a99
HEAD_SHA=4efe9877354936fe4df19c0cfbaa24ec9d43eb4d
TASK_STATUS=IMPLEMENTED; exact-head acceptance pending
FILES_CHANGED=supabase/migrations/20261023200000_accounting_general_journal_reversal.sql; scripts/test-general-ledger-reversal.mjs; scripts/test-database-migrations.mjs; src/integrations/supabase/types.ts; src/components/GeneralJournalReversalAction.tsx; src/components/GeneralLedgerWorkspace.tsx; src/test/general-ledger-statements-ui.test.tsx
TESTS_RUN=Current main Core 39983210712 PASS. PR #101 current-head Core 39986670318 IN_PROGRESS and P2 39986670155 IN_PROGRESS on exact SHA 4efe9877354936fe4df19c0cfbaa24ec9d43eb4d. Prior head 9f2407ca838dfa258257cd8535fd29e97c327c38 had P2 run 39985455240 PASS, but its Core failed in the PostgreSQL 17 fixture setup; neither prior-head result certifies 4efe9877354936fe4df19c0cfbaa24ec9d43eb4d.
TESTS_FAILED_OR_SKIPPED=Previous head 9f2407ca838dfa258257cd8535fd29e97c327c38: Core 39985455274 FAILED because the new acceptance fixture passed journal lines as a plain JSON string and create_general_journal_draft rejected the parameter; corrected to the established postgres.js client.json([...]) contract before this head. Hosted customer E2E 120523368573 was SKIPPED for missing dedicated non-production credentials; not a pass.
MERGE_STATUS=PR #101 OPEN at 4efe9877354936fe4df19c0cfbaa24ec9d43eb4d; fixed JSONB binding committed and new Core/P2 exact-head checks are in progress. No merge until mandatory tests pass and review is complete. PR #100 docs-only branch is being refreshed on its own branch.
EXTERNAL_BLOCKERS=Onyx target import/live sync; official WhatsApp Business API request/response; hosted customer-account E2E credentials; production restore proof.
LOCKED_PATHS=P1: product singleflight PR #97 owned UI/tests/reports; P3: catalog PR #89 owned UI/tests. P2 owns database migrations/RPC, DB acceptance, types, ledger wiring and central state/matrix/log/report/coordination.
NEXT_ACTION=Inspect Core 39986670318 and P2 39986670155 exact-head logs; fix only evidenced failures, rerun on resulting head, then merge PR #101 only after all mandatory checks and review pass.
UPDATED_AT=2026-10-23T19:26:00+03:00

## Evidence rules
Allowed statuses: IMPLEMENTED, INTEGRATED, TESTED_EXACT_SHA, BROWSER_PROVEN, PRODUCTION_PROVEN, CLOSED_WITH_EVIDENCE, BLOCKED_EXTERNAL, NOT RUN. A skipped job is not a pass. Do not generalize tests across SHA. Local browser/DB evidence is not production proof.