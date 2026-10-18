# الحالة التنفيذية الحالية — متجر الأغبري | Nasr1

**المستودع الهدف الوحيد:** https://github.com/Report-Engainall/Nasr1  
**الفرع:** `main`  
**SHA قبل دفعة lint:** `7df4b5a48d52b71933d2c90885b600e61f1caf81`  
**CI:** [run 39140570076](https://github.com/Report-Engainall/Nasr1/actions/runs/39140570076) = FAIL عند ESLint. على هذا الـSHA، Bun install، unit tests وisolated PostgreSQL 17 migration/commerce acceptance اجتازت؛ lint وحده فشل وتخطى build وpreview/dev smoke.

## نقطة الاستئناف الوحيدة
- `next_task_id = NASR1-LINT-BASELINE-001`
- المهمة: قصر lint على كود التطبيق النشط، وإصلاح الأخطاء الصريحة في الصفحات القديمة دون تعطيل قواعد ESLint.

## السبب الجذري المثبت
أخرج lint 8 أخطاء:
- ملف مصدر مرجعي تحت `READY_TO_REUSE` فشل قاعدة `prefer-const`.
- `previewAuthStorage.ts` به timer لا يعاد تعيينه.
- `AdminDashboard.tsx` فيه استعمالان لـ`any`.
- `AdminOrders.tsx`, `LoginPage.tsx`, `RegisterPage.tsx`, و`CartPage.tsx` فيها استعمالات `any`.
التسع تحذيرات الأخرى من Fast Refresh وليست أخطاء قاتلة.

## النتائج المثبتة قبل هذا التغيير
- `NASR1-BOOT-001`: عولج تضارب manifest/lock بالاعتماد على Bun lock القائم؛ لا حزم جديدة.
- `NASR1-MISSING-MODULES-001`: أُعيدت خمس وحدات مرجعية مطلوبة في الشفرة والاختبارات.
- `NASR1-SUPABASE-CLIENT-001`: عميل Supabase أصبح lazy ويتوافق مع عقد tenant-scope الذي تستخدمه API.
- `NASR1-DB-MIGRATION-ORDER-001`: على SHA `7df4b5a48d52b71933d2c90885b600e61f1caf81` وصلت الهجرات إلى `APPLIED 20261016074744_001_initial_schema.sql` و`APPLIED 20261016074758_002_order_code_function.sql` ثم ظهر تأكيد PASS لسير العمل التجاري والعزل والتسعير والمخزون والفواتير والاستيراد وOnyx وAI. الملف القديم المتعارض حفظ حرفيًا في `REFERENCE_ONLY/migrations`، والمسار التنفيذي أصبح schema guard.

## التغيير الجاري
- استبعاد `READY_TO_REUSE/**` و`REFERENCE_ONLY/**` من ESLint لأنها أصول مراجعة وليست كود التطبيق الفعال.
- استعمال `Order` و`CustomerSummary` كأنواع واضحة بدل `any`.
- تحويل أخطاء الدوال إلى `unknown` ثم narrowing عبر `instanceof Error`.
- استبدال متغير timer القابل للتغيير بحامل ثابت.
- لا اعتماديات جديدة؛ لم تتغير قواعد الأمان ولا سلوك المصادقة عمدًا.

## الاختبارات
- SHA الأساس `7df4b5a48d52b71933d2c90885b600e61f1caf81`: Bun lock/install PASS؛ unit tests PASS؛ PostgreSQL migrations/business acceptance PASS؛ ESLint FAIL (8 errors)؛ build/preview/dev smoke SKIPPED.
- SHA الدفعة الجديدة: `PENDING_REMOTE_CI`. لم تتوفر مساحة checkout محلية ولم تُدّعَ اختبارات محلية.
- لا يوجد إثبات متصفح أو إنتاج أو Lovable sync أو Onyx live.

## الخطوة التالية
1. افحص Actions المرتبط بالـSHA الجديد ذاته.
2. أصلح الفشل التالي بالرسالة الفعلية من CI ثم أعد التحقق من build وroute smoke.
3. بعد استقرار CI، ابدأ `NASR1-OPS-TASK-CENTER-001`: وسّع `ai_tasks` القائمة بدل بناء محرك مكرر، مع مصدر حدث حقيقي، idempotency، أدوار وصلاحيات مناسبة، وتصفية وطباعة RTL مطابقة للفلاتر.
4. مراجعة المصادر والأرشيفات مستمرة من السجلات: لم يتم تنزيل/استخراج أي أرشيف جديد في هذه الدفعات.

تعريف الحالات: `IMPLEMENTED` تغيّر الكود؛ `INTEGRATED` ربط الخدمة/البيانات/الصلاحيات؛ `TESTED` اختبار نجح على SHA محدد؛ `BROWSER-PROVEN` تحقق مباشر بالمتصفح؛ `PRODUCTION-PROVEN` تحقق مباشر بالإنتاج.
