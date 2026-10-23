# الحالة التنفيذية الحالية الوحيدة — متجر الأغبري | Nasr1
## آخر قراءة مثبتة: 2026-10-23T18:03:00+03:00

هذا هو مؤشر الاستئناف الديناميكي الوحيد. السجلات الأقدم تاريخية ولا تعيد فتح عمل مدمج. لا كتابة مباشرة إلى `main` ولا force-push.

### خط الأساس الحي
- المستودع: `Report-Engainall/Nasr1`.
- `MAIN_SHA=5680bf08a08ed38af830fd2ced58f1eac8bece82`; شجرة main `ff6c23116f1428b00a00fde1d6c2aa04becdf9ee`. يتضمن هذا الرأس PR #83 (عقد الجلسات) و#95 (تقادم الذمم بعد الإشعارات الدائنة) و#96 (إظهار مدخل لوحة التحكم للموظفين فقط).
- PR #83: Core [39968857948](https://github.com/Report-Engainall/Nasr1/actions/runs/39968857948) وP2 [39968858140](https://github.com/Report-Engainall/Nasr1/actions/runs/39968858140) = SUCCESS على SHA `dda512495c43f2fd84517635cd83421ef49e92c0` ذي الشجرة المطابقة لدمج PR83.
- PR #95: Core [39969721081](https://github.com/Report-Engainall/Nasr1/actions/runs/39969721081) وP2 [39969721208](https://github.com/Report-Engainall/Nasr1/actions/runs/39969721208) = SUCCESS على الرأس `f856a6cf284084953cbebfd2718cbf909ce3d17e`؛ شجرته `4436aa...` مطابقة للشجرة التي دخلت main في #95.
- **OPS-DR-001=CLOSED_WITH_EVIDENCE.** Core #39969721081 / job `120468865117`, "Verify isolated PostgreSQL 17 backup and restore" = SUCCESS على tree `4436aa...` المطابق لـmain في #95. Backup SHA-256 `59d58847641f4a66b76421477f85bd9ae06734baad419f283569d8dff27f9be1`; backup 394 ms; restore 1012 ms; total 4607 ms; 23 critical tables / 1048 rows; schema, routines, policies, triggers, row counts and critical data fingerprints matched; temporary restore DB dropped. إثبات بيئة CI المعزولة فقط؛ لا يثبت الإنتاج ولا RTO/RPO.
- لا ادعاء `PRODUCTION_PROVEN`. اختبار UI المخصص لإدارة أجهزة #88 لم يثبت بعد.

### مؤشر الاستئناف الوحيد
`NEXT_TASK_ID=PR82-CUSTOMER-MANAGER-AUTHORIZATION-ACCEPTANCE`

