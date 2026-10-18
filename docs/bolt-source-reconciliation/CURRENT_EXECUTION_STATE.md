# الحالة التنفيذية الحالية — متجر الأغبري | Nasr1

**المستودع الهدف الوحيد:** https://github.com/Report-Engainall/Nasr1  
**الفرع:** `main`  
**آخر إثبات كامل:** [CI 39142794601](https://github.com/Report-Engainall/Nasr1/actions/runs/39142794601) على `283d2def75e2608e0aac1d2d16aabf81e7842347` = SUCCESS؛ 15 ملفات اختبار و165 اختبارًا اجتازت، ونجاح PostgreSQL 17 acceptance وESLint/build/preview/dev smoke.

## منجز ومختبر
- `NASR1-OPS-TASK-CENTER-001`: مركز واحد فوق `ai_tasks` مع مهام من سجلات محفوظة، idempotency، صلاحيات tenant/role، RPCs مدققة، route `/admin/tasks`، فلاتر RTL وطباعة A4.
- سجل CI: `PASS operational task center: source-event idempotency, stock threshold lifecycle, audited RPC writes, accountant-only lane and customer isolation`.

## الإضافة الحالية — تنتظر CI
- `NASR1-TASK-ASSIGNMENT-001`: إضافة دليل موظفين `list_operational_task_assignees()` مقيد بالمؤسسة ولا يسمح به إلا admin/manager؛ اختيار موظف محدد في إنشاء المهمة وتصفية المرشحين حسب الدور؛ اختبار يمنع رؤية موظف من مؤسسة أخرى، ويمنع المحاسب من تعداد الدليل، ويتحقق من رفض إسناد دور مبيعات إلى مستخدم مالي فقط.
- قاعدة البيانات تظل مرجع صلاحية الإسناد، حتى لو تغيرت الواجهة أو استدعيت RPC مباشرة. إذا فشل تحميل الدليل، يمكن حفظ المهمة غير مسندة بدل الإسناد التخمينـي.

## ما لا يزال غير مثبت
- نتيجة CI للميزة الجديدة حتى تمر الاختبارات والهجرات وlint/build/preview/dev smoke على نفس SHA.
- تحقق متصفح تفاعلي مباشر أو نشر Production جديد.
- فك الأرشيفات الثنائية ومراجعة كل READY_TO_REUSE.

**next_task_id:** `NASR1-TASK-ASSIGNMENT-001` حتى إثبات CI.
