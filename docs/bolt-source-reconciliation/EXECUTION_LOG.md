# سجل التنفيذ — Nasr1

## 2026-10-18 — NASR1-BOOT-001 — مواءمة البناء مع TanStack Start
- المستودع والفرع: `Report-Engainall/Nasr1` / `main`
- SHA الأساس: `41b8757183db97990f0c1f78f8ea6e45cf7d0201`
- الدليل الأساسي: [CI 38971144752](https://github.com/Report-Engainall/Nasr1/actions/runs/38971144752) أخفق عند `bun install --frozen-lockfile --dry-run` قبل بدء الاختبارات. log يشير إلى عدم تطابق overrides في manifest وlock.
- اكتشف الفحص أن manifest وnpm lock قديمان (React Router/Vite 5)، بينما lock وroutes وtests/workflow تعتمد TanStack Start/Vite 8/Vitest.
- التغييرات: manifest من lock الحالي، scripts موجودة للـCI، Vite config wrapper مع مدخل server، تعديل اسم workspace فقط في lock، نقل root HTML وnpm lock المتعارضين إلى REFERENCE_ONLY مع الاحتفاظ بالمحتوى.
- الاعتماديات: صفر اعتماديات جديدة؛ استخدمت الموجود في Bun lock.
- الاختبار على SHA الجديد: pending GitHub Actions؛ لم يُشغّل شيء من checkout محلي.
- المانع: الأرشيفات الثنائية لم تُنزّل/تُفك في هذا batch؛ حالتها التاريخية موثقة دون ادعاء جديد.
- next_task_id: `NASR1-BOOT-001` حتى اجتياز التثبيت والبناء؛ ثم `NASR1-OPS-TASK-CENTER-001`.


## 2026-10-18 — NASR1-MISSING-MODULES-001 — استعادة وحدات من provenance
- SHA المختبر السابق: `790afce1aa2a78a4692d6f990599ed99a495515b` — [Actions run 39139420150](https://github.com/Report-Engainall/Nasr1/actions/runs/39139420150) = FAIL في unit tests بعد نجاح التثبيت.
- Vitest: 9 test files failed، 6 passed، و48 tests passed ضمن الملفات التي تم تشغيلها.
- أسباب missing imports: `customer-addresses.ts`, `customer-company-members.ts`, `finance-document-pdf.ts`, `unified-import.ts`, و`routes/api.invoice-pdf.$invoiceId.ts`. routeTree كان يشير بالفعل إلى route ملفه مفقود.
- مصدر الملفات الخمسة: `Aghbari-Technologies/aghbari-commerce-evolved@d24695209b45f2352e0ba994e1f5109d7e2afc9d`. تمت مقارنة blob SHAs مع READY_TO_REUSE/PROVENANCE_MANIFEST.csv قبل الإضافة، وتُحفظ النسخ المرجعية دون تعديل.
- اختبار ما بعد الاستعادة: PENDING على SHA التالي؛ لا ادعاء PASS قبل قراءة Actions.
- next_task_id: `NASR1-MISSING-MODULES-001` حتى اختبارات الوحدات والـPDF والمسارات تجتاز.

## 2026-10-18 — NASR1-SUPABASE-CLIENT-001 — استعادة عقد عميل Supabase الصحيح
- SHA الأساس: `2f523b729c6ed28aff06fbeddabd18cd79a25131`; CI المرتبط به: [run 39139802558](https://github.com/Report-Engainall/Nasr1/actions/runs/39139802558) = FAIL عند استيراد عميل Supabase أثناء اختبار route matching.
- الأدلة: frozen Bun lock PASS؛ التثبيت PASS؛ Vitest 14 ملفات PASS وملف واحد FAIL، 133 اختبارًا PASS. الاستثناء `supabaseUrl is required` من العميل القديم في `src/lib/supabase.ts`.
- المصدر: `Aghbari-Technologies/aghbari-commerce-evolved@d24695209b45f2352e0ba994e1f5109d7e2afc9d`, الملف `src/lib/supabase.ts`, source blob `430fd42b111f26e5bd1104c9a19b4350a39de7fb`. الكود يربط بطبقة العميل الموجودة في Nasr1 ويضيف نطاق المؤسسة الذي تتوقعه API، دون أخذ IDs من browser أو إضافة اعتماديات.
- القرار: استبدال العميل القديم الذي لا يطابق عقد التطبيق النشط؛ حفظ قرار المصدر والبصمة في ledger.
- اختبار هذه الدفعة: `PENDING_REMOTE_CI`؛ لم تُشغّل أوامر محلية لأن checkout غير متاح.
- next_task_id يبقى `NASR1-SUPABASE-CLIENT-001` حتى قراءة CI الجديد.

# سجل التنفيذ — Nasr1

## 2026-10-18 — NASR1-DB-MIGRATION-ORDER-001 — تحييد baseline قديم متضارب مع حفظه
- المستودع/الفرع: `Report-Engainall/Nasr1` / `main`
- SHA الأساس: `63ab9fc050d165c1a088112979ab7a9fefbb2767`
- دليل الفشل: [Actions 39140257185](https://github.com/Report-Engainall/Nasr1/actions/runs/39140257185) → `MIGRATION_FAILED 20261016074744_001_initial_schema.sql`; PostgreSQL 17 `42703 column "is_active" does not exist`.
- مقارنة المخطط: `20261006063522_d656e1d4-1ca3-4cd7-8542-504968bc356c.sql` يعرّف `products.status`؛ الـbaseline الأحدث اسمًا يتوقع `products.is_active` ويضيف بيانات seed. `CREATE TABLE IF NOT EXISTS` لم يحدّث الجدول القائم.
- القرار: حفظ كل SQL الأصلي بلا تعديل في `docs/bolt-source-reconciliation/REFERENCE_ONLY/migrations/20261016074744_001_initial_schema.legacy.sql`. إبقاء migration version path، وتحويل جسمه إلى guard يثبت وجود `organizations` و`products` وعقد `products.status` قبل متابعة migrations. يمنع هذا تشغيل schema مزدوج أو seed منتجات ديمو فوق المخطط canonical.
- SQL الأصلي: Git blob `baf5744a4a7cf3f2d2077460f9c5517318dad2f8`, حجم النص `13742` حرفًا.
- اختبار SHA الأساس: dependency freeze/install PASS؛ unit tests PASS؛ DB acceptance FAIL للسبب أعلاه؛ بقية lint/build/smoke SKIPPED.
- اختبار SHA الجديد: PENDING exact-SHA GitHub Actions.
- لا تغييرات بقاعدة إنتاج أو اعتماديات أو secrets.
- next_task_id: `NASR1-DB-MIGRATION-ORDER-001` حتى مرور CI.

## 2026-10-18 — NASR1-LINT-BASELINE-001 — إصلاح ESLint بعد نجاح DB acceptance
- SHA الأساس: `7df4b5a48d52b71933d2c90885b600e61f1caf81`; [Actions 39140570076](https://github.com/Report-Engainall/Nasr1/actions/runs/39140570076).
- النتائج المثبتة: Bun install PASS؛ unit tests PASS؛ isolated PostgreSQL migrations/business acceptance PASS؛ ESLint FAIL (8 errors / 9 warnings)؛ build وpreview/dev smoke لم يبدأا.
- تغييرات المصدر: تجاهل مرجع READY_TO_REUSE وREFERENCE_ONLY من lint فقط؛ إزالة explicit-any من الصفحات القديمة باستخدام أنواع ثابتة أو unknown+error narrowing؛ تثبيت timer holder دون تغيير timeout.
- لا اعتماديات جديدة ولا تعطيل لقواعد lint. الاختبار على SHA الناتج: pending exact-SHA CI.
- next_task_id: `NASR1-LINT-BASELINE-001` حتى اجتياز lint/build/routes.

## 2026-10-18 — NASR1-OPS-TASK-CENTER-001 — مركز المهام فوق ai_tasks الحالية
- SHA الأساس: `36c604e95de1e8accb3225824596c49a1ae9db17`; بوابة الأساس [39140900669](https://github.com/Report-Engainall/Nasr1/actions/runs/39140900669) = SUCCESS في التثبيت، الاختبارات، PostgreSQL acceptance، lint، build وpreview/dev smoke.
- قاعدة البيانات: role lanes/source/due/assignment/resolution/metadata، unique source-event index، triggers للطلبات والمخزون والفواتير وعروض الأسعار والاستيراد، RPC للمصالحة والإنشاء وتغيير الحالة، وسجل audit. لا direct authenticated DML على ai_tasks.
- الواجهة: route `/admin/tasks`، task center RTL، فلترة حسب الدور/الحالة/البحث، مصالحة idempotent للبيانات الموجودة، استلام وإنجاز، وطباعة A4 landscape للنتائج الظاهرة.
- اختبارات قاعدة البيانات المضافة: منع تكرار الحدث، إعادة فتح مهمة نقص المخزون فقط بعد عبور حد المخزون مرة أخرى، RPC مدقق، رفض الكتابة المباشرة، عزل مهام المحاسب عن العميل/الأدوار الأخرى.
- لا checkout محلي؛ exact-SHA GitHub Actions هو بوابة القبول التالية.
- next_task_id: `NASR1-OPS-TASK-CENTER-001` حتى قراءة CI على SHA الجديد؛ لا يُنسب PASS لهذا التغيير مقدمًا.

## 2026-10-18 — إصلاح تابع لـ NASR1-OPS-TASK-CENTER-001
- Commit الميزة: `8842478d9b70fd11437c892bbf9cdcd8d22a1410`; [CI 39142666048](https://github.com/Report-Engainall/Nasr1/actions/runs/39142666048) = FAIL عند Vitest transform: duplicate import/declaration `AiTask` في `src/lib/api.ts`. 97 اختبارات ناجحة، وأربع suites فشلت قبل التنفيذ الفعلي بسبب خطأ الترجمة نفسه.
- الإصلاح: حذف الاستيراد المكرر من القائمة المضافة مع إبقاء import الأصلي، دون تغيير سلوك التنفيذ أو الصلاحيات.
- DB, lint, build, smoke ما زالت pending على SHA الإصلاح التالي.
- next_task_id: `NASR1-OPS-TASK-CENTER-001`.

## 2026-10-18 — إثبات نجاح NASR1-OPS-TASK-CENTER-001
- Code SHA: `283d2def75e2608e0aac1d2d16aabf81e7842347`.
- [GitHub Actions 39142794601](https://github.com/Report-Engainall/Nasr1/actions/runs/39142794601) = SUCCESS.
- Unit tests: 15 test files passed; 165 tests passed.
- PostgreSQL 17: migrations and commerce acceptance PASS. Task-specific proof: `PASS operational task center: source-event idempotency, stock threshold lifecycle, audited RPC writes, accountant-only lane and customer isolation`.
- ESLint PASS; Build PASS; production preview smoke PASS; dev-server smoke PASS.
- Route test includes `/admin/tasks`; migration extends `ai_tasks` and uses audited RPC writes, tenant and role policy, and unique source-event idempotency.
- Next task: `NASR1-TASK-ASSIGNMENT-001` — secure admin-only named assignee selection and role validation in the task UI.

## 2026-10-18 — NASR1-TASK-ASSIGNMENT-001 — اختيار موظف مسند بالاسم
- الأساس: `c3bc527443cd05ab07d16e15c3ae18401e95db0c`; مركز المهام السابق اجتاز [CI 39142794601](https://github.com/Report-Engainall/Nasr1/actions/runs/39142794601).
- Migration جديد `20261018020000_task_assignee_directory.sql`: RPC `list_operational_task_assignees()` يسرد فقط الحسابات النشطة ذات الأدوار من مؤسسة المدير/المسؤول؛ لا يوسع RPC إدارة الأدوار admin-only.
- UI: اختيار الموظف، تصفية المرشحين حسب دور المهمة، وإظهار اسم المسؤول في القائمة والطباعة حين يكون مرئيًا للحساب.
- اختبارات قاعدة البيانات: عزل المؤسسة، منع المحاسب من تعداد الدليل، نجاح إسناد صحيح، ورفض إسناد مهمة مبيعات لمحاسب مالي فقط.
- exact-SHA CI الجديد pending؛ لا PASS قبل قراءته.

## 2026-10-18 — إثبات نجاح NASR1-TASK-ASSIGNMENT-001
- Code SHA: `ae13810429cd4923108da4d840d187ff5590b489`.
- [GitHub Actions 39143265290](https://github.com/Report-Engainall/Nasr1/actions/runs/39143265290) = SUCCESS في جميع المراحل: التثبيت، الوحدات، PostgreSQL 17 acceptance، lint، build، preview smoke وdev smoke.
- هجرة `20261018020000_task_assignee_directory.sql` أضافت `list_operational_task_assignees()`، صالحة للمسؤول/المدير فقط ومحدودة بالمؤسسة الحالية. قائمة الإسناد لا تغير RPC إدارة الأدوار admin-only.
- الواجهة تعرض أسماء الموظفين للمدير/المسؤول فقط وتفلتر المرشحين بتوافق الدور. الخادم يعيد التحقق عند إنشاء المهمة.
- اختبارات DB الإضافية اجتازت: لا مستخدم من مؤسسة أخرى في الدليل؛ المحاسب لا يستطيع تعداد الدليل؛ إسناد صحيح محفوظ؛ إسناد مهمة sales لمستخدم accountant-only مرفوض.
- `next_task_id = NASR1-FINANCE-COLLECTION-AGING-001`.


## 2026-10-18 — NASR1-OPS-TASK-FILTERS-001 — توسيع فلاتر مركز المهام
- الهدف: `Report-Engainall/Nasr1` / `main` فقط.
- Code commit: [6123321e99e35af85359797c9331532c0b9c5c6e](https://github.com/Report-Engainall/Nasr1/commit/6123321e99e35af85359797c9331532c0b9c5c6e).
- الملف المعدل: `src/components/TaskCenter.tsx`.
- التنفيذ: فلاتر الأولوية، الموظف المسؤول/غير المسندة، وفترة تاريخ الإنشاء؛ تُطبّق جميعها على مجموعة `filtered` نفسها التي تستخدمها القائمة والطباعة، مع طباعة وصف المرشحات وعدد النتائج.
- لا اعتماديات جديدة، ولا تغييرات قاعدة بيانات أو بيانات إنتاج.
- تحقق القراءة بعد الحفظ: الملف على `main` يحتوي مرشحات الأولوية والتاريخ والمسؤول؛ هذا يثبت حفظ الكود فقط.
- الاختبارات: **PENDING** — لا يوجد حتى الآن دليل CI مقروء لهذا SHA؛ لا يُسجل TESTED/PASS قبل نتيجة Actions المطابقة.
- next_task_id: `NASR1-OPS-TASK-FILTERS-001-VERIFY-CI`; بعد اجتياز CI انتقل إلى `NASR1-FINANCE-COLLECTION-AGING-001` وافحص عقد الفواتير/الدفعات قبل أي حساب للرصيد.

## 2026-10-18 — NASR1-FINANCE-COLLECTION-AGING-001 — تنفيذ تقرير أعمار الذمم

- الهدف الوحيد: `Report-Engainall/Nasr1` / `main`.
- التنفيذ البرمجي: `supabase/migrations/20261018030000_staff_receivables_aging.sql` يضيف `fetch_staff_receivables_aging(limit, offset)` بصلاحية مالية ومؤسسة مشتقة من الجلسة الخادمية، ويحسب الرصيد من إجمالي الفاتورة ودفعات `customer_payments` المحفوظة، مع استبعاد الفواتير الملغاة، وتجميع مستقل لكل عملة، وفئات 1–30/31–60/61–90/>90 يومًا، وبند منفصل لتاريخ الاستحقاق المفقود، وترقيم صفحات مضبوط.
- دمج الواجهة في `src/components/CustomerWorkflows.tsx`: ملخص حسب العملة وفترات العمر، وتفاصيل فواتير تتضمن الإجمالي والمدفوع والمتبقي والعميل وتاريخ الاستحقاق، مع حالات تحميل/خطأ وإعادة المحاولة.
- قبول قاعدة البيانات: أضيفت في `scripts/test-database-migrations.mjs` تأكيدات لبيانات الاختبار 370000 إجماليًا و100000 مدفوعًا و270000 متبقيًا، والفئات، وملخص العملة، وحدود الصفحة ورفض limit=0، ورفض العميل استدعاء RPC المالية.
- فشل أولي حقيقي: CI [39144533065](https://github.com/Report-Engainall/Nasr1/actions/runs/39144533065) أخفق لأن عمود العميل المفترض `company_name` غير موجود. تمت قراءة تعريف `customers` في `20261006063522_d656e1d4-1ca3-4cd7-8542-504968bc356c.sql` وتصحيح الاستعلام إلى `business_name` و`contact_name`، ولم تُضعّف الاختبارات.
- إثبات النسخة المصححة: commit [437527ff30bc44ce9a1cdf170c89edd5fc5b3104](https://github.com/Report-Engainall/Nasr1/commit/437527ff30bc44ce9a1cdf170c89edd5fc5b3104) — [Actions 39144691226](https://github.com/Report-Engainall/Nasr1/actions/runs/39144691226) **SUCCESS** لجميع المراحل: Bun lock/install، unit tests، PostgreSQL 17 migration/workflow acceptance، lint، build، preview smoke وdev smoke.
- لا اعتماديات جديدة، ولا تعديل لقاعدة الإنتاج. دليل DB في هذا المسار هو PostgreSQL 17 المعزول ضمن CI فقط.
- إضافة طباعة مجانية لكشف أعمار الذمم: [commit 393ca96b73c3b0d642bc5fc9b05681e84c6611d6](https://github.com/Report-Engainall/Nasr1/commit/393ca96b73c3b0d642bc5fc9b05681e84c6611d6) أضاف زر الطباعة، و[commit 6a6a89a0d1d8ed5f228fddcdf3b6c1f3f003a81b](https://github.com/Report-Engainall/Nasr1/commit/6a6a89a0d1d8ed5f228fddcdf3b6c1f3f003a81b) أضاف CSS للطباعة RTL/A4 بإخفاء زر الطباعة، وطباعة الملخص والصفحة التفصيلية المعروضة فقط. نتيجة CI الخاصة بدفعة الطباعة **PENDING** حتى قراءة run مطابق للـSHA الحالي؛ لا يُنقل PASS من `437527f` إليها.
- next_task_id: `NASR1-FINANCE-AGING-PRINT-001-VERIFY-CI`; بعد نجاحه انتقل إلى مراجعة اختبارات ودقة تصدير/طباعة المالية، مع إبقاء ملخص إجمالي الفواتير الكامل منفصلًا عن صفحة التفاصيل المعروضة.
