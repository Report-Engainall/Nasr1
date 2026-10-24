# سجل عقود API والمهام الخلفية — Nasr1

**لقطة المصدر:** `Report-Engainall/Nasr1`، `main` عند `16a3d23e558696700bccbb3dbf9ea75b0fccf745` (24 أكتوبر 2026).  
**الحالة:** `PARTIAL` — سجل مداخل Edge Functions الخمسة موثق، وأصبح جرد كتالوج PostgreSQL 17 ومطابقة مصدر/منح الدوال العامة مختبرًا على SHA محدد (304/304، بلا مصادر غير معروفة). ما زالت المراجعة الدلالية لكل RPC مرشحة مفتوحة، كما أن أسرار الإنتاج والموصلات الخارجية غير مثبتة.

## قواعد مشتركة

- جميع الأسرار الخادمية تبقى في إعداد Supabase Edge Function server-side. لا تُضف `SUPABASE_SERVICE_ROLE_KEY` أو `OUTBOX_WORKER_SECRET` أو `ASYNC_EXPORT_WORKER_SECRET` أو مفاتيح مزوّد الذكاء الاصطناعي إلى متغير `VITE_*` أو حمولة العميل أو السجلات.
- `Access-Control-Allow-Origin` أو نجاح CORS لا يثبت المصادقة أو التفويض؛ يجب أن تتحقق الوظيفة من جلسة المستخدم/الدور/المؤسسة أو سر العامل حسب نمطها.
- لا تُشغّل اختبارات الكتابة أو migrations على الإنتاج. نتائج PostgreSQL 17/Chromium المعزولة ليست دليل نشر أو اتصال خارجي.
- `SKIPPED` لحسابات العملاء المستضافة تبقى `BLOCKED_EXTERNAL` إذا لم تتوفر اعتمادات غير إنتاجية مخوّلة.

## مداخل Edge Functions

