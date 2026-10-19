# نتيجة دمج أرشيفي Bolt في Nasr1 — 19 أكتوبر 2026

## النتيجة الدقيقة

تم دمج فائدة تحليلية مفقودة من أرشيف **Before Failure** داخل التطبيق الحالي، مع الحفاظ على واجهات Nasr1 ومعمارية TanStack والمخطط الحالي. لا يعني ذلك نسخ كل محتوى الأرشيفين، ولا تشغيل SQL القديم كما هو.

- مستودع التعديل الوحيد: [Report-Engainall/Nasr1](https://github.com/Report-Engainall/Nasr1), الفرع `main`.
- مصدر قراءة فقط: [report-insight-engine / incoming-archives/nasr1-bolt-recovery-2026-10-17](https://github.com/Report-Engainall/report-insight-engine/tree/main/incoming-archives/nasr1-bolt-recovery-2026-10-17).
- التحقق الفعلي من ZIP في [Actions 39294387493](https://github.com/Report-Engainall/Nasr1/actions/runs/39294387493) على لقطة مستهدفة تاريخية SHA `d20c1aced5f6595b1b2a81bb017c153a260c5a0d` والمصدر المثبت `b1ca62ec277ff9f55c8e850e0470d61d81aaa138`.
- Before Failure: 1,003,172 بايت، SHA-256 `d59b3084a0b51e26646cf08ffc9239d2ee440298e9799f079827a4939d31b365`، Git blob SHA-1 `7c35f3ecde19dc5596fd22053be61924ef3d5318`، 359 عضوًا.
- Restored Current: 997,589 بايت، SHA-256 `9e012da1795cb9549413f78366c3bd6885c593e5a56e2fea10d4cf3fe810b214`، Git blob SHA-1 `f01684a56e093a33a173b0965d1d7239c48f0936`، 358 عضوًا.
- مقارنة الأعضاء: 717 صفًا، 340 مطابقًا، 18 متغيرًا، وعضو واحد موجود في Before Failure فقط. فحوص الحجم والبصمات وCRC وفك الضغط والمسارات الآمنة والاستخراج المؤقت نجحت. لم يُشغّل كود الأرشيف ولم تُطبّق SQL منه.

## قرارات الميزات

| ميزة / مصدر | حالة Nasr1 | القرار |
|---|---|---|
| `fetch_staff_products(uuid)` | موجودة بإصدار أقوى في `supabase/migrations/20261015210000_product_price_column_boundary.sql`؛ صلاحية خادمية ونطاق مؤسسة، وحظر SELECT المباشر لحقول الأسعار الحساسة | `ALREADY_PRESENT_BETTER` — لم تُستبدل |
| `get_ai_gateway_budget()` و`configure_ai_usage_budget(jsonb)` | موجودتان في `supabase/migrations/20261015200000_ai_gateway_budget_reservations.sql` مع مزودي AI، حجوزات حصص ذرية ودفتر استخدام والتحقق من HTTPS؛ مفاتيح المزود تبقى في أسرار Edge Function | `ALREADY_PRESENT_BETTER` — لم تُستبدلا |
| `get_onyx_snapshot_analytics(uuid)` | موجودة في `supabase/migrations/20261009090000_onyx_deterministic_analytics.sql`، وتخص اللقطة الثابتة المستوردة من Onyx | `ALREADY_PRESENT` — لا تعادل تحليل مبيعات المتجر |
| `get_executive_analytics()` في العضو الوحيد Before-only | لم تكن الوظيفة بالاسم والعقد القديم موجودة في التطبيق الحالي؛ الاستعلام القديم يعتمد مخططًا قديمًا ويحذف الوظيفة بـ`DROP ... CASCADE` | `ADAPT_AND_INTEGRATE` — أُعيد تنفيذ القدرة بعقد آمن متوافق |
| شاشات React Router القديمة وملفات الأنماط القديمة و`package-lock.json` | توجد واجهات أحدث ومسارات TanStack وBun lock في Nasr1؛ النسخ القديم قد يستبدل تحسينات أو يكسر البناء | لم تُنسخ؛ القرار مبني على عدم التوافق ووجود تنفيذ أحدث |
| ملفات الأسرار مثل `.env` وملفات بيانات الاعتماد | محتوى حساس | مستبعدة أمنيًا، لا تُنقل إلى Git |

## التغيير المتكامل

- `supabase/migrations/20261019210000_store_executive_analytics.sql`: RPC جديد يجمع الأرقام كاملةً في PostgreSQL من طلبات المؤسسة الحالية وبنودها؛ نطاق المؤسسة مشتق من هوية الجلسة في الخادم، يتطلب ملفًا نشطًا ودور موظف، يستخدم `SECURITY DEFINER` و`search_path=''`، يمنع التنفيذ للـ`anon` و`PUBLIC`، ويستبعد الملغى والمرفوض من المبيعات والاتجاه والترتيب.
- `src/lib/executive-analytics.ts`: أنواع محللة وفحوص صارمة؛ القيم الغائبة أو غير الصالحة تُرفض ولا تتحول بصمت إلى أصفار.
- `src/lib/api.ts`: استدعاء RPC من API التطبيق.
- `src/components/ExecutiveStoreAnalytics.tsx`: بطاقات المؤشرات، اتجاه المبيعات لـ30 يومًا، أعلى خمسة أصناف وأعلى خمسة عملاء وحالات تحميل/خطأ/فراغ وتحديث.
- `src/components/AghbariApp.tsx`: ربط الوحدة فعليًا بشاشة التقارير بجوار تحليلات Onyx.
- `src/test/executive-analytics.test.ts`: اختبارات صحة الاستجابة وحدود الأرقام والتواريخ والحقول المفقودة.

## دليل الاختبار

الالتزام المطابق للميزة الأساسية كان في commit [`2367b7c28e3eab5563be3129383c954c7c5eb831`](https://github.com/Report-Engainall/Nasr1/commit/2367b7c28e3eab5563be3129383c954c7c5eb831)، واجتاز [Actions 39303287438 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39303287438):
- اختبارات الوحدات.
- تطبيق migrations وفحوص RLS وسير العمل على PostgreSQL 17 معزول.
- Lint.
- Build.
- Production preview smoke على 4173 وdev smoke على 5173.

هذا إثبات CI على SHA المحدد، وليس إثبات متصفح تفاعلي بحساب حي أو تطبيق migrations على قاعدة الإنتاج. تُسجّل التعديلات المرئية اللاحقة ونتائج CI الخاصة بها في سجل التنفيذ بعد اكتمالها.

## حالة الإكمال

`archive integrity = PASS`; `archive comparison = PASS`; `missing executive analytics capability = IMPLEMENTED + INTEGRATED + TESTED`; `old archive SQL copied/applied = NO`; `browser proof = NOT RUN`; `production migration = NOT RUN`.

المصالحة هنا انتقائية ومبنية على المصدر: لم يُدّعَ دمج كل ملف وكل شاشة من الأرشيفين. العناصر غير المنقولة محفوظة كقرارات مراجعة مع السبب؛ استمر تنفيذ بقية المواصفة الأصلية بشكل مستقل.
