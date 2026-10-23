# الحالة التنفيذية الحالية الوحيدة — متجر الأغبري | Nasr1
## قراءة Git الحية — 2026-10-23T17:34:00+03:00

هذا هو مؤشر الاستئناف المركزي الوحيد. أي سجل أقدم أدناه أو في تقارير P2 تاريخي ولا يحدد المهمة التالية. لا كتابة مباشرة إلى `main` ولا force-push.

### خط الأساس المحقق
- المستودع: `Report-Engainall/Nasr1`.
- `MAIN_SHA=bd0d2df489e40b2dc5f83882d90565c7799a448c`.
- شجرة `main` هي `6d881e097101b574d7316a83717c28719310cd28`، وهي مطابقة تمامًا لشجرة رأس #83 المختبَر `dda512495c43f2fd84517635cd83421ef49e92c0`؛ الدمج لم يغيّر ملفات الشجرة بعد الاختبارات.
- PR #83 — `AUTH-CENTRAL-SESSION-BACKEND-P2`: **MERGED** عند `2026-10-23T14:26:18Z`، merge commit `bd0d2df...`. Core [39968857948](https://github.com/Report-Engainall/Nasr1/actions/runs/39968857948) = SUCCESS، وP2 [39968858140](https://github.com/Report-Engainall/Nasr1/actions/runs/39968858140) = SUCCESS، وكلاهما على SHA `dda512495c43f2fd84517635cd83421ef49e92c0` ذي الشجرة المطابقة لـmain.
- عقد الخادم على main يربط هوية التطبيق بجلسة `auth.sessions` حية تطابق `session_id` في JWT، ويقيد قائمة الجلسات والإبطال بالمؤسسة والصلاحية، ويمنع الإبطال الذاتي عبر endpoint المؤسسة، ويسجل العرض والإبطال في التدقيق. `revoke_other_auth_sessions` منفصل ومحدود بحساب المستخدم ويحافظ على جلسته الحالية.
- لا ندّعي حتى الآن `BROWSER_PROVEN` لتكامل واجهة إدارة الأجهزة: #83 اختبر Core ومسارات P2 الموجودة، لكن `e2e/device-session-management.spec.ts` الخاص بـP1 لم يثبت أنه نُفّذ في P2 workflow. ولا ندّعي `PRODUCTION_PROVEN`.

### مؤشر الاستئناف الوحيد
`NEXT_TASK_ID=PR82-CUSTOMER-MANAGER-AUTHORIZATION-ACCEPTANCE`

