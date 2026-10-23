# الحالة التنفيذية الحالية الوحيدة — Nasr1 / P2
LAST_RECONCILED_AT=2026-10-23T19:55:00+03:00

## حقيقة Git الحالية
REPOSITORY=Report-Engainall/Nasr1
CURRENT_BRANCH=main (الحالة البرمجية المعتمدة؛ لا كتابة مباشرة على main)
MAIN_SHA=15a3c10fa5f5aa29dc59f2cf732950cddaa0efcb
MAIN_TREE=539b6073bbefacd3d569d667b913748f2466ab67
MAIN_CORE_CI=PASS — https://github.com/Report-Engainall/Nasr1/actions/runs/39990714405 (النتيجة النهائية على SHA main نفسه)
DOCS_UPDATE_PR=100
DOCS_UPDATE_BRANCH=docs/p2-live-reconciliation-20261023
DOCS_BRANCH_HEAD=راجع رأس PR #100 الحي؛ لا تستخدم SHA ذاتيًا محفوظًا داخل هذا الملف
لا force-push أو reset مدمر. تغييرات الحالة هذه تمر عبر PR #100 فقط.

## آخر وحدة مكتملة — FIN-LEDGER-001
TASK_ID=FIN-LEDGER-001-MANUAL-JOURNAL-REVERSAL-ACCEPTANCE
TASK_STATUS=INTEGRATED
PR_URL=https://github.com/Report-Engainall/Nasr1/pull/101
MERGE_SHA=15a3c10fa5f5aa29dc59f2cf732950cddaa0efcb
PR_HEAD_TESTED_SHA=df18dd58a0f0f74a420f55d6e14c0e352af8f7b0
FILES_CHANGED=supabase/migrations/20261023200000_accounting_general_journal_reversal.sql; scripts/test-general-ledger-reversal.mjs; scripts/test-database-migrations.mjs; src/integrations/supabase/types.ts; src/components/GeneralJournalReversalAction.tsx; src/components/GeneralLedgerWorkspace.tsx; src/test/general-ledger-statements-ui.test.tsx
PR_HEAD_CORE=PASS — https://github.com/Report-Engainall/Nasr1/actions/runs/39990033594 on df18dd58a0f0f74a420f55d6e14c0e352af8f7b0
PR_HEAD_P2=PASS — https://github.com/Report-Engainall/Nasr1/actions/runs/39990033892 on df18dd58a0f0f74a420f55d6e14c0e352af8f7b0
MAIN_CORE=TESTED_EXACT_SHA — https://github.com/Report-Engainall/Nasr1/actions/runs/39990714405 on 15a3c10fa5f5aa29dc59f2cf732950cddaa0efcb
MAIN_P2_EXACT_SHA=NOT RUN. The successful pre-merge P2 run above used df18dd58a0f0f74a420f55d6e14c0e352af8f7b0; it is not relabeled as an exact-main-SHA run. Its tested tree was 539b6073bbefacd3d569d667b913748f2466ab67, the same tree on main.
TESTS_FAILED_OR_SKIPPED=Core run 39989568026 failed on SHA a6fb9b407d16e68a1eb7babb1ec698140740644d because the new function delimiter was emitted as AS $ / $;. Corrected in df18dd58a0f0f74a420f55d6e14c0e352af8f7b0; Core and P2 passed after correction. Hosted/customer-credential E2E job 120539173603 was SKIPPED due unavailable dedicated non-production credentials, not PASS.
REVIEW=CodeRabbit’s linked-reversal-draft finding was fixed in a6fb9b407d16e68a1eb7babb1ec698140740644d; the finding’s thread is resolved. The final PR-head migration was re-tested. A maintainer COMMENT review is recorded; no independent human APPROVE is claimed.
EXTERNAL_BOUNDARIES=No production writes, no live Onyx Pro import/sync, no live WhatsApp Business API call, no production restore proof.

## الأعمال التي لا تُعاد
- PR #52 و#54 مدمجان؛ INV-009 مثبت محليًا فقط، وتكامل Onyx الحي BLOCKED_EXTERNAL.
- PR #83 و#88 و#84 و#90 و#99 مدمجة. لا تعاود بناء الجلسات، تعيين customer_manager، انتهاء الدعوة، أو تاريخ انتقال الطلبات ما لم يظهر انحدار جديد موثق.
- OPS-DR-001 مثبت باستعادة PostgreSQL 17 معزولة فقط؛ لا يعني جاهزية استعادة الإنتاج.
- PR #97 (P1) وPR #89 (P3) ما زالا خارج ملكية P2؛ لا تعديل لمساراتهما المقفلة.
- PR #100 هو طلب المصالحة المركزية الحالي.

## مؤشر الاستئناف الوحيد
LAST_COMPLETED_TASK_ID=FIN-LEDGER-001-MANUAL-JOURNAL-REVERSAL-ACCEPTANCE
NEXT_TASK_ID=FIN-INVOICE-001-SUMMARY-PAGINATION-NO-DOUBLE-COUNT
CURRENT_BRANCH=main (الكود؛ يظل أي تغيير جديد عبر PR)
BASE_SHA=15a3c10fa5f5aa29dc59f2cf732950cddaa0efcb
HEAD_SHA=15a3c10fa5f5aa29dc59f2cf732950cddaa0efcb
TASK_STATUS=INTEGRATED; Core TESTED_EXACT_SHA; P2 TESTED_EXACT_SHA on PR head only
NEXT_ACTION=افحص ملكية الملفات والـPRs مرة واحدة، ثم أضف قبول PostgreSQL 17 يثبت أن p_limit/p_offset يحددان مصفوفة entries فقط بينما summary وحسابات accounts مجمّعة من كامل القيود المرحلة بلا اقتطاع أو مضاعفة. استعمل أكثر من قيد مرحّل اصطناعي، وقارن p_limit=1 مع p_limit=50؛ أصلح السبب الجذري إذا كشف الاختبار انحرافًا. لا تفتح محرك دفتر جديدًا ولا تعِد كتابة الحسابات إذا كانت الوظيفة الحالية صحيحة. بعد ذلك اختبر على SHA الفرع نفسه وحدث المؤشر من خلال PR.
UPDATED_AT=2026-10-23T19:55:00+03:00

## Evidence rules
Allowed statuses: IMPLEMENTED, INTEGRATED, TESTED_EXACT_SHA, BROWSER_PROVEN, PRODUCTION_PROVEN, CLOSED_WITH_EVIDENCE, BLOCKED_EXTERNAL, NOT RUN. A skipped job is not a pass. Never transfer a PASS from one SHA to another. Local DB/browser evidence is not production proof.