### PR #82 — إصلاح المنفذ والدمج التقدمي؛ CI جديد
- الفرع `feat/p2-customer-manager-e2e-authorization-20261023`.
- `BASE_SHA=5680bf08a08ed38af830fd2ced58f1eac8bece82`.
- `HEAD_SHA=4437526cebed13717bd71c084df447696b18183a`; tree `559802f1adfc4e7984c45e32e868a115e8d66280`. هذا الرأس يتضمن تحديث main الأخير، ومُنع force-push.
- Core [39974149475](https://github.com/Report-Engainall/Nasr1/actions/runs/39974149475) وP2 [39974149285](https://github.com/Report-Engainall/Nasr1/actions/runs/39974149285) كانا QUEUED عند آخر قراءة، وكلاهما مرتبط بـ`4437526...`. لا دمج قبل نجاح الاثنين على SHA نفسه.
- سبب فشل الرأس السابق `dbb554d...` مثبت في log P2 run 39973107081: `e2e/customer-manager-authorization.spec.ts` رفض منفذ PostgreSQL 55432 عند `assertLoopbackOnly`; لم يكن الفشل من صلاحيات المؤسسة. تم إصلاح الحارس لقبول 54322 أو 55432 فقط مع استمرار قصر المضيفين على `localhost/127.0.0.1`، وتستمر API على loopback:54321.
- مهاجرة pgcrypto الأمامية `20261023190000_customer_activation_pgcrypto_schema.sql` تقع بعد `20261023180000_staff_receivables_aging_credit_memo_parity.sql`؛ لم يتم تعديل المهاجرة التاريخية `20261023130000`. المهاجرة الأمامية تعيد تعريف إنشاء/قبول الدعوة عبر امتداد pgcrypto المكتشف ديناميكيًا، وتحافظ على رمز عشوائي 32 بايت وتخزين SHA-256 فقط و`SECURITY DEFINER` و`search_path = ''`.
- التعديل يشمل تعاقد الدعوات واختبار Chromium؛ Core نجح على الرأس السابق، لكن نتيجة P2 الحالية بعد الإصلاح الجديد تنتظر Actions.

### اعتماديات متبقية
- **#88 / P1-DEVICE-SESSION-MGMT-001:** ملكية P1 لواجهة `DeviceManagement.tsx` والـspec والـseed. P2 أدخل استدعاءً مشروطًا للاختبار في workflow. Seed P1 ما زال يطلب DB port 54322 مقابل 55432 في خدمة P2 المعزولة؛ تعليق التوجيه #88 رقم `6367191624` طلب قبول 55432 مع loopback فقط. لا تعدّل ملفات P1 المقفلة ولا تدّعِ BROWSER_PROVEN.
- **INV-009:** PR #52 و#54 مدمجان؛ تحقق من الفجوات غير المغطاة على main بدل تكرار ميزة.
- **ORD-001:** PR #56 مغلق دون دمج؛ يجب التحقق من الوضع الحقيقي للمعاملة على main.
- **#43:** Draft وdirty، لا تدمج 48 ملفًا قديمًا؛ #94 اختبار بديل غير مدمج.
- Onyx live sync/import وWhatsApp Business API الرسمي واستعادة الإنتاج: `BLOCKED_EXTERNAL` أو `NOT RUN` دون اعتماد مخول واستجابة موثقة.

### checkpoint الإلزامي
```
LAST_COMPLETED_TASK_ID=OPS-DR-001
MAIN_SHA=5680bf08a08ed38af830fd2ced58f1eac8bece82
CURRENT_BRANCH=feat/p2-customer-manager-e2e-authorization-20261023
BASE_SHA=5680bf08a08ed38af830fd2ced58f1eac8bece82
HEAD_SHA=4437526cebed13717bd71c084df447696b18183a
TASK_STATUS=OPS-DR-001 CLOSED_WITH_EVIDENCE; PR82 IMPLEMENTED; NEW_CORE_AND_P2_QUEUED
FILES_CHANGED=Customer-manager E2E loopback guard; forward pgcrypto migration; database acceptance and workflow integration
TESTS_RUN=Previous head Core 39973107041 PASS; previous P2 39973107081 FAILED only because database port guard rejected 55432; latest Core 39974149475 and P2 39974149285 queued at checkpoint
TESTS_FAILED_OR_SKIPPED=Previous P2 failure root cause fixed on new SHA; latest runs pending; hosted account E2E not claimed
MERGE_STATUS=PR83, PR95, PR96 merged; PR82 open
EXTERNAL_BLOCKERS=Onyx target import/live sync; official WhatsApp; production restore proof
LOCKED_PATHS=P1 owns DeviceManagement component/spec/seed; P2 owns PR82 workflow/test/migrations
NEXT_TASK_ID=PR82-CUSTOMER-MANAGER-AUTHORIZATION-ACCEPTANCE
NEXT_ACTION=read Core 39974149475 and P2 39974149285 to terminal, fix only any failure on exact SHA, merge after both pass and security diff review
UPDATED_AT=2026-10-23T18:03:00+03:00
```