### المهمة التالية — #82
- PR [#82](https://github.com/Report-Engainall/Nasr1/pull/82) مفتوح؛ الفرع `feat/p2-customer-manager-e2e-authorization-20261023`، الرأس المقروء `8e70899da67d53f0acf221d7e4eeb1a8f2f1b591`.
- Core [39953364100](https://github.com/Report-Engainall/Nasr1/actions/runs/39953364100) = SUCCESS وP2 [39953364029](https://github.com/Report-Engainall/Nasr1/actions/runs/39953364029) = SUCCESS على ذلك الرأس القديم نفسه. هذه نتيجة صحيحة لذلك SHA فقط، وليست قبولًا بعد إدخال #83 إلى main.
- التغيير يحتوي إصلاح pgcrypto الواعي بمخطط الامتداد عبر `20261023125000_customer_activation_pgcrypto_schema.sql`، وتحديث صلاحيات دعوة `customer_manager`. لا تدمجه على نتائج SHA القديم؛ حدّثه دمجًا غير قسري فوق main الحالي، واحفظ تعديلات #83 المدمجة على `scripts/test-database-migrations.mjs` والـworkflow والـfixtures، ثم أعد Core وP2 والقبول في Chromium على الرأس النهائي.
- لا تسمح بتعديل الملفات المشتركة في فرعين في الوقت نفسه. عند تعارض المهاجرات أو fixtures ادمج التغييرات داخل التدفق الحالي؛ لا تنشئ محرك دعوات أو workflow موازيًا.

### المسارات المحورية المفتوحة
- PR [#88](https://github.com/Report-Engainall/Nasr1/pull/88) — واجهة جلسات الأجهزة، ملكية P1، Draft. آخر رأس متحقق `428c98bece43296dbebd9ce30c78cffe48541348`، وقاعدة الفرع السابقة `f7565aefd7af6033d169167d1bebb3dc5cd248ce`; يجب تحديثه إلى main الحالي قبل اعتماد التكامل. اختبار الجلسات المتصفحّي لم يثبت بعد.
- قفل تنفيذ واجهة #88: P1 يملك `src/components/DeviceManagement.tsx` و`e2e/device-session-management.spec.ts` و`scripts/seed-p1-device-session-playwright.mjs`. P2 يملك تغيير workflow لاستدعاء الاختبار. سكربت P1 ما زال يشترط منفذ PostgreSQL المحلي 54322، بينما workflow P2 المعزول يستخدم 55432؛ أُرسل تعليق تنسيقي إلى #88 (comment 6367191624) بطلب دعم 55432 محليًا فقط. لا تُخفف قيد loopback ولا تشغّل اختبارًا متصفحّيًا قبل حل هذا التعارض.
- PR [#95](https://github.com/Report-Engainall/Nasr1/pull/95) — تقادم الذمم بعد الإشعارات الدائنة، مفتوح على الرأس `f856a6cf284084953cbebfd2718cbf909ce3d17e` وقاعدة main `bd0d2df...`. اختبارات الرأس الأقدم نجحت؛ افحص CI للرأس الحالي قبل الدمج.
- PR #43 دور إدارة المؤسسة: OPEN/Draft، قديم و`mergeable_state=dirty`؛ لا تدمج كامل فرعه. PR #94 بديل قبول واجهة محدد الملف لكنه ليس مدمجًا؛ تحقق من رأسه والاختبارات قبل القرار.

### المهمة المالية/التشغيلية المتوازية
- `FIN-INVOICE-001`: حافظ على حساب المتبقي من الفواتير والمدفوعات والإشعارات الدائنة المنشورة فقط. اختبارات الرأس السابق في PR #95 ناجحة، لكن لا تنقلها إلى الرأس `f856a6c...` دون قراءة تشغيلاته.
- `OPS-DR-001`: ما يزال `NOT RUN / NOT PROVEN` كتجربة استعادة معزولة مستوفية للعقد. دمج PR #71 القديم لا يكفي وحده. يلزم PostgreSQL 17 محلي، بصمة SHA-256 للنسخة، مقارنة المخطط والدوال والسياسات والمحفزات والبيانات الحرجة، قياس مدة فعلية وتنظيف الموارد المؤقتة.
- `INV-009`: PR #52 و#54 مدمجان؛ لا تصفه بــOPEN. تحقق فقط من تغطية القبول الحالية على main لمزامنة Onyx (بصمة المصدر، اللقطة القديمة، إعادة الربط، القفل، الحجوزات، rollback والتدقيق) قبل إغلاق المصفوفة.
- Onyx live sync/import وWhatsApp Business API الرسمي وrestore الإنتاجي: `BLOCKED_EXTERNAL` أو `NOT RUN` حتى توفر اعتماد ونتيجة موثقة. التصدير المحلي لا يثبت الاستيراد في Onyx الهدف.
- حافظ على التشغيل الأساسي دون اعتماد مدفوع إلزامي؛ لا أرقام مختلقة ولا أسرار حقيقية في المستودع.

### حقول checkpoint الإلزامية
```
LAST_COMPLETED_TASK_ID=AUTH-CENTRAL-SESSION-BACKEND-P2
MAIN_SHA=bd0d2df489e40b2dc5f83882d90565c7799a448c
CURRENT_BRANCH=docs/p2-current-state-20261023
BASE_SHA=0396b29aeab8c09c430df0063821251208a38477
HEAD_SHA=8e70899da67d53f0acf221d7e4eeb1a8f2f1b591
TASK_STATUS=TESTED_EXACT_SHA (pre-#83 integration); UPDATE_REQUIRED
FILES_CHANGED=PR82 customer activation pgcrypto migration, customer_manager permissions, local Chromium fixtures/spec, shared test/workflow paths
TESTS_RUN=Core 39953364100 PASS on 8e70899; P2 39953364029 PASS on 8e70899
TESTS_FAILED_OR_SKIPPED=latest-main-integrated PR82 Core/P2 NOT RUN; hosted external-account E2E not claimed
MERGE_STATUS=OPEN
EXTERNAL_BLOCKERS=Onyx target import/live sync; official WhatsApp; production restore proof
LOCKED_PATHS=PR82 shared workflow/test harness until rebased; P1-owned DeviceManagement/spec/seed remain locked to P1
NEXT_TASK_ID=PR82-CUSTOMER-MANAGER-AUTHORIZATION-ACCEPTANCE
NEXT_ACTION=sync PR82 with bd0d2df without force; resolve overlap in shared tests/workflow; rerun Core+P2 and actual Chromium invitation acceptance on final SHA
UPDATED_AT=2026-10-23T17:34:00+03:00
```
