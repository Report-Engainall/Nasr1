# الحالة التنفيذية الحالية الوحيدة — Nasr1 / P2
LAST_RECONCILED_AT=2026-10-23T19:40:00+03:00

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
HEAD_SHA=695328d97c8078c43bea5859f858b7f99ff43a5b
TASK_STATUS=IMPLEMENTED; exact-head acceptance pending
FILES_CHANGED=supabase/migrations/20261023200000_accounting_general_journal_reversal.sql; scripts/test-general-ledger-reversal.mjs; scripts/test-database-migrations.mjs; src/integrations/supabase/types.ts; src/components/GeneralJournalReversalAction.tsx; src/components/GeneralLedgerWorkspace.tsx; src/test/general-ledger-statements-ui.test.tsx
TESTS_RUN=Core run 39987599300 PASS and P2 run 39987599442 PASS on exact SHA 695328d97c8078c43bea5859f858b7f99ff43a5b. Core includes isolated PostgreSQL 17 migrations/database acceptance. P2 public UI smoke and local Supabase/Chromium order/tenant acceptance PASS.
TESTS_FAILED_OR_SKIPPED=Prior SHA 9f2407ca838dfa258257cd8535fd29e97c327c38 failed Core due to plain-JSON binding instead of postgres.js client.json; SHA 4efe9877354936fe4df19c0cfbaa24ec9d43eb4d failed during private-table inspection under authenticated role; SHA 7ab35a39420874204ab8e266a52f7c11b143e776 still had three such inspection reads. Current SHA 695328d97c8078c43bea5859f858b7f99ff43a5b passed Core and P2. Hosted customer E2E SKIPPED for lack of dedicated non-production credentials; not a pass.
MERGE_STATUS=PR #101 open at 695328d97c8078c43bea5859f858b7f99ff43a5b; Core and P2 exact-head checks PASS. CodeRabbit review has been triggered and is still in progress. Do not merge until review is resolved and required checks remain green at exact head. PR #100 must re-run checks after this central-state update.
EXTERNAL_BLOCKERS=Onyx target import/live sync; official WhatsApp Business API request/response; hosted customer-account E2E credentials; production restore proof.
LOCKED_PATHS=P1: product singleflight PR #97 owned UI/tests/reports; P3: catalog PR #89 owned UI/tests. P2 owns database migrations/RPC, DB acceptance, types, ledger wiring and central state/matrix/log/report/coordination.
NEXT_ACTION=Read CodeRabbit findings on exact PR #101 head 695328d97c8078c43bea5859f858b7f99ff43a5b; fix only substantive evidence-backed blockers and rerun required checks if the head changes. Then merge eligible PRs and record the post-merge main SHA.
UPDATED_AT=2026-10-23T19:40:00+03:00

## Evidence rules
Allowed statuses: IMPLEMENTED, INTEGRATED, TESTED_EXACT_SHA, BROWSER_PROVEN, PRODUCTION_PROVEN, CLOSED_WITH_EVIDENCE, BLOCKED_EXTERNAL, NOT RUN. A skipped job is not a pass. Do not generalize tests across SHA. Local browser/DB evidence is not production proof.