| المدخل | المصادقة ونطاق التفويض | حدود الطلب / دورة العمل | الأخطاء والسلوك الآمن | مصدر التنفيذ والاختبار |
|---|---|---|---|---|
| `outbox-worker` | POST فقط؛ سر خادمي `OUTBOX_WORKER_SECRET` تتم مقارنته بطريقة تقلل تسرب التوقيت؛ مفتاح الخدمة server-side فقط | قارئ streaming مشترك يوقف القراءة عند تجاوز 4096 بايت؛ `batch_size` عدد صحيح من 1 إلى 50؛ يطالب بـevents عبر `claim_outbox_events` مع lease مقداره 300 ثانية؛ تمييز processed/retry/dead-letter؛ redaction للسجلات | يرفض الطرق غير POST والمدخلات غير الصحيحة؛ لا يعد نجاح التسليم ما لم تثبت استجابة الموصل؛ فشل التنفيذ يتحول إلى retry أو dead-letter مسجل | [index.ts](../../supabase/functions/outbox-worker/index.ts)، [bounded reader](../../supabase/functions/_shared/bounded-body.ts)، [streaming limit tests](../../src/test/bounded-request-body.test.ts)، [logic.ts](../../supabase/functions/outbox-worker/logic.ts)، [source tests](../../src/test/outbox-worker-source.test.ts)، [logic tests](../../src/test/outbox-worker-logic.test.ts) |
| `async-export-worker` | وضع العامل يستخدم `ASYNC_EXPORT_WORKER_SECRET` ومفتاح الخدمة داخل الخادم؛ وضع المستخدم يستعمل JWT و`claim_my_async_export_job` للطلب المملوك له | جسم الطلب يقرأ streaming بحد 4096 بايت؛ العامل يقبل batch من 1 إلى 5، lease 300 ثانية؛ تصفية allowlist للحمولة؛ قفل المؤسسة في قراءات الطلبات والعملاء؛ تخزين artifact تحت organization/job؛ إعادة المحاولة محدودة حتى 5 محاولات | رفض طريقة/حمولة غير صحيحة؛ فشل claim يعطي رفضًا واضحًا؛ فحص lease owner قبل إتمام المهمة؛ لا يستطيع مستخدم قراءة/claim وظيفة مؤسسة أخرى | [index.ts](../../supabase/functions/async-export-worker/index.ts)، [bounded reader](../../supabase/functions/_shared/bounded-body.ts)، [streaming limit tests](../../src/test/bounded-request-body.test.ts)، [PG17 acceptance](../../scripts/test-async-export-jobs.mjs)، [route contract tests](../../src/test/async-export-route-contract.test.ts)، [job contract tests](../../src/test/async-export-job-contract.test.ts) |
| `async-export-download` | POST مع جلسة مستخدم صالحة؛ التحقق من ملكية التنزيل يمر عبر RPC خادمي | جسم الطلب يقرأ streaming بحد 2048 بايت؛ ينشئ رابطًا موقّعًا لـ60 ثانية كحد أعلى، مع عدم تجاوز انتهاء artifact المحفوظ؛ تسجيل/تحقق من التنزيل أحادي الاستخدام وفق عقد قاعدة البيانات | لا يعيد مسار artifact الداخلي كبديل للرابط؛ فشل الرابط أو الملكية لا يتحول إلى نجاح وهمي | [index.ts](../../supabase/functions/async-export-download/index.ts)، [bounded reader](../../supabase/functions/_shared/bounded-body.ts)، [streaming limit tests](../../src/test/bounded-request-body.test.ts)، [PG17 async-export acceptance](../../scripts/test-async-export-jobs.mjs) |
| `ai-gateway` | POST/OPTIONS؛ جلسة صالحة وprofile نشط ومؤسسة؛ `test_connection` محصور على admin/manager؛ صلاحيات الميزانية عبر RPC مقيدة | جسم الطلب يقرأ streaming بحد 4096 بايت؛ الأفعال الموثقة `ask` و`test_connection`؛ providers اختيارية مثل OpenAI-compatible وGemini؛ تقدير تكلفة/token قبل التنفيذ، حجز ميزانية، ثم سجل usage/attempt/outcome؛ `max_tokens` محدود | عند غياب إعداد المزوّد لا يخترع نجاح اتصال؛ يعيد fallback صريحًا أو خطأ؛ `cache-control: no-store`; الأخطاء مثل quota/provider unavailable تبقى مرئية | [index.ts](../../supabase/functions/ai-gateway/index.ts)، [bounded reader](../../supabase/functions/_shared/bounded-body.ts)، [streaming limit tests](../../src/test/bounded-request-body.test.ts)، [telemetry PG17 acceptance](../../scripts/test-ai-gateway-telemetry.mjs)، [logic tests](../../src/test/ai-gateway-logic.test.ts) |
| `product-image-upload` | POST/OPTIONS؛ جلسة صالحة، profile نشط، مؤسسة نشطة، دور موظف مسموح، والتحقق أن المنتج ينتمي إلى نفس المؤسسة | WebP فقط مع التحقق من التوقيع، حد أقصى 8 MiB، UUIDs ومسار التخزين مربوطان بالمؤسسة والمنتج؛ اسم ملف فريد دون overwrite | رفض نوع/حجم/معرّف/مؤسسة غير صالح؛ لا يسمح بمسار storage يختاره العميل خارج نطاق المؤسسة؛ مفتاح الخدمة لا يخرج من الخادم | [index.ts](../../supabase/functions/product-image-upload/index.ts)، [security contract](../../src/lib/product-image-security.ts) |

## API-OPS-001 — جرد الكتالوج والمنح المكتمل (TESTED_EXACT_SHA)

