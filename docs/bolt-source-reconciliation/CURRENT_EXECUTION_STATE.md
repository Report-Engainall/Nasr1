# الحالة التنفيذية الحالية — متجر الأغبري | Nasr1

**المستودع الهدف الوحيد:** https://github.com/Report-Engainall/Nasr1  
**الفرع:** `main`  
**آخر كود مختبر:** `283d2def75e2608e0aac1d2d16aabf81e7842347`  
**بوابة القبول:** [CI run 39142794601](https://github.com/Report-Engainall/Nasr1/actions/runs/39142794601) = **SUCCESS** على هذا الـSHA. كل المراحل المكتملة نجحت: frozen Bun lock/install، 15/15 test files، 165/165 unit tests، isolated PostgreSQL 17 migration/workflow acceptance، ESLint، Build، production preview smoke، وdev-server smoke.

## إنجاز مثبت — NASR1-OPS-TASK-CENTER-001
- تمديد الجدول الموجود `ai_tasks`؛ لم يُنشأ محرك مهام ثانٍ.
- مهام آلية مستندة إلى سجلات محفوظة: الطلبات، انخفاض المخزون، الفواتير المفتوحة/الجزئية، عروض الأسعار المطلوبة، وعمليات الاستيراد ذات الصفوف الفاشلة.
- منع التكرار بمفتاح مصدر فريد؛ إعادة المصالحة تدمج نفس الحدث، وإعادة الفتح تتطلب عودة فعلية لحالة العمل.
- صلاحيات القراءة tenant/role داخل SQL؛ المحاسب يرى lane التحصيل فقط، والعميل لا يستطيع تعداد المهام الداخلية. الكتابة المباشرة إلى `ai_tasks` مقفلة؛ الإنشاء وتغيير الحالة يمران عبر RPC مع سجل تدقيق.
- مسار `/admin/tasks` مسجل في TanStack Router ومغطى باختبار route. واجهة RTL تشمل البحث والفلاتر ومؤشرات المهام، الإنشاء اليدوي للمسؤولين، استلام/إنجاز، وطباعة A4 landscape للنتائج المعروضة.
- اختبار قاعدة البيانات المضاف ظهر في سجل CI: `PASS operational task center: source-event idempotency, stock threshold lifecycle, audited RPC writes, accountant-only lane and customer isolation`.

## نقطة الاستئناف الوحيدة
- `next_task_id = NASR1-TASK-ASSIGNMENT-001`
- استكمال الإسناد إلى موظف محدد بالاسم/الحساب، باستخدام قائمة مستخدمين من RPC إداري مقيد بالمؤسسة؛ عدم قراءة profiles مباشرة أو كشف قائمة الحسابات لغير الإدارة.

## خارج نطاق الإثبات الحالي
- لا يوجد تحقق متصفح تفاعلي مباشر ولا نشر Production جديد؛ CI شغّل preview/dev smoke فقط.
- لا يوجد ادعاء بفك الأرشيفات الثنائية أو إكمال مراجعة كل ملفات READY_TO_REUSE.

تعريف الحالات: `IMPLEMENTED` تغيير كود؛ `TESTED` اختبار ناجح على SHA محدد؛ `INTEGRATED` ربط بالخدمة/البيانات والصلاحيات؛ `BROWSER-PROVEN` تحقق متصفح مباشر؛ `PRODUCTION-PROVEN` تحقق مباشر من الإنتاج.
