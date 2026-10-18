# الحالة التنفيذية الحالية — متجر الأغبري | Nasr1

**المستودع الهدف الوحيد:** https://github.com/Report-Engainall/Nasr1  
**الفرع:** `main`  
**SHA قبل الدفعة الحالية:** `63ab9fc050d165c1a088112979ab7a9fefbb2767`  
**CI على SHA الأساس:** [run 39140257185](https://github.com/Report-Engainall/Nasr1/actions/runs/39140257185) = FAIL في isolated PostgreSQL migration suite بعد نجاح تثبيت Bun واختبارات الوحدة.

## نقطة الاستئناف الوحيدة
- `next_task_id = NASR1-DB-MIGRATION-ORDER-001`
- المهمة الحالية: إصلاح تضارب migration قديم دون حذف مرجع المصدر أو تشغيل بيانات تجريبية في التطبيق.

## السبب الجذري المثبت
- فشل exact-SHA run في `supabase/migrations/20261016074744_001_initial_schema.sql`:
  `PostgresError: column "is_active" does not exist` (`42703`).
- `20261006063522_d656e1d4-1ca3-4cd7-8542-504968bc356c.sql` أنشأ بالفعل `public.products` بعقد `status` (قيمته الافتراضية `active`) وليس `is_active`.
- ملف `20261016074744_001_initial_schema.sql` هو baseline قديم آخر في نهاية تسلسل الهجرات؛ `CREATE TABLE IF NOT EXISTS products` لا يوسّع الجدول القائم، ثم السياسة القديمة تشير إلى `is_active` وتضيف seed products. هذا يخلط مخططين ويخاطر بإدخال بيانات عرض تجريبية.
- نتيجة CI وتفاصيل قاعدة البيانات محفوظة في [run 39140257185](https://github.com/Report-Engainall/Nasr1/actions/runs/39140257185). لم تُجر كتابة إلى قاعدة إنتاج.

## ما تم تنفيذه
- `IMPLEMENTED`: حفظ الملف الأصلي حرفيًا تحت `docs/bolt-source-reconciliation/REFERENCE_ONLY/migrations/20261016074744_001_initial_schema.legacy.sql` للمراجعة؛ بصمة Git blob الأصلية `baf5744a4a7cf3f2d2077460f9c5517318dad2f8`.
- `IMPLEMENTED`: استبدال تنفيذ baseline المتعارض بحاجز SQL يثبت وجود المخطط canonical وعقد `products.status` قبل المتابعة. لا يضيف جداول أو منتجات أو بيانات تشغيلية؛ لا يغير migration order ولا يحذف version path.
- `IMPLEMENTED`: إضافة قرار المصدر والسبب إلى `SOURCE_INTEGRATION_LEDGER.csv`، وتوثيق السبب والخطوة التالية في هذا الملف وسجل التنفيذ.
- `INTEGRATED`: لا يُمنح تكامل وظيفي لهذه المعالجة إلا بعد اجتياز isolated migration suite على SHA الناتج، ثم بقية CI.
- `TESTED`: التعديل الجديد بانتظار نتيجة GitHub Actions الخاصة بـSHA الذي يحتويه؛ لا توجد اختبارات محلية لأن checkout غير متصل.

## حالة الاختبارات
- على SHA الأساس `63ab9fc050d165c1a088112979ab7a9fefbb2767`: frozen Bun lock/install = PASS، unit tests = PASS، database migration suite = FAIL بسبب العمود أعلاه، lint/build/preview/dev smoke = SKIPPED نتيجة التوقف عند فشل قاعدة البيانات.
- على SHA التغيير: `PENDING_REMOTE_CI` إلى أن يظهر run مرتبط بنفس SHA.
- لا يوجد إثبات متصفح، إنتاج، Lovable sync، أو Onyx live ناشئ عن هذه الدفعة.

## التالي
1. اقرأ Actions للـSHA الناتج من هذه الدفعة.
2. أصلح كل أول فشل حقيقي متتالٍ في migration/workflow suite دون تبديل قاعدة الإنتاج أو إدخال بيانات seed وهمية.
3. بعد نجاح migrations، أكمل lint/build/preview/dev route smoke على exact SHA.
4. بعدها استأنف `NASR1-OPS-TASK-CENTER-001`: افحص `ai_tasks` ونموذج الإشعارات الحاليين، ثم وحّد مركز المهام operational واحدًا باستخدام أحداث حقيقية، منع تكرار ثابت، أدوار وصلاحيات خادمية، وطباعة RTL مطابقة للفلاتر. لا تنشئ محركًا ثانيًا.
5. متابعة جرد الأرشيفات وREADY_TO_REUSE تظل مستقلة؛ لا تُدّعى أي عملية تنزيل أو استخراج لم تثبت.

تعريف الحالات: `IMPLEMENTED` تغيير كود؛ `INTEGRATED` ارتباط فعلي بعقود الخدمة/البيانات/الصلاحيات؛ `TESTED` اختبار شُغل ودليله محفوظ؛ `BROWSER-PROVEN` تحقق متصفح؛ `PRODUCTION-PROVEN` تحقق مباشر من الإنتاج.
