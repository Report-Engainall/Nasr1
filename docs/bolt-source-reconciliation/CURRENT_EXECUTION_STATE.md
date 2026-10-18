# الحالة التنفيذية الحالية — متجر الأغبري | Nasr1

آخر تحديث: 2026-10-18
المستودع الهدف الوحيد: https://github.com/Report-Engainall/Nasr1
الفرع: `main`
النطاق: هذا المستودع فقط؛ المستودعات الأخرى مصادر قراءة فقط.

## بداية الدفعة الحية
- SHA قبل الدفعة: `41b8757183db97990f0c1f78f8ea6e45cf7d0201`
- Git tree قبل الدفعة: `41b8757183db97990f0c1f78f8ea6e45cf7d0201`
- GitHub API أكد أن `main` غير محمي وأن صلاحية push متاحة.
- لم يتوفر checkout محلي؛ أوامر `git fetch/status/HEAD` المحلية غير متاحة ولم تُنفذ.
- CI للنسخة الأساسية: [run 38971144752](https://github.com/Report-Engainall/Nasr1/actions/runs/38971144752) = `failure`. سجل الوظيفة `117209539056` يثبت فشل `bun install --frozen-lockfile --dry-run` برسالة اختلاف overrides بين `package.json` و`bun.lock` قبل تشغيل الاختبارات.

## المهمة النشطة
- `last_tested_application_sha = 790afce1aa2a78a4692d6f990599ed99a495515b` — [Actions run 39139420150](https://github.com/Report-Engainall/Nasr1/actions/runs/39139420150) = FAIL عند unit tests.
- `next_task_id = NASR1-MISSING-MODULES-001`
- إصلاح توافق package manager ومدخل التطبيق ثم اجتياز CI على SHA التغيير نفسه.
- السبب الجذري المثبت: manifest وnpm lock يصفان تطبيق React 18 / React Router / Vite 5، في حين أن `bun.lock` و`src/routes` و`src/router.tsx` و`src/start.ts` و`src/server.ts` و`src/test/app-routing.test.tsx` وworkflow تصف تطبيق TanStack Start / React 19 / Vite 8 / Vitest.

## ما تم تنفيذه في هذه الدفعة
- `IMPLEMENTED`: إنشاء package manifest مبني على الاعتماديات الـ57 وdevDependencies الـ24 الموجودة بالفعل في Bun lock، وإضافة scripts المطلوبة للاختبار والبناء وقاعدة البيانات والـlint. لم تتم إضافة اعتماديات جديدة.
- `IMPLEMENTED`: ضبط `vite.config.ts` على wrapper TanStack Start الموجود أصلًا في lock، مع الحفاظ على `src/server.ts` كمدخل خادم.
- `IMPLEMENTED`: مواءمة اسم workspace في Bun lock دون تغيير graph الاعتماديات أو إصداراتها.
- `PRESERVED`: نقل HTML القديم وnpm lock القديم إلى `docs/bolt-source-reconciliation/REFERENCE_ONLY/` بدل ضياع محتواهما؛ ملفات `src/App.tsx` و`src/main.tsx` القديمة لم تُحذف.
- `IMPLEMENTED`: إنشاء سجل الحالة، سجل التنفيذ، سجل قرارات المصادر، وmanifest للأرشيفات.

## نتيجة CI الدقيقة للدفعة السابقة
- على SHA `790afce1aa2a78a4692d6f990599ed99a495515b`: frozen-lockfile verification والتثبيت = PASS؛ unit tests = FAIL، 9 ملفات فاشلة و6 ناجحة و48 اختبارًا ناجحًا ضمن الملفات التي شغلتها Vitest. التفاصيل في [run 39139420150](https://github.com/Report-Engainall/Nasr1/actions/runs/39139420150).
- السبب المثبت: خمس وحدات/مسارات موجودة في `READY_TO_REUSE` وسجل المنشأ لكنها لم تكن في مواضع التشغيل. استعادتها إلى مسارات `src/` قيد التنفيذ.

## الاختبارات والحالة
- baseline: `FAIL` على `41b8757183db97990f0c1f78f8ea6e45cf7d0201`؛ راجع run أعلاه.
- اختبار commit التغيير: `PENDING_REMOTE_CI` حتى ينتهي GitHub Actions على SHA الجديد نفسه. لا يوجد تشغيل اختبار محلي، لذلك لا يُدّعى ذلك.
- `INTEGRATED` غير ممنوحة بناءً على وجود ملفات فقط. تكامل كل شاشة/خدمة/صلاحية واختبارها يحتاج إثباتًا مستقلًا.
- لم يتم إثبات متصفح أو إنتاج أو مزامنة Lovable أو اتصال Onyx في هذه الدفعة.

## الأرشيفات والمصادر
- `ARCHIVE_MANIFEST.csv` يسجل 12 عنصرًا من تقرير intake التاريخي وصفين تاريخيين إضافيين؛ لا يدّعي تنزيل الأرشيفات أو إعادة حساب hashes في هذه الدفعة.
- `ARCHIVE_MEMBERS.csv` يحتوي headers فقط؛ لم يُفك أي أرشيف في هذه الدفعة.
- لم تكتمل مراجعة صفوف `READY_TO_REUSE/PROVENANCE_MANIFEST.csv`; لم يُسجّل أي صف مرجعي غير مراجع كعنصر مكتمل.
- لا تغييرات على قاعدة إنتاج ولا تطبيق migrations إنتاجية.

## المعوّقات
- لا يوجد checkout محلي متصل، فالتعديل والتحقق يتمان عبر GitHub API وActions.
- تنزيل البايتات الثنائية وفكها يحتاج runner مخصصًا/مسارًا مثبتًا؛ العناصر المتاحة تاريخيًا موضحة في manifest، وليست مصنفة كاستخراج.
- لم تتوفر هنا مصادقة مستقلة موثوقة لقاعدة Supabase الإنتاجية؛ لا تستبدل project ref ولا تكتب على الإنتاج.

## الخطوة التالية
1. تحقق من نتيجة Actions على SHA الناتج عن دفعة التهيئة.
2. أصلح أول فشل حقيقي ثم أعد CI على commit جديد حتى يجتاز install/tests/database/lint/build/routes.
3. بعد الاستقرار: `next_task_id = NASR1-OPS-TASK-CENTER-001` — فحص نموذج الأحداث/المهام القائم، ثم ربط مركز مهام بالمصادر الحقيقية والـidempotency والصلاحيات الخادمية، وطباعة RTL حسب المرشحات والدور.
4. واصل مصالحة READY_TO_REUSE والأرشيفات دون تعطيل إصلاحات مستقلة.

تعريف الحالات: `IMPLEMENTED` تغيير كود؛ `INTEGRATED` اتصال فعلي بالخدمات والبيانات والصلاحيات؛ `TESTED` اختبار نُفذ ونتيجته محفوظة؛ `BROWSER-PROVEN` متصفح مباشر؛ `PRODUCTION-PROVEN` تحقق إنتاجي مباشر. لا تستنتج أحدها من الآخر.