**رأس الشيفرة المختبر:** `672749855d733f691ab59de878420a210108fbbe`  
**Core / PostgreSQL 17:** [Run 40042438869](https://github.com/Report-Engainall/Nasr1/actions/runs/40042438869) — `SUCCESS` على SHA نفسه.  
**P2 Playwright:** [Run 40042438851](https://github.com/Report-Engainall/Nasr1/actions/runs/40042438851) — `SUCCESS` على SHA نفسه.  
**الملف التفصيلي:** [PUBLIC_RPC_FUNCTION_INVENTORY_2026-10-24.md](./PUBLIC_RPC_FUNCTION_INVENTORY_2026-10-24.md).

ينفّذ الجرد بعد تطبيق 120 migration بالترتيب على PostgreSQL 17 معزول؛ وقد طابق 304/304 كائنًا عامًا إلى مصدر migration أو extension، مع 0 صفوف بلا مصدر. تصنيف السطح: 179 دالة عامة مرشحة لمراجعة RPC، و40 callback للمشغلات، و67 دالة extension، و18 دالة عامة لا تملك امتياز EXECUTE لأي من `anon` أو `authenticated` أو `service_role`. من المرشحات 176 `SECURITY DEFINER` و3 `SECURITY INVOKER`. المنح المرصودة بين المرشحات هي `anon` 9 و`authenticated` 162 و`service_role` 18؛ تتداخل هذه الأعداد عندما يملك الكائن أكثر من منحة.

**حد الإثبات:** هذا يغلق فجوة **اكتشاف الكتالوج ومطابقة المصدر ورصد المنح الفعلية في بيئة الاختبار** فقط. لا يحوّل الجرد أو إشارات جسم الدالة الاستدلالية إلى إثبات سلامة؛ تبقى عقود الـ179 مرشحًا بحاجة إلى تدقيق دلالي واختبارات رفض/عزل/تكرار/تدقيق لكل مجال. كما لا يثبت إعداد أسرار الإنتاج أو الاتصال بمزوّد خارجي.

## RPC عالية المخاطر يجب أن تبقى عقودها متوافقة

هذه قائمة عقود حرجة تمت مراجعتها في مسارات الاختبار الحالية، وليست قائمة شاملة بكل `CREATE FUNCTION` أو كل grant في المستودع.

| RPC / المجال | عقد القبول المتوقع | دليل اختبار/مصدر |
|---|---|---|
| `claim_outbox_events` | لا يطالب العامل إلا بعد سر صالح؛ lease محدود؛ إعادة التسليم لها نتيجة مخزنة لا حذف صامت؛ retry/dead-letter والتدقيق متمايزون | [outbox worker](../../supabase/functions/outbox-worker/index.ts)، [outbox logic test](../../src/test/outbox-worker-logic.test.ts) |
| `claim_async_export_jobs` / `claim_my_async_export_job` | worker claims محدودة، lease-owner محفوظ، مستخدم يطالب فقط بوظيفته، مؤسسة/دور معزولان، لا انتقال حالة مباشرة من العميل | [async export worker](../../supabase/functions/async-export-worker/index.ts)، [acceptance](../../scripts/test-async-export-jobs.mjs) |
| `get_store_executive_analytics` | no anonymous execution؛ رفض دور العميل؛ عمودا العميل الحاليان `business_name/contact_name`؛ المؤسسة و30 يومًا واستبعاد cancelled تتطابق مع بيانات المصدر | [analytics migration](../../supabase/migrations/20261024010000_store_executive_analytics_customer_schema.sql)، [PR #135](https://github.com/Report-Engainall/Nasr1/pull/135) |
| `transfer_inventory_batch` | tenant/warehouse guard، ترتيب أقفال ثابت، منع oversell/استهلاك reserved stock، idempotency key، إعادة نفس batch عند تكرار payload، وتغيير payload بنفس المفتاح مرفوض | [database acceptance](../../scripts/test-database-migrations.mjs)، [PR #134](https://github.com/Report-Engainall/Nasr1/pull/134) |
| `set_admin_customer_tier` / حالة العميل | الرفض عبر المؤسسة مع SQLSTATE 42501/HTTP 403، بلا تغيير في صف المؤسسة الأخرى أو audit mutation؛ العمليات داخل المؤسسة تبقى وفق الدور | [PR #131](https://github.com/Report-Engainall/Nasr1/pull/131)، [P1 acceptance #119](https://github.com/Report-Engainall/Nasr1/pull/119) |
| حفظ/تعديل/حذف عنوان العميل | schema/UUID validation؛ لا يُعتبر أي نص غير فارغ إقرارًا بالنجاح؛ IDs غير الصالحة ترفض قبل RPC؛ نطاق المؤسسة والمالك محفوظ | [customer-address service](../../src/lib/customer-addresses.ts)، [PR #127](https://github.com/Report-Engainall/Nasr1/pull/127) |
| دفعات العملاء والإشعارات الدائنة | idempotency key + request fingerprint؛ replays بنفس payload تعيد العملية الأصلية، payload مختلف يتعارض؛ قفل invoice مشترك مع posted credits ومنع تجاوز الرصيد | [PR #112](https://github.com/Report-Engainall/Nasr1/pull/112)، [PR #123](https://github.com/Report-Engainall/Nasr1/pull/123)، [PR #104](https://github.com/Report-Engainall/Nasr1/pull/104) |

## اختبارات تثبتها Core الحالية

على `main` SHA `16a3d23e558696700bccbb3dbf9ea75b0fccf745`, Core run [40035355209](https://github.com/Report-Engainall/Nasr1/actions/runs/40035355209) انتهى `SUCCESS`. سجل القبول يتضمن:
- import profile، tenant-scoped synonyms، resumable chunk manifest، duplicate detection، DQS finalization وfull-snapshot analytics.
- concurrent same-key import replay، canonical job/claim، changed-payload rejection ورفض direct-table privileges.
- async-export idempotency، filter allowlist، role/tenant isolation، RPC-only writes، leases/retry cap/artifact expiry/one-time download authorization/audit.
- outbox/AI telemetry/inventory acceptance في مساراتها المحلية.

أما هذا السجل نفسه فيُحدّث كمرجع تعاقدي فقط؛ لا يُعد دليلاً على أن كل RPC في migrations قد جرى جرده أو أن secrets والموصلات مهيأة في الإنتاج.

## الفجوات المفتوحة صراحة

1. مطابقة الكتالوج العام بالمصدر ورصد منح EXECUTE الفعلية: **TESTED_EXACT_SHA** على `672749855d733f691ab59de878420a210108fbbe`، 304/304 كائنات و0 مصادر مجهولة ([الفهرس](./PUBLIC_RPC_FUNCTION_INVENTORY_2026-10-24.md)). التدقيق الدلالي لكل 179 مرشح RPC واختبارات الرفض/العزل/التكرار/التدقيق: **OPEN / PARTIAL**.
2. إثبات إعداد `OUTBOX_WORKER_SECRET` و`ASYNC_EXPORT_WORKER_SECRET` في بيئة نشر فعلية: **NOT PROVEN** من مستودع Git.
3. اتصال AI بمزوّد فعلي: لا يُدّعى دون اعتماد صالح واستجابة فعلية. غياب المفتاح ينتج fallback/خطأ صريحًا.
4. اختبارات حساب العميل/المؤسسة المستضافة: **BLOCKED_EXTERNAL** إذا لم تتوفر اعتمادات اختبار غير إنتاجية مخولة.
5. Onyx Pro import/sync الحي وWhatsApp Business API الرسمي: **BLOCKED_EXTERNAL** حتى وجود بيئة مخولة واستجابة خارجية حقيقية.

## NEXT_ACTION

لا تبدأ الجرد من الصفر: استخدم [فهرس الكتالوج الفعلي](./PUBLIC_RPC_FUNCTION_INVENTORY_2026-10-24.md) وراجع عقود المرشحين الـ179 على دفعات حسب الخطر التجاري والأمني. لكل RPC أثبت الجسم الفعلي، دور المنفذ، تحقق المؤسسة، حدود المدخلات، idempotency/locking، شكل المخرجات، الأخطاء/إعادة المحاولة وسجل التدقيق باختبارات نجاح ورفض. أعطِ الأولوية للمالية والطلبات والتسعير وواجهات العميل، وأبقِ دوال workers محكومة من جهة الخادم. تظل أسرار الإنتاج وOnyx/WhatsApp وحسابات العميل المستضافة `BLOCKED_EXTERNAL` دون اعتماد ونتيجة فعلية؛ لا يغلق API-OPS-001 قبل اكتمال التدقيق الدلالي وأدلته.