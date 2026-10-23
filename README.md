# متجر الأغبري | Aghbari Commerce

المستودع التنفيذي المعتمد للتطبيق هو **[Report-Engainall/Nasr1](https://github.com/Report-Engainall/Nasr1)**. حافظ على قاعدة البيانات والمهاجرات والشيفرة الحالية، ونفّذ أي تغيير برمجي عبر فرع عمل وطلب دمج؛ لا تنشئ مشروعًا موازيًا ولا تكتب مباشرة إلى `main`.

هذا المستودع يحتوي تطبيق React/Vite/TanStack Start، وخدمات Supabase، ومهاجرات PostgreSQL، واختبارات الوحدة وقبول قاعدة البيانات والمتصفح. لا يُعد وجود رابط تاريخي في الوثائق دليلًا على أن نسخة إنتاج منشورة أو متزامنة حاليًا.

## البدء محليًا

المتطلبات: Node.js 22 وBun، وبيئة Supabase اختبارية أو تطويرية منفصلة عن الإنتاج عند الحاجة لاختبار الخدمات.

```sh
git clone https://github.com/Report-Engainall/Nasr1.git
cd Nasr1
bun install --frozen-lockfile
cp .env.example .env
# املأ متغيري Supabase العامين من مشروع تطوير/اختبار مخوّل.
bun run dev
```

لن يكتمل تشغيل التطبيق المتصل بالخدمات قبل إعداد `VITE_SUPABASE_URL` و`VITE_SUPABASE_PUBLISHABLE_KEY`. المفتاح القابل للنشر مصمم للاستخدام في العميل، لكنه لا يمنح أي صلاحية بحد ذاته؛ سياسات RLS وعقود RPC على الخادم هي حدود التفويض. لا تضع مفتاح `service_role` أو أي سر خادمي في متغير يبدأ بـ`VITE_`.

تفاصيل الإعداد، مهاجرات قاعدة البيانات، والاختبارات موجودة في [دليل البيئة والتشغيل](./docs/DEPLOYMENT_AND_ENVIRONMENT.md).

## أوامر التحقق

```sh
bun run test
bun run lint
bun run typecheck
bun run build
```

قبول PostgreSQL 17 يحتاج قاعدة اختبار محلية ومعزولة فقط:

```sh
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/aghbari_test bun run test:db
```

لا تستخدم عنوان قاعدة إنتاج مع اختبارات الكتابة أو المهاجرات. مجموعة CI تشغّل أيضًا اختبارات قبول مخصصة مستقلة؛ ارجع إلى [سير عمل Core](./.github/workflows/commerce-checks.yml) و[سير عمل P2 Playwright](./.github/workflows/p2-playwright-critical-paths.yml) لحدود كل مجموعة. نتيجة اختبار تخص SHA واحد لا تثبت نتيجة SHA أحدث.

## الاستئناف والتنفيذ

- اقرأ `AGENTS.md` ثم [الحالة التنفيذية المركزية](./docs/bolt-source-reconciliation/CURRENT_EXECUTION_STATE.md) ومصفوفة القبول الحالية.
- تحقق من رأس `main` ونتائج Actions المطابقة قبل اختيار `NEXT_ACTION`.
- لا تعِد تنفيذ الأعمال المدمجة إلا عند وجود انحدار موثق؛ لا تصف `SKIPPED` أو `BLOCKED_EXTERNAL` بأنها `PASS`.
- Onyx Pro وWhatsApp Business API وأي اختبارات حسابات مستضافة تحتاج اعتمادًا مصرحًا واستجابة فعلية من البيئة الهدف. دون ذلك تبقى `BLOCKED_EXTERNAL`; الاختبارات المحلية لا تثبت اتصال الإنتاج.
- لا تُستخدم بيانات إنتاجية في الاختبارات، ولا تُنشر أسرار أو بيانات عميل في سجلات CI.
