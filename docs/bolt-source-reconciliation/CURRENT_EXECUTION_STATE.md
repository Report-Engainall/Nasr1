# الحالة التنفيذية الحالية — متجر الأغبري | Nasr1

**المستودع الهدف الوحيد:** https://github.com/Report-Engainall/Nasr1  
**الفرع:** `main`  
**SHA قبل هذه الدفعة:** `2f523b729c6ed28aff06fbeddabd18cd79a25131`  
**Git tree قبل هذه الدفعة:** `03fc9c7a488d5d5ebd3cd7d294563a1923909103`  
**آخر CI على SHA الأساس:** [run 39139802558](https://github.com/Report-Engainall/Nasr1/actions/runs/39139802558) = **FAIL عند Unit tests** بعد نجاح frozen-lockfile والتحقق من تثبيت Bun.

## نقطة الاستئناف الوحيدة
- `next_task_id = NASR1-SUPABASE-CLIENT-001`
- المهمة: إزالة تضارب عميل Supabase القديم داخل `src/lib/supabase.ts` ومواءمته مع عميل Lovable Cloud الموجود فعلًا، مع الحفاظ على دوال نطاق المؤسسة التي تعتمد عليها `src/lib/api.ts`.

## السبب الجذري الحالي المثبت
- CI السابق: 14 ملف اختبار اجتاز، وملف واحد فشل؛ 133 اختبارًا نجح. الفشل المحدد: `src/test/app-routing.test.tsx` → `supabaseUrl is required`.
- السبب: `src/lib/supabase.ts` القديم ينشئ عميل Supabase فور الاستيراد من `VITE_SUPABASE_ANON_KEY`، بينما إعداد المشروع الحالي يستخدم `src/integrations/supabase/client.ts` الذي يقرأ `VITE_SUPABASE_PUBLISHABLE_KEY` ويهيّئ العميل عند أول استعمال. كما أن الملف القديم لا يصدّر `getCurrentTenantScope` و`getStorefrontDataScope` اللتين تستوردهما طبقة API.
- الأدلة: [CI 39139802558](https://github.com/Report-Engainall/Nasr1/actions/runs/39139802558)، والملفات الحية `src/lib/supabase.ts`, `src/integrations/supabase/client.ts`, `src/lib/api.ts`.

## نتيجة الدفعات السابقة المثبتة
- `NASR1-BOOT-001`: تمت مواءمة `package.json` مع dependency graph الموجود في `bun.lock` وإعداد TanStack Start. لم تضاف حزم جديدة.
- `NASR1-MISSING-MODULES-001`: أُعيدت الملفات الخمسة التي كانت مفقودة من مسارات التشغيل: `customer-addresses.ts`, `customer-company-members.ts`, `finance-document-pdf.ts`, `unified-import.ts`, و`routes/api.invoice-pdf.$invoiceId.ts`. ثبوت وجود الملفات لا يعدّ اجتيازًا للاختبار؛ نتيجة CI الأخيرة ما زالت FAIL بسبب التهيئة أعلاه.

## تنفيذ الدفعة الحالية
- `IMPLEMENTED_PENDING_CI`: مواءمة `src/lib/supabase.ts` مع عميل Lovable Cloud الحالي، وإضافة تحقق UUID واشتقاق نطاق المؤسسة عبر RPCs الخادمية `get_current_tenant_context` و`get_public_storefront_context` مع cache محدود بمستخدم الجلسة. مصدر الملف وبصمته مدرجان في `SOURCE_INTEGRATION_LEDGER.csv`.
- `TESTED`: لا يُسجّل اختبار ناجح جديد حتى تظهر نتيجة Actions على SHA الناتج عن هذه الدفعة.
- لا توجد كتابة على قاعدة إنتاج، ولا تطبيق migrations، ولا اعتماديات جديدة في هذه الدفعة.
- لا يوجد checkout محلي موصول؛ لم تنفّذ أوامر `git status` أو اختبارات محلية. الاعتماد على GitHub API وActions فقط موثق صراحة.

## مصالحة المصادر والأرشيفات
- `ARCHIVE_MANIFEST.csv` يسجل بيانات intake تاريخية، ولا يدّعي إعادة تنزيل الأرشيفات أو إعادة حساب بصماتها في هذه الجلسة.
- `ARCHIVE_MEMBERS.csv` لا يزال دون أعضاء مستخرجين فعلًا؛ لا يوجد ادعاء فك أرشيف.
- مراجعة كامل `READY_TO_REUSE/PROVENANCE_MANIFEST.csv` ما زالت غير مكتملة، فلا تُصنّف كل المواد كمراجعة.
- حالة Lovable sync والمتصفح والإنتاج وOnyx live لا تزال **غير مثبتة**.

## الخطوة التالية
1. قراءة CI المرتبط بالـSHA الجديد لهذه الدفعة تحديدًا.
2. إصلاح أول فشل حقيقي يظهر بعد تجاوز الاختبارات، ثم تكرار CI حتى يمر اختبار migrations وlint وbuild وroute smoke.
3. بعد استقرار بوابة البناء والاختبار: `NASR1-OPS-TASK-CENTER-001` — ربط مركز المهام بأحداث التشغيل الفعلية مع منع التكرار وصلاحيات خادمية وطباعة RTL مطابقة للفلاتر.
4. واصل المصالحة التأسيسية للأرشيفات دون تعطيل أي إصلاح مستقل.

تعريف الحالات: `IMPLEMENTED` تغيير كود؛ `INTEGRATED` اتصال فعلي بالخدمات والبيانات والصلاحيات؛ `TESTED` اختبار شُغّل ونتيجته محفوظة؛ `BROWSER-PROVEN` تحقق متصفح مباشر؛ `PRODUCTION-PROVEN` تحقق إنتاجي مباشر. لا تُستنتج حالة من الأخرى.
