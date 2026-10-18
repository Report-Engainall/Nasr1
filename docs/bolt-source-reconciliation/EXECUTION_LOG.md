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

## 2026-10-18 — إغلاق بوابة CI لدفعة طباعة أعمار الذمم

- طباعة الواجهة: [Actions 39144916657](https://github.com/Report-Engainall/Nasr1/actions/runs/39144916657) على commit `393ca96b73c3b0d642bc5fc9b05681e84c6611d6` = **SUCCESS**.
- CSS/RTL/A4: [Actions 39144928394](https://github.com/Report-Engainall/Nasr1/actions/runs/39144928394) على commit `6a6a89a0d1d8ed5f228fddcdf3b6c1f3f003a81b` = **SUCCESS**؛ unit tests وPostgreSQL 17 acceptance وlint وbuild وpreview smoke وdev smoke كلها SUCCESS.
- يطبع التقرير المالي الملخص حسب العملة وتفاصيل الصفحة المحمّلة فقط. زر الطباعة مخفي في نسخة الورق، وتطبق قواعد CSS إعداد الطباعة RTL/أبيض وأسود/A4 من المتصفح؛ لم تُضف مكتبة أو خدمة مدفوعة.
- حالة الإثبات: `IMPLEMENTED` و`TESTED` على SHA `6a6a89a0d1d8ed5f228fddcdf3b6c1f3f003a81b`. لا يوجد `BROWSER-PROVEN` أو `PRODUCTION-PROVEN`؛ لا تفترض تشغيل نافذة طباعة فعلية لمجرد نجاح smoke/build.
- بعد هذا الإدخال توجد تحديثات توثيقية أحدث في `main`؛ نتيجة CI الخاصة بأحدث SHA التوثيقي مطلوبة قبل إغلاق جلسة الاستئناف.
- next_task_id: `NASR1-FINANCE-AGING-PRINT-002-TESTS` — أضف اختبار واجهة مستهدفًا للطباعة ضمن بيئة الاختبار القائمة إن أمكن دون إدخال مكتبات جديدة، وأثبت حالات الملخص/الصفحة المعروضة وحدود التقرير المطبوع.

## 2026-10-18 — NASR1-FINANCE-AGING-UI-TEST-001 — اختبار واجهة الطباعة والصلاحيات

- أضيف الملف `src/components/CustomerWorkflows.finance-aging.test.tsx` لاختبار إظهار فاتورة ذات رصيد محسوب من مصدر الاختبار، والتصنيف عند غياب تاريخ الاستحقاق، واستدعاء `window.print`، وعدم تنفيذ RPC المالية لمستخدم بلا دور مالي.
- أول تشغيل على SHA `356c4fcf3ec002fccd3dea5e5c2698465d9b38e4` أخفق في assertion نصي ثابت لترقيم الصفحات؛ run [39145139101](https://github.com/Report-Engainall/Nasr1/actions/runs/39145139101): 15 ملف اختبار ناجح وملف واحد فاشل، بإجمالي 166 اختبارًا ناجحًا وواحدًا فاشلًا. السبب هو اختلاف تنسيق الأرقام بحسب locale العربية، لا فشل شاشة التقرير.
- تم إصلاح المطابقة لتستخدم regex مرنًا في commit [cf2b5893e20b5a9d500249ba215feab5c67b6c21](https://github.com/Report-Engainall/Nasr1/commit/cf2b5893e20b5a9d500249ba215feab5c67b6c21). نتيجة CI لهذا الإصلاح **PENDING** عند كتابة السجل؛ لا يجوز تسجيل نجاح الاختبار قبل قراءة run المطابق.
- لا اعتماديات جديدة. يبقى اختبار نافذة الطباعة الفعلية في متصفح حقيقي غير مثبت.
- next_task_id: `NASR1-FINANCE-AGING-UI-TEST-VERIFY-CI` — اقرأ CI على commit `cf2b5893e20b5a9d500249ba215feab5c67b6c21`؛ أصلح أي فشل فعلي ثم حدّث الحالة والـrequirement registry.

### نتيجة إصلاح اختبار أعمار الذمم — SUCCESS

- الإصلاح: `cf2b5893e20b5a9d500249ba215feab5c67b6c21`، واختبار exact-SHA: [Actions 39145164044](https://github.com/Report-Engainall/Nasr1/actions/runs/39145164044) = **SUCCESS**.
- نجحت جميع المراحل: frozen Bun lock/install، unit tests، PostgreSQL 17 acceptance، lint، build، preview smoke وdev smoke. اختبار الواجهة وتصحيح المطابقة locale-safe اجتازا ضمن هذا التشغيل.
- تبقى حدود الإثبات: نجاح اختبار UI لا يساوي اختبار متصفح تفاعلي لميزة الطباعة ولا إثبات النشر الإنتاجي.
- next_task_id: `NASR1-FINANCE-AGING-PRINT-002-TESTS` — يظل اختبار واجهة التقرير والطباعة موجودًا ومغطى؛ الخطوة التالية فحص مسار PDF المالي/التصدير الحالي وتحديد فجوة واحدة قابلة للإغلاق دون إنشاء نظام موازٍ أو إضافة اعتماديات.

## 2026-10-18 — NASR1-FINANCE-PDF-VALIDATION-001 — رفض المبالغ المالية غير الممكنة

- المراجعة وجدت أن `validatePayload()` في `src/lib/finance-document-pdf.ts` كان يقبل قيمة فاتورة سالبة أو مبلغ دفعة صفريًا/سالبًا، رغم أن عقد قاعدة البيانات يفرض `customer_invoices.total_amount >= 0` و`customer_payments.amount > 0`.
- التنفيذ: رفض إجمالي الفاتورة السالب، ورفض دفعات الحساب الصفريّة أو السالبة قبل إنشاء PDF. لم يتم تغيير احتساب الرصيد أو حدود الخصوصية.
- الاختبارات: `src/lib/finance-document-pdf.test.ts` يضيف تأكيدات رفض إجمالي فاتورة `-1.00` ودفعة `0.00` ودفعة `-0.01`.
- commit التنفيذ [c6f67a8ee45ee6da04a1760d663a32d1cf697b06](https://github.com/Report-Engainall/Nasr1/commit/c6f67a8ee45ee6da04a1760d663a32d1cf697b06); commit الاختبار [4e8e8a70f8d987585e436f1c8e6877dbb9276e58](https://github.com/Report-Engainall/Nasr1/commit/4e8e8a70f8d987585e436f1c8e6877dbb9276e58).
- حالة CI أثناء التحديث: run [39145321118](https://github.com/Report-Engainall/Nasr1/actions/runs/39145321118) للتنفيذ الأساسي، وrun [39145334417](https://github.com/Report-Engainall/Nasr1/actions/runs/39145334417) لنسخة الاختبار؛ كلاهما كان قيد التشغيل عند كتابة هذا السجل. **لا تُسجّل PASS حتى التحقق من النتيجة النهائية للمطابقة الصحيحة.**
- اختبار واجهة أعمار الذمم والطباعة اجتاز: [Actions 39145164044](https://github.com/Report-Engainall/Nasr1/actions/runs/39145164044) على `cf2b5893e20b5a9d500249ba215feab5c67b6c21` = SUCCESS لجميع الخطوات.
- next_task_id: `NASR1-FINANCE-PDF-VALIDATION-VERIFY-CI` — اقرأ نتائج التشغيلين أعلاه، أصلح أي فشل، ثم حدّث سجل المتطلبات ونقطة الاستئناف.

### إغلاق بوابة تشديد تحقق PDF المالي — SUCCESS

- النسخة التي تضم المنطق والاختبارات: [commit `4e8e8a70f8d987585e436f1c8e6877dbb9276e58`](https://github.com/Report-Engainall/Nasr1/commit/4e8e8a70f8d987585e436f1c8e6877dbb9276e58).
- [Actions 39145334417 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39145334417): نجحت unit tests وPostgreSQL 17 acceptance وlint وbuild وpreview smoke وdev smoke.
- النتيجة: الحالات المستحيلة (إجمالي فاتورة سالب، دفعة صفرية أو سالبة) مرفوضة قبل إنشاء كشف الحساب PDF، مع اختبارات رجعية مضافة.
- الحالة: `IMPLEMENTED` + `TESTED` على SHA أعلاه. لا يُدّعى اختبار متصفح أو إنتاج مباشر.
- next_task_id: `NASR1-FINANCE-STATEMENT-OVERDUE-LABEL-001` — مراجعة عرض حالة الفاتورة في PDF مقابل due_at/الرصيد الفعلي، وإضافة اختبار حتمي إن كانت الفجوة مؤكدة.

## 2026-10-18 — NASR1-FINANCE-STATEMENT-OVERDUE-LABEL-001 — تحديث حالة الفاتورة في كشف PDF

- الفجوة المؤكدة: `statusLabel()` في كشف الحساب كان يعتمد على `status` فقط، بينما قيم المخطط الفعلي لا تشمل حالة `overdue`؛ لذلك الفاتورة غير المسددة التي تجاوزت `due_at` قد تظهر «مستحقة» بدل «متأخرة».
- أضيف `resolveCustomerStatementInvoiceStatus()` لتحديد الحالة باستخدام `due_at` مقابل وقت ثابت لتوليد المستند، ورصيد الفاتورة بعد الدفعات؛ يعرض «متأخرة» و«متأخرة جزئيًا» عند ثبوت التأخر، ويحافظ على «مدفوعة» و«ملغاة»، ويعامل التاريخ المفقود/غير الصالح كغير محدد بدل اختلاق تأخر. الكود: [3c1bee5dea79cd055b3ac8d402adfbf7cf904f15](https://github.com/Report-Engainall/Nasr1/commit/3c1bee5dea79cd055b3ac8d402adfbf7cf904f15).
- أضيفت اختبارات حتمية: فاتورة مستحقة ومتأخرة، متأخرة جزئيًا، استحقاق مستقبلي، تاريخ مفقود، مدفوعة بحسب حالة المصدر، مدفوعة بحسب الرصيد المسدد، وملغاة. [Commit الاختبار 9b10d34b4b61c92871b8cc6d3874909d34f79e0a](https://github.com/Report-Engainall/Nasr1/commit/9b10d34b4b61c92871b8cc6d3874909d34f79e0a).
- فشل CI كشف اعتماد الفاتورة PDF الفردية على دالة `statusLabel()` نفسها التي استبدلناها لكشف الحساب؛ run [39145577858](https://github.com/Report-Engainall/Nasr1/actions/runs/39145577858) فشل اختبارين من هذه العلة المحددة، وrun [39145591658](https://github.com/Report-Engainall/Nasr1/actions/runs/39145591658) يماثل SHA الاختبارات. تمت المعالجة بإعادة دالة المصدر-status المستقلة للفاتورة الفردية مع إبقاء دالة الحساب مشتقة من الدفعات/الاستحقاق: [fix commit ba9523fdbe643d7a6503dce54f6d1b740f3f06ca](https://github.com/Report-Engainall/Nasr1/commit/ba9523fdbe643d7a6503dce54f6d1b740f3f06ca).
- نتيجة CI لإصلاح `ba9523f` كانت **PENDING** عند كتابة هذا الإدخال؛ run المطابق [39145659217](https://github.com/Report-Engainall/Nasr1/actions/runs/39145659217). لا تُسجل نجاحًا قبل قراءة النتيجة النهائية.
- فشل منفصل في run [39145507514](https://github.com/Report-Engainall/Nasr1/actions/runs/39145507514) توقف عند تنزيل Bun بسبب `Unexpected HTTP response: 403`، دون تشغيل الاختبارات. كان ذلك عطل تنزيل خارجي عابرًا؛ تنزيل Bun نجح لاحقًا في [39145577858](https://github.com/Report-Engainall/Nasr1/actions/runs/39145577858)، وسبب فشله كان اختبار التطبيق المذكور أعلاه لا Bun.

## سجل الفحوص المكتملة — لا تُعد من البداية

هذه الموضوعات مكتملة في هذه الجلسة بأدلة SHA/Actions؛ لا تُكرر فحصها في الانطلاقة التالية إلا إذا تغيّر الكود المعني أو أظهر CI فشلًا جديدًا:

- مركز المهام، مولد الأحداث/منع التكرار، صلاحيات المؤسسة/الدور، ودليل الإسناد: [39143265290 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39143265290).
- فلاتر الأولوية والمسؤول والتاريخ التي تطابق القائمة والطباعة: [39144118407 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144118407).
- تقرير أعمار الذمم من الفواتير/الدفعات، فصل العملات، الفئات والترقيم والتفويض: [39144691226 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144691226).
- طباعة التقرير RTL/A4، ثم اختبار واجهته ومنع الدور غير المالي: [39144916657 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144916657)، [39144928394 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144928394)، [39145164044 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39145164044).
- رفض إجمالي فاتورة PDF السالب والدفعة الصفرية/السالبة: [39145334417 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39145334417).
- قاعدة العمل الدائمة «إنجاز برمجي/اختباري حقيقي في كل انطلاقة» في `AGENTS.md`: [39144280302 SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39144280302).

- next_task_id: `NASR1-FINANCE-STATEMENT-OVERDUE-LABEL-VERIFY-CI` — اقرأ run `39145659217` فقط لهذا التغيير. إذا نجح، حدّث نقطة الاستئناف وسجل المتطلبات ثم انتقل إلى فجوة جديدة دون إعادة الفحوص المكتملة أعلاه.

### إغلاق تنفيذ وسم التأخر في كشف الحساب PDF — SUCCESS

- SHA المختبر: [commit `ba9523fdbe643d7a6503dce54f6d1b740f3f06ca`](https://github.com/Report-Engainall/Nasr1/commit/ba9523fdbe643d7a6503dce54f6d1b740f3f06ca).
- [Actions 39145659217 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39145659217): frozen Bun lock/install، unit tests، PostgreSQL 17 acceptance، lint، build، production-preview smoke، وdev-server smoke جميعها نجحت.
- الاختبارات الجديدة لاختلاف الحالة حسب تاريخ الاستحقاق والمدفوعات اجتازت؛ كما نجحت اختبارات PDF الفاتورة الفردية بعد إعادة فصل `statusLabel()` الخاص بها عن `resolveCustomerStatementInvoiceStatus()` الخاص بكشف الحساب.
- المحاولات التي فشلت في `39145577858` و`39145591658` انتهت بمعالجة مرجعية: `statusLabel is not defined` لأن محرر كشف الحساب أزال دالة كانت تستخدمها الفاتورة الفردية. `ba9523f` يعيد تلك الدالة بشكل مستقل؛ لا حاجة لإعادة تحليل هذا السبب.
- الحالة النهائية: `IMPLEMENTED` + `TESTED` على SHA أعلاه. لا `BROWSER-PROVEN` ولا `PRODUCTION-PROVEN`.
- next_task_id: `NASR1-FINANCE-STATEMENT-DUE-DATE-DISPLAY-001` — اجعل تاريخ الاستحقاق ظاهرًا في كشف PDF بجوار تاريخ الإصدار، مع اختبار pagination وتنسيق RTL، دون تغيير مصادر الأرصدة أو صلاحياتها.

## تعليمات عدم تكرار العمل المكتمل

- نقطة التوقف لا تعني الرجوع لجرد المشروع أو مراجعة مكونات سبق اختبارها. ابدأ من `CURRENT_EXECUTION_STATE.md`، اقرأ فقط حالة SHA الحالي ونتيجة البوابة ذات الصلة بالدفعة النشطة، ثم نفّذ `NASR1-FINANCE-STATEMENT-DUE-DATE-DISPLAY-001` مباشرة.
- لا تعِد فحص مركز المهام، دليل إسناد الموظفين، فلاتر المهام، تقرير أعمار الذمم، طباعة تقرير الأعمار، أو التحقق من المبالغ السالبة في PDF؛ نتائجها وSHAs وروابط CI موثقة في هذا السجل أعلاه. أعد تلك الاختبارات فقط إذا تغير الكود المعني أو كشف CI عن regression.

## 2026-10-18 — NASR1-FINANCE-STATEMENT-DUE-DATE-DISPLAY-001 — إظهار الاستحقاق واختبار الترقيم

- تغيّر `src/lib/finance-document-pdf.ts` لإظهار تاريخ الإصدار وتاريخ الاستحقاق معًا في كشف الحساب PDF، على سطرين داخل عمود التاريخ نفسه لمنع تداخل الأعمدة بعد زيادة ارتفاع الصف. التاريخ المفقود أو غير الصالح يبقى `—` ولا يستنتج النظام تاريخًا بديلًا.
- أضيف `formatFinanceDocumentDate()` واختبار حتمي للمدخل الصحيح و`null` و`undefined` والتاريخ غير الصالح.
- أضيف اختبار قبول لتوليد كشف من 45 فاتورة بتاريخ استحقاق حقيقي أو مفقود، والتحقق من أن PDF ينشئ أكثر من صفحة ولا يرفض المستند. الاختبار: `src/lib/finance-document-pdf.test.ts`.
- الكود: [commit `a8e838fe64a0f90530d58cf165fe8b8e56e0e4e7`](https://github.com/Report-Engainall/Nasr1/commit/a8e838fe64a0f90530d58cf165fe8b8e56e0e4e7). اختبارات التنسيق والترقيم: [commit `84e0f424351bd22a9f5fc468852a8fe07b5596a2`](https://github.com/Report-Engainall/Nasr1/commit/84e0f424351bd22a9f5fc468852a8fe07b5596a2).
- [Exact-SHA Actions 39146074209 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39146074209): Bun lock/install، unit tests، PostgreSQL 17 acceptance، lint، build، preview smoke، dev smoke، والتنظيف النهائي كلها نجحت.
- فحص الفاتورة PDF الفردية أثناء تحديد النطاق أثبت أن تاريخ الإصدار والاستحقاق موجودان أصلًا هناك (`buildCustomerInvoicePdf`) ويستعملان المنسق نفسه. هذه المراجعة اكتملت ولا تحتاج إعادة فحص ما دام ذلك المسار لم يتغير.
- الحالة: `IMPLEMENTED` + `TESTED` على SHA `84e0f424351bd22a9f5fc468852a8fe07b5596a2`. لا يوجد ادعاء باختبار متصفح فعلي أو إثبات نشر إنتاجي.
- next_task_id: `NASR1-FINANCE-STATEMENT-AGING-SUMMARY-001` — أضف ملخصًا واضحًا للمبالغ المتأخرة داخل إجمالي الذمم حسب كل عملة في كشف الحساب، محسوبًا من due_at والدفعات، واختبر الحساب مع العملات المختلطة والفواتير الملغاة وتاريخ استحقاق مفقود.

## إغلاق مراجعة تاريخ الفاتورة الفردية — لا تُكرر

- ثبت أن `buildCustomerInvoicePdf()` يعرض بالفعل تاريخ الإصدار وتاريخ الاستحقاق في رأس الفاتورة. لا تضف عمودًا مكررًا ولا تعِد هذه المراجعة في الانطلاقة التالية إلا بعد تغيير ذلك المسار. مرجع الكود الحالي: `src/lib/finance-document-pdf.ts` على SHA `cb52fa3b7c94dc88455f98aa25617844f8c76f2e` قبل دفعة الاختبار الأخيرة؛ أحدث CI ناجح `39146074209` يشمل التغييرين.

## قاعدة الاستئناف

ابدأ دائمًا من `CURRENT_EXECUTION_STATE.md`، واعمل على `next_task_id` فقط. القائمة أعلاه توثيق نهائي للفحوص المكتملة؛ لا تُعد التحليل أو الفحص أو الاختبار السابق إلا إذا تغير الكود المعني أو أظهر CI عن خطأ جديد.


## 2026-10-18 — NASR1-CURRENT-IMPLEMENTATION-SNAPSHOT-001 — نسخ أحدث كود إلى مجلد المصالحة

- الطلب: حفظ أحدث الأكواد الفعلية المختبرة في المجلد التجميعي لتسريع التنفيذ التالي، دون خلط ملفات المصدر القديمة مع كود Nasr1 أو إعادة فحص الأعمال المغلقة.
- المجلد الجديد: `docs/bolt-source-reconciliation/READY_TO_REUSE/Nasr1--verified-current-implementation/`.
- أضيفت 9 نسخ مطابقة للمسارات الحالية: `src/components/TaskCenter.tsx`، `src/components/CustomerWorkflows.tsx`، `src/components/CustomerWorkflows.finance-aging.test.tsx`، `src/lib/finance-document-pdf.ts`، `src/lib/finance-document-pdf.test.ts`، `src/styles.css`، `supabase/migrations/20261018030000_staff_receivables_aging.sql`، `scripts/test-database-migrations.mjs`، `AGENTS.md`.
- لكل ملف: المصدر المباشر على `main` قورن بالملف نفسه في commit الكود المختبر `84e0f424351bd22a9f5fc468852a8fe07b5596a2`; تطابقت بصمات Git blob، ثم أُنشئت نسخة Git blob أخرى بنفس SHA. التفاصيل في `CURRENT_NASR1_IMPLEMENTED_FILES.csv`.
- إصدار المرآة الأول اجتاز [Actions 39146625789 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39146625789).
- المرآة الحالية تحدث إلى مصدر الكود `f830678ea99f4bb2318305a5f2e70ee761dbea1e` بعد ملخص أعمار الذمم؛ مصدر الكود اجتاز [Actions 39147039166 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39147039166). CI للcommit التوثيقي/المرآة الحالية ما يزال PENDING عند كتابة الحالة.
- `READY_TO_REUSE/PROVENANCE_MANIFEST.csv` الأصلي لم يُعدّل، وهو لا يزال خاصًا بالمصادر المانحة. أضيف شرح منفصل إلى README لتحديد الفرق.
- تم تحديث `CURRENT_EXECUTION_STATE.md` وملف المتطلبات مع توثيق عدم تكرار العمل المكتمل.
- `next_task_id = NASR1-CURRENT-IMPLEMENTATION-SNAPSHOT-VERIFY-CI`.


## 2026-10-18 — NASR1-FINANCE-STATEMENT-AGING-SUMMARY-001 — ملخص المتأخر حسب العملة داخل PDF

- التنفيذ: `src/lib/finance-document-pdf.ts` يضيف `buildCustomerStatementCurrencySummary()` لحساب الإجمالي والمدفوع والمتبقي والمتأخر والرصيد الذي لا يملك تاريخ استحقاق صالحًا لكل عملة.
- المنطق يستخدم bigint بوحدات النقد الصغرى ووقت إصدار التقرير الثابت؛ يستبعد الفواتير الملغاة والمدفوعة بالكامل من المتأخر، ولا يصنف الاستحقاق المستقبلي على أنه متأخر.
- `src/lib/finance-document-pdf.test.ts` يختبر YER/USD/EUR والدفعات الجزئية والكاملة وفاتورة ملغاة ومدفوعاتها وموعدًا مستقبليًا وموعدًا مفقودًا. التشغيل الأول [39147011014](https://github.com/Report-Engainall/Nasr1/actions/runs/39147011014) أخفق في التوقع العددي للاختبار فقط؛ تم التصحيح وفق Vitest إلى YER مدفوع 8000 ومتَبقٍ 11000 minor units في commit [`f830678ea99f4bb2318305a5f2e70ee761dbea1e`](https://github.com/Report-Engainall/Nasr1/commit/f830678ea99f4bb2318305a5f2e70ee761dbea1e).
- [Exact-SHA CI 39147039166 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39147039166): unit tests وPostgreSQL 17 acceptance وlint وbuild وpreview/dev smoke جميعها اجتازت.
- المرآة `docs/bolt-source-reconciliation/READY_TO_REUSE/Nasr1--verified-current-implementation/` تُحدّث في نفس دفعة التوثيق مع manifest منفصل عن provenance المشاريع المانحة.
- الحالة: `IMPLEMENTED` + `TESTED` على SHA `f830678ea99f4bb2318305a5f2e70ee761dbea1e`. لا يثبت هذا اختبار متصفح أو نشرًا إنتاجيًا.
- next_task_id: `NASR1-CURRENT-IMPLEMENTATION-SNAPSHOT-VERIFY-CI` ثم `NASR1-FINANCE-STATEMENT-AGING-SUMMARY-RECONCILE`.


### إغلاق تحديث مرآة الكود الحالية — SUCCESS

- Commit المرآة والوثائق: [`1039b9424be66ea4feabb003096c3bfd3fff5319`](https://github.com/Report-Engainall/Nasr1/commit/1039b9424be66ea4feabb003096c3bfd3fff5319).
- [Actions 39147434273 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39147434273): Bun lock/install، unit tests، PostgreSQL 17 acceptance، lint، build، preview smoke وdev smoke كلها ناجحة.
- Readback للمجلد: manifest يحمل 9 صفوف، كل صف `git_blob_identical=YES`; `src/lib/finance-document-pdf.ts` و`.test.ts` داخل المرآة لهما بصمتا المصدر الأحدث `66ed7294...` و`07d3fc96...`. `PROVENANCE_MANIFEST.csv` الخاص بالمانحين لم يُعدّل.
- تم إغلاق `NASR1-CURRENT-IMPLEMENTATION-SNAPSHOT-VERIFY-CI`; next task هو `NASR1-FINANCE-STATEMENT-AGING-SUMMARY-RECONCILE`.


## 2026-10-18 — NASR1-CUSTOMER-STATEMENT-FULL-AGING-SUMMARY-001 — مجاميع كاملة خادمية لكشف العميل

- الفجوة: `get_customer_account_statement()` كان يعيد حتى 200 فاتورة و500 دفعة، وكان PDF يحسب أعمار الذمم من السجلات العائدة فقط؛ هذا قد يقلل المدفوع أو الرصيد المتأخر في عميل كثير الحركات.
- migration جديدة `supabase/migrations/20261018040000_customer_statement_full_aging_summary.sql` تستبدل جسم الـRPC الحالي نفسه (ليس RPC موازٍ)، وتضيف `summary_as_of_utc` و`summary` حسب العملة من كل الفواتير والمدفوعات للمؤسسة/العميل المصدق عليه. تبقى قوائم التفاصيل محدودة بـ200/500.
- تُضاف إلى كل فاتورة في التفاصيل قيم `paid_amount` و`outstanding_amount` من دفترها الكامل، لتظل صفوف الفاتورة صحيحة حتى لو كانت بعض المدفوعات أقدم من أحدث 500 دفعة المعروضة.
- `src/lib/finance-document-pdf.ts` يفضّل الملخص الخادمي إذا وُجد ويطابق cut-off الخادمي عند حساب حالة التأخر، ويتحقق من مبالغ وقيم الملخص وازدواج العملات وبقاء بنود التأخر داخل المتبقي باستخدام bigint. إذا لم يكن الملخص موجودًا في نسخة backend أقدم، يحتفظ بfallback واضح أنه للسجلات المعادة فقط.
- `src/lib/finance-document-pdf.test.ts` يختبر دقة bigint للأرقام الكبيرة، المجاميع ذات العملة المتعددة، المدخل الخادمي الموثوق والـfallback، والبيانات غير الصحيحة.
- `scripts/test-database-migrations.mjs` يتحقق من summary cutoff ومجاميع الفاتورة/الدفع/المتبقي والـbuckets وعزل ملخص العميل عن العميل الآخر، بالإضافة إلى الحقول لكل فاتورة.
- عالجنا أخطاء اختبار حقيقية خلال التنفيذ: [39148570829](https://github.com/Report-Engainall/Nasr1/actions/runs/39148570829) و[39148691924](https://github.com/Report-Engainall/Nasr1/actions/runs/39148691924) كشفتا أخطاء تثبيت assertion/توقع bigint وإعادة تطبيع الملخص. لم تُخفف الاختبارات. الإصلاح النهائي [`98a80df80b366e811923b80d53fe06a519e754d0`](https://github.com/Report-Engainall/Nasr1/commit/98a80df80b366e811923b80d53fe06a519e754d0) اجتاز [Actions 39148856503 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39148856503) بجميع المراحل.
- الحالة: `IMPLEMENTED + TESTED` على `98a80df80b366e811923b80d53fe06a519e754d0`. لا يوجد ادعاء بتطبيق migration في قاعدة الإنتاج أو اختبار متصفح مباشر.
- المرآة `docs/bolt-source-reconciliation/READY_TO_REUSE/Nasr1--verified-current-implementation/` تُزامن إلى نفس الكود المختبر؛ donor `PROVENANCE_MANIFEST.csv` يبقى دون تغيير.
- next_task_id: `NASR1-CUSTOMER-STATEMENT-SUMMARY-SNAPSHOT-VERIFY-CI` ثم `NASR1-CUSTOMER-STATEMENT-SUMMARY-CAP-BOUNDARY-001`.


## 2026-10-18 — إغلاق مرآة الكود بعد ملخص دفتر العميل الكامل

- commit المرآة/الوثائق: [`cbbcce4b1db64530f8234e82523e2b2aebbe6f53`](https://github.com/Report-Engainall/Nasr1/commit/cbbcce4b1db64530f8234e82523e2b2aebbe6f53).
- [Actions 39149188875 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39149188875): unit tests، PostgreSQL 17 acceptance، lint، build، preview smoke وdev smoke اجتازت.
- readback للمجلد `READY_TO_REUSE/Nasr1--verified-current-implementation`: manifest يحتوي 10 صفوف، وكلها موسومة `git_blob_identical=YES`؛ تم التحقق من مرآة `src/lib/finance-document-pdf.ts` على blob `8729c401397a4c9000ab8714bfeb0a193f1dc2ab` وmigration ملخص الدفتر الكامل على blob `2734f6d88ba85d9556d7bbee5d142dce5c7556d9`. `PROVENANCE_MANIFEST.csv` للمانحين لم يُعدّل.
- تم إغلاق `NASR1-CUSTOMER-STATEMENT-SUMMARY-SNAPSHOT-VERIFY-CI`. لا تُعد مزامنة أو تدقيق المجلد في الانطلاقة التالية ما لم يتغير أحد الملفات أو يفشل CI.
- next_task_id: `NASR1-CUSTOMER-STATEMENT-SUMMARY-CAP-BOUNDARY-001` — إثبات حدود التفاصيل 200/500 مع بقاء الملخص كاملًا.


## 2026-10-18 — NASR1-CUSTOMER-STATEMENT-VOID-EXCLUSION-001 — إغلاق اختبار الحدّ 200/500 مع فاتورة ملغاة

- تحديث اختبار القبول في `scripts/test-database-migrations.mjs`: أنشأ 205 فواتير و505 دفعات، كما أضاف فاتورة ملغاة بقيمة 900.00 ودفعة 500.00، ثم قارن ملخص العميل الكامل قبل/بعد fixture باستخدام `BigInt` في الوحدات النقدية الصغرى.
- أثبت الاختبار أن تفاصيل RPC لا تتجاوز 200 فاتورة و500 دفعة؛ الفواتير/الدفعات الخارجـة عن قوائم التفاصيل لا تضيع من الملخص الكامل؛ الفاتورة الملغاة ومدفوعاتها لا تدخل الإجمالي أو المدفوع أو المتبقي أو المتأخر؛ ورصيد الفاتورة المعروضة يحسب الدفعات الـ505 كلها.
- سبب إخفاق سابق: تعبير regex للمال كان مفرط الهروب، ثم assertions طرحت مبالغ عبر JavaScript `Number`. أصلحنا regex واستخدمنا `BigInt`; الاختبارات لم تُخفف.
- الكود [`618e3d3c019ecd7d05ca0462ca954f908178b814`](https://github.com/Report-Engainall/Nasr1/commit/618e3d3c019ecd7d05ca0462ca954f908178b814) اجتاز [Actions 39150380395 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39150380395): unit tests، PostgreSQL 17 acceptance، lint، build، preview smoke وdev smoke.
- تحديث مرآة `READY_TO_REUSE` والـmanifest قيد الإضافة في commit منفصل؛ CI الخاص بالمرآة مطلوب قبل إغلاق مزامنتها.
- next_task_id: `NASR1-CUSTOMER-STATEMENT-SUMMARY-SNAPSHOT-VERIFY-CI`.


## إغلاق مزامنة مرآة أحدث كود — SUCCESS
- كود الاختبار [`618e3d3c019ecd7d05ca0462ca954f908178b814`](https://github.com/Report-Engainall/Nasr1/commit/618e3d3c019ecd7d05ca0462ca954f908178b814) اجتاز [Actions 39150380395 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39150380395): اختبار 205 فواتير و505 دفعات، استبعاد الفاتورة الملغاة ومدفوعاتها، مجاميع دقيقة بـBigInt، وحدود التفاصيل، وجميع مراحل CI.
- تمت مزامنة نسخة `scripts/test-database-migrations.mjs` إلى `READY_TO_REUSE/Nasr1--verified-current-implementation/` مع manifest من 10 ملفات؛ blob المصدر والنسخة `08193e20f311e82d87a3873ef4cf40ee800dc11a` متطابق.
- تحديث المرآة والوثائق [`c1d9d04ea969ba12f8cd748a3d06d6c9f40a303a`](https://github.com/Report-Engainall/Nasr1/commit/c1d9d04ea969ba12f8cd748a3d06d6c9f40a303a) اجتاز [Actions 39150638459 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39150638459).
- تم إغلاق `NASR1-CUSTOMER-STATEMENT-SUMMARY-SNAPSHOT-VERIFY-CI`. لا تكرر التحقق أو إعادة نسخ الملفات العشرة ما لم تتغير المصادر.
- next_task_id: `NASR1-CUSTOMER-STATEMENT-AGING-CUTOFF-ALIGNMENT-001`.

## 2026-10-18 — NASR1-BOOT-RECOVERY-SOURCE-MANDATE-001
- الهدف: Report-Engainall/Nasr1/main فقط. هذه الدفعة تحدث ملفات الإقلاع والجرد ولا تدعي دمج ميزة من ZIP.
- SHA الأساس: 154ec48397164473010d40bd3b509c24f188030e؛ [Actions 39150932901 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39150932901). هذه النتيجة للأساس فقط ولا تنتقل إلى commit الوثائق.
- أُغلقت NASR1-CUSTOMER-STATEMENT-AGING-CUTOFF-ALIGNMENT-001 على SHA الأساس مع CI مطابق.
- READY_TO_REUSE/PROVENANCE_MANIFEST.csv فيه 69 صفًا؛ سجل الدمج السابق لا يثبت قرارًا منفصلًا لكل عنصر، لذا المصالحة مفتوحة.
- https://github.com/Report-Engainall/report-insight-engine/tree/main/incoming-archives/nasr1-bolt-recovery-2026-10-17 يعرض Nasr1_Bolt_Before_Failure.zip (1,003,172 بايت؛ Git blob SHA-1 7c35f3ecde19dc5596fd22053be61924ef3d5318) وNasr1_Bolt_Restored_Current.zip (997,589 بايت؛ Git blob SHA-1 f01684a56e093a33a173b0965d1d7239c48f0936). لم تُنزّل البايتات ولم يُحسب SHA-256 أو يُختبر ZIP ولم يحدث استخراج؛ عدد الأعضاء مجهول.
- أضيف الملفان إلى ARCHIVE_MANIFEST.csv وSOURCE_INTEGRATION_LEDGER.csv بصفة metadata متاحة وغير مستخرجة؛ لم تُختلق صفوف أعضاء في ARCHIVE_MEMBERS.csv.
- لا تغييرات runtime/DB/dependencies. الاختبارات المحلية NOT RUN إن لم تتوفر workspace؛ يلزم CI exact-SHA للـcommit الجديد.
- next_task_id: NASR1-BOLT-RECOVERY-ARCHIVE-RECONCILIATION-001.

## 2026-10-18 — NASR1-BOLT-RECOVERY-ARCHIVE-RECONCILIATION-001 — evidence persisted

- Target: Report-Engainall/Nasr1 / main; immutable source: Report-Engainall/report-insight-engine@b1ca62ec277ff9f55c8e850e0470d61d81aaa138.
- Before_Failure: 1,003,172 bytes; SHA-256 d59b3084a0b51e26646cf08ffc9239d2ee440298e9799f079827a4939d31b365; Git blob SHA-1 7c35f3ecde19dc5596fd22053be61924ef3d5318; 359 members; ZIP integrity/safe extraction PASS.
- Restored_Current: 997,589 bytes; SHA-256 9e012da1795cb9549413f78366c3bd6885c593e5a56e2fea10d4cf3fe810b214; Git blob SHA-1 f01684a56e093a33a173b0965d1d7239c48f0936; 358 members; ZIP integrity/safe extraction PASS.
- Pair diff: {"IDENTICAL_CONTENT": 340, "CHANGED_CONTENT": 18, "BEFORE_ONLY": 1}; 717 member rows. Member decisions: {"EXCLUDED_SECURITY": 8, "TARGET_PRESENT_DIFFERENT_CONTENT_REVIEW": 108, "ALREADY_PRESENT_EXACT": 562, "MISSING_TARGET_CANDIDATE": 39}.
- READY_TO_REUSE path/hash audit: {"ALREADY_PRESENT_EXACT": 4, "TARGET_PATH_DIFFERS_REVIEW_CONTENT": 2, "TARGET_PATH_MISSING_REVIEW_CONTENT": 63} across 69 rows; semantic contract/API/RLS review is NOT COMPLETE.
- Security decision: archived code not executed; sensitive/password/grant content not copied; legacy SQL with DROP FUNCTION ... CASCADE not applied.
- Archive workflow run: https://github.com/Report-Engainall/Nasr1/actions/runs/39154736119.
- Source integration: legacy React Router AdminAuditLog adapted into src/components/AdminAuditLog.tsx and src/routes/admin_.audit.tsx; RLS hardening migration and real PostgreSQL boundary assertions added. Exact code SHA bb08320b690203f7f9b1ce65287e389e847c2dea / Actions run 39154450426 SUCCESS (unit, PostgreSQL 17/RLS, lint, build, preview and dev smoke).
- Failures retained truthfully: Actions run 39154189270 found JSX parse error; run 39154309412 found invalid template-literal escapes; corrected build passed run 39154450426.
- BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN; production Supabase migration=NOT RUN; Onyx live vendor round-trip=NOT RUN.
- next_task_id = NASR1-READY-TO_REUSE-SEMANTIC-INTEGRATION-001

 
## 2026-10-18 — NASR1-BOLT-RECOVERY-CI-REVALIDATION-001
- Target: Report-Engainall/Nasr1/main only.
- Added both immutable raw Bolt ZIP URLs to `scripts/reconcile-source-release-snapshots.py`, preserving the previously recorded expected byte counts and SHA-256 values. The downloader supports explicit raw URLs as well as release assets.
- Code commit: `92a948e83ebc05278b09d50aec410da490c76f7c`.
- Full checks exact-SHA: [Actions 39157355224 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39157355224): frozen Bun lock, unit tests, PostgreSQL 17 migrations/RLS acceptance, lint, build, preview smoke and dev smoke.
- Archive audit exact-SHA: [Actions 39157355307 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39157355307). Both Bolt snapshots passed expected byte-count/SHA-256 checks, ZIP path/size/ratio checks, full member decompression/CRC traversal, and bounded non-sensitive source/text extraction to temporary CI storage. No archived code was executed and no SQL applied.
- Refreshed SOURCE_INTEGRATION_LEDGER.csv and ARCHIVE_MANIFEST.csv to remove stale NOT DOWNLOADED claims and record the actual validation evidence.
- Archive integrity is not semantic integration. READY_TO_REUSE/PROVENANCE_MANIFEST.csv has 69 data rows; per-file contract/import/route/RLS review and useful missing feature integration remain open.
- IMPLEMENTED: explicit raw-source support in audit tooling. INTEGRATED: CI workflow. TESTED: full checks and ZIP audit on exact code SHA above. BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN; production migrations=NOT RUN; Onyx vendor round-trip=NOT RUN.
- next_task_id = NASR1-READY-TO-REUSE-SEMANTIC-INTEGRATION-001.

 
## 2026-10-18 — NASR1-READY-FINANCE-INPUT-001
- المصدر المراجع: `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1/src/services/finance.ts` (blob `d9c2131b2d582b5b5baa20e3b497cd272c3b31e9`).
- لم تُنسخ الخدمة القديمة بسبب اختلاف عقد Supabase وبنية الواجهة؛ كُيّفت حدود إدخال التحصيل إلى `src/lib/finance-input.ts` ووُصلت بالنموذج الفعلي في `src/components/CustomerWorkflows.tsx`. أضيف `src/test/finance-input.test.ts`.
- التحقق: [Actions 39157780840 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39157780840), exact code SHA `dd6bdaac8225be3bc0c0bc8d266b5e13aaab6c75`: frozen lock, unit tests, PostgreSQL 17 migrations/RLS, lint, build, preview/dev smoke PASS.
- التغيير لا يستبدل تحقق قاعدة البيانات؛ لا فاتورة تاريخية أو بيانات demo أو خدمة مدفوعة أضيفت.
- الحالة: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact SHA; BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN.
- مراجعة بقية صفوف READY_TO_REUSE مستمرة؛ next_task_id = NASR1-READY-TO-REUSE-SEMANTIC-INTEGRATION-001.


## 2026-10-18 — NASR1-INVENTORY-AVAILABLE-STOCK-METRIC-001

- Target: `Report-Engainall/Nasr1` / `main`. Donor candidate: `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1`, `src/services/inventory.ts` blob `3506707a656e0db491b860d5e11ad28daeded5cf`; paired donor test blob `04d706d4f2f68f30743911b2f3dd3e824a0dd18c`.
- Corrected the active dashboard low-stock calculation to use `quantity_available`, not gross `quantity_on_hand`; made the dashboard surface inventory-read failure instead of silently calculating zero alerts. Added `countLowStockBalances` and unit coverage for reservations, threshold equality, zero/null threshold policy, invalid snapshots and empty sets.
- Semantic decision on donor service: its contract calls `transfer_inventory`, `set_stock_threshold`, `get_low_stock`, `start_stock_count`, `set_stock_count_line`, `complete_stock_count` and reads `stock_count_sessions/stock_count_lines`. Those names were absent from all 42 active target migration SQL files at code SHA `6e746a7684f4cf8696c3b2c2bbfdd8f410cd364f`. The donor test imports its legacy `./inventory` module, so it is not a drop-in target test. Rejected wholesale copy; no unsupported RPC or SQL was added.
- Code files: `src/lib/inventory-metrics.ts`, `src/lib/api.ts`, `src/test/inventory-metrics.test.ts`.
- Exact-SHA CI [39158519832 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39158519832), code SHA `6e746a7684f4cf8696c3b2c2bbfdd8f410cd364f`: frozen lock verification, unit tests, PostgreSQL 17 migrations/RLS acceptance, lint, build, preview smoke and dev smoke all successful.
- State: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact SHA; BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN; production Supabase migrations=NOT RUN. This is only a target-native low-stock-metric correction, not inventory transfer/count feature completion.
- next_task_id remains `NASR1-READY-TO-REUSE-SEMANTIC-INTEGRATION-001`.


## 2026-10-18 — NASR1-IMPORT-CHUNK-CONTIGUITY-001

- Source candidate reviewed: `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1`, `supabase/migrations/0021_import_server_boundary_hardening.sql` source blob `16f9091fe712f947a4f4dfc6c06b38773273967f`; older `0008_atomic_import_commit.sql` blob `74372746bbbe7f000c42f24688e74542cab91448` uses a different products/import_rows/price_lists schema and was not copied.
- In the live target, `record_import_upload_chunk` previously validated offset/size/hash and idempotent duplicate rows but accepted out-of-order new chunk numbers. Added `supabase/migrations/20261018060000_import_upload_chunk_contiguity.sql` to enforce sequential chunk-prefix writes under a row lock and preserve identical retries.
- Extended `scripts/test-database-migrations.mjs` with multi-chunk acceptance: reject chunk 1 before 0; reject chunk 2 before 1; no failed write persists; accept idempotent retry; accept full ordered sequence with a smaller final chunk.
- Exact-SHA CI [39159034597 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39159034597), code SHA `a02ad4682ed1e18a10811040ae20134875031de7`: lockfile, unit tests, PostgreSQL 17 migrations/RLS acceptance, lint, build and preview/dev smoke all PASS.
- Status: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS on exact SHA; production migrations=NOT RUN; BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN. This is an import-integrity hardening, not full semantic integration of all donor candidates.
- next_task_id = `NASR1-READY-TO-REUSE-SEMANTIC-INTEGRATION-001`.

## 2026-10-18 — NASR1-INVENTORY-TRANSFER-001

- Source reviewed: `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1/src/services/inventory.ts`, blob `3506707a656e0db491b860d5e11ad28daeded5cf`. Old service uses distinct RPC parameters and assumptions about schema; no wholesale copy.
- Target-native integration: migration `supabase/migrations/20261018070000_inventory_transfer_command.sql`; API `fetchActiveInventoryWarehouses` + `transferInventory` in `src/lib/api.ts`; transfer modal and control in `src/components/AghbariApp.tsx`; PostgreSQL acceptance cases in `scripts/test-database-migrations.mjs`.
- Transaction invariants: active same-tenant product and warehouses; source available quantity (not gross on-hand) must cover transfer; row locking in deterministic order; source and destination balances change atomically; paired immutable movement rows and audit; exact-payload idempotent replay returns the same transfer without duplicate movement; payload mismatch rejected.
- Test correction history: first run [39159581588](https://github.com/Report-Engainall/Nasr1/actions/runs/39159581588) failed on invalid schema qualification of SQL COALESCE; corrected. [39159657535 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39159657535) validated transfer logic and all project checks. The latest UI quantity-label correction then passed exact-SHA CI [39159745907 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39159745907) at `89fe8089aa2fd7d4f1b5130c8af85dc1171b4185`.
- State: IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS exact SHA; BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN; production migration=NOT RUN. Stock-count session/line feature remains open.
- next_task_id = `NASR1-INVENTORY-REORDER-POINT-COMMAND-001`.

## 2026-10-18 — NASR1-INVENTORY-WRITE-BOUNDARY-REORDER-POINT-001

- Source candidate: `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1/src/services/inventory.ts` blob `3506707a656e0db491b860d5e11ad28daeded5cf`. Legacy contract supports min/reorder/max quantities and calls `set_stock_threshold`; target schema has one integer `inventory_balances.reorder_point`, so only equivalent target-native behavior was adapted.
- Added `supabase/migrations/20261018080000_inventory_write_boundary_and_reorder_point.sql`, API `fetchInventoryReorderPoint` / `setInventoryReorderPoint` and admin/manager UI. Direct authenticated DML on inventory balances and movement ledger is revoked; reads remain available under existing RLS. A manager RPC writes only an existing same-tenant balance, validates threshold/reason, records audit history and lets the existing inventory trigger reconcile the purchasing task.
- Added migration acceptance for direct write denials, changing and repeating a threshold, audit old/new values, task reopen/complete lifecycle, invalid threshold, cross-tenant warehouse and accountant denial. Corrected the error-match regex in follow-up test commit `591dce4e59383e7a568c9a19c7f7e823fe5aa7f3`.
- Exact-SHA CI [39160377663 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39160377663), code SHA `591dce4e59383e7a568c9a19c7f7e823fe5aa7f3`: frozen lock, unit tests, PostgreSQL 17 migrations/RLS acceptance, lint, build, preview/dev smoke PASS.
- Production Supabase migrations=NOT RUN; BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN. next_task_id = `NASR1-INVENTORY-STOCK-COUNT-001`.
